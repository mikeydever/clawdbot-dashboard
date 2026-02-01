# Project Plan

## Purpose
- Provide a real-time view into Clawdbot conversations (Telegram gateway) and supporting system logs.
- Offer lightweight control hooks (AWS status/start, SSH health, cron job management) without touching the main clawdbot runtime.

## Current Capabilities
- Express server on port 5177 serving the dashboard UI.
- SSH + AWS CLI integration for status checks and log retrieval.
- Chat transcript parsing/rendering with Telegram metadata cleanup and auto-scroll.
- View-only chat client (sending through Telegram remains the source of truth).
- Cron management drawer: list existing jobs, create or edit entries on the Ubuntu host.

## Workstreams
### Now
1. **Documentation + GitHub readiness** – finalize repo docs, prepare for remote collaboration (this step).
2. **Cron UX polish** – add delete/disable, better error surface for malformed crontabs.
3. **Server parity** – ensure dashboard runs from `/home/ubuntu/clawd/dashboard` after repo push.

### Next
1. **Session controls** – choose/view specific session jsonl files, show metadata (start time, participants).
2. **Gateway observability** – expose disk/memory usage, last clawdbot heartbeat, Fireworks credits.
3. **Message insights** – show assistant thinking/tool spans, filter timelines, export conversation ranges.

### Later
1. **Write access** – integrate with Telegram/Bot API so dashboard can send messages legitimately.
2. **Automation hooks** – one-click restart of clawdbot, log aggregation, alerting for stalled sessions.
3. **Multi-agent coordination** – tie in other agents/services (e.g., workflow orchestrators) once GitHub repo exists.

## Assumptions & Constraints
- SSH key `~/.ssh/John-Amazon.pem` and AWS CLI credentials stay local; never committed.
- Dashboard only tails files; it does not mutate clawdbot data except via explicit cron API calls.
- Real-time behavior depends on reliable SSH connectivity and disk space on 100.76.81.47.
- Clawdbot (running on AWS) cannot see `/Users/michaelwindeyer/...`; GitHub sync or copying into `/home/ubuntu/clawd/dashboard` is required for its access.

## Dependencies
- Node.js 18+ locally.
- AWS CLI configured with permissions to describe/start the clawdbot EC2 instance.
- SSH access to ubuntu@100.76.81.47.
- Telegram gateway + clawdbot already running; otherwise the dashboard only shows stale data.

## Risks / Mitigations
- **SSH outages / disk full** – keep runbook instructions for freeing space; add monitoring in future work.
- **Manual cron edits** – invalid entries could break dashboard write attempts; consider backup/validation steps.
- **Config drift** – document config.json keys and ensure remote copies stay in sync when repo is shared.

## Success Criteria
- Repo hosted on GitHub with clear docs so clawdbot or other contributors can work from the server copy.
- Dashboard operable both locally and from `/home/ubuntu/clawd/dashboard` using the same instructions.
- Future contributors understand the roadmap via this PLAN and TASKS documents.
