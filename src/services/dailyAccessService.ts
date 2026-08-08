// src/services/dailyAccessService.ts
// Free-tier throttle: 3 free scans per account per calendar day (UTC, server
// clock — see consume_daily_scan in terraform/appsync.tf). While today's
// count is above 0, every member-only feature (Personal Score, lowest-price
// reveal, wishlist) is unlocked too — scanning is what's rationed, not each
// feature separately. Members never hit this; they're never capped.
//
// Security note: the remaining count is only ever decremented server-side
// via the consumeDailyScan mutation (an atomic, identity-scoped DynamoDB
// UpdateItem keyed to "{sub}#{today}" — the server computes both the
// identity and the date, so nothing here is client-settable).

import { graphqlRequest } from './userDataService';
import logger from '../utils/logger';

// Fallback default only — AuthContext now sources the real, admin-configurable
// limit from useAppConfig().config.dailyScanLimit (see AppConfigContext.tsx).
// This constant lives on as the value baked into DEFAULT_APP_CONFIG.dailyScanLimit
// (appConfigService.ts) and as this file's own read-failure fallback below —
// keep both in sync with this value if it ever changes.
export const DAILY_SCAN_LIMIT = 3;

const GET_MY_DAILY_SCANS_REMAINING = /* GraphQL */ `
  query GetMyDailyScansRemaining {
    getMyDailyScansRemaining
  }
`;

// Read-only — does not consume anything. Used to decide whether member
// features should be unlocked right now, without using up a scan.
export async function fetchDailyScansRemaining(): Promise<number> {
  try {
    const data = await graphqlRequest(GET_MY_DAILY_SCANS_REMAINING, {});
    return typeof data.getMyDailyScansRemaining === 'number' ? data.getMyDailyScansRemaining : DAILY_SCAN_LIMIT;
  } catch (err) {
    logger.warn('dailyAccess', 'Failed to fetch daily scans remaining', {}, err as Error);
    return DAILY_SCAN_LIMIT; // don't fabricate a lock the server never applied
  }
}

const CONSUME_DAILY_SCAN = /* GraphQL */ `
  mutation ConsumeDailyScan {
    consumeDailyScan
  }
`;

// Consumes one of today's 3 free scans. Returns the remaining count AFTER
// this use (0 once exhausted), or null if the request failed — a network
// failure means the server never actually decremented anything, so the
// caller should leave its last-known local count untouched.
export async function consumeDailyScan(): Promise<number | null> {
  try {
    const data = await graphqlRequest(CONSUME_DAILY_SCAN, {});
    return typeof data.consumeDailyScan === 'number' ? data.consumeDailyScan : null;
  } catch (err) {
    logger.warn('dailyAccess', 'Failed to consume daily scan', {}, err as Error);
    return null;
  }
}
