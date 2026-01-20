// Global variables to store prompts and manage form state
let prompts = [];

// Default tags that come with the extension
const defaultTags = [
  { name: 'General', isDefault: true },
  { name: 'Writing', isDefault: true },
  { name: 'Coding', isDefault: true },
  { name: 'Research', isDefault: true },
  { name: 'Creative', isDefault: true },
  { name: 'Business', isDefault: true },
  { name: 'Favorite', isDefault: true, isFavorite: true }
];

let availableTags = [...defaultTags]; // Tags available for selection
let editingPromptId = null; // Track which prompt we're editing
let selectedTags = []; // Track selected tags for current form

// Debug extension context on load
console.log('=== EXTENSION DEBUGGING ===');
console.log('Chrome object available:', typeof chrome !== 'undefined');
if (typeof chrome !== 'undefined') {
  console.log('Available Chrome APIs:', Object.keys(chrome));
  console.log('Identity API available:', !!chrome.identity);
  if (chrome.runtime) {
    console.log('Extension ID:', chrome.runtime.id);
  }
}

// When popup opens, load existing prompts
document.addEventListener('DOMContentLoaded', function () {
  loadPrompts();
  setupEventListeners();
  checkUpdateStatus();
});

function checkUpdateStatus() {
  chrome.storage.local.get(['new_update_available'], function (result) {
    if (result.new_update_available) {
      const banner = document.getElementById('updateNotification');
      banner.style.display = 'block';

      // Click on banner opens modal
      banner.addEventListener('click', function (e) {
        // Prevent strictly if clicking dismiss button (handled separately below, but good safety)
        if (e.target.id === 'dismissUpdateBtn') return;
        showChangelogModal();
      });

      document.getElementById('dismissUpdateBtn').addEventListener('click', function (e) {
        e.stopPropagation(); // Don't trigger banner click
        banner.style.display = 'none';
        chrome.storage.local.remove('new_update_available');
      });
    }
  });
}

// Fetch and display changelog
function fetchChangelog(targetElementId) {
  const target = document.getElementById(targetElementId);
  target.innerHTML = 'Loading changes...';

  fetch(chrome.runtime.getURL('CHANGELOG.md'))
    .then(response => response.text())
    .then(text => {
      // Simple Markdown parser
      let html = text
        // Headers
        .replace(/^# (.*$)/gim, '<h1 style="font-size: 16px; margin: 10px 0;">$1</h1>')
        .replace(/^## (.*$)/gim, '<h2 style="font-size: 14px; margin: 8px 0; border-bottom: 1px solid #eee; padding-bottom: 4px;">$1</h2>')
        .replace(/^### (.*$)/gim, '<h3 style="font-size: 12px; margin: 6px 0; color: #444;">$1</h3>')
        // Bold
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        // Lists
        .replace(/^\- (.*$)/gim, '<li style="margin-left: 20px; margin-bottom: 4px;">$1</li>');

      target.innerHTML = html;
    })
    .catch(err => {
      target.innerHTML = 'Could not load changelog.';
      console.error(err);
    });
}

function showChangelogModal() {
  const modal = document.getElementById('changelogModal');
  modal.style.display = 'flex';
  fetchChangelog('changelogContent');
}

function hideChangelogModal() {
  document.getElementById('changelogModal').style.display = 'none';
}

function toggleChangelogPreview() {
  const preview = document.getElementById('changelogPreview');
  const btn = document.getElementById('viewChangelogBtn');

  if (preview.style.display === 'none') {
    preview.style.display = 'block';
    btn.textContent = 'Hide Release Notes';
    fetchChangelog('changelogPreview');
  } else {
    preview.style.display = 'none';
    btn.textContent = 'View Release Notes';
  }
}

// Set up all the button clicks and form actions
function setupEventListeners() {
  document.getElementById('addPromptBtn').addEventListener('click', showAddForm);
  document.getElementById('savePromptBtn').addEventListener('click', savePrompt);
  document.getElementById('cancelBtn').addEventListener('click', hideForm);
  document.getElementById('searchBox').addEventListener('input', searchPrompts);
  document.getElementById('sortBy').addEventListener('change', function () {
    saveFilterSettings();
    filterAndSortPrompts();
  });
  document.getElementById('tagFilter').addEventListener('change', function () {
    saveFilterSettings();
    filterAndSortPrompts();
  });
  document.getElementById('manageTagsBtn').addEventListener('click', showTagManagement);
  document.getElementById('closeTagsBtn').addEventListener('click', hideTagManagement);
  document.getElementById('addTagBtn').addEventListener('click', addNewTag);
  document.getElementById('promptCategory').addEventListener('change', addTagToPrompt);
  document.getElementById('exportBtn').addEventListener('click', exportPrompts);
  document.getElementById('templateBtn').addEventListener('click', downloadTemplate);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importPrompts);

  document.getElementById('importFile').addEventListener('change', importPrompts);

  // Changelog & About listeners
  document.getElementById('viewChangelogBtn')?.addEventListener('click', toggleChangelogPreview);
  document.getElementById('closeChangelogModal')?.addEventListener('click', hideChangelogModal);
  document.getElementById('closeChangelogBtnLarge')?.addEventListener('click', hideChangelogModal);

  // Set up event delegation for prompt buttons
  document.getElementById('promptList').addEventListener('click', handlePromptButtonClick);
}

// Handle clicks on prompt buttons (copy, edit, delete, favorite)
function handlePromptButtonClick(event) {
  const button = event.target;
  const action = button.getAttribute('data-action');
  const promptId = button.getAttribute('data-prompt-id');

  if (!action || !promptId) return;

  const id = parseInt(promptId);

  // Add visual feedback
  addButtonFeedback(button, action);

  switch (action) {
    case 'copy':
      copyPrompt(id);
      break;
    case 'edit':
      editPrompt(id);
      break;
    case 'delete':
      deletePrompt(id);
      break;
    case 'toggle-favorite':
      toggleFavorite(id);
      break;
  }
}

// Add visual feedback to button clicks
function addButtonFeedback(button, action) {
  // Add click animation class
  button.style.transform = 'scale(0.95)';

  // Create ripple effect
  const ripple = document.createElement('span');
  ripple.style.cssText = `
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    transform: scale(0);
    animation: ripple 0.6s linear;
    pointer-events: none;
    left: 50%;
    top: 50%;
    width: 20px;
    height: 20px;
    margin-left: -10px;
    margin-top: -10px;
  `;

  button.style.position = 'relative';
  button.appendChild(ripple);

  // Remove ripple after animation
  setTimeout(() => {
    if (ripple.parentNode) {
      ripple.parentNode.removeChild(ripple);
    }
    button.style.transform = '';
  }, 600);

  // Show action feedback
  if (action === 'copy') {
    showTemporaryTooltip(button, '✅ Copied!');
  }
}

// Show temporary tooltip
function showTemporaryTooltip(element, message) {
  const tooltip = document.createElement('div');
  tooltip.textContent = message;
  tooltip.style.cssText = `
    position: fixed;
    background: #4CAF50;
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: bold;
    z-index: 10000;
    pointer-events: none;
    opacity: 0;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.2);
  `;

  // Position tooltip relative to the button
  const rect = element.getBoundingClientRect();
  tooltip.style.left = (rect.left + rect.width / 2) + 'px';
  tooltip.style.top = (rect.top - 35) + 'px';
  tooltip.style.transform = 'translateX(-50%)';

  document.body.appendChild(tooltip);

  // Fade in with slide up effect
  setTimeout(() => {
    tooltip.style.opacity = '1';
    tooltip.style.transform = 'translateX(-50%) translateY(-5px)';
  }, 50);

  // Remove after delay with fade out
  setTimeout(() => {
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translateX(-50%) translateY(-10px)';
    setTimeout(() => {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    }, 300);
  }, 1500);
}

// Show the form to add a new prompt
function showAddForm() {
  editingPromptId = null; // Reset editing mode
  selectedTags = []; // Reset selected tags
  document.getElementById('promptForm').style.display = 'block';
  document.getElementById('addPromptBtn').textContent = '+ Add';
  document.getElementById('savePromptBtn').textContent = 'Save';
  document.getElementById('promptTitle').focus();
  updateSelectedTagsDisplay();
}

// Hide the form
function hideForm() {
  document.getElementById('promptForm').style.display = 'none';
  document.getElementById('addPromptBtn').textContent = '+ Add';
  document.getElementById('promptTitle').value = '';
  document.getElementById('promptText').value = '';
  selectedTags = [];
  editingPromptId = null;
  updateSelectedTagsDisplay();
}

// Load all prompts from Chrome storage
function loadPrompts() {
  chrome.storage.local.get(['prompts'], function (result) {
    prompts = result.prompts || [];
    displayPrompts();
    updateTagDropdown();
    updateTagFilterDropdown();

    // Load filter settings after everything is ready
    loadFilterSettings();
  });

  // Load custom tags
  chrome.storage.local.get(['availableTags'], function (result) {
    if (result.availableTags) {
      availableTags = result.availableTags;
    }
    updateTagDropdown();
    updateTagList();
  });
}

// Save a new prompt or update existing one
function savePrompt() {
  const title = document.getElementById('promptTitle').value.trim();
  const text = document.getElementById('promptText').value.trim();

  if (!title || !text) {
    alert('Please fill in both title and prompt text');
    return;
  }

  // Check for duplicate titles (excluding the current prompt being edited)
  const duplicatePrompt = prompts.find(p =>
    p.title.toLowerCase() === title.toLowerCase() &&
    p.id !== editingPromptId
  );

  if (duplicatePrompt) {
    const suggestedTitle = generateUniqueTitle(title);
    const userChoice = confirm(
      `⚠️ Duplicate Title Detected\n\n` +
      `A prompt with the title "${title}" already exists.\n\n` +
      `Click OK to use this unique title instead:\n"${suggestedTitle}"\n\n` +
      `Click Cancel to go back and choose your own title.`
    );

    if (userChoice) {
      // Use the suggested unique title
      document.getElementById('promptTitle').value = suggestedTitle;
      // Continue with the save using the new title
      savePromptWithTitle(suggestedTitle, text);
    } else {
      // Let user go back and edit the title
      document.getElementById('promptTitle').focus();
      document.getElementById('promptTitle').select();
      return;
    }
  } else {
    // Title is unique, proceed normally
    savePromptWithTitle(title, text);
  }
}

// Helper function to actually save the prompt with the given title
function savePromptWithTitle(title, text) {
  // Allow prompts to have no tags, but show warning
  if (selectedTags.length === 0) {
    if (!confirm('This prompt has no tags. Are you sure you want to save it without any tags?')) {
      return;
    }
    // If confirmed, proceed with empty tags array
  }

  // Check if "Favorite" tag is selected to set isFavorite
  const hasFavoriteTag = selectedTags.includes('Favorite');

  const promptData = {
    title: title,
    text: text,
    tags: selectedTags,
    isFavorite: hasFavoriteTag,
    createdAt: editingPromptId ? prompts.find(p => p.id == editingPromptId)?.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now()
  };

  if (editingPromptId) {
    // Update existing prompt
    const index = prompts.findIndex(p => p.id == editingPromptId);
    if (index !== -1) {
      promptData.id = editingPromptId;
      prompts[index] = promptData;
    }
  } else {
    // Add new prompt
    promptData.id = Date.now();
    prompts.push(promptData);
  }

  // Save to Chrome storage
  chrome.storage.local.set({ prompts: prompts }, function () {
    filterAndSortPrompts();
    hideForm();
  });
}

// Copy prompt text to clipboard
function copyPrompt(promptId) {
  const prompt = prompts.find(p => p.id == promptId);
  if (prompt) {
    navigator.clipboard.writeText(prompt.text).then(() => {
      // Could add a visual indicator here
      console.log('Prompt copied to clipboard');
    });
  }
}

// Edit an existing prompt
function editPrompt(promptId) {
  const prompt = prompts.find(p => p.id == promptId);
  if (prompt) {
    editingPromptId = promptId;
    selectedTags = prompt.tags || [prompt.category || 'General'];

    document.getElementById('promptTitle').value = prompt.title;
    document.getElementById('promptText').value = prompt.text;
    document.getElementById('addPromptBtn').textContent = 'Cancel';
    document.getElementById('savePromptBtn').textContent = 'Update';
    document.getElementById('promptForm').style.display = 'block';

    updateSelectedTagsDisplay();
  }
}

// Delete a prompt
function deletePrompt(promptId) {
  if (confirm('Are you sure you want to delete this prompt?')) {
    prompts = prompts.filter(p => p.id != promptId);
    chrome.storage.local.set({ prompts: prompts }, function () {
      filterAndSortPrompts();
    });
  }
}

// Toggle favorite status
function toggleFavorite(promptId) {
  const prompt = prompts.find(p => p.id == promptId);
  if (prompt) {
    prompt.isFavorite = !prompt.isFavorite;

    // Update tags array to include/exclude Favorite tag
    if (prompt.isFavorite) {
      if (!prompt.tags.includes('Favorite')) {
        prompt.tags = [...(prompt.tags || []), 'Favorite'];
      }
    } else {
      prompt.tags = (prompt.tags || []).filter(tag => tag !== 'Favorite');
    }

    prompt.updatedAt = Date.now();

    // Save to storage
    chrome.storage.local.set({ prompts: prompts }, function () {
      filterAndSortPrompts();
    });
  }
}

// Search prompts by title or content
function searchPrompts() {
  const searchTerm = document.getElementById('searchBox').value.toLowerCase();
  const filteredPrompts = prompts.filter(prompt =>
    prompt.title.toLowerCase().includes(searchTerm) ||
    prompt.text.toLowerCase().includes(searchTerm) ||
    (prompt.tags && prompt.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
  );

  displayFilteredPrompts(filteredPrompts);
}

// Display filtered and sorted prompts
function filterAndSortPrompts() {
  const searchTerm = document.getElementById('searchBox').value.toLowerCase();
  const selectedTag = document.getElementById('tagFilter').value;
  const sortBy = document.getElementById('sortBy').value;

  let filteredPrompts = prompts.filter(prompt => {
    // Filter by search term
    const matchesSearch = !searchTerm ||
      prompt.title.toLowerCase().includes(searchTerm) ||
      prompt.text.toLowerCase().includes(searchTerm) ||
      (prompt.tags && prompt.tags.some(tag => tag.toLowerCase().includes(searchTerm)));

    // Filter by tag
    const matchesTag = !selectedTag ||
      (prompt.tags && prompt.tags.includes(selectedTag)) ||
      (selectedTag === 'Favorite' && prompt.isFavorite) ||
      (selectedTag === prompt.category); // Legacy category support

    return matchesSearch && matchesTag;
  });

  // Sort prompts
  filteredPrompts.sort((a, b) => {
    switch (sortBy) {
      case 'title-asc':
        return a.title.localeCompare(b.title);
      case 'title-desc':
        return b.title.localeCompare(a.title);
      case 'category-asc':
        const aTag = (a.tags && a.tags.length > 0 && a.tags[0]) || a.category || '';
        const bTag = (b.tags && b.tags.length > 0 && b.tags[0]) || b.category || '';
        return aTag.localeCompare(bTag);
      case 'category-desc':
        const aTagDesc = (a.tags && a.tags.length > 0 && a.tags[0]) || a.category || '';
        const bTagDesc = (b.tags && b.tags.length > 0 && b.tags[0]) || b.category || '';
        return bTagDesc.localeCompare(aTagDesc);
      case 'date-newest':
        return (b.createdAt || 0) - (a.createdAt || 0);
      case 'date-oldest':
        return (a.createdAt || 0) - (b.createdAt || 0);
      case 'modified-newest':
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      case 'modified-oldest':
        return (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0);
      case 'favorites':
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });

  displayFilteredPrompts(filteredPrompts);
}

// Display filtered prompts (used by search and sort functions)
function displayFilteredPrompts(filteredPrompts) {
  const promptList = document.getElementById('promptList');

  if (filteredPrompts.length === 0) {
    promptList.innerHTML = '<div class="no-prompts">No prompts found matching your search.</div>';
    return;
  }

  promptList.innerHTML = filteredPrompts.map(prompt => createPromptHTML(prompt)).join('');
}

// Display all prompts in the list
function displayPrompts() {
  filterAndSortPrompts();
}

// Create HTML for a single prompt
function createPromptHTML(prompt) {
  const tags = prompt.tags || [];
  const tagsHTML = tags.length > 0 ? tags.map(tag =>
    `<span class="prompt-tag ${tag === 'Favorite' ? 'favorite' : ''}">${tag}</span>`
  ).join('') : '<span class="prompt-tag" style="color: #999; font-style: italic;">No tags</span>';

  const starIcon = prompt.isFavorite ? '★' : '☆';
  const starClass = prompt.isFavorite ? 'starred' : '';

  return `
    <div class="prompt-item">
      <div class="prompt-header">
        <div class="prompt-title">${prompt.title}</div>
        <button class="star-btn ${starClass}" data-action="toggle-favorite" data-prompt-id="${prompt.id}">${starIcon}</button>
      </div>
      <div class="prompt-tags">${tagsHTML}</div>
      <div class="prompt-text">${prompt.text}</div>
      <div class="prompt-actions">
        <button class="copy-btn" data-action="copy" data-prompt-id="${prompt.id}">Copy</button>
        <button class="edit-btn copy-btn" data-action="edit" data-prompt-id="${prompt.id}">Edit</button>
        <button class="delete-btn" data-action="delete" data-prompt-id="${prompt.id}">Delete</button>
      </div>
    </div>
  `;
}

// Toggle tag management interface
function showTagManagement() {
  const tagManagement = document.getElementById('tagManagement');
  const isVisible = tagManagement.style.display === 'block';

  if (isVisible) {
    hideTagManagement();
  } else {
    tagManagement.style.display = 'block';
    updateTagList();
  }
}

// Hide tag management interface
function hideTagManagement() {
  document.getElementById('tagManagement').style.display = 'none';
}

// Update the tag list in management interface
function updateTagList() {
  const tagList = document.getElementById('tagList');
  tagList.innerHTML = availableTags.map(tag => {
    const canEdit = !tag.isDefault && !tag.isFavorite;
    const readonlyAttr = canEdit ? '' : 'readonly';
    return `
      <div class="tag-item ${tag.isDefault ? 'default' : ''}">
        <input type="text" value="${tag.name}" ${readonlyAttr} 
               data-original-name="${tag.name}">
        ${canEdit ? `<button class="tag-delete" data-tag="${tag.name}">×</button>` : ''}
      </div>
    `;
  }).join('');

  // Add event listeners for delete buttons
  tagList.querySelectorAll('.tag-delete').forEach(btn => {
    btn.addEventListener('click', function () {
      deleteTag(this.getAttribute('data-tag'));
    });
  });

  // Add event listeners for input changes
  tagList.querySelectorAll('input[type="text"]').forEach(input => {
    input.addEventListener('change', function () {
      const oldName = this.getAttribute('data-original-name');
      const newName = this.value;
      updateTagName(oldName, newName);
    });
  });
}

// Add a new tag
function addNewTag() {
  const input = document.getElementById('addTagInput');
  const tagName = input.value.trim();

  if (!tagName) return;

  if (availableTags.some(tag => tag.name.toLowerCase() === tagName.toLowerCase())) {
    alert('Tag already exists');
    return;
  }

  availableTags.push({ name: tagName, isDefault: false });
  chrome.storage.local.set({ availableTags: availableTags }, function () {
    updateTagList();
    updateTagDropdown();
    input.value = '';
  });
}

// Delete a tag
function deleteTag(tagName) {
  if (confirm(`Delete tag "${tagName}"? This will remove it from all prompts.`)) {
    // Remove from available tags
    availableTags = availableTags.filter(tag => tag.name !== tagName);

    // Remove from all prompts
    prompts.forEach(prompt => {
      if (prompt.tags) {
        prompt.tags = prompt.tags.filter(tag => tag !== tagName);
      }
    });

    // Save changes
    chrome.storage.local.set({
      availableTags: availableTags,
      prompts: prompts
    }, function () {
      updateTagList();
      updateTagDropdown();
      filterAndSortPrompts();
    });
  }
}

// Update tag name
function updateTagName(oldName, newName) {
  newName = newName.trim();
  if (!newName || newName === oldName) return;

  // Check if new name already exists
  if (availableTags.some(tag => tag.name.toLowerCase() === newName.toLowerCase() && tag.name !== oldName)) {
    alert('Tag name already exists');
    updateTagList(); // Reset the input
    return;
  }

  // Update in available tags
  const tagIndex = availableTags.findIndex(tag => tag.name === oldName);
  if (tagIndex !== -1) {
    availableTags[tagIndex].name = newName;
  }

  // Update in all prompts
  prompts.forEach(prompt => {
    if (prompt.tags) {
      const tagIndex = prompt.tags.indexOf(oldName);
      if (tagIndex !== -1) {
        prompt.tags[tagIndex] = newName;
      }
    }
  });

  // Save changes
  chrome.storage.local.set({
    availableTags: availableTags,
    prompts: prompts
  }, function () {
    updateTagDropdown();
    filterAndSortPrompts();
  });
}

// Update the tag dropdown in the form
function updateTagDropdown() {
  const dropdown = document.getElementById('promptCategory');
  const currentValue = dropdown.value;

  const allTags = availableTags.map(tag => tag.name);

  dropdown.innerHTML = '<option value="">Select a tag...</option>';

  allTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    dropdown.appendChild(option);
  });

  // Restore previous selection if it still exists
  if (allTags.includes(currentValue)) {
    dropdown.value = currentValue;
  }

  // Also update the tag filter dropdown
  updateTagFilterDropdown();
}

// Update the tag filter dropdown with all available tags
function updateTagFilterDropdown() {
  const dropdown = document.getElementById('tagFilter');
  const currentValue = dropdown.value;
  const allTags = availableTags.map(tag => tag.name);

  dropdown.innerHTML = '<option value="">All tags</option>';

  allTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    dropdown.appendChild(option);
  });

  // Restore previous selection if it still exists
  if (allTags.includes(currentValue)) {
    dropdown.value = currentValue;
  }
}

// Add tag to current prompt being edited
function addTagToPrompt() {
  const select = document.getElementById('promptCategory');
  const selectedTag = select.value;

  if (selectedTag && !selectedTags.includes(selectedTag)) {
    selectedTags.push(selectedTag);
    updateSelectedTagsDisplay();
  }

  // Reset dropdown
  select.value = '';
}

// Remove tag from current prompt being edited
function removeTagFromPrompt(tag) {
  selectedTags = selectedTags.filter(t => t !== tag);
  updateSelectedTagsDisplay();
}

// Update display of selected tags in form
function updateSelectedTagsDisplay() {
  const container = document.getElementById('selectedTags');

  if (selectedTags.length === 0) {
    container.innerHTML = '<div style="color: #999; font-size: 11px; padding: 4px;">No tags selected. Add a tag from the dropdown below.</div>';
    return;
  }

  container.innerHTML = selectedTags.map(tag => `
    <div class="selected-tag ${tag === 'Favorite' ? 'favorite' : ''}">
      ${tag}
      <button class="selected-tag-remove" data-action="remove-tag" data-tag="${tag}">×</button>
    </div>
  `).join('');

  // Add event listeners for remove buttons
  container.querySelectorAll('[data-action="remove-tag"]').forEach(btn => {
    btn.addEventListener('click', function () {
      const tag = this.getAttribute('data-tag');
      removeTagFromPrompt(tag);
    });
  });
}

// Export prompts as CSV
function exportPrompts() {
  if (prompts.length === 0) {
    showImportStatus('No prompts to export', 'warning');
    return;
  }

  const csvData = generateCSVData();
  downloadFile(csvData, `prompt-box-export-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
  showImportStatus(`Exported ${prompts.length} prompts`, 'success');
}

// Download file helper
function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Download CSV template file for importing prompts
function downloadTemplate() {
  const templateContent = `Title,Tags,Prompt Text,Is Favorite,Created Date,Modified Date
"Example Writing Prompt","Writing; Creative","Write a compelling story about...",No,1/1/2024,1/1/2024
"Code Review Checklist","Coding; Business","Please review this code for...",Yes,1/1/2024,1/1/2024
"Research Assistant","Research; General","Help me research the topic of...",No,1/1/2024,1/1/2024`;

  downloadFile(templateContent, 'prompt-box-template.csv', 'text/csv');
  showImportStatus('✅ Template downloaded! Edit and import back.', 'success');
}

// Import prompts from CSV
function importPrompts(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const csv = e.target.result;
      const lines = csv.split('\n');
      const headers = parseCSVFields(lines[0]);

      // Validate headers
      if (!headers.includes('Title') || !headers.includes('Prompt Text')) {
        showImportStatus('Invalid CSV format. Missing required columns.', 'error');
        return;
      }

      let importedCount = 0;
      const newTags = new Set();

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields = parseCSVFields(line);
        if (fields.length < headers.length) continue;

        const promptData = {};
        headers.forEach((header, index) => {
          promptData[header] = fields[index] || '';
        });

        if (promptData.Title && promptData['Prompt Text']) {
          // Parse tags
          const tags = promptData.Tags ? promptData.Tags.split(';').map(t => t.trim()).filter(t => t) : ['General'];
          tags.forEach(tag => newTags.add(tag));

          const newPrompt = {
            id: Date.now() + importedCount,
            title: promptData.Title,
            text: promptData['Prompt Text'],
            tags: tags,
            isFavorite: promptData['Is Favorite']?.toLowerCase() === 'yes' || tags.includes('Favorite'),
            createdAt: promptData['Created Date'] ? new Date(promptData['Created Date']).getTime() : Date.now(),
            updatedAt: promptData['Modified Date'] ? new Date(promptData['Modified Date']).getTime() : Date.now()
          };

          prompts.push(newPrompt);
          importedCount++;
        }
      }

      // Add new tags to available tags
      newTags.forEach(tagName => {
        if (!availableTags.some(tag => tag.name === tagName)) {
          availableTags.push({ name: tagName, isDefault: false });
        }
      });

      // Save to storage
      chrome.storage.local.set({
        prompts: prompts,
        availableTags: availableTags
      }, function () {
        filterAndSortPrompts();
        updateTagDropdown();
        showImportStatus(`Successfully imported ${importedCount} prompts`, 'success');
      });

    } catch (error) {
      console.error('Import error:', error);
      showImportStatus('Error importing file', 'error');
    }
  };

  reader.readAsText(file);
  event.target.value = ''; // Reset file input
}

// Parse CSV fields properly handling quoted fields
function parseCSVFields(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }

  fields.push(current.trim());
  return fields;
}

// Generate CSV data
function generateCSVData() {
  const csvHeaders = 'Title,Tags,Prompt Text,Is Favorite,Created Date,Modified Date\n';
  const csvRows = prompts.map(prompt => {
    const tags = (prompt.tags || [prompt.category || 'General']).join('; ');
    const title = `"${prompt.title.replace(/"/g, '""')}"`;
    const text = `"${prompt.text.replace(/"/g, '""')}"`;
    const isFavorite = prompt.isFavorite ? 'Yes' : 'No';
    const createdDate = prompt.createdAt ? new Date(prompt.createdAt).toLocaleDateString() : '';
    const modifiedDate = prompt.updatedAt ? new Date(prompt.updatedAt).toLocaleDateString() : '';

    return `${title},"${tags}",${text},${isFavorite},${createdDate},${modifiedDate}`;
  }).join('\n');

  return csvHeaders + csvRows;
}

// Show import status message
function showImportStatus(message, type = 'info') {
  const statusElement = document.getElementById('importStatus');
  if (!statusElement) return;

  statusElement.textContent = message;
  statusElement.style.color = type === 'error' ? '#f44336' :
    type === 'warning' ? '#ff9800' :
      type === 'success' ? '#4caf50' : '#666';

  // Clear message after 3 seconds
  setTimeout(() => {
    statusElement.textContent = '';
  }, 3000);
}

// Load filter settings from storage
function loadFilterSettings() {
  chrome.storage.local.get(['filterSettings'], function (result) {
    if (result.filterSettings) {
      const settings = result.filterSettings;

      // Restore tag filter selection
      if (settings.tagFilter) {
        document.getElementById('tagFilter').value = settings.tagFilter;
      }

      // Restore sort selection
      if (settings.sortBy) {
        document.getElementById('sortBy').value = settings.sortBy;
      }

      // Apply the restored filters and sorting
      filterAndSortPrompts();
    }
  });
}

// Save filter settings to storage
function saveFilterSettings() {
  const settings = {
    tagFilter: document.getElementById('tagFilter').value,
    sortBy: document.getElementById('sortBy').value
  };

  chrome.storage.local.set({ filterSettings: settings });
}

// Generate a unique title by appending a number
function generateUniqueTitle(baseTitle) {
  let counter = 2;
  let suggestedTitle = `${baseTitle} (${counter})`;

  // Keep incrementing until we find a unique title
  while (prompts.some(p => p.title.toLowerCase() === suggestedTitle.toLowerCase() && p.id !== editingPromptId)) {
    counter++;
    suggestedTitle = `${baseTitle} (${counter})`;
  }

  return suggestedTitle;
}

// Functions are now handled by event delegation - no global assignments needed