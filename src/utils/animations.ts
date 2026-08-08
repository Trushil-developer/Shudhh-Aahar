// src/utils/animations.ts
// Centralised animation library for Shuddhaahar
// Uses React Native's built-in Animated API — no extra deps needed
// Every animation is reusable, composable and performance-safe (useNativeDriver where possible)

import { useRef, useEffect, useCallback } from 'react';
import { Animated, Easing, useWindowDimensions } from 'react-native';

// ── Timing presets ──────────────────────────────────────────
export const DURATION = {
  instant:  100,
  fast:     200,
  normal:   300,
  slow:     500,
  verySlow: 800,
};

export const EASING = {
  smooth:   Easing.bezier(0.25, 0.1, 0.25, 1),
  spring:   Easing.bezier(0.34, 1.56, 0.64, 1),
  ease_in:  Easing.bezier(0.42, 0, 1, 1),
  ease_out: Easing.bezier(0, 0, 0.58, 1),
  linear:   Easing.linear,
};

// ── 1. Fade in ──────────────────────────────────────────────
export function useFadeIn(delay = 0, duration = DURATION.normal) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1, duration, delay,
      easing: EASING.smooth, useNativeDriver: true,
    }).start();
  }, []);
  return { opacity };
}

// ── 2. Slide up (modal / screen entrance) ───────────────────
export function useSlideUp(delay = 0, distance = 40, duration = DURATION.normal) {
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration, delay, easing: EASING.smooth, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration, delay, easing: EASING.smooth, useNativeDriver: true }),
    ]).start();
  }, []);
  return { opacity, translateY };
}

// ── 3. Staggered list entrance ──────────────────────────────
export function useStagger(count: number, staggerDelay = 60, baseDelay = 0) {
  const values = useRef(
    Array.from({ length: count }, () => ({
      opacity:    new Animated.Value(0),
      translateY: new Animated.Value(20),
    }))
  ).current;

  useEffect(() => {
    const animations = values.map((v, i) =>
      Animated.parallel([
        Animated.timing(v.opacity,    { toValue: 1, duration: DURATION.normal, delay: baseDelay + i * staggerDelay, easing: EASING.smooth, useNativeDriver: true }),
        Animated.timing(v.translateY, { toValue: 0, duration: DURATION.normal, delay: baseDelay + i * staggerDelay, easing: EASING.smooth, useNativeDriver: true }),
      ])
    );
    Animated.parallel(animations).start();
  }, []);

  return values;
}

// ── 4. Score bar fill ───────────────────────────────────────
export function useScoreBar(targetPercent: number, delay = 300) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: targetPercent,
      duration: DURATION.slow,
      delay,
      easing: EASING.ease_out,
      useNativeDriver: false, // width can't use native driver
    }).start();
  }, [targetPercent]);
  return width;
}

// ── 5. Number count-up ──────────────────────────────────────
export function useCountUp(target: number, duration = DURATION.slow, delay = 200) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(value, {
      toValue: target, duration, delay,
      easing: EASING.ease_out, useNativeDriver: false,
    }).start();
  }, [target]);
  return value;
}

// ── 6. Pulse animation (scanner line, loading) ──────────────
export function usePulse(minOpacity = 0.4, maxOpacity = 1.0, duration = 900) {
  const opacity = useRef(new Animated.Value(minOpacity)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: maxOpacity, duration, easing: EASING.smooth, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: minOpacity, duration, easing: EASING.smooth, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return opacity;
}

// ── 7. Shake (validation error) ────────────────────────────
export function useShake() {
  const translateX = useRef(new Animated.Value(0)).current;
  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(translateX, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(translateX, { toValue:  8, duration: 60, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(translateX, { toValue:  6, duration: 60, useNativeDriver: true }),
      Animated.timing(translateX, { toValue:  0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, []);
  return { translateX, shake };
}

// ── 8. Scale press (button feedback) ────────────────────────
export function useScalePress(scaleDown = 0.96) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn  = () => Animated.timing(scale, { toValue: scaleDown, duration: DURATION.instant, useNativeDriver: true }).start();
  const onPressOut = () => Animated.timing(scale, { toValue: 1, duration: DURATION.fast, easing: EASING.spring, useNativeDriver: true }).start();
  return { scale, onPressIn, onPressOut };
}

// ── 9. Scan line (barcode scanner) ──────────────────────────
export function useScanLine(frameHeight = 140) {
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, { toValue: frameHeight, duration: 1800, easing: EASING.linear, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0,           duration: 1800, easing: EASING.linear, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return translateY;
}

// ── 10. Spring pop (success state, check marks) ─────────────
export function useSpringPop(trigger: boolean) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (trigger) {
      Animated.spring(scale, {
        toValue: 1, tension: 120, friction: 6, useNativeDriver: true,
      }).start();
    } else {
      scale.setValue(0);
    }
  }, [trigger]);
  return scale;
}

// ── 11. Tab bar indicator slide ──────────────────────────────
export function useTabSlide(tabIndex: number, tabCount: number) {
  const { width } = useWindowDimensions();
  const tabW = width / tabCount;
  const translateX = useRef(new Animated.Value(tabIndex * tabW)).current;

  // Keep the indicator aligned if the window width changes (rotation, split-screen)
  useEffect(() => {
    translateX.setValue(tabIndex * tabW);
  }, [tabW]);

  const slideTo = useCallback((index: number) => {
    Animated.timing(translateX, {
      toValue: index * tabW, duration: DURATION.fast,
      easing: EASING.smooth, useNativeDriver: true,
    }).start();
  }, [tabW]);
  return { translateX, slideTo, tabW };
}

// ── 12. Skeleton shimmer ─────────────────────────────────────
export function useShimmer() {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1, duration: 1200, easing: EASING.linear, useNativeDriver: false,
      })
    );
    anim.start();
    return () => anim.stop();
  }, []);
  const shimmerInterp = shimmer.interpolate({
    inputRange:  [0, 0.5, 1],
    outputRange: ['#E8EDF5', '#D0D8E8', '#E8EDF5'],
  });
  return shimmerInterp;
}

// ── 13. Page transition (slide from right) ───────────────────
export function usePageTransition(direction: 'in' | 'out' = 'in') {
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(direction === 'in' ? width : 0)).current;
  const opacity    = useRef(new Animated.Value(direction === 'in' ? 0 : 1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: direction === 'in' ? 0 : -width * 0.3, duration: DURATION.normal, easing: EASING.smooth, useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: direction === 'in' ? 1 : 0,             duration: DURATION.normal, easing: EASING.smooth, useNativeDriver: true }),
    ]).start();
  }, []);
  return { translateX, opacity };
}

// ── 14. Floating label (form input) ─────────────────────────
export function useFloatingLabel(hasValue: boolean) {
  const translateY = useRef(new Animated.Value(hasValue ? -20 : 0)).current;
  const scale      = useRef(new Animated.Value(hasValue ? 0.8 : 1)).current;
  const animate = (up: boolean) => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: up ? -20 : 0, duration: DURATION.fast, easing: EASING.smooth, useNativeDriver: true }),
      Animated.timing(scale,      { toValue: up ? 0.8 : 1, duration: DURATION.fast, easing: EASING.smooth, useNativeDriver: true }),
    ]).start();
  };
  return { translateY, scale, animate };
}
