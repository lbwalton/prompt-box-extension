// Prompt Box — Text Expansion Content Script
// Runs on all pages. Watches for typed shortcuts and expands them on Space.
//
// Strategy:
//   • input / textarea  → keydown (capture phase) with preventDefault.
//     We replace BEFORE the space is inserted, so reactive frameworks
//     (React, Vue) never get a chance to re-render with the unexpanded value.
//   • contenteditable   → input event + execCommand('insertText').
//     Gmail/Notion/Slack manage their own editor state and break if we touch
//     the DOM directly during keydown.

const PB_DEBUG = false;
function pbLog() {
  if (!PB_DEBUG) return;
  const args = Array.from(arguments);
  console.log.apply(console, ['[PromptBox]'].concat(args));
}

let shortcuts = {}; // { "tlb": "full prompt text", ... }
let ceExpanding = false; // re-entrancy guard for contenteditable expansion

// Read prompts from whichever storage area the user has configured.
// storagePref is always kept in chrome.storage.local; prompts live in either
// chrome.storage.sync (default) or chrome.storage.local depending on it.
function loadShortcuts() {
  chrome.storage.local.get(['storagePref'], function (prefResult) {
    const storagePref = prefResult.storagePref || 'sync';
    const area = storagePref === 'local' ? chrome.storage.local : chrome.storage.sync;
    area.get(['prompts'], function (result) {
      const prompts = result.prompts || [];
      shortcuts = {};
      prompts.forEach(p => {
        if (p.shortcut && p.shortcut.trim()) {
          shortcuts[p.shortcut.trim().toLowerCase()] = p.text;
        }
      });
      pbLog('shortcuts loaded from', storagePref, 'storage:', Object.keys(shortcuts));
    });
  });
}

// Re-load when prompts change in EITHER storage area, or when the user
// switches storage mode.
chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (changes.prompts || changes.storagePref) loadShortcuts();
});

loadShortcuts();
pbLog('content script initialized on', location.href);

// ─── Field type helpers ───────────────────────────────────────────────────────
// Allow expansion in any typable input. Password is excluded intentionally
// (extensions should never read or modify password fields), and non-text
// types like checkboxes / date pickers don't accept typed characters.
const NON_TEXT_INPUT_TYPES = new Set([
  'password', 'checkbox', 'radio', 'file', 'submit', 'button', 'reset',
  'image', 'hidden', 'color', 'range', 'date', 'datetime-local',
  'month', 'time', 'week'
]);

function isTextInput(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input') {
    const type = (el.type || 'text').toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  return false;
}

function isContentEditable(el) {
  if (!el) return false;
  return el.isContentEditable === true ||
    (el.closest && !!el.closest('[contenteditable="true"]'));
}

// ─── Shortcut lookup ──────────────────────────────────────────────────────────
// Find a shortcut at the END of the given text. Shortcut must be at start of
// string or preceded by whitespace. Returns the shortcut string or null.
function findShortcutAtEnd(text) {
  const match = text.match(/(?:^|[\s\n])(\S+)$/);
  if (!match) return null;
  const word = match[1].toLowerCase();
  return shortcuts[word] ? match[1] : null;
}

// ─── KEYDOWN PATH (input / textarea) ─────────────────────────────────────────
// Fires BEFORE the space is inserted. We preventDefault and do the
// replacement ourselves, so we never race with framework re-renders.
// Registered on window+capture so we run before any page-level handlers,
// regardless of when their script loaded relative to this content script.
window.addEventListener('keydown', function (e) {
  if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey) return;
  // Skip if a composition (IME) is active
  if (e.isComposing || e.keyCode === 229) return;

  const el = e.target;

  // Contenteditable handled by input listener below
  if (isContentEditable(el)) return;
  if (!isTextInput(el)) return;

  // Some input types (email, number, and url in Chrome) don't expose
  // selectionStart — they either return null or throw InvalidStateError.
  // In those cases, assume the cursor is at the end of the value, which
  // is true whenever the user is actively appending characters.
  let cursor;
  try {
    cursor = el.selectionStart;
  } catch (err) {
    cursor = null;
  }
  if (cursor == null) cursor = el.value.length;

  const before = el.value.substring(0, cursor);
  const shortcut = findShortcutAtEnd(before);
  if (!shortcut) return;

  const expansion = shortcuts[shortcut.toLowerCase()];
  pbLog('keydown match:', shortcut, '→', expansion.length, 'chars on', el.tagName, el.type);

  e.preventDefault();

  const replaceStart = cursor - shortcut.length;
  const newValue =
    el.value.substring(0, replaceStart) +
    expansion +
    el.value.substring(cursor);

  // Native setter so React's _valueTracker registers the change
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
  try { el.setSelectionRange(newCursor, newCursor); } catch (err) {}

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  // Sanity check: did the value stick?
  setTimeout(function () {
    pbLog('post-expansion check, value matches?', el.value === newValue,
      'len:', el.value.length);
  }, 50);
}, true); // capture so we run before page handlers

// ─── INPUT EVENT PATH (contenteditable) ──────────────────────────────────────
// Fires AFTER the space lands. For contenteditable editors (Gmail, Notion,
// Slack), preventing default in keydown breaks their editor state, so we let
// the space be typed naturally and replace shortcut+space afterward via
// execCommand('insertText').
document.addEventListener('input', function (e) {
  if (ceExpanding) return;
  // Match space (U+0020) or non-breaking space (U+00A0) — contenteditable
  // editors sometimes substitute NBSP for regular space.
  if (e.data !== ' ' && e.data !== '\u00A0') return;
  const el = e.target;
  if (!isContentEditable(el)) return;

  pbLog('input event in contenteditable on', el.tagName, 'data charCode=', e.data.charCodeAt(0));
  tryExpandContentEditable();
}, false);

function tryExpandContentEditable() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) {
    pbLog('  ce bail: no selection');
    return;
  }

  const range = selection.getRangeAt(0);
  if (!range.collapsed) {
    pbLog('  ce bail: range not collapsed');
    return;
  }

  const container = range.startContainer;
  let textBefore = '';
  let startNode;

  if (container.nodeType === Node.TEXT_NODE) {
    textBefore = container.textContent.substring(0, range.startOffset);
    startNode = container;
    pbLog('  ce text node case, offset=', range.startOffset,
      'textBefore=', JSON.stringify(textBefore.slice(-30)));
  } else {
    const prevChild = container.childNodes[range.startOffset - 1];
    if (!prevChild || prevChild.nodeType !== Node.TEXT_NODE) {
      pbLog('  ce bail: container not text node, prevChild not text', {
        containerType: container.nodeType,
        prevChildType: prevChild && prevChild.nodeType
      });
      return;
    }
    textBefore = prevChild.textContent;
    startNode = prevChild;
    pbLog('  ce element case, prevChild text=', JSON.stringify(textBefore.slice(-30)));
  }

  // Match shortcut + trailing whitespace at the end.
  // \s matches both regular space (U+0020) and the non-breaking space
  // (U+00A0) that contenteditable editors often insert.
  const match = textBefore.match(/(?:^|\s)(\S+)\s$/);
  if (!match) {
    pbLog('  ce bail: regex no match for', JSON.stringify(textBefore.slice(-30)));
    return;
  }
  const word = match[1].toLowerCase();
  const expansion = shortcuts[word];
  if (!expansion) {
    pbLog('  ce bail: no shortcut for word', JSON.stringify(word),
      'available:', Object.keys(shortcuts));
    return;
  }

  pbLog('contenteditable match:', match[1], '→', expansion.length, 'chars');

  const shortcutWithSpace = match[1] + ' ';
  const nodeTextOffset = startNode === container
    ? range.startOffset
    : startNode.textContent.length;

  const deleteFrom = nodeTextOffset - shortcutWithSpace.length;
  if (deleteFrom < 0) return;

  const replaceRange = document.createRange();
  replaceRange.setStart(startNode, deleteFrom);
  replaceRange.setEnd(
    range.startContainer,
    startNode === container ? range.startOffset : range.startOffset
  );

  // Defer to next macrotask. Chrome blocks execCommand if it's called
  // recursively from within an input event triggered by another execCommand
  // (e.g. on sites that insert text programmatically). The setTimeout pushes
  // our call outside the recursive context.
  setTimeout(function () {
    ceExpanding = true;
    try {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(replaceRange);
      const ok = document.execCommand('insertText', false, expansion);
      pbLog('  ce execCommand returned', ok, 'after-text=',
        JSON.stringify(startNode.textContent.slice(0, 60)));
    } finally {
      ceExpanding = false;
    }
  }, 0);
}
