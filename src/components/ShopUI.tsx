// src/components/ShopUI.tsx
// Shared building blocks for the delivery shop screens.

import React, { useEffect, useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive } from '../utils/responsive';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { CatalogProduct, formatPrice } from '../services/shopService';
import LoginScreen from '../screens/LoginScreen';

function useShopStyles() {
  const { rw, rh, rf, rr, rStyles } = useResponsive();
  return useMemo(() => StyleSheet.create({
    tile: { flex: 1, backgroundColor: Colors.surface, borderRadius: rr(14), borderWidth: 1, borderColor: Colors.border, padding: rw(10), ...Shadow.card },
    tileImageWrap: { height: rh(96), alignItems: 'center', justifyContent: 'center', marginBottom: rh(8) },
    tileImage: { width: '100%', height: '100%' },
    placeholder: { fontSize: rf(32) },
    tileName: { fontSize: rf(13), fontWeight: '600', color: Colors.textPrimary, minHeight: rf(34) },
    tileSize: { fontSize: rf(11), color: Colors.textMuted, marginTop: rh(2) },
    tileFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: rh(8) },
    price: { fontSize: rf(15), fontWeight: '800', color: Colors.textPrimary },
    outOfStock: { fontSize: rf(11), fontWeight: '700', color: Colors.danger },

    row: { flexDirection: 'row', alignItems: 'center', gap: rw(12), paddingVertical: rh(10), borderBottomWidth: 1, borderBottomColor: Colors.border },
    rowImage: { width: rw(56), height: rw(56) },
    rowInfo: { flex: 1 },
    rowName: { fontSize: rf(14), fontWeight: '600', color: Colors.textPrimary },
    rowMeta: { fontSize: rf(12), color: Colors.textMuted, marginTop: rh(2) },

    addBtn: { backgroundColor: Colors.navy, borderRadius: rStyles.radius.pill, paddingHorizontal: rw(14), height: rw(32), alignItems: 'center', justifyContent: 'center' },
    addBtnText: { color: Colors.textWhite, fontSize: rf(13), fontWeight: '800' },
    stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.navyLight, borderRadius: rStyles.radius.pill, height: rw(32) },
    stepBtn: { width: rw(32), height: rw(32), alignItems: 'center', justifyContent: 'center' },
    stepBtnText: { fontSize: rf(18), fontWeight: '800', color: Colors.navy },
    stepQty: { minWidth: rw(22), textAlign: 'center', fontSize: rf(14), fontWeight: '800', color: Colors.navy },

    signInClose: { position: 'absolute', top: rh(54), right: rw(16), width: rw(36), height: rw(36), borderRadius: rw(18), backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    signInCloseText: { color: '#fff', fontSize: rf(16), fontWeight: '700' },
  }), [rw, rh, rf, rr, rStyles]);
}

export function ProductImage({ uri, style }: { uri?: string; style: any }) {
  const styles = useShopStyles();
  return uri
    ? <Image source={{ uri }} style={style} resizeMode="contain" />
    : <View style={[style, { alignItems: 'center', justifyContent: 'center' }]}><Text style={styles.placeholder}>🛒</Text></View>;
}

// "Add" until it's in the cart, then a − qty + stepper.
export function AddToCartControl({ product }: { product: CatalogProduct }) {
  const { t } = useTranslation();
  const styles = useShopStyles();
  const { qtyInCart, setQty, addToCart } = useShop();
  const qty = qtyInCart(product.barcode);

  if (!product.inStock) return <Text style={styles.outOfStock}>{t('shop.outOfStock')}</Text>;
  if (qty === 0) {
    return (
      <TouchableOpacity style={styles.addBtn} onPress={() => addToCart(product.barcode)} activeOpacity={0.8}
        accessibilityRole="button" accessibilityLabel={t('shop.addNamed', { name: product.name })}>
        <Text style={styles.addBtnText}>{t('shop.add')}</Text>
      </TouchableOpacity>
    );
  }
  return <QtyStepper qty={qty} onChange={n => setQty(product.barcode, n)} />;
}

export function QtyStepper({ qty, onChange }: { qty: number; onChange: (qty: number) => void }) {
  const { t } = useTranslation();
  const styles = useShopStyles();
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(qty - 1)} hitSlop={6} accessibilityLabel={t('shop.decrease')}>
        <Text style={styles.stepBtnText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepQty}>{qty}</Text>
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(qty + 1)} hitSlop={6} accessibilityLabel={t('shop.increase')}>
        <Text style={styles.stepBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ProductTile({ product, onPress }: { product: CatalogProduct; onPress: () => void }) {
  const styles = useShopStyles();
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.tileImageWrap}>
        <ProductImage uri={product.image} style={styles.tileImage} />
      </View>
      <Text style={styles.tileName} numberOfLines={2}>{product.name}</Text>
      <Text style={styles.tileSize} numberOfLines={1}>{product.quantity || ' '}</Text>
      <View style={styles.tileFooter}>
        <Text style={styles.price}>{formatPrice(product.pricePence)}</Text>
        <AddToCartControl product={product} />
      </View>
    </TouchableOpacity>
  );
}

export function ProductRow({ product, onPress }: { product: CatalogProduct; onPress: () => void }) {
  const styles = useShopStyles();
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
      <ProductImage uri={product.image} style={styles.rowImage} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{[product.quantity, formatPrice(product.pricePence)].filter(Boolean).join(' · ')}</Text>
      </View>
      <AddToCartControl product={product} />
    </TouchableOpacity>
  );
}

// Full-screen Google / Apple sign-in, shown only when an action needs an
// account (checkout, order history). Closes itself once signed in.
export function SignInModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const styles = useShopStyles();
  const { user } = useAuth();

  useEffect(() => {
    if (visible && user) onClose();
  }, [visible, user, onClose]);

  return (
    <Modal visible={visible && !user} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <TouchableOpacity style={styles.signInClose} onPress={onClose} accessibilityLabel={t('common.close')}>
          <Text style={styles.signInCloseText}>✕</Text>
        </TouchableOpacity>
        <LoginScreen />
      </SafeAreaProvider>
    </Modal>
  );
}
