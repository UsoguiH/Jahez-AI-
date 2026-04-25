import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Animated,
    ScrollView,
    Image,
    Dimensions,
    StatusBar,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ComboItem, ModifierGroup, ModifierOption } from '../data/mcdonaldsCombo';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BRAND_RED = '#DC2626';
const BRAND_RED_DARK = '#B91C1C';

type Selections = Record<string, string[]>;

interface ComboCustomizerProps {
    combo: ComboItem;
    visible: boolean;
    onClose: () => void;
    onAddToCart: (payload: {
        combo_id: string;
        quantity: number;
        selections: Selections;
        unit_price: number;
        line_total: number;
        summary_ar: string;
    }) => void;
    voiceHeardOptionIds?: string[];
}

const buildDefaults = (combo: ComboItem): Selections => {
    const sel: Selections = {};
    combo.groups.forEach((g) => {
        const defaults = g.options.filter((o) => o.default).map((o) => o.id);
        sel[g.id] = defaults;
    });
    return sel;
};

const ComboCustomizer: React.FC<ComboCustomizerProps> = ({
    combo,
    visible,
    onClose,
    onAddToCart,
    voiceHeardOptionIds = [],
}) => {
    const [selections, setSelections] = useState<Selections>(() => buildDefaults(combo));
    const [quantity, setQuantity] = useState(1);

    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            setSelections(buildDefaults(combo));
            setQuantity(1);
            Animated.parallel([
                Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, friction: 10, tension: 60, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 260, useNativeDriver: true }),
            ]).start();
        }
    }, [visible, combo]);

    const toggle = (group: ModifierGroup, optId: string) => {
        setSelections((prev) => {
            const current = prev[group.id] ?? [];
            if (group.select === 'single') {
                return { ...prev, [group.id]: [optId] };
            }
            const exists = current.includes(optId);
            let next = exists ? current.filter((x) => x !== optId) : [...current, optId];
            if (group.max && next.length > group.max) next = next.slice(-group.max);
            return { ...prev, [group.id]: next };
        });
    };

    const { modifiersTotal, unitPrice, lineTotal, requiredUnfilled, summaryParts } = useMemo(() => {
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
            modifiersTotal: mod,
            unitPrice: unit,
            lineTotal: unit * quantity,
            requiredUnfilled: unfilled,
            summaryParts: parts,
        };
    }, [combo, selections, quantity]);

    const canAdd = requiredUnfilled.length === 0;

    const handleAdd = () => {
        if (!canAdd) return;
        const summary_ar = `${combo.name_ar}${summaryParts.length ? ' - ' + summaryParts.join('، ') : ''}`;
        onAddToCart({
            combo_id: combo.id,
            quantity,
            selections,
            unit_price: unitPrice,
            line_total: lineTotal,
            summary_ar,
        });
        onClose();
    };

    if (!visible && (slideAnim as any)._value >= SCREEN_HEIGHT) return null;

    return (
        <Animated.View
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1000,
                opacity: backdropAnim,
            }}
            pointerEvents={visible ? 'auto' : 'none'}
        >
            <Animated.View
                style={{
                    ...StyleAbsoluteFill,
                    backgroundColor: 'rgba(15, 23, 42, 0.55)',
                }}
            >
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
            </Animated.View>

            <Animated.View
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    transform: [{ translateY: slideAnim }],
                    backgroundColor: '#F9FAFB',
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    overflow: 'hidden',
                    marginTop: Platform.OS === 'ios' ? 48 : (StatusBar.currentHeight ?? 24) + 24,
                }}
            >
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 160 }}
                    showsVerticalScrollIndicator={false}
                    bounces={true}
                >
                    {/* HERO */}
                    <View style={{ height: 240, backgroundColor: '#E5E7EB', position: 'relative' }}>
                        <Image source={{ uri: combo.hero_image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        <View
                            style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                bottom: 0,
                                height: 160,
                                backgroundColor: 'rgba(0,0,0,0.0)',
                            }}
                        />
                        <View
                            style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                bottom: 0,
                                paddingHorizontal: 20,
                                paddingBottom: 18,
                            }}
                        >
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-end' }}>
                                <View style={{ flex: 1 }}>
                                    <View
                                        style={{
                                            alignSelf: 'flex-end',
                                            backgroundColor: 'rgba(255,255,255,0.95)',
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                            borderRadius: 999,
                                            marginBottom: 8,
                                        }}
                                    >
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#111827' }}>
                                            {combo.restaurant_ar}
                                        </Text>
                                    </View>
                                    <Text
                                        style={{
                                            fontSize: 26,
                                            fontWeight: '800',
                                            color: 'white',
                                            textAlign: 'right',
                                            textShadowColor: 'rgba(0,0,0,0.45)',
                                            textShadowRadius: 8,
                                        }}
                                    >
                                        {combo.name_ar}
                                    </Text>
                                    <Text
                                        style={{
                                            fontSize: 13,
                                            color: 'rgba(255,255,255,0.92)',
                                            textAlign: 'right',
                                            marginTop: 4,
                                            textShadowColor: 'rgba(0,0,0,0.45)',
                                            textShadowRadius: 6,
                                        }}
                                    >
                                        {combo.description_ar}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Close button */}
                        <TouchableOpacity
                            onPress={onClose}
                            style={{
                                position: 'absolute',
                                top: 14,
                                left: 14,
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: 'rgba(255,255,255,0.95)',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Ionicons name="close" size={22} color="#111827" />
                        </TouchableOpacity>
                    </View>

                    {/* BASE PRICE STRIP */}
                    <View
                        style={{
                            flexDirection: 'row-reverse',
                            paddingHorizontal: 20,
                            paddingVertical: 14,
                            backgroundColor: 'white',
                            borderBottomWidth: 1,
                            borderBottomColor: '#F3F4F6',
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '600' }}>السعر الأساسي</Text>
                        <View style={{ flex: 1 }} />
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
                            {combo.base_price.toFixed(2)} ر.س
                        </Text>
                    </View>

                    {/* GROUPS */}
                    {combo.groups.map((group) => {
                        const picked = selections[group.id] ?? [];
                        const satisfied = picked.length >= (group.required ? Math.max(group.min ?? 1, 1) : 0);
                        return (
                            <View key={group.id} style={{ marginTop: 14, backgroundColor: 'white' }}>
                                {/* Group header */}
                                <View
                                    style={{
                                        flexDirection: 'row-reverse',
                                        alignItems: 'center',
                                        paddingHorizontal: 20,
                                        paddingTop: 18,
                                        paddingBottom: 10,
                                    }}
                                >
                                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>
                                        {group.title_ar}
                                    </Text>
                                    <View style={{ flex: 1 }} />
                                    <GroupBadge group={group} satisfied={satisfied} />
                                </View>

                                {/* Options */}
                                <View>
                                    {group.options.map((opt, idx) => {
                                        const isSelected = picked.includes(opt.id);
                                        const isHeard = voiceHeardOptionIds.includes(opt.id);
                                        return (
                                            <OptionRow
                                                key={opt.id}
                                                group={group}
                                                option={opt}
                                                selected={isSelected}
                                                heard={isHeard}
                                                onPress={() => toggle(group, opt.id)}
                                                isLast={idx === group.options.length - 1}
                                            />
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    })}

                    {/* Footnote */}
                    <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
                        <Text style={{ color: '#9CA3AF', fontSize: 11, textAlign: 'right' }}>
                            *السعرات والأسعار تقريبية • الضريبة ١٥٪ تحتسب عند الدفع
                        </Text>
                    </View>
                </ScrollView>

                {/* STICKY BOTTOM BAR */}
                <View
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'white',
                        borderTopWidth: 1,
                        borderTopColor: '#F3F4F6',
                        paddingHorizontal: 16,
                        paddingTop: 12,
                        paddingBottom: Platform.OS === 'ios' ? 28 : 16,
                        flexDirection: 'row-reverse',
                        alignItems: 'center',
                        shadowColor: '#000',
                        shadowOpacity: 0.08,
                        shadowRadius: 14,
                        shadowOffset: { width: 0, height: -4 },
                        elevation: 14,
                    }}
                >
                    {/* Quantity stepper */}
                    <View
                        style={{
                            flexDirection: 'row-reverse',
                            alignItems: 'center',
                            backgroundColor: '#F3F4F6',
                            borderRadius: 999,
                            paddingHorizontal: 4,
                            height: 48,
                            marginLeft: 12,
                        }}
                    >
                        <TouchableOpacity
                            onPress={() => setQuantity((q) => Math.min(q + 1, 20))}
                            style={{
                                width: 40,
                                height: 40,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 999,
                            }}
                        >
                            <Ionicons name="add" size={22} color="#111827" />
                        </TouchableOpacity>
                        <Text style={{ minWidth: 28, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#111827' }}>
                            {quantity}
                        </Text>
                        <TouchableOpacity
                            onPress={() => setQuantity((q) => Math.max(q - 1, 1))}
                            style={{
                                width: 40,
                                height: 40,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 999,
                                opacity: quantity === 1 ? 0.4 : 1,
                            }}
                        >
                            <Ionicons name="remove" size={22} color="#111827" />
                        </TouchableOpacity>
                    </View>

                    {/* CTA */}
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={handleAdd}
                        disabled={!canAdd}
                        style={{
                            flex: 1,
                            height: 56,
                            backgroundColor: canAdd ? BRAND_RED : '#E5E7EB',
                            borderRadius: 999,
                            flexDirection: 'row-reverse',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingHorizontal: 18,
                            shadowColor: canAdd ? BRAND_RED_DARK : 'transparent',
                            shadowOpacity: 0.32,
                            shadowRadius: 14,
                            shadowOffset: { width: 0, height: 6 },
                            elevation: canAdd ? 8 : 0,
                        }}
                    >
                        {canAdd ? (
                            <>
                                <Text style={{ color: 'white', fontSize: 15, fontWeight: '800' }}>
                                    إضافة للسلة
                                </Text>
                                <View
                                    style={{
                                        width: 1,
                                        height: 22,
                                        backgroundColor: 'rgba(255,255,255,0.5)',
                                        marginHorizontal: 12,
                                    }}
                                />
                                <Text style={{ color: 'white', fontSize: 16, fontWeight: '800' }}>
                                    {lineTotal.toFixed(2)} ر.س
                                </Text>
                            </>
                        ) : (
                            <Text style={{ color: '#6B7280', fontSize: 14, fontWeight: '800' }}>
                                اختر {requiredUnfilled[0]?.title_ar} للمتابعة
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </Animated.View>
    );
};

const StyleAbsoluteFill = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
};

const GroupBadge: React.FC<{ group: ModifierGroup; satisfied: boolean }> = ({ group, satisfied }) => {
    if (group.required) {
        if (satisfied) {
            return (
                <View
                    style={{
                        flexDirection: 'row-reverse',
                        alignItems: 'center',
                        backgroundColor: '#DCFCE7',
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                    }}
                >
                    <Ionicons name="checkmark" size={14} color="#15803D" />
                    <Text style={{ color: '#15803D', fontSize: 11, fontWeight: '800', marginRight: 4 }}>تم</Text>
                </View>
            );
        }
        return (
            <View
                style={{
                    backgroundColor: '#FFEDD5',
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                }}
            >
                <Text style={{ color: '#C2410C', fontSize: 11, fontWeight: '800' }}>مطلوب</Text>
            </View>
        );
    }
    return (
        <View
            style={{
                backgroundColor: '#F3F4F6',
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 5,
            }}
        >
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700' }}>
                {group.select === 'multi' ? 'اختياري — متعدد' : 'اختياري'}
            </Text>
        </View>
    );
};

const OptionRow: React.FC<{
    group: ModifierGroup;
    option: ModifierOption;
    selected: boolean;
    heard: boolean;
    onPress: () => void;
    isLast: boolean;
}> = ({ group, option, selected, heard, onPress, isLast }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const heardOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (heard) {
            heardOpacity.setValue(1);
            Animated.timing(heardOpacity, { toValue: 0, duration: 1800, delay: 800, useNativeDriver: true }).start();
        }
    }, [heard]);

    const onPressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, friction: 8 }).start();
    const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 8 }).start();

    return (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
        >
            <Animated.View
                style={{
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    backgroundColor: selected ? '#FEF2F2' : 'white',
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: '#F3F4F6',
                    borderRightWidth: selected ? 3 : 0,
                    borderRightColor: BRAND_RED,
                    transform: [{ scale }],
                }}
            >
                {/* Right side: name + meta */}
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                        <Text
                            style={{
                                fontSize: 15,
                                fontWeight: selected ? '800' : '700',
                                color: selected ? BRAND_RED_DARK : '#111827',
                            }}
                        >
                            {option.name_ar}
                        </Text>
                        {option.badge ? (
                            <View
                                style={{
                                    marginRight: 8,
                                    backgroundColor: '#FEF3C7',
                                    paddingHorizontal: 8,
                                    paddingVertical: 2,
                                    borderRadius: 999,
                                }}
                            >
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#92400E' }}>{option.badge}</Text>
                            </View>
                        ) : null}
                        <Animated.View
                            style={{
                                marginRight: 8,
                                flexDirection: 'row-reverse',
                                alignItems: 'center',
                                backgroundColor: '#EEF2FF',
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                borderRadius: 999,
                                opacity: heardOpacity,
                            }}
                        >
                            <Ionicons name="mic" size={10} color="#4338CA" />
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#4338CA', marginRight: 4 }}>
                                من صوتك
                            </Text>
                        </Animated.View>
                    </View>
                    {typeof option.calories === 'number' ? (
                        <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                            {option.calories} كالوري
                        </Text>
                    ) : null}
                </View>

                {/* Left: price delta + selector */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginLeft: 4 }}>
                    {option.price_delta > 0 ? (
                        <View
                            style={{
                                flexDirection: 'row-reverse',
                                alignItems: 'center',
                                backgroundColor: selected ? 'white' : '#F9FAFB',
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 999,
                                marginLeft: 10,
                                borderWidth: 1,
                                borderColor: selected ? '#FECACA' : '#E5E7EB',
                            }}
                        >
                            <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '800' }}>
                                +{option.price_delta.toFixed(2)}
                            </Text>
                        </View>
                    ) : null}
                    <Selector group={group} selected={selected} />
                </View>
            </Animated.View>
        </TouchableOpacity>
    );
};

const Selector: React.FC<{ group: ModifierGroup; selected: boolean }> = ({ group, selected }) => {
    const isRadio = group.select === 'single';
    return (
        <View
            style={{
                width: 24,
                height: 24,
                borderRadius: isRadio ? 12 : 6,
                borderWidth: 2,
                borderColor: selected ? BRAND_RED : '#D1D5DB',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected && !isRadio ? BRAND_RED : 'white',
            }}
        >
            {selected && isRadio ? (
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND_RED }} />
            ) : null}
            {selected && !isRadio ? <Ionicons name="checkmark" size={16} color="white" /> : null}
        </View>
    );
};

export default ComboCustomizer;
