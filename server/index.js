/**
 * ALGSCR - Express server entry point
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { getRecentTracks, getCountryTracks } = require('./lastfm');

const app = express();
const PORT = process.env.PORT || 3000;
const LASTFM_USER = process.env.LASTFM_USER || 'GIRAL4';

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
