import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

interface Props {
    state: 'listen' | 'respond';
    // Live amplitude (0..1) driven by the AI's speech. If omitted, bars fall back to random equalizer.
    amplitudeRef?: React.MutableRefObject<number>;
}

// Imperative API exposed via ref. `forceListen()` snaps the visualizer to the
// listening orb state instantly (no transition), used for user-triggered interrupts.
export interface AIVisualizerHandle {
    forceListen: () => void;
}

// --- Dimensions ---
// Scaled down from Figma source (original circle 140) to a smaller, tighter orb.
// Proportions between circle, bars, and spacing are preserved exactly.
const SCALE = 0.7;

const BAR_WIDTH = Math.round(61 * SCALE);                                                // 43
const BAR_BASE_HEIGHTS = [95, 138, 138, 95].map(h => Math.round(h * SCALE));              // [67, 97, 97, 67]
const X_TARGETS = [-96, -32, 32, 96].map(x => Math.round(x * SCALE));                     // [-67, -22, 22, 67]
const CIRCLE_SIZE = Math.round(140 * SCALE);                                              // 98
const PILL_W = Math.round(170 * SCALE);                                                   // 119
const PILL_H = Math.round(80 * SCALE);                                                    // 56
const PILL_R = Math.round(40 * SCALE);                                                    // 28
const TALL_BAR_H = Math.round(138 * SCALE);                                               // 97
const CONTAINER_W = Math.round(300 * SCALE);                                              // 210
const CONTAINER_H = Math.round(160 * SCALE);                                              // 112

// GSAP easing approximations
const easeExpoInOut = Easing.bezier(0.87, 0, 0.13, 1);
const easeExpoIn = Easing.bezier(0.95, 0.05, 0.795, 0.035);
const easeBackOut15 = Easing.bezier(0.34, 1.5, 0.64, 1);
const easeBackOut18 = Easing.bezier(0.34, 1.8, 0.64, 1);

// 60 FPS RAF loop for equalizer / jitter.
const FRAME_INTERVAL = 16;
// Exponential smoothing factor (0..1). Higher = snappier response; lower = softer.
// Halved vs 30 FPS so the effective time-constant stays ~150ms (matches the old
// sine-in/out tween feel) — otherwise bars would snap too fast at 60 FPS.
const BAR_SMOOTHING = 0.15;
const JITTER_SMOOTHING = 0.12;

const AIVisualizer = forwardRef<AIVisualizerHandle, Props>(({ state, amplitudeRef }, ref) => {
    // --- Circle / blob ---
    // Split-driver: the OUTER wrapper owns transform (scale) + opacity and runs
    // on the native (UI-thread) driver, so the listening-state jitter and the
    // fade on entry/exit stay at 60 fps even when the JS thread is busy with
    // WebSocket / audio pipeline work. The INNER view owns the width/height/
    // borderRadius shape morph — those are layout props that can't run native,
    // but the pill→tall-bar→circle keyframes need the EXACT dimensions
    // (scaleY would flatten the pill ends), so this pair stays JS-driven.
    const circleW = useRef(new Animated.Value(CIRCLE_SIZE)).current;
    const circleH = useRef(new Animated.Value(CIRCLE_SIZE)).current;
    const circleR = useRef(new Animated.Value(CIRCLE_SIZE / 2)).current;
    const circleOpacity = useRef(new Animated.Value(1)).current;   // on outer view, native
    const circleScale = useRef(new Animated.Value(1)).current;     // on outer view, native

    // --- Ripples --- (native driver — their view has no JS-animated layout props)
    const r0Scale = useRef(new Animated.Value(1)).current;
    const r0Opacity = useRef(new Animated.Value(0)).current;
    const r1Scale = useRef(new Animated.Value(1)).current;
    const r1Opacity = useRef(new Animated.Value(0)).current;

    // --- Bars ---
    // Same split trick: outer wrapper carries translateX + opacity (native),
    // inner carries height (JS, preserves pill-end borderRadius geometry).
    // The fan-out motion (translateX) runs on the UI thread so it never
    // stutters during the first audio chunks; the per-bar height still updates
    // on JS at 60 Hz during the equalizer, but that's 4 setValue calls per
    // frame — cheap enough to survive JS-thread bursts.
    const b0H = useRef(new Animated.Value(0)).current;
    const b1H = useRef(new Animated.Value(0)).current;
    const b2H = useRef(new Animated.Value(0)).current;
    const b3H = useRef(new Animated.Value(0)).current;
    const b0X = useRef(new Animated.Value(0)).current;
    const b0O = useRef(new Animated.Value(0)).current;
    const b1X = useRef(new Animated.Value(0)).current;
    const b1O = useRef(new Animated.Value(0)).current;
    const b2X = useRef(new Animated.Value(0)).current;
    const b2O = useRef(new Animated.Value(0)).current;
    const b3X = useRef(new Animated.Value(0)).current;
    const b3O = useRef(new Animated.Value(0)).current;

    const bars = [
        { h: b0H, x: b0X, o: b0O },
        { h: b1H, x: b1X, o: b1O },
        { h: b2H, x: b2X, o: b2O },
        { h: b3H, x: b3X, o: b3O },
    ];

    const mounted = useRef(true);
    const equalizerActive = useRef(false);
    const jitterActive = useRef(false);
    const ripplesActive = useRef(false);

    // RAF handles + frame timestamps (one-loop-for-all-bars eliminates drift).
    const eqRafId = useRef<number | null>(null);
    const eqLastFrame = useRef(0);
    const jitterRafId = useRef<number | null>(null);
    const jitterLastFrame = useRef(0);

    // Current smoothed state (JS-side scratch; never triggers React renders).
    const currentHeights = useRef<number[]>([0, 0, 0, 0]);
    // Per-bar decaying spike value — stable over frames instead of re-rolled each frame,
    // so the "syllable-like" transient doesn't flicker at 30 FPS.
    const spikeValues = useRef<number[]>([0, 0, 0, 0]);
    const currentJitter = useRef(1);
    const jitterTarget = useRef(1);
    const jitterNextPick = useRef(0);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            equalizerActive.current = false;
            jitterActive.current = false;
            ripplesActive.current = false;
            if (eqRafId.current != null) cancelAnimationFrame(eqRafId.current);
            if (jitterRafId.current != null) cancelAnimationFrame(jitterRafId.current);
        };
    }, []);

    // --- Audio-reactive bar loop (single RAF, updates all 4 bars per tick) ---
    // When an amplitudeRef is supplied, each bar's target height is derived from
    // amplitudeRef.current. During silences, a compound sine wave + decaying spikes
    // keep the equalizer looking alive.
    const tickEqualizer = () => {
        if (!mounted.current || !equalizerActive.current) return;

        const now = Date.now();
        if (now - eqLastFrame.current < FRAME_INTERVAL) {
            eqRafId.current = requestAnimationFrame(tickEqualizer);
            return;
        }
        eqLastFrame.current = now;

        const amp = amplitudeRef
            ? Math.max(0, Math.min(1, amplitudeRef.current ?? 0))
            : 0;
        const t = now / 1000;

        for (let i = 0; i < 4; i++) {
            const maxH = BAR_BASE_HEIGHTS[i];
            const minH = maxH * 0.18;

            // Layered sine waves at different frequencies + per-bar phase → organic ripple
            const wave =
                0.26 * Math.sin(t * 2.1 + i * 1.3) +
                0.18 * Math.sin(t * 3.7 + i * 0.8) +
                0.10 * Math.sin(t * 5.2 + i * 2.1);

            // Decaying spike: at 60 FPS, ~2% chance per frame matches the original
            // ~12% per 150ms trigger rate. Decay per frame halved accordingly so the
            // spike envelope lasts the same real time.
            if (Math.random() < 0.02) {
                spikeValues.current[i] = 0.20 + Math.random() * 0.30;
            } else {
                spikeValues.current[i] *= 0.94;
            }

            const idle = Math.max(0.22, Math.min(0.90, 0.45 + wave + spikeValues.current[i]));
            // Real amplitude dominates when speaking; idle shows through in pauses.
            const effectiveAmp = amplitudeRef ? Math.max(amp, idle) : idle;

            const targetHeight = minH + effectiveAmp * (maxH - minH);

            // Exponential smoothing — same visual softness as the old sine.inOut tweens
            // without allocating an Animated.timing instance per cycle.
            const prev = currentHeights.current[i];
            const next = prev + (targetHeight - prev) * BAR_SMOOTHING;
            currentHeights.current[i] = next;
            // Skip sub-pixel updates so the JS-bridge setValue traffic during
            // equalizer doesn't starve the WS/audio callbacks at 60 Hz × 4 bars.
            if (Math.abs(next - prev) >= 0.5) {
                bars[i].h.setValue(next);
            }
        }

        eqRafId.current = requestAnimationFrame(tickEqualizer);
    };

    const startEqualizer = () => {
        equalizerActive.current = true;
        // Seed current heights from the Animated.Value so the first frame doesn't snap.
        for (let i = 0; i < 4; i++) {
            currentHeights.current[i] = (bars[i].h as any)._value ?? 0;
            spikeValues.current[i] = 0;
        }
        eqLastFrame.current = 0;
        if (eqRafId.current != null) cancelAnimationFrame(eqRafId.current);
        eqRafId.current = requestAnimationFrame(tickEqualizer);
    };

    const stopEqualizer = () => {
        equalizerActive.current = false;
        if (eqRafId.current != null) {
            cancelAnimationFrame(eqRafId.current);
            eqRafId.current = null;
        }
    };

    // --- Listening state: sonar ripples + jitter ---
    const runRipple = (scale: Animated.Value, opacity: Animated.Value) => {
        if (!mounted.current || !ripplesActive.current) return;
        scale.setValue(1);
        opacity.setValue(0.2);
        Animated.parallel([
            Animated.timing(scale, { toValue: 2.2, duration: 2000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 2000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start(() => {
            if (ripplesActive.current) runRipple(scale, opacity);
        });
    };

    // Jitter driven by a single RAF loop. Repicks a random target every ~100–200ms
    // and exponentially smooths toward it. circleScale is on the native driver now,
    // so setValue still works (it's driver-agnostic) and the breathing motion runs
    // on the UI thread regardless of JS load.
    const tickJitter = () => {
        if (!mounted.current || !jitterActive.current) return;
        const now = Date.now();
        if (now - jitterLastFrame.current < FRAME_INTERVAL) {
            jitterRafId.current = requestAnimationFrame(tickJitter);
            return;
        }
        jitterLastFrame.current = now;

        if (now >= jitterNextPick.current) {
            jitterTarget.current = 1 + Math.random() * 0.12;
            jitterNextPick.current = now + 100 + Math.random() * 100;
        }
        const prev = currentJitter.current;
        const next = prev + (jitterTarget.current - prev) * JITTER_SMOOTHING;
        currentJitter.current = next;
        if (Math.abs(next - prev) >= 0.001) {
            circleScale.setValue(next);
        }

        jitterRafId.current = requestAnimationFrame(tickJitter);
    };

    const startListeningFeedback = () => {
        ripplesActive.current = true;
        runRipple(r0Scale, r0Opacity);
        setTimeout(() => {
            if (ripplesActive.current) runRipple(r1Scale, r1Opacity);
        }, 1000);

        jitterActive.current = true;
        currentJitter.current = (circleScale as any)._value ?? 1;
        jitterTarget.current = 1;
        jitterNextPick.current = 0;
        jitterLastFrame.current = 0;
        if (jitterRafId.current != null) cancelAnimationFrame(jitterRafId.current);
        jitterRafId.current = requestAnimationFrame(tickJitter);
    };

    const stopListeningFeedback = () => {
        jitterActive.current = false;
        ripplesActive.current = false;
        if (jitterRafId.current != null) {
            cancelAnimationFrame(jitterRafId.current);
            jitterRafId.current = null;
        }
        r0Scale.stopAnimation();
        r0Opacity.stopAnimation();
        r1Scale.stopAnimation();
        r1Opacity.stopAnimation();
        Animated.parallel([
            Animated.timing(r0Opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(r1Opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start();
    };

    // --- Imperative API: snap straight to the listening orb (no transition) ---
    // Used for user-triggered interrupts where the respond→listen animation must
    // feel instant. Cancels any in-flight tweens, clears bars, restores the orb.
    useImperativeHandle(ref, () => ({
        forceListen: () => {
            // Kill the equalizer RAF so bars stop updating.
            stopEqualizer();

            // Cancel any in-flight transition tweens on circle & bar values.
            circleW.stopAnimation();
            circleH.stopAnimation();
            circleR.stopAnimation();
            circleOpacity.stopAnimation();
            circleScale.stopAnimation();
            bars.forEach(bar => {
                bar.h.stopAnimation();
                bar.x.stopAnimation();
                bar.o.stopAnimation();
            });

            // Snap all values to the listening-orb configuration.
            bars.forEach(bar => {
                bar.o.setValue(0);
                bar.x.setValue(0);
                bar.h.setValue(0);
            });
            circleOpacity.setValue(1);
            circleW.setValue(CIRCLE_SIZE);
            circleH.setValue(CIRCLE_SIZE);
            circleR.setValue(CIRCLE_SIZE / 2);
            circleScale.setValue(1);

            // Start listening feedback (ripples + jitter) immediately. If the
            // parent also flips state to 'listen', the useEffect sees b0O._value===0
            // and goes through the cheap else-branch, which also calls
            // startListeningFeedback — that's a no-op idempotent restart.
            stopListeningFeedback();
            startListeningFeedback();
        },
    }));

    // --- State transitions (one-shot animations, not hot paths) ---
    // Each phase splits into two Animated.parallel groups by driver:
    // one for the native-driver outer wrapper props (scale, opacity, translateX),
    // one for the JS-driver inner view props (width, height, borderRadius).
    // The `.start(cb)` that sequences phases hangs off the JS group so the
    // shape morph (which is the slower, layout-bound half) controls timing.
    useEffect(() => {
        if (state === 'listen') {
            stopEqualizer();

            const barsVisible = (b0O as any)._value > 0;

            if (barsVisible) {
                // Bars collapse: translateX + opacity on native, height on JS.
                Animated.parallel(
                    bars.map(bar => Animated.timing(bar.x, { toValue: 0, duration: 350, easing: easeExpoInOut, useNativeDriver: true }))
                ).start();
                Animated.parallel(
                    bars.map(bar => Animated.timing(bar.h, { toValue: TALL_BAR_H, duration: 350, easing: easeExpoInOut, useNativeDriver: false }))
                ).start(() => {
                    bars.forEach(bar => bar.o.setValue(0));
                    circleOpacity.setValue(1);
                    circleW.setValue(BAR_WIDTH);
                    circleH.setValue(TALL_BAR_H);
                    circleR.setValue(BAR_WIDTH / 2);
                    circleScale.setValue(1);
                    // Re-expand circle: layout on JS (shape morph must be exact).
                    Animated.parallel([
                        Animated.timing(circleW, { toValue: CIRCLE_SIZE, duration: 500, easing: easeBackOut15, useNativeDriver: false }),
                        Animated.timing(circleH, { toValue: CIRCLE_SIZE, duration: 500, easing: easeBackOut15, useNativeDriver: false }),
                        Animated.timing(circleR, { toValue: CIRCLE_SIZE / 2, duration: 500, easing: easeBackOut15, useNativeDriver: false }),
                    ]).start(() => {
                        startListeningFeedback();
                    });
                });
            } else {
                circleOpacity.setValue(1);
                circleW.setValue(CIRCLE_SIZE);
                circleH.setValue(CIRCLE_SIZE);
                circleR.setValue(CIRCLE_SIZE / 2);
                circleScale.setValue(1);
                startListeningFeedback();
            }
        } else if (state === 'respond') {
            stopListeningFeedback();

            Animated.parallel([
                Animated.timing(r0Opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(r1Opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]).start();

            // Phase 1: squish to pill — circleScale (native) + layout (JS) split.
            Animated.timing(circleScale, { toValue: 1, duration: 180, easing: easeExpoInOut, useNativeDriver: true }).start();
            Animated.parallel([
                Animated.timing(circleW, { toValue: PILL_W, duration: 180, easing: easeExpoInOut, useNativeDriver: false }),
                Animated.timing(circleH, { toValue: PILL_H, duration: 180, easing: easeExpoInOut, useNativeDriver: false }),
                Animated.timing(circleR, { toValue: PILL_R, duration: 180, easing: easeExpoInOut, useNativeDriver: false }),
            ]).start(() => {
                // Phase 2: crunch to single tall bar (layout only)
                Animated.parallel([
                    Animated.timing(circleW, { toValue: BAR_WIDTH, duration: 150, easing: easeExpoIn, useNativeDriver: false }),
                    Animated.timing(circleH, { toValue: TALL_BAR_H, duration: 150, easing: easeExpoIn, useNativeDriver: false }),
                    Animated.timing(circleR, { toValue: BAR_WIDTH / 2, duration: 150, easing: easeExpoIn, useNativeDriver: false }),
                ]).start(() => {
                    circleOpacity.setValue(0);
                    bars.forEach(bar => {
                        bar.o.setValue(1);
                        bar.x.setValue(0);
                        bar.h.setValue(TALL_BAR_H);
                    });

                    // Phase 3: bars fan out — translateX native, height JS.
                    Animated.parallel(
                        bars.map((bar, i) => Animated.timing(bar.x, { toValue: X_TARGETS[i], duration: 450, delay: i * 30, easing: easeBackOut18, useNativeDriver: true }))
                    ).start();
                    Animated.parallel(
                        bars.map((bar, i) => Animated.timing(bar.h, { toValue: BAR_BASE_HEIGHTS[i], duration: 450, delay: i * 30, easing: easeBackOut18, useNativeDriver: false }))
                    ).start(() => {
                        startEqualizer();
                    });
                });
            });
        }
    }, [state]);

    return (
        <View style={styles.container} pointerEvents="none">
            {/* Sonar ripples */}
            <Animated.View style={[styles.ripple, { opacity: r0Opacity, transform: [{ scale: r0Scale }] }]} />
            <Animated.View style={[styles.ripple, { opacity: r1Opacity, transform: [{ scale: r1Scale }] }]} />

            {/* Circle / blob — outer (native) handles scale + opacity, inner (JS)
                handles the width/height/borderRadius shape morph. Same exact
                pixel output as a single view, but the listening-state jitter
                and entry/exit fade stay on the UI thread at 60 fps. */}
            <Animated.View
                style={[
                    styles.circleOuter,
                    {
                        opacity: circleOpacity,
                        transform: [{ scale: circleScale }],
                    },
                ]}
            >
                <Animated.View
                    style={[
                        styles.circle,
                        {
                            width: circleW,
                            height: circleH,
                            borderRadius: circleR,
                        },
                    ]}
                />
            </Animated.View>

            {/* Bars — outer (native) handles translateX + opacity, inner (JS)
                animates real height so the pill-end borderRadius stays exact
                at every bar size. */}
            {bars.map((bar, i) => (
                <Animated.View
                    key={`bar-${i}`}
                    style={[
                        styles.barOuter,
                        {
                            opacity: bar.o,
                            transform: [{ translateX: bar.x }],
                        },
                    ]}
                >
                    <Animated.View
                        style={[
                            styles.bar,
                            {
                                width: BAR_WIDTH,
                                height: bar.h,
                                borderRadius: BAR_WIDTH / 2,
                            },
                        ]}
                    />
                </Animated.View>
            ))}
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
    // Outer wrapper is absolute-positioned and flex-centered so the inner shape
    // stays anchored at container center regardless of its animated size.
    // The outer has no size of its own — it wraps its content — so `scale`
    // applied here multiplies the inner's rendered size, matching the original
    // single-view behavior exactly.
    circleOuter: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    circle: {
        backgroundColor: '#000',
    },
    // Same pattern as circleOuter — position:absolute centers it in the
    // container, no explicit size so translateX shifts the whole wrapper
    // and the inner bar's variable height stays centered around the wrapper's
    // anchor point (matches original absolute+centered bar behavior).
    barOuter: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bar: {
        backgroundColor: '#000',
    },
});

export default AIVisualizer;
