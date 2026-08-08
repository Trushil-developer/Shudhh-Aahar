// src/components/ProductScoreCard.tsx
// General (non-personalised) product quality score — Positives/Negatives
// breakdown, in the style of well-known barcode scanners. Phase 1: this is
// the same score for every user; it does not use anyone's health profile.
//
// Deliberately compact: no paragraph-length "AI assessment" text to read —
// everything (score, positives, negatives) lives in this one scannable card,
// with the findings laid out as a two-column grid rather than a long list.

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ProductData } from '../services/foodApi';
import { calculateProductScore, ScoreItem, ScoreBand } from '../utils/productScore';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive } from '../utils/responsive';

interface Props { product: ProductData }

function blurbFor(band: ScoreBand, t: (key: string) => string): string {
  switch (band) {
    case 'excellent': return t('productScoreCard.blurbExcellent');
    case 'good':       return t('productScoreCard.blurbGood');
    case 'poor':       return t('productScoreCard.blurbPoor');
    case 'bad':        return t('productScoreCard.blurbBad');
  }
}

// Shared style builder — every component below calls useResponsive() and
// memoizes its own copy so styles stay live/reactive without prop-drilling.
function buildStyles(rw: (n: number) => number, rh: (n: number) => number, rf: (n: number) => number, rr: (n: number) => number, rStyles: ReturnType<typeof useResponsive>['rStyles']) {
  return StyleSheet.create({
    card: { backgroundColor: Colors.surface, marginHorizontal: rStyles.space.lg, marginVertical: rStyles.space.sm, borderRadius: rStyles.radius.lg, padding: rw(18), borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4, ...Shadow.card },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rStyles.space.lg },
    label: { fontSize: rStyles.text.xs, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5 },
    infoLink: { fontSize: rf(11), color: Colors.navyMid, fontWeight: '600' },

    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: rStyles.space.lg, marginBottom: rw(18) },
    scoreBadge: { width: rw(72), height: rh(72), borderRadius: rr(36), alignItems: 'center', justifyContent: 'center' },
    scoreBadgeNum: { fontSize: rf(26), fontWeight: '800', color: '#FFFFFF', lineHeight: rh(30) },
    scoreBadgeDen: { fontSize: rf(11), fontWeight: '700', color: 'rgba(255,255,255,0.8)', marginTop: rw(-2) },
    scoreLabel: { fontSize: rStyles.text.lg, fontWeight: '800' },
    scoreBlurb: { fontSize: rf(13), color: Colors.textSecondary, marginTop: rw(2) },

    columnsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: rw(14) },
    column: { flex: 1, gap: rw(10) },
    columnDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: rw(14) },
    columnTitle: { fontSize: rf(11), fontWeight: '800', letterSpacing: 1, marginBottom: rw(2) },
    columnEmpty: { fontSize: rStyles.text.sm, color: Colors.textMuted, fontStyle: 'italic' },

    compactItem: { flexDirection: 'row', alignItems: 'center', gap: rStyles.space.sm },
    compactIcon: { fontSize: rf(16), width: rw(20) },
    compactTitle: { fontSize: rStyles.text.sm, fontWeight: '600', color: Colors.textPrimary },
    compactValue: { fontSize: rStyles.text.sm, fontWeight: '700', marginTop: rw(1) },

    modalContainer: { flex: 1, backgroundColor: Colors.bg },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rStyles.space.xl, paddingVertical: rStyles.space.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
    modalTitle: { fontSize: rf(16), fontWeight: '700', color: Colors.textPrimary },
    modalClose: { fontSize: rf(18), color: Colors.textMuted },
    modalBody: { padding: rStyles.space.xl, paddingBottom: rw(48) },
    modalEyebrow: { fontSize: rf(11), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: rw(6) },
    modalHeading: { fontSize: rStyles.text.xl, fontWeight: '800', color: Colors.textPrimary, marginBottom: rStyles.space.lg },
    modalSubheading: { fontSize: rStyles.text.md, fontWeight: '700', color: Colors.textPrimary, marginTop: rStyles.space.lg, marginBottom: rw(6) },
    modalParagraph: { fontSize: rf(13), color: Colors.textSecondary, lineHeight: rh(20) },
    modalNote: { fontSize: rStyles.text.sm, color: Colors.textMuted, lineHeight: rh(18), marginTop: rStyles.space.xxl, fontStyle: 'italic' },
  });
}

export default function ProductScoreCard({ product }: Props) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr, rStyles } = useResponsive();
  const styles = useMemo(() => buildStyles(rw, rh, rf, rr, rStyles), [rw, rh, rf, rr, rStyles]);
  const [showInfo, setShowInfo] = useState(false);
  const result = calculateProductScore(product);

  return (
    <View style={[styles.card, { borderLeftColor: result.color }]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{t('productScoreCard.productScoreLabel')}</Text>
        <TouchableOpacity onPress={() => setShowInfo(true)} hitSlop={8}>
          <Text style={styles.infoLink}>ⓘ {t('productScoreCard.howCalculated')}</Text>
        </TouchableOpacity>
      </View>

      {/* Big score badge */}
      <View style={styles.scoreRow}>
        <View style={[styles.scoreBadge, { backgroundColor: result.color }]}>
          <Text style={styles.scoreBadgeNum}>{result.score}</Text>
          <Text style={styles.scoreBadgeDen}>/100</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.scoreLabel, { color: result.color }]}>{result.label}</Text>
          <Text style={styles.scoreBlurb}>{blurbFor(result.band, t)}</Text>
        </View>
      </View>

      {/* Positives / Negatives — side by side, not a long stacked list */}
      {(result.positives.length > 0 || result.negatives.length > 0) && (
        <View style={styles.columnsRow}>
          <View style={styles.column}>
            <Text style={[styles.columnTitle, { color: Colors.safe }]}>{t('productScoreCard.good')}</Text>
            {result.positives.length > 0 ? (
              result.positives.map(item => <CompactItem key={item.key} item={item} />)
            ) : (
              <Text style={styles.columnEmpty}>{t('productScoreCard.nothingStandsOut')}</Text>
            )}
          </View>
          <View style={styles.columnDivider} />
          <View style={styles.column}>
            <Text style={[styles.columnTitle, { color: Colors.danger }]}>{t('productScoreCard.watchOut')}</Text>
            {result.negatives.length > 0 ? (
              result.negatives.map(item => <CompactItem key={item.key} item={item} />)
            ) : (
              <Text style={styles.columnEmpty}>{t('productScoreCard.noConcernsFound')}</Text>
            )}
          </View>
        </View>
      )}

      <Modal visible={showInfo} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowInfo(false)}>
        <SafeAreaProvider>
          <ScoringInfoModal onClose={() => setShowInfo(false)} />
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

function statusColor(status: ScoreItem['status']): string {
  if (status === 'good') return Colors.safe;
  if (status === 'bad') return Colors.danger;
  return Colors.caution;
}

// One line per finding: icon, name, value — no description sentence to read.
// Colour on the value alone communicates good/neutral/bad.
function CompactItem({ item }: { item: ScoreItem }) {
  const { rw, rh, rf, rr, rStyles } = useResponsive();
  const styles = useMemo(() => buildStyles(rw, rh, rf, rr, rStyles), [rw, rh, rf, rr, rStyles]);
  const color = statusColor(item.status);
  return (
    <View style={styles.compactItem}>
      <Text style={styles.compactIcon}>{item.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.compactTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.compactValue, { color }]} numberOfLines={1}>{item.value}</Text>
      </View>
    </View>
  );
}

function ScoringInfoModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr, rStyles } = useResponsive();
  const styles = useMemo(() => buildStyles(rw, rh, rf, rr, rStyles), [rw, rh, rf, rr, rStyles]);
  return (
    <SafeAreaView style={styles.modalContainer}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{t('productScoreCard.modalTitle')}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Text style={styles.modalClose}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.modalBody}>
        <Text style={styles.modalEyebrow}>{t('productScoreCard.scoringMethodEyebrow')}</Text>
        <Text style={styles.modalHeading}>{t('productScoreCard.howRatedHeading')}</Text>
        <Text style={styles.modalParagraph}>{t('productScoreCard.scoringIntro')}</Text>

        <Text style={styles.modalSubheading}>{t('productScoreCard.nutritionalValueHeading')}</Text>
        <Text style={styles.modalParagraph}>
          {t('productScoreCard.nutritionalValueBody')}
        </Text>

        <Text style={styles.modalSubheading}>{t('productScoreCard.additivesHeading')}</Text>
        <Text style={styles.modalParagraph}>
          {t('productScoreCard.additivesBody')}
        </Text>

        <Text style={styles.modalSubheading}>{t('productScoreCard.organicStatusHeading')}</Text>
        <Text style={styles.modalParagraph}>
          {t('productScoreCard.organicStatusBody')}
        </Text>

        <Text style={styles.modalSubheading}>{t('productScoreCard.differsFromPersonalHeading')}</Text>
        <Text style={styles.modalParagraph}>
          {t('productScoreCard.differsFromPersonalBody')}
        </Text>

        <Text style={styles.modalNote}>
          {t('productScoreCard.modalNote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
