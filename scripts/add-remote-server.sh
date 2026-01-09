#!/bin/bash

# Add Remote Server Script
# Automates adding a new remote server to Claude Code Remote system

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Add Remote Server to Claude Code Remote"
echo "==========================================="
echo ""

# Parse arguments
REMOTE_HOST=$1
SERVER_ID=$2
CENTRAL_IP=$3

# Usage check
if [ -z "$REMOTE_HOST" ] || [ -z "$SERVER_ID" ] || [ -z "$CENTRAL_IP" ]; then
    echo -e "${RED}Usage:${NC}"
    echo "  $0 <remote-host> <server-id> <central-ip>"
    echo ""
    echo "Example:"
    echo "  $0 jay.lee@builder-kr-4.kr.sonatus.com kr4 192.168.1.100"
    echo ""
    exit 1
fi

# Extract SSH user and hostname
if [[ $REMOTE_HOST == *"@"* ]]; then
    SSH_USER=$(echo $REMOTE_HOST | cut -d'@' -f1)
    HOSTNAME=$(echo $REMOTE_HOST | cut -d'@' -f2)
else
    SSH_USER=$USER
    HOSTNAME=$REMOTE_HOST
fi

echo -e "${GREEN}Configuration:${NC}"
echo "  Remote Host: $REMOTE_HOST"
echo "  Server ID: $SERVER_ID"
echo "  SSH User: $SSH_USER"
echo "  Hostname: $HOSTNAME"
echo "  Central Hub IP: $CENTRAL_IP"
echo ""

# Get shared secret from local .env
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found in current directory${NC}"
    echo "Please run this script from the Claude-Code-Remote root directory"
    exit 1
fi

SHARED_SECRET=$(grep "^SHARED_SECRET=" .env | cut -d'=' -f2)

if [ -z "$SHARED_SECRET" ]; then
    echo -e "${RED}❌ SHARED_SECRET not found in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found SHARED_SECRET${NC}"
echo ""

# Step 1: Test SSH connection
echo "📡 Step 1: Testing SSH connection..."
if ssh -o ConnectTimeout=5 -o BatchMode=yes $REMOTE_HOST "echo 'SSH connection successful'" 2>/dev/null; then
    echo -e "${GREEN}✅ SSH connection successful${NC}"
else
    echo -e "${RED}❌ Cannot connect to $REMOTE_HOST${NC}"
    echo "Please ensure:"
    echo "  1. SSH key is configured (~/.ssh/id_ed25519 or ~/.ssh/id_rsa)"
    echo "  2. Host is reachable"
    echo "  3. SSH key is added to remote authorized_keys"
    exit 1
fi
echo ""

# Step 2: Install on remote server
echo "📦 Step 2: Installing Claude-Code-Remote on remote server..."

ssh $REMOTE_HOST bash << EOF
    set -e

    # Run the installer
    SERVER_ID=$SERVER_ID \
    CENTRAL_HUB_ENDPOINT=http://$CENTRAL_IP:3001/notify \
    SHARED_SECRET=$SHARED_SECRET \
    bash <(curl -fsSL https://raw.githubusercontent.com/jayleekr/Claude-Code-Remote/master/install.sh)
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Installation successful${NC}"
else
    echo -e "${RED}❌ Installation failed${NC}"
    exit 1
fi
echo ""

# Step 3: Update local config/servers.json
echo "📝 Step 3: Updating local config/servers.json..."

# Check if server already exists
if grep -q "\"id\": \"$SERVER_ID\"" config/servers.json 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Server '$SERVER_ID' already exists in config/servers.json${NC}"
    echo "Skipping configuration update"
else
    # Detect SSH key path
    if [ -f ~/.ssh/id_ed25519 ]; then
        SSH_KEY_PATH="~/.ssh/id_ed25519"
    elif [ -f ~/.ssh/id_rsa ]; then
        SSH_KEY_PATH="~/.ssh/id_rsa"
    else
        SSH_KEY_PATH="~/.ssh/id_rsa"
        echo -e "${YELLOW}⚠️  SSH key not found, using default: $SSH_KEY_PATH${NC}"
    fi

    # Create server entry
    python3 << PYTHON
import json

# Read current config
with open('config/servers.json', 'r') as f:
    config = json.load(f)

# New server entry
new_server = {
    "id": "$SERVER_ID",
    "alias": "$SERVER_ID",
    "type": "remote",
    "hostname": "$HOSTNAME",
    "ssh": {
        "user": "$SSH_USER",
        "port": 22,
        "keyPath": "$SSH_KEY_PATH"
    }
}

# Check if already exists
existing = [s for s in config['servers'] if s['id'] == '$SERVER_ID']
if not existing:
    config['servers'].append(new_server)

    # Write back
    with open('config/servers.json', 'w') as f:
        json.dump(config, f, indent=2)

    print("✅ Server added to config/servers.json")
else:
    print("⚠️  Server already exists")

PYTHON

fi
echo ""

# Step 4: Restart notification aggregator
echo "🔄 Step 4: Restarting notification aggregator..."
echo -e "${YELLOW}Please restart the notification aggregator to load new server:${NC}"
echo "  lsof -ti :3001 | xargs kill -9"
echo "  node start-aggregator.js &"
echo ""

# Step 5: Test notification
echo "✅ Installation Complete!"
echo ""
echo "📋 Next Steps:"
echo "  1. Restart notification aggregator (see above)"
echo "  2. Test notification from remote server:"
echo "     ssh $REMOTE_HOST 'cd ~/Claude-Code-Remote && source ~/.nvm/nvm.sh && node claude-hook-notify.js completed'"
echo ""
echo "  3. Once notification arrives, test command:"
echo "     /cmd $SERVER_ID:1 echo \"Hello from Telegram\""
echo ""
echo -e "${GREEN}🎉 Server '$SERVER_ID' is ready!${NC}"
