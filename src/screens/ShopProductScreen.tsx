// src/screens/ShopProductScreen.tsx
// One product: photo, size, price and add-to-basket.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useShop } from '../context/ShopContext';
import { ProductImage, QtyStepper } from '../components/ShopUI';
import { formatPrice } from '../services/shopService';
import { ShopNav, ShopStackParamList } from '../navigation/shopRoutes';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';

export default function ShopProductScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<ShopNav>();
  const { barcode } = useRoute<RouteProp<ShopStackParamList, 'ShopProduct'>>().params;
  const { productsByBarcode, qtyInCart, setQty, addToCart } = useShop();
  const { rw, rh, rf, rr, isTablet } = useResponsive();
  const product = productsByBarcode.get(barcode);
  const qty = qtyInCart(barcode);

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rw(16), paddingVertical: rh(8) },
    back: { fontSize: rf(15), fontWeight: '700', color: Colors.navy },
    body: { padding: rw(20), paddingBottom: rh(140), ...(isTablet ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center', width: '100%' } : {}) },
    imageCard: { backgroundColor: Colors.surface, borderRadius: rr(18), borderWidth: 1, borderColor: Colors.border, height: rh(260), padding: rw(20), marginBottom: rh(20), ...Shadow.card },
    image: { width: '100%', height: '100%' },
    brand: { fontSize: rf(12), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1 },
    name: { fontSize: rf(22), fontWeight: '800', color: Colors.textPrimary, marginTop: rh(4) },
    size: { fontSize: rf(14), color: Colors.textSecondary, marginTop: rh(4) },
    price: { fontSize: rf(26), fontWeight: '800', color: Colors.navy, marginTop: rh(14) },
    stock: { fontSize: rf(13), fontWeight: '700', marginTop: rh(6) },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, padding: rw(16), paddingBottom: rh(28), flexDirection: 'row', alignItems: 'center', gap: rw(12) },
    primaryBtn: { flex: 1, backgroundColor: Colors.navy, borderRadius: rr(14), height: rh(52), alignItems: 'center', justifyContent: 'center' },
    primaryBtnDisabled: { backgroundColor: Colors.border },
    primaryBtnText: { color: Colors.textWhite, fontSize: rf(16), fontWeight: '800' },
    missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(32) },
    missingText: { fontSize: rf(15), color: Colors.textSecondary, textAlign: 'center' },
  }), [rw, rh, rf, rr, isTablet]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button">
          <Text style={s.back}>‹ {t('common.back')}</Text>
        </TouchableOpacity>
      </View>

      {!product ? (
        <View style={s.missing}><Text style={s.missingText}>{t('shop.productUnavailable')}</Text></View>
      ) : (
        <>
          <ScrollView contentContainerStyle={s.body}>
            <View style={s.imageCard}><ProductImage uri={product.image} style={s.image} /></View>
            {product.brand ? <Text style={s.brand}>{product.brand.toUpperCase()}</Text> : null}
            <Text style={s.name}>{product.name}</Text>
            {product.quantity ? <Text style={s.size}>{product.quantity}</Text> : null}
            <Text style={s.price}>{formatPrice(product.pricePence)}</Text>
            <Text style={[s.stock, { color: product.inStock ? Colors.safe : Colors.danger }]}>
              {product.inStock ? t('shop.inStock') : t('shop.outOfStock')}
            </Text>
          </ScrollView>

          <View style={s.footer}>
            {qty > 0 && <QtyStepper qty={qty} onChange={n => setQty(barcode, n)} />}
            {qty > 0 ? (
              <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.getParent()?.navigate('CartTab', { screen: 'Cart' })} activeOpacity={0.85}>
                <Text style={s.primaryBtnText}>{t('shop.viewBasket')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[s.primaryBtn, !product.inStock && s.primaryBtnDisabled]}
                disabled={!product.inStock}
                onPress={() => addToCart(barcode)}
                activeOpacity={0.85}
              >
                <Text style={s.primaryBtnText}>{product.inStock ? t('shop.addToBasket') : t('shop.outOfStock')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
