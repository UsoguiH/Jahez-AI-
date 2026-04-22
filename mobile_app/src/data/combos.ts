import { ComboItem } from './mcdonaldsCombo';
import { BIG_MAC_MEAL } from './mcdonaldsCombo';

/**
 * Registry of all known combo meals across restaurants.
 * The voice agent uses this to recognize when a user mentions a combo by name
 * and open the customizer card instead of dropping it into the cart raw.
 */
export const ALL_COMBOS: ComboItem[] = [
    BIG_MAC_MEAL,
];

const norm = (s: string) =>
    s
        .toLowerCase()
        .replace(/[ً-ْ]/g, '') // strip Arabic diacritics
        .replace(/\s+/g, ' ')
        .trim();

/** Fuzzy-find a combo by id, Arabic name, or English name. */
export function findCombo(query: string): ComboItem | null {
    if (!query) return null;
    const q = norm(query);

    // Exact id match first
    const byId = ALL_COMBOS.find((c) => c.id === query);
    if (byId) return byId;

    // Substring match (bidirectional) on names + id
    return (
        ALL_COMBOS.find((c) => {
            const ar = norm(c.name_ar);
            const en = norm(c.name_en);
            const id = norm(c.id);
            return (
                ar.includes(q) ||
                q.includes(ar) ||
                en.includes(q) ||
                q.includes(en) ||
                id.includes(q)
            );
        }) || null
    );
}

/** Short human-readable list for prompt injection. */
export function combosCatalogForPrompt(): string {
    return ALL_COMBOS.map(
        (c) =>
            `  • "${c.name_ar}" (${c.name_en}) — id: ${c.id} — من ${c.restaurant_ar} — ${c.base_price} ر.س`
    ).join('\n');
}
