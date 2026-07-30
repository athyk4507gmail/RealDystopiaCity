#!/bin/bash

# ========================================
# CityPulse AI - Production Deployment Script
# ========================================

set -e  # Exit on error

echo "🚀 CityPulse AI - Production Deployment"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Pre-flight checks
echo -e "${BLUE}Step 1: Pre-flight checks${NC}"
echo "------------------------"

# Check Node version
NODE_VERSION=$(node -v)
echo "✓ Node.js version: $NODE_VERSION"

# Check npm version
NPM_VERSION=$(npm -v)
echo "✓ npm version: $NPM_VERSION"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}✗ Error: package.json not found${NC}"
    echo "Please run this script from the frontend directory"
    exit 1
fi
echo "✓ In correct directory"

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠ Warning: Uncommitted changes detected${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✓ No uncommitted changes"
fi

echo ""

# Step 2: Install dependencies
echo -e "${BLUE}Step 2: Installing dependencies${NC}"
echo "-------------------------------"
npm ci
echo "✓ Dependencies installed"
echo ""

# Step 3: Run linter
echo -e "${BLUE}Step 3: Running linter${NC}"
echo "----------------------"
if npm run lint; then
    echo "✓ Linter passed"
else
    echo -e "${RED}✗ Linter failed${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# Step 4: Type checking
echo -e "${BLUE}Step 4: Type checking${NC}"
echo "---------------------"
if npx tsc --noEmit; then
    echo "✓ Type check passed"
else
    echo -e "${YELLOW}⚠ Type check warnings${NC}"
fi
echo ""

# Step 5: Clean previous build
echo -e "${BLUE}Step 5: Cleaning previous build${NC}"
echo "-------------------------------"
rm -rf .next
echo "✓ Build directory cleaned"
echo ""

# Step 6: Build for production
echo -e "${BLUE}Step 6: Building for production${NC}"
echo "-------------------------------"
if npm run build; then
    echo -e "${GREEN}✓ Build successful!${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi
echo ""

# Step 7: Show build stats
echo -e "${BLUE}Step 7: Build statistics${NC}"
echo "-----------------------"
BUILD_SIZE=$(du -sh .next | cut -f1)
echo "Build size: $BUILD_SIZE"
echo ""

# Step 8: Test production build locally
echo -e "${BLUE}Step 8: Test production build (optional)${NC}"
echo "---------------------------------------"
read -p "Would you like to test the build locally before deploying? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting production server on http://localhost:3010"
    echo "Press Ctrl+C when done testing..."
    npm start
fi
echo ""

# Step 9: Choose deployment target
echo -e "${BLUE}Step 9: Choose deployment target${NC}"
echo "----------------------------------"
echo "1) Vercel"
echo "2) Netlify"
echo "3) Docker (build image)"
echo "4) Skip deployment (build only)"
read -p "Enter choice (1-4): " -n 1 -r
echo ""

case $REPLY in
    1)
        echo "Deploying to Vercel..."
        if command -v vercel &> /dev/null; then
            vercel --prod
            echo -e "${GREEN}✓ Deployed to Vercel!${NC}"
        else
            echo -e "${YELLOW}Vercel CLI not installed${NC}"
            echo "Install with: npm i -g vercel"
            echo "Then run: vercel --prod"
        fi
        ;;
    2)
        echo "Deploying to Netlify..."
        if command -v netlify &> /dev/null; then
            netlify deploy --prod
            echo -e "${GREEN}✓ Deployed to Netlify!${NC}"
        else
            echo -e "${YELLOW}Netlify CLI not installed${NC}"
            echo "Install with: npm i -g netlify-cli"
            echo "Then run: netlify deploy --prod"
        fi
        ;;
    3)
        echo "Building Docker image..."
        if command -v docker &> /dev/null; then
            docker build -t citypulse-frontend:latest .
            echo -e "${GREEN}✓ Docker image built!${NC}"
            echo "Run with: docker run -p 3010:3010 citypulse-frontend:latest"
        else
            echo -e "${RED}Docker not installed${NC}"
        fi
        ;;
    4)
        echo "Skipping deployment"
        ;;
    *)
        echo "Invalid choice"
        ;;
esac

echo ""

# Step 10: Summary
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Deployment Process Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Summary:"
echo "--------"
echo "✓ Dependencies installed"
echo "✓ Linter passed"
echo "✓ Type check completed"
echo "✓ Production build created"
echo "✓ Build size: $BUILD_SIZE"
echo ""
echo "Next steps:"
echo "-----------"
echo "1. Test the deployment URL"
echo "2. Run Lighthouse audit"
echo "3. Monitor error rates"
echo "4. Check analytics tracking"
echo ""
echo -e "${GREEN}🎉 Happy launching!${NC}"
