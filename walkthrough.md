# Jahez AI — Project Walkthrough

A voice-first AI food ordering experience, built in Arabic for the Saudi market and designed to plug into Jahez's restaurant network, fulfillment, and payments.

> **Branch:** `jahez`
> **Repo:** [UsoguiH/jahez-AI](https://github.com/UsoguiH/jahez-AI)
> **Status:** Demo-ready prototype. Core voice ordering works end-to-end. Production pieces (payments, auth, live menus, delivery dispatch) are intentionally stubbed for Jahez to plug in.

---

## 1. The Concept in One Paragraph

The user taps the mic, speaks in Saudi Arabic ("ابي برجر من البيك"), and the app has a natural spoken conversation with them to pick a restaurant, build a cart, and confirm the order. Under the hood, the mobile app streams audio to OpenAI's Realtime API (gpt-4o-realtime-preview) over a WebSocket. The model transcribes, understands intent, talks back in voice, and calls structured tools (`suggest_restaurants`, `select_restaurant`, `update_cart`, `confirm_order`) that drive the UI. Supabase edge functions handle the secure OpenAI token exchange, menu search, and order persistence.

**The pitch to Jahez:** a voice layer that sits on top of Jahez's existing catalog, lets users order hands-free in natural Arabic, and dramatically reduces the friction of browsing menus on a phone.

---

## 2. Architecture at a Glance

```
┌──────────────────────────────────────────────┐
│          Mobile App (Expo / React Native)    │
│  HomeScreen · VoiceOverlay · Cart · Orders   │
└──────────┬──────────────────────┬────────────┘
           │                      │
  WebSocket│ (realtime audio)     │ HTTPS
           │                      │
           ▼                      ▼
┌─────────────────────┐  ┌──────────────────────────┐
│  OpenAI Realtime    │  │  Supabase (Postgres +    │
│  gpt-4o-realtime    │  │  Auth + Edge Functions)  │
│  Whisper · Alloy TTS│  │  • openai-realtime-proxy │
└─────────────────────┘  │  • fuzzy-menu-match      │
                         │  • confirm-order         │
                         │  • process-voice-intent  │
                         └──────────────────────────┘
                                    │
                                    ▼
                         ( Future: Jahez APIs —
                           catalog, payments,
                           fulfillment, tracking )
```

Three top-level pieces:

| Folder | What it is | State |
|---|---|---|
| `mobile_app/` | Customer-facing Expo app (iOS + Android) | **Built** |
| `supabase/functions/` | Deno edge functions for auth, menu search, orders | **Built** |
| `web_kiosk/` | Vite + React scaffold (future in-store kiosk or admin) | **Scaffold only** |

---

## 3. Tech Stack

**Mobile app**
- Expo SDK 54, React Native 0.81, React 19, TypeScript
- NativeWind 2 (Tailwind for RN) for styling
- React Navigation 7 (stack)
- `expo-av` + `react-native-live-audio-stream` for PCM16 audio I/O
- `react-native-reanimated` for 60fps native-driver animations
- Arabic-first UI with `I18nManager` RTL enabled at boot

**Backend**
- Supabase (managed Postgres + Auth + Edge Functions in Deno)
- OpenAI Realtime API (`gpt-4o-realtime-preview`, voice: `alloy`)
- OpenAI Embeddings (`text-embedding-3-small`) for semantic menu search
- Anonymous Supabase auth during demo; real auth slot left open

**Web kiosk**
- Vite 8, React 19, Tailwind v4 (scaffold — no custom UI yet)

---

## 4. The Voice Ordering Flow (End-to-End)

1. **User taps the mic** on `HomeScreen` → `VoiceOverlay` mounts, shows the connecting orb.
2. **Token exchange.** The app calls the `openai-realtime-proxy` edge function, which hits OpenAI with the server-side `OPENAI_API_KEY` and returns a short-lived ephemeral client secret.
3. **WebSocket opens** to `wss://api.openai.com/v1/realtime` using that ephemeral token. A `session.update` message configures:
   - Voice: `alloy`, audio format: PCM16 @ 24 kHz
   - Server-side VAD (turn detection) with 750 ms silence threshold
   - Arabic system prompt (Saudi dialect, restaurant-aware)
   - Four tools the model can call
4. **Phase 1 — Restaurant selection.** User says what they want ("أبي برجر"). Model calls `suggest_restaurants({ cuisine: "برجر" })`. App renders animated restaurant cards. User either taps a card or says the name; model calls `select_restaurant`. Full menu JSON is injected into the model's context.
5. **Phase 2 — Ordering.** User speaks items naturally. Model calls `update_cart({ items: [...] })` with full cart state each time. `InlineCartWidget` and `OrderCartWidget` animate the change. User can modify ("بدون مخلل") or add ("وبيبسي").
6. **Phase 3 — Confirmation.** User says "تمم" / "أكد". Model calls `confirm_order`. The `OrderConfirmation` overlay plays (green checkmark, spring + glow, sparkle particles). In the full flow, `confirm-order` edge function writes the order + order_items rows and flips the cart to `checked_out`.
7. **Post-order.** `ActiveOrderBanner` on HomeScreen picks up the order via Supabase realtime subscriptions and shows live status.

Perceived latency is sub-second because audio streams both ways continuously — the user hears the model start talking before the model has finished "thinking."

---

## 5. Mobile App — Key Screens & Components

**Screens** (`mobile_app/src/screens/`)
- `HomeScreen.tsx` — discovery: location header, search, 5 category pills, restaurant cards, floating mic, bottom nav (5 tabs).
- `OrderSummaryScreen.tsx` — full cart review, calls `confirm-order`, subscribes to `cart_items` for realtime updates.

**Components** (`mobile_app/src/components/`)
- `VoiceOverlay.tsx` (~1,600 lines) — the centerpiece. Owns the WebSocket, audio capture/playback, tool dispatch, chat UI, and phase state (`connecting` → `menu` → `chat`).
- `RestaurantSuggestions.tsx` — animated restaurant cards with entrance/selection/dismiss transitions. Holds `RESTAURANT_META` (13 restaurants) and `CUISINE_MAP` (cuisine → restaurants).
- `InlineCartWidget.tsx` — compact cart that appears in the chat as items are added; quantity steppers, live pricing.
- `OrderCartWidget.tsx` — full-screen cart sheet with dark backdrop, drag handle, VAT breakdown, confirm CTA.
- `OrderConfirmation.tsx` — success overlay (animated check, sparkles, pulse).
- `CartSummary.tsx` — floating cart badge outside the voice flow.
- `ActiveOrderBanner.tsx` — live order status banner on Home.

**Libs** (`mobile_app/src/lib/`)
- `supabase.ts` — client init
- `restaurantLogos.ts` — logo asset mapping + fuzzy matcher (13 PNGs in `assets/logos/`)
- `audioUtils.ts` — WAV header construction for PCM chunks

---

## 6. Backend — Supabase Edge Functions

All four live in `supabase/functions/` and are written in Deno/TypeScript.

| Function | Purpose |
|---|---|
| `openai-realtime-proxy/index.ts` | Exchanges the server-side OpenAI key for a short-lived ephemeral token the mobile app uses over WebSocket. Keeps the real key off the device. |
| `fuzzy-menu-match/index.ts` | Embeds a user query with `text-embedding-3-small` and calls the Postgres RPC `match_menu_items` (pgvector) to return the top-5 closest items. |
| `confirm-order/index.ts` | Reads the active cart + items, computes totals, inserts `orders` + `order_items`, flips cart to `checked_out`. |
| `process-voice-intent/index.ts` | Generic tool-call router (currently bypassed because VoiceOverlay handles tools client-side; kept as the server-authoritative path for later). |

**Inferred schema** (no migrations checked in; managed via dashboard today):

```
restaurants(id, name_ar, name_en, ai_voice_context, menu_json)
menu_items(id, restaurant_id, name_ar, name_en, price, embedding vector)
carts(id, user_id, restaurant_id, status)
cart_items(id, cart_id, menu_item_id, quantity, unit_price)
orders(id, user_id, restaurant_id, cart_id, subtotal_amount, total_amount,
       delivery_address jsonb, status)
order_items(id, order_id, menu_item_id, name_ar, name_en, quantity, unit_price)
gpt_function_call_logs(id, session_id, function_name, arguments, result, was_successful)
```

**Env vars required:** `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

---

## 7. Design & UX Language

- **Arabic-first, RTL throughout.** All primary copy is Saudi-dialect Arabic; bilingual data structures (`name_ar` / `name_en`) everywhere.
- **Animated micro-interactions** are a signature: pulsing connecting orb, wave bars while listening, staggered card entrances, sparkle-burst on confirmation. All run on the native driver for 60fps.
- **Color:** Jahez red `#DC2626` for primary actions, green `#15803d` for success/ratings, neutral grays for structure.
- **Shape:** soft rounded corners (16–28px), generous whitespace, subtle shadows, occasional glassmorphism.
- **Reference mockups** in `assets/screens/` (home, menu, cart, checkout).
- **Restaurant logos:** 13 real Saudi brand PNGs included (McDonald's, Herfy, Pizza Hut, Al Baik, KFC, Al Tazaj, Shawarmer, Mama Noura, Kudu, Subway, Starbucks, Baskin-Robbins, Al Romansiah).

---

## 8. What's Built vs. What's Next

**Built and working**
- Voice streaming to OpenAI Realtime + tool-driven UI
- Restaurant selection, menu injection, natural-language cart building
- Animated inline + full-screen cart with quantity steppers and VAT breakdown
- Order confirmation UI + Supabase persistence
- Realtime subscriptions for cart and order status
- Arabic RTL UI, 13 restaurants, mood-aware AI greeting

**Deliberately stubbed for Jahez to plug in**
- **Authentication** — currently anonymous Supabase session. Needs phone + OTP (or Jahez SSO).
- **Payments** — no gateway wired up. Needs Jahez's preferred PSP (Apple Pay / Mada / card / wallet).
- **Live restaurant & menu data** — 13 restaurants and their menus are hardcoded. Needs to read from Jahez's catalog API.
- **Order fulfillment** — `confirm-order` writes to Supabase. Needs to also POST to Jahez's order/dispatch system.
- **Delivery tracking** — `ActiveOrderBanner` renders status but has no map/driver feed. Needs Jahez's tracking webhook/socket.
- **Addresses** — delivery address is mocked as "Default Address". Needs Jahez's saved-address service.
- **Push notifications** — FCM not wired.
- **Admin / kiosk** — `web_kiosk/` is a Vite scaffold; intentionally empty.

---

## 9. What Jahez Would Own vs. What's Ready

| Piece | Status | Jahez's role |
|---|---|---|
| Voice stack (STT/LLM/TTS) | ✅ done | — |
| Conversation design (tools + Arabic prompt) | ✅ done | Tune wording to brand voice |
| UI / animations / RTL | ✅ done | Apply final brand tokens |
| Cart + pricing + VAT (15%) | ✅ done | — |
| Supabase backend skeleton | ✅ done | Decide keep vs. migrate to Jahez infra |
| Restaurant catalog | 🟡 mock | Provide catalog API |
| Menus | 🟡 mock | Provide menu API (with modifiers) |
| Auth | 🟡 anon | Provide SSO / OTP |
| Payments | 🔲 stub | Provide PSP integration |
| Order dispatch | 🔲 local | Provide order-in API + tracking feed |
| Addresses | 🔲 mock | Provide address book API |

Every integration point is isolated behind a single function or edge function, so swap-in is surgical, not a rewrite.

---

## 10. File Cheat Sheet

Top files to open first when ramping a new engineer:

| Path | Why it matters |
|---|---|
| `mobile_app/App.js` | App entry, RTL setup, navigator |
| `mobile_app/src/screens/HomeScreen.tsx` | Main discovery screen |
| `mobile_app/src/components/VoiceOverlay.tsx` | The whole voice conversation engine |
| `mobile_app/src/components/RestaurantSuggestions.tsx` | Restaurant metadata + cuisine map |
| `mobile_app/src/components/OrderCartWidget.tsx` | Full-screen cart UX |
| `mobile_app/src/components/OrderConfirmation.tsx` | Success animation |
| `mobile_app/src/lib/supabase.ts` | Supabase client |
| `supabase/functions/openai-realtime-proxy/index.ts` | OpenAI token bridge |
| `supabase/functions/confirm-order/index.ts` | Order creation |
| `supabase/functions/fuzzy-menu-match/index.ts` | Semantic menu search |
| `assets/screens/*.jpeg` | Design reference mockups |

---

## 11. Running It Locally

```bash
# Mobile
cd mobile_app
npm install
npx expo start            # or: npx expo run:ios / run:android

# Supabase functions (requires Supabase CLI + linked project)
cd supabase
supabase functions serve  # local dev
supabase functions deploy openai-realtime-proxy
```

Secrets to set on the Supabase project: `OPENAI_API_KEY`.

---

## 12. Summary for Jahez

This project delivers the **hardest and most differentiated part** of a voice-first ordering app — real-time Arabic conversation, tool-driven UI, animated cart flow, and clean Supabase backing — as a working prototype. What remains is the **commercial plumbing** that only Jahez can provide: live catalog, auth, payments, and dispatch. The code is organized so those plug in at clear seams without reworking the voice or UI layers.

The experience on device today is already compelling enough for a live demo.
