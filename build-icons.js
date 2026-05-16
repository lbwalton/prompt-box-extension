const sharp = require('sharp');
const fs = require('fs');

const svg = fs.readFileSync('icon.svg');
const sizes = [16, 48, 128];

Promise.all(
  sizes.map(size =>
    sharp(svg).resize(size, size).png().toFile(`icon${size}.png`)
      .then(() => console.log(`✓ icon${size}.png`))
  )
).catch(err => { console.error(err); process.exit(1); });
