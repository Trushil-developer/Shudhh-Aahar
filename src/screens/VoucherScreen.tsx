// src/screens/VoucherScreen.tsx
// Coupon Exchange — points redemption. 100 points = a £5 gift voucher for a
// brand from AppConfig.voucherBrands. Opened by tapping the points badge on
// CouponExchangeScreen's header.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive } from '../utils/responsive';
import { useAppConfig } from '../context/AppConfigContext';
import { ProgressBar, EmptyState } from '../components/CouponUI';
import {
  VoucherRequest, VOUCHER_COST_POINTS, VOUCHER_VALUE_LABEL,
  listMyVoucherRequests, requestVoucher,
} from '../services/voucherService';
import { getMyCouponStanding, CouponStanding } from '../services/couponService';
import logger from '../utils/logger';

const VOUCHER_STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string; labelKey: string }> = {
  PENDING: { color: Colors.caution, bg: Colors.cautionBg, border: Colors.cautionBorder, icon: '⏳', labelKey: 'voucher.statusPending' },
  FULFILLED: { color: Colors.safe, bg: Colors.safeBg, border: Colors.safeBorder, icon: '✓', labelKey: 'voucher.statusFulfilled' },
  REJECTED: { color: Colors.danger, bg: Colors.dangerBg, border: Colors.dangerBorder, icon: '↺', labelKey: 'voucher.statusRejected' },
};

export default function VoucherScreen({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const { rw, rh, rf, rStyles } = useResponsive();
  const s = styles(rw, rh, rf, rStyles);
  const { config: appConfig } = useAppConfig();

  const [standing, setStanding] = useState<CouponStanding | null>(null);
  const [requests, setRequests] = useState<VoucherRequest[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [standingRes, requestsRes] = await Promise.all([
      getMyCouponStanding(),
      listMyVoucherRequests().catch((err) => { logger.warn('voucher', 'listMyVoucherRequests failed', {}, err as Error); return { items: [] }; }),
    ]);
    setStanding(standingRes);
    setRequests(requestsRes.items || []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const points = standing?.couponPoints || 0;
  const readyCount = Math.floor(points / VOUCHER_COST_POINTS);
  const progress = points % VOUCHER_COST_POINTS;
  const canRequest = points >= VOUCHER_COST_POINTS;

  const submitRequest = () => {
    if (!selectedBrand) return;
    Alert.alert(
      t('voucher.requestConfirmTitle'),
      t('voucher.requestConfirmMessage', { cost: VOUCHER_COST_POINTS }),
      [
        { text: t('voucher.requestConfirmCancel'), style: 'cancel' },
        {
          text: t('voucher.requestConfirmConfirm'),
          onPress: async () => {
            setSubmitting(true);
            try {
              await requestVoucher(selectedBrand);
              Alert.alert(t('voucher.title'), t('voucher.requestSuccess'));
              setSelectedBrand(null);
              load();
            } catch (err: any) {
              logger.warn('voucher', 'requestVoucher failed', {}, err as Error);
              Alert.alert(t('voucher.title'), err?.message || t('voucher.requestError'));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={Colors.navy} /></View>;
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('voucher.title')}</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <View style={[s.heroCard, Shadow.cardMd]}>
          <View style={s.heroIconWrap}><Text style={s.heroIcon}>🎁</Text></View>
          <Text style={s.heroPoints}>{t('voucher.yourPoints', { count: points })}</Text>
          <Text style={s.heroExplainer}>{t('voucher.explainer', { cost: VOUCHER_COST_POINTS, value: VOUCHER_VALUE_LABEL })}</Text>
          {readyCount > 0 ? (
            <View style={s.readyPill}>
              <Text style={s.readyPillText}>🎉 {t('voucher.readyCount', { count: readyCount })}</Text>
            </View>
          ) : (
            <>
              <ProgressBar progress={progress / VOUCHER_COST_POINTS} tint={Colors.navy} />
              <Text style={s.progressLabel}>{t('voucher.progressToNext', { have: progress, cost: VOUCHER_COST_POINTS })}</Text>
            </>
          )}
        </View>

        <Text style={s.sectionTitle}>🏷️ {t('voucher.chooseBrand')}</Text>
        <View style={s.chipRow}>
          {(appConfig.voucherBrands || []).map((brand) => (
            <TouchableOpacity
              key={brand}
              style={[s.chip, selectedBrand === brand && s.chipActive]}
              onPress={() => setSelectedBrand(brand)}
              activeOpacity={0.8}
            >
              <Text style={[s.chipText, selectedBrand === brand && s.chipTextActive]}>{brand}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[s.requestBtn, (!canRequest || !selectedBrand) && s.requestBtnDisabled]}
          disabled={!canRequest || !selectedBrand || submitting}
          onPress={submitRequest}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color={Colors.textWhite} />
            : <Text style={s.requestBtnText}>🎁 {t('voucher.requestButton', { value: VOUCHER_VALUE_LABEL })}</Text>}
        </TouchableOpacity>

        <Text style={[s.sectionTitle, { marginTop: rh(28) }]}>📜 {t('voucher.myRequestsTitle')}</Text>
        {requests.length === 0 && (
          <EmptyState icon="🎁" title={t('voucher.myRequestsEmptyTitle')} subtitle={t('voucher.noRequests')} />
        )}
        {requests.map((r) => {
          const cfg = VOUCHER_STATUS_CONFIG[r.status] || VOUCHER_STATUS_CONFIG.PENDING;
          return (
            <View key={r.id} style={[s.requestCard, Shadow.card]}>
              <View style={s.cardHeader}>
                <Text style={s.brand}>{r.brand}</Text>
                <View style={[s.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                  <Text style={[s.statusPillText, { color: cfg.color }]}>{cfg.icon} {t(cfg.labelKey)}</Text>
                </View>
              </View>
              <Text style={s.pointsSpent}>{t('voucher.pointsLabel', { count: r.pointsSpent })}</Text>
              {r.status === 'FULFILLED' && !!r.voucherCode && (
                <View style={s.codeBox}>
                  <Text style={s.codeBoxLabel}>{t('voucher.voucherCodeLabel')}</Text>
                  <Text style={s.codeBoxValue} selectable>{r.voucherCode}</Text>
                </View>
              )}
              {r.status === 'REJECTED' && !!r.adminNote && (
                <Text style={s.rejectionNote}>{t('voucher.rejectionNoteLabel')}: {r.adminNote}</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (rw: (n: number) => number, rh: (n: number) => number, rf: (n: number) => number, rStyles: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: rStyles.space.lg, paddingBottom: rh(40) },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: rStyles.space.lg, paddingVertical: rStyles.space.md, backgroundColor: Colors.navy,
  },
  headerTitle: { fontSize: rStyles.text.lg, fontWeight: '800', color: Colors.textWhite },
  closeBtn: { padding: rw(4) },
  closeBtnText: { color: Colors.textWhite, fontSize: rStyles.text.lg, fontWeight: '700' },
  heroCard: {
    backgroundColor: Colors.navyLight, borderRadius: rStyles.radius.lg, borderWidth: 1, borderColor: Colors.infoBorder,
    padding: rStyles.space.xl, marginBottom: rStyles.space.xl, alignItems: 'center',
  },
  heroIconWrap: {
    width: rw(56), height: rh(56), borderRadius: rw(28), backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: rh(10), ...Shadow.card,
  },
  heroIcon: { fontSize: rf(28) },
  heroPoints: { fontSize: rStyles.text.h2, fontWeight: '800', color: Colors.textPrimary, marginBottom: rh(6) },
  heroExplainer: { fontSize: rStyles.text.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: rf(19), marginBottom: rh(16) },
  readyPill: { backgroundColor: Colors.safeBg, borderWidth: 1, borderColor: Colors.safeBorder, borderRadius: rStyles.radius.pill, paddingHorizontal: rw(14), paddingVertical: rh(8) },
  readyPillText: { color: Colors.safe, fontWeight: '700', fontSize: rStyles.text.sm },
  progressLabel: { fontSize: rStyles.text.xs, color: Colors.textMuted, fontWeight: '600', marginTop: rh(8), alignSelf: 'flex-start' },
  sectionTitle: { fontSize: rStyles.text.md, fontWeight: '800', color: Colors.textPrimary, marginBottom: rStyles.space.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rw(8), marginBottom: rStyles.space.lg },
  chip: { paddingVertical: rh(8), paddingHorizontal: rw(14), borderRadius: rStyles.radius.pill, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  chipText: { fontSize: rStyles.text.sm, color: Colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: Colors.textWhite },
  requestBtn: { backgroundColor: Colors.navy, borderRadius: rStyles.radius.pill, paddingVertical: rh(15), alignItems: 'center' },
  requestBtnDisabled: { backgroundColor: Colors.borderStrong },
  requestBtnText: { color: Colors.textWhite, fontWeight: '800', fontSize: rStyles.text.md },
  requestCard: {
    backgroundColor: Colors.surface, borderRadius: rStyles.radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: rStyles.space.lg, marginBottom: rStyles.space.md,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: rh(8) },
  brand: { fontSize: rStyles.text.base, fontWeight: '800', color: Colors.textPrimary },
  statusPill: { flexDirection: 'row', borderWidth: 1, borderRadius: rStyles.radius.pill, paddingHorizontal: rw(10), paddingVertical: rh(4) },
  statusPillText: { fontSize: rStyles.text.xs, fontWeight: '700' },
  pointsSpent: { fontSize: rStyles.text.xs, color: Colors.textSecondary },
  codeBox: {
    marginTop: rh(10), borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.safeBorder, backgroundColor: Colors.safeBg,
    borderRadius: rStyles.radius.md, padding: rStyles.space.md,
  },
  codeBoxLabel: { fontSize: rStyles.text.xs, color: Colors.textMuted, fontWeight: '700', marginBottom: rh(4) },
  codeBoxValue: { fontSize: rStyles.text.base, color: Colors.safe, fontWeight: '800', fontFamily: 'monospace' },
  rejectionNote: { fontSize: rStyles.text.xs, color: Colors.danger, marginTop: rh(8) },
});
