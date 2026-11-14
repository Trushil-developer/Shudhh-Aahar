// src/screens/OrderDetailScreen.tsx
// One order: status timeline, items, totals and delivery address. The
// customer can cancel while it's still PLACED (before we confirm it).

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { cancelMyOrder, listMyOrders, formatPrice, ShopOrder, OrderStatus } from '../services/shopService';
import { ShopNav, ShopStackParamList } from '../navigation/shopRoutes';
import { Colors } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';

const TIMELINE: OrderStatus[] = ['PLACED', 'CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const STATUS_COLORS: Record<OrderStatus, { fg: string; bg: string }> = {
  PLACED:           { fg: Colors.caution,   bg: Colors.cautionBg },
  CONFIRMED:        { fg: Colors.info,      bg: Colors.infoBg },
  OUT_FOR_DELIVERY: { fg: Colors.info,      bg: Colors.infoBg },
  DELIVERED:        { fg: Colors.safe,      bg: Colors.safeBg },
  CANCELLED:        { fg: Colors.textMuted, bg: Colors.surfaceAlt },
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  const { rw, rh, rf, rStyles } = useResponsive();
  const c = STATUS_COLORS[status] || STATUS_COLORS.PLACED;
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: rStyles.radius.pill, paddingHorizontal: rw(10), paddingVertical: rh(4) }}>
      <Text style={{ color: c.fg, fontSize: rf(12), fontWeight: '800' }}>{t(`shop.status.${status}`)}</Text>
    </View>
  );
}

export default function OrderDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<ShopNav>();
  const { order: initial, justPlaced } = useRoute<RouteProp<ShopStackParamList, 'OrderDetail'>>().params;
  const { rw, rh, rf, rr, rStyles, isTablet } = useResponsive();
  const [order, setOrder] = useState<ShopOrder>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    topBar: { paddingHorizontal: rw(16), paddingVertical: rh(8) },
    back: { fontSize: rf(15), fontWeight: '700', color: Colors.navy },
    body: { padding: rStyles.space.lg, paddingBottom: rh(40), ...(isTablet ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center', width: '100%' } : {}) },
    success: { backgroundColor: Colors.safeBg, borderColor: Colors.safeBorder, borderWidth: 1, borderRadius: rr(14), padding: rw(14), marginBottom: rh(16) },
    successTitle: { fontSize: rf(16), fontWeight: '800', color: Colors.safe },
    successText: { fontSize: rf(13), color: Colors.textPrimary, marginTop: rh(4) },
    headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    orderNo: { fontSize: rf(20), fontWeight: '800', color: Colors.textPrimary },
    placedAt: { fontSize: rf(12), color: Colors.textMuted, marginTop: rh(4), marginBottom: rh(16) },
    card: { backgroundColor: Colors.surface, borderRadius: rr(14), borderWidth: 1, borderColor: Colors.border, padding: rw(14), marginBottom: rh(16) },
    section: { fontSize: rf(12), fontWeight: '800', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: rh(8) },
    step: { flexDirection: 'row', alignItems: 'center', gap: rw(12), paddingVertical: rh(6) },
    dot: { width: rw(22), height: rw(22), borderRadius: rw(11), alignItems: 'center', justifyContent: 'center' },
    dotText: { color: Colors.textWhite, fontSize: rf(12), fontWeight: '800' },
    stepText: { fontSize: rf(14), fontWeight: '600' },
    cancelledText: { fontSize: rf(14), fontWeight: '700', color: Colors.danger },
    itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: rh(5), gap: rw(10) },
    itemName: { flex: 1, fontSize: rf(14), color: Colors.textPrimary },
    itemMeta: { color: Colors.textMuted },
    itemPrice: { fontSize: rf(14), fontWeight: '600', color: Colors.textPrimary },
    divider: { height: 1, backgroundColor: Colors.border, marginVertical: rh(8) },
    sumLabel: { fontSize: rf(14), color: Colors.textSecondary },
    totalText: { fontSize: rf(16), fontWeight: '800', color: Colors.textPrimary },
    address: { fontSize: rf(14), color: Colors.textPrimary, lineHeight: rf(21) },
    cancelBtn: { borderWidth: 1, borderColor: Colors.dangerBorder, backgroundColor: Colors.dangerBg, borderRadius: rr(14), height: rh(50), alignItems: 'center', justifyContent: 'center' },
    cancelText: { color: Colors.danger, fontSize: rf(15), fontWeight: '800' },
  }), [rw, rh, rf, rr, rStyles, isTablet]);

  const refresh = useCallback(async () => {
    try {
      const latest = (await listMyOrders()).find(o => o.id === initial.id);
      if (latest) setOrder(latest);
    } catch { /* keep showing what we have */ }
  }, [initial.id]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const confirmCancel = () => {
    Alert.alert(t('shop.cancelOrderTitle'), t('shop.cancelOrderMessage'), [
      { text: t('shop.keepOrder'), style: 'cancel' },
      {
        text: t('shop.cancelOrder'), style: 'destructive', onPress: async () => {
          setCancelling(true);
          try {
            setOrder(await cancelMyOrder(order.id));
          } catch (err) {
            Alert.alert(t('shop.cancelFailedTitle'), (err as Error).message);
            refresh();
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const reached = TIMELINE.indexOf(order.status);
  const a = order.address;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Orders'))} hitSlop={10}>
          <Text style={s.back}>‹ {t('shop.orders')}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {justPlaced && order.status === 'PLACED' && (
          <View style={s.success}>
            <Text style={s.successTitle}>{t('shop.orderPlacedTitle')}</Text>
            <Text style={s.successText}>{t('shop.orderPlacedText')}</Text>
          </View>
        )}

        <View style={s.headRow}>
          <Text style={s.orderNo}>{t('shop.orderNumber', { number: order.orderNumber })}</Text>
          <OrderStatusPill status={order.status} />
        </View>
        <Text style={s.placedAt}>{t('shop.placedAt', { date: new Date(order.createdAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</Text>

        <View style={s.card}>
          <Text style={s.section}>{t('shop.statusHeading')}</Text>
          {order.status === 'CANCELLED' ? (
            <Text style={s.cancelledText}>{t('shop.orderCancelled')}</Text>
          ) : TIMELINE.map((step, i) => {
            const done = i <= reached;
            return (
              <View key={step} style={s.step}>
                <View style={[s.dot, { backgroundColor: done ? Colors.safe : Colors.border }]}>
                  <Text style={s.dotText}>{done ? '✓' : ''}</Text>
                </View>
                <Text style={[s.stepText, { color: done ? Colors.textPrimary : Colors.textMuted }]}>{t(`shop.status.${step}`)}</Text>
              </View>
            );
          })}
        </View>

        <View style={s.card}>
          <Text style={s.section}>{t('shop.items')}</Text>
          {order.items.map(i => (
            <View key={i.barcode} style={s.itemRow}>
              <Text style={s.itemName}>{i.qty} × {i.name}{i.quantity ? <Text style={s.itemMeta}> · {i.quantity}</Text> : null}</Text>
              <Text style={s.itemPrice}>{formatPrice(i.lineTotalPence)}</Text>
            </View>
          ))}
          <View style={s.divider} />
          <View style={s.itemRow}><Text style={s.sumLabel}>{t('shop.subtotal')}</Text><Text style={s.itemPrice}>{formatPrice(order.subtotalPence)}</Text></View>
          <View style={s.itemRow}><Text style={s.sumLabel}>{t('shop.delivery')}</Text><Text style={s.itemPrice}>{order.deliveryFeePence === 0 ? t('shop.free') : formatPrice(order.deliveryFeePence)}</Text></View>
          <View style={s.itemRow}><Text style={s.totalText}>{t('shop.total')}</Text><Text style={s.totalText}>{formatPrice(order.totalPence)}</Text></View>
          <Text style={[s.sumLabel, { marginTop: rh(6) }]}>💷 {t('shop.payOnDelivery')}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.section}>{t('shop.deliveryAddress')}</Text>
          <Text style={s.address}>{[a.fullName, a.line1, a.line2, `${a.city} ${a.postcode}`, a.phone].filter(Boolean).join('\n')}</Text>
          {order.note ? <Text style={[s.sumLabel, { marginTop: rh(8) }]}>📝 {order.note}</Text> : null}
        </View>

        {order.status === 'PLACED' && (
          <TouchableOpacity style={s.cancelBtn} onPress={confirmCancel} disabled={cancelling} activeOpacity={0.85}>
            <Text style={s.cancelText}>{cancelling ? t('shop.cancelling') : t('shop.cancelOrder')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
