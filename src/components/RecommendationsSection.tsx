// src/components/RecommendationsSection.tsx
// Shows after AI analysis — finds and ranks similar healthier products

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Image, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../../App';
import { ProductData } from '../services/foodApi';
import { HealthProfile } from '../services/userDataService';
import { findSimilarProducts, RecommendedProduct } from '../services/recommendationService';
import { Colors, NutriscoreColors } from '../theme/medical';
import { useResponsive } from '../utils/responsive';

interface Props {
  product: ProductData;
  profile: HealthProfile;
  scannedScore: number; // AI score of the scanned product
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function RecommendationsSection({ product, profile, scannedScore }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { getColumns, getCardWidth } = useResponsive();
  // Each card packs a 72pt image + info column, so give it more room than a
  // typical square product tile before splitting into multiple columns.
  const columns = getColumns(280);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([]);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await findSimilarProducts(product, profile, scannedScore);
    setRecommendations(results);
    setLoading(false);
  }, [product, profile, scannedScore]);

  useEffect(() => {
    load();
  }, [load]);

  const betterCount = recommendations.filter((r) => r.verdict === 'better').length;

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.8}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>🔍</Text>
          <View>
            <Text style={styles.headerTitle}>{t('recommendations.title')}</Text>
            {!loading && (
              <Text style={styles.headerSub}>
                {betterCount > 0
                  ? t('recommendations.betterOptionsFound', { count: betterCount })
                  : t('recommendations.noBetterAlternatives')}
              </Text>
            )}
          </View>
        </View>
        <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.content}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.navy} size="small" />
              <Text style={styles.loadingText}>
                {t('recommendations.searching')}
              </Text>
            </View>
          ) : recommendations.length === 0 ? (
            <Text style={styles.emptyText}>
              {t('recommendations.noneFound')}
            </Text>
          ) : (
            <View style={columns > 1 ? styles.grid : undefined}>
              {recommendations.map((rec, i) => (
                <View
                  key={rec.barcode + i}
                  style={columns > 1 ? { width: getCardWidth(columns, 12, 12) } : undefined}
                >
                  <RecommendationCard
                    rec={rec}
                    scannedScore={scannedScore}
                    onPress={() => navigation.push('Product', { barcode: rec.barcode })}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Single recommendation card ───────────────────────────

function RecommendationCard({
  rec,
  scannedScore,
  onPress,
}: {
  rec: RecommendedProduct;
  scannedScore: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const nsColor = NutriscoreColors[rec.nutriscore?.toLowerCase()] || Colors.textMuted;
  const scoreDiff = rec.aiScore - scannedScore;
  const diffText = scoreDiff > 0 ? `+${scoreDiff}` : `${scoreDiff}`;
  const diffColor = scoreDiff > 0 ? Colors.safe : scoreDiff < 0 ? Colors.danger : Colors.textMuted;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Verdict banner */}
      <View style={[styles.verdictBanner, { backgroundColor: rec.verdictColor + '18' }]}>
        <Text style={[styles.verdictBannerText, { color: rec.verdictColor }]}>
          {rec.verdict === 'better' ? t('recommendations.verdictBetter') : rec.verdict === 'similar' ? t('recommendations.verdictSimilar') : t('recommendations.verdictWorse')}
        </Text>
        <View style={styles.scoreDiff}>
          <Text style={[styles.scoreDiffText, { color: diffColor }]}>{diffText}</Text>
          <Text style={styles.scoreDiffLabel}> {t('recommendations.pts')}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        {/* Product image or placeholder */}
        <View style={styles.imageWrapper}>
          {rec.image ? (
            <Image source={{ uri: rec.image }} style={styles.productImage} resizeMode="contain" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={{ fontSize: 24 }}>📦</Text>
            </View>
          )}
          {/* Nutri-Score badge */}
          <View style={[styles.nsBadge, { backgroundColor: nsColor }]}>
            <Text style={styles.nsBadgeText}>{rec.nutriscore?.toUpperCase()}</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.brand}>{rec.brand}</Text>
          <Text style={styles.name} numberOfLines={2}>{rec.name}</Text>

          {/* Nutrition quick stats */}
          <View style={styles.nutritionRow}>
            <NutrStat label={t('recommendations.sugar')} value={`${rec.nutriments.sugars}g`} />
            <NutrStat label={t('recommendations.cal')} value={`${rec.nutriments.energy_kcal}`} />
            <NutrStat label={t('recommendations.fat')} value={`${rec.nutriments.fat}g`} />
          </View>

          {/* AI score */}
          <View style={styles.aiScoreRow}>
            <View style={styles.aiScoreBar}>
              <View style={[styles.aiScoreBarFill, {
                width: `${rec.aiScore * 10}%`,
                backgroundColor: rec.aiScore >= 7 ? Colors.safe : rec.aiScore >= 4 ? Colors.caution : Colors.danger,
              }]} />
            </View>
            <Text style={styles.aiScoreText}>{t('recommendations.scoreForYou', { score: rec.aiScore })}</Text>
          </View>

          {/* AI reason */}
          <Text style={styles.aiReason} numberOfLines={2}>{rec.aiReason}</Text>
        </View>
      </View>

      {/* Tap hint */}
      <View style={styles.tapHint}>
        <Text style={styles.tapHintText}>{t('recommendations.tapToScan')}</Text>
      </View>
    </TouchableOpacity>
  );
}

function NutrStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.nutrStat}>
      <Text style={styles.nutrStatValue}>{value}</Text>
      <Text style={styles.nutrStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', padding: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { fontSize: 22 },
  headerTitle: { color: Colors.textPrimary, fontWeight: '700', fontSize: 15 },
  headerSub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  expandIcon: { color: Colors.textMuted, fontSize: 12 },
  content: { paddingHorizontal: 12, paddingBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  loadingText: { color: Colors.textSecondary, fontSize: 13 },
  emptyText: { color: Colors.textMuted, fontSize: 13, paddingVertical: 12, textAlign: 'center' },
  card: {
    backgroundColor: Colors.surfaceAlt, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 10, overflow: 'hidden',
  },
  verdictBanner: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8,
  },
  verdictBannerText: { fontSize: 13, fontWeight: '700' },
  scoreDiff: { flexDirection: 'row', alignItems: 'baseline' },
  scoreDiffText: { fontSize: 18, fontWeight: '800' },
  scoreDiffLabel: { color: Colors.textMuted, fontSize: 12 },
  cardBody: { flexDirection: 'row', padding: 12, gap: 12 },
  imageWrapper: { position: 'relative', width: 72, height: 72 },
  productImage: { width: 72, height: 72, borderRadius: 10, backgroundColor: Colors.surface },
  imagePlaceholder: {
    width: 72, height: 72, borderRadius: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  nsBadge: {
    position: 'absolute', bottom: -4, right: -4,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
  },
  nsBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  info: { flex: 1 },
  brand: { color: Colors.navy, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  name: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 8, lineHeight: 19 },
  nutritionRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  nutrStat: { alignItems: 'center' },
  nutrStatValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  nutrStatLabel: { color: Colors.textMuted, fontSize: 10 },
  aiScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  aiScoreBar: { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2 },
  aiScoreBarFill: { height: 4, borderRadius: 2 },
  aiScoreText: { color: Colors.textMuted, fontSize: 11, width: 70 },
  aiReason: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  tapHint: { paddingHorizontal: 14, paddingBottom: 10, alignItems: 'flex-end' },
  tapHintText: { color: Colors.textMuted, fontSize: 11 },
});
