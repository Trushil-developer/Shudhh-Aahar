// src/screens/OrdersScreen.tsx
// The customer's orders, newest first. Refreshes every time the tab is
// opened so status changes made in the admin dashboard show up.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { SignInModal } from '../components/ShopUI';
import { listMyOrders, ShopOrder, formatPrice } from '../services/shopService';
import { ShopNav } from '../navigation/shopRoutes';
import { Colors } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';
import { OrderStatusPill } from './OrderDetailScreen';

export default function OrdersScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<ShopNav>();
  const { user } = useAuth();
  const { rw, rh, rf, rr, rStyles, isTablet } = useResponsive();
  const [orders, setOrders] = useState<ShopOrder[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    content: { flex: 1, ...(isTablet ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center', width: '100%' } : {}) },
    title: { fontSize: rf(24), fontWeight: '800', color: Colors.textPrimary, paddingHorizontal: rStyles.space.lg, paddingTop: rh(8), paddingBottom: rh(8) },
    list: { paddingHorizontal: rStyles.space.lg, paddingBottom: rh(32) },
    card: { backgroundColor: Colors.surface, borderRadius: rr(14), borderWidth: 1, borderColor: Colors.border, padding: rw(14), marginBottom: rh(10) },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    orderNo: { fontSize: rf(15), fontWeight: '800', color: Colors.textPrimary },
    meta: { fontSize: rf(12), color: Colors.textMuted, marginTop: rh(6) },
    total: { fontSize: rf(15), fontWeight: '800', color: Colors.textPrimary, marginTop: rh(6) },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(32) },
    icon: { fontSize: rf(44), marginBottom: rh(10) },
    emptyTitle: { fontSize: rf(18), fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
    emptyText: { fontSize: rf(14), color: Colors.textSecondary, textAlign: 'center', marginTop: rh(6) },
    btn: { marginTop: rh(18), backgroundColor: Colors.navy, borderRadius: rr(12), paddingHorizontal: rw(22), paddingVertical: rh(12) },
    btnText: { color: Colors.textWhite, fontWeight: '800', fontSize: rf(15) },
  }), [rw, rh, rf, rr, rStyles, isTablet]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setOrders(await listMyOrders());
      setError(false);
    } catch {
      setError(true);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!user) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <Text style={s.title}>{t('shop.orders')}</Text>
        <View style={s.centre}>
          <Text style={s.icon}>📦</Text>
          <Text style={s.emptyTitle}>{t('shop.signInForOrdersTitle')}</Text>
          <Text style={s.emptyText}>{t('shop.signInForOrdersText')}</Text>
          <TouchableOpacity style={s.btn} onPress={() => setSignInOpen(true)}><Text style={s.btnText}>{t('shop.signIn')}</Text></TouchableOpacity>
        </View>
        <SignInModal visible={signInOpen} onClose={() => setSignInOpen(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.content}>
        <Text style={s.title}>{t('shop.orders')}</Text>
        {orders === null && !error ? (
          <View style={s.centre}><ActivityIndicator color={Colors.navyMid} /></View>
        ) : (
          <FlatList
            data={orders || []}
            keyExtractor={o => o.id}
            contentContainerStyle={s.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.card} onPress={() => navigation.navigate('OrderDetail', { order: item })} activeOpacity={0.85}>
                <View style={s.cardTop}>
                  <Text style={s.orderNo}>{t('shop.orderNumber', { number: item.orderNumber })}</Text>
                  <OrderStatusPill status={item.status} />
                </View>
                <Text style={s.meta}>
                  {new Date(item.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' · '}{t('shop.itemCount', { count: item.items.reduce((n, i) => n + i.qty, 0) })}
                </Text>
                <Text style={s.total}>{formatPrice(item.totalPence)}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={s.centre}>
                <Text style={s.icon}>{error ? '📶' : '📦'}</Text>
                <Text style={s.emptyTitle}>{error ? t('shop.ordersLoadError') : t('shop.noOrdersTitle')}</Text>
                {!error && <Text style={s.emptyText}>{t('shop.noOrdersText')}</Text>}
                {error && <TouchableOpacity style={s.btn} onPress={onRefresh}><Text style={s.btnText}>{t('common.tryAgain')}</Text></TouchableOpacity>}
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
