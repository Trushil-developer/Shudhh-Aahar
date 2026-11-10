// src/components/CouponUI.tsx
// Small shared visual primitives for the Coupon Exchange screens, kept here
// so the look stays consistent across CouponFeedScreen/MyCouponsScreen/
// VoucherScreen instead of each screen rolling its own status pill/progress
// bar — same idea as StatusConfig/UPFCard's RISK_CONFIG elsewhere in the app.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, CouponStatusConfig, RETAILER_ICONS, DEFAULT_RETAILER_ICON } from '../theme/medical';
import { useResponsive } from '../utils/responsive';

export function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  const { rw, rh, rStyles } = useResponsive();
  const cfg = CouponStatusConfig[status] || CouponStatusConfig.EXPIRED;
  const s = StyleSheet.create({
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: rw(4), alignSelf: 'flex-start',
      backgroundColor: cfg.bg, borderColor: cfg.border, borderWidth: 1,
      borderRadius: rStyles.radius.pill, paddingHorizontal: rw(10), paddingVertical: rh(4),
    },
    icon: { fontSize: rStyles.text.xs },
    text: { fontSize: rStyles.text.xs, fontWeight: '700', color: cfg.color },
  });
  return (
    <View style={s.pill}>
      <Text style={s.icon}>{cfg.icon}</Text>
      <Text style={s.text}>{t(cfg.labelKey)}</Text>
    </View>
  );
}

export function RetailerAvatar({ retailer, size = 36 }: { retailer: string; size?: number }) {
  const { rw, rh, rf, rr } = useResponsive();
  return (
    <View style={{
      width: rw(size), height: rh(size), borderRadius: rr(size / 2),
      backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: rf(size * 0.5) }}>{RETAILER_ICONS[retailer] || DEFAULT_RETAILER_ICON}</Text>
    </View>
  );
}

// Used for both the claim countdown (24h/expiry) and the voucher points
// progress — `progress` is 0-1, `tint` overrides the default brand colour
// (e.g. escalating to amber/red as a countdown runs low).
export function ProgressBar({ progress, tint }: { progress: number; tint?: string }) {
  const { rh, rStyles } = useResponsive();
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ height: rh(8), borderRadius: rStyles.radius.pill, backgroundColor: Colors.borderStrong, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: tint || Colors.navy, borderRadius: rStyles.radius.pill }} />
    </View>
  );
}

// Centered icon + heading + subtext + optional CTA, for empty lists across
// the coupon screens — one consistent "nothing here yet" look.
export function EmptyState({ icon, title, subtitle, ctaLabel, onCta }: {
  icon: string; title: string; subtitle?: string; ctaLabel?: string; onCta?: () => void;
}) {
  const { rw, rh, rf, rStyles } = useResponsive();
  const s = StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center', padding: rStyles.space.xxxl, paddingTop: rh(60) },
    iconWrap: {
      width: rw(72), height: rh(72), borderRadius: rw(36), backgroundColor: Colors.surfaceAlt,
      alignItems: 'center', justifyContent: 'center', marginBottom: rh(16),
    },
    icon: { fontSize: rf(32) },
    title: { fontSize: rStyles.text.lg, fontWeight: '800', color: Colors.textPrimary, marginBottom: rh(6), textAlign: 'center' },
    subtitle: { fontSize: rStyles.text.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: rf(19), marginBottom: rh(18) },
    cta: { backgroundColor: Colors.navy, borderRadius: rStyles.radius.pill, paddingHorizontal: rw(20), paddingVertical: rh(12) },
    ctaText: { color: Colors.textWhite, fontWeight: '700', fontSize: rStyles.text.sm },
  });
  return (
    <View style={s.container}>
      <View style={s.iconWrap}><Text style={s.icon}>{icon}</Text></View>
      <Text style={s.title}>{title}</Text>
      {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      {!!ctaLabel && !!onCta && (
        <TouchableOpacity style={s.cta} onPress={onCta} activeOpacity={0.85}>
          <Text style={s.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
