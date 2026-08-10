# Shuddh Aahar Startup Roadmap — UK → India → Multi-country

Owners: Trushil (co-founder) + Jaimin (co-founder, incoming). This is a living document — edit it
together as decisions get made. It assumes the goal stated: rebuild/harden the existing app,
launch UK first, India second, more countries after.

**Honest framing on the timeline:** you asked for a 1–3 month UK launch. That's achievable for a
*beta/soft launch* (TestFlight + Play internal, or a limited public release) if Phase 0–2 below run
in parallel starting now. A confident, fully compliant *public* launch with a real business entity,
reviewed legal docs, and hardened billing realistically lands at the **10–12 week mark**, not
week 4. Anything that tries to compress incorporation + legal review + Apple health-app review +
proper QA into under 6 weeks will produce a launch you have to walk back. Build the plan below
assuming week 12 is "public UK launch," and treat anything earlier as a bonus.

---

## 0. Before writing any code — decide these as a pair (Week 1)

These are two-person decisions, not technical tasks, and everything else depends on them:

1. **Equity/ownership split and role split.** Suggest drafting this before either of you touches
   the codebase further — "who owns what %" arguments get much harder once real work is sunk in.
2. **Legal entity.** For a UK-first company: a UK Limited Company (Companies House, ~24hrs, ~£50)
   is the standard vehicle. You'll need this before you can open an App Store Connect *organization*
   account, a UK business bank account, or a Stripe account in the company's name.
3. **Who owns what in the stack.** A reasonable split given the current codebase:
   - **Trushil**: AWS/Terraform infra, backend (AppSync/DynamoDB/Cognito), CI/CD, DevOps, compliance/legal coordination, business ops.
   - **Jaimin**: App rebuild — screens/components, service layer fixes, AI integration quality, App Store/Play Store submission, product QA.
   Adjust to actual strengths — the point is to write it down and avoid both of you touching the
   same files without a lane.
4. **Repo hygiene.** This project currently has no git history (`git status` shows it's not yet a
   git repo). Before Jaimin starts changing things in parallel, initialize git and push to a shared
   private GitHub repo — otherwise you have no way to merge two people's work or roll back mistakes.
5. **Shared access.** AWS account (IAM users, not root credentials, for each of you), Anthropic
   Console, Apple Developer / Google Play Console (see Phase 3), domain registrar, Stripe — get
   Jaimin added to all of these this week, not when they're blocked waiting on you.

---

## Phase 1 — Technical production-readiness (Weeks 1–6, Jaimin-led, Trushil supporting infra)

Start from [Known Issues](KNOWN_ISSUES.md) — it's the existing punch list. Priority order:

### Week 1 — stop-the-bleeding (do this before anything else)
- **Rotate the committed Anthropic + Trolley API keys** (`src/config/environment.ts:98-99`) and
  remove the hardcoded fallbacks. This is the single most urgent item in the whole roadmap.
- Fix `photoScanService.ts` to actually use `Config.anthropicApiKey` (currently always mocked).
- Decide the fate of `admin/index.html`: either rebuild it with real Cognito-backed auth before
  anyone relies on it, or delete it from the repo so it can't accidentally get deployed as-is.
- Init git, push to a private repo, set up branch protection on `main`.

### Weeks 1–3 — core correctness & compliance-blocking fixes
- Implement real account/data deletion (currently "Delete My Data" just signs the user out). This
  is a **hard requirement before public launch** — UK GDPR gives users a right to erasure, and the
  README already claims GDPR compliance.
- Fix the contact form's silent-failure-looking-like-success bug (`CMSPageScreen`).
- Decide the real subscription pricing/tiers and lock `subscriptionService.PLANS` — remove dead
  legacy `pro`/`max` fields once the model is finalized.
- Delete the unused, incorrectly-configured `jest.config.js` (keep `jest.config.json`).
- Re-run the full Jest suite (211 tests) and treat any failures as launch blockers, not later
  cleanup — a health app with silently-wrong nutrition/allergy logic is a liability, not a bug.

### Weeks 2–5 — hardening & QA
- Real device testing on a spread of iOS/Android versions — the current test suite is pure
  business-logic unit tests with **no rendered-component or E2E coverage** (see
  [Build, Test & Deploy](BUILD_TEST_DEPLOY.md#testing)). Before launch, manually walk every flow in
  [Screens & Components](SCREENS_AND_COMPONENTS.md) on a real device: onboarding → login → T&C
  gate → health profile → barcode scan → photo scan → diary → shopping list → subscription
  purchase → account deletion.
- Load-test/spot-check the AppSync resolvers and DynamoDB access patterns under realistic traffic
  — they're hand-written JS resolvers with no Lambda, so there's no existing observability beyond
  CloudWatch defaults.
- Decide the long-term fate of `priceApi`'s HTML scraping of Trolley.co.uk. Scraping a third
  party's site (rather than using a licensed API) is a **legal and reliability risk for a company
  with paying customers** — their markup can change overnight and break the feature, and scraping
  may violate their terms of service. Before/shortly after UK launch, look into a proper data
  licensing agreement or an official price-comparison API, even if it costs money.
- Set up crash/error monitoring dashboards from the existing `logger`/`errorReporter` remote
  endpoints — right now they ship data but there's no mention of where it's *reviewed*.

### Weeks 4–6 — release engineering
- Get the CI/CD pipeline (already mostly built — see
  [Build, Test & Deploy](BUILD_TEST_DEPLOY.md#cicd-cigithubworkflowsciyml)) actually exercised
  end-to-end at least once for staging and once for production, including the manual-approval gate,
  well before the real launch date — the first time you run a pipeline should never be launch day.
- Confirm all CI/CD secrets are populated in GitHub (full list in
  [Build, Test & Deploy](BUILD_TEST_DEPLOY.md#cicd-secrets-github--settings--secrets-and-variables--actions)).

---

## Phase 2 — UK legal & compliance (Weeks 1–8, Trushil-led, runs in parallel with Phase 1)

**None of this is legal advice — get a solicitor for the items marked ⚖️, ideally one with health-tech
experience.** Shuddh Aahar gives personalised health/allergy/medication-interaction guidance, which
puts it closer to regulated territory than a typical consumer app.

1. **⚖️ Software-as-a-Medical-Device (SaMD) check.** The UK MHRA has guidance on when health apps
   cross into regulated medical device territory (diagnosis, treatment recommendations, or
   medication-related guidance can trigger this). "Personalised AI health analysis" and
   medication-aware warnings are exactly the kind of feature that needs this checked *before*
   launch, not after — retrofitting compliance is much more expensive. This is the single biggest
   legal unknown on this roadmap; resolve it early.
2. **Company incorporation** (Companies House) — needed for App Store/Play Store organization
   accounts, business banking, and any B2B contracts (data licensing, payment processing).
3. **ICO registration** (UK Information Commissioner's Office) — required for most businesses
   processing personal data, small annual fee.
4. **Privacy Policy + Terms & Conditions rewrite**, reviewed by counsel, covering: health data as a
   special category under UK GDPR (Article 9 — requires explicit consent, which the existing
   `TCConsentModal`/T&C gate is a reasonable technical foundation for, but the *legal text* itself
   needs proper drafting), data retention/deletion, third-party data sharing (Anthropic, Open Food
   Facts, Trolley, Stripe/Apple/Google).
5. **Data Processing Agreements (DPAs)** with every third party that touches user data: Anthropic
   (health profile data is sent to Claude on every scan — confirm Anthropic's DPA/zero-retention
   terms are adequate for health data), AWS, Stripe.
6. **Apple/Google health-app review requirements.** Apple in particular applies extra scrutiny to
   apps handling health data and HealthKit — read Apple's App Review Guidelines section 5.1.3
   (Health & Health Research) closely; expect at least one rejection-and-resubmit cycle as normal,
   not a failure.

---

## Phase 3 — Business/store setup (Weeks 2–8, can run in parallel)

Mostly already scoped in the existing [AWS_SETUP_GUIDE.md](../AWS_SETUP_GUIDE.md) and root
[README.md](../README.md) — the checklist is:

- Apple Developer Account (org, not individual — needs the company entity from Phase 2 first),
  App Store Connect app + API key, 3 App IDs, capabilities (Sign in with Apple, HealthKit, IAP,
  Push), distribution cert + provisioning profiles, 4 in-app subscription products.
- Google Play Developer Account (org), 3 apps, release keystore (store this somewhere durable —
  losing it means you can never update the app again), service account for CI, subscription
  products.
- Production Stripe account under the company entity (currently only test/dev keys are wired up).
- Support channel for users (email/helpdesk) — the in-app contact form currently points at
  `api.shuddhaahar.shop/v1/contact`; confirm that domain/backend actually exists and is monitored
  before launch, or the "known issue" of silent failures becomes a real support gap.

---

## Phase 4 — UK Launch (Target: Week 10–12)

1. **Weeks 8–9**: Internal beta — TestFlight + Play Internal Track, small group (friends, family,
   a few real target users e.g. people managing allergies/diabetes). Watch crash reports and the
   AI verdict quality closely; this is a health-adjacent product, so wrong output is the worst
   possible bug class.
2. **Week 10**: Wider beta (TestFlight external / Play closed track) with real UK barcodes across a
   range of supermarkets — validate `foodApi` (Open Food Facts UK coverage) and `priceApi`
   (Trolley scrape) actually hold up at real-world barcode variety, not just the 3 test barcodes in
   the README.
3. **Weeks 11–12**: Public UK launch — App Store + Google Play, staged rollout (the existing
   `build.sh`/CI already does 10% staged rollout on Android; consider the same discipline on iOS
   via phased release).
4. Have a **rollback plan** written down before launch day: who pulls the release, how fast can a
   hotfix ship through the existing CI pipeline, what's the on-call arrangement between the two of
   you.

---

## Phase 5 — Post-launch stabilization (Weeks 12–16)

- Daily check of crash reports, error reporter breadcrumbs, and subscription purchase success
  rates (billing bugs are the fastest way to lose trust and revenue simultaneously).
- Fast-follow on any App Store/Play Store review feedback.
- Start collecting structured user feedback (in-app or a simple form) specifically on AI verdict
  accuracy — this is your core value proposition and the part most likely to have edge cases.
- Revisit pricing/conversion once you have real usage data — `subscriptionService`'s Free
  (2 scans/day) vs Essential (£2/mo) split is a starting hypothesis, not a fixed fact.

---

## Phase 6 — India expansion (start groundwork ~Week 8, target launch Month 5–7)

India is **not** a copy-paste of the UK deployment. Flag these to Jaimin early since they affect
architecture, not just content:

### Data sources — the biggest open question
- **`priceApi`** is entirely UK-specific (scrapes Trolley.co.uk, hardcoded links to
  Tesco/Sainsbury's/ASDA/Morrisons/Ocado). There is no equivalent single price-comparison source
  for Indian grocery retail — this feature likely needs to be **redesigned or dropped for India
  v1** rather than assumed to "just work" with a new API key. Budget real R&D time here, don't
  treat it as a config change.
- **`foodApi`** relies on Open Food Facts, whose Indian product coverage is materially weaker than
  UK coverage. Expect more "product not found" cases; consider a fallback manual-entry flow or a
  partnership with an Indian product database as part of India v1 scope, not a nice-to-have.
- **Health guidance baseline**: `diaryService`'s daily goals are NHS-based (30g sugar / 6g salt
  caps). For India, decide whether to keep NHS baselines or adopt ICMR/NIN (Indian) dietary
  guideline references — this is a credibility issue for Indian users, not a cosmetic one.

### Payments
- Stripe + Apple/Google IAP for a UK company selling into India has real friction: RBI rules on
  recurring/international card payments, and Indian users often expect UPI. Realistic path:
  **rely on Apple/Google IAP only for India** (they handle local payment methods and tax), and
  treat a local processor (Razorpay etc.) as a later addition if you ever need web-based checkout
  there.

### Legal/compliance
- **⚖️ India's Digital Personal Data Protection Act (DPDP) 2023** — get local counsel here too.
  Health data handling expectations differ from UK GDPR even though the *shape* of what you built
  (consent gate, T&C versioning, health profile) transfers reasonably well.
- Check whether India-specific food/health regulatory bodies (FSSAI for food-related claims) apply
  to how verdicts/warnings are worded for an Indian audience.
- Currency, tax (GST) handling in Play Console/App Store Connect for the Indian storefront.

### Infrastructure
- Current Terraform (`terraform/variables.tf`) has **no country/market dimension** — `env` is only
  `dev`/`staging`/`prod` in a single hardcoded `eu-west-2` region. Before India, extend the
  Terraform to be parameterized by **country** as well as env (e.g. a `country` variable driving
  `aws_region` — `ap-south-1` for India — plus separate Cognito pools/DynamoDB tables per country)
  so UK and India user data stay in separate regions/tables rather than being force-fit into one
  London-only stack. This is a real infra change, not just a new `.tfvars` file.
- Extend `src/config/environment.ts`'s single env-dimension config (`dev`/`staging`/`prod`) to a
  second **market** dimension (e.g. `uk`/`in`) so API endpoints, price/product data sources, and
  legal doc versions can vary by country without branching the whole app.

### Localization
- Language: decide if UK-English-only is acceptable for an India v1, or if Hindi (at minimum) is
  needed for target reach.
- App Store/Play Store metadata, screenshots, and support content localized per market.

---

## Phase 7 — Framework for adding country #3+ (Month 8+)

Once India is live, generalize what you learned into a repeatable "new country" checklist rather
than reinventing it each time: a country config object (currency, product data source, price data
source, payment method, legal doc set, AWS region/data residency, language), a Terraform module
parameterized by country, and a go/no-go checklist covering data source viability, legal review,
and payment method support — check each new country against that list before committing engineering
time.

---

## Immediate next 2 weeks — concrete checklist

- [ ] Trushil + Jaimin: agree equity/role split, in writing
- [ ] Rotate the committed Anthropic/Trolley API keys (today)
- [ ] Init git, push to a shared private repo
- [ ] Add Jaimin to AWS (IAM user), Anthropic Console, and set up shared password manager for
      future accounts (Apple/Google/Stripe)
- [ ] Start UK Ltd company incorporation
- [ ] Book an initial call with a solicitor re: SaMD classification — this has the longest lead
      time of anything on this list if it turns out you need a regulatory pathway
- [ ] Fix `photoScanService.ts` mock bug, decide `admin/index.html` fate
- [ ] Walk the full app on a real device together, end to end, and write down every rough edge you
      hit — that list becomes your real Week 2–6 backlog alongside [Known Issues](KNOWN_ISSUES.md)
