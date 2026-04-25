import { useSyncExternalStore } from 'react';
import { ComboItem } from '../data/mcdonaldsCombo';

/**
 * Shared combo state used by BOTH the ComboCard UI surface and the voice agent.
 * Keyed by combo_id so many combo cards can coexist (e.g. McDonald's + Herfy on one feed).
 * The voice agent always targets `activeComboId`.
 */

type PerComboState = {
    selections: Record<string, string[]>;
    quantity: number;
    voiceHeardIds: string[];
};

type StoreState = {
    activeComboId: string | null;
    activeCombo: ComboItem | null;
    byId: Record<string, PerComboState>;
};

const emptyPerCombo = (combo: ComboItem): PerComboState => ({
    selections: Object.fromEntries(combo.groups.map((g) => [g.id, []])),
    quantity: 1,
    voiceHeardIds: [],
});

let state: StoreState = {
    activeComboId: null,
    activeCombo: null,
    byId: {},
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const patch = (updater: (s: StoreState) => StoreState) => {
    state = updater(state);
    emit();
};

const patchPer = (comboId: string, updater: (p: PerComboState) => PerComboState) => {
    patch((s) => {
        const cur = s.byId[comboId];
        if (!cur) return s;
        return { ...s, byId: { ...s.byId, [comboId]: updater(cur) } };
    });
};

export const comboStore = {
    getState: () => state,

    subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },

    /** Register a combo's per-combo state if it doesn't exist yet. Idempotent. */
    ensureInit(combo: ComboItem) {
        if (!state.byId[combo.id]) {
            patch((s) => ({ ...s, byId: { ...s.byId, [combo.id]: emptyPerCombo(combo) } }));
        }
    },

    /** Mark a combo as the voice-active target. Seeds its state if needed. */
    setActive(combo: ComboItem) {
        patch((s) => ({
            ...s,
            activeComboId: combo.id,
            activeCombo: combo,
            byId: s.byId[combo.id] ? s.byId : { ...s.byId, [combo.id]: emptyPerCombo(combo) },
        }));
    },

    clearActive() {
        patch((s) => ({ ...s, activeComboId: null, activeCombo: null }));
    },

    /** UI-driven selection update. No voice glow. */
    setSelection(comboId: string, groupId: string, optionIds: string[]) {
        patchPer(comboId, (p) => ({
            ...p,
            selections: { ...p.selections, [groupId]: optionIds },
        }));
    },

    setQuantity(comboId: string, quantity: number) {
        patchPer(comboId, (p) => ({ ...p, quantity: Math.max(1, Math.min(20, quantity)) }));
    },

    /**
     * Voice-driven change. Flashes the affected chips for 1.8s via voiceHeardIds.
     * action: 'set' replaces, 'add' merges, 'remove' removes, 'clear' empties group.
     */
    applyAIChange(
        comboId: string,
        groupId: string,
        optionIds: string[],
        action: 'set' | 'add' | 'remove' | 'clear'
    ) {
        patchPer(comboId, (p) => {
            const current = p.selections[groupId] ?? [];
            let next: string[];
            if (action === 'set') next = [...optionIds];
            else if (action === 'clear') next = [];
            else if (action === 'add') next = Array.from(new Set([...current, ...optionIds]));
            else next = current.filter((id) => !optionIds.includes(id));
            return {
                ...p,
                selections: { ...p.selections, [groupId]: next },
                voiceHeardIds: Array.from(new Set([...p.voiceHeardIds, ...optionIds])),
            };
        });

        // Auto-fade voice glow after 1.8s
        setTimeout(() => {
            patchPer(comboId, (p) => ({
                ...p,
                voiceHeardIds: p.voiceHeardIds.filter((id) => !optionIds.includes(id)),
            }));
        }, 1800);
    },

    reset(comboId: string, combo: ComboItem) {
        patch((s) => ({ ...s, byId: { ...s.byId, [comboId]: emptyPerCombo(combo) } }));
    },
};

/* ---------------- React hooks ---------------- */

/** Subscribe to one combo's state. Returns live PerComboState. */
export function useCombo(comboId: string): PerComboState | undefined {
    return useSyncExternalStore(
        comboStore.subscribe,
        () => comboStore.getState().byId[comboId]
    );
}

/** Subscribe to the currently voice-active combo (null if none). */
export function useActiveCombo(): ComboItem | null {
    return useSyncExternalStore(
        comboStore.subscribe,
        () => comboStore.getState().activeCombo
    );
}
