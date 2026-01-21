# Security Guide for Prompt Box

This guide explains how to keep your Chrome extension secure. Written so anyone can understand it!

---

## What is Security Scanning?

Think of security scanning like a spell-checker, but instead of checking for spelling mistakes, it checks for **security mistakes** in your code.

Just like how spell-check underlines misspelled words, security scanning finds code that might let bad things happen - and tells you where to fix it.

---

## Commands You Can Use

Open your terminal (the black window where you type commands) and type these:

### `npm run security`

**What it does:** Checks your code for security problems.

**When to use it:** Before you upload new code to GitHub or the Chrome Store.

**What you'll see:**
- If everything is good: No output (silence is golden!)
- If there are problems: A list of issues with file names and line numbers

**Example:**
```
popup.js
  86:7  error  Unsafe assignment to innerHTML
```
This means: "Hey! Line 86 in popup.js might have a security issue."

---

### `npm run lint`

**What it does:** Checks your code for general mistakes (not just security).

**When to use it:** Anytime you want to make sure your code looks clean.

---

### `npm run lint:fix`

**What it does:** Automatically fixes simple mistakes it finds.

**When to use it:** When you're feeling lazy and want the computer to fix things for you!

---

## Understanding the Results

When you run `npm run security`, you might see words like:

### "error" (Red - Fix These!)
These are serious problems you should fix before sharing your code.

### "warning" (Yellow - Review These)
These might be problems, or they might be fine. Look at them and decide.

### "no-unsanitized/property"
This means: "You're putting text into the webpage in a way that might be unsafe."

**The fix:** Make sure any text from users goes through the `escapeHTML()` function first.

### "security/detect-object-injection"
This means: "You're accessing something in a list using a variable."

**Usually okay if:** You're using numbers to access items in an array (like `prompts[0]`).

---

## The Golden Rule

**Always escape user content!**

When someone types something into your extension (like a prompt title), never put it directly into your webpage. Always clean it first:

```javascript
// BAD (dangerous)
element.innerHTML = userTypedThis;

// GOOD (safe)
element.innerHTML = escapeHTML(userTypedThis);
```

It's like washing your hands before eating - you clean things before using them!

---

## Quick Checklist Before Uploading Code

1. [ ] Run `npm run security`
2. [ ] Fix any errors (red ones)
3. [ ] Review any warnings (yellow ones)
4. [ ] Test that the extension still works
5. [ ] Commit and push!

---

## If You Get Stuck

- **False positive:** Sometimes the scanner warns about something that's actually fine. You can ignore these.
- **Not sure if it's a problem:** Ask Claude! Paste the error message and ask what it means.
- **Too many errors:** Focus on the "error" ones first, then "warning" ones.

---

## First-Time Setup

If you just downloaded this project and don't have the security tools yet:

```bash
npm install
```

This downloads all the tools you need. Only do this once!

---

## Summary

| Command | What it does | When to use |
|---------|--------------|-------------|
| `npm install` | Downloads security tools | First time only |
| `npm run security` | Checks for security issues | Before uploading code |
| `npm run lint` | Checks for general issues | Anytime |
| `npm run lint:fix` | Auto-fixes simple issues | When you want quick fixes |

That's it! You're now a security pro! 🛡️
