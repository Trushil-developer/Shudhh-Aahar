// src/screens/ShoppingListScreen.tsx
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../../App';
import {
  getShoppingList, toggleChecked, removeFromShoppingList,
  clearChecked, ShoppingListItem,
} from '../services/shoppingListService';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive } from '../utils/responsive';
import { FeatureGate } from '../components/FeatureGate';
// PHASE 2: import { FeatureTooltip, useGuide } from '../components/AppGuide';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ShoppingListScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { rw, rh, rf, rr, isTablet, getColumns, getCardWidth } = useResponsive();
  const styles = useShoppingListStyles(rw, rh, rf, rr);
  const [items, setItems] = useState<ShoppingListItem[]>([]);

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

  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);

  // Item cards are horizontal rows (checkbox + thumb + info), so they need a
  // wider min width than a typical square product tile before splitting into
  // columns — this only kicks in on tablet/landscape widths.
  const columns = getColumns(320);

  const summaryText = unchecked.length === 0
    ? t('shoppingList.allDoneCheckedOff', { count: checked.length })
    : checked.length === 0
    ? t('shoppingList.itemsToBuy', { count: unchecked.length })
    : t('shoppingList.itemsToBuyWithChecked', { count: unchecked.length, checked: checked.length });

  return (
    <FeatureGate feature="wishlist">
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>{t('shoppingList.title')}</Text>
        {checked.length > 0 && (
          <TouchableOpacity onPress={handleClearChecked}>
            <Text style={styles.clearBtn}>{t('shoppingList.clearChecked')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>❤️</Text>
          <Text style={styles.emptyTitle}>{t('shoppingList.emptyTitle')}</Text>
          <Text style={styles.emptySub}>{t('shoppingList.emptySub')}</Text>
          <TouchableOpacity style={styles.scanBtn} onPress={() => navigation.navigate('Scan')}>
            <Text style={styles.scanBtnText}>{t('shoppingList.startScanning')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={[...unchecked, ...checked]}
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
          renderItem={({ item }) => (
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
                {item.cheapestPrice && (
                  <Text style={styles.itemPrice}>£{item.cheapestPrice.toFixed(2)} · {item.cheapestStore}</Text>
                )}
                <View style={styles.scorePill}>
                  <Text style={styles.scorePillText}>{item.aiScore}/100</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(item)}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
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
  topBarTitle: { fontSize: rf(20), fontWeight: '800', color: Colors.textPrimary },
  clearBtn: { fontSize: rf(13), color: Colors.danger, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(32) },
  emptyIcon: { fontSize: rf(48), marginBottom: rh(16) },
  emptyTitle: { fontSize: rf(20), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(8) },
  emptySub: { fontSize: rf(13), color: Colors.textMuted, textAlign: 'center', lineHeight: rf(20), marginBottom: rh(24) },
  scanBtn: { backgroundColor: Colors.navy, borderRadius: rr(10), paddingHorizontal: rw(24), paddingVertical: rh(12), ...Shadow.cardMd },
  scanBtnText: { color: '#FFF', fontWeight: '700', fontSize: rf(14) },
  summaryBar: { backgroundColor: Colors.navyLight, borderRadius: rr(8), padding: rw(10), marginBottom: rh(6), alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  summaryText: { fontSize: rf(12), color: Colors.navyMid, fontWeight: '600', letterSpacing: 0.5 },
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
  itemPrice: { fontSize: rf(12), color: Colors.price, fontWeight: '600', marginBottom: rh(4) },
  scorePill: { alignSelf: 'flex-start', backgroundColor: Colors.safeBg, borderRadius: rr(4), paddingHorizontal: rw(6), paddingVertical: rh(2), borderWidth: 1, borderColor: Colors.safeBorder },
  scorePillText: { fontSize: rf(10), color: Colors.safe, fontWeight: '700' },
  removeBtn: { padding: rw(8) },
  removeBtnText: { color: Colors.textMuted, fontSize: rf(16) },
  }), [rw, rh, rf, rr]);
}
