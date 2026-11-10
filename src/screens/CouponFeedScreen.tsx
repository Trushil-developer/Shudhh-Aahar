// src/screens/CouponFeedScreen.tsx
// Coupon Exchange — the "Available" feed, styled as a row of ticket-style
// cards (dashed perforation between the details and the claim action, the
// standard visual language for a redeemable voucher). Claiming is atomic
// server-side (see claimCoupon's transaction in coupon-actions.js), so the
// row disappearing for everyone else the instant one person claims it is
// enforced by the backend, not by anything client-side here.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive } from '../utils/responsive';
import { StatusPill, RetailerAvatar, EmptyState } from '../components/CouponUI';
import { CouponListSkeleton } from '../components/Skeletons';
import { Coupon, listAvailableCoupons, claimCoupon } from '../services/couponService';
import logger from '../utils/logger';

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function CouponFeedScreen({ couponBanned, onClaimed, onGoToUpload }: {
  couponBanned: boolean; onClaimed: () => void; onGoToUpload?: () => void;
}) {
  const { t } = useTranslation();
  const { rw, rh, rf, rStyles } = useResponsive();
  const s = styles(rw, rh, rf, rStyles);

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { items } = await listAvailableCoupons();
      setCoupons(items || []);
    } catch (err) {
      logger.warn('coupon', 'listAvailableCoupons failed', {}, err as Error);
      Alert.alert(t('coupon.title'), t('coupon.feedLoadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleClaim = (coupon: Coupon) => {
    Alert.alert(
      t('coupon.claimConfirmTitle'),
      t('coupon.claimConfirmMessage'),
      [
        { text: t('coupon.claimConfirmCancel'), style: 'cancel' },
        {
          text: t('coupon.claimConfirmConfirm'),
          onPress: async () => {
            setClaimingId(coupon.id);
            try {
              await claimCoupon(coupon.id);
              Alert.alert(t('coupon.title'), t('coupon.claimSuccess'));
              setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
              onClaimed();
            } catch (err: any) {
              // logger.warn, not console.error — this is an expected,
              // already-handled outcome (cooldown/already-claimed/banned),
              // shown to the user via the Alert right below. console.error
              // would also pop React Native's LogBox dev-overlay on top of
              // that Alert, which reads as a second, unrelated "crash" for
              // the exact same expected rejection.
              logger.warn('coupon', 'claimCoupon failed', {}, err as Error);
              Alert.alert(t('coupon.title'), err?.message || t('coupon.claimError'));
              load();
            } finally {
              setClaimingId(null);
            }
          },
        },
      ],
    );
  };

  if (loading) return <CouponListSkeleton />;

  return (
    <FlatList
      data={coupons}
      keyExtractor={(c) => c.id}
      contentContainerStyle={s.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.navy} />}
      ListEmptyComponent={
        <EmptyState
          icon="🎟️"
          title={t('coupon.feedEmptyTitle')}
          subtitle={t('coupon.feedEmpty')}
          ctaLabel={onGoToUpload ? t('coupon.feedEmptyCta') : undefined}
          onCta={onGoToUpload}
        />
      }
      renderItem={({ item }) => (
        <View style={[s.card, Shadow.cardMd]}>
          <View style={s.topRow}>
            <RetailerAvatar retailer={item.retailer} />
            <View style={s.topRowText}>
              <Text style={s.retailer}>{item.retailer}</Text>
              {!!item.title && <Text style={s.title} numberOfLines={2}>{item.title}</Text>}
            </View>
            <View style={s.expiryPill}>
              <Text style={s.expiryPillText}>⏱ {formatExpiry(item.expiryAt)}</Text>
            </View>
          </View>

          <View style={s.perforation} />

          <TouchableOpacity
            style={[s.claimBtn, couponBanned && s.claimBtnDisabled]}
            disabled={couponBanned || claimingId === item.id}
            onPress={() => handleClaim(item)}
            activeOpacity={0.85}
          >
            {claimingId === item.id
              ? <ActivityIndicator color={Colors.textWhite} />
              : <Text style={s.claimBtnText}>{couponBanned ? `🔒 ${t('coupon.bannedShort')}` : `🎯 ${t('coupon.claimButton')}`}</Text>}
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

const styles = (rw: (n: number) => number, rh: (n: number) => number, rf: (n: number) => number, rStyles: any) => StyleSheet.create({
  list: { padding: rStyles.space.lg, flexGrow: 1 },
  card: {
    backgroundColor: Colors.surface, borderRadius: rStyles.radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: rStyles.space.lg, marginBottom: rStyles.space.md,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: rw(12), marginBottom: rh(14) },
  topRowText: { flex: 1 },
  retailer: { fontSize: rStyles.text.md, fontWeight: '800', color: Colors.textPrimary },
  title: { fontSize: rStyles.text.sm, color: Colors.textSecondary, marginTop: rh(2) },
  expiryPill: { backgroundColor: Colors.surfaceAlt, borderRadius: rStyles.radius.pill, paddingHorizontal: rw(8), paddingVertical: rh(4) },
  expiryPillText: { fontSize: rStyles.text.xs, color: Colors.textMuted, fontWeight: '700' },
  perforation: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: Colors.borderStrong, marginBottom: rh(14) },
  claimBtn: { backgroundColor: Colors.navy, borderRadius: rStyles.radius.pill, paddingVertical: rh(13), alignItems: 'center' },
  claimBtnDisabled: { backgroundColor: Colors.borderStrong },
  claimBtnText: { color: Colors.textWhite, fontWeight: '700', fontSize: rStyles.text.base },
});
