// Mints an ephemeral client secret for an OpenAI Realtime TRANSCRIPTION session
// (wss://api.openai.com/v1/realtime?intent=transcription). Distinct from
// openai-realtime-proxy which is the conversational gpt-4o-realtime path.
//
// The mobile app opens a second WebSocket to OpenAI purely for user-speech
// captions — Gemini Live handles the conversation brain in parallel. This
// split is what gets us ChatGPT-mobile-grade caption accuracy (gpt-4o-transcribe,
// Arabic-primed) without giving up Gemini's dialectal understanding.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Natural-sentence prompt anchors the CORRECT Arabic spellings of common
// loanwords (برجر not بوركر، شاورما not شورمة) and a handful of restaurant
// names — embedded in a descriptive sentence, not a comma-separated word list.
// The earlier word-list form caused hallucinations (the model dropped prompt
// tokens into nonsense output); flowing prose form has the same anchoring
// effect on token probabilities without the hallucination failure mode.
// Keeping it short (~120 chars) stays well under the ~200-char threshold where
// prompt-induced hallucination starts appearing in gpt-4o-transcribe.
const TRANSCRIBE_PROMPT = "هذه محادثة بالعربية السعودية يطلب فيها المستخدم طعاماً مثل برجر أو شاورما أو دجاج أو بيتزا من مطاعم مثل البيك وكودو وماكدونالدز.";

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Auth relaxed for demo parity with openai-realtime-proxy. Guest mode is OK.
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            console.log("[TRANSCRIBE] No Auth Header — Guest/Demo Mode");
        }

        const openAIKey = Deno.env.get('OPENAI_API_KEY');
        if (!openAIKey) {
            console.error("[TRANSCRIBE] OPENAI_API_KEY not set");
            return new Response(JSON.stringify({ error: "Server configuration error: OPENAI_API_KEY not set" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const dateStr = new Date().toISOString();
        console.log(`[${dateStr}] [TRANSCRIBE] Minting ephemeral key...`);

        // /v1/realtime/transcription_sessions is the transcription-only variant
        // of the Realtime sessions endpoint. The returned client_secret.value is
        // what the mobile client uses as the ephemeral subprotocol token when
        // it connects to wss://api.openai.com/v1/realtime?intent=transcription.
        //
        // We bake the transcription config into the session mint itself so the
        // client doesn't need to send a transcription_session.update — faster
        // first-frame latency and one less thing to go wrong on mobile.
        const openAIResponse = await fetch("https://api.openai.com/v1/realtime/transcription_sessions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openAIKey}`,
                "Content-Type": "application/json",
                "OpenAI-Beta": "realtime=v1",
            },
            body: JSON.stringify({
                input_audio_format: "pcm16",
                input_audio_transcription: {
                    model: "gpt-4o-transcribe",
                    language: "ar",
                    prompt: TRANSCRIBE_PROMPT,
                },
                // OpenAI's server-side noise suppression tuned for phone/headset
                // audio (speaker close to mouth). Keeps ambient HVAC/traffic out
                // of the ASR so quiet moments don't produce hallucinated transcripts.
                input_audio_noise_reduction: { type: "near_field" },
                // Semantic VAD uses the model itself to decide when a turn is
                // complete — i.e. "has the user actually finished their thought" —
                // instead of raw audio amplitude (server_vad). This is the single
                // biggest win for long-sentence accuracy: amplitude VAD fragments
                // on mid-sentence micro-pauses ("أبي برجر ... مع جبنة ... كبير"),
                // and every fragment gets transcribed without its neighbors'
                // context, tanking WER. Semantic VAD waits for a semantically
                // complete utterance and commits it as one block.
                // eagerness=low → wait longer, favor completeness over latency.
                // This is the same VAD mode the ChatGPT mobile app uses.
                turn_detection: {
                    type: "semantic_vad",
                    eagerness: "low",
                },
            }),
        });

        if (!openAIResponse.ok) {
            const errText = await openAIResponse.text();
            console.error("[TRANSCRIBE] OpenAI Error:", openAIResponse.status, errText);
            return new Response(JSON.stringify({ error: "OpenAI Error", details: errText }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const data = await openAIResponse.json();
        console.log("[TRANSCRIBE] Ephemeral key issued.");

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (e: any) {
        console.error("[TRANSCRIBE] Edge Fx Error:", e);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
})
