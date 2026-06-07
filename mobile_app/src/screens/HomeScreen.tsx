
import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Image, TouchableOpacity, SafeAreaView, Platform, Alert } from 'react-native';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import VoiceOverlay from '../components/VoiceOverlay';
import CartSummary from '../components/CartSummary';
import ActiveOrderBanner from '../components/ActiveOrderBanner';
import ComboCard from '../components/ComboCard';
import { BIG_MAC_MEAL } from '../data/mcdonaldsCombo';
import { comboStore } from '../state/comboStore';

const HomeScreen = ({ userId }: { userId?: string }) => {
    const [isVoiceOpen, setIsVoiceOpen] = useState(false);

    return (
        <View className="flex-1 bg-gray-50">
            <SafeAreaView className="bg-white pt-2">
                {/* Header Section */}
                <View className="px-4 pb-2 bg-white">
                    {/* Top Bar: Location & User */}
                    <View className="flex-row justify-between items-center mb-4">
                        <TouchableOpacity className="flex-row items-center">
                            <Text className="text-xl font-bold mr-1 text-gray-800">الرئيسية</Text>
                            <Ionicons name="chevron-down" size={20} color="black" />
                        </TouchableOpacity>

                        <View className="flex-row items-center space-x-4">
                            <TouchableOpacity className="relative mr-4 bg-gray-50 p-2 rounded-full border border-gray-100">
                                <Ionicons name="notifications-outline" size={24} color="black" />
                                <View className="absolute top-0 left-0 w-2.5 h-2.5 bg-[#DC2626] rounded-full border border-white" />
                            </TouchableOpacity>
                            <TouchableOpacity className="bg-gray-50 p-2 rounded-full border border-gray-100">
                                <Ionicons name="person-outline" size={24} color="black" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Search Bar */}
                    <View className="flex-row items-center bg-gray-100 rounded-xl px-4 py-3 border border-gray-200">
                        <Ionicons name="search" size={20} color="gray" />
                        <TextInput
                            placeholder="ابحث عن مطعم أو وجبة..."
                            className="flex-1 ml-3 text-base text-right font-medium"
                            placeholderTextColor="gray"
                            style={{ textAlign: 'right' }} // Force right alignment for Arabic placeholder
                        />
                        <TouchableOpacity>
                            <Ionicons name="filter" size={20} color="gray" />
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>

            <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Active Order Banner */}
                <ActiveOrderBanner userId={userId} />

                {/* Promotional Banner */}
                <View className="px-4 mt-4">
                    <View className="bg-[#DC2626] rounded-2xl p-5 relative overflow-hidden h-40 flex-row items-center shadow-sm">
                        <View className="flex-1 z-10 items-end">
                            <Text className="text-white font-bold text-2xl mb-1 text-right">جرب الطلب الصوتي</Text>
                            <Text className="text-white/90 text-sm mb-3 text-right">اطلب أكلك المفضل بصوتك وبسرعة!</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    console.log('Mic button pressed in Banner');
                                    setIsVoiceOpen(true);
                                }}
                                className="bg-white/20 w-32 py-2 rounded-lg items-center flex-row justify-center"
                            >
                                <Text className="text-white font-bold mr-2">جرب الآن</Text>
                                <Ionicons name="mic" size={16} color="white" />
                            </TouchableOpacity>
                        </View>
                        {/* Decorative Circles */}
                        <View className="absolute -left-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full" />
                        <View className="absolute left-10 -top-10 w-20 h-20 bg-white/10 rounded-full" />
                    </View>
                </View>

                {/* FEATURED COMBO — Big Mac Meal (inline card) */}
                <View className="px-4 mt-5">
                    <View className="flex-row justify-between items-center mb-3">
                        <Text className="font-bold text-xl text-gray-800">وجبة اليوم</Text>
                        <View className="bg-yellow-100 px-2 py-1 rounded-full">
                            <Text className="text-yellow-800 text-[10px] font-bold">مخصص بالصوت</Text>
                        </View>
                    </View>
                    <ComboCard
                        combo={BIG_MAC_MEAL}
                        onVoiceTap={(combo) => {
                            comboStore.setActive(combo);
                            setIsVoiceOpen(true);
                        }}
                        onAddToCart={(payload) => {
                            console.log('[COMBO] added:', payload);
                            Alert.alert(
                                'تمت الإضافة للسلة ✓',
                                `${payload.summary_ar}\n\nالمجموع: ${payload.line_total.toFixed(2)} ر.س`
                            );
                        }}
                    />
                </View>

                {/* Categories */}
                <View className="mt-6">
                    <View className="flex-row justify-between items-center px-4 mb-4" style={{ flexDirection: 'row-reverse' }}>
                        {/* Reverse row to handle 'See all' on left correctly in RTL context if needed, or just let standard RTL handle it. 
                             React Native RTL usually flips start/end. 
                             Let's assume standard layout: Text (Right), See All (Left) in Arabic.
                             In code: View (flex-row) -> Children: [Label, SeeAll]
                             RTL: Label is on Right, SeeAll is on Left. Matches standard code.
                          */}
                        <Text className="font-bold text-xl text-gray-800 text-right">التصنيفات</Text>
                        <Text className="text-[#DC2626] font-medium">عرض الكل</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pl-4">
                        {/* In RTL, horizontal scroll might start from right. If not, user scrolls. */}
                        {[
                            { name: 'برجر', icon: 'hamburger', color: '#FFF5E6', iconColor: '#FFA500' },
                            { name: 'بيتزا', icon: 'pizza-slice', color: '#FFEBEE', iconColor: '#FF5252' },
                            { name: 'قهوة', icon: 'coffee', color: '#EFEBE9', iconColor: '#795548' },
                            { name: 'آسيوي', icon: 'fish', color: '#E3F2FD', iconColor: '#2196F3' },
                            { name: 'حلا', icon: 'ice-cream', color: '#F3E5F5', iconColor: '#9C27B0' },
                        ].map((cat, index) => (
                            <TouchableOpacity key={index} className="mr-4 items-center">
                                <View style={{ backgroundColor: cat.color }} className="w-16 h-16 rounded-2xl items-center justify-center mb-2 shadow-sm">
                                    <FontAwesome5 name={cat.icon} size={24} color={cat.iconColor} />
                                </View>
                                <Text className="text-gray-700 font-medium text-xs font-bold">{cat.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Popular Restaurants */}
                <View className="mt-6 px-4">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="font-bold text-xl text-gray-800">الأكثر طلباً بالقرب منك</Text>
                        <Text className="text-[#DC2626] font-medium">عرض الكل</Text>
                    </View>

                    {[
                        { name: 'برجر كينج', rating: '4.5', image: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=500', time: '20-30 دقيقة', delivery: 'مجاني', tags: 'وجبات سريعة • أمريكي' },
                        { name: 'بيتزا هت', rating: '4.2', image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500', time: '30-45 دقيقة', delivery: '15 ريال', tags: 'بيتزا • إيطالي' },
                        { name: 'كنتاكي', rating: '4.0', image: 'https://images.unsplash.com/photo-1513639776629-7b611594e29b?w=500', time: '25-40 دقيقة', delivery: '10 ريال', tags: 'دجاج مقلي • أمريكي' },
                    ].map((item, index) => (
                        <TouchableOpacity key={index} className="bg-white rounded-2xl shadow-sm mb-5 overflow-hidden border border-gray-100">
                            <View style={{ height: 160 }} className="bg-gray-200 relative items-center justify-center">
                                {/* Fallback icon sits behind the photo; visible only if the image fails to load */}
                                <Ionicons name="restaurant" size={44} color="#cbd5e1" style={{ position: 'absolute' }} />
                                <Image source={{ uri: item.image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                <View className="absolute top-3 right-3 bg-white px-2 py-1 rounded-lg flex-row items-center shadow-sm">
                                    <Text className="text-xs font-bold mr-1">{item.time}</Text>
                                    <Ionicons name="time-outline" size={12} color="black" />
                                </View>
                                <View className="absolute top-3 left-3 bg-white/90 p-1.5 rounded-full shadow-sm">
                                    <Ionicons name="heart-outline" size={18} color="black" />
                                </View>
                            </View>
                            <View className="p-4">
                                <View className="flex-row justify-between items-start mb-1">
                                    <Text className="font-bold text-lg text-gray-900 text-right">{item.name}</Text>
                                    <View className="flex-row items-center bg-green-50 px-2 py-1 rounded-md">
                                        <Text className="text-green-700 font-bold text-xs mr-1">{item.rating}</Text>
                                        <Ionicons name="star" size={10} color="#15803d" />
                                    </View>
                                </View>
                                <Text className="text-gray-500 text-xs mb-3 text-right">{item.tags}</Text>
                                <View className="flex-row items-center border-t border-gray-100 pt-3">
                                    <Ionicons name="bicycle-outline" size={16} color="#DC2626" />
                                    <Text className="text-[#DC2626] text-xs font-medium ml-1 mr-4">{item.delivery}</Text>
                                    <Ionicons name="ticket-outline" size={16} color="gray" />
                                    <Text className="text-gray-500 text-xs ml-1">عروض متاحة</Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Bottom Spacer */}
                <View className="h-24" />
            </ScrollView>

            {/* Floating Elements */}
            <CartSummary userId={userId} />

            {console.log('Rendering HomeScreen, isVoiceOpen:', isVoiceOpen)}
            <VoiceOverlay
                userId={userId}
                visible={isVoiceOpen}
                onClose={() => {
                    console.log('VoiceOverlay onClose called');
                    setIsVoiceOpen(false);
                    comboStore.clearActive();
                }}
            />

            {/* Bottom Nav Bar (Visual) */}
            <View className="absolute bottom-0 w-full bg-white border-t border-gray-200 flex-row justify-around py-4 pb-6 shadow-lg">
                <TouchableOpacity className="items-center">
                    <Ionicons name="home" size={24} color="#DC2626" />
                    <Text className="text-[#DC2626] text-[10px] mt-1 font-bold">الرئيسية</Text>
                </TouchableOpacity>
                <TouchableOpacity className="items-center">
                    <Ionicons name="list" size={24} color="#BDC3C7" />
                    <Text className="text-gray-400 text-[10px] mt-1">طلباتي</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => {
                        console.log('Mic button pressed in Bottom Nav');
                        setIsVoiceOpen(true);
                    }}
                    className="items-center"
                >
                    <View className="w-14 h-14 bg-[#DC2626] rounded-full items-center justify-center -mt-10 border-4 border-gray-50 shadow-md">
                        <Ionicons name="mic" size={28} color="white" />
                    </View>
                </TouchableOpacity>
                <TouchableOpacity className="items-center">
                    <Ionicons name="wallet-outline" size={24} color="#BDC3C7" />
                    <Text className="text-gray-400 text-[10px] mt-1">المحفظة</Text>
                </TouchableOpacity>
                <TouchableOpacity className="items-center">
                    <Ionicons name="person-outline" size={24} color="#BDC3C7" />
                    <Text className="text-gray-400 text-[10px] mt-1">حسابي</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default HomeScreen;
