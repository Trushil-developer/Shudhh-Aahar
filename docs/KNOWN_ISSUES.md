# Known Issues & Technical Debt

Notes surfaced while documenting the app — things a future contributor (or you) would want to know
before relying on this code, roughly ordered by severity. None of these have been fixed here; this
is a record, not a changelog.

## 🔴 Security

### Real API keys live in `.env.development.local` (not committed, but on disk)
`environment.ts` itself is clean — every environment (`DEV_CONFIG`/`STAGING_CONFIG`/`PROD_CONFIG`)
reads `process.env.X || ''` with no hardcoded fallback, and `.gitignore` correctly excludes
`.env.*.local` from version control. But `.env.development.local` contains a real, live-shaped
Anthropic key (`DEV_ANTHROPIC_API_KEY`) and Trolley key (`DEV_TROLLEY_API_KEY`) sitting unencrypted
in the project working tree — not a version-control leak, but still one accidental `git add -f`,
screen-share, or synced-folder backup away from exposure. **Rotate to scoped, low-limit dev keys**
if these aren't already scoped down.

### Admin panel authentication — verified sound, contrary to an earlier version of this note
`admin/index.html` POSTs `{username, password}` to a real backend
(`terraform/lambda/google-auth-authorizer.js`'s `handleLogin`), which does a DynamoDB lookup,
`crypto.scryptSync` password hashing, and `crypto.timingSafeEqual` comparison — no hardcoded
credentials or MFA-bypass code exist anywhere in the page. Google ID tokens are verified via
RS256/JWKS signature check with issuer/audience/expiry validation. See
[Backend Infrastructure](BACKEND_INFRASTRUCTURE.md#admin-panel-adminindexhtml). One real, smaller
gap: `handleLogin` has no rate-limiting/lockout on failed attempts beyond API Gateway's
account-level throttle, so online password-guessing isn't actively prevented server-side.

## 🟠 Functional bugs

### Photo scan feature can't call the real AI in any build
`src/services/photoScanService.ts:5` hardcodes `ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY'`
instead of importing `Config.anthropicApiKey` from `environment.ts` like every other AI service
does. The mock/live decision (`photoScanService.ts:44`) checks for that literal placeholder
string, which never changes — so `PhotoScanScreen` always returns `getMockPhotoResult()`, even in
production with a real key configured. Fix: import `Config` and use `Config.anthropicApiKey`,
matching `aiHealthService.ts`/`documentHealthService.ts`.

### "Delete My Data" doesn't delete data
`ProfileScreen`'s "Delete My Data" action is confirmed via a destructive `Alert` but currently just
calls `signOut()` — there's no service call to actually delete the DynamoDB user record or scan
history. Worth fixing before this is user-facing copy, both for user trust and for UK GDPR
right-to-erasure compliance (the README states the app is "UK GDPR compliant").

### Contact form silently "succeeds" even when the network call fails
`CMSPageScreen`'s contact-form section POSTs to `api.shuddhaahar.shop/v1/contact` and shows a
success message even if that `fetch` throws — the error is caught and swallowed. Users who submit
a support request during an outage will believe it was sent when it wasn't.

## 🟡 Naming / doc mismatches (low risk, but worth cleaning up)

- **`shoppingListService`** is commented as syncing to DynamoDB, but the file only reads/writes
  `AsyncStorage` — it's local-only, matching every other device. If cross-device shopping lists are
  intended, that sync doesn't exist yet.
- **Two Jest configs exist** — `jest.config.json` (used by CI, `build.sh`, `setup.sh`) and an unused
  `jest.config.js` whose `moduleNameMapper` points at mock files (`__mocks__/amplify.js`,
  `__mocks__/asyncStorage.js`) that don't exist under the real mock file names
  (`__mocks__/aws-amplify.js`, `__mocks__/async-storage.js`). Safe to delete `jest.config.js` once
  confirmed nothing references it.
- **`subscriptionService.PLANS`** still carries fields from an earlier 3-tier model (`pro`/`max`,
  `documentUpload`, `weeklyReport`) even though the product has been simplified to a 2-tier
  Free/Essential model. Legacy plan IDs are migrated on load, but the leftover fields are dead
  weight worth pruning.
- **`amplify/backend/api/shuddhaahar/schema.graphql`** is a leftover reference file from before the
  project switched to Terraform — it was never deployed (no Amplify CLI scaffolding exists). See
  [Backend Infrastructure](BACKEND_INFRASTRUCTURE.md#terraform-vs-amplifybackend). Consider
  removing it, or clearly marking it as historical, to avoid a future contributor treating it as
  live.

## Fast-path/fallback behaviours worth knowing (by design, not bugs)

These are intentional but easy to misread as bugs during debugging:

- `aiHealthService`, `documentHealthService`, `recommendationService`, `photoScanService` all fall
  back to canned mock data when no API key is configured, and `aiHealthService` additionally falls
  back to a local rule-based heuristic if the live Claude call throws — so a broken network or
  expired key degrades the AI verdict rather than erroring the screen.
- `tcService.checkTCAcceptance()` skips its network call entirely when the locally cached T&C
  version already matches what the user accepted (avoids a 5s timeout on every login) — if you're
  testing a newly published T&C version and it's not showing up, check whether the local cache is
  stale.
- `App.tsx`'s T&C check fails open on network errors — a user offline at login is not blocked by
  the T&C gate.
- `priceApi` never surfaces a scraping failure to the UI — it falls back to direct retailer search
  links instead of an error state.
