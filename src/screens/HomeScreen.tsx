import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, StatusBar, Modal, ActivityIndicator, Image,
  Animated, PanResponder,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { Colors } from '../theme/medical';
import { useAuth } from '../context/AuthContext';
import { graphqlRequest, deleteScanHistory } from '../services/userDataService';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';
import HealthProfileScreen from './HealthProfileScreen';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface ScanRecord {
  id: string;
  barcode: string;
  productName: string;
  brand: string;
  image?: string;
  scannedAt: string;
  warnings: string[];
}

const LIST_RECENT = `
  query ListScanHistories($filter: ModelScanHistoryFilterInput, $limit: Int) {
    listScanHistories(filter: $filter, limit: $limit) {
      items { id barcode productName brand image scannedAt warnings }
    }
  }
`;

function timeAgo(iso: string, t: (key: string, options?: Record<string, any>) => string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return t('home.justNow');
  if (mins < 60) return t('home.minutesAgo', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return t('home.hoursAgo', { count: hrs });
  return t('home.daysAgo', { count: Math.floor(hrs / 24) });
}

function getGreeting(t: (key: string, options?: Record<string, any>) => string) {
  const h = new Date().getHours();
  return h < 12 ? t('home.greetingMorning') : h < 17 ? t('home.greetingAfternoon') : t('home.greetingEvening');
}

// Swipe-left-to-delete row. Built with Animated + PanResponder (no gesture
// library in this project) — swiping reveals a Delete button underneath.
// Receives `styles`, `rf`, and `deleteWidth` from the parent HomeScreen (which
// owns the live useResponsive() values) rather than importing static scale
// functions itself.
function RecentScanRow({ scan, isLast, onPress, onDelete, styles, rf, deleteWidth }: {
  scan: ScanRecord; isLast: boolean; onPress: () => void; onDelete: () => Promise<boolean>;
  styles: any; rf: (n: number) => number; deleteWidth: number;
}) {
  const DELETE_WIDTH = deleteWidth;
  const s = styles;
  // `pan` drives the drag on the JS thread. It must stay JS-driven (not
  // native) throughout: React Native's Animated.event(...) only returns a
  // plain callable function when useNativeDriver is false — with true, it
  // returns the AnimatedEvent instance itself (not callable), which is what
  // was crashing PanResponder ("... is not a function") when it tried to
  // invoke onPanResponderMove directly. Mixing native- and JS-driven
  // animations on the same Animated.Value also isn't supported, so
  // setOffset/setValue below and the spring/timing calls later all need to
  // agree on useNativeDriver: false too.
  const { t } = useTranslation();
  const pan = useRef(new Animated.Value(0)).current;
  const open = useRef(false);
  // React Native's Animated still invokes the completion callback on an
  // interrupted animation, so two taps within the ~150ms swipe-out window
  // can fire onDelete twice concurrently for the same row. Guard with an
  // in-flight ref (reset only on failure — the row unmounts on success, so
  // there's nothing to reset then) so the second tap is a no-op.
  const deletingRef = useRef(false);

  const translateX = pan.interpolate({
    inputRange: [-DELETE_WIDTH, 0],
    outputRange: [-DELETE_WIDTH, 0],
    extrapolate: 'clamp',
  });

  const panEvent = useRef(Animated.event([null, { dx: pan }], { useNativeDriver: false })).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        pan.setOffset(open.current ? -DELETE_WIDTH : 0);
        pan.setValue(0);
      },
      onPanResponderMove: panEvent,
      onPanResponderRelease: (_, g) => {
        pan.flattenOffset();
        const base = open.current ? -DELETE_WIDTH : 0;
        const endValue = base + g.dx;
        const shouldOpen = endValue < -DELETE_WIDTH / 2;
        open.current = shouldOpen;
        Animated.spring(pan, { toValue: shouldOpen ? -DELETE_WIDTH : 0, useNativeDriver: false, bounciness: 0 }).start();
      },
    }),
  ).current;

  const handleDelete = () => {
    if (deletingRef.current) return; // already deleting this row, ignore repeat tap
    deletingRef.current = true;
    Animated.timing(pan, { toValue: -400, duration: 150, useNativeDriver: false }).start(() => {
      onDelete().then(ok => {
        // On success the row unmounts (parent removes it from the list), so
        // there's nothing left to reset. On failure the row sticks around
        // (rolled back), so allow another delete attempt.
        if (!ok) deletingRef.current = false;
      });
    });
  };

  const safe = !scan.warnings?.length;

  return (
    <View style={[s.swipeContainer, !isLast && s.scanRowBorder]}>
      <View style={s.deleteAction}>
        <TouchableOpacity style={s.deleteActionBtn} onPress={handleDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.deleteActionText}>✕{'\n'}{t('common.delete')}</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={[s.scanRow, { backgroundColor: Colors.surface, transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        <TouchableOpacity style={s.scanRowTouchable} onPress={onPress} activeOpacity={0.75}>
          {scan.image ? (
            <Image source={{ uri: scan.image }} style={s.scanThumb} resizeMode="contain" />
          ) : (
            <View style={s.scanThumbPlaceholder}><Text style={{ fontSize: rf(16) }}>📦</Text></View>
          )}
          <View style={[s.dot, safe ? s.dotSafe : s.dotWarn]} />
          <View style={s.scanInfo}>
            <Text style={s.scanName} numberOfLines={1}>{scan.productName || scan.barcode}</Text>
            {scan.brand ? <Text style={s.scanBrand}>{scan.brand}</Text> : null}
          </View>
          <Text style={s.scanTime}>{timeAgo(scan.scannedAt, t)}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { user }   = useAuth();
  const { rw, rh, rf, rr, isTablet } = useResponsive();
  const DELETE_WIDTH = rw(76);

  const [showHealthProfile, setShowHealthProfile] = useState(false);
  const [recentScans, setRecentScans]             = useState<ScanRecord[]>([]);
  const [loadingScans, setLoadingScans]           = useState(true);

  const firstName = user?.name?.split(' ')[0] || t('home.defaultName');

  const s = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    scroll:    { paddingHorizontal: rw(20), paddingBottom: rh(40), ...(isTablet ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center' as const, width: '100%' as const } : null) },

    // Header
    header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: rh(20), marginBottom: rh(24) },
    greeting:  { fontSize: rf(13), color: Colors.textMuted, fontWeight: '500', marginBottom: rh(2) },
    name:      { fontSize: rf(26), fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
    avatar:    { width: rw(44), height: rw(44), borderRadius: rw(22), backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center' },
    avatarTxt: { color: '#FFF', fontWeight: '700', fontSize: rf(17) },

    // Hero scan card
    hero:        { backgroundColor: Colors.navy, borderRadius: rr(22), paddingHorizontal: rw(20), paddingVertical: rh(24), flexDirection: 'row', alignItems: 'center', marginBottom: rh(16), shadowColor: Colors.navy, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8 },
    heroLeft:    { flex: 1 },
    heroIconWrap:{ width: rw(48), height: rw(48), borderRadius: rr(14), backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center', marginBottom: rh(14) },
    heroIcon:    { fontSize: rf(24) },
    heroTitle:   { fontSize: rf(20), fontWeight: '800', color: '#FFF', marginBottom: rh(5), letterSpacing: -0.3 },
    heroSub:     { fontSize: rf(13), color: 'rgba(255,255,255,0.6)', lineHeight: rh(18) },
    heroBadge:   { width: rw(36), height: rw(36), borderRadius: rw(18), backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginLeft: rw(12) },
    heroBadgeTxt:{ fontSize: rf(22), color: '#FFF', marginTop: -rh(2) },

    // Health profile card
    healthProfileCard:  { flexDirection: 'row', alignItems: 'center', gap: rw(14), backgroundColor: Colors.navyLight, borderRadius: rr(18), padding: rw(18), marginBottom: rh(16), borderWidth: 1, borderColor: Colors.navy + '25' },
    healthProfileIcon:  { width: rw(44), height: rw(44), borderRadius: rr(13), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
    healthProfileTitle: { fontSize: rf(15), fontWeight: '700', color: Colors.navy },
    healthProfileSub:   { fontSize: rf(12), color: Colors.textSecondary, marginTop: rh(2) },
    healthProfileArrow: { fontSize: rf(22), color: Colors.navy, opacity: 0.4 },

    // Section title
    sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rh(10) },
    sectionTitle: { fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary },
    viewAllTxt:   { fontSize: rf(13), fontWeight: '600', color: Colors.navyMid },

    // Scans card
    scansCard:    { backgroundColor: Colors.surface, borderRadius: rr(18), borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    swipeContainer: { overflow: 'hidden' },
    scanRow:      { width: '100%' },
    scanRowTouchable: { flexDirection: 'row', alignItems: 'center', paddingVertical: rh(14), paddingHorizontal: rw(16), gap: rw(12) },
    scanRowBorder:{ borderBottomWidth: 1, borderBottomColor: Colors.border },
    deleteAction: { position: 'absolute', right: 0, top: 0, bottom: 0, width: DELETE_WIDTH, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center' },
    deleteActionBtn: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
    deleteActionText: { color: '#FFF', fontSize: rf(11), fontWeight: '700', textAlign: 'center', lineHeight: rf(16) },
    scanThumb:    { width: rw(36), height: rw(36), borderRadius: rr(8), backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, flexShrink: 0 },
    scanThumbPlaceholder: { width: rw(36), height: rw(36), borderRadius: rr(8), backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    dot:          { width: rw(9), height: rw(9), borderRadius: rw(5), flexShrink: 0 },
    dotSafe:      { backgroundColor: Colors.safe },
    dotWarn:      { backgroundColor: Colors.caution },
    scanInfo:     { flex: 1 },
    scanName:     { fontSize: rf(14), fontWeight: '600', color: Colors.textPrimary },
    scanBrand:    { fontSize: rf(12), color: Colors.textSecondary, marginTop: rh(2) },
    scanTime:     { fontSize: rf(12), color: Colors.textMuted },

    // Empty state
    emptyState:   { paddingVertical: rh(36), alignItems: 'center' },
    emptyIcon:    { fontSize: rf(30), marginBottom: rh(10) },
    emptyTitle:   { fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(4) },
    emptySub:     { fontSize: rf(13), color: Colors.textMuted, textAlign: 'center', paddingHorizontal: rw(20) },
  }), [rw, rh, rf, rr, isTablet]);

  useFocusEffect(useCallback(() => {
    if (!user) return;

    // Load recent scans. The byUserId GSI has no sort key, so DynamoDB
    // doesn't return these in chronological order — fetch a larger batch
    // and sort/slice client-side to get the actual 5 most recent.
    setLoadingScans(true);
    graphqlRequest(LIST_RECENT, { filter: { userId: { eq: user.id } }, limit: 50 }).then((data: any) => {
      const items: ScanRecord[] = data.listScanHistories.items || [];
      items.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());
      setRecentScans(items.slice(0, 5));
    }).catch(() => {}).finally(() => setLoadingScans(false));
  }, [user]));

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>{getGreeting(t)}</Text>
            <Text style={s.name}>{firstName}</Text>
          </View>
          <TouchableOpacity style={s.avatar} onPress={() => setShowHealthProfile(true)} activeOpacity={0.8}>
            <Text style={s.avatarTxt}>{firstName[0].toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Scan hero ── */}
        <TouchableOpacity style={s.hero} onPress={() => navigation.navigate('Scan')} activeOpacity={0.9}>
          <View style={s.heroLeft}>
            <View style={s.heroIconWrap}>
              <Text style={s.heroIcon}>📷</Text>
            </View>
            <Text style={s.heroTitle}>{t('home.scanProduct')}</Text>
            <Text style={s.heroSub}>{t('home.scanProductSubtitle')}</Text>
          </View>
          <View style={s.heroBadge}>
            <Text style={s.heroBadgeTxt}>›</Text>
          </View>
        </TouchableOpacity>

        {/* TODO: Today's Activity (health stats) removed for now — re-add when ready */}

        {/* ── Health profile ── */}
        <TouchableOpacity style={s.healthProfileCard} onPress={() => setShowHealthProfile(true)} activeOpacity={0.85}>
          <View style={s.healthProfileIcon}>
            <Text style={{ fontSize: rf(20), color: Colors.danger, fontWeight: '700' }}>✚</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.healthProfileTitle}>{t('home.healthProfileTitle')}</Text>
            <Text style={s.healthProfileSub}>{t('home.healthProfileSubtitle')}</Text>
          </View>
          <Text style={s.healthProfileArrow}>›</Text>
        </TouchableOpacity>

        {/* ── Recent scans ── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>{t('home.recentScans')}</Text>
          {recentScans.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('History')} activeOpacity={0.7}>
              <Text style={s.viewAllTxt}>{t('home.viewAll')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.scansCard}>
          {loadingScans ? (
            <ActivityIndicator color={Colors.navy} style={{ paddingVertical: rh(24) }} />
          ) : recentScans.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>🔍</Text>
              <Text style={s.emptyTitle}>{t('home.noScansYet')}</Text>
              <Text style={s.emptySub}>{t('home.noScansSubtitle', { action: t('home.scanProduct') })}</Text>
            </View>
          ) : (
            recentScans.map((scan, i) => (
              <RecentScanRow
                key={scan.id}
                scan={scan}
                isLast={i === recentScans.length - 1}
                styles={s}
                rf={rf}
                deleteWidth={DELETE_WIDTH}
                onPress={() => navigation.navigate('Product', { barcode: scan.barcode })}
                onDelete={async () => {
                  setRecentScans(list => list.filter(x => x.id !== scan.id));
                  const ok = await deleteScanHistory(scan.id);
                  if (!ok) setRecentScans(list => [...list, scan]); // roll back on failure
                  return ok;
                }}
              />
            ))
          )}
        </View>

      </ScrollView>

      <Modal visible={showHealthProfile} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaProvider>
          <HealthProfileScreen onComplete={() => setShowHealthProfile(false)} />
        </SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}
