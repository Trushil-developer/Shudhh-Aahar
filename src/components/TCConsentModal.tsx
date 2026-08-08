// src/components/TCConsentModal.tsx
// Blocking T&C acceptance modal
//
// Design principles:
//  • Full-screen — cannot be dismissed by tapping outside or back button
//  • User MUST scroll to the bottom before Accept button activates
//  • Scroll progress bar shows how far through the T&C they are
//  • Shows what changed (for updates) vs full text (for new users)
//  • "Decline" exits the app — user cannot use it without accepting
//  • All acceptance is timestamped and recorded server-side

import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
  BackHandler, ActivityIndicator, Alert,
  Animated, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { TCVersion, recordTCAcceptance } from '../services/tcService';
import { Colors, Shadow } from '../theme/medical';
import { useSpringPop } from '../utils/animations';
import { useResponsive } from '../utils/responsive';

interface Props {
  visible: boolean;
  version: TCVersion;
  isUpdate: boolean;          // true = update, false = first time
  acceptedVersion: string | null;
  userId: string;
  onAccepted: () => void;     // called after successful acceptance
}

export default function TCConsentModal({
  visible, version, isUpdate, acceptedVersion, userId, onAccepted,
}: Props) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr, rStyles, isTablet } = useResponsive();
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const acceptScale  = useSpringPop(scrolledToBottom);

  const styles = useMemo(() => StyleSheet.create({
    // Outer wrapper centers the capped-width content on tablets so the
    // modal doesn't stretch full-bleed edge-to-edge on a large screen.
    modalOuter:     { flex: 1, backgroundColor: Colors.bg, alignItems: 'center' },
    container:      { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: isTablet ? rw(500) : undefined },

    // Header
    header:         { flexDirection: 'row', alignItems: 'flex-start', gap: rStyles.space.md, backgroundColor: Colors.surface, paddingHorizontal: rStyles.space.xl, paddingVertical: rStyles.space.lg, borderBottomWidth: 1, borderColor: Colors.border },
    headerIcon:     { width: rw(44), height: rh(44), backgroundColor: Colors.navy, borderRadius: rStyles.radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: rw(2) },
    headerIconText: { color: '#FFF', fontSize: rf(22), fontWeight: '700' },
    headerBadge:    { fontSize: rf(9), fontWeight: '800', color: Colors.navyMid, letterSpacing: 1.5, marginBottom: rw(3), fontFamily: 'monospace' },
    headerTitle:    { fontSize: rf(18), fontWeight: '800', color: Colors.textPrimary, marginBottom: rw(3) },
    headerSub:      { fontSize: rStyles.text.sm, color: Colors.textMuted, lineHeight: rh(17) },

    // Progress
    progressTrack:     { height: rh(4), backgroundColor: Colors.border, marginHorizontal: 0 },
    progressFill:      { height: rh(4) },
    progressLabelRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: rStyles.space.lg, paddingVertical: rw(6), backgroundColor: Colors.navyLight, borderBottomWidth: 1, borderColor: Colors.border },
    progressLabel:     { fontSize: rf(11), color: Colors.textMuted, fontWeight: '500' },

    // What changed
    changesCard:    { margin: rStyles.space.md, backgroundColor: Colors.infoBg, borderRadius: rr(10), borderWidth: 1, borderColor: Colors.infoBorder, padding: rw(14) },
    changesTitle:   { fontSize: rf(13), fontWeight: '700', color: Colors.info, marginBottom: rw(10) },
    changeRow:      { flexDirection: 'row', gap: rStyles.space.sm, marginBottom: rw(6) },
    changeBullet:   { color: Colors.info, fontWeight: '700', fontSize: rf(14), marginTop: rw(1) },
    changeText:     { flex: 1, fontSize: rf(13), color: Colors.info, lineHeight: rh(19) },
    changesFooter:  { fontSize: rf(11), color: Colors.textMuted, marginTop: rStyles.space.sm, fontStyle: 'italic' },

    // T&C scroll area
    scrollArea:     { flex: 1 },
    scrollContent:  { padding: rStyles.space.xl, paddingBottom: rStyles.space.xxxl },
    versionBadge:   { fontSize: rStyles.text.xs, color: Colors.textMuted, fontFamily: 'monospace', letterSpacing: 0.5, marginBottom: rStyles.space.md },
    summaryCard:    { backgroundColor: Colors.navyLight, borderRadius: rr(10), borderWidth: 1, borderColor: Colors.border, padding: rStyles.space.md, marginBottom: rStyles.space.lg },
    summaryText:    { fontSize: rf(13), color: Colors.navyMid, fontWeight: '600', lineHeight: rh(20) },
    tcText:         { fontSize: rf(13), color: Colors.textSecondary, lineHeight: rh(23), letterSpacing: 0.1 },
    bottomAnchor:   { marginTop: rStyles.space.xxl },
    readConfirm:    { backgroundColor: Colors.surfaceAlt, borderRadius: rr(10), borderWidth: 1, borderColor: Colors.border, padding: rw(14), alignItems: 'center' },
    readConfirmDone:{ backgroundColor: Colors.safeBg, borderColor: Colors.safeBorder },
    readConfirmText:{ fontSize: rf(13), color: Colors.textMuted, fontWeight: '600' },

    // Footer
    footer:         { backgroundColor: Colors.surface, borderTopWidth: 1, borderColor: Colors.border, padding: rStyles.space.lg, gap: rw(10) },
    footerNote:     { fontSize: rf(11), color: Colors.textMuted, textAlign: 'center', lineHeight: rh(17) },
    acceptBtn:      { backgroundColor: Colors.navy, borderRadius: rr(14), paddingVertical: rw(15), paddingHorizontal: rStyles.space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rStyles.space.md, ...Shadow.cardMd },
    acceptBtnDisabled: { backgroundColor: Colors.border },
    acceptBtnIcon:  { fontSize: rStyles.text.xl, color: '#FFF', fontWeight: '800' },
    acceptBtnText:  { fontSize: rStyles.text.md, fontWeight: '800', color: '#FFF' },
    acceptBtnHint:  { fontSize: rf(11), color: 'rgba(255,255,255,0.55)', marginTop: rw(2) },
    declineBtn:     { alignItems: 'center', paddingVertical: rw(10) },
    declineBtnText: { fontSize: rf(13), color: Colors.danger, fontWeight: '600' },
  }), [rw, rh, rf, rr, rStyles, isTablet]);

  // Block Android hardware back button — cannot dismiss
  React.useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Swallow back press — T&C must be accepted
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const totalScrollable = contentSize.height - layoutMeasurement.height;
    if (totalScrollable <= 0) {
      setScrolledToBottom(true);
      setScrollPercent(100);
      return;
    }

    const pct = Math.min(100, Math.round((contentOffset.y / totalScrollable) * 100));
    setScrollPercent(pct);

    // Animate progress bar
    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 80,
      useNativeDriver: false,
    }).start();

    // Unlock accept button when within 20px of bottom
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 20) {
      setScrolledToBottom(true);
    }
  }, []);

  const handleAccept = async () => {
    if (!scrolledToBottom) return;
    setAccepting(true);
    await recordTCAcceptance(userId, version);
    setAccepting(false);
    onAccepted();
  };

  const handleDecline = () => {
    Alert.alert(
      t('tcConsent.alertTitle'),
      t('tcConsent.alertMessage'),
      [
        { text: t('tcConsent.alertReviewTerms'), style: 'cancel' },
        {
          text: t('tcConsent.alertCloseApp'),
          style: 'destructive',
          onPress: () => BackHandler.exitApp(),
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      // Cannot be dismissed — no onRequestClose that closes it
      onRequestClose={() => { /* blocked */ }}
    >
      {/* Modal presents in its own native window on iOS, so the app-root
          SafeAreaProvider can't measure insets for it — nest a fresh one
          here or SafeAreaView below silently falls back to zero insets. */}
      <SafeAreaProvider>
      <View style={styles.modalOuter}>
      <SafeAreaView style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Text style={styles.headerIconText}>✚</Text>
          </View>
          <View style={{ flex: 1 }}>
            {isUpdate ? (
              <>
                <Text style={styles.headerBadge}>{t('tcConsent.headerBadgeUpdated')}</Text>
                <Text style={styles.headerTitle}>{t('tcConsent.titleUpdated')}</Text>
                <Text style={styles.headerSub}>
                  {t('tcConsent.subtitleUpdated', { version: version.version })}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.headerBadge}>{t('tcConsent.headerBadgeRequired')}</Text>
                <Text style={styles.headerTitle}>{t('tcConsent.title')}</Text>
                <Text style={styles.headerSub}>
                  {t('tcConsent.subtitle')}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* ── Scroll progress bar ── */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
                backgroundColor: scrolledToBottom ? Colors.safe : Colors.navyMid,
              },
            ]}
          />
        </View>
        <View style={styles.progressLabelRow}>
          <Text style={styles.progressLabel}>
            {scrolledToBottom
              ? t('tcConsent.progressRead')
              : t('tcConsent.progressReading', { percent: scrollPercent })}
          </Text>
          <Text style={[styles.progressLabel, { color: scrolledToBottom ? Colors.safe : Colors.textMuted }]}>
            {scrollPercent}%
          </Text>
        </View>

        {/* ── What changed (update only) ── */}
        {isUpdate && version.changes.length > 0 && (
          <View style={styles.changesCard}>
            <Text style={styles.changesTitle}>
              {t('tcConsent.changesTitle', { version: acceptedVersion })}
            </Text>
            {version.changes.map((change, i) => (
              <View key={i} style={styles.changeRow}>
                <Text style={styles.changeBullet}>•</Text>
                <Text style={styles.changeText}>{change}</Text>
              </View>
            ))}
            <Text style={styles.changesFooter}>
              {t('tcConsent.changesFooter')}
            </Text>
          </View>
        )}

        {/* ── Scrollable T&C text ── */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={true}
          indicatorStyle="black"
        >
          <Text style={styles.versionBadge}>
            {t('tcConsent.versionPublished', {
              version: version.version,
              date: new Date(version.publishedAt).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
              }),
            })}
          </Text>

          {version.summary && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>{version.summary}</Text>
            </View>
          )}

          <Text style={styles.tcText}>{version.fullText}</Text>

          {/* Bottom anchor — spacer so user definitely reaches the end */}
          <View style={styles.bottomAnchor}>
            <View style={[styles.readConfirm, scrolledToBottom && styles.readConfirmDone]}>
              <Text style={[styles.readConfirmText, scrolledToBottom && { color: Colors.safe }]}>
                {scrolledToBottom ? t('tcConsent.readConfirmDone') : t('tcConsent.readConfirmPending')}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* ── Accept / Decline buttons ── */}
        <View style={styles.footer}>
          <Text style={styles.footerNote}>
            {t('tcConsent.footerNote')}
          </Text>

          {/* Accept button — springs in when scrolled to bottom */}
          <Animated.View style={{ transform: [{ scale: scrolledToBottom ? acceptScale : 1 }] }}>
            <TouchableOpacity
              style={[
                styles.acceptBtn,
                !scrolledToBottom && styles.acceptBtnDisabled,
              ]}
              onPress={handleAccept}
              disabled={!scrolledToBottom || accepting}
              activeOpacity={0.88}
            >
              {accepting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.acceptBtnIcon}>✓</Text>
                  <View>
                    <Text style={styles.acceptBtnText}>{t('tcConsent.acceptButton')}</Text>
                    {!scrolledToBottom && (
                      <Text style={styles.acceptBtnHint}>{t('tcConsent.acceptHint')}</Text>
                    )}
                  </View>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity style={styles.declineBtn} onPress={handleDecline}>
            <Text style={styles.declineBtnText}>{t('tcConsent.decline')}</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
      </View>
      </SafeAreaProvider>
    </Modal>
  );
}
