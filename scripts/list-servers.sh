#!/bin/bash

# List Servers Script
# Shows all configured servers in the system

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "📋 Claude Code Remote - Configured Servers"
echo "=========================================="
echo ""

if [ ! -f config/servers.json ]; then
    echo "❌ config/servers.json not found"
    exit 1
fi

# Parse and display servers
python3 << 'PYTHON'
import json

with open('config/servers.json', 'r') as f:
    config = json.load(f)

print(f"Central Hub Configuration:")
print(f"  Webhook Port:       {config['central']['webhookPort']}")
print(f"  Notification Port:  {config['central']['notificationPort']}")
print(f"  ngrok Enabled:      {config['central']['ngrokEnabled']}")
print()

print(f"Servers ({len(config['servers'])}):")
print()

for i, server in enumerate(config['servers'], 1):
    server_type = server.get('type', 'unknown')

    print(f"{i}. {server['id'].upper()}")
    print(f"   Type:     {server_type}")
    print(f"   Hostname: {server.get('hostname', 'N/A')}")

    if server_type == 'remote' and 'ssh' in server:
        ssh = server['ssh']
        print(f"   SSH User: {ssh.get('user', 'N/A')}")
        print(f"   SSH Port: {ssh.get('port', 22)}")
        print(f"   SSH Key:  {ssh.get('keyPath', 'N/A')}")

    print()

PYTHON

echo ""
echo "💡 Tips:"
echo "  • Add new server: ./scripts/add-remote-server.sh <host> <id> <central-ip>"
echo "  • Remove server: Edit config/servers.json manually"
echo "  • Test connection: ssh <user>@<hostname>"
