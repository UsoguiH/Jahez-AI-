import type { ImageSourcePropType } from 'react-native';

/**
 * Real product photos for menu items, bundled into the app.
 *
 * McDonald's items resolve to local images scraped from HungerStation
 * (tools/menu-image-scraper) — reliable, offline, and the actual dish. Anything
 * not in the map falls back to the generic keyword→Unsplash photo so the rest of
 * the catalog still shows something sensible.
 *
 * Cart/menu items are matched by their Arabic name first (the canonical name the
 * cart validator snaps to), then by English name.
 */

// --- McDonald's: local bundled images, keyed by canonical name -------------
// Some app items share one source photo (e.g. both fries sizes), which is fine.
const MCD: Array<{ ar: string; en: string; img: ImageSourcePropType }> = [
  { ar: 'بيج ماك', en: 'Big Mac', img: require('../assets/menu/mcdonalds/mcd_001.png') },
  { ar: 'وجبة بيج ماك', en: 'Big Mac Meal', img: require('../assets/menu/mcdonalds/mcd_002.png') },
  { ar: 'ماك كريسبي دلوكس', en: 'Mc Crispy Chicken Deluxe', img: require('../assets/menu/mcdonalds/mcd_003.png') },
  { ar: 'وجبة ماك كريسبي دلوكس', en: 'Mc Crispy Chicken Deluxe Meal', img: require('../assets/menu/mcdonalds/mcd_004.png') },
  { ar: 'جراند تشيكن سبيشل', en: 'Grand Chicken Special', img: require('../assets/menu/mcdonalds/mcd_005.png') },
  { ar: 'وجبة جراند تشيكن سبيشل', en: 'Grand Chicken Special Meal', img: require('../assets/menu/mcdonalds/mcd_006.png') },
  { ar: 'ماك عربيا', en: 'McArabia', img: require('../assets/menu/mcdonalds/mcd_007.png') },
  { ar: 'وجبة ماك عربيا', en: 'McArabia Meal', img: require('../assets/menu/mcdonalds/mcd_008.png') },
  { ar: 'كوارتر باوندر بالجبن', en: 'Quarter Pounder With Cheese', img: require('../assets/menu/mcdonalds/mcd_009.png') },
  { ar: '٩ قطع ماك ناجتس', en: '9 Piece Chicken McNuggets', img: require('../assets/menu/mcdonalds/mcd_010.png') },
  { ar: 'بيج تيستي', en: 'Big Tasty', img: require('../assets/menu/mcdonalds/mcd_011.png') },
  { ar: 'جراند تشيكن سبايسي', en: 'Spicy Grand Chicken', img: require('../assets/menu/mcdonalds/mcd_012.png') },
  { ar: 'بطاطس وسط', en: 'Medium French Fries', img: require('../assets/menu/mcdonalds/mcd_013.png') },
  { ar: 'بطاطس كبير', en: 'Large French Fries', img: require('../assets/menu/mcdonalds/mcd_014.png') },
  { ar: 'ماك فلوري أوريو', en: 'McFlurry Oreo', img: require('../assets/menu/mcdonalds/mcd_015.png') },
  { ar: 'مشروب غازي وسط', en: 'Soft Drink (Medium)', img: require('../assets/menu/mcdonalds/mcd_017.png') },
  { ar: 'ماك كافيه لاتيه', en: 'McCafé Latte', img: require('../assets/menu/mcdonalds/mcd_018.png') },
];

// Normalize Arabic (strip diacritics, unify alef/ya/ta) + English (lowercase).
const AR_DIACRITICS = /[ؐ-ًؚ-ٰٟـ]/g;
function norm(s = ''): string {
  return s
    .replace(AR_DIACRITICS, '')
    .replace(/[أإآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const LOCAL_BY_NAME = new Map<string, ImageSourcePropType>();
for (const m of MCD) {
  LOCAL_BY_NAME.set(norm(m.ar), m.img);
  LOCAL_BY_NAME.set(norm(m.en), m.img);
}

// --- Generic fallback: keyword → Unsplash ----------------------------------
function unsplashFor(nameEn = ''): string {
  const n = nameEn.toLowerCase();
  if (n.includes('burger') || n.includes('mac') || n.includes('crispy') || n.includes('deluxe') || n.includes('tasty'))
    return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=200&fit=crop';
  if (n.includes('chicken') || n.includes('nugget') || n.includes('broast') || n.includes('grand') || n.includes('spicy'))
    return 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=200&h=200&fit=crop';
  if (n.includes('fries') || n.includes('fry') || n.includes('potato'))
    return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=200&h=200&fit=crop';
  if (n.includes('drink') || n.includes('cola') || n.includes('pepsi') || n.includes('sprite') || n.includes('juice'))
    return 'https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=200&h=200&fit=crop';
  if (n.includes('wrap') || n.includes('shawarma'))
    return 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=200&h=200&fit=crop';
  if (n.includes('pizza'))
    return 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&h=200&fit=crop';
  if (n.includes('coffee') || n.includes('latte') || n.includes('cappuccino'))
    return 'https://images.unsplash.com/photo-1541167760496-9af0ab7f0da7?w=200&h=200&fit=crop';
  if (n.includes('ice') || n.includes('sundae') || n.includes('mcflurry'))
    return 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=200&h=200&fit=crop';
  if (n.includes('salad'))
    return 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=200&h=200&fit=crop';
  if (n.includes('meal') || n.includes('combo'))
    return 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=200&h=200&fit=crop';
  return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop';
}

/**
 * Resolve the best image for a menu/cart item: a bundled real photo when we have
 * one, otherwise a remote keyword fallback. Pass straight to <Image source={...}>.
 */
export function getFoodImageSource(item: { name_ar?: string; name_en?: string }): ImageSourcePropType {
  const local = LOCAL_BY_NAME.get(norm(item.name_ar)) || LOCAL_BY_NAME.get(norm(item.name_en));
  if (local) return local;
  return { uri: unsplashFor(item.name_en || '') };
}
