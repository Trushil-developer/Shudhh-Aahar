// src/services/subscriptionService.ts
// Membership — Free / Member (£3.99/month or £50/year, same perks either way)
// Free tier gets 3 free scans per calendar day; while under that daily cap,
// every member-only feature (Personal Score, lowest-price reveal, wishlist)
// is unlocked too — scanning is what's rationed, not each feature
// separately. See src/services/dailyAccessService.ts + AuthContext's
// dailyScansRemaining/consumeScan for that system. This file only owns
// plan/pricing data and the IAP purchase flow, not feature gating.
// Payments via Apple IAP + Google Play Billing, verified server-side (iap-verify Lambda)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Linking } from 'react-native';
import logger from '../utils/logger';
import errorReporter from '../utils/errorReporter';
import { Colors } from '../theme/medical';
import Config from '../config/environment';
import { getAuthToken } from './authService';

// ─── Plan definitions ──────────────────────────────────────

export type PlanId = 'free' | 'member';
export type BillingPeriod = 'monthly' | 'yearly';

export interface PlanPricing {
  price: number;           // GBP
  priceDisplay: string;
  appleProductId: string;
  googleProductId: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  colour: string;
  features: PlanFeature[];
  limits: PlanLimits;
  // Only present on the 'member' plan — one entry per billing period.
  // Placeholder product IDs — the user must create matching subscription
  // products with these exact IDs in App Store Connect / Google Play Console
  // before real purchases can succeed.
  pricing?: Record<BillingPeriod, PlanPricing>;
}

export interface PlanFeature {
  label: string;
  included: boolean;
  note?: string;
}

// Personal Score / lowest-price reveal / wishlist / scanning are NOT here —
// those 4 are gated by the daily scan throttle (isMember || dailyScansRemaining
// > 0, from AuthContext), not a static per-plan boolean, since free accounts
// get full access on any day they haven't used all 3 free scans yet.
export interface PlanLimits {
  aiAnalysis: boolean;
  priceComparison: boolean;
  foodDiary: boolean;
  photoScan: boolean;
  healthKitSync: boolean;
  documentUpload: boolean;
  familyProfiles: number;
  weeklyReport: boolean;
  prioritySupport: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: '3 free scans a day, every feature unlocked',
    colour: Colors.textMuted,
    limits: {
      aiAnalysis: true,
      priceComparison: true,
      foodDiary: false,
      photoScan: false,
      healthKitSync: false,
      documentUpload: true,
      familyProfiles: 1,
      weeklyReport: false,
      prioritySupport: false,
    },
    features: [
      { label: 'Ingredients & allergens', included: true },
      { label: 'General product score', included: true },
      { label: 'Price comparison', included: true },
      { label: '3 free scans a day', included: true },
      { label: 'Personal Score, lowest price & Price Tracker', included: true, note: 'on your 3 free scans' },
      { label: 'Unlimited scans', included: false },
    ],
  },

  member: {
    id: 'member',
    name: 'Member',
    tagline: 'Full access, every feature',
    colour: Colors.navy,
    pricing: {
      monthly: { price: 3.99, priceDisplay: '£3.99', appleProductId: 'com.shuddhaahar.member.monthly', googleProductId: 'shuddhaahar_member_monthly' },
      yearly:  { price: 50, priceDisplay: '£50', appleProductId: 'com.shuddhaahar.member.yearly', googleProductId: 'shuddhaahar_member_yearly' },
    },
    limits: {
      aiAnalysis: true,
      priceComparison: true,
      foodDiary: true,
      // Not launched yet — see FeatureGate/AppConfig's photoScanEnabled,
      // which is the real (currently off) gate; this stays in sync with
      // that so this metadata never claims an entitlement nobody has.
      photoScan: false,
      healthKitSync: true,
      documentUpload: true,
      familyProfiles: 1,
      weeklyReport: false,
      prioritySupport: false,
    },
    features: [
      { label: 'Personal Score for every product', included: true },
      { label: 'See the lowest price across supermarkets', included: true },
      { label: 'Unlimited scans', included: true },
      { label: 'Add products to your Price Tracker', included: true },
      { label: 'AI health analysis', included: true },
      { label: 'Document upload (AI)', included: true },
      { label: 'Apple Health / Google Fit sync', included: true },
    ],
  },
};

// ─── Subscription state ────────────────────────────────────

export interface SubscriptionState {
  planId: PlanId;
  billingPeriod: BillingPeriod | null;   // null when planId === 'free'
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  platform: 'ios' | 'android' | 'web' | 'none';
  // When this local copy was last written — used to bound how long
  // AuthContext's resolveMembership will trust it over a fresh server "not a
  // member" response (see the comment there). Set by saveSubscriptionState
  // itself, not callers, so every write is stamped correctly regardless of
  // what the caller passes in.
  cachedAt?: string;
}

const SUB_KEY = 'shuddhaahar_subscription';

export async function getSubscriptionState(): Promise<SubscriptionState> {
  try {
    const raw = await AsyncStorage.getItem(SUB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old plan IDs forward
      if (parsed.planId === 'pro' || parsed.planId === 'max' || parsed.planId === 'essential') {
        parsed.planId = 'member';
      }
      if (parsed.billingPeriod === undefined) parsed.billingPeriod = null;
      return parsed;
    }
  } catch { /* ignore */ }
  return {
    planId: 'free',
    billingPeriod: null,
    status: 'none',
    cancelAtPeriodEnd: false,
    platform: 'none',
  };
}

export async function saveSubscriptionState(state: SubscriptionState): Promise<void> {
  await AsyncStorage.setItem(SUB_KEY, JSON.stringify({ ...state, cachedAt: new Date().toISOString() }));
}

// ─── StoreKit / Play Billing connection lifecycle ───────────
// react-native-iap requires initConnection() to resolve before ANY other
// call (requestPurchase, requestSubscription, getAvailablePurchases) will
// work — without it, every purchase attempt fails immediately at the native
// layer, before ever reaching purchaseSubscription() below or the
// iap-verify backend. Called once at app startup (see App.tsx); there's no
// matching endConnection() call since this app never tears down its root
// for the lifetime of the process.
export async function initIAPConnection(): Promise<void> {
  try {
    const { initConnection } = require('react-native-iap');
    await initConnection();
    logger.info('subscription', 'IAP connection initialised');
  } catch (err) {
    logger.error('subscription', 'IAP initConnection failed', err as Error);
  }
}

// ─── Purchase flow ─────────────────────────────────────────
// Purchases are verified server-side by the iap-verify Lambda (see
// terraform/lambda/iap-verify.js) — the client's own report of "purchase
// succeeded" is never trusted to grant membership by itself. The Lambda is
// the sole writer of planId/subscriptionStatus on the User record.

export async function purchaseSubscription(
  billingPeriod: BillingPeriod,
): Promise<{ success: boolean; error?: string }> {
  const plan = PLANS.member;

  try {
    if (Platform.OS === 'ios') {
      return await purchaseAppleIAP(plan, billingPeriod);
    } else {
      return await purchaseGooglePlay(plan, billingPeriod);
    }
  } catch (err) {
    await errorReporter.captureError(err as Error, {
      type: 'api', severity: 'high', tags: { plan: 'member', billingPeriod },
    });
    return { success: false, error: 'Purchase failed. Please try again.' };
  }
}

async function purchaseAppleIAP(plan: Plan, billingPeriod: BillingPeriod): Promise<{ success: boolean; error?: string }> {
  const pricing = plan.pricing![billingPeriod];
  try {
    const { requestPurchase, finishTransaction, getSubscriptions } = require('react-native-iap');
    // requestPurchase's native iOS implementation looks the sku up in a
    // local `validProducts` cache that's populated ONLY by a prior
    // getSubscriptions()/getProducts() call — without this, buyProduct
    // rejects immediately with "Invalid product ID" (E_DEVELOPER_ERROR)
    // before StoreKit's payment sheet ever appears and before this ever
    // reaches verifyPurchaseWithBackend below.
    const fetched = await getSubscriptions({ skus: [pricing.appleProductId] });
    if (!fetched?.length) {
      // Product genuinely not found in App Store Connect (missing, not yet
      // approved, or Paid Applications Agreement not active) — surface that
      // clearly instead of letting requestPurchase fail with a native
      // "Invalid product ID" error that gives the user no useful signal.
      await errorReporter.captureError(new Error(`App Store returned no product for ${pricing.appleProductId}`), {
        type: 'api', severity: 'high', tags: { plan: 'member', billingPeriod },
      });
      return { success: false, error: 'This plan is not currently available. Please try again shortly.' };
    }
    const purchase = await requestPurchase({ sku: pricing.appleProductId });

    const validation = await verifyPurchaseWithBackend({
      platform: 'ios', productId: pricing.appleProductId,
      receipt: (purchase as any).transactionReceipt,
    });

    if (validation.success) {
      await finishTransaction({ purchase, isConsumable: false });
      const newState: SubscriptionState = {
        planId: 'member',
        billingPeriod: validation.billingPeriod || billingPeriod,
        status: validation.status,
        trialEndsAt: validation.trialEndsAt,
        currentPeriodEnd: validation.currentPeriodEnd,
        cancelAtPeriodEnd: false,
        platform: 'ios',
      };
      await saveSubscriptionState(newState);
      logger.info('subscription', 'Apple IAP success: member', { billingPeriod });
      return { success: true };
    }
    return { success: false, error: validation.error };
  } catch (err: any) {
    if (err.code === 'E_USER_CANCELLED') return { success: false, error: 'Purchase cancelled' };
    throw err;
  }
}

async function purchaseGooglePlay(plan: Plan, billingPeriod: BillingPeriod): Promise<{ success: boolean; error?: string }> {
  const pricing = plan.pricing![billingPeriod];
  try {
    const { requestSubscription, getSubscriptions } = require('react-native-iap');
    // Same prerequisite as purchaseAppleIAP above, plus Google Play Billing
    // (v5+) requires an explicit offerToken per sku — there's no default —
    // which only comes from this same getSubscriptions() call's
    // subscriptionOfferDetails. Skipping it means requestSubscription has
    // nothing valid to send and fails before ever reaching Play Billing.
    const [subscription] = await getSubscriptions({ skus: [pricing.googleProductId] });
    const offerToken = subscription?.subscriptionOfferDetails?.[0]?.offerToken;
    if (!offerToken) {
      return { success: false, error: 'This plan is not currently available. Please try again shortly.' };
    }
    const purchase = await requestSubscription({
      sku: pricing.googleProductId,
      subscriptionOffers: [{ sku: pricing.googleProductId, offerToken }],
    });

    const validation = await verifyPurchaseWithBackend({
      platform: 'android', productId: pricing.googleProductId,
      receipt: (purchase as any).purchaseToken,
    });

    if (validation.success) {
      const newState: SubscriptionState = {
        planId: 'member',
        billingPeriod: validation.billingPeriod || billingPeriod,
        status: validation.status,
        trialEndsAt: validation.trialEndsAt,
        currentPeriodEnd: validation.currentPeriodEnd,
        cancelAtPeriodEnd: false,
        platform: 'android',
      };
      await saveSubscriptionState(newState);
      logger.info('subscription', 'Google Play success: member', { billingPeriod });
      return { success: true };
    }
    return { success: false, error: validation.error };
  } catch (err: any) {
    if (err.code === 'E_USER_CANCELLED') return { success: false, error: 'Purchase cancelled' };
    throw err;
  }
}

// Real server-side verification — the Lambda checks the receipt against
// Apple/Google directly and is the only thing that writes membership status
// to the User record (see terraform/iap_verify.tf). The Lambda verifies the
// caller's own Google ID token (same one AppSync calls already send via
// getAuthToken()/graphqlRequest()) to determine whose account to credit —
// it does not accept or trust a client-supplied userId, so there's nothing
// to pass here for identity.
async function verifyPurchaseWithBackend(data: {
  platform: 'ios' | 'android'; productId: string; receipt: string;
}): Promise<{
  success: boolean; status: SubscriptionState['status']; billingPeriod?: BillingPeriod;
  trialEndsAt?: string; currentPeriodEnd?: string; error?: string;
}> {
  const idToken = await getAuthToken();
  if (!idToken) return { success: false, status: 'none', error: 'Please sign in again and retry your purchase.' };

  const res = await fetch(Config.iapVerifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: idToken },
    body: JSON.stringify(data),
  });
  return res.json();
}

// ─── Restore purchases ─────────────────────────────────────

export async function restorePurchases(): Promise<{ success: boolean; planId?: PlanId }> {
  try {
    const { getAvailablePurchases } = require('react-native-iap');
    const purchases = await getAvailablePurchases();
    if (!purchases?.length) return { success: false };

    const latest = purchases[purchases.length - 1];
    const validation = await verifyPurchaseWithBackend({
      platform: Platform.OS as 'ios' | 'android',
      productId: latest.productId,
      receipt: latest.transactionReceipt || latest.purchaseToken,
    });

    if (validation.success) {
      const newState: SubscriptionState = {
        planId: 'member',
        billingPeriod: validation.billingPeriod || null,
        status: validation.status,
        currentPeriodEnd: validation.currentPeriodEnd,
        cancelAtPeriodEnd: false,
        platform: Platform.OS as 'ios' | 'android',
      };
      await saveSubscriptionState(newState);
      return { success: true, planId: 'member' };
    }
    return { success: false };
  } catch (err) {
    logger.error('subscription', 'Restore failed', err as Error);
    return { success: false };
  }
}

// ─── Cancel subscription ───────────────────────────────────
// Apple/Google require subscription cancellation to go through their own
// native subscription-management UI, not a bespoke in-app flow — so this
// just deep-links there rather than calling any backend.

export function openManageSubscription(): Promise<any> {
  const url = Platform.OS === 'ios'
    ? 'itms-apps://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
  return Linking.openURL(url);
}

export function getPlan(planId: PlanId): Plan {
  return PLANS[planId];
}

export function getCurrentPlan(state: SubscriptionState): Plan {
  return PLANS[state.planId];
}
