# Prompt Box Marketing Site (B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship promptboxapp.com: landing, pricing (with waitlist capture), PromptPerfect comparison, privacy policy, and changelog pages, statically rendered for SEO.

**Architecture:** New standalone repo `promptbox-site` (sibling of the extension repo). Next.js App Router with `output: 'export'` produces plain static HTML (prerendered for SEO), styled with Tailwind. A small Cloudflare Worker (`promptbox-waitlist`) reusing the existing `prompt-box-survey` D1 database captures waitlist emails. Hosting on Vercel; DNS stays on Cloudflare.

**Tech Stack:** Next.js 15 (App Router, static export), TypeScript, Tailwind CSS, react-markdown (changelog), Cloudflare Worker + D1 (waitlist), Vercel (hosting), wrangler (worker deploy).

**Spec:** `../specs/2026-07-03-prompt-box-pro-design.md` (extension repo)

## Global Constraints

- Site repo root: `/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/promptbox-site` (own git repo, NOT inside the extension repo).
- Brand: primary orange `#f97316`, secondary teal `#0d9488`, black/white neutrals, Inter font. Bold, clean, modern. Footer credit on every page: "An EZE Media product".
- No em-dashes or double hyphens in any site copy.
- Honesty rule: pages describe only shipped v3.4.0 features as current. Pro tier and prompt improver are always labeled "coming soon" / "on the roadmap". No fabricated testimonials, user counts, or review scores.
- Pricing figures exactly per spec: Free $0; Pro $2.99/mo; Pro Annual $19/yr; Founding Lifetime $39 one-time, first 100.
- No analytics or third-party scripts in v1. The only external call is the waitlist POST.
- Every page exports Next.js `metadata` (title + description) for SEO.
- Chrome Web Store listing URL for CTAs: `https://chromewebstore.google.com/detail/prompt-box` (verify the exact slug from the dashboard during Task 2 and use the real one everywhere).
- Waitlist endpoint URL constant: `https://promptbox-waitlist.lbwalton.workers.dev/waitlist`.
- Verification for each page task: `npm run build` succeeds AND `grep` finds the page's key copy in the exported HTML under `out/`.
- UI implementation: before building any page, the implementer MUST load the `frontend-design:frontend-design` skill; the Magic MCP component tools (`mcp__magic__*`) MAY be used to generate or refine components. Whatever the source, final components must use the brand tokens above and pass the honesty rule.
- Email: waitlist signups dual-write to D1 AND a Resend Audience (Resend account already exists; the survey worker uses it). Launch comms go out via Resend Broadcasts from a promptboxapp.com-verified sender.
- AEO/GEO: every page ships with JSON-LD structured data where applicable, the site serves /llms.txt, and robots.txt must NOT block AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended stay allowed).

---

### Task 1: Scaffold repo, brand tokens, shared layout

**Files:**
- Create: entire `promptbox-site` repo via create-next-app
- Modify: `next.config.ts`, `app/globals.css`, `app/layout.tsx`
- Create: `components/SiteHeader.tsx`, `components/SiteFooter.tsx`

**Interfaces:**
- Produces: layout shell every page renders inside; Tailwind theme tokens `brand` (#f97316) and `brand-teal` (#0d9488); `SiteHeader` links to `/`, `/pricing`, `/changelog`; `SiteFooter` links to `/privacy`, `/promptperfect-alternative`, Chrome Web Store, and carries the EZE Media credit.

- [ ] **Step 1: Scaffold**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box"
npx create-next-app@latest promptbox-site --typescript --tailwind --app --no-src-dir --eslint --no-turbopack --import-alias "@/*" --yes
cd promptbox-site
```

- [ ] **Step 2: Static export config**

Replace `next.config.ts` contents with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
```

- [ ] **Step 3: Brand tokens**

In `app/globals.css`, after the tailwind import line, add:

```css
@theme {
  --color-brand: #f97316;
  --color-brand-dark: #c2590c;
  --color-brand-teal: #0d9488;
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
```

(If the scaffold generated Tailwind v3 with `tailwind.config.ts` instead of the v4 `@theme` syntax, put the same colors under `theme.extend.colors` as `brand`, `brand-dark`, `brand-teal` and the font under `fontFamily.sans`.)

- [ ] **Step 4: Header and footer components**

Create `components/SiteHeader.tsx`:

```tsx
import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="border-b border-zinc-200">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="inline-block h-7 w-7 rounded-md bg-brand" aria-hidden />
          Prompt Box
        </Link>
        <div className="flex items-center gap-6 text-sm font-medium">
          <Link href="/pricing" className="hover:text-brand">Pricing</Link>
          <Link href="/changelog" className="hover:text-brand">Changelog</Link>
          <a
            href="https://chromewebstore.google.com/detail/prompt-box"
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
          >
            Add to Chrome
          </a>
        </div>
      </nav>
    </header>
  );
}
```

Create `components/SiteFooter.tsx`:

```tsx
import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-zinc-200 py-10 text-sm text-zinc-500">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Prompt Box. An EZE Media product.</p>
        <div className="flex gap-5">
          <Link href="/privacy" className="hover:text-brand">Privacy</Link>
          <Link href="/promptperfect-alternative" className="hover:text-brand">PromptPerfect alternative</Link>
          <a href="https://chromewebstore.google.com/detail/prompt-box" className="hover:text-brand">Chrome Web Store</a>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 5: Root layout**

Replace `app/layout.tsx` body with the shell (keep the scaffold's font wiring if it uses `next/font`; otherwise the CSS font stack covers it):

```tsx
import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: { default: "Prompt Box: your AI prompts, everywhere you type", template: "%s | Prompt Box" },
  description:
    "Store, organize, and expand your AI prompts in any text field. Local-first Chrome extension with tags, shortcuts, and one-click copy.",
  metadataBase: new URL("https://promptboxapp.com"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans text-zinc-900 antialiased">
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-4">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds; `out/index.html` exists.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold promptbox-site with brand tokens and layout shell"
```

---

### Task 2: Landing page

**Files:**
- Modify: `app/page.tsx` (replace scaffold page entirely)

**Interfaces:**
- Consumes: layout shell from Task 1.
- Produces: `/` with hero, six-feature grid, privacy section, install CTA.

- [ ] **Step 1: Verify the real Chrome Web Store URL**

Open the Chrome Web Store Developer Dashboard listing for Prompt Box and copy the public listing URL. Use it in this task and update the header/footer links from Task 1 if the slug differs.

- [ ] **Step 2: Write the page**

Replace `app/page.tsx` with:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prompt Box: your AI prompts, everywhere you type",
  description:
    "A local-first Chrome extension for saving, organizing, and expanding AI prompts. Type a shortcut in any text field and your full prompt appears.",
};

const FEATURES = [
  { title: "Text expansion everywhere", body: "Type a shortcut and press Space, Tab, or Enter. Your full prompt lands in ChatGPT, Claude, Gmail, search bars, and sign-in fields." },
  { title: "Local-first and private", body: "Your prompts live in your browser. No account required, no servers, no analytics, no tracking." },
  { title: "Organize with tags", body: "Tag, filter, sort, and favorite your library. Find the right prompt in seconds." },
  { title: "One-click copy", body: "Click any saved prompt and it is on your clipboard, ready to paste anywhere." },
  { title: "Right-click to save", body: "Highlight great prompt text on any page and save it to your library from the context menu." },
  { title: "Import and export", body: "Bring your prompt library from any tool with CSV import. Your data stays portable, always." },
] as const;

export default function Home() {
  return (
    <>
      <section className="py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-extrabold tracking-tight">
          Your AI prompts, <span className="text-brand">everywhere you type</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600">
          Prompt Box is a local-first Chrome extension that stores your best AI prompts and expands
          them into any text field with a keyboard shortcut. No account. No servers. No tracking.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <a href="https://chromewebstore.google.com/detail/prompt-box" className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark">
            Add to Chrome, it is free
          </a>
          <a href="/pricing/" className="rounded-lg border border-zinc-300 px-6 py-3 font-semibold hover:border-brand hover:text-brand">
            See Pro pricing
          </a>
        </div>
      </section>

      <section className="grid gap-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-zinc-200 p-6">
            <h2 className="font-bold">{f.title}</h2>
            <p className="mt-2 text-sm text-zinc-600">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-zinc-900 px-8 py-14 text-center text-white">
        <h2 className="text-3xl font-bold">Private by default</h2>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-300">
          Everything is stored locally in your browser. The extension makes no external connections
          unless you explicitly ask it to. Read the full privacy policy for the details.
        </p>
        <a href="/privacy/" className="mt-6 inline-block rounded-lg bg-brand-teal px-5 py-2.5 font-semibold hover:opacity-90">
          Read the privacy policy
        </a>
      </section>
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run build && grep -o "everywhere you type" out/index.html | head -1`
Expected: build passes; grep prints `everywhere you type`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: landing page with hero, features, privacy section"
```

---

### Task 3: Waitlist worker (Cloudflare Worker + D1)

**Files:**
- Create: `workers/waitlist/wrangler.toml`
- Create: `workers/waitlist/src/index.js`

**Interfaces:**
- Consumes: existing D1 database `prompt-box-survey` (id `85a0ab57-f81f-48b6-83f7-bd7dafa256d3`).
- Produces: `POST https://promptbox-waitlist.lbwalton.workers.dev/waitlist` accepting JSON `{ email: string, plan: "monthly" | "annual" | "lifetime" }`, returning `{ ok: true }` on success, 400 on invalid email. Task 4's form posts here.

- [ ] **Step 1: Create the D1 table** (via the existing database; use wrangler d1 execute or the Cloudflare MCP query tool)

```sql
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  plan TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Worker config**

Create `workers/waitlist/wrangler.toml`:

```toml
name = "promptbox-waitlist"
main = "src/index.js"
compatibility_date = "2026-06-01"

[[d1_databases]]
binding = "DB"
database_name = "prompt-box-survey"
database_id = "85a0ab57-f81f-48b6-83f7-bd7dafa256d3"
```

- [ ] **Step 3: Worker code**

Create `workers/waitlist/src/index.js`:

```js
const ALLOWED_ORIGINS = ["https://promptboxapp.com", "https://www.promptboxapp.com", "http://localhost:3000"];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    if (url.pathname === "/waitlist" && request.method === "POST") {
      try {
        const body = await request.json();
        const clean = (v, max) => (typeof v === "string" ? v.slice(0, max).trim() : "");
        const email = clean(body.email, 200).toLowerCase();
        const plan = clean(body.plan, 40);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return Response.json({ ok: false, error: "invalid email" }, { status: 400, headers: cors });
        }
        await env.DB.prepare("INSERT OR IGNORE INTO waitlist (email, plan) VALUES (?, ?)").bind(email, plan).run();
        // Best-effort dual-write to the Resend audience so Broadcasts can reach the list.
        // D1 stays the source of truth; a Resend failure must never fail the signup.
        if (env.RESEND_API_KEY && env.RESEND_AUDIENCE_ID) {
          try {
            await fetch(`https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
              method: "POST",
              headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ email, unsubscribed: false }),
            });
          } catch {}
        }
        return Response.json({ ok: true }, { headers: cors });
      } catch {
        return Response.json({ ok: false }, { status: 500, headers: cors });
      }
    }
    return new Response("Not found", { status: 404 });
  },
};
```

- [ ] **Step 4: Resend audience + secrets**

Create the audience (reuse the same RESEND_API_KEY the survey worker uses; retrieve it from the survey worker's secrets or the Resend dashboard):

```bash
curl -s -X POST https://api.resend.com/audiences -H "Authorization: Bearer $RESEND_API_KEY" -H "Content-Type: application/json" -d '{"name":"Prompt Box Pro waitlist"}'
```

Note the returned audience `id`. Then from `workers/waitlist`:

```bash
npx wrangler secret put RESEND_API_KEY      # paste the key when prompted
npx wrangler secret put RESEND_AUDIENCE_ID  # paste the audience id
```

Domain note for real sends (user action, before the first broadcast, not blocking this task): verify promptboxapp.com as a sending domain in the Resend dashboard and add the SPF/DKIM records it shows to Cloudflare DNS, so broadcasts come from hello@promptboxapp.com.

- [ ] **Step 5: Deploy and verify**

```bash
cd workers/waitlist
npx wrangler whoami   # confirm the Cloudflare account is authed; if not, STOP and report NEEDS_CONTEXT (login is interactive)
npx wrangler deploy
curl -s -X POST https://promptbox-waitlist.lbwalton.workers.dev/waitlist -H "Content-Type: application/json" -d '{"email":"plan-test@example.com","plan":"annual"}'
```

Expected: `{"ok":true}`. Then verify the row and clean it up:

```bash
npx wrangler d1 execute prompt-box-survey --remote --command "SELECT email, plan FROM waitlist WHERE email='plan-test@example.com'"
npx wrangler d1 execute prompt-box-survey --remote --command "DELETE FROM waitlist WHERE email='plan-test@example.com'"
```

After the curl test, also confirm the contact appears in the Resend audience (dashboard or `GET /audiences/{id}/contacts`), then delete it there along with the D1 row.

- [ ] **Step 6: Commit**

```bash
cd ../.. && git add workers && git commit -m "feat: waitlist worker with D1 storage, Resend audience dual-write, CORS"
```

---

### Task 4: Pricing page with waitlist form

**Files:**
- Create: `app/pricing/page.tsx`
- Create: `components/WaitlistForm.tsx`

**Interfaces:**
- Consumes: waitlist endpoint from Task 3 (exact URL in Global Constraints).
- Produces: `/pricing/` with the four-tier table and a working email capture.

- [ ] **Step 1: Waitlist form component (client component)**

Create `components/WaitlistForm.tsx`:

```tsx
"use client";

import { useState } from "react";

const ENDPOINT = "https://promptbox-waitlist.lbwalton.workers.dev/waitlist";

export default function WaitlistForm({ defaultPlan }: { defaultPlan: string }) {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState(defaultPlan);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plan }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="font-semibold text-brand-teal">You are on the list. We will email you at launch with founding pricing.</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="flex-1 rounded-lg border border-zinc-300 px-4 py-3"
        aria-label="Email address"
      />
      <select value={plan} onChange={(e) => setPlan(e.target.value)} className="rounded-lg border border-zinc-300 px-3 py-3" aria-label="Plan interest">
        <option value="annual">Annual $19/yr</option>
        <option value="monthly">Monthly $2.99/mo</option>
        <option value="lifetime">Founding Lifetime $39</option>
      </select>
      <button type="submit" disabled={state === "sending"} className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
        {state === "sending" ? "Joining..." : "Join the waitlist"}
      </button>
      {state === "error" && <p className="text-sm text-red-600">Something went wrong. Please try again.</p>}
    </form>
  );
}
```

- [ ] **Step 2: Pricing page**

Create `app/pricing/page.tsx`:

```tsx
import type { Metadata } from "next";
import WaitlistForm from "@/components/WaitlistForm";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Prompt Box is free forever for local use. Prompt Box Pro adds cloud sync and web access: $2.99/mo, $19/yr, or a $39 founding lifetime deal for the first 100 members.",
};

const TIERS = [
  { name: "Free", price: "$0", cadence: "forever", highlight: false, features: ["Unlimited prompts, stored locally", "Text expansion everywhere you type", "Tags, search, favorites", "CSV import and export", "Same-browser sync via Chrome"] },
  { name: "Pro Monthly", price: "$2.99", cadence: "per month", highlight: false, features: ["Everything in Free", "Cloud sync across browsers and devices", "Web app access to your library", "Priority support"] },
  { name: "Pro Annual", price: "$19", cadence: "per year", highlight: true, features: ["Everything in Pro Monthly", "About $1.58 per month", "Best value"] },
  { name: "Founding Lifetime", price: "$39", cadence: "one time, first 100 only", highlight: false, features: ["Everything in Pro, for the lifetime of the Pro feature set", "Founding member badge", "Locks in before subscriptions open"] },
] as const;

export default function Pricing() {
  return (
    <>
      <section className="py-16 text-center">
        <h1 className="text-4xl font-extrabold">Simple pricing, private core</h1>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-600">
          The local extension is free forever. Pro adds cloud sync and web access, and it is launching soon.
          Join the waitlist to get founding pricing before anyone else.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-4">
        {TIERS.map((t) => (
          <div key={t.name} className={`rounded-2xl border p-6 ${t.highlight ? "border-brand shadow-lg" : "border-zinc-200"}`}>
            {t.highlight && <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand">Best value</p>}
            <h2 className="text-lg font-bold">{t.name}</h2>
            <p className="mt-2 text-3xl font-extrabold">{t.price}</p>
            <p className="text-sm text-zinc-500">{t.cadence}</p>
            <ul className="mt-4 space-y-2 text-sm text-zinc-600">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2"><span className="text-brand-teal">✓</span>{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-16 max-w-2xl rounded-2xl border border-zinc-200 p-8">
        <h2 className="text-2xl font-bold">Pro is launching soon</h2>
        <p className="mt-2 mb-6 text-zinc-600">
          Only 100 Founding Lifetime spots will exist. Waitlist members hear first.
        </p>
        <WaitlistForm defaultPlan="annual" />
        <p className="mt-3 text-xs text-zinc-500">
          Your email is stored so we can contact you about the Prompt Box Pro launch, and for nothing else.
        </p>
      </section>
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run build && grep -o "Founding Lifetime" out/pricing/index.html | head -1`
Expected: `Founding Lifetime`. Also run `npm run dev`, open http://localhost:3000/pricing, submit a test email, confirm the success message, then delete the row as in Task 3 Step 4.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: pricing page with tier table and waitlist capture"
```

---

### Task 5: Privacy policy and changelog pages

**Files:**
- Create: `app/privacy/page.tsx`
- Create: `app/changelog/page.tsx`
- Create: `content/CHANGELOG.md` (synced copy)
- Create: `scripts/sync-changelog.mjs`
- Modify: `package.json` (prebuild hook)

**Interfaces:**
- Consumes: extension repo's `CHANGELOG.md` at `../prompt-box-extension/CHANGELOG.md`.
- Produces: `/privacy/` (the URL that will replace the Gist in the store listing) and `/changelog/`.

- [ ] **Step 1: Changelog sync script**

Create `scripts/sync-changelog.mjs`:

```js
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const src = new URL("../../prompt-box-extension/CHANGELOG.md", import.meta.url);
const destDir = new URL("../content/", import.meta.url);
const dest = new URL("../content/CHANGELOG.md", import.meta.url);

mkdirSync(destDir, { recursive: true });
if (existsSync(src)) {
  copyFileSync(src, dest);
  console.log("Synced CHANGELOG.md from extension repo");
} else {
  console.log("Extension CHANGELOG not found; keeping committed copy");
}
```

In `package.json` scripts add: `"prebuild": "node scripts/sync-changelog.mjs"`. Run `node scripts/sync-changelog.mjs` once and commit the synced `content/CHANGELOG.md`.

- [ ] **Step 2: Changelog page**

`npm install react-markdown`. Create `app/changelog/page.tsx`:

```tsx
import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ReactMarkdown from "react-markdown";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What's new in Prompt Box: release notes for every version.",
};

export default function Changelog() {
  const md = readFileSync(join(process.cwd(), "content", "CHANGELOG.md"), "utf8");
  return (
    <article className="prose prose-zinc mx-auto max-w-3xl py-16">
      <h1>Changelog</h1>
      <ReactMarkdown>{md}</ReactMarkdown>
    </article>
  );
}
```

Install the typography plugin for `prose` classes: `npm install @tailwindcss/typography`, and register it (Tailwind v4: add `@plugin "@tailwindcss/typography";` to `globals.css`; v3: add to `plugins` in the config).

- [ ] **Step 3: Privacy policy page**

Create `app/privacy/page.tsx` with this exact policy content (adapted from `prompt-box-privacy-practices.md`, v3.4.0 behavior):

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Prompt Box is local-first: your prompts stay in your browser. Full details on data storage, permissions, and the rare moments data leaves your device.",
};

export default function Privacy() {
  return (
    <article className="prose prose-zinc mx-auto max-w-3xl py-16">
      <h1>Prompt Box Privacy Policy</h1>
      <p><em>Effective: July 3, 2026. Applies to Prompt Box v3.4.0 and later.</em></p>

      <h2>The short version</h2>
      <p>Prompt Box stores your prompts in your own browser. It has no accounts, no servers of its own, no analytics, and no trackers. By default, nothing you type or save ever leaves your device.</p>

      <h2>What Prompt Box stores, and where</h2>
      <ul>
        <li><strong>Your prompt library</strong> (titles, prompt text, tags, shortcuts, favorites) is stored in Chrome extension storage on your device. If you choose Chrome Sync storage, Google syncs it between your own Chrome profiles the same way it syncs bookmarks.</li>
        <li><strong>Settings</strong> (theme, filters, storage preference) are stored the same way.</li>
        <li>Prompt Box never stores your keystrokes, browsing history, or page content.</li>
      </ul>

      <h2>When data leaves your device</h2>
      <ul>
        <li><strong>Clipboard, on your action only.</strong> When you click Copy, or when a site blocks text expansion and Prompt Box falls back to copying the prompt so you can paste it, your prompt is written to your clipboard. Prompt Box never reads your clipboard.</li>
        <li><strong>Survey, on your action only.</strong> If you choose to take our feedback survey, your answers are sent to our survey service. Declining or ignoring it sends nothing.</li>
        <li><strong>Waitlist, on your action only.</strong> If you join the Pro waitlist on this website, we store your email address (processed by Resend, our email delivery provider) to contact you about the Prompt Box Pro launch, and for nothing else. One email to us removes you from the list.</li>
      </ul>

      <h2>Permissions the extension uses</h2>
      <ul>
        <li><strong>storage</strong>: saving your prompt library and settings.</li>
        <li><strong>activeTab and context menus</strong>: the right-click "Save to Prompt Box" action.</li>
        <li><strong>clipboardWrite</strong>: copying prompts when you click Copy, and the expansion fallback described above.</li>
        <li><strong>Content script on web pages</strong>: watches only for your own shortcut keystroke patterns inside text fields so it can expand them. It never records what you type, and it never touches password fields.</li>
      </ul>

      <h2>What we never do</h2>
      <ul>
        <li>No selling or sharing of data. There is no data to sell.</li>
        <li>No analytics, no fingerprinting, no ads.</li>
        <li>No reading of your clipboard, history, or page content.</li>
      </ul>

      <h2>Your data, your control</h2>
      <p>Export your entire library as CSV at any time from Settings. Uninstalling the extension deletes all locally stored data. To remove a waitlist email, contact us and we will delete it.</p>

      <h2>Contact</h2>
      <p>Questions or data requests: lbwalton@gmail.com, or the support tab on the Chrome Web Store listing.</p>

      <h2>Changes</h2>
      <p>If a future version changes what data is stored or transmitted (for example, the optional Pro cloud sync), this policy will be updated before that version ships, with the change noted here.</p>
    </article>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run build && grep -o "never reads your clipboard" out/privacy/index.html | head -1 && grep -o "Changelog" out/changelog/index.html | head -1`
Expected: both greps print their strings.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: privacy policy and changelog pages"
```

---

### Task 6: PromptPerfect comparison page + SEO plumbing

**Files:**
- Create: `app/promptperfect-alternative/page.tsx`
- Create: `app/sitemap.ts`, `app/robots.ts`

**Interfaces:**
- Consumes: layout shell.
- Produces: `/promptperfect-alternative/` targeting the "PromptPerfect alternative" search phrase; sitemap and robots for the whole site.

- [ ] **Step 1: Comparison page**

Create `app/promptperfect-alternative/page.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PromptPerfect Alternative: Prompt Box",
  description: "PromptPerfect shuts down September 1, 2026. Prompt Box is a free, local-first prompt library with text expansion. Import your prompts in one CSV and keep working.",
};

const ROWS = [
  ["Saved prompt library", "Yes", "Yes, local-first"],
  ["Works across AI tools (ChatGPT, Claude, Gemini, image models)", "Yes", "Yes, expansion works in any text field"],
  ["Text expansion shortcuts", "No", "Yes, type a shortcut in any site"],
  ["Prompt optimization engine", "Yes", "On the roadmap: an improve-this-prompt assistant using your own API key"],
  ["Import your existing library", "N/A", "Yes, CSV import in one step"],
  ["Requires an account", "Yes", "No"],
  ["Price", "Discontinued", "Free, with optional Pro sync coming soon"],
] as const;

export default function PromptPerfectAlternative() {
  return (
    <article className="mx-auto max-w-3xl py-16">
      <h1 className="text-4xl font-extrabold">Looking for a PromptPerfect alternative?</h1>
      <p className="mt-4 text-zinc-600">
        PromptPerfect closed signups in June 2026 and shuts down on September 1, 2026. If you kept
        your prompt library there, you need a new home for it. Prompt Box is a free, local-first
        Chrome extension: your prompts live in your browser, organized with tags, and available in
        any text field through expansion shortcuts.
      </p>

      <h2 className="mt-10 text-2xl font-bold">Side by side</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300">
              <th className="py-2 pr-4"></th>
              <th className="py-2 pr-4">PromptPerfect</th>
              <th className="py-2 text-brand">Prompt Box</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([feature, pp, pb]) => (
              <tr key={feature} className="border-b border-zinc-100">
                <td className="py-3 pr-4 font-medium">{feature}</td>
                <td className="py-3 pr-4 text-zinc-500">{pp}</td>
                <td className="py-3">{pb}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-2xl font-bold">Moving your prompts takes one file</h2>
      <ol className="mt-4 list-decimal space-y-2 pl-6 text-zinc-600">
        <li>Export your prompts from PromptPerfect (or paste them into a simple CSV with title and text columns).</li>
        <li>Install Prompt Box from the Chrome Web Store.</li>
        <li>Open Settings, choose Import, and select your CSV. Done.</li>
      </ol>

      <a href="https://chromewebstore.google.com/detail/prompt-box" className="mt-8 inline-block rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark">
        Get Prompt Box free
      </a>
    </article>
  );
}
```

- [ ] **Step 2: Sitemap and robots**

Create `app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://promptboxapp.com";
  return ["", "/pricing", "/privacy", "/changelog", "/promptperfect-alternative"].map((p) => ({
    url: `${base}${p}/`,
    lastModified: new Date(),
  }));
}
```

Create `app/robots.ts`:

```ts
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: "https://promptboxapp.com/sitemap.xml" };
}
```

- [ ] **Step 3: Verify**

Run: `npm run build && grep -o "September 1, 2026" out/promptperfect-alternative/index.html | head -1 && cat out/robots.txt`
Expected: grep prints the date; robots.txt lists the sitemap.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: PromptPerfect comparison page, sitemap, robots"
```

---

### Task 7: SEO / AEO / GEO hardening

**Files:**
- Create: `public/llms.txt`, `public/og.png` (from `scripts/og-template.svg`)
- Create: `components/JsonLd.tsx`, `components/Faq.tsx`
- Modify: `app/layout.tsx` (OpenGraph/Twitter metadata), `app/pricing/page.tsx`, `app/promptperfect-alternative/page.tsx` (FAQ sections + JSON-LD)

**Interfaces:**
- Consumes: all pages from Tasks 2-6.
- Produces: `JsonLd({ data })` component rendering a `<script type="application/ld+json">`; `Faq({ items })` component rendering AEO-friendly question/answer blocks AND emitting FAQPage JSON-LD from the same items array (single source, no drift).

- [ ] **Step 1: llms.txt**

Create `public/llms.txt`:

```
# Prompt Box

> Prompt Box is a local-first Chrome extension for saving, organizing, and expanding AI prompts. Type a shortcut in any text field (ChatGPT, Claude, Gmail, search bars) and the full prompt appears. Free forever for local use; Prompt Box Pro (cloud sync + web app) is launching soon at $2.99/mo, $19/yr, or a $39 founding lifetime deal for the first 100 members.

Prompt Box is an EZE Media product. Privacy-first: no accounts, no analytics, no tracking; prompts live in the user's browser.

## Pages

- [Home](https://promptboxapp.com/): what Prompt Box does, feature overview
- [Pricing](https://promptboxapp.com/pricing/): Free vs Pro tiers, founding lifetime offer, waitlist
- [PromptPerfect alternative](https://promptboxapp.com/promptperfect-alternative/): migration guide for PromptPerfect users (service shuts down September 1, 2026)
- [Privacy policy](https://promptboxapp.com/privacy/): full data handling details
- [Changelog](https://promptboxapp.com/changelog/): release notes for every version

## Facts

- Platform: Chrome extension (Manifest V3), works on Chromium browsers
- Storage: local browser storage by default; optional Chrome Sync
- Text expansion triggers: Space, Tab, Enter in any text field
- Import/export: CSV
- Install: https://chromewebstore.google.com/detail/prompt-box
```

- [ ] **Step 2: JsonLd and Faq components**

Create `components/JsonLd.tsx`:

```tsx
export default function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
```

(This is the one sanctioned use of dangerouslySetInnerHTML: the input is our own JSON.stringify output, never user content.)

Create `components/Faq.tsx`:

```tsx
import JsonLd from "@/components/JsonLd";

export type FaqItem = { q: string; a: string };

export default function Faq({ items }: { items: FaqItem[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  };
  return (
    <section className="mx-auto mt-16 max-w-3xl">
      <h2 className="text-2xl font-bold">Frequently asked questions</h2>
      <dl className="mt-6 space-y-6">
        {items.map((i) => (
          <div key={i.q}>
            <dt className="font-semibold">{i.q}</dt>
            <dd className="mt-1 text-zinc-600">{i.a}</dd>
          </div>
        ))}
      </dl>
      <JsonLd data={jsonLd} />
    </section>
  );
}
```

- [ ] **Step 3: Wire FAQs and SoftwareApplication schema**

In `app/pricing/page.tsx`, import Faq and JsonLd, and append before the closing fragment:

```tsx
<JsonLd
  data={{
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Prompt Box",
    operatingSystem: "Chrome",
    applicationCategory: "BrowserApplication",
    description: "Local-first Chrome extension for saving, organizing, and expanding AI prompts.",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro Monthly", price: "2.99", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro Annual", price: "19", priceCurrency: "USD" },
      { "@type": "Offer", name: "Founding Lifetime", price: "39", priceCurrency: "USD" },
    ],
  }}
/>
<Faq
  items={[
    { q: "Is Prompt Box free?", a: "Yes. The local extension is free forever: unlimited prompts, text expansion, tags, and CSV import/export. Pro adds cloud sync and web access." },
    { q: "What does Prompt Box Pro cost?", a: "Pro is $2.99 per month or $19 per year. The first 100 members can get a $39 one-time Founding Lifetime deal instead." },
    { q: "Do I need an account to use Prompt Box?", a: "No. The free extension works entirely in your browser with no account, no servers, and no tracking." },
    { q: "What happens to my prompts if I uninstall?", a: "Prompts are stored locally, so export them to CSV first from Settings. Uninstalling deletes local data." },
  ]}
/>
```

In `app/promptperfect-alternative/page.tsx`, append:

```tsx
<Faq
  items={[
    { q: "When does PromptPerfect shut down?", a: "PromptPerfect closed new signups in June 2026 and shuts down entirely on September 1, 2026." },
    { q: "Can I import my PromptPerfect prompts into Prompt Box?", a: "Yes. Put your prompts in a CSV with title and text columns, then use Settings, Import in the Prompt Box extension. It takes one step." },
    { q: "Does Prompt Box optimize prompts like PromptPerfect did?", a: "Not yet. An improve-this-prompt assistant using your own API key is on the roadmap. Prompt Box today focuses on the library and expansion workflow." },
  ]}
/>
```

(Add the imports at the top of each file: `import Faq from "@/components/Faq";` and for pricing also `import JsonLd from "@/components/JsonLd";`.)

- [ ] **Step 4: OpenGraph metadata + OG image**

Create `scripts/og-template.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#18181b"/>
  <rect x="80" y="80" width="96" height="96" rx="20" fill="#f97316"/>
  <text x="80" y="320" font-family="Inter, Arial, sans-serif" font-size="72" font-weight="800" fill="#ffffff">Prompt Box</text>
  <text x="80" y="400" font-family="Inter, Arial, sans-serif" font-size="36" fill="#a1a1aa">Your AI prompts, everywhere you type.</text>
  <text x="80" y="530" font-family="Inter, Arial, sans-serif" font-size="28" fill="#0d9488">promptboxapp.com</text>
</svg>
```

Generate the PNG (sharp is available in the extension repo; run from there or `npm i -D sharp` here):

```bash
node -e "require('sharp')('scripts/og-template.svg').resize(1200,630).png().toFile('public/og.png').then(()=>console.log('og.png written'))"
```

In `app/layout.tsx` metadata, add:

```ts
openGraph: {
  title: "Prompt Box: your AI prompts, everywhere you type",
  description: "Local-first Chrome extension for saving, organizing, and expanding AI prompts.",
  url: "https://promptboxapp.com",
  siteName: "Prompt Box",
  images: [{ url: "/og.png", width: 1200, height: 630 }],
  type: "website",
},
twitter: { card: "summary_large_image", images: ["/og.png"] },
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run build
grep -o "application/ld+json" out/pricing/index.html | head -1
grep -o "FAQPage" out/promptperfect-alternative/index.html | head -1
grep -o "og:image" out/index.html | head -1
test -f out/llms.txt && echo llms-ok
test -f out/og.png && echo og-ok
```

Expected: all five checks print.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: llms.txt, JSON-LD, FAQ blocks, OpenGraph for SEO/AEO/GEO"
```

---

### Task 8: Deploy to Vercel + domain + wrap-up

**Files:**
- No code changes expected; deployment and documentation.

**Interfaces:**
- Consumes: the finished static site.
- Produces: live site at promptboxapp.com.

- [ ] **Step 1: Create GitHub repo and push** (LB's account, repo name `promptbox-site`)

```bash
gh repo create promptbox-site --private --source . --push
```

- [ ] **Step 2: Deploy to Vercel**

Use the Vercel MCP deploy tool or `npx vercel --prod` (framework preset: Next.js; it will respect the static export). Confirm the `*.vercel.app` URL renders all five pages.

- [ ] **Step 3: Attach the domain**

In Vercel project settings, add `promptboxapp.com` and `www.promptboxapp.com`. Then in Cloudflare DNS for promptboxapp.com, create the records Vercel specifies (typically apex `A 216.198.79.65` or CNAME flattening to `cname.vercel-dns.com`, and `www` CNAME `cname.vercel-dns.com`), set to DNS-only (grey cloud) to avoid proxy certificate conflicts. Wait for Vercel to show the domain as valid; verify `curl -sI https://promptboxapp.com | head -3` returns 200.

- [ ] **Step 4: Post-launch checklist (report, do not silently do)**

- Store listing: on the next extension submission, replace the privacy Gist URL with `https://promptboxapp.com/privacy` and add the site URL to the listing.
- Update `prompt-box-store-listing.md` and the Pro spec status accordingly.
- Lighthouse pass on the live site (target 90+ on Performance, SEO, Accessibility).
- Submit the sitemap in Google Search Console (user action; needs his Google account).
- Verify https://promptboxapp.com/llms.txt and /og.png resolve on the live domain; validate JSON-LD with Google's Rich Results test.
- Verify promptboxapp.com as a Resend sending domain (SPF/DKIM records into Cloudflare DNS) before the first broadcast.
- Extension follow-up (3.5.0 track): swap the in-extension survey banner for a Pro waitlist banner linking to https://promptboxapp.com/pricing/.

---

## Self-Review Notes

- Spec coverage: landing (Task 2), pricing per spec figures + waitlist (Tasks 3-4), privacy page replacing Gist (Task 5), changelog (Task 5), PromptPerfect SEO page in the Sept 1 window (Task 6), Vercel + Cloudflare DNS (Task 7). Web app and payments are B2/B3, correctly absent.
- Honesty rule verified: pricing page says "launching soon"; comparison page labels the improver "on the roadmap"; no invented stats.
- Type consistency: WaitlistForm consumes the Task 3 endpoint and plan values (`monthly | annual | lifetime`); D1 `waitlist` schema matches the worker INSERT.
- No placeholders: all page copy, worker code, configs, and commands are complete. Intentional stops needing LB's accounts: wrangler auth (Task 3), Resend domain verification, Search Console (Task 8).
- Design tooling: implementers load frontend-design skill per Global Constraints; Magic MCP optional for components.
