import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Modal,
    Animated,
    Easing,
    Dimensions,
    StyleSheet,
    TextInput,
    Image,
    Pressable,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CartItem } from './OrderCartWidget';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ---------- Theme ----------
const JAHEZ_RED = '#EE1C34';
const JAHEZ_RED_SOFT = '#F43F5E';
const AMBER = '#F59E0B';
const PRIME_GOLD = '#F59E0B';
const TEXT_PRIMARY = '#0F0F0F';
const TEXT_SECONDARY = '#6B7280';
const TEXT_MUTED = '#9CA3AF';
const NEUTRAL_BG = '#F7F7F8';
const NEUTRAL_BG_SOFT = '#FAFAFA';
const NEUTRAL_BORDER = '#ECECEE';
const NEUTRAL_BORDER_STRONG = '#D1D5DB';

// ---------- Config ----------
const VAT_RATE = 0.15;
const DELIVERY_FEE_ORIGINAL = 18;
const DELIVERY_FEE_DISCOUNT = 5;
const PRIME_SAVINGS = 5;

// ---------- Saved addresses (UI-only for now) ----------
type AddressId = 'home' | 'work' | 'other';
type AddressDef = {
    id: AddressId;
    label: string;
    phone: string;
    address: string;
    icon: keyof typeof Ionicons.glyphMap;
};
const ADDRESSES: Record<AddressId, AddressDef> = {
    home: {
        id: 'home',
        label: 'المنزل',
        phone: '966555446622',
        address: '7709 ملك النسور، الروابي، الرياض 14216، السعودية',
        icon: 'home',
    },
    work: {
        id: 'work',
        label: 'العمل',
        phone: '966555446622',
        address: '3456 شارع الملك فهد، العليا، الرياض 12211، السعودية',
        icon: 'briefcase',
    },
    other: {
        id: 'other',
        label: 'عنوان آخر',
        phone: '966555446622',
        address: '1234 حي الياسمين، الرياض 13325، السعودية',
        icon: 'location',
    },
};

// ---------- Food image mapping (copied from OrderCartWidget) ----------
const getFoodImage = (nameEn: string = ''): string => {
    const lower = nameEn.toLowerCase();
    if (lower.includes('burger') || lower.includes('crispy') || lower.includes('deluxe') || lower.includes('mac') || lower.includes('big'))
        return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=200&h=200&q=80';
    if (lower.includes('tasty') || lower.includes('tasti'))
        return 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=200&h=200&q=80';
    if (lower.includes('chicken') || lower.includes('nugget') || lower.includes('broast') || lower.includes('spicy') || lower.includes('grand'))
        return 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=200&h=200&q=80';
    if (lower.includes('fries') || lower.includes('potato'))
        return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=200&h=200&q=80';
    if (lower.includes('pizza'))
        return 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=200&h=200&q=80';
    if (lower.includes('drink') || lower.includes('cola') || lower.includes('pepsi') || lower.includes('juice'))
        return 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?auto=format&fit=crop&w=200&h=200&q=80';
    if (lower.includes('sundae') || lower.includes('mcflurry') || lower.includes('ice'))
        return 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=200&h=200&q=80';
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&h=200&q=80';
};

// ---------- Parse "<name> - <modifiers>" into two parts for display ----------
const splitNameAndMods = (nameAr: string) => {
    const dash = nameAr.indexOf(' - ');
    if (dash < 0) return { name: nameAr, mods: '' };
    return { name: nameAr.slice(0, dash), mods: nameAr.slice(dash + 3) };
};

interface CheckoutScreenProps {
    visible: boolean;
    items: CartItem[];
    onClose: () => void;
    onPay: () => void;
}

const CheckoutScreen: React.FC<CheckoutScreenProps> = ({ visible, items, onClose, onPay }) => {
    // ---------- State ----------
    const [expanded, setExpanded] = useState(false);
    const [deliveryTime, setDeliveryTime] = useState<'now' | 'later'>('now');
    const [selectedAddressId, setSelectedAddressId] = useState<AddressId>('home');
    const [selectedPayment, setSelectedPayment] = useState<'mada' | 'other'>('mada');
    const [discountCode, setDiscountCode] = useState('');
    const [addressSheet, setAddressSheet] = useState(false);
    const [paymentSheet, setPaymentSheet] = useState(false);

    // ---------- Animations ----------
    const slideY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const bgOpacity = useRef(new Animated.Value(0)).current;
    const expandAnim = useRef(new Animated.Value(0)).current;
    const payScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(slideY, {
                    toValue: 0,
                    duration: 380,
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                    useNativeDriver: true,
                }),
                Animated.timing(bgOpacity, {
                    toValue: 1,
                    duration: 280,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            slideY.setValue(SCREEN_HEIGHT);
            bgOpacity.setValue(0);
            setExpanded(false);
            expandAnim.setValue(0);
        }
    }, [visible]);

    const close = () => {
        Animated.parallel([
            Animated.timing(slideY, {
                toValue: SCREEN_HEIGHT,
                duration: 300,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(bgOpacity, { toValue: 0, duration: 240, useNativeDriver: true }),
        ]).start(() => {
            onClose();
        });
    };

    const toggleExpand = () => {
        const next = !expanded;
        setExpanded(next);
        Animated.timing(expandAnim, {
            toValue: next ? 1 : 0,
            duration: 280,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: false,
        }).start();
    };

    // ---------- Totals ----------
    const subtotal = useMemo(
        () => items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0),
        [items]
    );
    const vat = subtotal * VAT_RATE;
    const total = subtotal + DELIVERY_FEE_DISCOUNT + vat;
    const originalTotal = subtotal + DELIVERY_FEE_ORIGINAL + vat;

    const selectedAddress = ADDRESSES[selectedAddressId];

    // ---------- Product row ----------
    const ProductRow: React.FC<{ item: CartItem; last?: boolean }> = ({ item, last }) => {
        const { name, mods } = splitNameAndMods(item.name_ar);
        return (
            <View style={[styles.productRow, last ? null : styles.productRowDivider]}>
                {/* Right: food image */}
                <Image source={{ uri: getFoodImage(item.name_en) }} style={styles.productImage} />

                {/* Center: name + mods + price */}
                <View style={{ flex: 1, marginHorizontal: 12, alignItems: 'flex-end' }}>
                    <Text style={styles.productName} numberOfLines={2}>
                        {name}
                    </Text>
                    {mods ? (
                        <Text style={styles.productMods} numberOfLines={2}>
                            {mods}
                        </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', marginTop: 6 }}>
                        <Text style={styles.productCurrency}>ر.س </Text>
                        <Text style={styles.productPrice}>
                            {(item.unit_price * item.quantity).toFixed(2)}
                        </Text>
                    </View>
                </View>

                {/* Left: quantity pill */}
                <View style={styles.qtyPill}>
                    <Text style={styles.qtyPillText}>{item.quantity}</Text>
                </View>
            </View>
        );
    };

    return (
        <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <Animated.View style={[styles.backdrop, { opacity: bgOpacity }]} />
            <Animated.View style={[styles.container, { transform: [{ translateY: slideY }] }]}>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    {/* HEADER */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={close} hitSlop={12} style={{ width: 32, alignItems: 'flex-start' }}>
                            <Ionicons name="chevron-forward" size={26} color={TEXT_PRIMARY} />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>اتمام الطلب</Text>
                        <View style={{ width: 32 }} />
                    </View>

                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingBottom: 130 }}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* PRODUCTS CARD */}
                        <View style={styles.productsCard}>
                            <TouchableOpacity
                                onPress={toggleExpand}
                                activeOpacity={0.7}
                                style={styles.productsHeader}
                            >
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                                    <Animated.View
                                        style={{
                                            transform: [
                                                {
                                                    rotate: expandAnim.interpolate({
                                                        inputRange: [0, 1],
                                                        outputRange: ['0deg', '180deg'],
                                                    }),
                                                },
                                            ],
                                        }}
                                    >
                                        <Ionicons name="chevron-up" size={16} color={JAHEZ_RED} />
                                    </Animated.View>
                                    <Text style={styles.expandText}>
                                        {expanded ? 'أقل' : 'المزيد'}
                                    </Text>
                                </View>
                                <Text style={styles.productsTitle}>
                                    المنتجات ( {items.length} )
                                </Text>
                            </TouchableOpacity>

                            {/* Always show the first item */}
                            {items.slice(0, 1).map((item, idx) => (
                                <ProductRow key={idx} item={item} last={items.length === 1 && !expanded} />
                            ))}

                            {/* Expandable: remaining items */}
                            {items.length > 1 ? (
                                <Animated.View
                                    style={{
                                        maxHeight: expandAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0, items.length * 150],
                                        }),
                                        opacity: expandAnim,
                                        overflow: 'hidden',
                                    }}
                                >
                                    {items.slice(1).map((item, idx, arr) => (
                                        <ProductRow key={idx + 1} item={item} last={idx === arr.length - 1} />
                                    ))}
                                </Animated.View>
                            ) : null}
                        </View>

                        {/* DELIVERY ADDRESS */}
                        <SectionLabel>التوصيل إلى</SectionLabel>
                        <TouchableOpacity
                            onPress={() => setAddressSheet(true)}
                            activeOpacity={0.85}
                            style={styles.addressCard}
                        >
                            <Ionicons name="car" size={22} color={TEXT_PRIMARY} />
                            <View style={{ flex: 1, marginHorizontal: 12, alignItems: 'flex-end' }}>
                                <Text style={styles.addressPhone}>{selectedAddress.phone}</Text>
                                <Text style={styles.addressLine} numberOfLines={2}>
                                    {selectedAddress.address}
                                </Text>
                            </View>
                        </TouchableOpacity>

                        {/* DELIVERY TIME */}
                        <SectionLabel>وقت التوصيل</SectionLabel>
                        <View style={styles.timeRow}>
                            <TimeOption
                                selected={deliveryTime === 'now'}
                                onPress={() => setDeliveryTime('now')}
                                title="الآن"
                                subtitle="التوصيل بأسرع وقت ممكن"
                                icon="flash"
                            />
                            <TimeOption
                                selected={deliveryTime === 'later'}
                                onPress={() => setDeliveryTime('later')}
                                title="التوصيل لاحقاً"
                                subtitle="اختر وقت التوصيل الناسب"
                                icon="calendar-outline"
                            />
                        </View>

                        {/* PAYMENT METHOD */}
                        <SectionLabel>طريقة الدفع</SectionLabel>
                        <TouchableOpacity
                            onPress={() => setPaymentSheet(true)}
                            activeOpacity={0.85}
                            style={styles.paymentCard}
                        >
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                                <View style={styles.madaLogo}>
                                    <Text style={styles.madaTop}>مدى</Text>
                                    <Text style={styles.madaBottom}>mada</Text>
                                </View>
                                <Text style={[styles.paymentLabel, { marginRight: 10 }]}>بطاقة مدى</Text>
                            </View>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                                <Text style={styles.changeText}>تغيير</Text>
                                <Ionicons name="chevron-back" size={14} color={JAHEZ_RED} style={{ marginRight: 2 }} />
                            </View>
                        </TouchableOpacity>

                        {/* DISCOUNT CODE */}
                        <View style={styles.discountLabelRow}>
                            <Ionicons name="pricetag-outline" size={14} color={TEXT_SECONDARY} style={{ marginLeft: 4 }} />
                            <Text style={styles.sectionLabelText}>رمز التخفيض</Text>
                        </View>
                        <View style={styles.discountInputWrap}>
                            <TextInput
                                value={discountCode}
                                onChangeText={setDiscountCode}
                                placeholder="رمز التخفيض"
                                placeholderTextColor={TEXT_MUTED}
                                style={styles.discountInput}
                                textAlign="right"
                            />
                        </View>

                        {/* CANCEL NOTE */}
                        <Text style={styles.cancelNote}>
                            لا يمكن إلغاء الطلبات باستثناء الطلبات المجدولة
                        </Text>

                        {/* TOTALS */}
                        <View style={styles.totalsWrap}>
                            <TotalRow label="الإجمالي" value={`${subtotal.toFixed(2)} ر.س`} />
                            <TotalRow
                                label="رسوم التوصيل"
                                custom={
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                                        <Text style={styles.totalRed}>{DELIVERY_FEE_DISCOUNT.toFixed(2)} ر.س </Text>
                                        <Text style={styles.totalStrike}>{DELIVERY_FEE_ORIGINAL.toFixed(2)}</Text>
                                    </View>
                                }
                            />
                            <TotalRow label="ضريبة القيمة المضافة (15%)" value={`${vat.toFixed(2)}`} />
                        </View>

                        {/* GRAND TOTAL */}
                        <View style={styles.grandTotalWrap}>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                                <Text style={styles.grandTotalRed}>{total.toFixed(2)} ر.س </Text>
                                <Text style={styles.grandTotalStrike}>{originalTotal.toFixed(2)}</Text>
                            </View>
                            <Text style={styles.grandTotalLabel}>المبلغ الكلي</Text>
                        </View>
                    </ScrollView>

                    {/* PAY BUTTON — anchored to bottom */}
                    <View style={styles.payBarWrap}>
                        <Animated.View style={{ transform: [{ scale: payScale }] }}>
                            <TouchableOpacity
                                activeOpacity={0.92}
                                onPressIn={() =>
                                    Animated.timing(payScale, {
                                        toValue: 0.97,
                                        duration: 90,
                                        useNativeDriver: true,
                                    }).start()
                                }
                                onPressOut={() =>
                                    Animated.spring(payScale, {
                                        toValue: 1,
                                        friction: 5,
                                        tension: 100,
                                        useNativeDriver: true,
                                    }).start()
                                }
                                onPress={() => {
                                    Animated.parallel([
                                        Animated.timing(slideY, {
                                            toValue: SCREEN_HEIGHT,
                                            duration: 300,
                                            easing: Easing.in(Easing.cubic),
                                            useNativeDriver: true,
                                        }),
                                        Animated.timing(bgOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
                                    ]).start(() => {
                                        onPay();
                                    });
                                }}
                                style={styles.payBtn}
                            >
                                <Text style={styles.payBtnText}>ادفع الآن</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </View>
                </KeyboardAvoidingView>

                {/* ADDRESS SHEET */}
                <AddressSheet
                    visible={addressSheet}
                    selectedId={selectedAddressId}
                    onSelect={(id) => {
                        setSelectedAddressId(id);
                        setAddressSheet(false);
                    }}
                    onClose={() => setAddressSheet(false)}
                />

                {/* PAYMENT SHEET */}
                <PaymentSheet
                    visible={paymentSheet}
                    selectedId={selectedPayment}
                    onSelect={(id) => {
                        setSelectedPayment(id);
                        setPaymentSheet(false);
                    }}
                    onClose={() => setPaymentSheet(false)}
                />
            </Animated.View>
        </Modal>
    );
};

// ==============================================================
// SUB-COMPONENTS
// ==============================================================

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Text style={styles.sectionLabelText}>{children}</Text>
);

const TotalRow: React.FC<{ label: string; value?: string; custom?: React.ReactNode }> = ({
    label,
    value,
    custom,
}) => (
    <View style={styles.totalRow}>
        {custom ? custom : <Text style={styles.totalValue}>{value}</Text>}
        <Text style={styles.totalLabel}>{label}</Text>
    </View>
);

const TimeOption: React.FC<{
    selected: boolean;
    onPress: () => void;
    title: string;
    subtitle: string;
    icon: keyof typeof Ionicons.glyphMap;
}> = ({ selected, onPress, title, subtitle, icon }) => {
    const anim = useRef(new Animated.Value(selected ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(anim, {
            toValue: selected ? 1 : 0,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [selected]);

    const borderColor = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [NEUTRAL_BORDER, '#000'],
    });
    const borderWidth = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 2],
    });

    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ flex: 1 }}>
            <Animated.View
                style={[
                    styles.timeCard,
                    {
                        borderColor,
                        borderWidth,
                        backgroundColor: selected ? '#fff' : NEUTRAL_BG_SOFT,
                    },
                ]}
            >
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                    <Ionicons name={icon} size={16} color={TEXT_PRIMARY} style={{ marginLeft: 6 }} />
                    <Text style={styles.timeTitle}>{title}</Text>
                </View>
                <Text style={styles.timeSubtitle} numberOfLines={1}>
                    {subtitle}
                </Text>
                {!selected ? (
                    <Ionicons
                        name="chevron-back"
                        size={12}
                        color={TEXT_MUTED}
                        style={{ position: 'absolute', left: 10, top: '50%', marginTop: -6 }}
                    />
                ) : null}
            </Animated.View>
        </TouchableOpacity>
    );
};

// ==============================================================
// ADDRESS BOTTOM SHEET
// ==============================================================
const AddressSheet: React.FC<{
    visible: boolean;
    selectedId: AddressId;
    onSelect: (id: AddressId) => void;
    onClose: () => void;
}> = ({ visible, selectedId, onSelect, onClose }) => {
    const slideY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const bg = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(slideY, { toValue: 0, duration: 320, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
                Animated.timing(bg, { toValue: 1, duration: 220, useNativeDriver: true }),
            ]).start();
        } else {
            slideY.setValue(SCREEN_HEIGHT);
            bg.setValue(0);
        }
    }, [visible]);

    const close = () => {
        Animated.parallel([
            Animated.timing(slideY, { toValue: SCREEN_HEIGHT, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
            Animated.timing(bg, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(onClose);
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
            <Pressable style={{ flex: 1 }} onPress={close}>
                <Animated.View style={[styles.sheetBackdrop, { opacity: bg }]} />
            </Pressable>
            <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>اختر عنوان التوصيل</Text>
                <View style={styles.sheetList}>
                    {(['home', 'work', 'other'] as AddressId[]).map((id, idx) => {
                        const a = ADDRESSES[id];
                        const isSelected = id === selectedId;
                        const isLast = idx === 2;
                        return (
                            <TouchableOpacity
                                key={id}
                                onPress={() => onSelect(id)}
                                activeOpacity={0.7}
                                style={[styles.sheetRow, !isLast ? styles.sheetRowDivider : null]}
                            >
                                {/* Radio */}
                                <View style={[styles.radioOuter, isSelected ? styles.radioOuterOn : null]}>
                                    {isSelected ? <View style={styles.radioInner} /> : null}
                                </View>

                                {/* Address detail */}
                                <View style={{ flex: 1, marginHorizontal: 12, alignItems: 'flex-end' }}>
                                    <Text style={styles.sheetAddressLabel}>{a.label}</Text>
                                    <Text style={styles.sheetAddressLine} numberOfLines={2}>
                                        {a.address}
                                    </Text>
                                </View>

                                {/* Icon */}
                                <View style={styles.sheetIconWrap}>
                                    <Ionicons name={a.icon} size={18} color={TEXT_PRIMARY} />
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                <TouchableOpacity style={styles.sheetAddRow} activeOpacity={0.7}>
                    <Text style={styles.sheetAddText}>+ أضف عنوان جديد</Text>
                </TouchableOpacity>
            </Animated.View>
        </Modal>
    );
};

// ==============================================================
// PAYMENT BOTTOM SHEET
// ==============================================================
const PaymentSheet: React.FC<{
    visible: boolean;
    selectedId: 'mada' | 'other';
    onSelect: (id: 'mada' | 'other') => void;
    onClose: () => void;
}> = ({ visible, selectedId, onSelect, onClose }) => {
    const slideY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const bg = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(slideY, { toValue: 0, duration: 320, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
                Animated.timing(bg, { toValue: 1, duration: 220, useNativeDriver: true }),
            ]).start();
        } else {
            slideY.setValue(SCREEN_HEIGHT);
            bg.setValue(0);
        }
    }, [visible]);

    const close = () => {
        Animated.parallel([
            Animated.timing(slideY, { toValue: SCREEN_HEIGHT, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
            Animated.timing(bg, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(onClose);
    };

    if (!visible) return null;

    const Row: React.FC<{
        id: 'mada' | 'other';
        label: string;
        icon: React.ReactNode;
        last?: boolean;
    }> = ({ id, label, icon, last }) => {
        const isSelected = id === selectedId;
        return (
            <TouchableOpacity
                onPress={() => onSelect(id)}
                activeOpacity={0.7}
                style={[styles.sheetRow, !last ? styles.sheetRowDivider : null]}
            >
                <View style={[styles.radioOuter, isSelected ? styles.radioOuterOn : null]}>
                    {isSelected ? <View style={styles.radioInner} /> : null}
                </View>
                <View style={{ flex: 1, marginHorizontal: 12, alignItems: 'flex-end' }}>
                    <Text style={styles.sheetAddressLabel}>{label}</Text>
                </View>
                {icon}
            </TouchableOpacity>
        );
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
            <Pressable style={{ flex: 1 }} onPress={close}>
                <Animated.View style={[styles.sheetBackdrop, { opacity: bg }]} />
            </Pressable>
            <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>اختر طريقة السداد</Text>
                <View style={styles.sheetList}>
                    <Row
                        id="other"
                        label="خيارات دفع أخرى"
                        icon={
                            <View style={[styles.sheetIconWrap, { backgroundColor: '#FEE2E2' }]}>
                                <Ionicons name="card-outline" size={18} color={JAHEZ_RED} />
                            </View>
                        }
                    />
                    <Row
                        id="mada"
                        label="بطاقة مدى"
                        last
                        icon={
                            <View style={styles.madaLogo}>
                                <Text style={styles.madaTop}>مدى</Text>
                                <Text style={styles.madaBottom}>mada</Text>
                            </View>
                        }
                    />
                </View>
                <TouchableOpacity style={styles.sheetAddRow} activeOpacity={0.7}>
                    <Text style={styles.sheetAddText}>+ أضف بطاقة</Text>
                </TouchableOpacity>
            </Animated.View>
        </Modal>
    );
};

// ==============================================================
// STYLES
// ==============================================================
const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#fff',
    },
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#fff',
    },
    header: {
        paddingTop: Platform.OS === 'ios' ? 54 : 44,
        paddingHorizontal: 16,
        paddingBottom: 14,
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#fff',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: TEXT_PRIMARY,
    },

    // Products card
    productsCard: {
        marginHorizontal: 14,
        marginTop: 10,
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: NEUTRAL_BORDER,
        overflow: 'hidden',
    },
    productsHeader: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 10,
    },
    productsTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: TEXT_PRIMARY,
    },
    expandText: {
        fontSize: 13,
        fontWeight: '500',
        color: JAHEZ_RED,
        marginLeft: 4,
    },
    productRow: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    productRowDivider: {
        borderBottomWidth: 1,
        borderBottomColor: NEUTRAL_BORDER,
        borderStyle: 'dashed',
    },
    productImage: {
        width: 66,
        height: 66,
        borderRadius: 10,
        backgroundColor: NEUTRAL_BG,
    },
    qtyPill: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: NEUTRAL_BG_SOFT,
        borderWidth: 1,
        borderColor: NEUTRAL_BORDER,
        alignItems: 'center',
        justifyContent: 'center',
    },
    qtyPillText: {
        fontSize: 13,
        fontWeight: '700',
        color: TEXT_PRIMARY,
    },
    productName: {
        fontSize: 14,
        fontWeight: '700',
        color: TEXT_PRIMARY,
        textAlign: 'right',
    },
    productMods: {
        fontSize: 12,
        color: TEXT_MUTED,
        textAlign: 'right',
        marginTop: 3,
        lineHeight: 18,
    },
    productPrice: {
        fontSize: 14,
        fontWeight: '700',
        color: TEXT_PRIMARY,
    },
    productCurrency: {
        fontSize: 11,
        fontWeight: '500',
        color: TEXT_SECONDARY,
    },

    // Section labels
    sectionLabelText: {
        fontSize: 13,
        fontWeight: '500',
        color: TEXT_SECONDARY,
        textAlign: 'right',
        marginTop: 22,
        marginBottom: 10,
        paddingHorizontal: 20,
    },

    // Address card
    addressCard: {
        marginHorizontal: 14,
        paddingHorizontal: 14,
        paddingVertical: 14,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: NEUTRAL_BORDER,
        flexDirection: 'row-reverse',
        alignItems: 'center',
    },
    addressPhone: {
        fontSize: 13,
        fontWeight: '600',
        color: TEXT_PRIMARY,
        marginBottom: 3,
    },
    addressLine: {
        fontSize: 12,
        color: TEXT_SECONDARY,
        textAlign: 'right',
        lineHeight: 18,
    },

    // Delivery time
    timeRow: {
        flexDirection: 'row-reverse',
        paddingHorizontal: 14,
        gap: 10,
    },
    timeCard: {
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 14,
        minHeight: 68,
        justifyContent: 'center',
    },
    timeTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: TEXT_PRIMARY,
    },
    timeSubtitle: {
        fontSize: 11,
        fontWeight: '500',
        color: TEXT_SECONDARY,
        textAlign: 'right',
        marginTop: 4,
    },

    // Payment card
    paymentCard: {
        marginHorizontal: 14,
        paddingHorizontal: 14,
        paddingVertical: 14,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: NEUTRAL_BORDER,
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    paymentLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: TEXT_PRIMARY,
        marginLeft: 10,
    },
    changeText: {
        fontSize: 13,
        fontWeight: '600',
        color: JAHEZ_RED,
        marginRight: 2,
    },
    madaLogo: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: NEUTRAL_BORDER,
        borderRadius: 6,
        paddingHorizontal: 5,
        paddingVertical: 3,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 42,
    },
    madaTop: {
        color: '#008fd5',
        fontSize: 10,
        fontWeight: '800',
        lineHeight: 11,
    },
    madaBottom: {
        color: '#84c440',
        fontSize: 9,
        fontWeight: '800',
        lineHeight: 10,
    },

    // Discount
    discountLabelRow: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginTop: 22,
        marginBottom: 10,
    },
    discountInputWrap: {
        marginHorizontal: 14,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: NEUTRAL_BORDER,
        paddingHorizontal: 14,
        height: 48,
        justifyContent: 'center',
    },
    discountInput: {
        fontSize: 14,
        color: TEXT_PRIMARY,
        padding: 0,
        textAlign: 'right',
    },

    // Cancel note
    cancelNote: {
        fontSize: 12,
        color: TEXT_MUTED,
        textAlign: 'right',
        marginTop: 16,
        paddingHorizontal: 20,
    },

    // Prime row
    primeRow: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 14,
        paddingHorizontal: 20,
    },
    primeBadge: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: PRIME_GOLD,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
    },
    primeTextRegular: {
        fontSize: 13,
        color: TEXT_PRIMARY,
        fontWeight: '500',
    },
    primeSavings: {
        fontSize: 13,
        color: AMBER,
        fontWeight: '700',
    },
    primeBrand: {
        fontSize: 14,
        color: AMBER,
        fontWeight: '800',
    },
    primeSubscribe: {
        fontSize: 13,
        fontWeight: '600',
        color: JAHEZ_RED,
        marginRight: 2,
    },

    // Totals
    totalsWrap: {
        marginTop: 16,
        paddingHorizontal: 20,
    },
    totalRow: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    totalLabel: {
        fontSize: 13,
        color: TEXT_PRIMARY,
        fontWeight: '500',
    },
    totalValue: {
        fontSize: 13,
        color: TEXT_PRIMARY,
        fontWeight: '500',
    },
    totalRed: {
        fontSize: 14,
        color: JAHEZ_RED,
        fontWeight: '700',
    },
    totalStrike: {
        fontSize: 12,
        color: TEXT_MUTED,
        fontWeight: '500',
        textDecorationLine: 'line-through',
    },

    // Grand total
    grandTotalWrap: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        marginTop: 6,
        borderTopWidth: 1,
        borderTopColor: NEUTRAL_BORDER,
    },
    grandTotalLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: TEXT_PRIMARY,
    },
    grandTotalRed: {
        fontSize: 16,
        fontWeight: '800',
        color: JAHEZ_RED,
    },
    grandTotalStrike: {
        fontSize: 12,
        color: TEXT_MUTED,
        textDecorationLine: 'line-through',
        marginRight: 2,
    },

    // Pay button
    payBarWrap: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: Platform.OS === 'ios' ? 34 : 52,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: NEUTRAL_BORDER,
    },
    payBtn: {
        height: 52,
        borderRadius: 14,
        backgroundColor: JAHEZ_RED,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: JAHEZ_RED,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 6,
    },
    payBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
    },

    // Sheets
    sheetBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingTop: 10,
        paddingBottom: Platform.OS === 'ios' ? 34 : 24,
        paddingHorizontal: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 12,
    },
    sheetHandle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: NEUTRAL_BORDER_STRONG,
        marginBottom: 16,
    },
    sheetTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: TEXT_PRIMARY,
        textAlign: 'right',
        marginBottom: 16,
    },
    sheetList: {
        borderWidth: 1,
        borderColor: NEUTRAL_BORDER,
        borderRadius: 14,
        overflow: 'hidden',
    },
    sheetRow: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 14,
        backgroundColor: '#fff',
    },
    sheetRowDivider: {
        borderBottomWidth: 1,
        borderBottomColor: NEUTRAL_BORDER,
    },
    sheetIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: NEUTRAL_BG,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sheetAddressLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: TEXT_PRIMARY,
        textAlign: 'right',
    },
    sheetAddressLine: {
        fontSize: 12,
        color: TEXT_SECONDARY,
        textAlign: 'right',
        marginTop: 3,
        lineHeight: 17,
    },
    radioOuter: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterOn: {
        borderColor: JAHEZ_RED,
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: JAHEZ_RED,
    },
    sheetAddRow: {
        paddingTop: 16,
        alignItems: 'flex-end',
    },
    sheetAddText: {
        fontSize: 14,
        fontWeight: '700',
        color: JAHEZ_RED,
    },
});

export default CheckoutScreen;
