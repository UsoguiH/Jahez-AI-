import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, ScrollView, Image, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CartItem } from './OrderCartWidget';
import { getRestaurantLogo } from '../lib/restaurantLogos';

interface InlineCartWidgetProps {
    items: CartItem[];
    restaurantName?: string;
    onShowCart: () => void;
    onItemsChange?: (items: CartItem[]) => void;
}

const VAT_RATE = 0.15;

const getFoodImage = (nameEn: string): string => {
    const n = nameEn.toLowerCase();
    if (n.includes('burger') || n.includes('mac') || n.includes('big mac') || n.includes('crispy'))
        return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=200&fit=crop';
    if (n.includes('chicken') || n.includes('nugget') || n.includes('mcnugget'))
        return 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=200&h=200&fit=crop';
    if (n.includes('fries') || n.includes('fry'))
        return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=200&h=200&fit=crop';
    if (n.includes('drink') || n.includes('cola') || n.includes('pepsi') || n.includes('sprite'))
        return 'https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=200&h=200&fit=crop';
    if (n.includes('wrap') || n.includes('shawarma'))
        return 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=200&h=200&fit=crop';
    if (n.includes('pizza'))
        return 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&h=200&fit=crop';
    if (n.includes('coffee') || n.includes('latte') || n.includes('cappuccino'))
        return 'https://images.unsplash.com/photo-1541167760496-9af0ab7f0da7?w=200&h=200&fit=crop';
    if (n.includes('ice cream') || n.includes('sundae') || n.includes('mcflurry'))
        return 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=200&h=200&fit=crop';
    if (n.includes('salad'))
        return 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=200&h=200&fit=crop';
    if (n.includes('meal') || n.includes('combo'))
        return 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=200&h=200&fit=crop';
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop';
};

// Apple's "emphasized decelerate" curve — starts fast, settles long. Used
// by iOS, Material 3 expressive, Linear, and Arc. The defining feel of a
// "premium" entrance vs. the generic ease-out that feels like a stock demo.
const EMPHASIZED_OUT = Easing.bezier(0.16, 1, 0.3, 1);

// Single cart row with its own mount animation. Keyed by item identity so
// React mounts a fresh CartRow whenever a new item is added; only that row
// runs its entrance animation. `delayMs` cascades rows on the initial widget
// reveal (first-render stagger) but is 0 for every later single-item add.
const CartRow: React.FC<{
    item: CartItem;
    idx: number;
    isLast: boolean;
    delayMs: number;
    onIncrement: () => void;
    onDecrement: () => void;
}> = ({ item, isLast, delayMs, onIncrement, onDecrement }) => {
    const rowOpacity = useRef(new Animated.Value(0)).current;
    // +40px translateX = slide in from the RIGHT (RTL arrival direction,
    // since Arabic reads right→left the item feels like it walks in from
    // its "natural" side). Big enough distance to actually be visible.
    const rowTranslate = useRef(new Animated.Value(40)).current;
    // Image scales from 0.6 up with a slight overshoot — the only springy
    // element in the widget. Confined to a 52x52 Image so GPU cost is
    // negligible even on weak phones, but it gives the row a "landed"
    // physical feel (Airbnb listing card, Apple Wallet pass feel).
    const imgScale = useRef(new Animated.Value(0.6)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(rowOpacity, {
                toValue: 1,
                duration: 460,
                delay: delayMs,
                easing: EMPHASIZED_OUT,
                useNativeDriver: true,
            }),
            Animated.timing(rowTranslate, {
                toValue: 0,
                duration: 520,
                delay: delayMs,
                easing: EMPHASIZED_OUT,
                useNativeDriver: true,
            }),
            Animated.spring(imgScale, {
                toValue: 1,
                delay: delayMs + 80,
                tension: 180,
                friction: 10,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    return (
        <Animated.View style={{ opacity: rowOpacity, transform: [{ translateX: rowTranslate }] }}>
            <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 10,
            }}>
                {/* Stepper Pill (left in RTL) */}
                <View style={{
                    backgroundColor: '#F2F2F7',
                    borderRadius: 20,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 3,
                    width: 90,
                }}>
                    <TouchableOpacity
                        onPress={onIncrement}
                        style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Ionicons name="add" size={15} color="#1D1D1F" />
                    </TouchableOpacity>

                    <View style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: '#E31837',
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#E31837',
                        shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.35,
                        shadowRadius: 6,
                        elevation: 4,
                    }}>
                        <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>
                            {item.quantity}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={onDecrement}
                        style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}
                    >
                        {item.quantity <= 1 ? (
                            <Ionicons name="trash-outline" size={14} color="#1D1D1F" />
                        ) : (
                            <Ionicons name="remove" size={15} color="#1D1D1F" />
                        )}
                    </TouchableOpacity>
                </View>

                <View style={{ flex: 1, alignItems: 'flex-end', marginLeft: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D1D1F', textAlign: 'right' }}>
                        {item.name_ar}
                    </Text>
                    {item.notes ? (
                        <Text style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: item.notes.includes('بدون') ? '#FF3B30' : '#34C759',
                            textAlign: 'right',
                            marginTop: 2,
                        }}>
                            {item.notes}
                        </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#1D1D1F' }}>﷼</Text>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: '#1D1D1F' }}>
                            {(item.unit_price * item.quantity).toFixed(2)}
                        </Text>
                    </View>
                </View>

                <Animated.View style={{ transform: [{ scale: imgScale }], marginLeft: 10 }}>
                    <Image
                        source={{ uri: getFoodImage(item.name_en) }}
                        style={{
                            width: 52,
                            height: 52,
                            borderRadius: 14,
                            backgroundColor: '#fff',
                        }}
                        resizeMode="cover"
                    />
                </Animated.View>
            </View>

            {!isLast && (
                <View style={{ height: 0.5, backgroundColor: '#F0F0F0', width: '100%' }} />
            )}
        </Animated.View>
    );
};

const InlineCartWidget: React.FC<InlineCartWidgetProps> = ({ items, restaurantName, onShowCart, onItemsChange }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    // 32px rise from below is big enough to clearly read as "the card just
    // arrived" rather than "the card was always there with a brief fade".
    const slideAnim = useRef(new Animated.Value(32)).current;
    // 0.92 start scale — bigger than 0.96 so the "focusing in" motion is
    // actually visible. Still small enough to not feel like a zoom-in pop.
    const scaleAnim = useRef(new Animated.Value(0.92)).current;

    // Capture whether this render is the very first one. Used to decide
    // whether rows should cascade in (first mount) or appear instantly
    // (user added a single new item to an already-visible cart).
    const isFirstRenderRef = useRef(true);
    const isFirstRender = isFirstRenderRef.current;
    useEffect(() => { isFirstRenderRef.current = false; }, []);

    // Container reveal: fade + 14px rise + soft scale from 0.96. The scale
    // is the secret sauce — too small to read as "zoom in" but enough to
    // feel like the card is "focusing in" instead of just appearing flat.
    // Emphasized-out curve so it lands cleanly without a spring bounce.
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                easing: EMPHASIZED_OUT,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 560,
                easing: EMPHASIZED_OUT,
                useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
                toValue: 1,
                duration: 560,
                easing: EMPHASIZED_OUT,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    if (items.length === 0) return null;

    const subtotal = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const total = subtotal + (subtotal * VAT_RATE);

    const handleIncrement = (idx: number) => {
        if (!onItemsChange) return;
        const newItems = [...items];
        newItems[idx] = { ...newItems[idx], quantity: newItems[idx].quantity + 1 };
        onItemsChange(newItems);
    };

    const handleDecrement = (idx: number) => {
        if (!onItemsChange) return;
        const newItems = [...items];
        if (newItems[idx].quantity <= 1) {
            newItems.splice(idx, 1);
        } else {
            newItems[idx] = { ...newItems[idx], quantity: newItems[idx].quantity - 1 };
        }
        onItemsChange(newItems);
    };

    return (
        <Animated.View
            style={{
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
                alignSelf: 'flex-start',
                width: '88%',
                marginBottom: 30,
            }}
        >
            <View style={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: 28,
                padding: 20,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowRadius: 24,
                elevation: 10,
                borderWidth: 0.5,
                borderColor: 'rgba(255,255,255,0.9)',
            }}>
                {/* Items */}
                <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
                    <View style={{ gap: 0 }}>
                        {items.map((item, idx) => (
                            <CartRow
                                key={`${item.name_en}-${item.notes || ''}`}
                                item={item}
                                idx={idx}
                                isLast={idx === items.length - 1}
                                // First render: 180ms head-start lets the
                                // container settle, then 85ms stagger between
                                // rows — slow enough to actually *see* the
                                // cascade. Later adds: 0ms (new row appears
                                // immediately, no fake one-row cascade).
                                delayMs={isFirstRender ? 180 + idx * 85 : 0}
                                onIncrement={() => handleIncrement(idx)}
                                onDecrement={() => handleDecrement(idx)}
                            />
                        ))}
                    </View>
                </ScrollView>

                {/* Divider before total */}
                <View style={{ height: 0.5, backgroundColor: '#E5E5EA', marginTop: 8, marginBottom: 12 }} />

                {/* Total */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 19, fontWeight: '800', color: '#D71920' }}>
                        {total.toFixed(2)} ر.س
                    </Text>
                    <Text style={{ fontSize: 19, fontWeight: '800', color: '#1D1D1F', textAlign: 'right' }}>
                        المجموع الكلي
                    </Text>
                </View>

                {/* عرض الطلب Button */}
                <TouchableOpacity
                    onPress={onShowCart}
                    activeOpacity={0.85}
                    style={{
                        backgroundColor: '#FF3B30',
                        paddingVertical: 16,
                        borderRadius: 16,
                        alignItems: 'center',
                        marginTop: 16,
                        shadowColor: '#FF3B30',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                        elevation: 8,
                    }}
                >
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: '800' }}>عرض الطلب</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

export default InlineCartWidget;
