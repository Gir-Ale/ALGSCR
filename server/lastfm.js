/**
 * ALGSCR - Last.fm API integration + country mapping logic
 */

const fetch = require('node-fetch');
const cache = require('./cache');
const { extractColor } = require('./colorExtract');

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';
const CACHE_TTL = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Demonym / nationality tag → ISO country name mapping
// (Covers common Last.fm artist tags)
// ---------------------------------------------------------------------------
const demonymToCountry = {
  // English-speaking
  american: 'United States of America',
  'us american': 'United States of America',
  usa: 'United States of America',
  british: 'United Kingdom',
  english: 'United Kingdom',
  welsh: 'United Kingdom',
  scottish: 'United Kingdom',
  irish: 'Ireland',
  canadian: 'Canada',
  australian: 'Australia',
  'new zealand': 'New Zealand',
  // European
  french: 'France',
  german: 'Germany',
  austrian: 'Austria',
  swiss: 'Switzerland',
  dutch: 'Netherlands',
  belgian: 'Belgium',
  luxembourgian: 'Luxembourg',
  swedish: 'Sweden',
  norwegian: 'Norway',
  danish: 'Denmark',
  finnish: 'Finland',
  icelandic: 'Iceland',
  spanish: 'Spain',
  portuguese: 'Portugal',
  italian: 'Italy',
  greek: 'Greece',
  polish: 'Poland',
  czech: 'Czech Republic',
  slovak: 'Slovakia',
  hungarian: 'Hungary',
  romanian: 'Romania',
  bulgarian: 'Bulgaria',
  serbian: 'Serbia',
  croatian: 'Croatia',
  slovenian: 'Slovenia',
  bosnian: 'Bosnia and Herzegovina',
  macedonian: 'North Macedonia',
  albanian: 'Albania',
  montenegrin: 'Montenegro',
  latvian: 'Latvia',
  lithuanian: 'Lithuania',
  estonian: 'Estonia',
  belarusian: 'Belarus',
  ukrainian: 'Ukraine',
  russian: 'Russia',
  // Americas
  mexican: 'Mexico',
  brazilian: 'Brazil',
  argentinian: 'Argentina',
  argentine: 'Argentina',
  chilean: 'Chile',
  colombian: 'Colombia',
  venezuelan: 'Venezuela',
  peruvian: 'Peru',
  ecuadorian: 'Ecuador',
  bolivian: 'Bolivia',
  uruguayan: 'Uruguay',
  paraguayan: 'Paraguay',
  cuban: 'Cuba',
  jamaican: 'Jamaica',
  // Asia & Pacific
  japanese: 'Japan',
  korean: 'South Korea',
  'south korean': 'South Korea',
  chinese: 'China',
  taiwanese: 'Taiwan',
  indian: 'India',
  pakistani: 'Pakistan',
  bangladeshi: 'Bangladesh',
  indonesian: 'Indonesia',
  malaysian: 'Malaysia',
  singaporean: 'Singapore',
  thai: 'Thailand',
  vietnamese: 'Vietnam',
  filipino: 'Philippines',
  // Middle East & Africa
  israeli: 'Israel',
  turkish: 'Turkey',
  iranian: 'Iran',
  lebanese: 'Lebanon',
  egyptian: 'Egypt',
  moroccan: 'Morocco',
  algerian: 'Algeria',
  tunisian: 'Tunisia',
  'south african': 'South Africa',
  nigerian: 'Nigeria',
  kenyan: 'Kenya',
  ghanaian: 'Ghana',
  senegalese: 'Senegal',
  // Explicit country name tags
  france: 'France',
  germany: 'Germany',
  sweden: 'Sweden',
  norway: 'Norway',
  iceland: 'Iceland',
  japan: 'Japan',
  brazil: 'Brazil',
  canada: 'Canada',
  australia: 'Australia',
  usa: 'United States of America',
  'united states': 'United States of America',
  'united kingdom': 'United Kingdom',
  uk: 'United Kingdom',
  spain: 'Spain',
  italy: 'Italy',
  russia: 'Russia',
  mexico: 'Mexico',
  india: 'India',
  china: 'China',
  argentina: 'Argentina',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiKey() {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error('LASTFM_API_KEY environment variable not set');
  return key;
}

async function lfmFetch(params) {
  const url = new URL(LASTFM_BASE);
  url.search = new URLSearchParams({
    ...params,
    api_key: apiKey(),
    format: 'json',
  }).toString();

  const res = await fetch(url.toString(), { timeout: 10000 });
  if (!res.ok) throw new Error(`Last.fm HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Last.fm error ${json.error}: ${json.message}`);
  return json;
}

/**
 * Infer country from an array of Last.fm tag objects { name, url }
 */
function inferCountryFromTags(tags) {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    const name = (tag.name || '').toLowerCase().trim();
    if (demonymToCountry[name]) return demonymToCountry[name];
    // Try partial match (e.g., "indie rock - american")
    for (const [demonym, country] of Object.entries(demonymToCountry)) {
      if (name.includes(demonym)) return country;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get recent tracks for a user (cached)
 */
async function getRecentTracks(user, limit = 200) {
  const cacheKey = `recentTracks:${user}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const data = await lfmFetch({
    method: 'user.getRecentTracks',
    user,
    limit,
    page: 1,
  });

  const tracks = (data.recenttracks?.track || [])
    .filter((t) => !t['@attr']?.nowplaying) // exclude currently playing
    .map((t) => ({
      name: t.name,
      artist: t.artist?.['#text'] || t.artist?.name || '',
      album: t.album?.['#text'] || '',
      albumCover: getLargestImage(t.image),
      date: t.date?.uts ? new Date(t.date.uts * 1000).toISOString() : null,
      url: t.url,
    }));

  cache.set(cacheKey, tracks, CACHE_TTL);
  return tracks;
}

/**
 * Get artist info (cached) — includes tags used for country detection
 */
async function getArtistInfo(artistName) {
  const cacheKey = `artistInfo:${artistName}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await lfmFetch({
      method: 'artist.getInfo',
      artist: artistName,
      autocorrect: 1,
    });
    const result = {
      tags: data.artist?.tags?.tag || [],
      country: null,
    };
    result.country = inferCountryFromTags(result.tags);
    cache.set(cacheKey, result, 3600); // cache artist info for 1 hour
    return result;
  } catch (err) {
    console.warn(`[lastfm] artist.getInfo failed for "${artistName}": ${err.message}`);
    const result = { tags: [], country: null };
    cache.set(cacheKey, result, 300);
    return result;
  }
}

/**
 * Returns tracks grouped by country, with album color.
 * Shape: { [countryName]: { tracks, topAlbum, topAlbumCover, color } }
 */
async function getCountryTracks(user) {
  const cacheKey = `countryTracks:${user}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 1. Fetch recent tracks
  const tracks = await getRecentTracks(user);

  // 2. Get unique artists
  const uniqueArtists = [...new Set(tracks.map((t) => t.artist).filter(Boolean))];

  // 3. Fetch artist info in batches (rate-limit friendly: 5 at a time)
  const artistCountryMap = {};
  const BATCH = 5;
  for (let i = 0; i < uniqueArtists.length; i += BATCH) {
    const batch = uniqueArtists.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (artist) => {
        const info = await getArtistInfo(artist);
        artistCountryMap[artist] = info.country;
      })
    );
  }

  // 4. Group tracks by country
  const byCountry = {};
  for (const track of tracks) {
    const country = artistCountryMap[track.artist] || null;
    if (!country) continue;
    if (!byCountry[country]) byCountry[country] = { tracks: [], albumCounts: {} };
    byCountry[country].tracks.push(track);
    const albumKey = `${track.album}|||${track.albumCover}`;
    byCountry[country].albumCounts[albumKey] =
      (byCountry[country].albumCounts[albumKey] || 0) + 1;
  }

  // 5. Find top album per country + extract color
  const result = {};
  await Promise.all(
    Object.entries(byCountry).map(async ([country, data]) => {
      // Find most-played album
      let topAlbumKey = null;
      let topCount = 0;
      for (const [albumKey, count] of Object.entries(data.albumCounts)) {
        if (count > topCount) {
          topCount = count;
          topAlbumKey = albumKey;
        }
      }
      const [topAlbum, topAlbumCover] = topAlbumKey ? topAlbumKey.split('|||') : ['', ''];
      const color = await extractColor(topAlbumCover || null);

      result[country] = {
        tracks: data.tracks,
        topAlbum,
        topAlbumCover,
        color,
        trackCount: data.tracks.length,
      };
    })
  );

  cache.set(cacheKey, result, CACHE_TTL);
  return result;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function getLargestImage(images) {
  if (!Array.isArray(images)) return '';
  const order = ['extralarge', 'large', 'medium', 'small'];
  for (const size of order) {
    const img = images.find((i) => i.size === size);
    if (img?.['#text']) return img['#text'];
  }
  return images[images.length - 1]?.['#text'] || '';
}

module.exports = { getRecentTracks, getCountryTracks };
