/**
 * ALGSCR - Express server entry point
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const { getRecentTracks, getCountryTracks } = require('./lastfm');

const app = express();
const PORT = process.env.PORT || 3000;
const LASTFM_USER = process.env.LASTFM_USER || 'GIRAL4';

// In-memory image cache so repeated requests never hit Last.fm
const imageCache = new Map();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/image-proxy
 * Proxies and caches images from Last.fm so the browser never talks to Last.fm directly.
 */
app.get('/api/image-proxy', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('Missing url parameter');
  }

  if (imageCache.has(imageUrl)) {
    const cached = imageCache.get(imageUrl);
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(cached.buffer);
  }

  try {
    const upstream = await fetch(imageUrl, { timeout: 10000 });
    if (!upstream.ok) {
      return res.status(upstream.status).send('Failed to fetch image');
    }
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstream.buffer();

    imageCache.set(imageUrl, { contentType, buffer });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('[/api/image-proxy error]', err.message);
    res.status(502).send('Error loading image');
  }
});

/**
 * GET /api/recent-tracks
 * Returns the last 200 tracks for the configured user.
 */
app.get('/api/recent-tracks', async (req, res) => {
  try {
    const tracks = await getRecentTracks(LASTFM_USER);
    res.json({ ok: true, user: LASTFM_USER, tracks });
  } catch (err) {
    console.error('[/api/recent-tracks]', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/country-tracks
 * Returns tracks grouped by country with album color info.
 */
app.get('/api/country-tracks', async (req, res) => {
  try {
    const data = await getCountryTracks(LASTFM_USER);
    res.json({ ok: true, user: LASTFM_USER, countries: data });
  } catch (err) {
    console.error('[/api/country-tracks]', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// SPA fallback — serve index.html for any non-API route
// ---------------------------------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🌍 ALGSCR server running on http://localhost:${PORT}`);
  console.log(`   Last.fm user : ${LASTFM_USER}`);
  console.log(`   API key      : ${process.env.LASTFM_API_KEY ? '✓ loaded' : '✗ MISSING!'}\n`);
});
