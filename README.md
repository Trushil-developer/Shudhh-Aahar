# ✚ Shuddh Aahar — Clinical Nutrition Intelligence

> Personalised AI health analysis for every UK supermarket product

## Overview

Shuddh Aahar is a React Native app (iOS + Android) that gives users a personalised health verdict on any scanned product — powered by Claude AI, clinically-grounded nutritional guidance, and real-time UK supermarket price comparison.

---

## Documentation

Full technical documentation (architecture, screens, services, backend infra, build/deploy,
known issues) lives in [docs/](docs/README.md).

## Environments

| Environment | Bundle ID | Branch | Destination |
|---|---|---|---|
| **Development** | `com.shuddhaahar.dev` | `develop` | Simulator / local device |
| **Staging** | `com.shuddhaahar.staging` | `staging` | TestFlight · Play Internal Track |
| **Production** | `com.shuddhaahar` | `main` | App Store · Google Play |

---

## Quick Start

### First-time setup (new machine)
```bash
git clone https://github.com/your-org/shuddhaahar.git
cd shuddhaahar
bash scripts/setup.sh dev
```

The setup script will:
- Check all system requirements (Node, Xcode, Android SDK, Java, Ruby)
- Install all Node dependencies
- Install CocoaPods (iOS)
- Create your `.env.development.local` file
- Run TypeScript check and test suite
- Guide you through AWS Amplify setup

### Daily development
```bash
npm run ios               # iOS simulator (development)
npm run android           # Android emulator (development)
npm test                  # Run test suite
npm run typecheck         # TypeScript check
```

---

## Environment Setup

1. Copy the template env file:
```bash
cp .env.development .env.development.local
```

2. Fill in your real keys in `.env.development.local`:
| Key | Where to get it |
|---|---|
| `DEV_ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `DEV_COGNITO_USER_POOL_ID` | AWS Console → Cognito (after `amplify push`) |
| `DEV_COGNITO_CLIENT_ID` | AWS Console → Cognito |
| `DEV_STRIPE_PUBLISHABLE_KEY` | [dashboard.stripe.com](https://dashboard.stripe.com) (use **test** key) |
| `DEV_TROLLEY_API_KEY` | [dev.trolley.co.uk](https://dev.trolley.co.uk) (free) |

3. Set up AWS backend:
```bash
npm install -g @aws-amplify/cli
amplify configure    # sign in to AWS
amplify init
amplify add auth     # Cognito + Google Sign-In
amplify add api      # DynamoDB
amplify push         # deploy — copies values to aws-exports.js
```

---

## Deployment

### Staging (TestFlight + Play Internal Track)
```bash
git push origin develop:staging
# CI automatically builds and uploads
```

### Production (App Store + Google Play)
```bash
# First: test on staging, get sign-off
git push origin staging:main
# CI requires manual approval in GitHub → then builds and submits
```

### Manual build
```bash
npm run build:staging:ios      # TestFlight
npm run build:staging:android  # Play Internal Track
npm run build:prod:ios         # App Store
npm run build:prod:android     # Play Store
```

---

## Release Process

```bash
# Patch (bug fix): 1.0.0 → 1.0.1
npm run release:patch "Fix scanner crash on iPhone SE"

# Minor (new feature): 1.0.1 → 1.1.0
npm run release:minor "Add family profiles feature"

# Major (breaking change): 1.1.0 → 2.0.0
npm run release:major "Complete app redesign"
```

This automatically:
- Bumps version in `package.json`, iOS `.pbxproj`, Android `build.gradle`
- Updates `CHANGELOG.md`
- Commits and tags in git
- Pushes to origin

---

## CI/CD Pipeline

```
develop push  → 🧪 Tests + TypeScript check
                🍎 iOS simulator build (dev)

staging push  → 🧪 Tests
                🍎 iOS → TestFlight
                🤖 Android → Play Internal Track

main push     → 🧪 Tests
                ⏸ Manual approval required (GitHub environment)
                🍎 iOS → App Store (draft)
                🤖 Android → Play Store (10% rollout, draft)
```

All CI/CD secrets are managed in **GitHub → Settings → Secrets and Variables**. See [CI/CD Setup](#cicd-secrets) below.

---

## App Store Setup

### iOS (Apple)

1. **Apple Developer Account** — [developer.apple.com](https://developer.apple.com) (£99/year)
2. Create **3 App IDs**:
   - `com.shuddhaahar.dev`
   - `com.shuddhaahar.staging`
   - `com.shuddhaahar`
3. **Capabilities** to enable on each App ID:
   - Sign In with Apple
   - HealthKit
   - In-App Purchase
   - Push Notifications
4. Create **App Store Connect app**: `com.shuddhaahar`
5. Create **App Store Connect API key** (for Fastlane):
   - Go to App Store Connect → Users → Keys → Generate
   - Download `.p8` file, note Key ID and Issuer ID
6. Create **Distribution Certificate** + **Provisioning Profiles** (3 — one per environment)
7. Set up **In-App Purchases** in App Store Connect:

| Product ID | Type | Price |
|---|---|---|
| `com.shuddhaahar.pro.monthly` | Auto-renewable | £4.99/month |
| `com.shuddhaahar.pro.annual` | Auto-renewable | £47.88/year |
| `com.shuddhaahar.max.monthly` | Auto-renewable | £9.99/month |
| `com.shuddhaahar.max.annual` | Auto-renewable | £95.88/year |

### Android (Google)

1. **Google Play Developer Account** — [play.google.com/console](https://play.google.com/console) (£25 one-time)
2. Create **3 apps** in Play Console:
   - `com.shuddhaahar.dev` (internal testing)
   - `com.shuddhaahar.staging` (internal testing)
   - `com.shuddhaahar` (production)
3. Create **Android Keystore** (keep this safe — you can never change it):
```bash
keytool -genkey -v -keystore release.keystore \
  -alias shuddhaahar -keyalg RSA -keysize 2048 -validity 10000
```
4. Create **Service Account** for Fastlane/CI:
   - Play Console → Setup → API access → Create service account
   - Grant "Release manager" role
   - Download JSON key → add to CI as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
5. Set up **In-App Products** in Play Console:

| Product ID | Type | Price |
|---|---|---|
| `shuddhaahar_pro_monthly` | Subscription | £4.99/month |
| `shuddhaahar_pro_annual` | Subscription | £47.88/year |
| `shuddhaahar_max_monthly` | Subscription | £9.99/month |
| `shuddhaahar_max_annual` | Subscription | £95.88/year |

---

## CI/CD Secrets

Add these in **GitHub → Settings → Secrets and variables → Actions**:

### All environments
| Secret | Description |
|---|---|
| `CODECOV_TOKEN` | Coverage reporting |
| `SLACK_WEBHOOK_URL` | Build notifications (optional) |

### iOS
| Secret | Description |
|---|---|
| `ASC_KEY_ID` | App Store Connect API Key ID |
| `ASC_ISSUER_ID` | App Store Connect Issuer ID |
| `ASC_API_KEY_BASE64` | `.p8` file, base64-encoded |
| `IOS_DISTRIBUTION_CERT_BASE64` | Distribution certificate, base64 |
| `IOS_CERT_PASSWORD` | Certificate password |
| `IOS_STAGING_PROVISION_BASE64` | Staging provisioning profile, base64 |
| `IOS_PROD_PROVISION_BASE64` | Production provisioning profile, base64 |
| `KEYCHAIN_PASSWORD` | Temporary keychain password for CI |
| `APPLE_TEAM_ID` | Your Apple Team ID |

### Android
| Secret | Description |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `release.keystore`, base64-encoded |
| `ANDROID_KEY_ALIAS` | Keystore alias (e.g. `shuddhaahar`) |
| `ANDROID_STORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_PASSWORD` | Key password |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Service account JSON (plain text) |

### API Keys (per environment)
| Secret | Description |
|---|---|
| `DEV_ANTHROPIC_API_KEY` | Dev Claude API key |
| `STAGING_ANTHROPIC_API_KEY` | Staging Claude API key |
| `PROD_ANTHROPIC_API_KEY` | Production Claude API key |
| `DEV_STRIPE_PUBLISHABLE_KEY` | Stripe test publishable key |
| `STAGING_STRIPE_PUBLISHABLE_KEY` | Stripe test publishable key |
| `PROD_STRIPE_PUBLISHABLE_KEY` | Stripe **live** publishable key |
| `PROD_STRIPE_PRO_MONTHLY` | Stripe live price ID |
| *(etc. for all PROD Stripe price IDs)* | |
| `DEV_COGNITO_USER_POOL_ID` | Dev Cognito pool |
| `STAGING_COGNITO_USER_POOL_ID` | Staging Cognito pool |
| `PROD_COGNITO_USER_POOL_ID` | Production Cognito pool |

---

## Test Barcodes

| Product | Barcode | Notes |
|---|---|---|
| Coca-Cola 330ml | `5000112548587` | Verified EAN-13 ✓ |
| Cadbury Dairy Milk | `7622210100153` | Contains milk allergen |
| Heinz Baked Beans | `5000157024466` | Vegan-friendly |

---

## Architecture

```
src/
├── config/          # Environment configuration (dev/staging/prod)
├── screens/         # 14 screens
├── components/      # Reusable UI (AppGuide, TCConsentModal, UPFCard...)
├── services/        # API integrations (food, AI, price, TC, CMS, subscriptions...)
├── context/         # AuthContext
├── hooks/           # useSubscription
├── utils/           # logger, errorReporter, performance, cache, apiClient, animations
├── theme/           # medical.ts — design tokens
└── __tests__/       # 209 tests across 19 sections
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.76 (bare) |
| Language | TypeScript |
| Navigation | React Navigation v6 |
| Auth | AWS Cognito + Google Sign-In |
| Database | AWS DynamoDB |
| AI | Claude Haiku 4.5 (Anthropic) |
| Products | Open Food Facts API |
| Prices | Trolley.co.uk API |
| Payments | Stripe + Apple IAP + Google Play Billing |
| CI/CD | GitHub Actions + Fastlane |
| Tests | Jest (209 tests) |
| Admin | Standalone HTML/JS panel |

---

*Shuddh Aahar · UK GDPR compliant · Clinically-grounded nutritional guidance*
