// Background script - Simple version for Chrome Store approval

// Load the public config + auth + sync engine into the service worker so we can
// pull cloud changes on a schedule. These attach to globalThis (SW-safe).
importScripts('sync-config.js', 'sync-auth.js', 'sync-engine.js');

const SYNC_ALARM = 'pb-cloud-pull';

async function backgroundPull() {
  const { storagePref } = await new Promise((r) =>
    chrome.storage.local.get(['storagePref'], r));
  if (storagePref !== 'cloud') return;
  // The open popup owns pulling (and guards its own writes); a concurrent
  // background merge could clobber an in-flight save. Only pull when closed.
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['POPUP'] });
    if (contexts.length > 0) return;
  }
  const token = await PBAuth.getAccessToken();
  if (!token) return;
  const { prompts } = await new Promise((r) =>
    chrome.storage.local.get(['prompts'], r));
  const res = await PBSync.pullRemoteChanges(prompts || []);
  if (res && res.ok) {
    if (res.changed) {
      await new Promise((r) => chrome.storage.local.set({ prompts: res.prompts }, r));
    }
    await PBSync.commitPullCursor(res.cursor);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'update') {
    chrome.storage.local.set({ 'new_update_available': true });
  }

  chrome.contextMenus.create({
    id: "saveToPromptBox",
    title: "Save to Prompt Box",
    contexts: ["selection"]
  });

  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) {
    backgroundPull().catch(() => {});
  }
});

// Sign-in runs here (not in the popup) so the OAuth flow survives the popup
// closing when the auth window takes focus. PBAuth.signIn in a worker context
// runs the real chrome.identity flow and stores the session.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'pb-signin') {
    PBAuth.signIn().then(
      (r) => sendResponse({ ok: true, email: r.email }),
      (e) => sendResponse({ ok: false, error: e && e.message ? e.message : 'sign-in failed' })
    );
    return true; // keep the message channel open for the async response
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveToPromptBox") {
    const selectedText = info.selectionText;
    
    if (selectedText) {
      // Store selected text temporarily and open popup
      chrome.storage.local.set({ 'tempSelectedText': selectedText });
      chrome.action.openPopup();
    }
  }
});