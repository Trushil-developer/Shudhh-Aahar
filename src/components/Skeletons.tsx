// src/components/Skeletons.tsx
// Animated skeleton screens shown while data loads

import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Colors } from '../theme/medical';
import { useResponsive } from '../utils/responsive';

function SkeletonBox({ w, h, radius = 8, style }: {
  w: number | string; h: number; radius?: number; style?: any;
}) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { width: w, height: h, borderRadius: radius, backgroundColor: Colors.surfaceAlt, opacity },
        style,
      ]}
    />
  );
}

/** Shared, live-reactive skeleton styles — recomputed from current window size. */
function useSkeletonStyles() {
  const { rw, rh, rr, rStyles } = useResponsive();
  return useMemo(() => StyleSheet.create({
    container: { padding: rStyles.space.lg, gap: rw(10) },
    headerSkeleton: {
      flexDirection: 'row', gap: rStyles.space.lg, padding: rStyles.space.xl,
    },
    headerTextSkeleton: { flex: 1, justifyContent: 'center' },
    tabsSkeleton: {
      flexDirection: 'row', gap: rStyles.space.sm, paddingHorizontal: rStyles.space.xl, paddingBottom: rStyles.space.md,
    },
    contentSkeleton: { paddingHorizontal: rStyles.space.lg },
    historyCard: {
      flexDirection: 'row', backgroundColor: Colors.surface,
      borderRadius: rr(14), borderWidth: 1, borderColor: Colors.border,
      overflow: 'hidden', marginBottom: rh(10),
    },
    aiCard: {
      backgroundColor: Colors.surface, borderRadius: rStyles.radius.lg, padding: rStyles.space.lg,
      borderWidth: 1, borderColor: Colors.border,
    },
  }), [rw, rh, rr, rStyles]);
}

// Product screen skeleton
export function ProductSkeleton() {
  const { rw, rh, rr } = useResponsive();
  const styles = useSkeletonStyles();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerSkeleton}>
        <SkeletonBox w={rw(80)} h={rh(80)} radius={rr(14)} />
        <View style={styles.headerTextSkeleton}>
          <SkeletonBox w={rw(80)} h={rh(12)} radius={rr(6)} style={{ marginBottom: rh(8) }} />
          <SkeletonBox w={rw(160)} h={rh(18)} radius={rr(6)} style={{ marginBottom: rh(8) }} />
          <SkeletonBox w={rw(60)} h={rh(12)} radius={rr(6)} />
        </View>
      </View>
      {/* Tabs */}
      <View style={styles.tabsSkeleton}>
        {[80, 90, 80, 70, 60].map((w, i) => (
          <SkeletonBox key={i} w={rw(w)} h={rh(32)} radius={rr(8)} />
        ))}
      </View>
      {/* Content blocks */}
      <View style={styles.contentSkeleton}>
        <SkeletonBox w="100%" h={rh(120)} radius={rr(16)} style={{ marginBottom: rh(12) }} />
        <SkeletonBox w="100%" h={rh(80)} radius={rr(16)} style={{ marginBottom: rh(12) }} />
        <SkeletonBox w="100%" h={rh(100)} radius={rr(16)} />
      </View>
    </View>
  );
}

// History list skeleton
export function HistorySkeleton() {
  const { rw, rh, rr } = useResponsive();
  const styles = useSkeletonStyles();

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.historyCard}>
          <SkeletonBox w={rw(4)} h={rh(70)} radius={rr(2)} />
          <View style={{ flex: 1, padding: rw(14), gap: rw(8) }}>
            <SkeletonBox w={rw(80)} h={rh(10)} radius={rr(5)} />
            <SkeletonBox w={rw(180)} h={rh(16)} radius={rr(6)} />
            <SkeletonBox w={rw(140)} h={rh(10)} radius={rr(5)} />
          </View>
        </View>
      ))}
    </View>
  );
}

// AI analysis skeleton
export function AISkeleton() {
  const { rw, rh, rr } = useResponsive();
  const styles = useSkeletonStyles();

  return (
    <View style={{ gap: rw(12) }}>
      <View style={styles.aiCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: rh(14) }}>
          <SkeletonBox w={rw(120)} h={rh(36)} radius={rr(18)} />
          <SkeletonBox w={rw(60)} h={rh(36)} radius={rr(8)} />
        </View>
        <SkeletonBox w="100%" h={rh(6)} radius={rr(3)} style={{ marginBottom: rh(14) }} />
        <SkeletonBox w="100%" h={rh(14)} radius={rr(6)} style={{ marginBottom: rh(6) }} />
        <SkeletonBox w="80%" h={rh(14)} radius={rr(6)} />
      </View>
      <SkeletonBox w="100%" h={rh(100)} radius={rr(16)} />
      <SkeletonBox w="100%" h={rh(80)} radius={rr(16)} />
    </View>
  );
}
