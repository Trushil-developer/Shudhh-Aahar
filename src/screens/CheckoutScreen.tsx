// src/screens/CheckoutScreen.tsx
// Delivery address + note, pay on delivery, place order. The postcode check
// here is only an early hint — shop-actions.js re-checks everything
// (postcode, stock, prices, minimum order) when the order is placed.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import {
  DeliveryAddress, formatPrice, getSavedAddress, placeOrder, saveAddress,
} from '../services/shopService';
import { ShopNav } from '../navigation/shopRoutes';
import { Colors } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';

const UK_POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;

// Mirrors postcodeAllowed in terraform/lambda/shop-actions.js.
function postcodeCovered(raw: string, entries: string[]): boolean {
  const pc = raw.toUpperCase().replace(/\s+/g, '');
  if (!UK_POSTCODE.test(pc)) return false;
  const outward = pc.slice(0, -3);
  const area = outward.replace(/[0-9].*$/, '');
  return entries.some(entry => {
    if (!/[0-9]/.test(entry)) return area === entry;
    if (outward === entry) return true;
    return entry.length > outward.length && pc.startsWith(entry);
  });
}

const EMPTY_ADDRESS: DeliveryAddress = { fullName: '', line1: '', line2: '', city: '', postcode: '', phone: '' };

export default function CheckoutScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<ShopNav>();
  const { user } = useAuth();
  const { orderableLines, subtotalPence, deliveryFeePence, totalPence, settings, clearCart, refreshCatalog } = useShop();
  const { rw, rh, rf, rr, rStyles, isTablet } = useResponsive();
  const [address, setAddress] = useState<DeliveryAddress>(EMPTY_ADDRESS);
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    getSavedAddress().then(saved => {
      setAddress(saved || { ...EMPTY_ADDRESS, fullName: user?.name || '' });
    });
  }, [user?.name]);

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rw(16), paddingVertical: rh(8) },
    back: { fontSize: rf(15), fontWeight: '700', color: Colors.navy },
    body: { padding: rStyles.space.lg, paddingBottom: rh(40), ...(isTablet ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center', width: '100%' } : {}) },
    title: { fontSize: rf(24), fontWeight: '800', color: Colors.textPrimary, marginBottom: rh(16) },
    section: { fontSize: rf(12), fontWeight: '800', color: Colors.textMuted, letterSpacing: 1.2, marginTop: rh(8), marginBottom: rh(8) },
    card: { backgroundColor: Colors.surface, borderRadius: rr(14), borderWidth: 1, borderColor: Colors.border, padding: rw(14), marginBottom: rh(16) },
    label: { fontSize: rf(12), fontWeight: '600', color: Colors.textSecondary, marginBottom: rh(4) },
    input: { borderWidth: 1, borderColor: Colors.border, borderRadius: rr(10), paddingHorizontal: rw(12), paddingVertical: rh(10), fontSize: rf(15), color: Colors.textPrimary, backgroundColor: Colors.bg, marginBottom: rh(12) },
    row2: { flexDirection: 'row', gap: rw(10) },
    flex1: { flex: 1 },
    postcodeWarn: { fontSize: rf(12), fontWeight: '600', color: Colors.danger, marginTop: rh(-6), marginBottom: rh(10) },
    payRow: { flexDirection: 'row', alignItems: 'center', gap: rw(10) },
    payIcon: { fontSize: rf(22) },
    payTitle: { fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary },
    payText: { fontSize: rf(12), color: Colors.textSecondary, marginTop: rh(2) },
    sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: rh(6) },
    sumLabel: { fontSize: rf(14), color: Colors.textSecondary },
    sumValue: { fontSize: rf(14), fontWeight: '600', color: Colors.textPrimary },
    totalLabel: { fontSize: rf(17), fontWeight: '800', color: Colors.textPrimary },
    placeBtn: { backgroundColor: Colors.navy, borderRadius: rr(14), height: rh(54), alignItems: 'center', justifyContent: 'center' },
    placeBtnDisabled: { backgroundColor: Colors.border },
    placeText: { color: Colors.textWhite, fontSize: rf(16), fontWeight: '800' },
  }), [rw, rh, rf, rr, rStyles, isTablet]);

  const set = (field: keyof DeliveryAddress) => (value: string) => setAddress(prev => ({ ...prev, [field]: value }));

  const postcodeEntered = address.postcode.replace(/\s+/g, '').length >= 5;
  const postcodeOk = postcodeCovered(address.postcode, settings.deliveryPostcodes);
  const complete = !!(address.fullName.trim() && address.line1.trim() && address.city.trim() && address.phone.trim() && postcodeOk);
  const itemCount = orderableLines.reduce((n, l) => n + l.qty, 0);

  const handlePlaceOrder = async () => {
    if (!complete || placing) return;
    setPlacing(true);
    try {
      const order = await placeOrder({
        items: orderableLines.map(l => ({ barcode: l.barcode, qty: l.qty })),
        address: { ...address, line2: address.line2?.trim() || undefined },
        note: note.trim() || undefined,
      });
      await saveAddress(address);
      clearCart();
      navigation.popToTop();
      navigation.getParent()?.navigate('OrdersTab', { screen: 'OrderDetail', params: { order, justPlaced: true } });
    } catch (err) {
      // Server messages are written for customers (out of stock, postcode,
      // minimum order) — show them as-is and refresh prices/stock.
      Alert.alert(t('shop.orderFailedTitle'), (err as Error).message || t('shop.orderFailedMessage'));
      refreshCatalog();
    } finally {
      setPlacing(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><Text style={s.back}>‹ {t('shop.basket')}</Text></TouchableOpacity>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" extraScrollHeight={rh(24)}>
        <Text style={s.title}>{t('shop.checkout')}</Text>

        <Text style={s.section}>{t('shop.deliveryAddress')}</Text>
        <View style={s.card}>
          <Text style={s.label}>{t('shop.fullName')}</Text>
          <TextInput style={s.input} value={address.fullName} onChangeText={set('fullName')} autoComplete="name" textContentType="name" />
          <Text style={s.label}>{t('shop.addressLine1')}</Text>
          <TextInput style={s.input} value={address.line1} onChangeText={set('line1')} autoComplete="address-line1" textContentType="streetAddressLine1" />
          <Text style={s.label}>{t('shop.addressLine2')}</Text>
          <TextInput style={s.input} value={address.line2} onChangeText={set('line2')} autoComplete="address-line2" textContentType="streetAddressLine2" />
          <View style={s.row2}>
            <View style={s.flex1}>
              <Text style={s.label}>{t('shop.city')}</Text>
              <TextInput style={s.input} value={address.city} onChangeText={set('city')} textContentType="addressCity" />
            </View>
            <View style={s.flex1}>
              <Text style={s.label}>{t('shop.postcode')}</Text>
              <TextInput style={s.input} value={address.postcode} onChangeText={v => set('postcode')(v.toUpperCase())} autoCapitalize="characters" autoComplete="postal-code" textContentType="postalCode" />
            </View>
          </View>
          {postcodeEntered && !postcodeOk && <Text style={s.postcodeWarn}>{t('shop.postcodeNotCovered')}</Text>}
          <Text style={s.label}>{t('shop.phone')}</Text>
          <TextInput style={s.input} value={address.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
          <Text style={s.label}>{t('shop.note')}</Text>
          <TextInput style={[s.input, { minHeight: rh(64) }]} value={note} onChangeText={setNote} multiline placeholder={t('shop.notePlaceholder')} placeholderTextColor={Colors.textMuted} maxLength={500} />
        </View>

        <Text style={s.section}>{t('shop.payment')}</Text>
        <View style={s.card}>
          <View style={s.payRow}>
            <Text style={s.payIcon}>💷</Text>
            <View style={s.flex1}>
              <Text style={s.payTitle}>{t('shop.payOnDelivery')}</Text>
              <Text style={s.payText}>{t('shop.payOnDeliveryText')}</Text>
            </View>
          </View>
        </View>

        <Text style={s.section}>{t('shop.summary')}</Text>
        <View style={s.card}>
          <View style={s.sumRow}><Text style={s.sumLabel}>{t('shop.itemCount', { count: itemCount })}</Text><Text style={s.sumValue}>{formatPrice(subtotalPence)}</Text></View>
          <View style={s.sumRow}><Text style={s.sumLabel}>{t('shop.delivery')}</Text><Text style={s.sumValue}>{deliveryFeePence === 0 ? t('shop.free') : formatPrice(deliveryFeePence)}</Text></View>
          <View style={s.sumRow}><Text style={s.totalLabel}>{t('shop.total')}</Text><Text style={s.totalLabel}>{formatPrice(totalPence)}</Text></View>
        </View>

        <TouchableOpacity style={[s.placeBtn, (!complete || placing) && s.placeBtnDisabled]} disabled={!complete || placing} onPress={handlePlaceOrder} activeOpacity={0.85}>
          {placing ? <ActivityIndicator color={Colors.textWhite} /> : <Text style={s.placeText}>{t('shop.placeOrder', { amount: formatPrice(totalPence) })}</Text>}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
