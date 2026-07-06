// Background script - Simple version for Chrome Store approval

// Load the public config + auth + sync engine into the service worker so we can
// pull cloud changes on a schedule. These attach to globalThis (SW-safe).
importScripts('sync-config.js', 'sync-auth.js', 'sync-engine.js');

const SYNC_ALARM = 'pb-cloud-pull';

async function backgroundPull() {
  const { storagePref } = await new Promise((r) =>
    chrome.storage.local.get(['storagePref'], r));
  if (storagePref !== 'cloud') return;
  const token = await PBAuth.getAccessToken();
  if (!token) return;
  const { prompts } = await new Promise((r) =>
    chrome.storage.local.get(['prompts'], r));
  const res = await PBSync.pullRemoteChanges(prompts || []);
  if (res && res.changed) {
    await new Promise((r) => chrome.storage.local.set({ prompts: res.prompts }, r));
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
    backgroundPull();
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