import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    Image,
    TouchableOpacity,
    SafeAreaView,
    Animated,
    Easing,
    Pressable,
    StyleProp,
    ViewStyle,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import VoiceOverlay from '../components/VoiceOverlay';
import CartSummary from '../components/CartSummary';
import ActiveOrderBanner from '../components/ActiveOrderBanner';

// Warm palette — deliberately not "AI/tech":
//   cream background, Jahez red, warm browns. Big readable type, big tap targets,
//   gentle organic motion. Designed so kids and grandparents can use it without
//   thinking about it.
const COLORS = {
    bg: '#FFF8F0',
    card: '#FFFFFF',
    border: '#F3EDE5',
    text: '#1F1A14',
    muted: '#9A8B7A',
    primary: '#DC2626',
    primarySoft: '#FFE9E5',
    yellow: '#F59E0B',
    yellowSoft: '#FFFBEB',
    yellowText: '#92400E',
};

// Spring-press wrapper. Scales to 0.96 on touch, springs back. Big visible
// feedback so older users *feel* every tap.
const PressableCard = ({
    children,
    onPress,
    style,
}: {
    children: React.ReactNode;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
}) => {
    const scale = useRef(new Animated.Value(1)).current;
    return (
        <Pressable
            onPressIn={() =>
                Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, tension: 200, friction: 8 }).start()
            }
            onPressOut={() =>
                Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 6 }).start()
            }
            onPress={onPress}
        >
            <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
        </Pressable>
    );
};

// Stagger entrance: every section fades up on mount with a small delay.
// Combined across the screen this creates a calm cascade — not a frantic one.
const FadeInUp = ({
    children,
    delay = 0,
    style,
}: {
    children: React.ReactNode;
    delay?: number;
    style?: StyleProp<ViewStyle>;
}) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const ty = useRef(new Animated.Value(24)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 1,
                duration: 520,
                delay,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.spring(ty, {
                toValue: 0,
                delay,
                tension: 50,
                friction: 9,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);
    return <Animated.View style={[{ opacity, transform: [{ translateY: ty }] }, style]}>{children}</Animated.View>;
};

// Heart-pop favorite. Scale spike + color flip — small but satisfying.
const FavoriteButton = ({ onChange }: { onChange?: (v: boolean) => void }) => {
    const [active, setActive] = useState(false);
    const scale = useRef(new Animated.Value(1)).current;
    const handle = () => {
        const next = !active;
        setActive(next);
        onChange?.(next);
        Animated.sequence([
            Animated.spring(scale, { toValue: 1.45, useNativeDriver: true, tension: 240, friction: 4 }),
            Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 160, friction: 5 }),
        ]).start();
    };
    return (
        <Pressable
            onPress={handle}
            hitSlop={12}
            style={{
                position: 'absolute',
                top: 12,
                left: 12,
                backgroundColor: 'rgba(255,255,255,0.95)',
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3,
            }}
        >
            <Animated.View style={{ transform: [{ scale }] }}>
                <Ionicons name={active ? 'heart' : 'heart-outline'} size={20} color={active ? COLORS.primary : COLORS.text} />
            </Animated.View>
        </Pressable>
    );
};

// The hero: a big warm voice CTA with a continuously *breathing* mic and a
// gentle ripple ring that pulses outward. The breath rate (~1.4s in/out) is
// tuned to resting human breathing — feels alive without feeling busy.
const VoiceHero = ({ onPress }: { onPress: () => void }) => {
    const breathe = useRef(new Animated.Value(1)).current;
    const ringScale = useRef(new Animated.Value(0)).current;
    const ringOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(breathe, {
                    toValue: 1.07,
                    duration: 1400,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(breathe, {
                    toValue: 1,
                    duration: 1400,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        ).start();

        const ripple = () => {
            ringScale.setValue(0);
            ringOpacity.setValue(0.55);
            Animated.parallel([
                Animated.timing(ringScale, {
                    toValue: 1.7,
                    duration: 2200,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(ringOpacity, {
                    toValue: 0,
                    duration: 2200,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
            ]).start(() => ripple());
        };
        ripple();
    }, []);

    return (
        <View className="px-5 mt-3">
            <Pressable onPress={onPress}>
                <View
                    style={{
                        backgroundColor: COLORS.primary,
                        borderRadius: 28,
                        paddingHorizontal: 22,
                        paddingVertical: 26,
                        flexDirection: 'row',
                        alignItems: 'center',
                        shadowColor: COLORS.primary,
                        shadowOffset: { width: 0, height: 14 },
                        shadowOpacity: 0.28,
                        shadowRadius: 22,
                        elevation: 12,
                        overflow: 'hidden',
                    }}
                >
                    {/* Soft decorative blob */}
                    <View
                        style={{
                            position: 'absolute',
                            right: -40,
                            top: -40,
                            width: 160,
                            height: 160,
                            borderRadius: 80,
                            backgroundColor: 'rgba(255,255,255,0.08)',
                        }}
                    />
                    <View
                        style={{
                            position: 'absolute',
                            left: 100,
                            bottom: -30,
                            width: 90,
                            height: 90,
                            borderRadius: 45,
                            backgroundColor: 'rgba(255,255,255,0.06)',
                        }}
                    />

                    {/* Mic with ripple */}
                    <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
                        <Animated.View
                            style={{
                                position: 'absolute',
                                width: 96,
                                height: 96,
                                borderRadius: 48,
                                backgroundColor: 'white',
                                opacity: ringOpacity,
                                transform: [{ scale: ringScale }],
                            }}
                        />
                        <Animated.View
                            style={{
                                width: 84,
                                height: 84,
                                borderRadius: 42,
                                backgroundColor: 'white',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transform: [{ scale: breathe }],
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 6 },
                                shadowOpacity: 0.18,
                                shadowRadius: 10,
                                elevation: 8,
                            }}
                        >
                            <Ionicons name="mic" size={42} color={COLORS.primary} />
                        </Animated.View>
                    </View>

                    {/* Copy: warm, plain Saudi Arabic — no "AI assistant" framing */}
                    <View style={{ flex: 1, marginLeft: 14, alignItems: 'flex-end' }}>
                        <Text
                            style={{ color: 'white', fontSize: 22, fontWeight: '800', lineHeight: 28 }}
                            className="text-right"
                        >
                            كلّمني وأنا أساعدك
                        </Text>
                        <Text
                            style={{ color: 'rgba(255,255,255,0.92)', fontSize: 14, marginTop: 6, lineHeight: 20 }}
                            className="text-right"
                        >
                            قول لي وش تشتهي اليوم وأجيب لك أحلى المطاعم
                        </Text>
                    </View>
                </View>
            </Pressable>
        </View>
    );
};

const CATEGORIES: { name: string; icon: string; bg: string; iconColor: string }[] = [
    { name: 'برجر', icon: 'hamburger', bg: '#FFF1E0', iconColor: '#F59E0B' },
    { name: 'بيتزا', icon: 'pizza-slice', bg: '#FFE4E0', iconColor: '#EF4444' },
    { name: 'دجاج', icon: 'drumstick-bite', bg: '#FFF6E0', iconColor: '#D97706' },
    { name: 'شاورما', icon: 'utensils', bg: '#FFEBE0', iconColor: '#EA580C' },
    { name: 'قهوة', icon: 'coffee', bg: '#F0E4DA', iconColor: '#92400E' },
    { name: 'حلا', icon: 'ice-cream', bg: '#FFE0EC', iconColor: '#E11D48' },
];

const RESTAURANTS = [
    {
        name: 'برجر كينج',
        rating: '4.5',
        image: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800',
        time: '20-30 د',
        delivery: 'توصيل مجاني',
        tags: 'وجبات سريعة • أمريكي',
    },
    {
        name: 'بيتزا هت',
        rating: '4.2',
        image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800',
        time: '30-45 د',
        delivery: '15 ر.س توصيل',
        tags: 'بيتزا • إيطالي',
    },
    {
        name: 'كنتاكي',
        rating: '4.0',
        image: 'https://images.unsplash.com/photo-1513639776629-7b611594e29b?w=800',
        time: '25-40 د',
        delivery: '10 ر.س توصيل',
        tags: 'دجاج مقلي • أمريكي',
    },
];

const HomeScreen = ({ userId }: { userId?: string }) => {
    const [isVoiceOpen, setIsVoiceOpen] = useState(false);
    const navMicScale = useRef(new Animated.Value(1)).current;

    // Subtle attention pulse on the bottom-nav mic — slower than the hero so
    // they don't compete.
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(navMicScale, {
                    toValue: 1.06,
                    duration: 1800,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(navMicScale, {
                    toValue: 1,
                    duration: 1800,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    return (
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
            <SafeAreaView style={{ backgroundColor: COLORS.bg }}>
                {/* Greeting + profile row. Friendly & legible. */}
                <View
                    style={{
                        paddingHorizontal: 20,
                        paddingTop: 4,
                        paddingBottom: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <View style={{ flexDirection: 'row' }}>
                        <TouchableOpacity
                            style={{
                                backgroundColor: 'white',
                                width: 44,
                                height: 44,
                                borderRadius: 14,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginRight: 8,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.05,
                                shadowRadius: 6,
                                elevation: 2,
                            }}
                        >
                            <Ionicons name="notifications-outline" size={22} color={COLORS.text} />
                            <View
                                style={{
                                    position: 'absolute',
                                    top: 10,
                                    right: 10,
                                    width: 8,
                                    height: 8,
                                    borderRadius: 4,
                                    backgroundColor: COLORS.primary,
                                    borderWidth: 1.5,
                                    borderColor: 'white',
                                }}
                            />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{
                                backgroundColor: 'white',
                                width: 44,
                                height: 44,
                                borderRadius: 14,
                                alignItems: 'center',
                                justifyContent: 'center',
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.05,
                                shadowRadius: 6,
                                elevation: 2,
                            }}
                        >
                            <Ionicons name="person-outline" size={22} color={COLORS.text} />
                        </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1, marginLeft: 14, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 13, color: COLORS.muted }} className="text-right">
                            السلام عليكم 👋
                        </Text>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 2 }} className="text-right">
                            وش نطلب اليوم؟
                        </Text>
                    </View>
                </View>
            </SafeAreaView>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 130 }}
                showsVerticalScrollIndicator={false}
            >
                <ActiveOrderBanner userId={userId} />

                <FadeInUp delay={0}>
                    <VoiceHero onPress={() => setIsVoiceOpen(true)} />
                </FadeInUp>

                <FadeInUp delay={120}>
                    <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: 'white',
                                borderRadius: 18,
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.05,
                                shadowRadius: 8,
                                elevation: 2,
                            }}
                        >
                            <Ionicons name="search" size={22} color={COLORS.muted} />
                            <TextInput
                                placeholder="ابحث عن مطعم أو وجبة..."
                                placeholderTextColor={COLORS.muted}
                                style={{ flex: 1, marginLeft: 10, textAlign: 'right', fontSize: 15, color: COLORS.text }}
                            />
                        </View>
                    </View>
                </FadeInUp>

                {/* Categories */}
                <View style={{ marginTop: 26 }}>
                    <FadeInUp delay={180}>
                        <View
                            style={{
                                paddingHorizontal: 20,
                                marginBottom: 14,
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <TouchableOpacity>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>عرض الكل</Text>
                            </TouchableOpacity>
                            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }} className="text-right">
                                وش تحب تأكل؟
                            </Text>
                        </View>
                    </FadeInUp>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
                    >
                        {CATEGORIES.map((cat, index) => (
                            <FadeInUp key={cat.name} delay={220 + index * 70} style={{ marginRight: 14 }}>
                                <PressableCard onPress={() => {}}>
                                    <View style={{ alignItems: 'center' }}>
                                        <View
                                            style={{
                                                backgroundColor: cat.bg,
                                                width: 80,
                                                height: 80,
                                                borderRadius: 24,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                shadowColor: '#000',
                                                shadowOffset: { width: 0, height: 4 },
                                                shadowOpacity: 0.06,
                                                shadowRadius: 8,
                                                elevation: 2,
                                            }}
                                        >
                                            <FontAwesome5 name={cat.icon} size={32} color={cat.iconColor} />
                                        </View>
                                        <Text
                                            style={{
                                                fontSize: 14,
                                                fontWeight: '700',
                                                color: COLORS.text,
                                                marginTop: 10,
                                            }}
                                        >
                                            {cat.name}
                                        </Text>
                                    </View>
                                </PressableCard>
                            </FadeInUp>
                        ))}
                    </ScrollView>
                </View>

                {/* Restaurants */}
                <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
                    <FadeInUp delay={350}>
                        <View
                            style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 16,
                            }}
                        >
                            <TouchableOpacity>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>عرض الكل</Text>
                            </TouchableOpacity>
                            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }} className="text-right">
                                الأكثر طلباً قريب منك
                            </Text>
                        </View>
                    </FadeInUp>

                    {RESTAURANTS.map((item, index) => (
                        <FadeInUp key={item.name} delay={420 + index * 110}>
                            <PressableCard style={{ marginBottom: 18 }} onPress={() => {}}>
                                <View
                                    style={{
                                        backgroundColor: COLORS.card,
                                        borderRadius: 24,
                                        overflow: 'hidden',
                                        shadowColor: '#000',
                                        shadowOffset: { width: 0, height: 6 },
                                        shadowOpacity: 0.08,
                                        shadowRadius: 14,
                                        elevation: 5,
                                    }}
                                >
                                    <View style={{ height: 180, backgroundColor: '#EEE' }}>
                                        <Image source={{ uri: item.image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                        <View
                                            style={{
                                                position: 'absolute',
                                                top: 12,
                                                right: 12,
                                                backgroundColor: 'white',
                                                paddingHorizontal: 12,
                                                paddingVertical: 6,
                                                borderRadius: 14,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                shadowColor: '#000',
                                                shadowOffset: { width: 0, height: 2 },
                                                shadowOpacity: 0.1,
                                                shadowRadius: 4,
                                                elevation: 3,
                                            }}
                                        >
                                            <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text, marginRight: 4 }}>
                                                {item.time}
                                            </Text>
                                            <Ionicons name="time-outline" size={14} color={COLORS.text} />
                                        </View>
                                        <FavoriteButton />
                                    </View>
                                    <View style={{ padding: 16 }}>
                                        <View
                                            style={{
                                                flexDirection: 'row',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginBottom: 6,
                                            }}
                                        >
                                            <View
                                                style={{
                                                    backgroundColor: COLORS.yellowSoft,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 5,
                                                    borderRadius: 10,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                }}
                                            >
                                                <Text style={{ color: COLORS.yellowText, fontWeight: '800', fontSize: 13, marginRight: 4 }}>
                                                    {item.rating}
                                                </Text>
                                                <Ionicons name="star" size={12} color={COLORS.yellow} />
                                            </View>
                                            <Text style={{ fontSize: 19, fontWeight: '800', color: COLORS.text }} className="text-right">
                                                {item.name}
                                            </Text>
                                        </View>
                                        <Text style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12 }} className="text-right">
                                            {item.tags}
                                        </Text>
                                        <View
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                paddingTop: 12,
                                                borderTopWidth: 1,
                                                borderTopColor: COLORS.border,
                                            }}
                                        >
                                            <Ionicons name="bicycle" size={18} color={COLORS.primary} />
                                            <Text
                                                style={{
                                                    color: COLORS.primary,
                                                    fontSize: 13,
                                                    fontWeight: '700',
                                                    marginLeft: 6,
                                                }}
                                            >
                                                {item.delivery}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </PressableCard>
                        </FadeInUp>
                    ))}
                </View>

                <View style={{ height: 24 }} />
            </ScrollView>

            <CartSummary userId={userId} />

            <VoiceOverlay
                userId={userId}
                visible={isVoiceOpen}
                onClose={() => setIsVoiceOpen(false)}
            />

            {/* Bottom nav — bigger labels & taps for accessibility */}
            <View
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    flexDirection: 'row',
                    justifyContent: 'space-around',
                    paddingTop: 14,
                    paddingBottom: 26,
                    borderTopWidth: 1,
                    borderTopColor: COLORS.border,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: -4 },
                    shadowOpacity: 0.06,
                    shadowRadius: 12,
                    elevation: 12,
                }}
            >
                <TouchableOpacity style={{ alignItems: 'center', minWidth: 56 }}>
                    <Ionicons name="home" size={26} color={COLORS.primary} />
                    <Text style={{ color: COLORS.primary, fontSize: 11, marginTop: 3, fontWeight: '800' }}>الرئيسية</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ alignItems: 'center', minWidth: 56 }}>
                    <Ionicons name="receipt-outline" size={26} color="#BDB6AE" />
                    <Text style={{ color: '#9A8B7A', fontSize: 11, marginTop: 3, fontWeight: '600' }}>طلباتي</Text>
                </TouchableOpacity>
                <Pressable
                    onPress={() => setIsVoiceOpen(true)}
                    style={{ alignItems: 'center', minWidth: 64 }}
                    hitSlop={8}
                >
                    <Animated.View
                        style={{
                            transform: [{ scale: navMicScale }],
                            width: 60,
                            height: 60,
                            backgroundColor: COLORS.primary,
                            borderRadius: 30,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: -32,
                            borderWidth: 4,
                            borderColor: COLORS.bg,
                            shadowColor: COLORS.primary,
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.32,
                            shadowRadius: 12,
                            elevation: 8,
                        }}
                    >
                        <Ionicons name="mic" size={30} color="white" />
                    </Animated.View>
                </Pressable>
                <TouchableOpacity style={{ alignItems: 'center', minWidth: 56 }}>
                    <Ionicons name="wallet-outline" size={26} color="#BDB6AE" />
                    <Text style={{ color: '#9A8B7A', fontSize: 11, marginTop: 3, fontWeight: '600' }}>المحفظة</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ alignItems: 'center', minWidth: 56 }}>
                    <Ionicons name="person-outline" size={26} color="#BDB6AE" />
                    <Text style={{ color: '#9A8B7A', fontSize: 11, marginTop: 3, fontWeight: '600' }}>حسابي</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default HomeScreen;
