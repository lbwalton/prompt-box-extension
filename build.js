const fs = require('fs-extra');
const path = require('path');

// Files to include in the Chrome extension package
const filesToInclude = [
  'Manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  'icon16.png',
  'icon48.png',
  'icon128.png'
];

async function build() {
  try {
    console.log('Building Chrome extension...');
    
    // Clean and create dist directory
    await fs.emptyDir('dist');
    
    // Copy only the necessary files
    for (const file of filesToInclude) {
      if (await fs.pathExists(file)) {
        await fs.copy(file, path.join('dist', file));
        console.log(`✓ Copied ${file}`);
      } else {
        console.log(`⚠ File not found: ${file}`);
      }
    }
    
    console.log('\n✅ Build complete! Files ready in dist/ folder');
    console.log('Run "npm run zip" to create the ZIP file for Chrome Web Store');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();