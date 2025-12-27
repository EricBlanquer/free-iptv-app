#!/bin/bash
# Tizen Studio reset and rebuild script
# Automates: TV restart, cache clear, Tizen restart, build

set -e

TIZEN_STUDIO="$HOME/tizen-studio"
SDB="$TIZEN_STUDIO/tools/sdb"
TIZEN_CLI="$TIZEN_STUDIO/tools/ide/bin/tizen"
PROJECT_DIR="$HOME/free-iptv-app"
WORKSPACE="$HOME/workspace-tizen"
TV_IP="${TV_IP:-192.168.1.241}"  # Default IP, override with TV_IP env var

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[*]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; }

# Step 1: Clear Tizen build cache
clear_cache() {
    log "Clearing Tizen build cache..."
    rm -f "$PROJECT_DIR"/*.wgt
    rm -rf "$PROJECT_DIR/.buildResult"
    find "$WORKSPACE/.metadata/.plugins/org.eclipse.debug.core/.launches" -name "*.launch" -delete 2>/dev/null || true
    rm -rf "$WORKSPACE/.metadata/.plugins/org.tizen.web.launch" 2>/dev/null || true
    # Reconnect sdb
    "$SDB" kill-server 2>/dev/null || true
    "$SDB" connect "$TV_IP" 2>/dev/null || true
    log "Cache cleared + sdb reconnected"
}

# Step 2: Kill Tizen Studio
kill_tizen() {
    log "Killing Tizen Studio..."
    pkill -f "tizen-studio/ide/eclipse" 2>/dev/null || true
    sleep 2
    # Force kill if still running
    pkill -9 -f "tizen-studio/ide/eclipse" 2>/dev/null || true
    log "Tizen Studio killed"
}

# Step 3: Connect to TV and uninstall app
reset_tv_app() {
    log "Connecting to TV at $TV_IP..."
    "$SDB" connect "$TV_IP" || { warn "Could not connect to TV"; return 1; }
    sleep 2

    log "Uninstalling app from TV..."
    "$SDB" -s "$TV_IP:26101" uninstall FreeIPTVAp 2>&1 || {
        warn "Uninstall failed (app might not be installed)"
    }

    log "App uninstalled - will be reinstalled on next Run"
}

# Step 4: Start Tizen Studio
start_tizen() {
    log "Starting Tizen Studio..."
    nohup "$TIZEN_STUDIO/ide/eclipse" -data "$WORKSPACE" > /dev/null 2>&1 &
    log "Tizen Studio started (PID: $!)"
}

# Step 5: Build app (twice because first build fails with NPE)
build_app() {
    log "Building app (attempt 1 - expected to fail)..."
    "$TIZEN_CLI" build-web -- "$PROJECT_DIR" 2>&1 || true

    sleep 2

    log "Building app (attempt 2)..."
    if "$TIZEN_CLI" build-web -- "$PROJECT_DIR" 2>&1; then
        log "Build successful!"
    else
        error "Build failed on second attempt"
        return 1
    fi
}

# Main
main() {
    echo "======================================"
    echo "  Tizen Studio Reset & Rebuild"
    echo "======================================"

    case "${1:-all}" in
        cache)
            clear_cache
            ;;
        kill)
            kill_tizen
            ;;
        tv)
            reset_tv_app
            ;;
        start)
            start_tizen
            ;;
        build)
            build_app
            ;;
        quick)
            # Quick reset: cache + kill + start
            clear_cache
            kill_tizen
            start_tizen
            ;;
        all)
            # Full reset: everything
            clear_cache
            kill_tizen
            reset_tv_app || warn "TV reset skipped"
            start_tizen
            build_app
            ;;
        *)
            echo "Usage: $0 [cache|kill|tv|start|build|quick|all]"
            echo ""
            echo "  cache  - Clear Tizen build cache only"
            echo "  kill   - Kill Tizen Studio"
            echo "  tv     - Uninstall app from TV via sdb"
            echo "  start  - Start Tizen Studio"
            echo "  build  - Build app (runs twice)"
            echo "  quick  - cache + kill + start (no TV restart)"
            echo "  all    - Full reset (default)"
            exit 1
            ;;
    esac

    log "Done!"
}

main "$@"
