'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

// Transparent variants have no white background box
const BASE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-i/red-blue/transparent/';
const OUT_DIR = path.join(__dirname, '..', 'media', 'sprites', 'front');

fs.mkdirSync(OUT_DIR, { recursive: true });

function download(id) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${id}.png`;
    const dest = path.join(OUT_DIR, `${id}.png`);

    if (fs.existsSync(dest)) {
      process.stdout.write(`  [skip] #${id}\n`);
      return resolve();
    }

    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode} for id ${id}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => {
      file.close();
      if (fs.existsSync(dest)) { fs.unlinkSync(dest); }
      reject(err);
    });
  });
}

async function main() {
  console.log('Downloading Gen 1 sprites from PokeAPI...\n');
  // Batch downloads 10 at a time to avoid rate limits
  for (let i = 1; i <= 151; i += 10) {
    const batch = [];
    for (let j = i; j < i + 10 && j <= 151; j++) {
      batch.push(download(j).then(() => process.stdout.write(`  [ok] #${j}\n`)));
    }
    await Promise.all(batch);
  }
  console.log('\nDone! 151 sprites saved to media/sprites/front/');
}

main().catch(err => { console.error(err); process.exit(1); });
