// src/services/appConfigService.ts
// Remote app-config: admin-controlled min app version, per-feature kill
// switches, daily scan limit ceiling. Backed by a public, unauthenticated
// GET endpoint — safe to call before login.
//
// Mostly fail-open by design: most failures (network, parse, timeout) fall
// back to DEFAULT_APP_CONFIG below, which mirrors the backend's own mostly-
// fail-open shape (most features enabled, a permissive min version, the
// standard scan limit) — except photoScanEnabled/alternativesEnabled, which
// default off since those features aren't launched yet (see each flag's own
// comment). This must never throw and must never block app startup.

import Config from '../config/environment';

export interface AppConfig {
  minVersionIOS: string;
  minVersionAndroid: string;
  dailyScanLimit: number;
  priceComparisonEnabled: boolean;
  aiAnalysisEnabled: boolean;
  photoScanEnabled: boolean;
  documentUploadEnabled: boolean;
  foodDiaryEnabled: boolean;
  wishlistEnabled: boolean;
  // "Healthier Alternatives" (ProductScreen's ranked-substitute section) —
  // not launched yet. Defaults false, unlike every flag above.
  alternativesEnabled: boolean;
  // Global membership/paywall kill switch, admin-controlled (see
  // AppConfig's comment in terraform/dynamodb.tf). false means every user
  // gets full member-level access for free and the app never shows a
  // purchase flow — see AuthContext's isMember and SubscriptionScreen.
  paymentsEnabled: boolean;
  // Which billing periods the purchase flow offers, admin-controlled — e.g.
  // launch monthly-only and turn yearly on later without an app release.
  // See SubscriptionScreen, which hides the period toggle when only one is
  // enabled. Never affects an existing member's ability to manage a plan
  // they already bought on the now-disabled period.
  monthlyPlanEnabled: boolean;
  yearlyPlanEnabled: boolean;
}

// Kept in sync with dailyAccessService.ts's DAILY_SCAN_LIMIT (=3) — see the
// comment there. Every flag defaults to enabled and the min versions default
// to '0.0.0' (nothing is ever below it) so a config fetch failure never
// blocks or degrades the app.
//
// aiAnalysisEnabled/documentUploadEnabled/foodDiaryEnabled default OFF
// (alongside the already-off photoScanEnabled) following Google Play's
// rejection over the "Health apps" developer-account requirement — these are
// the health-profile-personalised/medical-document/health-data-sync features
// that put the app in that category. This is only the fail-open FALLBACK
// used when the remote config fetch fails; the live switch is the admin
// dashboard (admin/index.html), which must also have these turned off for
// the change to take effect for the currently-installed app.
export const DEFAULT_APP_CONFIG: AppConfig = {
  minVersionIOS: '0.0.0',
  minVersionAndroid: '0.0.0',
  dailyScanLimit: 3,
  priceComparisonEnabled: true,
  aiAnalysisEnabled: false,
  photoScanEnabled: false,
  documentUploadEnabled: false,
  foodDiaryEnabled: false,
  wishlistEnabled: true,
  alternativesEnabled: false,
  paymentsEnabled: true,
  monthlyPlanEnabled: true,
  yearlyPlanEnabled: true,
};

const FETCH_TIMEOUT_MS = 5000;

// Plain fetch (not apiClient) — this is a single best-effort GET on app
// startup. apiClient's retry/backoff (up to 3 retries, exponential delay)
// could hold the splash screen up for many seconds on a flaky network;
// here we want one fast attempt with a short timeout and an immediate,
// safe fallback instead.
export async function fetchAppConfig(): Promise<AppConfig> {
  const url = Config.appConfigUrl;
  if (!url) return DEFAULT_APP_CONFIG;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!response.ok) return DEFAULT_APP_CONFIG;

    const json = await response.json();
    // Merge over the defaults so a partially-old backend response (missing
    // a newer field) still yields sane values for anything it omits.
    return { ...DEFAULT_APP_CONFIG, ...json };
  } catch {
    return DEFAULT_APP_CONFIG;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Hand-rolled dot-separated numeric version comparison — intentionally
// simple, no semver library. Missing segments are treated as 0.
export function isVersionBelow(current: string, minimum: string): boolean {
  const currentParts = current.split('.').map(n => parseInt(n, 10) || 0);
  const minimumParts = minimum.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(currentParts.length, minimumParts.length);

  for (let i = 0; i < len; i++) {
    const c = currentParts[i] ?? 0;
    const m = minimumParts[i] ?? 0;
    if (c < m) return true;
    if (c > m) return false;
  }
  return false;
}
