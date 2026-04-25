// Cart validation — the accuracy backbone for voice ordering.
//
// The AI's update_cart calls are trusted only after every item is matched
// against the restaurant's authoritative menu. Names and prices get snapped
// to canonical values, unknowns are rejected with fuzzy-matched suggestions,
// and the corrected cart is returned so the AI speaks from ground truth
// instead of its own (possibly hallucinated) version.

export interface RawCartItem {
    name_ar?: string;
    name_en?: string;
    quantity?: number;
    unit_price?: number;
    notes?: string;
}

export interface ValidatedCartItem {
    name_ar: string;
    name_en: string;
    quantity: number;
    unit_price: number;
    notes?: string;
}

export interface MenuItem {
    name_ar: string;
    name_en: string;
    price: number;
    available?: boolean;
    description_ar?: string;
}

export interface MenuCategory {
    category_ar?: string;
    category_en?: string;
    items: MenuItem[];
}

export interface CartValidationResult {
    items: ValidatedCartItem[];          // canonical items that passed validation
    corrections: ItemCorrection[];       // items whose name/price was snapped to canonical
    rejections: ItemRejection[];         // items the AI asked to add that aren't on the menu
}

export interface ItemCorrection {
    requested_name: string;
    canonical_name_ar: string;
    requested_price?: number;
    canonical_price: number;
    reason: string; // e.g. "name mismatch", "price mismatch"
}

export interface ItemRejection {
    requested_name: string;
    requested_price?: number;
    suggestions_ar: string[]; // up to 3 closest-matching items so the AI can ask the user
}

// --- Arabic text normalization ---
// Collapse diacritics + common letter variants so "شاورمة" matches "شاورما",
// "إفطار" matches "افطار", etc. Without this, a single letter form difference
// breaks exact matching and we'd rely entirely on Levenshtein — expensive + noisy.
const TASHKEEL = /[ً-ْٰـ]/g; // fatha/kasra/damma/shadda/sukun/alef-maqsura/tatweel
const normalizeAr = (s: string): string =>
    s
        .toLowerCase()
        .replace(TASHKEEL, '')
        .replace(/[إأآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/\s+/g, ' ')
        .trim();

const normalizeEn = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

// --- Levenshtein distance (bounded) ---
// Two-row DP variant. Cheap enough for short item names and we only call it
// when exact/substring matching fails.
const levenshtein = (a: string, b: string): number => {
    if (a === b) return 0;
    const al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    let prev = new Array(bl + 1);
    let curr = new Array(bl + 1);
    for (let j = 0; j <= bl; j++) prev[j] = j;
    for (let i = 1; i <= al; i++) {
        curr[0] = i;
        for (let j = 1; j <= bl; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[bl];
};

const similarity = (a: string, b: string): number => {
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshtein(a, b) / maxLen;
};

// --- Menu index ---
// Flat, normalized lookup structure built once per restaurant selection so
// per-call validation is O(n) at worst (n = items on menu, small).
export interface MenuIndex {
    items: Array<{
        canonical: MenuItem;
        norm_ar: string;
        norm_en: string;
    }>;
}

export const buildMenuIndex = (menu: MenuCategory[] | any[]): MenuIndex => {
    const items: MenuIndex['items'] = [];
    for (const cat of menu || []) {
        for (const item of cat.items || []) {
            if (item.available === false) continue;
            items.push({
                canonical: {
                    name_ar: item.name_ar,
                    name_en: item.name_en,
                    price: Number(item.price) || 0,
                    available: item.available,
                    description_ar: item.description_ar,
                },
                norm_ar: normalizeAr(item.name_ar || ''),
                norm_en: normalizeEn(item.name_en || ''),
            });
        }
    }
    return { items };
};

// --- Matching ---
// Strategy (best to worst, first hit wins):
// 1. Exact normalized match on ar or en name.
// 2. Substring match (input ⊂ canonical OR canonical ⊂ input) — catches
//    partial names like "شاورما" when canonical is "شاورما لحم كبير".
// 3. Levenshtein similarity ≥ 0.78 — catches typos + ASR slips.
//
// Returns { item, score } or null if nothing clears the bar.
const MATCH_THRESHOLD = 0.78;

const findBestMatch = (
    requestedAr: string,
    requestedEn: string,
    index: MenuIndex,
): { item: MenuItem; score: number } | null => {
    const rAr = normalizeAr(requestedAr || '');
    const rEn = normalizeEn(requestedEn || '');

    if (!rAr && !rEn) return null;

    // 1. Exact
    for (const e of index.items) {
        if ((rAr && e.norm_ar === rAr) || (rEn && e.norm_en === rEn)) {
            return { item: e.canonical, score: 1 };
        }
    }

    // 2. Substring — prefer shorter canonical (more specific when input is broad).
    let subBest: { item: MenuItem; score: number } | null = null;
    for (const e of index.items) {
        const arHit = rAr && (e.norm_ar.includes(rAr) || rAr.includes(e.norm_ar));
        const enHit = rEn && (e.norm_en.includes(rEn) || rEn.includes(e.norm_en));
        if (arHit || enHit) {
            const canonLen = arHit ? e.norm_ar.length : e.norm_en.length;
            const inputLen = arHit ? rAr.length : rEn.length;
            const score = Math.min(canonLen, inputLen) / Math.max(canonLen, inputLen);
            if (!subBest || score > subBest.score) subBest = { item: e.canonical, score };
        }
    }
    if (subBest && subBest.score >= 0.6) return subBest;

    // 3. Fuzzy (Levenshtein)
    let fuzzyBest: { item: MenuItem; score: number } | null = null;
    for (const e of index.items) {
        const arScore = rAr ? similarity(rAr, e.norm_ar) : 0;
        const enScore = rEn ? similarity(rEn, e.norm_en) : 0;
        const score = Math.max(arScore, enScore);
        if (!fuzzyBest || score > fuzzyBest.score) fuzzyBest = { item: e.canonical, score };
    }
    if (fuzzyBest && fuzzyBest.score >= MATCH_THRESHOLD) return fuzzyBest;

    // Nothing cleared any threshold — signal reject.
    return null;
};

const topSuggestions = (requestedAr: string, requestedEn: string, index: MenuIndex, n = 3): string[] => {
    const rAr = normalizeAr(requestedAr || '');
    const rEn = normalizeEn(requestedEn || '');
    const scored = index.items.map(e => ({
        name: e.canonical.name_ar,
        score: Math.max(
            rAr ? similarity(rAr, e.norm_ar) : 0,
            rEn ? similarity(rEn, e.norm_en) : 0,
        ),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, n).map(s => s.name);
};

// --- Public entry point ---
// Validates every AI-supplied cart item against the active menu. The returned
// items[] is what the UI + AI should use as the source of truth going forward.
export const validateCartItems = (
    raw: RawCartItem[],
    index: MenuIndex,
): CartValidationResult => {
    const items: ValidatedCartItem[] = [];
    const corrections: ItemCorrection[] = [];
    const rejections: ItemRejection[] = [];

    for (const r of raw || []) {
        const requestedName = r.name_ar || r.name_en || '';
        const qty = Math.max(1, Math.floor(Number(r.quantity) || 1));

        // Empty menu → nothing to validate against; accept as-is (defensive fallback).
        if (index.items.length === 0) {
            items.push({
                name_ar: r.name_ar || '',
                name_en: r.name_en || '',
                quantity: qty,
                unit_price: Number(r.unit_price) || 0,
                notes: r.notes,
            });
            continue;
        }

        const match = findBestMatch(r.name_ar || '', r.name_en || '', index);
        if (!match) {
            rejections.push({
                requested_name: requestedName,
                requested_price: r.unit_price,
                suggestions_ar: topSuggestions(r.name_ar || '', r.name_en || '', index),
            });
            continue;
        }

        const canonical = match.item;
        const requestedPrice = Number(r.unit_price);
        const priceMismatch = Number.isFinite(requestedPrice) && Math.abs(requestedPrice - canonical.price) > 0.01;
        const nameMismatch = normalizeAr(r.name_ar || '') !== normalizeAr(canonical.name_ar);

        if (priceMismatch || nameMismatch) {
            corrections.push({
                requested_name: requestedName,
                canonical_name_ar: canonical.name_ar,
                requested_price: Number.isFinite(requestedPrice) ? requestedPrice : undefined,
                canonical_price: canonical.price,
                reason: priceMismatch ? 'price snapped to menu' : 'name snapped to menu',
            });
        }

        items.push({
            name_ar: canonical.name_ar,
            name_en: canonical.name_en,
            quantity: qty,
            unit_price: canonical.price,
            notes: r.notes,
        });
    }

    return { items, corrections, rejections };
};
