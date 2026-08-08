// src/components/UPFCard.tsx
// Shows NOVA UPF score, E-numbers and additives on the product screen

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ProductData } from '../services/foodApi';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive } from '../utils/responsive';

interface Props { product: ProductData }

const RISK_CONFIG = {
  avoid:   { color: Colors.danger,  bg: Colors.dangerBg,  border: Colors.dangerBorder },
  caution: { color: Colors.caution, bg: Colors.cautionBg, border: Colors.cautionBorder },
  safe:    { color: Colors.safe,    bg: Colors.safeBg,    border: Colors.safeBorder },
};

export default function UPFCard({ product }: Props) {
  const { t } = useTranslation();
  const { rw, rh, rf, rr, rStyles } = useResponsive();
  const styles = useMemo(() => StyleSheet.create({
    card: { backgroundColor: Colors.surface, marginHorizontal: rStyles.space.lg, marginVertical: rStyles.space.sm, borderRadius: rStyles.radius.md, padding: rStyles.space.lg, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4, ...Shadow.card },
    label: { fontSize: rStyles.text.xs, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5, marginBottom: rStyles.space.md },
    novaRow: { flexDirection: 'row', alignItems: 'center', gap: rStyles.space.md, borderRadius: rr(10), padding: rStyles.space.md, borderWidth: 1, marginBottom: rw(14) },
    novaCircle: { width: rw(44), height: rh(44), borderRadius: rr(22), alignItems: 'center', justifyContent: 'center' },
    novaNum: { color: '#FFF', fontSize: rStyles.text.xl, fontWeight: '800' },
    novaTitleRow: { flexDirection: 'row', alignItems: 'center', gap: rStyles.space.sm, marginBottom: rw(3) },
    novaLabel: { fontSize: rStyles.text.sm, fontWeight: '800', letterSpacing: 0.3 },
    upfBadge: { backgroundColor: Colors.danger, borderRadius: rr(4), paddingHorizontal: rw(6), paddingVertical: rw(2) },
    upfBadgeText: { color: '#FFF', fontSize: rf(9), fontWeight: '800', letterSpacing: 0.5 },
    novaDesc: { fontSize: rStyles.text.sm, color: Colors.textSecondary, lineHeight: rh(17) },
    block: { marginBottom: rw(10) },
    blockTitle: { fontSize: rStyles.text.xs, fontWeight: '700', color: Colors.danger, letterSpacing: 1, marginBottom: rStyles.space.sm },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rw(6) },
    chip: { borderRadius: rr(6), paddingHorizontal: rw(10), paddingVertical: rStyles.space.xs, borderWidth: 1 },
    chipCode: { fontSize: rStyles.text.sm, fontWeight: '700' },
    toggle: { paddingTop: rw(10), borderTopWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    toggleText: { fontSize: rStyles.text.sm, color: Colors.navyMid, fontWeight: '600' },
    expandedSection: { marginTop: rStyles.space.md, gap: rw(10) },
    riskGroup: { gap: rw(6) },
    riskGroupTitle: { fontSize: rf(9), fontWeight: '800', letterSpacing: 1.5 },
    additiveRow: { flexDirection: 'row', alignItems: 'center', gap: rStyles.space.sm, borderRadius: rr(6), padding: rStyles.space.sm, borderWidth: 1 },
    additiveDot: { width: rw(6), height: rh(6), borderRadius: rr(3) },
    additiveCode: { fontSize: rStyles.text.sm, fontWeight: '700', minWidth: rw(42) },
    additiveName: { fontSize: rStyles.text.sm, color: Colors.textSecondary, flex: 1 },
    noAdditives: { fontSize: rf(13), color: Colors.textMuted, fontStyle: 'italic', marginTop: rStyles.space.xs },
    source: { fontSize: rStyles.text.xs, color: Colors.textMuted, fontStyle: 'italic', marginTop: rStyles.space.xs },
  }), [rw, rh, rf, rr, rStyles]);

  const [expanded, setExpanded] = useState(false);
  const riskLabels: Record<'avoid' | 'caution' | 'safe', string> = {
    avoid: t('upfCard.riskLabel.avoid'),
    caution: t('upfCard.riskLabel.caution'),
    safe: t('upfCard.riskLabel.safe'),
  };
  const upf = product.upfScore;
  const additives = product.additives || [];
  const dangerAdditives = additives.filter(a => a.riskLevel === 'avoid');
  const cautionAdditives = additives.filter(a => a.riskLevel === 'caution');
  const safeAdditives = additives.filter(a => a.riskLevel === 'safe');

  return (
    <View style={[styles.card, { borderLeftColor: upf.color }]}>
      <Text style={styles.label}>{t('upfCard.processingAndAdditives')}</Text>

      {/* NOVA Score */}
      <View style={[styles.novaRow, { backgroundColor: upf.color + '15', borderColor: upf.color + '44' }]}>
        <View style={[styles.novaCircle, { backgroundColor: upf.color }]}>
          <Text style={styles.novaNum}>{upf.group || '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.novaTitleRow}>
            <Text style={[styles.novaLabel, { color: upf.color }]}>{t('upfCard.novaTitle', { group: upf.group, label: upf.label.toUpperCase() })}</Text>
            {upf.isUPF && <View style={styles.upfBadge}><Text style={styles.upfBadgeText}>{t('upfCard.upfBadge')}</Text></View>}
          </View>
          <Text style={styles.novaDesc}>{upf.description}</Text>
        </View>
      </View>

      {/* Danger additives shown by default */}
      {dangerAdditives.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>{t('upfCard.highRiskAdditives', { count: dangerAdditives.length })}</Text>
          <View style={styles.chipRow}>
            {dangerAdditives.map((a, i) => (
              <View key={i} style={[styles.chip, { backgroundColor: Colors.dangerBg, borderColor: Colors.dangerBorder }]}>
                <Text style={[styles.chipCode, { color: Colors.danger }]}>{a.code}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Toggle for full additive list */}
      {additives.length > 0 && (
        <TouchableOpacity style={styles.toggle} onPress={() => setExpanded(e => !e)}>
          <Text style={styles.toggleText}>
            {expanded ? t('upfCard.hideAdditives') : t('upfCard.viewAdditives', { count: additives.length })}
          </Text>
        </TouchableOpacity>
      )}

      {expanded && (
        <View style={styles.expandedSection}>
          {(['avoid', 'caution', 'safe'] as const).map(risk => {
            const list = additives.filter(a => a.riskLevel === risk);
            if (!list.length) return null;
            const cfg = RISK_CONFIG[risk];
            return (
              <View key={risk} style={styles.riskGroup}>
                <Text style={[styles.riskGroupTitle, { color: cfg.color }]}>{riskLabels[risk]}</Text>
                {list.map((a, i) => (
                  <View key={i} style={[styles.additiveRow, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                    <View style={[styles.additiveDot, { backgroundColor: cfg.color }]} />
                    <Text style={[styles.additiveCode, { color: cfg.color }]}>{a.code}</Text>
                    <Text style={styles.additiveName} numberOfLines={1}>{a.name}</Text>
                  </View>
                ))}
              </View>
            );
          })}
          <Text style={styles.source}>
            {t('upfCard.source')}
          </Text>
        </View>
      )}

      {additives.length === 0 && upf.group > 0 && (
        <Text style={styles.noAdditives}>{t('upfCard.noAdditives')}</Text>
      )}
    </View>
  );
}
