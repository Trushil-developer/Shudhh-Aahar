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
// Shown until a page is customised in Admin → CMS Pages, or when offline.
// Keep in step with web/terms.html and web/privacy.html. Never name where
// product data, photos or prices come from.

export const DEFAULT_PAGES: Record<PageSlug, CMSPage> = {

  'how-it-works': {
    slug: 'how-it-works',
    title: 'How Shuddh Aahar Works',
    subtitle: 'We shop at your supermarket and bring it to your door',
    lastUpdated: '2026-11-14',
    sections: [
      {
        id: '1', type: 'callout', style: 'info',
        heading: '🚚 Delivered within 24 hours',
        body: 'We deliver every day between 5pm and 8pm. There is nothing to pay until your order arrives.',
      },
      {
        id: '2', type: 'feature-list',
        heading: 'Step by step',
        items: [
          { icon: '1️⃣', title: 'Choose your supermarket', body: 'Pick the supermarket you usually shop at. We show you its products and shelf prices. You can change it at any time.' },
          { icon: '2️⃣', title: 'Find what you need', body: 'Type a product name in the search bar, or scan the barcode on a pack with your phone camera. Each product shows its ingredients and allergens where we have them.' },
          { icon: '3️⃣', title: 'Fill your basket', body: 'Tap Add to put items in your basket. At the basket you can buy everything from your supermarket, or choose Best price and we buy each item wherever it is cheapest.' },
          { icon: '4️⃣', title: 'Check out', body: 'Sign in, add your delivery address and check that we deliver to your postcode. Then place your order.' },
          { icon: '5️⃣', title: 'We shop and deliver', body: 'We buy your items in store and deliver within 24 hours, between 5pm and 8pm. You pay the shop prices plus any delivery fee, by cash or card, when your order arrives.' },
        ],
      },
      {
        id: '3', type: 'callout', style: 'warning',
        heading: '⚠ Allergies',
        body: 'Product information can change when a manufacturer changes a recipe. If you have an allergy, always check the label on the pack before eating.',
      },
    ],
  },

  'faq': {
    slug: 'faq',
    title: 'Frequently Asked Questions',
    subtitle: 'Everything you need to know about Shuddh Aahar',
    lastUpdated: '2026-11-14',
    sections: [
      {
        id: '1', type: 'faq',
        heading: 'Ordering',
        items: [
          { title: 'What can I order?', body: 'Anything you would buy at the supermarkets we shop at. Search by name or scan the barcode on a pack you already have.' },
          { title: 'What is Best price?', body: 'At the basket you can choose to buy everything from your chosen supermarket, or choose Best price. With Best price we buy each item from whichever of our supermarkets has it cheapest.' },
          { title: 'Do I need an account?', body: 'You can browse and fill your basket without one. To check out and follow your order, sign in with your Google account (or Apple in our app).' },
          { title: 'Can I cancel my order?', body: 'Yes, while it shows "Order placed" and before we have done your shopping. Open the order and tap Cancel order. Once we have shopped for it, please contact us.' },
          { title: 'What if an item is not available?', body: 'If we can\'t get an item, it is marked "Not available" on your bill and you don\'t pay for it.' },
        ],
      },
      {
        id: '2', type: 'faq',
        heading: 'Prices & Payment',
        items: [
          { title: 'How much will I pay?', body: 'You pay the price we pay in store for each item, plus any delivery fee. The prices you see before ordering are estimates based on supermarket shelf prices. Your final bill shows the exact prices once we have shopped.' },
          { title: 'Is there a delivery fee?', body: 'Your basket shows the delivery fee before you order, and how much more you need to spend for free delivery when that applies.' },
          { title: 'How do I pay?', body: 'You pay on delivery, by cash or card. We never ask for card details on the website or in the app.' },
          { title: 'Do supermarket offers apply?', body: 'You pay what we pay in store. Where a price depends on a supermarket loyalty card, the product page says so.' },
        ],
      },
      {
        id: '3', type: 'faq',
        heading: 'Delivery',
        items: [
          { title: 'When will my order arrive?', body: 'Within 24 hours of ordering, between 5pm and 8pm. We deliver every day.' },
          { title: 'Where do you deliver?', body: 'We deliver within a set distance of our base. Enter your postcode at checkout and we will tell you straight away if we deliver there.' },
          { title: 'Can I follow my order?', body: 'Yes. Go to Orders to see whether your order is placed, out for delivery or delivered, and to see your bill.' },
        ],
      },
      {
        id: '4', type: 'faq',
        heading: 'Products',
        items: [
          { title: 'How accurate is the product information?', body: 'We show ingredients, allergens and photos to help you choose, but manufacturers change their products. Information may not always be complete or up to date. If you have an allergy, always check the label on the pack.' },
          { title: 'What if I can\'t find a product?', body: 'Try a shorter or different search word, or scan the barcode on the pack. If it still doesn\'t show, contact us and tell us what you need.' },
        ],
      },
      {
        id: '5', type: 'faq',
        heading: 'Privacy & Data',
        items: [
          { title: 'Is my data safe?', body: 'Your account, address and orders are stored securely and encrypted. Only you and the people who process your orders can see them.' },
          { title: 'Do you sell my data?', body: 'Never. We do not sell or share your personal data for marketing. See our Privacy Policy for full details.' },
          { title: 'How do I delete my data?', body: 'Go to Profile → Delete My Data in the app, use the Delete My Data page on our website, or email info@shuddhaahar.shop.' },
        ],
      },
    ],
  },

  'privacy-policy': {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    subtitle: 'How we collect, use and protect your data',
    lastUpdated: '2026-11-14',
    sections: [
      { id: '1', type: 'body', body: 'Last updated: 14 November 2026\n\nShuddh Aahar ("we", "us", "our") shops at UK supermarkets for our customers and delivers their groceries. We are committed to protecting your personal data and complying with UK data protection law.' },
      { id: '2', type: 'heading', heading: '1. Data We Collect', body: 'We collect:\n\n• Account data: your name and email address, when you sign in with Google or Apple\n• Delivery data: your delivery address, postcode, phone number (optional) and any delivery note\n• Order data: the items you order, your bills and delivery status\n• Shopping data: your chosen supermarket, your basket and items you save to your account\n• Device data: device type, operating system and app version, for fixing errors\n\nIf you used our earlier health features, any health profile you saved stays private to your account until you delete it.\n\nWe do not collect card details. You pay on delivery.' },
      { id: '3', type: 'heading', heading: '2. Legal Basis for Processing', body: '• Contract: to take, shop for and deliver your orders\n• Legitimate interests: running and improving our service, preventing fraud and keeping it secure\n• Consent: for any health information you chose to give us' },
      { id: '4', type: 'heading', heading: '3. How We Use Your Data', body: 'We use your data to:\n\n• Check that we deliver to your postcode\n• Shop for, price and deliver your order\n• Show you your orders and bills\n• Keep your basket, saved items and supermarket choice in step across your devices\n• Contact you about your order\n\nWe do not send marketing without your consent, and we never sell your data.' },
      { id: '5', type: 'heading', heading: '4. Who We Share It With', body: 'We share only what is needed to run the service:\n\n• Our hosting provider, which stores our data in the UK\n• A postcode lookup service, which receives your postcode to check our delivery area\n• Google or Apple, to sign you in\n\nYour name, address and phone number are used only to deliver your order.' },
      { id: '6', type: 'heading', heading: '5. Data Storage & Security', body: 'Your data is stored in UK data centres and encrypted at rest and in transit. Only you can see your account through the app and website, and only the people who process your orders can see your order and delivery details.' },
      { id: '7', type: 'heading', heading: '6. Your Data Protection Rights', body: 'You have the right to:\n\n• Access: request a copy of your personal data\n• Rectification: correct inaccurate data\n• Erasure: request deletion of your data\n• Portability: receive your data in a machine-readable format\n• Restriction: limit how we process your data\n• Object: object to processing based on legitimate interests\n\nUse Profile → Delete My Data in the app, the Delete My Data page on our website, or email info@shuddhaahar.shop.' },
      { id: '8', type: 'heading', heading: '7. Data Retention', body: 'We keep your account data while your account is open. When you ask us to delete your account, we delete your personal data within 72 hours, except order records we must keep by law.' },
      { id: '9', type: 'heading', heading: '8. Contact', body: 'Data Controller: Shuddh Aahar\nEmail: info@shuddhaahar.shop\n\nIf you are unhappy with how we handle your data, you can complain to the Information Commissioner\'s Office (ico.org.uk).' },
    ],
  },

  'terms-of-service': {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    subtitle: 'The rules for using Shuddh Aahar',
    lastUpdated: '2026-11-14',
    sections: [
      { id: '1', type: 'body', body: 'Last updated: 14 November 2026\n\nBy using Shuddh Aahar or placing an order, you agree to these Terms of Service. Please read them carefully.' },
      { id: '2', type: 'heading', heading: '1. Our Service', body: 'Shuddh Aahar is a grocery shopping and delivery service. You choose products from UK supermarkets, we buy them in store for you and deliver them to your door.' },
      { id: '3', type: 'heading', heading: '2. Eligibility', body: 'You must be at least 13 years old to use Shuddh Aahar. You must be 18 or over, or have a parent or guardian\'s permission, to place an order.' },
      { id: '4', type: 'heading', heading: '3. Orders', body: 'When you place an order, you ask us to buy the listed items for you. We buy them from your chosen supermarket or, if you choose Best price, from whichever of our supermarkets has each item cheapest.\n\nIf an item is not available, we mark it "Not available" on your bill and you don\'t pay for it. We may cancel an order if we can\'t fulfil it, and we will let you know.' },
      { id: '5', type: 'heading', heading: '4. Prices & Payment', body: 'Prices shown before you order are estimates based on supermarket shelf prices and may change. You pay the price we pay in store for each item, plus any delivery fee shown at checkout. Your final bill is in your order once we have shopped.\n\nYou pay on delivery, by cash or card. Prices are in GBP.' },
      { id: '6', type: 'heading', heading: '5. Delivery', body: 'We deliver within 24 hours of your order, every day between 5pm and 8pm, to addresses within our delivery area. We check your postcode at checkout. Please make sure someone is available to receive and pay for the order.' },
      { id: '7', type: 'heading', heading: '6. Cancellation & Problems', body: 'You can cancel an order in the app or on the website while it shows "Order placed", before we have shopped for it. After that, please contact us.\n\nIf anything is wrong with your delivery, email info@shuddhaahar.shop and we will put it right where we can. This does not affect your statutory rights.' },
      { id: '8', type: 'heading', heading: '7. Product Information', body: 'Product information and photos are for guidance only and may not always be complete or up to date. Brand names and packaging belong to their owners. Always check allergen information on the product label before eating.' },
      { id: '9', type: 'heading', heading: '8. Acceptable Use', body: 'You agree not to: reverse engineer the app or website; attempt to access other users\' data; scrape our service; or place false orders.' },
      { id: '10', type: 'heading', heading: '9. Governing Law', body: 'These terms are governed by the laws of England and Wales. Disputes are subject to the exclusive jurisdiction of the courts of England and Wales.' },
    ],
  },

  'about': {
    slug: 'about',
    title: 'About Shuddh Aahar',
    subtitle: 'Everyday groceries, delivered to your door',
    lastUpdated: '2026-11-14',
    sections: [
      { id: '1', type: 'body', body: 'Shuddh Aahar makes grocery shopping simple. Choose what you need from your usual UK supermarket, and we shop for you and bring it to your door.' },
      { id: '2', type: 'callout', style: 'info', heading: 'Our promise', body: 'We deliver within 24 hours, every day between 5pm and 8pm. You pay the shop prices on delivery, by cash or card.' },
      { id: '3', type: 'feature-list', heading: 'Why shop with us',
        items: [
          { icon: '🛒', title: 'Your supermarket', body: 'Order from the supermarket you already know, or choose Best price and we buy each item wherever it is cheapest.' },
          { icon: '🥗', title: 'Know what you\'re buying', body: 'See the ingredients and allergens for products before you order.' },
          { icon: '💷', title: 'Shop prices, paid on delivery', body: 'You pay what we pay in store, plus any delivery fee. Nothing to pay until your order arrives.' },
          { icon: '🔒', title: 'Privacy first', body: 'Your details are used only to deliver your order. We never sell your data.' },
        ],
      },
      { id: '4', type: 'heading', heading: 'Contact', body: 'Email: info@shuddhaahar.shop' },
    ],
  },

  'contact': {
    slug: 'contact',
    title: 'Contact Us',
    subtitle: 'We\'re here to help',
    lastUpdated: '2026-11-14',
    sections: [
      { id: '1', type: 'contact-form', heading: 'Send us a message' },
      { id: '2', type: 'feature-list', heading: 'Or email us directly',
        items: [
          { icon: '📧', title: 'Email us directly', body: 'info@shuddhaahar.shop', link: 'mailto:info@shuddhaahar.shop' },
        ],
      },
      { id: '3', type: 'callout', style: 'info', heading: 'Response times', body: 'Order and support questions: within 24 hours (Mon to Fri)\nPrivacy and data requests: within 72 hours\n\nFor a question about an order, please include your order number.' },
    ],
  },

  'allergen-guide': {
    slug: 'allergen-guide',
    title: 'Allergen Guide',
    subtitle: 'The 14 major allergens and what to look for',
    lastUpdated: '2026-11-14',
    sections: [
      { id: '1', type: 'body', body: 'UK food law requires 14 major allergens to be labelled. Where we have the information, Shuddh Aahar shows the allergens for each product before you order.' },
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
          { icon: '🌼', title: 'Lupin', body: 'Found in lupin flour and seeds, used in pastry, pasta, sauces.' },
          { icon: '🦑', title: 'Molluscs', body: 'Clams, mussels, oysters, squid. Found in seafood dishes, sauces, Thai/Chinese sauces.' },
        ],
      },
      { id: '3', type: 'callout', style: 'warning', heading: '⚠ Always Check the Label', body: 'Manufacturers change their recipes. ALWAYS check the label on the pack for the latest allergen information, especially if you have a severe allergy or anaphylaxis risk.' },
    ],
  },

  'subscription-info': {
    slug: 'subscription-info',
    title: 'Plans',
    subtitle: 'No subscription needed',
    lastUpdated: '2026-11-14',
    sections: [
      { id: '1', type: 'callout', style: 'success', heading: 'Free to use', body: 'Shuddh Aahar has no membership or subscription. Browsing and ordering are free. You pay only for your groceries and any delivery fee, on delivery.' },
    ],
  },
};
