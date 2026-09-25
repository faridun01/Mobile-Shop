// One-off generator for native app icon + splash source images (resources/*.png),
// consumed by `npx capacitor-assets generate`. Run again only if the brand mark changes.
//
// sharp and @capacitor/assets are intentionally NOT project dependencies (their
// transitive deps carry unfixed high/critical advisories — see npm audit). Install
// them on demand, generate, then remove:
//   npm install --no-save sharp @capacitor/assets
//   node scripts/generate-native-assets.mjs
//   npx capacitor-assets generate
//   npm uninstall sharp @capacitor/assets
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const outDir = path.join(root, 'resources');
mkdirSync(outDir, { recursive: true });

const fullSvg = readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');

// Full mark (background card + glyph) at 1024x1024 for the app icon — every
// launcher (Android legacy/adaptive, iOS, PWA) gets the same square artwork.
await sharp(Buffer.from(fullSvg), { density: 1024 * 96 / 512 })
  .resize(1024, 1024)
  .png()
  .toFile(path.join(outDir, 'icon.png'));

// Splash: the background card's rounded corners/border would look wrong stretched
// full-bleed, so drop the two background <rect> elements and keep only the glyph,
// then composite it centered on a flat canvas using the app's actual --color-bg.
// The glow filter's percentage-based region clips visibly against a transparent
// canvas at this size, leaving a faint seam, so it's dropped for the splash too.
const glyphOnly = fullSvg
  .replace(/<rect width="512" height="512"[^/]*\/>\s*<rect width="496"[^/]*\/>/, '')
  .replace(/\s*filter="url\(#glow\)"/, '');
const glyphSize = 1100;
const glyphPng = await sharp(Buffer.from(glyphOnly), { density: glyphSize * 96 / 512 })
  .resize(glyphSize, glyphSize)
  .png()
  .toBuffer();

const canvasSize = 2732;
const bg = { r: 0x0b, g: 0x0e, b: 0x14, alpha: 1 }; // --color-bg: #0B0E14
await sharp({ create: { width: canvasSize, height: canvasSize, channels: 4, background: bg } })
  .composite([{ input: glyphPng, gravity: 'center' }])
  .png()
  .toFile(path.join(outDir, 'splash.png'));

writeFileSync(path.join(outDir, 'splash-dark.png'), readFileSync(path.join(outDir, 'splash.png')));

console.log('Generated resources/icon.png, resources/splash.png, resources/splash-dark.png');
