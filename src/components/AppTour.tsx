// src/components/AppTour.tsx
// Auto-playing, video-style app tour shown from Home. Unlike AppGuide.tsx's
// WalkthroughModal (tap-through text slides), this plays itself — a
// story-style progress bar (like Instagram Stories) drives each beat, and
// every beat is a small motion demo of the real feature (a scanning
// barcode, the score meter filling in, prices landing, a saved item) with a
// one-line caption instead of paragraphs. Tap left/right half to go back/
// skip a beat, or tap the X to close at any point.

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Easing,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive } from '../utils/responsive';

const BEAT_DURATION = 3500; // ms per beat — 4 beats ≈ 14s total

// ─────────────────────────────────────────────────────────────────
// BEAT 1 — Scan
// ─────────────────────────────────────────────────────────────────
const BARCODE_BAR_WIDTHS = [3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 1, 2, 4, 1, 3];

function ScanBeat() {
  const { rw, rh, rr } = useResponsive();
  const fade = useRef(new Animated.Value(0)).current;
  const lineY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lineY, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(lineY, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const translateY = lineY.interpolate({ inputRange: [0, 1], outputRange: [rh(8), rh(72)] });

  return (
    <Animated.View style={{ opacity: fade, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: rw(160), height: rh(96), borderRadius: rr(16), borderWidth: 2,
        borderColor: Colors.navy, backgroundColor: '#FFF', alignItems: 'center',
        justifyContent: 'center', overflow: 'hidden',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: rw(1.5) }}>
          {BARCODE_BAR_WIDTHS.map((w, i) => (
            <View key={i} style={{ width: rw(w), height: rh(50), backgroundColor: Colors.textPrimary }} />
          ))}
        </View>
        <Animated.View style={{
          position: 'absolute', left: 0, right: 0, height: rh(3),
          backgroundColor: Colors.accent, opacity: 0.85, transform: [{ translateY }],
          shadowColor: Colors.accent, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
        }} />
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────
// BEAT 2 — Score
// ─────────────────────────────────────────────────────────────────
function ScoreBeat() {
  const { rw, rh, rf, rr } = useResponsive();
  const pop = useRef(new Animated.Value(0)).current;
  const meter = useRef(new Animated.Value(0)).current;
  const warnFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, tension: 140, friction: 8, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(meter, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(warnFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={{ alignItems: 'center', width: rw(220) }}>
      <Animated.Text style={{ fontSize: rf(46), fontWeight: '800', color: Colors.safe, transform: [{ scale: pop }] }}>8.2</Animated.Text>
      <Text style={{ fontSize: rf(11), color: Colors.textMuted, fontWeight: '700', marginBottom: rh(10), letterSpacing: 0.5 }}>YOUR SCORE / 10</Text>
      <View style={{ width: '100%', height: rh(8), borderRadius: rr(4), backgroundColor: Colors.border, overflow: 'hidden' }}>
        <Animated.View style={{
          height: '100%', borderRadius: rr(4), backgroundColor: Colors.safe,
          width: meter.interpolate({ inputRange: [0, 1], outputRange: ['0%', '82%'] }),
        }} />
      </View>
      <Animated.View style={{
        opacity: warnFade, flexDirection: 'row', alignItems: 'center', gap: rw(6),
        marginTop: rh(12), backgroundColor: Colors.cautionBg, borderRadius: rr(8),
        paddingVertical: rh(6), paddingHorizontal: rw(10),
      }}>
        <Text style={{ fontSize: rf(12) }}>⚠</Text>
        <Text style={{ fontSize: rf(11.5), color: Colors.caution, fontWeight: '700' }}>High in sugar for your goals</Text>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// BEAT 3 — Compare prices (real integrated stores — see priceApi.ts)
// ─────────────────────────────────────────────────────────────────
const DEMO_STORES = [
  { name: "Sainsbury's", price: '£2.40' },
  { name: 'Tesco',       price: '£2.15' },
  { name: 'ASDA',        price: '£1.95' },
];

function PriceBeat() {
  const { rw, rh, rf, rr } = useResponsive();
  const rowAnims = useRef(DEMO_STORES.map(() => new Animated.Value(0))).current;
  const badgeFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(140, rowAnims.map(a => Animated.spring(a, { toValue: 1, tension: 120, friction: 10, useNativeDriver: true }))).start(() => {
      Animated.timing(badgeFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  }, []);

  return (
    <View style={{ width: rw(230) }}>
      {DEMO_STORES.map((store, i) => {
        const translateX = rowAnims[i].interpolate({ inputRange: [0, 1], outputRange: [rw(60), 0] });
        const isCheapest = i === DEMO_STORES.length - 1;
        return (
          <Animated.View key={store.name} style={{
            opacity: rowAnims[i], transform: [{ translateX }], flexDirection: 'row',
            alignItems: 'center', justifyContent: 'space-between', paddingVertical: rh(8),
            paddingHorizontal: rw(12), backgroundColor: isCheapest ? Colors.safeBg : Colors.surfaceAlt,
            borderRadius: rr(10), marginBottom: rh(7),
            borderWidth: isCheapest ? 1 : 0, borderColor: Colors.safeBorder,
          }}>
            <Text style={{ fontSize: rf(13), fontWeight: '600', color: Colors.textPrimary }}>{store.name}</Text>
            <Text style={{ fontSize: rf(14), fontWeight: '800', color: isCheapest ? Colors.safe : Colors.textSecondary }}>{store.price}</Text>
          </Animated.View>
        );
      })}
      <Animated.View style={{ opacity: badgeFade, alignSelf: 'center', marginTop: rh(4) }}>
        <Text style={{ fontSize: rf(11), fontWeight: '700', color: Colors.safe }}>✓ Best price nearby</Text>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// BEAT 4 — Save & find alternatives
// ─────────────────────────────────────────────────────────────────
function SaveBeat() {
  const { rw, rf, rh, rr } = useResponsive();
  const heart = useRef(new Animated.Value(0)).current;
  const chip = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(heart, { toValue: 1, tension: 160, friction: 6, useNativeDriver: true }),
      Animated.timing(chip, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.View style={{
        width: rw(76), height: rw(76), borderRadius: rr(38), backgroundColor: Colors.dangerBg,
        alignItems: 'center', justifyContent: 'center', transform: [{ scale: heart }], marginBottom: rh(14),
      }}>
        <Text style={{ fontSize: rf(34) }}>❤️</Text>
      </Animated.View>
      <Animated.View style={{
        opacity: chip, flexDirection: 'row', alignItems: 'center', gap: rw(6),
        backgroundColor: Colors.accentBg, borderRadius: rr(10), paddingVertical: rh(8), paddingHorizontal: rw(12),
      }}>
        <Text style={{ fontSize: rf(12) }}>✨</Text>
        <Text style={{ fontSize: rf(12), fontWeight: '700', color: Colors.navyMid }}>3 healthier alternatives found</Text>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// MODAL — drives autoplay + story-style progress bar
// ─────────────────────────────────────────────────────────────────

const BEATS: { captionKey: string; Beat: React.ComponentType }[] = [
  { captionKey: 'appTour.beats.scan',  Beat: ScanBeat },
  { captionKey: 'appTour.beats.score', Beat: ScoreBeat },
  { captionKey: 'appTour.beats.price', Beat: PriceBeat },
  { captionKey: 'appTour.beats.save',  Beat: SaveBeat },
];

interface AnimatedTourModalProps {
  visible: boolean;
  onComplete: () => void;
}

export function AnimatedTourModal({ visible, onComplete }: AnimatedTourModalProps) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr } = useResponsive();
  const [beatIndex, setBeatIndex] = useState(0);
  const progressAnims = useRef(BEATS.map(() => new Animated.Value(0))).current;
  const activeTiming = useRef<Animated.CompositeAnimation | null>(null);

  // Reset to the first beat whenever the tour is closed, so reopening it
  // always starts from the top rather than resuming mid-way.
  useEffect(() => {
    if (visible) return;
    setBeatIndex(0);
    progressAnims.forEach(a => a.setValue(0));
  }, [visible]);

  // Drives autoplay: fills the current beat's progress bar over
  // BEAT_DURATION, then advances — this IS the "video plays itself"
  // mechanism, no timers needed beyond what Animated already runs.
  useEffect(() => {
    if (!visible) return;
    progressAnims.forEach((a, i) => a.setValue(i < beatIndex ? 1 : 0));
    const timing = Animated.timing(progressAnims[beatIndex], {
      toValue: 1, duration: BEAT_DURATION, easing: Easing.linear, useNativeDriver: false,
    });
    activeTiming.current = timing;
    timing.start(({ finished }) => {
      if (!finished) return; // stopped early by a manual tap — that path advances itself
      setBeatIndex(i => {
        if (i < BEATS.length - 1) return i + 1;
        onComplete();
        return i;
      });
    });
    return () => timing.stop();
  }, [visible, beatIndex]);

  const goNext = () => {
    activeTiming.current?.stop();
    if (beatIndex < BEATS.length - 1) setBeatIndex(i => i + 1);
    else onComplete();
  };
  const goPrev = () => {
    if (beatIndex === 0) return;
    activeTiming.current?.stop();
    setBeatIndex(i => i - 1);
  };

  const s = useMemo(() => StyleSheet.create({
    overlay:       { flex: 1, backgroundColor: 'rgba(7,8,13,0.85)', alignItems: 'center', justifyContent: 'center', padding: rw(20) },
    card:          { width: '100%', maxWidth: rw(360), backgroundColor: Colors.surface, borderRadius: rr(24), padding: rw(18), ...Shadow.cardMd },
    progressRow:   { flexDirection: 'row', gap: rw(5), marginBottom: rh(16) },
    progressTrack: { flex: 1, height: rh(3), borderRadius: rr(2), backgroundColor: Colors.border, overflow: 'hidden' },
    progressFill:  { height: '100%', backgroundColor: Colors.navy, borderRadius: rr(2) },
    closeBtn:      { position: 'absolute', top: rw(14), right: rw(14), zIndex: 10, width: rw(28), height: rw(28), borderRadius: rr(14), backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
    closeText:     { fontSize: rf(14), fontWeight: '700', color: Colors.textMuted },
    stage:         { height: rh(210), borderRadius: rr(18), backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    caption:       { fontSize: rf(17), fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginTop: rh(16) },
  }), [rw, rh, rf, rr]);

  const ActiveBeat = BEATS[beatIndex].Beat;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="overFullScreen" transparent>
      <SafeAreaProvider>
        <View style={s.overlay}>
          <SafeAreaView style={{ width: '100%', alignItems: 'center' }}>
            <View style={s.card}>

              {/* Story-style progress bar — one segment per beat, the active
                  one fills in real time so it visibly plays like a video. */}
              <View style={s.progressRow}>
                {BEATS.map((_, i) => (
                  <View key={i} style={s.progressTrack}>
                    <Animated.View style={[s.progressFill, {
                      width: progressAnims[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                    }]} />
                  </View>
                ))}
              </View>

              <TouchableOpacity style={s.closeBtn} onPress={onComplete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={s.closeText}>✕</Text>
              </TouchableOpacity>

              <View style={s.stage}>
                <ActiveBeat key={beatIndex} />
                {/* Tap left half = back a beat, right half = skip ahead —
                    same convention as Instagram/Snapchat Stories. */}
                <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                  <View style={{ flexDirection: 'row', flex: 1 }}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={goPrev} />
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={goNext} />
                  </View>
                </View>
              </View>

              <Text style={s.caption}>{t(BEATS[beatIndex].captionKey)}</Text>
            </View>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
