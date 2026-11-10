// src/services/voucherService.ts
// Voucher redemption — spends Coupon Exchange points for a gift voucher.
// 100 points = a £5 voucher for a brand from AppConfig.voucherBrands.
// Fulfillment is manual (an admin buys/generates the real voucher and enters
// the code) — see terraform/schema.graphql's VoucherRequest comment.
import { graphqlRequest } from './userDataService';

export const VOUCHER_COST_POINTS = 100;
export const VOUCHER_VALUE_LABEL = '£5';

export type VoucherRequestStatus = 'PENDING' | 'FULFILLED' | 'REJECTED';

export interface VoucherRequest {
  id: string;
  userId: string;
  brand: string;
  pointsSpent: number;
  status: VoucherRequestStatus;
  voucherCode?: string | null;
  adminNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
  fulfilledAt?: string | null;
}

const VOUCHER_REQUEST_FIELDS = `
  id userId brand pointsSpent status voucherCode adminNote createdAt updatedAt fulfilledAt
`;

const LIST_MY_VOUCHER_REQUESTS = /* GraphQL */ `
  query ListMyVoucherRequests($nextToken: String) {
    listMyVoucherRequests(nextToken: $nextToken) { items { ${VOUCHER_REQUEST_FIELDS} } nextToken }
  }
`;

export async function listMyVoucherRequests(nextToken?: string): Promise<{ items: VoucherRequest[]; nextToken?: string }> {
  const data = await graphqlRequest(LIST_MY_VOUCHER_REQUESTS, { nextToken });
  return data.listMyVoucherRequests;
}

const REQUEST_VOUCHER = /* GraphQL */ `
  mutation RequestVoucher($brand: String!) {
    requestVoucher(brand: $brand) { ${VOUCHER_REQUEST_FIELDS} }
  }
`;

export async function requestVoucher(brand: string): Promise<VoucherRequest> {
  const data = await graphqlRequest(REQUEST_VOUCHER, { brand });
  return data.requestVoucher;
}
