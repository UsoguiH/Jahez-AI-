import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, ScrollView, Image, StyleSheet, Dimensions } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { getRestaurantLogo } from '../lib/restaurantLogos';

export interface CartItem {
    name_ar: string;
    name_en: string;
    quantity: number;
    unit_price: number;
    notes?: string;
}

interface OrderCartWidgetProps {
    items: CartItem[];
    restaurantName?: string;
    onConfirm: () => void;
    onEdit: () => void;
    onItemsChange?: (items: CartItem[]) => void;
    onClose?: () => void;
}

const VAT_RATE = 0.15;

// Food image mapping based on item name
const getFoodImage = (nameEn: string): string => {
    const lower = nameEn.toLowerCase();
    if (lower.includes('burger') || lower.includes('crispy') || lower.includes('deluxe') || lower.includes('mac') || lower.includes('big'))
        return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=140&h=140&q=80';
    if (lower.includes('tasty') || lower.includes('tasti'))
        return 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=140&h=140&q=80';
    if (lower.includes('chicken') || lower.includes('nugget') || lower.includes('broast') || lower.includes('spicy') || lower.includes('grand'))
        return 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=140&h=140&q=80';
    if (lower.includes('fries') || lower.includes('potato'))
        return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=140&h=140&q=80';
    if (lower.includes('pizza'))
        return 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=140&h=140&q=80';
    if (lower.includes('drink') || lower.includes('cola') || lower.includes('pepsi') || lower.includes('juice'))
        return 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?auto=format&fit=crop&w=140&h=140&q=80';
    if (lower.includes('sundae') || lower.includes('mcflurry') || lower.includes('ice'))
        return 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=140&h=140&q=80';
    if (lower.includes('wrap') || lower.includes('tortilla') || lower.includes('shawarma'))
        return 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=140&h=140&q=80';
    if (lower.includes('salad'))
        return 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=140&h=140&q=80';
    if (lower.includes('coffee') || lower.includes('latte'))
        return 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=140&h=140&q=80';
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=140&h=140&q=80';
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const OrderCartWidget: React.FC<OrderCartWidgetProps> = ({ items, restaurantName, onConfirm, onEdit, onItemsChange, onClose }) => {
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (items.length > 0) {
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 65,
                    friction: 11,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [items.length]);

    const handleClose = () => {
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: SCREEN_HEIGHT,
                duration: 350,
                useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => {
            if (onClose) onClose();
        });
    };

    if (items.length === 0) return null;

    const subtotal = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const vat = subtotal * VAT_RATE;
    const total = subtotal + vat;

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
        <View style={{ position: 'absolute', top: -SCREEN_HEIGHT, bottom: 0, left: 0, right: 0, zIndex: 50, justifyContent: 'flex-end' }}>
            {/* Dark Backdrop Overlay */}
            <Animated.View style={[
                StyleSheet.absoluteFillObject,
                {
                    backgroundColor: '#000',
                    opacity: fadeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 0.45]
                    })
                }
            ]}>
                <TouchableOpacity style={{ flex: 1 }} onPress={handleClose} activeOpacity={1} />
            </Animated.View>

            {/* Bottom Sheet */}
            <Animated.View
                style={{
                    transform: [{ translateY: slideAnim }],
                    backgroundColor: '#fff',
                    borderTopLeftRadius: 36,
                    borderTopRightRadius: 36,
                    paddingHorizontal: 22,
                    paddingTop: 14,
                    paddingBottom: 40,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: -4 },
                    shadowOpacity: 0.1,
                    shadowRadius: 16,
                    elevation: 20,
                }}
            >
                {/* Drag Slider Handle */}
                <View style={{
                    width: 44,
                    height: 5,
                    backgroundColor: '#D1D1D6',
                    borderRadius: 3,
                    alignSelf: 'center',
                    marginBottom: 20
                }} />

                {/* Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                    {/* Left: Soft X Close Button */}
                    <TouchableOpacity onPress={handleClose} activeOpacity={0.7} style={{ 
                        width: 32, 
                        height: 32, 
                        borderRadius: 16, 
                        backgroundColor: '#F2F2F7', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                    }}>
                        <Ionicons name="close" size={18} color="#1D1D1F" />
                    </TouchableOpacity>

                    {/* Right: Title */}
                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#1D1D1F' }}>
                        تفاصيل الطلب
                    </Text>
                </View>

                {/* Items */}
                <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                    {items.map((item, idx) => (
                        <View
                            key={`${item.name_en}-${idx}`}
                            style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingVertical: 8,
                                borderBottomWidth: idx < items.length - 1 ? 0.5 : 0,
                                borderBottomColor: 'rgba(0,0,0,0.06)',
                            }}
                        >
                            {/* Left Side (in RTL = appears on left): Stepper Pill */}
                            <View style={{
                                backgroundColor: '#F2F2F7',
                                borderRadius: 20,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: 3,
                                width: 82,
                            }}>
                                {/* Plus Button */}
                                <TouchableOpacity
                                    onPress={() => handleIncrement(idx)}
                                    style={{
                                        width: 24,
                                        height: 24,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Ionicons name="add" size={14} color="#1D1D1F" />
                                </TouchableOpacity>

                                {/* Quantity Badge */}
                                <View style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: 11,
                                    backgroundColor: '#E31837',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    shadowColor: '#E31837',
                                    shadowOffset: { width: 0, height: 3 },
                                    shadowOpacity: 0.35,
                                    shadowRadius: 5,
                                    elevation: 4,
                                }}>
                                    <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>
                                        {item.quantity}
                                    </Text>
                                </View>

                                {/* Trash / Minus Button */}
                                <TouchableOpacity
                                    onPress={() => handleDecrement(idx)}
                                    style={{
                                        width: 24,
                                        height: 24,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    {item.quantity <= 1 ? (
                                        <Ionicons name="trash-outline" size={13} color="#1D1D1F" />
                                    ) : (
                                        <Ionicons name="remove" size={14} color="#1D1D1F" />
                                    )}
                                </TouchableOpacity>
                            </View>

                            {/* Right Side (in RTL = appears on right): Image + Details */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end' }}>
                                {/* Text Details */}
                                <View style={{ alignItems: 'flex-end', flex: 1 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#1D1D1F', textAlign: 'right' }} numberOfLines={1}>
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
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#1D1D1F' }}>ريال</Text>
                                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#1D1D1F' }}>
                                            {(item.unit_price * item.quantity).toFixed(2)}
                                        </Text>
                                    </View>
                                </View>

                                {/* Product Image */}
                                <Image
                                    source={{ uri: getFoodImage(item.name_en) }}
                                    style={{
                                        width: 56,
                                        height: 56,
                                        borderRadius: 14,
                                    }}
                                    resizeMode="cover"
                                />
                            </View>
                        </View>
                    ))}
                </ScrollView>

                {/* Divider */}
                <View style={{ height: 0.5, backgroundColor: '#E5E5EA', marginVertical: 10 }} />

                {/* Summary */}
                <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, fontWeight: '500', color: '#86868B', textAlign: 'right' }}>المجموع الفرعي</Text>
                        <Text style={{ fontSize: 12, fontWeight: '500', color: '#86868B' }}>{subtotal.toFixed(2)} ر.س</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, fontWeight: '500', color: '#86868B', textAlign: 'right' }}>ضريبة القيمة المضافة (15%)</Text>
                        <Text style={{ fontSize: 12, fontWeight: '500', color: '#86868B' }}>{vat.toFixed(2)} ر.س</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#1D1D1F', textAlign: 'right' }}>المجموع الكلي</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#D71920' }}>{total.toFixed(2)} ر.س</Text>
                    </View>
                </View>

                {/* CTA Buttons */}
                <View style={{ marginTop: 12, gap: 6 }}>
                    <TouchableOpacity
                        onPress={onConfirm}
                        activeOpacity={0.85}
                        style={{
                            backgroundColor: '#FF3B30',
                            paddingVertical: 16,
                            borderRadius: 16,
                            alignItems: 'center',
                            shadowColor: '#FF3B30',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.3,
                            shadowRadius: 8,
                            elevation: 8,
                        }}
                    >
                        <Text style={{ color: 'white', fontSize: 17, fontWeight: '800' }}>تأكيد الطلب</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={onEdit}
                        activeOpacity={0.7}
                        style={{
                            flexDirection: 'row',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: 4,
                            paddingVertical: 4,
                        }}
                    >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#86868B' }}>تعديل الطلب</Text>
                        <MaterialIcons name="edit" size={10} color="#86868B" />
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </View>
    );
};

export default OrderCartWidget;
