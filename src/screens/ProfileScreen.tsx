import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Image, StatusBar, Modal, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import HealthProfileScreen from './HealthProfileScreen';
import CMSPageScreen from './CMSPageScreen';
import SubscriptionScreen from './SubscriptionScreen';
import { Colors } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';
import { getSubscriptionState, SubscriptionState } from '../services/subscriptionService';
import { graphqlRequest } from '../services/userDataService';
import logger from '../utils/logger';
import type { PageSlug } from '../services/cmsService';

// `category: 'deletion'` is what lets admin filter this out from generic
// contact messages in the Contact Submissions queue — see admin/index.html.
const CREATE_CONTACT_SUBMISSION = /* GraphQL */ `
  mutation CreateContactSubmission($input: CreateContactSubmissionInput!) {
    createContactSubmission(input: $input) { id }
  }
`;

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, healthProfile, refreshProfile, signOut, isMember } = useAuth();
  const { rw, rh, rf, rr, isTablet } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  const [editingProfile, setEditingProfile]     = useState(false);
  const [openingEdit, setOpeningEdit]           = useState(false);
  const [cmsPage, setCMSPage]                   = useState<PageSlug | null>(null);
  const [showSubscription, setShowSubscription] = useState(false);
  const [subState, setSubState]                 = useState<SubscriptionState | null>(null);
  const [deletingData, setDeletingData]         = useState(false);

  // Re-syncs membership/plan status every time this tab is opened (not just
  // on first mount — Profile stays mounted in the background as a tab screen,
  // so a plain useEffect would only ever run once). This is what makes an
  // admin-side membership change (or a completed purchase) show up without
  // requiring an app restart — just switching to this tab is enough.
  useFocusEffect(
    useCallback(() => {
      refreshProfile();
      getSubscriptionState().then(setSubState);
    }, [])
  );

  if (editingProfile) {
    return (
      <HealthProfileScreen
        onComplete={async () => { await refreshProfile(); setEditingProfile(false); }}
      />
    );
  }
  if (cmsPage) return <CMSPageScreen slug={cmsPage} onClose={() => setCMSPage(null)} />;

  // Always pull the latest saved profile before opening the editor — starting
  // the wizard from stale local state risks a blank save overwriting real data.
  const handleEditProfile = async () => {
    setOpeningEdit(true);
    await refreshProfile();
    setOpeningEdit(false);
    setEditingProfile(true);
  };

  // Submits a real deletion request (a flagged ContactSubmission an admin
  // actions manually, same as the rest of GDPR erasure today — see
  // admin/index.html's User Management delete flow) rather than deleting
  // anything client-side. Signs the user out on success since their account
  // is now pending deletion; on failure they stay signed in and can retry.
  const submitDeleteRequest = async () => {
    setDeletingData(true);
    try {
      await graphqlRequest(CREATE_CONTACT_SUBMISSION, {
        input: {
          name: user?.name || 'Unknown',
          email: user?.email || '',
          subject: 'Account Deletion Request',
          message: `User ${user?.id || 'unknown'} (${user?.email || 'no email'}) has requested permanent deletion of their account and all associated data.`,
          category: 'deletion',
        },
      });
      Alert.alert(
        t('profile.deleteRequestSuccessTitle'),
        t('profile.deleteRequestSuccessMessage'),
        [{ text: t('common.ok'), onPress: signOut }]
      );
    } catch (err) {
      logger.warn('profile', 'Failed to submit data deletion request', {}, err as Error);
      Alert.alert(t('profile.deleteRequestErrorTitle'), t('profile.deleteRequestErrorMessage'));
    }
    setDeletingData(false);
  };

  const hp   = healthProfile;

  const allergyCount   = hp.allergies?.length   || 0;
  const conditionCount = hp.conditions?.length  || 0;
  const goalCount      = hp.healthGoals?.length || 0;

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scroll, isTablet && s.scrollCenterWrap]}>
        <View style={isTablet ? s.tabletContent : s.fullWidthContent}>

        {/* ── User header ── */}
        <View style={s.userSection}>
          {user?.picture
            ? <Image source={{ uri: user.picture }} style={s.avatar} />
            : (
              <View style={s.avatarPlaceholder}>
                <Text style={s.avatarInitial}>{user?.name?.charAt(0)?.toUpperCase() || '?'}</Text>
              </View>
            )
          }
          <Text style={s.userName}>{user?.name || t('profile.myAccount')}</Text>
          <Text style={s.userEmail}>{user?.email || ''}</Text>
          <View style={[s.planBadge, isMember ? { backgroundColor: Colors.navyLight, borderColor: Colors.navy } : { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border }]}>
            <Text style={[s.planBadgeText, { color: isMember ? Colors.navy : Colors.textMuted }]}>
              {isMember ? t('profile.member') : t('profile.freePlan')}
            </Text>
          </View>
        </View>

        {/* ── Health profile ── */}
        <Text style={s.sectionLabel}>{t('profile.healthProfile')}</Text>
        <View style={s.card}>
          <View style={s.healthSummary}>
            <HealthStat count={allergyCount}   label={t('profile.allergies')}   />
            <View style={s.statDivider} />
            <HealthStat count={conditionCount} label={t('profile.conditions')}  />
            <View style={s.statDivider} />
            <HealthStat count={goalCount}      label={t('profile.goals')}       />
          </View>
          {allergyCount > 0 && (
            <View style={s.chipRow}>
              {hp.allergies.slice(0, 4).map((a, i) => (
                <View key={i} style={[s.chip, s.chipDanger]}>
                  <Text style={[s.chipText, { color: Colors.danger }]}>{a}</Text>
                </View>
              ))}
              {allergyCount > 4 && <Text style={s.chipMore}>{t('profile.moreCount', { count: allergyCount - 4 })}</Text>}
            </View>
          )}
          <TouchableOpacity style={s.editRow} onPress={handleEditProfile} activeOpacity={0.75} disabled={openingEdit}>
            <Text style={s.editRowText}>{t('profile.editHealthProfile')}</Text>
            {openingEdit
              ? <ActivityIndicator size="small" color={Colors.navy} />
              : <Text style={s.editRowArrow}>›</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>{t('profile.membership')}</Text>
        <View style={[s.card, s.membershipCard]}>
          <View style={s.membershipHeaderRow}>
            <Text style={s.subName}>{isMember ? t('profile.member') : t('profile.freePlan')}</Text>
            {isMember && (
              <View style={s.membershipPill}>
                <Text style={s.membershipPillText}>{subState?.billingPeriod === 'yearly' ? t('profile.planPriceYearly') : t('profile.planPriceMonthly')}</Text>
              </View>
            )}
          </View>
          <Text style={s.subDesc}>
            {isMember
              ? t('profile.memberBenefitsUnlocked')
              : t('profile.memberBenefitsLocked')}
          </Text>
          <TouchableOpacity style={s.upgradeBtnFull} onPress={() => setShowSubscription(true)} activeOpacity={0.85}>
            <Text style={s.upgradeBtnFullText}>{isMember ? t('profile.manageMembership') : t('profile.becomeMember')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── App links ── */}
        <Text style={s.sectionLabel}>{t('profile.information')}</Text>
        <View style={s.card}>
          <LinkRow icon="📖" label={t('profile.howItWorks')}      onPress={() => setCMSPage('how-it-works')} />
          <LinkRow icon="⚠️" label={t('profile.allergenGuide')}   onPress={() => setCMSPage('allergen-guide')} />
          <LinkRow icon="❓" label={t('profile.faq')}              onPress={() => setCMSPage('faq')} />
          <LinkRow icon="📧" label={t('profile.contactSupport')}  onPress={() => setCMSPage('contact')} />
          <LinkRow icon="🔒" label={t('profile.privacyPolicy')}   onPress={() => setCMSPage('privacy-policy')} />
          <LinkRow icon="📋" label={t('profile.termsOfService')}  onPress={() => setCMSPage('terms-of-service')} last />
        </View>

        {/* ── Account actions ── */}
        <TouchableOpacity
          style={s.signOutBtn}
          activeOpacity={0.8}
          onPress={() =>
            Alert.alert(t('common.signOut'), t('profile.signOutConfirm'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.signOut'), style: 'destructive', onPress: signOut },
            ])
          }
        >
          <Text style={s.signOutText}>{t('common.signOut')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.deleteBtn}
          activeOpacity={0.8}
          disabled={deletingData}
          onPress={() =>
            Alert.alert(
              t('profile.deleteMyData'),
              t('profile.deleteConfirmMessage'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('profile.deleteEverything'), style: 'destructive', onPress: submitDeleteRequest },
              ]
            )
          }
        >
          {deletingData
            ? <ActivityIndicator size="small" color={Colors.danger} />
            : <Text style={s.deleteText}>{t('profile.deleteMyData')}</Text>
          }
        </TouchableOpacity>

        <Text style={s.version}>{t('profile.version')}</Text>

        </View>
      </ScrollView>

      <Modal visible={showSubscription} animationType="slide" presentationStyle="fullScreen">
        {/* Modal presents in its own native window on iOS — SafeAreaProvider
            must be nested here too, or SubscriptionScreen's SafeAreaView
            silently gets zero insets. */}
        <SafeAreaProvider>
          <SubscriptionScreen onClose={() => { setShowSubscription(false); getSubscriptionState().then(setSubState); refreshProfile(); }} />
        </SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}

function HealthStat({ count, label }: { count: number; label: string }) {
  const { rw, rh, rf, rr } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <View style={s.healthStat}>
      <Text style={s.healthStatCount}>{count}</Text>
      <Text style={s.healthStatLabel}>{label}</Text>
    </View>
  );
}

function LinkRow({ icon, label, onPress, last }: { icon: string; label: string; onPress: () => void; last?: boolean }) {
  const { rw, rh, rf, rr } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <TouchableOpacity
      style={[s.linkRow, !last && s.linkRowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={s.linkIcon}>{icon}</Text>
      <Text style={s.linkLabel}>{label}</Text>
      <Text style={s.linkArrow}>›</Text>
    </TouchableOpacity>
  );
}

function createStyles(
  rw: (n: number) => number,
  rh: (n: number) => number,
  rf: (n: number) => number,
  rr: (n: number) => number,
) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll:    { paddingHorizontal: rw(20), paddingBottom: rh(48) },

  // User header
  userSection:     { alignItems: 'center', paddingTop: rh(32), paddingBottom: rh(28) },
  avatar:          { width: rw(80), height: rw(80), borderRadius: rw(40), marginBottom: rh(14) },
  avatarPlaceholder:{ width: rw(80), height: rw(80), borderRadius: rw(40), backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center', marginBottom: rh(14) },
  avatarInitial:   { color: '#FFF', fontSize: rf(32), fontWeight: '700' },
  userName:        { fontSize: rf(22), fontWeight: '800', color: Colors.textPrimary, marginBottom: rh(4), letterSpacing: -0.3 },
  userEmail:       { fontSize: rf(13), color: Colors.textMuted, marginBottom: rh(12) },
  planBadge:       { borderRadius: rr(20), paddingHorizontal: rw(14), paddingVertical: rh(5), borderWidth: 1 },
  planBadgeText:   { fontSize: rf(12), fontWeight: '700' },

  // Section label
  sectionLabel: { fontSize: rf(12), fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: rh(8), marginTop: rh(4) },

  // Card
  card: { backgroundColor: Colors.surface, borderRadius: rr(18), borderWidth: 1, borderColor: Colors.border, marginBottom: rh(20), overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },

  // Health profile
  healthSummary:    { flexDirection: 'row', paddingVertical: rh(20), paddingHorizontal: rw(16) },
  healthStat:       { flex: 1, alignItems: 'center' },
  healthStatCount:  { fontSize: rf(26), fontWeight: '800', color: Colors.textPrimary },
  healthStatLabel:  { fontSize: rf(11), color: Colors.textMuted, marginTop: rh(2) },
  statDivider:      { width: 1, backgroundColor: Colors.border, marginVertical: rh(4) },
  chipRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: rw(6), paddingHorizontal: rw(16), paddingBottom: rh(14) },
  chip:             { borderRadius: rr(6), paddingHorizontal: rw(10), paddingVertical: rh(4), borderWidth: 1 },
  chipDanger:       { backgroundColor: Colors.dangerBg, borderColor: Colors.dangerBorder },
  chipText:         { fontSize: rf(12), fontWeight: '600' },
  chipMore:         { fontSize: rf(12), color: Colors.textMuted, alignSelf: 'center' },
  editRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rw(16), paddingVertical: rh(14), borderTopWidth: 1, borderTopColor: Colors.border },
  editRowText:      { flex: 1, fontSize: rf(14), fontWeight: '600', color: Colors.navy },
  editRowArrow:     { fontSize: rf(20), color: Colors.navy, opacity: 0.5 },

  // Membership — stacked layout (not a side-by-side row) so long free-tier
  // copy wraps naturally on any screen width instead of squeezing the button.
  membershipCard:      { padding: rw(18) },
  membershipHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: rw(8), marginBottom: rh(6) },
  subName:             { fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary },
  membershipPill:      { backgroundColor: Colors.navyLight, borderRadius: rr(20), paddingHorizontal: rw(10), paddingVertical: rh(4), borderWidth: 1, borderColor: Colors.navy },
  membershipPillText:  { fontSize: rf(11), fontWeight: '700', color: Colors.navy },
  subDesc:             { fontSize: rf(12), color: Colors.textMuted, lineHeight: rf(18), marginBottom: rh(14) },
  upgradeBtnFull:      { backgroundColor: Colors.navy, borderRadius: rr(12), paddingVertical: rh(13), alignItems: 'center' },
  upgradeBtnFullText:  { color: '#FFF', fontWeight: '700', fontSize: rf(14) },

  // Links
  linkRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rw(16), paddingVertical: rh(14) },
  linkRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  linkIcon:      { fontSize: rf(17), width: rw(28), marginRight: rw(10) },
  linkLabel:     { flex: 1, fontSize: rf(14), color: Colors.textPrimary, fontWeight: '500' },
  linkArrow:     { fontSize: rf(20), color: Colors.textMuted },

  // Actions
  signOutBtn: { backgroundColor: Colors.surface, borderRadius: rr(14), borderWidth: 1, borderColor: Colors.border, paddingVertical: rh(16), alignItems: 'center', marginBottom: rh(12) },
  signOutText:{ fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary },
  deleteBtn:  { paddingVertical: rh(10), alignItems: 'center', marginBottom: rh(8) },
  deleteText: { fontSize: rf(13), color: Colors.danger, fontWeight: '600' },

  version: { fontSize: rf(11), color: Colors.textMuted, textAlign: 'center', marginTop: rh(4), paddingBottom: rh(8) },

  // Tablet content width cap — keeps the settings/profile column centered
  // and readable instead of stretching edge-to-edge on wide screens.
  scrollCenterWrap: { alignItems: 'center' },
  tabletContent:    { width: '100%', maxWidth: TABLET_CONTENT_MAX_WIDTH },
  fullWidthContent: { width: '100%' },
  });
}
