#!/usr/bin/env bash
# scripts/build.sh
# Build Shuddhaahar for a specific environment and platform
# Usage: bash scripts/build.sh <env> <platform>
# Examples:
#   bash scripts/build.sh dev ios
#   bash scripts/build.sh staging android
#   bash scripts/build.sh prod ios

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✅  $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠️   $1${NC}"; }
err()  { echo -e "${RED}  ❌  $1${NC}"; exit 1; }
info() { echo -e "${CYAN}  ℹ️   $1${NC}"; }
step() { echo -e "\n${BOLD}${BLUE}── $1${NC}"; }

ENV=${1:-dev}
PLATFORM=${2:-ios}

case "$ENV" in
  dev|development) ENV=development ;;
  staging)         ENV=staging ;;
  prod|production) ENV=production ;;
  *) err "Unknown env: $ENV. Use dev, staging, or prod" ;;
esac

case "$PLATFORM" in
  ios|android) ;;
  *) err "Unknown platform: $PLATFORM. Use ios or android" ;;
esac

ENV_UPPER=$(echo "$ENV" | tr '[:lower:]' '[:upper:]')
PLATFORM_UPPER=$(echo "$PLATFORM" | tr '[:lower:]' '[:upper:]')

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Shuddhaahar Build: ${ENV_UPPER} / ${PLATFORM_UPPER}${NC}${BOLD}             ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# Load env file
ENV_FILE=".env.${ENV}.local"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
  ok "Loaded $ENV_FILE"
else
  warn "$ENV_FILE not found — using template defaults"
  ENV_FILE=".env.${ENV}"
  set -a; source "$ENV_FILE"; set +a
fi

export SHUDDHAAHAR_ENV=$ENV

step "TypeScript check"
npx tsc --noEmit --skipLibCheck && ok "TypeScript OK" || err "Fix TypeScript errors before building"

step "Tests"
npx jest --config jest.config.json --passWithNoTests --silent && ok "Tests passed"

if [ "$PLATFORM" = "ios" ]; then
  step "iOS Build ($ENV)"

  if [[ "$OSTYPE" != "darwin"* ]]; then
    err "iOS builds require macOS"
  fi

  cd ios
  pod install --repo-update
  ok "CocoaPods updated"

  if [ "$ENV" = "development" ]; then
    info "Building for iOS Simulator..."
    # Only one scheme ("Shuddhaahar") actually exists in the Xcode project —
    # there's no ShuddhaaharDev/Staging/Production scheme per environment,
    # despite what the docs/Fastfile assume. Piping through xcpretty (if
    # present) is cosmetic only — PIPESTATUS[0] is checked explicitly so a
    # real xcodebuild failure isn't masked into a false "success".
    if command -v xcpretty &>/dev/null; then
      xcodebuild build \
        -workspace Shuddhaahar.xcworkspace \
        -scheme "Shuddhaahar" \
        -configuration Debug \
        -destination 'generic/platform=iOS Simulator' \
        -derivedDataPath build \
        CODE_SIGNING_ALLOWED=NO \
        | xcpretty
      BUILD_STATUS=${PIPESTATUS[0]}
    else
      xcodebuild build \
        -workspace Shuddhaahar.xcworkspace \
        -scheme "Shuddhaahar" \
        -configuration Debug \
        -destination 'generic/platform=iOS Simulator' \
        -derivedDataPath build \
        CODE_SIGNING_ALLOWED=NO
      BUILD_STATUS=$?
    fi
    [ "$BUILD_STATUS" -eq 0 ] || err "iOS build failed"
    ok "iOS Dev build complete — open simulator to run"

  elif [ "$ENV" = "staging" ]; then
    info "Building for TestFlight..."
    bundle exec fastlane staging
    ok "Staging uploaded to TestFlight"

  elif [ "$ENV" = "production" ]; then
    warn "Production build will submit to App Store review"
    read -p "  Are you sure? (yes/no): " CONFIRM
    [ "$CONFIRM" = "yes" ] || { warn "Cancelled"; exit 0; }
    bundle exec fastlane production
    ok "Production submitted to App Store"
  fi
  cd ..

elif [ "$PLATFORM" = "android" ]; then
  step "Android Build ($ENV)"

  if [ -z "${ANDROID_HOME:-}" ]; then
    err "ANDROID_HOME not set. Export it in your shell profile."
  fi

  cd android
  chmod +x gradlew

  if [ "$ENV" = "development" ]; then
    info "Building debug APK..."
    ./gradlew assembleDebug
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
    ok "Debug APK built: $APK_PATH"
    if command -v adb &>/dev/null; then
      DEVICES=$(adb devices | grep -v "List of devices" | grep "device$" | wc -l)
      if [ "$DEVICES" -gt 0 ]; then
        adb install -r "$APK_PATH"
        ok "APK installed on connected device"
      fi
    fi

  elif [ "$ENV" = "staging" ]; then
    info "Building release AAB for Play Internal Track..."
    ./gradlew bundleRelease \
      -Pandroid.injected.signing.store.file="${ANDROID_KEYSTORE_PATH:-release.keystore}" \
      -Pandroid.injected.signing.store.password="${ANDROID_STORE_PASSWORD:-}" \
      -Pandroid.injected.signing.key.alias="${ANDROID_KEY_ALIAS:-}" \
      -Pandroid.injected.signing.key.password="${ANDROID_KEY_PASSWORD:-}"
    bundle exec fastlane staging
    ok "Staging uploaded to Play Internal Track"

  elif [ "$ENV" = "production" ]; then
    warn "Production build will submit to Play Store"
    read -p "  Are you sure? (yes/no): " CONFIRM
    [ "$CONFIRM" = "yes" ] || { warn "Cancelled"; exit 0; }
    ./gradlew bundleRelease \
      -Pandroid.injected.signing.store.file="${ANDROID_KEYSTORE_PATH:-release.keystore}" \
      -Pandroid.injected.signing.store.password="${ANDROID_STORE_PASSWORD:-}" \
      -Pandroid.injected.signing.key.alias="${ANDROID_KEY_ALIAS:-}" \
      -Pandroid.injected.signing.key.password="${ANDROID_KEY_PASSWORD:-}"
    bundle exec fastlane production
    ok "Production uploaded to Play Store (10% staged rollout)"
  fi
  cd ..
fi

echo ""
echo -e "${BOLD}${GREEN}  Build complete — ${ENV} / ${PLATFORM} ✓${NC}"
echo ""
