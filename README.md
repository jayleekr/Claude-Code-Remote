# Claude Code Remote

Control [Claude Code](https://claude.ai/code) remotely via multiple messaging platforms. Start tasks locally, receive notifications when Claude completes them, and send new commands by simply replying to messages.

**Supported Platforms:**
- 📧 **Email** - Traditional SMTP/IMAP integration with execution trace
- 📱 **Telegram** - Interactive bot with smart buttons ✅ **NEW**
- 💬 **LINE** - Rich messaging with token-based commands
- 🖥️ **Desktop** - Sound alerts and system notifications

<div align="center">
  
  ### 🎥 Watch Demo Video
  
  <a href="https://youtu.be/_yrNlDYOJhw">
    <img src="./assets/CCRemote_demo.png" alt="Claude Code Remote Demo" width="100%">
    <br>
    <img src="https://img.shields.io/badge/▶-Watch%20on%20YouTube-red?style=for-the-badge&logo=youtube" alt="Watch on YouTube">
  </a>
  
</div>

> 🐦 Follow [@Jiaxi_Cui](https://x.com/Jiaxi_Cui) for updates and AI development insights

## 🌐 Multi-Server Architecture (NEW!)

Monitor and control Claude Code running on **5+ remote servers** from a single Telegram bot!

**Architecture:**
- **Centralized Hub**: Single point of coordination on your local machine
- **Remote Agents**: Lightweight hook scripts on each server
- **Server-Specific Sessions**: `local:1`, `kr4:1`, `aws1:1` format
- **SSH-Based Command Routing**: Secure command execution via SSH
- **SQLite Session Management**: Persistent session storage
- **Single Telegram Bot**: Control all servers from one interface

**Perfect for:**
- 🖥️ Multiple development servers (local, staging, production)
- 🌍 Geographic distribution (US, EU, Asia servers)
- 👥 Team environments with shared infrastructure
- 🔄 CI/CD pipelines across multiple machines

### Quick Install (One-Line)

**On Central Hub (your main machine):**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/jayleekr/Claude-Code-Remote/master/install.sh)
```

**On Remote Servers (builder-kr-4, etc):**
```bash
SERVER_ID=kr4 CENTRAL_HUB_ENDPOINT=http://your-hub-ip:3001/notify \
bash <(curl -fsSL https://raw.githubusercontent.com/jayleekr/Claude-Code-Remote/master/install.sh)
```

See [Multi-Server Setup Guide](#multi-server-setup) for detailed configuration.

## ✨ Features

- **🌐 Multi-Server Monitoring**: Control Claude on 5+ servers from single Telegram bot
- **📧 Multiple Messaging Platforms**: 
  - Email notifications with full execution trace and reply-to-send commands ![](./assets/email_demo.png)
  - Telegram Bot with interactive buttons and slash commands ![](./assets/telegram_demo.png)
  - LINE messaging with token-based commands
  - Desktop notifications with sound alerts
- **🔄 Two-way Control**: Reply to messages or emails to send new commands
- **📱 Remote Access**: Control Claude from anywhere
- **🔒 Secure**: ID-based whitelist verification for all platforms
- **👥 Group Support**: Use in LINE groups or Telegram groups for team collaboration
- **🤖 Smart Commands**: Intuitive command formats for each platform
- **📋 Multi-line Support**: Send complex commands with formatting
- **⚡ Smart Monitoring**: Intelligent detection of Claude responses with historical tracking
- **🔄 tmux Integration**: Seamless command injection into active tmux sessions
- **📊 Execution Trace**: Full terminal output capture in email notifications

## 📅 Changelog

### August 2025
- **2025-08-02**: Add full execution trace to email notifications ([#14](https://github.com/JessyTsui/Claude-Code-Remote/pull/14) by [@vaclisinc](https://github.com/vaclisinc))
- **2025-08-01**: Enhanced Multi-Channel Notification System ([#1](https://github.com/JessyTsui/Claude-Code-Remote/pull/1) by [@laihenyi](https://github.com/laihenyi) [@JessyTsui](https://github.com/JessyTsui))
  - ✅ **Telegram Integration Completed** - Interactive buttons, real-time commands, smart personal/group chat handling
  - ✅ **Multi-Channel Notifications** - Simultaneous delivery to Desktop, Telegram, Email, LINE
  - ✅ **Smart Sound Alerts** - Always-on audio feedback with customizable sounds
  - ✅ **Intelligent Session Management** - Auto-detection, real conversation content, 24-hour tokens
- **2025-08-01**: Fix #9 #12: Add configuration to disable subagent notifications ([#10](https://github.com/JessyTsui/Claude-Code-Remote/pull/10) by [@vaclisinc](https://github.com/vaclisinc))
- **2025-08-01**: Implement terminal-style UI for email notifications ([#8](https://github.com/JessyTsui/Claude-Code-Remote/pull/8) by [@vaclisinc](https://github.com/vaclisinc))
- **2025-08-01**: Fix working directory issue - enable claude-remote to run from any directory ([#7](https://github.com/JessyTsui/Claude-Code-Remote/pull/7) by [@vaclisinc](https://github.com/vaclisinc))

### July 2025
- **2025-07-31**: Fix self-reply loop issue when using same email for send/receive ([#4](https://github.com/JessyTsui/Claude-Code-Remote/pull/4) by [@vaclisinc](https://github.com/vaclisinc))
- **2025-07-28**: Remove hardcoded values and implement environment-based configuration ([#2](https://github.com/JessyTsui/Claude-Code-Remote/pull/2) by [@kevinsslin](https://github.com/kevinsslin))

## 📋 TODO List

### Notification Channels
- ~~**📱 Telegram Integration**~~ ✅ **COMPLETED** - Bot integration with interactive buttons and real-time commands
- **💬 Discord Integration** - Bot integration for messaging platforms
- **⚡ Slack Workflow** - Native Slack app with slash commands

### Developer Tools
- **🤖 AI Tools Support** - Integration with Gemini CLI, Cursor, and other AI development tools
- **🔀 Git Automation** - Auto-commit functionality, PR creation, branch management

### Usage Analytics
- **💰 Cost Tracking** - Token usage monitoring and estimated costs
- **⚡ Performance Metrics** - Execution time tracking and resource usage analysis
- **📧 Scheduled Reports** - Daily/weekly usage summaries delivered via email

### Native Apps
- **📱 Mobile Apps** - iOS and Android applications for remote Claude control
- **🖥️ Desktop Apps** - macOS and Windows native clients with system integration

## 🚀 Quick Start

### Single Server Setup (Original)

For controlling Claude on a single machine, follow the traditional setup below.

### Multi-Server Setup (NEW!)

For monitoring Claude across multiple servers, see [Multi-Server Architecture](#multi-server-architecture-setup) section.

---

### 1. Prerequisites

**System Requirements:**
- Node.js >= 14.0.0
- For default PTY mode: no tmux required (recommended for本地直接用)
- For tmux mode: tmux + an active session with Claude Code running

### 2. Install

```bash
git clone https://github.com/JessyTsui/Claude-Code-Remote.git
cd Claude-Code-Remote
npm install
```

### 3. Interactive Setup (Recommended)

```bash
npm run setup
```

- 引导式填写 Email / Telegram / LINE 配置，生成 `.env`
- 自动把 Claude hooks 合并进 `~/.claude/settings.json`
- 可随时重跑更新密钥/切换渠道
- 如需手动配置或离线编辑 `.env`，见下方“手动配置”

### 4. 手动配置（可选，跳过如果已运行 `npm run setup`）

#### Option A: Configure Email (Recommended for Beginners)

```bash
# Copy example config
cp .env.example .env

# Edit with your email credentials
nano .env
```

**Required email settings:**
```env
EMAIL_ENABLED=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
IMAP_USER=your-email@gmail.com  
IMAP_PASS=your-app-password
EMAIL_TO=your-notification-email@gmail.com
ALLOWED_SENDERS=your-notification-email@gmail.com
SESSION_MAP_PATH=/your/path/to/Claude-Code-Remote/src/data/session-map.json
```

📌 **Gmail users**: Use [App Passwords](https://myaccount.google.com/security), not your regular password.

#### Option B: Configure Telegram ✅ **NEW**

**Quick Setup:**
```bash
chmod +x setup-telegram.sh
./setup-telegram.sh
```

**Manual Setup:**
1. Create bot via [@BotFather](https://t.me/BotFather)
2. Get your Chat ID from bot API
3. Configure webhook URL (use ngrok for local testing)

**Required Telegram settings:**
```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=your-bot-token-here
TELEGRAM_CHAT_ID=your-chat-id-here
TELEGRAM_WEBHOOK_URL=https://your-ngrok-url.app
SESSION_MAP_PATH=/your/path/to/Claude-Code-Remote/src/data/session-map.json
```

**Optional Telegram settings:**
```env
# Force IPv4 connections to Telegram API (default: false)
# Enable this if you experience connectivity issues with IPv6
TELEGRAM_FORCE_IPV4=true
```

**Network Configuration Notes:**
- **IPv4 vs IPv6**: Some network environments may have unstable IPv6 connectivity to Telegram's API servers
- **When to use `TELEGRAM_FORCE_IPV4=true`**:
  - Connection timeouts or failures when sending messages
  - Inconsistent webhook delivery
  - Network environments that don't properly support IPv6
- **Default behavior**: Uses system default (usually IPv6 when available, fallback to IPv4)
- **Performance impact**: Minimal - only affects initial connection establishment

#### Option C: Configure LINE

**Required LINE settings:**
```env
LINE_ENABLED=true
LINE_CHANNEL_ACCESS_TOKEN=your-token
LINE_CHANNEL_SECRET=your-secret
LINE_USER_ID=your-user-id
```

#### Configure Claude Code Hooks（仅在跳过 `npm run setup` 时需要）

Create hooks configuration file:

**Method 1: Global Configuration (Recommended)**
```bash
# Add to ~/.claude/settings.json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "node /your/path/to/Claude-Code-Remote/claude-hook-notify.js completed",
        "timeout": 5
      }]
    }],
    "SubagentStop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "node /your/path/to/Claude-Code-Remote/claude-hook-notify.js waiting",
        "timeout": 5
      }]
    }]
  }
}
```

**Method 2: Project-Specific Configuration**
```bash
# Set environment variable
export CLAUDE_HOOKS_CONFIG=/your/path/to/Claude-Code-Remote/claude-hooks.json
```

> **Note**: Subagent notifications are disabled by default. To enable them, set `enableSubagentNotifications: true` in your config. See [Subagent Notifications Guide](./docs/SUBAGENT_NOTIFICATIONS.md) for details.

### 5. 启动 Claude（按你的注入模式选择）

- **默认 PTY 模式（无需 tmux）**：直接在终端运行 `claude-code --config /path/to/your/claude/settings.json`
- **如果你选择 tmux 模式**：
  ```bash
  tmux new-session -d -s claude-session
  tmux attach-session -t claude-session
  claude-code --config /path/to/your/claude/settings.json
  ```
  > Detach: Ctrl+B 然后 D

> **Note**: Interactive setup 已合并 hooks 到 `~/.claude/settings.json`。若跳过，请确保手动配置 hooks。

### 6. Start Services

#### For All Platforms (Recommended)
```bash
# Automatically starts all enabled platforms
npm run webhooks
# or
node start-all-webhooks.js
```

#### For Individual Platforms

**For Email:**
```bash
npm run daemon:start
# or
node claude-remote.js daemon start
```

**For Telegram:**
```bash
npm run telegram
# or
node start-telegram-webhook.js
```

**For LINE:**
```bash
npm run line
# or
node start-line-webhook.js
```

### 7. Test Your Setup

**Quick Test:**
```bash
# Test all notification channels
node claude-hook-notify.js completed
# Should receive notifications via all enabled platforms
```

**Full Test:**
1. Start Claude in tmux session with hooks enabled
2. Run any command in Claude
3. Check for notifications (email/Telegram/LINE)
4. Reply with new command to test two-way control

## 🎮 How It Works

1. **Use Claude normally** in tmux session
2. **Get notifications** when Claude completes tasks via:
   - 🔊 **Sound alert** (Desktop)
   - 📧 **Email notification with execution trace** (if enabled)
   - 📱 **Telegram message with buttons** (if enabled)
   - 💬 **LINE message** (if enabled)
3. **Reply with commands** using any platform
4. **Commands execute automatically** in Claude

### Platform Command Formats

**Email:**
```
Simply reply to notification email with your command
No special formatting required
```

**Telegram:** ✅ **NEW**
```
Click smart button to get format:
📝 Personal Chat: /cmd TOKEN123 your command here
👥 Group Chat: @bot_name /cmd TOKEN123 your command here
```

**LINE:**
```
Reply to notification with: Your command here
(Token automatically extracted from conversation context)
```

**Local fallback (no tmux)**  
- 默认 `INJECTION_MODE=pty`：命令通过 PTY/智能粘贴注入，不依赖 tmux  
- macOS 可自动复制/粘贴到 Claude/终端；若自动注入失败，会把命令复制到剪贴板并弹出提醒

### Advanced Configuration

**Email Notification Options**

1. **Subagent Activities in Email**

   By default, email notifications only show the execution trace. You can optionally enable a separate subagent activities summary section:

   ```json
   // In your config/config.json
   {
     "showSubagentActivitiesInEmail": true  // Default: false
   }
   ```

   When enabled, emails will include:
   - **Subagent Activities Summary**: A structured list of all subagent activities
   - **Full Execution Trace**: The complete terminal output

   Since the execution trace already contains all information, this feature is disabled by default to keep emails concise.

2. **Execution Trace Display**

   You can control whether to include the execution trace in email notifications:

   ```json
   // In your email channel configuration
   {
     "email": {
       "config": {
         "includeExecutionTrace": false  // Default: true
       }
     }
   }
   ```

   - When `true` (default): Shows a scrollable execution trace section in emails
   - When `false`: Removes the execution trace section entirely from emails

   This is useful if you find the execution trace too verbose or if your email client has issues with scrollable content.

## 💡 Use Cases

- **Remote Code Reviews**: Start reviews at office, continue from home via any platform
- **Long-running Tasks**: Monitor progress and guide next steps remotely
- **Multi-location Development**: Control Claude from anywhere without VPN
- **Team Collaboration**: Share Telegram groups for team notifications
- **Mobile Development**: Send commands from phone via Telegram

## 🔧 Commands

### Setup
```bash
npm run setup   # Interactive wizard to create .env and merge hooks into ~/.claude/settings.json
```

### Testing & Diagnostics
```bash
# Test all notification channels
node claude-hook-notify.js completed

# Test specific platforms
node test-telegram-notification.js
node test-real-notification.js
node test-injection.js

# System diagnostics
node claude-remote.js diagnose
node claude-remote.js status
node claude-remote.js test
```

### Service Management
```bash
# Start all enabled platforms
npm run webhooks

# Individual services
npm run telegram         # Telegram webhook
npm run line            # LINE webhook  
npm run daemon:start    # Email daemon

# Stop services
npm run daemon:stop     # Stop email daemon
```

## 🔍 Troubleshooting

### Common Issues

**Not receiving notifications from Claude?**
1. Check hooks configuration in tmux session:
   ```bash
   echo $CLAUDE_HOOKS_CONFIG
   ```
2. Verify Claude is running with hooks enabled
3. Test notification manually:
   ```bash
   node claude-hook-notify.js completed
   ```

**Telegram bot not responding?** ✅ **NEW**
```bash
# Test bot connectivity
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": $TELEGRAM_CHAT_ID, \"text\": \"Test\"}"

# Check webhook status
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

**Commands not executing in Claude?**
```bash
# Check tmux session exists
tmux list-sessions

# Verify injection mode
grep INJECTION_MODE .env  # Should be 'tmux'

# Test injection
node test-injection.js
```

**Not receiving emails?**
- Run `node claude-remote.js test` to test email setup
- Check spam folder
- Verify SMTP settings in `.env`
- For Gmail: ensure you're using App Password

### Debug Mode
```bash
# Enable detailed logging
LOG_LEVEL=debug npm run webhooks
DEBUG=true node claude-hook-notify.js completed
```

## 🛡️ Security

### Multi-Platform Authentication
- ✅ **Email**: Sender whitelist via `ALLOWED_SENDERS` environment variable
- ✅ **Telegram**: Bot token and chat ID verification
- ✅ **LINE**: Channel secret and access token validation
- ✅ **Session Tokens**: 8-character alphanumeric tokens for command verification

### Session Security
- ✅ **Session Isolation**: Each token controls only its specific tmux session
- ✅ **Auto Expiration**: Sessions timeout automatically after 24 hours
- ✅ **Token-based Commands**: All platforms require valid session tokens
- ✅ **Minimal Data Storage**: Session files contain only necessary information

## 🤝 Contributing

Found a bug or have a feature request? 

- 🐛 **Issues**: [GitHub Issues](https://github.com/JessyTsui/Claude-Code-Remote/issues)
- 🐦 **Updates**: Follow [@Jiaxi_Cui](https://x.com/Jiaxi_Cui) on Twitter
- 💬 **Discussions**: Share your use cases and improvements

## 🌐 Multi-Server Architecture Setup

### Overview

The multi-server architecture allows you to monitor and control Claude Code running on multiple servers (5+) from a single Telegram bot. Perfect for teams with multiple development environments or distributed infrastructure.

### Architecture Diagram

```
┌─────────────────────────────────────────────┐
│            Telegram Bot API                  │
└──────────────────┬──────────────────────────┘
                   │ webhook
                   ▼
┌─────────────────────────────────────────────┐
│        Central Hub (Your Machine)           │
│  ┌─────────────────────────────────┐        │
│  │ Notification Aggregator (3001)  │◄───────┼── Remote Servers
│  │ - Receives from all servers     │        │   (builder-kr-4, aws1, etc)
│  │ - SQLite session management     │        │
│  │ - Forwards to Telegram          │        │
│  └─────────────────────────────────┘        │
│  ┌─────────────────────────────────┐        │
│  │ Webhook Server (3000)           │        │
│  │ - Parses /cmd server:number     │───SSH──┼→ Execute commands
│  │ - Routes via SSH                │        │   on remote servers
│  └─────────────────────────────────┘        │
└─────────────────────────────────────────────┘
```

### Step 1: Install Central Hub

**On your main machine (local):**

```bash
# One-line install
bash <(curl -fsSL https://raw.githubusercontent.com/jayleekr/Claude-Code-Remote/master/install.sh)

# Follow prompts:
# - Server ID: local
# - Central Hub Endpoint: http://localhost:3001/notify
# - (Shared secret will be auto-generated)
```

**Configure Telegram:**

Edit `.env` file:
```bash
TELEGRAM_BOT_TOKEN=your-bot-token-here
TELEGRAM_CHAT_ID=your-chat-id-here
```

**Start Central Hub:**

```bash
cd ~/Claude-Code-Remote

# Start notification aggregator
node start-aggregator.js

# In another terminal, start webhook server
node start-telegram-webhook.js
```

### Step 2: Install Remote Servers

**On builder-kr-4 (or any remote server):**

```bash
# One-line install with environment variables
SERVER_ID=kr4 \
CENTRAL_HUB_ENDPOINT=http://your-central-hub-ip:3001/notify \
bash <(curl -fsSL https://raw.githubusercontent.com/jayleekr/Claude-Code-Remote/master/install.sh)
```

**Important:**
- Replace `your-central-hub-ip` with your central hub's IP address or domain
- Use server-specific ID: `kr4`, `aws1`, `prod`, etc.
- The shared secret is automatically configured from central hub

**Test Remote Installation:**

```bash
cd ~/Claude-Code-Remote
node claude-hook-notify.js completed
```

You should receive a Telegram notification like:
```
✅ [KR4] Claude Task Completed
Project: test-project
Session: kr4:1

💬 To send a command:
/cmd kr4:1 <your command>
```

### Step 3: Configure SSH Access

**On Central Hub, configure SSH access to remote servers:**

Edit `config/servers.json`:
```json
{
  "servers": [
    {
      "id": "local",
      "type": "local",
      "hostname": "localhost"
    },
    {
      "id": "kr4",
      "type": "remote",
      "hostname": "builder-kr-4.kr.sonatus.com",
      "ssh": {
        "user": "jay.lee",
        "port": 22,
        "keyPath": "~/.ssh/id_ed25519"
      }
    },
    {
      "id": "aws1",
      "type": "remote",
      "hostname": "aws-server.example.com",
      "ssh": {
        "user": "ubuntu",
        "port": 22,
        "keyPath": "~/.ssh/aws-key.pem"
      }
    }
  ]
}
```

**Test SSH Connection:**
```bash
ssh builder-kr-4.kr.sonatus.com "echo Connection successful"
```

### Step 4: Usage

**Receive Notifications:**

When Claude completes a task on any server, you'll receive:
```
✅ [LOCAL] Claude Task Completed
Session: local:1
...

✅ [KR4] Claude Task Completed
Session: kr4:1
...
```

**Send Commands:**

```bash
# Command to local machine
/cmd local:1 analyze the code

# Command to builder-kr-4
/cmd kr4:1 run tests

# Command to AWS server
/cmd aws1:1 check logs
```

### Session Management

**Server-Specific Numbering:**
- Each server has independent session numbers
- `local:1`, `local:2`, `local:3`
- `kr4:1`, `kr4:2`, `kr4:3`

**24-Hour Expiration:**
- Sessions automatically expire after 24 hours
- Database automatically cleaned up

**SQLite Storage:**
- All sessions stored in `data/sessions.db`
- View sessions: `sqlite3 data/sessions.db "SELECT * FROM sessions;"`

### Adding New Servers

**Install on new server:**

```bash
SERVER_ID=prod \
CENTRAL_HUB_ENDPOINT=http://your-central-hub-ip:3001/notify \
bash <(curl -fsSL https://raw.githubusercontent.com/jayleekr/Claude-Code-Remote/master/install.sh)
```

**Add to central hub config:**

Edit `config/servers.json` and add:
```json
{
  "id": "prod",
  "type": "remote",
  "hostname": "prod-server.example.com",
  "ssh": {
    "user": "deploy",
    "port": 22,
    "keyPath": "~/.ssh/prod-key"
  }
}
```

**Restart notification aggregator:**
```bash
# Kill old process
lsof -ti :3001 | xargs kill

# Start new process
node start-aggregator.js
```

### Troubleshooting

**Remote notifications not arriving:**
```bash
# On remote server, check connection
curl -X POST http://your-hub-ip:3001/notify \
  -H "Content-Type: application/json" \
  -H "X-Shared-Secret: your-secret" \
  -d '{"serverId":"kr4","type":"completed","project":"test","metadata":{}}'
```

**Commands not executing on remote:**
```bash
# Test SSH connection
ssh remote-host "tmux list-sessions"

# Check command executor logs
tail -f ~/.claude-code-remote/logs/aggregator.log
```

**Port conflicts:**
```bash
# Check what's using port 3001
lsof -i :3001

# Kill and restart
lsof -ti :3001 | xargs kill
node start-aggregator.js
```

### Security Notes

1. **Shared Secret**: Auto-generated 64-character hex string
2. **SSH Keys**: Use key-based authentication only
3. **Network Access**: Central hub needs:
   - Inbound: Port 3001 (from remote servers)
   - Outbound: SSH to remote servers
4. **Remote Servers**: Only need outbound HTTPS to central hub

### Performance

- **Scalability**: Tested with 5+ servers, supports 20+ easily
- **Latency**: <2 seconds for notifications, <5 seconds for command execution
- **Resource Usage**:
  - Central Hub: ~100MB RAM
  - Remote Agent: ~50MB RAM

## 📄 License

MIT License - Feel free to use and modify!

---

**🚀 Make Claude Code truly remote and accessible from anywhere - now with multi-server support!**

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=JessyTsui/Claude-Code-Remote&type=Date)](https://star-history.com/#JessyTsui/Claude-Code-Remote&Date)

⭐ **Star this repo** if it helps you code more efficiently!

> 💡 **Tip**: Enable multiple notification channels for redundancy - never miss a Claude completion again!
