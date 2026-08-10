// src/screens/PhotoScanScreen.tsx
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, ScrollView, Image, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { useTranslation } from 'react-i18next';
import { analysePhotoMeal, PhotoMealResult } from '../services/photoScanService';
import { addDiaryEntry, calcMacros, todayKey, MealType } from '../services/diaryService';
import { useAuth } from '../context/AuthContext';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive } from '../utils/responsive';
import { FeatureGate } from '../components/FeatureGate';

const VERDICT_CONFIG = {
  good:     { color: Colors.safe,    bg: Colors.safeBg,    border: Colors.safeBorder,    labelKey: 'photoScan.verdictGood',   icon: '✓' },
  moderate: { color: Colors.caution, bg: Colors.cautionBg, border: Colors.cautionBorder, labelKey: 'photoScan.verdictModerate', icon: '!' },
  poor:     { color: Colors.danger,  bg: Colors.dangerBg,  border: Colors.dangerBorder,  labelKey: 'photoScan.verdictPoor', icon: '✕' },
};

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABEL_KEYS: Record<MealType, string> = {
  breakfast: 'photoScan.mealBreakfast',
  lunch: 'photoScan.mealLunch',
  dinner: 'photoScan.mealDinner',
  snack: 'photoScan.mealSnack',
};

export default function PhotoScanScreen({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { healthProfile } = useAuth();
  const { rw, rh, rf, rr } = useResponsive();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState('image/jpeg');
  const [result, setResult] = useState<PhotoMealResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [logged, setLogged] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealType>('lunch');

  const pickFromCamera = async () => {
    const res = await launchCamera({ mediaType: 'photo', includeBase64: true, quality: 0.8 });
    if (res.assets?.[0]) {
      setPhotoUri(res.assets[0].uri || null);
      setPhotoBase64(res.assets[0].base64 || null);
      setMediaType(res.assets[0].type || 'image/jpeg');
      setResult(null); setLogged(false);
    }
  };

  const pickFromLibrary = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', includeBase64: true, quality: 0.8 });
    if (res.assets?.[0]) {
      setPhotoUri(res.assets[0].uri || null);
      setPhotoBase64(res.assets[0].base64 || null);
      setMediaType(res.assets[0].type || 'image/jpeg');
      setResult(null); setLogged(false);
    }
  };

  const analyse = async () => {
    if (!photoBase64) return;
    setLoading(true);
    const r = await analysePhotoMeal(photoBase64, mediaType, healthProfile);
    setResult(r);
    setLoading(false);
  };

  const logToDiary = async () => {
    if (!result) return;
    for (const food of result.foods) {
      const macros = { energy_kcal: food.calories / (food.estimatedGrams / 100), proteins: food.protein / (food.estimatedGrams / 100), carbohydrates: food.carbs / (food.estimatedGrams / 100), fat: food.fat / (food.estimatedGrams / 100) };
      const m = calcMacros(macros, food.estimatedGrams);
      await addDiaryEntry({
        date: todayKey(), meal: selectedMeal,
        barcode: 'PHOTO_' + Date.now(), name: food.name, brand: 'Photo scan', image: photoUri || '',
        servingGrams: food.estimatedGrams, aiScore: result.healthVerdict === 'good' ? 8 : result.healthVerdict === 'moderate' ? 5 : 2,
        ...m,
      });
    }
    setLogged(true);
    Alert.alert(t('photoScan.loggedTitle'), t('photoScan.itemsLoggedToMeal', { count: result.foods.length, meal: t(MEAL_LABEL_KEYS[selectedMeal]) }));
  };

  const vc = result ? VERDICT_CONFIG[result.healthVerdict] : null;

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    topBar: { backgroundColor: Colors.surface, paddingHorizontal: rw(16), paddingVertical: rh(14), borderBottomWidth: 1, borderColor: Colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    closeBtn: { color: Colors.navyMid, fontWeight: '600', fontSize: rf(14) },
    topBarTitle: { fontSize: rf(16), fontWeight: '700', color: Colors.textPrimary },
    photoPlaceholder: { backgroundColor: Colors.surface, borderRadius: rr(16), borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', padding: rw(32), alignItems: 'center', marginBottom: rh(16) },
    photoPlaceholderIcon: { fontSize: rf(48), marginBottom: rh(16) },
    photoPlaceholderTitle: { fontSize: rf(20), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(8) },
    photoPlaceholderSub: { fontSize: rf(13), color: Colors.textMuted, textAlign: 'center', lineHeight: rf(20), marginBottom: rh(20) },
    photoButtons: { flexDirection: 'row', gap: rw(12) },
    photoBtn: { flex: 1, backgroundColor: Colors.navyLight, borderRadius: rr(12), padding: rw(16), alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    photoBtnIcon: { fontSize: rf(24), marginBottom: rh(6) },
    photoBtnText: { fontSize: rf(13), fontWeight: '700', color: Colors.navyMid },
    photoPreview: { marginBottom: rh(16) },
    photoImage: { width: '100%', height: rh(240), borderRadius: rr(16), backgroundColor: Colors.surfaceAlt },
    changePhoto: { marginTop: rh(8), alignItems: 'center' },
    changePhotoText: { color: Colors.navyMid, fontSize: rf(13), fontWeight: '600' },
    analyseBtn: { backgroundColor: Colors.navy, borderRadius: rr(14), paddingVertical: rh(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rw(10), marginBottom: rh(16), ...Shadow.cardMd },
    analyseBtnIcon: { fontSize: rf(20) },
    analyseBtnText: { color: '#FFF', fontWeight: '700', fontSize: rf(16) },
    verdictCard: { flexDirection: 'row', gap: rw(12), alignItems: 'center', borderRadius: rr(12), padding: rw(14), borderWidth: 1, borderLeftWidth: 4, marginBottom: rh(12) },
    verdictIcon: { width: rw(40), height: rw(40), borderRadius: rw(20), alignItems: 'center', justifyContent: 'center' },
    verdictIconText: { color: '#FFF', fontSize: rf(18), fontWeight: '800' },
    verdictLabel: { fontSize: rf(10), fontWeight: '800', letterSpacing: 1, marginBottom: rh(2) },
    mealName: { fontSize: rf(16), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(2) },
    verdictReason: { fontSize: rf(12), color: Colors.textSecondary, lineHeight: rf(17) },
    totalsCard: { backgroundColor: Colors.surface, borderRadius: rr(12), borderWidth: 1, borderColor: Colors.border, padding: rw(14), marginBottom: rh(12), ...Shadow.card },
    cardLabel: { fontSize: rf(10), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5, marginBottom: rh(12) },
    totalsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
    totalCell: { alignItems: 'center', flex: 1 },
    totalValue: { fontSize: rf(18), fontWeight: '800', color: Colors.textPrimary },
    totalUnit: { fontSize: rf(12), fontWeight: '400', color: Colors.textMuted },
    totalLabel: { fontSize: rf(10), color: Colors.textMuted, marginTop: rh(2) },
    upfWarning: { marginTop: rh(12), backgroundColor: Colors.dangerBg, borderRadius: rr(8), padding: rw(10), borderWidth: 1, borderColor: Colors.dangerBorder },
    upfWarningText: { fontSize: rf(12), color: Colors.danger, fontWeight: '600' },
    foodsCard: { backgroundColor: Colors.surface, borderRadius: rr(12), borderWidth: 1, borderColor: Colors.border, padding: rw(14), marginBottom: rh(12), ...Shadow.card },
    foodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: rh(10), gap: rw(8) },
    foodName: { fontSize: rf(13), fontWeight: '600', color: Colors.textPrimary, marginBottom: rh(2) },
    foodDetail: { fontSize: rf(11), color: Colors.textMuted },
    foodCal: { fontSize: rf(13), fontWeight: '700', color: Colors.textPrimary },
    upfDot: { width: rw(8), height: rw(8), borderRadius: rw(4), backgroundColor: Colors.danger },
    tipsCard: { backgroundColor: Colors.infoBg, borderRadius: rr(12), borderWidth: 1, borderColor: Colors.infoBorder, padding: rw(14), marginBottom: rh(12) },
    tipRow: { flexDirection: 'row', gap: rw(8), marginBottom: rh(6) },
    tipDot: { color: Colors.info, fontWeight: '700', fontSize: rf(16) },
    tipText: { fontSize: rf(13), color: Colors.info, flex: 1, lineHeight: rf(19) },
    logCard: { backgroundColor: Colors.surface, borderRadius: rr(12), borderWidth: 1, borderColor: Colors.border, padding: rw(14), marginBottom: rh(12), ...Shadow.card },
    mealPicker: { flexDirection: 'row', gap: rw(8), marginBottom: rh(14), flexWrap: 'wrap' },
    mealPickerBtn: { borderRadius: rr(8), paddingHorizontal: rw(12), paddingVertical: rh(7), borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
    mealPickerBtnActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
    mealPickerText: { fontSize: rf(12), fontWeight: '600', color: Colors.textMuted },
    mealPickerTextActive: { color: '#FFF' },
    logBtn: { backgroundColor: Colors.navyMid, borderRadius: rr(10), paddingVertical: rh(13), alignItems: 'center' },
    logBtnText: { color: '#FFF', fontWeight: '700', fontSize: rf(14) },
    loggedText: { fontSize: rf(13), color: Colors.safe },
  }), [rw, rh, rf, rr]);

  return (
    <FeatureGate feature="photoScan" fullScreen>
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onClose}><Text style={styles.closeBtn}>✕ {t('common.close')}</Text></TouchableOpacity>
        <Text style={styles.topBarTitle}>{t('photoScan.title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ── Photo area ── */}
        {!photoUri ? (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoPlaceholderIcon}>📸</Text>
            <Text style={styles.photoPlaceholderTitle}>{t('photoScan.scanAnyMealTitle')}</Text>
            <Text style={styles.photoPlaceholderSub}>{t('photoScan.scanAnyMealSub')}</Text>
            <View style={styles.photoButtons}>
              <TouchableOpacity style={styles.photoBtn} onPress={pickFromCamera}>
                <Text style={styles.photoBtnIcon}>📷</Text>
                <Text style={styles.photoBtnText}>{t('photoScan.takePhoto')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoBtn} onPress={pickFromLibrary}>
                <Text style={styles.photoBtnIcon}>🖼️</Text>
                <Text style={styles.photoBtnText}>{t('photoScan.uploadPhoto')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.photoPreview}>
            <Image source={{ uri: photoUri }} style={styles.photoImage} resizeMode="cover" />
            <TouchableOpacity style={styles.changePhoto} onPress={() => { setPhotoUri(null); setPhotoBase64(null); setResult(null); }}>
              <Text style={styles.changePhotoText}>{t('photoScan.changePhoto')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Analyse button ── */}
        {photoUri && !result && (
          <TouchableOpacity style={styles.analyseBtn} onPress={analyse} disabled={loading} activeOpacity={0.88}>
            {loading ? (
              <><ActivityIndicator color="#FFF" size="small" /><Text style={styles.analyseBtnText}>{t('photoScan.analysingMeal')}</Text></>
            ) : (
              <><Text style={styles.analyseBtnIcon}>🤖</Text><Text style={styles.analyseBtnText}>{t('photoScan.analyseWithAi')}</Text></>
            )}
          </TouchableOpacity>
        )}

        {/* ── Results ── */}
        {result && vc && (
          <>
            {/* Verdict */}
            <View style={[styles.verdictCard, { borderLeftColor: vc.color, backgroundColor: vc.bg, borderColor: vc.border }]}>
              <View style={[styles.verdictIcon, { backgroundColor: vc.color }]}>
                <Text style={styles.verdictIconText}>{vc.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.verdictLabel, { color: vc.color }]}>{t(vc.labelKey)}</Text>
                <Text style={styles.mealName}>{result.mealName}</Text>
                <Text style={styles.verdictReason}>{result.verdictReason}</Text>
              </View>
            </View>

            {/* Totals */}
            <View style={styles.totalsCard}>
              <Text style={styles.cardLabel}>{t('photoScan.estimatedTotals')}</Text>
              <View style={styles.totalsGrid}>
                <TotalCell label={t('photoScan.calories')} value={`${result.totals.calories}`} unit="kcal" styles={styles} />
                <TotalCell label={t('photoScan.protein')} value={`${result.totals.protein}g`} unit="" styles={styles} />
                <TotalCell label={t('photoScan.carbs')} value={`${result.totals.carbs}g`} unit="" styles={styles} />
                <TotalCell label={t('photoScan.fat')} value={`${result.totals.fat}g`} unit="" styles={styles} />
              </View>
              {result.isUPF && (
                <View style={styles.upfWarning}>
                  <Text style={styles.upfWarningText}>{t('photoScan.upfWarning', { foods: result.upfFoods.join(', ') })}</Text>
                </View>
              )}
            </View>

            {/* Foods identified */}
            <View style={styles.foodsCard}>
              <Text style={styles.cardLabel}>{t('photoScan.identifiedFoodsCount', { count: result.foods.length })}</Text>
              {result.foods.map((food, i) => (
                <View key={i} style={[styles.foodRow, i < result.foods.length - 1 && { borderBottomWidth: 1, borderColor: Colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.foodName}>{food.name}</Text>
                    <Text style={styles.foodDetail}>{t('photoScan.foodMacroDetail', { grams: food.estimatedGrams, protein: food.protein, carbs: food.carbs, fat: food.fat })}</Text>
                  </View>
                  <Text style={styles.foodCal}>{food.calories} kcal</Text>
                  {food.isProcessed && <View style={styles.upfDot} />}
                </View>
              ))}
            </View>

            {/* Tips */}
            {result.healthTips.length > 0 && (
              <View style={styles.tipsCard}>
                <Text style={styles.cardLabel}>{t('photoScan.clinicalTips')}</Text>
                {result.healthTips.map((tip, i) => (
                  <View key={i} style={styles.tipRow}>
                    <Text style={styles.tipDot}>·</Text>
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Log to diary */}
            {!logged && (
              <View style={styles.logCard}>
                <Text style={styles.cardLabel}>{t('photoScan.logToDiary')}</Text>
                <View style={styles.mealPicker}>
                  {MEALS.map(m => (
                    <TouchableOpacity key={m} style={[styles.mealPickerBtn, selectedMeal === m && styles.mealPickerBtnActive]} onPress={() => setSelectedMeal(m)}>
                      <Text style={[styles.mealPickerText, selectedMeal === m && styles.mealPickerTextActive]}>{t(MEAL_LABEL_KEYS[m])}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={styles.logBtn} onPress={logToDiary}>
                  <Text style={styles.logBtnText}>{t('photoScan.logToMealButton', { meal: t(MEAL_LABEL_KEYS[selectedMeal]) })}</Text>
                </TouchableOpacity>
              </View>
            )}
            {logged && (
              <View style={[styles.logCard, { backgroundColor: Colors.safeBg, borderColor: Colors.safeBorder }]}>
                <Text style={[styles.cardLabel, { color: Colors.safe }]}>{t('photoScan.loggedSuccessfully')}</Text>
                <Text style={styles.loggedText}>{t('photoScan.addedToMealDiary', { meal: t(MEAL_LABEL_KEYS[selectedMeal]) })}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
    </FeatureGate>
  );
}

type PhotoScanStyles = ReturnType<typeof StyleSheet.create>;

function TotalCell({ label, value, unit, styles }: { label: string; value: string; unit: string; styles: PhotoScanStyles }) {
  return (
    <View style={styles.totalCell}>
      <Text style={styles.totalValue}>{value}<Text style={styles.totalUnit}>{unit}</Text></Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}
