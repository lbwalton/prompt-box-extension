// Prompt Box — Text Expansion Content Script
// Runs on all pages. Watches for typed shortcuts and expands them.

let shortcuts = {}; // { "tlb": "full prompt text", ... }

// Load shortcuts from storage and keep them in sync
function loadShortcuts() {
  chrome.storage.local.get(['prompts'], function (result) {
    const prompts = result.prompts || [];
    shortcuts = {};
    prompts.forEach(prompt => {
      if (prompt.shortcut && prompt.shortcut.trim()) {
        shortcuts[prompt.shortcut.trim().toLowerCase()] = prompt.text;
      }
    });
  });
}

// Re-sync whenever storage changes (e.g. user adds/edits a prompt in the popup)
chrome.storage.onChanged.addListener(function (changes) {
  if (changes.prompts) {
    loadShortcuts();
  }
});

loadShortcuts();

// Trigger key: Space. When user types a shortcut followed by Space,
// replace the shortcut+space with the prompt text.
document.addEventListener('keydown', function (e) {
  if (e.key !== ' ') return;

  const el = e.target;
  if (!isEditableField(el)) return;

  // Get current typed text before the cursor
  const typed = getTextBeforeCursor(el);
  if (!typed) return;

  // Extract the last "word" (no spaces) before the space they just pressed
  const words = typed.split(' ');
  const lastWord = words[words.length - 1].toLowerCase();

  if (!lastWord || !shortcuts[lastWord]) return;

  // We have a match — prevent the space from being typed
  e.preventDefault();

  const expansionText = shortcuts[lastWord];
  replaceShortcut(el, lastWord, expansionText);
}, true);

// Determine if an element is a text input we should watch
function isEditableField(el) {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (el.type || 'text').toLowerCase();
    // Expand in text-like inputs, never in password fields
    const textTypes = ['text', 'search', 'email', 'url', 'tel'];
    return textTypes.includes(type);
  }
  if (tag === 'textarea') return true;
  if (el.isContentEditable) return true;
  return false;
}

// Get text before the cursor position
function getTextBeforeCursor(el) {
  if (el.isContentEditable) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return '';
    const range = selection.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString();
  }
  // Standard input / textarea
  return el.value.substring(0, el.selectionStart);
}

// Replace the typed shortcut with the full prompt text
function replaceShortcut(el, shortcut, expansionText) {
  if (el.isContentEditable) {
    replaceInContentEditable(shortcut, expansionText);
    return;
  }

  const start = el.selectionStart;
  const end = el.selectionEnd;
  const value = el.value;

  // Find the shortcut at the end of the current text (before cursor)
  const beforeCursor = value.substring(0, start);
  const shortcutIndex = beforeCursor.lastIndexOf(shortcut);

  if (shortcutIndex === -1) return;

  const newValue =
    value.substring(0, shortcutIndex) +
    expansionText +
    value.substring(end);

  el.value = newValue;

  // Place cursor at end of expanded text
  const newCursorPos = shortcutIndex + expansionText.length;
  el.setSelectionRange(newCursorPos, newCursorPos);

  // Fire input event so React/Vue/Angular frameworks detect the change
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Handle contenteditable expansion (Gmail compose, Notion, etc.)
function replaceInContentEditable(shortcut, expansionText) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const node = range.startContainer;

  if (node.nodeType !== Node.TEXT_NODE) return;

  const text = node.textContent;
  const offset = range.startOffset;
  const beforeCursor = text.substring(0, offset);
  const shortcutIndex = beforeCursor.lastIndexOf(shortcut);

  if (shortcutIndex === -1) return;

  // Replace shortcut with expansion text
  node.textContent =
    text.substring(0, shortcutIndex) +
    expansionText +
    text.substring(offset);

  // Move cursor to end of expanded text
  const newOffset = shortcutIndex + expansionText.length;
  const newRange = document.createRange();
  newRange.setStart(node, newOffset);
  newRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(newRange);
}
