// src/screens/DiaryScreen.tsx
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Image, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import {
  getDiaryForDay, buildDaySummary, removeDiaryEntry,
  getDailyGoals, DaySummary, MealType, DiaryEntry,
} from '../services/diaryService';
import { readHealthData, requestHealthPermissions, HealthData, getActivityLabel } from '../services/healthKitService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';
import { FeatureTooltip, useGuide } from '../components/AppGuide';
import { FeatureGate } from '../components/FeatureGate';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

export default function DiaryScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { healthProfile } = useAuth();
  const { rw, rh, rf, rr, isTablet } = useResponsive();
  const styles = useDiaryStyles(rw, rh, rf, rr);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null); // null = not connected
  // True until the user taps Connect on the Apple Health / Health Connect
  // card — App Store guideline 2.5.1 wants HealthKit use clearly identified
  // in the UI, so the system permission sheet only ever follows that tap.
  const [healthConnectPending, setHealthConnectPending] = useState(false);
  const [selectedDate] = useState(new Date().toISOString().split('T')[0]);

  const load = async () => {
    // Diary data loads immediately — health data is a separate non-blocking fetch
    const entries = await getDiaryForDay(selectedDate);
    setSummary(buildDaySummary(selectedDate, entries));
    fetchHealth();
  };

  const fetchHealth = async () => {
    try {
      // Permissions are only requested from the Connect card (connectHealth
      // below) — subsequent visits just read whatever access was granted
      const permAsked = await AsyncStorage.getItem('health_permission_asked');
      if (!permAsked) {
        setHealthConnectPending(true);
        return;
      }
      const hd = await readHealthData();
      setHealth(hd);
    } catch {
      // Health data is optional — never crash the diary over it
      setHealth(null);
    }
  };

  const connectHealth = async () => {
    try {
      await requestHealthPermissions();
    } finally {
      await AsyncStorage.setItem('health_permission_asked', 'true');
      setHealthConnectPending(false);
      fetchHealth();
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const goals = getDailyGoals(healthProfile);
  const totals = summary?.totals;

  const MEAL_LABELS: Record<MealType, string> = {
    breakfast: `${MEAL_EMOJI.breakfast} ${t('diary.mealBreakfast')}`,
    lunch: `${MEAL_EMOJI.lunch} ${t('diary.mealLunch')}`,
    dinner: `${MEAL_EMOJI.dinner} ${t('diary.mealDinner')}`,
    snack: `${MEAL_EMOJI.snack} ${t('diary.mealSnack')}`,
  };

  const handleRemove = (entry: DiaryEntry) => {
    Alert.alert(t('diary.removeEntryTitle'), t('diary.removeEntryMessage', { name: entry.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('diary.remove'), style: 'destructive', onPress: async () => { await removeDiaryEntry(selectedDate, entry.id); load(); } },
    ]);
  };

  const adjustedCalGoal = goals.calories + (health?.activeCaloriesToday ? Math.round(health.activeCaloriesToday * 0.5) : 0);
  const calPct = totals ? Math.min(100, Math.round((totals.calories / adjustedCalGoal) * 100)) : 0;

  return (
    <FeatureGate feature="foodDiary" fullScreen>
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>{t('diary.foodDiary')}</Text>
        <Text style={styles.topBarDate}>{new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          { paddingBottom: 40 },
          isTablet && { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center', width: '100%' },
        ]}
      >

        {/* ── Activity card from HealthKit ── */}
        {health && (
          <View style={styles.activityCard}>
            <View style={styles.activitySourceRow}>
              <Text style={styles.activitySourceIcon}>{Platform.OS === 'ios' ? '🍎' : '❤️'}</Text>
              <Text style={styles.activitySource}>{Platform.OS === 'ios' ? t('diary.sourceAppleHealth') : t('diary.sourceHealthConnect')}</Text>
            </View>
            <View style={styles.activityRow}>
              <ActivityStat styles={styles} icon="👟" value={health.stepsToday.toLocaleString()} label={t('diary.steps')} />
              <View style={styles.activityDivider} />
              <ActivityStat styles={styles} icon="🔥" value={`${health.activeCaloriesToday}`} label={t('diary.activeCal')} />
              {health.restingHeartRate && <><View style={styles.activityDivider} /><ActivityStat styles={styles} icon="❤️" value={`${health.restingHeartRate}`} label={t('diary.bpm')} /></>}
              {health.sleepHours && <><View style={styles.activityDivider} /><ActivityStat styles={styles} icon="😴" value={`${health.sleepHours}h`} label={t('diary.sleep')} /></>}
            </View>
            <Text style={styles.activityLabel}>{getActivityLabel(health.stepsToday)} · {health.activeCaloriesToday > 0 ? t('diary.calAddedToGoal', { cals: Math.round(health.activeCaloriesToday * 0.5) }) : ''}</Text>
            <Text style={styles.healthManageHint}>{Platform.OS === 'ios' ? t('diary.manageAppleHealth') : t('diary.manageHealthConnect')}</Text>
          </View>
        )}

        {/* ── Connect card — identifies the HealthKit / Health Connect
            integration before any system permission sheet appears ── */}
        {!health && healthConnectPending && (
          <View style={styles.activityCard}>
            <View style={styles.activitySourceRow}>
              <Text style={styles.activitySourceIcon}>{Platform.OS === 'ios' ? '🍎' : '❤️'}</Text>
              <Text style={styles.activitySource}>{Platform.OS === 'ios' ? t('diary.connectAppleHealthTitle') : t('diary.connectHealthConnectTitle')}</Text>
            </View>
            <Text style={styles.healthConnectBody}>{t('diary.connectHealthBody', { source: Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect' })}</Text>
            <TouchableOpacity style={styles.healthConnectBtn} onPress={connectHealth} accessibilityRole="button">
              <Text style={styles.healthConnectBtnText}>{t('diary.connectHealthButton')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Calorie summary ── */}
        <View style={styles.calCard}>
          <View style={styles.calHeader}>
            <Text style={styles.calLabel}>{t('diary.dailyCalories')}</Text>
            <Text style={styles.calGoal}>{t('diary.goalKcal', { goal: adjustedCalGoal.toLocaleString() })}</Text>
          </View>
          <View style={styles.calMain}>
            <Text style={styles.calConsumed}>{totals?.calories || 0}</Text>
            <Text style={styles.calUnit}>{t('diary.kcalConsumed')}</Text>
          </View>
          <View style={styles.calBarTrack}>
            <View style={[styles.calBarFill, {
              width: `${calPct}%`,
              backgroundColor: calPct > 110 ? Colors.danger : calPct > 90 ? Colors.caution : Colors.safe,
            }]} />
          </View>
          <Text style={styles.calRemaining}>
            {totals ? (adjustedCalGoal - totals.calories > 0
              ? t('diary.kcalRemaining', { value: (adjustedCalGoal - totals.calories).toLocaleString() })
              : t('diary.kcalOverGoal', { value: (totals.calories - adjustedCalGoal).toLocaleString() }))
              : t('diary.noEntriesYet')}
          </Text>
        </View>

        {/* ── Macro bars ── */}
        <View style={styles.macroCard}>
          <Text style={styles.macroTitle}>{t('diary.macronutrients')}</Text>
          <MacroBar styles={styles} label={t('diary.carbohydrates')} current={totals?.carbs || 0} goal={goals.carbs} unit="g" color={Colors.info} />
          <MacroBar styles={styles} label={t('diary.protein')} current={totals?.protein || 0} goal={goals.protein} unit="g" color={Colors.safe} />
          <MacroBar styles={styles} label={t('diary.fat')} current={totals?.fat || 0} goal={goals.fat} unit="g" color={Colors.caution} />
          <MacroBar styles={styles} label={t('diary.sugar')} current={totals?.sugars || 0} goal={goals.sugars} unit="g" color={Colors.danger} goalLabel={t('diary.recommendedMax', { value: '30g' })} />
          <MacroBar styles={styles} label={t('diary.salt')} current={totals?.salt || 0} goal={goals.salt} unit="g" color={Colors.accent} goalLabel={t('diary.recommendedMax', { value: '6g' })} />
        </View>

        {/* ── Meal sections ── */}
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map(meal => {
          const entries = summary?.meals[meal] || [];
          const mealCals = entries.reduce((s, e) => s + e.calories, 0);
          return (
            <View key={meal} style={styles.mealSection}>
              <View style={styles.mealHeader}>
                <Text style={styles.mealTitle}>{MEAL_LABELS[meal]}</Text>
                <Text style={styles.mealCals}>{mealCals > 0 ? t('diary.kcalValue', { value: mealCals }) : ''}</Text>
              </View>
              {entries.length === 0 ? (
                <TouchableOpacity style={styles.addMealBtn} onPress={() => navigation.navigate('Scan')}>
                  <Text style={styles.addMealBtnText}>{t('diary.addFood')}</Text>
                </TouchableOpacity>
              ) : (
                <>
                  {entries.map(entry => (
                    <TouchableOpacity
                      key={entry.id}
                      style={styles.entryRow}
                      onLongPress={() => handleRemove(entry)}
                      onPress={() => navigation.navigate('Product', { barcode: entry.barcode })}
                    >
                      {entry.image ? <Image source={{ uri: entry.image }} style={styles.entryImage} resizeMode="contain" /> : <View style={[styles.entryImage, { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontSize: 14 }}>📦</Text></View>}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.entryName} numberOfLines={1}>{entry.name}</Text>
                        <Text style={styles.entryDetail}>{t('diary.macroDetail', { grams: entry.servingGrams, protein: entry.protein, carbs: entry.carbs, fat: entry.fat })}</Text>
                      </View>
                      <Text style={styles.entryCal}>{entry.calories}<Text style={styles.entryCalUnit}> {t('diary.kcalUnit')}</Text></Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={styles.addMealBtnSmall} onPress={() => navigation.navigate('Scan')}>
                    <Text style={styles.addMealBtnSmallText}>{t('diary.addMore')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          );
        })}

        <Text style={styles.hint}>{t('diary.longPressHint')}</Text>
      </ScrollView>
    </SafeAreaView>
    </FeatureGate>
  );
}

function ActivityStat({ icon, value, label, styles }: { icon: string; value: string; label: string; styles: any }) {
  return (
    <View style={styles.activityStat}>
      <Text style={styles.activityStatIcon}>{icon}</Text>
      <Text style={styles.activityStatValue}>{value}</Text>
      <Text style={styles.activityStatLabel}>{label}</Text>
    </View>
  );
}

function MacroBar({ label, current, goal, unit, color, goalLabel, styles }: any) {
  const pct = Math.min(100, goal > 0 ? Math.round((current / goal) * 100) : 0);
  const over = current > goal;
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroLabelRow}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={[styles.macroValue, over && { color: Colors.danger }]}>
          {current}{unit} / {goalLabel || `${goal}${unit}`}
        </Text>
      </View>
      <View style={styles.macroBarTrack}>
        <View style={[styles.macroBarFill, { width: `${pct}%`, backgroundColor: over ? Colors.danger : color }]} />
      </View>
    </View>
  );
}

function useDiaryStyles(rw: (n: number) => number, rh: (n: number) => number, rf: (n: number) => number, rr: (n: number) => number) {
  return useMemo(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  topBar: { backgroundColor: Colors.surface, paddingHorizontal: rw(20), paddingVertical: rh(14), borderBottomWidth: 1, borderColor: Colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topBarTitle: { fontSize: rf(20), fontWeight: '800', color: Colors.textPrimary },
  topBarDate: { fontSize: rf(12), color: Colors.textMuted, fontWeight: '500' },

  activityCard: { backgroundColor: Colors.navyLight, marginHorizontal: rw(16), marginTop: rh(16), marginBottom: rh(8), borderRadius: rr(12), padding: rw(14), borderWidth: 1, borderColor: Colors.border },
  activitySourceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: rh(8) },
  activitySourceIcon: { fontSize: rf(12), marginRight: rw(4) },
  activitySource: { fontSize: rf(11), color: Colors.navyMid, fontWeight: '600' },
  activityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: rh(6) },
  activityStat: { flex: 1, alignItems: 'center' },
  activityStatIcon: { fontSize: rf(18), marginBottom: rh(2) },
  activityStatValue: { fontSize: rf(16), fontWeight: '800', color: Colors.textPrimary },
  activityStatLabel: { fontSize: rf(10), color: Colors.textMuted, letterSpacing: 0.5 },
  activityDivider: { width: 1, height: rh(40), backgroundColor: Colors.border },
  activityLabel: { fontSize: rf(11), color: Colors.navyMid, fontWeight: '500', textAlign: 'center' },
  healthManageHint: { fontSize: rf(10), color: Colors.textMuted, textAlign: 'center', marginTop: rh(6) },
  healthConnectBody: { fontSize: rf(12), color: Colors.textPrimary, lineHeight: rf(17), marginBottom: rh(10) },
  healthConnectBtn: { backgroundColor: Colors.navyMid, borderRadius: rr(10), paddingVertical: rh(10), alignItems: 'center' },
  healthConnectBtnText: { fontSize: rf(13), color: '#fff', fontWeight: '700' },

  calCard: { backgroundColor: Colors.surface, marginHorizontal: rw(16), marginVertical: rh(8), borderRadius: rr(12), padding: rw(16), borderWidth: 1, borderColor: Colors.border, ...Shadow.card },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: rh(8) },
  calLabel: { fontSize: rf(10), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5 },
  calGoal: { fontSize: rf(11), color: Colors.textMuted },
  calMain: { flexDirection: 'row', alignItems: 'baseline', gap: rw(6), marginBottom: rh(10) },
  calConsumed: { fontSize: rf(36), fontWeight: '800', color: Colors.textPrimary },
  calUnit: { fontSize: rf(14), color: Colors.textMuted },
  calBarTrack: { height: rh(8), backgroundColor: Colors.border, borderRadius: rr(4), marginBottom: rh(6), overflow: 'hidden' },
  calBarFill: { height: rh(8), borderRadius: rr(4) },
  calRemaining: { fontSize: rf(12), color: Colors.textMuted, textAlign: 'center' },

  macroCard: { backgroundColor: Colors.surface, marginHorizontal: rw(16), marginVertical: rh(8), borderRadius: rr(12), padding: rw(16), borderWidth: 1, borderColor: Colors.border, ...Shadow.card },
  macroTitle: { fontSize: rf(10), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5, marginBottom: rh(14) },
  macroRow: { marginBottom: rh(12) },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: rh(5) },
  macroLabel: { fontSize: rf(13), color: Colors.textPrimary },
  macroValue: { fontSize: rf(12), color: Colors.textMuted, fontWeight: '500' },
  macroBarTrack: { height: rh(6), backgroundColor: Colors.border, borderRadius: rr(3), overflow: 'hidden' },
  macroBarFill: { height: rh(6), borderRadius: rr(3) },

  mealSection: { backgroundColor: Colors.surface, marginHorizontal: rw(16), marginVertical: rh(8), borderRadius: rr(12), borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.card },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: rw(14), borderBottomWidth: 1, borderColor: Colors.border, backgroundColor: Colors.navyLight },
  mealTitle: { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary },
  mealCals: { fontSize: rf(12), color: Colors.navyMid, fontWeight: '600' },
  addMealBtn: { padding: rw(14), alignItems: 'center' },
  addMealBtnText: { fontSize: rf(13), color: Colors.navyMid, fontWeight: '600' },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: rw(10), padding: rw(12), borderBottomWidth: 1, borderColor: Colors.border },
  entryImage: { width: rw(40), height: rw(40), borderRadius: rr(6) },
  entryName: { fontSize: rf(13), fontWeight: '600', color: Colors.textPrimary, marginBottom: rh(2) },
  entryDetail: { fontSize: rf(11), color: Colors.textMuted },
  entryCal: { fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary },
  entryCalUnit: { fontSize: rf(11), fontWeight: '400', color: Colors.textMuted },
  addMealBtnSmall: { padding: rw(10), alignItems: 'center' },
  addMealBtnSmallText: { fontSize: rf(12), color: Colors.navyMid, fontWeight: '600' },
  hint: { fontSize: rf(11), color: Colors.textMuted, textAlign: 'center', marginTop: rh(4), marginBottom: rh(8) },
  }), [rw, rh, rf, rr]);
}
