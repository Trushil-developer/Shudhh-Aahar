// src/screens/SubscriptionScreen.tsx
// Membership: Member (£5/month or £50/year — same perks either way)
// Single clean flow: what you get → one pricing card with one CTA → trust → footer.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, Alert,
  Animated, Linking, Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';
import {
  PLANS, BillingPeriod, purchaseSubscription, restorePurchases,
  getSubscriptionState, openManageSubscription, SubscriptionState,
} from '../services/subscriptionService';
import logger from '../utils/logger';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../context/AppConfigContext';

interface Props {
  onClose: () => void;
  highlightFeature?: string;
}

// Colors.safe (#00843D) is tuned for light backgrounds elsewhere in the app —
// against the navy card here it has too little contrast to read as "green"
// at small sizes (icons, ticks, pill text), so this card uses a brighter,
// lighter emerald that actually pops against navy.
const MEMBER_GREEN = '#34D399';

// Plain-language explanation of what each of the 4 gated perks actually
// means — shown up top so someone unfamiliar with the app understands the
// value before they even look at pricing.
const MEMBER_PERKS = [
  { icon: '🎯', titleKey: 'subscription.perks.personalScore.title', bodyKey: 'subscription.perks.personalScore.body' },
  { icon: '💰', titleKey: 'subscription.perks.lowestPrice.title',   bodyKey: 'subscription.perks.lowestPrice.body' },
  { icon: '♾️', titleKey: 'subscription.perks.unlimitedScans.title', bodyKey: 'subscription.perks.unlimitedScans.body' },
  { icon: '❤️', titleKey: 'subscription.perks.wishlist.title',      bodyKey: 'subscription.perks.wishlist.body' },
];

export default function SubscriptionScreen({ onClose, highlightFeature }: Props) {
  const { t } = useTranslation();
  const { refreshProfile, isMember } = useAuth();
  const { config: appConfig } = useAppConfig();
  // Global admin kill switch (see AppConfig's comment in
  // terraform/dynamodb.tf) — when off, AuthContext already reports every
  // signed-in user as isMember, so this screen would otherwise render the
  // "Active Member" management branch below for people who never actually
  // purchased anything (a fake "Manage Subscription" button pointing at an
  // empty store subscriptions list). Checked separately here, ahead of
  // isMember, so it always wins and shows the real explanation instead.
  const paymentsEnabled = appConfig.paymentsEnabled !== false;
  const { rw, rh, rf, rr, isTablet } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  const [loading,   setLoading]   = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [subState,  setSubState]  = useState<SubscriptionState | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  const headerFade = useRef(new Animated.Value(0)).current;
  const cardSlide  = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    getSubscriptionState().then(setSubState);
    logger.info('ui', 'SubscriptionScreen opened', { highlightFeature });
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(cardSlide,  { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
  }, []);

  // isMember comes from AuthContext, not subState.planId directly — the
  // context's resolveMembership() reconciles against server truth with a
  // bounded local-cache fallback (see the comment there); subState here is
  // the raw, unbounded AsyncStorage cache, which stays stale indefinitely
  // after a server-side change (e.g. an admin revocation) until something
  // else happens to overwrite it. Using it directly for this screen's
  // core purchase-vs-manage branch was exactly why a revoked member kept
  // seeing "Manage your membership" instead of the purchase flow. subState
  // is still used below for display-only details (renewal date, billing
  // period, cancellation status) once isMember confirms they're a member.
  const cancelPending = !!subState?.cancelAtPeriodEnd;
  const pricing = PLANS.member.pricing![billingPeriod];
  const periodLabel = billingPeriod === 'monthly' ? t('subscription.month') : t('subscription.year');
  const storeName = Platform.OS === 'ios' ? t('subscription.appStoreName') : t('subscription.googlePlayName');

  // For an active member, always reflect their real plan — not the toggle
  // above, which is only meaningful pre-purchase.
  const activeBillingPeriod: BillingPeriod = subState?.billingPeriod === 'yearly' ? 'yearly' : 'monthly';
  const activePricing = PLANS.member.pricing![activeBillingPeriod];
  const renewalDate = subState?.currentPeriodEnd
    ? new Date(subState.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const handlePurchase = async () => {
    setLoading(true);
    const result = await purchaseSubscription(billingPeriod);
    setLoading(false);

    if (result.success) {
      await refreshProfile(); // updates isMember app-wide immediately, not just this screen
      getSubscriptionState().then(setSubState);
      Alert.alert(
        t('subscription.welcomeTitle'),
        t('subscription.welcomeMessage'),
        [{ text: t('subscription.startScanning'), onPress: onClose }],
      );
    } else if (result.error && result.error !== 'Purchase cancelled') {
      Alert.alert(t('subscription.purchaseFailedTitle'), result.error);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const r = await restorePurchases();
    setRestoring(false);
    if (r.success) {
      await refreshProfile();
      getSubscriptionState().then(setSubState);
      Alert.alert(t('subscription.restoredTitle'), t('subscription.restoredMessage'), [{ text: t('subscription.continueButton'), onPress: onClose }]);
    } else {
      Alert.alert(t('subscription.noPurchasesTitle'), t('subscription.noPurchasesMessage'));
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" />

      <View style={s.topBar}>
        <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={8}>
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingBottom: rh(48) }, isTablet && s.scrollCenterWrap]}
      >
        <View style={isTablet ? s.tabletContent : s.fullWidthContent}>

        {/* Headline — plain, professional; no logo treatment */}
        <Animated.View style={[s.headlineSection, { opacity: headerFade }]}>
          <Text style={s.eyebrow}>{!paymentsEnabled ? t('subscription.freeForEveryoneEyebrow') : isMember ? t('subscription.eyebrowMember') : t('subscription.eyebrowDefault')}</Text>
          <Text style={s.headline}>
            {!paymentsEnabled
              ? t('subscription.freeForEveryoneHeadline')
              : isMember
              ? t('subscription.headlineManage')
              : highlightFeature ? t('subscription.unlockFeature', { feature: highlightFeature }) : t('subscription.headlineDefault')}
          </Text>
        </Animated.View>

        {/* ── Payments switched off admin-wide — everyone gets full access,
            no purchase flow shown at all ── */}
        {!paymentsEnabled && (
          <Animated.View style={[s.pricingWrap, { opacity: headerFade, transform: [{ translateY: cardSlide }] }]}>
            <View style={s.pricingCard}>
              <View style={s.memberStatusRow}>
                <View style={s.memberStatusIconWrap}>
                  <Text style={s.memberStatusIcon}>✓</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.memberStatusTitle}>{t('subscription.freeForEveryoneHeadline')}</Text>
                </View>
              </View>
              <Text style={[s.priceCaption, { marginTop: 0 }]}>{t('subscription.freeForEveryoneBody')}</Text>
              <View style={s.divider} />
              <View style={s.featureList}>
                {PLANS.member.features.map((f) => (
                  <View key={f.label} style={s.featureRow}>
                    <Text style={s.featureTick}>✓</Text>
                    <Text style={s.featureLabel}>{f.label}</Text>
                  </View>
                ))}
              </View>
              <View style={s.divider} />
              <TouchableOpacity style={s.ctaBtn} onPress={onClose} activeOpacity={0.88}>
                <Text style={s.ctaBtnText}>{t('subscription.freeForEveryoneClose')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* ── What you get — plain-language, before pricing ── */}
        {paymentsEnabled && !isMember && (
          <View style={s.perksSection}>
            <View style={s.perksGrid}>
              {MEMBER_PERKS.map((perk) => (
                <View key={perk.titleKey} style={s.perkCard}>
                  <View style={s.perkIconWrap}>
                    <Text style={s.perkIcon}>{perk.icon}</Text>
                  </View>
                  <Text style={s.perkTitle}>{t(perk.titleKey)}</Text>
                  <Text style={s.perkBody}>{t(perk.bodyKey)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {paymentsEnabled && (
        <Animated.View style={[s.pricingWrap, { opacity: headerFade, transform: [{ translateY: cardSlide }] }]}>
          <View style={s.pricingCard}>

            {!isMember ? (
              <>
                {/* Toggle */}
                <View style={s.periodToggle}>
                  <TouchableOpacity
                    style={[s.periodOption, billingPeriod === 'monthly' && s.periodOptionActive]}
                    onPress={() => setBillingPeriod('monthly')}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.periodOptionText, billingPeriod === 'monthly' && s.periodOptionTextActive]}>{t('subscription.monthly')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.periodOption, billingPeriod === 'yearly' && s.periodOptionActive]}
                    onPress={() => setBillingPeriod('yearly')}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.periodOptionText, billingPeriod === 'yearly' && s.periodOptionTextActive]}>{t('subscription.yearly')}</Text>
                    <View style={s.periodBadge}><Text style={s.periodBadgeText}>{t('subscription.twoMonthsFree')}</Text></View>
                  </TouchableOpacity>
                </View>

                {/* Price */}
                <Text style={s.noCommitmentLabel}>{t('subscription.noCommitment')}</Text>
                <View style={s.priceRow}>
                  <Text style={s.priceValue}>{pricing.priceDisplay}</Text>
                  <Text style={s.pricePer}>/{periodLabel}</Text>
                </View>
                <Text style={s.priceCaption}>{t('subscription.priceCaption')}</Text>

                {/* Single CTA */}
                <TouchableOpacity
                  style={[s.ctaBtn, loading && { opacity: 0.65 }]}
                  onPress={handlePurchase}
                  disabled={loading}
                  activeOpacity={0.88}
                >
                  {loading ? (
                    <ActivityIndicator color={Colors.navy} />
                  ) : (
                    <Text style={s.ctaBtnText}>{t('subscription.becomeMember')}</Text>
                  )}
                </TouchableOpacity>

                {/* What's included */}
                <View style={s.divider} />
                <View style={s.featureList}>
                  {PLANS.member.features.map((f) => (
                    <View key={f.label} style={s.featureRow}>
                      <Text style={s.featureTick}>✓</Text>
                      <Text style={s.featureLabel}>{f.label}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              /* ── Active Member management ── */
              <>
                {/* Status header */}
                <View style={s.memberStatusRow}>
                  <View style={s.memberStatusIconWrap}>
                    <Text style={s.memberStatusIcon}>★</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberStatusTitle}>{t('subscription.youAreMember')}</Text>
                    <Text style={s.memberStatusSub}>
                      {activeBillingPeriod === 'yearly' ? t('subscription.yearlyPlan') : t('subscription.monthlyPlan')} · {activePricing.priceDisplay}/{activeBillingPeriod === 'yearly' ? t('subscription.year') : t('subscription.month')}
                    </Text>
                  </View>
                  <View style={[s.statusPill, cancelPending && s.statusPillCancelled]}>
                    <Text style={[s.statusPillText, cancelPending && s.statusPillTextCancelled]}>
                      {cancelPending ? t('subscription.cancelled') : t('subscription.active')}
                    </Text>
                  </View>
                </View>

                {/* Renewal / expiry info */}
                {renewalDate && (
                  <View style={s.renewalRow}>
                    <Text style={s.renewalLabel}>{cancelPending ? t('subscription.accessUntil') : t('subscription.renews')}</Text>
                    <Text style={s.renewalDate}>{renewalDate}</Text>
                  </View>
                )}

                {cancelPending && (
                  <View style={s.cancelledNote}>
                    <Text style={s.cancelledNoteText}>
                      {t('subscription.cancelledNote')}
                    </Text>
                  </View>
                )}

                <View style={s.divider} />

                {/* What's included */}
                <Text style={s.includedLabel}>{t('subscription.whatsIncluded')}</Text>
                <View style={s.featureList}>
                  {PLANS.member.features.map((f) => (
                    <View key={f.label} style={s.featureRow}>
                      <Text style={s.featureTick}>✓</Text>
                      <Text style={s.featureLabel}>{f.label}</Text>
                    </View>
                  ))}
                </View>

                <View style={s.divider} />

                {/* Manage action */}
                <TouchableOpacity style={s.ctaBtn} onPress={() => openManageSubscription()} activeOpacity={0.88}>
                  <Text style={s.ctaBtnText}>{t('subscription.manageSubscription')}</Text>
                </TouchableOpacity>
                <Text style={s.manageHint}>
                  {t('subscription.manageHint', { storeName })}
                </Text>
              </>
            )}
          </View>
        </Animated.View>
        )}

        <View style={s.cta}>
          {paymentsEnabled && !isMember && (
            <>
              {/* One clean trust line instead of scattered badges */}
              <Text style={s.trustLine}>
                {t('subscription.trustLine', { storeName })}
              </Text>
              <Text style={s.legal}>
                {t('subscription.legalAutoRenew', { price: pricing.priceDisplay, period: periodLabel })}
              </Text>
              <Text style={s.legal}>
                {t('subscription.legalDisclaimer')}
              </Text>
            </>
          )}

          {/* Restore + links — restoring a purchase is meaningless while
              payments are switched off admin-wide, so that action is hidden
              too; privacy/terms stay visible regardless. */}
          <View style={s.footerLinks}>
            {paymentsEnabled && (
              <>
                <TouchableOpacity onPress={handleRestore} disabled={restoring}>
                  <Text style={s.footerLink}>{restoring ? t('subscription.restoring') : t('subscription.restorePurchases')}</Text>
                </TouchableOpacity>
                <Text style={s.footerDot}>·</Text>
              </>
            )}
            <TouchableOpacity onPress={() => Linking.openURL('https://www.shuddhaahar.shop/privacy')}>
              <Text style={s.footerLink}>{t('subscription.privacy')}</Text>
            </TouchableOpacity>
            <Text style={s.footerDot}>·</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://www.shuddhaahar.shop/terms')}>
              <Text style={s.footerLink}>{t('subscription.terms')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(
  rw: (n: number) => number,
  rh: (n: number) => number,
  rf: (n: number) => number,
  rr: (n: number) => number,
) {
  return StyleSheet.create({
  root:           { flex: 1, backgroundColor: Colors.bg },

  // Normal flow, not position:absolute — an absolutely positioned child of
  // SafeAreaView is placed relative to its outer edge, ignoring the safe-area
  // padding it applies to normal-flow content, which put this in the notch/
  // status-bar area. A plain row above the ScrollView sits below the inset
  // correctly, same as any other content.
  topBar:         { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: rw(16), paddingTop: rh(8) },
  closeBtn:       { width: rw(32), height: rw(32), borderRadius: rw(16), backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  closeBtnText:   { color: Colors.textMuted, fontSize: rf(14), fontWeight: '700' },

  // Plain, professional headline — no logo/icon treatment
  headlineSection: { paddingHorizontal: rw(20), paddingTop: rh(8), paddingBottom: rh(4) },
  eyebrow:         { fontSize: rf(11), fontWeight: '800', color: Colors.navyMid, letterSpacing: 1.5, marginBottom: rh(8) },
  headline:        { fontSize: rf(26), fontWeight: '800', color: Colors.textPrimary, lineHeight: rf(32), letterSpacing: -0.5 },

  // "What you get" perks grid — 2 columns, wraps to 1 on narrow screens
  perksSection:  { paddingHorizontal: rw(16), paddingTop: rh(18) },
  perksGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: rw(10) },
  perkCard:      { flexBasis: '47%', flexGrow: 1, backgroundColor: Colors.surfaceAlt, borderRadius: rr(14), borderWidth: 1, borderColor: Colors.border, padding: rw(14) },
  perkIconWrap:  { width: rw(34), height: rw(34), borderRadius: rw(17), backgroundColor: Colors.navyLight, alignItems: 'center', justifyContent: 'center', marginBottom: rh(8) },
  perkIcon:      { fontSize: rf(16) },
  perkTitle:     { fontSize: rf(13), fontWeight: '800', color: Colors.textPrimary, marginBottom: rh(3) },
  perkBody:      { fontSize: rf(11), color: Colors.textSecondary, lineHeight: rf(15) },

  // Single pricing card
  pricingWrap:   { paddingHorizontal: rw(16), paddingTop: rh(16) },
  pricingCard:   { backgroundColor: Colors.navy, borderRadius: rr(20), padding: rw(20), ...Shadow.cardMd },

  periodToggle:      { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: rr(12), padding: rw(4), gap: rw(4) },
  periodOption:      { flex: 1, borderRadius: rr(9), paddingVertical: rh(9), alignItems: 'center', justifyContent: 'center' },
  periodOptionActive:{ backgroundColor: 'rgba(255,255,255,0.16)' },
  periodOptionText:  { fontSize: rf(13), fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  periodOptionTextActive: { color: '#FFF' },
  periodBadge:       { backgroundColor: Colors.safe, borderRadius: rr(20), paddingHorizontal: rw(7), paddingVertical: rh(2), marginTop: rh(3) },
  periodBadgeText:   { fontSize: rf(9), fontWeight: '800', color: '#FFF' },

  noCommitmentLabel: { fontSize: rf(11), fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, textAlign: 'center', marginTop: rh(16) },
  priceRow:      { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginTop: rh(4) },
  priceValue:    { fontSize: rf(42), fontWeight: '900', color: '#FFF', lineHeight: rf(46) },
  pricePer:      { fontSize: rf(15), color: 'rgba(255,255,255,0.6)', marginLeft: rw(4), marginBottom: rh(6) },
  priceCaption:  { fontSize: rf(12), color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginTop: rh(4), marginBottom: rh(18) },

  ctaBtn:        { backgroundColor: '#FFF', borderRadius: rr(14), paddingVertical: rh(15), alignItems: 'center', justifyContent: 'center' },
  ctaBtnText:    { color: Colors.navy, fontSize: rf(15), fontWeight: '800' },

  divider:       { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: rh(18) },
  featureList:   { gap: rh(9) },
  featureRow:    { flexDirection: 'row', alignItems: 'center', gap: rw(9) },
  featureTick:   { fontSize: rf(13), fontWeight: '800', color: MEMBER_GREEN, width: rw(16) },
  featureLabel:  { fontSize: rf(13), color: 'rgba(255,255,255,0.9)', flex: 1 },

  // Active member state (inside the same navy card)
  memberStatusRow:      { flexDirection: 'row', alignItems: 'center', gap: rw(12), marginBottom: rh(16) },
  memberStatusIconWrap: { width: rw(44), height: rw(44), borderRadius: rw(22), backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  memberStatusIcon:     { fontSize: rf(20), color: MEMBER_GREEN },
  memberStatusTitle:    { fontSize: rf(16), fontWeight: '800', color: '#FFF', marginBottom: rh(2) },
  memberStatusSub:      { fontSize: rf(12), color: 'rgba(255,255,255,0.6)' },

  statusPill:           { backgroundColor: 'rgba(52,211,153,0.2)', borderRadius: rr(20), paddingHorizontal: rw(10), paddingVertical: rh(5), borderWidth: 1, borderColor: MEMBER_GREEN },
  statusPillText:       { fontSize: rf(10), fontWeight: '800', color: MEMBER_GREEN, letterSpacing: 0.5 },
  statusPillCancelled:  { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#F59E0B' },
  statusPillTextCancelled: { color: '#FCD34D' },

  renewalRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: rr(10), paddingHorizontal: rw(12), paddingVertical: rh(10), marginBottom: rh(12) },
  renewalLabel:  { fontSize: rf(10), fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  renewalDate:   { fontSize: rf(13), fontWeight: '700', color: '#FFF' },

  cancelledNote:   { backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: rr(10), borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)', padding: rw(10), marginBottom: rh(12) },
  cancelledNoteText:{ fontSize: rf(12), color: '#FCD34D', textAlign: 'center', lineHeight: rf(17) },

  includedLabel: { fontSize: rf(11), fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: rh(12) },
  manageHint:    { fontSize: rf(11), color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: rh(10), lineHeight: rf(16) },

  cta:           { paddingHorizontal: rw(16), paddingTop: rh(18), gap: rh(10) },
  trustLine:     { fontSize: rf(12), color: Colors.textSecondary, textAlign: 'center', lineHeight: rf(17) },
  legal:         { fontSize: rf(10), color: Colors.textMuted, lineHeight: rf(16), textAlign: 'center' },

  footerLinks:    { flexDirection: 'row', justifyContent: 'center', gap: rw(8), flexWrap: 'wrap', marginTop: rh(6) },
  footerLink:     { fontSize: rf(11), color: Colors.navyMid, fontWeight: '600' },
  footerDot:      { fontSize: rf(11), color: Colors.textMuted },

  // Tablet content width cap — keeps the pricing card/CTA centered and
  // readable instead of stretching edge-to-edge on wide screens.
  scrollCenterWrap: { alignItems: 'center' },
  tabletContent:    { width: '100%', maxWidth: TABLET_CONTENT_MAX_WIDTH },
  fullWidthContent: { width: '100%' },
  });
}
