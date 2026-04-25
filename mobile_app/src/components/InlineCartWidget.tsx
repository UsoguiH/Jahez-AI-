import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Image } from 'react-native';
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
const MAX_VISIBLE_ITEMS = 3;

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

// Compact item row — RTL: image leads on the right, stepper on the left.
const CartRow: React.FC<{
    item: CartItem;
    isLast: boolean;
    onIncrement: () => void;
    onDecrement: () => void;
}> = ({ item, isLast, onIncrement, onDecrement }) => {
    return (
        <View>
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 8,
            }}>
                {/* Stepper pill (LEFT in the row — action edge in RTL) */}
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F5F5F7',
                    borderRadius: 16,
                    paddingHorizontal: 3,
                    height: 30,
                }}>
                    <TouchableOpacity
                        onPress={onDecrement}
                        style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Ionicons
                            name={item.quantity <= 1 ? 'trash-outline' : 'remove'}
                            size={13}
                            color="#1D1D1F"
                        />
                    </TouchableOpacity>
                    <Text style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: '#1D1D1F',
                        minWidth: 16,
                        textAlign: 'center',
                    }}>
                        {item.quantity}
                    </Text>
                    <TouchableOpacity
                        onPress={onIncrement}
                        style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Ionicons name="add" size={13} color="#1D1D1F" />
                    </TouchableOpacity>
                </View>

                {/* Name + price (middle) */}
                <View style={{ flex: 1, alignItems: 'flex-end', marginHorizontal: 9 }}>
                    <Text
                        style={{ fontSize: 13, fontWeight: '700', color: '#1D1D1F', textAlign: 'right' }}
                        numberOfLines={1}
                    >
                        {item.name_ar}
                    </Text>
                    {item.notes ? (
                        <Text style={{
                            fontSize: 10,
                            fontWeight: '600',
                            color: item.notes.includes('بدون') ? '#FF3B30' : '#34C759',
                            textAlign: 'right',
                            marginTop: 1,
                        }} numberOfLines={1}>
                            {item.notes}
                        </Text>
                    ) : null}
                    <Text style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: '#6B6B70',
                        marginTop: 2,
                    }}>
                        {(item.unit_price * item.quantity).toFixed(2)} ر.س
                    </Text>
                </View>

                {/* Image (RIGHT — leading edge in RTL) */}
                <Image
                    source={{ uri: getFoodImage(item.name_en) }}
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 11,
                        backgroundColor: '#F5F5F7',
                    }}
                    resizeMode="cover"
                />
            </View>

            {!isLast && (
                <View style={{ height: 0.5, backgroundColor: '#F0F0F0' }} />
            )}
        </View>
    );
};

// Stack of overlapping mini-thumbs for the "+N more items" row.
const StackedThumbs: React.FC<{ items: CartItem[] }> = ({ items }) => {
    const shown = items.slice(0, 2);
    return (
        <View style={{ flexDirection: 'row', width: 44, height: 44, alignItems: 'center', justifyContent: 'flex-end' }}>
            {shown.map((it, i) => (
                <Image
                    key={`${it.name_en}-${i}`}
                    source={{ uri: getFoodImage(it.name_en) }}
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        backgroundColor: '#F5F5F7',
                        position: 'absolute',
                        // First thumb on right, second offset to the left so it
                        // peeks out behind — natural RTL stack.
                        right: i * 12,
                        zIndex: shown.length - i,
                        borderWidth: 1.5,
                        borderColor: '#FFFFFF',
                    }}
                    resizeMode="cover"
                />
            ))}
        </View>
    );
};

const InlineCartWidget: React.FC<InlineCartWidgetProps> = ({ items, restaurantName, onShowCart, onItemsChange }) => {
    // Single fast fade — the user wants the cart to appear immediately when
    // the AI confirms the order, not cascade in. 150 ms is enough to avoid a
    // hard pop-in but short enough to feel instant.
    const fadeAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
        }).start();
    }, []);

    if (items.length === 0) return null;

    const subtotal = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const vatAmount = subtotal * VAT_RATE;
    const total = subtotal + vatAmount;
    const visibleItems = items.slice(0, MAX_VISIBLE_ITEMS);
    const hiddenItems = items.slice(MAX_VISIBLE_ITEMS);
    const logo = getRestaurantLogo(restaurantName || '');

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
                alignSelf: 'flex-start',
                width: '85%',
                marginBottom: 24,
            }}
        >
            <View style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingTop: 12,
                paddingBottom: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 5 },
                shadowOpacity: 0.08,
                shadowRadius: 16,
                elevation: 6,
                borderWidth: 0.5,
                borderColor: '#EFEFF1',
            }}>
                {/* Header — pencil (LEFT) | tax info + restaurant name | logo (RIGHT) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}>
                    <TouchableOpacity
                        onPress={onShowCart}
                        style={{ padding: 5 }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Ionicons name="create-outline" size={17} color="#8E8E93" />
                    </TouchableOpacity>

                    <View style={{ flex: 1, alignItems: 'flex-end', marginHorizontal: 9 }}>
                        <Text
                            style={{ fontSize: 15, fontWeight: '800', color: '#1D1D1F', textAlign: 'right' }}
                            numberOfLines={1}
                        >
                            {restaurantName || 'سلتك'}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#8E8E93', textAlign: 'right', marginTop: 1 }}>
                            شامل ضريبة القيمة المضافة 15%
                        </Text>
                    </View>

                    {logo ? (
                        <Image
                            source={logo}
                            style={{
                                width: 42,
                                height: 42,
                                borderRadius: 11,
                                backgroundColor: '#F5F5F7',
                            }}
                            resizeMode="contain"
                        />
                    ) : (
                        <View style={{
                            width: 42,
                            height: 42,
                            borderRadius: 11,
                            backgroundColor: '#FFE5E5',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <Ionicons name="restaurant" size={20} color="#FF3B30" />
                        </View>
                    )}
                </View>

                <View style={{ height: 0.5, backgroundColor: '#F0F0F0', marginTop: 9, marginBottom: 2 }} />

                {/* Items */}
                {visibleItems.map((item, idx) => (
                    <CartRow
                        key={`${item.name_en}-${item.notes || ''}-${idx}`}
                        item={item}
                        isLast={idx === visibleItems.length - 1 && hiddenItems.length === 0}
                        onIncrement={() => handleIncrement(idx)}
                        onDecrement={() => handleDecrement(idx)}
                    />
                ))}

                {/* +N more items row */}
                {hiddenItems.length > 0 && (
                    <TouchableOpacity
                        onPress={onShowCart}
                        activeOpacity={0.7}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 8,
                        }}
                    >
                        <View style={{ flex: 1, alignItems: 'flex-end', marginHorizontal: 9 }}>
                            <Text style={{
                                fontSize: 12,
                                fontWeight: '700',
                                color: '#1D1D1F',
                                textAlign: 'right',
                                textDecorationLine: 'underline',
                            }}>
                                +{hiddenItems.length} {hiddenItems.length === 1 ? 'منتج آخر' : 'منتجات أخرى'}
                            </Text>
                        </View>
                        <StackedThumbs items={hiddenItems} />
                    </TouchableOpacity>
                )}

                <View style={{ height: 0.5, backgroundColor: '#F0F0F0', marginTop: 5, marginBottom: 10 }} />

                {/* Footer — total (LEFT) | delivery info (RIGHT) */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                    <View style={{ alignItems: 'flex-start' }}>
                        <Text style={{ fontSize: 11, color: '#8E8E93', fontWeight: '600' }}>
                            الإجمالي
                        </Text>
                        <Text style={{ fontSize: 17, fontWeight: '800', color: '#1D1D1F', marginTop: 2 }}>
                            {total.toFixed(2)} ر.س
                        </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 11, color: '#1D1D1F', fontWeight: '700', textAlign: 'right' }}>
                            التوصيل خلال ٣٠ دقيقة
                        </Text>
                        <Text style={{ fontSize: 10, color: '#8E8E93', textAlign: 'right', marginTop: 1 }}>
                            الموقع الحالي
                        </Text>
                    </View>
                </View>

                {/* Big primary button — same red as تأكيد الطلب */}
                <TouchableOpacity
                    onPress={onShowCart}
                    activeOpacity={0.88}
                    style={{
                        backgroundColor: '#FF3B30',
                        paddingVertical: 13,
                        borderRadius: 999,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#FF3B30',
                        shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.27,
                        shadowRadius: 7,
                        elevation: 5,
                    }}
                >
                    <Text style={{ color: 'white', fontSize: 14, fontWeight: '800' }}>
                        إتمام الطلب
                    </Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

export default InlineCartWidget;
