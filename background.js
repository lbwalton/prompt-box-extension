// Background script for Chrome extension
// This handles the right-click menu and communication between parts

// When extension is installed, create the right-click menu
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "saveToPromptBox",
      title: "Save to Prompt Box",
      contexts: ["selection"] // Only show when text is selected
    });
  });
  
  // When user right-clicks and chooses "Save to Prompt Library"
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "saveToPromptBox") {
      // Get the selected text
      const selectedText = info.selectionText;
      
      if (selectedText) {
        // Send the selected text to content script to show save dialog
        chrome.tabs.sendMessage(tab.id, {
          action: "showSaveDialog",
          text: selectedText
        });
      }
    }
  });