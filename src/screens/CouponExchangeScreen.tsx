// src/screens/CouponExchangeScreen.tsx
// Coupon Exchange hub — rendered as a full-screen Modal from ProfileScreen
// (same pattern as SubscriptionScreen/CMSPageScreen: a modal toggled by local
// state, not a React Navigation stack screen — this app doesn't nest most
// secondary screens into the tab navigator's stacks).
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '../theme/medical';
import { useResponsive } from '../utils/responsive';
import { FeatureGate } from '../components/FeatureGate';
import { getMyCouponStanding, CouponStanding } from '../services/couponService';
import CouponFeedScreen from './CouponFeedScreen';
import MyCouponsScreen from './MyCouponsScreen';
import UploadCouponScreen from './UploadCouponScreen';
import VoucherScreen from './VoucherScreen';

type Tab = 'feed' | 'mine' | 'upload';
const TABS: { key: Tab; icon: string; labelKey: string }[] = [
  { key: 'feed', icon: '🎟️', labelKey: 'coupon.tabFeed' },
  { key: 'mine', icon: '📋', labelKey: 'coupon.tabMine' },
  { key: 'upload', icon: '➕', labelKey: 'coupon.tabUpload' },
];

// onClose is optional — this screen doubles as a bottom-tab screen (no close
// action, you just switch tabs) and, historically, a modal pushed from
// elsewhere. Only render the ✕ button when a caller actually needs it.
export default function CouponExchangeScreen({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const { rw, rh, rf, rStyles } = useResponsive();
  const s = styles(rw, rh, rf, rStyles);

  const [tab, setTab] = useState<Tab>('feed');
  const [standing, setStanding] = useState<CouponStanding | null>(null);
  const [showVouchers, setShowVouchers] = useState(false);

  const refreshStanding = useCallback(() => { getMyCouponStanding().then(setStanding); }, []);
  useFocusEffect(useCallback(() => { refreshStanding(); }, [refreshStanding]));

  return (
    <FeatureGate feature="couponExchange" fullScreen>
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Text style={s.headerTitle}>🎟️ {t('coupon.title')}</Text>
          <View style={s.headerRight}>
            {!!standing && (
              <TouchableOpacity onPress={() => setShowVouchers(true)} style={s.pointsPill} activeOpacity={0.8}>
                <Text style={s.pointsPillText}>🪙 {t('coupon.points', { count: standing.couponPoints })}</Text>
                <Text style={s.pointsPillChevron}>›</Text>
              </TouchableOpacity>
            )}
            {onClose && (
              <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                <Text style={s.closeBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {standing?.couponBanned && (
          <View style={s.bannedBanner}>
            <Text style={s.bannedBannerText}>🚫 {t('coupon.bannedBanner')}</Text>
          </View>
        )}

        <View style={s.tabBar}>
          {TABS.map(({ key, icon, labelKey }) => (
            <TouchableOpacity key={key} style={[s.tab, tab === key && s.tabActive]} onPress={() => setTab(key)} activeOpacity={0.8}>
              <Text style={s.tabIcon}>{icon}</Text>
              <Text style={[s.tabText, tab === key && s.tabTextActive]}>{t(labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.content}>
          {tab === 'feed' && (
            <CouponFeedScreen
              couponBanned={!!standing?.couponBanned}
              onClaimed={() => { refreshStanding(); setTab('mine'); }}
              onGoToUpload={() => setTab('upload')}
            />
          )}
          {tab === 'mine' && <MyCouponsScreen />}
          {tab === 'upload' && (
            standing?.couponBanned
              ? <View style={s.center}><Text style={s.emptyText}>🚫 {t('coupon.bannedBanner')}</Text></View>
              : <UploadCouponScreen onUploaded={() => { refreshStanding(); setTab('mine'); }} />
          )}
        </View>

        <Modal visible={showVouchers} animationType="slide" presentationStyle="fullScreen">
          <SafeAreaProvider>
            <VoucherScreen onClose={() => { setShowVouchers(false); refreshStanding(); }} />
          </SafeAreaProvider>
        </Modal>
      </SafeAreaView>
    </FeatureGate>
  );
}

const styles = (rw: (n: number) => number, rh: (n: number) => number, rf: (n: number) => number, rStyles: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rStyles.space.xxxl },
  emptyText: { color: Colors.textMuted, fontSize: rStyles.text.sm, textAlign: 'center', lineHeight: rf(20) },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: rStyles.space.lg, paddingVertical: rStyles.space.md, backgroundColor: Colors.navy,
  },
  headerTitle: { fontSize: rStyles.text.lg, fontWeight: '800', color: Colors.textWhite },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: rw(10) },
  pointsPill: {
    flexDirection: 'row', alignItems: 'center', gap: rw(4),
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: rStyles.radius.pill,
    paddingHorizontal: rw(12), paddingVertical: rh(6),
  },
  pointsPillText: { color: Colors.textWhite, fontWeight: '700', fontSize: rStyles.text.sm },
  pointsPillChevron: { color: 'rgba(255,255,255,0.7)', fontWeight: '800', fontSize: rStyles.text.base },
  closeBtn: { padding: rw(4) },
  closeBtnText: { color: Colors.textWhite, fontSize: rStyles.text.lg, fontWeight: '700' },
  bannedBanner: { backgroundColor: Colors.dangerBg, borderBottomWidth: 1, borderBottomColor: Colors.dangerBorder, padding: rStyles.space.md },
  bannedBannerText: { color: Colors.danger, fontSize: rStyles.text.xs, lineHeight: rf(17) },
  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    padding: rStyles.space.xs, gap: rw(6),
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rw(6),
    paddingVertical: rh(10), borderRadius: rStyles.radius.md,
  },
  tabActive: { backgroundColor: Colors.navyLight },
  tabIcon: { fontSize: rStyles.text.base },
  tabText: { fontSize: rStyles.text.xs, fontWeight: '700', color: Colors.textMuted },
  tabTextActive: { color: Colors.navy },
  content: { flex: 1 },
});
