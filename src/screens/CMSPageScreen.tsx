// src/screens/CMSPageScreen.tsx
// Renders any CMS page managed from admin panel
// Supports: heading, body, callout, faq, feature-list, contact-form sections

import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, TextInput,
  Animated, Linking, Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { fetchCMSPage, CMSPage, CMSSection, PageSlug } from '../services/cmsService';
import { graphqlRequest } from '../services/userDataService';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';
import { useFadeIn } from '../utils/animations';

const AnimatedKeyboardAwareScrollView = Animated.createAnimatedComponent(KeyboardAwareScrollView);

interface Props {
  slug: PageSlug;
  onClose: () => void;
}

export default function CMSPageScreen({ slug, onClose }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState<CMSPage | null>(null);
  const [loading, setLoading] = useState(true);
  const { opacity } = useFadeIn(0, 300);
  const { rw, rh, rf, rr, isTablet } = useResponsive();

  const styles = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);

  // Cap CMS text content to a readable width on tablet instead of stretching
  // long paragraphs edge-to-edge.
  const tabletContent = isTablet
    ? [styles.content, { width: '100%' as const, maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center' as const }]
    : styles.content;

  useEffect(() => {
    fetchCMSPage(slug).then(p => { setPage(p); setLoading(false); });
  }, [slug]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>{t('cmsPage.back')}</Text>
        </TouchableOpacity>
        {page && <Text style={styles.topBarTitle} numberOfLines={1}>{page.title}</Text>}
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.navyMid} />
          <Text style={styles.loaderText}>{t('common.loading')}</Text>
        </View>
      ) : page ? (
        <AnimatedKeyboardAwareScrollView
          style={{ opacity, flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={tabletContent}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid
          extraHeight={rh(40)}
          extraScrollHeight={rh(20)}
          enableAutomaticScroll
        >
          {/* Page header */}
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>{page.title}</Text>
            {page.subtitle && <Text style={styles.pageSubtitle}>{page.subtitle}</Text>}
            <Text style={styles.pageUpdated}>{t('cmsPage.lastUpdated', { date: new Date(page.lastUpdated).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) })}</Text>
          </View>

          {/* Sections */}
          {page.sections.map(section => (
            <SectionRenderer key={section.id} section={section} styles={styles} t={t} />
          ))}
        </AnimatedKeyboardAwareScrollView>
      ) : (
        <View style={styles.loader}>
          <Text style={styles.loaderText}>{t('cmsPage.contentUnavailable')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

type CMSStyles = ReturnType<typeof createStyles>;

// ─── Section Renderer ─────────────────────────────────────────

function SectionRenderer({ section, styles, t }: { section: CMSSection; styles: CMSStyles; t: (key: string, opts?: Record<string, unknown>) => string }) {
  switch (section.type) {
    case 'heading':   return <HeadingSection section={section} styles={styles} />;
    case 'body':      return <BodySection section={section} styles={styles} />;
    case 'callout':   return <CalloutSection section={section} styles={styles} />;
    case 'faq':       return <FAQSection section={section} styles={styles} />;
    case 'feature-list': return <FeatureListSection section={section} styles={styles} />;
    case 'contact-form': return <ContactFormSection styles={styles} t={t} />;
    default: return null;
  }
}

function HeadingSection({ section, styles }: { section: CMSSection; styles: CMSStyles }) {
  return (
    <View style={styles.sectionWrap}>
      <View style={styles.headingDivider} />
      <Text style={styles.sectionHeading}>{section.heading}</Text>
      {section.body && <Text style={styles.sectionBody}>{section.body}</Text>}
    </View>
  );
}

function BodySection({ section, styles }: { section: CMSSection; styles: CMSStyles }) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionBody}>{section.body}</Text>
    </View>
  );
}

const CALLOUT_STYLES = {
  info:    { bg: Colors.infoBg,    border: Colors.infoBorder,   text: Colors.info,    accent: Colors.info },
  warning: { bg: Colors.cautionBg, border: Colors.cautionBorder, text: Colors.caution, accent: Colors.caution },
  success: { bg: Colors.safeBg,    border: Colors.safeBorder,   text: Colors.safe,    accent: Colors.safe },
  danger:  { bg: Colors.dangerBg,  border: Colors.dangerBorder, text: Colors.danger,  accent: Colors.danger },
};

function CalloutSection({ section, styles }: { section: CMSSection; styles: CMSStyles }) {
  const s = CALLOUT_STYLES[section.style || 'info'];
  return (
    <View style={[styles.callout, { backgroundColor: s.bg, borderColor: s.border, borderLeftColor: s.accent }]}>
      {section.heading && <Text style={[styles.calloutHeading, { color: s.text }]}>{section.heading}</Text>}
      {section.body && <Text style={[styles.calloutBody, { color: Colors.textSecondary }]}>{section.body}</Text>}
    </View>
  );
}

function FAQSection({ section, styles }: { section: CMSSection; styles: CMSStyles }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <View style={styles.sectionWrap}>
      {section.heading && <Text style={styles.sectionHeading}>{section.heading}</Text>}
      {section.items?.map((item, i) => (
        <View key={i} style={styles.faqItem}>
          <TouchableOpacity
            style={styles.faqQuestion}
            onPress={() => setOpenIndex(openIndex === i ? null : i)}
            activeOpacity={0.8}
          >
            <Text style={styles.faqQuestionText}>{item.title}</Text>
            <Text style={styles.faqChevron}>{openIndex === i ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {openIndex === i && (
            <View style={styles.faqAnswer}>
              <Text style={styles.faqAnswerText}>{item.body}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function FeatureListSection({ section, styles }: { section: CMSSection; styles: CMSStyles }) {
  return (
    <View style={styles.sectionWrap}>
      {section.heading && <Text style={styles.sectionHeading}>{section.heading}</Text>}
      {section.items?.map((item, i) => (
        <TouchableOpacity
          key={i}
          style={styles.featureItem}
          onPress={() => item.link && Linking.openURL(item.link)}
          activeOpacity={item.link ? 0.75 : 1}
        >
          {item.icon && <Text style={styles.featureIcon}>{item.icon}</Text>}
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>{item.title}</Text>
            {item.body && <Text style={styles.featureBody}>{item.body}</Text>}
          </View>
          {item.link && <Text style={styles.featureArrow}>→</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const CREATE_CONTACT_SUBMISSION = /* GraphQL */ `
  mutation CreateContactSubmission($input: CreateContactSubmissionInput!) {
    createContactSubmission(input: $input) { id }
  }
`;

function ContactFormSection({ styles, t }: { styles: CMSStyles; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);

  const handleSend = async () => {
    if (!name || !email || !message) {
      Alert.alert(t('cmsPage.missingFieldsTitle'), t('cmsPage.missingFieldsMessage'));
      return;
    }
    setSending(true);
    try {
      await graphqlRequest(CREATE_CONTACT_SUBMISSION, { input: { name, email, subject, message } });
    } catch { /* network error — still show success UX, matches prior lenient behavior */ }
    setSending(false);
    setSent(true);
  };

  if (sent) {
    return (
      <View style={[styles.callout, { backgroundColor: Colors.safeBg, borderColor: Colors.safeBorder, borderLeftColor: Colors.safe }]}>
        <Text style={[styles.calloutHeading, { color: Colors.safe }]}>{t('cmsPage.messageSentTitle')}</Text>
        <Text style={[styles.calloutBody, { color: Colors.textSecondary }]}>{t('cmsPage.messageSentBody', { name })}</Text>
      </View>
    );
  }

  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionHeading}>{t('cmsPage.sendMessageHeading')}</Text>
      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>{t('cmsPage.yourNameLabel')}</Text>
        <TextInput style={styles.formInput} value={name} onChangeText={setName} placeholder={t('cmsPage.yourNamePlaceholder')} placeholderTextColor={Colors.textMuted} />
      </View>
      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>{t('cmsPage.emailLabel')}</Text>
        <TextInput style={styles.formInput} value={email} onChangeText={setEmail} placeholder={t('cmsPage.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={Colors.textMuted} />
      </View>
      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>{t('cmsPage.subjectLabel')}</Text>
        <TextInput style={styles.formInput} value={subject} onChangeText={setSubject} placeholder={t('cmsPage.subjectPlaceholder')} placeholderTextColor={Colors.textMuted} />
      </View>
      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>{t('cmsPage.messageLabel')}</Text>
        <TextInput style={[styles.formInput, { height: 100, textAlignVertical: 'top' }]} value={message} onChangeText={setMessage} placeholder={t('cmsPage.messagePlaceholder')} multiline placeholderTextColor={Colors.textMuted} />
      </View>
      <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={handleSend} disabled={sending} activeOpacity={0.88}>
        {sending ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.sendBtnText}>{t('cmsPage.sendMessageButton')}</Text>}
      </TouchableOpacity>
    </View>
  );
}

function createStyles(rw: (n: number) => number, rh: (n: number) => number, rf: (n: number) => number, rr: (n: number) => number) {
  return StyleSheet.create({
  container:     { flex: 1, backgroundColor: Colors.bg },
  topBar:        { backgroundColor: Colors.surface, borderBottomWidth: 1, borderColor: Colors.border, paddingHorizontal: rw(16), paddingVertical: rh(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn:      { minWidth: rw(60) },
  closeBtnText:  { fontSize: rf(14), fontWeight: '600', color: Colors.navyMid },
  topBarTitle:   { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  loader:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: rh(12) },
  loaderText:    { fontSize: rf(13), color: Colors.textMuted },
  content:       { padding: rw(20), paddingBottom: rh(48) },
  pageHeader:    { marginBottom: rh(24) },
  pageTitle:     { fontSize: rf(24), fontWeight: '800', color: Colors.textPrimary, lineHeight: rf(32), marginBottom: rh(6) },
  pageSubtitle:  { fontSize: rf(15), color: Colors.textSecondary, lineHeight: rf(22), marginBottom: rh(8) },
  pageUpdated:   { fontSize: rf(10), color: Colors.textMuted, fontFamily: 'monospace', letterSpacing: 0.5 },

  sectionWrap:   { marginBottom: rh(20) },
  headingDivider: { height: rh(2), backgroundColor: Colors.border, marginBottom: rh(14) },
  sectionHeading: { fontSize: rf(17), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(10) },
  sectionBody:   { fontSize: rf(14), color: Colors.textSecondary, lineHeight: rf(23) },

  callout:       { borderRadius: rr(12), borderWidth: 1, borderLeftWidth: 4, padding: rw(14), marginBottom: rh(16) },
  calloutHeading: { fontSize: rf(14), fontWeight: '700', marginBottom: rh(6) },
  calloutBody:   { fontSize: rf(13), lineHeight: rf(21) },

  faqItem:       { backgroundColor: Colors.surface, borderRadius: rr(10), borderWidth: 1, borderColor: Colors.border, marginBottom: rh(8), overflow: 'hidden', ...Shadow.card },
  faqQuestion:   { flexDirection: 'row', alignItems: 'center', padding: rw(14), gap: rw(10) },
  faqQuestionText: { flex: 1, fontSize: rf(14), fontWeight: '600', color: Colors.textPrimary, lineHeight: rf(20) },
  faqChevron:    { fontSize: rf(11), color: Colors.textMuted },
  faqAnswer:     { padding: rw(14), paddingTop: 0, borderTopWidth: 1, borderColor: Colors.border },
  faqAnswerText: { fontSize: rf(13), color: Colors.textSecondary, lineHeight: rf(21) },

  featureItem:   { flexDirection: 'row', alignItems: 'flex-start', gap: rw(12), backgroundColor: Colors.surface, borderRadius: rr(10), borderWidth: 1, borderColor: Colors.border, padding: rw(14), marginBottom: rh(8), ...Shadow.card },
  featureIcon:   { fontSize: rf(22), marginTop: rh(1), width: rw(28), textAlign: 'center' },
  featureTitle:  { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(4) },
  featureBody:   { fontSize: rf(12), color: Colors.textSecondary, lineHeight: rf(19) },
  featureArrow:  { fontSize: rf(16), color: Colors.navyMid, marginTop: rh(2) },

  formGroup:     { marginBottom: rh(14) },
  formLabel:     { fontSize: rf(9), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5, marginBottom: rh(6), fontFamily: 'monospace' },
  formInput:     { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: rr(10), padding: rw(12), fontSize: rf(14), color: Colors.textPrimary },
  sendBtn:       { backgroundColor: Colors.navyMid, borderRadius: rr(12), paddingVertical: rh(14), alignItems: 'center', marginTop: rh(4), ...Shadow.cardMd },
  sendBtnText:   { color: '#FFF', fontWeight: '700', fontSize: rf(14) },
  });
}
