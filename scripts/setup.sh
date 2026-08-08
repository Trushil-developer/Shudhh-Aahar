#!/usr/bin/env bash
# scripts/setup.sh
# ═══════════════════════════════════════════════════════════════
# Shuddhaahar — Master Setup Script
# Run this ONCE on a new machine to get fully set up
# Usage: bash scripts/setup.sh [dev|staging|prod]
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}  ✅  $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠️   $1${NC}"; }
err()  { echo -e "${RED}  ❌  $1${NC}"; exit 1; }
info() { echo -e "${CYAN}  ℹ️   $1${NC}"; }
step() { echo -e "\n${BOLD}${BLUE}── $1 ─────────────────────────────────${NC}"; }

ENV=${1:-dev}
case "$ENV" in
  dev|development)   ENV=development ;;
  staging)           ENV=staging ;;
  prod|production)   ENV=production ;;
  *) err "Unknown environment: $ENV. Use: dev, staging, or prod" ;;
esac

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Shuddhaahar Setup — ${ENV^^} Environment        ${NC}${BOLD}║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── System requirements check ─────────────────────────────────
step "1. Checking system requirements"

check_cmd() {
  if command -v "$1" &>/dev/null; then
    ok "$1 found: $(command -v $1)"
  else
    err "$1 not found. Install it first: $2"
  fi
}

check_version() {
  local cmd=$1 min=$2 current flag=${4:---version}
  current=$($cmd $flag 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1 || echo "0.0")
  ok "$cmd $current"
}

check_cmd "node"   "https://nodejs.org (use nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash)"
check_cmd "npm"    "comes with Node.js"
check_cmd "git"    "https://git-scm.com"

NODE_VER=$(node -e "console.log(process.version)" | grep -oE '[0-9]+' | head -1)
if [ "$NODE_VER" -lt 18 ]; then
  err "Node.js 18+ required (you have $(node --version)). Run: nvm install 20 && nvm use 20"
fi
ok "Node.js version OK: $(node --version)"

if [[ "$OSTYPE" == "darwin"* ]]; then
  check_cmd "xcodebuild" "Install Xcode from App Store"
  check_cmd "pod"        "Install CocoaPods: sudo gem install cocoapods"
  check_cmd "ruby"       "Install Ruby: brew install ruby"
  check_cmd "brew"       "Install Homebrew: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  ok "macOS detected — iOS builds available"
else
  warn "Linux/Windows detected — iOS builds require a Mac"
fi

check_cmd "java"       "Install JDK 17: brew install openjdk@17 (Mac) or apt install openjdk-17-jdk (Linux)"
JAVA_VER=$(java -version 2>&1 | grep -oE '[0-9]+' | head -1)
if [ "$JAVA_VER" -lt 17 ]; then
  warn "Java 17+ recommended for Android builds (you have Java $JAVA_VER)"
fi

# ── Git setup ─────────────────────────────────────────────────
step "2. Git setup"

if [ ! -d ".git" ]; then
  git init
  ok "Git repository initialised"
else
  ok "Git repository already exists"
fi

# Set up git config if not already set
if [ -z "$(git config user.email 2>/dev/null)" ]; then
  read -p "  Enter your git email: " GIT_EMAIL
  read -p "  Enter your git name: " GIT_NAME
  git config user.email "$GIT_EMAIL"
  git config user.name "$GIT_NAME"
  ok "Git user configured"
fi

# Create branch strategy
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [ -z "$CURRENT_BRANCH" ]; then
  git checkout -b develop
  ok "Created develop branch"
fi

# Set up branch protection reminder
info "Branch strategy:"
info "  develop  → development builds (CI tests only)"
info "  staging  → TestFlight + Play internal track"
info "  main     → App Store + Play Store production"

# Create initial commit if needed
if [ -z "$(git log --oneline 2>/dev/null)" ]; then
  git add -A
  git commit -m "🚀 Initial Shuddhaahar commit" || true
  ok "Initial commit created"
fi

# ── Environment files ─────────────────────────────────────────
step "3. Environment configuration"

ENV_FILE=".env.${ENV}.local"

if [ -f "$ENV_FILE" ]; then
  warn "$ENV_FILE already exists — skipping creation"
else
  cp ".env.${ENV}" "$ENV_FILE"
  ok "Created $ENV_FILE from template"
  warn "IMPORTANT: Edit $ENV_FILE and fill in your real API keys"
  info "Keys you need to set:"
  info "  • DEV_ANTHROPIC_API_KEY   — from console.anthropic.com"
  info "  • DEV_COGNITO_USER_POOL_ID — from AWS Console after amplify push"
  info "  • DEV_COGNITO_CLIENT_ID    — from AWS Console"
  info "  • DEV_STRIPE_PUBLISHABLE_KEY — from dashboard.stripe.com (TEST key)"
  info "  • DEV_TROLLEY_API_KEY      — from dev.trolley.co.uk (free)"
fi

# Verify .gitignore excludes secrets
if grep -q "\.env\..*\.local" .gitignore; then
  ok ".env.*.local files are git-ignored"
else
  echo ".env.*.local" >> .gitignore
  ok "Added .env.*.local to .gitignore"
fi

# ── Node dependencies ─────────────────────────────────────────
step "4. Installing Node dependencies"

if [ -f "package-lock.json" ]; then
  npm ci
elif [ -f "yarn.lock" ]; then
  yarn install --frozen-lockfile
else
  npm install
fi
ok "Node dependencies installed"

# ── iOS setup ─────────────────────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
  step "5. iOS setup"

  if [ -d "ios" ]; then
    cd ios
    pod install --repo-update
    ok "CocoaPods installed"

    # Install Fastlane if not present
    if ! command -v fastlane &>/dev/null; then
      gem install fastlane --no-document
      ok "Fastlane installed"
    else
      ok "Fastlane already installed"
    fi

    # Install Fastlane plugins
    if [ -f "Gemfile" ]; then
      bundle install
      ok "Fastlane gems installed"
    fi

    cd ..
  else
    warn "ios/ directory not found — run 'npx react-native init' first"
  fi
else
  step "5. iOS setup (skipped on non-Mac)"
  warn "Run on macOS to set up iOS builds"
fi

# ── Android setup ─────────────────────────────────────────────
step "6. Android setup"

if [ -d "android" ]; then
  if [ -z "${ANDROID_HOME:-}" ]; then
    warn "ANDROID_HOME not set. Add to your shell profile:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      info "  export ANDROID_HOME=\$HOME/Library/Android/sdk"
      info "  export PATH=\$PATH:\$ANDROID_HOME/emulator:\$ANDROID_HOME/platform-tools"
    else
      info "  export ANDROID_HOME=\$HOME/Android/Sdk"
      info "  export PATH=\$PATH:\$ANDROID_HOME/emulator:\$ANDROID_HOME/platform-tools"
    fi
  else
    ok "ANDROID_HOME set: $ANDROID_HOME"
  fi

  # Make gradlew executable
  chmod +x android/gradlew
  ok "Android gradlew made executable"

  # Android Fastlane
  cd android
  if ! command -v fastlane &>/dev/null; then
    warn "Fastlane not found — install with: gem install fastlane"
  else
    ok "Fastlane available for Android"
  fi
  cd ..
else
  warn "android/ directory not found"
fi

# ── AWS Amplify setup ─────────────────────────────────────────
step "7. AWS Amplify"

if command -v amplify &>/dev/null; then
  ok "Amplify CLI found: $(amplify --version)"
else
  warn "Amplify CLI not installed. Installing..."
  npm install -g @aws-amplify/cli
  ok "Amplify CLI installed"
fi

if [ ! -f "amplify/.config/project-config.json" ]; then
  warn "Amplify not initialised. Run the following:"
  info "  amplify configure          # set up AWS credentials"
  info "  amplify init               # initialise project"
  info "  amplify add auth           # add Cognito"
  info "  amplify add api            # add DynamoDB"
  info "  amplify push               # deploy to AWS"
  info "  (Then copy values to your .env.${ENV}.local file)"
else
  ok "Amplify already initialised"
fi

# ── TypeScript check ──────────────────────────────────────────
step "8. TypeScript validation"

npx tsc --noEmit --skipLibCheck && ok "TypeScript: 0 errors" || err "TypeScript errors found — fix before building"

# ── Run tests ─────────────────────────────────────────────────
step "9. Test suite"

SHUDDHAAHAR_ENV=$ENV npx jest --config jest.config.json --passWithNoTests 2>&1 | tail -5
ok "Tests completed"

# ── Done ──────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║          ✅  Setup Complete!                      ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo -e "  1. Fill in ${CYAN}.env.${ENV}.local${NC} with your real API keys"
echo -e "  2. Run ${CYAN}amplify push${NC} to deploy AWS backend"
echo -e "  3. ${CYAN}npm run ios${NC}     → run on iOS simulator"
echo -e "  4. ${CYAN}npm run android${NC} → run on Android emulator"
echo ""
echo -e "${BOLD}When ready to deploy:${NC}"
echo -e "  Staging:    ${CYAN}git push origin staging${NC}   → TestFlight + Play Internal"
echo -e "  Production: ${CYAN}git push origin main${NC}      → App Store + Play Store"
echo ""
