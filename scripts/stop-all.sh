#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "🛑 Stopping Claude Code Remote Services"
echo "======================================"

# Stop Notification Aggregator
if lsof -ti :3001 >/dev/null 2>&1; then
    echo "📡 Stopping Notification Aggregator..."
    lsof -ti :3001 | xargs kill -9 2>/dev/null
    sleep 1
    if ! lsof -ti :3001 >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Notification Aggregator stopped${NC}"
    else
        echo -e "${RED}❌ Failed to stop Notification Aggregator${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Notification Aggregator not running${NC}"
fi

# Stop Webhook Server
if lsof -ti :3000 >/dev/null 2>&1; then
    echo "🌐 Stopping Webhook Server..."
    lsof -ti :3000 | xargs kill -9 2>/dev/null
    sleep 1
    if ! lsof -ti :3000 >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Webhook Server stopped${NC}"
    else
        echo -e "${RED}❌ Failed to stop Webhook Server${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Webhook Server not running${NC}"
fi

# Stop ngrok
if pgrep -f "ngrok http 3000" >/dev/null 2>&1; then
    echo "🌍 Stopping ngrok tunnel..."
    pkill -f "ngrok http 3000" 2>/dev/null
    sleep 1
    if ! pgrep -f "ngrok http 3000" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ ngrok tunnel stopped${NC}"
    else
        echo -e "${RED}❌ Failed to stop ngrok${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  ngrok not running${NC}"
fi

# Stop caffeinate (screen sleep prevention)
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$REPO_DIR/logs/caffeinate.pid" ]; then
    CAFFEINATE_PID=$(cat "$REPO_DIR/logs/caffeinate.pid")
    if ps -p $CAFFEINATE_PID > /dev/null 2>&1; then
        echo "☕ Stopping screen sleep prevention..."
        kill $CAFFEINATE_PID 2>/dev/null
        rm -f "$REPO_DIR/logs/caffeinate.pid"
        sleep 1
        if ! ps -p $CAFFEINATE_PID > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Screen sleep prevention stopped${NC}"
        else
            echo -e "${RED}❌ Failed to stop caffeinate${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Caffeinate not running${NC}"
        rm -f "$REPO_DIR/logs/caffeinate.pid"
    fi
elif pgrep -f "caffeinate -d -i -s" >/dev/null 2>&1; then
    echo "☕ Stopping screen sleep prevention..."
    pkill -f "caffeinate -d -i -s" 2>/dev/null
    echo -e "${GREEN}✅ Screen sleep prevention stopped${NC}"
else
    echo -e "${YELLOW}⚠️  Caffeinate not running${NC}"
fi

echo ""
echo "======================================"
echo -e "${GREEN}✅ All services stopped${NC}"
echo ""
