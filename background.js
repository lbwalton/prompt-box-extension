// Background script - Simple version for Chrome Store approval
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "saveToPromptBox",
    title: "Save to Prompt Box",
    contexts: ["selection"]
  });
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