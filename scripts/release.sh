#!/usr/bin/env bash
# scripts/release.sh
# Creates a new release: bumps version, generates changelog, tags git, pushes
# Usage: bash scripts/release.sh <major|minor|patch> [message]
# Examples:
#   bash scripts/release.sh patch "Fix barcode scanner on Android 14"
#   bash scripts/release.sh minor "Add family profiles feature"
#   bash scripts/release.sh major "Complete app redesign"

set -euo pipefail

BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✅  $1${NC}"; }
err()  { echo -e "${RED}  ❌  $1${NC}"; exit 1; }
info() { echo -e "${CYAN}  ℹ️   $1${NC}"; }

BUMP=${1:-patch}
MESSAGE=${2:-"Release"}

[ "$BUMP" = "major" ] || [ "$BUMP" = "minor" ] || [ "$BUMP" = "patch" ] || err "Use: major, minor, or patch"

# Get current version from package.json
CURRENT=$(node -p "require('./package.json').version")
IFS='.' read -r MAJ MIN PAT <<< "$CURRENT"

case "$BUMP" in
  major) MAJ=$((MAJ+1)); MIN=0; PAT=0 ;;
  minor) MIN=$((MIN+1)); PAT=0 ;;
  patch) PAT=$((PAT+1)) ;;
esac

NEW_VERSION="${MAJ}.${MIN}.${PAT}"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Shuddhaahar Release: v${CURRENT} → v${NEW_VERSION}${NC}${BOLD}      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# Ensure we're on staging or develop
BRANCH=$(git branch --show-current)
info "Current branch: $BRANCH"

# Ensure clean working tree
if [ -n "$(git status --porcelain)" ]; then
  err "Working tree is dirty. Commit or stash changes first."
fi

# ── Bump version in package.json ──────────────────────────────
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json'));
  pkg.version = '${NEW_VERSION}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
ok "package.json updated to v${NEW_VERSION}"

# ── Bump iOS version ──────────────────────────────────────────
if [ -f "ios/Shuddhaahar.xcodeproj/project.pbxproj" ]; then
  # Bump CFBundleShortVersionString
  sed -i.bak "s/MARKETING_VERSION = .*/MARKETING_VERSION = ${NEW_VERSION};/" \
    ios/Shuddhaahar.xcodeproj/project.pbxproj
  # Bump CFBundleVersion (build number = timestamp)
  BUILD_NUM=$(date +%Y%m%d%H%M)
  sed -i.bak "s/CURRENT_PROJECT_VERSION = .*/CURRENT_PROJECT_VERSION = ${BUILD_NUM};/" \
    ios/Shuddhaahar.xcodeproj/project.pbxproj
  rm -f ios/Shuddhaahar.xcodeproj/project.pbxproj.bak
  ok "iOS version updated to ${NEW_VERSION} (build ${BUILD_NUM})"
fi

# ── Bump Android version ──────────────────────────────────────
if [ -f "android/app/build.gradle" ]; then
  # versionName
  sed -i.bak "s/versionName \".*\"/versionName \"${NEW_VERSION}\"/" android/app/build.gradle
  # versionCode (increment by 1)
  CURRENT_CODE=$(grep "versionCode" android/app/build.gradle | grep -oE '[0-9]+' | head -1)
  NEW_CODE=$((CURRENT_CODE + 1))
  sed -i.bak "s/versionCode ${CURRENT_CODE}/versionCode ${NEW_CODE}/" android/app/build.gradle
  rm -f android/app/build.gradle.bak
  ok "Android version updated to ${NEW_VERSION} (versionCode ${NEW_CODE})"
fi

# ── Update CHANGELOG ──────────────────────────────────────────
DATE=$(date +%Y-%m-%d)
CHANGELOG_ENTRY="## [${NEW_VERSION}] — ${DATE}\n${MESSAGE}\n"

if [ -f "CHANGELOG.md" ]; then
  # Insert after first line
  sed -i.bak "1r /dev/stdin" CHANGELOG.md <<< "$(echo -e "\n${CHANGELOG_ENTRY}")" || true
  rm -f CHANGELOG.md.bak
else
  cat > CHANGELOG.md << EOF
# Shuddhaahar Changelog

## [${NEW_VERSION}] — ${DATE}
${MESSAGE}
EOF
fi
ok "CHANGELOG.md updated"

# ── Git commit + tag ──────────────────────────────────────────
git add package.json CHANGELOG.md
[ -f "ios/Shuddhaahar.xcodeproj/project.pbxproj" ] && git add ios/Shuddhaahar.xcodeproj/project.pbxproj
[ -f "android/app/build.gradle" ]                 && git add android/app/build.gradle

git commit -m "chore: bump version to v${NEW_VERSION} — ${MESSAGE}"
ok "Committed version bump"

git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}: ${MESSAGE}"
ok "Tagged v${NEW_VERSION}"

# ── Push ──────────────────────────────────────────────────────
info "Pushing to origin/${BRANCH}..."
git push origin "$BRANCH"
git push origin "v${NEW_VERSION}"
ok "Pushed to origin"

echo ""
echo -e "${BOLD}${GREEN}  Release v${NEW_VERSION} ready!${NC}"
echo ""
info "Next steps:"
info "  To deploy to staging:    git push origin ${BRANCH}:staging"
info "  To deploy to production: git push origin ${BRANCH}:main"
info "  (CI will automatically build and deploy)"
echo ""
