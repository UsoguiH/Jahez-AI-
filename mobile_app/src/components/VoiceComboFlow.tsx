import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Animated,
    Image,
    Dimensions,
    Easing,
    Platform,
    StatusBar,
    SafeAreaView,
    ScrollView,
    TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ComboItem, ModifierGroup, ModifierOption } from '../data/mcdonaldsCombo';

const { height: SH } = Dimensions.get('window');
const BRAND_RED = '#DC2626';
const BRAND_RED_DARK = '#991B1B';

type Selections = Record<string, string[]>;

interface VoiceComboFlowProps {
    combo: ComboItem;
    visible: boolean;
    onClose: () => void;
    onAddToCart: (payload: {
        combo_id: string;
        quantity: number;
        selections: Selections;
        notes?: string;
        unit_price: number;
        line_total: number;
        summary_ar: string;
    }) => void;
    voiceHeardOptionIds?: string[];
}

const buildDefaults = (combo: ComboItem): Selections => {
    const sel: Selections = {};
    combo.groups.forEach((g) => {
        sel[g.id] = g.options.filter((o) => o.default).map((o) => o.id);
    });
    return sel;
};

const VoiceComboFlow: React.FC<VoiceComboFlowProps> = ({
    combo,
    visible,
    onClose,
    onAddToCart,
    voiceHeardOptionIds = [],
}) => {
    const [selections, setSelections] = useState<Selections>(() => buildDefaults(combo));
    const [quantity, setQuantity] = useState(1);
    const [notes, setNotes] = useState('');
    const [notesOpen, setNotesOpen] = useState(false);
    const [listening, setListening] = useState(true);

    // anim
    const rootFade = useRef(new Animated.Value(0)).current;
    const slide = useRef(new Animated.Value(40)).current;
    const micPulse = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            setSelections(buildDefaults(combo));
            setQuantity(1);
            setNotes('');
            setNotesOpen(false);
            setListening(true);
            Animated.parallel([
                Animated.timing(rootFade, { toValue: 1, duration: 240, useNativeDriver: true }),
                Animated.spring(slide, { toValue: 0, friction: 10, tension: 60, useNativeDriver: true }),
            ]).start();
        } else {
            rootFade.setValue(0);
            slide.setValue(40);
        }
    }, [visible, combo]);

    useEffect(() => {
        if (listening && visible) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(micPulse, { toValue: 1, duration: 1100, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
                    Animated.timing(micPulse, { toValue: 0, duration: 1100, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
                ])
            ).start();
        } else {
            micPulse.setValue(0);
        }
    }, [listening, visible]);

    const toggle = (group: ModifierGroup, optId: string) => {
        setSelections((prev) => {
            const current = prev[group.id] ?? [];
            if (group.select === 'single') {
                if (!group.required && current[0] === optId) return { ...prev, [group.id]: [] };
                return { ...prev, [group.id]: [optId] };
            }
            const exists = current.includes(optId);
            let next = exists ? current.filter((x) => x !== optId) : [...current, optId];
            if (group.max && next.length > group.max) next = next.slice(-group.max);
            return { ...prev, [group.id]: next };
        });
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

    const handleConfirm = () => {
        if (!canAdd) return;
        onAddToCart({
            combo_id: combo.id,
            quantity,
            selections,
            notes: notes.trim() || undefined,
            unit_price: unitPrice,
            line_total: lineTotal,
            summary_ar: `${combo.name_ar}${summaryParts.length ? ' - ' + summaryParts.join('، ') : ''}`,
        });
        onClose();
    };

    if (!visible) return null;

    return (
        <Animated.View
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: rootFade,
                zIndex: 1000,
                backgroundColor: '#F9FAFB',
            }}
            pointerEvents={visible ? 'auto' : 'none'}
        >
            <SafeAreaView style={{ flex: 1 }}>
                <View style={{ flex: 1, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0 }}>
                    {/* TOP BAR */}
                    <View
                        style={{
                            flexDirection: 'row-reverse',
                            alignItems: 'center',
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            backgroundColor: '#F9FAFB',
                            borderBottomWidth: 1,
                            borderBottomColor: '#F3F4F6',
                        }}
                    >
                        <TouchableOpacity
                            onPress={onClose}
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: 'white',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderWidth: 1,
                                borderColor: '#E5E7EB',
                            }}
                        >
                            <Ionicons name="close" size={22} color="#111827" />
                        </TouchableOpacity>

                        <View style={{ flex: 1, alignItems: 'center' }}>
                            <VoiceStatus listening={listening} pulse={micPulse} onToggle={() => setListening((v) => !v)} />
                        </View>

                        <View style={{ width: 40 }} />
                    </View>

                    <Animated.View style={{ flex: 1, transform: [{ translateY: slide }] }}>
                        <ScrollView
                            contentContainerStyle={{ paddingBottom: 140 }}
                            showsVerticalScrollIndicator={false}
                        >
                            {/* HERO */}
                            <View style={{ height: 200, backgroundColor: '#E5E7EB' }}>
                                <Image source={{ uri: combo.hero_image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                <View
                                    style={{
                                        position: 'absolute',
                                        top: 12,
                                        right: 12,
                                        flexDirection: 'row-reverse',
                                        alignItems: 'center',
                                        backgroundColor: 'rgba(255,255,255,0.95)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 999,
                                    }}
                                >
                                    <View
                                        style={{
                                            width: 18,
                                            height: 18,
                                            borderRadius: 9,
                                            backgroundColor: '#FFC72C',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Text style={{ fontSize: 10, color: '#DA291C', fontWeight: '900' }}>M</Text>
                                    </View>
                                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#111827', marginRight: 6 }}>
                                        {combo.restaurant_ar}
                                    </Text>
                                </View>
                            </View>

                            {/* TITLE CARD */}
                            <View
                                style={{
                                    marginHorizontal: 14,
                                    marginTop: -28,
                                    padding: 16,
                                    backgroundColor: 'white',
                                    borderRadius: 22,
                                    shadowColor: '#000',
                                    shadowOpacity: 0.08,
                                    shadowRadius: 14,
                                    shadowOffset: { width: 0, height: 4 },
                                    elevation: 6,
                                }}
                            >
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start' }}>
                                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                        <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827', textAlign: 'right' }}>
                                            {combo.name_ar}
                                        </Text>
                                        <Text
                                            style={{
                                                fontSize: 13,
                                                color: '#6B7280',
                                                textAlign: 'right',
                                                marginTop: 4,
                                                lineHeight: 19,
                                            }}
                                        >
                                            {combo.description_ar}
                                        </Text>
                                    </View>
                                </View>

                                <View
                                    style={{
                                        marginTop: 12,
                                        paddingTop: 12,
                                        borderTopWidth: 1,
                                        borderTopColor: '#F3F4F6',
                                        flexDirection: 'row-reverse',
                                        alignItems: 'center',
                                    }}
                                >
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                                        <Ionicons name="time-outline" size={14} color="#6B7280" />
                                        <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '700', marginRight: 4 }}>
                                            20-30 دقيقة
                                        </Text>
                                    </View>
                                    <View style={{ width: 1, height: 14, backgroundColor: '#E5E7EB', marginHorizontal: 10 }} />
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                                        <Ionicons name="flame-outline" size={14} color="#6B7280" />
                                        <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '700', marginRight: 4 }}>
                                            ~950 كالوري
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }} />
                                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#111827' }}>
                                        {combo.base_price.toFixed(0)} ر.س
                                    </Text>
                                    <Text style={{ fontSize: 10, color: '#9CA3AF', fontWeight: '700', marginRight: 3 }}>
                                        البداية من
                                    </Text>
                                </View>
                            </View>

                            {/* MODIFIER GROUPS */}
                            {combo.groups.map((group) => (
                                <GroupRow
                                    key={group.id}
                                    group={group}
                                    selected={selections[group.id] ?? []}
                                    onToggle={(optId) => toggle(group, optId)}
                                    heardIds={voiceHeardOptionIds}
                                />
                            ))}

                            {/* NOTES */}
                            <View style={{ marginHorizontal: 14, marginTop: 14 }}>
                                {!notesOpen ? (
                                    <TouchableOpacity
                                        onPress={() => setNotesOpen(true)}
                                        style={{
                                            backgroundColor: 'white',
                                            borderRadius: 18,
                                            paddingHorizontal: 14,
                                            paddingVertical: 14,
                                            flexDirection: 'row-reverse',
                                            alignItems: 'center',
                                            borderWidth: 1,
                                            borderColor: '#F3F4F6',
                                        }}
                                    >
                                        <Ionicons name="create-outline" size={18} color="#6B7280" />
                                        <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '700', marginRight: 8 }}>
                                            ملاحظات للمطعم (اختياري)
                                        </Text>
                                        <View style={{ flex: 1 }} />
                                        <Ionicons name="add" size={18} color="#6B7280" />
                                    </TouchableOpacity>
                                ) : (
                                    <View
                                        style={{
                                            backgroundColor: 'white',
                                            borderRadius: 18,
                                            paddingHorizontal: 14,
                                            paddingVertical: 12,
                                            borderWidth: 1,
                                            borderColor: '#F3F4F6',
                                        }}
                                    >
                                        <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '700', textAlign: 'right', marginBottom: 6 }}>
                                            ملاحظات للمطعم
                                        </Text>
                                        <TextInput
                                            placeholder="مثال: لا تستخدمون المخلل"
                                            placeholderTextColor="#9CA3AF"
                                            value={notes}
                                            onChangeText={setNotes}
                                            multiline
                                            style={{
                                                fontSize: 14,
                                                color: '#111827',
                                                textAlign: 'right',
                                                minHeight: 44,
                                                padding: 0,
                                            }}
                                        />
                                    </View>
                                )}
                            </View>

                            <View style={{ paddingHorizontal: 18, paddingVertical: 18 }}>
                                <Text style={{ color: '#9CA3AF', fontSize: 11, textAlign: 'right' }}>
                                    *السعرات والأسعار تقريبية • الضريبة ١٥٪ تحتسب عند الدفع
                                </Text>
                            </View>
                        </ScrollView>
                    </Animated.View>

                    {/* STICKY BOTTOM */}
                    <View
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            paddingHorizontal: 12,
                            paddingTop: 10,
                            paddingBottom: Platform.OS === 'ios' ? 24 : 14,
                            backgroundColor: 'white',
                            borderTopWidth: 1,
                            borderTopColor: '#F3F4F6',
                            flexDirection: 'row-reverse',
                            alignItems: 'center',
                            shadowColor: '#000',
                            shadowOpacity: 0.08,
                            shadowRadius: 14,
                            shadowOffset: { width: 0, height: -4 },
                            elevation: 14,
                        }}
                    >
                        {/* qty */}
                        <View
                            style={{
                                flexDirection: 'row-reverse',
                                alignItems: 'center',
                                backgroundColor: '#F3F4F6',
                                borderRadius: 999,
                                paddingHorizontal: 4,
                                height: 52,
                                marginLeft: 10,
                            }}
                        >
                            <TouchableOpacity
                                onPress={() => setQuantity((q) => Math.min(q + 1, 20))}
                                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                            >
                                <Ionicons name="add" size={22} color="#111827" />
                            </TouchableOpacity>
                            <Text style={{ minWidth: 28, textAlign: 'center', fontSize: 17, fontWeight: '900', color: '#111827' }}>
                                {quantity}
                            </Text>
                            <TouchableOpacity
                                onPress={() => setQuantity((q) => Math.max(q - 1, 1))}
                                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: quantity === 1 ? 0.4 : 1 }}
                            >
                                <Ionicons name="remove" size={22} color="#111827" />
                            </TouchableOpacity>
                        </View>

                        {/* CTA */}
                        <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={handleConfirm}
                            disabled={!canAdd}
                            style={{
                                flex: 1,
                                height: 58,
                                borderRadius: 999,
                                backgroundColor: canAdd ? BRAND_RED : '#E5E7EB',
                                flexDirection: 'row-reverse',
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingHorizontal: 16,
                                shadowColor: canAdd ? BRAND_RED_DARK : 'transparent',
                                shadowOpacity: 0.32,
                                shadowRadius: 14,
                                shadowOffset: { width: 0, height: 6 },
                                elevation: canAdd ? 8 : 0,
                            }}
                        >
                            {canAdd ? (
                                <>
                                    <Text style={{ color: 'white', fontSize: 16, fontWeight: '900' }}>
                                        أضف للسلة
                                    </Text>
                                    <View
                                        style={{
                                            width: 1,
                                            height: 22,
                                            backgroundColor: 'rgba(255,255,255,0.5)',
                                            marginHorizontal: 12,
                                        }}
                                    />
                                    <Text style={{ color: 'white', fontSize: 17, fontWeight: '900' }}>
                                        {lineTotal.toFixed(2)} ر.س
                                    </Text>
                                </>
                            ) : (
                                <Text style={{ color: '#6B7280', fontSize: 14, fontWeight: '800' }}>
                                    اختر {requiredUnfilled[0]?.title_ar}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        </Animated.View>
    );
};

/* ----------------- GROUP ROW (horizontal chips) ----------------- */
const GroupRow: React.FC<{
    group: ModifierGroup;
    selected: string[];
    onToggle: (optId: string) => void;
    heardIds: string[];
}> = ({ group, selected, onToggle, heardIds }) => {
    return (
        <View style={{ marginTop: 18 }}>
            <View
                style={{
                    paddingHorizontal: 18,
                    marginBottom: 10,
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                }}
            >
                <Text style={{ fontSize: 16, fontWeight: '900', color: '#111827' }}>{group.title_ar}</Text>
                {group.required ? (
                    <Text style={{ fontSize: 11, color: BRAND_RED, fontWeight: '800', marginRight: 8 }}>* مطلوب</Text>
                ) : (
                    <Text style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '700', marginRight: 8 }}>
                        {group.select === 'multi' ? 'اختياري — تقدر تختار أكثر من واحد' : 'اختياري'}
                    </Text>
                )}
                <View style={{ flex: 1 }} />
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 12, flexDirection: 'row-reverse' }}
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
                        />
                    );
                })}
            </ScrollView>
        </View>
    );
};

/* ----------------- CHIP ----------------- */
const Chip: React.FC<{
    group: ModifierGroup;
    option: ModifierOption;
    isSelected: boolean;
    isHeard: boolean;
    onPress: () => void;
}> = ({ group, option, isSelected, isHeard, onPress }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const heardGlow = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isHeard) {
            Animated.sequence([
                Animated.timing(heardGlow, { toValue: 1, duration: 260, useNativeDriver: false }),
                Animated.timing(heardGlow, { toValue: 0, duration: 1400, useNativeDriver: false, delay: 400 }),
            ]).start();
        }
    }, [isHeard]);

    useEffect(() => {
        if (isSelected) {
            // JS driver — same Animated.View also drives borderColor via heardGlow
            // (JS-only color interpolation). Mixing drivers on one node throws
            // "JS driven animation on animated node moved to native earlier" when
            // isSelected and isHeard fire close together.
            Animated.sequence([
                Animated.timing(scale, { toValue: 1.06, duration: 140, useNativeDriver: false }),
                Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: false }),
            ]).start();
        }
    }, [isSelected]);

    const borderColor = heardGlow.interpolate({
        inputRange: [0, 1],
        outputRange: [isSelected ? BRAND_RED : '#E5E7EB', '#4338CA'],
    });

    return (
        <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={{ marginHorizontal: 5 }}>
            <Animated.View
                style={{
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: isSelected ? '#FEF2F2' : 'white',
                    borderWidth: 1.5,
                    borderColor,
                    shadowColor: isSelected ? BRAND_RED_DARK : '#000',
                    shadowOpacity: isSelected ? 0.12 : 0.04,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: isSelected ? 3 : 1,
                    transform: [{ scale }],
                }}
            >
                {group.select === 'multi' ? (
                    <View
                        style={{
                            width: 18,
                            height: 18,
                            borderRadius: 5,
                            borderWidth: 2,
                            borderColor: isSelected ? BRAND_RED : '#D1D5DB',
                            backgroundColor: isSelected ? BRAND_RED : 'white',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: 8,
                        }}
                    >
                        {isSelected ? <Ionicons name="checkmark" size={12} color="white" /> : null}
                    </View>
                ) : null}

                <Text
                    style={{
                        fontSize: 14,
                        fontWeight: '800',
                        color: isSelected ? BRAND_RED_DARK : '#111827',
                    }}
                >
                    {option.name_ar}
                </Text>

                {option.price_delta > 0 ? (
                    <Text
                        style={{
                            fontSize: 12,
                            fontWeight: '900',
                            color: isSelected ? BRAND_RED : '#6B7280',
                            marginRight: 6,
                        }}
                    >
                        +{option.price_delta.toFixed(0)}
                    </Text>
                ) : null}

                {typeof option.calories === 'number' && option.calories > 0 ? (
                    <Text style={{ fontSize: 10, color: '#9CA3AF', fontWeight: '700', marginRight: 4 }}>
                        · {option.calories}
                    </Text>
                ) : null}

                {option.badge ? (
                    <View
                        style={{
                            marginRight: 6,
                            backgroundColor: '#FEF3C7',
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 999,
                        }}
                    >
                        <Text style={{ fontSize: 9, fontWeight: '900', color: '#92400E' }}>{option.badge}</Text>
                    </View>
                ) : null}
            </Animated.View>
        </TouchableOpacity>
    );
};

/* ----------------- VOICE STATUS (top) ----------------- */
const VoiceStatus: React.FC<{ listening: boolean; pulse: Animated.Value; onToggle: () => void }> = ({
    listening,
    pulse,
    onToggle,
}) => {
    const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
    const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });
    return (
        <TouchableOpacity onPress={onToggle} activeOpacity={0.85}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                    {listening ? (
                        <Animated.View
                            style={{
                                position: 'absolute',
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                backgroundColor: BRAND_RED,
                                transform: [{ scale: pulseScale }],
                                opacity: pulseOpacity,
                            }}
                        />
                    ) : null}
                    <View
                        style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: listening ? BRAND_RED : '#9CA3AF',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Ionicons name={listening ? 'mic' : 'mic-off'} size={12} color="white" />
                    </View>
                </View>
                <Text
                    style={{
                        fontSize: 13,
                        color: listening ? '#111827' : '#6B7280',
                        fontWeight: '800',
                        marginRight: 8,
                    }}
                >
                    {listening ? 'جاهز يسمعك — قل التغيير' : 'المايك مقفل — اضغط للتفعيل'}
                </Text>
            </View>
        </TouchableOpacity>
    );
};

export default VoiceComboFlow;
