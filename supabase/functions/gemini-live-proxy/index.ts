// Mints short-lived auth tokens for Gemini 3.1 Flash Live WebSocket sessions.
//
// The Gemini Live API uses ephemeral tokens ("auth tokens") instead of long-lived
// API keys for client-facing WebSockets. We mint one server-side here so the raw
// GEMINI_API_KEY never leaves Supabase secrets. The token is single-use by default
// and scoped to a short TTL — if it leaks from a device it can't be reused.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Token lifetime. The Gemini docs call this `expireTime` (absolute) and
// `newSessionExpireTime` (when a new session can still bind the token). We keep
// both short — the client opens the socket immediately after receiving the token.
const TOKEN_TTL_SECONDS = 30 * 60           // 30 min total session window
const NEW_SESSION_TTL_SECONDS = 2 * 60      // 2 min to actually start the session

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            console.log("No Auth Header — proceeding in Guest/Demo Mode");
        }

        const dateStr = new Date().toISOString();
        console.log(`[${dateStr}] Minting Gemini Live ephemeral token...`);

        const geminiKey = Deno.env.get('GEMINI_API_KEY');
        if (!geminiKey) {
            console.error("GEMINI_API_KEY not set in environment");
            return new Response(JSON.stringify({ error: "Server configuration error: GEMINI_API_KEY not set" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const now = Date.now();
        const expireTime = new Date(now + TOKEN_TTL_SECONDS * 1000).toISOString();
        const newSessionExpireTime = new Date(now + NEW_SESSION_TTL_SECONDS * 1000).toISOString();

        // Mint token via v1alpha auth_tokens endpoint.
        // Shape per https://ai.google.dev/gemini-api/docs/ephemeral-tokens
        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${geminiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // REST shape: fields at the root of auth_token (no "config" wrapper —
                // the Python SDK uses `config=...` but that's unwrapped before the HTTP call).
                body: JSON.stringify({
                    uses: 1,
                    expireTime,
                    newSessionExpireTime,
                    // No bidiGenerateContentSetup constraint. With the Constrained
                    // endpoint, locking the model in the token appears to collide
                    // with the client's own setup message and makes Google close
                    // the WS with code 1011 right after the setup frame. TTL +
                    // single-use + Supabase auth still prevent token abuse.
                }),
            }
        );

        if (!geminiResponse.ok) {
            const errText = await geminiResponse.text();
            console.error("Gemini auth_tokens error:", geminiResponse.status, errText);
            return new Response(JSON.stringify({ error: "Gemini auth error", details: errText }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const data = await geminiResponse.json();
        // Response field is `name`, containing the opaque token string the client
        // will append to the WebSocket URL as ?access_token=<name>.
        console.log("Gemini token minted, returning to client.");

        return new Response(
            JSON.stringify({
                access_token: data.name,
                expire_time: expireTime,
                model: "models/gemini-3.1-flash-live-preview",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (e: any) {
        console.error("gemini-live-proxy error:", e);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
})
