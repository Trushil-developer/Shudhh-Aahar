// src/components/AIHealthTab.tsx
// Shown as the first tab on the product screen
// Calls the AI to analyse product vs user health profile

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ProductData } from '../services/foodApi';
import { analyseProductForUser, AIHealthAnalysis } from '../services/aiHealthService';
import { saveScanHistory } from '../services/userDataService';
import RecommendationsSection from './RecommendationsSection';
import { Colors } from '../theme/medical';
import { useResponsive } from '../utils/responsive';

interface Props {
  product: ProductData;
  cheapestStore?: string;
  cheapestPrice?: number;
}

export default function AIHealthTab({ product, cheapestStore, cheapestPrice }: Props) {
  const { t } = useTranslation();
  const { user, healthProfile, profileComplete } = useAuth();
  const [analysis, setAnalysis] = useState<AIHealthAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoreAnim] = useState(new Animated.Value(0));
  const { rw, rh, rf, rr, rStyles } = useResponsive();

  const styles = useMemo(() => StyleSheet.create({
    loadingWrapper: { alignItems: 'center', paddingVertical: rh(48) },
    unavailableWrapper: { alignItems: 'center', paddingVertical: rh(40), paddingHorizontal: rStyles.space.xl },
    unavailableIcon: { fontSize: rf(28), marginBottom: rh(10) },
    unavailableTitle: { color: Colors.textPrimary, fontSize: rStyles.text.md, fontWeight: '700', marginBottom: rh(6), textAlign: 'center' },
    unavailableSub: { color: Colors.textSecondary, fontSize: rf(13), textAlign: 'center', lineHeight: rf(19), marginBottom: rStyles.space.lg },
    unavailableRetryBtn: { backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, borderRadius: rr(10), paddingVertical: rh(11), paddingHorizontal: rStyles.space.xxl },
    unavailableRetryText: { fontSize: rf(13), fontWeight: '700', color: Colors.navy },
    loadingTitle: { color: Colors.textPrimary, fontSize: rStyles.text.lg, fontWeight: '700', marginTop: rStyles.space.lg, marginBottom: rh(6) },
    loadingSubtitle: { color: Colors.textSecondary, fontSize: rf(13), textAlign: 'center', lineHeight: rf(20) },
    profileBanner: {
      backgroundColor: Colors.navyLight, borderRadius: rr(14), padding: rw(14),
      flexDirection: 'row', alignItems: 'center', gap: rStyles.space.md, marginBottom: rh(14),
      borderWidth: 1, borderColor: Colors.infoBorder,
    },
    profileBannerIcon: { fontSize: rStyles.text.xxl },
    profileBannerText: { flex: 1 },
    profileBannerTitle: { color: Colors.navy, fontWeight: '700', fontSize: rStyles.text.base, marginBottom: rh(2) },
    profileBannerSub: { color: Colors.textSecondary, fontSize: rStyles.text.sm, lineHeight: rf(17) },
    profileBannerArrow: { color: Colors.navy, fontSize: rf(18) },
    verdictCard: {
      backgroundColor: Colors.surface, borderRadius: rStyles.radius.lg, padding: rStyles.space.lg,
      borderWidth: 1, borderColor: Colors.border, marginBottom: rStyles.space.md,
    },
    verdictTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: rh(14) },
    verdictBadge: { flexDirection: 'row', alignItems: 'center', gap: rStyles.space.sm, borderRadius: rStyles.radius.xl, paddingHorizontal: rw(14), paddingVertical: rStyles.space.sm },
    verdictEmoji: { fontSize: rStyles.text.xl },
    verdictLabel: { fontSize: rf(16), fontWeight: '800' },
    scoreWrapper: { alignItems: 'center' },
    scoreNumber: { lineHeight: rf(36) },
    scoreValue: { fontSize: rf(32), fontWeight: '800' },
    scoreMax: { fontSize: rf(16), color: Colors.textMuted },
    scoreLabel: { color: Colors.textMuted, fontSize: rf(11), textAlign: 'center' },
    scoreBar: { height: rh(6), backgroundColor: Colors.surfaceAlt, borderRadius: rr(3), marginBottom: rh(14) },
    scoreBarFill: { height: rh(6), borderRadius: rr(3) },
    summaryText: { color: Colors.textSecondary, fontSize: rStyles.text.base, lineHeight: rf(22) },
    card: {
      backgroundColor: Colors.surface, borderRadius: rStyles.radius.lg, padding: rStyles.space.lg,
      borderWidth: 1, borderColor: Colors.border, marginBottom: rStyles.space.md,
    },
    cardTitle: { color: Colors.textPrimary, fontWeight: '700', fontSize: rStyles.text.md, marginBottom: rStyles.space.md },
    warningRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: rw(10),
      paddingVertical: rh(10), borderLeftWidth: 3, paddingLeft: rw(10),
      marginBottom: rStyles.space.sm, borderRadius: rr(2),
    },
    warningIcon: { fontSize: rStyles.text.xl, width: rw(28), textAlign: 'center' },
    warningContent: { flex: 1 },
    severityPill: { alignSelf: 'flex-start', borderRadius: rr(4), paddingHorizontal: rw(6), paddingVertical: rh(2), marginBottom: rStyles.space.xs },
    severityText: { fontSize: rStyles.text.xs, fontWeight: '800', letterSpacing: 0.5 },
    warningText: { color: Colors.textSecondary, fontSize: rf(13), lineHeight: rf(19) },
    positiveRow: { flexDirection: 'row', gap: rw(10), alignItems: 'flex-start', paddingVertical: rh(6) },
    positiveDot: { color: Colors.safe, fontSize: rStyles.text.xs, marginTop: rStyles.space.xs },
    positiveText: { color: Colors.textSecondary, fontSize: rf(13), flex: 1, lineHeight: rf(19) },
    suggestionCard: {
      backgroundColor: Colors.accentBg, borderRadius: rStyles.radius.lg, padding: rStyles.space.lg,
      borderWidth: 1, borderColor: Colors.accentBorder, flexDirection: 'row',
      gap: rStyles.space.md, alignItems: 'flex-start', marginBottom: rStyles.space.md,
    },
    suggestionIcon: { fontSize: rStyles.text.xxl },
    suggestionContent: { flex: 1 },
    suggestionTitle: { color: Colors.navy, fontWeight: '700', fontSize: rStyles.text.base, marginBottom: rStyles.space.xs },
    suggestionText: { color: Colors.textSecondary, fontSize: rf(13), lineHeight: rf(20) },
    disclaimer: { color: Colors.textMuted, fontSize: rf(11), textAlign: 'center', marginBottom: rStyles.space.xl, lineHeight: rf(16) },
  }), [rw, rh, rf, rr, rStyles]);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    const result = await analyseProductForUser(product, healthProfile);
    setAnalysis(result);
    setLoading(false);

    // No mock/fallback data — a null result means AI analysis genuinely
    // failed, so there's nothing real to animate or save.
    if (!result) return;

    // Animate score bar
    Animated.timing(scoreAnim, {
      toValue: result.personalScore / 100,
      duration: 800,
      useNativeDriver: false,
    }).start();

    // Save to scan history if logged in
    if (user) {
      const warnings = result.warnings.map((w) => w.message);
      await saveScanHistory(
        user.id,
        product.barcode,
        product.name,
        product.brand,
        warnings,
        cheapestPrice,
        cheapestStore,
      );
    }
  }, [product, healthProfile, user, cheapestPrice, cheapestStore, scoreAnim]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  if (loading) {
    return (
      <View style={styles.loadingWrapper}>
        <ActivityIndicator size="large" color={Colors.navy} />
        <Text style={styles.loadingTitle}>{t('aiHealthTab.loadingTitle')}</Text>
        <Text style={styles.loadingSubtitle}>
          {t('aiHealthTab.loadingSubtitle')}
        </Text>
      </View>
    );
  }

  if (!analysis) {
    return (
      <View style={styles.unavailableWrapper}>
        <Text style={styles.unavailableIcon}>⚠️</Text>
        <Text style={styles.unavailableTitle}>{t('aiHealthTab.unavailableTitle')}</Text>
        <Text style={styles.unavailableSub}>{t('aiHealthTab.unavailableSubtitle')}</Text>
        <TouchableOpacity style={styles.unavailableRetryBtn} onPress={runAnalysis} activeOpacity={0.85}>
          <Text style={styles.unavailableRetryText}>{t('common.tryAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const scoreWidth = scoreAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const scoreColor =
    analysis.personalScore >= 70
      ? Colors.safe
      : analysis.personalScore >= 40
      ? Colors.caution
      : Colors.danger;

  return (
    <View>
      {/* No profile warning */}
      {!profileComplete && (
        <TouchableOpacity style={styles.profileBanner}>
          <Text style={styles.profileBannerIcon}>👤</Text>
          <View style={styles.profileBannerText}>
            <Text style={styles.profileBannerTitle}>{t('aiHealthTab.profileBannerTitle')}</Text>
            <Text style={styles.profileBannerSub}>{t('aiHealthTab.profileBannerSubtitle')}</Text>
          </View>
          <Text style={styles.profileBannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* Verdict Card */}
      <View style={[styles.verdictCard, { borderColor: analysis.verdictColor + '44' }]}>
        <View style={styles.verdictTop}>
          <View style={[styles.verdictBadge, { backgroundColor: analysis.verdictColor + '22' }]}>
            <Text style={[styles.verdictEmoji]}>
              {analysis.verdict === 'safe' ? '✅' : analysis.verdict === 'caution' ? '⚠️' : '🚫'}
            </Text>
            <Text style={[styles.verdictLabel, { color: analysis.verdictColor }]}>
              {analysis.verdictLabel}
            </Text>
          </View>
          {/* Personal Score */}
          <View style={styles.scoreWrapper}>
            <Text style={styles.scoreNumber}>
              <Text style={[styles.scoreValue, { color: scoreColor }]}>{analysis.personalScore}</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </Text>
            <Text style={styles.scoreLabel}>{t('aiHealthTab.forYou')}</Text>
          </View>
        </View>

        {/* Score bar */}
        <View style={styles.scoreBar}>
          <Animated.View
            style={[styles.scoreBarFill, { width: scoreWidth, backgroundColor: scoreColor }]}
          />
        </View>

        <Text style={styles.summaryText}>{analysis.summary}</Text>
      </View>

      {/* Warnings */}
      {analysis.warnings.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⚠️ {t('aiHealthTab.warningsForYou')}</Text>
          {analysis.warnings.map((w, i) => (
            <View
              key={i}
              style={[
                styles.warningRow,
                { borderLeftColor: w.severity === 'high' ? Colors.danger : w.severity === 'medium' ? Colors.caution : Colors.safe },
              ]}
            >
              <Text style={styles.warningIcon}>{w.icon}</Text>
              <View style={styles.warningContent}>
                <View style={[styles.severityPill, {
                  backgroundColor: w.severity === 'high' ? Colors.dangerBg : w.severity === 'medium' ? Colors.cautionBg : Colors.safeBg
                }]}>
                  <Text style={[styles.severityText, {
                    color: w.severity === 'high' ? Colors.danger : w.severity === 'medium' ? Colors.caution : Colors.safe
                  }]}>
                    {w.severity.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.warningText}>{w.message}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Positives */}
      {analysis.positives.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>✅ {t('aiHealthTab.goodNews')}</Text>
          {analysis.positives.map((p, i) => (
            <View key={i} style={styles.positiveRow}>
              <Text style={styles.positiveDot}>●</Text>
              <Text style={styles.positiveText}>{p}</Text>
            </View>
          ))}
        </View>
      )}

      {/* AI Suggestion */}
      {analysis.suggestion ? (
        <View style={styles.suggestionCard}>
          <Text style={styles.suggestionIcon}>💡</Text>
          <View style={styles.suggestionContent}>
            <Text style={styles.suggestionTitle}>{t('aiHealthTab.suggestionTitle')}</Text>
            <Text style={styles.suggestionText}>{analysis.suggestion}</Text>
          </View>
        </View>
      ) : null}

      {/* AI disclaimer */}
      <Text style={styles.disclaimer}>
        {t('aiHealthTab.disclaimer')}
      </Text>

      {/* Similar & healthier product recommendations */}
      <RecommendationsSection
        product={product}
        profile={healthProfile}
        scannedScore={analysis.personalScore}
      />
    </View>
  );
}
