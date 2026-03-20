// Prompt Box — Text Expansion Content Script
// Runs on all pages. Watches for typed shortcuts and expands them on Space.

let shortcuts = {}; // { "tlb": "full prompt text", ... }

// Load shortcuts from storage on init
function loadShortcuts() {
  chrome.storage.local.get(['prompts'], function (result) {
    shortcuts = {};
    (result.prompts || []).forEach(p => {
      if (p.shortcut && p.shortcut.trim()) {
        shortcuts[p.shortcut.trim().toLowerCase()] = p.text;
      }
    });
  });
}

// Keep in sync when user edits prompts in the popup
chrome.storage.onChanged.addListener(function (changes) {
  if (changes.prompts) loadShortcuts();
});

loadShortcuts();

// ─── Core listener ───────────────────────────────────────────────────────────
// Use `input` event (fires AFTER the character lands in the DOM) instead of
// keydown + preventDefault. This avoids fighting with Gmail/Notion/Slack's own
// keydown handlers and lets the space appear normally before we act on it.
document.addEventListener('input', function (e) {
  // Only act on a single space being typed (not paste, delete, etc.)
  if (e.data !== ' ') return;

  const el = e.target;

  if (isContentEditable(el)) {
    tryExpandContentEditable();
  } else if (isTextInput(el)) {
    tryExpandInput(el);
  }
}, false);

// ─── Field type helpers ───────────────────────────────────────────────────────
function isTextInput(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input') {
    const type = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel'].includes(type);
  }
  return false;
}

function isContentEditable(el) {
  if (!el) return false;
  // Check the element itself or walk up to find a contenteditable ancestor
  return el.isContentEditable === true ||
    (el.closest && !!el.closest('[contenteditable="true"]'));
}

// ─── Shortcut matching ────────────────────────────────────────────────────────
// textBefore is text before cursor including the space just typed.
// Returns { shortcut, expansion } or null.
function getShortcutMatch(textBefore) {
  // Word immediately before the trailing space, preceded by start-of-string or whitespace
  const match = textBefore.match(/(?:^|[\s\n])(\S+) $/);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const expansion = shortcuts[word];
  return expansion ? { shortcut: match[1], expansion } : null;
}

// ─── Standard input / textarea expansion ─────────────────────────────────────
function tryExpandInput(el) {
  const cursor = el.selectionStart;
  if (cursor === null) return;

  const before = el.value.substring(0, cursor);
  const result = getShortcutMatch(before);
  if (!result) return;

  const { shortcut, expansion } = result;
  const shortcutWithSpace = shortcut + ' ';
  const replaceStart = cursor - shortcutWithSpace.length;

  const newValue =
    el.value.substring(0, replaceStart) +
    expansion +
    el.value.substring(cursor);

  // Use the native prototype setter so React/Vue/Angular detect the change
  const proto = el.tagName.toLowerCase() === 'textarea'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(el, newValue);
  } else {
    el.value = newValue;
  }

  const newCursor = replaceStart + expansion.length;
  el.setSelectionRange(newCursor, newCursor);

  // Fire events so frameworks pick up the change
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ─── Contenteditable expansion (Gmail, Notion, Slack, etc.) ──────────────────
function tryExpandContentEditable() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  if (!range.collapsed) return; // don't act when text is selected

  const container = range.startContainer;
  let textBefore = '';
  let startNode, startOffset;

  if (container.nodeType === Node.TEXT_NODE) {
    // Normal case — cursor is inside a text node
    textBefore = container.textContent.substring(0, range.startOffset);
    startNode = container;
  } else {
    // Cursor is at an element boundary — look at the previous child text node
    const prevChild = container.childNodes[range.startOffset - 1];
    if (!prevChild || prevChild.nodeType !== Node.TEXT_NODE) return;
    textBefore = prevChild.textContent;
    startNode = prevChild;
  }

  const result = getShortcutMatch(textBefore);
  if (!result) return;

  const { shortcut, expansion } = result;
  const shortcutWithSpace = shortcut + ' ';

  // Calculate where the shortcut+space starts in the text node
  const nodeTextOffset = startNode === container
    ? range.startOffset
    : startNode.textContent.length;

  const deleteFrom = nodeTextOffset - shortcutWithSpace.length;
  if (deleteFrom < 0) return;

  // Select the shortcut+space range
  const replaceRange = document.createRange();
  replaceRange.setStart(startNode, deleteFrom);
  replaceRange.setEnd(
    range.startContainer,
    startNode === container ? range.startOffset : range.startOffset
  );

  selection.removeAllRanges();
  selection.addRange(replaceRange);

  // execCommand('insertText') is the correct API for contenteditable.
  // It works with Gmail, Notion, Slack, etc. because it fires the same
  // DOM events as real keyboard input and respects the app's undo stack.
  document.execCommand('insertText', false, expansion);
}
