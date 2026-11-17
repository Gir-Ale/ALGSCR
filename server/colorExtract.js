/**
 * ALGSCR - Color extraction from album cover URLs using node-vibrant
 */

const Vibrant = require('node-vibrant');
const fetch = require('node-fetch');
const cache = require('./cache');

/**
 * Extract dominant color from an image URL.
 * Returns a hex string like "#RRGGBB", or a fallback color on failure.
 */
async function extractColor(imageUrl) {
  if (!imageUrl) return '#7ec8e3';

  const cacheKey = `color:${imageUrl}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    // Fetch the image as a Buffer
    const response = await fetch(imageUrl, { timeout: 8000 });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.buffer();

    const palette = await Vibrant.from(buffer).getPalette();

    // Pick the most vibrant available swatch
    const swatch =
      palette.Vibrant ||
      palette.LightVibrant ||
      palette.DarkVibrant ||
      palette.Muted ||
      palette.LightMuted ||
      palette.DarkMuted;

    const hex = swatch ? swatch.getHex() : '#7ec8e3';
    cache.set(cacheKey, hex, 3600); // cache color for 1 hour
    return hex;
  } catch (err) {
    console.warn(`[colorExtract] Failed for ${imageUrl}: ${err.message}`);
    const fallback = '#7ec8e3';
    cache.set(cacheKey, fallback, 300);
    return fallback;
  }
}

module.exports = { extractColor };
