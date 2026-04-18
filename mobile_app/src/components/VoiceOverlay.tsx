import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, SafeAreaView, ScrollView, Image, Animated, Platform, Alert, Easing, Dimensions, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as atob, encode as btoa } from 'base-64';
import LiveAudioStream from 'react-native-live-audio-stream';
import { Buffer } from 'buffer';

import { supabase } from '../lib/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import OrderCartWidget, { CartItem } from './OrderCartWidget';
import InlineCartWidget from './InlineCartWidget';
import OrderConfirmation from './OrderConfirmation';
import RestaurantSuggestions, { CUISINE_MAP } from './RestaurantSuggestions';
import { getRestaurantLogo } from '../lib/restaurantLogos';

// Polyfill for global
if (!global.btoa) { global.btoa = btoa; }
if (!global.atob) { global.atob = atob; }

interface Restaurant {
    id: string;
    name_ar: string;
    name_en: string;
    ai_voice_context: string;
    menu_json: any[];
}

interface VoiceOverlayProps {
    userId?: string;
    visible: boolean;
    onClose: () => void;
}

const VoiceOverlay = ({ userId, visible, onClose }: VoiceOverlayProps) => {
    const [isListening, setIsListening] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [status, setStatus] = useState('Idle');
    const [transcript, setTranscript] = useState('');
    const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
    const [currentAiText, setCurrentAiText] = useState('');
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [orderConfirmed, setOrderConfirmed] = useState(false);
    const [isAiSpeaking, setIsAiSpeaking] = useState(false);
    const [orderDetails, setOrderDetails] = useState<{ summary: string; total: number } | null>(null);
    const [showFullCart, setShowFullCart] = useState(false);
    const [suggestedRestaurants, setSuggestedRestaurants] = useState<{name_ar: string; name_en: string; id: string}[]>([]);
    const scrollViewRef = useRef<ScrollView>(null);
    const ws = useRef<WebSocket | null>(null);
    const recording = useRef<Audio.Recording | null>(null);
    const audioBuffer = useRef<string>('');
    const currentSound = useRef<Audio.Sound | null>(null);
    const isSpeaking = useRef<boolean>(false);

    // Restaurant menu data — pre-loaded on mic open for zero latency
    const restaurantsRef = useRef<Restaurant[]>([]);
    const selectedRestaurantRef = useRef<Restaurant | null>(null);
    const menusLoadedRef = useRef<boolean>(false);

    // Animation Values
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
    const waveAnims = useRef([
        new Animated.Value(20),
        new Animated.Value(20),
        new Animated.Value(20),
        new Animated.Value(20),
        new Animated.Value(20)
    ]).current;

    // ===== ChatGPT Design: New State =====
    const [appPhase, setAppPhase] = useState<'connecting' | 'menu' | 'chat'>('connecting');
    const [isMuted, setIsMuted] = useState(false);
    const [statusTitle, setStatusTitle] = useState('جاري الاتصال');
    const [statusSubtitle, setStatusSubtitle] = useState('تجهيز الذكاء الاصطناعي...');
    const [chatHeaderTitle, setChatHeaderTitle] = useState('استمع إليك...');
    const [chatHeaderSubtitle, setChatHeaderSubtitle] = useState('تحدث بوضوح لطلب وجبتك');
    const [muteToastText, setMuteToastText] = useState('');
    const isMutedRef = useRef(false);
    const waveIntervalRef = useRef<any>(null);
    const breathTweenRef = useRef<Animated.CompositeAnimation | null>(null);
    const barAnimRefs = useRef<(Animated.CompositeAnimation | null)[]>([]);
    const LIFT = -140;

    // ===== ChatGPT Design: Animation Values =====
    const statusOpacity = useRef(new Animated.Value(1)).current;
    const statusTransY = useRef(new Animated.Value(0)).current;
    const chatHeaderOpacity = useRef(new Animated.Value(0)).current;
    const chatHeaderTransY = useRef(new Animated.Value(0)).current;
    const backBtnOpacity = useRef(new Animated.Value(0)).current;
    const backBtnX = useRef(new Animated.Value(-10)).current;
    const blobScale = useRef(new Animated.Value(0)).current;
    const blobOpacity = useRef(new Animated.Value(0)).current;
    const blobTransY = useRef(new Animated.Value(0)).current;  // blob's own Y for absorb bounce
    const glowOpacity = useRef(new Animated.Value(0)).current;
    const glowScale = useRef(new Animated.Value(0.5)).current;
    const orbTransY = useRef(new Animated.Value(0)).current;
    const dotScales = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
    const dotXs = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
    const dotYs = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
    const dotScaleXs = useRef([new Animated.Value(1), new Animated.Value(1), new Animated.Value(1)]).current;
    const dotScaleYs = useRef([new Animated.Value(1), new Animated.Value(1), new Animated.Value(1)]).current;
    const dropYs = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
    const dropScales = useRef([new Animated.Value(0.5), new Animated.Value(0.5), new Animated.Value(0.5)]).current;
    const dropOpacities = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
    const dropWidths = useRef([new Animated.Value(60), new Animated.Value(60), new Animated.Value(60)]).current;
    const dropHeights = useRef([new Animated.Value(60), new Animated.Value(60), new Animated.Value(60)]).current;
    const labelOpacities = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
    const labelScales = useRef([new Animated.Value(0.8), new Animated.Value(0.8), new Animated.Value(0.8)]).current;
    const bottomBtnOpacities = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
    const bottomBtnScales = useRef([new Animated.Value(0.7), new Animated.Value(0.7), new Animated.Value(0.7)]).current;
    const bottomBtnTransY = useRef(new Animated.Value(30)).current;
    const micBtnWidth = useRef(new Animated.Value(76)).current;
    const micBtnHeight = useRef(new Animated.Value(76)).current;
    const micBtnRadius = useRef(new Animated.Value(38)).current;
    const micNormalOpacity = useRef(new Animated.Value(1)).current;
    const micMutedOpacity = useRef(new Animated.Value(0)).current;
    const micMutedScale = useRef(new Animated.Value(0.6)).current;
    const barsOpacity = useRef(new Animated.Value(0)).current;
    const barHeightVals = useRef([new Animated.Value(10), new Animated.Value(10), new Animated.Value(10), new Animated.Value(10), new Animated.Value(10)]).current;
    const barXVals = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
    const chatCanvasOpacity = useRef(new Animated.Value(0)).current;
    const chatCanvasTransY = useRef(new Animated.Value(20)).current;
    const badgeScale = useRef(new Animated.Value(0)).current;
    const badgeOpacity = useRef(new Animated.Value(0)).current;
    const sheetTransY = useRef(new Animated.Value(600)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const toastOpacity = useRef(new Animated.Value(0)).current;
    const toastTransY = useRef(new Animated.Value(8)).current;

    const SUPABASE_PROJECT_ID = 'vnqtonsbvnaxtoldvycy';

    // Pre-load restaurant menus from Supabase
    const preloadMenus = async () => {
        if (menusLoadedRef.current) return;
        try {
            console.log('[MENUS] Pre-loading restaurant menus...');
            const { data, error } = await supabase.functions.invoke('get-restaurant-menus');
            if (error) {
                console.error('[MENUS] Error loading menus:', error);
                return;
            }
            if (data?.restaurants) {
                restaurantsRef.current = data.restaurants;
                menusLoadedRef.current = true;
                console.log(`[MENUS] Loaded ${data.restaurants.length} restaurants:`, data.restaurants.map((r: Restaurant) => r.name_en));
            }
        } catch (e) {
            console.error('[MENUS] Failed to pre-load menus:', e);
        }
    };

    useEffect(() => {
        console.log('VoiceOverlay mounted/updated, visible:', visible, 'isConnected:', isConnected, 'isListening:', isListening);
        if (visible) {
            setStatus('Idle');
            setTranscript('');
            preloadMenus();
            // Start ChatGPT-style connecting sequence
            runConnectingSequence();
        } else {
            console.log('VoiceOverlay closing resources...');
            setIsListening(false);
            stopRecording();
            stopPulseAnimation();
            if (waveIntervalRef.current) { clearInterval(waveIntervalRef.current); waveIntervalRef.current = null; }
            if (breathTweenRef.current) { breathTweenRef.current.stop(); breathTweenRef.current = null; }
            barAnimRefs.current.forEach(a => a?.stop()); barAnimRefs.current = [];
            if (ws.current) {
                console.log('Closing WebSocket...');
                ws.current.close();
                ws.current = null;
            }
            selectedRestaurantRef.current = null;
            setCartItems([]);
            setOrderConfirmed(false);
            setOrderDetails(null);
            setShowFullCart(false);
            setSuggestedRestaurants([]);
            setMessages([]);
            setCurrentAiText('');
            isMutedRef.current = false;
            setIsMuted(false);
        }
    }, [visible]);

    const handleCloseOverlay = () => {
        console.log('handleCloseOverlay called (User pressed X or System Back)');
        if (onClose) onClose();
    };

    const startPulseAnimation = () => {
        if (pulseLoop.current) return;
        pulseLoop.current = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.2,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        pulseLoop.current.start();
    };

    const stopPulseAnimation = () => {
        if (pulseLoop.current) {
            pulseLoop.current.stop();
            pulseLoop.current = null;
        }
        pulseAnim.setValue(1);
    };

    const startWaveAnimation = () => {
        const animations = waveAnims.map((anim, index) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.timing(anim, {
                        toValue: 50 + (Math.random() * 30),
                        duration: 500 + (index * 100),
                        useNativeDriver: false,
                    }),
                    Animated.timing(anim, {
                        toValue: 20,
                        duration: 500 + (index * 100),
                        useNativeDriver: false,
                    }),
                ])
            );
        });
        Animated.parallel(animations).start();
    };

    useEffect(() => {
        if (isListening) {
            startWaveAnimation();
        }
    }, [isListening]);

    // ===== ChatGPT Design: Animation Sequences =====
    const resetAllAnims = () => {
        statusOpacity.setValue(1); statusTransY.setValue(0);
        chatHeaderOpacity.setValue(0); chatHeaderTransY.setValue(0);
        backBtnOpacity.setValue(0); backBtnX.setValue(-10);
        blobScale.setValue(0); blobOpacity.setValue(0); blobTransY.setValue(0);
        glowOpacity.setValue(0); glowScale.setValue(0.5); orbTransY.setValue(0);
        dotScales.forEach(v => v.setValue(0)); dotXs.forEach(v => v.setValue(0)); dotYs.forEach(v => v.setValue(0));
        dotScaleXs.forEach(v => v.setValue(1)); dotScaleYs.forEach(v => v.setValue(1));
        dropYs.forEach(v => v.setValue(0)); dropScales.forEach(v => v.setValue(0.5));
        dropOpacities.forEach(v => v.setValue(0)); dropWidths.forEach(v => v.setValue(60));
        dropHeights.forEach(v => v.setValue(60)); labelOpacities.forEach(v => v.setValue(0));
        labelScales.forEach(v => v.setValue(0.8));
        chatCanvasOpacity.setValue(0); chatCanvasTransY.setValue(20);
        bottomBtnOpacities.forEach(v => v.setValue(0)); bottomBtnScales.forEach(v => v.setValue(0.7));
        bottomBtnTransY.setValue(30);
        micBtnWidth.setValue(76); micBtnHeight.setValue(76); micBtnRadius.setValue(38);
        barsOpacity.setValue(0); barHeightVals.forEach(v => v.setValue(10)); barXVals.forEach(v => v.setValue(0));
        micNormalOpacity.setValue(1); micMutedOpacity.setValue(0); micMutedScale.setValue(0.6);
        toastOpacity.setValue(0); toastTransY.setValue(8);
        badgeScale.setValue(0); badgeOpacity.setValue(0);
    };

    // =====================================================
    // CONNECTING: 3 dots appear, wave, then resolve
    // Matches GSAP: elastic.out(1, 0.6), wave with squash/stretch
    // =====================================================
    const runConnectingSequence = () => {
        setAppPhase('connecting'); resetAllAnims();
        setStatusTitle('جاري الاتصال'); setStatusSubtitle('تجهيز الذكاء الاصطناعي...');
        setIsMuted(false); isMutedRef.current = false;

        // GSAP: x: -65/0/65, scale: 1, duration: 0.7, ease: elastic.out(1, 0.6)
        const xs = [-65, 0, 65];
        dotScales.forEach((s, i) => {
            setTimeout(() => {
                Animated.spring(s, { toValue: 1, tension: 50, friction: 6, useNativeDriver: true }).start();
                Animated.spring(dotXs[i], { toValue: xs[i], tension: 50, friction: 6, useNativeDriver: true }).start();
            }, i * 80); // stagger: 0, 0.08, 0.16
        });

        // GSAP wave: repeat: -1, delay: 0.5, each dot stagger 0.12s
        // y: -22, scaleY: 1.1, scaleX: 0.95, dur 0.35 → y: 0, scaleY: 0.95, scaleX: 1.05, dur 0.25 → settle dur 0.25
        const runWave = () => {
            dotYs.forEach((y, i) => {
                const d = i * 120; // stagger 0.12s
                setTimeout(() => {
                    // Up phase: y=-22, scaleY=1.1, scaleX=0.95
                    Animated.parallel([
                        Animated.timing(y, { toValue: -22, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                        Animated.timing(dotScaleYs[i], { toValue: 1.1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                        Animated.timing(dotScaleXs[i], { toValue: 0.95, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                    ]).start(() => {
                        // Down phase: y=0, scaleY=0.95, scaleX=1.05
                        Animated.parallel([
                            Animated.timing(y, { toValue: 0, duration: 250, easing: Easing.in(Easing.quad), useNativeDriver: true }),
                            Animated.timing(dotScaleYs[i], { toValue: 0.95, duration: 250, easing: Easing.in(Easing.quad), useNativeDriver: true }),
                            Animated.timing(dotScaleXs[i], { toValue: 1.05, duration: 250, easing: Easing.in(Easing.quad), useNativeDriver: true }),
                        ]).start(() => {
                            // Settle: scaleX=1, scaleY=1
                            Animated.parallel([
                                Animated.spring(dotScaleYs[i], { toValue: 1, tension: 40, friction: 5, useNativeDriver: true }),
                                Animated.spring(dotScaleXs[i], { toValue: 1, tension: 40, friction: 5, useNativeDriver: true }),
                            ]).start();
                        });
                    });
                }, d);
            });
        };
        // Wave starts after 0.5s delay, repeats every ~900ms
        setTimeout(() => { runWave(); waveIntervalRef.current = setInterval(runWave, 900); }, 500);

        // GSAP: gsap.delayedCall(2.2, resolveConnection)
        setTimeout(() => resolveConnection(), 2200);
    };

    // =====================================================
    // RESOLVE: dots merge into blob, text changes
    // Exact GSAP timing: dots shrink @ 0, merge @ 0.2, blob @ 0.5, settle @ 0.9
    // =====================================================
    const resolveConnection = () => {
        if (waveIntervalRef.current) { clearInterval(waveIntervalRef.current); waveIntervalRef.current = null; }

        // t=0: status text fade out + dots flatten
        Animated.parallel([
            Animated.timing(statusOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(statusTransY, { toValue: -8, duration: 200, useNativeDriver: true }),
        ]).start();
        // Dots: y=0, scaleX=1.1, scaleY=1.1
        dotYs.forEach(y => Animated.timing(y, { toValue: 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start());
        dotScaleXs.forEach(v => Animated.timing(v, { toValue: 1.1, duration: 200, useNativeDriver: true }).start());
        dotScaleYs.forEach(v => Animated.timing(v, { toValue: 1.1, duration: 200, useNativeDriver: true }).start());

        // t=0.2: dots merge to center, shrink
        setTimeout(() => {
            dotXs.forEach(x => Animated.timing(x, { toValue: 0, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start());
            dotScales.forEach(s => Animated.timing(s, { toValue: 0.5, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start());
        }, 200);

        // t=0.2: change text
        setTimeout(() => {
            setStatusTitle('مرحباً بك'); setStatusSubtitle('كيف يمكنني مساعدتك اليوم؟');
        }, 200);

        // t=0.3: text fade in
        setTimeout(() => {
            statusTransY.setValue(8);
            Animated.parallel([
                Animated.timing(statusOpacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(statusTransY, { toValue: 0, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            ]).start();
        }, 300);

        // t=0.3: back button
        Animated.parallel([
            Animated.timing(backBtnOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(backBtnX, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start();

        // t=0.5: hide dots, show blob with back.out(1.4) overshoot
        setTimeout(() => {
            dotScales.forEach(s => s.setValue(0));
            blobOpacity.setValue(1);
            // GSAP: scale: 1.3, duration: 0.4, ease: "back.out(1.4)"
            Animated.spring(blobScale, { toValue: 1.3, tension: 120, friction: 7, useNativeDriver: true }).start();
            Animated.timing(glowOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
            Animated.timing(glowScale, { toValue: 1.2, duration: 600, useNativeDriver: true }).start();
        }, 500);

        // t=0.9: blob settles to scale 1
        setTimeout(() => {
            Animated.timing(blobScale, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
                dropCategories();
            });
        }, 900);
    };

    // =====================================================
    // DROP CATEGORIES: blob breathes, 3 pills drop with elastic, expand, labels appear
    // GSAP: elastic.out(1, 0.7), targetYs [100, 195, 290], width 300, height 72
    // =====================================================
    const dropCategories = () => {
        setAppPhase('menu');

        // GSAP: targetYs = [160, 255, 350] — adjusted for new top position
        const targetYs = [160, 255, 350];
        const pillW = Math.min(Dimensions.get('window').width - 80, 300);

        const animations: Animated.CompositeAnimation[] = [];

        dropScales.forEach((s, i) => {
            // GSAP: set opacity 1, scale 0.5, then animate
            dropOpacities[i].setValue(1);
            dropScales[i].setValue(0.5);

            const dropDelay = i * 120;
            const expandDelay = 500 + i * 120;
            const labelDelay = 800 + i * 120;

            animations.push(
                Animated.sequence([
                    Animated.delay(dropDelay),
                    Animated.parallel([
                        Animated.spring(dropYs[i], { toValue: targetYs[i], tension: 50, friction: 7, useNativeDriver: true }),
                        Animated.spring(s, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true })
                    ])
                ]),
                Animated.sequence([
                    Animated.delay(expandDelay),
                    Animated.parallel([
                        Animated.timing(dropWidths[i], { toValue: pillW, duration: 500, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
                        Animated.timing(dropHeights[i], { toValue: 72, duration: 500, easing: Easing.inOut(Easing.cubic), useNativeDriver: false })
                    ])
                ]),
                Animated.sequence([
                    Animated.delay(labelDelay),
                    Animated.parallel([
                        Animated.spring(labelOpacities[i], { toValue: 1, tension: 80, friction: 10, useNativeDriver: true }),
                        Animated.spring(labelScales[i], { toValue: 1, tension: 80, friction: 10, useNativeDriver: true })
                    ])
                ])
            );
        });

        Animated.parallel(animations).start();
    };

    // =====================================================
    // ENTER CHAT MODE: selected pill merges back into blob, blob absorbs & lifts
    // Matches GSAP exactly: fade others, shrink selected, blob bounce, lift, chat buttons
    // =====================================================
    const enterChatMode = (idx: number) => {
        setAppPhase('chat');

        // t=0: fade out non-selected pills (GSAP: opacity:0, scale:0.5, dur:0.25)
        dropOpacities.forEach((op, i) => { if (i !== idx) {
            Animated.timing(op, { toValue: 0, duration: 250, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
            Animated.timing(dropScales[i], { toValue: 0.5, duration: 250, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
        }});

        // t=0.1: hide label of selected (GSAP: opacity:0, scale:0.8, dur:0.2)
        setTimeout(() => {
            Animated.timing(labelOpacities[idx], { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
            Animated.timing(labelScales[idx], { toValue: 0.8, duration: 200, useNativeDriver: true }).start();
        }, 100);

        // t=0.2: shrink selected back to circle (GSAP: width:60, height:60, dur:0.4, power3.inOut)
        setTimeout(() => {
            Animated.timing(dropWidths[idx], { toValue: 60, duration: 400, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
            Animated.timing(dropHeights[idx], { toValue: 60, duration: 400, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
        }, 200);

        // t=0.3: blob squash anticipation (GSAP: y:20, scaleY:1.1, scaleX:0.9, dur:0.3)
        setTimeout(() => {
            Animated.timing(blobTransY, { toValue: 20, duration: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
        }, 300);

        // t=0.3: selected pill flies up to blob (GSAP: y:0, dur:0.5, back.in(1.2))
        setTimeout(() => {
            Animated.timing(dropYs[idx], { toValue: 0, duration: 500, easing: Easing.in(Easing.back(1.2)), useNativeDriver: true }).start();
        }, 300);

        // t=0.6: hide status text
        setTimeout(() => {
            Animated.timing(statusOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        }, 600);

        // t=0.7: selected pill disappears, blob absorbs with scale pop
        setTimeout(() => {
            dropOpacities[idx].setValue(0);
            // GSAP: scaleX:1.3, scaleY:1.3, y:-10, dur:0.3
            Animated.parallel([
                Animated.timing(blobScale, { toValue: 1.3, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(blobTransY, { toValue: -10, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            ]).start();
        }, 700);

        // t=0.8: lift entire organism up (GSAP: y:"-10vh", dur:0.8, power3.inOut)
        setTimeout(() => {
            Animated.timing(orbTransY, { toValue: LIFT, duration: 800, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
        }, 800);

        // t=1.0: blob settles back to normal (GSAP: scaleX:1, scaleY:1, y:0, dur:0.5, power3.out)
        setTimeout(() => {
            Animated.parallel([
                Animated.timing(blobScale, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(blobTransY, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]).start();
        }, 1000);

        // t=1.2: chat header text + chat buttons appear
        setTimeout(() => {
            setChatHeaderTitle('استمع إليك...'); setChatHeaderSubtitle('تحدث بوضوح لطلب وجبتك');
            Animated.parallel([
                Animated.timing(chatHeaderOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.timing(chatHeaderTransY, { toValue: LIFT, duration: 500, useNativeDriver: true }),
            ]).start();
            // GSAP: fromTo chatButtons {y:30, opacity:0, scale:0.7} → {y:0, opacity:1, scale:1, dur:0.6, stagger:0.08, back.out(1.5)}
            bottomBtnOpacities.forEach((op, i) => setTimeout(() => {
                Animated.spring(op, { toValue: 1, tension: 80, friction: 10, useNativeDriver: true }).start();
                Animated.spring(bottomBtnScales[i], { toValue: 1, tension: 80, friction: 10, useNativeDriver: true }).start();
            }, i * 80));
            Animated.spring(bottomBtnTransY, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }).start();
        }, 1200);

        // t=1.3: show chat canvas
        setTimeout(() => Animated.parallel([
            Animated.timing(chatCanvasOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(chatCanvasTransY, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start(), 1300);

        // t=1.6: auto-connect voice
        setTimeout(() => handleMicPress(), 1600);
    };

    const handleEndSession = () => {
        if (breathTweenRef.current) breathTweenRef.current.stop();
        if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
        barAnimRefs.current.forEach(a => a?.stop()); barAnimRefs.current = [];
        isMutedRef.current = false; setIsMuted(false);
        Animated.parallel([
            Animated.timing(chatCanvasOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
            Animated.timing(chatHeaderOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start();
        bottomBtnOpacities.forEach(op => Animated.timing(op, { toValue: 0, duration: 300, useNativeDriver: true }).start());
        bottomBtnScales.forEach(s => Animated.timing(s, { toValue: 0.8, duration: 300, useNativeDriver: true }).start());
        Animated.timing(bottomBtnTransY, { toValue: 30, duration: 300, useNativeDriver: true }).start();
        setTimeout(() => Animated.parallel([
            Animated.timing(orbTransY, { toValue: 0, duration: 500, useNativeDriver: true }),
            Animated.timing(blobScale, { toValue: 0, duration: 300, useNativeDriver: true }),
            Animated.timing(glowOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(), 200);
        setTimeout(() => {
            Animated.timing(blobTransY, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        }, 200);
        setTimeout(() => {
            setIsListening(false); stopRecording();
            if (ws.current) { ws.current.close(); ws.current = null; }
            setIsConnected(false); selectedRestaurantRef.current = null;
            setCartItems([]); setOrderConfirmed(false); setOrderDetails(null);
            setShowFullCart(false); setSuggestedRestaurants([]); setMessages([]); setCurrentAiText('');
            runConnectingSequence();
        }, 700);
    };

    const startVisualizer = () => {
        barsOpacity.setValue(1); micNormalOpacity.setValue(0);
        // GSAP: visTargetXs = [-36, -18, 0, 18, 36], btn morphs to 170x64 pill
        const txs = [-36, -18, 0, 18, 36];
        barXVals.forEach((x, i) => Animated.spring(x, { toValue: txs[i], tension: 50, friction: 7, useNativeDriver: false }).start());
        Animated.parallel([
            Animated.spring(micBtnWidth, { toValue: 170, tension: 50, friction: 7, useNativeDriver: false }),
            Animated.spring(micBtnHeight, { toValue: 64, tension: 50, friction: 7, useNativeDriver: false }),
            Animated.spring(micBtnRadius, { toValue: 32, tension: 50, friction: 7, useNativeDriver: false }),
        ]).start();
        const baseH = [12, 24, 38, 24, 12];
        const animBar = (i: number) => {
            if (isMutedRef.current) return;
            const h = 8 + Math.random() * (baseH[i] - 8);
            Animated.timing(barHeightVals[i], { toValue: h, duration: 200 + Math.random() * 250, easing: Easing.inOut(Easing.sin), useNativeDriver: false })
                .start(() => animBar(i));
        };
        barHeightVals.forEach((_, i) => animBar(i));
    };

    const stopVisualizer = () => {
        barAnimRefs.current.forEach(a => a?.stop()); barAnimRefs.current = [];
        barHeightVals.forEach(h => Animated.timing(h, { toValue: 10, duration: 200, useNativeDriver: false }).start());
        barXVals.forEach(x => Animated.timing(x, { toValue: 0, duration: 300, useNativeDriver: false }).start());
        Animated.parallel([
            Animated.spring(micBtnWidth, { toValue: 76, tension: 50, friction: 7, useNativeDriver: false }),
            Animated.spring(micBtnHeight, { toValue: 76, tension: 50, friction: 7, useNativeDriver: false }),
            Animated.spring(micBtnRadius, { toValue: 38, tension: 50, friction: 7, useNativeDriver: false }),
        ]).start();
        setTimeout(() => { barsOpacity.setValue(0); micNormalOpacity.setValue(1); }, 400);
    };

    const toggleMute = () => {
        if (!isListening) return;
        const m = !isMutedRef.current; isMutedRef.current = m; setIsMuted(m);
        if (m) {
            barHeightVals.forEach(h => Animated.timing(h, { toValue: 10, duration: 280, useNativeDriver: false }).start());
            barXVals.forEach(x => Animated.timing(x, { toValue: 0, duration: 280, useNativeDriver: false }).start());
            Animated.parallel([
                Animated.timing(barsOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
                Animated.spring(micBtnWidth, { toValue: 76, tension: 50, friction: 7, useNativeDriver: false }),
                Animated.spring(micBtnHeight, { toValue: 76, tension: 50, friction: 7, useNativeDriver: false }),
                Animated.spring(micBtnRadius, { toValue: 38, tension: 50, friction: 7, useNativeDriver: false }),
            ]).start();
            micNormalOpacity.setValue(0);
            Animated.timing(micMutedOpacity, { toValue: 1, duration: 240, useNativeDriver: true }).start();
            Animated.timing(micMutedScale, { toValue: 1, duration: 240, useNativeDriver: true }).start();
        } else {
            Animated.timing(micMutedOpacity, { toValue: 0, duration: 160, useNativeDriver: true }).start();
            micMutedScale.setValue(0.6); startVisualizer();
        }
        setMuteToastText(m ? 'تم كتم الصوت' : 'تم تشغيل الصوت');
        Animated.sequence([
            Animated.parallel([
                Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
                Animated.timing(toastTransY, { toValue: 0, duration: 250, useNativeDriver: true }),
            ]),
            Animated.delay(1200),
            Animated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        ]).start(() => toastTransY.setValue(8));
    };

    useEffect(() => {
        if (isListening && appPhase === 'chat') { startVisualizer(); }
    }, [isListening, appPhase]);

    // Build the initial AI instructions (mood-based, no listing all restaurants)
    const getInitialInstructions = () => {
        return `أنت مساعد ذكي ودود اسمك "جاهز AI" تعمل في تطبيق جاهز لتوصيل الطعام في السعودية.
تتحدث بالعربية بلهجة سعودية نجدية ودية وطبيعية.

**شخصيتك:**
- ودود، سريع، وعملي.
- تستخدم تعابير سعودية عامية: "أبشر!"، "تمم"، "حاضر"، "على راسي"، "يابعدي"، "حياك".
- ردودك قصيرة ومباشرة جداً. جملة أو جملتين فقط. لا تطوّل أبداً.
- صوتك حماسي ومرح.

**فهم اللهجة السعودية — مهم جداً:**
المستخدم يتكلم بالعامية السعودية. يجب أن تفهم هذه الكلمات:
- "أبي" أو "أبغى" = أريد
- "وش" = ماذا
- "وش عندكم" = ماذا لديكم
- "خلاص" أو "بس كذا" = انتهيت
- "زيد" أو "ضيف" = أضف المزيد
- "شيل" أو "حذف" = احذف
- "كم السعر" أو "بكم" = ما السعر
- "عطني" أو "حطلي" = أعطني / أضف لي
- "وجبة" = meal
- "مسحب" = pulled chicken (mashab)
- "بروست" = broasted/fried chicken
- "روبيان" = shrimp
- "أكوم" = صوص الثوم من البيك (ACOM garlic sauce)

**أمثلة على طلبات المستخدم:**
- "أبي من البيك" = يريد الطلب من مطعم البيك → استخدم select_restaurant فوراً
- "أبي برقر" = يشتهي برقر → اقترح ماكدونالدز أو هرفي
- "أبي شاورما" = يشتهي شاورما → اقترح شاورمر أو ماما نورة
- "أبي دجاج" = يشتهي دجاج → اقترح البيك أو كنتاكي أو الطازج
- "أبي بيتزا" = يشتهي بيتزا → اقترح بيتزا هت
- "أبي قهوة" = يشتهي قهوة → اقترح ستاربكس
- "أبي حلا" أو "آيس كريم" = يشتهي حلا → اقترح باسكن روبنز
- "أبي ساندوتش" = يشتهي ساندوتش → اقترح كودو أو صب واي
- "أبي كبسة" أو "أكل سعودي" = يشتهي أكل تقليدي → اقترح الرومانسية

**الحالة الحالية:**
- لم يتم اختيار مطعم بعد.
- User ID = '${userId || 'guest-user-123'}'.

**المهام:**
1. عند أول اتصال، رحّب بالمستخدم ترحيب حار وقصير واسأله "وش تشتهي اليوم؟" واذكر الأنواع: برقر، دجاج، شاورما، بيتزا، أو قهوة. لا تذكر أسماء المطاعم كلها.
2. **مهم جداً:** لما المستخدم يقول نوع أكل (مثل "برقر" أو "دجاج" أو "بيتزا")، استخدم أداة suggest_restaurants فوراً مع نوع الأكل. هذا يعرض بطاقات المطاعم على شاشة المستخدم وهو يقدر يختار بالضغط أو بالصوت.
3. لما المستخدم يقول اسم مطعم مباشرة، استخدم أداة select_restaurant فوراً بدون ما تسأل عن النوع.
4. بعد ما يتم تحميل القائمة، ساعد المستخدم في الطلب.
5. لا تحاول تعرض قائمة طعام قبل استخدام select_restaurant.

**تعليمات مهمة:**
- لا تذكر أي IDs أو معلومات تقنية.
- الأسعار بالريال السعودي.
- ردودك قصيرة جداً — جملة أو جملتين فقط.
- لا تسرد جميع المطاعم أبداً. فقط اقترح ٢-٣ مطاعم حسب ما يشتهيه المستخدم.`;
    };

    // Build updated instructions after restaurant selection (with full menu)
    const getMenuInstructions = (restaurant: Restaurant) => {
        // Format menu for AI context
        const menuText = restaurant.menu_json.map((cat: any) => {
            const items = cat.items
                .filter((item: any) => item.available)
                .map((item: any) => `  - ${item.name_ar} (${item.name_en}): ${item.price} ريال — ${item.description_ar}`)
                .join('\n');
            return `📋 ${cat.category_ar}:\n${items}`;
        }).join('\n\n');

        return `أنت مساعد ذكي ودود اسمك "جاهز AI" تعمل في تطبيق جاهز لتوصيل الطعام في السعودية.
تتحدث بالعربية بلهجة سعودية نجدية ودية وطبيعية.

**شخصيتك:**
- ودود، سريع، وعملي.
- تستخدم تعابير سعودية عامية: "أبشر!"، "تمم"، "حاضر"، "على راسي"، "يابعدي"، "حياك".
- ردودك قصيرة جداً ومباشرة. جملة أو جملتين فقط.
- صوتك حماسي ومرح.

**فهم اللهجة السعودية — مهم جداً:**
المستخدم يتكلم بالعامية السعودية:
- "أبي" أو "أبغى" = أريد
- "وش" أو "ايش" = ماذا
- "وش عندكم" = ماذا لديكم / اعرض القائمة
- "خلاص" أو "بس كذا" = انتهيت
- "زيد" أو "ضيف" = أضف المزيد
- "شيل" أو "حذف" أو "لا خلاص بدونه" = احذف
- "بكم" أو "كم سعره" = ما السعر
- "عطني" أو "حطلي" = أعطني / أضف لي
- "أكد" أو "تمم" = أكد الطلب
- "غير المطعم" = يريد تغيير المطعم

**المطعم المختار: ${restaurant.name_ar} (${restaurant.name_en})**
${restaurant.ai_voice_context}

**القائمة الكاملة:**
${menuText}

**User ID:** '${userId || 'guest-user-123'}'

**المهام:**
1. ساعد المستخدم في اختيار أصناف من القائمة.
2. لما يطلب صنف، أكّد الاسم والسعر بجملة وحدة.
3. **مهم جداً:** بعد كل إضافة أو تعديل أو حذف صنف، استخدم أداة update_cart فوراً وأرسل الطلب الكامل الحالي (جميع الأصناف مع الكميات والأسعار).
4. لما يقول "أكد" أو "خلاص" أو "تمم" أو "بس كذا"، استخدم confirm_order واذكر ملخص الطلب والمجموع.
5. لو يبي يغيّر المطعم، استخدم select_restaurant.
6. لو سأل "وش عندكم" أو "قولي الأقسام"، اذكر أسماء الأقسام فقط: ${restaurant.menu_json.map((c: any) => c.category_ar).join('، ')}.
7. لو سأل عن قسم معين، اذكر أصنافه وأسعاره.
8. لو قال "شيل" أو "حذف" صنف، احذفه من الطلب واستخدم update_cart بالقائمة المحدّثة.
9. لو قال "زيد" أو "ضيف واحد"، زيد الكمية واستخدم update_cart.

**تعليمات مهمة:**
- لا تذكر أي IDs.
- ردودك قصيرة جداً — جملة أو جملتين فقط.
- لا تقرأ القائمة كاملة إلا إذا طلب ذلك.
- الأسعار بالريال السعودي.
- **لازم تستخدم update_cart بعد أي تغيير في الطلب — هذا يحدّث شاشة العميل.**`;
    };

    const connectToOpenAIDirectly = async (authToken: string) => {
        if (ws.current) return;

        const tools = [
            {
                type: "function",
                name: "select_restaurant",
                description: "Select a restaurant to order from. Call this when the user says which restaurant they want.",
                parameters: {
                    type: "object",
                    properties: {
                        restaurant_name: {
                            type: "string",
                            description: "The name of the restaurant the user wants (e.g., 'البيك', 'الرومانسية', 'ماكدونالدز', 'شاورمر', 'كودو', 'هرفي', 'بيتزا هت', 'ماما نورة', 'الطازج', 'باسكن روبنز', 'كنتاكي', 'صب واي', 'ستاربكس')"
                        }
                    },
                    required: ["restaurant_name"]
                }
            },
            {
                type: "function",
                name: "update_cart",
                description: "Update the visual cart on the user's screen. Call this EVERY time the user adds, modifies, or removes an item. Send the FULL current cart (all items) each time, not just the change.",
                parameters: {
                    type: "object",
                    properties: {
                        items: {
                            type: "array",
                            description: "The complete list of all items currently in the order",
                            items: {
                                type: "object",
                                properties: {
                                    name_ar: { type: "string", description: "Arabic name of the item" },
                                    name_en: { type: "string", description: "English name of the item" },
                                    quantity: { type: "number", description: "Quantity ordered" },
                                    unit_price: { type: "number", description: "Price per unit in SAR" },
                                    notes: { type: "string", description: "Optional customization notes, e.g. 'بدون مخلل' or 'إضافة جبنة'" }
                                },
                                required: ["name_ar", "name_en", "quantity", "unit_price"]
                            }
                        }
                    },
                    required: ["items"]
                }
            },
            {
                type: "function",
                name: "confirm_order",
                description: "Confirm and place the user's order. Call this when the user says they want to confirm/finalize their order.",
                parameters: {
                    type: "object",
                    properties: {
                        order_summary: {
                            type: "string",
                            description: "A summary of what the user ordered, e.g., 'وجبة قطعتين بروست × 1، روبيان ٦ قطع × 2'"
                        },
                        total_price: {
                            type: "number",
                            description: "The total price in SAR"
                        }
                    },
                    required: ["order_summary", "total_price"]
                }
            },
            {
                type: "function",
                name: "suggest_restaurants",
                description: "Show restaurant card suggestions visually on the user's screen based on cuisine preference. Call this IMMEDIATELY when the user mentions a food type like burger, pizza, chicken, shawarma, coffee, dessert, sandwich, or Saudi food.",
                parameters: {
                    type: "object",
                    properties: {
                        cuisine: {
                            type: "string",
                            description: "The cuisine type in Arabic, e.g., 'برجر', 'بيتزا', 'دجاج', 'شاورما', 'قهوة', 'حلا', 'ساندوتش', 'أكل سعودي'"
                        }
                    },
                    required: ["cuisine"]
                }
            }
        ];

        try {
            console.log('Fetching ephemeral token...');
            setStatus('Connecting...');

            // 1. Get Ephemeral Token
            const { data, error } = await supabase.functions.invoke('openai-realtime-proxy', {
                method: 'POST',
                headers: {
                    ...(authToken && authToken !== 'guest-demo-token' ? { Authorization: `Bearer ${authToken}` } : {})
                },
            });

            if (error) {
                console.error("Token fetch error:", error);
                throw new Error(`Failed to get ephemeral token: ${error.message}`);
            }

            const ephemeralKey = data?.client_secret?.value;

            if (!ephemeralKey) {
                console.error("No key in data:", data);
                throw new Error('No ephemeral key returned');
            }

            console.log('Got ephemeral key, connecting to OpenAI...');

            // 2. Connect to OpenAI Realtime API
            const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";
            const protocols = [
                "realtime",
                `openai-insecure-api-key.${ephemeralKey}`,
            ];

            // @ts-ignore
            const socket = new WebSocket(url, protocols, {
                headers: {
                    "OpenAI-Beta": "realtime=v1"
                }
            });

            socket.onopen = () => {
                console.log('Connected to OpenAI Direct');
                setIsConnected(true);
                setStatus('Ready');

                // Initialize Session with restaurant-selection instructions
                const sessionUpdate = {
                    type: 'session.update',
                    session: {
                        instructions: getInitialInstructions(),
                        voice: 'alloy',
                        turn_detection: { type: 'server_vad', threshold: 0.45, prefix_padding_ms: 500, silence_duration_ms: 750 },
                        modalities: ["text", "audio"],
                        input_audio_format: "pcm16",
                        output_audio_format: "pcm16",
                        input_audio_transcription: { model: 'whisper-1' },
                        tools: tools,
                        tool_choice: 'auto',
                    }
                };
                socket.send(JSON.stringify(sessionUpdate));

                // Trigger initial greeting — mood-based, ask what cuisine they want
                setTimeout(() => {
                    console.log('Requesting AI greeting...');
                    socket.send(JSON.stringify({
                        type: 'response.create',
                        response: {
                            modalities: ['text', 'audio'],
                            instructions: `رحّب بالمستخدم ترحيب حار وقصير وعرّف عن نفسك إنك "جاهز AI" واسأله وش يشتهي اليوم — برقر، دجاج، شاورما، بيتزا، أو قهوة؟ جملتين فقط لا تطوّل. لا تذكر أسماء مطاعم.`
                        }
                    }));
                }, 500);

                // Start Recording
                setTimeout(() => startRecording(), 3000);
            };

            socket.onmessage = async (event) => {
                try {
                    const msg = JSON.parse(event.data as string);

                    if (msg.type === 'error') {
                        console.error("OpenAI Error:", JSON.stringify(msg, null, 2));
                    }

                    if (msg.type === 'response.created') {
                        // AI is generating — mute mic during playback to prevent echo
                        isSpeaking.current = true;
                        setIsAiSpeaking(true);
                        audioBuffer.current = '';
                    }

                    if (msg.type === 'response.audio.delta' && msg.delta) {
                        audioBuffer.current += msg.delta;
                    }

                    if (msg.type === 'response.audio.done') {
                        console.log('Audio complete, playing buffered audio, length:', audioBuffer.current.length);
                        if (audioBuffer.current.length > 0) {
                            await playAudioChunk(audioBuffer.current);
                            audioBuffer.current = '';
                        }
                    }

                    if (msg.type === 'response.done') {
                        // Response fully complete (audio may still be playing locally)
                    }

                    if (msg.type === 'response.audio_transcript.delta' && msg.delta) {
                        setCurrentAiText(prev => prev + msg.delta);
                    }

                    if (msg.type === 'response.audio_transcript.done') {
                        if (msg.transcript) {
                            setMessages(prev => [...prev, { role: 'ai', text: msg.transcript }]);
                        }
                        setCurrentAiText('');
                    }

                    if (msg.type === 'conversation.item.input_audio_transcription.completed') {
                        if (msg.transcript && msg.transcript.trim()) {
                            setMessages(prev => [...prev, { role: 'user', text: msg.transcript.trim() }]);
                        }
                    }

                    // Handle tool calls
                    if (msg.type === 'response.output_item.done' && msg.item.type === 'function_call') {
                        const { name, arguments: argsStr } = msg.item;
                        const callId = msg.item.call_id;
                        const args = JSON.parse(argsStr);

                        console.log(`[TOOL] ${name} called with:`, args);

                        let result: any;

                        if (name === 'select_restaurant') {
                            result = handleSelectRestaurant(args.restaurant_name, socket);
                        } else if (name === 'suggest_restaurants') {
                            result = handleSuggestRestaurants(args.cuisine);
                        } else if (name === 'update_cart') {
                            result = handleUpdateCart(args);
                        } else if (name === 'confirm_order') {
                            result = handleConfirmOrder(args);
                        } else {
                            result = { error: `Unknown tool: ${name}` };
                        }

                        // Send tool result back
                        socket.send(JSON.stringify({
                            type: 'conversation.item.create',
                            item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) }
                        }));
                        socket.send(JSON.stringify({ type: 'response.create' }));
                    }

                } catch (e) {
                    console.error('Error parsing msg', e);
                }
            };

            socket.onerror = (e: any) => {
                console.error('WebSocket Error', JSON.stringify(e));
                setStatus(`WS Error: ${e?.message || 'Unknown'}`);
            };

            socket.onclose = (e) => {
                console.log('WebSocket closed', e.code, e.reason);
                setIsConnected(false);
                setStatus(e.code === 1000 ? 'Disconnected' : `Closed: ${e.code} ${e.reason || ''}`);
            };

            ws.current = socket;

        } catch (e: any) {
            console.error('Connection failed', e);
            setStatus(`Failed: ${e?.message || 'Unknown error'}`);
        }
    };

    // Handle select_restaurant tool call — instant since menus are pre-loaded
    const handleSelectRestaurant = (restaurantName: string, socket: WebSocket) => {
        console.log(`[TOOL] select_restaurant: "${restaurantName}"`);

        // Fuzzy match restaurant name — generic matching for all restaurants
        const normalizedInput = restaurantName.toLowerCase().trim();

        // Common Arabic shorthand → full name mappings
        const shortcuts: Record<string, string> = {
            'ماك': 'ماكدونالدز',
            'بيك': 'البيك',
            'رومانسي': 'الرومانسية',
            'شاورم': 'شاورمر',
            'ماما': 'ماما نورة',
            'طازج': 'الطازج',
            'باسكن': 'باسكن روبنز',
            'صبواي': 'صب واي',
            'صب وي': 'صب واي',
            'ستاربك': 'ستاربكس',
            'كنتاك': 'كنتاكي',
            'بيتزا': 'بيتزا هت',
        };

        // Check if input matches any shortcut first
        let expandedInput = normalizedInput;
        for (const [shortcut, fullName] of Object.entries(shortcuts)) {
            if (normalizedInput.includes(shortcut)) {
                expandedInput = fullName;
                break;
            }
        }

        const restaurant = restaurantsRef.current.find(r => {
            const nameAr = r.name_ar.toLowerCase();
            const nameEn = r.name_en.toLowerCase();
            const id = r.id.toLowerCase();
            return nameAr.includes(expandedInput) ||
                expandedInput.includes(nameAr) ||
                nameEn.includes(expandedInput) ||
                expandedInput.includes(nameEn) ||
                id.includes(normalizedInput) ||
                nameAr.includes(normalizedInput) ||
                normalizedInput.includes(nameAr);
        });

        if (!restaurant) {
            const available = restaurantsRef.current.map(r => r.name_ar).join('، ');
            return {
                success: false,
                error: `لم أجد مطعم بهذا الاسم. المطاعم المتاحة: ${available}`
            };
        }

        selectedRestaurantRef.current = restaurant;
        setSuggestedRestaurants([]);

        // Inject the full menu into the AI's instructions via session.update
        const updatedInstructions = getMenuInstructions(restaurant);
        socket.send(JSON.stringify({
            type: 'session.update',
            session: {
                instructions: updatedInstructions,
            }
        }));

        console.log(`[TOOL] Restaurant selected: ${restaurant.name_en}, menu injected with ${restaurant.menu_json.length} categories`);

        // Return category summary so AI can respond naturally
        const categories = restaurant.menu_json.map((cat: any) => cat.category_ar).join('، ');
        const totalItems = restaurant.menu_json.reduce((sum: number, cat: any) => sum + cat.items.length, 0);

        return {
            success: true,
            restaurant_name_ar: restaurant.name_ar,
            restaurant_name_en: restaurant.name_en,
            categories: categories,
            total_items: totalItems,
            message: `تم اختيار ${restaurant.name_ar}. الأقسام المتاحة: ${categories}`
        };
    };

    // Handle update_cart — updates the visual cart widget
    const handleUpdateCart = (args: { items: CartItem[] }) => {
        console.log(`[TOOL] update_cart: ${args.items.length} items`, args.items);
        setCartItems(args.items || []);
        const subtotal = (args.items || []).reduce((sum: number, item: CartItem) => sum + (item.unit_price * item.quantity), 0);
        return {
            success: true,
            items_count: args.items.length,
            subtotal: subtotal,
            message: `تم تحديث السلة. ${args.items.length} صنف، المجموع الفرعي: ${subtotal} ريال`
        };
    };

    // Handle confirm_order — confirms and shows success
    const handleConfirmOrder = (args: { order_summary: string; total_price: number }) => {
        console.log(`[TOOL] confirm_order:`, args);
        setOrderConfirmed(true);
        setOrderDetails({ summary: args.order_summary, total: args.total_price });
        return {
            success: true,
            order_id: `ORD-${Date.now()}`,
            status: 'confirmed',
            estimated_delivery: '20-30 دقيقة',
            summary: args.order_summary,
            total: args.total_price,
            message: `تم تأكيد طلبك! المجموع: ${args.total_price} ريال. التوصيل المتوقع: 20-30 دقيقة. بالعافية! 🎉`
        };
    };

    // Handle suggest_restaurants — shows restaurant cards in chat
    const handleSuggestRestaurants = (cuisine: string) => {
        console.log(`[TOOL] suggest_restaurants: "${cuisine}"`);
        const matchingNames: string[] = [];
        for (const [key, names] of Object.entries(CUISINE_MAP)) {
            if (cuisine.includes(key) || key.includes(cuisine)) {
                matchingNames.push(...names);
            }
        }
        const uniqueNames = [...new Set(matchingNames)];
        const matched = restaurantsRef.current.filter(r => uniqueNames.includes(r.name_ar));

        if (matched.length === 0) {
            return { success: false, error: `لم أجد مطاعم لـ "${cuisine}". جرب: برجر، بيتزا، دجاج، شاورما، قهوة، حلا` };
        }

        setSuggestedRestaurants(matched.map(r => ({ name_ar: r.name_ar, name_en: r.name_en, id: r.id })));
        return {
            success: true,
            count: matched.length,
            restaurants: matched.map(r => r.name_ar),
            message: `عرضت ${matched.length} مطاعم ${cuisine} على شاشة المستخدم. المستخدم يقدر يختار بالضغط أو بالصوت.`
        };
    };

    // Handle restaurant card tap from suggestions
    const handleRestaurantCardTap = (restaurantNameAr: string) => {
        console.log(`[TAP] Restaurant card tapped: "${restaurantNameAr}"`);
        setSuggestedRestaurants([]);
        setMessages(prev => [...prev, { role: 'user', text: `اخترت ${restaurantNameAr}` }]);
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                type: 'conversation.item.create',
                item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `اخترت ${restaurantNameAr}` }] }
            }));
            ws.current.send(JSON.stringify({ type: 'response.create' }));
        }
    };

    const playAudioChunk = async (pcmBase64: string) => {
        if (!pcmBase64) return;
        try {
            if (currentSound.current) {
                try {
                    await currentSound.current.stopAsync();
                    await currentSound.current.unloadAsync();
                } catch (e) { /* ignore */ }
                currentSound.current = null;
            }

            const { appendWavHeader } = await import('../lib/audioUtils');
            const wavData = appendWavHeader(pcmBase64);
            const uri = (FileSystem.cacheDirectory || FileSystem.documentDirectory || '') + `response_${Date.now()}.wav`;
            await FileSystem.writeAsStringAsync(uri, wavData, { encoding: FileSystem.EncodingType.Base64 });
            const { sound: newSound } = await Audio.Sound.createAsync({ uri });
            currentSound.current = newSound;
            await newSound.playAsync();
            newSound.setOnPlaybackStatusUpdate(status => {
                if (status.isLoaded && status.didJustFinish) {
                    newSound.unloadAsync();
                    if (currentSound.current === newSound) currentSound.current = null;
                    console.log('Playback finished — resuming mic input');
                    isSpeaking.current = false;
                    setIsAiSpeaking(false);
                }
            });
        } catch (error) { console.error('Play error', error); }
    };

    const startRecording = async () => {
        try {
            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false
            });

            const options = {
                sampleRate: 24000,
                channels: 1,
                bitsPerSample: 16,
                audioSource: 6,
                bufferSize: 4096,
                wavFile: 'voice_input.wav'
            };

            LiveAudioStream.init(options);

            LiveAudioStream.on('data', (data) => {
                // Mute mic while AI audio is playing or user muted
                if (isSpeaking.current || isMutedRef.current) return;
                if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                    ws.current.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: data }));
                }
            });

            LiveAudioStream.start();
            setIsListening(true);
            setStatus('Listening...');
            startPulseAnimation();
        } catch (err) {
            console.error('Start Rec Error:', err);
        }
    };

    const stopRecording = async () => {
        try {
            LiveAudioStream.stop();
            setIsListening(false);
            stopPulseAnimation();
            setStatus('Processing...');

            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
                ws.current.send(JSON.stringify({ type: 'response.create', response: { modalities: ["text", "audio"] } }));
            }
        } catch (err) {
            console.error('Stop Rec Error:', err);
        }
    };

    const handleMicPress = async () => {
        // Tap-to-interrupt: if AI is speaking, stop playback and resume listening
        if (isSpeaking.current) {
            console.log('[TAP-INTERRUPT] User tapped mic — stopping AI playback');
            audioBuffer.current = '';
            if (currentSound.current) {
                try {
                    await currentSound.current.stopAsync();
                    await currentSound.current.unloadAsync();
                } catch (e) { /* ignore */ }
                currentSound.current = null;
            }
            isSpeaking.current = false;
            setIsAiSpeaking(false);
            return;
        }

        if (isListening) {
            stopRecording();
        } else {
            setIsListening(true);
            setStatus('Connecting...');

            if (!isConnected) {
                try {
                    const { data } = await supabase.auth.getSession();
                    let token = data.session?.access_token;

                    if (!token) {
                        console.log('No session, attempting anonymous sign in...');
                        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
                        if (anonData?.session) {
                            token = anonData.session.access_token;
                        } else {
                            console.log('Anon auth not available, using Guest Mode.');
                            token = 'guest-demo-token';
                        }
                    }

                    if (token) {
                        connectToOpenAIDirectly(token);
                    } else {
                        setStatus('Auth Error');
                    }
                } catch (e) {
                    console.error("Auth check failed", e);
                    connectToOpenAIDirectly('guest-demo-token');
                }
            } else {
                startRecording();
            }
        }
    };

    const { width: SW, height: SH } = Dimensions.get('window');
    const ORB_SIZE = 140;
    const categoryLabels = [
        { icon: '📦', text: 'طلب وجبة جديدة' },
        { icon: '📄', text: 'إعادة الطلب السابق' },
        { icon: 'ℹ️', text: 'تتبع حالة الطلب' },
    ];

    return (
        <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={handleCloseOverlay}>
            <View style={s.root}>
                {/* Order Confirmation Overlay */}
                {orderConfirmed && (
                    <OrderConfirmation
                        items={cartItems}
                        totalPrice={orderDetails?.total}
                        restaurantName={selectedRestaurantRef.current?.name_ar}
                        onClose={() => { setOrderConfirmed(false); setOrderDetails(null); setCartItems([]); handleCloseOverlay(); }}
                    />
                )}

                {/* Back Button */}
                <Animated.View style={[s.backBtn, { opacity: backBtnOpacity, transform: [{ translateX: backBtnX }] }]}>
                    <TouchableOpacity onPress={appPhase === 'chat' ? handleEndSession : handleCloseOverlay} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Ionicons name="chevron-back" size={28} color="#000" />
                    </TouchableOpacity>
                </Animated.View>

                {/* Status Text (connecting + menu phases) */}
                <Animated.View style={[s.statusContainer, { opacity: statusOpacity, transform: [{ translateY: statusTransY }] }]}>
                    <Text style={s.statusTitle}>{statusTitle}</Text>
                    <Text style={s.statusSub}>{statusSubtitle}</Text>
                </Animated.View>

                {/* Chat Header Text (chat phase) */}
                <Animated.View style={[s.statusContainer, { opacity: chatHeaderOpacity, transform: [{ translateY: chatHeaderTransY }] }]}>
                    <Text style={s.statusTitle}>{chatHeaderTitle}</Text>
                    <Text style={s.statusSub}>{chatHeaderSubtitle}</Text>
                </Animated.View>

                {/* Orb Container */}
                <Animated.View style={[s.orbContainer, { transform: [{ translateY: orbTransY }] }]}>
                    {/* Blob Glow */}
                    <Animated.View style={[s.blobGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
                    {/* Core Blob */}
                    <Animated.View style={[s.coreBlob, { opacity: blobOpacity, transform: [{ scale: blobScale }, { translateY: blobTransY }] }]} />
                    {/* Loading Dots */}
                    {dotScales.map((sc, i) => (
                        <Animated.View key={`dot-${i}`} style={[s.loadDot, {
                            opacity: sc, transform: [{ translateX: dotXs[i] }, { translateY: dotYs[i] }, { scale: sc }, { scaleX: dotScaleXs[i] }, { scaleY: dotScaleYs[i] }],
                        }]} />
                    ))}
                    {/* Drop Blobs + Category Buttons */}
                    {dropScales.map((sc, i) => (
                        <Animated.View key={`drop-${i}`} style={{
                            position: 'absolute',
                            opacity: dropOpacities[i],
                            transform: [{ translateY: dropYs[i] }, { scale: sc }],
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <Animated.View style={{
                                width: dropWidths[i],
                                height: dropHeights[i],
                                borderRadius: 999,
                                backgroundColor: '#000',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden'
                            }}>
                                <TouchableOpacity onPress={() => enterChatMode(i)} activeOpacity={0.8}
                                    style={s.dropTouchable}>
                                    <Animated.View style={[s.labelRow, { opacity: labelOpacities[i], transform: [{ scale: labelScales[i] }] }]}>
                                        <Text style={s.labelIcon}>{categoryLabels[i].icon}</Text>
                                        <Text style={s.labelText}>{categoryLabels[i].text}</Text>
                                    </Animated.View>
                                </TouchableOpacity>
                            </Animated.View>
                        </Animated.View>
                    ))}
                </Animated.View>

                {/* Chat Canvas */}
                <Animated.View style={[s.chatCanvas, { opacity: chatCanvasOpacity, transform: [{ translateY: chatCanvasTransY }] }]}>
                    <ScrollView ref={scrollViewRef} contentContainerStyle={{ paddingBottom: 20 }}
                        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                        showsVerticalScrollIndicator={false}>
                        {messages.map((msg, idx) => (
                            <View key={idx} style={msg.role === 'user' ? s.userBubble : s.aiBubble}>
                                <Text style={msg.role === 'user' ? s.userText : s.aiText}>{msg.text}</Text>
                            </View>
                        ))}
                        {currentAiText ? (
                            <View style={[s.aiBubble, { opacity: 0.7 }]}>
                                <Text style={s.aiText}>{currentAiText}...</Text>
                            </View>
                        ) : null}
                        {/* Restaurant Suggestions */}
                        {suggestedRestaurants.length > 0 && (
                            <RestaurantSuggestions restaurants={suggestedRestaurants} onSelect={handleRestaurantCardTap} />
                        )}
                        {/* Inline Cart */}
                        {cartItems.length > 0 && !showFullCart && (
                            <InlineCartWidget items={cartItems} restaurantName={selectedRestaurantRef.current?.name_ar}
                                onItemsChange={(ni) => setCartItems(ni)} onShowCart={() => setShowFullCart(true)} />
                        )}
                    </ScrollView>
                </Animated.View>

                {/* Mute Toast */}
                <Animated.View style={[s.muteToast, { opacity: toastOpacity, transform: [{ translateY: toastTransY }] }]}>
                    <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={16} color="#fff" />
                    <Text style={s.toastText}>{muteToastText}</Text>
                </Animated.View>

                {/* Bottom Bar */}
                <Animated.View style={[s.bottomBar, { transform: [{ translateY: bottomBtnTransY }] }]}>
                    {/* End Button */}
                    <Animated.View style={{ opacity: bottomBtnOpacities[0], transform: [{ scale: bottomBtnScales[0] }] }}>
                        <TouchableOpacity onPress={handleEndSession} style={s.endBtn} activeOpacity={0.8}>
                            <Ionicons name="close" size={24} color="#fff" />
                        </TouchableOpacity>
                    </Animated.View>
                    {/* Mic Button */}
                    <Animated.View style={{ opacity: bottomBtnOpacities[1], transform: [{ scale: bottomBtnScales[1] }] }}>
                        <TouchableOpacity onPress={toggleMute} activeOpacity={0.85}>
                            <Animated.View style={[s.micBtn, { width: micBtnWidth, height: micBtnHeight, borderRadius: micBtnRadius }]}>
                                {/* Normal mic icon */}
                                <Animated.View style={[s.micIconWrap, { opacity: micNormalOpacity }]}>
                                    <Ionicons name="mic" size={28} color="#fff" />
                                </Animated.View>
                                {/* Muted icon */}
                                <Animated.View style={[s.micIconWrap, { opacity: micMutedOpacity, transform: [{ scale: micMutedScale }] }]}>
                                    <Ionicons name="mic-off" size={28} color="#ff4444" />
                                </Animated.View>
                                {/* Visualizer bars */}
                                <Animated.View style={[s.barsWrap, { opacity: barsOpacity }]}>
                                    {barHeightVals.map((h, i) => (
                                        <Animated.View key={`bar-${i}`} style={[s.visBar, {
                                            height: h, transform: [{ translateX: barXVals[i] }],
                                        }]} />
                                    ))}
                                </Animated.View>
                            </Animated.View>
                        </TouchableOpacity>
                    </Animated.View>
                    {/* Cart Button */}
                    <Animated.View style={{ opacity: bottomBtnOpacities[2], transform: [{ scale: bottomBtnScales[2] }] }}>
                        <TouchableOpacity onPress={() => setShowFullCart(true)} style={s.cartBtn} activeOpacity={0.8}>
                            <Ionicons name="bag-outline" size={22} color="#000" />
                            {cartItems.length > 0 && (
                                <View style={s.badge}>
                                    <Text style={s.badgeText}>{cartItems.reduce((sum, i) => sum + i.quantity, 0)}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </Animated.View>
                </Animated.View>

                {/* Full Cart / Checkout (existing OrderCartWidget) */}
                {appPhase === 'chat' && cartItems.length > 0 && showFullCart && (
                    <OrderCartWidget items={cartItems} restaurantName={selectedRestaurantRef.current?.name_ar}
                        onItemsChange={(ni) => setCartItems(ni)}
                        onConfirm={() => {
                            const subtotal = cartItems.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0);
                            const total = (subtotal * 1.15).toFixed(2);
                            const itemsSummary = cartItems.map(i => `${i.name_ar} × ${i.quantity}`).join('، ');
                            Alert.alert('تأكيد الطلب ✅', `${itemsSummary}\n\nالمجموع: ${total} ر.س`, [
                                { text: 'إلغاء', style: 'cancel' },
                                { text: 'تأكيد', onPress: () => {
                                    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                                        ws.current.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'أكد الطلب' }] } }));
                                        ws.current.send(JSON.stringify({ type: 'response.create' }));
                                    }
                                    setShowFullCart(false);
                                }},
                            ]);
                        }}
                        onEdit={() => {
                            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                                ws.current.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'أبي أعدّل الطلب' }] } }));
                                ws.current.send(JSON.stringify({ type: 'response.create' }));
                            }
                        }}
                    />
                )}
            </View>
        </Modal>
    );
};

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#ffffff' },
    backBtn: { position: 'absolute', top: 54, left: 16, zIndex: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' },
    statusContainer: { position: 'absolute', top: '10%', width: '100%', alignItems: 'center', zIndex: 5 },
    statusTitle: { fontSize: 26, fontWeight: '700', color: '#000', letterSpacing: -0.5 },
    statusSub: { fontSize: 15, color: '#8e8e93', marginTop: 8, fontWeight: '500' },
    orbContainer: { position: 'absolute', top: '26%', alignSelf: 'center', width: 140, height: 140, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    blobGlow: { position: 'absolute', width: 200, height: 200, borderRadius: 100 },
    coreBlob: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: '#000' },
    loadDot: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: '#000' },
    dropBlob: { position: 'absolute', borderRadius: 999, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    dropTouchable: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    labelIcon: { fontSize: 22 },
    labelText: { fontSize: 17, fontWeight: '600', color: '#fff', letterSpacing: -0.01 },
    chatCanvas: { position: 'absolute', top: '32%', bottom: 130, left: 0, right: 0, paddingHorizontal: 20, zIndex: 4 },
    userBubble: { alignSelf: 'flex-end', backgroundColor: '#e8e8e8', borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 10, maxWidth: '78%' },
    aiBubble: { alignSelf: 'flex-start', marginBottom: 10, maxWidth: '78%', paddingHorizontal: 4, paddingVertical: 6 },
    userText: { fontSize: 16, color: '#111', textAlign: 'right', lineHeight: 24 },
    aiText: { fontSize: 16, color: '#333', lineHeight: 24, textAlign: 'right' },
    muteToast: { position: 'absolute', bottom: 140, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 30 },
    toastText: { fontSize: 14, color: '#fff', fontWeight: '500' },
    bottomBar: { position: 'absolute', bottom: 45, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 15 },
    endBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center' },
    micBtn: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    micIconWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    barsWrap: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    visBar: { width: 10, backgroundColor: '#fff', borderRadius: 5, marginHorizontal: 2 },
    cartBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
    badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#111', borderRadius: 11, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderWidth: 2, borderColor: '#f5f5f5' },
    badgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});

export default VoiceOverlay;
