// src/components/OfflineBar.tsx
// Shows a banner when user has no internet connection

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTranslation } from 'react-i18next';
import { Colors } from '../theme/medical';
import { useResponsive } from '../utils/responsive';

export function OfflineBar() {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = useState(new Animated.Value(-50))[0];
  const { rh, rStyles } = useResponsive();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable (actual internet access) is the correct signal
      // here, not isConnected (link-layer only — stays true on a Wi-Fi
      // network with no working internet, e.g. dead router/captive portal).
      // NetInfo can report isInternetReachable as null while it's still
      // determining status (e.g. right after app start) — treat that as
      // "not offline" so the bar doesn't flash on every launch; it will
      // update to a real true/false shortly after.
      const offline = state.isInternetReachable === null ? false : !state.isInternetReachable;
      setIsOffline(offline);
      Animated.timing(slideAnim, {
        toValue: offline ? 0 : -50,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
    return () => unsubscribe();
  }, []);

  const styles = useMemo(() => StyleSheet.create({
    bar: {
      backgroundColor: Colors.cautionBg,
      paddingVertical: rh(10),
      paddingHorizontal: rStyles.space.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rStyles.space.sm,
      borderBottomWidth: 1,
      borderColor: Colors.cautionBorder,
    },
    icon: { fontSize: rStyles.text.base },
    text: { color: Colors.caution, fontSize: rStyles.text.sm, flex: 1, fontWeight: '500' },
  }), [rh, rStyles]);

  if (!isOffline) return null;

  return (
    <Animated.View style={[styles.bar, { transform: [{ translateY: slideAnim }] }]}>
      <Text style={styles.icon}>📡</Text>
      <Text style={styles.text}>{t('offlineBar.noConnection')}</Text>
    </Animated.View>
  );
}
