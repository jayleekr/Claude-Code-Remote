# Claude Code Remote - Multi-Server Edition

Control [Claude Code](https://claude.ai/code) running on **multiple remote servers** from a single Telegram bot.

## 🌟 Features

- **🌐 Multi-Server Monitoring**: Control Claude on 5+ servers from one Telegram bot
- **📱 Telegram Integration**: Interactive commands with `/sessions` and `/cmd`
- **🔄 Two-Way Communication**: Receive notifications and send commands
- **🔒 Secure**: SSH-based command routing with shared secret authentication
- **⚡ Real-Time**: <2s notification delivery, <5s command execution
- **💾 Session Management**: SQLite-based persistent session storage

## 📐 Architecture

```
┌──────────────────────────────────────────┐
│         Telegram Bot API                 │
└────────────────┬─────────────────────────┘
                 │ webhook
                 ▼
┌──────────────────────────────────────────┐
│     Central Hub (Your Machine)           │
│  ┌────────────────────────────┐          │
│  │ Notification Aggregator    │◄─────────┼── HTTP POST
│  │ (port 3001)                │          │   from Remote Servers
│  └────────────────────────────┘          │
│  ┌────────────────────────────┐          │
│  │ Webhook Server             │          │
│  │ (port 3000)                │──SSH─────┼→ Execute commands
│  └────────────────────────────┘          │   on Remote Servers
│  ┌────────────────────────────┐          │
│  │ ngrok Tunnel               │          │
│  │ (public URL)               │          │
│  └────────────────────────────┘          │
└──────────────────────────────────────────┘
```

## 🚀 Quick Start

### Step 1: Install Central Hub

**On your main machine:**

```bash
# One-line install
bash <(curl -fsSL https://raw.githubusercontent.com/jayleekr/Claude-Code-Remote/master/install.sh)
```

**Configure .env:**
```bash
cd ~/Claude-Code-Remote
nano .env

# Required settings:
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
SHARED_SECRET=auto-generated-secret
```

**Get your IP address:**
```bash
# For remote servers to connect
ifconfig | grep "inet " | grep -v 127.0.0.1
# Example output: 172.24.12.11
```

### Step 2: Install on Remote Servers

**On each remote server (builder-kr-4, aws1, etc):**

```bash
SERVER_ID=kr4 \
CENTRAL_HUB_ENDPOINT=http://172.24.12.11:3001/notify \
bash <(curl -fsSL https://raw.githubusercontent.com/jayleekr/Claude-Code-Remote/master/install.sh)
```

**Variables:**
- `SERVER_ID`: Unique server identifier (kr4, aws1, prod, etc)
- `CENTRAL_HUB_ENDPOINT`: Your central hub IP and port

### Step 3: Start Services

**On Central Hub:**

```bash
cd ~/Claude-Code-Remote

# Start all services (aggregator, webhook, ngrok)
./scripts/start-all.sh

# Check status
./scripts/status.sh
```

**Output:**
```
🚀 Starting Claude Code Remote Services
======================================
📡 Starting Notification Aggregator...
✅ Notification Aggregator started
🌐 Starting Webhook Server...
✅ Webhook Server started
🌍 Starting ngrok tunnel...
✅ ngrok tunnel established
   Public URL: https://example.ngrok-free.dev
📱 Updating Telegram webhook...
✅ Telegram webhook updated
```

### Step 4: Test

**On remote server:**
```bash
cd ~/Claude-Code-Remote
source ~/.nvm/nvm.sh
node claude-hook-notify.js completed
```

**Expected Telegram notification:**
```
✅ [KR4] Claude Task Completed
Project: test-project
Session: kr4:1

💬 To send a command:
/cmd kr4:1 <your command>
```

## 📱 Telegram Commands

### View All Sessions
```
/sessions
```

Output:
```
📋 Active Sessions (2 total)

🖥️ KR4 (1)
  • kr4:1 - project-name
    Token: ABCD1234
    Tmux: tmux-session-1
    Expires: 23h

🖥️ LOCAL (1)
  • local:1 - other-project
    Token: EFGH5678
    Tmux: tmux-session-2
    Expires: 24h
```

### Send Commands
```
/cmd kr4:1 pwd
/cmd kr4:1 ls -la
/cmd local:1 git status
```

### Get Help
```
/help
```

## 🔧 Daily Usage

### Starting Services (After Reboot)

```bash
cd ~/Claude-Code-Remote
./scripts/start-all.sh
```

### Stopping Services

```bash
./scripts/stop-all.sh
```

### Checking Status

```bash
./scripts/status.sh
```

Output:
```
📡 Notification Aggregator (port 3001):
   ✅ Running (PID: 12345)
🌐 Webhook Server (port 3000):
   ✅ Running (PID: 12346)
💾 Active Sessions:
   Count: 2
   • kr4:1 - project-name
   • local:1 - other-project
```

### Viewing Logs

```bash
# All logs
tail -f logs/*.log

# Specific service
tail -f logs/aggregator.log
tail -f logs/webhook.log
tail -f logs/ngrok.log
```

## 🖥️ Using with Claude Code

### On Remote Server

**Start Claude Code session:**
```bash
ssh builder-kr-4
cd ~/your-project
tmux new -s my-session
claude
```

**Give Claude a task:**
```
Create a test.txt file with hello world
```

**Wait for notification in Telegram:**
```
✅ [KR4] Claude Task Completed
Session: kr4:2
...
```

**Send follow-up commands from Telegram:**
```
/cmd kr4:2 cat test.txt
/cmd kr4:2 show me what you created
```

## 🔧 Server Management

### Add New Server

**Automated (Recommended):**
```bash
cd ~/Claude-Code-Remote
./scripts/add-remote-server.sh user@hostname server-id central-hub-ip
```

Example:
```bash
./scripts/add-remote-server.sh ubuntu@aws.example.com aws1 172.24.12.11
```

**Manual:**

1. Install on remote server:
```bash
SERVER_ID=aws1 \
CENTRAL_HUB_ENDPOINT=http://172.24.12.11:3001/notify \
bash <(curl -fsSL https://raw.githubusercontent.com/jayleekr/Claude-Code-Remote/master/install.sh)
```

2. Update `config/servers.json` on central hub:
```json
{
  "id": "aws1",
  "type": "remote",
  "hostname": "aws.example.com",
  "ssh": {
    "user": "ubuntu",
    "port": 22,
    "keyPath": "~/.ssh/aws-key.pem"
  }
}
```

3. Restart services:
```bash
./scripts/stop-all.sh
./scripts/start-all.sh
```

### List Servers

```bash
./scripts/list-servers.sh
```

Output:
```
📋 Configured Servers

Central Hub Configuration:
  Webhook Port:       3000
  Notification Port:  3001
  ngrok Enabled:      True

Servers (3):

1. LOCAL
   Type:     local
   Hostname: localhost

2. KR4
   Type:     remote
   Hostname: builder-kr-4.kr.sonatus.com
   SSH User: jay.lee
   SSH Port: 22

3. AWS1
   Type:     remote
   Hostname: aws.example.com
   SSH User: ubuntu
   SSH Port: 22
```

## 🔍 Troubleshooting

### Services Not Starting

```bash
# Check what's using the ports
lsof -i :3000
lsof -i :3001

# Kill and restart
./scripts/stop-all.sh
./scripts/start-all.sh
```

### Remote Notifications Not Arriving

```bash
# On remote server, test connection
curl -X POST http://172.24.12.11:3001/notify \
  -H "Content-Type: application/json" \
  -H "X-Shared-Secret: your-secret-from-env" \
  -d '{"serverId":"kr4","type":"completed","project":"test","metadata":{}}'
```

### Commands Not Executing

```bash
# Test SSH connection from central hub
ssh builder-kr-4 "tmux list-sessions"

# Check logs
tail -f logs/webhook.log
tail -f logs/aggregator.log
```

### Telegram Bot Not Responding

```bash
# Check webhook status
source .env
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"

# Re-set webhook
./scripts/stop-all.sh
./scripts/start-all.sh
```

### Session Expired Error

Sessions expire after 24 hours. To create a new session:

```bash
# On the remote server
cd ~/Claude-Code-Remote
source ~/.nvm/nvm.sh
node claude-hook-notify.js completed
```

## 📊 File Structure

```
Claude-Code-Remote/
├── scripts/
│   ├── start-all.sh           # Start all services
│   ├── stop-all.sh            # Stop all services
│   ├── status.sh              # Check service status
│   ├── add-remote-server.sh   # Add new server
│   └── list-servers.sh        # List configured servers
├── config/
│   ├── servers.json           # Server configurations
│   └── servers.example.json   # Example configuration
├── data/
│   └── sessions.db            # SQLite session database
├── logs/
│   ├── aggregator.log         # Notification aggregator logs
│   ├── webhook.log            # Webhook server logs
│   └── ngrok.log              # ngrok tunnel logs
├── src/
│   ├── hub/                   # Central hub components
│   ├── remote/                # Remote execution components
│   └── channels/telegram/     # Telegram integration
├── .env                       # Environment configuration
├── start-aggregator.js        # Notification aggregator
├── start-webhook.js           # Webhook server
└── install.sh                 # One-line installer
```

## 🔒 Security

- **SSH Keys**: Use key-based authentication only
- **Shared Secret**: Auto-generated 64-character hex string
- **Firewall Rules**:
  - Central Hub: Allow inbound 3001 from remote servers
  - Remote Servers: Only outbound HTTPS needed
- **Session Tokens**: 8-character alphanumeric tokens
- **Auto Expiration**: 24-hour session timeout

## 📈 Performance

- **Scalability**: Tested with 5+ servers, supports 20+ easily
- **Latency**:
  - Notifications: <2 seconds
  - Commands: <5 seconds
- **Resource Usage**:
  - Central Hub: ~100MB RAM
  - Remote Agent: ~50MB RAM

## 🤝 Contributing

Issues and PRs welcome at [GitHub](https://github.com/jayleekr/Claude-Code-Remote)

## 📄 License

MIT License

---

**🚀 Control Claude Code on multiple servers from your phone!**
