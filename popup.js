// Simple Chrome Extension Popup Script
// This handles saving, displaying, and managing prompts

let prompts = [];

// Check for temporarily stored text from right-click
function checkForTempText() {
  chrome.storage.local.get(['tempSelectedText'], (result) => {
    if (result.tempSelectedText) {
      // Auto-fill the form with the selected text
      document.getElementById('promptText').value = result.tempSelectedText;
      showAddForm();
      
      // Clear the temp storage
      chrome.storage.local.remove(['tempSelectedText']);
    }
  });
}
let editingPromptId = null; // Track which prompt we're editing

// When popup opens, load existing prompts
document.addEventListener('DOMContentLoaded', function() {
  loadPrompts();
  setupEventListeners();
});

// Set up all the button clicks and form actions
function setupEventListeners() {
  document.getElementById('addPromptBtn').addEventListener('click', showAddForm);
  document.getElementById('savePromptBtn').addEventListener('click', savePrompt);
  document.getElementById('cancelBtn').addEventListener('click', hideAddForm);
  document.getElementById('searchBox').addEventListener('input', filterPrompts);
}

// Show the form to add a new prompt
function showAddForm() {
  editingPromptId = null; // Reset editing mode
  document.getElementById('promptForm').style.display = 'block';
  document.getElementById('addPromptBtn').textContent = '+ Add';
  document.getElementById('savePromptBtn').textContent = 'Save';
  document.getElementById('promptTitle').focus();
}

// Show the form to edit an existing prompt
function showEditForm(id) {
  const prompt = prompts.find(p => p.id == id);
  if (!prompt) return;
  
  editingPromptId = id;
  document.getElementById('promptTitle').value = prompt.title;
  document.getElementById('promptText').value = prompt.text;
  document.getElementById('promptCategory').value = prompt.category;
  
  document.getElementById('promptForm').style.display = 'block';
  document.getElementById('addPromptBtn').textContent = 'Cancel Edit';
  document.getElementById('savePromptBtn').textContent = 'Update';
  document.getElementById('promptTitle').focus();
}

// Hide the add prompt form
function hideAddForm() {
  document.getElementById('promptForm').style.display = 'none';
  document.getElementById('addPromptBtn').textContent = '+ Add';
  editingPromptId = null;
  clearForm();
}

// Clear all form fields
function clearForm() {
  document.getElementById('promptTitle').value = '';
  document.getElementById('promptText').value = '';
  document.getElementById('promptCategory').value = 'General';
}

// Save a new prompt or update existing one
function savePrompt() {
  const title = document.getElementById('promptTitle').value.trim();
  const text = document.getElementById('promptText').value.trim();
  const category = document.getElementById('promptCategory').value;
  
  // Check if user filled in the important fields
  if (!title || !text) {
    alert('Please fill in both title and prompt text');
    return;
  }
  
  if (editingPromptId) {
    // Update existing prompt
    const promptIndex = prompts.findIndex(p => p.id == editingPromptId);
    if (promptIndex !== -1) {
      prompts[promptIndex] = {
        ...prompts[promptIndex],
        title: title,
        text: text,
        category: category,
        updatedAt: new Date().toISOString()
      };
    }
  } else {
    // Create new prompt
    const newPrompt = {
      id: Date.now(), // Simple way to create unique ID
      title: title,
      text: text,
      category: category,
      createdAt: new Date().toISOString()
    };
    prompts.push(newPrompt);
  }
  
  // Save and refresh display
  saveToStorage();
  displayPrompts();
  hideAddForm();
}

// Load prompts from Chrome's storage
function loadPrompts() {
    chrome.storage.local.get(['prompts'], function(result) {
      prompts = result.prompts || [];
      displayPrompts();
      
      // Also check for temp text from right-click
      checkForTempText();
    });
  }

// Save prompts to Chrome's storage
function saveToStorage() {
  chrome.storage.local.set({ 'prompts': prompts });
}

// Show all prompts in the list
function displayPrompts(filteredPrompts = null) {
    const listToShow = filteredPrompts || prompts;
    const container = document.getElementById('promptList');
    
    if (listToShow.length === 0) {
      container.innerHTML = '<div class="no-prompts">No prompts found</div>';
      return;
    }
    
    // Clear container first
    container.innerHTML = '';
    
    // Create each prompt item
    listToShow.forEach(prompt => {
      const promptDiv = document.createElement('div');
      promptDiv.className = 'prompt-item';
      promptDiv.innerHTML = `
        <div class="prompt-title">${escapeHtml(prompt.title)}</div>
        <div class="prompt-category">${prompt.category}</div>
        <div class="prompt-text">${escapeHtml(prompt.text)}</div>
        <div class="prompt-actions">
          <button class="copy-btn" data-id="${prompt.id}" data-action="copy">Copy</button>
          <button class="edit-btn" data-id="${prompt.id}" data-action="edit">Edit</button>
          <button class="delete-btn" data-id="${prompt.id}" data-action="delete">Delete</button>
        </div>
      `;
      
      container.appendChild(promptDiv);
    });
    
    // Add event listeners to all buttons
    container.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        const id = e.target.getAttribute('data-id');
        const action = e.target.getAttribute('data-action');
        
        if (action === 'copy') {
          copyPrompt(id, e.target);
        } else if (action === 'edit') {
          editPrompt(id);
        } else if (action === 'delete') {
          deletePrompt(id);
        }
      }
    });
  }

// Copy prompt text to clipboard
function copyPrompt(id, buttonElement) {
    const prompt = prompts.find(p => p.id == id);
    if (prompt) {
      navigator.clipboard.writeText(prompt.text).then(() => {
        // Visual feedback that copy worked
        const originalText = buttonElement.textContent;
        buttonElement.textContent = 'Copied!';
        buttonElement.style.background = '#4CAF50';
        setTimeout(() => {
          buttonElement.textContent = originalText;
          buttonElement.style.background = '#2196F3';
        }, 1000);
      });
    }
  }

// Edit a prompt
function editPrompt(id) {
  showEditForm(id);
}

// Delete a prompt
function deletePrompt(id) {
  if (confirm('Are you sure you want to delete this prompt?')) {
    prompts = prompts.filter(p => p.id != id);
    saveToStorage();
    displayPrompts();
  }
}

// Filter prompts based on search
function filterPrompts() {
  const searchTerm = document.getElementById('searchBox').value.toLowerCase();
  
  if (!searchTerm) {
    displayPrompts();
    return;
  }
  
  // Search in title, text, and category
  const filtered = prompts.filter(prompt => 
    prompt.title.toLowerCase().includes(searchTerm) ||
    prompt.text.toLowerCase().includes(searchTerm) ||
    prompt.category.toLowerCase().includes(searchTerm)
  );
  
  displayPrompts(filtered);
}

// Make text safe for HTML (prevents XSS attacks)
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make functions available globally so HTML onclick can use them
window.copyPrompt = copyPrompt;
window.editPrompt = editPrompt;
window.deletePrompt = deletePrompt;