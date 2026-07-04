# Prompt Box Pro: Sync, Payments, and Web App (Project B)

**Date:** 2026-07-03
**Status:** Direction approved by LB (build Supabase sync + charging now). Spec pending review.
**Decision:** Skip the fake-door validation gate. Build the paid tier directly, informed by market research instead of waitlist data.

## Why We Believe This Can Work (Research Basis)

- 45 users with zero promotion; organic growth signal.
- Survey (n=2 real responses): multi-computer sync is the only repeated driver; one-time purchase preference; zero waitlist emails. Weak validation, which is why pricing includes a one-time option.
- Market research (last30days run, 2026-07-03, raw file: ~/Documents/Last30Days/prompt-manager-extensions-for-ai-prompts-raw-v3.md):
  - The scattered-prompts pain is validated: Promptty (native iOS/macOS prompt manager) launched on r/SideProject in June 2026 with the identical origin story; PromptForge (local prompt vault) landed on GitHub the same month.
  - Competitive pricing ladder: Text Blaze Pro $3.49/mo ($2.99/mo billed yearly), Business $8.39/user/mo; AIPRM $20 to $999/mo; both draw complaints (Text Blaze: Chrome-only dependence; AIPRM: UI clutter).
  - PromptPerfect is shutting down (Elastic acquired Jina AI; signups closed June 2026, offline September 1, 2026). Its users are actively shopping for: prompt optimization, a saved prompt library, multi-model support.
  - 2026 comparison articles weight multi-platform coverage as the top buying criterion.
  - Category shows subscription fatigue at the low end; one-time appetite is real.

## Pricing

| Plan | Price | Notes |
|---|---|---|
| Free | $0 forever | Everything local: unlimited prompts, expansion everywhere, Chrome same-browser sync, import/export, markdown preview, BYO-key prompt improver |
| Pro Monthly | $2.99/mo | Undercuts Text Blaze's $3.49 anchor; well under AIPRM's $20 floor |
| Pro Annual | $19/yr (~$1.58/mo) | Highlighted as default/best value; 47% discount drives commitment |
| Founding Lifetime | $39 one-time, capped at first 100 | Serves the one-time-preference segment (survey + category fatigue); cap limits long-term server liability; creates launch urgency |

Rationale: Prompt Box sits between "snippet utility" (Text Blaze) and "AI workflow suite" (AIPRM). Sync + web access + the improver justify $2.99 without triggering the subscription fatigue documented in the niche. Revenue math: 100 Pro annual users = $1,900/yr against Supabase costs of $0 (free tier) to $25/mo at scale.

**Pro features (v1):** cloud sync across browsers/devices (Supabase), web app access (view, edit, organize prompts from any browser), priority support. Later Pro candidates: hosted prompt improver (no API key needed), version history, shared/team libraries (teams likely justify a separate ~$6-8/user tier; AIPRM and Text Blaze Business set that ceiling).

**Stays free deliberately:** markdown preview and BYO-key improver (they cost us nothing, drive installs, and serve the PromptPerfect-refugee window that closes September 1, 2026).

## Architecture

### Accounts + Sync (extension side)
- Supabase project: Postgres + Auth + Row Level Security (every row scoped to user_id).
- `prompts` table mirrors the extension schema: id (uuid), user_id, title, text, tags (jsonb), shortcut, is_favorite, is_sensitive, created_at, updated_at, deleted_at (soft delete for sync tombstones).
- Extension remains offline-first: chrome.storage stays the local source of truth; sync engine pushes/pulls deltas on popup open plus periodic background alarm.
- Conflict resolution v1: last-write-wins by updated_at (documented limitation; per-field merge later if needed).
- Auth in the extension via Supabase email magic link / OAuth, using chrome.identity or a web-app handoff.

### Payments
- ExtensionPay (Stripe under the hood) for v1: handles extension licensing, subscriptions AND one-time purchases, no server code required.
- Migration path to direct Stripe + Supabase edge functions if/when the web app needs unified billing.

### Website (yes, build now; two surfaces, one repo)
- **Marketing site** (promptbox domain TBD; Vercel + React/TS/Vite + Tailwind per stack defaults):
  - Landing + pricing page
  - "PromptPerfect alternative" comparison page (SEO for the refugee window)
  - Privacy policy page (replaces the Gist as the store-listing privacy URL)
  - Changelog/docs
- **Web app** (app.same-domain): Supabase-authed prompt library: view, edit, organize, copy. Ships as a PWA, which becomes the phone story (installable on iOS home screen) without building a native app.
- Native iOS deferred: Promptty holds that position; revisit only if PWA usage on phones proves demand. Keyboard extension is the feature that would justify native.

## Build Order (each gets its own plan via writing-plans)

1. **B1: Marketing site + privacy page** (small; unblocks store-listing privacy URL and the refugee SEO page during the Sept 1 window)
2. **B2: Accounts + sync + payments in the extension** (the revenue core)
3. **B3: Web app prompt library (PWA)** (the second Pro pillar)
4. **3.5.0 extension release (parallel track, free features):** markdown preview + pop-out window, BYO-key "improve this prompt", CSV-import marketing, keystroke-buffer expansion for LinkedIn composer and Google Docs, Layer 2/3 polish items from the v3.4.0 final review

## Feature Backlog (reference)

- Keystroke-buffer trigger + getComposedRanges selection reading (LinkedIn composer, Google Docs) — 3.5.0
- Markdown preview mode + larger pop-out editor — 3.5.0, free
- BYO-key prompt improver ("✨ Improve this prompt", user's own OpenAI/Anthropic key, explicit opt-in disclosure since prompt text leaves the machine) — 3.5.0, free
- Hosted prompt improver — Pro, post-B2
- Version history / prompt recovery — Pro, post-B3
- Shared/team libraries — separate team tier, only on demand signal
- Native iOS app with keyboard extension — deferred, gated on PWA phone usage
- Prompt marketplace/community library — parked (AIPRM owns this; low differentiation)

## Risks and Mitigations

- **Thin demand validation** (survey n=2): mitigated by capped lifetime tier (limits regret), Supabase free tier (near-zero fixed cost), and pricing page analytics on the marketing site.
- **Privacy story dilution**: sync and improver are strictly opt-in; local-only remains the default and the store-listing headline. Privacy policy gains a clear "if you enable sync" section. clipboardWrite precedent: every data-boundary change gets documented before shipping.
- **One-time tier liability**: capped at 100; "lifetime" defined as lifetime of the Pro feature set.
- **Refugee window is short** (Sept 1): B1 + 3.5.0 free features are the time-sensitive items; sequence them first.

## Out of Scope

- AdSense/ads of any kind (policy risk in extensions, negligible revenue at this scale, destroys the privacy positioning).
- Native iOS, teams, marketplace (see backlog gates).
