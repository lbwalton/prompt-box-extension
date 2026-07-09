# Cloud Sync Onboarding (sign-in-aware) Design

**Date:** 2026-07-09
**Status:** Approved by LB (behavior table agreed in conversation; "fold it into this branch now").
**Parent:** Prompt Box Pro B2 (`2026-07-04-promptbox-pro-b2-design.md`). Ships on `feature/pro-b2-phase2-cloud-sync`, same future 4.0.0 release. No version bump now.

## Problem

Live two-profile testing (2026-07-09) showed the gap: a Pro user signs in on a second device and sees an empty library because `storagePref` is device-local and nothing tells them to select "Prompt Box Cloud" (buried in Settings > Import/Export). Users expect sign-in to mirror their library. Blanket auto-enable is unsafe only in one case: a device with its OWN local prompts, where silent enable would upload/merge data without consent, breaking the "nothing leaves your device unless you enable sync" promise.

## Behavior (the agreed table)

After a definitive Pro entitlement answer (`is_pro === true`), when this device is NOT already in cloud mode:

| Case | Local library | Cloud has data | Behavior |
|---|---|---|---|
| 1 | empty (0 prompts) | yes | **Auto-enable** cloud (`setStoragePref('cloud')`) immediately after a successful SIGN-IN action on this device. Pure download; zero upload risk. Sync status line communicates it ("Cloud sync on..."). |
| 2 | has prompts | yes | **Banner offer** in the main popup: "Your cloud library (N prompts) is ready. Turn on sync? Your M local prompts will be merged." Buttons: [Turn on Cloud Sync] [Not now]. |
| 3 | any | no (Pro, cloud empty) | **Banner offer**: "You're Pro. Turn on cloud sync to back up your prompts across devices?" Same buttons. |

Constraints on when each path can fire:

- **Auto-enable (case 1) runs ONLY in the sign-in flow** (the click handler's successful-sign-in path), never on ordinary popup opens. A user who deliberately switches back to Sync/Local later is never auto-flipped again.
- **The banner (cases 2-3) may show on popup open too** (covers users already signed in when this ships, and the Phase 3 just-purchased moment when `is_pro` flips while signed in). At most one evaluation per popup open, after the existing entitlement fetch.
- Signed out, free (`is_pro` false/null), already in cloud mode, or transient entitlement failure: nothing shows, nothing changes.
- "Not now" persists `pb_sync_offer_dismissed = true` (chrome.storage.local); the banner never re-shows while it is set. Sign-out clears it (a fresh sign-in re-offers).
- "Turn on Cloud Sync" calls the existing `setStoragePref('cloud')` path (migration, merge, cursor-commit-on-apply, all already reviewed/tested) and hides the banner.

## Mechanism

- New sync-engine function: `PBSync.cloudPromptCount()` → Promise of `number | null` (count of non-deleted cloud rows; null on any failure). Implementation: authenticated GET `/rest/v1/prompts?select=id&deleted_at=is.null&limit=1` with header `Prefer: count=exact`, reading the total from the `content-range` response header. "Cloud has data" = count > 0. Display/offer logic only; never gates sync itself. On null (transient failure), no offer is made this open; it re-evaluates next open.
- Offer evaluation lives in popup.js: `maybeOfferCloudSync(ent)` called from `refreshCloudOption()` after the existing definitive-answer cache write (so it reuses the single entitlement fetch per open; no second fetch). Context flag: module-level `let justSignedIn = false;` set true in the sign-in handler right before `renderAccount()`, consumed (reset to false) by `maybeOfferCloudSync` to decide auto-enable (case 1) vs banner-only.
- The stale-answer `entitlementEpoch` guard already wraps `refreshCloudOption`'s post-fetch body, so the offer logic inherits protection against sign-out races.
- Banner markup: a new dismissible banner div in popup.html following the existing banner pattern (`cloudSyncSurvey` / `syncFallbackBanner` idiom), inserted near them. Counts are injected via `textContent` only.
- The old `cloudSyncSurvey` banner (pre-Pro market research) is retired: its trigger is removed so the two banners can never stack. Its markup may be removed in the same task.

## What is NOT touched

`background.js`, `content.js`, `sync-auth.js`, `manifest.json`, DB schema. Free users and signed-out users see zero change. The privacy promise holds: the only data-upload path (cases 2-3 with local prompts) still requires an explicit click.

## Security / constraints

- No `innerHTML` with dynamic content; counts set via `textContent`.
- `hasCloudData` uses the existing `_authedFetch` (anon key + user token, RLS-scoped).
- Lint/security 0 errors before every commit.

## Testing (manual, extends the runbook)

1. Fresh profile, sign in as Pro with cloud data → library auto-appears with NO storage-mode click (case 1; the exact profile-B friction from tonight, eliminated).
2. Profile with local prompts, sign in as Pro with cloud data → merge banner with correct counts; [Turn on] merges and syncs; [Not now] dismisses and stays dismissed across popup reopens.
3. Pro, no cloud data, not in cloud mode → backup banner (case 3).
4. Free user / signed out → no banner ever.
5. Sign out then in → dismissed banner re-offers.
6. Already in cloud mode → nothing shows.

## Out of scope

Server-side `cloud_sync_enabled` profile flag (not needed with the row probe); un-enrolling flows; Phase 3 purchase integration (it inherits this banner for free via the popup-open path).
