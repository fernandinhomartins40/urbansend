#!/bin/bash
# UltraZend Development Environment Setup Script

set -e

echo "🚀 Setting up UltraZend Development Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    log_success "Docker is installed"
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    log_success "Docker Compose is installed"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_warning "Node.js is not installed. Will use Docker for Node.js."
    else
        NODE_VERSION=$(node --version)
        log_success "Node.js is installed: $NODE_VERSION"
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed. Please install Git first."
        exit 1
    fi
    log_success "Git is installed"
}

# Setup environment files
setup_env_files() {
    log_info "Setting up environment files..."
    
    if [ ! -f .env ]; then
        log_info "Creating .env file from template..."
        cat > .env << 'EOF'
# UltraZend Development Environment Variables

# Application
NODE_ENV=development
PORT=3001
FRONTEND_PORT=5173

# Security
JWT_SECRET=ultrazend_jwt_secret_key_development_2024_secure_64_chars_minimum_dev
JWT_REFRESH_SECRET=ultrazend_jwt_refresh_secret_development_2024_secure_64_chars_min_dev
JWT_EXPIRES_IN=7d

# Database  
DATABASE_URL=./backend/data/database.sqlite

# Domain and URLs
DOMAIN=localhost
PUBLIC_URL=http://localhost:3001
API_URL=http://localhost:3001/api
FRONTEND_URL=http://localhost:5173

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:8080
CORS_ORIGIN=http://localhost:5173

# SMTP Server Configuration
SMTP_HOSTNAME=mail.dev.ultrazend.local
SMTP_SERVER_PORT=25
SMTP_SUBMISSION_PORT=587

# SMTP Client Configuration (MailHog for Development)
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=

# SMTP System Accounts
SMTP_SYSTEM_PASSWORD=ultrazend-system-smtp-password-dev
SMTP_NOREPLY_PASSWORD=ultrazend-noreply-smtp-password-dev

# Email Service
EMAIL_FROM_NAME=UltraZend Dev
EMAIL_FROM_ADDRESS=noreply@dev.ultrazend.local
FROM_EMAIL=noreply@dev.ultrazend.local
FROM_NAME=UltraZend Dev

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=ultrazend-redis-dev-password
REDIS_DB=0

# Queue Configuration
QUEUE_CONCURRENCY=10
QUEUE_MAX_ATTEMPTS=3

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Logging
LOG_LEVEL=debug

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./backend/data/uploads

# Monitoring
HEALTH_CHECK_ENABLED=true
MONITORING_ENABLED=true

# Session Configuration
SESSION_SECRET=ultrazend-session-secret-dev-2024-64-chars-minimum-development

# API Keys
API_KEY_SALT=ultrazend_api_key_salt_development_2024_secure_64_chars_minimum_dev
COOKIE_SECRET=ultrazend_cookie_secret_development_2024_secure_64_chars_minimum

# Webhook Configuration
WEBHOOK_SECRET=ultrazend-webhook-secret-2024-dev

# Backup Configuration  
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_DAYS=7
BACKUP_PATH=./backend/data/backups

# Development Tools
VITE_ENABLE_MSW=true
ENABLE_DEBUG_ROUTES=true
EOF
        log_success "Created .env file"
    else
        log_warning ".env file already exists, skipping..."
    fi
}

# Create necessary directories
create_directories() {
    log_info "Creating necessary directories..."
    
    directories=(
        "backend/data"
        "backend/data/uploads"
        "backend/data/backups"
        "backend/logs"
        "frontend/dist"
        "configs"
        "scripts"
    )
    
    for dir in "${directories[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            log_success "Created directory: $dir"
        fi
    done
}

# Setup Git hooks
setup_git_hooks() {
    log_info "Setting up Git hooks..."
    
    # Pre-commit hook
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
# UltraZend pre-commit hook

echo "🔍 Running pre-commit checks..."

# Check if backend code exists
if [ -d "backend" ]; then
    echo "📋 Checking backend code..."
    cd backend
    
    # Run linting
    if ! npm run lint --silent; then
        echo "❌ Backend linting failed"
        exit 1
    fi
    
    # Run type checking
    if ! npm run typecheck --silent; then
        echo "❌ Backend type checking failed"
        exit 1
    fi
    
    cd ..
fi

# Check if frontend code exists
if [ -d "frontend" ]; then
    echo "📋 Checking frontend code..."
    cd frontend
    
    # Run linting
    if ! npm run lint --silent; then
        echo "❌ Frontend linting failed"
        exit 1
    fi
    
    # Run type checking
    if ! npm run typecheck --silent; then
        echo "❌ Frontend type checking failed"
        exit 1
    fi
    
    cd ..
fi

echo "✅ Pre-commit checks passed"
EOF

    chmod +x .git/hooks/pre-commit
    log_success "Pre-commit hook installed"
    
    # Pre-push hook
    cat > .git/hooks/pre-push << 'EOF'
#!/bin/sh
# UltraZend pre-push hook

echo "🧪 Running pre-push tests..."

# Run tests if they exist
if [ -f "backend/package.json" ] && grep -q "test" backend/package.json; then
    cd backend
    if ! npm test; then
        echo "❌ Backend tests failed"
        exit 1
    fi
    cd ..
fi

echo "✅ Pre-push tests passed"
EOF

    chmod +x .git/hooks/pre-push
    log_success "Pre-push hook installed"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    # Backend dependencies
    if [ -f "backend/package.json" ]; then
        log_info "Installing backend dependencies..."
        cd backend
        npm install
        cd ..
        log_success "Backend dependencies installed"
    fi
    
    # Frontend dependencies
    if [ -f "frontend/package.json" ]; then
        log_info "Installing frontend dependencies..."
        cd frontend
        npm install
        cd ..
        log_success "Frontend dependencies installed"
    fi
}

# Start development services
start_services() {
    log_info "Starting development services..."
    
    # Build and start services
    docker-compose -f docker-compose.dev.yml up -d --build
    
    log_info "Waiting for services to be ready..."
    sleep 15
    
    # Check service health
    if docker-compose -f docker-compose.dev.yml ps | grep -q "Up"; then
        log_success "Development services are running"
        
        echo ""
        echo "🌐 Development URLs:"
        echo "   • API Server: http://localhost:3001"
        echo "   • API Docs: http://localhost:3001/api-docs"
        echo "   • MailHog UI: http://localhost:8025"
        echo "   • Redis Commander: http://localhost:8081 (with --profile tools)"
        echo "   • Adminer: http://localhost:8080 (with --profile tools)"
        echo ""
        echo "📧 SMTP Servers:"
        echo "   • MX Server: localhost:25"
        echo "   • Submission: localhost:587"
        echo "   • MailHog SMTP: localhost:1025"
        echo ""
    else
        log_error "Some services failed to start"
        docker-compose -f docker-compose.dev.yml logs
        exit 1
    fi
}

# Run SMTP tests
run_smtp_tests() {
    log_info "Running SMTP tests..."
    
    if docker-compose -f docker-compose.dev.yml exec -T smtp-test python3 /app/smtp-test.py; then
        log_success "SMTP tests passed"
    else
        log_warning "Some SMTP tests failed - check the logs"
    fi
}

# Show development tips
show_tips() {
    echo ""
    log_info "🎯 Development Tips:"
    echo ""
    echo "🔧 Common Commands:"
    echo "   docker-compose -f docker-compose.dev.yml up -d     # Start services"
    echo "   docker-compose -f docker-compose.dev.yml down     # Stop services"
    echo "   docker-compose -f docker-compose.dev.yml logs -f  # View logs"
    echo ""
    echo "🧪 Testing:"
    echo "   cd backend && npm test                            # Run backend tests"
    echo "   cd frontend && npm test                           # Run frontend tests"
    echo "   docker-compose -f docker-compose.dev.yml exec smtp-test python3 /app/smtp-test.py"
    echo ""
    echo "🛠️ Development Tools:"
    echo "   docker-compose -f docker-compose.dev.yml --profile tools up -d  # Start with tools"
    echo ""
    echo "📚 Documentation:"
    echo "   • README.md - Project overview"
    echo "   • CONTRIBUTING.md - Development guidelines"
    echo "   • docs/ - Technical documentation"
    echo ""
}

# Main execution
main() {
    echo "🚀 UltraZend Development Environment Setup"
    echo "========================================="
    echo ""
    
    check_prerequisites
    setup_env_files
    create_directories
    setup_git_hooks
    
    if command -v npm &> /dev/null; then
        install_dependencies
    else
        log_info "Skipping npm dependencies (will be handled by Docker)"
    fi
    
    start_services
    sleep 10  # Give services time to fully initialize
    run_smtp_tests
    show_tips
    
    echo ""
    log_success "🎉 Development environment setup complete!"
    log_info "Run 'docker-compose -f docker-compose.dev.yml logs -f' to view logs"
}

# Run main function
main