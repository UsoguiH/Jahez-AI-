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
    SharedValue,
    useFrameCallback,
} from 'react-native-reanimated';

interface Props {
    state: 'listen' | 'respond';
    // Live amplitude (0..1) driven by the AI's speech, written from the audio
    // status callback in VoiceOverlay. Reading it inside a worklet (UI thread)
    // is what keeps the equalizer smoothly tracking speech without bridge hops.
    // If omitted, bars fall back to the procedural idle wave.
    amplitudeShared?: SharedValue<number>;
}

export interface AIVisualizerHandle {
    forceListen: () => void;
}

// --- Dimensions (unchanged from the original) ---
const SCALE = 0.7;
const BAR_WIDTH = Math.round(61 * SCALE);                                   // 43
const BAR_BASE_HEIGHTS = [95, 138, 138, 95].map(h => Math.round(h * SCALE)); // [67, 97, 97, 67]
const X_TARGETS = [-96, -32, 32, 96].map(x => Math.round(x * SCALE));        // [-67, -22, 22, 67]
const CIRCLE_SIZE = Math.round(140 * SCALE);                                 // 98
const PILL_W = Math.round(170 * SCALE);                                      // 119
const PILL_H = Math.round(80 * SCALE);                                       // 56
const PILL_R = Math.round(40 * SCALE);                                       // 28
const TALL_BAR_H = Math.round(138 * SCALE);                                  // 97
const CONTAINER_W = Math.round(300 * SCALE);                                 // 210
const CONTAINER_H = Math.round(160 * SCALE);                                 // 112

// --- Easings (unchanged GSAP approximations) ---
const easeExpoInOut = Easing.bezier(0.87, 0, 0.13, 1);
const easeExpoIn = Easing.bezier(0.95, 0.05, 0.795, 0.035);
const easeBackOut15 = Easing.bezier(0.34, 1.5, 0.64, 1);
const easeBackOut18 = Easing.bezier(0.34, 1.8, 0.64, 1);
const easeOutQuad = Easing.out(Easing.quad);

// --- Smoothing constants for the equalizer / jitter ---
const BAR_SMOOTHING = 0.15;
const JITTER_SMOOTHING = 0.12;

// Why this component runs on Reanimated rather than RN's Animated:
// every shape and bar update happens on the UI thread via worklets, so the
// animation doesn't compete with WebSocket parsing, base64 string concat,
// FileSystem.writeAsStringAsync, or Audio.Sound.createAsync — all of which
// burst on the JS thread the instant the AI starts speaking. The same exact
// visual (real width/height/borderRadius, no scaleY distortion of the pill
// ends) now stays a guaranteed 60 FPS through the listen↔respond handoff
// and through equalizer ticks during AI speech.
const AIVisualizer = forwardRef<AIVisualizerHandle, Props>(({ state, amplitudeShared }, ref) => {
    // --- Circle / blob shared values ---
    const circleW = useSharedValue(CIRCLE_SIZE);
    const circleH = useSharedValue(CIRCLE_SIZE);
    const circleR = useSharedValue(CIRCLE_SIZE / 2);
    const circleOpacity = useSharedValue(1);
    const circleScale = useSharedValue(1);

    // --- Ripples ---
    const r0Scale = useSharedValue(1);
    const r0Opacity = useSharedValue(0);
    const r1Scale = useSharedValue(1);
    const r1Opacity = useSharedValue(0);

    // --- Bars: height (layout), translateX (transform), opacity ---
    const b0H = useSharedValue(0);
    const b1H = useSharedValue(0);
    const b2H = useSharedValue(0);
    const b3H = useSharedValue(0);
    const b0X = useSharedValue(0);
    const b1X = useSharedValue(0);
    const b2X = useSharedValue(0);
    const b3X = useSharedValue(0);
    const b0O = useSharedValue(0);
    const b1O = useSharedValue(0);
    const b2O = useSharedValue(0);
    const b3O = useSharedValue(0);

    // --- Equalizer + jitter run-flags (worklet-readable) ---
    const eqActive = useSharedValue(false);
    const jitterActive = useSharedValue(false);

    // Per-bar smoothing scratch (lives on UI thread via shared values).
    const eqH0 = useSharedValue(0);
    const eqH1 = useSharedValue(0);
    const eqH2 = useSharedValue(0);
    const eqH3 = useSharedValue(0);
    const eqS0 = useSharedValue(0);
    const eqS1 = useSharedValue(0);
    const eqS2 = useSharedValue(0);
    const eqS3 = useSharedValue(0);

    const jitterTarget = useSharedValue(1);
    const jitterNextPick = useSharedValue(0);

    // JS-side liveness flag for the staggered second-ripple setTimeout.
    const ripplesActiveRef = useRef(false);
    const r1TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // --- useAnimatedStyle: each bound to its own shared values, all read on UI thread ---
    const circleStyle = useAnimatedStyle(() => ({
        width: circleW.value,
        height: circleH.value,
        borderRadius: circleR.value,
        opacity: circleOpacity.value,
        transform: [{ scale: circleScale.value }],
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
        width: BAR_WIDTH,
        height: b0H.value,
        borderRadius: BAR_WIDTH / 2,
        opacity: b0O.value,
        transform: [{ translateX: b0X.value }],
    }));
    const bar1Style = useAnimatedStyle(() => ({
        width: BAR_WIDTH,
        height: b1H.value,
        borderRadius: BAR_WIDTH / 2,
        opacity: b1O.value,
        transform: [{ translateX: b1X.value }],
    }));
    const bar2Style = useAnimatedStyle(() => ({
        width: BAR_WIDTH,
        height: b2H.value,
        borderRadius: BAR_WIDTH / 2,
        opacity: b2O.value,
        transform: [{ translateX: b2X.value }],
    }));
    const bar3Style = useAnimatedStyle(() => ({
        width: BAR_WIDTH,
        height: b3H.value,
        borderRadius: BAR_WIDTH / 2,
        opacity: b3O.value,
        transform: [{ translateX: b3X.value }],
    }));

    // --- Single UI-thread frame callback for equalizer + jitter ---
    // useFrameCallback fires on every screen vsync (60+ Hz on UI thread).
    // We branch internally on eqActive / jitterActive so the same callback
    // serves both states without re-mounting.
    useFrameCallback((info) => {
        'worklet';
        const t = info.timeSinceFirstFrame / 1000;
        const tMs = info.timeSinceFirstFrame;

        if (eqActive.value) {
            const amp = amplitudeShared
                ? Math.max(0, Math.min(1, amplitudeShared.value))
                : 0;

            // Bar 0
            {
                const maxH = BAR_BASE_HEIGHTS[0];
                const minH = maxH * 0.18;
                const wave =
                    0.26 * Math.sin(t * 2.1 + 0 * 1.3) +
                    0.18 * Math.sin(t * 3.7 + 0 * 0.8) +
                    0.10 * Math.sin(t * 5.2 + 0 * 2.1);
                if (Math.random() < 0.02) eqS0.value = 0.20 + Math.random() * 0.30;
                else eqS0.value *= 0.94;
                const idle = Math.max(0.22, Math.min(0.90, 0.45 + wave + eqS0.value));
                const eff = amplitudeShared ? Math.max(amp, idle) : idle;
                const target = minH + eff * (maxH - minH);
                eqH0.value += (target - eqH0.value) * BAR_SMOOTHING;
                b0H.value = eqH0.value;
            }
            // Bar 1
            {
                const maxH = BAR_BASE_HEIGHTS[1];
                const minH = maxH * 0.18;
                const wave =
                    0.26 * Math.sin(t * 2.1 + 1 * 1.3) +
                    0.18 * Math.sin(t * 3.7 + 1 * 0.8) +
                    0.10 * Math.sin(t * 5.2 + 1 * 2.1);
                if (Math.random() < 0.02) eqS1.value = 0.20 + Math.random() * 0.30;
                else eqS1.value *= 0.94;
                const idle = Math.max(0.22, Math.min(0.90, 0.45 + wave + eqS1.value));
                const eff = amplitudeShared ? Math.max(amp, idle) : idle;
                const target = minH + eff * (maxH - minH);
                eqH1.value += (target - eqH1.value) * BAR_SMOOTHING;
                b1H.value = eqH1.value;
            }
            // Bar 2
            {
                const maxH = BAR_BASE_HEIGHTS[2];
                const minH = maxH * 0.18;
                const wave =
                    0.26 * Math.sin(t * 2.1 + 2 * 1.3) +
                    0.18 * Math.sin(t * 3.7 + 2 * 0.8) +
                    0.10 * Math.sin(t * 5.2 + 2 * 2.1);
                if (Math.random() < 0.02) eqS2.value = 0.20 + Math.random() * 0.30;
                else eqS2.value *= 0.94;
                const idle = Math.max(0.22, Math.min(0.90, 0.45 + wave + eqS2.value));
                const eff = amplitudeShared ? Math.max(amp, idle) : idle;
                const target = minH + eff * (maxH - minH);
                eqH2.value += (target - eqH2.value) * BAR_SMOOTHING;
                b2H.value = eqH2.value;
            }
            // Bar 3
            {
                const maxH = BAR_BASE_HEIGHTS[3];
                const minH = maxH * 0.18;
                const wave =
                    0.26 * Math.sin(t * 2.1 + 3 * 1.3) +
                    0.18 * Math.sin(t * 3.7 + 3 * 0.8) +
                    0.10 * Math.sin(t * 5.2 + 3 * 2.1);
                if (Math.random() < 0.02) eqS3.value = 0.20 + Math.random() * 0.30;
                else eqS3.value *= 0.94;
                const idle = Math.max(0.22, Math.min(0.90, 0.45 + wave + eqS3.value));
                const eff = amplitudeShared ? Math.max(amp, idle) : idle;
                const target = minH + eff * (maxH - minH);
                eqH3.value += (target - eqH3.value) * BAR_SMOOTHING;
                b3H.value = eqH3.value;
            }
        }

        if (jitterActive.value) {
            if (tMs >= jitterNextPick.value) {
                jitterTarget.value = 1 + Math.random() * 0.12;
                jitterNextPick.value = tMs + 100 + Math.random() * 100;
            }
            circleScale.value += (jitterTarget.value - circleScale.value) * JITTER_SMOOTHING;
        }
    });

    const startListeningFeedback = () => {
        ripplesActiveRef.current = true;

        // First ripple — immediate, infinite repeat.
        cancelAnimation(r0Scale);
        cancelAnimation(r0Opacity);
        r0Scale.value = 1;
        r0Opacity.value = 0.2;
        r0Scale.value = withRepeat(
            withTiming(2.2, { duration: 2000, easing: easeOutQuad }),
            -1,
            false,
        );
        r0Opacity.value = withRepeat(
            withTiming(0, { duration: 2000, easing: easeOutQuad }),
            -1,
            false,
        );

        // Second ripple — staggered by 1s. Use a JS timer so we can cancel cleanly
        // when the state flips back to 'respond' before the stagger fires.
        if (r1TimerRef.current) clearTimeout(r1TimerRef.current);
        r1TimerRef.current = setTimeout(() => {
            r1TimerRef.current = null;
            if (!ripplesActiveRef.current) return;
            cancelAnimation(r1Scale);
            cancelAnimation(r1Opacity);
            r1Scale.value = 1;
            r1Opacity.value = 0.2;
            r1Scale.value = withRepeat(
                withTiming(2.2, { duration: 2000, easing: easeOutQuad }),
                -1,
                false,
            );
            r1Opacity.value = withRepeat(
                withTiming(0, { duration: 2000, easing: easeOutQuad }),
                -1,
                false,
            );
        }, 1000);

        // Jitter on the listening-orb scale.
        jitterActive.value = true;
        jitterTarget.value = 1;
        jitterNextPick.value = 0;
    };

    const stopListeningFeedback = () => {
        ripplesActiveRef.current = false;
        if (r1TimerRef.current) {
            clearTimeout(r1TimerRef.current);
            r1TimerRef.current = null;
        }
        jitterActive.value = false;
        cancelAnimation(r0Scale);
        cancelAnimation(r0Opacity);
        cancelAnimation(r1Scale);
        cancelAnimation(r1Opacity);
        // Quick fade-out so the ripples don't pop off mid-cycle.
        r0Opacity.value = withTiming(0, { duration: 200 });
        r1Opacity.value = withTiming(0, { duration: 200 });
    };

    const startEqualizer = () => {
        // Seed UI-thread scratch from current bar heights so the first frame
        // doesn't snap. Done from JS — sharedValue assignments are sync.
        eqH0.value = b0H.value;
        eqH1.value = b1H.value;
        eqH2.value = b2H.value;
        eqH3.value = b3H.value;
        eqS0.value = 0;
        eqS1.value = 0;
        eqS2.value = 0;
        eqS3.value = 0;
        eqActive.value = true;
    };

    const stopEqualizer = () => {
        eqActive.value = false;
    };

    // Imperative API — instantly snap to the listening orb.
    useImperativeHandle(ref, () => ({
        forceListen: () => {
            stopEqualizer();
            stopListeningFeedback();

            cancelAnimation(circleW);
            cancelAnimation(circleH);
            cancelAnimation(circleR);
            cancelAnimation(circleOpacity);
            cancelAnimation(circleScale);
            cancelAnimation(b0H); cancelAnimation(b1H); cancelAnimation(b2H); cancelAnimation(b3H);
            cancelAnimation(b0X); cancelAnimation(b1X); cancelAnimation(b2X); cancelAnimation(b3X);
            cancelAnimation(b0O); cancelAnimation(b1O); cancelAnimation(b2O); cancelAnimation(b3O);

            b0O.value = 0; b1O.value = 0; b2O.value = 0; b3O.value = 0;
            b0X.value = 0; b1X.value = 0; b2X.value = 0; b3X.value = 0;
            b0H.value = 0; b1H.value = 0; b2H.value = 0; b3H.value = 0;
            circleOpacity.value = 1;
            circleW.value = CIRCLE_SIZE;
            circleH.value = CIRCLE_SIZE;
            circleR.value = CIRCLE_SIZE / 2;
            circleScale.value = 1;

            startListeningFeedback();
        },
    }));

    // --- State transitions (chained via withTiming callbacks on the UI thread) ---
    useEffect(() => {
        if (state === 'listen') {
            stopEqualizer();

            const barsVisible = b0O.value > 0;

            if (barsVisible) {
                // Bars collapse back to a single tall bar in the center.
                const collapseEasing = easeExpoInOut;
                cancelAnimation(b0X); cancelAnimation(b1X); cancelAnimation(b2X); cancelAnimation(b3X);
                cancelAnimation(b0H); cancelAnimation(b1H); cancelAnimation(b2H); cancelAnimation(b3H);

                b0X.value = withTiming(0, { duration: 350, easing: collapseEasing });
                b1X.value = withTiming(0, { duration: 350, easing: collapseEasing });
                b2X.value = withTiming(0, { duration: 350, easing: collapseEasing });
                b3X.value = withTiming(0, { duration: 350, easing: collapseEasing });
                b0H.value = withTiming(TALL_BAR_H, { duration: 350, easing: collapseEasing });
                b1H.value = withTiming(TALL_BAR_H, { duration: 350, easing: collapseEasing });
                b2H.value = withTiming(TALL_BAR_H, { duration: 350, easing: collapseEasing });
                b3H.value = withTiming(TALL_BAR_H, { duration: 350, easing: collapseEasing }, (finished) => {
                    'worklet';
                    if (!finished) return;

                    // Hand off: bars hide, circle re-appears at single-bar shape, then expands.
                    b0O.value = 0; b1O.value = 0; b2O.value = 0; b3O.value = 0;
                    circleOpacity.value = 1;
                    circleW.value = BAR_WIDTH;
                    circleH.value = TALL_BAR_H;
                    circleR.value = BAR_WIDTH / 2;
                    circleScale.value = 1;

                    circleW.value = withTiming(CIRCLE_SIZE, { duration: 500, easing: easeBackOut15 });
                    circleH.value = withTiming(CIRCLE_SIZE, { duration: 500, easing: easeBackOut15 });
                    circleR.value = withTiming(CIRCLE_SIZE / 2, { duration: 500, easing: easeBackOut15 }, (f) => {
                        'worklet';
                        if (f) runOnJS(startListeningFeedback)();
                    });
                });
            } else {
                circleOpacity.value = 1;
                circleW.value = CIRCLE_SIZE;
                circleH.value = CIRCLE_SIZE;
                circleR.value = CIRCLE_SIZE / 2;
                circleScale.value = 1;
                startListeningFeedback();
            }
        } else if (state === 'respond') {
            stopListeningFeedback();

            // Phase 1: squish to pill (180 ms).
            cancelAnimation(circleW); cancelAnimation(circleH); cancelAnimation(circleR);
            cancelAnimation(circleScale); cancelAnimation(circleOpacity);

            circleW.value = withTiming(PILL_W, { duration: 180, easing: easeExpoInOut });
            circleH.value = withTiming(PILL_H, { duration: 180, easing: easeExpoInOut });
            circleScale.value = withTiming(1, { duration: 180, easing: easeExpoInOut });
            circleR.value = withTiming(PILL_R, { duration: 180, easing: easeExpoInOut }, (p1Done) => {
                'worklet';
                if (!p1Done) return;

                // Phase 2: crunch pill into one tall bar (150 ms).
                circleW.value = withTiming(BAR_WIDTH, { duration: 150, easing: easeExpoIn });
                circleH.value = withTiming(TALL_BAR_H, { duration: 150, easing: easeExpoIn });
                circleR.value = withTiming(BAR_WIDTH / 2, { duration: 150, easing: easeExpoIn }, (p2Done) => {
                    'worklet';
                    if (!p2Done) return;

                    // Hand-off: hide circle, reveal four bars stacked on the center
                    // at TALL_BAR_H so the layout is settled before the fan-out
                    // animation begins. Setting opacity and height in the same
                    // worklet tick keeps the orb from disappearing for a frame.
                    circleOpacity.value = 0;
                    b0O.value = 1; b0X.value = 0; b0H.value = TALL_BAR_H;
                    b1O.value = 1; b1X.value = 0; b1H.value = TALL_BAR_H;
                    b2O.value = 1; b2X.value = 0; b2H.value = TALL_BAR_H;
                    b3O.value = 1; b3X.value = 0; b3H.value = TALL_BAR_H;

                    // Phase 3: fan out (450 ms, 30 ms stagger per bar).
                    b0X.value = withTiming(X_TARGETS[0], { duration: 450, easing: easeBackOut18 });
                    b0H.value = withTiming(BAR_BASE_HEIGHTS[0], { duration: 450, easing: easeBackOut18 });
                    b1X.value = withDelay(30, withTiming(X_TARGETS[1], { duration: 450, easing: easeBackOut18 }));
                    b1H.value = withDelay(30, withTiming(BAR_BASE_HEIGHTS[1], { duration: 450, easing: easeBackOut18 }));
                    b2X.value = withDelay(60, withTiming(X_TARGETS[2], { duration: 450, easing: easeBackOut18 }));
                    b2H.value = withDelay(60, withTiming(BAR_BASE_HEIGHTS[2], { duration: 450, easing: easeBackOut18 }));
                    b3X.value = withDelay(90, withTiming(X_TARGETS[3], { duration: 450, easing: easeBackOut18 }));
                    b3H.value = withDelay(
                        90,
                        withTiming(BAR_BASE_HEIGHTS[3], { duration: 450, easing: easeBackOut18 }, (p3Done) => {
                            'worklet';
                            if (p3Done) runOnJS(startEqualizer)();
                        }),
                    );
                });
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    return (
        <View style={styles.container} pointerEvents="none">
            {/* Sonar ripples */}
            <Animated.View style={[styles.ripple, r0Style]} />
            <Animated.View style={[styles.ripple, r1Style]} />

            {/* Circle / blob — width/height/borderRadius animated as real layout
                (UI thread) so the pill ends stay perfectly round at every step. */}
            <Animated.View style={[styles.circle, circleStyle]} />

            {/* Four bars — same story: real height + borderRadius preserve the
                pill geometry, while translateX/opacity carry the fan-out. */}
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
