# Clawdbot Dashboard

Real-time control panel for Clawdbot. View conversations, manage cron jobs, monitor system health, and chat directly with your agent.

## Quick Start

```bash
npm install
node server.js
```

Open http://localhost:5177

## Features

### ✅ Working Chat (NEW)
Send messages directly from the dashboard — they flow through Telegram and mm responds just like normal. No more "view-only" chat.

### ✅ Cron Management
List, create, and edit cron jobs without touching the command line. Changes apply immediately to the host crontab.

### ✅ Live Logs
Watch clawdbot session logs and run output update in real-time. Auto-scroll keeps you at the latest messages.

### ✅ Local Mode
Running on the same machine as clawdbot? The dashboard automatically detects this and uses local file access instead of SSH — no keys needed.

## Requirements

- Node.js 18+
- AWS CLI configured (`aws configure`) — for EC2 status/start buttons
- SSH key at `~/.ssh/John-Amazon.pem` — only needed for remote hosts

## Configuration

Edit `config.json`:

```json
{
  "aws": { "region": "us-east-1", "instanceId": "i-xxx" },
  "ssh": { "host": "100.76.81.47", "user": "ubuntu", "keyPath": "~/.ssh/key.pem" },
  "telegram": { "botToken": "xxx", "chatId": "xxx" },
  "paths": { "sessions": "~/.clawdbot/agents/main/sessions", "runOutput": "/tmp/clawdbot" }
}
```

**Local Mode**: Set `ssh.host` to `localhost` or `127.0.0.1` to skip SSH and use local file access.

## Documentation

| File | Purpose |
|------|---------|
| PLAN.md | Roadmap, constraints, success criteria |
| AGENTS.md | Environments, tooling, access patterns |
| TASKS.md | Live task list with status |
| RUNBOOK.md | Start/stop, troubleshooting, cron management |

## Development

```bash
# Install deps
npm install

# Dev mode (auto-restart on changes)
npx nodemon server.js

# Production mode
nohup node server.js > /tmp/dashboard.log 2>&1 &
```

## Roadmap

See TASKS.md for current priorities. Up next:
1. Tool call visualization — see when mm uses tools
2. Session selector — switch between conversation histories  
3. Cost tracking — Fireworks API spend, usage stats
4. File browser — edit workspace files from the UI
