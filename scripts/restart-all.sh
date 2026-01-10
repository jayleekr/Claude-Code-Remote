#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR" || exit 1

echo "🔄 Restarting Claude Code Remote Services"
echo "=========================================="
echo ""

# Stop all services first
echo "📍 Step 1/2: Stopping all services..."
./scripts/stop-all.sh

echo ""
echo "⏳ Waiting 2 seconds before restart..."
sleep 2
echo ""

# Start all services
echo "📍 Step 2/2: Starting all services..."
./scripts/start-all.sh

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Restart completed!${NC}"
echo ""
