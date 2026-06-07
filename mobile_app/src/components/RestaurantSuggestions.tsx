import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getRestaurantLogo } from '../lib/restaurantLogos';

export interface RestaurantSuggestion {
    name_ar: string;
    name_en: string;
    id: string;
}

interface RestaurantSuggestionsProps {
    restaurants: RestaurantSuggestion[];
    cuisineType?: string;
    onSelect: (restaurantNameAr: string) => void;
}

export const RESTAURANT_META: Record<string, { cuisine_ar: string; rating: string; deliveryTime: string; heroImage: string }> = {
    'ماكدونالدز': { cuisine_ar: 'وجبات سريعة • برجر', rating: '4.5', deliveryTime: '20-30 دقيقة', heroImage: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=250&fit=crop' },
    'هرفي': { cuisine_ar: 'وجبات سريعة • برجر', rating: '4.2', deliveryTime: '25-35 دقيقة', heroImage: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=400&h=250&fit=crop' },
    'بيتزا هت': { cuisine_ar: 'بيتزا • إيطالي', rating: '4.3', deliveryTime: '30-40 دقيقة', heroImage: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=250&fit=crop' },
    'البيك': { cuisine_ar: 'بروست • دجاج مقلي', rating: '4.8', deliveryTime: '15-25 دقيقة', heroImage: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400&h=250&fit=crop' },
    'كنتاكي': { cuisine_ar: 'دجاج مقلي • وجبات', rating: '4.1', deliveryTime: '25-35 دقيقة', heroImage: 'https://images.unsplash.com/photo-1513639776629-7b611594e29b?w=400&h=250&fit=crop' },
    'الطازج': { cuisine_ar: 'دجاج مشوي • صحي', rating: '4.4', deliveryTime: '20-30 دقيقة', heroImage: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=400&h=250&fit=crop' },
    'شاورمر': { cuisine_ar: 'شاورما • عربي', rating: '4.6', deliveryTime: '15-25 دقيقة', heroImage: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&h=250&fit=crop' },
    'ماما نورة': { cuisine_ar: 'شاورما • فلافل • عربي', rating: '4.3', deliveryTime: '20-30 دقيقة', heroImage: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400&h=250&fit=crop' },
    'كودو': { cuisine_ar: 'ساندوتشات • وجبات', rating: '4.0', deliveryTime: '20-30 دقيقة', heroImage: 'https://images.unsplash.com/photo-1553909489-cd47e0907980?w=400&h=250&fit=crop' },
    'صب واي': { cuisine_ar: 'ساندوتشات • صحي', rating: '4.1', deliveryTime: '15-20 دقيقة', heroImage: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=400&h=250&fit=crop' },
    'ستاربكس': { cuisine_ar: 'قهوة • مشروبات', rating: '4.5', deliveryTime: '15-20 دقيقة', heroImage: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=250&fit=crop' },
    'باسكن روبنز': { cuisine_ar: 'آيس كريم • حلويات', rating: '4.4', deliveryTime: '20-30 دقيقة', heroImage: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&h=250&fit=crop' },
    'الرومانسية': { cuisine_ar: 'أكل سعودي • كبسة • مندي', rating: '4.6', deliveryTime: '30-45 دقيقة', heroImage: 'https://images.unsplash.com/photo-1642821373181-12ea0e0d3d14?w=400&h=250&fit=crop' },
};

// Delivery fee per restaurant. McDonald's is always free; the rest are split
// ~half free / half 9 SAR via a stable hash of the name so the value doesn't
// flicker between re-renders.
export const getDeliveryFee = (nameAr: string): { label: string; free: boolean } => {
    if (nameAr.includes('ماكدونالد')) return { label: 'مجاني', free: true };
    let h = 0;
    for (let i = 0; i < nameAr.length; i++) h = (h * 31 + nameAr.charCodeAt(i)) >>> 0;
    return h % 2 === 0 ? { label: 'مجاني', free: true } : { label: '9 ريال', free: false };
};

export const CUISINE_MAP: Record<string, string[]> = {
    'برجر': ['ماكدونالدز', 'هرفي'],
    'بيتزا': ['بيتزا هت'],
    'دجاج': ['البيك', 'كنتاكي', 'الطازج'],
    'شاورما': ['شاورمر', 'ماما نورة'],
    'قهوة': ['ستاربكس'],
    'حلا': ['باسكن روبنز'],
    'آيس كريم': ['باسكن روبنز'],
    'ساندوتش': ['كودو', 'صب واي'],
    'أكل سعودي': ['الرومانسية'],
    'كبسة': ['الرومانسية'],
    'مندي': ['الرومانسية'],
};

// ─── Individual Card ────────────────────────────────────────────
const AnimatedCard: React.FC<{
    restaurant: RestaurantSuggestion;
    index: number;
    selectedName: string | null;
    onSelect: (name: string) => void;
}> = ({ restaurant, index, selectedName, onSelect }) => {
    const meta = RESTAURANT_META[restaurant.name_ar];
    const logo = getRestaurantLogo(restaurant.name_ar);
    const fee = getDeliveryFee(restaurant.name_ar);

    const isSelected = selectedName === restaurant.name_ar;
    const isOther = selectedName !== null && !isSelected;

    // Entrance animations
    const cardFade = useRef(new Animated.Value(0)).current;
    const cardSlide = useRef(new Animated.Value(60)).current;
    const cardScale = useRef(new Animated.Value(0.85)).current;
    const pressScale = useRef(new Animated.Value(1)).current;
    const logoScale = useRef(new Animated.Value(0)).current;

    // Selection animations
    const selectGlow = useRef(new Animated.Value(0)).current;
    const selectScale = useRef(new Animated.Value(1)).current;
    const checkOpacity = useRef(new Animated.Value(0)).current;
    const checkScale = useRef(new Animated.Value(0)).current;
    const ringScale = useRef(new Animated.Value(0.5)).current;
    const ringOpacity = useRef(new Animated.Value(0)).current;

    // Dismiss animations (for non-selected cards)
    const dismissFade = useRef(new Animated.Value(1)).current;
    const dismissScale = useRef(new Animated.Value(1)).current;
    const dismissSlide = useRef(new Animated.Value(0)).current;

    // Entrance
    useEffect(() => {
        const delay = index * 120;
        setTimeout(() => {
            Animated.parallel([
                Animated.timing(cardFade, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.spring(cardSlide, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
                Animated.spring(cardScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
            ]).start(() => {
                Animated.sequence([
                    Animated.delay(80),
                    Animated.spring(logoScale, { toValue: 1, tension: 120, friction: 6, useNativeDriver: true }),
                ]).start();
            });
        }, delay);
    }, []);

    // Selection effect
    useEffect(() => {
        if (isSelected) {
            // Selected card: glow + scale up + checkmark
            Animated.parallel([
                Animated.spring(selectScale, { toValue: 1.05, tension: 100, friction: 8, useNativeDriver: true }),
                Animated.timing(selectGlow, { toValue: 1, duration: 300, useNativeDriver: false }),
                // Checkmark pop
                Animated.sequence([
                    Animated.delay(150),
                    Animated.parallel([
                        Animated.spring(checkScale, { toValue: 1, tension: 150, friction: 6, useNativeDriver: true }),
                        Animated.timing(checkOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
                    ]),
                ]),
                // Ring pulse
                Animated.sequence([
                    Animated.delay(100),
                    Animated.parallel([
                        Animated.timing(ringScale, { toValue: 1.8, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                        Animated.sequence([
                            Animated.timing(ringOpacity, { toValue: 0.5, duration: 150, useNativeDriver: true }),
                            Animated.timing(ringOpacity, { toValue: 0, duration: 450, useNativeDriver: true }),
                        ]),
                    ]),
                ]),
            ]).start();
        } else if (isOther) {
            // Non-selected cards: fade out + shrink + slide away
            Animated.parallel([
                Animated.timing(dismissFade, { toValue: 0, duration: 400, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
                Animated.timing(dismissScale, { toValue: 0.8, duration: 400, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
                Animated.timing(dismissSlide, { toValue: 30, duration: 400, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
            ]).start();
        }
    }, [selectedName]);

    const handlePressIn = () => {
        if (selectedName) return;
        Animated.spring(pressScale, { toValue: 0.93, tension: 200, friction: 10, useNativeDriver: true }).start();
    };

    const handlePressOut = () => {
        if (selectedName) return;
        Animated.spring(pressScale, { toValue: 1, tension: 200, friction: 10, useNativeDriver: true }).start();
    };

    // Border color interpolation for glow
    const borderColor = selectGlow.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(0,0,0,0.04)', '#16A34A'],
    });

    const shadowColor = selectGlow.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(0,0,0,0.1)', 'rgba(22,163,74,0.4)'],
    });

    return (
        <Animated.View
            style={{
                opacity: Animated.multiply(cardFade, dismissFade),
                transform: [
                    { translateX: Animated.add(cardSlide, dismissSlide) },
                    { translateY: isOther ? dismissSlide : new Animated.Value(0) },
                    { scale: Animated.multiply(Animated.multiply(cardScale, pressScale), Animated.multiply(selectScale, dismissScale)) },
                ],
            }}
        >
            <TouchableOpacity
                activeOpacity={1}
                onPress={() => { if (!selectedName) onSelect(restaurant.name_ar); }}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={!!selectedName}
                style={{ width: 172 }}
            >
                <Animated.View style={{
                    backgroundColor: '#fff',
                    borderRadius: 20,
                    overflow: 'hidden',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.1,
                    shadowRadius: 16,
                    elevation: 6,
                    borderWidth: 2.5,
                    borderColor: borderColor,
                }}>
                    {/* Hero Image */}
                    <View style={{ height: 108, backgroundColor: '#F3F4F6', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                        {/* Restaurant logo is the hero (replaces the generic food photo) */}
                        {logo ? (
                            <Animated.Image
                                source={logo}
                                style={{ width: '100%', height: '100%', transform: [{ scale: logoScale }] }}
                                resizeMode="cover"
                            />
                        ) : (
                            <Ionicons name="restaurant" size={40} color="rgba(220,38,38,0.25)" />
                        )}

                        {/* Promoted badge */}
                        {meta && parseFloat(meta.rating) >= 4.5 && (
                            <View style={{
                                position: 'absolute', top: 8, left: 8,
                                backgroundColor: 'rgba(255,255,255,0.92)',
                                paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
                            }}>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: '#DC2626' }}>مميّز</Text>
                            </View>
                        )}

                        {/* ✓ Checkmark overlay */}
                        {isSelected && (
                            <View style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: 'rgba(22,163,74,0.55)',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                {/* Pulse ring */}
                                <Animated.View style={{
                                    position: 'absolute', width: 60, height: 60, borderRadius: 30,
                                    borderWidth: 3, borderColor: '#fff',
                                    opacity: ringOpacity, transform: [{ scale: ringScale }],
                                }} />
                                {/* Check circle */}
                                <Animated.View style={{
                                    width: 48, height: 48, borderRadius: 24,
                                    backgroundColor: '#fff',
                                    alignItems: 'center', justifyContent: 'center',
                                    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.2, shadowRadius: 10, elevation: 8,
                                    opacity: checkOpacity, transform: [{ scale: checkScale }],
                                }}>
                                    <Ionicons name="checkmark" size={30} color="#16A34A" />
                                </Animated.View>
                            </View>
                        )}
                    </View>

                    {/* Details */}
                    <View style={{ padding: 12, paddingTop: 10 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: '#1D1D1F', textAlign: 'right', letterSpacing: -0.2 }} numberOfLines={1}>
                            {restaurant.name_ar}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#86868B', marginTop: 2, textAlign: 'right', fontWeight: '500' }} numberOfLines={1}>
                            {meta?.cuisine_ar || 'مطعم'}
                        </Text>
                        {/* Delivery fee pill */}
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', gap: 4,
                                backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                            }}>
                                <Ionicons name="bicycle" size={13} color="#15803d" />
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803d' }}>{fee.label}</Text>
                            </View>
                        </View>
                        <View style={{
                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                            marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.05)',
                        }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Ionicons name="time-outline" size={12} color="#86868B" />
                                <Text style={{ fontSize: 10, fontWeight: '600', color: '#86868B' }}>
                                    {meta?.deliveryTime || '20-30 دقيقة'}
                                </Text>
                            </View>
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', gap: 3,
                                backgroundColor: '#FFF7ED', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
                            }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1D1D1F' }}>{meta?.rating || '4.0'}</Text>
                                <Ionicons name="star" size={11} color="#F59E0B" />
                            </View>
                        </View>
                    </View>
                </Animated.View>
            </TouchableOpacity>
        </Animated.View>
    );
};

// ─── Parent Container ───────────────────────────────────────────
const RestaurantSuggestions: React.FC<RestaurantSuggestionsProps> = ({ restaurants, cuisineType, onSelect }) => {
    const [selectedName, setSelectedName] = useState<string | null>(null);

    const headerFade = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(-15)).current;
    const lineFade = useRef(new Animated.Value(0)).current;
    const lineWidth = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.parallel([
                Animated.timing(headerFade, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.spring(headerSlide, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
            ]),
            Animated.parallel([
                Animated.timing(lineFade, { toValue: 1, duration: 300, useNativeDriver: false }),
                Animated.timing(lineWidth, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
            ]),
        ]).start();
    }, []);

    const handleCardSelect = (name: string) => {
        setSelectedName(name);
        // Wait for the selection animation to play, then call parent onSelect
        setTimeout(() => {
            onSelect(name);
        }, 900);
    };

    if (restaurants.length === 0) return null;

    return (
        <View style={{ alignSelf: 'flex-start', width: '100%', marginBottom: 14, marginTop: 4 }}>
            <Animated.View style={{
                opacity: headerFade, transform: [{ translateY: headerSlide }],
                flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
                marginBottom: 4, marginRight: 4, gap: 6,
            }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#991B1B', textAlign: 'right', letterSpacing: -0.2 }}>
                    {cuisineType ? `مطاعم ${cuisineType}` : 'المطاعم المقترحة'}
                </Text>
                <Text style={{ fontSize: 16 }}>🍽️</Text>
            </Animated.View>

            <Animated.View style={{
                height: 2.5, backgroundColor: '#DC2626', borderRadius: 2,
                marginBottom: 12, marginRight: 4, alignSelf: 'flex-end',
                opacity: lineFade,
                width: lineWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '30%'] }),
            }} />

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 14, paddingHorizontal: 4, paddingBottom: 6, paddingTop: 2 }}
                decelerationRate="fast"
                snapToInterval={186}
            >
                {restaurants.map((restaurant, idx) => (
                    <AnimatedCard
                        key={`${restaurant.name_en}-${idx}`}
                        restaurant={restaurant}
                        index={idx}
                        selectedName={selectedName}
                        onSelect={handleCardSelect}
                    />
                ))}
            </ScrollView>
        </View>
    );
};

export default RestaurantSuggestions;
