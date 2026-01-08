# Central Hub Setup Guide

## Phase 1: Core Infrastructure Setup

### 1. Environment Variables

Add these variables to your `.env` file:

```bash
# Server Identification
SERVER_ID=local
# Use 'local' for your main machine
# Use 'kr4', 'aws1', etc. for remote servers

# Central Hub Configuration
CENTRAL_HUB_ENDPOINT=http://localhost:3001/notify
# For remote servers, use your public IP or domain:
# CENTRAL_HUB_ENDPOINT=http://your-ip:3001/notify

# Shared Secret for Authentication
SHARED_SECRET=your-secret-key-here-change-this
# Generate a strong random secret:
# openssl rand -hex 32
```

### 2. Update Shared Secret in Server Configuration

Edit `config/servers.json` and update the `sharedSecret` field:

```json
{
  "central": {
    "webhookPort": 3000,
    "notificationPort": 3001,
    "ngrokEnabled": true,
    "sharedSecret": "your-secret-key-here-change-this"
  }
}
```

**Important**: Use the same secret in both `.env` and `config/servers.json`.

### 3. Start the Notification Aggregator

```bash
# Start the notification aggregator (runs on port 3001)
node start-aggregator.js
```

Or for background execution:

```bash
nohup node start-aggregator.js > ~/.claude-code-remote/logs/aggregator.log 2>&1 &
```

### 4. Test Local Notification Flow

```bash
# Test the hook script (should send to central hub)
node claude-hook-notify.js completed
```

Expected output:
```
🔔 Claude Hook: Sending notifications...
🌐 Central hub mode enabled for server: local
📍 Hub endpoint: http://localhost:3001/notify
📤 Attempt 1/3: Sending to central hub...
✅ Notification sent to central hub
✅ Notification successfully sent to central hub
📋 Central hub will forward to Telegram
```

### 5. Verify Notification in Telegram

You should receive a message like:

```
✅ [LOCAL] Claude Task Completed
Project: Claude-Code-Remote
Session: local:1

💬 To send a command:
/cmd local:1 <your command>
```

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│            Telegram Bot API                  │
└──────────────────┬──────────────────────────┘
                   │ webhook (port 3000)
                   ▼
┌─────────────────────────────────────────────┐
│        Central Hub (Local Machine)          │
│  ┌─────────────────────────────────┐        │
│  │ Notification Aggregator (3001)  │◄───────┼── Hook Scripts
│  │ - Receives from all servers     │        │   (local & remote)
│  │ - SQLite session management     │        │
│  │ - Forwards to Telegram          │        │
│  └─────────────────────────────────┘        │
│  ┌─────────────────────────────────┐        │
│  │ Webhook Server (3000)           │        │
│  │ - Parses /cmd server:number     │        │
│  │ - Routes via SSH                │        │
│  └─────────────────────────────────┘        │
└─────────────────────────────────────────────┘
```

## Session Numbering System

- **Server-specific**: Each server has independent numbering
  - `local:1`, `local:2`, `local:3`
  - `kr4:1`, `kr4:2`, `kr4:3`

- **SQLite Storage**: Sessions stored in `data/sessions.db`

- **24-hour Expiration**: Sessions automatically cleaned up

## Testing Checklist

- [ ] Notification aggregator starts successfully
- [ ] Local hook script sends to central hub
- [ ] Session created in SQLite database
- [ ] Telegram receives notification with `[LOCAL]` prefix
- [ ] Session identifier shows `local:1`
- [ ] Commands can be sent via `/cmd local:1 <command>`

## Troubleshooting

### Aggregator won't start
```bash
# Check if port 3001 is already in use
lsof -i :3001

# Check logs
tail -f ~/.claude-code-remote/logs/aggregator.log
```

### Hook script fails to connect
```bash
# Test aggregator is reachable
curl -X POST http://localhost:3001/notify \
  -H "Content-Type: application/json" \
  -H "X-Shared-Secret: your-secret" \
  -d '{
    "serverId": "test",
    "type": "completed",
    "project": "test-project",
    "metadata": {}
  }'
```

### Sessions not appearing in database
```bash
# Check database directly
sqlite3 data/sessions.db "SELECT * FROM sessions;"

# Or via aggregator API
curl http://localhost:3001/sessions
```

## Next Steps: Phase 2

Once Phase 1 is working:

1. Create `src/remote/command-executor.js` for SSH routing
2. Modify webhook handler to parse `server:number` format
3. Test command routing: Telegram → SSH → remote tmux
4. Install on builder-kr-4 remote server
