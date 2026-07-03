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

// Resolve the real event target. For events originating inside an OPEN
// shadow root, e.target is the shadow host; composedPath()[0] is the actual
// element the user typed into. Closed shadow roots stay unreachable.
function resolveTarget(e) {
  if (typeof e.composedPath === 'function') {
    const path = e.composedPath();
    if (path && path.length) return path[0];
  }
  return e.target;
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

// ─── Expansion engine: layered attempts + verification ──────────────────────
// Every expansion attempt builds a ctx and is verified VERIFY_DELAY_MS later.
// If the text didn't stick (framework reverted it), we escalate:
//   Layer 1  direct replacement (native setter / execCommand)
//   Layer 2  synthetic paste event (rich editors handle paste themselves)
//   Layer 3  clipboard + toast (added in a later change)
const VERIFY_DELAY_MS = 100;

// Collapse whitespace runs so NBSP substitution and newline-to-<br>
// conversion inside editors don't cause false verification failures.
function normalizeWS(s) {
  return s.replace(/\s+/g, ' ');
}

function ceRoot(el) {
  if (el && el.closest) {
    const root = el.closest('[contenteditable="true"]');
    if (root) return root;
  }
  return el;
}

function expansionStuck(ctx) {
  const el = ctx.el;
  // Element gone from the DOM: an Enter-triggered submit/navigation already
  // consumed the expanded value. Treat as success.
  if (!el || !el.isConnected) return true;
  const haystack = ctx.isCE
    ? (ceRoot(el).textContent || '')
    : (typeof el.value === 'string' ? el.value : '');
  return normalizeWS(haystack).indexOf(normalizeWS(ctx.expansion)) !== -1;
}

function scheduleVerify(ctx) {
  setTimeout(function () { verifyAndEscalate(ctx); }, VERIFY_DELAY_MS);
}

function verifyAndEscalate(ctx) {
  if (expansionStuck(ctx)) {
    pbLog('layer', ctx.layer, 'verified OK');
    return;
  }
  if (ctx.layer >= 3) {
    pbLog('layer 3 reached, chain ends');
    return;
  }
  ctx.layer += 1;
  pbLog('escalating to layer', ctx.layer);
  if (ctx.layer === 2) {
    const dispatched = ctx.isCE ? runLayer2CE(ctx) : runLayer2Input(ctx);
    if (dispatched) {
      scheduleVerify(ctx);
    } else {
      ctx.layer = 3;
      runLayer3Clipboard(ctx);
    }
  } else {
    runLayer3Clipboard(ctx);
  }
}

// Layer 1 for input/textarea: replace via the native value setter so React's
// internal value tracking registers the change.
function runLayer1Input(ctx, cursor) {
  const el = ctx.el;
  const newValue =
    el.value.substring(0, ctx.replaceStart) +
    ctx.expansion +
    el.value.substring(cursor);

  const proto = el.tagName.toLowerCase() === 'textarea'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(el, newValue);
  } else {
    el.value = newValue;
  }

  const newCursor = ctx.replaceStart + ctx.expansion.length;
  try { el.setSelectionRange(newCursor, newCursor); } catch (err) {}

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Layer 2 for input/textarea: select the shortcut text, then hand the
// insertion to the page's own paste handling via a synthetic paste event.
// Only runs if the shortcut text is verifiably still in place, so we can
// never double-insert.
function runLayer2Input(ctx) {
  const el = ctx.el;
  const val = typeof el.value === 'string' ? el.value : '';
  const current = val.substr(ctx.replaceStart, ctx.shortcut.length);
  if (current.toLowerCase() !== ctx.shortcut.toLowerCase()) {
    pbLog('layer2 input: shortcut no longer at expected position');
    return false;
  }
  try {
    el.focus();
    el.setSelectionRange(ctx.replaceStart, ctx.replaceStart + ctx.shortcut.length);
  } catch (err) {
    // email/number inputs throw on setSelectionRange
    pbLog('layer2 input: selection not supported', err);
    return false;
  }
  return dispatchSyntheticPaste(el, ctx.expansion);
}

// Layer 2 for contenteditable: re-locate the shortcut at the caret (the DOM
// may have re-rendered since Layer 1), select it, dispatch synthetic paste.
function runLayer2CE(ctx) {
  const found = locateCEShortcut();
  if (!found) {
    pbLog('layer2 CE: shortcut not found at caret');
    return false;
  }
  try {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(found.range);
  } catch (err) {
    pbLog('layer2 CE: could not select range', err);
    return false;
  }
  return dispatchSyntheticPaste(ceRoot(ctx.el), ctx.expansion);
}

// Synthetic paste: a ClipboardEvent carrying the expansion in DataTransfer.
// Untrusted events don't trigger the browser's default paste action, but
// rich editors (Lexical, ProseMirror, Quill) implement paste in JS and
// accept them. The user's real clipboard is never touched here.
// Note: we have no paste listeners of our own, and any input events the
// editor fires from this have e.data !== ' ', so our listeners ignore them.
function dispatchSyntheticPaste(target, text) {
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const evt = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    });
    target.dispatchEvent(evt);
    return true;
  } catch (err) {
    pbLog('synthetic paste failed:', err);
    return false;
  }
}

// ─── Layer 3: clipboard + toast (universal safety net) ──────────────────────
// If the page blocks both direct replacement and synthetic paste, copy the
// expansion to the real clipboard and tell the user to paste. Best effort:
// leave the shortcut text selected so their paste replaces it in one go.
const TOAST_DISMISS_MS = 5000;

function runLayer3Clipboard(ctx) {
  try {
    if (!ctx.isCE) {
      const val = typeof ctx.el.value === 'string' ? ctx.el.value : '';
      const current = val.substr(ctx.replaceStart, ctx.shortcut.length);
      if (current.toLowerCase() === ctx.shortcut.toLowerCase()) {
        ctx.el.focus();
        ctx.el.setSelectionRange(ctx.replaceStart, ctx.replaceStart + ctx.shortcut.length);
      }
    } else {
      const found = locateCEShortcut();
      if (found) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(found.range);
      }
    }
  } catch (err) {
    pbLog('layer3: could not pre-select shortcut', err);
  }

  copyToClipboard(ctx.expansion, function (ok) {
    if (ok) {
      showToast('Prompt Box: prompt copied. Press ' + pasteKeyLabel() + ' to paste.');
    } else {
      showToast('Prompt Box: could not expand here. Open Prompt Box to copy your prompt.');
    }
  });
}

function pasteKeyLabel() {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';
}

function copyToClipboard(text, cb) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () { cb(true); },
      function () { cb(legacyCopy(text)); }
    );
  } else {
    cb(legacyCopy(text));
  }
}

// Fallback copy path for pages where the async clipboard API is blocked.
// Steals focus for one tick; restores it afterwards.
function legacyCopy(text) {
  const prevActive = document.activeElement;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.opacity = '0';
  (document.body || document.documentElement).appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
  ta.remove();
  if (prevActive && typeof prevActive.focus === 'function') {
    try { prevActive.focus(); } catch (err) {}
  }
  return ok;
}

// ─── Toast ───────────────────────────────────────────────────────────────────
// Rendered in a CLOSED shadow root on a container appended to
// document.documentElement, so page CSS can't restyle it and page scripts
// can't easily reach it. Built with createElement/textContent only.
let toastHost = null;
let toastTimer = null;

function showToast(message) {
  removeToast();

  toastHost = document.createElement('div');
  const shadow = toastHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent =
    '.pb-toast {' +
    '  position: fixed; bottom: 20px; right: 20px;' +
    '  background: #1f2937; color: #f9fafb;' +
    "  font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;" +
    '  padding: 10px 14px; border-radius: 8px;' +
    '  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);' +
    '  z-index: 2147483647; cursor: pointer; max-width: 320px;' +
    '}';

  const box = document.createElement('div');
  box.className = 'pb-toast';
  box.textContent = message;
  box.addEventListener('click', removeToast);

  shadow.appendChild(style);
  shadow.appendChild(box);
  (document.documentElement || document.body).appendChild(toastHost);

  toastTimer = setTimeout(removeToast, TOAST_DISMISS_MS);
}

function removeToast() {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (toastHost) {
    toastHost.remove();
    toastHost = null;
  }
}

// Keys that trigger expansion in input/textarea. Space is consumed (the
// expansion replaces shortcut + swallows the space, as before). Tab and
// Enter are NOT prevented: the value is expanded synchronously in capture
// phase, then the default action proceeds (focus moves, form submits) with
// the expanded text already in place. This is what makes sign-in boxes and
// search bars work, where users never press Space after a shortcut.
const TRIGGER_KEYS = new Set([' ', 'Tab', 'Enter']);

// ─── KEYDOWN PATH (input / textarea) ─────────────────────────────────────────
// Fires BEFORE the space is inserted. We preventDefault and do the
// replacement ourselves, so we never race with framework re-renders.
// Registered on window+capture so we run before any page-level handlers,
// regardless of when their script loaded relative to this content script.
window.addEventListener('keydown', function (e) {
  if (!TRIGGER_KEYS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
  // Skip if a composition (IME) is active
  if (e.isComposing || e.keyCode === 229) return;

  const el = resolveTarget(e);

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
  pbLog('keydown match:', shortcut, 'via key', JSON.stringify(e.key));

  // Only Space is consumed. Tab/Enter keep their default action.
  if (e.key === ' ') e.preventDefault();

  const ctx = {
    el: el,
    isCE: false,
    shortcut: shortcut,
    expansion: expansion,
    replaceStart: cursor - shortcut.length,
    layer: 1
  };
  runLayer1Input(ctx, cursor);
  scheduleVerify(ctx);
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
  const el = resolveTarget(e);
  if (!isContentEditable(el)) return;

  pbLog('input event in contenteditable on', el.tagName, 'data charCode=', e.data.charCodeAt(0));
  tryExpandContentEditable();
}, false);

// Locate a shortcut + trailing space immediately before the caret in a
// contenteditable. Returns { range, shortcut, expansion } or null.
// \s matches both regular space (U+0020) and the non-breaking space
// (U+00A0) that contenteditable editors often insert.
function locateCEShortcut() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) {
    pbLog('  ce bail: no selection');
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!range.collapsed) {
    pbLog('  ce bail: range not collapsed');
    return null;
  }

  const container = range.startContainer;
  let textBefore = '';
  let startNode;

  if (container.nodeType === Node.TEXT_NODE) {
    textBefore = container.textContent.substring(0, range.startOffset);
    startNode = container;
  } else {
    const prevChild = container.childNodes[range.startOffset - 1];
    if (!prevChild || prevChild.nodeType !== Node.TEXT_NODE) {
      pbLog('  ce bail: container not text node, prevChild not text');
      return null;
    }
    textBefore = prevChild.textContent;
    startNode = prevChild;
  }

  const match = textBefore.match(/(?:^|\s)(\S+)\s$/);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const expansion = shortcuts[word];
  if (!expansion) return null;

  const shortcutWithSpace = match[1] + ' ';
  const nodeTextOffset = startNode === container
    ? range.startOffset
    : startNode.textContent.length;

  const deleteFrom = nodeTextOffset - shortcutWithSpace.length;
  if (deleteFrom < 0) return null;

  const replaceRange = document.createRange();
  replaceRange.setStart(startNode, deleteFrom);
  replaceRange.setEnd(range.startContainer, range.startOffset);

  return { range: replaceRange, shortcut: match[1], expansion: expansion };
}

function tryExpandContentEditable() {
  const found = locateCEShortcut();
  if (!found) return;

  pbLog('contenteditable match:', found.shortcut, '→', found.expansion.length, 'chars');

  const startContainer = found.range.startContainer;
  const anchorEl = startContainer.nodeType === Node.TEXT_NODE
    ? startContainer.parentElement
    : startContainer;

  const ctx = {
    el: ceRoot(anchorEl),
    isCE: true,
    shortcut: found.shortcut,
    expansion: found.expansion,
    replaceStart: -1,
    layer: 1
  };

  // Defer to next macrotask. Chrome blocks execCommand if it's called
  // recursively from within an input event triggered by another execCommand
  // (e.g. on sites that insert text programmatically). The setTimeout pushes
  // our call outside the recursive context.
  setTimeout(function () {
    ceExpanding = true;
    try {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(found.range);
      const ok = document.execCommand('insertText', false, found.expansion);
      pbLog('  ce execCommand returned', ok);
    } finally {
      ceExpanding = false;
    }
    scheduleVerify(ctx);
  }, 0);
}
