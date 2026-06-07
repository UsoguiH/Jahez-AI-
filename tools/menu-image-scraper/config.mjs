// Restaurant → HungerStation vendor mapping.
//
// Each entry tells the scraper which HungerStation vendor page to read for a
// given Jahez restaurant. `appName` must match `name_en` in the Supabase
// `restaurant_menus` table so the scraped images can be matched back to the
// app's curated menu items.
//
// To add a restaurant: open hungerstation.com, find the chain's branch, copy
// the numeric vendor id from the URL (.../restaurant/<city>/<district>/<id>),
// and add a row here. City/district are the URL-encoded Arabic segments.

export const RESTAURANTS = [
  {
    appName: "McDonald's",     // matches restaurant_menus.name_en
    slug: 'mcdonalds',         // output folder name
    vendorId: 3875,            // HungerStation vendor id
    city: 'الرياض',
    district: 'الروابي',
    // Manual pins for items the fuzzy matcher can't resolve. Key = app item id.
    //   "<arabic name>" → force-match the HungerStation item with that exact
    //                      (normalized) name, regardless of score.
    //   null            → force "no match" (HungerStation has no good image).
    overrides: {
      mcd_018: 'لاتيه', // "ماك كافيه لاتيه" → HS McCafé "لاتيه"
      mcd_017: 'كولا',  // "مشروب غازي وسط" → representative soft-drink image
      mcd_016: null,    // "فطيرة التفاح" → no Apple Pie on this HS menu
    },
  },
];

// Image download: HungerStation serves menu images from the Delivery Hero CDN
// with a `?width=` query param (the page uses 222px thumbnails). We request a
// larger size for crisp product shots.
export const IMAGE_WIDTH = 800;

// Matching thresholds (0..1 combined token + edit-distance score).
export const MATCH_ACCEPT = 0.5;   // below this → treated as "no match"
export const MATCH_STRONG = 0.72;  // at/above → flagged "strong" in the report
