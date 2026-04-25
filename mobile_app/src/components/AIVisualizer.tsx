import React, { useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withRepeat,
    withDelay,
    cancelAnimation,
    Easing,
    runOnJS,
} from 'react-native-reanimated';

interface Props {
    state: 'listen' | 'respond';
}

export interface AIVisualizerHandle {
    forceListen: () => void;
}

// Reference Figma values (Frame 3: bar width 61, gap 3, x targets [-96,-32,32,96]).
// SCALE keeps the orb sized for the mobile screen — adjust a single constant
// if the orb needs to be bigger/smaller; everything scales together.
const SCALE = 0.7;
const BAR_WIDTH = Math.round(61 * SCALE);
const BAR_BASE_HEIGHTS = [95, 138, 138, 95].map(h => Math.round(h * SCALE));
const X_TARGETS = [-96, -32, 32, 96].map(x => Math.round(x * SCALE));
const CIRCLE_SIZE = Math.round(140 * SCALE);
const PILL_W = Math.round(170 * SCALE);
const PILL_H = Math.round(80 * SCALE);
const PILL_R = Math.round(40 * SCALE);
const TALL_BAR_H = Math.round(138 * SCALE);
const CONTAINER_W = Math.round(300 * SCALE);
const CONTAINER_H = Math.round(160 * SCALE);

// GSAP-equivalent easings
const expoIn = Easing.bezier(0.95, 0.05, 0.795, 0.035);
const expoInOut = Easing.bezier(0.87, 0, 0.13, 1);
const backOut15 = Easing.bezier(0.34, 1.5, 0.64, 1);
const backOut18 = Easing.bezier(0.34, 1.8, 0.64, 1);
const power2Out = Easing.out(Easing.quad);
const power4Out = Easing.bezier(0.165, 0.84, 0.44, 1);
const sineInOut = Easing.bezier(0.45, 0.05, 0.55, 0.95);

const AIVisualizer = forwardRef<AIVisualizerHandle, Props>(({ state }, ref) => {
    // Circle / blob shared values
    const cOpacity = useSharedValue(1);
    const cW = useSharedValue(CIRCLE_SIZE);
    const cH = useSharedValue(CIRCLE_SIZE);
    const cR = useSharedValue(CIRCLE_SIZE / 2);
    const cScale = useSharedValue(1);

    // Sonar ripples
    const r0Scale = useSharedValue(1);
    const r0Opacity = useSharedValue(0);
    const r1Scale = useSharedValue(1);
    const r1Opacity = useSharedValue(0);

    // Four bars
    const b0X = useSharedValue(0); const b0H = useSharedValue(0); const b0O = useSharedValue(0);
    const b1X = useSharedValue(0); const b1H = useSharedValue(0); const b1O = useSharedValue(0);
    const b2X = useSharedValue(0); const b2H = useSharedValue(0); const b2O = useSharedValue(0);
    const b3X = useSharedValue(0); const b3H = useSharedValue(0); const b3O = useSharedValue(0);
    const bX = [b0X, b1X, b2X, b3X];
    const bH = [b0H, b1H, b2H, b3H];
    const bO = [b0O, b1O, b2O, b3O];

    // JS-side liveness flags + timer refs for the procedural eq / ripples / jitter
    const eqActiveRef = useRef(false);
    const eqTimersRef = useRef<Array<ReturnType<typeof setTimeout> | null>>([null, null, null, null]);
    const ripplesActiveRef = useRef(false);
    const r1TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const jitterActiveRef = useRef(false);
    const jitterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Animated styles
    const circleStyle = useAnimatedStyle(() => ({
        width: cW.value,
        height: cH.value,
        borderRadius: cR.value,
        opacity: cOpacity.value,
        transform: [{ scale: cScale.value }],
    }));
    const r0Style = useAnimatedStyle(() => ({
        opacity: r0Opacity.value,
        transform: [{ scale: r0Scale.value }],
    }));
    const r1Style = useAnimatedStyle(() => ({
        opacity: r1Opacity.value,
        transform: [{ scale: r1Scale.value }],
    }));
    const bar0Style = useAnimatedStyle(() => ({
        width: BAR_WIDTH, height: b0H.value, borderRadius: BAR_WIDTH / 2,
        opacity: b0O.value, transform: [{ translateX: b0X.value }],
    }));
    const bar1Style = useAnimatedStyle(() => ({
        width: BAR_WIDTH, height: b1H.value, borderRadius: BAR_WIDTH / 2,
        opacity: b1O.value, transform: [{ translateX: b1X.value }],
    }));
    const bar2Style = useAnimatedStyle(() => ({
        width: BAR_WIDTH, height: b2H.value, borderRadius: BAR_WIDTH / 2,
        opacity: b2O.value, transform: [{ translateX: b2X.value }],
    }));
    const bar3Style = useAnimatedStyle(() => ({
        width: BAR_WIDTH, height: b3H.value, borderRadius: BAR_WIDTH / 2,
        opacity: b3O.value, transform: [{ translateX: b3X.value }],
    }));

    // ── Procedural equalizer ──
    // Each bar independently animates to a random height with a random duration,
    // then schedules its next leg from the JS side. This mirrors the reference
    // GSAP `animateBar` pattern: a self-restarting random walk.
    const animateBar = (i: number) => {
        if (!eqActiveRef.current) return;
        const maxH = BAR_BASE_HEIGHTS[i];
        const minH = maxH * 0.25;
        const targetH = minH + Math.random() * (maxH * 1.1 - minH);
        const durationMs = 120 + Math.random() * 180;
        bH[i].value = withTiming(targetH, { duration: durationMs, easing: sineInOut });
        eqTimersRef.current[i] = setTimeout(() => animateBar(i), durationMs);
    };

    const startEqualizer = () => {
        eqActiveRef.current = true;
        for (let i = 0; i < 4; i++) animateBar(i);
    };

    const stopEqualizer = () => {
        eqActiveRef.current = false;
        for (let i = 0; i < 4; i++) {
            const t = eqTimersRef.current[i];
            if (t) {
                clearTimeout(t);
                eqTimersRef.current[i] = null;
            }
        }
    };

    // ── Listening feedback (sonar ripples + circle jitter) ──
    const startListeningFeedback = () => {
        ripplesActiveRef.current = true;

        cancelAnimation(r0Scale); cancelAnimation(r0Opacity);
        r0Scale.value = 1; r0Opacity.value = 0.2;
        r0Scale.value = withRepeat(withTiming(2.2, { duration: 2000, easing: power2Out }), -1, false);
        r0Opacity.value = withRepeat(withTiming(0, { duration: 2000, easing: power2Out }), -1, false);

        if (r1TimerRef.current) clearTimeout(r1TimerRef.current);
        r1TimerRef.current = setTimeout(() => {
            r1TimerRef.current = null;
            if (!ripplesActiveRef.current) return;
            cancelAnimation(r1Scale); cancelAnimation(r1Opacity);
            r1Scale.value = 1; r1Opacity.value = 0.2;
            r1Scale.value = withRepeat(withTiming(2.2, { duration: 2000, easing: power2Out }), -1, false);
            r1Opacity.value = withRepeat(withTiming(0, { duration: 2000, easing: power2Out }), -1, false);
        }, 1000);

        jitterActiveRef.current = true;
        const tickJitter = () => {
            if (!jitterActiveRef.current) return;
            const target = 1 + Math.random() * 0.12;
            const dur = 100 + Math.random() * 100;
            cScale.value = withTiming(target, { duration: dur, easing: sineInOut });
            jitterTimerRef.current = setTimeout(tickJitter, dur);
        };
        tickJitter();
    };

    const stopListeningFeedback = () => {
        ripplesActiveRef.current = false;
        jitterActiveRef.current = false;
        if (r1TimerRef.current) { clearTimeout(r1TimerRef.current); r1TimerRef.current = null; }
        if (jitterTimerRef.current) { clearTimeout(jitterTimerRef.current); jitterTimerRef.current = null; }
        cancelAnimation(r0Scale); cancelAnimation(r0Opacity);
        cancelAnimation(r1Scale); cancelAnimation(r1Opacity);
        r0Opacity.value = withTiming(0, { duration: 200 });
        r1Opacity.value = withTiming(0, { duration: 200 });
    };

    // ── Imperative API: snap to listening orb ──
    useImperativeHandle(ref, () => ({
        forceListen: () => {
            stopEqualizer();
            stopListeningFeedback();
            cancelAnimation(cW); cancelAnimation(cH); cancelAnimation(cR);
            cancelAnimation(cOpacity); cancelAnimation(cScale);
            for (let i = 0; i < 4; i++) {
                cancelAnimation(bX[i]); cancelAnimation(bH[i]); cancelAnimation(bO[i]);
                bX[i].value = 0; bH[i].value = 0; bO[i].value = 0;
            }
            cOpacity.value = 1;
            cW.value = CIRCLE_SIZE; cH.value = CIRCLE_SIZE; cR.value = CIRCLE_SIZE / 2;
            cScale.value = 1;
            startListeningFeedback();
        },
    }));

    // ── State transitions (timings match the GSAP reference exactly) ──
    useEffect(() => {
        if (state === 'listen') {
            stopEqualizer();
            const barsVisible = b0O.value > 0;

            if (barsVisible) {
                // Phase 1 — bars converge to center at uniform height (350ms).
                // GSAP "stagger from edges" approximation: outer bars (0,3) start
                // immediately, inner bars (1,2) start 40ms later (total spread 80ms).
                const collapseDur = 350;
                const innerDelay = 40;
                for (let i = 0; i < 4; i++) {
                    cancelAnimation(bX[i]); cancelAnimation(bH[i]);
                    const d = (i === 1 || i === 2) ? innerDelay : 0;
                    bX[i].value = withDelay(d, withTiming(0, { duration: collapseDur, easing: expoInOut }));
                    bH[i].value = withDelay(d, withTiming(TALL_BAR_H, { duration: collapseDur, easing: expoInOut }, (finished) => {
                        'worklet';
                        if (!finished || i !== 3) return;
                        // After last bar finishes, hand off to circle expansion
                        for (let j = 0; j < 4; j++) bO[j].value = 0;
                        cOpacity.value = 1;
                        cW.value = BAR_WIDTH;
                        cH.value = TALL_BAR_H;
                        cR.value = BAR_WIDTH / 2;
                        cScale.value = 1;
                        // Phase 2 — circle expands (500ms back.out(1.5))
                        cW.value = withTiming(CIRCLE_SIZE, { duration: 500, easing: backOut15 });
                        cH.value = withTiming(CIRCLE_SIZE, { duration: 500, easing: backOut15 });
                        cR.value = withTiming(CIRCLE_SIZE / 2, { duration: 500, easing: backOut15 }, (f) => {
                            'worklet';
                            if (f) runOnJS(startListeningFeedback)();
                        });
                    }));
                }
            } else {
                // Initial entry — fade circle in directly (400ms power4.out)
                cOpacity.value = 1; cScale.value = 1;
                cW.value = withTiming(CIRCLE_SIZE, { duration: 400, easing: power4Out });
                cH.value = withTiming(CIRCLE_SIZE, { duration: 400, easing: power4Out });
                cR.value = withTiming(CIRCLE_SIZE / 2, { duration: 400, easing: power4Out }, (f) => {
                    'worklet';
                    if (f) runOnJS(startListeningFeedback)();
                });
            }
        } else if (state === 'respond') {
            stopListeningFeedback();
            cancelAnimation(cW); cancelAnimation(cH); cancelAnimation(cR);
            cancelAnimation(cScale); cancelAnimation(cOpacity);

            // Phase 1 — circle squishes to pill (180ms expo.inOut)
            cW.value = withTiming(PILL_W, { duration: 180, easing: expoInOut });
            cH.value = withTiming(PILL_H, { duration: 180, easing: expoInOut });
            cScale.value = withTiming(1, { duration: 180, easing: expoInOut });
            cR.value = withTiming(PILL_R, { duration: 180, easing: expoInOut }, (p1) => {
                'worklet';
                if (!p1) return;
                // Phase 2 — pill crunches into single tall bar (150ms expo.in)
                cW.value = withTiming(BAR_WIDTH, { duration: 150, easing: expoIn });
                cH.value = withTiming(TALL_BAR_H, { duration: 150, easing: expoIn });
                cR.value = withTiming(BAR_WIDTH / 2, { duration: 150, easing: expoIn }, (p2) => {
                    'worklet';
                    if (!p2) return;
                    // Hand-off: hide circle, reveal stacked bars at center
                    cOpacity.value = 0;
                    b0O.value = 1; b0X.value = 0; b0H.value = TALL_BAR_H;
                    b1O.value = 1; b1X.value = 0; b1H.value = TALL_BAR_H;
                    b2O.value = 1; b2X.value = 0; b2H.value = TALL_BAR_H;
                    b3O.value = 1; b3X.value = 0; b3H.value = TALL_BAR_H;
                    // Phase 3 — fan out to figma positions/heights (450ms back.out(1.8), 30ms stagger)
                    b0X.value = withTiming(X_TARGETS[0], { duration: 450, easing: backOut18 });
                    b0H.value = withTiming(BAR_BASE_HEIGHTS[0], { duration: 450, easing: backOut18 });
                    b1X.value = withDelay(30, withTiming(X_TARGETS[1], { duration: 450, easing: backOut18 }));
                    b1H.value = withDelay(30, withTiming(BAR_BASE_HEIGHTS[1], { duration: 450, easing: backOut18 }));
                    b2X.value = withDelay(60, withTiming(X_TARGETS[2], { duration: 450, easing: backOut18 }));
                    b2H.value = withDelay(60, withTiming(BAR_BASE_HEIGHTS[2], { duration: 450, easing: backOut18 }));
                    b3X.value = withDelay(90, withTiming(X_TARGETS[3], { duration: 450, easing: backOut18 }));
                    b3H.value = withDelay(90, withTiming(BAR_BASE_HEIGHTS[3], { duration: 450, easing: backOut18 }, (p3) => {
                        'worklet';
                        if (p3) runOnJS(startEqualizer)();
                    }));
                });
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    return (
        <View style={styles.container} pointerEvents="none">
            <Animated.View style={[styles.ripple, r0Style]} />
            <Animated.View style={[styles.ripple, r1Style]} />
            <Animated.View style={[styles.circle, circleStyle]} />
            <Animated.View style={[styles.bar, bar0Style]} />
            <Animated.View style={[styles.bar, bar1Style]} />
            <Animated.View style={[styles.bar, bar2Style]} />
            <Animated.View style={[styles.bar, bar3Style]} />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        width: CONTAINER_W,
        height: CONTAINER_H,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ripple: {
        position: 'absolute',
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        borderRadius: CIRCLE_SIZE / 2,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    circle: {
        position: 'absolute',
        backgroundColor: '#000',
    },
    bar: {
        position: 'absolute',
        backgroundColor: '#000',
    },
});

export default AIVisualizer;
