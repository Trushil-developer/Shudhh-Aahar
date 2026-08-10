// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser, signInWithGoogle, signOut as authSignOut, UserProfile } from '../services/authService';
import { createUserRecord, fetchUserProfile, HealthProfile, DEFAULT_HEALTH_PROFILE } from '../services/userDataService';
import { getSubscriptionState, saveSubscriptionState, BillingPeriod } from '../services/subscriptionService';
import { DAILY_SCAN_LIMIT, fetchDailyScansRemaining, consumeDailyScan } from '../services/dailyAccessService';
import { useAppConfig } from './AppConfigContext';
import { AppError } from '../utils/AppError';

interface AuthContextType {
  user: UserProfile | null;
  healthProfile: HealthProfile;
  profileComplete: boolean;
  loading: boolean;
  isMember: boolean;
  // How many of today's 3 free scans are left (read-only — members always
  // report DAILY_SCAN_LIMIT here, since they're never capped). Personal
  // Score / lowest-price reveal / wishlist all check `isMember ||
  // dailyScansRemaining > 0` — scanning is the only thing that's metered;
  // once you're under the daily cap, every member feature is unlocked too.
  dailyScansRemaining: number;
  // Consumes one of today's 3 free scans and returns the remaining count
  // AFTER this use (0 once exhausted). Members never need to call this.
  consumeScan: () => Promise<number>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateHealthProfile: (profile: HealthProfile) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  healthProfile: DEFAULT_HEALTH_PROFILE,
  profileComplete: false,
  loading: true,
  isMember: false,
  dailyScansRemaining: DAILY_SCAN_LIMIT,
  consumeScan: async () => DAILY_SCAN_LIMIT,
  signIn: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
  updateHealthProfile: () => {},
});

// Server truth (User.planId/subscriptionStatus, written only by the
// server-side iap-verify Lambda) is authoritative for membership — this is
// what makes it durable across reinstalls/new devices, same fix as the T&C
// acceptance durability bug. The one exception: right after a purchase, the
// server write may not have propagated back through GET_USER yet, so if the
// server says "not a member" but the local cache claims an still-unexpired
// membership, trust the local cache instead of forcing a false downgrade.
async function resolveMembership(dbUser: any): Promise<boolean> {
  const serverIsMember = dbUser?.planId === 'member'
    && (dbUser?.subscriptionStatus === 'active' || dbUser?.subscriptionStatus === 'trialing');

  if (serverIsMember) {
    // Backfill local cache so isMember reads stay correct offline, without
    // needing a network call every time.
    const local = await getSubscriptionState();
    await saveSubscriptionState({
      ...local,
      planId: 'member',
      billingPeriod: (dbUser.billingPeriod as BillingPeriod) || null,
      status: dbUser.subscriptionStatus,
      currentPeriodEnd: dbUser.subscriptionPeriodEnd,
      cancelAtPeriodEnd: false,
    });
    return true;
  }

  // This fallback exists for a narrow window right after a purchase: the
  // server write may not have propagated back through GET_USER yet, so a
  // fresh local cache claiming membership should win over a stale server
  // read. It must NOT win over a server response that reflects a genuine,
  // deliberate change (admin revocation, refund, expiry) — but the cache
  // alone can't tell "AppSync hasn't caught up yet (seconds)" apart from
  // "this membership was cancelled months before its original expiry and
  // nothing has invalidated the old cache since" (currentPeriodEnd is the
  // ORIGINAL purchase's end date, unrelated to when it was cancelled).
  // Bounding by how recently the cache was written — not by the
  // subscription's own end date — is what actually distinguishes the two:
  // real replication lag is seconds, not indefinite.
  const GRACE_WINDOW_MS = 5 * 60 * 1000;
  const local = await getSubscriptionState();
  const cacheIsFresh = !!local.cachedAt && (Date.now() - new Date(local.cachedAt).getTime()) < GRACE_WINDOW_MS;
  const localStillValid = cacheIsFresh
    && local.planId === 'member'
    && !!local.currentPeriodEnd
    && new Date(local.currentPeriodEnd).getTime() > Date.now();
  return localStillValid;
}

// Thrown from signIn() when the account has been banned via the admin
// dashboard — LoginScreen shows the translated errors.accountBanned message
// even in production builds.
function bannedError(): AppError {
  return new AppError('accountBanned', 'Account is banned');
}

function sanitiseProfile(raw: Partial<HealthProfile>): HealthProfile {
  return {
    ...DEFAULT_HEALTH_PROFILE,
    ...raw,
    allergies:           raw.allergies           ?? [],
    intolerances:        raw.intolerances         ?? [],
    conditions:          raw.conditions           ?? [],
    medications:         raw.medications          ?? [],
    dietaryRestrictions: raw.dietaryRestrictions  ?? [],
    healthGoals:         raw.healthGoals          ?? [],
    testResults:         raw.testResults          ?? [],
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Real, admin-configurable daily scan limit — sourced from the remote
  // app-config (see AppConfigContext.tsx). Requires AppConfigProvider to be
  // an ancestor of AuthProvider in App.tsx (it is — AppConfigProvider wraps
  // AuthProvider, not just AppNavigator). DAILY_SCAN_LIMIT (dailyAccessService.ts)
  // remains only as this module's own fallback default (used above in
  // createContext, before any provider/hook runs).
  const { config: appConfig } = useAppConfig();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [healthProfile, setHealthProfile] = useState<HealthProfile>(DEFAULT_HEALTH_PROFILE);
  const [profileComplete, setProfileComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [dailyScansRemaining, setDailyScansRemaining] = useState(appConfig.dailyScanLimit);

  // Members are never capped — skip the network call entirely for them.
  const refreshDailyScans = async (member: boolean) => {
    setDailyScansRemaining(member ? appConfig.dailyScanLimit : await fetchDailyScansRemaining());
  };

  // Global payment kill switch (admin-controlled, see AppConfig's comment in
  // terraform/dynamodb.tf) — when off, every signed-in user is treated as a
  // member regardless of any real purchase, and the real resolveMembership
  // check (server truth + grace-window cache fallback) is skipped entirely.
  // Fails safe: appConfig.paymentsEnabled defaults to true, so a config-fetch
  // failure never accidentally grants free membership app-wide.
  const resolveEffectiveMembership = async (dbUser: any): Promise<boolean> => {
    if (appConfig.paymentsEnabled === false) return true;
    return resolveMembership(dbUser);
  };

  const loadUser = async () => {
    // Anything below can throw (network, AsyncStorage — e.g. resolveMembership's
    // saveSubscriptionState write, a real documented failure mode on Android
    // storage limits/disk full). Without a catch/finally here, that throw would
    // skip setLoading(false) entirely and leave the splash screen up forever,
    // with no error and no retry. `user` is deliberately left untouched in the
    // catch (not forced to null) — if the throw happens after setUser(currentUser)
    // already ran below, resetting it here would sign out someone who
    // successfully authenticated just because an unrelated step failed.
    try {
      const currentUser = await getCurrentUser();
      if (currentUser) {
        // Create record in DynamoDB if first time
        await createUserRecord(currentUser.id, currentUser.email, currentUser.name);
        // Fetch their health profile
        const dbUser = await fetchUserProfile(currentUser.id);
        if (dbUser?.banned) {
          // Banned since their last session — sign them out silently rather
          // than dropping them into the app.
          await authSignOut();
          setUser(null);
          setHealthProfile(DEFAULT_HEALTH_PROFILE);
          setProfileComplete(false);
          return;
        }
        setUser(currentUser);
        if (dbUser?.healthProfile) {
          setHealthProfile(sanitiseProfile(dbUser.healthProfile));
          setProfileComplete(dbUser.profileComplete || false);
        }
        const member = await resolveEffectiveMembership(dbUser);
        setIsMember(member);
        await refreshDailyScans(member);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('loadUser failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    const currentUser = await signInWithGoogle();
    await createUserRecord(currentUser.id, currentUser.email, currentUser.name);
    const dbUser = await fetchUserProfile(currentUser.id);
    if (dbUser?.banned) {
      await authSignOut();
      throw bannedError();
    }
    setUser(currentUser);
    if (dbUser?.healthProfile) {
      setHealthProfile(sanitiseProfile(dbUser.healthProfile));
      setProfileComplete(dbUser.profileComplete || false);
    }
    const member = await resolveEffectiveMembership(dbUser);
    setIsMember(member);
    await refreshDailyScans(member);
  };

  const signOut = async () => {
    await authSignOut();
    setUser(null);
    setHealthProfile(DEFAULT_HEALTH_PROFILE);
    setProfileComplete(false);
    setIsMember(false);
    setDailyScansRemaining(appConfig.dailyScanLimit);
  };

  const refreshProfile = async () => {
    if (user) {
      const dbUser = await fetchUserProfile(user.id);
      if (dbUser?.healthProfile) {
        setHealthProfile(sanitiseProfile(dbUser.healthProfile));
        setProfileComplete(dbUser.profileComplete || false);
      }
      const member = await resolveEffectiveMembership(dbUser);
      setIsMember(member);
      await refreshDailyScans(member);
    }
  };

  // Returns the remaining count AFTER this use (0 once exhausted). Members
  // never need to call this — check isMember first.
  const consumeScan = async (): Promise<number> => {
    const after = await consumeDailyScan();
    if (after !== null) setDailyScansRemaining(after);
    return after ?? dailyScansRemaining;
  };

  const updateHealthProfile = (profile: HealthProfile) => {
    setHealthProfile(sanitiseProfile(profile));
    setProfileComplete(true);
  };

  useEffect(() => {
    // Restores a previous native Google session silently, if one exists.
    loadUser();
  }, []);

  // Re-resolve membership whenever the payments kill switch's real value
  // changes. appConfig starts at DEFAULT_APP_CONFIG (paymentsEnabled: true,
  // fail-open) and fetchAppConfig() resolves asynchronously — loadUser()'s
  // own resolveEffectiveMembership call above closes over whatever appConfig
  // was at mount time, so if the real config (payments off) lands after that
  // call already ran, isMember is stuck showing "Become a Member" for a real
  // signed-in user even though the kill switch is on. This effect re-checks
  // once the config settles (or changes) and once the user is available,
  // so the free-for-everyone state always converges.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const dbUser = await fetchUserProfile(user.id);
      const member = await resolveEffectiveMembership(dbUser);
      setIsMember(member);
      await refreshDailyScans(member);
    })();
  }, [appConfig.paymentsEnabled, user?.id]);

  return (
    <AuthContext.Provider value={{ user, healthProfile, profileComplete, loading, isMember, dailyScansRemaining, consumeScan, signIn, signOut, refreshProfile, updateHealthProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
