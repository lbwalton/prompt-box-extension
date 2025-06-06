# Prompt Box - Chrome Extension

A simple Chrome extension to store, organize, and quickly access your AI prompts.

## Features

- 🗂️ **Organize Prompts** - Categorize your prompts (Writing, Coding, Research, etc.)
- 🔍 **Quick Search** - Find prompts instantly with built-in search
- 📋 **One-Click Copy** - Copy any prompt to clipboard
- 💾 **Right-Click Save** - Select text on any webpage and save it as a prompt
- 🔒 **Private Storage** - All data stored locally in Chrome (no cloud required)

## Installation

### From Chrome Web Store
*Coming soon!*

### Developer Installation
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the folder containing these files
6. The Prompt Box extension will appear in your toolbar

## How to Use

### Adding Prompts
- **Method 1**: Click the Prompt Box icon in your toolbar → click "+ Add"
- **Method 2**: Select any text on a webpage → right-click → "Save to Prompt Box"

### Using Prompts
1. Click the Prompt Box icon
2. Search for your prompt or browse by category
3. Click "Copy" to copy the prompt to your clipboard
4. Paste wherever you need it!

## Files Structure

- `manifest.json` - Extension configuration
- `popup.html` - Main interface
- `popup.js` - Interface logic
- `background.js` - Right-click menu handler
- `content.js` - Webpage integration
- `icon16.png`, `icon48.png`, `icon128.png` - Extension icons

## Development

### Making Changes
1. Edit the files in your local copy
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Prompt Box extension
4. Test your changes

### Submitting to Chrome Web Store
1. Zip all files together
2. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
3. Pay $5 developer fee (one-time)
4. Upload your extension
5. Wait for review (1-3 days)

## Contributing

Feel free to submit issues and feature requests!

## License

MIT License - feel free to use and modify!