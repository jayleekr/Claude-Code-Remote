#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR" || exit 1

echo "🚀 Starting Claude Code Remote Services"
echo "======================================"

# Create logs directory
mkdir -p logs

# Start Notification Aggregator
if lsof -ti :3001 >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Notification Aggregator already running on port 3001${NC}"
else
    echo "📡 Starting Notification Aggregator..."
    node start-aggregator.js > logs/aggregator.log 2>&1 &
    sleep 2

    if lsof -ti :3001 >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Notification Aggregator started${NC}"
    else
        echo -e "${RED}❌ Failed to start Notification Aggregator${NC}"
        tail -10 logs/aggregator.log
        exit 1
    fi
fi

# Start Webhook Server
if lsof -ti :3000 >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Webhook Server already running on port 3000${NC}"
else
    echo "🌐 Starting Webhook Server..."
    NGROK_ENABLED=false node start-webhook.js > logs/webhook.log 2>&1 &
    sleep 2

    if lsof -ti :3000 >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Webhook Server started${NC}"
    else
        echo -e "${RED}❌ Failed to start Webhook Server${NC}"
        tail -10 logs/webhook.log
        exit 1
    fi
fi

# Start ngrok
if pgrep -f "ngrok http 3000" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  ngrok already running${NC}"
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)
    if [ -n "$NGROK_URL" ]; then
        echo "   Public URL: $NGROK_URL"
    fi
else
    echo "🌍 Starting ngrok tunnel..."
    npx ngrok http 3000 --log=logs/ngrok.log > /dev/null 2>&1 &

    echo "   Waiting for ngrok..."
    for i in {1..15}; do
        sleep 1
        NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)
        if [ -n "$NGROK_URL" ]; then
            echo -e "${GREEN}✅ ngrok tunnel established${NC}"
            echo "   Public URL: $NGROK_URL"
            break
        fi
    done

    if [ -z "$NGROK_URL" ]; then
        echo -e "${RED}❌ Failed to get ngrok URL${NC}"
        echo "   Check logs/ngrok.log"
    else
        # Update Telegram webhook
        echo "📱 Updating Telegram webhook..."
        if [ -f .env ]; then
            source .env
            WEBHOOK_URL="${NGROK_URL}/webhook/telegram"

            curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
                -H "Content-Type: application/json" \
                -d "{\"url\": \"$WEBHOOK_URL\"}" | grep -q '"ok":true'

            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✅ Telegram webhook updated${NC}"
            else
                echo -e "${RED}❌ Failed to update webhook${NC}"
            fi
        fi
    fi
fi

echo ""
echo "======================================"
echo -e "${GREEN}✅ All services started!${NC}"
echo ""
echo "📊 Service Status:"
./scripts/status.sh | grep -A 10 "Service Status"

echo ""
echo "📋 Quick Commands:"
echo "   Status:    ./scripts/status.sh"
echo "   Stop:      ./scripts/stop-all.sh"
echo "   Sessions:  /sessions (in Telegram)"
echo "   Logs:      tail -f logs/*.log"
echo ""
