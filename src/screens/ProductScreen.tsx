// src/screens/ProductScreen.tsx — Medical redesign
import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, Linking, StatusBar, Modal, Alert,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { fetchProductByBarcode, ProductData } from '../services/foodApi';
import { fetchPricesByBarcode, PriceComparison, effectivePrice, getSupermarketColor, getSupermarketLogo } from '../services/priceApi';
import { analyseProductForUser, AIHealthAnalysis } from '../services/aiHealthService';
import { findSimilarProducts, RecommendedProduct } from '../services/recommendationService';
import { useAuth } from '../context/AuthContext';
import { saveScanHistory, HealthProfile } from '../services/userDataService';
import { Colors, Shadow, NutriscoreColors, StatusConfig } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';
// PHASE 2: import UPFCard from '../components/UPFCard';
import { ProductScoreBreakdown, ScoringInfoModal, blurbForProduct } from '../components/ProductScoreCard';
import { calculateProductScore } from '../utils/productScore';
import { buildPersonalNutrientRows, excludeAlreadyMentioned, PersonalNutrientRow } from '../utils/personalNutrientTargets';
import { addToShoppingList, isInShoppingList } from '../services/shoppingListService';
import { useSubscription } from '../hooks/useSubscription';
import { FeatureGate } from '../components/FeatureGate';
import { useAppConfig } from '../context/AppConfigContext';
// PHASE 2: import { FeatureTooltip, useGuide } from '../components/AppGuide';

type Route = RouteProp<RootStackParamList, 'Product'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProductScreen() {
  const { t } = useTranslation();
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { barcode, fromRecommendation, whyBetter, fromScan, scansRemaining } = route.params as any;
  const { user, healthProfile } = useAuth();
  const { config: appConfig } = useAppConfig();
  const { rw, rh, rf, rr, isTablet } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  // Personal Score, lowest-price reveal and wishlist all just check
  // hasFreeAccess — scanning is the only thing that's actually metered (3
  // free/day); once under that daily cap, every member feature is unlocked
  // for the rest of the day too, no separate per-feature consumption.
  const { hasFreeAccess, openPaywall, PaywallModal } = useSubscription();

  const [product, setProduct] = useState<ProductData | null>(null);
  const [prices, setPrices] = useState<PriceComparison | null>(null);
  const [analysis, setAnalysis] = useState<AIHealthAnalysis | null>(null);
  const [alternatives, setAlternatives] = useState<RecommendedProduct[]>([]);

  const [loadingProduct, setLoadingProduct] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [loadingAI, setLoadingAI] = useState(true);
  const [loadingAlts, setLoadingAlts] = useState(false);
  const [inShoppingList, setInShoppingList] = useState(false);

  useEffect(() => { loadAll(); }, [barcode]);

  // Pulled out so the "Try Again" button on the unavailable state can
  // re-run just the AI call, without re-fetching product/price data too.
  const runAIAnalysis = async (productData: ProductData) => {
    setLoadingAI(true);
    const aiResult = await analyseProductForUser(productData, healthProfile);
    setAnalysis(aiResult);
    setLoadingAI(false);
  };

  const loadAll = async () => {
    const productData = await fetchProductByBarcode(barcode);
    setProduct(productData);
    setLoadingProduct(false);

    if (!productData?.found) { setLoadingPrices(false); setLoadingAI(false); return; }

    const priceData = await fetchPricesByBarcode(barcode, productData.name);
    setPrices(priceData);
    setLoadingPrices(false);

    // Check if already in shopping list
    setInShoppingList(await isInShoppingList(barcode));

    // Only record a history entry for an actual camera scan — reopening a
    // product from Recent Scans / History / Shopping List / a recommendation
    // is just viewing it again, not a new scan.
    if (user && fromScan) {
      const generalScore = calculateProductScore(productData);
      saveScanHistory(user.id, barcode, productData.name, productData.brand,
        generalScore.negatives.map(n => n.description),
        priceData?.cheapest?.price, priceData?.cheapest?.supermarket,
        productData.image);
    }

    // Personalised score — sends this product's nutrients/ingredients + the
    // user's health profile (allergies, conditions, medications, diet, goals)
    // to the AI for a suitability verdict specific to them.
    await runAIAnalysis(productData);

    // "Better Alternatives" recommendations not in scope for this pass
    // if (aiResult.verdict !== 'safe') {
    //   setLoadingAlts(true);
    //   const alts = await findSimilarProducts(productData, healthProfile, aiResult.personalScore);
    //   setAlternatives(alts.filter(a => a.verdict === 'better'));
    //   setLoadingAlts(false);
    // }
  };

  if (loadingProduct) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <TopBar navigation={navigation} barcode={barcode} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.navyMid} />
          <Text style={styles.loadingLabel}>{t('product.loading.retrievingData')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!product?.found) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <TopBar navigation={navigation} barcode={barcode} />
        <View style={styles.centered}>
          <View style={styles.notFoundIcon}><Text style={{ fontSize: 32 }}>{product?.networkError ? '📡' : '?'}</Text></View>
          <Text style={styles.notFoundTitle}>{product?.networkError ? t('product.notFound.networkErrorTitle') : t('product.notFound.title')}</Text>
          <Text style={styles.notFoundSub}>
            {product?.networkError
              ? t('product.notFound.networkErrorMessage')
              : t('product.notFound.message', { barcode })}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.retryBtnText}>← {t('product.notFound.goBack')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const nutriscore = product.nutriscore?.toLowerCase() || 'unknown';
  const nsColor = NutriscoreColors[nutriscore] || Colors.textMuted;
  const productScore = calculateProductScore(product);
  // PHASE 2: const isSuitable = analysis?.verdict === 'safe';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <TopBar navigation={navigation} barcode={barcode} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingBottom: 40 }, isTablet && styles.scrollCenterWrap]}
      >
        <View style={isTablet ? styles.tabletContent : styles.fullWidthContent}>

        {/* ── Product identification card ── */}
        <View style={styles.identCard}>
          <View style={styles.identHeader}>
            <Text style={styles.identHeaderLabel}>{t('product.identification.eyebrow')}</Text>
            <Text style={styles.identBarcode}>{barcode}</Text>
          </View>
          <View style={styles.identBody}>
            {product.image ? (
              <Image source={{ uri: product.image }} style={styles.productImage} resizeMode="contain" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={{ fontSize: 28, color: Colors.textMuted }}>📦</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.productBrand}>{product.brand?.toUpperCase()}</Text>
              <Text style={styles.productName}>{product.name}</Text>
              {product.quantity ? <Text style={styles.productQty}>{t('product.identification.netWeight', { quantity: product.quantity })}</Text> : null}
              <View style={styles.nutriscoreRow}>
                <View style={[styles.nutriscore, { backgroundColor: nsColor }]}>
                  <Text style={styles.nutriscoreText}>{t('product.identification.nutriScore', { grade: nutriscore.toUpperCase() })}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── Free scan trial counter — only shown right after a camera scan
             that actually consumed one, per the ScanScreen navigation param ── */}
        {typeof scansRemaining === 'number' && (
          <View style={styles.trialBanner}>
            <Text style={styles.trialBannerText}>
              {t('product.trialBanner.scansLeft', { count: scansRemaining })}
            </Text>
          </View>
        )}

        {/* ── Why it's better banner ── */}
        {fromRecommendation && whyBetter && (
          <View style={styles.whyBetterCard}>
            <View style={styles.whyBetterBadge}><Text style={styles.whyBetterBadgeText}>{t('product.recommendation.badge')}</Text></View>
            <Text style={styles.whyBetterText}>{whyBetter}</Text>
          </View>
        )}

        {/* ── Add to List — hidden once already added ── */}
        {!inShoppingList && (
          <TouchableOpacity
            style={styles.addToListBtn}
            onPress={async () => {
              if (!hasFreeAccess) { openPaywall(t('features.wishlist')); return; }
              // Snapshot the full per-store breakdown (not just the single
              // cheapest price) so the wishlist can group by store and show
              // each store's own price — see ShoppingListScreen. Only kept
              // when a real comparison was found; the isLink:true fallback
              // search links (price: 0) aren't real prices worth storing.
              const storePrices = prices?.found ? prices.prices.map(p => ({
                supermarket: p.supermarket, price: p.price,
                loyaltyPrice: p.loyaltyPrice, loyaltyLabel: p.loyaltyLabel,
              })) : undefined;
              await addToShoppingList({
                barcode: product!.barcode, name: product!.name, brand: product!.brand,
                image: product!.image, quantity: product!.quantity,
                cheapestPrice: prices?.cheapest ? effectivePrice(prices.cheapest) : undefined,
                cheapestStore: prices?.cheapest?.supermarket,
                storePrices,
                pricesUpdatedAt: storePrices ? new Date().toISOString() : undefined,
                aiScore: productScore.score,
                category: product!.categories,
              });
              setInShoppingList(true);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.addToListIcon}>❤️</Text>
            <Text style={styles.addToListText}>{t('product.wishlist.add')}</Text>
          </TouchableOpacity>
        )}

        {/* ── Product Score + Personal Score, merged into one card ── */}
        <ScoresCard
          product={product}
          healthProfile={healthProfile}
          personal={
            !appConfig.aiAnalysisEnabled ? { status: 'off' }
              : !hasFreeAccess ? { status: 'locked', onUnlock: () => openPaywall(t('features.personalScore')) }
              : loadingAI ? { status: 'loading' }
              : analysis ? { status: 'ready', analysis }
              : { status: 'unavailable', onRetry: () => runAIAnalysis(product) }
          }
        />

        {/* PHASE 2: Nutrition facts / Ingredients & Allergens / Processing & Additives —
            covered (at a summary level) by ProductScoreCard above for Phase 1
        <NutritionFactsCard product={product} />
        <IngredientsCard product={product} />
        <UPFCard product={product} />
        */}

        {/* ── Price comparison ── */}
        <FeatureGate feature="priceComparison">
          <PriceCard
            prices={prices}
            loading={loadingPrices}
            revealed={hasFreeAccess}
            onUnlock={() => openPaywall(t('features.lowestPrice'))}
          />
        </FeatureGate>

        {/* PHASE 2: "Better Alternatives" section not in Phase 1 scope
        {!loadingAI && !isSuitable && (
          <AlternativesSection loading={loadingAlts} alternatives={alternatives} navigation={navigation} scannedProduct={product} />
        )}
        */}

        {/* ── Medical disclaimer ── */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTitle}>{t('product.disclaimer.title')}</Text>
          <Text style={styles.disclaimerText}>
            {t('product.disclaimer.text')}
          </Text>
        </View>

        </View>
      </ScrollView>
      {PaywallModal}
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────

function TopBar({ navigation, barcode }: any) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <View style={styles.topBar}>
      <TouchableOpacity style={styles.topBarBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.topBarBtnText}>← {t('common.back')}</Text>
      </TouchableOpacity>
      <View style={styles.topBarCenter}>
        <Text style={styles.topBarTitle}>{t('product.topBar.title')}</Text>
      </View>
      <TouchableOpacity style={styles.topBarBtn} onPress={() => navigation.navigate('Scan')}>
        <Text style={styles.topBarBtnText}>{t('product.topBar.newScan')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function LoadingCard({ eyebrow, label }: { eyebrow: string; label: string }) {
  const { rw, rh, rf, rr } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
      <ActivityIndicator color={Colors.navyMid} />
      <View>
        <Text style={styles.cardSectionLabel}>{eyebrow}</Text>
        <Text style={{ fontSize: rf(13), color: Colors.textSecondary, marginTop: rh(2) }}>{label}</Text>
      </View>
    </View>
  );
}

function severityColor(sev: 'high' | 'medium' | 'low'): string {
  if (sev === 'high') return Colors.danger;
  if (sev === 'medium') return Colors.caution;
  return Colors.info;
}

export type PersonalScoreState =
  | { status: 'off' }
  | { status: 'locked'; onUnlock: () => void }
  | { status: 'loading' }
  | { status: 'unavailable'; onRetry: () => void }
  | { status: 'ready'; analysis: AIHealthAnalysis };

// Product Score and Personal Score in one card: both numbers side by side at
// the top so they can be compared at a glance, the AI's one-line summary
// under them, and a single breakdown holding both the general positives/
// negatives and the personal findings. The personal side shows its own
// loading / unavailable / locked state in place of its score, and drops out
// entirely when AI analysis is switched off in the app config.
function ScoresCard({ product, healthProfile, personal }: {
  product: ProductData; healthProfile?: HealthProfile; personal: PersonalScoreState;
}) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
  const [showGeneralInfo, setShowGeneralInfo] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const general = calculateProductScore(product);
  const analysis = personal.status === 'ready' ? personal.analysis : null;
  const sc = analysis ? StatusConfig[analysis.verdict] : null;

  const aiText = analysis ? [analysis.summary, ...analysis.positives, ...analysis.warnings.map(w => w.message)].join(' ') : '';
  const nutrientRows = analysis ? excludeAlreadyMentioned(buildPersonalNutrientRows(product, healthProfile), aiText) : [];
  const goodNutrients = nutrientRows.filter(r => r.status === 'good');
  const watchNutrients = nutrientRows.filter(r => r.status === 'bad');
  const hasGood = !!analysis && (analysis.positives.length > 0 || goodNutrients.length > 0);
  const hasWatch = !!analysis && (analysis.warnings.length > 0 || watchNutrients.length > 0);
  const generalFindings = general.positives.length + general.negatives.length;
  const totalFindings = generalFindings + goodNutrients.length + watchNutrients.length
    + (analysis ? analysis.positives.length + analysis.warnings.length : 0);

  const diff = analysis ? analysis.personalScore - general.score : 0;
  const diffColor = diff < 0 ? Colors.danger : diff > 0 ? Colors.safe : Colors.textMuted;
  const diffText = diff === 0
    ? t('product.personalScore.matchesGeneral')
    : diff < 0
      ? t('product.personalScore.diffLower', { diff: Math.abs(diff) })
      : t('product.personalScore.diffHigher', { diff: Math.abs(diff) });

  return (
    <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: sc?.color ?? general.color }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.cardSectionLabel, { marginBottom: 0 }]}>{t('product.scores.eyebrow')}</Text>
        {personal.status !== 'off' && (
          <TouchableOpacity onPress={() => setShowPersonalInfo(true)} hitSlop={8}>
            <Text style={styles.infoLink}>ⓘ {t('product.personalScore.infoLink')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.scoreTilesRow}>
        <ScoreTile label={t('product.scores.productLabel')} score={general.score} color={general.color} caption={general.label} />
        {personal.status !== 'off' && <View style={styles.scoreTilesDivider} />}
        {analysis && sc && (
          <ScoreTile label={t('product.scores.forYouLabel')} score={analysis.personalScore} color={sc.color} caption={t(sc.labelKey)} />
        )}
        {personal.status === 'loading' && (
          <View style={styles.scoreTile}>
            <Text style={styles.scoreTileLabel}>{t('product.scores.forYouLabel')}</Text>
            <View style={[styles.scoreTileBadge, styles.scoreTileBadgeEmpty]}>
              <ActivityIndicator color={Colors.navyMid} />
            </View>
            <Text style={styles.scoreTileCaptionMuted} numberOfLines={2}>{t('product.scores.scoring')}</Text>
          </View>
        )}
        {personal.status === 'unavailable' && (
          <View style={styles.scoreTile}>
            <Text style={styles.scoreTileLabel}>{t('product.scores.forYouLabel')}</Text>
            <View style={[styles.scoreTileBadge, styles.scoreTileBadgeEmpty]}>
              <Text style={styles.scoreTileIcon}>⚠️</Text>
            </View>
            <TouchableOpacity onPress={personal.onRetry} hitSlop={8}>
              <Text style={styles.scoreTileAction}>{t('common.tryAgain')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {personal.status === 'locked' && (
          <View style={styles.scoreTile}>
            <Text style={styles.scoreTileLabel}>{t('product.scores.forYouLabel')}</Text>
            <View style={[styles.scoreTileBadge, styles.scoreTileBadgeEmpty]}>
              <Text style={styles.scoreTileIcon}>🔒</Text>
            </View>
            <TouchableOpacity onPress={personal.onUnlock} hitSlop={8}>
              <Text style={styles.scoreTileAction} numberOfLines={1}>{t('product.personalScore.locked.cta')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={styles.scoresSummary}>
        {analysis
          ? analysis.summary
          : personal.status === 'unavailable'
            ? t('product.personalScore.unavailable.message')
            : blurbForProduct(product, t)}
      </Text>
      {analysis && (
        <View style={styles.diffChip}>
          <Text style={[styles.diffChipText, { color: diffColor }]}>{diffText}</Text>
        </View>
      )}

      {analysis?.suggestion ? (
        <View style={styles.personalSuggestionRow}>
          <Text style={styles.personalSuggestionIcon}>💡</Text>
          <Text style={styles.personalSuggestionText}>{analysis.suggestion}</Text>
        </View>
      ) : null}

      {totalFindings > 0 && (
        <>
          <TouchableOpacity style={styles.breakdownToggle} onPress={() => setExpanded(e => !e)} activeOpacity={0.7}>
            <Text style={styles.breakdownToggleText}>{expanded ? t('product.personalScore.hideBreakdown') : t('product.personalScore.seeBreakdown')}</Text>
            {!expanded ? (
              <View style={styles.breakdownCountBadge}>
                <Text style={styles.breakdownCountText}>{totalFindings}</Text>
              </View>
            ) : null}
            <Text style={styles.breakdownToggleArrow}>{expanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {expanded && (
            <>
              {generalFindings > 0 && (
                <View style={styles.breakdownGroup}>
                  <View style={styles.breakdownGroupHeader}>
                    <Text style={styles.breakdownGroupTitle}>{t('product.scores.productLabel')}</Text>
                    <TouchableOpacity onPress={() => setShowGeneralInfo(true)} hitSlop={8}>
                      <Text style={styles.infoLink}>ⓘ {t('productScoreCard.howCalculated')}</Text>
                    </TouchableOpacity>
                  </View>
                  <ProductScoreBreakdown product={product} />
                </View>
              )}

              {(hasGood || hasWatch) && (
                <View style={styles.breakdownGroup}>
                  <Text style={styles.breakdownGroupTitle}>{t('product.scores.forYouLabel')}</Text>
                  {hasGood && (
                    <View style={[styles.personalSection, styles.personalSectionFirst]}>
                      <Text style={[styles.personalSectionTitle, { color: Colors.safe }]}>{t('product.personalScore.goodForYou')}</Text>
                      {analysis!.positives.map((p, i) => (
                        <View key={`ai-${i}`} style={styles.personalItem}>
                          <Text style={[styles.personalItemIcon, { color: Colors.safe }]}>✓</Text>
                          <Text style={styles.personalItemText}>{p}</Text>
                        </View>
                      ))}
                      {goodNutrients.map(row => <PersonalNutrientRowView key={row.key} row={row} />)}
                    </View>
                  )}

                  {hasWatch && (
                    <View style={[styles.personalSection, !hasGood && styles.personalSectionFirst]}>
                      <Text style={[styles.personalSectionTitle, { color: Colors.danger }]}>{t('product.personalScore.watchOut')}</Text>
                      {analysis!.warnings.map((w, i) => (
                        <View key={`ai-${i}`} style={styles.personalItem}>
                          <Text style={styles.personalItemIcon}>{w.icon}</Text>
                          <Text style={[styles.personalItemText, { color: severityColor(w.severity) }]}>{w.message}</Text>
                        </View>
                      ))}
                      {watchNutrients.map(row => <PersonalNutrientRowView key={row.key} row={row} />)}
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </>
      )}

      <Modal visible={showPersonalInfo} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPersonalInfo(false)}>
        <SafeAreaProvider>
          <PersonalScoringInfoModal onClose={() => setShowPersonalInfo(false)} />
        </SafeAreaProvider>
      </Modal>
      <Modal visible={showGeneralInfo} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowGeneralInfo(false)}>
        <SafeAreaProvider>
          <ScoringInfoModal onClose={() => setShowGeneralInfo(false)} />
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

function ScoreTile({ label, score, color, caption }: { label: string; score: number; color: string; caption: string }) {
  const { rw, rh, rf, rr } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <View style={styles.scoreTile}>
      <Text style={styles.scoreTileLabel}>{label}</Text>
      <View style={[styles.scoreTileBadge, { backgroundColor: color }]}>
        <Text style={styles.scoreTileNum}>{score}</Text>
        <Text style={styles.scoreTileDen}>/100</Text>
      </View>
      <Text style={[styles.scoreTileCaption, { color }]} numberOfLines={1}>{caption}</Text>
    </View>
  );
}

function PersonalScoringInfoModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <SafeAreaView style={styles.modalContainer}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{t('product.personalScore.modal.title')}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Text style={styles.modalClose}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.modalBody}>
        <Text style={styles.modalEyebrow}>{t('product.personalScore.modal.eyebrow')}</Text>
        <Text style={styles.modalHeading}>{t('product.personalScore.modal.heading')}</Text>
        <Text style={styles.modalParagraph}>
          {t('product.personalScore.modal.paragraph1')}
        </Text>

        <Text style={styles.modalSubheading}>{t('product.personalScore.modal.goodWatchHeading')}</Text>
        <Text style={styles.modalParagraph}>
          {t('product.personalScore.modal.paragraph2')}
        </Text>

        <Text style={styles.modalSubheading}>{t('product.personalScore.modal.differHeading')}</Text>
        <Text style={styles.modalParagraph}>
          {t('product.personalScore.modal.paragraph3')}
        </Text>

        <Text style={styles.modalSubheading}>{t('product.personalScore.modal.changeHeading')}</Text>
        <Text style={styles.modalParagraph}>
          {t('product.personalScore.modal.paragraph4')}
        </Text>

        <Text style={styles.modalNote}>
          {t('product.personalScore.modal.note')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// One nutrient, two lines: icon + name + amount, then a single short note
// against your personal daily reference — quick to scan, nothing to expand.
function PersonalNutrientRowView({ row }: { row: PersonalNutrientRow }) {
  const { rw, rh, rf, rr } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <View style={styles.personalNutrientRow}>
      <Text style={styles.personalItemIcon}>{row.icon}</Text>
      <View style={{ flex: 1 }}>
        <View style={styles.personalNutrientTop}>
          <Text style={styles.personalNutrientTitle}>{row.title}</Text>
          <Text style={[styles.personalNutrientValue, { color: row.color }]}>{row.value}</Text>
        </View>
        <Text style={[styles.personalNutrientNote, { color: row.color }]}>{row.note}</Text>
      </View>
    </View>
  );
}

function NutritionFactsCard({ product }: { product: ProductData }) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  const n = product.nutriments;
  return (
    <View style={styles.card}>
      <Text style={styles.cardSectionLabel}>{t('product.nutritionFacts.eyebrow')}</Text>

      {/* FDA-style nutrition label */}
      <View style={styles.nutritionLabel}>
        <View style={styles.nutritionLabelHeader}>
          <Text style={styles.nutritionLabelTitle}>{t('product.nutritionFacts.title')}</Text>
          <Text style={styles.nutritionLabelServing}>{t('product.nutritionFacts.serving')}</Text>
        </View>
        <View style={styles.nutritionDividerThick} />
        <NutrRow label={t('product.nutritionFacts.calories')} value={`${n.energy_kcal}`} unit="kcal" bold />
        <View style={styles.nutritionDivider} />
        <NutrRow label={t('product.nutritionFacts.totalFat')} value={`${n.fat?.toFixed(1)}`} unit="g" />
        <NutrRow label={t('product.nutritionFacts.saturatedFat')} value={`${n.saturated_fat?.toFixed(1)}`} unit="g" sub />
        <View style={styles.nutritionDivider} />
        <NutrRow label={t('product.nutritionFacts.totalCarbs')} value={`${n.carbohydrates?.toFixed(1)}`} unit="g" />
        <NutrRow label={t('product.nutritionFacts.totalSugars')} value={`${n.sugars?.toFixed(1)}`} unit="g" sub />
        <NutrRow label={t('product.nutritionFacts.dietaryFibre')} value={`${n.fiber?.toFixed(1)}`} unit="g" sub />
        <View style={styles.nutritionDivider} />
        <NutrRow label={t('product.nutritionFacts.protein')} value={`${n.proteins?.toFixed(1)}`} unit="g" />
        <View style={styles.nutritionDivider} />
        <NutrRow label={t('product.nutritionFacts.salt')} value={`${n.salt?.toFixed(2)}`} unit="g" />
      </View>
    </View>
  );
}

function NutrRow({ label, value, unit, bold, sub }: any) {
  const { rw, rh, rf, rr } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <View style={[styles.nutritionRow, sub && { paddingLeft: 16 }]}>
      <Text style={[styles.nutritionRowLabel, bold && { fontWeight: '700' }, sub && { fontSize: 13, color: Colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.nutritionRowValue, bold && { fontWeight: '700', fontSize: 16 }]}>{value}<Text style={styles.nutritionUnit}>{unit}</Text></Text>
    </View>
  );
}

function IngredientsCard({ product }: { product: ProductData }) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.collapsibleRow} onPress={() => setOpen(o => !o)}>
        <Text style={styles.cardSectionLabel}>{t('product.ingredients.eyebrow')}</Text>
        <Text style={styles.collapseChevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 14 }}>
          {product.allergens.length > 0 && (
            <View style={styles.allergenPanel}>
              <Text style={styles.allergenPanelTitle}>⚠ {t('product.ingredients.allergensTitle')}</Text>
              <View style={styles.allergenChips}>
                {product.allergens.map((a, i) => (
                  <View key={i} style={styles.allergenChip}>
                    <Text style={styles.allergenChipText}>{a.toUpperCase()}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          <Text style={styles.ingredientsLabel}>{t('product.ingredients.fullListLabel')}</Text>
          <Text style={styles.ingredientsText}>{product.ingredients || t('product.ingredients.notAvailable')}</Text>
          <Text style={styles.ingredientsNote}>
            {t('product.ingredients.sourceNote')}
          </Text>
        </View>
      )}
    </View>
  );
}

// Real store logo (Clearbit, see priceApi.ts) when available, falling back
// to a plain colour dot on load failure (no network, retailer not in
// Clearbit's index) — used for every store row below instead of the bare
// colour dot this screen used to always show.
function StoreBadge({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const logo = !failed ? getSupermarketLogo(name) : null;
  if (logo) {
    return (
      <Image
        source={{ uri: logo }}
        style={{ width: size, height: size, borderRadius: 4 }}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    );
  }
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

function PriceCard({ prices, loading, revealed, onUnlock }: {
  prices: PriceComparison | null; loading: boolean; revealed: boolean; onUnlock: () => void;
}) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  if (loading) return <LoadingCard eyebrow={t('product.price.eyebrow')} label={t('product.price.loadingLabel')} />;

  // No real price data — show search links to supermarkets
  if (!prices?.found && prices?.prices.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardSectionLabel}>{t('product.price.eyebrow')}</Text>
        <Text style={{ color: Colors.textMuted, fontSize: 12, marginBottom: 12 }}>
          {t('product.price.liveDataUnavailable')}
        </Text>
        {prices.prices.map((item, i) => (
          <View key={i} style={[styles.storeRow, { marginBottom: 6 }]}>
            <StoreBadge name={item.supermarket} color={getSupermarketColor(item.supermarket)} />
            <Text style={[styles.storeName, { flex: 1 }]}>{item.supermarket}</Text>
          </View>
        ))}
        <Text style={styles.priceSource}>{t('product.price.sourceNote')}</Text>
      </View>
    );
  }

  if (!prices?.found || !prices.prices.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardSectionLabel}>{t('product.price.eyebrow')}</Text>
        <Text style={{ color: Colors.textMuted, fontSize: 13, marginTop: 8 }}>{t('product.price.noData')}</Text>
      </View>
    );
  }

  // effectivePrice, not .price — prices.cheapest is now picked by loyalty-
  // aware price (see priceApi.ts), so the summary/bar-chart/saving figures
  // must use the same basis or "cheapest" and the number shown for it could
  // silently disagree (e.g. a Clubcard deal made a store cheapest, but its
  // shelf price displayed here was actually higher than another store's).
  const max = prices.most_expensive ? effectivePrice(prices.most_expensive) : 1;
  const saving = prices.cheapest && prices.most_expensive
    ? (effectivePrice(prices.most_expensive) - effectivePrice(prices.cheapest)).toFixed(2)
    : null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardSectionLabel}>{t('product.price.eyebrow')}</Text>

      {/* Best price summary — which store is cheapest is a member-only reveal
          (unlocked for free accounts too while under today's scan cap) */}
      {revealed ? (
        <View style={styles.bestPricePanel}>
          <View>
            <Text style={styles.bestPriceLabel}>{t('product.price.lowestPrice')}</Text>
            <Text style={styles.bestPriceValue}>£{prices.cheapest ? effectivePrice(prices.cheapest).toFixed(2) : '—'}</Text>
            <Text style={styles.bestPriceStore}>
              {prices.cheapest?.supermarket}
              {prices.cheapest?.loyaltyLabel ? ` · ${prices.cheapest.loyaltyLabel}` : ''}
            </Text>
          </View>
          {saving && parseFloat(saving) > 0 && (
            <View style={styles.savingPanel}>
              <Text style={styles.savingLabel}>{t('product.price.potentialSaving')}</Text>
              <Text style={styles.savingValue}>£{saving}</Text>
              <Text style={styles.savingVs}>{t('product.price.savingVs', { store: prices.most_expensive?.supermarket })}</Text>
            </View>
          )}
        </View>
      ) : (
        <TouchableOpacity style={styles.bestPricePanel} onPress={onUnlock} activeOpacity={0.85}>
          <View>
            <Text style={styles.bestPriceLabel}>{t('product.price.lowestPrice')}</Text>
            <Text style={[styles.bestPriceValue, { color: Colors.textMuted }]}>£••.••</Text>
            <View style={styles.unlockChip}>
              <Text style={styles.unlockChipText}>🔒 {t('product.price.unlockLowest')}</Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Store list — while not yet revealed this must not leak the ranking
          either: priceApi.ts returns `prices` pre-sorted ascending by price,
          so rendering it in that order would reveal the cheapest store by
          position alone (always row 1) even with the badge above locked.
          Re-sort neutrally (alphabetically) and mask each price so free
          users see which stores stock it, but not the actual numbers. */}
      <View style={styles.storeListHeader}>
        <Text style={styles.storeListCol}>{t('product.price.retailerCol')}</Text>
        <Text style={styles.storeListCol}>{t('product.price.priceCol')}</Text>
      </View>
      {(revealed ? prices.prices : [...prices.prices].sort((a, b) => a.supermarket.localeCompare(b.supermarket))).map((item, i) => {
        const smColor = getSupermarketColor(item.supermarket);

        if (!revealed) {
          return (
            <TouchableOpacity
              key={i}
              style={[styles.storeRow, !item.in_stock && { opacity: 0.4 }]}
              onPress={onUnlock}
              activeOpacity={0.7}
            >
              <StoreBadge name={item.supermarket} color={smColor} />
              <View style={{ flex: 1 }}>
                <Text style={styles.storeName}>{item.supermarket}</Text>
                {!item.in_stock && <Text style={[styles.storePromo, { color: Colors.danger }]}>{t('product.price.outOfStock')}</Text>}
              </View>
              <Text style={styles.storePriceLocked}>🔒 £••.••</Text>
            </TouchableOpacity>
          );
        }

        // Which store is "best" is itself part of the member-only reveal.
        const isBest = item.supermarket === prices.cheapest?.supermarket;
        // effectivePrice — a Clubcard/Nectar price, when this store has one,
        // both for the displayed number and the bar-chart proportion, same
        // reasoning as the summary panel above.
        const rowPrice = effectivePrice(item);
        const barW = max > 0 ? (rowPrice / max) * 100 : 0;

        return (
          <View
            key={i}
            style={[styles.storeRow, !item.in_stock && { opacity: 0.4 }, isBest && styles.storeRowBest]}
          >
            <StoreBadge name={item.supermarket} color={smColor} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <Text style={[styles.storeName, isBest && { color: Colors.price, fontWeight: '700' }]}>{item.supermarket}</Text>
                <Text style={[styles.storePrice, isBest && { color: Colors.price }]}>£{rowPrice.toFixed(2)}</Text>
              </View>
              <View style={styles.priceBarTrack}>
                <View style={[styles.priceBarFill, { width: `${barW}%`, backgroundColor: isBest ? Colors.price : smColor }]} />
              </View>
              {/* item.promotion is the raw scraped text (e.g. "£1.70
                  CLUBCARD") that loyaltyLabel was parsed from — show the
                  clean label instead of repeating that same info twice. */}
              {(item.loyaltyLabel || item.promotion || !item.in_stock) && (
                <Text style={[styles.storePromo, !item.in_stock && { color: Colors.danger }]}>
                  {!item.in_stock ? t('product.price.outOfStock') : item.loyaltyLabel || item.promotion}
                </Text>
              )}
            </View>
            {isBest && <View style={styles.bestTag}><Text style={styles.bestTagText}>{t('product.price.best')}</Text></View>}
          </View>
        );
      })}
      {!revealed && (
        <TouchableOpacity style={styles.unlockAllRow} onPress={onUnlock} activeOpacity={0.85}>
          <Text style={styles.unlockAllRowText}>🔒 {t('product.price.unlockLowestFull')}</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.priceSource}>{t('product.price.sourceNote')}</Text>
    </View>
  );
}

function AlternativesSection({ loading, alternatives, navigation, scannedProduct }: any) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <View>
      <View style={styles.altSectionHeader}>
        <View style={styles.altSectionLine} />
        <Text style={styles.altSectionTitle}>{t('product.alternatives.eyebrow')}</Text>
        <View style={styles.altSectionLine} />
      </View>
      <Text style={styles.altSectionSub}>{t('product.alternatives.subtitle')}</Text>

      {loading ? (
        <LoadingCard eyebrow={t('product.alternatives.eyebrow')} label={t('product.alternatives.loadingLabel')} />
      ) : alternatives.length === 0 ? (
        <View style={styles.card}>
          <Text style={{ color: Colors.textMuted, fontSize: 13 }}>{t('product.alternatives.none')}</Text>
        </View>
      ) : alternatives.map((alt: RecommendedProduct, i: number) => (
        <TouchableOpacity
          key={alt.barcode + i}
          style={styles.altCard}
          onPress={() => navigation.push('Product', { barcode: alt.barcode, fromRecommendation: true, whyBetter: alt.aiReason } as any)}
          activeOpacity={0.88}
        >
          {/* Header */}
          <View style={styles.altCardHeader}>
            <Text style={styles.altCardHeaderText}>✓ {t('product.alternatives.matchBadge', { score: alt.aiScore })}</Text>
            {alt.nutriscore && alt.nutriscore !== 'unknown' && (
              <View style={[styles.altNutriscore, { backgroundColor: NutriscoreColors[alt.nutriscore.toLowerCase()] || Colors.textMuted }]}>
                <Text style={styles.altNutriscoreText}>{t('product.alternatives.nutriPrefix', { grade: alt.nutriscore.toUpperCase() })}</Text>
              </View>
            )}
          </View>

          {/* Product identity */}
          <View style={styles.altCardBody}>
            {alt.image ? (
              <Image source={{ uri: alt.image }} style={styles.altImage} resizeMode="contain" />
            ) : (
              <View style={[styles.altImage, { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 20 }}>📦</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.altBrand}>{alt.brand?.toUpperCase()}</Text>
              <Text style={styles.altName} numberOfLines={2}>{alt.name}</Text>
              <View style={styles.altReasonBox}>
                <Text style={styles.altReasonLabel}>{t('product.alternatives.whyBetter')}</Text>
                <Text style={styles.altReasonText} numberOfLines={3}>{alt.aiReason}</Text>
              </View>
            </View>
          </View>

          {/* Side-by-side nutrition comparison */}
          {scannedProduct && (
            <View style={styles.compareTable}>
              <View style={styles.compareHeaderRow}>
                <Text style={[styles.compareHeaderCell, { flex: 2 }]}>{t('product.alternatives.per100g')}</Text>
                <Text style={styles.compareHeaderCell}>{t('product.alternatives.current')}</Text>
                <Text style={styles.compareHeaderCell}>{t('product.alternatives.alternative')}</Text>
                <Text style={styles.compareHeaderCellNarrow} />
              </View>
              <CompareRow
                label={t('product.nutritionFacts.calories')}
                current={scannedProduct.nutriments.energy_kcal}
                alt={alt.nutriments.energy_kcal}
                unit="kcal"
                lowerIsBetter
              />
              <CompareRow
                label={t('product.alternatives.compare.fat')}
                current={scannedProduct.nutriments.fat}
                alt={alt.nutriments.fat}
                unit="g"
                lowerIsBetter
              />
              <CompareRow
                label={t('product.alternatives.compare.sugars')}
                current={scannedProduct.nutriments.sugars}
                alt={alt.nutriments.sugars}
                unit="g"
                lowerIsBetter
              />
              <CompareRow
                label={t('product.nutritionFacts.salt')}
                current={scannedProduct.nutriments.salt}
                alt={alt.nutriments.salt}
                unit="g"
                lowerIsBetter
              />
              <CompareRow
                label={t('product.nutritionFacts.protein')}
                current={scannedProduct.nutriments.proteins}
                alt={alt.nutriments.proteins}
                unit="g"
                lowerIsBetter={false}
                last
              />
            </View>
          )}

          <View style={styles.altCardFooter}>
            <Text style={styles.altCardFooterText}>{t('product.alternatives.footerCta')}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function CompareRow({ label, current, alt, unit, lowerIsBetter, last }: {
  label: string; current: number; alt: number; unit: string; lowerIsBetter: boolean; last?: boolean;
}) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr } = useResponsive();
  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  const cv = Number(current) || 0;
  const av = Number(alt)     || 0;
  const altIsBetter = lowerIsBetter ? av < cv : av > cv;
  const altIsWorse  = lowerIsBetter ? av > cv : av < cv;
  const diff = cv !== 0 ? Math.round(Math.abs((av - cv) / cv) * 100) : 0;

  const altColor  = altIsBetter ? Colors.safe  : altIsWorse ? Colors.danger : Colors.textMuted;
  const indicator = altIsBetter ? t('product.alternatives.indicator.better') : altIsWorse ? t('product.alternatives.indicator.higher') : t('product.alternatives.indicator.same');
  const indColor  = altIsBetter ? Colors.safe  : altIsWorse ? Colors.danger : Colors.textMuted;

  return (
    <View style={[styles.compareRow, last && { borderBottomWidth: 0 }]}>
      <Text style={[styles.compareLabel, { flex: 2 }]}>{label}</Text>
      <Text style={styles.compareCurrentVal}>{cv.toFixed(1)}{unit}</Text>
      <Text style={[styles.compareAltVal, { color: altColor }]}>{av.toFixed(1)}{unit}</Text>
      <View style={styles.compareIndicatorWrap}>
        <Text style={[styles.compareIndicator, { color: indColor }]}>{indicator}</Text>
        {diff > 0 && <Text style={[styles.compareDiff, { color: indColor }]}>{diff}%</Text>}
      </View>
    </View>
  );
}


function createStyles(
  rw: (n: number) => number,
  rh: (n: number) => number,
  rf: (n: number) => number,
  rr: (n: number) => number,
) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(32) },
  loadingLabel: { color: Colors.textMuted, fontSize: rf(13), marginTop: rh(14) },
  notFoundIcon: { width: rw(64), height: rw(64), borderRadius: rw(32), backgroundColor: Colors.dangerBg, borderWidth: 2, borderColor: Colors.dangerBorder, alignItems: 'center', justifyContent: 'center', marginBottom: rh(16) },
  notFoundTitle: { fontSize: rf(20), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(8) },
  notFoundSub: { fontSize: rf(13), color: Colors.textSecondary, textAlign: 'center', lineHeight: rf(20), marginBottom: rh(24) },
  retryBtn: { backgroundColor: Colors.navyMid, borderRadius: rr(10), paddingHorizontal: rw(24), paddingVertical: rh(12) },
  retryBtnText: { color: '#FFF', fontWeight: '700', fontSize: rf(14) },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rw(16), paddingVertical: rh(12), backgroundColor: Colors.surface, borderBottomWidth: 1, borderColor: Colors.border },
  topBarBtn: { paddingHorizontal: rw(4), paddingVertical: rh(4), minWidth: rw(70) },
  topBarBtnText: { color: Colors.navyMid, fontSize: rf(14), fontWeight: '600' },
  topBarCenter: { flex: 1, alignItems: 'center' },
  topBarTitle: { fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary },

  card: { backgroundColor: Colors.surface, marginHorizontal: rw(16), marginVertical: rh(8), borderRadius: rr(12), padding: rw(16), borderWidth: 1, borderColor: Colors.border, ...Shadow.card },
  cardSectionLabel: { fontSize: rf(10), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5, marginBottom: rh(12) },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rh(12) },
  infoLink: { fontSize: rf(11), color: Colors.navyMid, fontWeight: '600' },

  identCard: { backgroundColor: Colors.surface, marginHorizontal: rw(16), marginVertical: rh(8), borderRadius: rr(12), overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, ...Shadow.card },
  identHeader: { backgroundColor: Colors.navy, paddingHorizontal: rw(16), paddingVertical: rh(10), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  identHeaderLabel: { fontSize: rf(10), fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5 },
  identBarcode: { fontSize: rf(12), color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' },
  identBody: { flexDirection: 'row', padding: rw(16), gap: rw(14) },
  productImage: { width: rw(80), height: rw(80), borderRadius: rr(8), backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  imagePlaceholder: { width: rw(80), height: rw(80), borderRadius: rr(8), backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  productBrand: { fontSize: rf(10), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5, marginBottom: rh(4) },
  productName: { fontSize: rf(16), fontWeight: '700', color: Colors.textPrimary, lineHeight: rf(22), marginBottom: rh(4) },
  productQty: { fontSize: rf(12), color: Colors.textMuted, marginBottom: rh(8) },
  nutriscoreRow: { flexDirection: 'row' },
  nutriscore: { borderRadius: rr(6), paddingHorizontal: rw(8), paddingVertical: rh(3) },
  nutriscoreText: { color: '#FFF', fontSize: rf(10), fontWeight: '700', letterSpacing: 0.5 },

  whyBetterCard: { backgroundColor: Colors.safeBg, marginHorizontal: rw(16), marginVertical: rh(8), borderRadius: rr(12), padding: rw(16), borderWidth: 1, borderColor: Colors.safeBorder, borderLeftWidth: 4, borderLeftColor: Colors.safe },
  whyBetterBadge: { backgroundColor: Colors.safe, borderRadius: rr(4), alignSelf: 'flex-start', paddingHorizontal: rw(8), paddingVertical: rh(3), marginBottom: rh(8) },
  whyBetterBadgeText: { color: '#FFF', fontSize: rf(9), fontWeight: '700', letterSpacing: 1 },
  whyBetterText: { fontSize: rf(13), color: Colors.textPrimary, lineHeight: rf(20) },

  // Personal Score card — a hero "glance" moment (icon, big score, verdict,
  // summary) up top, then full-width stacked findings (not a squeezed
  // two-column grid) tucked behind a toggle so long AI sentences and
  // nutrient rows both wrap instead of getting cut off, and the card doesn't
  // read as a wall of text by default.

  breakdownToggle:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rw(8), paddingVertical: rh(13), marginTop: rh(6), borderTopWidth: 1, borderTopColor: Colors.border },
  breakdownToggleText:  { fontSize: rf(13), fontWeight: '700', color: Colors.navy },
  breakdownToggleArrow: { fontSize: rf(11), color: Colors.navy },
  breakdownCountBadge:  { backgroundColor: Colors.navyLight, borderRadius: rr(999), paddingHorizontal: rw(7), paddingVertical: rh(1), minWidth: rw(20), alignItems: 'center' },
  breakdownCountText:   { fontSize: rf(11), fontWeight: '800', color: Colors.navy },

  // Combined Scores card — Product Score and Personal Score as two equal
  // tiles side by side, so both numbers read at a glance
  scoreTilesRow:     { flexDirection: 'row', alignItems: 'stretch', marginBottom: rh(14) },
  scoreTilesDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: rw(10) },
  scoreTile:         { flex: 1, alignItems: 'center' },
  scoreTileLabel:    { fontSize: rf(10), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: rh(8), textAlign: 'center' },
  scoreTileBadge:    { width: rw(68), height: rw(68), borderRadius: rw(34), alignItems: 'center', justifyContent: 'center', marginBottom: rh(8), ...Shadow.cardMd },
  scoreTileBadgeEmpty: { backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  scoreTileNum:      { fontSize: rf(24), fontWeight: '800', color: '#FFFFFF', lineHeight: rf(28) },
  scoreTileDen:      { fontSize: rf(10), fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  scoreTileIcon:     { fontSize: rf(24) },
  scoreTileCaption:  { fontSize: rf(13), fontWeight: '800', textAlign: 'center' },
  scoreTileCaptionMuted: { fontSize: rf(11), color: Colors.textMuted, textAlign: 'center' },
  scoreTileAction:   { fontSize: rf(12), fontWeight: '700', color: Colors.navyMid, textAlign: 'center' },
  scoresSummary:     { fontSize: rf(13), color: Colors.textSecondary, textAlign: 'center', lineHeight: rf(19), paddingHorizontal: rw(6), marginBottom: rh(10) },
  breakdownGroup:       { marginTop: rh(14) },
  breakdownGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  breakdownGroupTitle:  { fontSize: rf(10), fontWeight: '800', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: rh(6) },


  diffChip: { alignSelf: 'center', marginBottom: rh(12) },
  diffChipText: { fontSize: rf(12), fontWeight: '700' },

  unavailableRow:   { flexDirection: 'row', gap: rw(12), alignItems: 'flex-start', marginBottom: rh(14) },
  unavailableIcon:  { fontSize: rf(20) },
  unavailableTitle: { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(3) },
  unavailableSub:   { fontSize: rf(12), color: Colors.textSecondary, lineHeight: rf(17) },
  unavailableRetryBtn:  { backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, borderRadius: rr(10), paddingVertical: rh(11), alignItems: 'center' },
  unavailableRetryText: { fontSize: rf(13), fontWeight: '700', color: Colors.navy },

  personalSection:      { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: rh(12), marginTop: rh(4), gap: rh(10) },
  personalSectionFirst: { borderTopWidth: 0, marginTop: 0, paddingTop: rh(2) },
  personalSectionTitle: { fontSize: rf(10), fontWeight: '800', letterSpacing: 1, marginBottom: rh(2) },

  personalItem:     { flexDirection: 'row', gap: rw(8), alignItems: 'flex-start' },
  personalItemIcon: { fontSize: rf(13), width: rw(16) },
  personalItemText: { flex: 1, fontSize: rf(12), fontWeight: '600', color: Colors.textPrimary, lineHeight: rf(16) },

  personalNutrientRow:   { flexDirection: 'row', gap: rw(8), alignItems: 'flex-start' },
  personalNutrientTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rw(8) },
  personalNutrientTitle: { flex: 1, fontSize: rf(12.5), fontWeight: '700', color: Colors.textPrimary },
  personalNutrientValue: { fontSize: rf(12.5), fontWeight: '800' },
  personalNutrientNote: { fontSize: rf(11), fontWeight: '700', marginTop: rh(2) },

  personalSuggestionRow:  { flexDirection: 'row', gap: rw(8), alignItems: 'flex-start', marginTop: rh(14), paddingTop: rh(14), borderTopWidth: 1, borderTopColor: Colors.border },
  personalSuggestionIcon: { fontSize: rf(14) },
  personalSuggestionText: { flex: 1, fontSize: rf(12), color: Colors.textSecondary, lineHeight: rf(18) },

  modalContainer: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rw(20), paddingVertical: rh(16), borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: rf(16), fontWeight: '700', color: Colors.textPrimary },
  modalClose: { fontSize: rf(18), color: Colors.textMuted },
  modalBody: { padding: rw(20), paddingBottom: rh(48) },
  modalEyebrow: { fontSize: rf(11), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: rh(6) },
  modalHeading: { fontSize: rf(20), fontWeight: '800', color: Colors.textPrimary, marginBottom: rh(16) },
  modalSubheading: { fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary, marginTop: rh(16), marginBottom: rh(6) },
  modalParagraph: { fontSize: rf(13), color: Colors.textSecondary, lineHeight: rf(20) },
  modalNote: { fontSize: rf(12), color: Colors.textMuted, lineHeight: rf(18), marginTop: rh(24), fontStyle: 'italic' },

  nutritionLabel: { borderWidth: 2, borderColor: Colors.textPrimary, borderRadius: rr(8), overflow: 'hidden' },
  nutritionLabelHeader: { backgroundColor: Colors.textPrimary, padding: rw(12) },
  nutritionLabelTitle: { fontSize: rf(20), fontWeight: '800', color: '#FFF' },
  nutritionLabelServing: { fontSize: rf(12), color: 'rgba(255,255,255,0.7)', marginTop: rh(2) },
  nutritionDividerThick: { height: rh(8), backgroundColor: Colors.textPrimary },
  nutritionDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: rw(12) },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: rw(12), paddingVertical: rh(8) },
  nutritionRowLabel: { fontSize: rf(14), color: Colors.textPrimary },
  nutritionRowValue: { fontSize: rf(14), fontWeight: '600', color: Colors.textPrimary },
  nutritionUnit: { fontSize: rf(12), fontWeight: '400', color: Colors.textSecondary },

  collapsibleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  collapseChevron: { fontSize: rf(12), color: Colors.textMuted },
  allergenPanel: { backgroundColor: Colors.dangerBg, borderRadius: rr(8), padding: rw(12), borderWidth: 1, borderColor: Colors.dangerBorder, marginBottom: rh(14) },
  allergenPanelTitle: { fontSize: rf(10), fontWeight: '700', color: Colors.danger, letterSpacing: 1.5, marginBottom: rh(8) },
  allergenChips: { flexDirection: 'row', flexWrap: 'wrap', gap: rw(6) },
  allergenChip: { backgroundColor: Colors.danger, borderRadius: rr(4), paddingHorizontal: rw(8), paddingVertical: rh(3) },
  allergenChipText: { color: '#FFF', fontSize: rf(11), fontWeight: '700', letterSpacing: 0.5 },
  ingredientsLabel: { fontSize: rf(10), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5, marginBottom: rh(8) },
  ingredientsText: { fontSize: rf(13), color: Colors.textSecondary, lineHeight: rf(22) },
  ingredientsNote: { fontSize: rf(11), color: Colors.textMuted, marginTop: rh(10), lineHeight: rf(16), fontStyle: 'italic' },

  bestPricePanel: { backgroundColor: Colors.safeBg, borderRadius: rr(10), padding: rw(14), borderWidth: 1, borderColor: Colors.safeBorder, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: rh(14) },
  bestPriceLabel: { fontSize: rf(9), fontWeight: '700', color: Colors.price, letterSpacing: 1.5, marginBottom: rh(2) },
  bestPriceValue: { fontSize: rf(28), fontWeight: '800', color: Colors.price },
  bestPriceStore: { fontSize: rf(12), color: Colors.textSecondary, marginTop: rh(2) },
  unlockChip: { backgroundColor: Colors.navyLight, borderRadius: rr(20), paddingHorizontal: rw(10), paddingVertical: rh(4), marginTop: rh(6), alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.border },
  unlockChipText: { fontSize: rf(11), fontWeight: '700', color: Colors.navyMid },
  trialBanner: { backgroundColor: Colors.cautionBg, borderRadius: rr(10), borderWidth: 1, borderColor: Colors.cautionBorder, paddingHorizontal: rw(12), paddingVertical: rh(8), marginBottom: rh(12), alignItems: 'center' },
  trialBannerText: { fontSize: rf(12), fontWeight: '700', color: Colors.caution },
  savingPanel: { alignItems: 'flex-end' },
  savingLabel: { fontSize: rf(9), fontWeight: '700', color: Colors.price, letterSpacing: 1.5, marginBottom: rh(2) },
  savingValue: { fontSize: rf(22), fontWeight: '800', color: Colors.price },
  savingVs: { fontSize: rf(11), color: Colors.textMuted },
  storeListHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: rw(4), marginBottom: rh(4) },
  storeListCol: { fontSize: rf(9), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: rw(10), paddingVertical: rh(10), borderBottomWidth: 1, borderColor: Colors.border },
  storeRowBest: { backgroundColor: Colors.safeBg, marginHorizontal: -rw(4), paddingHorizontal: rw(4), borderRadius: rr(8) },
  storeName: { fontSize: rf(14), color: Colors.textPrimary },
  storePrice: { fontSize: rf(15), fontWeight: '600', color: Colors.textPrimary },
  storePriceLocked: { fontSize: rf(13), fontWeight: '600', color: Colors.textMuted },
  priceBarTrack: { height: rh(4), backgroundColor: Colors.border, borderRadius: rr(2) },
  priceBarFill: { height: rh(4), borderRadius: rr(2) },
  storePromo: { fontSize: rf(11), color: Colors.caution, marginTop: rh(3) },
  unlockAllRow: { alignItems: 'center', paddingVertical: rh(12), marginTop: rh(4), backgroundColor: Colors.navyLight, borderRadius: rr(10), borderWidth: 1, borderColor: Colors.border },
  unlockAllRowText: { fontSize: rf(12), fontWeight: '700', color: Colors.navyMid },
  bestTag: { backgroundColor: Colors.price, borderRadius: rr(4), paddingHorizontal: rw(6), paddingVertical: rh(2) },
  bestTagText: { color: '#FFF', fontSize: rf(9), fontWeight: '800', letterSpacing: 0.5 },
  priceSource: { fontSize: rf(10), color: Colors.textMuted, textAlign: 'center', marginTop: rh(12), fontStyle: 'italic' },

  altSectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rw(16), marginVertical: rh(12), gap: rw(10) },
  altSectionLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  altSectionTitle: { fontSize: rf(10), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5 },
  altSectionSub: { fontSize: rf(12), color: Colors.textMuted, textAlign: 'center', marginBottom: rh(8) },
  altCard: { backgroundColor: Colors.surface, marginHorizontal: rw(16), marginBottom: rh(12), borderRadius: rr(12), borderWidth: 1, borderColor: Colors.safeBorder, overflow: 'hidden', ...Shadow.card },
  altCardHeader: { backgroundColor: Colors.safe, paddingHorizontal: rw(14), paddingVertical: rh(8), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  altCardHeaderText: { fontSize: rf(10), fontWeight: '700', color: '#FFF', letterSpacing: 1, flex: 1 },
  altNutriscore: { borderRadius: rr(4), paddingHorizontal: rw(6), paddingVertical: rh(2) },
  altNutriscoreText: { color: '#FFF', fontSize: rf(9), fontWeight: '700', letterSpacing: 0.5 },
  altCardBody: { flexDirection: 'row', padding: rw(14), gap: rw(12) },
  altImage: { width: rw(68), height: rw(68), borderRadius: rr(8), borderWidth: 1, borderColor: Colors.border },
  altBrand: { fontSize: rf(10), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, marginBottom: rh(3) },
  altName: { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary, lineHeight: rf(20), marginBottom: rh(8) },
  altReasonBox: { backgroundColor: Colors.surfaceAlt, borderRadius: rr(6), padding: rw(10), borderWidth: 1, borderColor: Colors.border },
  altReasonLabel: { fontSize: rf(9), fontWeight: '700', color: Colors.safe, letterSpacing: 1, marginBottom: rh(4) },
  altReasonText: { fontSize: rf(12), color: Colors.textSecondary, lineHeight: rf(18) },

  // Nutrition comparison table
  compareTable:         { marginHorizontal: rw(14), marginBottom: rh(4), borderRadius: rr(8), borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  compareHeaderRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceAlt, paddingHorizontal: rw(10), paddingVertical: rh(6) },
  compareHeaderCell:    { flex: 1, fontSize: rf(9), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textAlign: 'center' },
  compareHeaderCellNarrow: { flex: 1.4, fontSize: rf(9), fontWeight: '700', color: Colors.textMuted },
  compareRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rw(10), paddingVertical: rh(9), borderBottomWidth: 1, borderBottomColor: Colors.border },
  compareLabel:         { fontSize: rf(12), color: Colors.textSecondary },
  compareCurrentVal:    { flex: 1, fontSize: rf(12), fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
  compareAltVal:        { flex: 1, fontSize: rf(12), fontWeight: '700', textAlign: 'center' },
  compareIndicatorWrap: { flex: 1.4, alignItems: 'flex-end' },
  compareIndicator:     { fontSize: rf(10), fontWeight: '700' },
  compareDiff:          { fontSize: rf(9), opacity: 0.75 },

  altCardFooter: { paddingHorizontal: rw(14), paddingVertical: rh(10), borderTopWidth: 1, borderColor: Colors.border, alignItems: 'flex-end' },
  altCardFooterText: { fontSize: rf(12), color: Colors.navyMid, fontWeight: '600' },

  addToListBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rw(10), marginHorizontal: rw(16), marginVertical: rh(8), backgroundColor: Colors.navy, borderRadius: rr(14), paddingVertical: rh(16), ...Shadow.card },
  addToListIcon:    { fontSize: rf(18) },
  addToListText:    { fontSize: rf(15), fontWeight: '700', color: '#FFF' },
  disclaimer: { backgroundColor: Colors.navyLight, marginHorizontal: rw(16), marginVertical: rh(8), borderRadius: rr(12), padding: rw(16), borderWidth: 1, borderColor: Colors.border },
  disclaimerTitle: { fontSize: rf(12), fontWeight: '700', color: Colors.navyMid, marginBottom: rh(8), letterSpacing: 0.5 },
  disclaimerText: { fontSize: rf(11), color: Colors.textSecondary, lineHeight: rf(18) },

  // Tablet content width cap — keeps the product report column centered and
  // readable instead of stretching edge-to-edge on wide screens.
  scrollCenterWrap: { alignItems: 'center' },
  tabletContent:    { width: '100%', maxWidth: TABLET_CONTENT_MAX_WIDTH },
  fullWidthContent: { width: '100%' },
  });
}
