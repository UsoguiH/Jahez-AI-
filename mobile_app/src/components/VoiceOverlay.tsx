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
import CheckoutScreen from './CheckoutScreen';
import AIVisualizer, { AIVisualizerHandle } from './AIVisualizer';
import InlineCartWidget from './InlineCartWidget';
import OrderConfirmation from './OrderConfirmation';
import RestaurantSuggestions, { CUISINE_MAP } from './RestaurantSuggestions';
import { getRestaurantLogo } from '../lib/restaurantLogos';
import { comboStore, useActiveCombo } from '../state/comboStore';
import { ComboItem } from '../data/mcdonaldsCombo';
import { findCombo, combosCatalogForPrompt } from '../data/combos';
import ComboCard from './ComboCard';

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
    const activeCombo = useActiveCombo();
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
    const [showCheckout, setShowCheckout] = useState(false);
    const [chatReady, setChatReady] = useState(false);
    const aiAmplitudeRef = useRef(0);
    const [suggestedRestaurants, setSuggestedRestaurants] = useState<{name_ar: string; name_en: string; id: string}[]>([]);
    const [activeRestaurantUI, setActiveRestaurantUI] = useState<Restaurant | null>(null);
    const scrollViewRef = useRef<ScrollView>(null);
    const ws = useRef<WebSocket | null>(null);
    const recording = useRef<Audio.Recording | null>(null);
    const audioBuffer = useRef<string>('');
    const currentSound = useRef<Audio.Sound | null>(null);
    const isSpeaking = useRef<boolean>(false);
    // Interrupt tracking — capture AI response item_id + live playback position so we can
    // truncate the assistant's turn at the exact ms the user stopped listening.
    const currentResponseItemIdRef = useRef<string | null>(null);
    const playbackPositionMsRef = useRef<number>(0);
    const holdTimerRef = useRef<any>(null);
    const longPressFiredRef = useRef<boolean>(false);
    const interruptProgress = useRef(new Animated.Value(0)).current;
    // Set true while an interrupt is "in effect" — blocks late audio.delta / audio.done
    // messages and pending playAudioChunk calls from restarting playback after interrupt.
    // Reset on the next response.created so the NEXT assistant turn plays normally.
    const aiResponseInterruptedRef = useRef<boolean>(false);
    // Imperative handle to the visualizer so interrupt can snap it to the orb instantly.
    const visualizerRef = useRef<AIVisualizerHandle | null>(null);

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
    const [chatHeaderTitle, setChatHeaderTitle] = useState('مرحباً بك');
    const [chatHeaderSubtitle, setChatHeaderSubtitle] = useState('كيف يمكنني مساعدتك اليوم؟');
    const [muteToastText, setMuteToastText] = useState('');
    const isMutedRef = useRef(false);
    const currentMicVolumeRef = useRef(0);
    const lastVolRef = useRef(0);
    const waveIntervalRef = useRef<any>(null);
    const breathTweenRef = useRef<Animated.CompositeAnimation | null>(null);
    const barAnimRefs = useRef<(Animated.CompositeAnimation | null)[]>([]);
    const LIFT = -180;

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
    const selectedRestAnimScale = useRef(new Animated.Value(0)).current;

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
        setChatHeaderTitle('استمع إليك...');
        setChatHeaderSubtitle('تحدث بوضوح لطلب وجبتك');

        // Bottom-bar buttons keep scale=1 throughout (no bounce, no jitter). All entry motion
        // uses the native driver with smooth timing curves — no springs on layout/size.
        bottomBtnScales.forEach((sc) => sc.setValue(1));

        const easeOut = Easing.out(Easing.cubic);
        const easeInOut = Easing.bezier(0.4, 0, 0.2, 1); // Material "standard" curve — polished feel

        // --- PHASE 1 (0 → 200ms): non-selected pills fade out, all labels fade (label of selected first)
        Animated.parallel([
            ...dropOpacities.map((op, i) =>
                i === idx ? Animated.delay(0) : Animated.timing(op, { toValue: 0, duration: 220, easing: easeOut, useNativeDriver: true })
            ),
            ...dropScales.map((sc, i) =>
                i === idx ? Animated.delay(0) : Animated.timing(sc, { toValue: 0.3, duration: 220, easing: easeOut, useNativeDriver: true })
            ),
            ...labelOpacities.map((op) =>
                Animated.timing(op, { toValue: 0, duration: 180, easing: easeOut, useNativeDriver: true })
            ),
            Animated.timing(statusOpacity, { toValue: 0, duration: 200, easing: easeOut, useNativeDriver: true }),
        ]).start();

        // --- PHASE 2 (140 → 460ms): selected pill MORPHS from capsule (~pillW × 72) to ball (60 × 60)
        // This is the "cool" part — smooth shape collapse. JS-thread driven (width/height), but isolated
        // to a single pill; bottom bar (fixed height 80) and orb (native transforms) are unaffected.
        Animated.parallel([
            Animated.timing(dropWidths[idx], { toValue: 60, duration: 340, delay: 140, easing: easeInOut, useNativeDriver: false }),
            Animated.timing(dropHeights[idx], { toValue: 60, duration: 340, delay: 140, easing: easeInOut, useNativeDriver: false }),
        ]).start();

        // --- PHASE 3 (440 → 820ms): the ball glides up toward the orb, orb anticipates ---
        Animated.parallel([
            // Ball flies up into the orb's position
            Animated.timing(dropYs[idx], { toValue: 0, duration: 380, delay: 440, easing: easeInOut, useNativeDriver: true }),
            // Orb does a subtle squish-anticipation
            Animated.sequence([
                Animated.delay(440),
                Animated.timing(blobTransY, { toValue: 6, duration: 180, easing: easeInOut, useNativeDriver: true }),
                Animated.timing(blobTransY, { toValue: 0, duration: 260, easing: easeOut, useNativeDriver: true }),
            ]),
        ]).start();

        // --- PHASE 4 (780 → 1180ms): absorb — ball fades into orb, orb pops, then lifts ---
        Animated.parallel([
            // Ball fades in sync with the absorb pop
            Animated.timing(dropOpacities[idx], { toValue: 0, duration: 180, delay: 780, easing: easeOut, useNativeDriver: true }),
            Animated.timing(dropScales[idx], { toValue: 0.85, duration: 180, delay: 780, easing: easeOut, useNativeDriver: true }),
            // Blob pops outward on impact, then eases back to rest
            Animated.sequence([
                Animated.delay(780),
                Animated.timing(blobScale, { toValue: 1.2, duration: 200, easing: easeOut, useNativeDriver: true }),
                Animated.timing(blobScale, { toValue: 1, duration: 360, easing: easeInOut, useNativeDriver: true }),
            ]),
            // Lift the whole orb container up
            Animated.timing(orbTransY, { toValue: LIFT, duration: 600, delay: 740, easing: easeInOut, useNativeDriver: true }),
        ]).start();

        // --- PHASE 5 (880 → 1320ms): header, canvas, bottom bar slide in behind the orb motion ---
        Animated.parallel([
            Animated.timing(chatHeaderOpacity, { toValue: 1, duration: 360, delay: 920, easing: easeOut, useNativeDriver: true }),
            Animated.timing(chatHeaderTransY, { toValue: LIFT, duration: 540, delay: 780, easing: easeInOut, useNativeDriver: true }),
            Animated.timing(chatCanvasOpacity, { toValue: 1, duration: 380, delay: 940, easing: easeOut, useNativeDriver: true }),
            Animated.timing(chatCanvasTransY, { toValue: 0, duration: 500, delay: 820, easing: easeInOut, useNativeDriver: true }),
            // Bottom bar — pure opacity + single translateY, no per-button scale
            Animated.timing(bottomBtnTransY, { toValue: 0, duration: 500, delay: 820, easing: easeInOut, useNativeDriver: true }),
            ...bottomBtnOpacities.map((op) =>
                Animated.timing(op, { toValue: 1, duration: 360, delay: 920, easing: easeOut, useNativeDriver: true })
            ),
        ]).start();

        // Auto-connect voice once the full motion has settled; swap decorations → AI visualizer
        setTimeout(() => {
            setChatReady(true);
            handleMicPress();
        }, 1360);
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
            setIsConnected(false); 
            selectedRestaurantRef.current = null;
            setActiveRestaurantUI(null);
            selectedRestAnimScale.setValue(0);
            setCartItems([]); setOrderConfirmed(false); setOrderDetails(null);
            setShowFullCart(false); setSuggestedRestaurants([]); setMessages([]); setCurrentAiText('');
            setChatReady(false);
            runConnectingSequence();
        }, 700);
    };

    const startVisualizer = () => {
        barsOpacity.setValue(1); micNormalOpacity.setValue(0);
        // Clean layout: absolute bars morphing to [ -32, -16, 0, 16, 32 ]
        const txs = [-32, -16, 0, 16, 32];
        barXVals.forEach((x, i) => Animated.timing(x, { toValue: txs[i], duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start());
        Animated.parallel([
            Animated.timing(micBtnWidth, { toValue: 145, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
            Animated.timing(micBtnHeight, { toValue: 60, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
            Animated.timing(micBtnRadius, { toValue: 30, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        ]).start();
        
        const animBar = (i: number) => {
            if (isMutedRef.current) return;
            // Aggressively expanded visualizer height constraints -> Center max reaches 52px out of 60px capsule
            const ranges = [ [10, 20], [12, 38], [14, 52], [12, 38], [10, 20] ];
            const [minH, maxH] = ranges[i];
            
            const vol = currentMicVolumeRef.current;
            
            const intensity = Math.min(1, Math.max(0, vol));
            const target = minH + (maxH - minH) * intensity;
            
            Animated.timing(barHeightVals[i], { 
                toValue: target, 
                duration: 90, 
                easing: Easing.linear, 
                useNativeDriver: false 
            }).start(() => animBar(i));
        };
        barHeightVals.forEach((_, i) => animBar(i));
    };

    const stopVisualizer = () => {
        barAnimRefs.current.forEach(a => a?.stop()); barAnimRefs.current = [];
        barHeightVals.forEach(h => Animated.timing(h, { toValue: 10, duration: 200, useNativeDriver: false }).start());
        barXVals.forEach(x => Animated.timing(x, { toValue: 0, duration: 300, useNativeDriver: false }).start());
        Animated.parallel([
            Animated.timing(micBtnWidth, { toValue: 76, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
            Animated.timing(micBtnHeight, { toValue: 76, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
            Animated.timing(micBtnRadius, { toValue: 38, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
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
                Animated.timing(micBtnWidth, { toValue: 76, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
                Animated.timing(micBtnHeight, { toValue: 76, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
                Animated.timing(micBtnRadius, { toValue: 38, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
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

    // =====================================================
    // AI INTERRUPT (long-press mic 3s while AI is speaking)
    // Preserves context: stops local playback + truncates the assistant item at the
    // exact ms the user heard, so the model's memory matches what was actually spoken.
    // =====================================================
    const interruptAI = async () => {
        // Arm the guard FIRST — any audio.delta / audio.done / in-flight playAudioChunk
        // still in progress will see this and bail instead of restarting playback.
        aiResponseInterruptedRef.current = true;

        // Snap the visualizer to the listening orb instantly (skips the ~850ms
        // respond→listen transition so the user sees the orb "listen mode" immediately).
        visualizerRef.current?.forceListen();

        // Detach the sound's status callback BEFORE stopping, so a final status update
        // can't flip isAiSpeaking back on or write to aiAmplitudeRef after we reset.
        const sound = currentSound.current;
        if (sound) {
            try { sound.setOnPlaybackStatusUpdate(null); } catch {}
            try { await sound.stopAsync(); } catch {}
            try { await sound.unloadAsync(); } catch {}
            if (currentSound.current === sound) currentSound.current = null;
        }
        aiAmplitudeRef.current = 0;

        const socket = ws.current;
        const itemId = currentResponseItemIdRef.current;
        const audioEndMs = Math.max(0, Math.floor(playbackPositionMsRef.current));

        if (socket && socket.readyState === WebSocket.OPEN) {
            // Cancel any in-flight generation (no-op if the model already finished)
            try { socket.send(JSON.stringify({ type: 'response.cancel' })); } catch {}
            // Truncate the assistant turn so the model's context reflects what the user heard
            if (itemId) {
                try {
                    socket.send(JSON.stringify({
                        type: 'conversation.item.truncate',
                        item_id: itemId,
                        content_index: 0,
                        audio_end_ms: audioEndMs,
                    }));
                } catch {}
            }
        }

        currentResponseItemIdRef.current = null;
        playbackPositionMsRef.current = 0;
        audioBuffer.current = '';
        isSpeaking.current = false;
        setIsAiSpeaking(false);

        // Brief toast so the user knows the interrupt landed
        setMuteToastText('تم إيقاف المساعد');
        Animated.sequence([
            Animated.parallel([
                Animated.timing(toastOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
                Animated.timing(toastTransY, { toValue: 0, duration: 220, useNativeDriver: true }),
            ]),
            Animated.delay(1000),
            Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => toastTransY.setValue(8));
    };

    const handleMicPressIn = () => {
        longPressFiredRef.current = false;
        // Only arm the interrupt while the AI is actually speaking
        if (!isAiSpeaking) return;
        Animated.timing(interruptProgress, {
            toValue: 1,
            duration: 3000,
            easing: Easing.linear,
            useNativeDriver: false,
        }).start();
        holdTimerRef.current = setTimeout(() => {
            longPressFiredRef.current = true;
            interruptAI();
            interruptProgress.setValue(0);
        }, 3000);
    };

    const handleMicPressOut = () => {
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        Animated.timing(interruptProgress, {
            toValue: 0,
            duration: 200,
            useNativeDriver: false,
        }).start();
    };

    const handleMicTap = () => {
        // If the long-press interrupt already fired, don't also toggle mute
        if (longPressFiredRef.current) {
            longPressFiredRef.current = false;
            return;
        }
        toggleMute();
    };

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

**الوجبات (Combos) المتاحة للتخصيص بالصوت:**
${combosCatalogForPrompt()}

**المهام:**
1. عند أول اتصال، رحّب بالمستخدم ترحيب حار وقصير واسأله "وش تشتهي اليوم؟" واذكر الأنواع: برقر، دجاج، شاورما، بيتزا، أو قهوة. لا تذكر أسماء المطاعم كلها.
2. **مهم جداً:** لما المستخدم يقول نوع أكل (مثل "برقر" أو "دجاج" أو "بيتزا")، استخدم أداة suggest_restaurants فوراً مع نوع الأكل. هذا يعرض بطاقات المطاعم على شاشة المستخدم وهو يقدر يختار بالضغط أو بالصوت.
3. لما المستخدم يقول اسم مطعم مباشرة، استخدم أداة select_restaurant فوراً بدون ما تسأل عن النوع.
4. **مهم جداً — قاعدة open_combo_customizer:** استخدم open_combo_customizer **فقط** إذا كان الصنف موجود حرفياً بالـ combo_id في قسم "الوجبات (Combos) المتاحة للتخصيص بالصوت" أعلاه (مثل "mcd_big_mac_meal"). **لا تستخدمها لأي صنف عادي من قائمة المطعم حتى لو كان في قسم اسمه "وجبات" أو يحتوي كلمة "وجبة".** أي صنف غير مدرج بالاسم والـ id في قائمة الـ Combos أعلاه → استخدم update_cart. مثال: "٩ قطع ماك ناجتس" أو "تسع قطع ناجتس" → update_cart (ليس open_combo_customizer).
5. بعد فتح بطاقة التخصيص، اسأل المستخدم عن الحجم (أول مجموعة مطلوبة) واستخدم customize_combo مع كل اختيار يقوله.
6. لما يؤكد الوجبة، استخدم add_active_combo_to_cart.
7. بعد ما يتم تحميل القائمة (للأصناف العادية غير الوجبات)، ساعد المستخدم في الطلب.
8. لا تحاول تعرض قائمة طعام قبل استخدام select_restaurant.

**تعليمات مهمة:**
- لا تذكر أي IDs أو معلومات تقنية.
- الأسعار بالريال السعودي.
- ردودك قصيرة جداً — جملة أو جملتين فقط.
- لا تسرد جميع المطاعم أبداً. فقط اقترح ٢-٣ مطاعم حسب ما يشتهيه المستخدم.`;
    };

    // Build combo-mode instructions (when user opens voice from a ComboCard)
    const getComboInstructions = (combo: ComboItem) => {
        const groupsText = combo.groups
            .map((g) => {
                const opts = g.options
                    .map(
                        (o) =>
                            `    • ${o.name_ar} (id: ${o.id})${o.price_delta > 0 ? ` +${o.price_delta} ر.س` : ''}`
                    )
                    .join('\n');
                return `  🔸 ${g.title_ar} (group_id: ${g.id}) — ${g.required ? 'مطلوب' : 'اختياري'} — ${g.select === 'single' ? 'اختر واحد فقط' : 'تقدر تختار أكثر من واحد'}:\n${opts}`;
            })
            .join('\n\n');

        return `أنت مساعد ذكي ودود اسمك "جاهز AI" تعمل في تطبيق جاهز لتوصيل الطعام.
تتحدث بالعربية بلهجة سعودية نجدية ودية، ردودك قصيرة جداً (جملة واحدة).

**الوضع الحالي: تخصيص وجبة**
المستخدم فاتح بطاقة "${combo.name_ar}" من ${combo.restaurant_ar} ويبي يخصصها بصوته.

**تفاصيل الوجبة:**
- السعر الأساسي: ${combo.base_price} ريال
- المجموعات المتاحة:

${groupsText}

**المهام:**
1. رحّب بالمستخدم قصير جداً واسأله وش يبي الحجم (أول مجموعة مطلوبة).
2. **مهم:** في كل مرة المستخدم يقول اختيار (مثل "كبير" أو "كولا" أو "بطاطس حلزونية" أو "بدون مخلل")، استخدم أداة customize_combo فوراً مع:
   - group_id المناسب
   - option_ids (مصفوفة من IDs المطابقة)
   - action: 'set' للمجموعات single ('الحجم'، 'البطاطس'، 'المشروب')، 'add' للإضافات، 'remove' للحذف
3. بعد كل تعديل، أكّد بجملة قصيرة: "تمام، كبير" أو "أبشر، بدون مخلل".
4. بعد ما تنتهي جميع المجموعات المطلوبة، اسأل: "كذا تمام؟ أضيفها للسلة؟"
5. لما يقول "نعم" أو "أكد" أو "خلاص" أو "أضف"، استخدم add_active_combo_to_cart.

**فهم اللهجة:**
- "صغير/وسط/كبير" → size
- "كولا/سبرايت/بيبسي/كولا زيرو/شاي/قهوة" → drink
- "زيدي/ضيف/أبي" + اسم الإضافة → extras action='add'
- "بدون/شيل/ما أبي" + اسم العنصر → remove action='add'

**تعليمات حاسمة:**
- لا تذكر IDs في ردك الصوتي أبداً.
- ردودك قصيرة جداً — كلمة أو كلمتين.
- استخدم customize_combo فور ما يقول المستخدم اختياره، لا تنتظر.
- الأسعار بالريال السعودي.
- شخصيتك: "أبشر"، "تمام"، "حاضر"، "على راسي".

**رسائل [تحديث من الواجهة]:**
لما تشوف رسالة تبدأ بـ "[تحديث من الواجهة]"، هذي مش كلام المستخدم — هذي إشعار من نظام الواجهة يخبرك إن المستخدم ضغط خيار بنفسه على البطاقة. **لا ترد عليها صوتياً ولا تستخدم customize_combo (لأن الواجهة حدّثت حالها بنفسها).** فقط اعتبر الاختيار صار، وخذه بعين الاعتبار في جوابك القادم لما المستخدم يتكلم. إذا كانت كل المجموعات المطلوبة تم تعبئتها، في ردك القادم اسأله "كذا تمام؟ أضيفها؟".`;
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

**الوجبات (Combos) المتاحة للتخصيص بالصوت:**
${combosCatalogForPrompt()}

**User ID:** '${userId || 'guest-user-123'}'

**المهام:**
1. ساعد المستخدم في اختيار أصناف من القائمة.
2. لما يطلب صنف، أكّد الاسم والسعر بجملة وحدة.
3. **مهم جداً:** بعد كل إضافة أو تعديل أو حذف صنف عادي (غير الوجبات)، استخدم أداة update_cart فوراً وأرسل الطلب الكامل الحالي (جميع الأصناف مع الكميات والأسعار).
3.1. **قاعدة open_combo_customizer (صارمة):** استخدمها **فقط** للأصناف المدرجة حرفياً بـ combo_id في قسم "الوجبات (Combos) المتاحة للتخصيص بالصوت" أعلاه (حالياً فقط mcd_big_mac_meal). **أي صنف آخر في القائمة — حتى لو كان في قسم "وجبات وساندويتشات" أو يحتوي كلمة "وجبة" في اسمه — استخدم update_cart بشكل طبيعي.** أمثلة: "٩ قطع ماك ناجتس" → update_cart. "بيج ماك ساندويتش فقط" → update_cart. "وجبة بيج ماك" → open_combo_customizer. بعد فتح البطاقة، استخدم customize_combo لكل اختيار، وأخيراً add_active_combo_to_cart للتأكيد.
3.2. **تحذير:** لا تخترع combo_id. إذا لم تجد الصنف حرفياً في قائمة الـ Combos أعلاه، استخدم update_cart.
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
            },
            {
                type: "function",
                name: "open_combo_customizer",
                description: "Open the voice customization card ONLY for combos that appear in the combo catalog in your instructions (currently only 'mcd_big_mac_meal'). Do NOT call this for regular menu items, even if they are inside a restaurant category named 'وجبات' or contain the word 'وجبة' in their name (e.g. '9 Piece Chicken McNuggets' is a regular item — use update_cart). Do NOT invent combo_ids. If the item is not literally listed as a combo with an explicit combo_id, use update_cart instead.",
                parameters: {
                    type: "object",
                    properties: {
                        combo_id: {
                            type: "string",
                            description: "The id of the combo to open, exactly as listed in the combo catalog (e.g. 'mcd_big_mac_meal'). You can also pass the Arabic or English name and the system will fuzzy-match."
                        }
                    },
                    required: ["combo_id"]
                }
            },
            {
                type: "function",
                name: "customize_combo",
                description: "Update a selection on the currently active combo card visible on the user's screen. Call this IMMEDIATELY when the user says a modifier (size, fries type, drink, add-on, or remove). Never wait — call it at the same time you speak the confirmation.",
                parameters: {
                    type: "object",
                    properties: {
                        group_id: {
                            type: "string",
                            description: "The modifier group id exactly as listed in the combo details (e.g. 'size', 'fries', 'drink', 'extras', 'remove')."
                        },
                        option_ids: {
                            type: "array",
                            description: "Array of option ids to apply (e.g. ['size_l'], ['extra_cheese','extra_bacon']). Use ids from the combo details, not Arabic names.",
                            items: { type: "string" }
                        },
                        action: {
                            type: "string",
                            enum: ["set", "add", "remove", "clear"],
                            description: "'set' replaces the group's selection (for single-select groups). 'add' appends (for extras/remove). 'remove' removes the listed ids. 'clear' empties the group."
                        }
                    },
                    required: ["group_id", "option_ids", "action"]
                }
            },
            {
                type: "function",
                name: "add_active_combo_to_cart",
                description: "Finalize the currently active combo with its current selections and add it to the cart. Call this when the user confirms (says 'خلاص', 'أكد', 'تمم', 'أضف'). Will fail if required groups are still unfilled.",
                parameters: {
                    type: "object",
                    properties: {},
                    required: []
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

                // Branch: combo mode vs restaurant-selection mode
                const activeCombo = comboStore.getState().activeCombo;
                const instructions = activeCombo
                    ? getComboInstructions(activeCombo)
                    : getInitialInstructions();
                const greeting = activeCombo
                    ? `رحّب بالمستخدم كلمتين فقط ("هلا!" أو "أبشر!") ثم اسأله على طول عن ${activeCombo.groups.find((g) => g.required)?.title_ar || 'الحجم'}. جملة واحدة قصيرة.`
                    : `رحّب بالمستخدم ترحيب حار وقصير وعرّف عن نفسك إنك "جاهز AI" واسأله وش يشتهي اليوم — برقر، دجاج، شاورما، بيتزا، أو قهوة؟ جملتين فقط لا تطوّل. لا تذكر أسماء مطاعم.`;

                // Initialize Session
                const sessionUpdate = {
                    type: 'session.update',
                    session: {
                        instructions,
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

                // Trigger initial greeting — context-aware
                setTimeout(() => {
                    console.log(`Requesting AI greeting... mode=${activeCombo ? 'combo:' + activeCombo.id : 'restaurant-picker'}`);
                    socket.send(JSON.stringify({
                        type: 'response.create',
                        response: {
                            modalities: ['text', 'audio'],
                            instructions: greeting
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
                        // New assistant turn starting — clear the interrupt guard so this
                        // turn is allowed to stream and play normally.
                        aiResponseInterruptedRef.current = false;
                        // AI is generating — mute mic during playback to prevent echo
                        isSpeaking.current = true;
                        setIsAiSpeaking(true);
                        audioBuffer.current = '';
                    }

                    if (msg.type === 'response.audio.delta' && msg.delta) {
                        // If the user interrupted this turn, drop any straggler chunks.
                        if (aiResponseInterruptedRef.current) { /* drop */ }
                        else {
                            if (msg.item_id && !currentResponseItemIdRef.current) {
                                currentResponseItemIdRef.current = msg.item_id;
                            }
                            audioBuffer.current += msg.delta;
                        }
                    }

                    if (msg.type === 'response.audio.done') {
                        console.log('Audio complete, playing buffered audio, length:', audioBuffer.current.length);
                        // If interrupted, skip playback entirely — buffer was already cleared
                        // in interruptAI, but guard anyway in case delta arrived between clear
                        // and guard arming.
                        if (aiResponseInterruptedRef.current) {
                            audioBuffer.current = '';
                        } else if (audioBuffer.current.length > 0) {
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
                        } else if (name === 'open_combo_customizer') {
                            result = handleOpenComboCustomizer(args, socket);
                        } else if (name === 'customize_combo') {
                            result = handleCustomizeCombo(args);
                        } else if (name === 'add_active_combo_to_cart') {
                            result = handleAddActiveComboToCart(socket);
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
        setActiveRestaurantUI(restaurant);
        setSuggestedRestaurants([]);

        // Elegant spring entrance for the newly selected restaurant logo
        selectedRestAnimScale.setValue(0);
        Animated.spring(selectedRestAnimScale, {
            toValue: 1,
            tension: 50,
            friction: 6,
            useNativeDriver: true
        }).start();

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

    // Handle open_combo_customizer — AI opens the combo card for voice customization
    const handleOpenComboCustomizer = (args: { combo_id: string }, socket: WebSocket) => {
        const combo = findCombo(args.combo_id);
        if (!combo) {
            return {
                success: false,
                error: `Unknown combo '${args.combo_id}'. Valid combos are listed in the combo catalog.`,
            };
        }

        comboStore.setActive(combo);

        // Switch AI instructions into combo-customization mode so it knows group/option IDs
        socket.send(JSON.stringify({
            type: 'session.update',
            session: {
                instructions: getComboInstructions(combo),
            },
        }));

        console.log(`[TOOL] open_combo_customizer: opened "${combo.name_ar}" (${combo.id})`);

        const firstRequired = combo.groups.find((g) => g.required);

        return {
            success: true,
            combo_id: combo.id,
            combo_name_ar: combo.name_ar,
            restaurant_ar: combo.restaurant_ar,
            base_price: combo.base_price,
            first_required_group_ar: firstRequired?.title_ar || null,
            first_required_group_id: firstRequired?.id || null,
            groups: combo.groups.map((g) => ({
                id: g.id,
                title_ar: g.title_ar,
                required: g.required,
                select: g.select,
                options: g.options.map((o) => ({ id: o.id, name_ar: o.name_ar, price_delta: o.price_delta })),
            })),
            message: `تم فتح بطاقة ${combo.name_ar}. اسأل المستخدم عن ${firstRequired?.title_ar || 'الاختيارات'} الآن.`,
        };
    };

    // Handle customize_combo — voice-driven update to the active combo card
    const handleCustomizeCombo = (args: { group_id: string; option_ids: string[]; action: 'set' | 'add' | 'remove' | 'clear' }) => {
        const activeCombo = comboStore.getState().activeCombo;
        if (!activeCombo) {
            return { success: false, error: 'No active combo. The user is not customizing any combo right now.' };
        }

        const group = activeCombo.groups.find((g) => g.id === args.group_id);
        if (!group) {
            return {
                success: false,
                error: `Unknown group_id '${args.group_id}'. Valid groups: ${activeCombo.groups.map((g) => g.id).join(', ')}`,
            };
        }

        const validIds = new Set(group.options.map((o) => o.id));
        const unknownIds = (args.option_ids || []).filter((id) => !validIds.has(id));
        if (unknownIds.length > 0 && args.action !== 'clear') {
            return {
                success: false,
                error: `Unknown option ids in group '${group.id}': ${unknownIds.join(', ')}. Valid: ${group.options.map((o) => o.id).join(', ')}`,
            };
        }

        comboStore.applyAIChange(activeCombo.id, args.group_id, args.option_ids || [], args.action);

        const newState = comboStore.getState().byId[activeCombo.id];
        const selectedNames = (newState?.selections[args.group_id] ?? [])
            .map((id) => group.options.find((o) => o.id === id)?.name_ar)
            .filter(Boolean);

        console.log(`[TOOL] customize_combo: ${args.group_id} ${args.action} ${args.option_ids.join(',')} → now [${selectedNames.join('، ')}]`);

        return {
            success: true,
            group_id: args.group_id,
            group_title_ar: group.title_ar,
            current_selection_ar: selectedNames,
            message: `تم تحديث ${group.title_ar}: ${selectedNames.join('، ') || 'فارغ'}`,
        };
    };

    // Handle add_active_combo_to_cart — finalize combo and add as cart line
    const handleAddActiveComboToCart = (socket: WebSocket) => {
        const s = comboStore.getState();
        const activeCombo = s.activeCombo;
        if (!activeCombo) {
            return { success: false, error: 'No active combo to add.' };
        }
        const perCombo = s.byId[activeCombo.id];
        if (!perCombo) {
            return { success: false, error: 'Active combo has no state.' };
        }

        const unfilled = activeCombo.groups.filter(
            (g) => g.required && (perCombo.selections[g.id]?.length ?? 0) === 0
        );
        if (unfilled.length > 0) {
            return {
                success: false,
                error: `Cannot add combo — required groups still empty: ${unfilled.map((g) => g.title_ar).join('، ')}. Ask the user to pick these first.`,
                unfilled_groups_ar: unfilled.map((g) => g.title_ar),
            };
        }

        // Build summary + price
        let mod = 0;
        const parts: string[] = [];
        activeCombo.groups.forEach((g) => {
            const picked = perCombo.selections[g.id] ?? [];
            picked.forEach((pid) => {
                const opt = g.options.find((o) => o.id === pid);
                if (!opt) return;
                mod += opt.price_delta;
                if (opt.price_delta > 0 || !opt.default) parts.push(opt.name_ar);
            });
        });
        const unitPrice = activeCombo.base_price + mod;
        const lineTotal = unitPrice * perCombo.quantity;
        const summaryAr = `${activeCombo.name_ar}${parts.length ? ' - ' + parts.join('، ') : ''}`;

        const newItem: CartItem = {
            name_ar: summaryAr,
            name_en: activeCombo.name_en,
            quantity: perCombo.quantity,
            unit_price: unitPrice,
            notes: undefined,
        };
        setCartItems((prev) => [...prev, newItem]);
        comboStore.reset(activeCombo.id, activeCombo);
        // Clear the active combo so the voice card disappears from the overlay.
        // A new combo may appear later if the user orders another one.
        comboStore.clearActive();

        // Restore general-mode instructions so the AI is ready for the next item.
        // If a restaurant is selected, use its menu instructions; otherwise the initial picker.
        const restored = selectedRestaurantRef.current
            ? getMenuInstructions(selectedRestaurantRef.current)
            : getInitialInstructions();
        socket.send(JSON.stringify({
            type: 'session.update',
            session: { instructions: restored },
        }));

        console.log(`[TOOL] add_active_combo_to_cart: +${summaryAr} × ${perCombo.quantity} = ${lineTotal} ر.س — combo card closed, instructions restored`);

        return {
            success: true,
            added_item_ar: summaryAr,
            quantity: perCombo.quantity,
            unit_price: unitPrice,
            line_total: lineTotal,
            message: `تمت إضافة ${summaryAr} × ${perCombo.quantity} — المجموع ${lineTotal.toFixed(0)} ريال.`,
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
        // Short-circuit if the user already interrupted before this chunk began.
        if (aiResponseInterruptedRef.current) return;
        try {
            if (currentSound.current) {
                try {
                    await currentSound.current.stopAsync();
                    await currentSound.current.unloadAsync();
                } catch (e) { /* ignore */ }
                currentSound.current = null;
            }
            if (aiResponseInterruptedRef.current) return;

            const { appendWavHeader, computeAmplitudeEnvelope } = await import('../lib/audioUtils');
            if (aiResponseInterruptedRef.current) return;

            // Pre-compute amplitude envelope at 30 FPS so the visualizer bars track real speech loudness.
            const envelope = computeAmplitudeEnvelope(pcmBase64, 24000, 30);
            const envelopeFps = 30;

            const wavData = appendWavHeader(pcmBase64);
            const uri = (FileSystem.cacheDirectory || FileSystem.documentDirectory || '') + `response_${Date.now()}.wav`;
            await FileSystem.writeAsStringAsync(uri, wavData, { encoding: FileSystem.EncodingType.Base64 });
            if (aiResponseInterruptedRef.current) return;

            const { sound: newSound } = await Audio.Sound.createAsync(
                { uri },
                { progressUpdateIntervalMillis: 33 }
            );
            // If we were interrupted while the sound was loading, throw it away
            // instead of starting playback.
            if (aiResponseInterruptedRef.current) {
                try { await newSound.unloadAsync(); } catch {}
                return;
            }
            currentSound.current = newSound;
            await newSound.playAsync();
            newSound.setOnPlaybackStatusUpdate(status => {
                // Guard every status update — once interrupted, the sound is being
                // torn down and we must not touch any shared refs/state.
                if (aiResponseInterruptedRef.current) return;
                if (status.isLoaded) {
                    if (status.isPlaying && !status.didJustFinish) {
                        playbackPositionMsRef.current = status.positionMillis;
                        const idx = Math.floor((status.positionMillis / 1000) * envelopeFps);
                        aiAmplitudeRef.current = envelope[idx] ?? 0;
                    }
                    if (status.didJustFinish) {
                        aiAmplitudeRef.current = 0;
                        playbackPositionMsRef.current = 0;
                        currentResponseItemIdRef.current = null;
                        newSound.unloadAsync();
                        if (currentSound.current === newSound) currentSound.current = null;
                        console.log('Playback finished — resuming mic input');
                        isSpeaking.current = false;
                        setIsAiSpeaking(false);
                    }
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
                // If the AI is speaking, or user muted, instantly flatline the visualizer to 0
                // and completely abort sending data back to the websocket.
                if (isSpeaking.current || isMutedRef.current) {
                    currentMicVolumeRef.current = 0; // Pure silence flat-line
                    return;
                }

                // AI is quiet: Actively track genuine user microphone phonetics.
                try {
                    const buf = Buffer.from(data, 'base64');
                    let maxPeak = 0;
                    
                    // True Peak Tracking (Captures fast human syllables and 'T', 'P' plosives perfectly)
                    for (let i = 0; i < buf.length - 1; i += 2) { 
                        const val = Math.abs(buf.readInt16LE(i));
                        if (val > maxPeak) maxPeak = val;
                    }
                    
                    // --- ULTRA SENSITIVE UX CURVE ---
                    // 1. Strict Peak Noise Gate: Ignores static room noise entirely (typical peak < 200).
                    let effectiveAmp = Math.max(0, maxPeak - 200); 
                    
                    // 2. High-Sensitivity Ceiling. (1500 peak means normal talking will hit 100% easily).
                    let rawNorm = Math.min(effectiveAmp, 1500) / 1500;
                    
                    // 3. Logarithmic Hearing Curve: Boosts whispers physically.
                    let normRaw = Math.pow(rawNorm, 0.6);
                    
                    // 4. Rhythm Bouncing: 80% attack for instant tracking, 50% decay for fast drops.
                    let last = currentMicVolumeRef.current;
                    let v = normRaw > last ? (last * 0.2 + normRaw * 0.8) : (last * 0.5 + normRaw * 0.5);
                    
                    currentMicVolumeRef.current = v;
                } catch (e) {
                    console.warn("Volume calc err:", e);
                }

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
        { iconName: 'mic-outline', text: 'طلب وجبة جديدة', disabled: false, color: '#000' },
        { iconName: 'reload-outline', text: 'إعادة الطلب السابق (قريباً)', disabled: true, color: '#7a7a7a' },
        { iconName: 'time-outline', text: 'تتبع حالة الطلب (قريباً)', disabled: true, color: '#7a7a7a' },
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

                {/* Selected Restaurant Logo Orb (Top Right) */}
                {activeRestaurantUI && getRestaurantLogo(activeRestaurantUI.name_ar) ? (
                    <Animated.View style={{
                        position: 'absolute',
                        top: 54,
                        right: 16,
                        zIndex: 20,
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: '#fff',
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 6,
                        elevation: 5,
                        transform: [{ scale: selectedRestAnimScale }],
                        opacity: selectedRestAnimScale,
                        borderWidth: 1,
                        borderColor: '#E5E5EA'
                    }}>
                        <Image 
                            source={getRestaurantLogo(activeRestaurantUI.name_ar)} 
                            style={{ width: 32, height: 32, borderRadius: 16 }} 
                            resizeMode="contain" 
                        />
                    </Animated.View>
                ) : null}

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
                    {/* Pre-chat decorations: drop blobs, glow, core blob, loading dots — stay visible through the entrance lift, hidden once chat is settled */}
                    {!chatReady && (
                        <>
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
                                        backgroundColor: categoryLabels[i].color,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden'
                                    }}>
                                        <TouchableOpacity onPress={() => !categoryLabels[i].disabled && enterChatMode(i)} activeOpacity={categoryLabels[i].disabled ? 1 : 0.8}
                                            style={s.dropTouchable}>
                                            <Animated.View style={[s.labelRow, { opacity: labelOpacities[i], transform: [{ scale: labelScales[i] }] }]}>
                                                <Text style={s.labelText}>{categoryLabels[i].text}</Text>
                                                <Ionicons name={categoryLabels[i].iconName as any} size={22} color="#fff" style={{marginLeft: 8}} />
                                            </Animated.View>
                                        </TouchableOpacity>
                                    </Animated.View>
                                </Animated.View>
                            ))}

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
                        </>
                    )}

                    {/* AI Audio Visualizer — circle (listening) ↔ bars (responding, driven by live AI audio) */}
                    {chatReady && (
                        <AIVisualizer ref={visualizerRef} state={isAiSpeaking ? 'respond' : 'listen'} amplitudeRef={aiAmplitudeRef} />
                    )}
                </Animated.View>

                {/* Chat Canvas */}
                <Animated.View style={[s.chatCanvas, { opacity: chatCanvasOpacity, transform: [{ translateY: chatCanvasTransY }] }]}>
                    <ScrollView ref={scrollViewRef} contentContainerStyle={{ paddingBottom: 20 }}
                        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                        showsVerticalScrollIndicator={false}>
                        {/* Active Combo Card — visible when user tapped voice pill on a ComboCard */}
                        {activeCombo ? (
                            <View style={{ marginHorizontal: 4, marginBottom: 12 }}>
                                <ComboCard
                                    combo={activeCombo}
                                    hideVoicePill
                                    compact
                                    onUserSelect={(groupId, optionIds) => {
                                        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
                                        const group = activeCombo.groups.find((g) => g.id === groupId);
                                        if (!group) return;
                                        const names = optionIds
                                            .map((id) => group.options.find((o) => o.id === id)?.name_ar)
                                            .filter(Boolean)
                                            .join('، ') || 'لا شيء';
                                        const text = `[تحديث من الواجهة] المستخدم غيّر "${group.title_ar}" يدوياً إلى: ${names}. لا تعلّق، فقط تابع وسجّل هذا في ذاكرتك.`;
                                        ws.current.send(JSON.stringify({
                                            type: 'conversation.item.create',
                                            item: {
                                                type: 'message',
                                                role: 'user',
                                                content: [{ type: 'input_text', text }],
                                            },
                                        }));
                                        console.log('[UI→AI]', text);
                                    }}
                                    onUserQuantity={(q) => {
                                        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
                                        const text = `[تحديث من الواجهة] المستخدم غيّر الكمية يدوياً إلى ${q}. لا تعلّق، فقط تابع.`;
                                        ws.current.send(JSON.stringify({
                                            type: 'conversation.item.create',
                                            item: {
                                                type: 'message',
                                                role: 'user',
                                                content: [{ type: 'input_text', text }],
                                            },
                                        }));
                                        console.log('[UI→AI]', text);
                                    }}
                                    onAddToCart={(payload) => {
                                        setCartItems((prev) => [
                                            ...prev,
                                            {
                                                name_ar: payload.summary_ar,
                                                name_en: activeCombo.name_en,
                                                quantity: payload.quantity,
                                                unit_price: payload.unit_price,
                                                notes: undefined,
                                            },
                                        ]);
                                        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                                            const text = `[تحديث من الواجهة] المستخدم ضغط زر "إضافة" بنفسه. تمت إضافة ${payload.summary_ar} × ${payload.quantity} بسعر ${payload.line_total.toFixed(0)} ريال للسلة. الوجبة تم إنهاؤها. اسأله باختصار إذا يبي شي ثاني.`;
                                            ws.current.send(JSON.stringify({
                                                type: 'conversation.item.create',
                                                item: {
                                                    type: 'message',
                                                    role: 'user',
                                                    content: [{ type: 'input_text', text }],
                                                },
                                            }));
                                            console.log('[UI→AI]', text);
                                        }
                                        comboStore.clearActive();
                                    }}
                                />
                            </View>
                        ) : null}
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
                        <TouchableOpacity
                            onPress={handleMicTap}
                            onPressIn={handleMicPressIn}
                            onPressOut={handleMicPressOut}
                            activeOpacity={0.85}
                        >
                            {/* Interrupt hold-progress ring — fills over 3s while pressed during AI speech */}
                            <Animated.View
                                pointerEvents="none"
                                style={[
                                    s.interruptRing,
                                    {
                                        width: Animated.add(micBtnWidth, new Animated.Value(16)),
                                        height: Animated.add(micBtnHeight, new Animated.Value(16)),
                                        borderRadius: Animated.add(micBtnRadius, new Animated.Value(8)),
                                        opacity: interruptProgress,
                                        borderWidth: interruptProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }),
                                        transform: [{ scale: interruptProgress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.05] }) }],
                                    },
                                ]}
                            />
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
                        onClose={() => setShowFullCart(false)}
                        onConfirm={() => {
                            setShowFullCart(false);
                            setShowCheckout(true);
                        }}
                        onEdit={() => {
                            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                                ws.current.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'أبي أعدّل الطلب' }] } }));
                                ws.current.send(JSON.stringify({ type: 'response.create' }));
                            }
                        }}
                    />
                )}

                {/* Checkout Screen (اتمام الطلب) */}
                <CheckoutScreen
                    visible={showCheckout}
                    items={cartItems}
                    onClose={() => setShowCheckout(false)}
                    onPay={() => {
                        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                            ws.current.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'أكد الطلب' }] } }));
                            ws.current.send(JSON.stringify({ type: 'response.create' }));
                        }
                        setShowCheckout(false);
                    }}
                />
            </View>
        </Modal>
    );
};

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#ffffff' },
    backBtn: { position: 'absolute', top: 54, left: 16, zIndex: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' },
    statusContainer: { position: 'absolute', top: '10%', left: 0, right: 0, width: '100%', alignItems: 'center', zIndex: 5, paddingHorizontal: 20 },
    statusTitle: { fontSize: 26, fontWeight: '700', color: '#000', textAlign: 'center', includeFontPadding: false },
    statusSub: { fontSize: 15, color: '#8e8e93', marginTop: 8, fontWeight: '500', textAlign: 'center' },
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
    muteToast: { position: 'absolute', bottom: 150, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 30 },
    toastText: { fontSize: 14, color: '#fff', fontWeight: '500' },
    bottomBar: { position: 'absolute', bottom: 65, width: '100%', height: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 15 },
    endBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center' },
    micBtn: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    interruptRing: { position: 'absolute', top: -8, left: -8, borderColor: '#ff3b30', backgroundColor: 'transparent' },
    micIconWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    barsWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    visBar: { position: 'absolute', width: 10, backgroundColor: '#fff', borderRadius: 5 },
    cartBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
    badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#111', borderRadius: 11, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderWidth: 2, borderColor: '#f5f5f5' },
    badgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});

export default VoiceOverlay;
