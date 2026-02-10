#!/bin/bash

# Afrobeats Seattle Documentary - Deployment Script
# This script builds the frontend and prepares the app for deployment

set -e

echo "🎬 Afrobeats Seattle Documentary - Deployment"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve project directory whether this script is at repo root
# (./deploy.sh) or inside a nested folder (e.g., ./scripts/deploy.sh).
if [ -d "$SCRIPT_DIR/app" ] && [ -d "$SCRIPT_DIR/backend" ]; then
    PROJECT_DIR="$SCRIPT_DIR"
elif [ -d "$(dirname "$SCRIPT_DIR")/app" ] && [ -d "$(dirname "$SCRIPT_DIR")/backend" ]; then
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
else
    echo -e "${RED}❌ Could not determine project directory from script location${NC}"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js version: $(node --version)${NC}"

# Build frontend
echo ""
echo "📦 Building frontend..."
cd "$PROJECT_DIR/app"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build
npm run build

echo -e "${GREEN}✓ Frontend built successfully${NC}"

# Check backend
echo ""
echo "🔧 Checking backend..."
cd "$PROJECT_DIR/backend/data"

# Create data files if they don't exist
if [ ! -f "anecdotes.json" ]; then
    echo "[]" > anecdotes.json
    echo -e "${YELLOW}⚠ Created empty anecdotes.json${NC}"
fi

if [ ! -f "subscribers.json" ]; then
    echo "[]" > subscribers.json
    echo -e "${YELLOW}⚠ Created empty subscribers.json${NC}"
fi

# Create uploads directory
mkdir -p ../uploads

echo -e "${GREEN}✓ Backend ready${NC}"

# Summary
echo ""
echo "=============================================="
echo -e "${GREEN}✅ Deployment preparation complete!${NC}"
echo ""
echo "To start the application:"
echo ""
echo "  1. Start the backend:"
echo "     cd backend/data && node server.js"
echo ""
echo "  2. Serve the frontend (in another terminal):"
echo "     cd app/dist && npx serve -s . -l 5173"
echo ""
echo "  Or use a static file server like nginx, Apache, or Vercel."
echo ""
echo "📁 Frontend build: app/dist/"
echo "📁 Backend data:   backend/data/"
echo "📁 Uploads:        backend/uploads/"
echo ""
echo "🔑 Access key: AFRO12"
echo "   (Add ?key=AFRO12 to URL to enable editing)"
echo ""
