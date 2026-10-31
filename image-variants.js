/**
 * Shared helpers for the responsive copies of the recipe photos.
 *
 * Every photo in recipes/<name>/ gets three WebP copies next to it, named
 * "<photo>.w480.webp", "<photo>.w960.webp" and "<photo>.w1440.webp".
 * The home page relies on this naming convention to build its srcset.
 */
import sharp from 'sharp';

export const VARIANT_WIDTHS = [480, 960, 1440];

const SOURCE_IMAGE = /\.(webp|jpe?g|png|avif)$/i;
const VARIANT_IMAGE = /\.w\d+\.webp$/i;

export function isSourceImage(fileName) {
  return SOURCE_IMAGE.test(fileName) && !VARIANT_IMAGE.test(fileName);
}

export function variantName(fileName, width) {
  return fileName.replace(SOURCE_IMAGE, `.w${width}.webp`);
}

/** Pixel size of an image as displayed (EXIF rotation applied). */
export async function getImageSize(filePath) {
  const metadata = await sharp(filePath).metadata();
  if (metadata.autoOrient) {
    return {
      width: metadata.autoOrient.width,
      height: metadata.autoOrient.height,
    };
  }
  const rotated = (metadata.orientation ?? 1) >= 5;
  return rotated
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height };
}

/** srcset for an image URL, using the real width of each copy. */
export function variantSrcset(url, sourceWidth) {
  const seen = new Set();
  return VARIANT_WIDTHS.map((width) => {
    const actual = Math.min(width, sourceWidth);
    if (seen.has(actual)) return null;
    seen.add(actual);
    return `${variantName(url, width)} ${actual}w`;
  })
    .filter(Boolean)
    .join(', ');
}
