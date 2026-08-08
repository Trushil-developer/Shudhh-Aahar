// src/screens/HistoryScreen.tsx — Medical redesign
import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, StatusBar, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { graphqlRequest, deleteScanHistory } from '../services/userDataService';
import { RootStackParamList } from '../../App';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive } from '../utils/responsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ScanRecord {
  id: string; barcode: string; productName: string; brand: string; image?: string;
  scannedAt: string; warnings: string[]; cheapestPrice?: number; cheapestStore?: string;
}

const LIST_SCAN_HISTORY = `
  query ListScanHistories($filter: ModelScanHistoryFilterInput, $limit: Int) {
    listScanHistories(filter: $filter, limit: $limit) {
      items { id barcode productName brand image scannedAt warnings cheapestPrice cheapestStore }
    }
  }
`;

export default function HistoryScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { rw, rh, rf, rr, isTablet, getColumns, getCardWidth } = useResponsive();
  const styles = useHistoryStyles(rw, rh, rf, rr);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Set by the pull-to-refresh handler whenever it fires while a bulk delete
  // is in flight. If a refresh landed during that window, the pre-delete
  // `prev` snapshot taken below is stale by the time the delete settles, so
  // rolling back to it on failure would silently discard the refreshed data.
  const refreshedDuringDelete = useRef(false);

  const fetchHistory = async () => {
    if (!user) return;
    try {
      // byUserId GSI has no sort key, so results aren't chronological —
      // sort client-side (same reasoning as HomeScreen's recent-scans list).
      const data: any = await graphqlRequest(LIST_SCAN_HISTORY, { filter: { userId: { eq: user.id } }, limit: 100 });
      const items: ScanRecord[] = data.listScanHistories.items || [];
      items.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());
      setScans(items);
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  };

  // Record cards are horizontal rows (thumb + info + verdict pill), so they
  // need a wider min width than a typical square product tile before
  // splitting into columns — this only kicks in on tablet/landscape widths.
  const columns = getColumns(320);

  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()); };

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const enterSelectMode = (id: string) => {
    setSelectMode(true);
    setSelected(new Set([id]));
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    Alert.alert(
      t('history.deleteRecordsTitle', { count: ids.length }),
      t('history.cannotBeUndone'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const prev = scans;
            refreshedDuringDelete.current = false;
            setScans(s => s.filter(x => !selected.has(x.id))); // optimistic
            exitSelectMode(); // re-enables pull-to-refresh
            const results = await Promise.all(ids.map(id => deleteScanHistory(id)));
            if (results.some(ok => !ok)) {
              // A concurrent pull-to-refresh may have fetched fresher data
              // during the window above — rolling back to `prev` would
              // silently discard it, so re-fetch instead in that case.
              if (refreshedDuringDelete.current) fetchHistory();
              else setScans(prev); // roll back on any failure
            }
          },
        },
      ],
    );
  };

  useFocusEffect(useCallback(() => { fetchHistory(); }, [user]));

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('history.justNow');
    if (mins < 60) return t('history.minutesAgo', { count: mins });
    if (mins < 1440) return t('history.hoursAgo', { count: Math.floor(mins / 60) });
    if (mins < 2880) return t('history.yesterday');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getVerdict = (warnings: string[]) => {
    if (!warnings?.length) return { label: t('history.verdictSuitable'), color: Colors.safe, bg: Colors.safeBg, border: Colors.safeBorder };
    const hasHigh = warnings.some(w => w.toLowerCase().includes('allergic') || w.toLowerCase().includes('avoid'));
    if (hasHigh) return { label: t('history.verdictNotRecommended'), color: Colors.danger, bg: Colors.dangerBg, border: Colors.dangerBorder };
    return { label: t('history.verdictUseCaution'), color: Colors.caution, bg: Colors.cautionBg, border: Colors.cautionBorder };
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>← {t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>{t('history.title')}</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.navyMid} />
          <Text style={styles.loadingText}>{t('history.loadingRecords')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        {selectMode ? (
          <TouchableOpacity style={styles.backBtn} onPress={exitSelectMode}>
            <Text style={styles.backBtnText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>← {t('common.back')}</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.topBarTitle}>{selectMode ? t('history.selectedCount', { count: selected.size }) : t('history.title')}</Text>
        {selectMode ? (
          <View style={styles.backBtn} />
        ) : scans.length > 0 ? (
          <TouchableOpacity style={styles.backBtn} onPress={() => setSelectMode(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.backBtnText, { textAlign: 'right' }]}>{t('history.select')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      {scans.length === 0 ? (
        <View style={styles.centered}>
          <View style={styles.emptyIcon}><Text style={{ fontSize: 28, color: Colors.textMuted }}>📋</Text></View>
          <Text style={styles.emptyTitle}>{t('history.noRecordsTitle')}</Text>
          <Text style={styles.emptySub}>{t('history.noRecordsSubtitle')}</Text>
          <TouchableOpacity style={styles.scanNowBtn} onPress={() => navigation.navigate('Scan')}>
            <Text style={styles.scanNowText}>{t('history.startScanning')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={scans}
          keyExtractor={item => item.id}
          key={columns}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: 10 } : undefined}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            { padding: 16, gap: 10, paddingBottom: selectMode ? rh(100) : 16 },
            isTablet && { maxWidth: 900, alignSelf: 'center', width: '100%' },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { refreshedDuringDelete.current = true; setRefreshing(true); fetchHistory(); }} tintColor={Colors.navyMid} />}
          renderItem={({ item }) => {
            const v = getVerdict(item.warnings);
            const isSelected = selected.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.recordCard, columns > 1 && { width: getCardWidth(columns, 10, 16) }]}
                onPress={() => selectMode ? toggleSelected(item.id) : navigation.navigate('Product', { barcode: item.barcode })}
                onLongPress={() => !selectMode && enterSelectMode(item.id)}
                activeOpacity={0.85}
              >
                {/* Status strip */}
                <View style={[styles.statusStrip, { backgroundColor: v.color }]} />

                {selectMode && (
                  <View style={styles.checkboxWrap}>
                    <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </View>
                )}

                <View style={styles.recordBody}>
                  <View style={styles.recordTop}>
                    {item.image ? (
                      <Image source={{ uri: item.image }} style={styles.recordThumb} resizeMode="contain" />
                    ) : (
                      <View style={styles.recordThumbPlaceholder}><Text style={{ fontSize: 16 }}>📦</Text></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recordBrand}>{item.brand?.toUpperCase()}</Text>
                      <Text style={styles.recordName} numberOfLines={1}>{item.productName}</Text>
                      <Text style={styles.recordBarcode}>{item.barcode}</Text>
                    </View>
                    <View style={styles.recordRight}>
                      <Text style={styles.recordTime}>{formatDate(item.scannedAt)}</Text>
                      {item.cheapestPrice ? (
                        <Text style={styles.recordPrice}>£{item.cheapestPrice.toFixed(2)}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={[styles.verdictPill, { backgroundColor: v.bg, borderColor: v.border }]}>
                    <Text style={[styles.verdictPillText, { color: v.color }]}>{v.label}</Text>
                    {item.warnings?.length > 0 && (
                      <Text style={[styles.verdictPillCount, { color: v.color }]}> · {t('history.warningsCount', { count: item.warnings.length })}</Text>
                    )}
                  </View>
                </View>
                {!selectMode && <Text style={styles.recordArrow}>›</Text>}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {selectMode && (
        <View style={styles.selectBar}>
          <TouchableOpacity
            style={[styles.deleteSelectedBtn, selected.size === 0 && styles.deleteSelectedBtnDisabled]}
            onPress={handleBulkDelete}
            disabled={selected.size === 0}
            activeOpacity={0.85}
          >
            <Text style={[styles.deleteSelectedText, selected.size === 0 && styles.deleteSelectedTextDisabled]}>
              {selected.size === 0 ? t('history.selectRecordsToDelete') : t('history.deleteRecordsButton', { count: selected.size })}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function useHistoryStyles(rw: (n: number) => number, rh: (n: number) => number, rf: (n: number) => number, rr: (n: number) => number) {
  return useMemo(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  topBar: { backgroundColor: Colors.surface, paddingHorizontal: rw(20), paddingVertical: rh(14), borderBottomWidth: 1, borderColor: Colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { minWidth: rw(60) },
  backBtnText: { color: Colors.navyMid, fontSize: rf(14), fontWeight: '600' },
  topBarTitle: { fontSize: rf(20), fontWeight: '800', color: Colors.textPrimary },
  topBarCount: { fontSize: rf(12), color: Colors.textMuted, fontFamily: 'monospace', minWidth: rw(60), textAlign: 'right' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(32) },
  loadingText: { color: Colors.textMuted, marginTop: rh(14), fontSize: rf(13) },
  emptyIcon: { width: rw(64), height: rw(64), borderRadius: rw(32), backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: rh(16) },
  emptyTitle: { fontSize: rf(20), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(8) },
  emptySub: { fontSize: rf(13), color: Colors.textMuted, textAlign: 'center', lineHeight: rf(20), marginBottom: rh(24) },
  scanNowBtn: { backgroundColor: Colors.navy, borderRadius: rr(10), paddingHorizontal: rw(24), paddingVertical: rh(12), ...Shadow.cardMd },
  scanNowText: { color: '#FFF', fontWeight: '700', fontSize: rf(14) },
  recordCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: rr(12), borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.card },
  statusStrip: { width: rw(4), alignSelf: 'stretch' },
  recordBody: { flex: 1, padding: rw(14), gap: rh(8) },
  recordTop: { flexDirection: 'row', justifyContent: 'space-between' },
  recordThumb: { width: rw(40), height: rw(40), borderRadius: rr(8), backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, marginRight: rw(10), flexShrink: 0 },
  recordThumbPlaceholder: { width: rw(40), height: rw(40), borderRadius: rr(8), backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, marginRight: rw(10), alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recordBrand: { fontSize: rf(10), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, marginBottom: rh(2) },
  recordName: { fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(2) },
  recordBarcode: { fontSize: rf(10), color: Colors.textMuted, fontFamily: 'monospace' },
  recordRight: { alignItems: 'flex-end' },
  recordTime: { fontSize: rf(11), color: Colors.textMuted, marginBottom: rh(4) },
  recordPrice: { fontSize: rf(14), fontWeight: '700', color: Colors.price },
  verdictPill: { alignSelf: 'flex-start', borderRadius: rr(6), paddingHorizontal: rw(8), paddingVertical: rh(3), borderWidth: 1, flexDirection: 'row' },
  verdictPillText: { fontSize: rf(10), fontWeight: '700', letterSpacing: 0.5 },
  verdictPillCount: { fontSize: rf(10) },
  recordArrow: { fontSize: rf(20), color: Colors.border, paddingRight: rw(14) },

  // Multi-select mode
  checkboxWrap:   { justifyContent: 'center', paddingLeft: rw(12) },
  checkbox:       { width: rw(24), height: rw(24), borderRadius: rw(12), borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  checkmark:      { color: '#FFF', fontSize: rf(14), fontWeight: '800' },
  selectBar:      { position: 'absolute', bottom: 0, left: 0, right: 0, padding: rw(16), backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  deleteSelectedBtn:         { backgroundColor: Colors.danger, borderRadius: rr(14), paddingVertical: rh(15), alignItems: 'center' },
  deleteSelectedBtnDisabled: { backgroundColor: Colors.surfaceAlt },
  deleteSelectedText:        { color: '#FFF', fontWeight: '700', fontSize: rf(15) },
  deleteSelectedTextDisabled: { color: Colors.textMuted },
  }), [rw, rh, rf, rr]);
}
