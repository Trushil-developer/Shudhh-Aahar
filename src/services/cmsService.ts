// src/services/cmsService.ts
// CMS (Content Management System) for all static pages
// Pages are managed in the admin panel and fetched by the app
// Falls back to built-in default content if network unavailable

import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from '../utils/logger';
import { graphqlRequest } from './userDataService';

// ─── Types ────────────────────────────────────────────────────

export type PageSlug =
  | 'privacy-policy'
  | 'terms-of-service'
  | 'about'
  | 'faq'
  | 'contact'
  | 'how-it-works'
  | 'allergen-guide'
  | 'subscription-info';

export interface CMSPage {
  slug: PageSlug;
  title: string;
  subtitle?: string;
  lastUpdated: string;
  sections: CMSSection[];
}

export interface CMSSection {
  id: string;
  type: 'heading' | 'body' | 'callout' | 'faq' | 'contact-form' | 'feature-list';
  heading?: string;
  body?: string;
  items?: CMSItem[];
  style?: 'info' | 'warning' | 'success' | 'danger';
}

export interface CMSItem {
  icon?: string;
  title: string;
  body?: string;
  link?: string;
}

// ─── GraphQL query ────────────────────────────────────────────
const CACHE_PREFIX = 'shuddhaahar_cms_';
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

const GET_CMS_PAGE = /* GraphQL */ `
  query GetCMSPage($slug: ID!) {
    getCMSPage(slug: $slug) {
      slug
      title
      subtitle
      sections
      lastUpdated
    }
  }
`;

// ─── Fetch a page ─────────────────────────────────────────────

export async function fetchCMSPage(slug: PageSlug): Promise<CMSPage> {
  const cacheKey = CACHE_PREFIX + slug;

  // Try cache first
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const { page, cachedAt } = JSON.parse(raw);
      if (Date.now() - cachedAt < CACHE_TTL) {
        logger.debug('cms', `Cache hit: ${slug}`);
        return page;
      }
    }
  } catch { /* ignore */ }

  // Fetch from AppSync — admin hasn't necessarily customised every page, so
  // a null result (not yet edited in admin) falls through to defaults below,
  // same as a network failure would.
  try {
    const data = await graphqlRequest(GET_CMS_PAGE, { slug });
    if (data.getCMSPage) {
      // `sections` comes back as a JSON-text string (AWSJSON) — parse once.
      const page: CMSPage = {
        ...data.getCMSPage,
        sections: JSON.parse(data.getCMSPage.sections),
      };
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ page, cachedAt: Date.now() }));
      return page;
    }
  } catch (err) {
    logger.warn('cms', `Failed to fetch ${slug} — using default`, {}, err as Error);
  }

  // Fallback to built-in defaults
  return DEFAULT_PAGES[slug] || DEFAULT_PAGES['about'];
}

// ─── Built-in default page content ───────────────────────────
// These are shown when network is unavailable or API is down

export const DEFAULT_PAGES: Record<PageSlug, CMSPage> = {

  'how-it-works': {
    slug: 'how-it-works',
    title: 'How Shuddh Aahar Works',
    subtitle: 'Your personal clinical nutrition intelligence',
    lastUpdated: '2026-06-01',
    sections: [
      {
        id: '1', type: 'callout', style: 'info',
        heading: '✚ Built for your health, not the average',
        body: 'Most nutrition apps give you generic scores. Shuddh Aahar cross-references every product against YOUR personal health profile — your allergies, medical conditions, medications and dietary goals.',
      },
      {
        id: '2', type: 'feature-list',
        heading: 'Step by Step',
        items: [
          { icon: '1️⃣', title: 'Set up your Health Profile', body: 'Add your allergies, intolerances, medical conditions (e.g. Type 2 Diabetes, Hypertension), medications and dietary preferences. You can also upload medical documents and our AI will read them automatically.' },
          { icon: '2️⃣', title: 'Scan Any Product', body: 'Point your camera at any barcode. Shuddh Aahar instantly looks up the product from our database of 5+ million items, covering supermarket products in every market we support.' },
          { icon: '3️⃣', title: 'Get Your AI Health Assessment', body: 'AI analyses the product specifically for you. You get a personal suitability score (0–10), plain-English warnings, and a recommendation.' },
          { icon: '4️⃣', title: 'Compare Prices', body: 'See prices across supported local supermarkets — all on one screen. Tap any store to buy directly.' },
          { icon: '5️⃣', title: 'Track Your Diet', body: 'Log scanned products to your daily food diary. See calories, macros and progress against recommended daily targets. Your activity from Apple Health / Google Fit adjusts your goals.' },
        ],
      },
      {
        id: '3', type: 'callout', style: 'warning',
        heading: '⚕ Medical Disclaimer',
        body: 'Shuddh Aahar provides nutritional information and AI-assisted guidance for informational purposes only. It is not a substitute for professional medical advice, diagnosis or treatment. Always consult your GP, pharmacist or registered dietitian before making dietary changes, especially if you have a medical condition or take prescription medications.',
      },
    ],
  },

  'faq': {
    slug: 'faq',
    title: 'Frequently Asked Questions',
    subtitle: 'Everything you need to know about Shuddh Aahar',
    lastUpdated: '2026-06-01',
    sections: [
      {
        id: '1', type: 'faq',
        heading: 'Scanning & Products',
        items: [
          { title: 'How accurate is the product data?', body: 'We source data from Open Food Facts, the world\'s largest open food database with 5+ million products. Every product is scored for data accuracy (A–F grade) and we flag when data may be incomplete. We always recommend verifying allergen information against the physical product label.' },
          { title: 'What if a product isn\'t found?', body: 'If a product isn\'t in our database, you\'ll see a "Product Not Found" message. You can help by contributing to Open Food Facts (openfoodfacts.org). We\'re constantly expanding our database coverage.' },
          { title: 'How current are the prices?', body: 'Prices are sourced from our local price comparison provider and updated regularly throughout the day. There may be a short delay between in-store price changes and what we show. Always confirm the final price at checkout.' },
        ],
      },
      {
        id: '2', type: 'faq',
        heading: 'Health Profile & AI',
        items: [
          { title: 'How does the AI health analysis work?', body: 'We use AI to analyse each product against your personal health profile. It considers your allergies, intolerances, medical conditions, medications and dietary goals to generate a personalised suitability score and plain-English explanation.' },
          { title: 'Can I upload my medical records?', body: 'Yes — on any plan, including Free, you can upload medical documents (GP letters, blood tests, prescriptions, hospital discharge summaries). AI reads them and automatically fills in your health profile. Documents are sent directly for analysis and are never stored on our servers.' },
          { title: 'Is Shuddh Aahar a medical device?', body: 'No. Shuddh Aahar is a nutritional information tool, not a regulated medical device. It does not diagnose, treat, cure or prevent any medical condition. The information is for general guidance only. Please consult a qualified healthcare professional for medical advice.' },
          { title: 'How many people can use one account?', body: 'Shuddh Aahar currently supports one health profile per account on every plan. Family/multi-profile accounts aren\'t available yet.' },
        ],
      },
      {
        id: '3', type: 'faq',
        heading: 'Subscriptions & Billing',
        items: [
          { title: 'Can I cancel anytime?', body: 'Yes, absolutely. You can cancel your subscription at any time from your Profile → Manage Subscription. You\'ll keep access until the end of your current billing period. No cancellation fees, no questions asked.' },
          { title: 'What happens to my data if I cancel?', body: 'Your health profile and scan history are retained for 30 days after cancellation in case you reactivate. After 30 days, your data is permanently deleted unless you exercise your right to erasure earlier via Profile → Delete My Data.' },
          { title: 'Is there a free trial?', body: 'Yes — the Member plan includes a 7-day free trial for new subscribers. You won\'t be charged until the trial ends. You can cancel during the trial at no cost.' },
          { title: 'What payment methods do you accept?', body: 'Payment is handled entirely by Apple (App Store) or Google (Play Store), using whatever payment method you already have on file with them. Shuddh Aahar never sees or stores your card details.' },
        ],
      },
      {
        id: '4', type: 'faq',
        heading: 'Privacy & Data',
        items: [
          { title: 'Is my health data safe?', body: 'Your health data is stored encrypted at rest in AWS DynamoDB. It is accessible only by you, verified via your Google sign-in. Even our admin team cannot read individual health records — we only see anonymised aggregate statistics.' },
          { title: 'Do you sell my data?', body: 'Never. Shuddh Aahar is a paid subscription service. We do not sell, share or monetise your personal or health data with any third parties. See our Privacy Policy for full details.' },
          { title: 'How do I delete my data?', body: 'You have the right to erasure under applicable data protection law. Go to Profile → Delete My Data. All your personal data, health records and scan history will be permanently deleted within 24 hours.' },
        ],
      },
    ],
  },

  'privacy-policy': {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    subtitle: 'How we collect, use and protect your data',
    lastUpdated: '2026-06-01',
    sections: [
      { id: '1', type: 'body', body: 'Last updated: 1 June 2026\n\nShuddh Aahar ("we", "us", "our") is committed to protecting your personal data and complying with applicable data protection laws in each market where Shuddh Aahar operates.' },
      { id: '2', type: 'heading', heading: '1. Data We Collect', body: 'We collect the following categories of personal data:\n\n• Account data: name and email address (via Google Sign-In)\n• Health profile data: allergies, intolerances, medical conditions, medications, dietary preferences and biometric metrics (age, weight, height) — all provided voluntarily\n• Usage data: scan history, products scanned, diary entries\n• Device data: device type, OS version, app version for crash reporting\n• Payment data: handled entirely by Apple/Google in-app purchase — we never see or store your card details' },
      { id: '3', type: 'heading', heading: '2. Legal Basis for Processing', body: 'We process your data under the following legal bases:\n\n• Contract: processing necessary to provide the Shuddh Aahar service you have subscribed to\n• Legitimate interests: improving our service, preventing fraud, security monitoring\n• Consent: processing special category health data (you provide this voluntarily)' },
      { id: '4', type: 'heading', heading: '3. How We Use Your Data', body: 'Your data is used solely to:\n\n• Provide personalised health analysis of scanned products\n• Maintain your health profile and scan history\n• Generate aggregated, anonymised statistics for service improvement\n• Process subscription payments via Apple/Google in-app purchase\n• Send service-related communications (no marketing without explicit consent)' },
      { id: '5', type: 'heading', heading: '4. Data Storage & Security', body: 'Personal data is stored in AWS data centers. Health data is encrypted at rest using AES-256 and in transit using TLS 1.3. Access is controlled with owner-level permissions verified via your Google sign-in — only you can access your own health records.' },
      { id: '6', type: 'heading', heading: '5. Your Data Protection Rights', body: 'Depending on where you live, you have the right to:\n\n• Access: request a copy of your personal data\n• Rectification: correct inaccurate data\n• Erasure: request deletion of your data ("right to be forgotten")\n• Portability: receive your data in a machine-readable format\n• Restriction: limit how we process your data\n• Object: object to processing based on legitimate interests\n\nExercise your rights via Profile → Your Data Rights, or email info@shuddhaahar.shop.' },
      { id: '7', type: 'heading', heading: '6. Data Retention', body: 'Active account data is retained while your account is active. If you cancel, data is retained for 30 days then permanently deleted. Anonymised aggregate statistics may be retained indefinitely.' },
      { id: '8', type: 'heading', heading: '7. Contact', body: 'Data Controller: Shuddh Aahar\nEmail: info@shuddhaahar.shop\n\nIf you have concerns about how we handle your data, you have the right to lodge a complaint with your local data protection authority.' },
    ],
  },

  'terms-of-service': {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    subtitle: 'The rules for using Shuddh Aahar',
    lastUpdated: '2026-06-01',
    sections: [
      { id: '1', type: 'body', body: 'Last updated: 1 June 2026\n\nBy creating an account or using Shuddh Aahar, you agree to these Terms of Service. Please read them carefully.' },
      { id: '2', type: 'heading', heading: '1. Service Description', body: 'Shuddh Aahar provides nutritional information, AI-assisted health guidance and local supermarket price comparison. It is an informational tool only and does not constitute medical advice, diagnosis or treatment.' },
      { id: '3', type: 'heading', heading: '2. Eligibility', body: 'You must be at least 13 years old to use Shuddh Aahar. By using the service, you confirm you meet this requirement. Users under 18 should use Shuddh Aahar with parental guidance, especially when the app relates to medical conditions or medications.' },
      { id: '4', type: 'heading', heading: '3. Subscriptions & Payment', body: 'The Member plan (£3.99/month or £50/year) includes a 7-day free trial for new subscribers. You may cancel at any time before the trial ends without charge.\n\nSubscriptions auto-renew unless cancelled at least 24 hours before the renewal date. Payments are processed by Apple (App Store) or Google (Play Store) in-app purchase — Shuddh Aahar never sees or stores your card details. Prices are in GBP inclusive of VAT.' },
      { id: '5', type: 'heading', heading: '4. Cancellation & Refunds', body: 'You may cancel your subscription at any time. Access continues until the end of the paid period. We offer refunds at our discretion for genuine billing errors. Annual subscriptions may be refunded on a pro-rata basis within 14 days of purchase, in line with applicable consumer protection law in your market.' },
      { id: '6', type: 'heading', heading: '5. Medical Disclaimer', body: 'Shuddh Aahar is NOT a medical device and does NOT provide medical advice. Information is for general informational purposes only. Always consult a qualified healthcare professional before making dietary changes based on information provided by Shuddh Aahar, especially if you have a medical condition or take prescription medications.' },
      { id: '7', type: 'heading', heading: '6. Accuracy Disclaimer', body: 'Product data is sourced from Open Food Facts and may not always be complete or up to date. Prices are sourced from local price comparison providers where available. We do not guarantee the accuracy of any product information. Always verify allergen information against the physical product label before consumption.' },
      { id: '8', type: 'heading', heading: '7. Acceptable Use', body: 'You agree not to: reverse engineer the app; attempt to access other users\' data; use the service for commercial data scraping; or misuse our AI analysis systems.' },
      { id: '9', type: 'heading', heading: '8. Governing Law', body: 'These terms are governed by the laws of England and Wales. Disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.' },
    ],
  },

  'about': {
    slug: 'about',
    title: 'About Shuddh Aahar',
    subtitle: 'Clinical nutrition intelligence for everyone',
    lastUpdated: '2026-06-01',
    sections: [
      { id: '1', type: 'body', body: 'Shuddh Aahar was built with one goal: to make it genuinely easy for people to understand what they\'re eating — and whether it\'s right for them specifically, not just for the average person.' },
      { id: '2', type: 'callout', style: 'info', heading: 'Our Mission', body: 'To put clinical-grade nutritional intelligence in everyone\'s pocket. Your allergies, your medical conditions, your medications — they should all be factored in before you put something in your basket.' },
      { id: '3', type: 'feature-list', heading: 'What makes us different',
        items: [
          { icon: '🤖', title: 'Genuinely personalised AI', body: 'We use AI to reason about products specifically for your health profile — not a generic traffic-light system.' },
          { icon: '💷', title: 'Local price intelligence', body: 'The only food scanner that shows you prices across all major local supermarkets simultaneously.' },
          { icon: '🏥', title: 'Clinically informed', body: 'Built with input from registered dietitians and recognised nutritional guidelines.' },
          { icon: '🔒', title: 'Privacy first', body: 'Your health data is yours. Encrypted, never sold, accessible only to you.' },
        ],
      },
      { id: '4', type: 'heading', heading: 'Our Data Sources', body: '• Product data: Open Food Facts (openfoodfacts.org) — 5M+ products\n• Local prices: sourced from regional price comparison providers — updated daily\n• AI analysis: personalised health scoring\n• Health storage: AWS DynamoDB\n• Payments: Apple In-App Purchase / Google Play Billing' },
      { id: '5', type: 'heading', heading: 'Contact', body: 'Email: info@shuddhaahar.shop' },
    ],
  },

  'contact': {
    slug: 'contact',
    title: 'Contact Us',
    subtitle: 'We\'re here to help',
    lastUpdated: '2026-06-01',
    sections: [
      { id: '1', type: 'contact-form', heading: 'Send us a message' },
      { id: '2', type: 'feature-list', heading: 'Or email us directly',
        items: [
          { icon: '📧', title: 'Email us directly', body: 'info@shuddhaahar.shop', link: 'mailto:info@shuddhaahar.shop' },
        ],
      },
      { id: '3', type: 'callout', style: 'info', heading: 'Response times', body: 'Support requests: within 24 hours (Mon–Fri)\nPrivacy/data requests: within 72 hours as required by applicable law\nBilling queries: within 48 hours' },
    ],
  },

  'allergen-guide': {
    slug: 'allergen-guide',
    title: 'Allergen Guide',
    subtitle: 'The 14 major allergens and what to look for',
    lastUpdated: '2026-06-01',
    sections: [
      { id: '1', type: 'body', body: 'Shuddh Aahar tracks 14 major allergens commonly required to be labelled under food safety regulations (e.g. UK/EU Food Information Regulations). Local requirements vary by market — Shuddh Aahar automatically detects and highlights all 14 in every product it analyses.' },
      { id: '2', type: 'feature-list', heading: 'The 14 Major Allergens',
        items: [
          { icon: '🌾', title: 'Cereals containing gluten', body: 'Wheat, rye, barley, oats, spelt, kamut and their hybrids. Found in bread, pasta, pastry, cakes, biscuits, beer.' },
          { icon: '🦀', title: 'Crustaceans', body: 'Prawns, crabs, lobster, crayfish. Often found in seafood dishes, sauces, stocks.' },
          { icon: '🥚', title: 'Eggs', body: 'Found in mayonnaise, pasta, quiche, cakes, sauces, mousses.' },
          { icon: '🐟', title: 'Fish', body: 'Found in marinades, salad dressings, pizza, Worcestershire sauce, anchovy paste.' },
          { icon: '🥜', title: 'Peanuts', body: 'Found in peanut butter, satay sauce, pralines, snacks. One of the most common causes of severe allergic reactions.' },
          { icon: '🫘', title: 'Soybeans', body: 'Found in tofu, soy sauce, miso, meat products, desserts.' },
          { icon: '🥛', title: 'Milk', body: 'Found in butter, cheese, cream, milk powder, yoghurt, many processed foods.' },
          { icon: '🌰', title: 'Nuts', body: 'Almonds, hazelnuts, walnuts, cashews, pecans, Brazils, pistachios, macadamias. Found in bread, sauces, marzipan.' },
          { icon: '🌿', title: 'Celery', body: 'Found in celery salt, salads, soups, sauces, stock cubes.' },
          { icon: '🟡', title: 'Mustard', body: 'Found in liquid mustard, mustard powder, prepared meats, salad dressings, marinades.' },
          { icon: '🫛', title: 'Sesame seeds', body: 'Found in bread, breadsticks, tahini, hummus, many Asian dishes.' },
          { icon: '🍷', title: 'Sulphur dioxide & sulphites', body: 'Found in dried fruits, wine, beer, soft drinks, meat products (>10 mg/kg or 10 mg/litre).' },
          { icon: '🌼', title: 'Lupin', body: 'Found in lupin flour and seeds — used in pastry, pasta, sauces.' },
          { icon: '🦑', title: 'Molluscs', body: 'Clams, mussels, oysters, squid. Found in seafood dishes, sauces, Thai/Chinese sauces.' },
        ],
      },
      { id: '3', type: 'callout', style: 'warning', heading: '⚠ Always Check the Label', body: 'While we do our best to identify allergens from our database, formulations change. ALWAYS check the physical product label for the most current allergen information, especially if you have a severe allergy or anaphylaxis risk.' },
    ],
  },

  'subscription-info': {
    slug: 'subscription-info',
    title: 'Subscription Plans',
    subtitle: 'Choose the plan that\'s right for you',
    lastUpdated: '2026-06-01',
    sections: [
      { id: '1', type: 'feature-list', heading: 'What\'s included in each plan',
        items: [
          { icon: '🆓', title: 'Free', body: '3 free scans a day\nEvery feature unlocked on those scans — AI health analysis, price comparison, Personal Score, lowest price & wishlist\nMedical document upload' },
          { icon: '⭐', title: 'Member — £3.99/month or £50/year', body: 'Unlimited scans\nAI health analysis\nPrice comparison, Personal Score & lowest-price reveal\nWishlist\nFood diary & macro tracking\nMedical document upload (AI reads your records)\nApple Health / Google Fit sync\n7-day free trial' },
        ],
      },
      { id: '2', type: 'callout', style: 'success', heading: 'Cancel anytime, no questions asked', body: 'The Member plan can be cancelled at any time from Profile → Manage Subscription. You\'ll retain access until the end of your current billing period. Annual plans may be refunded on a pro-rata basis within 14 days of purchase.' },
    ],
  },
};
