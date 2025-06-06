// Content script - runs on every webpage
// This handles the save dialog when user right-clicks selected text

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showSaveDialog") {
      showQuickSaveDialog(request.text);
    }
  });
  
  // Show a quick save dialog on the webpage
  function showQuickSaveDialog(selectedText) {
    // Remove any existing dialog
    const existingDialog = document.getElementById('promptBoxDialog');
    if (existingDialog) {
      existingDialog.remove();
    }
    
    // Create dialog HTML
    const dialog = document.createElement('div');
    dialog.id = 'promptBoxDialog';
    dialog.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border: 2px solid #4CAF50;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: Arial, sans-serif;
        width: 400px;
        max-width: 90vw;
      ">
        <h3 style="margin: 0 0 15px 0; color: #333;">Save to Prompt Box</h3>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-weight: bold;">Title:</label>
          <input type="text" id="quickTitle" placeholder="Enter prompt title" style="
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
          ">
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-weight: bold;">Category:</label>
          <select id="quickCategory" style="
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
          ">
            <option value="General">General</option>
            <option value="Writing">Writing</option>
            <option value="Coding">Coding</option>
            <option value="Research">Research</option>
            <option value="Creative">Creative</option>
            <option value="Business">Business</option>
          </select>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 4px; font-weight: bold;">Prompt Text:</label>
          <textarea id="quickText" style="
            width: 100%;
            height: 80px;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
            resize: vertical;
          ">${selectedText}</textarea>
        </div>
        
        <div style="display: flex; gap: 10px;">
          <button id="quickSave" style="
            flex: 1;
            padding: 10px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          ">Save Prompt</button>
          <button id="quickCancel" style="
            flex: 1;
            padding: 10px;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          ">Cancel</button>
        </div>
      </div>
      
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 9999;
      "></div>
    `;
    
    // Add dialog to page
    document.body.appendChild(dialog);
    
    // Focus on title input
    document.getElementById('quickTitle').focus();
    
    // Handle save button
    document.getElementById('quickSave').addEventListener('click', () => {
      const title = document.getElementById('quickTitle').value.trim();
      const text = document.getElementById('quickText').value.trim();
      const category = document.getElementById('quickCategory').value;
      
      if (!title || !text) {
        alert('Please fill in both title and prompt text');
        return;
      }
      
      // Save to Chrome storage
      savePromptToStorage(title, text, category);
      dialog.remove();
    });
    
    // Handle cancel button
    document.getElementById('quickCancel').addEventListener('click', () => {
      dialog.remove();
    });
    
    // Close dialog when clicking outside
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });
  }
  
  // Save prompt to Chrome storage
  function savePromptToStorage(title, text, category) {
    const newPrompt = {
      id: Date.now(),
      title: title,
      text: text,
      category: category,
      createdAt: new Date().toISOString()
    };
    
    // Get existing prompts and add new one
    chrome.storage.local.get(['prompts'], (result) => {
      const prompts = result.prompts || [];
      prompts.push(newPrompt);
      
      chrome.storage.local.set({ 'prompts': prompts }, () => {
        // Show success message
        showSuccessMessage();
      });
    });
  }
  
  // Show success message
  function showSuccessMessage() {
    const message = document.createElement('div');
    message.innerHTML = 'Prompt saved successfully!';
    message.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 15px 20px;
      border-radius: 4px;
      z-index: 10001;
      font-family: Arial, sans-serif;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(message);
    
    // Remove message after 3 seconds
    setTimeout(() => {
      message.remove();
    }, 3000);
  }