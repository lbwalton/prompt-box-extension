# Prompt Box: Chrome Web Store — Privacy Practices

## Privacy Policy URL

**Hosted:** https://promptboxapp.com/privacy
**Source:** `promptbox-site` repo, `app/privacy/page.tsx` (deployed via Vercel)
**Chrome Web Store field:** Privacy > Privacy policy URL

Update the privacy page in the `promptbox-site` repo whenever data handling changes, then redeploy. The URL itself is permanent.

> Legacy: the policy previously lived at a GitHub Gist (gist.github.com/lbwalton/7405633b075268bb14a33378eeaba4d1). As of 2026-07-04 the canonical policy is the site page above. Update the store listing's Privacy policy URL field to the new URL on the next submission.

---

This file contains the content for the **Privacy Practices** tab in the Chrome Web Store Developer Dashboard. Keep it in sync with the extension whenever permissions, data handling, or external connections change.

---

## Single Purpose Description

Prompt Box allows users to save, organize, and quickly access AI prompts and text snippets from any webpage, and expand saved snippets using custom shortcut triggers for use with ChatGPT, Claude, and other AI tools.

---

## Permission Justifications

### `storage`
Used to save and retrieve the user's prompt library, tags, filter settings, theme preference, storage location preference, and survey dismissal state using `chrome.storage.local` and `chrome.storage.sync`. No data is sent to any external server through this permission.

### `activeTab`
Used only when the user explicitly right-clicks selected text on a webpage to save it via the "Save to Prompt Box" context menu option. The extension reads the selected text from the active tab at that moment — it does not run continuously or monitor tab activity.

### `contextMenus`
Used to add a "Save to Prompt Box" item to the browser's right-click context menu, allowing users to save highlighted text directly from any webpage.

### `clipboardWrite`

Used only as a last-resort fallback for text expansion. When a site's editor blocks direct text insertion, the expanded prompt is copied to the user's clipboard so they can paste it manually, and an on-page notice tells them to do so. The clipboard is written only in direct response to the user typing one of their own saved shortcuts. The extension never reads the clipboard, and nothing is sent anywhere.

### Host Permission — `<all_urls>` (via content script)
A content script (`content.js`) runs on all pages to detect when the user types a saved text expansion trigger keyword in an input field or text editor, and replaces it with the full saved text. This requires access to all URLs because text expansion must work wherever the user types — ChatGPT, Gmail, Google Docs, Notion, Slack, etc. The content script:
- Only reads keystrokes inside text input fields
- Never reads page content, form values, or sensitive fields
- Never transmits any data externally
- Only activates when a trigger keyword is detected

### `identity`

Used only to sign the user in with Google when they choose to create a Prompt Box Pro account. It launches the standard Google sign-in and returns an authentication token. Prompt Box never sees the user's Google password.

### `alarms`

Used only when Prompt Box Pro cloud sync is enabled, to periodically check our
Supabase backend for changes made on your other devices so your library stays
up to date. It runs no more than once every few minutes and does nothing for
signed-out or local-only users.

### Host permission — `https://jmxmtiqkpegqywderwkt.supabase.co/*`

Used only when the user has signed in to Prompt Box Pro. For account sign-in, and
— when the user turns on Cloud sync — to store and retrieve their prompts on our
Supabase backend (encrypted in transit and at rest). Nothing is sent here for
signed-out or local-only users; local-only remains the default.

---

## Data Collection & Use

### Data stored locally (`chrome.storage.local`)
- Prompt library (titles, text, tags, shortcuts)
- Storage location preference (`sync`, `local`, or `cloud`)
- Temporary selected text (passed from content script to popup, cleared immediately after use)
- **Prompt Box Pro only** (present only after the user signs in): the sign-in session
  (`pb_session` — access/refresh tokens, account email, account id), a local copy of the
  subscription status (`pb_is_pro`, `pb_plan`), the cloud-sync bookkeeping needed to sync
  reliably (`pb_last_push`, `pb_last_pull` cursors, `pb_tombstones` — a queue of deletions
  waiting to reach the server, and `pb_sync_user` — which account the bookkeeping belongs to),
  and whether the user dismissed the cloud-sync offer banner (`pb_sync_offer_dismissed`).
  All of these stay on the device and are cleared on sign-out (session, status) or kept only
  as sync bookkeeping; none are readable by websites.

### Data stored via Chrome Sync (`chrome.storage.sync`)
- Prompt library (when user selects Chrome Sync mode)
- Tags, filter settings, theme preference
- Survey dismissal state (so the survey only shows once across all devices)

This data is managed entirely by Chrome's built-in storage APIs. When a user chooses Chrome Sync, their data travels through Google's sync infrastructure under Google's privacy policy — no Prompt Box servers are involved.

### External Connections

**Survey endpoint** (`https://prompt-box-survey.lbwalton.workers.dev`):
- Triggered only when the user explicitly clicks "Yes, tell me more" or "No thanks" in the optional demand survey banner
- The banner is shown once to users with 3+ saved prompts and is never shown again after any interaction
- Data sent: survey response (yes/no/dismiss) and a timestamp
- No personally identifiable information is collected or transmitted
- The survey endpoint is a Cloudflare Worker — Cloudflare may log standard request metadata (IP address) per their standard infrastructure logging

**Supabase backend** (`https://jmxmtiqkpegqywderwkt.supabase.co`) — Prompt Box Pro only:
- Sign-in (Google OAuth via Supabase Auth) and, when the user turns on Cloud sync, storing and
  retrieving their prompt library (encrypted in transit and at rest)
- When the user clicks Upgrade, the extension asks our server for a Stripe Checkout link; the
  extension sends only the chosen plan name with the user's sign-in token

**Stripe Checkout** (`checkout.stripe.com`) — Prompt Box Pro upgrades only:
- Payment happens entirely on Stripe's hosted page, opened in a normal browser tab
- The extension never sees, collects, or stores card numbers or any payment details; it only
  learns the resulting subscription status (Pro or not) from our Supabase backend

**No other external connections.** The extension makes no analytics calls, sends no telemetry, and has no third-party SDKs or trackers.

---

## Data Handling Summary

| Data | Stored Where | Leaves Device? |
|------|-------------|----------------|
| Prompt library | chrome.storage.local or .sync | Via Google Chrome Sync (if enabled); to our Supabase backend only if the user signs in and turns on Pro Cloud sync |
| Tags & settings | chrome.storage.sync | Only via Google Chrome Sync |
| Account email + sign-in session | chrome.storage.local (Pro only) | Sent to Supabase Auth (Google sign-in) only when the user signs in to Pro |
| Subscription status (is_pro, plan) | chrome.storage.local (Pro only) | Read from our Supabase backend; set only by our payment webhook |
| Payment/card details | Never stored or seen by the extension | Entered only on Stripe's hosted checkout page |
| Survey response | Cloudflare Worker (lbwalton.workers.dev) | Yes — only on explicit user action |
| Keystrokes | Never stored | No |
| Browsing history | Never accessed | No |
| Page content | Never accessed | No |

---

## Data Collection Disclosure (Chrome Web Store form checkboxes)

These map to the "Data collection" section of the Privacy Practices tab. As of 4.0.0 (Pro):

- ✅ **Personally identifiable information** — the account **email address** (Pro sign-in only).
- ✅ **Authentication information** — the sign-in session token (Pro sign-in only).
- ⬜ **Financial and payment information** — NOT collected. Card details are entered only on
  Stripe's hosted page; the extension never sees or stores them. (The extension stores only a
  Pro/not-Pro status flag and a Stripe customer identifier, which are not payment instrument data.)
- ⬜ Website content, Web history, User activity, Location, Health, Personal communications — none collected.
- The user's **prompt library** is user-authored content the user chooses to store/sync; it is not
  scraped from websites and does not map to the "Website content" category. Cloud sync (Supabase)
  is disclosed above and in the privacy policy.

Certifications (all remain TRUE — check all three):
- I do not sell or transfer user data to third parties, outside the approved use cases.
- I do not use or transfer user data for purposes unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Also confirm: Remote code = **No** (all JS is bundled locally). Privacy policy URL =
`https://promptboxapp.com/privacy`.

---

## Changelog

| Version | Change |
|---------|--------|
| 4.0.0 | Prompt Box Pro cloud sync: when enabled, prompts are stored on our Supabase backend so they sync across devices. Adds the alarms permission for periodic background sync. Local-only remains the default; nothing leaves the device unless the user signs in and turns on Cloud sync. Pro billing: upgrading opens Stripe Checkout in a browser tab — payment details are entered only on Stripe's hosted page, never in the extension; the extension stores only a local copy of the resulting subscription status. Documents the pb_* local storage keys (session, subscription status cache, sync cursors/tombstones). |
| 3.4.0 | Added clipboardWrite permission for the expansion fallback (copies the user's own prompt to their clipboard on their explicit shortcut action); no data leaves the device |
| 3.2.1 | Bug fix release — no permission or data handling changes |
| 3.2.0 | Added Chrome Sync storage option; added survey endpoint disclosure |
| 3.1.0 | Added content script host permission for text expansion |
| 3.0.0 | Initial privacy practices document scope |
