#!/bin/bash
set -e

# HXTP Frontend Deployment Script (systemd-based)
REPO_DIR="/opt/hxtp-frontend"

echo ">>> Starting HXTP Frontend Deployment at $(date)"

cd $REPO_DIR

# 1. Update Code
echo ">>> Pulling latest code..."
git fetch origin main
git reset --hard origin/main

# 2. Rebuild Frontend
echo ">>> Rebuilding Frontend..."
# Assuming pnpm is installed on the VM. If not, fallback to npm.
if command -v pnpm &> /dev/null; then
  pnpm install
  pnpm run build
else
  npm install
  npm run build
fi

# 3. Restart systemd service
echo ">>> Restarting systemd service..."
sudo systemctl restart hxtp-frontend

echo ">>> Frontend Deployment SUCCESSFUL"
