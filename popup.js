// Simple Chrome Extension Popup Script
// This handles saving, displaying, and managing prompts

let prompts = [];
let customTags = [];
const defaultTags = ['General', 'Writing', 'Coding', 'Research', 'Creative', 'Business'];

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
let selectedTags = []; // Track selected tags for current form

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
  document.getElementById('sortBy').addEventListener('change', sortPrompts);
  document.getElementById('tagFilter').addEventListener('change', filterAndSortPrompts);
  document.getElementById('manageTagsBtn').addEventListener('click', showTagManagement);
  document.getElementById('closeTagsBtn').addEventListener('click', hideTagManagement);
  document.getElementById('addTagBtn').addEventListener('click', addNewTag);
  document.getElementById('promptCategory').addEventListener('change', addTagToPrompt);
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

// Show the form to edit an existing prompt
function showEditForm(id) {
  const prompt = prompts.find(p => p.id == parseInt(id));
  if (!prompt) return;
  
  editingPromptId = id;
  selectedTags = prompt.tags ? [...prompt.tags] : [prompt.category || 'General'];
  document.getElementById('promptTitle').value = prompt.title;
  document.getElementById('promptText').value = prompt.text;
  document.getElementById('promptCategory').value = '';
  
  document.getElementById('promptForm').style.display = 'block';
  document.getElementById('addPromptBtn').textContent = 'Cancel Edit';
  document.getElementById('savePromptBtn').textContent = 'Update';
  document.getElementById('promptTitle').focus();
  updateSelectedTagsDisplay();
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
  document.getElementById('promptCategory').value = '';
  selectedTags = [];
  updateSelectedTagsDisplay();
}

// Save a new prompt or update existing one
function savePrompt() {
  const title = document.getElementById('promptTitle').value.trim();
  const text = document.getElementById('promptText').value.trim();
  
  // Check if user filled in the important fields
  if (!title || !text) {
    alert('Please fill in both title and prompt text');
    return;
  }
  
  // Ensure at least one tag is selected
  if (selectedTags.length === 0) {
    selectedTags = ['General'];
  }
  
  // Check if Favorite tag is selected
  const hasFavoriteTag = selectedTags.includes('Favorite');
  
  if (editingPromptId) {
    // Update existing prompt
    const promptIndex = prompts.findIndex(p => p.id == parseInt(editingPromptId));
    if (promptIndex !== -1) {
      prompts[promptIndex] = {
        ...prompts[promptIndex],
        title: title,
        text: text,
        tags: [...selectedTags],
        category: selectedTags[0], // Keep category for backward compatibility
        isFavorite: hasFavoriteTag, // Set favorite status based on tags
        updatedAt: new Date().toISOString()
      };
    }
  } else {
    // Create new prompt
    const newPrompt = {
      id: Date.now(), // Simple way to create unique ID
      title: title,
      text: text,
      tags: [...selectedTags],
      category: selectedTags[0], // Keep category for backward compatibility
      createdAt: new Date().toISOString(),
      isFavorite: hasFavoriteTag // Set favorite status based on tags
    };
    prompts.push(newPrompt);
  }
  
  // Save and refresh display
  saveToStorage();
  filterAndSortPrompts(); // Use filter function to respect active filters
  hideAddForm();
}

// Load prompts from Chrome's storage
function loadPrompts() {
    chrome.storage.local.get(['prompts', 'sortPreference', 'customTags'], function(result) {
      prompts = result.prompts || [];
      customTags = result.customTags || [];
      
      // Migrate old prompts to new format
      prompts = prompts.map(prompt => {
        // Ensure isFavorite property exists
        if (prompt.isFavorite === undefined) {
          prompt.isFavorite = false;
        }
        
        // Initialize tags if they don't exist
        if (!prompt.tags && prompt.category) {
          prompt.tags = [prompt.category];
        } else if (!prompt.tags) {
          prompt.tags = ['General'];
          prompt.category = 'General';
        }
        
        return prompt;
      });
      
      // Save migrated data
      if (result.prompts && result.prompts.length > 0) {
        saveToStorage();
      }
      
      // Restore user's sort preference
      if (result.sortPreference) {
        document.getElementById('sortBy').value = result.sortPreference;
      }
      
      // Update category dropdown with all available tags
      updateCategoryDropdown();
      
      displayPrompts();
      
      // Also check for temp text from right-click
      checkForTempText();
    });
  }

// Save prompts to Chrome's storage
function saveToStorage() {
  chrome.storage.local.set({ 'prompts': prompts, 'customTags': customTags });
}

// Show all prompts in the list
function displayPrompts(filteredPrompts = null) {
    let listToShow = filteredPrompts || prompts;
    
    // Apply sorting if no filtered list is provided
    if (!filteredPrompts) {
      listToShow = applySorting(prompts);
    }
    
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
      const starSymbol = prompt.isFavorite ? '★' : '☆';
      const tags = prompt.tags || [prompt.category || 'General'];
      const tagsHTML = tags.map(tag => 
        `<span class="prompt-tag ${tag === 'Favorite' ? 'favorite' : ''}">${escapeHtml(tag)}</span>`
      ).join('');
      
      promptDiv.innerHTML = `
        <div class="prompt-header">
          <div class="prompt-title">${escapeHtml(prompt.title)}</div>
          <button class="star-btn ${prompt.isFavorite ? 'starred' : ''}" data-id="${prompt.id}" data-action="star">${starSymbol}</button>
        </div>
        <div class="prompt-tags">${tagsHTML}</div>
        <div class="prompt-text">${escapeHtml(prompt.text)}</div>
        <div class="prompt-actions">
          <button class="copy-btn" data-id="${prompt.id}" data-action="copy">Copy</button>
          <button class="edit-btn" data-id="${prompt.id}" data-action="edit">Edit</button>
          <button class="delete-btn" data-id="${prompt.id}" data-action="delete">Delete</button>
        </div>
      `;
      
      container.appendChild(promptDiv);
    });
    
    // Remove existing event listeners and add fresh ones
    const existingListener = container.getAttribute('data-listener-attached');
    if (!existingListener) {
      container.addEventListener('click', handlePromptActions);
      container.setAttribute('data-listener-attached', 'true');
    }
  }

// Handle all prompt action button clicks
function handlePromptActions(e) {
  if (e.target.tagName === 'BUTTON') {
    const id = e.target.getAttribute('data-id');
    const action = e.target.getAttribute('data-action');
    
    if (action === 'copy') {
      copyPrompt(id, e.target);
    } else if (action === 'edit') {
      editPrompt(id);
    } else if (action === 'delete') {
      deletePrompt(id);
    } else if (action === 'star') {
      toggleFavorite(id, e.target);
    }
  }
}

// Copy prompt text to clipboard
function copyPrompt(id, buttonElement) {
    const prompt = prompts.find(p => p.id == parseInt(id));
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
    prompts = prompts.filter(p => p.id != parseInt(id));
    saveToStorage();
    filterAndSortPrompts(); // Use filter function to respect active filters
  }
}

// Filter prompts based on search
function filterPrompts() {
  filterAndSortPrompts();
}

// Filter and sort prompts based on both search and tag filter
function filterAndSortPrompts() {
  const searchTerm = document.getElementById('searchBox').value.toLowerCase();
  const tagFilter = document.getElementById('tagFilter').value;
  
  let filtered = prompts;
  
  // Apply tag filter first
  if (tagFilter) {
    filtered = prompts.filter(prompt => {
      const tags = prompt.tags || [prompt.category || 'General'];
      return tags.includes(tagFilter);
    });
  }
  
  // Apply search filter
  if (searchTerm) {
    filtered = filtered.filter(prompt => {
      const tags = prompt.tags || [prompt.category || 'General'];
      return prompt.title.toLowerCase().includes(searchTerm) ||
             prompt.text.toLowerCase().includes(searchTerm) ||
             tags.some(tag => tag.toLowerCase().includes(searchTerm));
    });
  }
  
  // Apply current sorting to filtered results
  const sorted = applySorting(filtered);
  displayPrompts(sorted);
}

// Sort prompts based on selected option
function sortPrompts() {
  const sortBy = document.getElementById('sortBy').value;
  
  // Save user's sort preference
  chrome.storage.local.set({ 'sortPreference': sortBy });
  
  // Use the unified filter and sort function
  filterAndSortPrompts();
}

// Apply sorting logic based on current sort selection
function applySorting(promptsToSort) {
  const sortBy = document.getElementById('sortBy').value;
  const sortedPrompts = [...promptsToSort];
  
  switch (sortBy) {
    case 'title-asc':
      return sortedPrompts.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
    
    case 'title-desc':
      return sortedPrompts.sort((a, b) => b.title.toLowerCase().localeCompare(a.title.toLowerCase()));
    
    case 'category-asc':
      return sortedPrompts.sort((a, b) => a.category.toLowerCase().localeCompare(b.category.toLowerCase()));
    
    case 'category-desc':
      return sortedPrompts.sort((a, b) => b.category.toLowerCase().localeCompare(a.category.toLowerCase()));
    
    case 'date-newest':
      return sortedPrompts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    case 'date-oldest':
      return sortedPrompts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    case 'modified-newest':
      return sortedPrompts.sort((a, b) => {
        const aDate = new Date(a.updatedAt || a.createdAt);
        const bDate = new Date(b.updatedAt || b.createdAt);
        return bDate - aDate;
      });
    
    case 'modified-oldest':
      return sortedPrompts.sort((a, b) => {
        const aDate = new Date(a.updatedAt || a.createdAt);
        const bDate = new Date(b.updatedAt || b.createdAt);
        return aDate - bDate;
      });
    
    case 'favorites':
      return sortedPrompts.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
      });
    
    default:
      return sortedPrompts;
  }
}

// Make text safe for HTML (prevents XSS attacks)
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Toggle favorite status of a prompt
function toggleFavorite(id, buttonElement) {
  const promptIndex = prompts.findIndex(p => p.id == parseInt(id));
  if (promptIndex !== -1) {
    const wasStarred = prompts[promptIndex].isFavorite;
    prompts[promptIndex].isFavorite = !prompts[promptIndex].isFavorite;
    
    
    // Initialize tags if they don't exist
    if (!prompts[promptIndex].tags) {
      prompts[promptIndex].tags = [prompts[promptIndex].category || 'General'];
    }
    
    if (prompts[promptIndex].isFavorite) {
      // Starring the prompt - add Favorite tag if not present
      if (!prompts[promptIndex].tags.includes('Favorite')) {
        prompts[promptIndex].tags.push('Favorite');
      }
      prompts[promptIndex].category = 'Favorite'; // Update primary category for backward compatibility
      
      // Ensure Favorite is in available tags
      if (!getAllTags().includes('Favorite')) {
        customTags.push('Favorite');
      }
    } else {
      // Unstarring the prompt - remove Favorite tag
      prompts[promptIndex].tags = prompts[promptIndex].tags.filter(tag => tag !== 'Favorite');
      
      // If no tags left, add General
      if (prompts[promptIndex].tags.length === 0) {
        prompts[promptIndex].tags = ['General'];
      }
      
      // Update primary category for backward compatibility
      prompts[promptIndex].category = prompts[promptIndex].tags[0];
    }
    
    saveToStorage();
    filterAndSortPrompts(); // Use filter function instead of displayPrompts to respect active filters
    updateCategoryDropdown();
  }
}

// Toggle tag management interface
function showTagManagement() {
  const tagManagement = document.getElementById('tagManagement');
  const isVisible = tagManagement.style.display === 'block';
  
  if (isVisible) {
    tagManagement.style.display = 'none';
  } else {
    tagManagement.style.display = 'block';
    displayTagList();
  }
}

// Hide tag management interface
function hideTagManagement() {
  document.getElementById('tagManagement').style.display = 'none';
}

// Display all available tags in management interface
function displayTagList() {
  const tagList = document.getElementById('tagList');
  const allTags = getAllTags();
  
  tagList.innerHTML = '';
  
  allTags.forEach(tag => {
    const isDefault = defaultTags.includes(tag);
    const isFavorite = tag === 'Favorite';
    const canEdit = !isDefault && !isFavorite;
    const canDelete = !isDefault && !isFavorite;
    
    const tagDiv = document.createElement('div');
    tagDiv.className = `tag-item ${isDefault ? 'default' : ''}`;
    
    tagDiv.innerHTML = `
      <input type="text" value="${escapeHtml(tag)}" ${canEdit ? '' : 'readonly'} data-original="${escapeHtml(tag)}">
      ${canDelete ? '<button class="tag-delete" data-tag="' + escapeHtml(tag) + '">&times;</button>' : ''}
    `;
    
    // Add event listener for tag editing
    const input = tagDiv.querySelector('input');
    if (canEdit) {
      input.addEventListener('blur', (e) => updateTag(e.target.dataset.original, e.target.value.trim()));
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      });
    }
    
    // Add event listener for tag deletion
    const deleteBtn = tagDiv.querySelector('.tag-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        deleteTag(e.target.dataset.tag);
      });
    }
    
    tagList.appendChild(tagDiv);
  });
}

// Add a new tag
function addNewTag() {
  const input = document.getElementById('addTagInput');
  const tagName = input.value.trim();
  
  if (!tagName) {
    alert('Please enter a tag name');
    return;
  }
  
  if (getAllTags().includes(tagName)) {
    alert('Tag already exists');
    return;
  }
  
  customTags.push(tagName);
  input.value = '';
  saveToStorage();
  displayTagList();
  updateCategoryDropdown();
}

// Update an existing tag
function updateTag(oldName, newName) {
  if (!newName || newName === oldName) return;
  
  if (getAllTags().includes(newName) && newName !== oldName) {
    alert('Tag already exists');
    displayTagList();
    return;
  }
  
  // Update in custom tags
  const tagIndex = customTags.indexOf(oldName);
  if (tagIndex !== -1) {
    customTags[tagIndex] = newName;
  }
  
  // Update all prompts that use this tag
  prompts.forEach(prompt => {
    if (prompt.category === oldName) {
      prompt.category = newName;
    }
  });
  
  saveToStorage();
  displayTagList();
  updateCategoryDropdown();
  filterAndSortPrompts(); // Use filter function to respect active filters
}

// Delete a custom tag
function deleteTag(tagName) {
  if (confirm(`Delete tag "${tagName}"? Prompts using this tag will be changed to "General".`)) {
    // Remove from custom tags
    customTags = customTags.filter(tag => tag !== tagName);
    
    // Update prompts using this tag to "General"
    prompts.forEach(prompt => {
      if (prompt.category === tagName) {
        prompt.category = 'General';
      }
    });
    
    saveToStorage();
    displayTagList();
    updateCategoryDropdown();
    filterAndSortPrompts(); // Use filter function to respect active filters
  }
}


// Get all available tags (default + custom)
function getAllTags() {
  return [...new Set([...defaultTags, ...customTags])];
}

// Update the category dropdown with all available tags
function updateCategoryDropdown() {
  const dropdown = document.getElementById('promptCategory');
  const currentValue = dropdown.value;
  const allTags = getAllTags();
  
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
  const allTags = getAllTags();
  
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
  if (selectedTags.length === 0) {
    selectedTags = ['General'];
  }
  updateSelectedTagsDisplay();
}

// Update the display of selected tags in the form
function updateSelectedTagsDisplay() {
  const container = document.getElementById('selectedTags');
  if (!container) return;
  
  container.innerHTML = '';
  
  selectedTags.forEach(tag => {
    const tagDiv = document.createElement('div');
    tagDiv.className = `selected-tag ${tag === 'Favorite' ? 'favorite' : ''}`;
    tagDiv.innerHTML = `
      <span>${escapeHtml(tag)}</span>
      <button class="selected-tag-remove" data-tag="${escapeHtml(tag)}">&times;</button>
    `;
    
    // Add event listener for tag removal
    const removeBtn = tagDiv.querySelector('.selected-tag-remove');
    removeBtn.addEventListener('click', (e) => {
      removeTagFromPrompt(e.target.dataset.tag);
    });
    
    container.appendChild(tagDiv);
  });
}

// Make functions available globally so HTML onclick can use them
window.copyPrompt = copyPrompt;
window.editPrompt = editPrompt;
window.deletePrompt = deletePrompt;
window.deleteTag = deleteTag;