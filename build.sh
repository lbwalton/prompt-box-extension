#!/bin/bash

# Chrome Extension Build Script
# This script creates a clean build for Chrome Web Store submission

echo "Building Chrome extension..."

# Create build directory
rm -rf dist/
mkdir -p dist/

# Copy only necessary files for the extension
cp Manifest.json dist/
cp background.js dist/
cp popup.html dist/
cp popup.js dist/

# Copy icons if they exist
if [ -f "icon16.png" ]; then cp icon16.png dist/; fi
if [ -f "icon48.png" ]; then cp icon48.png dist/; fi
if [ -f "icon128.png" ]; then cp icon128.png dist/; fi

# Copy any CSS files if they exist
if [ -f "popup.css" ]; then cp popup.css dist/; fi
if [ -f "styles.css" ]; then cp styles.css dist/; fi

# Create ZIP file for Chrome Web Store
cd dist/
zip -r ../prompt-box-extension.zip .
cd ..

echo "Build complete! Extension package: prompt-box-extension.zip"
echo "Files included in package:"
unzip -l prompt-box-extension.zip