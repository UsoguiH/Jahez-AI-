# Menu Image Scraper

Pulls **real product photos** for Jahez restaurant menus from HungerStation
(Delivery Hero CDN) and matches them to the app's curated menu items.

The app's `restaurant_menus.menu_json` items have no images. HungerStation
server-renders each vendor's full menu (name + price + image) into the page's
`__NEXT_DATA__` JSON, so no headless browser or API key is needed — a plain
HTTP GET + JSON parse is enough.

## How it works

For each restaurant in `config.mjs`:

1. **Fetch** the HungerStation vendor page and extract `__NEXT_DATA__`.
2. **Scrape** `vendorMenu[].items[]` → `{ name, price, description, image }`
   (deduped across promo sections).
3. **Match** each app menu item (`input/<slug>.app-menu.json`) to a scraped
   item by normalized-Arabic fuzzy score (token Jaccard + edit distance), with
   manual `overrides` in config for the few the matcher can't resolve.
4. **Download** the matched image (self-hosted, requested at `IMAGE_WIDTH`px)
   into `output/<slug>/images/<app_item_id>.<ext>`.
5. **Write** `output/<slug>/bundle.json` (machine-readable) and `report.md`
   (human review table).

Nothing is written to Supabase — this is review-first.

## Usage

```bash
cd tools/menu-image-scraper
node scrape.mjs            # every restaurant in config.mjs
node scrape.mjs mcdonalds  # just one slug
```

## Adding a restaurant

1. Find the chain's branch on hungerstation.com and copy the numeric vendor id
   from the URL: `.../restaurant/<city>/<district>/<vendorId>`.
2. Add a row to `RESTAURANTS` in `config.mjs` (`appName` must equal the
   `name_en` in Supabase `restaurant_menus`).
3. Export that restaurant's menu to `input/<slug>.app-menu.json` (shape:
   `{ "name_en": "...", "menu_json": [ { "category_ar": "...", "items": [...] } ] }`).
4. `node scrape.mjs <slug>`, then review `output/<slug>/report.md` and add
   `overrides` for any ❌ / wrong `fuzzy` rows.

## Output layout

```
output/<slug>/
  images/<app_item_id>.png   # self-hosted product photos, named by app item id
  bundle.json                # { items: [ { app_id, match, score, image_file, ... } ] }
  report.md                  # review table
```

## Applying to the app (next step)

The image files are named by `app_item_id`, so each maps 1:1 to a
`menu_json` item. To wire them in:

- **Self-host:** upload `images/*` to a Supabase Storage bucket (e.g.
  `menu-images/mcdonalds/`), then patch each `menu_json` item with an
  `image_url` pointing at the public Storage URL.
- `bundle.json` has everything needed to script that patch.

## Notes / caveats

- Images are © McDonald's / HungerStation — fine for an internal prototype/demo;
  production needs licensed or first-party imagery.
- HungerStation menu prices differ slightly from the app's curated prices; the
  scraper only borrows **images**, never overwrites names or prices.
- If a fetch returns no `__NEXT_DATA__`, the vendor is likely closed or the page
  layout changed — re-check the vendor id.
