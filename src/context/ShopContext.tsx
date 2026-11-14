// src/context/ShopContext.tsx
// Catalogue + cart for the delivery shop. The cart is just barcode → qty,
// persisted on the device so it survives restarts and signing in; product
// details and prices always come from the latest catalogue, so a price
// change or out-of-stock item shows up in the cart straight away.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchCatalog, CatalogProduct, ShopSettings, DEFAULT_SHOP_SETTINGS, deliveryFeeFor,
} from '../services/shopService';

const CART_KEY = 'shop_cart';
export const MAX_QTY_PER_ITEM = 50;

export interface CartLine {
  barcode: string;
  qty: number;
  product?: CatalogProduct; // undefined = no longer sold
}

interface ShopContextValue {
  products: CatalogProduct[];
  productsByBarcode: Map<string, CatalogProduct>;
  categories: string[];
  settings: ShopSettings;
  catalogLoading: boolean;
  catalogError: boolean;
  refreshCatalog: () => Promise<void>;

  cartLines: CartLine[];
  cartCount: number;
  qtyInCart: (barcode: string) => number;
  setQty: (barcode: string, qty: number) => void;
  addToCart: (barcode: string, qty?: number) => void;
  clearCart: () => void;

  // Only lines that can actually be ordered (in the catalogue and in stock)
  orderableLines: CartLine[];
  subtotalPence: number;
  deliveryFeePence: number;
  totalPence: number;
  belowMinimumByPence: number;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});

  const refreshCatalog = useCallback(async () => {
    try {
      const catalog = await fetchCatalog();
      setProducts(catalog.products);
      setSettings(catalog.settings);
      setCatalogError(false);
    } catch {
      setCatalogError(true);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCatalog();
    AsyncStorage.getItem(CART_KEY)
      .then(raw => { if (raw) setCart(JSON.parse(raw)); })
      .catch(() => {});
  }, [refreshCatalog]);

  const persist = (next: Record<string, number>) => {
    AsyncStorage.setItem(CART_KEY, JSON.stringify(next)).catch(() => {});
    return next;
  };

  const setQty = useCallback((barcode: string, qty: number) => {
    setCart(prev => {
      const next = { ...prev };
      const clamped = Math.min(MAX_QTY_PER_ITEM, Math.max(0, Math.floor(qty)));
      if (clamped === 0) delete next[barcode];
      else next[barcode] = clamped;
      return persist(next);
    });
  }, []);

  const addToCart = useCallback((barcode: string, qty = 1) => {
    setCart(prev => persist({ ...prev, [barcode]: Math.min(MAX_QTY_PER_ITEM, (prev[barcode] || 0) + qty) }));
  }, []);

  const clearCart = useCallback(() => setCart(persist({})), []);

  const value = useMemo<ShopContextValue>(() => {
    const productsByBarcode = new Map(products.map(p => [p.barcode, p]));
    const categories = [...new Set(products.map(p => p.category).filter((c): c is string => !!c))];
    const cartLines = Object.entries(cart).map(([barcode, qty]) => ({ barcode, qty, product: productsByBarcode.get(barcode) }));
    const orderableLines = cartLines.filter(l => l.product?.inStock);
    const subtotalPence = orderableLines.reduce((sum, l) => sum + l.product!.pricePence * l.qty, 0);
    const deliveryFeePence = orderableLines.length ? deliveryFeeFor(subtotalPence, settings) : 0;
    return {
      products,
      productsByBarcode,
      categories,
      settings,
      catalogLoading,
      catalogError,
      refreshCatalog,
      cartLines,
      cartCount: cartLines.reduce((n, l) => n + l.qty, 0),
      qtyInCart: (barcode: string) => cart[barcode] || 0,
      setQty,
      addToCart,
      clearCart,
      orderableLines,
      subtotalPence,
      deliveryFeePence,
      totalPence: subtotalPence + deliveryFeePence,
      belowMinimumByPence: Math.max(0, settings.minOrderPence - subtotalPence),
    };
  }, [products, settings, catalogLoading, catalogError, refreshCatalog, cart, setQty, addToCart, clearCart]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used inside ShopProvider');
  return ctx;
}
