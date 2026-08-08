// Price comparison — scrapes Trolley.co.uk (publicly accessible HTML)
// Trolley aggregates prices from Tesco, Sainsbury's, ASDA, Morrisons, Waitrose, Iceland, Co-op etc.

import cache, { TTL } from '../utils/cache';
import { AppError } from '../utils/AppError';

export interface SupermarketPrice {
  supermarket: string;
  logo: string;
  price: number;
  price_text: string;
  url: string;
  in_stock: boolean;
  unit_price?: string;
  promotion?: string;
  isLink?: boolean;
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
      isLink: false,
    });
  }

  return { name, prices: prices.sort((a, b) => a.price - b.price) };
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
