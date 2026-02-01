# Runbook

## Start / Stop
- **Local**
  - `cd /Users/michaelwindeyer/clawdbot-dashboard`
  - `npm install` (first run)
  - `node server.js` or `./start.sh`
  - Background mode: `nohup node server.js > /tmp/dashboard.log 2>&1 &`
  - Stop: `pkill -f "node server.js"`
- **Server (after copying/cloning repo)**
  - Ensure Node.js + npm installed on `ubuntu@100.76.81.47`.
  - Location suggestion: `/home/ubuntu/clawd/dashboard`
  - Install deps: `npm install`
  - Run with same commands as local; use `pm2` or `nohup` for persistence.

## AWS + SSH Health Checks
- Verify EC2 state: `aws ec2 describe-instances --region us-east-1 --instance-ids <id>`
- Start instance (from local): `aws ec2 start-instances --region us-east-1 --instance-ids <id>`
- Verify SSH: `ssh -i ~/.ssh/John-Amazon.pem ubuntu@100.76.81.47 "echo ok"`

## Logs & Sessions
- Session files: `~/.clawdbot/agents/main/sessions/*.jsonl` on the server.
- Run logs: `/tmp/clawdbot/clawdbot-*.log` on the server.
- Dashboard fetches latest `*.jsonl` and run log via SSH every few seconds (configurable via `config.json`).

## Cron Management
- UI: open “Cron Jobs” drawer.
- API endpoints (for scripting):
  - `GET /api/cron`
  - `POST /api/cron` body `{ schedule, command, comment? }`
  - `PUT /api/cron/:lineIndex`
- Remote crontab edits happen on `ubuntu@100.76.81.47`; ensure user has crontab installed.
 - Consider backing up with `ssh ... "crontab -l > ~/crontab_backup.txt"` before large edits.

## Configuration
- `config.json` keys:
  - `aws.*` – region/instance metadata.
  - `ssh.*` – host/user/keyPath for remote tailing.
  - `gateway.*` – optional HTTP gateway token + URL.
  - `paths.sessions` – glob for session jsonl files.
  - `paths.runOutput` – folder containing `clawdbot-*.log`.
  - `logTailLines` – number of lines returned per poll.
  - `refreshSeconds` – default refresh interval (the UI currently overrides to 3s).
- Keep secrets (API tokens, SSH paths) out of Git; use `.gitignore` for sensitive files.

## Troubleshooting
- **Dashboard empty / not updating**
  - Check SSH connectivity, disk usage (`df -h`), and verify session files are growing.
- **100% disk usage on server**
  - Clear npm cache/temp files (`sudo rm -rf ~/.npm/_cacache`, etc.).
- **Cron errors**
  - Run `ssh ... "crontab -l"` to inspect raw entries.
  - Validate schedule syntax before submitting via UI.
- **Browser cache**
  - Hard refresh (`Cmd+Shift+R`) after UI changes; versioned `app.js?v=...` helps bust cache.

## Collaboration Steps
1. Update PLAN/TASKS when priorities change.
2. Push code + docs to GitHub.
3. On AWS host, `git pull` to sync and restart dashboard.
4. Use Context7 and agent-browser per AGENTS.md for research/testing needs.
