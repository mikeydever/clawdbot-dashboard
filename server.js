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

async function sshCrontabRead(cfg) {
  if (isLocalMode(cfg)) {
    return localCrontabRead();
  }
  const args = sshArgs(cfg).concat(["crontab -l 2>/dev/null || true"]);
  const { stdout } = await execFileAsync("ssh", args);
  return stdout.replace(/\r/g, "");
}

async function sshCrontabWrite(cfg, content) {
  if (isLocalMode(cfg)) {
    return localCrontabWrite(content);
  }
  let payload = content.replace(/\r/g, "");
  if (!payload.endsWith("\n")) {
    payload += "\n";
  }
  const escaped = payload.replace(/'/g, "'\"'\"'");
  const cmd = `echo '${escaped}' | crontab -`;
  const args = sshArgs(cfg).concat([cmd]);
  await execFileAsync("ssh", args);
}

function parseCronLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("@")) {
    const [schedule, ...rest] = trimmed.split(/\s+/);
    if (!rest.length) return null;
    return { schedule, command: rest.join(" ").trim(), raw: line };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length < 6) return null;
  return {
    schedule: parts.slice(0, 5).join(" "),
    command: parts.slice(5).join(" "),
    raw: line
  };
}

function describeCronJobs(text) {
  const normalized = text ? text.replace(/\r/g, "") : "";
  const lines = normalized ? normalized.split("\n") : [];
  const jobs = [];
  let pendingComments = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      pendingComments = [];
      return;
    }

    if (trimmed.startsWith("#")) {
      pendingComments.push({ text: trimmed.replace(/^#\s?/, ""), index });
      return;
    }

    const parsed = parseCronLine(line);
    if (!parsed) {
      pendingComments = [];
      return;
    }

    jobs.push({
      lineIndex: index,
      schedule: parsed.schedule,
      command: parsed.command,
      comment: pendingComments.length
        ? pendingComments.map((c) => c.text).join("\n")
        : null,
      commentLineIndexes: pendingComments.map((c) => c.index),
      raw: line
    });
    pendingComments = [];
  });

  return { jobs, lines };
}

function isValidCronSchedule(schedule) {
  if (typeof schedule !== "string" || !schedule.trim()) return false;
  if (schedule.trim().startsWith("@")) {
    return true;
  }
  const parts = schedule.trim().split(/\s+/);
  return parts.length === 5;
}

function sanitizeCronSingleLine(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n]+/g, " ").trim();
}

function normalizeCronComment(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function makeCronLine(schedule, command) {
  const sched = schedule.trim();
  const cmd = command.trim();
  if (sched.startsWith("@")) {
    return `${sched} ${cmd}`.trim();
  }
  return `${sched} ${cmd}`.trim();
}

function formatCommentLines(comment) {
  if (!comment) return [];
  return comment
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `# ${line}`);
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

function isLocalMode(cfg) {
  // Check if we're running on the same host as the target
  const targetHost = cfg.ssh.host;
  if (targetHost === 'localhost' || targetHost === '127.0.0.1') return true;
  
  // Check if target matches any of our network interfaces
  try {
    const { execSync } = require('child_process');
    const hostname = execSync('hostname -I 2>/dev/null || echo ""').toString().trim();
    const ips = hostname.split(/\s+/).filter(Boolean);
    if (ips.includes(targetHost)) return true;
  } catch (e) {
    // Ignore errors
  }
  
  return false;
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

// Local execution helpers
async function localExec(cmd, args) {
  return execFileAsync(cmd, args, { shell: false });
}

async function localCrontabRead() {
  try {
    const { stdout } = await localExec('crontab', ['-l']);
    return stdout.replace(/\r/g, "");
  } catch (err) {
    // No crontab exists yet
    return "";
  }
}

async function localCrontabWrite(content) {
  let payload = content.replace(/\r/g, "");
  if (!payload.endsWith("\n")) {
    payload += "\n";
  }
  const { execSync } = require('child_process');
  execSync('crontab -', { input: payload });
}

async function localLatestFile(globPath) {
  const expandedPath = expandTilde(globPath);
  const { execSync } = require('child_process');
  try {
    const result = execSync(`ls -t ${expandedPath} 2>/dev/null | head -1`).toString().trim();
    return result;
  } catch (e) {
    return "";
  }
}

async function localTail(filePath, lines) {
  const expandedPath = expandTilde(filePath);
  const { execSync } = require('child_process');
  return execSync(`tail -n ${lines} "${expandedPath}"`).toString();
}

async function localAppendChat(sessionFile, message) {
  const expandedPath = expandTilde(sessionFile);
  const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const timestamp = new Date().toISOString();
  
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
  
  fs.appendFileSync(expandedPath, chatLine + '\n');
}

async function sshCheck(cfg) {
  if (isLocalMode(cfg)) {
    return true;
  }
  const args = sshArgs(cfg).concat(["echo ok"]);
  const { stdout } = await execFileAsync("ssh", args);
  return stdout.trim() === "ok";
}

async function sshLatestFile(cfg, globPath) {
  if (isLocalMode(cfg)) {
    return localLatestFile(globPath);
  }
  const cmd = `ls -t ${globPath} 2>/dev/null | head -1`;
  const args = sshArgs(cfg).concat([cmd]);
  const { stdout } = await execFileAsync("ssh", args);
  return stdout.trim();
}

async function sshTail(cfg, filePath, lines) {
  if (isLocalMode(cfg)) {
    return localTail(filePath, lines);
  }
  const cmd = `tail -n ${lines} "${filePath}"`;
  const args = sshArgs(cfg).concat([cmd]);
  const { stdout } = await execFileAsync("ssh", args);
  return stdout;
}

async function sshAppendChat(cfg, sessionFile, message) {
  if (isLocalMode(cfg)) {
    return localAppendChat(sessionFile, message);
  }
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

// Telegram Bot API helper
async function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = JSON.stringify({
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  });
  
  return new Promise((resolve, reject) => {
    const https = require('https');
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.ok) {
            resolve(result.result);
          } else {
            reject(new Error(result.description || 'Telegram API error'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

app.post("/api/chat", async (req, res) => {
  const cfg = loadConfig();
  const { message } = req.body;
  
  if (!message || typeof message !== "string") {
    return res.status(400).json({ ok: false, error: "Message required" });
  }
  
  try {
    // Use Telegram Bot API to send message
    // This ensures the message flows through clawdbot's normal pipeline
    const botToken = cfg.telegram?.botToken;
    const chatId = cfg.telegram?.chatId;
    
    if (!botToken || !chatId) {
      // Fallback: store in pending file for clawdbot to poll
      const pendingDir = expandTilde('~/.clawdbot/dashboard-pending');
      if (!fs.existsSync(pendingDir)) {
        fs.mkdirSync(pendingDir, { recursive: true });
      }
      
      const pendingFile = path.join(pendingDir, 'messages.jsonl');
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        message: message,
        source: 'dashboard'
      }) + '\n';
      
      fs.appendFileSync(pendingFile, entry);
      
      return res.json({ 
        ok: true, 
        method: 'pending',
        note: 'Message queued for clawdbot to pick up'
      });
    }
    
    // Send via Telegram Bot API
    const result = await sendTelegramMessage(botToken, chatId, `📊 <b>Dashboard</b>: ${message}`);
    
    res.json({ 
      ok: true, 
      method: 'telegram',
      messageId: result.message_id
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.get("/api/cron", async (req, res) => {
  const cfg = loadConfig();
  try {
    const raw = await sshCrontabRead(cfg);
    const { jobs } = describeCronJobs(raw);
    res.json({
      jobs: jobs.map((job, idx) => ({
        id: `cron-${idx}`,
        lineIndex: job.lineIndex,
        schedule: job.schedule,
        command: job.command,
        comment: job.comment,
        raw: job.raw
      })),
      raw
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.stderr || err.message });
  }
});

app.post("/api/cron", async (req, res) => {
  const cfg = loadConfig();
  const schedule = sanitizeCronSingleLine(req.body?.schedule || "");
  const command = sanitizeCronSingleLine(req.body?.command || "");
  const comment = normalizeCronComment(req.body?.comment || "");

  if (!isValidCronSchedule(schedule)) {
    return res.status(400).json({ ok: false, error: "Invalid cron schedule" });
  }
  if (!command) {
    return res.status(400).json({ ok: false, error: "Command is required" });
  }

  try {
    const raw = await sshCrontabRead(cfg);
    const lines = raw ? raw.replace(/\r/g, "").split("\n") : [];
    while (lines.length && !lines[lines.length - 1].trim()) {
      lines.pop();
    }
    const newLines = [...lines];
    if (newLines.length) {
      newLines.push("");
    }
    const commentLines = formatCommentLines(comment);
    commentLines.forEach((line) => newLines.push(line));
    newLines.push(makeCronLine(schedule, command));
    const content = newLines.join("\n");
    await sshCrontabWrite(cfg, content);
    const updatedRaw = await sshCrontabRead(cfg);
    const { jobs } = describeCronJobs(updatedRaw);
    res.json({
      ok: true,
      jobs: jobs.map((job, idx) => ({
        id: `cron-${idx}`,
        lineIndex: job.lineIndex,
        schedule: job.schedule,
        command: job.command,
        comment: job.comment,
        raw: job.raw
      }))
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.stderr || err.message });
  }
});

app.put("/api/cron/:lineIndex", async (req, res) => {
  const cfg = loadConfig();
  const targetIndex = parseInt(req.params.lineIndex, 10);
  if (Number.isNaN(targetIndex)) {
    return res.status(400).json({ ok: false, error: "Invalid cron identifier" });
  }

  const schedule = sanitizeCronSingleLine(req.body?.schedule || "");
  const command = sanitizeCronSingleLine(req.body?.command || "");
  const comment = normalizeCronComment(req.body?.comment || "");

  if (!isValidCronSchedule(schedule)) {
    return res.status(400).json({ ok: false, error: "Invalid cron schedule" });
  }
  if (!command) {
    return res.status(400).json({ ok: false, error: "Command is required" });
  }

  try {
    const raw = await sshCrontabRead(cfg);
    const { jobs, lines } = describeCronJobs(raw);
    const job = jobs.find((j) => j.lineIndex === targetIndex);
    if (!job) {
      return res.status(404).json({ ok: false, error: "Cron job not found" });
    }

    const skipCommentIndexes = new Set(job.commentLineIndexes || []);
    const updatedLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (skipCommentIndexes.has(i)) {
        continue;
      }
      if (i === job.lineIndex) {
        const newComments = formatCommentLines(comment);
        newComments.forEach((line) => updatedLines.push(line));
        updatedLines.push(makeCronLine(schedule, command));
      } else {
        updatedLines.push(lines[i]);
      }
    }

    const content = updatedLines.join("\n");
    await sshCrontabWrite(cfg, content);
    const updatedRaw = await sshCrontabRead(cfg);
    const nextJobs = describeCronJobs(updatedRaw).jobs;
    res.json({
      ok: true,
      jobs: nextJobs.map((job, idx) => ({
        id: `cron-${idx}`,
        lineIndex: job.lineIndex,
        schedule: job.schedule,
        command: job.command,
        comment: job.comment,
        raw: job.raw
      }))
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.stderr || err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Clawdbot dashboard listening on http://localhost:${PORT}`);
});
