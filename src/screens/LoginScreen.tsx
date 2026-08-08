import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';
import { translateError } from '../utils/AppError';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const { rw, rh, rf, rr, isTablet } = useResponsive();

  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);

  const pills = useMemo(() => PILLS.map(p => ({ ...p, label: t(p.labelKey) })), [t]);

  // Cap main content width on tablets so text/buttons don't stretch edge-to-edge.
  const tabletCap = isTablet
    ? { width: '100%' as const, maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center' as const }
    : undefined;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signIn();
    } catch (err: any) {
      console.error('Google sign-in failed:', err);
      const translated = translateError(err, t);
      setError(__DEV__ && err?.message ? `${translated} (${err.message})` : translated);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.navyMid} />

      {/* ── Dark hero — health + supermarket in one glance ────── */}
      <View style={s.hero}>
        {/* Watermark — a big, faint cart behind the copy for depth and to
            plant the "supermarket" half of the brand alongside the health cross */}
        <Text style={s.watermark}>🛒</Text>

        <View style={tabletCap}>
          {/* Logo mark */}
          <View style={s.logoWrap}>
            <Image source={require('../assets/app-icon.png')} style={s.logoMark} />
            <Text style={s.logoName}>{t('app.brandName')}</Text>
          </View>

          {/* Headline */}
          <Text style={s.headline}>{t('login.headline')}</Text>
          <Text style={s.tagline}>{t('login.tagline')}</Text>

          {/* Feature pills — each in its own bold accent colour so they pop
              against the dark hero instead of blending into it */}
          <View style={s.pillsRow}>
            {pills.map(p => (
              <View key={p.labelKey} style={[s.pill, { backgroundColor: p.color }]}>
                <Text style={s.pillIcon}>{p.icon}</Text>
                <Text style={s.pillText}>{p.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ── White card bottom ──────────────────── */}
      <View style={[s.card, { paddingBottom: rh(28) + insets.bottom }]}>
        <View style={tabletCap}>

          {/* Error */}
          {!!error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* Google sign in */}
          <TouchableOpacity
            style={[s.googleBtn, loading && { opacity: 0.7 }]}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <View style={s.gIconBox}>
                  <Text style={s.gLetter}>G</Text>
                </View>
                <Text style={s.googleBtnText}>{t('login.continueWithGoogle')}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* One consolidated trust line — was two overlapping rows before */}
          <View style={s.badgesRow}>
            <Text style={s.badge}>{t('login.badgePrivateSecure')}</Text>
            <View style={s.badgeDot} />
            <Text style={s.badge}>{t('login.badgeProducts')}</Text>
            <View style={s.badgeDot} />
            <Text style={[s.badge, s.badgeAccent]}>{t('login.badgeFreeToStart')}</Text>
          </View>

          <Text style={s.terms}>
            {t('login.termsAgreement')}{' '}
            <Text style={s.termsLink}>{t('login.termsOfService')}</Text>
            {' '}{t('login.and')}{' '}
            <Text style={s.termsLink}>{t('login.privacyPolicy')}</Text>.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const PILLS = [
  { icon: '⚠️', labelKey: 'login.pillHealthWarnings', color: Colors.caution },
  { icon: '💷', labelKey: 'login.pillPriceComparison', color: Colors.safe },
  { icon: '✨', labelKey: 'login.pillBetterAlternatives', color: Colors.accent },
];

function createStyles(rw: (n: number) => number, rh: (n: number) => number, rf: (n: number) => number, rr: (n: number) => number) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.navyMid },

  // Hero
  hero: {
    flex: 1,
    backgroundColor: Colors.navyMid,
    paddingHorizontal: rw(28),
    paddingTop: rh(32),
    paddingBottom: rh(40),
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    top: rh(4),
    right: -rw(18),
    fontSize: rf(150),
    opacity: 0.06,
    transform: [{ rotate: '-12deg' }],
  },

  logoWrap:       { flexDirection: 'row', alignItems: 'center', gap: rw(12), marginBottom: rh(40) },
  logoMark:       { width: rw(54), height: rw(54), borderRadius: rr(15), borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
  logoName:       { color: '#FFF', fontSize: rf(26), fontWeight: '800', letterSpacing: -0.3 },

  headline: {
    fontSize: rf(36),
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: rf(44),
    letterSpacing: -0.8,
    marginBottom: rh(14),
  },
  tagline: {
    fontSize: rf(14),
    color: 'rgba(255,255,255,0.55)',
    lineHeight: rf(22),
    marginBottom: rh(28),
  },

  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rw(8) },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rw(6),
    borderRadius: rr(20),
    paddingHorizontal: rw(14),
    paddingVertical: rh(8),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  pillIcon: { fontSize: rf(13) },
  pillText: { color: '#FFFFFF', fontSize: rf(12), fontWeight: '700' },

  // Bottom card
  card: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: rr(32),
    borderTopRightRadius: rr(32),
    paddingHorizontal: rw(28),
    paddingTop: rh(28),
  },

  errorBox:  { backgroundColor: Colors.dangerBg, borderRadius: rr(12), padding: rw(14), borderWidth: 1, borderColor: Colors.dangerBorder, marginBottom: rh(14) },
  errorText: { color: Colors.danger, fontSize: rf(13), textAlign: 'center' },

  // Google button
  googleBtn: {
    backgroundColor: Colors.navy,
    borderRadius: rr(16),
    paddingVertical: rh(18),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rw(12),
    marginBottom: rh(20),
    shadowColor: Colors.navy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  gIconBox:      { width: rw(28), height: rw(28), borderRadius: rr(7), backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  gLetter:       { fontSize: rf(15), fontWeight: '900', color: '#4285F4' },
  googleBtnText: { fontSize: rf(16), fontWeight: '700', color: '#FFF', letterSpacing: -0.2 },

  badgesRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: rw(8), marginBottom: rh(18) },
  badge:       { fontSize: rf(12), color: Colors.textSecondary, fontWeight: '600' },
  badgeAccent: { color: Colors.safe },
  badgeDot:    { width: rw(3), height: rw(3), borderRadius: rw(1.5), backgroundColor: Colors.border },

  terms:     { fontSize: rf(11), color: Colors.textMuted, textAlign: 'center', lineHeight: rf(18) },
  termsLink: { color: Colors.navy, fontWeight: '600' },
});
}
