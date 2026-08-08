# Screens & Components

See [Architecture Overview](ARCHITECTURE.md) for how these fit into the overall app flow.

## Screens (`src/screens/`)

### OnboardingScreen
One-time, first-launch 5-slide animated intro shown before login. Props: `{ onComplete }`.
Pure local `Animated` state machine (slide/fade/scale transitions, spring dot indicators) — no
service calls. Last slide shows a medical disclaimer and swaps "Next" for "Get Started".

### LoginScreen
Auth entry screen (dark hero + Google sign-in). Calls `authService.signInWithGoogle` and
`useAuth().devSignIn()`. A `__DEV__`-only "Skip sign in" button calls `devSignIn()` to bypass
Cognito entirely in development builds.

### HealthProfileScreen
View/edit the user's health profile (allergies, conditions, diet, goals). Props: `{ onComplete }`.
Two-mode state machine: `'view'` (default once a profile exists) vs `'edit'`, the latter a 4-step
wizard (`Allergies → Conditions → Diet & Lifestyle → Goals`) with a progress bar. Can branch into
`DocumentUploadScreen` to auto-fill via document upload. Calls `userDataService.saveHealthProfile`.

### DocumentUploadScreen
Upload medical documents/photos so Claude can auto-fill the health profile. Props:
`{ existingProfile, onComplete, onSkip }`. Explicit step state machine:
`'upload' → 'processing' → 'review' → 'saving' → 'done'`. Calls
`documentHealthService.extractHealthDataFromDocuments`, then merges extracted fields into the
existing profile (dedup helpers for arrays/medications) before the user reviews and confirms.
Shows a confidence badge (high/medium/low) on the review step.

### HomeScreen
Post-login dashboard/landing tab. Loads the 5 most recent scans (AppSync `listScanHistories`) and
HealthKit stats non-blockingly (failures swallowed to `null`). Tapping the avatar/health card opens
`HealthProfileScreen` as a full-screen modal.

### ScanScreen
Live camera barcode scanner (`react-native-vision-camera`). Permission state machine re-checks on
`AppState` becoming `active` (covers the user granting camera access in Settings and returning). A
`scanned` guard flag prevents double-fires; on a decoded barcode it vibrates and navigates to
`Product`.

### PhotoScanScreen
AI photo-based meal analysis, an alternative to barcode scanning for meals without a barcode.
Props: `{ onClose }`. Flow: pick photo (camera/library) → `photoScanService.analysePhotoMeal`
(Claude) → verdict (good/moderate/poor) + macros + UPF warning → pick meal type → log via
`diaryService.addDiaryEntry`.

### ProductScreen
The full product report: nutrition, AI verdict, prices, alternatives. Nav params: `barcode`,
optional `fromRecommendation`, `whyBetter`. After `foodApi.fetchProductByBarcode` resolves, prices
and the AI verdict load in parallel; alternative products are only searched for if the AI verdict
isn't `'safe'`. Saves to scan history and can add the product to the shopping list. Renders the
`UPFCard` component for NOVA/additive detail.

### HistoryScreen
List of past scans (AppSync `listScanHistories` filtered by user id), pull-to-refresh. Verdict
badges are computed client-side from warning text heuristics (checks for strings like
"allergic"/"avoid").

### DiaryScreen
Daily food/macro diary with HealthKit integration. Adjusts the calorie goal by adding back half of
active calories burned. Calorie/macro progress bars change colour at 90%/110% thresholds.
Long-press an entry to remove it (with confirmation).

### ShoppingListScreen
Saved "safe products" list, local-only (`shoppingListService`, AsyncStorage — see
[Known Issues](KNOWN_ISSUES.md) for a doc/code mismatch here). Splits into unchecked/checked
sections; destructive actions (remove, clear-checked) are confirmed via `Alert`.

### ProfileScreen
Account/settings hub. Renders `HealthProfileScreen` (edit mode), `CMSPageScreen` (info pages), and
`SubscriptionScreen` (as a modal) conditionally in-place. Sign-out and "Delete My Data" are both
confirmed via destructive `Alert`s — note "Delete My Data" currently just signs the user out with
no dedicated delete-account service call (see [Known Issues](KNOWN_ISSUES.md)).

### SubscriptionScreen
Paywall / plan management (Free vs Essential). Props: `{ onClose, highlightFeature? }`. Shows a
platform-specific pay button (Apple Pay / Google Pay) when not subscribed, or a management card
(cancel link, "cancel pending" state) when subscribed. Backed by `subscriptionService`.

### CMSPageScreen
Renders admin-managed static content pages (FAQ, contact form, legal pages, etc.) fetched via
`cmsService.fetchCMSPage`. A `SectionRenderer` switches over typed section kinds (`heading` /
`body` / `callout` / `faq` / `feature-list` / `contact-form`). The contact form POSTs directly to
`api.shuddhaahar.shop/v1/contact` and shows a success state even if that call throws (silently
swallowed — see [Known Issues](KNOWN_ISSUES.md)).

## Components (`src/components/`)

| Component | Purpose |
|---|---|
| `AIHealthTab` | Alternate tab UI for the Claude-generated per-user verdict, score bar, warnings/positives, and suggestions for a product; also renders `RecommendationsSection` and logs scan history. |
| `AppGuide` | In-app help system: an 8-slide `WalkthroughModal`, one-time per-screen `FeatureTooltip`s, a `HelpButton`, and a `useGuide(screen)` hook tracking "seen" state in `AsyncStorage`. |
| `ErrorBoundary` | Class-based React error boundary; friendly crash screen with a "Try Again" reset, error detail shown only in `__DEV__`. |
| `OfflineBar` | Slide-down banner (via `NetInfo`) shown when the device loses connectivity. |
| `RecommendationsSection` | Collapsible "Similar Products" panel — fetches/ranks alternatives via `findSimilarProducts`, shows score deltas and nutrition stats. |
| `Skeletons` | Pulsing loading placeholders (`ProductSkeleton`, `HistorySkeleton`, `AISkeleton`) from a shared animated `SkeletonBox`. |
| `TCConsentModal` | Blocking, non-dismissible T&C modal. Forces scroll-to-bottom before enabling Accept, blocks the Android back button, and Decline exits the app. |
| `UPFCard` | NOVA ultra-processed-food score and E-number/additive risk breakdown (avoid/caution/safe), with an expandable full additive list. |

## Context & hooks

### `src/context/AuthContext.tsx`
Exposes `user`, `healthProfile`, `profileComplete`, `loading`, `refreshProfile()`,
`updateHealthProfile()`, `devSignIn()`. Backed by **AWS Amplify (Cognito)** — listens to Amplify's
`Hub` for `signedIn` / `signInWithRedirect` / `signedOut` events rather than calling a
Google/Firebase SDK directly (Google sign-in is federated through Cognito). On sign-in, it creates
the DynamoDB user record on first login and hydrates the health profile. There is no explicit
`logout()` method on the context — `ProfileScreen` calls `authService.signOut()` directly, which
triggers the `signedOut` Hub event that resets context state. `devSignIn()` sets a hardcoded dev
user object without touching Cognito at all, and is only reachable from the `__DEV__` login button.

### `src/hooks/useSubscription.tsx`
Exposes `checkFeature(feature, label?)`, `checkScan()`, `state`, `isPro`, and a ready-to-render
`PaywallModal` element. Two tiers: **Free** (2 scans/day) and **Essential** (£2/month, unlimited
scans + full feature set). `checkScan()` either records a scan against the daily quota or opens the
paywall; `checkFeature()` is the generic gate for non-scan features. `isPro` is simply
`state?.planId === 'essential'`.

## Theme (`src/theme/medical.ts`)
Design tokens: `Colors` (clinical navy palette; semantic `safe`/`caution`/`danger`/`info` triads;
Nutri-Score `nutriA`–`nutriE`; neutral surface/text tiers), `Typography`, `Shadow` (card elevation
presets), `StatusConfig` (verdict → colour/icon/label/description bundles). There's no numeric
spacing scale in this file — spacing/sizing is handled per-screen via the `rw`/`rh`/`rf`/`rr`
responsive helpers in `src/utils/responsive.ts`.
