// src/screens/AddressScreen.tsx
// Standalone delivery-address form, shown right after sign-in when the
// account has no complete saved address yet (see SignInModal in ShopUI.tsx).
// CheckoutScreen has its own inline copy of these same fields for editing
// the address at order time — this screen only covers the first-time,
// post-sign-in prompt.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import {
  DeliveryAddress, EMPTY_ADDRESS, getSavedAddress, isAddressComplete, saveAddress,
} from '../services/shopService';
import { Colors } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';

export default function AddressScreen({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { rw, rh, rf, rr, isTablet } = useResponsive();
  const [address, setAddress] = useState<DeliveryAddress>(EMPTY_ADDRESS);

  useEffect(() => {
    getSavedAddress().then(saved => {
      setAddress(saved || { ...EMPTY_ADDRESS, fullName: user?.name || '' });
    });
  }, [user?.name]);

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    body: { padding: rw(20), paddingTop: rh(80), paddingBottom: rh(40), ...(isTablet ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center', width: '100%' } : {}) },
    title: { fontSize: rf(22), fontWeight: '800', color: Colors.textPrimary, marginBottom: rh(6) },
    subtitle: { fontSize: rf(14), color: Colors.textSecondary, marginBottom: rh(20) },
    label: { fontSize: rf(12), fontWeight: '600', color: Colors.textSecondary, marginBottom: rh(4) },
    input: { borderWidth: 1, borderColor: Colors.border, borderRadius: rr(10), paddingHorizontal: rw(12), paddingVertical: rh(10), fontSize: rf(15), color: Colors.textPrimary, backgroundColor: Colors.surface, marginBottom: rh(12) },
    row2: { flexDirection: 'row', gap: rw(10) },
    flex1: { flex: 1 },
    saveBtn: { marginTop: rh(8), backgroundColor: Colors.navy, borderRadius: rr(14), height: rh(54), alignItems: 'center', justifyContent: 'center' },
    saveBtnDisabled: { backgroundColor: Colors.border },
    saveText: { color: Colors.textWhite, fontSize: rf(16), fontWeight: '800' },
  }), [rw, rh, rf, rr, isTablet]);

  const set = (field: keyof DeliveryAddress) => (value: string) => setAddress(prev => ({ ...prev, [field]: value }));
  const complete = isAddressComplete(address);

  const handleSave = async () => {
    if (!complete) return;
    await saveAddress(address);
    onDone();
  };

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAwareScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" extraScrollHeight={rh(24)}>
        <Text style={s.title}>{t('shop.addressGateTitle')}</Text>
        <Text style={s.subtitle}>{t('shop.addressGateSubtitle')}</Text>

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
        <Text style={s.label}>{t('shop.phone')}</Text>
        <TextInput style={s.input} value={address.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />

        <TouchableOpacity style={[s.saveBtn, !complete && s.saveBtnDisabled]} disabled={!complete} onPress={handleSave} activeOpacity={0.85}>
          <Text style={s.saveText}>{t('shop.saveAddress')}</Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
