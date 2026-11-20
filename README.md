# Shuru: AI Storefront Generator

Turns a creator's Instagram handle, or a few lines about themselves, into a ready-to-share storefront: a bio, 2–4 product ideas priced in INR with a "why this price" note, product descriptions, and a mobile landing page at a public link. Built as a take-home for SuperProfile's PM (AI-native, 0→1) role.

**Flow:** handle or description → confirm profile → generate (~10s) → edit inline / rewrite any part with AI → pick a link → publish → share on WhatsApp / Instagram bio. Visitors tap "I want this" to leave their WhatsApp/email, and the creator sees views, taps and interested buyers in the editor.

## Stack

- **Next.js 16** (App Router, route handlers) + Tailwind CSS 4, deployed on Vercel
- **Claude** via `@anthropic-ai/sdk`: `claude-haiku-5-5` primary, `claude-sonnet-5-5` fallback, JSON-schema structured outputs parsed with zod
- **Apify** `instagram-profile-scraper` actor to read public profile signals (bio, followers, last captions)
- **Upstash Redis** for stores, slugs, analytics and leads (falls back to a local JSON file in dev)

## Run locally

```bash
npm install
cp .env.example .env.local   # then add your keys
npm run dev                  # http://localhost:3000
```

| Variable | Required | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | Claude API key |
| `APIFY_TOKEN` | no | Without it, the Instagram path shows a friendly fallback to "Describe myself" |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | no | Upstash Redis. Without them, data is stored in `.data/db.json` (dev only) |
| `ANTHROPIC_MODEL`, `ANTHROPIC_FALLBACK_MODEL`, `ANTHROPIC_EFFORT` | no | Defaults: `claude-haiku-5-5`, `claude-sonnet-5-5`, `low` |

## Deploy

1. Import the repo into Vercel.
2. Add Upstash Redis from the Vercel Marketplace (Storage tab); it injects the `KV_*` variables.
3. Add `ANTHROPIC_API_KEY` and `APIFY_TOKEN` as environment variables, then deploy.

## Where things are

| Path | What |
| --- | --- |
| `lib/prompts.ts` | System prompt (who the buyer is, what sells, pricing rules, writing rules) and per-task prompts |
| `lib/ai.ts` | Model calls: structured output, timeouts, fallback model, business-rule repair pass |
| `lib/pricing.ts` | INR price bands per format, audience tiers, charm pricing, validation |
| `lib/input.ts` | Handle normalisation and gibberish checks before any paid call |
| `lib/instagram.ts` | Apify lookup, error mapping, 24h cache, avatar inlining |
| `app/api/*` | generate, regenerate (bio / one product / new product), store CRUD, publish, analytics, leads |
| `components/Editor.tsx` | Inline WYSIWYG editor with autosave and per-section AI rewrite |
| `components/Storefront.tsx` | Public page + "I want this" sheet (also the editor's Preview) |
| `app/[slug]/opengraph-image.tsx` | WhatsApp / social link preview card |
| `docs/Decision-Doc.pdf` | Decision doc (source: `docs/decision-doc.html`) |

## How AI coding tools were used

Built with Claude Code end to end: reading the brief, checking the Apify actor's real output on live handles before writing the parser, scaffolding, writing the code, and driving a headless browser at phone width to test the flow and edge cases. Product decisions, prompt rules and price bands were reviewed and tuned by hand against real generations (see the decision doc for what changed and why).

## Edge cases handled

Handle that doesn't exist, private account, empty profile, Instagram slow or down (25s cap, one retry, then the describe-yourself path), invalid handle, URL pasted instead of handle, empty input, keyboard-mash, one-word niche (generates with stated assumptions and a follow-up question), unsafe offers like guaranteed returns (declined kindly), model timeout or error (fallback model, then a retry screen that keeps the input), model output that breaks business rules (one repair call, then deterministic clamping), slug already taken (suggestions), unknown store link (friendly 404), bad lead contact (inline validation), rate limits on paid endpoints.
