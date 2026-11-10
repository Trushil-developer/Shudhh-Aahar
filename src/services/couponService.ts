// src/services/couponService.ts
// Coupon Exchange — peer-to-peer sharing of unused supermarket checkout
// coupons (e.g. "£4 off a £30 shop"). One user uploads a photo of the
// coupon/barcode; another claims it exclusively (claiming removes it from
// everyone else's feed instantly — see claimCoupon's conditional write in
// terraform/lambda/coupon-actions.js); the claimant then reports back
// whether it worked, since no retailer exposes an API to verify a coupon's
// validity. See terraform/schema.graphql's Coupon type comment for the full
// feature rationale.
import { graphqlRequest } from './userDataService';
import logger from '../utils/logger';

// Only these retailers' coupons are accepted for now — mirrored by
// ALLOWED_RETAILERS in terraform/lambda/coupon-actions.js, which rejects
// anything else server-side.
export const RETAILERS = ['Tesco', 'Waitrose'] as const;
export type Retailer = typeof RETAILERS[number];

export type CouponStatus = 'AVAILABLE' | 'CLAIMED' | 'VALIDATED' | 'SCAM_REPORTED' | 'EXPIRED' | 'REMOVED';
export type ValidationResult = 'VALID' | 'SCAM' | 'NO_RESPONSE';
export type ScamReasonCode = 'FAKE_OR_INVALID' | 'ALREADY_REDEEMED' | 'OTHER';

export interface Coupon {
  id: string;
  uploaderId: string;
  retailer: string;
  title?: string | null;
  codeText?: string | null;
  imageKey?: string | null;
  validFrom?: string | null;
  expiryAt: string;
  status: CouponStatus;
  claimedBy?: string | null;
  claimedAt?: string | null;
  claimExpiryAt?: string | null;
  validationResult?: ValidationResult | null;
  validationReasonCode?: ScamReasonCode | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CouponStanding {
  couponPoints: number;
  couponStrikes: number;
  couponBanned: boolean;
  couponFlakeCount: number;
}

const COUPON_FIELDS = `
  id uploaderId retailer title codeText imageKey validFrom expiryAt status
  claimedBy claimedAt claimExpiryAt validationResult validationReasonCode
  createdAt updatedAt
`;

// ─── Queries ───────────────────────────────────────────────────

const LIST_AVAILABLE_COUPONS = /* GraphQL */ `
  query ListAvailableCoupons($nextToken: String) {
    listAvailableCoupons(nextToken: $nextToken) { items { ${COUPON_FIELDS} } nextToken }
  }
`;

export async function listAvailableCoupons(nextToken?: string): Promise<{ items: Coupon[]; nextToken?: string }> {
  const data = await graphqlRequest(LIST_AVAILABLE_COUPONS, { nextToken });
  // Coupons listed before the Tesco/Waitrose-only rule can still be in the
  // table, so keep them out of the shared feed.
  const page = data.listAvailableCoupons;
  return { ...page, items: page.items.filter((c: Coupon) => (RETAILERS as readonly string[]).includes(c.retailer)) };
}

const LIST_MY_UPLOADED_COUPONS = /* GraphQL */ `
  query ListMyUploadedCoupons($nextToken: String) {
    listMyUploadedCoupons(nextToken: $nextToken) { items { ${COUPON_FIELDS} } nextToken }
  }
`;

export async function listMyUploadedCoupons(nextToken?: string): Promise<{ items: Coupon[]; nextToken?: string }> {
  const data = await graphqlRequest(LIST_MY_UPLOADED_COUPONS, { nextToken });
  return data.listMyUploadedCoupons;
}

const LIST_MY_CLAIMED_COUPONS = /* GraphQL */ `
  query ListMyClaimedCoupons($nextToken: String) {
    listMyClaimedCoupons(nextToken: $nextToken) { items { ${COUPON_FIELDS} } nextToken }
  }
`;

export async function listMyClaimedCoupons(nextToken?: string): Promise<{ items: Coupon[]; nextToken?: string }> {
  const data = await graphqlRequest(LIST_MY_CLAIMED_COUPONS, { nextToken });
  return data.listMyClaimedCoupons;
}

const GET_MY_COUPON_STANDING = /* GraphQL */ `
  query GetMyCouponStanding {
    getMyCouponStanding { couponPoints couponStrikes couponBanned couponFlakeCount }
  }
`;

const DEFAULT_STANDING: CouponStanding = { couponPoints: 0, couponStrikes: 0, couponBanned: false, couponFlakeCount: 0 };

export async function getMyCouponStanding(): Promise<CouponStanding> {
  try {
    const data = await graphqlRequest(GET_MY_COUPON_STANDING, {});
    return data.getMyCouponStanding || DEFAULT_STANDING;
  } catch (err) {
    logger.warn('coupon', 'getMyCouponStanding failed', {}, err as Error);
    return DEFAULT_STANDING;
  }
}

// ─── Mutations ─────────────────────────────────────────────────

const CREATE_COUPON = /* GraphQL */ `
  mutation CreateCoupon($input: CreateCouponInput!) {
    createCoupon(input: $input) { ${COUPON_FIELDS} }
  }
`;

export interface CreateCouponInput {
  retailer: string;
  title?: string;
  codeText?: string;
  validFrom?: string;
  expiryAt: string;
  imageKey: string;
}

export async function createCoupon(input: CreateCouponInput): Promise<Coupon> {
  const data = await graphqlRequest(CREATE_COUPON, { input });
  return data.createCoupon;
}

const CLAIM_COUPON = /* GraphQL */ `
  mutation ClaimCoupon($couponId: ID!) {
    claimCoupon(couponId: $couponId) { ${COUPON_FIELDS} }
  }
`;

export async function claimCoupon(couponId: string): Promise<Coupon> {
  const data = await graphqlRequest(CLAIM_COUPON, { couponId });
  return data.claimCoupon;
}

const VALIDATE_COUPON = /* GraphQL */ `
  mutation ValidateCoupon($input: ValidateCouponInput!) {
    validateCoupon(input: $input) { ${COUPON_FIELDS} }
  }
`;

export async function validateCoupon(couponId: string, result: 'VALID' | 'SCAM', reasonCode?: ScamReasonCode): Promise<Coupon> {
  const data = await graphqlRequest(VALIDATE_COUPON, { input: { couponId, result, reasonCode } });
  return data.validateCoupon;
}

const DELETE_MY_COUPON = /* GraphQL */ `
  mutation DeleteMyCoupon($couponId: ID!) {
    deleteMyCoupon(couponId: $couponId)
  }
`;

// Only works while the coupon is still AVAILABLE (unclaimed) — the server
// rejects it otherwise, see deleteMyCoupon's resolver.
export async function deleteMyCoupon(couponId: string): Promise<boolean> {
  const data = await graphqlRequest(DELETE_MY_COUPON, { couponId });
  return !!data.deleteMyCoupon;
}

const GET_COUPON_IMAGE_UPLOAD_URL = /* GraphQL */ `
  mutation GetCouponImageUploadUrl($contentType: String!) {
    getCouponImageUploadUrl(contentType: $contentType) { uploadUrl imageKey }
  }
`;

const GET_COUPON_IMAGE_URL = /* GraphQL */ `
  mutation GetCouponImageUrl($couponId: ID!) {
    getCouponImageUrl(couponId: $couponId)
  }
`;

export async function getCouponImageUrl(couponId: string): Promise<string> {
  const data = await graphqlRequest(GET_COUPON_IMAGE_URL, { couponId });
  return data.getCouponImageUrl;
}

// Uploads a photo picked via react-native-image-picker straight to S3 using
// a presigned URL — mints the URL via getCouponImageUploadUrl, then PUTs the
// file directly by its local `uri` (React Native's fetch/XHR streams a local
// file's raw bytes when the body is `{ uri, type, name }`, unlike web fetch —
// passing the base64 string as the body would instead upload the base64 TEXT,
// not the image itself). Returns the imageKey to pass to createCoupon.
export async function uploadCouponImage(uri: string, contentType: string): Promise<string> {
  const { getCouponImageUploadUrl } = await graphqlRequest(GET_COUPON_IMAGE_UPLOAD_URL, { contentType });
  const { uploadUrl, imageKey } = getCouponImageUploadUrl;

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: { uri, type: contentType, name: 'coupon.jpg' } as any,
  });
  if (!res.ok) throw new Error(`Image upload failed (HTTP ${res.status})`);
  return imageKey;
}
