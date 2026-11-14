// src/screens/CartScreen.tsx
// Basket: change quantities, see totals, then go to checkout (signing in
// first if needed). Items that have gone out of stock or been removed from
// the shop stay visible with a Remove button but aren't counted or ordered.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useShop, CartLine } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { ProductImage, QtyStepper, SignInModal } from '../components/ShopUI';
import { formatPrice } from '../services/shopService';
import { ShopNav } from '../navigation/shopRoutes';
import { Colors } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';

export default function CartScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<ShopNav>();
  const { user } = useAuth();
  const {
    cartLines, setQty, orderableLines, subtotalPence, deliveryFeePence, totalPence, belowMinimumByPence, settings,
  } = useShop();
  const { rw, rh, rf, rr, rStyles, isTablet } = useResponsive();
  const [signInOpen, setSignInOpen] = useState(false);
  const [checkoutAfterSignIn, setCheckoutAfterSignIn] = useState(false);

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    content: { flex: 1, ...(isTablet ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center', width: '100%' } : {}) },
    title: { fontSize: rf(24), fontWeight: '800', color: Colors.textPrimary, paddingHorizontal: rStyles.space.lg, paddingTop: rh(8), paddingBottom: rh(8) },
    list: { paddingHorizontal: rStyles.space.lg, paddingBottom: rh(16) },
    line: { flexDirection: 'row', alignItems: 'center', gap: rw(12), paddingVertical: rh(12), borderBottomWidth: 1, borderBottomColor: Colors.border },
    lineImage: { width: rw(56), height: rw(56) },
    lineInfo: { flex: 1 },
    lineName: { fontSize: rf(14), fontWeight: '600', color: Colors.textPrimary },
    lineMeta: { fontSize: rf(12), color: Colors.textMuted, marginTop: rh(2) },
    lineWarn: { fontSize: rf(12), fontWeight: '700', color: Colors.danger, marginTop: rh(2) },
    lineRight: { alignItems: 'flex-end', gap: rh(6) },
    lineTotal: { fontSize: rf(14), fontWeight: '800', color: Colors.textPrimary },
    remove: { fontSize: rf(13), fontWeight: '700', color: Colors.danger },
    summary: { backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, padding: rw(16) },
    sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: rh(6) },
    sumLabel: { fontSize: rf(14), color: Colors.textSecondary },
    sumValue: { fontSize: rf(14), fontWeight: '600', color: Colors.textPrimary },
    totalLabel: { fontSize: rf(17), fontWeight: '800', color: Colors.textPrimary },
    totalValue: { fontSize: rf(17), fontWeight: '800', color: Colors.textPrimary },
    hint: { fontSize: rf(12), color: Colors.textSecondary, marginTop: rh(4), marginBottom: rh(4) },
    warn: { fontSize: rf(13), fontWeight: '600', color: Colors.caution, marginTop: rh(4) },
    checkoutBtn: { marginTop: rh(12), backgroundColor: Colors.navy, borderRadius: rr(14), height: rh(52), alignItems: 'center', justifyContent: 'center' },
    checkoutBtnDisabled: { backgroundColor: Colors.border },
    checkoutText: { color: Colors.textWhite, fontSize: rf(16), fontWeight: '800' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(32) },
    emptyIcon: { fontSize: rf(48), marginBottom: rh(12) },
    emptyTitle: { fontSize: rf(18), fontWeight: '800', color: Colors.textPrimary },
    emptyText: { fontSize: rf(14), color: Colors.textSecondary, textAlign: 'center', marginTop: rh(6) },
    shopBtn: { marginTop: rh(18), backgroundColor: Colors.navy, borderRadius: rr(12), paddingHorizontal: rw(22), paddingVertical: rh(12) },
    shopBtnText: { color: Colors.textWhite, fontWeight: '800', fontSize: rf(15) },
  }), [rw, rh, rf, rr, rStyles, isTablet]);

  const closeSignIn = useCallback(() => {
    setSignInOpen(false);
    if (checkoutAfterSignIn) {
      setCheckoutAfterSignIn(false);
      // Only continue if they actually signed in (not just closed the sheet)
      if (user) navigation.navigate('Checkout');
    }
  }, [checkoutAfterSignIn, user, navigation]);

  const goToCheckout = () => {
    if (user) {
      navigation.navigate('Checkout');
    } else {
      setCheckoutAfterSignIn(true);
      setSignInOpen(true);
    }
  };

  if (cartLines.length === 0) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <Text style={s.title}>{t('shop.basket')}</Text>
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🛒</Text>
          <Text style={s.emptyTitle}>{t('shop.basketEmptyTitle')}</Text>
          <Text style={s.emptyText}>{t('shop.basketEmptyText')}</Text>
          <TouchableOpacity style={s.shopBtn} onPress={() => navigation.getParent()?.navigate('HomeTab')}>
            <Text style={s.shopBtnText}>{t('shop.startShopping')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const canCheckout = settings.shopOpen && orderableLines.length > 0 && belowMinimumByPence === 0;
  const freeDeliveryGap = settings.freeDeliveryOverPence > 0 ? settings.freeDeliveryOverPence - subtotalPence : 0;

  const renderLine = ({ item }: { item: CartLine }) => {
    const p = item.product;
    const unavailable = !p || !p.inStock;
    return (
      <View style={s.line}>
        <ProductImage uri={p?.image} style={s.lineImage} />
        <View style={s.lineInfo}>
          <Text style={s.lineName} numberOfLines={2}>{p?.name || t('shop.removedProduct')}</Text>
          {p && !unavailable && <Text style={s.lineMeta}>{formatPrice(p.pricePence)} {t('shop.each')}</Text>}
          {unavailable && <Text style={s.lineWarn}>{p ? t('shop.outOfStock') : t('shop.noLongerSold')}</Text>}
        </View>
        <View style={s.lineRight}>
          {unavailable ? (
            <TouchableOpacity onPress={() => setQty(item.barcode, 0)} hitSlop={8}><Text style={s.remove}>{t('shop.remove')}</Text></TouchableOpacity>
          ) : (
            <>
              <Text style={s.lineTotal}>{formatPrice(p!.pricePence * item.qty)}</Text>
              <QtyStepper qty={item.qty} onChange={n => setQty(item.barcode, n)} />
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.content}>
        <Text style={s.title}>{t('shop.basket')}</Text>
        <FlatList data={cartLines} keyExtractor={l => l.barcode} renderItem={renderLine} contentContainerStyle={s.list} />

        <View style={s.summary}>
          <View style={s.sumRow}><Text style={s.sumLabel}>{t('shop.subtotal')}</Text><Text style={s.sumValue}>{formatPrice(subtotalPence)}</Text></View>
          <View style={s.sumRow}>
            <Text style={s.sumLabel}>{t('shop.delivery')}</Text>
            <Text style={s.sumValue}>{deliveryFeePence === 0 ? t('shop.free') : formatPrice(deliveryFeePence)}</Text>
          </View>
          <View style={s.sumRow}><Text style={s.totalLabel}>{t('shop.total')}</Text><Text style={s.totalValue}>{formatPrice(totalPence)}</Text></View>
          {freeDeliveryGap > 0 && deliveryFeePence > 0 && (
            <Text style={s.hint}>{t('shop.freeDeliveryGap', { amount: formatPrice(freeDeliveryGap) })}</Text>
          )}
          {belowMinimumByPence > 0 && (
            <Text style={s.warn}>{t('shop.belowMinimum', { amount: formatPrice(belowMinimumByPence), min: formatPrice(settings.minOrderPence) })}</Text>
          )}
          {!settings.shopOpen && <Text style={s.warn}>{t('shop.closedBanner')}</Text>}
          <TouchableOpacity style={[s.checkoutBtn, !canCheckout && s.checkoutBtnDisabled]} disabled={!canCheckout} onPress={goToCheckout} activeOpacity={0.85}>
            <Text style={s.checkoutText}>{t('shop.checkout')}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <SignInModal visible={signInOpen} onClose={closeSignIn} />
    </SafeAreaView>
  );
}
