# Services & Utils

See [Architecture Overview](ARCHITECTURE.md) for how these fit into the overall app flow.

## Environment config (`src/config/environment.ts`)

Environment switching is driven by `process.env.SHUDDHAAHAR_ENV`, read at build time (an
invalid/unset value silently defaults to `development`). Three config objects are defined —
`DEV_CONFIG` (base), `STAGING_CONFIG` (spreads dev, overrides endpoints/Cognito/Stripe/product
IDs), `PROD_CONFIG` (spreads staging) — selected into the exported `Config` singleton (also
re-exported as `ENV`, `isDev`, `isStaging`, `isProd`).

Exposes: API/CMS/T&C/log/error endpoints; AWS region + Cognito pool/client/domain + DynamoDB table
name; Anthropic API key; Trolley API key; Stripe publishable key + per-plan price IDs; Apple/Google
IAP product IDs per plan/period; a `FeatureFlags` block (`photoScan`, `healthKitSync`,
`priceComparison`, `aiAnalysis`, `documentUpload`, `subscriptions`, `adminPanel` — the last forced
`false` in prod); and debug knobs (`enableLogging`, `logLevel`, `enablePerformanceMonitoring`,
`enableCrashReporting`, `mockAPIs`).

> ⚠️ See [Known Issues](KNOWN_ISSUES.md) — the dev config hardcodes fallback Anthropic/Trolley API
> keys directly in source, used whenever the corresponding env var isn't set.

## Services (`src/services/`)

| Service | Talks to | Purpose |
|---|---|---|
| `aiHealthService` | Anthropic Claude (`claude-haiku-4-5`) | Sends a scanned product + the user's health profile to Claude for a personalised safety verdict. Falls back to a canned mock if no API key is set, or a rule-based heuristic (allergen/sugar+diabetes) if the live call throws. |
| `authService` | AWS Cognito (via `aws-amplify/auth`) | Thin wrapper: `signInWithGoogle`, `signOut`, `getCurrentUser`, `getAuthToken`, `isAuthenticated`. All calls try/catch to `null`/`false` on failure. |
| `cmsService` | Custom CMS API (`Config.cmsApiUrl`) | Fetches static marketing/legal pages (privacy policy, FAQ, T&Cs). AsyncStorage cache with a 4h TTL; 5s fetch timeout; falls back to hardcoded `DEFAULT_PAGES` on any failure so the UI is never empty. |
| `diaryService` | None (local only) | Per-day food/macro diary in AsyncStorage. Computes NHS-based daily calorie/macro goals (Mifflin-St Jeor BMR, NHS caps of 30g sugar / 6g salt). |
| `documentHealthService` | Anthropic Claude (`claude-sonnet-4-6`) | Extracts structured health data (allergies, conditions, meds) from uploaded documents/photos. Batches 2 documents at a time (large base64 payloads break RN `fetch`), 90s abort timeout per batch, dedupes/merges across batches. |
| `foodApi` | Open Food Facts | Barcode lookup + normalisation of product/nutrition/allergen/additive/NOVA data. Routed through the shared `apiClient` (3 retries, 8s timeout, 24h cache). Validates the barcode checksum via `accuracyEngine` before calling. |
| `healthKitService` | Apple HealthKit (iOS) / Health Connect (Android) | Reads steps/active calories/heart rate/sleep. Native modules are lazily `require()`d inside try/catch so a missing/unlinked native package never crashes the JS bundle; all reads swallow errors to `null`. |
| `photoScanService` | Anthropic Claude (`claude-haiku-4-5`) | Photo-based meal identification/nutrition estimate. **Currently broken in real builds** — see [Known Issues](KNOWN_ISSUES.md). |
| `priceApi` | Trolley.co.uk (HTML scraping) | UK grocery price comparison — no official API exists, so this does a two-step raw-`fetch` + regex scrape (search → product page). Tries product-name search before barcode (barcode search is JS-rendered). On failure, returns direct deep-links into Tesco/Sainsbury's/ASDA/Morrisons/Ocado search pages rather than an error. |
| `recommendationService` | Open Food Facts + Anthropic Claude (`claude-haiku-4-5`) | Finds similar products in the same category (three fallback search strategies, stops once ≥3 candidates found), then has Claude rank the top 3 for the user's health profile. |
| `shoppingListService` | None (local only) | "Safe shopping list" persisted in AsyncStorage, deduped by barcode. |
| `subscriptionService` | Apple IAP, Google Play Billing, Stripe (web checkout via custom backend) | Free (2 scans/day) vs Essential (£2/mo, unlimited) plan logic: state, feature/scan gating, purchase dispatch by platform, restore, cancel. Receipts are always validated server-side, never trusted client-side. Migrates legacy `pro`/`max` plan IDs to `essential` on load. |
| `tcService` | Custom backend (`Config.tcApiUrl` / `apiBaseUrl + /tc/accept`) | Terms & Conditions version-gating — forces re-acceptance when the admin publishes a newer version. Has a "fast path" that skips the network call entirely if the locally cached version already matches what the user accepted (avoids a 5s timeout on every login). Ships acceptance to the server for audit, but treats that as non-fatal — the local record is authoritative. |
| `userDataService` | AWS AppSync/DynamoDB (`generateClient()`) | Health profile persistence + scan history. `generateWarnings()` is the rule-based engine cross-referencing profile allergies/intolerances/conditions/diet type against product allergens/ingredients (diabetes→sugar, hypertension→salt, coeliac→gluten, vegan/vegetarian ingredient checks). All GraphQL calls log-and-swallow errors. |

## Utils (`src/utils/`)

| Util | Purpose |
|---|---|
| `accuracyEngine` | Validates barcode checksums (EAN-13/UPC-A/EAN-8), sanitises HTML/whitespace from product text, checks nutrition values for internal consistency, and scores overall product data quality 0–100 (A–F grade + confidence). |
| `animations` | ~14 reusable `Animated` hooks (fade-in, slide-up, stagger, score-bar fill, count-up, pulse, shake, scale-press, scan line, spring pop, shimmer, page transition, floating label), built on the native driver where possible. |
| `apiClient` | Shared HTTP client wrapping `fetch` with a per-domain circuit breaker (opens after 5 failures, 60s cool-down), exponential-backoff retries, in-flight request de-duplication, `AbortController` timeouts, and integrated caching/perf logging. |
| `cache` | Two-tier (in-memory LRU + AsyncStorage) cache with TTL, checksum-based integrity validation, and versioning. Named TTL presets: `PRODUCT` 24h, `PRICE` 1h, `AI_ANALYSIS`/`RECOMMENDATIONS` 6h, `SEARCH` 30m, `USER_PROFILE` 5m. |
| `errorReporter` | Central crash/error reporting with a breadcrumb trail, severity levels, local AsyncStorage buffering, and immediate shipping of critical/high-severity reports to `Config.errorEndpoint`. Installs global JS error and unhandled-rejection handlers. |
| `logger` | Structured leveled logger (debug→fatal), console colouring in dev, a local ring buffer (last 500 entries), and batched remote shipping (5s debounce) to `Config.logEndpoint`. |
| `performance` | Tracks named timers, API call metrics, screen render/load times, and cache hit rate; warns via `logger`/`errorReporter` when thresholds (e.g. 3s API, 500ms screen render) are exceeded. |
| `responsive` | Scales fonts/spacing/radii/icon sizes relative to an iPhone 14 reference (390×844), clamped 0.75–1.25x. Exposes screen-size booleans and a `useResponsive()` hook reacting to dimension changes. |
