#!/bin/bash

# Claude Code Remote - Installation Script
# One-line install: bash <(curl -fsSL https://raw.githubusercontent.com/jayleekr/Claude-Code-Remote/master/install.sh)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Claude Code Remote Installation"
echo "===================================="
echo ""

# Check if running on remote server or local
if [ -z "$SERVER_ID" ]; then
    echo -n "Server ID (local/kr4/aws1/etc): "
    read SERVER_ID
fi

if [ -z "$CENTRAL_HUB_ENDPOINT" ]; then
    echo -n "Central Hub Endpoint (e.g., http://your-ip:3001/notify): "
    read CENTRAL_HUB_ENDPOINT
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js first: https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✅ Node.js found:${NC} $(node --version)"

# Clone or update repository
REPO_DIR="$HOME/Claude-Code-Remote"

if [ -d "$REPO_DIR" ]; then
    echo "📦 Updating existing installation..."
    cd "$REPO_DIR"
    git pull origin master
else
    echo "📦 Cloning repository..."
    git clone https://github.com/jayleekr/Claude-Code-Remote.git "$REPO_DIR"
    cd "$REPO_DIR"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Generate secure secret if not provided
if [ -z "$SHARED_SECRET" ]; then
    SHARED_SECRET=$(openssl rand -hex 32)
    echo -e "${YELLOW}🔐 Generated secure secret${NC}"
fi

# Create .env file
echo "🔧 Creating .env configuration..."
cat > .env << EOF
# Server Configuration
SERVER_ID=$SERVER_ID

# Central Hub
CENTRAL_HUB_ENDPOINT=$CENTRAL_HUB_ENDPOINT
SHARED_SECRET=$SHARED_SECRET

# Telegram Configuration (if running central hub)
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=your-bot-token-here
TELEGRAM_CHAT_ID=your-chat-id-here

# Email Configuration (optional)
EMAIL_ENABLED=false
EOF

# Create config/servers.json from example if needed
if [ ! -f "config/servers.json" ]; then
    echo "🔧 Creating server configuration..."
    cp config/servers.example.json config/servers.json

    # Update shared secret in servers.json
    if command -v python3 &> /dev/null; then
        python3 << PYTHON
import json
with open('config/servers.json', 'r') as f:
    config = json.load(f)
config['central']['sharedSecret'] = '$SHARED_SECRET'
with open('config/servers.json', 'w') as f:
    json.dump(config, f, indent=2)
PYTHON
    fi
fi

# Create necessary directories
mkdir -p data logs

# Configure Claude Code hooks
HOOK_PATH="$REPO_DIR/claude-hook-notify.js"
SETTINGS_FILE="$HOME/.claude/settings.json"

if [ -f "$SETTINGS_FILE" ]; then
    echo "🔧 Configuring Claude Code hooks..."

    # Backup settings
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.backup.$(date +%s)"

    # Update hooks using Python
    python3 << PYTHON
import json
import os

settings_file = os.path.expanduser('$SETTINGS_FILE')
with open(settings_file, 'r') as f:
    settings = json.load(f)

hook_path = '$HOOK_PATH'

if 'hooks' not in settings:
    settings['hooks'] = {}

settings['hooks']['postToolUse'] = f'node {hook_path} completed'
settings['hooks']['notification'] = f'node {hook_path} waiting'

with open(settings_file, 'w') as f:
    json.dump(settings, f, indent=2)

print('✅ Claude Code hooks configured')
PYTHON
else
    echo -e "${YELLOW}⚠️  Claude settings not found at $SETTINGS_FILE${NC}"
    echo "Please configure hooks manually or ensure Claude Code is installed"
fi

echo ""
echo -e "${GREEN}✅ Installation complete!${NC}"
echo ""
echo "📋 Configuration Summary:"
echo "   Server ID: $SERVER_ID"
echo "   Hub Endpoint: $CENTRAL_HUB_ENDPOINT"
echo "   Shared Secret: ${SHARED_SECRET:0:16}..."
echo ""

if [ "$SERVER_ID" = "local" ]; then
    echo "🎯 Next Steps (Central Hub):"
    echo "   1. Update .env with your Telegram bot token and chat ID"
    echo "   2. Start notification aggregator:"
    echo "      cd $REPO_DIR"
    echo "      node start-aggregator.js"
    echo "   3. In another terminal, start webhook server (if not running)"
    echo "   4. Test with: node test-phase1.js"
else
    echo "🎯 Next Steps (Remote Server):"
    echo "   1. Test notification:"
    echo "      cd $REPO_DIR"
    echo "      node claude-hook-notify.js completed"
    echo "   2. Verify Telegram receives notification with [$SERVER_ID] prefix"
fi

echo ""
echo "📚 Documentation: https://github.com/jayleekr/Claude-Code-Remote"
