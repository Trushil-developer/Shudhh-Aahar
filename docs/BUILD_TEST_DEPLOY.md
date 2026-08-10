# Build, Test & Deploy

For AWS/Google credential setup, see [AWS_SETUP_GUIDE.md](../AWS_SETUP_GUIDE.md) at the repo root.
For infra details, see [Backend Infrastructure](BACKEND_INFRASTRUCTURE.md).

## Environments

| Environment | Bundle ID | Branch | Destination |
|---|---|---|---|
| Development | `com.shuddhaahar.dev` | `develop` | Simulator / local device |
| Staging | `com.shuddhaahar.staging` | `staging` | TestFlight · Play Internal Track |
| Production | `com.shuddhaahar` | `main` | App Store · Google Play |

Env vars live in `.env.development` / `.env.staging` / `.env.production` (templates, committed)
and `.env.<env>.local` (real secrets, gitignored). Each defines, prefixed `DEV_`/`STAGING_`/`PROD_`:
`SHUDDHAAHAR_ENV`, `*_APPSYNC_ENDPOINT`, `*_GOOGLE_WEB_CLIENT_ID`, `*_GOOGLE_IOS_CLIENT_ID`,
`*_ANTHROPIC_API_KEY`, `*_TROLLEY_API_KEY`, `*_IAP_VERIFY_URL`, `*_APP_CONFIG_URL`. Auth is native
Google Sign-In (no Cognito) and payments are Apple/Google IAP verified server-side (no Stripe) — see
[environment.ts](SERVICES_AND_UTILS.md#environment-config-srcconfigenvironmentts) for how these
are consumed at runtime.

## Local development

```bash
bash scripts/setup.sh dev   # first-time machine bootstrap
npm run ios                 # iOS simulator (development)
npm run android              # Android emulator (development)
npm test                    # Jest suite
npm run typecheck            # tsc --noEmit --skipLibCheck
```

`scripts/setup.sh <dev|staging|prod>` automates: checking node/npm/git (+ xcodebuild/pod/ruby/brew
on macOS, Java 17 everywhere) → git init/branch setup → copying `.env.<env>` to `.env.<env>.local`
(and confirming it's gitignored) → `npm ci`/install → `pod install` + Fastlane gems on iOS →
Android SDK/gradlew checks → AWS Amplify CLI presence check (prints `amplify configure/init/add
auth/add api/push` guidance if not yet initialized) → TypeScript check → Jest (`--passWithNoTests`).

## Manual builds

```bash
npm run build:staging:ios      # TestFlight
npm run build:staging:android  # Play Internal Track
npm run build:prod:ios         # App Store
npm run build:prod:android     # Play Store
```

`scripts/build.sh <env> <platform>` always runs the TypeScript check + Jest before building.
- **iOS**: dev → unsigned Debug simulator build; staging → `fastlane staging` (TestFlight);
  production → confirmation prompt, then `fastlane production` (App Store submission).
- **Android**: dev → `gradlew assembleDebug` (+ auto-install via adb if a device is connected);
  staging → `gradlew bundleRelease` (signed) + `fastlane staging` (Play internal track);
  production → confirmation prompt, signed `bundleRelease` + `fastlane production` (10% staged
  rollout).

## CI/CD (`.github/workflows/ci.yml`)

Triggers on push/PR to `main`, `staging`, `develop`.

```
develop push  → test job (typecheck + jest + coverage → Codecov)
                → build-dev-ios (unsigned Debug simulator build)

staging push  → test job
                → deploy-staging-ios   (Fastlane → TestFlight)
                → deploy-staging-android (signed AAB → Play internal track)

main push     → test job
                → environment: production (manual approval gate in GitHub)
                → deploy-prod-ios     (Fastlane → App Store submission)
                → deploy-prod-android (signed AAB → Play Store, draft, 10% rollout)
```

Every deploy job depends on `needs: test` passing — that's the primary quality gate. Production
deploys additionally require manual approval via a GitHub `environment: production` protection
rule.

### CI/CD secrets (GitHub → Settings → Secrets and variables → Actions)

| Category | Secrets |
|---|---|
| All environments | `CODECOV_TOKEN`, `SLACK_WEBHOOK_URL` (optional) |
| iOS | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_API_KEY_BASE64`, `IOS_DISTRIBUTION_CERT_BASE64`, `IOS_CERT_PASSWORD`, `IOS_STAGING_PROVISION_BASE64`, `IOS_PROD_PROVISION_BASE64`, `KEYCHAIN_PASSWORD`, `APPLE_TEAM_ID` |
| Android | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` |
| API keys (per env) | `{DEV,STAGING,PROD}_APPSYNC_ENDPOINT`, `{DEV,STAGING,PROD}_GOOGLE_WEB_CLIENT_ID`, `{DEV,STAGING,PROD}_GOOGLE_IOS_CLIENT_ID`, `{DEV,STAGING,PROD}_ANTHROPIC_API_KEY`, `{DEV,STAGING,PROD}_TROLLEY_API_KEY`, `{DEV,STAGING,PROD}_IAP_VERIFY_URL`, `{DEV,STAGING,PROD}_APP_CONFIG_URL` |

## Releases (`scripts/release.sh`)

```bash
npm run release:patch "Fix scanner crash on iPhone SE"   # 1.0.0 → 1.0.1
npm run release:minor "Add family profiles feature"       # 1.0.1 → 1.1.0
npm run release:major "Complete app redesign"             # 1.1.0 → 2.0.0
```

Requires a clean git tree. Bumps the version in `package.json`, iOS `project.pbxproj`
(`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` = timestamp), and Android `build.gradle`
(`versionName`, `versionCode` +1); prepends an entry to `CHANGELOG.md`; commits, tags `v<version>`,
and pushes both branch and tag to origin. Then promote with:

```bash
git push origin develop:staging   # → staging
git push origin staging:main      # → production (after sign-off + manual CI approval)
```

## Testing

- Single suite: `src/__tests__/Shuddhaahar.test.ts` — 211 `test()` cases across 41 `describe` blocks,
  covering barcode validation, nutrition validation, the health warning engine, the accuracy
  engine, the cache system, `apiClient` (backoff/circuit breaker), diary macros/goals, subscription
  gating & pricing, price comparison, data sanitisation, UPF/NOVA scoring, document-merge logic,
  animations, responsive design, CMS, the in-app guide system, subscription cancellation/billing,
  the contact form, and the full T&C version-gate system. It's a pure business-logic unit suite —
  no RN component rendering.
- `__mocks__/` provides manual mocks for `async-storage`, `aws-amplify`, `netinfo`,
  `react-native-document-picker`, `react-native-fs`, `react-native-health`, `react-native-iap`,
  `react-native-image-picker`, `react-native-vision-camera`.
- `jest.config.json` is the config actually used by CI and both `build.sh`/`setup.sh` — RN preset,
  coverage thresholds (70% branches, 80% functions/lines/statements). A second, unused
  `jest.config.js` also exists with different (non-existent) mock mappings — see
  [Known Issues](KNOWN_ISSUES.md).

## App identity

`app.json` is minimal: `{"name": "Shuddhaahar", "displayName": "Shuddh Aahar"}` — no Expo config, no
versioning; versioning lives in `package.json`/native project files instead (see release script
above).
