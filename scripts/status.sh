#!/bin/bash

# Status Check Script
# Shows the current status of Claude Code Remote system

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Claude Code Remote - System Status"
echo "====================================="
echo ""

# Check if notification aggregator is running
echo "📡 Notification Aggregator (port 3001):"
if lsof -i :3001 >/dev/null 2>&1; then
    PID=$(lsof -ti :3001)
    echo -e "   ${GREEN}✅ Running (PID: $PID)${NC}"

    # Try to get health check
    if command -v curl &> /dev/null; then
        HEALTH=$(curl -s http://localhost:3001/health 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo "   Health: $HEALTH"
        fi
    fi
else
    echo -e "   ${RED}❌ Not running${NC}"
    echo "   Start with: node start-aggregator.js"
fi
echo ""

# Check if webhook server is running
echo "🌐 Webhook Server (port 3000):"
if lsof -i :3000 >/dev/null 2>&1; then
    PID=$(lsof -ti :3000)
    echo -e "   ${GREEN}✅ Running (PID: $PID)${NC}"

    # Try to get health check
    if command -v curl &> /dev/null; then
        HEALTH=$(curl -s http://localhost:3000/health 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo "   Health: $HEALTH"
        fi
    fi
else
    echo -e "   ${YELLOW}⚠️  Not running${NC}"
    echo "   Start with: node start-webhook.js"
fi
echo ""

# Check active sessions
echo "💾 Active Sessions:"
if lsof -i :3001 >/dev/null 2>&1; then
    if command -v curl &> /dev/null; then
        SESSIONS=$(curl -s http://localhost:3001/sessions 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo "$SESSIONS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f\"   Count: {data['count']}\")
    if data['count'] > 0:
        for session in data['sessions']:
            print(f\"   • {session['serverId']}:{session['serverNumber']} - {session['project']} (token: {session['token']})\")
except:
    print('   Unable to parse sessions')
"
        else
            echo "   Unable to fetch sessions"
        fi
    fi
else
    echo "   Aggregator not running"
fi
echo ""

# Check configured servers
echo "🖥️  Configured Servers:"
if [ -f config/servers.json ]; then
    python3 << 'PYTHON'
import json

with open('config/servers.json', 'r') as f:
    config = json.load(f)

for server in config['servers']:
    server_id = server['id']
    server_type = server.get('type', 'unknown')
    status_icon = '🟢' if server_type == 'local' else '🔵'

    print(f"   {status_icon} {server_id.upper()} ({server_type})")
PYTHON
else
    echo "   ❌ config/servers.json not found"
fi
echo ""

# Check database
echo "💿 Database:"
if [ -f data/sessions.db ]; then
    SIZE=$(du -h data/sessions.db | cut -f1)
    echo -e "   ${GREEN}✅ sessions.db exists ($SIZE)${NC}"
else
    echo -e "   ${YELLOW}⚠️  sessions.db not found${NC}"
fi
echo ""

# Check environment
echo "⚙️  Environment:"
if [ -f .env ]; then
    echo -e "   ${GREEN}✅ .env file exists${NC}"

    # Check critical variables
    if grep -q "^TELEGRAM_BOT_TOKEN=" .env; then
        echo "   ✅ TELEGRAM_BOT_TOKEN configured"
    else
        echo "   ❌ TELEGRAM_BOT_TOKEN missing"
    fi

    if grep -q "^SHARED_SECRET=" .env; then
        echo "   ✅ SHARED_SECRET configured"
    else
        echo "   ❌ SHARED_SECRET missing"
    fi
else
    echo -e "   ${RED}❌ .env file not found${NC}"
fi
echo ""

echo "💡 Quick Commands:"
echo "   • Start aggregator:  node start-aggregator.js"
echo "   • Start webhook:     node start-webhook.js"
echo "   • List servers:      ./scripts/list-servers.sh"
echo "   • Add server:        ./scripts/add-remote-server.sh <host> <id> <ip>"
echo "   • View sessions:     curl http://localhost:3001/sessions | jq"
