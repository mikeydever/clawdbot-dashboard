# Agents, Environments, and Tools

## Actors
- **Local Operator (Mac)**
  - Path: `/Users/michaelwindeyer/clawdbot-dashboard`
  - Responsibilities: primary development, npm installs, AWS/SSH credentials, syncing to GitHub.
- **OpenCode Assistant (this agent)**
  - Runs commands in the local workspace.
  - Access to specialized tools (Context7 docs, agent-browser, etc.) per system instructions.
- **Clawdbot (AWS instance)**
  - Host: `ubuntu@100.76.81.47`
  - File root for production: `/home/ubuntu/clawd/...`
  - Can only edit files that exist on the server; needs the dashboard copied or cloned there.
- **Telegram/WhatsApp Gateways**
  - Deliver real messages to clawdbot; dashboard remains view-only unless gateway integration changes.

## Environments
| Environment | Location | Notes |
|-------------|----------|-------|
| Local Dev   | `/Users/michaelwindeyer/clawdbot-dashboard` | Contains full repo, config, screenshots. |
| AWS Runtime | `/home/ubuntu/clawd` | Where clawdbot actually runs; lacks dashboard files until synced. |
| GitHub (planned) | `git@github.com:<owner>/clawdbot-dashboard.git` | Source of truth for collaboration once created. |

### Access Rules
- Never commit secrets (SSH keys, API tokens) to Git.
- When copying to AWS, place files under `/home/ubuntu/clawd/dashboard` (or similar) and run `npm install` there.
- Clawdbot cannot fetch local-only paths; ensure GitHub or rsync is used for collaboration.

## Tooling
### Context7 MCP
Used for fetching up-to-date library documentation/snippets.

Steps:
1. Resolve the library ID once per topic:
   ```
   context7_resolve-library-id {"query": "Need docs for Express", "libraryName": "express"}
   ```
   - Returns IDs like `/expressjs/express`.
2. Query docs with the resolved ID (max three doc calls per question):
   ```
   context7_query-docs {"libraryId": "/expressjs/express", "query": "How to mount routers"}
   ```
3. Summarize findings; do not paste sensitive data into queries.

Validation: run a quick resolve call (e.g., for Express) to confirm availability before relying on it. This repo already verified access via `context7_resolve-library-id`.

### Agent Browser
- Use `agent-browser open http://localhost:5177 --json` then interact via refs to validate UI flows, capture screenshots (saved under `/tmp/`).
- Close sessions with `agent-browser close` to avoid stray Chromium processes.

### SSH + AWS CLI
- `ssh -i ~/.ssh/John-Amazon.pem ubuntu@100.76.81.47` for remote commands.
- `aws ec2 describe-instances --region us-east-1 --instance-ids <id>` for state checks.

Document updates here whenever new tools or access patterns are added.
