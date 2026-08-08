// src/components/ErrorBoundary.tsx
import React, { Component, ReactNode, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Colors } from '../theme/medical';
import { useResponsive } from '../utils/responsive';

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

// Extracted so it can use the useResponsive() and useTranslation() hooks
// (class components can't call hooks directly).
function ErrorFallback({ errorMessage, onRetry }: { errorMessage?: string; onRetry: () => void }) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr, rStyles } = useResponsive();
  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rStyles.space.xxxl },
    icon: { fontSize: rf(56), marginBottom: rStyles.space.xl },
    title: { color: Colors.textPrimary, fontSize: rf(22), fontWeight: '800', marginBottom: rStyles.space.md, textAlign: 'center' },
    subtitle: { color: Colors.textSecondary, fontSize: rStyles.text.md, textAlign: 'center', lineHeight: rh(24), marginBottom: rw(28) },
    errorBox: {
      backgroundColor: Colors.dangerBg, borderRadius: rr(10), padding: rw(14),
      borderWidth: 1, borderColor: Colors.dangerBorder, marginBottom: rStyles.space.xxl, width: '100%',
    },
    errorText: { color: Colors.danger, fontSize: rStyles.text.sm, fontFamily: 'monospace' },
    retryBtn: {
      backgroundColor: Colors.navy, borderRadius: rr(14),
      paddingHorizontal: rStyles.space.xxxl, paddingVertical: rStyles.space.lg,
    },
    retryText: { color: '#FFF', fontWeight: '700', fontSize: rf(16) },
  }), [rw, rh, rf, rr, rStyles]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>😵</Text>
        <Text style={styles.title}>{t('errorBoundary.title')}</Text>
        <Text style={styles.subtitle}>
          {t('errorBoundary.subtitle')}
        </Text>
        {__DEV__ && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>{t('common.tryAgain')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('App crashed:', error, info);
    // In production: send to crash reporting (e.g. Sentry)
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          errorMessage={this.state.error?.message}
          onRetry={() => this.setState({ hasError: false })}
        />
      );
    }
    return this.props.children;
  }
}
