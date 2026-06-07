#!/usr/bin/env node
/**
 * HungerStation menu-image scraper ("the agent").
 *
 * For each restaurant in config.mjs it:
 *   1. Fetches the HungerStation vendor page and extracts the embedded
 *      Next.js `__NEXT_DATA__` JSON (no headless browser needed — the full
 *      menu is server-rendered into the page).
 *   2. Reads `vendorMenu[].items[]` → { name, price, description, image }.
 *   3. Fuzzy-matches each scraped item to the app's curated menu items
 *      (input/<slug>.app-menu.json) by normalized Arabic name.
 *   4. Downloads the matched image (self-hosted) into output/<slug>/images/.
 *   5. Writes a reviewable bundle.json + report.md.
 *
 * Nothing is written to Supabase — this produces a bundle for review first.
 *
 * Usage:
 *   node scrape.mjs            # all restaurants in config
 *   node scrape.mjs mcdonalds  # only the given slug(s)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESTAURANTS, IMAGE_WIDTH, MATCH_ACCEPT, MATCH_STRONG } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_DIR = path.join(__dirname, 'input');
const OUTPUT_DIR = path.join(__dirname, 'output');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// ---------------------------------------------------------------- Arabic text
// Normalize so "ماك عربيا" matches "ماك عربي", "بيج تيستي" ≈ "بيج تايستي", etc.
const AR_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
function normalizeAr(s = '') {
  return s
    .replace(AR_DIACRITICS, '')        // strip tashkeel + tatweel
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) // arabic-indic → latin digits
    .replace(/[أإآا]/g, 'ا')           // unify alef
    .replace(/ى/g, 'ي')                // alef maqsura → ya
    .replace(/ة/g, 'ه')                // ta marbuta → ha
    .replace(/[ؤئ]/g, 'ء')             // unify hamza carriers
    .replace(/[^ء-ي0-9a-z ]/gi, ' ') // drop punctuation/symbols
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Generic words that shouldn't dominate the match signal.
const STOP = new Set(['مع', 'و', 'من', 'في', 'قطع', 'قطعه', 'حبه', 'حبتين']);

function tokens(s) {
  return normalizeAr(s).split(' ').filter(t => t && !STOP.has(t));
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[0] === undefined ? Infinity : cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

// Combined similarity: token Jaccard (order-independent) blended with a
// whole-string edit-distance ratio (catches spelling variants).
function similarity(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta), sb = new Set(tb);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const jaccard = inter / (sa.size + sb.size - inter);

  const na = normalizeAr(a), nb = normalizeAr(b);
  const editRatio = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);

  return 0.65 * jaccard + 0.35 * editRatio;
}

// ------------------------------------------------------------------ scraping
async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ar' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function extractNextData(html) {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!m) throw new Error('__NEXT_DATA__ not found (page layout changed or vendor closed)');
  return JSON.parse(m[1]);
}

function vendorUrl(r) {
  const enc = s => encodeURIComponent(s);
  return `https://hungerstation.com/sa-ar/restaurant/${enc(r.city)}/${enc(r.district)}/${r.vendorId}`;
}

// Flatten vendorMenu → unique items by id (the same dish appears under several
// promo sections; we keep the first occurrence).
function scrapeMenuItems(nextData) {
  const sections = nextData?.props?.pageProps?.vendorMenu || [];
  const byId = new Map();
  for (const sec of sections) {
    for (const it of sec.items || []) {
      if (it.image && !byId.has(it.id)) {
        byId.set(it.id, {
          hs_id: it.id,
          name_ar: it.name,
          price: it.price != null ? Number(it.price) : null,
          description_ar: it.description || null,
          image: it.image,
          section: sec.name,
        });
      }
    }
  }
  return [...byId.values()];
}

function upscaleImage(url, width) {
  // CDN urls look like ...<hash>.jpg?width=222 — swap/append the width.
  try {
    const u = new URL(url);
    u.searchParams.set('width', String(width));
    return u.toString();
  } catch {
    return url;
  }
}

async function downloadImage(url, destNoExt) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`image HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = `${destNoExt}.${ext}`;
  fs.writeFileSync(dest, buf);
  return { file: path.basename(dest), bytes: buf.length };
}

// --------------------------------------------------------------- app menu io
function loadAppMenu(slug) {
  const p = path.join(INPUT_DIR, `${slug}.app-menu.json`);
  if (!fs.existsSync(p)) throw new Error(`missing app menu: ${p}`);
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  const menu = json.menu_json || json; // accept {menu_json:[...]} or a bare array
  const items = [];
  for (const cat of menu) {
    for (const it of cat.items || []) {
      items.push({ ...it, category_ar: cat.category_ar });
    }
  }
  return items;
}

// ------------------------------------------------------------------- per-shop
async function processRestaurant(r) {
  const outDir = path.join(OUTPUT_DIR, r.slug);
  const imgDir = path.join(outDir, 'images');
  // Wipe prior images so a removed/changed match never leaves a stale file.
  fs.rmSync(imgDir, { recursive: true, force: true });
  fs.mkdirSync(imgDir, { recursive: true });

  console.log(`\n=== ${r.appName} (${r.slug}) ===`);
  const url = vendorUrl(r);
  console.log(`  fetching ${url}`);
  const html = await fetchText(url);
  const scraped = scrapeMenuItems(extractNextData(html));
  console.log(`  scraped ${scraped.length} unique items with images`);

  const appItems = loadAppMenu(r.slug);
  console.log(`  matching against ${appItems.length} app menu items`);

  const overrides = r.overrides || {};
  const results = [];
  for (const ai of appItems) {
    let best = null, bestScore = 0, forced = false;

    if (Object.prototype.hasOwnProperty.call(overrides, ai.id)) {
      const pin = overrides[ai.id];
      forced = true;
      if (pin === null) {
        best = null; bestScore = 0; // explicitly no match
      } else {
        const target = normalizeAr(pin);
        best = scraped.find(hs => normalizeAr(hs.name_ar) === target)
            || scraped.find(hs => normalizeAr(hs.name_ar).includes(target));
        bestScore = best ? 1 : 0;
        if (!best) console.log(`  ! override for ${ai.id} ("${pin}") not found in scrape`);
      }
    } else {
      for (const hs of scraped) {
        const score = similarity(ai.name_ar, hs.name_ar);
        if (score > bestScore) { bestScore = score; best = hs; }
      }
    }
    const matched = best && (forced ? bestScore > 0 : bestScore >= MATCH_ACCEPT);
    const row = {
      app_id: ai.id,
      app_name_ar: ai.name_ar,
      app_name_en: ai.name_en,
      category_ar: ai.category_ar,
      match: matched ? best.name_ar : null,
      match_section: matched ? best.section : null,
      score: Number(bestScore.toFixed(3)),
      confidence: !matched ? 'none' : forced ? 'override' : bestScore >= MATCH_STRONG ? 'strong' : 'fuzzy',
      source_image: matched ? upscaleImage(best.image, IMAGE_WIDTH) : null,
      hs_price: matched ? best.price : null,
      image_file: null,
    };

    if (matched) {
      try {
        const { file, bytes } = await downloadImage(row.source_image, path.join(imgDir, ai.id));
        row.image_file = `images/${file}`;
        console.log(`  ✓ ${ai.name_ar}  →  ${best.name_ar}  [${row.confidence} ${row.score}]  ${(bytes / 1024 | 0)}KB`);
      } catch (e) {
        row.error = String(e.message || e);
        console.log(`  ⚠ ${ai.name_ar}  → matched but image failed: ${row.error}`);
      }
    } else {
      console.log(`  ✗ ${ai.name_ar}  → no match (best ${row.score})`);
    }
    results.push(row);
  }

  const matchedCount = results.filter(r => r.image_file).length;
  const bundle = {
    restaurant: r.appName,
    slug: r.slug,
    source_url: url,
    scraped_at: new Date().toISOString(),
    app_items: appItems.length,
    scraped_items: scraped.length,
    matched: matchedCount,
    items: results,
  };
  fs.writeFileSync(path.join(outDir, 'bundle.json'), JSON.stringify(bundle, null, 2));
  fs.writeFileSync(path.join(outDir, 'report.md'), buildReport(bundle));
  console.log(`  → ${matchedCount}/${appItems.length} images downloaded → ${path.join('output', r.slug)}`);
  return bundle;
}

function buildReport(b) {
  const rows = b.items
    .map(i => `| ${i.app_id} | ${i.app_name_ar} | ${i.match || '—'} | ${i.confidence} | ${i.score} | ${i.hs_price ?? '—'} | ${i.image_file ? '✅ ' + i.image_file : '❌'} |`)
    .join('\n');
  return `# ${b.restaurant} — menu image scrape

- Source: ${b.source_url}
- Scraped at: ${b.scraped_at}
- App items: ${b.app_items} · Scraped (HungerStation): ${b.scraped_items} · **Matched & downloaded: ${b.matched}**

| App ID | App item (ar) | Matched HS item | Confidence | Score | HS price | Image |
|---|---|---|---|---|---|---|
${rows}

> "fuzzy" matches and any ❌ rows should be eyeballed before applying to Supabase.
`;
}

// ----------------------------------------------------------------------- main
(async () => {
  const filter = process.argv.slice(2);
  const targets = filter.length
    ? RESTAURANTS.filter(r => filter.includes(r.slug))
    : RESTAURANTS;
  if (!targets.length) {
    console.error('No matching restaurants in config for:', filter.join(', '));
    process.exit(1);
  }
  for (const r of targets) {
    try {
      await processRestaurant(r);
    } catch (e) {
      console.error(`! ${r.slug} failed:`, e.message || e);
    }
  }
  console.log('\nDone.');
})();
