// Background script - Ultra simple version
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
        // Just store the selected text temporarily and open popup
        chrome.storage.local.set({ 'tempSelectedText': selectedText });
        
        // Open the extension popup instead of injecting dialog
        chrome.action.openPopup();
      }
    }
  });