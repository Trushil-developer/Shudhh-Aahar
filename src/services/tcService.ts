// src/services/tcService.ts
// Terms & Conditions version tracking system
//
// Flow:
//   Admin bumps T&C version in admin panel
//   → Version is stored in your API (or AsyncStorage for demo)
//   → On every app open after login, app fetches current version
//   → Compares against the version user last accepted
//   → If different → shows blocking TCConsentModal
//   → User must scroll to bottom AND tap "I Accept" to continue
//   → Acceptance is recorded with version, timestamp, user ID, IP

import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from '../utils/logger';
import errorReporter from '../utils/errorReporter';
import Config from '../config/environment';
import { graphqlRequest } from './userDataService';
import { AppError } from '../utils/AppError';

// ─── Types ────────────────────────────────────────────────────

export interface TCVersion {
  version: string;         // semantic: "1.0.0", "1.1.0", "2.0.0"
  publishedAt: string;     // ISO date
  summary: string;         // one-line change summary shown in modal header
  changes: string[];       // bullet list of what changed
  requiresReAcceptance: boolean;  // admin can bump version without forcing modal (minor fixes)
  fullText: string;        // the complete T&C text to display
}

export interface TCAcceptance {
  userId: string;
  version: string;
  acceptedAt: string;      // ISO datetime
  deviceInfo: string;
}

// ─── Storage keys ─────────────────────────────────────────────

const CURRENT_VERSION_KEY = 'shuddhaahar_tc_current_version';
const ACCEPTED_VERSION_KEY = 'shuddhaahar_tc_accepted_version';
const ACCEPTANCE_LOG_KEY   = 'shuddhaahar_tc_acceptance_log';

// ─── API endpoint ─────────────────────────────────────────────
// This endpoint is managed by your backend / admin panel
// When admin saves a new T&C version, it updates this endpoint

const TC_API = Config.tcApiUrl;
const TC_ACCEPT_API = `${Config.apiBaseUrl}/tc/accept`;

// ─── Hard-coded fallback (used when API unavailable) ──────────
// This matches the version in admin panel on first deploy

export const FALLBACK_TC: TCVersion = {
  version: '1.0.0',
  publishedAt: '2026-06-01T00:00:00.000Z',
  summary: 'Initial Terms of Service',
  changes: [],
  requiresReAcceptance: true,
  fullText: `SHUDDH AAHAR TERMS OF SERVICE

Last updated: 1 June 2026
Version: 1.0.0

By creating an account or using Shuddh Aahar, you agree to these Terms of Service.

1. SERVICE DESCRIPTION
Shuddh Aahar provides nutritional information, AI-assisted health guidance and local supermarket price comparison. It is an informational tool only and does not constitute medical advice, diagnosis or treatment.

2. ELIGIBILITY
You must be at least 13 years old to use Shuddh Aahar. By using the service, you confirm you meet this requirement.

3. SUBSCRIPTIONS & PAYMENT
The Member plan (£3.99/month or £50/year) includes a 7-day free trial for new subscribers. Subscriptions auto-renew unless cancelled at least 24 hours before the renewal date. Payments are processed by Apple (App Store) or Google (Play Store) in-app purchase — Shuddh Aahar never sees or stores your card details.

4. CANCELLATION & REFUNDS
You may cancel your subscription at any time. Access continues until the end of the paid period. Annual subscriptions may be refunded on a pro-rata basis within 14 days of purchase, in line with applicable consumer protection law in your market.

5. MEDICAL DISCLAIMER
Shuddh Aahar is NOT a medical device and does NOT provide medical advice. Information is for general informational purposes only. Always consult a qualified healthcare professional before making dietary changes, especially if you have a medical condition or take prescription medications.

6. ACCURACY DISCLAIMER
Product data is sourced from Open Food Facts and may not always be complete or up to date. Always verify allergen information against the physical product label before consumption.

7. HEALTH DATA & PRIVACY
Your health data is stored encrypted in AWS data centers. It is never sold or shared with third parties. You may request deletion at any time under applicable data protection law.

8. ACCEPTABLE USE
You agree not to: reverse engineer the app; attempt to access other users' data; use the service for commercial data scraping; or misuse our AI analysis systems.

9. LIMITATION OF LIABILITY
To the maximum extent permitted by law, Shuddh Aahar shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.

10. CHANGES TO TERMS
We may update these Terms from time to time. When we make material changes, you will be notified and required to accept the new Terms before continuing to use the app.

11. GOVERNING LAW
These terms are governed by English law. Disputes shall be subject to the exclusive jurisdiction of the English courts.

CONTACT
Shuddh Aahar
Email: info@shuddhaahar.shop`,
};

// ─── Fetch current T&C version from server ────────────────────

const GET_CURRENT_TC_VERSION = /* GraphQL */ `
  query GetCurrentTCVersion {
    getCurrentTCVersion {
      version
      publishedAt
      summary
      changes
      requiresReAcceptance
      fullText
    }
  }
`;

const GET_MY_TC_ACCEPTANCE = /* GraphQL */ `
  query GetMyTCAcceptance($userId: ID!, $version: String!) {
    getMyTCAcceptance(userId: $userId, version: $version) {
      acceptedAt
    }
  }
`;

// Server-side truth for "has this account already accepted this version?" —
// AsyncStorage alone doesn't survive a reinstall or a new device, so it can't
// be the only signal or a returning user gets wrongly re-prompted.
async function fetchServerTCAcceptance(userId: string, version: string): Promise<{ acceptedAt: string } | null> {
  const data = await graphqlRequest(GET_MY_TC_ACCEPTANCE, { userId, version });
  return data.getMyTCAcceptance || null;
}

export async function fetchCurrentTCVersion(): Promise<TCVersion> {
  try {
    const data = await graphqlRequest(GET_CURRENT_TC_VERSION, {});
    if (data.getCurrentTCVersion) {
      // Cache locally so we can check offline
      await AsyncStorage.setItem(CURRENT_VERSION_KEY, JSON.stringify(data.getCurrentTCVersion));
      logger.info('tc', `Fetched T&C version: ${data.getCurrentTCVersion.version}`);
      return data.getCurrentTCVersion;
    }
  } catch (err) {
    logger.warn('tc', 'Could not fetch T&C version from server — using cache', {}, err as Error);
  }

  // Try local cache
  try {
    const cached = await AsyncStorage.getItem(CURRENT_VERSION_KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }

  // Final fallback — built-in version
  return FALLBACK_TC;
}

// ─── Get the version the user last accepted ───────────────────

export async function getUserAcceptedVersion(userId: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(`${ACCEPTED_VERSION_KEY}_${userId}`);
    return raw ? JSON.parse(raw).version : null;
  } catch { return null; }
}

// ─── Check if user needs to accept (the core gate logic) ──────

export interface TCCheckResult {
  needsAcceptance: boolean;
  currentVersion: TCVersion;
  acceptedVersion: string | null;
  isFirstTime: boolean;       // never accepted any version
  isUpdate: boolean;          // accepted before but new version published
}

export async function checkTCAcceptance(userId: string): Promise<TCCheckResult> {
  const acceptedVersion = await getUserAcceptedVersion(userId);

  // Fast path: check against locally cached/fallback version without hitting the network.
  // This eliminates the 5s timeout delay on every login for returning users.
  if (acceptedVersion !== null) {
    let localVersion: TCVersion;
    try {
      const cached = await AsyncStorage.getItem(CURRENT_VERSION_KEY);
      localVersion = cached ? JSON.parse(cached) : FALLBACK_TC;
    } catch {
      localVersion = FALLBACK_TC;
    }

    if (acceptedVersion === localVersion.version) {
      logger.info('tc', 'T&C already accepted — skipping network check', { version: acceptedVersion });
      return {
        needsAcceptance: false,
        currentVersion: localVersion,
        acceptedVersion,
        isFirstTime: false,
        isUpdate: false,
      };
    }
  }

  // Slow path: first-time user or local version mismatch — fetch from network
  const currentVersion = await fetchCurrentTCVersion();
  const isFirstTime = acceptedVersion === null;
  const isUpdate    = !isFirstTime && acceptedVersion !== currentVersion.version;
  let needsAcceptance = (isFirstTime || isUpdate) && currentVersion.requiresReAcceptance;

  // Local storage says this device has never accepted the current version —
  // but the account might have accepted it on a different install (reinstall,
  // new device, cleared app data). Check the server before forcing the modal.
  if (needsAcceptance) {
    try {
      const serverAcceptance = await fetchServerTCAcceptance(userId, currentVersion.version);
      if (serverAcceptance) {
        needsAcceptance = false;
        // Backfill local cache so the next launch takes the fast path above.
        await AsyncStorage.setItem(
          `${ACCEPTED_VERSION_KEY}_${userId}`,
          JSON.stringify({ userId, version: currentVersion.version, acceptedAt: serverAcceptance.acceptedAt, deviceInfo: 'React Native' }),
        );
        logger.info('tc', 'T&C already accepted on another install — verified server-side', { version: currentVersion.version });
      }
    } catch (err) {
      // Offline or backend error — fall back to requiring local acceptance,
      // same as before this check existed.
      logger.warn('tc', 'Could not verify server-side T&C acceptance', {}, err as Error);
    }
  }

  logger.info('tc', 'T&C check (network)', {
    current: currentVersion.version,
    accepted: acceptedVersion,
    needsAcceptance,
  });

  return { needsAcceptance, currentVersion, acceptedVersion, isFirstTime, isUpdate };
}

// ─── Record acceptance ────────────────────────────────────────

const RECORD_TC_ACCEPTANCE = /* GraphQL */ `
  mutation RecordTCAcceptance($userId: ID!, $version: String!, $deviceInfo: String) {
    recordTCAcceptance(userId: $userId, version: $version, deviceInfo: $deviceInfo) {
      id
    }
  }
`;

export async function recordTCAcceptance(userId: string, version: TCVersion): Promise<void> {
  const acceptance: TCAcceptance = {
    userId,
    version: version.version,
    acceptedAt: new Date().toISOString(),
    deviceInfo: 'React Native',
  };

  // Store locally
  await AsyncStorage.setItem(
    `${ACCEPTED_VERSION_KEY}_${userId}`,
    JSON.stringify(acceptance),
  );

  // Append to local log
  try {
    const raw = await AsyncStorage.getItem(ACCEPTANCE_LOG_KEY);
    const log: TCAcceptance[] = raw ? JSON.parse(raw) : [];
    log.push(acceptance);
    await AsyncStorage.setItem(ACCEPTANCE_LOG_KEY, JSON.stringify(log));
  } catch { /* ignore */ }

  // Ship to server for legal audit trail
  try {
    await graphqlRequest(RECORD_TC_ACCEPTANCE, {
      userId, version: version.version, deviceInfo: acceptance.deviceInfo,
    });
  } catch (err) {
    // Non-fatal — local record is the backup
    logger.warn('tc', 'Could not ship T&C acceptance to server', {}, err as Error);
  }

  logger.info('tc', `T&C v${version.version} accepted by user ${userId}`);
}

// ─── Admin: push a new T&C version ───────────────────────────
// Called from admin panel when saving an updated T&C

export async function publishNewTCVersion(newVersion: TCVersion): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(TC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newVersion),
    });
    if (!res.ok) throw new AppError('httpError', `HTTP ${res.status}`, { status: res.status });
    logger.info('tc', `New T&C version published: ${newVersion.version}`);
    return { success: true };
  } catch (err) {
    await errorReporter.captureError(err as Error, { type: 'api', severity: 'high' });
    return { success: false, error: (err as Error).message };
  }
}

// ─── Compare versions ─────────────────────────────────────────
// Returns true if newVer is strictly newer than oldVer
// Uses semantic versioning: "2.0.0" > "1.9.9"

export function isNewerVersion(newVer: string, oldVer: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [nMaj, nMin, nPatch] = parse(newVer);
  const [oMaj, oMin, oPatch] = parse(oldVer);
  if (nMaj !== oMaj) return nMaj > oMaj;
  if (nMin !== oMin) return nMin > oMin;
  return nPatch > oPatch;
}

// ─── Get full acceptance log (for admin audit) ────────────────

export async function getAcceptanceLog(): Promise<TCAcceptance[]> {
  try {
    const raw = await AsyncStorage.getItem(ACCEPTANCE_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
