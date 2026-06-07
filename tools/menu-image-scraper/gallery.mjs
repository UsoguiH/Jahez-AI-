#!/usr/bin/env node
/**
 * Build a simple HTML contact sheet from a scrape bundle so you can eyeball
 * every matched image (and the unmatched ones) in a browser.
 *
 *   node gallery.mjs            # all slugs found under output/
 *   node gallery.mjs mcdonalds  # one slug
 *
 * Writes output/<slug>/gallery.html (open it in any browser).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');

function buildHtml(b) {
  const cards = b.items.map(i => {
    const img = i.image_file
      ? `<img src="${i.image_file}" loading="lazy" alt="${i.app_name_ar}">`
      : `<div class="noimg">لا توجد صورة<br><small>no image</small></div>`;
    const badge = i.confidence === 'none' ? 'none'
      : i.confidence === 'override' ? 'override'
      : i.confidence === 'strong' ? 'strong' : 'fuzzy';
    return `<figure class="card ${badge}">
      ${img}
      <figcaption>
        <b>${i.app_name_ar}</b>
        <span class="en">${i.app_name_en || ''}</span>
        <span class="meta">${i.app_id} · <span class="b ${badge}">${badge}</span>${i.match ? ' · ' + i.match : ''}</span>
      </figcaption>
    </figure>`;
  }).join('\n');

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${b.restaurant} — صور المنيو</title>
<style>
  body{font-family:system-ui,'Segoe UI',Tahoma,sans-serif;background:#f5f5f4;margin:0;padding:24px;color:#1c1917}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:#78716c;font-size:13px;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
  .card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);margin:0;border:2px solid transparent}
  .card.fuzzy{border-color:#fbbf24}
  .card.none{border-color:#ef4444}
  .card img{width:100%;height:170px;object-fit:contain;background:#fafaf9;display:block}
  .noimg{height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#a8a29e;background:#fafaf9}
  figcaption{padding:10px 12px;display:flex;flex-direction:column;gap:2px}
  figcaption b{font-size:15px}
  .en{color:#78716c;font-size:12px}
  .meta{color:#a8a29e;font-size:11px;margin-top:4px}
  .b{padding:1px 6px;border-radius:6px;color:#fff;font-size:10px}
  .b.strong{background:#16a34a}.b.override{background:#2563eb}.b.fuzzy{background:#d97706}.b.none{background:#dc2626}
</style></head><body>
<h1>${b.restaurant} — ${b.matched}/${b.app_items} صورة</h1>
<div class="sub">المصدر: HungerStation · ${b.scraped_at}<br>
أصفر = تطابق تقريبي راجعه · أحمر = بدون صورة</div>
<div class="grid">${cards}</div>
</body></html>`;
}

const filter = process.argv.slice(2);
const slugs = fs.readdirSync(OUTPUT_DIR).filter(s =>
  fs.existsSync(path.join(OUTPUT_DIR, s, 'bundle.json')) &&
  (!filter.length || filter.includes(s))
);
for (const slug of slugs) {
  const b = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, slug, 'bundle.json'), 'utf8'));
  const out = path.join(OUTPUT_DIR, slug, 'gallery.html');
  fs.writeFileSync(out, buildHtml(b));
  console.log('wrote', out);
}
