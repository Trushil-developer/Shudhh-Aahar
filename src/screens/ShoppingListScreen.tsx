// src/screens/ShoppingListScreen.tsx
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, Alert, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../../App';
import {
  getShoppingList, toggleChecked, removeFromShoppingList,
  clearChecked, updateItemPrices, ShoppingListItem,
} from '../services/shoppingListService';
import { fetchPricesByBarcode, effectivePrice, getSupermarketColor, getSupermarketLogo } from '../services/priceApi';
import cache from '../utils/cache';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive } from '../utils/responsive';
import { FeatureGate } from '../components/FeatureGate';
// PHASE 2: import { FeatureTooltip, useGuide } from '../components/AppGuide';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Bucket for items with no priced store yet (never compared, or the last
// comparison found nothing) — kept visible rather than silently dropped
// from the store-grouped view.
const UNPRICED_KEY = '__unpriced__';

// A logo (usually a small favicon with its own white/transparent
// background) sitting directly on a solid brand-colour block tends to look
// clashy — a soft tint of the same colour behind it reads cleaner. All
// SUPERMARKET_COLORS entries are plain 6-digit hex, so no need to handle
// shorthand/named colours here.
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface StoreGroup {
  store: string;
  color: string;
  logo: string | null;
  items: ShoppingListItem[];
  total: number;
}

export default function ShoppingListScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { rw, rh, rf, rr, isTablet, getColumns, getCardWidth } = useResponsive();
  const styles = useShoppingListStyles(rw, rh, rf, rr);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  // null = store list; a store name = drilled into that store's items.
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState({ done: 0, total: 0 });
  // Store names whose logo image failed to load (404 from Clearbit, no
  // network, etc.) — those tiles fall back to the coloured-initial view
  // instead of a broken image.
  const [logoFailed, setLogoFailed] = useState<Set<string>>(new Set());

  const load = async () => setItems(await getShoppingList());
  useFocusEffect(useCallback(() => { load(); }, []));

  const handleToggle = async (barcode: string) => {
    await toggleChecked(barcode);
    load();
  };

  const handleRemove = (item: ShoppingListItem) => {
    Alert.alert(t('shoppingList.removeItemTitle'), t('shoppingList.removeItemMessage', { name: item.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('shoppingList.remove'), style: 'destructive', onPress: async () => { await removeFromShoppingList(item.barcode); load(); } },
    ]);
  };

  const handleClearChecked = () => {
    Alert.alert(t('shoppingList.clearCheckedTitle'), t('shoppingList.clearCheckedMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('shoppingList.clear'), style: 'destructive', onPress: async () => { await clearChecked(); load(); } },
    ]);
  };

  // Re-fetches live prices for every saved item, one at a time (gentle on
  // the underlying scraper — concurrent requests would look bot-like), and
  // re-derives each item's cheapest store/price from the fresh,
  // loyalty-aware comparison (see priceApi.ts's effectivePrice). Forces a
  // fresh scrape via cache.invalidate first — otherwise "Refresh" could
  // silently no-op against a still-warm cache entry. An item whose fetch
  // fails (network, not found) just keeps its last-known prices rather than
  // losing them.
  const handleRefreshPrices = async () => {
    const list = await getShoppingList();
    if (list.length === 0) return;
    setRefreshing(true);
    setRefreshProgress({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      try {
        await cache.invalidate(`price:${item.barcode}`);
        const cmp = await fetchPricesByBarcode(item.barcode, item.name);
        if (cmp.found && cmp.cheapest) {
          const storePrices = cmp.prices.map(p => ({
            supermarket: p.supermarket, price: p.price,
            loyaltyPrice: p.loyaltyPrice, loyaltyLabel: p.loyaltyLabel,
          }));
          await updateItemPrices(item.barcode, storePrices, effectivePrice(cmp.cheapest), cmp.cheapest.supermarket);
        }
      } catch {
        // Keep this item's last-known prices — one failed lookup shouldn't
        // wipe out data that was previously known good.
      }
      setRefreshProgress({ done: i + 1, total: list.length });
    }
    await load();
    setRefreshing(false);
  };

  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);

  // Grouped by cheapestStore — the store view is the default landing view;
  // tapping a store drills into just that store's items. Sorted cheapest
  // store-total first, with the "not yet priced" bucket always last.
  const storeGroups = useMemo<StoreGroup[]>(() => {
    const all = [...unchecked, ...checked];
    const map = new Map<string, ShoppingListItem[]>();
    for (const item of all) {
      const key = item.cheapestStore || UNPRICED_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    const groups: StoreGroup[] = [];
    for (const [store, storeItems] of map) {
      const total = storeItems.reduce((sum, i) => sum + (i.cheapestPrice || 0), 0);
      const isUnpriced = store === UNPRICED_KEY;
      groups.push({
        store,
        color: isUnpriced ? Colors.textMuted : getSupermarketColor(store),
        logo: isUnpriced ? null : getSupermarketLogo(store),
        items: storeItems,
        total,
      });
    }
    groups.sort((a, b) => {
      if (a.store === UNPRICED_KEY) return 1;
      if (b.store === UNPRICED_KEY) return -1;
      return a.total - b.total;
    });
    return groups;
  }, [items]);

  const columns = getColumns(320);
  // Store tiles are small/square (Amazon-grid style) — 2 per row on a
  // typical phone width, scaling up on tablet, unlike the wider item cards
  // above which cap at 1 column on phone.
  const storeColumns = getColumns(160);

  const summaryText = unchecked.length === 0
    ? t('shoppingList.allDoneCheckedOff', { count: checked.length })
    : checked.length === 0
    ? t('shoppingList.itemsToBuy', { count: unchecked.length })
    : t('shoppingList.itemsToBuyWithChecked', { count: unchecked.length, checked: checked.length });

  const activeGroup = selectedStore ? storeGroups.find(g => g.store === selectedStore) ?? null : null;

  const renderItemCard = (item: ShoppingListItem) => {
    const loyaltyLabel = item.storePrices?.find(sp => sp.supermarket === item.cheapestStore)?.loyaltyLabel;
    return (
      <TouchableOpacity
        style={[styles.itemCard, item.checked && styles.itemCardChecked, columns > 1 && { width: getCardWidth(columns, 10, 16) }]}
        onPress={() => navigation.navigate('Product', { barcode: item.barcode })}
        activeOpacity={0.85}
      >
        <TouchableOpacity style={[styles.checkbox, item.checked && styles.checkboxChecked]} onPress={() => handleToggle(item.barcode)}>
          {item.checked && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>

        {item.image ? (
          <Image source={{ uri: item.image }} style={[styles.itemImage, item.checked && { opacity: 0.4 }]} resizeMode="contain" />
        ) : (
          <View style={[styles.itemImage, styles.imagePlaceholder]}>
            <Text style={{ fontSize: 18 }}>📦</Text>
          </View>
        )}

        <View style={[styles.itemInfo, item.checked && { opacity: 0.4 }]}>
          <Text style={styles.itemBrand}>{item.brand?.toUpperCase()}</Text>
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          {item.cheapestPrice != null && (
            <View style={styles.priceRow}>
              <Text style={styles.itemPrice}>£{item.cheapestPrice.toFixed(2)}</Text>
              {loyaltyLabel && (
                <View style={styles.loyaltyBadge}>
                  <Text style={styles.loyaltyBadgeText}>{loyaltyLabel}</Text>
                </View>
              )}
            </View>
          )}
          <View style={styles.scorePill}>
            <Text style={styles.scorePillText}>{item.aiScore}/100</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(item)}>
          <Text style={styles.removeBtnText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <FeatureGate feature="wishlist" fullScreen>
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        {activeGroup ? (
          <TouchableOpacity onPress={() => setSelectedStore(null)} style={styles.backRow} hitSlop={8}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              {activeGroup.store === UNPRICED_KEY ? t('shoppingList.unpriced') : activeGroup.store}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.topBarTitle}>{t('shoppingList.title')}</Text>
        )}
        <View style={styles.topBarActions}>
          {!activeGroup && items.length > 0 && (
            <TouchableOpacity onPress={handleRefreshPrices} disabled={refreshing} style={styles.refreshBtn} hitSlop={8}>
              {refreshing ? <ActivityIndicator size="small" color={Colors.navy} /> : <Text style={styles.refreshIcon}>⟳</Text>}
            </TouchableOpacity>
          )}
          {!activeGroup && checked.length > 0 && (
            <TouchableOpacity onPress={handleClearChecked}>
              <Text style={styles.clearBtn}>{t('shoppingList.clearChecked')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {refreshing && (
        <View style={styles.refreshBanner}>
          <Text style={styles.refreshBannerText}>
            {t('shoppingList.refreshingProgress', { done: refreshProgress.done, count: refreshProgress.total })}
          </Text>
        </View>
      )}

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>❤️</Text>
          <Text style={styles.emptyTitle}>{t('shoppingList.emptyTitle')}</Text>
          <Text style={styles.emptySub}>{t('shoppingList.emptySub')}</Text>
          <TouchableOpacity style={styles.scanBtn} onPress={() => navigation.navigate('Scan')}>
            <Text style={styles.scanBtnText}>{t('shoppingList.startScanning')}</Text>
          </TouchableOpacity>
        </View>
      ) : activeGroup ? (
        <FlatList
          data={activeGroup.items}
          keyExtractor={i => i.id}
          key={columns}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: 10 } : undefined}
          contentContainerStyle={[{ padding: 16, gap: 10 }, isTablet && { maxWidth: 900, alignSelf: 'center', width: '100%' }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.summaryBar}>
              <Text style={styles.summaryText}>{summaryText}</Text>
            </View>
          }
          renderItem={({ item }) => renderItemCard(item)}
        />
      ) : (
        <FlatList
          data={storeGroups}
          keyExtractor={g => g.store}
          key={storeColumns}
          numColumns={storeColumns}
          columnWrapperStyle={storeColumns > 1 ? { gap: 10 } : undefined}
          contentContainerStyle={[{ padding: 16, gap: 10 }, isTablet && { maxWidth: 900, alignSelf: 'center', width: '100%' }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.summaryBar}>
              <Text style={styles.summaryText}>{summaryText}</Text>
            </View>
          }
          renderItem={({ item: group }) => {
            const isUnpriced = group.store === UNPRICED_KEY;
            const showLogo = group.logo && !logoFailed.has(group.store);
            return (
              <TouchableOpacity
                style={[styles.storeCard, storeColumns > 1 && { width: getCardWidth(storeColumns, 10, 16) }]}
                onPress={() => setSelectedStore(group.store)}
                activeOpacity={0.85}
              >
                {/* Shadow lives on this outer view; the inner one clips the
                    accent strip/logo to the rounded corners — combining
                    overflow:'hidden' with shadow props on the same view
                    clips the shadow itself away on iOS. */}
                <View style={styles.storeCardClip}>
                <View style={[styles.storeAccent, { backgroundColor: group.color }]} />
                <View style={styles.storeCardInner}>
                  <View style={[styles.storeBadge, { backgroundColor: hexToRgba(group.color, 0.12), borderColor: hexToRgba(group.color, 0.28) }]}>
                    {showLogo ? (
                      <Image
                        source={{ uri: group.logo! }}
                        style={styles.storeBadgeLogo}
                        resizeMode="contain"
                        onError={() => setLogoFailed(prev => new Set(prev).add(group.store))}
                      />
                    ) : (
                      <Text style={[styles.storeCardInitial, { color: group.color }]}>
                        {(isUnpriced ? '?' : group.store[0]).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.storeName} numberOfLines={1}>
                    {isUnpriced ? t('shoppingList.unpriced') : group.store}
                  </Text>
                  <View style={styles.storeCountPill}>
                    <Text style={styles.storeCountPillText}>{t('shoppingList.itemCount', { count: group.items.length })}</Text>
                  </View>
                  {!isUnpriced && <Text style={styles.storeTotal}>£{group.total.toFixed(2)}</Text>}
                </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
    </FeatureGate>
  );
}

function useShoppingListStyles(rw: (n: number) => number, rh: (n: number) => number, rf: (n: number) => number, rr: (n: number) => number) {
  return useMemo(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  topBar: { backgroundColor: Colors.surface, paddingHorizontal: rw(20), paddingVertical: rh(14), borderBottomWidth: 1, borderColor: Colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topBarTitle: { fontSize: rf(20), fontWeight: '800', color: Colors.textPrimary, flexShrink: 1 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: rw(4), flexShrink: 1 },
  backArrow: { fontSize: rf(26), fontWeight: '700', color: Colors.navy, marginTop: -rh(2) },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: rw(16) },
  refreshBtn: { width: rw(28), height: rw(28), alignItems: 'center', justifyContent: 'center' },
  refreshIcon: { fontSize: rf(19), color: Colors.navy, fontWeight: '700' },
  clearBtn: { fontSize: rf(13), color: Colors.danger, fontWeight: '600' },
  refreshBanner: { backgroundColor: Colors.navyLight, paddingVertical: rh(8), alignItems: 'center' },
  refreshBannerText: { fontSize: rf(12), color: Colors.navyMid, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(32) },
  emptyIcon: { fontSize: rf(48), marginBottom: rh(16) },
  emptyTitle: { fontSize: rf(20), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(8) },
  emptySub: { fontSize: rf(13), color: Colors.textMuted, textAlign: 'center', lineHeight: rf(20), marginBottom: rh(24) },
  scanBtn: { backgroundColor: Colors.navy, borderRadius: rr(10), paddingHorizontal: rw(24), paddingVertical: rh(12), ...Shadow.cardMd },
  scanBtnText: { color: '#FFF', fontWeight: '700', fontSize: rf(14) },
  summaryBar: { backgroundColor: Colors.navyLight, borderRadius: rr(8), padding: rw(10), marginBottom: rh(6), alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  summaryText: { fontSize: rf(12), color: Colors.navyMid, fontWeight: '600', letterSpacing: 0.5 },

  // Store list (default view)
  // Square grid tile (Amazon-style listing) — colored header block with the
  // store's initial, info stacked below. width is set inline per-card from
  // getCardWidth(); aspectRatio keeps each tile roughly square regardless.
  storeCard: { borderRadius: rr(18), aspectRatio: 0.88, ...Shadow.cardMd },
  storeCardClip: { flex: 1, backgroundColor: Colors.surface, borderRadius: rr(18), borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  storeAccent: { height: rh(4), width: '100%' },
  storeCardInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(14), gap: rh(6) },
  storeBadge: { width: rw(60), height: rw(60), borderRadius: rw(30), borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: rh(2) },
  storeBadgeLogo: { width: '58%', height: '58%' },
  storeCardInitial: { fontSize: rf(24), fontWeight: '900' },
  storeName: { fontSize: rf(14), fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  storeCountPill: { backgroundColor: Colors.surfaceAlt, borderRadius: rr(99), paddingHorizontal: rw(8), paddingVertical: rh(2) },
  storeCountPillText: { fontSize: rf(10.5), color: Colors.textMuted, fontWeight: '600' },
  storeTotal: { fontSize: rf(16), fontWeight: '800', color: Colors.price, marginTop: rh(2) },

  // Item card (store drill-in)
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: rw(12), backgroundColor: Colors.surface, borderRadius: rr(12), padding: rw(12), borderWidth: 1, borderColor: Colors.border, ...Shadow.card },
  itemCardChecked: { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border },
  checkbox: { width: rw(24), height: rw(24), borderRadius: rw(12), borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: Colors.safe, borderColor: Colors.safe },
  checkmark: { color: '#FFF', fontSize: rf(14), fontWeight: '800' },
  itemImage: { width: rw(52), height: rw(52), borderRadius: rr(8), backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1 },
  itemBrand: { fontSize: rf(9), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, marginBottom: rh(2) },
  itemName: { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(4) },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: rw(6), marginBottom: rh(4), flexWrap: 'wrap' },
  itemPrice: { fontSize: rf(12), color: Colors.price, fontWeight: '600' },
  loyaltyBadge: { backgroundColor: Colors.safeBg, borderRadius: rr(4), paddingHorizontal: rw(5), paddingVertical: rh(1), borderWidth: 1, borderColor: Colors.safeBorder },
  loyaltyBadgeText: { fontSize: rf(9), color: Colors.safe, fontWeight: '700' },
  scorePill: { alignSelf: 'flex-start', backgroundColor: Colors.safeBg, borderRadius: rr(4), paddingHorizontal: rw(6), paddingVertical: rh(2), borderWidth: 1, borderColor: Colors.safeBorder },
  scorePillText: { fontSize: rf(10), color: Colors.safe, fontWeight: '700' },
  removeBtn: { padding: rw(8) },
  removeBtnText: { color: Colors.textMuted, fontSize: rf(16) },
  }), [rw, rh, rf, rr]);
}
