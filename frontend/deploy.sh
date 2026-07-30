#!/bin/bash

# CityPulse AI Landing Page Deployment Script
# Version: 2.0
# Description: Automated deployment with pre-flight checks

set -e  # Exit on error

echo "🚀 CityPulse AI Landing Page - Deployment Script"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Are you in the frontend directory?"
    exit 1
fi

print_success "Found package.json"

# Pre-flight checks
echo ""
echo "🔍 Running pre-flight checks..."
echo "--------------------------------"

# Check Node version
NODE_VERSION=$(node --version)
print_status "Node version: $NODE_VERSION"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found. Installing dependencies..."
    npm install
    print_success "Dependencies installed"
else
    print_success "Dependencies found"
fi

# Type check
print_status "Running TypeScript type check..."
if npm run type-check > /dev/null 2>&1; then
    print_success "Type check passed"
else
    print_error "Type check failed"
    exit 1
fi

# Lint check
print_status "Running ESLint..."
if npm run lint > /dev/null 2>&1; then
    print_success "Lint check passed"
else
    print_warning "Lint issues found (continuing anyway)"
fi

# Check for required files
echo ""
echo "📁 Checking required files..."
echo "-----------------------------"

REQUIRED_FILES=(
    "src/app/(public)/landing/page.tsx"
    "src/app/(public)/layout.tsx"
    "src/app/globals.css"
    "public/logo-citypulse.png"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_success "$file exists"
    else
        print_error "$file missing"
        exit 1
    fi
done

# Check for OG image
if [ -f "public/og-image.png" ]; then
    print_success "OG image found"
else
    print_warning "OG image not found (recommended: 1200x630px)"
fi

# Check for environment files
echo ""
echo "🔐 Checking environment configuration..."
echo "----------------------------------------"

if [ -f ".env.local" ]; then
    print_success ".env.local exists"
else
    print_warning ".env.local not found (may be needed for production)"
fi

if [ -f ".env.production" ]; then
    print_success ".env.production exists"
else
    print_warning ".env.production not found (create if needed)"
fi

# Build the application
echo ""
echo "🔨 Building application..."
echo "--------------------------"

if npm run build; then
    print_success "Build successful"
else
    print_error "Build failed"
    exit 1
fi

# Check build output
if [ -d ".next" ]; then
    BUILD_SIZE=$(du -sh .next | cut -f1)
    print_success "Build output: $BUILD_SIZE"
else
    print_error "Build output not found"
    exit 1
fi

# Deployment options
echo ""
echo "📦 Deployment Options"
echo "====================="
echo ""
echo "Choose deployment method:"
echo "  1) Deploy to Vercel (recommended)"
echo "  2) Build Docker image"
echo "  3) Export static files"
echo "  4) Start production server locally"
echo "  5) Exit"
echo ""

read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        print_status "Deploying to Vercel..."
        
        # Check if Vercel CLI is installed
        if ! command -v vercel &> /dev/null; then
            print_warning "Vercel CLI not found. Installing..."
            npm install -g vercel
        fi
        
        # Deploy
        print_status "Starting Vercel deployment..."
        vercel --prod
        
        print_success "Deployment complete!"
        ;;
        
    2)
        echo ""
        print_status "Building Docker image..."
        
        if ! command -v docker &> /dev/null; then
            print_error "Docker not installed"
            exit 1
        fi
        
        docker build -t citypulse-frontend:latest .
        print_success "Docker image built: citypulse-frontend:latest"
        
        echo ""
        echo "To run the container:"
        echo "  docker run -p 3000:3000 citypulse-frontend:latest"
        ;;
        
    3)
        echo ""
        print_status "Exporting static files..."
        
        # Note: Next.js App Router doesn't support static export easily
        print_warning "Static export not recommended for this project"
        print_status "Consider using Vercel or Docker instead"
        ;;
        
    4)
        echo ""
        print_status "Starting production server..."
        print_status "Server will run on http://localhost:3000"
        print_status "Press Ctrl+C to stop"
        echo ""
        npm start
        ;;
        
    5)
        echo ""
        print_status "Exiting..."
        exit 0
        ;;
        
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🎉 Deployment process complete!"
echo ""
echo "📚 Next steps:"
echo "  1. Verify site is accessible"
echo "  2. Test all functionality"
echo "  3. Set up analytics"
echo "  4. Submit sitemap to search engines"
echo "  5. Monitor performance"
echo ""
echo "📖 Documentation: See PRODUCTION-CHECKLIST.md"
echo ""

exit 0
