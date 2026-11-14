// src/screens/ShopSearchScreen.tsx
// Search the catalogue by name, brand or category, with category chips.
// The whole catalogue is already on the device (ShopContext), so results
// update instantly as you type.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ScrollView, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useShop } from '../context/ShopContext';
import { ProductRow } from '../components/ShopUI';
import { ShopNav, ShopStackParamList } from '../navigation/shopRoutes';
import { Colors } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';

export default function ShopSearchScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<ShopNav>();
  const route = useRoute<RouteProp<ShopStackParamList, 'Search'>>();
  const { products, categories } = useShop();
  const { rw, rh, rf, rr, rStyles, isTablet } = useResponsive();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | undefined>(route.params?.category);

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    content: { flex: 1, ...(isTablet ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center', width: '100%' } : {}) },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: rw(8), margin: rStyles.space.lg, marginBottom: rh(10), backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: rr(12), paddingHorizontal: rw(12), height: rh(46) },
    input: { flex: 1, fontSize: rf(15), color: Colors.textPrimary, paddingVertical: 0 },
    clear: { fontSize: rf(15), color: Colors.textMuted, paddingHorizontal: rw(4) },
    chipsRow: { paddingHorizontal: rStyles.space.lg, gap: rw(8), paddingBottom: rh(8) },
    chip: { backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1, borderRadius: rStyles.radius.pill, paddingHorizontal: rw(14), paddingVertical: rh(7) },
    chipActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
    chipText: { fontSize: rf(13), fontWeight: '600', color: Colors.textPrimary },
    chipTextActive: { color: Colors.textWhite },
    list: { paddingHorizontal: rStyles.space.lg, paddingBottom: rh(32) },
    count: { fontSize: rf(12), color: Colors.textMuted, paddingHorizontal: rStyles.space.lg, marginBottom: rh(4) },
    empty: { alignItems: 'center', padding: rw(32) },
    emptyIcon: { fontSize: rf(36), marginBottom: rh(8) },
    emptyText: { fontSize: rf(14), color: Colors.textSecondary, textAlign: 'center' },
  }), [rw, rh, rf, rr, rStyles, isTablet]);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return products
      .filter(p => !category || p.category === category)
      .filter(p => {
        if (!words.length) return true;
        const haystack = [p.name, p.brand, p.category, p.quantity, p.barcode].filter(Boolean).join(' ').toLowerCase();
        return words.every(w => haystack.includes(w));
      })
      .sort((a, b) => Number(b.inStock) - Number(a.inStock));
  }, [products, query, category]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.content}>
        <View style={s.searchRow}>
          <Text>🔍</Text>
          <TextInput
            style={s.input}
            value={query}
            onChangeText={setQuery}
            placeholder={t('shop.searchPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            autoFocus={false}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="never"
            accessibilityLabel={t('shop.searchPlaceholder')}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={t('shop.clearSearch')}>
              <Text style={s.clear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {categories.length > 0 && (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow} keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={[s.chip, !category && s.chipActive]} onPress={() => setCategory(undefined)}>
                <Text style={[s.chipText, !category && s.chipTextActive]}>{t('shop.allCategories')}</Text>
              </TouchableOpacity>
              {categories.map(c => (
                <TouchableOpacity key={c} style={[s.chip, category === c && s.chipActive]} onPress={() => setCategory(category === c ? undefined : c)}>
                  <Text style={[s.chipText, category === c && s.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {results.length > 0 && (
          <Text style={s.count}>{t('shop.resultCount', { count: results.length })}</Text>
        )}

        <FlatList
          data={results}
          keyExtractor={p => p.barcode}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
          renderItem={({ item }) => (
            <ProductRow product={item} onPress={() => navigation.navigate('ShopProduct', { barcode: item.barcode })} />
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🤷</Text>
              <Text style={s.emptyText}>{t('shop.noResults')}</Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}
