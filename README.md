# EngCoach

Personal workplace-English coach: writing corrections (SRS-backed flashcards) + voice chat.
Next 16 · React 19 · Tailwind v4 · shadcn/ui · Supabase · Vercel AI SDK · ts-fsrs.
Runs on the $0 tier. Full spec: `docs/`.

## Status

- **Phase 0 (scaffold)** ✅ — app, deps, shadcn, Supabase clients, auth, deploy config.
- **Phase 1 (Writing Coach)** ✅ — Compose / Translate / Paste, corrections with
  3-color underlines, accept/dismiss, natural-rewrite inline diff, `+ Flashcard`.
- **Phase 2 (Review)** ✅ — FSRS flashcard session: flip card, 2-button Again/Good
  (keys 1/2/3/4), interval previews, in-session relearn, keyboard-driven.
- **Phase 3 (Dashboard)** ✅ — activity heatmap, retention %, words/week, error-rate
  trend by category (small multiples), top errors. Hand-rolled SVG/CSS, no chart dep.
- **Phase 4 (Voice)** ✅ — push-to-talk roleplay (Web Speech API STT + `speechSynthesis`
  TTS), scenario chips, state orb, hide-transcript, end-of-session report with `+ Card`.
  Chrome/Edge only (STT).
- **Listen** ✅ — dictation: hear a workplace sentence, type it, word-level scoring
  (reuses `diff`), `+ Card` on the words you missed.
- **AI provider** ✅ — Settings → Google / xAI (Grok) / Z.AI (GLM) / DeepSeek / Groq /
  OpenRouter / custom OpenAI-compatible. Config (provider, key, model) lives in the
  **browser localStorage only — never in the DB**; sent per-request.

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in the three keys below
pnpm dev
```

Env vars (`.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from your Supabase project.

There is no server-side LLM key: every user configures their own provider + API key
in **Settings → AI provider** (stored in the browser only, sent per-request).

### Supabase

1. Create a project, then apply the schema. Source of truth is `lib/db/schema.ts`
   (Drizzle); SQL migrations live in `supabase/migrations/`.
   - Fresh DB: run the files in `supabase/migrations/` in order (SQL editor or
     `DATABASE_URL=postgres://… pnpm db:migrate`).
   - Schema change: edit `lib/db/schema.ts` → `pnpm db:generate` → apply the new file.
2. **Authentication → Providers → Google**: paste a Google OAuth Client ID + Secret.
   - Google Cloud Console → OAuth 2.0 Client (Web); Authorized redirect URI =
     `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Authentication → URL Configuration**: add `http://localhost:3000` (and your prod
   domain) to Site URL + Redirect URLs.
4. Optional: `supabase gen types typescript --project-id <ref> > lib/db-types.ts` for typed queries.

### Deploy (Vercel)

Import the repo on [Vercel](https://vercel.com) — Next.js is auto-detected, no config.

1. Set env vars in the Vercel project: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (LLM keys are per-user, in the browser — none here).
2. Add the deployed domain to Supabase **Auth → URL Configuration** (Site URL +
   Redirect URLs) and the Google OAuth redirect URI.

**Cron:** `vercel.json` runs a daily Vercel Cron hitting `/api/ping` so Supabase doesn't
pause after 7 idle days (daily review also keeps it alive).

## Scripts

`pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm test` (anchoring + FSRS)
