import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Animated,
    Image,
    Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ComboItem, ModifierGroup, ModifierOption } from '../data/mcdonaldsCombo';
import { comboStore, useCombo } from '../state/comboStore';

const DARK = '#0F0F0F';
const BRAND_RED = '#DC2626';
const STATE_GREEN = '#059669';
// ChatGPT-ish neutral palette
const NEUTRAL_TEXT = '#0F0F0F';
const NEUTRAL_MUTED = '#6B7280';
const NEUTRAL_BG = '#F7F7F8';
const NEUTRAL_BORDER = '#E5E7EB';

type Selections = Record<string, string[]>;

interface ComboCardProps {
    combo: ComboItem;
    onAddToCart: (payload: {
        combo_id: string;
        quantity: number;
        selections: Selections;
        unit_price: number;
        line_total: number;
        summary_ar: string;
    }) => void;
    /** Called when user taps the voice pill. Parent should set this combo active and open voice overlay. */
    onVoiceTap?: (combo: ComboItem) => void;
    /** When true, the voice pill becomes a passive "جاهز يسمعك" indicator (used when card is embedded inside VoiceOverlay). */
    hideVoicePill?: boolean;
    /** When true, renders a condensed no-image variant — used when embedded inside VoiceOverlay chat canvas. */
    compact?: boolean;
    /** Fired when user manually taps a chip. Used by the voice overlay to sync the AI's context. */
    onUserSelect?: (groupId: string, optionIds: string[]) => void;
    /** Fired when user manually changes quantity. Used by the voice overlay to sync the AI's context. */
    onUserQuantity?: (quantity: number) => void;
}

const ComboCard: React.FC<ComboCardProps> = ({
    combo,
    onAddToCart,
    onVoiceTap,
    hideVoicePill,
    compact,
    onUserSelect,
    onUserQuantity,
}) => {
    // Ensure this combo has state in the store before first read
    useState(() => {
        comboStore.ensureInit(combo);
        return true;
    });

    const perCombo = useCombo(combo.id);
    const selections = perCombo?.selections ?? Object.fromEntries(combo.groups.map((g) => [g.id, []]));
    const quantity = perCombo?.quantity ?? 1;
    const voiceHeardOptionIds = perCombo?.voiceHeardIds ?? [];

    const [openOptional, setOpenOptional] = useState<Record<string, boolean>>({});

    const enterFade = useRef(new Animated.Value(0)).current;
    const enterSlide = useRef(new Animated.Value(20)).current;
    const micPulse = useRef(new Animated.Value(0)).current;
    const ctaScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(enterFade, { toValue: 1, duration: 420, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
            Animated.timing(enterSlide, { toValue: 0, duration: 420, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        ]).start();
    }, []);

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(micPulse, { toValue: 1, duration: 1100, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
                Animated.timing(micPulse, { toValue: 0, duration: 1100, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
            ])
        ).start();
    }, []);

    const toggle = (group: ModifierGroup, optId: string) => {
        const current = selections[group.id] ?? [];
        let next: string[];
        if (group.select === 'single') {
            if (!group.required && current[0] === optId) next = [];
            else next = [optId];
        } else {
            const exists = current.includes(optId);
            next = exists ? current.filter((x) => x !== optId) : [...current, optId];
            if (group.max && next.length > group.max) next = next.slice(-group.max);
        }
        comboStore.setSelection(combo.id, group.id, next);
        onUserSelect?.(group.id, next);
    };

    const { unitPrice, lineTotal, requiredUnfilled, summaryParts } = useMemo(() => {
        let mod = 0;
        const parts: string[] = [];
        const unfilled: ModifierGroup[] = [];
        combo.groups.forEach((g) => {
            const picked = selections[g.id] ?? [];
            if (g.required && picked.length === 0) unfilled.push(g);
            picked.forEach((pid) => {
                const opt = g.options.find((o) => o.id === pid);
                if (!opt) return;
                mod += opt.price_delta;
                if (opt.price_delta > 0 || !opt.default) parts.push(opt.name_ar);
            });
        });
        const unit = combo.base_price + mod;
        return {
            unitPrice: unit,
            lineTotal: unit * quantity,
            requiredUnfilled: unfilled,
            summaryParts: parts,
        };
    }, [combo, selections, quantity]);

    const canAdd = requiredUnfilled.length === 0;

    const handleAdd = () => {
        if (!canAdd) return;
        Animated.sequence([
            Animated.timing(ctaScale, { toValue: 0.97, duration: 90, useNativeDriver: true }),
            Animated.spring(ctaScale, { toValue: 1, friction: 5, useNativeDriver: true }),
        ]).start();
        onAddToCart({
            combo_id: combo.id,
            quantity,
            selections,
            unit_price: unitPrice,
            line_total: lineTotal,
            summary_ar: `${combo.name_ar}${summaryParts.length ? ' - ' + summaryParts.join('، ') : ''}`,
        });
        comboStore.reset(combo.id, combo);
    };

    const pulseScale = micPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });
    const pulseOpacity = micPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

    const requiredGroups = combo.groups.filter((g) => g.required);
    const optionalGroups = combo.groups.filter((g) => !g.required);

    const triggerMeta = (groupId: string): { icon: keyof typeof Ionicons.glyphMap; accent: string } => {
        // إضافات = green (+), بدون = red (−). Neutral fallback otherwise.
        if (groupId === 'extras') return { icon: 'add', accent: STATE_GREEN };
        if (groupId === 'remove') return { icon: 'remove', accent: BRAND_RED };
        return { icon: 'ellipsis-horizontal', accent: NEUTRAL_MUTED };
    };

    return (
        <Animated.View
            style={{
                opacity: enterFade,
                transform: [{ translateY: enterSlide }],
                backgroundColor: 'white',
                borderRadius: compact ? 14 : 20,
                overflow: 'hidden',
                // Compact: ChatGPT-style flat card with a single subtle border, no shadow.
                // Full: keep soft shadow for the inline-feed variant.
                shadowColor: '#000',
                shadowOpacity: compact ? 0 : 0.1,
                shadowRadius: compact ? 0 : 16,
                shadowOffset: { width: 0, height: compact ? 0 : 6 },
                elevation: compact ? 0 : 6,
                borderWidth: 1,
                borderColor: compact ? NEUTRAL_BORDER : '#F3F4F6',
            }}
        >
            {/* HERO — hidden in compact mode */}
            {!compact ? (
                <View style={{ height: 150, backgroundColor: '#E5E7EB' }}>
                    <Image source={{ uri: combo.hero_image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />

                    <View
                        style={{
                            position: 'absolute',
                            top: 10,
                            right: 10,
                            flexDirection: 'row-reverse',
                            alignItems: 'center',
                            backgroundColor: 'rgba(255,255,255,0.95)',
                            paddingHorizontal: 9,
                            paddingVertical: 5,
                            borderRadius: 999,
                        }}
                    >
                        <View
                            style={{
                                width: 16,
                                height: 16,
                                borderRadius: 8,
                                backgroundColor: '#FFC72C',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Text style={{ fontSize: 9, color: '#DA291C', fontWeight: '900' }}>M</Text>
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#111827', marginRight: 5 }}>
                            {combo.restaurant_ar}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={() => !hideVoicePill && onVoiceTap?.(combo)}
                        activeOpacity={hideVoicePill ? 1 : 0.85}
                        disabled={hideVoicePill}
                        style={{
                            position: 'absolute',
                            bottom: 10,
                            left: 10,
                            flexDirection: 'row-reverse',
                            alignItems: 'center',
                            backgroundColor: 'rgba(0,0,0,0.78)',
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            borderRadius: 999,
                        }}
                    >
                        <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}>
                            <Animated.View
                                style={{
                                    position: 'absolute',
                                    width: 18,
                                    height: 18,
                                    borderRadius: 9,
                                    backgroundColor: BRAND_RED,
                                    transform: [{ scale: pulseScale }],
                                    opacity: pulseOpacity,
                                }}
                            />
                            <View
                                style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: 7,
                                    backgroundColor: BRAND_RED,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Ionicons name="mic" size={8} color="white" />
                            </View>
                        </View>
                        <Text style={{ color: 'white', fontSize: 11, fontWeight: '800' }}>
                            {hideVoicePill ? 'جاهز يسمعك' : 'اطلب بصوتك'}
                        </Text>
                    </TouchableOpacity>
                </View>
            ) : null}

            {/* TITLE */}
            <View
                style={{
                    paddingHorizontal: compact ? 12 : 14,
                    paddingTop: compact ? 10 : 14,
                    paddingBottom: compact ? 4 : 4,
                }}
            >
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                    <Text
                        style={{
                            fontSize: compact ? 15 : 19,
                            fontWeight: '700',
                            color: NEUTRAL_TEXT,
                            flex: 1,
                            textAlign: 'right',
                            letterSpacing: 0.1,
                        }}
                        numberOfLines={1}
                    >
                        {combo.name_ar}
                    </Text>
                    {!compact ? (
                        <Text style={{ fontSize: 10, color: NEUTRAL_MUTED, fontWeight: '600', marginLeft: 3 }}>البداية</Text>
                    ) : null}
                    <Text style={{ fontSize: compact ? 13 : 13, fontWeight: '700', color: NEUTRAL_TEXT }}>
                        {combo.base_price.toFixed(0)} ر.س
                    </Text>
                </View>

                {/* Compact: subtle ChatGPT-style status line */}
                {compact ? (
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginTop: 4 }}>
                        <View
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: STATE_GREEN,
                                marginLeft: 6,
                            }}
                        />
                        <Animated.View
                            style={{
                                position: 'absolute',
                                right: 0,
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: STATE_GREEN,
                                transform: [{ scale: pulseScale }],
                                opacity: pulseOpacity,
                            }}
                        />
                        <Text style={{ fontSize: 11, color: NEUTRAL_MUTED, fontWeight: '500' }}>
                            جاهز يسمعك · تكلّم لتخصيص الوجبة
                        </Text>
                    </View>
                ) : null}
            </View>

            {/* REQUIRED GROUPS (always visible) */}
            {requiredGroups.map((group) => {
                const selected = selections[group.id] ?? [];
                const isDone = selected.length > 0;
                return (
                    <GroupBlock
                        key={group.id}
                        group={group}
                        selected={selected}
                        isDone={isDone}
                        onToggle={(optId) => toggle(group, optId)}
                        heardIds={voiceHeardOptionIds}
                        compact={compact}
                    />
                );
            })}

            {/* OPTIONAL TRIGGERS — right-anchored labeled pills */}
            {optionalGroups.length > 0 ? (
                <View
                    style={{
                        flexDirection: 'row-reverse',
                        alignItems: 'center',
                        paddingHorizontal: compact ? 10 : 14,
                        marginTop: compact ? 6 : 14,
                    }}
                >
                    {optionalGroups.map((group) => {
                        const isOpen = openOptional[group.id] ?? false;
                        const count = selections[group.id]?.length ?? 0;
                        const meta = triggerMeta(group.id);
                        return (
                            <TouchableOpacity
                                key={group.id}
                                onPress={() =>
                                    setOpenOptional((prev) => ({ ...prev, [group.id]: !isOpen }))
                                }
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row-reverse',
                                    alignItems: 'center',
                                    paddingHorizontal: compact ? 10 : 12,
                                    paddingVertical: compact ? 6 : 8,
                                    borderRadius: 10,
                                    backgroundColor: isOpen ? NEUTRAL_TEXT : NEUTRAL_BG,
                                    borderWidth: 1,
                                    borderColor: isOpen ? NEUTRAL_TEXT : NEUTRAL_BORDER,
                                    marginLeft: 6,
                                }}
                            >
                                <Ionicons
                                    name={meta.icon}
                                    size={compact ? 13 : 14}
                                    color={isOpen ? 'white' : meta.accent}
                                    style={{ marginLeft: 5 }}
                                />
                                <Text
                                    style={{
                                        fontSize: compact ? 12 : 12,
                                        fontWeight: '600',
                                        color: isOpen ? 'white' : NEUTRAL_TEXT,
                                    }}
                                >
                                    {group.title_ar}
                                </Text>
                                {count > 0 ? (
                                    <View
                                        style={{
                                            marginRight: 6,
                                            minWidth: 16,
                                            height: 16,
                                            paddingHorizontal: 4,
                                            borderRadius: 8,
                                            backgroundColor: isOpen ? 'white' : NEUTRAL_TEXT,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: isOpen ? NEUTRAL_TEXT : 'white',
                                                fontSize: 10,
                                                fontWeight: '900',
                                            }}
                                        >
                                            {count}
                                        </Text>
                                    </View>
                                ) : null}
                            </TouchableOpacity>
                        );
                    })}
                    <View style={{ flex: 1 }} />
                </View>
            ) : null}

            {/* OPTIONAL GROUPS — each independently expanded */}
            {optionalGroups.map((group) => {
                const isOpen = openOptional[group.id] ?? false;
                if (!isOpen) return null;
                return (
                    <FadeSlideIn key={group.id}>
                        <GroupBlock
                            group={group}
                            selected={selections[group.id] ?? []}
                            isDone={false}
                            onToggle={(optId) => toggle(group, optId)}
                            heardIds={voiceHeardOptionIds}
                            compact={compact}
                        />
                    </FadeSlideIn>
                );
            })}

            {/* BOTTOM ACTION BAR */}
            <View
                style={{
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    paddingHorizontal: compact ? 10 : 12,
                    paddingTop: compact ? 10 : 14,
                    paddingBottom: compact ? 10 : 14,
                    marginTop: compact ? 10 : 12,
                    borderTopWidth: 1,
                    borderTopColor: compact ? NEUTRAL_BORDER : '#F3F4F6',
                    gap: compact ? 8 : 10,
                }}
            >
                <View
                    style={{
                        flexDirection: 'row-reverse',
                        alignItems: 'center',
                        backgroundColor: compact ? NEUTRAL_BG : '#F3F4F6',
                        borderRadius: compact ? 10 : 14,
                        borderWidth: compact ? 1 : 0,
                        borderColor: NEUTRAL_BORDER,
                        paddingHorizontal: 3,
                        height: compact ? 40 : 46,
                    }}
                >
                    <TouchableOpacity
                        onPress={() => {
                            const q = quantity + 1;
                            comboStore.setQuantity(combo.id, q);
                            onUserQuantity?.(Math.min(20, q));
                        }}
                        activeOpacity={0.6}
                        style={{
                            width: compact ? 32 : 34,
                            height: compact ? 32 : 34,
                            borderRadius: compact ? 8 : 17,
                            backgroundColor: 'white',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Ionicons name="add" size={compact ? 17 : 18} color={NEUTRAL_TEXT} />
                    </TouchableOpacity>
                    <Text
                        style={{
                            minWidth: compact ? 24 : 24,
                            textAlign: 'center',
                            fontSize: compact ? 14 : 15,
                            fontWeight: '700',
                            color: NEUTRAL_TEXT,
                        }}
                    >
                        {quantity}
                    </Text>
                    <TouchableOpacity
                        onPress={() => {
                            const q = quantity - 1;
                            comboStore.setQuantity(combo.id, q);
                            onUserQuantity?.(Math.max(1, q));
                        }}
                        activeOpacity={0.6}
                        style={{
                            width: compact ? 32 : 34,
                            height: compact ? 32 : 34,
                            borderRadius: compact ? 8 : 17,
                            backgroundColor: 'white',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: quantity === 1 ? 0.35 : 1,
                        }}
                    >
                        <Ionicons name="remove" size={compact ? 17 : 18} color={NEUTRAL_TEXT} />
                    </TouchableOpacity>
                </View>

                <Animated.View style={{ flex: 1, transform: [{ scale: ctaScale }] }}>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={handleAdd}
                        disabled={!canAdd}
                        style={{
                            height: compact ? 40 : 46,
                            borderRadius: compact ? 10 : 14,
                            backgroundColor: canAdd ? DARK : NEUTRAL_BG,
                            borderWidth: compact && !canAdd ? 1 : 0,
                            borderColor: NEUTRAL_BORDER,
                            flexDirection: 'row-reverse',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingHorizontal: compact ? 12 : 14,
                            // No shadow in compact — ChatGPT flat style
                            shadowColor: canAdd && !compact ? '#000' : 'transparent',
                            shadowOpacity: compact ? 0 : 0.18,
                            shadowRadius: compact ? 0 : 10,
                            shadowOffset: { width: 0, height: compact ? 0 : 4 },
                            elevation: canAdd && !compact ? 5 : 0,
                        }}
                    >
                        {canAdd ? (
                            <>
                                <Text style={{ color: 'white', fontSize: compact ? 14 : 14, fontWeight: '600' }}>
                                    إضافة
                                </Text>
                                <Text
                                    style={{
                                        color: 'white',
                                        fontSize: compact ? 14 : 14,
                                        fontWeight: '700',
                                        marginRight: compact ? 8 : 10,
                                    }}
                                >
                                    {lineTotal.toFixed(2)} ر.س
                                </Text>
                            </>
                        ) : (
                            <Text style={{ color: NEUTRAL_MUTED, fontSize: compact ? 12 : 13, fontWeight: '500' }}>
                                اختر {requiredUnfilled[0]?.title_ar}
                            </Text>
                        )}
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Animated.View>
    );
};

/* ---------------- FadeSlideIn: 300ms mount animation for expanded sections ---------------- */
const FadeSlideIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(anim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
        }).start();
    }, []);
    return (
        <Animated.View
            style={{
                opacity: anim,
                transform: [
                    { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                ],
            }}
        >
            {children}
        </Animated.View>
    );
};

/* ---------------- GROUP BLOCK (header + wrap chips, right-anchored) ---------------- */
const GroupBlock: React.FC<{
    group: ModifierGroup;
    selected: string[];
    isDone: boolean;
    onToggle: (optId: string) => void;
    heardIds: string[];
    compact?: boolean;
}> = ({ group, selected, isDone, onToggle, heardIds, compact }) => {
    const selectedNames = selected
        .map((id) => group.options.find((o) => o.id === id)?.name_ar)
        .filter(Boolean)
        .join('، ');

    return (
        <View style={{ marginTop: compact ? 6 : 14, paddingHorizontal: compact ? 10 : 14 }}>
            {/* header row — right-anchored: title + state */}
            <View
                style={{
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    marginBottom: compact ? 4 : 8,
                }}
            >
                <Text
                    style={{
                        fontSize: compact ? 13 : 13,
                        fontWeight: '600',
                        color: isDone ? NEUTRAL_MUTED : NEUTRAL_TEXT,
                        textDecorationLine: isDone ? 'line-through' : 'none',
                    }}
                >
                    {group.title_ar}
                </Text>

                {isDone && selectedNames ? (
                    <Text
                        style={{
                            fontSize: 11,
                            color: NEUTRAL_MUTED,
                            fontWeight: '500',
                            marginRight: 6,
                            flex: 1,
                            textAlign: 'right',
                        }}
                        numberOfLines={1}
                    >
                        · {selectedNames}
                    </Text>
                ) : (
                    <View style={{ flex: 1 }} />
                )}

                {group.required ? (
                    isDone ? (
                        <View
                            style={{
                                flexDirection: 'row-reverse',
                                alignItems: 'center',
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 6,
                                backgroundColor: '#D1FAE5',
                            }}
                        >
                            <Ionicons name="checkmark" size={12} color="#047857" style={{ marginLeft: 3 }} />
                            <Text style={{ fontSize: 11, color: '#047857', fontWeight: '700' }}>تم</Text>
                        </View>
                    ) : (
                        <View
                            style={{
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 6,
                                backgroundColor: '#FEE2E2',
                            }}
                        >
                            <Text style={{ fontSize: 11, color: '#B91C1C', fontWeight: '700' }}>مطلوب</Text>
                        </View>
                    )
                ) : (
                    <Text style={{ fontSize: 11, color: NEUTRAL_MUTED, fontWeight: '500' }}>
                        اختياري
                    </Text>
                )}
            </View>

            {/* chip wrap — right-anchored, wraps to next line */}
            <View
                style={{
                    flexDirection: 'row-reverse',
                    flexWrap: 'wrap',
                    justifyContent: 'flex-start',
                    marginHorizontal: -3,
                }}
            >
                {group.options.map((opt) => {
                    const isSelected = selected.includes(opt.id);
                    const isHeard = heardIds.includes(opt.id);
                    return (
                        <Chip
                            key={opt.id}
                            group={group}
                            option={opt}
                            isSelected={isSelected}
                            isHeard={isHeard}
                            onPress={() => onToggle(opt.id)}
                            compact={compact}
                        />
                    );
                })}
            </View>
        </View>
    );
};

/* ---------------- CHIP ---------------- */
const Chip: React.FC<{
    group: ModifierGroup;
    option: ModifierOption;
    isSelected: boolean;
    isHeard: boolean;
    onPress: () => void;
    compact?: boolean;
}> = ({ group, option, isSelected, isHeard, onPress, compact }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const heardGlow = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isHeard) {
            Animated.sequence([
                Animated.timing(heardGlow, { toValue: 1, duration: 240, useNativeDriver: false }),
                Animated.timing(heardGlow, { toValue: 0, duration: 1300, useNativeDriver: false, delay: 400 }),
            ]).start();
        }
    }, [isHeard]);

    useEffect(() => {
        if (isSelected) {
            Animated.sequence([
                Animated.timing(scale, { toValue: 1.05, duration: 120, useNativeDriver: true }),
                Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
            ]).start();
        }
    }, [isSelected]);

    // Subtle green glow when AI "hears" a pick — replaces the old loud purple.
    const borderColor = heardGlow.interpolate({
        inputRange: [0, 1],
        outputRange: [isSelected ? NEUTRAL_TEXT : NEUTRAL_BORDER, STATE_GREEN],
    });
    const bgColor = heardGlow.interpolate({
        inputRange: [0, 1],
        outputRange: [isSelected ? NEUTRAL_TEXT : 'white', isSelected ? NEUTRAL_TEXT : '#ECFDF5'],
    });

    return (
        <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={{ margin: 3 }}>
            <Animated.View
                style={{
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    paddingHorizontal: compact ? 12 : 12,
                    paddingVertical: compact ? 8 : 8,
                    borderRadius: 10,
                    backgroundColor: bgColor,
                    borderWidth: 1,
                    borderColor,
                    // Flat ChatGPT look — no shadow in compact
                    shadowColor: compact ? 'transparent' : '#000',
                    shadowOpacity: compact ? 0 : isSelected ? 0.08 : 0.03,
                    shadowRadius: compact ? 0 : 4,
                    shadowOffset: { width: 0, height: compact ? 0 : 1 },
                    elevation: compact ? 0 : isSelected ? 2 : 0,
                    transform: [{ scale }],
                }}
            >
                {group.select === 'multi' ? (
                    <View
                        style={{
                            width: compact ? 13 : 15,
                            height: compact ? 13 : 15,
                            borderRadius: 3,
                            borderWidth: 1.5,
                            borderColor: isSelected ? 'white' : NEUTRAL_BORDER,
                            backgroundColor: isSelected ? 'white' : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: compact ? 5 : 6,
                        }}
                    >
                        {isSelected ? <Ionicons name="checkmark" size={compact ? 9 : 10} color={NEUTRAL_TEXT} /> : null}
                    </View>
                ) : null}

                <Text
                    style={{
                        fontSize: compact ? 13 : 13,
                        fontWeight: '500',
                        color: isSelected ? 'white' : NEUTRAL_TEXT,
                        letterSpacing: 0.1,
                    }}
                >
                    {option.name_ar}
                </Text>

                {option.price_delta > 0 ? (
                    <Text
                        style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: isSelected ? 'rgba(255,255,255,0.72)' : NEUTRAL_MUTED,
                            marginRight: compact ? 5 : 6,
                        }}
                    >
                        +{option.price_delta.toFixed(0)}
                    </Text>
                ) : null}

                {option.badge ? (
                    <View
                        style={{
                            marginRight: 6,
                            backgroundColor: isSelected ? 'rgba(255,255,255,0.16)' : NEUTRAL_BG,
                            borderWidth: isSelected ? 0 : 1,
                            borderColor: NEUTRAL_BORDER,
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                            borderRadius: 4,
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 9,
                                fontWeight: '600',
                                color: isSelected ? 'white' : NEUTRAL_MUTED,
                                letterSpacing: 0.3,
                            }}
                        >
                            {option.badge}
                        </Text>
                    </View>
                ) : null}
            </Animated.View>
        </TouchableOpacity>
    );
};

export default ComboCard;
