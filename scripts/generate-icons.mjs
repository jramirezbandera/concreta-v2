// Regenerate PWA icons from public/favicon.svg
//
// Outputs (all into public/icons/):
//   icon-192.png            — Android standard adaptive icon (purpose: any)
//   icon-512.png            — high-res standard icon (purpose: any)
//   icon-maskable-512.png   — same mark scaled to 70% on dark background to
//                             survive Android adaptive-icon masking (40%
//                             radius safe zone). purpose: maskable.
//   apple-touch-icon-180.png — iOS home-screen icon (Safari does not read
//                             the manifest icons; needs <link rel="apple-touch-icon">).
//
// Run with `bun run icons` whenever the favicon.svg changes.

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SVG_PATH = resolve(ROOT, 'public/favicon.svg');
const OUT_DIR = resolve(ROOT, 'public/icons');
const BG = '#0f172a'; // matches manifest background_color

mkdirSync(OUT_DIR, { recursive: true });
const svg = readFileSync(SVG_PATH);

async function plain(size, name) {
  await sharp(svg, { density: 600 })
    .resize(size, size, { fit: 'contain', background: BG })
    .png({ compressionLevel: 9 })
    .toFile(resolve(OUT_DIR, name));
  console.log(`✓ ${name} (${size}×${size})`);
}

async function maskable(size, innerScale, name) {
  const inner = Math.round(size * innerScale);
  const pad = Math.round((size - inner) / 2);
  const innerPng = await sharp(svg, { density: 600 })
    .resize(inner, inner, { fit: 'contain', background: BG })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: innerPng, top: pad, left: pad }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(OUT_DIR, name));
  console.log(`✓ ${name} (${size}×${size}, maskable inner=${inner}px)`);
}

await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await maskable(512, 0.7, 'icon-maskable-512.png');
await plain(180, 'apple-touch-icon-180.png');
