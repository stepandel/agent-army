#!/usr/bin/env bash
#
# deploy.sh - Deploy the Agent Army stack with prerequisite checks
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Deploy the Agent Army Pulumi stack with prerequisite validation.

Options:
    -s, --stack STACK   Pulumi stack name (default: dev)
    -y, --yes           Skip confirmation prompt
    -h, --help          Show this help message

Examples:
    $(basename "$0")              # Deploy to 'dev' stack with prompts
    $(basename "$0") -s prod      # Deploy to 'prod' stack
    $(basename "$0") -y           # Deploy without confirmation
EOF
    exit 0
}

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

check_command() {
    local cmd=$1
    local install_hint=$2
    
    if command -v "$cmd" &> /dev/null; then
        log_success "$cmd found: $(command -v "$cmd")"
        return 0
    else
        log_error "$cmd not found. $install_hint"
        return 1
    fi
}

check_node_version() {
    local required_major=18
    local node_version
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found. Install from https://nodejs.org/"
        return 1
    fi
    
    node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    
    if [ "$node_version" -ge "$required_major" ]; then
        log_success "Node.js version: $(node -v) (>= v${required_major} required)"
        return 0
    else
        log_error "Node.js version $(node -v) is too old. Requires v${required_major}+"
        return 1
    fi
}

check_aws_credentials() {
    log_info "Checking AWS credentials..."

    if aws sts get-caller-identity &> /dev/null; then
        local account_id
        account_id=$(aws sts get-caller-identity --query Account --output text)
        log_success "AWS credentials valid (Account: $account_id)"
        return 0
    else
        log_error "AWS credentials not configured or invalid"
        log_info "Configure with: aws configure"
        return 1
    fi
}

check_hetzner_credentials() {
    log_info "Checking Hetzner Cloud credentials..."

    # Check for HCLOUD_TOKEN env var or Pulumi config
    if [ -n "${HCLOUD_TOKEN:-}" ]; then
        log_success "Hetzner Cloud token found (via HCLOUD_TOKEN)"
        return 0
    fi

    # Try to get from Pulumi config (if stack exists and is selected)
    # Note: This may fail if no stack is selected yet, which is fine
    if pulumi stack 2>/dev/null | grep -q "Current stack"; then
        local hcloud_token
        hcloud_token=$(pulumi config get hcloudToken 2>/dev/null || echo "")
        if [ -n "$hcloud_token" ]; then
            log_success "Hetzner Cloud token found (via Pulumi config)"
            return 0
        fi
    fi

    log_error "Hetzner Cloud token not configured"
    log_info "Set via: pulumi config set --secret hcloudToken <token>"
    log_info "Or via: export HCLOUD_TOKEN=<token>"
    return 1
}

detect_provider() {
    # Detect which cloud provider is configured
    # Priority: explicit config > available credentials

    local provider
    provider=$(pulumi config get provider 2>/dev/null || echo "")

    if [ -n "$provider" ]; then
        echo "$provider"
        return
    fi

    # Auto-detect based on available credentials
    local has_aws=false
    local has_hetzner=false

    if aws sts get-caller-identity &> /dev/null 2>&1; then
        has_aws=true
    fi

    if [ -n "${HCLOUD_TOKEN:-}" ] || pulumi config get hcloudToken &>/dev/null 2>&1; then
        has_hetzner=true
    fi

    if [ "$has_hetzner" = true ] && [ "$has_aws" = false ]; then
        echo "hetzner"
    elif [ "$has_aws" = true ]; then
        echo "aws"
    else
        echo "unknown"
    fi
}

check_pulumi_logged_in() {
    log_info "Checking Pulumi login status..."
    
    if pulumi whoami &> /dev/null; then
        local user
        user=$(pulumi whoami)
        log_success "Pulumi logged in as: $user"
        return 0
    else
        log_error "Not logged in to Pulumi"
        log_info "Login with: pulumi login"
        return 1
    fi
}

# Parse arguments
STACK="dev"
SKIP_CONFIRM=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--stack)
            STACK="$2"
            shift 2
            ;;
        -y|--yes)
            SKIP_CONFIRM=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Header
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           🦞 Agent Army - Deployment Script               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Prerequisite checks
log_info "Checking prerequisites..."
echo ""

PREREQS_OK=true

check_command "pulumi" "Install from https://www.pulumi.com/docs/iac/download-install/" || PREREQS_OK=false
check_node_version || PREREQS_OK=false
check_command "npm" "Install with Node.js from https://nodejs.org/" || PREREQS_OK=false

echo ""

check_pulumi_logged_in || PREREQS_OK=false

# Detect and validate provider-specific credentials
echo ""
log_info "Detecting cloud provider..."

PROVIDER=$(detect_provider)

case "$PROVIDER" in
    aws)
        log_info "Provider: AWS"
        check_command "aws" "Install from https://aws.amazon.com/cli/" || PREREQS_OK=false
        check_aws_credentials || PREREQS_OK=false
        ;;
    hetzner)
        log_info "Provider: Hetzner Cloud"
        check_hetzner_credentials || PREREQS_OK=false
        ;;
    *)
        log_warn "Could not detect cloud provider"
        log_info "Checking for available credentials..."
        # Try AWS first, then Hetzner
        if command -v aws &> /dev/null && aws sts get-caller-identity &> /dev/null 2>&1; then
            log_info "AWS credentials detected"
            check_aws_credentials || PREREQS_OK=false
        elif [ -n "${HCLOUD_TOKEN:-}" ] || (pulumi stack 2>/dev/null | grep -q "Current stack" && pulumi config get hcloudToken 2>/dev/null | grep -q .); then
            log_info "Hetzner Cloud token detected"
            check_hetzner_credentials || PREREQS_OK=false
        else
            log_error "No cloud provider credentials found"
            log_info "Configure AWS: aws configure"
            log_info "Configure Hetzner: export HCLOUD_TOKEN=<token>"
            PREREQS_OK=false
        fi
        ;;
esac

echo ""

if [ "$PREREQS_OK" = false ]; then
    log_error "Prerequisite checks failed. Please fix the issues above and retry."
    exit 1
fi

log_success "All prerequisites satisfied!"
echo ""

# Change to project directory
cd "$PROJECT_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    log_info "Installing npm dependencies..."
    npm install
    echo ""
fi

# Select stack
log_info "Selecting stack: $STACK"
pulumi stack select "$STACK" 2>/dev/null || pulumi stack init "$STACK"
echo ""

# Confirmation prompt
if [ "$SKIP_CONFIRM" = false ]; then
    case "$PROVIDER" in
        hetzner)
            echo -e "${YELLOW}This will deploy 3 Hetzner Cloud servers (CX21 each).${NC}"
            echo -e "${YELLOW}Estimated monthly cost: ~€16-20 EUR (~\$18-22 USD)${NC}"
            ;;
        *)
            echo -e "${YELLOW}This will deploy 3 EC2 instances to AWS (t3.medium each).${NC}"
            echo -e "${YELLOW}Estimated monthly cost: ~\$100 USD${NC}"
            ;;
    esac
    echo ""
    read -p "Continue with deployment? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Deployment cancelled."
        exit 0
    fi
fi

# Deploy
echo ""
log_info "Starting Pulumi deployment..."
echo ""

pulumi up

echo ""
log_success "Deployment complete!"
echo ""
log_info "Agents will be ready in 3-5 minutes (cloud-init setup)."
log_info "Validate with: ./scripts/validate.sh"
