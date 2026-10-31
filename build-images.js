/**
 * Creates the responsive WebP copies of every recipe photo.
 * Reads recipes/<name>/*, writes public/recipes/<name>/<photo>.w<width>.webp.
 * Copies that are newer than their source are kept, so reruns are fast.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  VARIANT_WIDTHS,
  isSourceImage,
  variantName,
} from './image-variants.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(ROOT, 'recipes');
const OUTPUT_DIR = path.join(ROOT, 'public', 'recipes');

function isFresh(output, sourceTime) {
  return fs.existsSync(output) && fs.statSync(output).mtimeMs >= sourceTime;
}

async function buildImage(sourcePath, outputDir) {
  const fileName = path.basename(sourcePath);
  const sourceTime = fs.statSync(sourcePath).mtimeMs;
  const pending = VARIANT_WIDTHS.map((width) => ({
    width,
    output: path.join(outputDir, variantName(fileName, width)),
  })).filter(({ output }) => !isFresh(output, sourceTime));

  if (!pending.length) return 0;

  const pipeline = sharp(sourcePath).rotate();
  await Promise.all(
    pending.map(({ width, output }) =>
      pipeline
        .clone()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(output),
    ),
  );
  return pending.length;
}

const recipeDirs = fs
  .readdirSync(SOURCE_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

let created = 0;
let failed = 0;
for (const name of recipeDirs) {
  const sourceDir = path.join(SOURCE_DIR, name);
  const images = fs.readdirSync(sourceDir).filter(isSourceImage);
  if (!images.length) continue;

  // "photo.jpeg" and "photo.webp" would share the same copies: keep the WebP.
  const byVariant = new Map();
  for (const image of images) {
    const key = variantName(image, 0);
    if (!byVariant.has(key) || /\.webp$/i.test(image))
      byVariant.set(key, image);
  }

  const outputDir = path.join(OUTPUT_DIR, name);
  fs.mkdirSync(outputDir, { recursive: true });

  for (const image of byVariant.values()) {
    try {
      created += await buildImage(path.join(sourceDir, image), outputDir);
    } catch (error) {
      failed++;
      console.error(`Image ignorée ${name}/${image} : ${error.message}`);
    }
  }
}

console.log(`Images responsives : ${created} créées.`);
if (failed) process.exitCode = 1;
