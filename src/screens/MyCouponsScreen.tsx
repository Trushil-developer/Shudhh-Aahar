// src/screens/MyCouponsScreen.tsx
// Coupon Exchange — "My Coupons": what I've shared, and what I've claimed
// (with a live countdown bar to validate or report a claim before its
// 24-hour-or-expiry window runs out).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, Modal, Image } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive } from '../utils/responsive';
import { StatusPill, RetailerAvatar, ProgressBar, EmptyState } from '../components/CouponUI';
import { CouponListSkeleton } from '../components/Skeletons';
import { Coupon, listMyUploadedCoupons, listMyClaimedCoupons, validateCoupon, getCouponImageUrl, deleteMyCoupon, ScamReasonCode } from '../services/couponService';
import logger from '../utils/logger';

const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function formatValidity(c: Coupon): string {
  return c.validFrom ? `${shortDate(c.validFrom)} – ${shortDate(c.expiryAt)}` : shortDate(c.expiryAt);
}

function timeLeftLabel(claimExpiryAt: string): string | null {
  const ms = new Date(claimExpiryAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// Green while there's plenty of time, amber under 6h, red under 1h — same
// escalation idea as a low-battery indicator.
function countdownTint(fractionRemaining: number): string {
  if (fractionRemaining > 0.25) return Colors.safe;
  if (fractionRemaining > 0.04) return Colors.caution;
  return Colors.danger;
}

export default function MyCouponsScreen() {
  const { t } = useTranslation();
  const { rw, rh, rf, rStyles } = useResponsive();
  const s = styles(rw, rh, rf, rStyles);

  const [uploads, setUploads] = useState<Coupon[]>([]);
  const [claims, setClaims] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [loadingImageId, setLoadingImageId] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const [u, c] = await Promise.all([listMyUploadedCoupons(), listMyClaimedCoupons()]);
      setUploads(u.items || []);
      setClaims(c.items || []);
    } catch (err) {
      logger.warn('coupon', 'MyCouponsScreen load failed', {}, err as Error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Re-renders the countdown bar every 30s without a full data refetch.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = () => { setRefreshing(true); load(); };

  const submitValidation = async (couponId: string, result: 'VALID' | 'SCAM', reasonCode?: ScamReasonCode) => {
    setBusyId(couponId);
    try {
      await validateCoupon(couponId, result, reasonCode);
      Alert.alert(t('coupon.title'), t('coupon.validateSuccess'));
      load();
    } catch (err: any) {
      logger.warn('coupon', 'validateCoupon failed', {}, err as Error);
      Alert.alert(t('coupon.title'), err?.message || t('coupon.validateError'));
    } finally {
      setBusyId(null);
    }
  };

  const handleScam = (couponId: string) => {
    Alert.alert(t('coupon.scamReasonTitle'), undefined, [
      { text: t('coupon.scamReasonFakeOrInvalid'), onPress: () => submitValidation(couponId, 'SCAM', 'FAKE_OR_INVALID') },
      { text: t('coupon.scamReasonAlreadyRedeemed'), onPress: () => submitValidation(couponId, 'SCAM', 'ALREADY_REDEEMED') },
      { text: t('coupon.scamReasonOther'), onPress: () => submitValidation(couponId, 'SCAM', 'OTHER') },
      { text: t('coupon.claimConfirmCancel'), style: 'cancel' },
    ]);
  };

  const handleDelete = (couponId: string) => {
    Alert.alert(
      t('coupon.deleteConfirmTitle'),
      t('coupon.deleteConfirmMessage'),
      [
        { text: t('coupon.claimConfirmCancel'), style: 'cancel' },
        {
          text: t('coupon.deleteConfirmConfirm'),
          style: 'destructive',
          onPress: async () => {
            setBusyId(couponId);
            try {
              await deleteMyCoupon(couponId);
              load();
            } catch (err: any) {
              logger.warn('coupon', 'deleteMyCoupon failed', {}, err as Error);
              Alert.alert(t('coupon.title'), err?.message || t('coupon.deleteError'));
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const viewImage = async (couponId: string) => {
    // Fetching the signed URL is a real network round-trip — without this,
    // "View barcode" gave no feedback at all until it resolved, which read
    // as the tap not having registered.
    setLoadingImageId(couponId);
    try {
      const url = await getCouponImageUrl(couponId);
      setViewerUrl(url);
    } catch (err) {
      logger.warn('coupon', 'getCouponImageUrl failed', {}, err as Error);
      Alert.alert(t('coupon.title'), t('coupon.imageLoadError'));
    } finally {
      setLoadingImageId(null);
    }
  };

  if (loading) return <CouponListSkeleton />;

  return (
    <>
      <ScrollView
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.navy} />}
      >
        <Text style={s.sectionTitle}>⏳ {t('coupon.myClaimsTitle')}</Text>
        {claims.length === 0 && <Text style={s.emptyText}>{t('coupon.noClaims')}</Text>}
        {claims.map((c) => {
          const remaining = c.status === 'CLAIMED' && c.claimExpiryAt ? timeLeftLabel(c.claimExpiryAt) : null;
          const fraction = c.status === 'CLAIMED' && c.claimExpiryAt
            ? Math.max(0, (new Date(c.claimExpiryAt).getTime() - Date.now())) / CLAIM_WINDOW_MS
            : 0;
          return (
            <View key={c.id} style={[s.card, Shadow.card]}>
              <View style={s.cardHeader}>
                <RetailerAvatar retailer={c.retailer} size={30} />
                <View style={s.cardHeaderText}>
                  <Text style={s.retailer}>{c.retailer}</Text>
                  {!!c.title && <Text style={s.title} numberOfLines={1}>{c.title}</Text>}
                </View>
                <StatusPill status={c.status} />
              </View>
              <TouchableOpacity onPress={() => viewImage(c.id)} style={s.link} disabled={loadingImageId === c.id}>
                {loadingImageId === c.id
                  ? <ActivityIndicator size="small" color={Colors.navy} />
                  : <Text style={s.linkText}>🖼 {t('coupon.viewBarcode')}</Text>}
              </TouchableOpacity>
              {c.status === 'CLAIMED' && (
                <>
                  <ProgressBar progress={fraction} tint={countdownTint(fraction)} />
                  <Text style={[s.countdownLabel, { color: countdownTint(fraction) }]}>
                    {remaining ? t('coupon.timeRemaining', { time: remaining }) : t('coupon.timeUp')}
                  </Text>
                  <View style={s.row}>
                    <TouchableOpacity style={s.validBtn} disabled={busyId === c.id} onPress={() => submitValidation(c.id, 'VALID')} activeOpacity={0.85}>
                      {busyId === c.id ? <ActivityIndicator color={Colors.textWhite} /> : <Text style={s.validBtnText}>✓ {t('coupon.validButton')}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={s.scamBtn} disabled={busyId === c.id} onPress={() => handleScam(c.id)} activeOpacity={0.85}>
                      <Text style={s.scamBtnText}>⚠ {t('coupon.scamButton')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          );
        })}

        <Text style={[s.sectionTitle, { marginTop: rh(24) }]}>📤 {t('coupon.myUploadsTitle')}</Text>
        {uploads.length === 0 && <Text style={s.emptyText}>{t('coupon.noUploads')}</Text>}
        {uploads.map((c) => (
          <View key={c.id} style={[s.card, Shadow.card]}>
            <View style={s.cardHeader}>
              <RetailerAvatar retailer={c.retailer} size={30} />
              <View style={s.cardHeaderText}>
                <Text style={s.retailer}>{c.retailer}</Text>
                {!!c.title && <Text style={s.title} numberOfLines={1}>{c.title}</Text>}
              </View>
              <StatusPill status={c.status} />
            </View>
            <Text style={s.validity}>{formatValidity(c)}</Text>
            {c.status === 'AVAILABLE' && (
              <TouchableOpacity style={s.deleteBtn} disabled={busyId === c.id} onPress={() => handleDelete(c.id)} activeOpacity={0.85}>
                {busyId === c.id
                  ? <ActivityIndicator color={Colors.danger} />
                  : <Text style={s.deleteBtnText}>🗑 {t('coupon.deleteButton')}</Text>}
              </TouchableOpacity>
            )}
          </View>
        ))}

        {claims.length === 0 && uploads.length === 0 && (
          <EmptyState icon="📋" title={t('coupon.myCouponsEmptyTitle')} subtitle={t('coupon.myCouponsEmptySubtitle')} />
        )}
      </ScrollView>

      <Modal visible={!!viewerUrl} animationType="none" transparent onRequestClose={() => setViewerUrl(null)}>
        {/* Modal presents in its own native window on iOS — SafeAreaProvider
            must be nested here too, or the SafeAreaView below silently gets
            zero insets, putting the close button under the notch/status bar
            where it's visible but not reliably tappable (same gotcha as
            ProfileScreen's SubscriptionScreen modal). Tapping ANYWHERE on the
            backdrop closes it too — not just the small ✕ — since a full-
            screen viewer with only one tiny tap target is an easy miss. */}
        <SafeAreaProvider>
          <TouchableOpacity
            style={s.viewerBackdropTouchable}
            activeOpacity={1}
            onPress={() => setViewerUrl(null)}
          >
            <SafeAreaView style={s.viewerBackdrop} edges={['top', 'bottom']} pointerEvents="box-none">
              <TouchableOpacity style={s.viewerClose} onPress={() => setViewerUrl(null)} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
                <Text style={s.viewerCloseText}>✕</Text>
              </TouchableOpacity>
              {!!viewerUrl && <Image source={{ uri: viewerUrl }} style={s.viewerImage} resizeMode="contain" />}
            </SafeAreaView>
          </TouchableOpacity>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

const styles = (rw: (n: number) => number, rh: (n: number) => number, rf: (n: number) => number, rStyles: any) => StyleSheet.create({
  emptyText: { color: Colors.textMuted, fontSize: rStyles.text.sm, marginBottom: rh(12) },
  list: { padding: rStyles.space.lg, flexGrow: 1 },
  sectionTitle: { fontSize: rStyles.text.md, fontWeight: '800', color: Colors.textPrimary, marginBottom: rh(10) },
  card: {
    backgroundColor: Colors.surface, borderRadius: rStyles.radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: rStyles.space.lg, marginBottom: rStyles.space.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: rw(10), marginBottom: rh(10) },
  cardHeaderText: { flex: 1 },
  retailer: { fontSize: rStyles.text.base, fontWeight: '800', color: Colors.textPrimary },
  title: { fontSize: rStyles.text.xs, color: Colors.textSecondary },
  validity: { fontSize: rStyles.text.xs, color: Colors.textMuted, fontWeight: '600' },
  link: { marginTop: rh(10), marginBottom: rh(4) },
  linkText: { fontSize: rStyles.text.sm, color: Colors.navy, fontWeight: '700' },
  countdownLabel: { fontSize: rStyles.text.xs, fontWeight: '700', marginTop: rh(6), marginBottom: rh(12) },
  row: { flexDirection: 'row', gap: rw(10) },
  validBtn: { flex: 1, backgroundColor: Colors.safe, borderRadius: rStyles.radius.md, paddingVertical: rh(11), alignItems: 'center' },
  validBtnText: { color: Colors.textWhite, fontWeight: '700', fontSize: rStyles.text.sm },
  scamBtn: { flex: 1, backgroundColor: Colors.dangerBg, borderWidth: 1, borderColor: Colors.dangerBorder, borderRadius: rStyles.radius.md, paddingVertical: rh(11), alignItems: 'center' },
  scamBtnText: { color: Colors.danger, fontWeight: '700', fontSize: rStyles.text.sm },
  deleteBtn: { flexDirection: 'row', alignSelf: 'flex-start', marginTop: rh(10), paddingVertical: rh(7), paddingHorizontal: rw(12), borderRadius: rStyles.radius.sm, borderWidth: 1, borderColor: Colors.dangerBorder },
  deleteBtnText: { color: Colors.danger, fontWeight: '700', fontSize: rStyles.text.xs },
  viewerBackdropTouchable: { flex: 1 },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: {
    position: 'absolute', top: rh(16), right: rw(16), zIndex: 1,
    width: rw(40), height: rw(40), borderRadius: rw(20),
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  viewerCloseText: { color: Colors.textWhite, fontSize: rf(20), fontWeight: '700' },
});
