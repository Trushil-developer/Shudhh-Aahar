// src/screens/ShopHomeScreen.tsx
// Shop landing page: search entry, categories and everyday essentials.

import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useShop } from '../context/ShopContext';
import { ProductTile } from '../components/ShopUI';
import { formatPrice } from '../services/shopService';
import { ShopNav } from '../navigation/shopRoutes';
import { Colors } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';

export default function ShopHomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<ShopNav>();
  const { products, categories, settings, catalogLoading, catalogError, refreshCatalog } = useShop();
  const { rw, rh, rf, rr, rStyles, isTablet } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const columns = isTablet ? 4 : 2;

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    header: { paddingHorizontal: rStyles.space.lg, paddingTop: rh(8), paddingBottom: rh(12) },
    brand: { fontSize: rf(24), fontWeight: '800', color: Colors.navy },
    tagline: { fontSize: rf(13), color: Colors.textSecondary, marginTop: rh(2) },
    search: { flexDirection: 'row', alignItems: 'center', gap: rw(8), marginTop: rh(14), backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: rr(12), paddingHorizontal: rw(14), height: rh(46) },
    searchText: { fontSize: rf(14), color: Colors.textMuted },
    infoPill: { alignSelf: 'flex-start', marginTop: rh(10), backgroundColor: Colors.safeBg, borderColor: Colors.safeBorder, borderWidth: 1, borderRadius: rStyles.radius.pill, paddingHorizontal: rw(10), paddingVertical: rh(4) },
    infoPillText: { fontSize: rf(11), fontWeight: '700', color: Colors.safe },
    closed: { marginHorizontal: rStyles.space.lg, marginBottom: rh(10), backgroundColor: Colors.cautionBg, borderColor: Colors.cautionBorder, borderWidth: 1, borderRadius: rr(12), padding: rw(12) },
    closedText: { fontSize: rf(13), fontWeight: '600', color: Colors.textPrimary },
    chipsRow: { paddingHorizontal: rStyles.space.lg, gap: rw(8), paddingBottom: rh(6) },
    chip: { backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1, borderRadius: rStyles.radius.pill, paddingHorizontal: rw(14), paddingVertical: rh(8) },
    chipText: { fontSize: rf(13), fontWeight: '600', color: Colors.textPrimary },
    sectionTitle: { fontSize: rf(17), fontWeight: '800', color: Colors.textPrimary, paddingHorizontal: rStyles.space.lg, marginTop: rh(14), marginBottom: rh(10) },
    grid: { paddingHorizontal: rStyles.space.lg, paddingBottom: rh(32) },
    gridRow: { gap: rw(10), marginBottom: rh(10) },
    cell: { flex: 1 / columns },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(32) },
    emptyIcon: { fontSize: rf(40), marginBottom: rh(10) },
    emptyText: { fontSize: rf(14), color: Colors.textSecondary, textAlign: 'center' },
    retry: { marginTop: rh(14), backgroundColor: Colors.navy, borderRadius: rr(10), paddingHorizontal: rw(18), paddingVertical: rh(10) },
    retryText: { color: Colors.textWhite, fontWeight: '700', fontSize: rf(14) },
    content: isTablet ? { maxWidth: TABLET_CONTENT_MAX_WIDTH * 1.4, alignSelf: 'center', width: '100%' } : {},
  }), [rw, rh, rf, rr, rStyles, isTablet, columns]);

  const essentials = products.filter(p => p.essential);
  const featured = essentials.length ? essentials : products;

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshCatalog();
    setRefreshing(false);
  };

  const deliveryInfo = [
    settings.freeDeliveryOverPence > 0 ? t('shop.freeDeliveryOver', { amount: formatPrice(settings.freeDeliveryOverPence) }) : null,
    settings.minOrderPence > 0 ? t('shop.minOrder', { amount: formatPrice(settings.minOrderPence) }) : null,
  ].filter(Boolean).join(' · ');

  if (catalogLoading) {
    return <SafeAreaView style={s.root}><View style={s.centre}><ActivityIndicator color={Colors.navyMid} /></View></SafeAreaView>;
  }

  const header = (
    <View style={s.content}>
      <View style={s.header}>
        <Text style={s.brand}>{t('shop.brand')}</Text>
        <Text style={s.tagline}>{t('shop.tagline')}</Text>
        <TouchableOpacity style={s.search} onPress={() => navigation.navigate('Search')} activeOpacity={0.8} accessibilityRole="search">
          <Text>🔍</Text>
          <Text style={s.searchText}>{t('shop.searchPlaceholder')}</Text>
        </TouchableOpacity>
        {deliveryInfo ? <View style={s.infoPill}><Text style={s.infoPillText}>🚚 {deliveryInfo}</Text></View> : null}
      </View>

      {!settings.shopOpen && (
        <View style={s.closed}><Text style={s.closedText}>{t('shop.closedBanner')}</Text></View>
      )}

      {categories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
          {categories.map(c => (
            <TouchableOpacity key={c} style={s.chip} onPress={() => navigation.navigate('Search', { category: c })} activeOpacity={0.8}>
              <Text style={s.chipText}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {featured.length > 0 && (
        <Text style={s.sectionTitle}>{essentials.length ? t('shop.essentials') : t('shop.allProducts')}</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        key={columns}
        data={featured}
        keyExtractor={p => p.barcode}
        numColumns={columns}
        ListHeaderComponent={header}
        columnWrapperStyle={[s.gridRow, s.content]}
        contentContainerStyle={s.grid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={s.cell}>
            <ProductTile product={item} onPress={() => navigation.navigate('ShopProduct', { barcode: item.barcode })} />
          </View>
        )}
        ListEmptyComponent={
          <View style={s.centre}>
            <Text style={s.emptyIcon}>{catalogError ? '📶' : '🛒'}</Text>
            <Text style={s.emptyText}>{catalogError ? t('shop.loadError') : t('shop.emptyCatalog')}</Text>
            {catalogError && (
              <TouchableOpacity style={s.retry} onPress={onRefresh}><Text style={s.retryText}>{t('common.tryAgain')}</Text></TouchableOpacity>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}
