// Renders all marketing SVGs to their final PNG dimensions for the
// Chrome Web Store listing. Output goes to marketing/png/.
//
// Assets produced:
//   screenshot-1..5.png  — 1280×800 (store listing screenshots, max 5)
//   promo-tile.png       — 440×280  (small promo tile)
//   marquee-tile.png     — 1400×560 (marquee promo tile)
//
// Run: npm run marketing

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'marketing');
const OUT = path.join(SRC, 'png');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const jobs = [
  { svg: 'screenshot-1.svg', png: 'screenshot-1.png', w: 1280, h: 800 },
  { svg: 'screenshot-2.svg', png: 'screenshot-2.png', w: 1280, h: 800 },
  { svg: 'screenshot-3.svg', png: 'screenshot-3.png', w: 1280, h: 800 },
  { svg: 'screenshot-4.svg', png: 'screenshot-4.png', w: 1280, h: 800 },
  { svg: 'screenshot-5.svg', png: 'screenshot-5.png', w: 1280, h: 800 },
  { svg: 'promo-tile.svg',   png: 'promo-tile.png',   w: 440,  h: 280 },
  { svg: 'marquee-tile.svg', png: 'marquee-tile.png', w: 1400, h: 560 },
];

Promise.all(
  jobs.map(j => {
    const svg = fs.readFileSync(path.join(SRC, j.svg));
    return sharp(svg)
      .resize(j.w, j.h)
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, j.png))
      .then(() => console.log(`✓ ${j.png}  (${j.w}×${j.h})`));
  })
).then(() => {
  console.log(`\nAll marketing assets rendered to: ${OUT}`);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
