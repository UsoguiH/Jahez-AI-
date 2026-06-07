// Voice-provider protocol layer.
//
// Two backends — OpenAI Realtime and Gemini 3.1 Flash Live — both speak
// WebSocket with JSON messages, but every event name and payload shape
// differs. This module isolates that difference so VoiceOverlay can stay
// readable: call sites write `sendToolResult(socket, callId, name, result)`
// and the right wire bytes go out, whichever provider is active.
//
// Flip `VOICE_PROVIDER` to roll back.

import { resamplePcm16_24kTo16k } from './audioUtils';

export type VoiceProvider = 'openai' | 'gemini';

// Single source of truth for which voice backend is live.
// Changing this value + redeploying is the full rollback lever.
export const VOICE_PROVIDER: VoiceProvider = 'gemini';

// Gemini-specific: maps the tool-call `id` returned by the server back to
// the tool name, since `toolResponse` requires both but `toolCall` gives
// us only the name at call time (we carry the name forward ourselves).
// OpenAI's `function_call_output` only needs `call_id`, so this is unused there.
export type PendingToolCall = { id: string; name: string };

// -----------------------------------------------------------------------------
// Session & instruction updates
// -----------------------------------------------------------------------------

// Push new system instructions mid-session. OpenAI: session.update.
// Gemini: there's no canonical live "update system instruction" event, so we
// fall back to injecting a system-role turn via clientContent — the model
// picks it up on the next turn. This is the official workaround pattern.
export const sendSessionInstructions = (socket: WebSocket, instructions: string) => {
    if (VOICE_PROVIDER === 'openai') {
        socket.send(JSON.stringify({
            type: 'session.update',
            session: { instructions },
        }));
    } else {
        // Gemini — inject as a silent system note; AI reads it before next turn.
        socket.send(JSON.stringify({
            clientContent: {
                turns: [{
                    role: 'user',
                    parts: [{ text: `[SYSTEM_UPDATE]\n${instructions}` }],
                }],
                turnComplete: false,
            },
        }));
    }
};

// -----------------------------------------------------------------------------
// Initial greeting (AI speaks first when the session opens)
// -----------------------------------------------------------------------------
export const sendInitialGreeting = (socket: WebSocket, greeting: string) => {
    if (VOICE_PROVIDER === 'openai') {
        socket.send(JSON.stringify({
            type: 'response.create',
            response: { modalities: ['text', 'audio'], instructions: greeting },
        }));
    } else {
        // Gemini — send the greeting prompt as a user turn and let the model respond.
        socket.send(JSON.stringify({
            clientContent: {
                turns: [{ role: 'user', parts: [{ text: greeting }] }],
                turnComplete: true,
            },
        }));
    }
};

// -----------------------------------------------------------------------------
// Inject a user text message.
//   triggerResponse = true  → AI should speak a reply (e.g. restaurant tap, "أكد الطلب")
//   triggerResponse = false → silent context update; AI just notes it for next turn
//                             (e.g. "user manually tapped +1 on quantity, don't comment")
// -----------------------------------------------------------------------------
export const sendInjectedUserText = (
    socket: WebSocket,
    text: string,
    triggerResponse: boolean = true,
) => {
    if (VOICE_PROVIDER === 'openai') {
        socket.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text }],
            },
        }));
        if (triggerResponse) {
            socket.send(JSON.stringify({ type: 'response.create' }));
        }
    } else {
        // Gemini — turnComplete flag is what decides "should AI respond now".
        socket.send(JSON.stringify({
            clientContent: {
                turns: [{ role: 'user', parts: [{ text }] }],
                turnComplete: triggerResponse,
            },
        }));
    }
};

// -----------------------------------------------------------------------------
// Tool result (after we execute a function_call locally, send response back)
// -----------------------------------------------------------------------------
export const sendToolResult = (
    socket: WebSocket,
    callId: string,
    toolName: string,
    result: any,
) => {
    if (VOICE_PROVIDER === 'openai') {
        socket.send(JSON.stringify({
            type: 'conversation.item.create',
            item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) },
        }));
        socket.send(JSON.stringify({ type: 'response.create' }));
    } else {
        // Gemini wants both the id AND the name echoed back.
        // Tool calls are synchronous-only in 3.1 — sending the response unblocks generation.
        socket.send(JSON.stringify({
            toolResponse: {
                functionResponses: [{
                    id: callId,
                    name: toolName,
                    response: result,
                }],
            },
        }));
    }
};

// -----------------------------------------------------------------------------
// Audio chunk from mic — base64 PCM16 @ 24 kHz as captured by the device
// -----------------------------------------------------------------------------
export const sendAudioChunk = (socket: WebSocket, base64Pcm24k: string) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (VOICE_PROVIDER === 'openai') {
        socket.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Pcm24k,
        }));
    } else {
        // Gemini input must be 16 kHz — resample each chunk before send.
        const pcm16k = resamplePcm16_24kTo16k(base64Pcm24k);
        // realtimeInput.audio is the current Live API shape. The older
        // mediaChunks field is deprecated on 3.x and closes with 1007.
        socket.send(JSON.stringify({
            realtimeInput: {
                audio: { data: pcm16k, mimeType: 'audio/pcm;rate=16000' },
            },
        }));
    }
};

// -----------------------------------------------------------------------------
// Commit (stopRecording pushes an explicit end-of-turn)
// -----------------------------------------------------------------------------
export const sendAudioCommit = (socket: WebSocket) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (VOICE_PROVIDER === 'openai') {
        socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        socket.send(JSON.stringify({ type: 'response.create', response: { modalities: ['text', 'audio'] } }));
    } else {
        // Gemini — activityEnd signals end of user turn when automatic VAD is off.
        // When automatic VAD is on (our default), this is still a safe no-op hint.
        socket.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
    }
};

// -----------------------------------------------------------------------------
// Interrupt (user long-pressed mic while AI speaking)
// -----------------------------------------------------------------------------
export const sendInterrupt = (
    socket: WebSocket,
    itemId: string | null,
    audioEndMs: number,
) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (VOICE_PROVIDER === 'openai') {
        try { socket.send(JSON.stringify({ type: 'response.cancel' })); } catch {}
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
    } else {
        // Gemini — announce activity to trigger barge-in; server will cancel
        // in-flight generation and emit `interrupted: true` on the stream.
        // There's no client-side "truncate to exact ms" primitive — the server
        // handles truncation in its own context window.
        try { socket.send(JSON.stringify({ realtimeInput: { activityStart: {} } })); } catch {}
    }
};
