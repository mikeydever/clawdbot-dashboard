const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const app = express();
const PORT = process.env.PORT || 5177;

function loadConfig() {
  const raw = fs.readFileSync(path.join(__dirname, "config.json"), "utf8");
  return JSON.parse(raw);
}

function expandTilde(p) {
  if (!p || p[0] !== "~") return p;
  return path.join(os.homedir(), p.slice(1));
}

function execFileAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

async function awsDescribeState(cfg) {
  const args = [
    "ec2",
    "describe-instances",
    "--region",
    cfg.aws.region,
    "--instance-ids",
    cfg.aws.instanceId,
    "--query",
    "Reservations[0].Instances[0].State.Name",
    "--output",
    "text"
  ];
  const { stdout } = await execFileAsync("aws", args);
  return stdout.trim();
}

async function awsStart(cfg) {
  const args = [
    "ec2",
    "start-instances",
    "--region",
    cfg.aws.region,
    "--instance-ids",
    cfg.aws.instanceId
  ];
  const { stdout } = await execFileAsync("aws", args);
  return stdout.trim();
}

function sshArgs(cfg) {
  const keyPath = expandTilde(cfg.ssh.keyPath);
  const remote = `${cfg.ssh.user}@${cfg.ssh.host}`;
  return [
    "-i",
    keyPath,
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=5",
    "-o",
    "StrictHostKeyChecking=accept-new",
    remote
  ];
}

async function sshCheck(cfg) {
  const args = sshArgs(cfg).concat(["echo ok"]);
  const { stdout } = await execFileAsync("ssh", args);
  return stdout.trim() === "ok";
}

async function sshLatestFile(cfg, globPath) {
  const cmd = `ls -t ${globPath} 2>/dev/null | head -1`;
  const args = sshArgs(cfg).concat([cmd]);
  const { stdout } = await execFileAsync("ssh", args);
  return stdout.trim();
}

async function sshTail(cfg, filePath, lines) {
  const cmd = `tail -n ${lines} "${filePath}"`;
  const args = sshArgs(cfg).concat([cmd]);
  const { stdout } = await execFileAsync("ssh", args);
  return stdout;
}

async function sshAppendChat(cfg, sessionFile, message) {
  // Generate a unique message ID
  const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const timestamp = new Date().toISOString();
  
  // Write in clawdbot native format
  const chatLine = JSON.stringify({
    type: "message",
    id: msgId,
    timestamp: timestamp,
    message: {
      role: "user",
      content: [{ type: "text", text: message }],
      timestamp: Date.now()
    }
  });
  
  // Properly escape for shell
  const escapedLine = chatLine.replace(/'/g, "'\"'\"'");
  const cmd = `echo '${escapedLine}' >> "${sessionFile}"`;
  const args = sshArgs(cfg).concat([cmd]);
  await execFileAsync("ssh", args);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/config", (req, res) => {
  res.json(loadConfig());
});

app.get("/api/status", async (req, res) => {
  const cfg = loadConfig();
  const result = {
    awsState: "unknown",
    sshOk: false,
    errors: []
  };

  try {
    result.awsState = await awsDescribeState(cfg);
  } catch (err) {
    result.errors.push(`aws: ${err.stderr || err.message}`);
  }

  try {
    result.sshOk = await sshCheck(cfg);
  } catch (err) {
    result.sshOk = false;
    result.errors.push(`ssh: ${err.stderr || err.message}`);
  }

  res.json(result);
});

app.post("/api/start", async (req, res) => {
  const cfg = loadConfig();
  try {
    const out = await awsStart(cfg);
    res.json({ ok: true, output: out });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.stderr || err.message });
  }
});

app.get("/api/logs", async (req, res) => {
  const cfg = loadConfig();
  const sessionGlob = `${cfg.paths.sessions}/*.jsonl`;
  const result = {
    sessionFile: null,
    sessionLines: [],
    runFile: null,
    runLines: []
  };

  try {
    const latestSession = await sshLatestFile(cfg, sessionGlob);
    if (latestSession) {
      result.sessionFile = latestSession;
      const lines = await sshTail(cfg, latestSession, cfg.logTailLines);
      result.sessionLines = lines.split("\n").filter(Boolean);
    }
  } catch (err) {
    result.sessionLines = [`session log error: ${err.stderr || err.message}`];
  }

  try {
    const runGlob = `${cfg.paths.runOutput}/clawdbot-*.log`;
    const latestRun = await sshLatestFile(cfg, runGlob);
    if (latestRun) {
      result.runFile = latestRun;
      const lines = await sshTail(cfg, latestRun, cfg.logTailLines);
      result.runLines = lines.split("\n");
    }
  } catch (err) {
    result.runLines = [`run log error: ${err.stderr || err.message}`];
  }

  res.json(result);
});

app.post("/api/chat", async (req, res) => {
  const cfg = loadConfig();
  const { message } = req.body;
  
  if (!message || typeof message !== "string") {
    return res.status(400).json({ ok: false, error: "Message required" });
  }
  
  try {
    const sessionGlob = `${cfg.paths.sessions}/*.jsonl`;
    const latestSession = await sshLatestFile(cfg, sessionGlob);
    
    if (!latestSession) {
      return res.status(404).json({ ok: false, error: "No active session found" });
    }
    
    // Get session ID from filename
    const sessionId = latestSession.split('/').pop().replace('.jsonl', '');
    
    // Format message like clawdbot does (with metadata wrapper that triggers gateway processing)
    const timestamp = new Date().toISOString();
    const messageEntry = JSON.stringify({
      type: "message",
      id: `dash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      parentId: null,
      timestamp: timestamp,
      message: {
        role: "user",
        content: [{ type: "text", text: `[Dashboard ${timestamp}] ${message}` }],
        timestamp: Date.now()
      }
    });
    
    // Append to session file
    const escapedEntry = messageEntry.replace(/'/g, "'\"'\"'");
    const cmd = `echo '${escapedEntry}' >> "${latestSession}"`;
    const args = sshArgs(cfg).concat([cmd]);
    await execFileAsync("ssh", args);
    
    // Trigger the gateway to check for new messages by touching the session file
    const touchCmd = `touch "${latestSession}"`;
    const touchArgs = sshArgs(cfg).concat([touchCmd]);
    await execFileAsync("ssh", touchArgs);
    
    res.json({ ok: true, sessionFile: latestSession });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.stderr || err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Clawdbot dashboard listening on http://localhost:${PORT}`);
});
