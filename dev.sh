#!/bin/bash

# ZeroedIn Development Script
# Manages all three services (web, api, harvester)

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# PID file locations
PIDS_DIR="$PROJECT_ROOT/.pids"
mkdir -p "$PIDS_DIR"

print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  ZeroedIn Development Manager${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

check_dependencies() {
    print_info "Checking dependencies..."

    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm not found. Please install pnpm first."
        exit 1
    fi

    # Check if node_modules exists
    if [ ! -d "$PROJECT_ROOT/node_modules" ] || [ ! -d "$PROJECT_ROOT/apps/web/node_modules" ]; then
        print_info "node_modules not found. Installing dependencies..."
        cd "$PROJECT_ROOT"
        pnpm install
        print_success "Dependencies installed"
    fi

    if ! command -v redis-cli &> /dev/null; then
        print_error "redis-cli not found. Please install Redis."
        exit 1
    fi

    if ! redis-cli ping &> /dev/null; then
        print_error "Redis is not running. Start it with: sudo service redis-server start"
        exit 1
    fi

    print_success "All dependencies available"
}

start_service() {
    local service=$1
    local port=$2
    local cmd=$3
    local dir=$4
    local pid_file="$PIDS_DIR/$service.pid"
    local log_file="$PIDS_DIR/$service.log"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            print_info "$service already running (PID: $pid)"
            return
        fi
    fi

    print_info "Starting $service on port $port..."
    cd "$PROJECT_ROOT/$dir"

    # Start process in background and capture PID
    $cmd > "$log_file" 2>&1 &
    local pid=$!
    echo $pid > "$pid_file"

    # Wait a moment and check if process is still running
    sleep 2
    if ps -p "$pid" > /dev/null 2>&1; then
        print_success "$service started (PID: $pid, Log: $log_file)"
    else
        print_error "$service failed to start. Check log: $log_file"
        rm -f "$pid_file"
    fi

    cd "$PROJECT_ROOT"
}

stop_service() {
    local service=$1
    local pid_file="$PIDS_DIR/$service.pid"

    if [ ! -f "$pid_file" ]; then
        print_info "$service is not running"
        return
    fi

    local pid=$(cat "$pid_file")
    if ps -p "$pid" > /dev/null 2>&1; then
        print_info "Stopping $service (PID: $pid)..."
        kill "$pid" 2>/dev/null || true
        sleep 1

        # Force kill if still running
        if ps -p "$pid" > /dev/null 2>&1; then
            kill -9 "$pid" 2>/dev/null || true
        fi

        print_success "$service stopped"
    else
        print_info "$service was not running"
    fi

    rm -f "$pid_file"
}

start_all() {
    print_header
    check_dependencies

    echo ""
    print_info "Starting all services..."
    echo ""

    start_service "harvester" "N/A" "pnpm worker" "apps/harvester"
    start_service "api" "8000" "pnpm dev" "apps/api"
    start_service "web" "3000" "pnpm dev" "apps/web"

    echo ""
    print_success "All services started!"
    echo ""
    echo -e "  ${GREEN}Frontend:${NC}      http://localhost:3000"
    echo -e "  ${GREEN}Admin Console:${NC} http://localhost:3000/admin"
    echo -e "  ${GREEN}API:${NC}           http://localhost:8000"
    echo ""
    print_info "View logs: tail -f .pids/*.log"
    print_info "Stop all: ./dev.sh stop"
}

stop_all() {
    print_header
    echo ""
    print_info "Stopping all services..."
    echo ""

    stop_service "web"
    stop_service "api"
    stop_service "harvester"

    echo ""
    print_success "All services stopped"
}

show_status() {
    print_header
    echo ""

    for service in harvester api web; do
        local pid_file="$PIDS_DIR/$service.pid"

        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            if ps -p "$pid" > /dev/null 2>&1; then
                print_success "$service is running (PID: $pid)"
            else
                print_error "$service is not running (stale PID file)"
            fi
        else
            print_error "$service is not running"
        fi
    done

    echo ""
}

show_logs() {
    local service=$1
    local log_file="$PIDS_DIR/$service.log"

    if [ ! -f "$log_file" ]; then
        print_error "No log file found for $service"
        exit 1
    fi

    tail -f "$log_file"
}

db_operations() {
    cd "$PROJECT_ROOT/packages/db"

    case $1 in
        generate)
            print_info "Generating Prisma client..."
            pnpm db:generate
            print_success "Prisma client generated"
            ;;
        migrate)
            print_info "Running migrations..."
            pnpm db:migrate
            print_success "Migrations complete"
            ;;
        studio)
            print_info "Opening Prisma Studio..."
            pnpm db:studio
            ;;
        seed)
            print_info "Seeding database..."
            pnpm db:seed
            pnpm db:seed-source
            print_success "Database seeded"
            ;;
        *)
            print_error "Unknown database operation: $1"
            echo "Available: generate, migrate, studio, seed"
            exit 1
            ;;
    esac
}

show_usage() {
    print_header
    echo ""
    echo "Usage: ./dev.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start              Start all services (web, api, harvester)"
    echo "  stop               Stop all services"
    echo "  restart            Restart all services"
    echo "  status             Show status of all services"
    echo "  logs [service]     Show logs for service (web|api|harvester)"
    echo ""
    echo "  web                Start only web service"
    echo "  api                Start only api service"
    echo "  harvester          Start only harvester service"
    echo ""
    echo "  db:generate        Generate Prisma client"
    echo "  db:migrate         Run database migrations"
    echo "  db:studio          Open Prisma Studio"
    echo "  db:seed            Seed database with test data"
    echo ""
    echo "Examples:"
    echo "  ./dev.sh start            # Start all services"
    echo "  ./dev.sh logs api         # View API logs"
    echo "  ./dev.sh db:migrate       # Run migrations"
    echo ""
}

# Main command handling
case ${1:-} in
    start)
        start_all
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 1
        start_all
        ;;
    status)
        show_status
        ;;
    logs)
        if [ -z "${2:-}" ]; then
            print_error "Please specify service: web, api, or harvester"
            exit 1
        fi
        show_logs "$2"
        ;;
    web)
        check_dependencies
        start_service "web" "3000" "pnpm dev" "apps/web"
        ;;
    api)
        check_dependencies
        start_service "api" "8000" "pnpm dev" "apps/api"
        ;;
    harvester)
        check_dependencies
        start_service "harvester" "N/A" "pnpm worker" "apps/harvester"
        ;;
    db:*)
        db_operations "${1#db:}"
        ;;
    *)
        show_usage
        ;;
esac
