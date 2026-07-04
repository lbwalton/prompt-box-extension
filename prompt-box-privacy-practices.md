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

---

## Data Collection & Use

### Data stored locally (`chrome.storage.local`)
- Prompt library (titles, text, tags, shortcuts)
- Storage location preference (`sync` or `local`)
- Temporary selected text (passed from content script to popup, cleared immediately after use)

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

**No other external connections.** The extension makes no analytics calls, sends no telemetry, and has no third-party SDKs or trackers.

---

## Data Handling Summary

| Data | Stored Where | Leaves Device? |
|------|-------------|----------------|
| Prompt library | chrome.storage.local or .sync | Only via Google Chrome Sync (if enabled by user) |
| Tags & settings | chrome.storage.sync | Only via Google Chrome Sync |
| Survey response | Cloudflare Worker (lbwalton.workers.dev) | Yes — only on explicit user action |
| Keystrokes | Never stored | No |
| Browsing history | Never accessed | No |
| Page content | Never accessed | No |

---

## Changelog

| Version | Change |
|---------|--------|
| 3.4.0 | Added clipboardWrite permission for the expansion fallback (copies the user's own prompt to their clipboard on their explicit shortcut action); no data leaves the device |
| 3.2.1 | Bug fix release — no permission or data handling changes |
| 3.2.0 | Added Chrome Sync storage option; added survey endpoint disclosure |
| 3.1.0 | Added content script host permission for text expansion |
| 3.0.0 | Initial privacy practices document scope |
