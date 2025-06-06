// Simple Chrome Extension Popup Script
// This handles saving, displaying, and managing prompts

let prompts = [];

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
  document.getElementById('promptForm').style.display = 'block';
  document.getElementById('promptTitle').focus();
}

// Hide the add prompt form
function hideAddForm() {
  document.getElementById('promptForm').style.display = 'none';
  clearForm();
}

// Clear all form fields
function clearForm() {
  document.getElementById('promptTitle').value = '';
  document.getElementById('promptText').value = '';
  document.getElementById('promptCategory').value = 'General';
}

// Save a new prompt
function savePrompt() {
  const title = document.getElementById('promptTitle').value.trim();
  const text = document.getElementById('promptText').value.trim();
  const category = document.getElementById('promptCategory').value;
  
  // Check if user filled in the important fields
  if (!title || !text) {
    alert('Please fill in both title and prompt text');
    return;
  }
  
  // Create new prompt object
  const newPrompt = {
    id: Date.now(), // Simple way to create unique ID
    title: title,
    text: text,
    category: category,
    createdAt: new Date().toISOString()
  };
  
  // Add to our list and save to Chrome storage
  prompts.push(newPrompt);
  saveToStorage();
  displayPrompts();
  hideAddForm();
}

// Load prompts from Chrome's storage
function loadPrompts() {
  chrome.storage.local.get(['prompts'], function(result) {
    prompts = result.prompts || [];
    displayPrompts();
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
  
  // Create HTML for each prompt
  container.innerHTML = listToShow.map(prompt => `
    <div class="prompt-item">
      <div class="prompt-title">${escapeHtml(prompt.title)}</div>
      <div class="prompt-category">${prompt.category}</div>
      <div class="prompt-text">${escapeHtml(prompt.text)}</div>
      <div class="prompt-actions">
        <button class="copy-btn" onclick="copyPrompt('${prompt.id}')">Copy</button>
        <button class="delete-btn" onclick="deletePrompt('${prompt.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

// Copy prompt text to clipboard
function copyPrompt(id) {
  const prompt = prompts.find(p => p.id == id);
  if (prompt) {
    navigator.clipboard.writeText(prompt.text).then(() => {
      // Visual feedback that copy worked
      const btn = event.target;
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      btn.style.background = '#4CAF50';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '#2196F3';
      }, 1000);
    });
  }
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
window.deletePrompt = deletePrompt;