// Dedicated OpenAI Realtime TRANSCRIPTION socket — runs in parallel with the
// Gemini Live conversation socket and produces the user-visible caption via
// gpt-4o-transcribe (the same ASR the ChatGPT mobile app uses).
//
// Why this exists: Gemini Live's inputTranscription is a byproduct of a
// conversational model and caps at ~85-90% WER on Saudi dialect. gpt-4o-transcribe
// is a dedicated ASR with ~95% WER on Arabic dialects and Whisper-style prompt
// priming for proper-noun recognition (restaurant names etc). The split:
//   Gemini Live   = conversation brain + voice reply
//   gpt-4o-trans. = user caption shown in the chat log
//
// Audio: we send the raw 24 kHz PCM16 the mic captures — OpenAI's native input
// rate. No resample needed (unlike the Gemini path which downsamples to 16k).
// This preserves the top end of the speech spectrum for the caption-critical
// path and is the single biggest accuracy lever.

import { supabase } from './supabase';

export type TranscribeHandle = {
    socket: WebSocket;
    // Mirrors socket.readyState === OPEN but flips false the moment onclose
    // fires, so callers can silently fall back to Gemini's inputTranscription
    // without racing the close event.
    isAlive: () => boolean;
    close: () => void;
};

export type TranscribeCallbacks = {
    // Fired on every conversation.item.input_audio_transcription.completed —
    // i.e. once per user utterance after OpenAI's server-VAD closes a turn.
    // `text` is the finalized Arabic transcript (already trimmed).
    onFinal: (text: string) => void;
    // Optional: fired on incremental deltas if the UI wants a live partial.
    // We deliberately don't surface these in VoiceOverlay — we only paint the
    // completed transcript to avoid the flicker of self-correcting partials,
    // which is how ChatGPT/Gemini apps achieve their "clean" caption feel.
    onPartial?: (delta: string) => void;
    onClosed?: () => void;
    onError?: (err: any) => void;
};

// Open a transcription-only Realtime socket. Returns a handle with a live
// liveness check and a close fn. Throws if the ephemeral key mint fails — the
// caller should catch and continue without captions (Gemini fallback kicks in).
export const openTranscribeSession = async (
    authToken: string | null,
    cb: TranscribeCallbacks,
): Promise<TranscribeHandle> => {
    // 1. Mint ephemeral key via our Supabase edge function. The edge function
    //    pre-bakes the transcription config (model, language, prompt, VAD),
    //    so the mobile client doesn't need to send transcription_session.update
    //    and the first-audio latency stays tight.
    const { data, error } = await supabase.functions.invoke('openai-transcribe-proxy', {
        method: 'POST',
        headers: {
            ...(authToken && authToken !== 'guest-demo-token' ? { Authorization: `Bearer ${authToken}` } : {}),
        },
    });
    if (error) throw new Error(`transcribe-proxy failed: ${error.message}`);

    // OpenAI returns { client_secret: { value, expires_at }, ... } from the
    // transcription_sessions endpoint, mirroring /realtime/sessions.
    const ephemeralKey: string | undefined = data?.client_secret?.value;
    if (!ephemeralKey) throw new Error('transcribe-proxy: no client_secret in response');

    // 2. Open WebSocket with intent=transcription so the server spins up a
    //    transcription-only session (no model responses, just transcripts).
    const url = 'wss://api.openai.com/v1/realtime?intent=transcription';
    const protocols = [
        'realtime',
        `openai-insecure-api-key.${ephemeralKey}`,
    ];

    // RN's WebSocket accepts an options bag as the third arg (non-standard).
    // @ts-ignore
    const socket = new WebSocket(url, protocols, {
        headers: { 'OpenAI-Beta': 'realtime=v1' },
    });

    let alive = false;

    socket.onopen = () => {
        alive = true;
        console.log('[TRANSCRIBE] socket open');
        // Session config is already baked into the ephemeral key, so no
        // transcription_session.update needed here. If OpenAI ever changes
        // this behavior, we'd send it from this handler.
    };

    socket.onmessage = (evt: any) => {
        try {
            // Transcription socket always delivers JSON text frames.
            const raw: string = typeof evt.data === 'string' ? evt.data : String(evt.data);

            // Cheap substring pre-filter BEFORE JSON.parse. OpenAI Realtime emits
            // ~5-15 messages per user utterance: session.created/updated,
            // input_audio_buffer.speech_started/stopped/committed, transcription
            // deltas and completed, plus occasional heartbeats. We only surface
            // deltas (optional) / completed / error — parsing the rest was
            // 10-15 pointless JSON.parse calls per utterance on the main
            // thread, landing right when the Gemini audio response starts
            // decoding, which is exactly when the JS thread needs to be quiet
            // so the audio init callbacks don't get starved. Substring-check
            // is O(n) string scan, ~50x cheaper than JSON.parse for typical
            // OpenAI Realtime frames.
            const hasCompleted = raw.indexOf('transcription.completed') !== -1;
            const hasDelta = raw.indexOf('transcription.delta') !== -1;
            const hasError = raw.indexOf('"type":"error"') !== -1;
            if (!hasCompleted && !hasError && !(hasDelta && cb.onPartial)) return;

            const msg = JSON.parse(raw);

            if (msg.type === 'conversation.item.input_audio_transcription.delta' && msg.delta) {
                cb.onPartial?.(msg.delta);
            }

            if (msg.type === 'conversation.item.input_audio_transcription.completed') {
                const t = typeof msg.transcript === 'string' ? msg.transcript.trim() : '';
                if (t) cb.onFinal(t);
            }

            if (msg.type === 'error') {
                console.error('[TRANSCRIBE] server error:', JSON.stringify(msg));
                cb.onError?.(msg);
            }
        } catch (e) {
            console.warn('[TRANSCRIBE] parse err', e);
        }
    };

    socket.onerror = (e: any) => {
        console.error('[TRANSCRIBE] socket error', e?.message || e);
        cb.onError?.(e);
    };

    socket.onclose = (e: any) => {
        alive = false;
        console.log('[TRANSCRIBE] socket closed', e?.code, e?.reason);
        cb.onClosed?.();
    };

    return {
        socket,
        isAlive: () => alive && socket.readyState === WebSocket.OPEN,
        close: () => {
            try { socket.close(); } catch {}
            alive = false;
        },
    };
};

// Stream a mic chunk (raw 24 kHz PCM16 base64 as captured by
// react-native-live-audio-stream) to the transcription socket. No-op if
// the socket isn't OPEN — the Gemini inputTranscription fallback covers the
// gap until/if the socket reconnects.
export const sendTranscribeChunk = (handle: TranscribeHandle | null, base64Pcm24k: string) => {
    if (!handle) return;
    const s = handle.socket;
    if (s.readyState !== WebSocket.OPEN) return;
    try {
        s.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Pcm24k,
        }));
    } catch (e) {
        // Socket can flip to CLOSING between the readyState check and send on
        // mobile networks — swallow so we don't spam the console.
    }
};
