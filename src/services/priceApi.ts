// Price comparison — scrapes Trolley.co.uk (publicly accessible HTML)
// Trolley aggregates prices from Tesco, Sainsbury's, ASDA, Morrisons, Waitrose, Iceland, Co-op etc.

import cache, { TTL } from '../utils/cache';
import { AppError } from '../utils/AppError';

export interface SupermarketPrice {
  supermarket: string;
  logo: string;
  price: number;             // regular/shelf price
  price_text: string;
  url: string;
  in_stock: boolean;
  unit_price?: string;
  promotion?: string;
  // Loyalty-card price (Tesco Clubcard, Sainsbury's Nectar, etc.), parsed out
  // of `promotion` when present — see parseLoyaltyPrice below. Undefined
  // when this store's block had no card-scheme offer.
  loyaltyPrice?: number;
  loyaltyLabel?: string;      // e.g. "Clubcard Price", "Nectar Price"
  isLink?: boolean;
}

// The price a shopper actually pays at this store: the loyalty-card price
// when one was scraped, otherwise the regular price. Used for sorting/
// "cheapest" so a Clubcard/Nectar deal is reflected in what "cheapest store"
// actually means — not just the shelf price.
export function effectivePrice(sp: SupermarketPrice): number {
  return sp.loyaltyPrice ?? sp.price;
}

// Trolley's `_product-offer` div holds free-text promo copy, e.g.
// "£1.70 CLUBCARD" or "£2.10 Nectar Price" — only a loyalty-card price (not
// "3 FOR 2"/"ROLLBACK"/other generic promos) should ever override the
// displayed/effective price, so this only matches known card-scheme names.
const LOYALTY_SCHEMES: { pattern: RegExp; label: string }[] = [
  { pattern: /clubcard/i, label: 'Clubcard Price' },
  { pattern: /nectar/i,   label: 'Nectar Price' },
];

function parseLoyaltyPrice(promotion: string): { loyaltyPrice?: number; loyaltyLabel?: string } {
  if (!promotion) return {};
  const priceMatch = promotion.match(/£([0-9]+\.[0-9]+)/);
  if (!priceMatch) return {};
  const scheme = LOYALTY_SCHEMES.find(s => s.pattern.test(promotion));
  if (!scheme) return {};
  return { loyaltyPrice: parseFloat(priceMatch[1]), loyaltyLabel: scheme.label };
}

export interface PriceComparison {
  found: boolean;
  product_name: string;
  prices: SupermarketPrice[];
  cheapest: SupermarketPrice | null;
  most_expensive: SupermarketPrice | null;
}

export const SUPERMARKET_COLORS: Record<string, string> = {
  tesco:       '#EE1C2E',
  sainsburys:  '#FF7B00',
  asda:        '#78BE20',
  morrisons:   '#FFC90D',
  waitrose:    '#73AA2D',
  ocado:       '#5C2D91',
  aldi:        '#003882',
  lidl:        '#0050AA',
  coop:        '#00B1E7',
  iceland:     '#CC0000',
  amazon:      '#FF9900',
};

// Real store logos/favicons, fetched by domain via Google's public favicon
// service (https://www.google.com/s2/favicons?domain={domain}&sz=128 — no
// key needed, returns a PNG). NOT Clearbit's old logo.clearbit.com — that
// free API was shut down after Clearbit's acquisition by HubSpot and the
// domain no longer even resolves, which is why logos silently never loaded
// before. Screens should still always be ready for this to fail (offline,
// a domain change, etc.) and fall back to SUPERMARKET_COLORS' plain colour
// in that case — see ShoppingListScreen's logoFailed handling for the
// pattern.
export const SUPERMARKET_LOGOS: Record<string, string> = {
  tesco:       'https://www.google.com/s2/favicons?domain=tesco.com&sz=128',
  sainsburys:  'https://www.google.com/s2/favicons?domain=sainsburys.co.uk&sz=128',
  asda:        'https://www.google.com/s2/favicons?domain=asda.com&sz=128',
  morrisons:   'https://www.google.com/s2/favicons?domain=morrisons.com&sz=128',
  waitrose:    'https://www.google.com/s2/favicons?domain=waitrose.com&sz=128',
  ocado:       'https://www.google.com/s2/favicons?domain=ocado.com&sz=128',
  aldi:        'https://www.google.com/s2/favicons?domain=aldi.co.uk&sz=128',
  lidl:        'https://www.google.com/s2/favicons?domain=lidl.co.uk&sz=128',
  coop:        'https://www.google.com/s2/favicons?domain=coop.co.uk&sz=128',
  iceland:     'https://www.google.com/s2/favicons?domain=iceland.co.uk&sz=128',
  amazon:      'https://www.google.com/s2/favicons?domain=amazon.co.uk&sz=128',
};

// Matches a scraped/display store name (e.g. "Sainsbury's", "ASDA") down to
// one of the slug keys above — same normalise-then-includes logic that used
// to be duplicated separately in ProductScreen.tsx and here.
export function supermarketSlug(name: string): string | null {
  const key = name.toLowerCase().replace(/[' ]/g, '');
  return Object.keys(SUPERMARKET_COLORS).find(k => key.includes(k)) || null;
}

// '#7C8A99' matches theme/medical.ts's Colors.textMuted — not imported
// directly since this file has no other dependency on the theme module.
export function getSupermarketColor(name: string): string {
  const slug = supermarketSlug(name);
  return slug ? SUPERMARKET_COLORS[slug] : '#7C8A99';
}

export function getSupermarketLogo(name: string): string | null {
  const slug = supermarketSlug(name);
  return slug ? SUPERMARKET_LOGOS[slug] || null : null;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-GB,en;q=0.9',
};

// Step 1: Search Trolley for the product, return first product path
async function searchTrolley(query: string): Promise<string | null> {
  try {
    const url = `https://www.trolley.co.uk/search/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract first product URL e.g. /product/anchor-butter/RHP787
    const match = html.match(/href="(\/product\/[^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Step 2: Fetch product page and parse all store prices from HTML
async function scrapeProductPage(path: string): Promise<{ name: string; prices: SupermarketPrice[] }> {
  const res = await fetch(`https://www.trolley.co.uk${path}`, { headers: HEADERS });
  if (!res.ok) throw new AppError('httpError', `HTTP ${res.status}`, { status: res.status });
  const html = await res.text();

  // Extract product name from <title>
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const name = titleMatch ? titleMatch[1].replace(' - Trolley.co.uk', '').trim() : '';

  // Each store block looks like:
  // <div class="_item">
  //   <svg title="Tesco" class="store-logo -tesco">...
  //   <b>&pound;2.60</b>
  //   <div class="_per-item">£1.30 per 100g</div>
  //   <div class="_product-offer">£1.70 CLUBCARD</div>
  //   <a href="https://redirect.trolley.co.uk/open_store.php?..."> VISIT </a>

  const items = html.split('<div class="_item">').slice(1);
  const prices: SupermarketPrice[] = [];

  for (const block of items) {
    // Store name from SVG title
    const storeMatch = block.match(/<svg title="([^"]+)"/);
    if (!storeMatch) continue;
    const supermarket = storeMatch[1];

    // Price from <b>&pound;X.XX</b> — take first price (lowest if promotion)
    const priceMatch = block.match(/<b>&pound;([0-9]+\.[0-9]+)/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[1]);

    // Per-unit price
    const unitMatch = block.match(/_per-item[^>]*>([^<]+)</);
    const unit_price = unitMatch ? unitMatch[1].trim() : '';

    // Promotion
    const promoMatch = block.match(/_product-offer[^>]*>([^<]+)</);
    const promotion = promoMatch ? promoMatch[1].trim() : '';
    const { loyaltyPrice, loyaltyLabel } = parseLoyaltyPrice(promotion);

    // Visit link
    const urlMatch = block.match(/href="(https:\/\/redirect\.trolley\.co\.uk[^"]+)"/);
    const url = urlMatch ? urlMatch[1] : '';

    const smKey = supermarket.toLowerCase().replace(/[' ]/g, '');

    prices.push({
      supermarket,
      logo: '',
      price,
      price_text: `£${price.toFixed(2)}`,
      url,
      in_stock: true,
      unit_price,
      promotion,
      loyaltyPrice,
      loyaltyLabel,
      isLink: false,
    });
  }

  // Sorted by effective (loyalty-aware) price — a Clubcard/Nectar deal
  // should be able to make a store "cheapest" even if its shelf price isn't.
  return { name, prices: prices.sort((a, b) => effectivePrice(a) - effectivePrice(b)) };
}

// Fallback: direct supermarket search links
function buildSearchLinks(barcode: string, productName: string): SupermarketPrice[] {
  const q = encodeURIComponent(productName || barcode);
  return [
    { supermarket: 'Tesco',          url: `https://www.tesco.com/groceries/en-GB/search?query=${q}`,           price: 0, price_text: 'Check price', logo: '', in_stock: true, isLink: true },
    { supermarket: "Sainsbury's",    url: `https://www.sainsburys.co.uk/gol-ui/SearchDisplayView?searchTerm=${q}`, price: 0, price_text: 'Check price', logo: '', in_stock: true, isLink: true },
    { supermarket: 'ASDA',           url: `https://groceries.asda.com/search/${q}`,                             price: 0, price_text: 'Check price', logo: '', in_stock: true, isLink: true },
    { supermarket: 'Morrisons',      url: `https://groceries.morrisons.com/search?entry=${q}`,                  price: 0, price_text: 'Check price', logo: '', in_stock: true, isLink: true },
    { supermarket: 'Ocado',          url: `https://www.ocado.com/search?entry=${q}`,                            price: 0, price_text: 'Check price', logo: '', in_stock: true, isLink: true },
  ];
}

export async function fetchPricesByBarcode(barcode: string, productName = ''): Promise<PriceComparison> {
  const cacheKey = `price:${barcode}`;
  const cached = await cache.get<PriceComparison>(cacheKey);
  if (cached) return cached;

  try {
    // Try product name first (Trolley search results are JS-rendered for barcode queries),
    // then fall back to barcode in case name search finds nothing
    const queries = [productName, barcode].filter(Boolean);
    let productPath: string | null = null;

    for (const q of queries) {
      productPath = await searchTrolley(q);
      if (productPath) break;
    }

    if (!productPath) throw new AppError('productNotFound', 'Product not found on Trolley');

    const { name, prices } = await scrapeProductPage(productPath);

    if (prices.length === 0) throw new AppError('noPricesParsed', 'No prices parsed');

    const result: PriceComparison = {
      found: true,
      product_name: name || productName,
      prices,
      cheapest: prices[0],
      most_expensive: prices[prices.length - 1],
    };
    await cache.set(cacheKey, result, TTL.PRICE);
    return result;
  } catch (err) {
    console.warn('Trolley scrape failed, showing search links:', err);
    // Not cached — a transient scrape failure shouldn't get "stuck" for an hour.
    const links = buildSearchLinks(barcode, productName);
    return { found: false, product_name: productName, prices: links, cheapest: null, most_expensive: null };
  }
}
