# Phase 2 Cloud Sync — Manual Test Runbook

Done by LB after the `feature/pro-b2-phase2-cloud-sync` branch merges. All automated checks (lint, security, syntax, code review) already passed; this runbook covers what only a live browser + the real Supabase project can prove.

**Setup reminders**

- Two Chrome profiles ("A" = editor, "B" = observer), the unpacked extension loaded in both, signed in to the SAME Google account in both.
- Reload the extension from `chrome://extensions` after pulling the branch (click reload on the card so the new service worker + `alarms` permission take effect).
- SQL editor: https://supabase.com/dashboard/project/jmxmtiqkpegqywderwkt/sql/new

---

## 1. Database migration (do this FIRST)

Run the contents of `supabase/migrations/0002_prompts_user_default.sql`, then verify:

```sql
select column_default from information_schema.columns
where table_schema='public' and table_name='prompts' and column_name='user_id';
```

Expected: `auth.uid()`.

**Migration gate check (optional but useful):** BEFORE running the migration, sign in, flip Pro (step 2), switch to cloud, and add a prompt. Expected: the prompt works normally locally, push fails quietly (no console error, no UI breakage). After running the migration, the queued change pushes on the next popup open.

## 2. Grant Pro on your test profile

```sql
update public.profiles set is_pro = true
where user_id = (select id from auth.users where email = 'lbwalton@gmail.com');
```

To reset later: same statement with `is_pro = false`.

## 3. Storage-mode UI gate

1. Signed out → Settings storage section: "Prompt Box Cloud" is dimmed, "(Pro)" badge shown, radio not selectable.
2. Signed in with `is_pro = false` → still dimmed.
3. Flip `is_pro = true`, reopen popup → Cloud option enabled, badge hidden. Select it → `#syncStatus` shows "Cloud sync on…". Reopen popup → cloud still selected.
4. **Revocation:** set `is_pro = false`, reopen popup → automatically falls back to Sync mode, prompts intact. (Flip back to true and reselect Cloud before continuing.)
5. **Transient failure is NOT revocation:** DevTools → Network → Offline, reopen popup → stays in cloud mode (option may appear dimmed; that's fine). Back online.

## 3b. Pro badge

1. Signed out → header seal is dimmed grey; clicking it opens Settings > Account. No "PRO MEMBER" text anywhere.
2. Signed in, `is_pro = false` → header + account seals dimmed, no wordmark.
3. `is_pro = true`, reopen popup → both seals vivid teal, "PRO MEMBER" next to your email, tooltip "Prompt Box Pro member". Check light AND dark mode.
4. Reopen the popup again → vivid instantly, no grey flash (cache paint).
5. DevTools → Network → Offline, reopen popup → badge still vivid (transient failure never dims it). Back online.
6. Sign out → dims immediately. Set `is_pro = false` in SQL, sign in again → dims after the entitlement fetch.

## 4. Two-profile round-trip (core)

1. A: add prompt "Cross-device 1". B: reopen popup → appears.
2. A: edit it and toggle favorite. B: reopen → edit + favorite propagate. **Check the Supabase `prompts` table: exactly ONE row for this prompt (edit must not fork a duplicate).**
3. B: delete it. A: reopen → gone (tombstone won, not resurrected).
4. **Mixed batch:** on A, edit one prompt AND delete another, then reopen the popup once. B: reopen → both the edit and the delete arrive (exercises the two-request push).
5. **Offline edit:** A offline → add a prompt → appears instantly, no error. Online, reopen → B sees it on next open.
6. **Save-and-slam:** A: add a prompt and close the popup immediately. Later, both profiles show exactly one copy, and the table has one row.
7. **Edit/delete during initial pull:** on A (large-ish library helps), open the popup and immediately delete a prompt. It must stay deleted after the background pull settles.

## 5. Cloud-mode text expansion

With A in cloud mode: type a saved shortcut + Space in any text field on any page → it must expand. (Also try Tab and Enter triggers.)

## 6. Tag operations propagate

1. A: rename a tag used by a synced prompt. B: reopen → renamed on the prompt.
2. B: edit that same prompt (change its text). A: reopen → the OLD tag name must NOT come back.
3. A: delete a tag. B: reopen → removed from its prompts.

## 7. CSV import in cloud mode

A: export CSV, delete one prompt, import the CSV back. B: reopen → imported prompts appear (import counts as a modification and pushes). Note: re-importing your own backup duplicates prompts locally — same as it always did; that's expected.

## 8. Background pull (popup closed)

1. Extension card → "Inspect views: service worker" → console clean on cold start (no importScripts errors).
2. In B's SW console, with B's popup CLOSED, run `backgroundPull()` after A added a prompt → then open B's popup: the prompt is already there.
3. With B's popup OPEN, run `backgroundPull()` in the SW console → it must return without any network request (popup-open guard; check the SW Network panel).

## 9. Sign-out behavior

1. While in cloud mode, sign out → prompts intact, Cloud option dimmed but still selected, switching to Sync/Local works.
2. Sign back in (same account) → full re-sync converges, no duplicates.
3. **Account switch (if you have a second Google account):** sign out, sign in with account 2, grant it Pro, enable cloud → its library downloads fully, and no deleted rows from account 1 appear in account 2's table.

## 10. Free-user regression sweep (quick)

In a signed-out profile: add/edit/delete/copy prompts, search, filter, tags, CSV export/import, dark mode, context menu "Save to Prompt Box", storage toggle Sync↔Local. Everything behaves exactly as v3.4.0.

## 11. Tag filter self-heal (console)

Popup DevTools:

```js
prompts[0].tags.push('OrphanTag'); updateTagFilterDropdown();
```

→ "OrphanTag" appears in the filter dropdown and filters correctly. Clean up:

```js
prompts[0].tags = prompts[0].tags.filter(t => t !== 'OrphanTag'); updateTagFilterDropdown();
```

## 12. Optional stress

A library of 1000+ prompts on a fresh second device: the pull converges over a few popup opens / alarm ticks (PostgREST pages at 1000 rows).

---

**If anything fails:** grab the popup (or SW) console error, note which step, and check `await PBSync.fetchEntitlement()` returns `{is_pro: true, ...}` in that profile before debugging deeper.
