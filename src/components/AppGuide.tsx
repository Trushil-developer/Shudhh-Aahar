// src/components/AppGuide.tsx
// Complete in-app guide system:
//  • 8-slide animated walkthrough modal (shown after first profile setup)
//  • Per-screen feature tooltips (shown once, then never again)
//  • Persistent HelpButton on every main screen
//  • All "seen" state persisted in AsyncStorage

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive } from '../utils/responsive';

const SEEN_KEY = 'shuddhaahar_guide_v2';

// ─────────────────────────────────────────────────────────────────
// WALKTHROUGH SLIDES
// ─────────────────────────────────────────────────────────────────

interface Slide {
  id: string;
  icon: string;
  emoji: string;
  title: string;
  body: string;
  tip?: string;
  accentColor: string;
}

// Static (non-translatable) per-slide metadata. Title/body/tip text is
// resolved via t() inside WalkthroughModal, where the `id` below is used
// as the translation key segment (appGuide.slides.<id>.*).
const SLIDE_META: Omit<Slide, 'title' | 'body' | 'tip'>[] = [
  { id: 'welcome',        icon: '✚',  emoji: '🏥', accentColor: Colors.navy },
  { id: 'profile',        icon: '👤', emoji: '🩺', accentColor: Colors.info },
  { id: 'scan',           icon: '▦',  emoji: '📦', accentColor: Colors.navyMid },
  { id: 'aiScore',        icon: '🤖', emoji: '🧠', accentColor: Colors.safe },
  { id: 'comparePrices',  icon: '💷', emoji: '🏪', accentColor: Colors.safe },
  { id: 'alternatives',   icon: '🔍', emoji: '✨', accentColor: Colors.caution },
  { id: 'foodDiary',      icon: '📓', emoji: '📊', accentColor: Colors.navyMid },
  { id: 'wishlist',       icon: '❤️', emoji: '✅', accentColor: Colors.safe },
  { id: 'allSet',         icon: '🎉', emoji: '🚀', accentColor: Colors.safe },
];

// ─────────────────────────────────────────────────────────────────
// FEATURE TOOLTIPS  (shown once per screen, bottom of screen)
// ─────────────────────────────────────────────────────────────────

export interface TooltipDef {
  id: string;
  screen: string;
  icon: string;
  title: string;
  body: string;
}

// Static (non-translatable) per-tooltip metadata. Title/body text is
// resolved via t() inside useGuide(), where `id` is used as the translation
// key segment (appGuide.tooltips.<id>.*).
const TOOLTIP_META: Omit<TooltipDef, 'title' | 'body'>[] = [
  { id: 'home_scan',     screen: 'Home',    icon: '▦' },
  { id: 'home_photo',    screen: 'Home',    icon: '📸' },
  { id: 'product_score', screen: 'Product', icon: '🤖' },
  { id: 'product_price', screen: 'Product', icon: '💷' },
  { id: 'diary_log',     screen: 'Diary',   icon: '📓' },
  { id: 'list_add',      screen: 'List',    icon: '❤️' },
  { id: 'profile_setup', screen: 'Profile', icon: '🩺' },
];

// ─────────────────────────────────────────────────────────────────
// WALKTHROUGH MODAL
// ─────────────────────────────────────────────────────────────────

interface WalkthroughProps {
  visible: boolean;
  onComplete: () => void;
}

export function WalkthroughModal({ visible, onComplete }: WalkthroughProps) {
  const { t } = useTranslation();
  const { width, rw, rh, rf, rr, rStyles } = useResponsive();
  const [step, setStep] = useState(0);
  const slideX   = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const SLIDES: Slide[] = useMemo(() => SLIDE_META.map(m => ({
    ...m,
    title: t(`appGuide.slides.${m.id}.title`),
    body: t(`appGuide.slides.${m.id}.body`),
    tip: t(`appGuide.slides.${m.id}.tip`),
  })), [t]);

  const wt = useMemo(() => StyleSheet.create({
    overlay:       { flex: 1, backgroundColor: 'rgba(7,8,13,0.85)', alignItems: 'center', justifyContent: 'center', padding: rStyles.space.lg },
    card:          { backgroundColor: Colors.surface, borderRadius: rr(24), padding: rw(22), width: '100%', maxWidth: rw(380), ...Shadow.cardMd },
    progressTrack: { height: rh(3), backgroundColor: Colors.border, borderRadius: rr(2), marginBottom: rStyles.space.lg, overflow: 'hidden' },
    progressFill:  { height: rh(3), borderRadius: rr(2) },
    dots:          { flexDirection: 'row', justifyContent: 'center', gap: rw(5), marginBottom: rStyles.space.xl },
    dot:           { height: rh(5), width: rw(5), borderRadius: rr(3), backgroundColor: Colors.border },
    iconWrap:      { width: rw(76), height: rh(76), borderRadius: rr(22), alignItems: 'center', justifyContent: 'center', marginBottom: rw(14), ...Shadow.cardMd },
    emoji:         { fontSize: rf(34) },
    counter:       { fontSize: rStyles.text.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 1, marginBottom: rStyles.space.sm },
    title:         { fontSize: rf(22), fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: rStyles.space.md, lineHeight: rh(29), letterSpacing: -0.3 },
    body:          { fontSize: rStyles.text.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: rh(23), paddingHorizontal: rStyles.space.xs },
    tip:           { marginTop: rw(14), borderRadius: rr(10), borderWidth: 1, paddingHorizontal: rw(14), paddingVertical: rStyles.space.sm },
    tipText:       { fontSize: rStyles.text.sm, fontWeight: '600', textAlign: 'center' },
    disclaimer:    { backgroundColor: Colors.navyLight, borderRadius: rr(10), padding: rStyles.space.md, marginTop: rStyles.space.md, borderWidth: 1, borderColor: Colors.border },
    disclaimerText:{ fontSize: rStyles.text.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: rh(16) },
    buttons:       { flexDirection: 'row', gap: rw(10), marginTop: rw(18) },
    skipBtn:       { borderWidth: 1, borderColor: Colors.border, borderRadius: rStyles.radius.md, paddingVertical: rw(13), paddingHorizontal: rw(18), justifyContent: 'center' },
    skipText:      { fontSize: rf(13), color: Colors.textMuted, fontWeight: '600' },
    nextBtn:       { flex: 1, borderRadius: rStyles.radius.md, paddingVertical: rw(14), alignItems: 'center', ...Shadow.card },
    nextText:      { color: '#FFF', fontWeight: '700', fontSize: rStyles.text.md },
  }), [rw, rh, rf, rr, rStyles]);

  const animateToStep = (nextStep: number) => {
    // Slide + fade out
    Animated.parallel([
      Animated.timing(slideX,   { toValue: -width * 0.3, duration: 180, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0,         duration: 160, useNativeDriver: true }),
      Animated.timing(scaleAnim,{ toValue: 0.95,      duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setStep(nextStep);
      slideX.setValue(width * 0.3);
      // Slide + fade in
      Animated.parallel([
        Animated.timing(slideX,    { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
      ]).start();
    });
  };

  const handleNext = () => {
    if (step < SLIDES.length - 1) animateToStep(step + 1);
    else onComplete();
  };

  const handleSkip = () => onComplete();

  const s = SLIDES[step];
  const isLast = step === SLIDES.length - 1;
  const progress = (step + 1) / SLIDES.length;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="overFullScreen" transparent>
      <SafeAreaProvider>
      <View style={wt.overlay}>
        <SafeAreaView style={{ width: '100%', alignItems: 'center' }}>
          <View style={wt.card}>

            {/* Progress bar */}
            <View style={wt.progressTrack}>
              <Animated.View style={[wt.progressFill, {
                width: `${progress * 100}%`,
                backgroundColor: s.accentColor,
              }]} />
            </View>

            {/* Step dots */}
            <View style={wt.dots}>
              {SLIDES.map((sl, i) => (
                <TouchableOpacity key={i} onPress={() => i < step && animateToStep(i)}>
                  <View style={[
                    wt.dot,
                    i === step && { backgroundColor: s.accentColor, width: 18 },
                    i < step && { backgroundColor: s.accentColor + '60' },
                  ]} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Animated content area */}
            <Animated.View style={{
              transform: [{ translateX: slideX }, { scale: scaleAnim }],
              opacity: fadeAnim,
              alignItems: 'center',
              paddingVertical: 8,
            }}>
              {/* Icon */}
              <View style={[wt.iconWrap, { backgroundColor: s.accentColor }]}>
                <Text style={wt.emoji}>{s.emoji}</Text>
              </View>

              {/* Step counter */}
              <Text style={wt.counter}>{t('appGuide.stepProgress', { current: step + 1, total: SLIDES.length })}</Text>

              {/* Title */}
              <Text style={wt.title}>{s.title}</Text>

              {/* Body */}
              <Text style={wt.body}>{s.body}</Text>

              {/* Tip pill */}
              {s.tip && (
                <View style={[wt.tip, { borderColor: s.accentColor + '40', backgroundColor: s.accentColor + '10' }]}>
                  <Text style={[wt.tipText, { color: s.accentColor }]}>💡 {s.tip}</Text>
                </View>
              )}
            </Animated.View>

            {/* Medical disclaimer on last slide */}
            {isLast && (
              <View style={wt.disclaimer}>
                <Text style={wt.disclaimerText}>⚕ {t('appGuide.disclaimer')}</Text>
              </View>
            )}

            {/* Buttons */}
            <View style={wt.buttons}>
              {!isLast && (
                <TouchableOpacity style={wt.skipBtn} onPress={handleSkip}>
                  <Text style={wt.skipText}>{t('common.skip')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[wt.nextBtn, { backgroundColor: s.accentColor }]}
                onPress={handleNext}
                activeOpacity={0.85}
              >
                <Text style={wt.nextText}>{isLast ? `🚀 ${t('appGuide.startScanning')}` : `${t('common.next')} →`}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
      </SafeAreaProvider>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────
// FEATURE TOOLTIP (bottom-of-screen overlay, shown once)
// ─────────────────────────────────────────────────────────────────

interface TooltipProps {
  tooltip: TooltipDef;
  onDismiss: () => void;
}

export function FeatureTooltip({ tooltip, onDismiss }: TooltipProps) {
  const { rw, rh, rf, rr, rStyles } = useResponsive();
  const slideY  = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const tt = useMemo(() => StyleSheet.create({
    wrap:      { position: 'absolute', bottom: rh(90), left: rw(12), right: rw(12), zIndex: 99 },
    card:      { flexDirection: 'row', alignItems: 'center', gap: rw(12), backgroundColor: Colors.navy, borderRadius: rStyles.radius.lg, padding: rw(14), ...Shadow.cardMd },
    iconCircle:{ width: rw(38), height: rh(38), borderRadius: rr(19), backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    iconText:  { fontSize: rf(18) },
    title:     { fontSize: rStyles.text.sm, fontWeight: '700', color: '#FFF', marginBottom: rw(2) },
    body:      { fontSize: rf(11), color: 'rgba(255,255,255,0.7)', lineHeight: rh(17) },
    closeBtn:  { padding: rStyles.space.xs },
    closeText: { color: 'rgba(255,255,255,0.45)', fontSize: rf(16) },
  }), [rw, rh, rf, rr, rStyles]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideY,  { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideY,  { toValue: 80, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0,  duration: 180, useNativeDriver: true }),
    ]).start(onDismiss);
  };

  return (
    <Animated.View style={[tt.wrap, { opacity, transform: [{ translateY: slideY }] }]}>
      <View style={tt.card}>
        <View style={tt.iconCircle}>
          <Text style={tt.iconText}>{tooltip.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={tt.title}>{tooltip.title}</Text>
          <Text style={tt.body}>{tooltip.body}</Text>
        </View>
        <TouchableOpacity onPress={dismiss} style={tt.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={tt.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────
// HELP BUTTON  (? circle shown in screen header)
// ─────────────────────────────────────────────────────────────────

interface HelpButtonProps {
  onPress: () => void;
}

export function HelpButton({ onPress }: HelpButtonProps) {
  const { rw, rh, rf, rr, rStyles } = useResponsive();
  const scale = useRef(new Animated.Value(1)).current;

  const hb = useMemo(() => StyleSheet.create({
    btn:  { width: rw(30), height: rh(30), borderRadius: rr(15), backgroundColor: Colors.navyLight, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
    text: { fontSize: rStyles.text.md, fontWeight: '800', color: Colors.navyMid, lineHeight: rh(18) },
  }), [rw, rh, rf, rr, rStyles]);

  const press = () => { Animated.sequence([Animated.timing(scale, { toValue: 0.88, duration: 80, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, tension: 200, friction: 6, useNativeDriver: true })]).start(); onPress(); };
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity style={hb.btn} onPress={press} activeOpacity={1}>
        <Text style={hb.text}>?</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────
// useGuide HOOK  (manages per-screen tooltips + walkthrough state)
// ─────────────────────────────────────────────────────────────────

export function useGuide(screen: string) {
  const { t } = useTranslation();
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [pendingTooltips, setPendingTooltips] = useState<TooltipDef[]>([]);
  const [activeTooltip, setActiveTooltip]     = useState<TooltipDef | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const TOOLTIPS: TooltipDef[] = useMemo(() => TOOLTIP_META.map(m => ({
    ...m,
    title: t(`appGuide.tooltips.${m.id}.title`),
    body: t(`appGuide.tooltips.${m.id}.body`),
  })), [t]);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then(raw => {
      const seen = new Set<string>(raw ? JSON.parse(raw) : []);
      const unseen = TOOLTIPS.filter(tt => tt.screen === screen && !seen.has(tt.id));
      setPendingTooltips(unseen);
      // Show first unseen tooltip after a small delay
      if (unseen.length) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setActiveTooltip(unseen[0]), 800);
      }
    });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [screen, TOOLTIPS]);

  const dismissTooltip = useCallback(async () => {
    if (!activeTooltip) return;
    const raw  = await AsyncStorage.getItem(SEEN_KEY);
    const seen = new Set<string>(raw ? JSON.parse(raw) : []);
    seen.add(activeTooltip.id);
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
    const remaining = pendingTooltips.filter(tt => tt.id !== activeTooltip.id);
    setPendingTooltips(remaining);
    setActiveTooltip(null);
    // Show next tooltip after a short gap
    if (remaining.length) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setActiveTooltip(remaining[0]), 1200);
    }
  }, [activeTooltip, pendingTooltips]);

  const showGuide = () => setShowWalkthrough(true);
  const hideGuide = () => setShowWalkthrough(false);

  return { showWalkthrough, showGuide, hideGuide, activeTooltip, dismissTooltip };
}
