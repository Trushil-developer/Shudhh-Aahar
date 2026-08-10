// src/services/shoppingListService.ts
// Saves products that passed health check to a personal safe shopping list
// Stored locally in AsyncStorage + synced to DynamoDB for cross-device

import AsyncStorage from '@react-native-async-storage/async-storage';

// One store's price for a saved item — snapshotted at add-time and
// refreshable via updateItemPrices() (see ShoppingListScreen's "Refresh
// Prices" action). loyaltyPrice/loyaltyLabel carry a Clubcard/Nectar/etc.
// price when the source comparison found one (see priceApi.ts).
export interface StorePriceEntry {
  supermarket: string;
  price: number;
  loyaltyPrice?: number;
  loyaltyLabel?: string;
}

export interface ShoppingListItem {
  id: string;
  barcode: string;
  name: string;
  brand: string;
  image: string;
  quantity: string;
  // Effective (loyalty-aware) price/store at the cheapest option — derived
  // from storePrices, kept alongside it so screens that only need the
  // headline number don't have to recompute it.
  cheapestPrice?: number;
  cheapestStore?: string;
  storePrices?: StorePriceEntry[];   // full per-store breakdown, for grouping-by-store
  pricesUpdatedAt?: string;          // ISO timestamp of the last price refresh
  aiScore: number;
  addedAt: string;
  checked: boolean;        // ticked off while shopping
  category: string;
}

const KEY = 'shuddhaahar_shopping_list';

// Every mutation below does its own read-modify-write of the single
// AsyncStorage key. Without coordination, two mutations firing in quick
// succession (e.g. check item A, then remove item B) both read the same
// pre-mutation snapshot and the second write silently clobbers the first.
// Chaining each mutation's read-modify-write onto this module-level promise
// queue ensures they run strictly one after another, so each one only starts
// once the previous mutation has fully persisted.
let writeQueue: Promise<void> = Promise.resolve();

export async function getShoppingList(): Promise<ShoppingListItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function addToShoppingList(item: Omit<ShoppingListItem, 'id' | 'addedAt' | 'checked'>): Promise<void> {
  const task = writeQueue.then(async () => {
    const list = await getShoppingList();
    // Don't duplicate
    if (list.find(i => i.barcode === item.barcode)) return;
    list.unshift({ ...item, id: Date.now().toString(), addedAt: new Date().toISOString(), checked: false });
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  });
  writeQueue = task.catch(() => {});
  return task;
}

export async function removeFromShoppingList(barcode: string): Promise<void> {
  const task = writeQueue.then(async () => {
    const list = await getShoppingList();
    await AsyncStorage.setItem(KEY, JSON.stringify(list.filter(i => i.barcode !== barcode)));
  });
  writeQueue = task.catch(() => {});
  return task;
}

// Writes a freshly re-fetched per-store price breakdown for one item —
// used by ShoppingListScreen's "Refresh Prices" action, one barcode at a
// time (each call independently queued, same race-safety as every other
// mutation here).
export async function updateItemPrices(
  barcode: string,
  storePrices: StorePriceEntry[],
  cheapestPrice?: number,
  cheapestStore?: string,
): Promise<void> {
  const task = writeQueue.then(async () => {
    const list = await getShoppingList();
    const updated = list.map(i => i.barcode === barcode
      ? { ...i, storePrices, cheapestPrice, cheapestStore, pricesUpdatedAt: new Date().toISOString() }
      : i);
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  });
  writeQueue = task.catch(() => {});
  return task;
}

export async function toggleChecked(barcode: string): Promise<void> {
  const task = writeQueue.then(async () => {
    const list = await getShoppingList();
    const updated = list.map(i => i.barcode === barcode ? { ...i, checked: !i.checked } : i);
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  });
  writeQueue = task.catch(() => {});
  return task;
}

export async function clearChecked(): Promise<void> {
  const task = writeQueue.then(async () => {
    const list = await getShoppingList();
    await AsyncStorage.setItem(KEY, JSON.stringify(list.filter(i => !i.checked)));
  });
  writeQueue = task.catch(() => {});
  return task;
}

export async function isInShoppingList(barcode: string): Promise<boolean> {
  const list = await getShoppingList();
  return list.some(i => i.barcode === barcode);
}
