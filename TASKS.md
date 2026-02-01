# Tasks & Status

Status legend: ✅ Done | 🔄 In Progress | 📝 Backlog

## Active
- 🔄 **Working Chat via Telegram API** (mm - 2026-02-01)
  - Replaced file-append approach with Telegram Bot API
  - Messages now flow through normal clawdbot pipeline
  - Added telegram config section to config.json
- 📝 **Tool Call Visualization** – Show when mm uses tools (exec, read, edit, etc.)
- 📝 **Session Selector** – Switch between conversation histories

## Recently Completed
- ✅ **Local Mode Support** (mm - 2026-02-01) – Dashboard runs on same host as clawdbot without SSH keys
- ✅ **View-only chat stability** – Fixed ordering, metadata stripping, auto-scroll
- ✅ **Cron drawer MVP** – List, create, edit cron jobs

## Backlog (Priority Order)
1. 📝 **Cost/Observability** – Fireworks credits, disk usage, memory, heartbeat
2. 📝 **File Browser** – Browse/edit workspace files from UI
3. 📝 **Agent Spawning** – Spawn sub-agents directly from dashboard
4. 📝 **Memory Search** – Search MEMORY.md and session logs
5. 📝 **Cron UX polish** – Delete/disable controls, error highlighting
6. 📝 **Message insights** – Filter by tool calls, thinking spans, exports

## Coordination Notes
- Use this file as a lightweight Kanban before GitHub Issues exist.
- Update entries with short context (who/when) to keep clawdbot and human contributors aligned.
