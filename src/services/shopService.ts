// src/services/shopService.ts
// Grocery delivery: catalogue, orders and the saved delivery address.
//
// The catalogue (and shop settings: postcodes, minimum order, delivery fee)
// is a public GET (terraform/lambda/catalog-get.js) so people can browse
// before signing in. Orders go through AppSync → shop-actions.js, which
// re-prices every line from the catalogue server-side — prices shown here
// are for display only. Money is integer pence throughout.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from '../config/environment';
import { graphqlRequest } from './userDataService';
import logger from '../utils/logger';

export interface CatalogProduct {
  barcode: string;
  name: string;
  brand?: string;
  image?: string;
  quantity?: string;
  category?: string;
  pricePence: number;
  inStock: boolean;
  essential: boolean;
  sortOrder?: number;
}

export interface ShopSettings {
  deliveryPostcodes: string[];
  minOrderPence: number;
  deliveryFeePence: number;
  freeDeliveryOverPence: number;
  shopOpen: boolean;
}

export interface DeliveryAddress {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  phone: string;
}

export interface OrderItem {
  barcode: string;
  name: string;
  image?: string;
  quantity?: string;
  qty: number;
  unitPricePence: number;
  lineTotalPence: number;
}

export type OrderStatus = 'PLACED' | 'CONFIRMED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';

export interface ShopOrder {
  id: string;
  orderNumber: string;
  items: OrderItem[];
  subtotalPence: number;
  deliveryFeePence: number;
  totalPence: number;
  address: DeliveryAddress;
  note?: string;
  paymentMethod: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
}

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  deliveryPostcodes: [],
  minOrderPence: 0,
  deliveryFeePence: 0,
  freeDeliveryOverPence: 0,
  shopOpen: true,
};

export function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function deliveryFeeFor(subtotalPence: number, settings: ShopSettings): number {
  const free = settings.freeDeliveryOverPence > 0 && subtotalPence >= settings.freeDeliveryOverPence;
  return free ? 0 : settings.deliveryFeePence;
}

// ─── Catalogue ──────────────────────────────────────────────────
const CATALOG_CACHE_KEY = 'shop_catalog_cache';
const FETCH_TIMEOUT_MS = 10000;

export interface Catalog {
  products: CatalogProduct[];
  settings: ShopSettings;
}

// Falls back to the last good copy when offline, so the shop still opens
// (ordering itself is always re-checked by the server).
export async function fetchCatalog(): Promise<Catalog> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(Config.catalogUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`Catalogue HTTP ${res.status}`);
    const json = await res.json();
    const catalog: Catalog = {
      products: Array.isArray(json.products) ? json.products : [],
      settings: { ...DEFAULT_SHOP_SETTINGS, ...json.settings },
    };
    AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog)).catch(() => {});
    return catalog;
  } catch (err) {
    logger.warn('shop', 'Catalogue fetch failed — trying cache', {}, err as Error);
    const cached = await AsyncStorage.getItem(CATALOG_CACHE_KEY).catch(() => null);
    if (cached) return JSON.parse(cached);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Saved delivery address (this device) ───────────────────────
const ADDRESS_KEY = 'shop_delivery_address';

export async function getSavedAddress(): Promise<DeliveryAddress | null> {
  try {
    const raw = await AsyncStorage.getItem(ADDRESS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveAddress(address: DeliveryAddress): Promise<void> {
  await AsyncStorage.setItem(ADDRESS_KEY, JSON.stringify(address)).catch(() => {});
}

// ─── Orders ─────────────────────────────────────────────────────
const ORDER_FIELDS = `
  id orderNumber subtotalPence deliveryFeePence totalPence note paymentMethod status createdAt updatedAt
  items { barcode name image quantity qty unitPricePence lineTotalPence }
  address { fullName line1 line2 city postcode phone }
`;

const PLACE_ORDER = /* GraphQL */ `
  mutation PlaceOrder($input: PlaceOrderInput!) {
    placeOrder(input: $input) { ${ORDER_FIELDS} }
  }
`;

const LIST_MY_ORDERS = /* GraphQL */ `
  query ListMyOrders($limit: Int, $nextToken: String) {
    listMyOrders(limit: $limit, nextToken: $nextToken) { items { ${ORDER_FIELDS} } nextToken }
  }
`;

const CANCEL_MY_ORDER = /* GraphQL */ `
  mutation CancelMyOrder($orderId: ID!) {
    cancelMyOrder(orderId: $orderId) { ${ORDER_FIELDS} }
  }
`;

export async function placeOrder(input: {
  items: { barcode: string; qty: number }[];
  address: DeliveryAddress;
  note?: string;
}): Promise<ShopOrder> {
  const data = await graphqlRequest(PLACE_ORDER, { input });
  return data.placeOrder;
}

export async function listMyOrders(): Promise<ShopOrder[]> {
  const data = await graphqlRequest(LIST_MY_ORDERS, { limit: 50 });
  return data.listMyOrders.items || [];
}

export async function cancelMyOrder(orderId: string): Promise<ShopOrder> {
  const data = await graphqlRequest(CANCEL_MY_ORDER, { orderId });
  return data.cancelMyOrder;
}
