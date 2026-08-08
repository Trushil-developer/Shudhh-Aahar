// src/components/TabIcon.tsx
// Tab bar icon with a soft highlight pill that pops in behind the active tab.

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useResponsive } from '../utils/responsive';

type Props = {
  emoji: string;
  color: string;
  focused: boolean;
};

export function TabIcon({ emoji, color, focused }: Props) {
  const pop = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const { rw, rh, rStyles } = useResponsive();

  useEffect(() => {
    Animated.spring(pop, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 22, bounciness: 10 }).start();
  }, [focused]);

  const styles = useMemo(() => StyleSheet.create({
    wrap: {
      width: rw(44),
      height: rh(32),
      alignItems: 'center',
      justifyContent: 'center',
    },
    pill: {
      position: 'absolute',
      width: rw(44),
      height: rh(32),
      borderRadius: rStyles.radius.lg,
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    emoji: {
      fontSize: rStyles.text.xl,
    },
  }), [rw, rh, rStyles]);

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[styles.pill, { opacity: pop, transform: [{ scale: pop }] }]}
      />
      <Animated.Text
        style={[
          styles.emoji,
          { color, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] },
        ]}
      >
        {emoji}
      </Animated.Text>
    </View>
  );
}
