#!/bin/bash

# Afrobeats Seattle Documentary - Start Script
# Starts both backend and frontend for local development

set -e

echo "🎬 Starting Afrobeats Seattle Documentary..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed"
    exit 1
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down servers..."
    pkill -f "bun server.ts" 2>/dev/null || true
    exit 0
}
trap cleanup INT TERM

# Start backend
echo -e "${BLUE}🔧 Starting backend on port 3001...${NC}"
cd "$PROJECT_DIR/backend"

# Create data files if they don't exist for migration/bootstrap
[ ! -f "data/anecdotes.json" ] && printf "[]" > data/anecdotes.json
[ ! -f "data/subscribers.json" ] && printf "[]" > data/subscribers.json
mkdir -p uploads

# Run one-time/ongoing safe migration bootstrap
bun run migrate >/dev/null 2>&1 || true

bun server.ts &
BACKEND_PID=$!
echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"

# Wait for backend to be ready
echo "Waiting for backend to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:3001/api/anecdotes > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is ready${NC}"
        break
    fi
    sleep 0.5
done

# Start frontend
echo ""
echo -e "${BLUE}🎨 Starting frontend...${NC}"
cd "$PROJECT_DIR/app"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

echo -e "${YELLOW}⚡ Frontend will be available at: http://localhost:5173${NC}"
echo -e "${YELLOW}⚡ Backend API at: http://localhost:3001${NC}"
echo ""
echo -e "${GREEN}🚀 Press Ctrl+C to stop both servers${NC}"
echo ""

npm run dev
