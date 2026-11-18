/**
 * ALGSCR - Last.fm API integration + country mapping logic
 */

const fetch = require('node-fetch');
const cache = require('./cache');
const { extractColor } = require('./colorExtract');

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';
const CACHE_TTL = 300; // 5 minutes
const APP_BASE_PATH = (process.env.APP_BASE_PATH || '').replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// Comprehensive Country Keywords & Demonyms dictionary
// Used to recognize artist origins from Last.fm tags and bio descriptions.
// ---------------------------------------------------------------------------
const countryKeywords = {
  // United States & US States
  'United States of America': [
    'american', 'us american', 'usa', 'united states', 'u.s.', 'u.s.a.',
    'new york', 'california', 'los angeles', 'brooklyn', 'chicago', 'texas',
    'florida', 'miami', 'seattle', 'washington d.c.', 'atlanta', 'georgia',
    'ohio', 'new jersey', 'massachusetts', 'boston', 'philadelphia', 'pennsylvania',
    'tennessee', 'nashville', 'memphis', 'michigan', 'detroit', 'minnesota',
    'minneapolis', 'illinois', 'colorado', 'oregon', 'portland', 'baltimore',
    'maryland', 'north carolina', 'louisiana', 'new orleans', 'virginia',
    'arizona', 'wisconsin', 'connecticut', 'missouri', 'indiana', 'kentucky',
    'alabama', 'kansas', 'oklahoma', 'south carolina', 'iowa', 'utah', 'nevada',
    'las vegas', 'san francisco', 'oakland', 'austin', 'san diego'
  ],
  // United Kingdom & Nations
  'United Kingdom': [
    'british', 'english', 'uk', 'great britain', 'england', 'scotland', 'scottish',
    'wales', 'welsh', 'northern irish', 'london', 'manchester', 'bristol', 'birmingham',
    'liverpool', 'sheffield', 'glasgow', 'edinburgh', 'leeds', 'newcastle', 'brighton',
    'cornwall', 'oxford', 'cambridge', 'cardiff', 'swansea', 'nottingham'
  ],
  // Ireland
  'Ireland': [
    'irish', 'ireland', 'dublin', 'belfast', 'galway', 'cork', 'limerick', 'derry',
    'kerry', 'donegal', 'waterford'
  ],
  // Canada & Provinces
  'Canada': [
    'canadian', 'canada', 'toronto', 'montreal', 'vancouver', 'edmonton', 'calgary',
    'ottawa', 'quebec', 'alberta', 'ontario', 'winnipeg', 'halifax', 'british columbia',
    'manitoba', 'saskatchewan', 'nova scotia'
  ],
  // Australia
  'Australia': [
    'australian', 'australia', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide',
    'gold coast', 'canberra', 'queensland', 'victoria', 'new south wales', 'tasmania'
  ],
  // France
  'France': [
    'french', 'france', 'paris', 'lyon', 'marseille', 'toulouse', 'bordeaux', 'nantes',
    'strasbourg', 'lille', 'rennes', 'nice', 'montpellier'
  ],
  // Germany
  'Germany': [
    'german', 'germany', 'berlin', 'hamburg', 'munich', 'cologne', 'frankfurt',
    'leipzig', 'stuttgart', 'dusseldorf', 'dortmund'
  ],
  // Sweden
  'Sweden': [
    'swedish', 'sweden', 'stockholm', 'gothenburg', 'malmo', 'uppsala'
  ],
  // Norway
  'Norway': [
    'norwegian', 'norway', 'oslo', 'bergen', 'trondheim', 'stavanger'
  ],
  // Iceland
  'Iceland': [
    'icelandic', 'iceland', 'reykjavik'
  ],
  // Netherlands
  'Netherlands': [
    'dutch', 'netherlands', 'holland', 'amsterdam', 'rotterdam', 'utrecht', 'the hague',
    'eindhoven', 'groningen'
  ],
  // Italy
  'Italy': [
    'italian', 'italy', 'rome', 'milan', 'naples', 'turin', 'florence', 'bologna', 'venice'
  ],
  // Spain
  'Spain': [
    'spanish', 'spain', 'madrid', 'barcelona', 'valencia', 'seville', 'bilbao', 'malaga'
  ],
  // Japan
  'Japan': [
    'japanese', 'japan', 'tokyo', 'osaka', 'kyoto', 'yokohama', 'nagoya', 'sapporo'
  ],
  // South Korea
  'South Korea': [
    'korean', 'south korean', 'south korea', 'korea', 'seoul', 'busan', 'incheon'
  ],
  // Belgium
  'Belgium': [
    'belgian', 'belgium', 'brussels', 'antwerp', 'ghent', 'liege'
  ],
  // Switzerland
  'Switzerland': [
    'swiss', 'switzerland', 'zurich', 'geneva', 'basel', 'bern', 'lausanne'
  ],
  // New Zealand
  'New Zealand': [
    'new zealand', 'auckland', 'wellington', 'christchurch', 'kiwi'
  ],
  // Austria
  'Austria': [
    'austrian', 'austria', 'vienna', 'salzburg', 'graz', 'innsbruck'
  ],
  // Portugal
  'Portugal': [
    'portuguese', 'portugal', 'lisbon', 'porto', 'coimbra'
  ],
  // Denmark
  'Denmark': [
    'danish', 'denmark', 'copenhagen', 'aarhus', 'odense'
  ],
  // Finland
  'Finland': [
    'finnish', 'finland', 'helsinki', 'tampere', 'turku', 'oulu'
  ],
  // Poland
  'Poland': [
    'polish', 'poland', 'warsaw', 'krakow', 'wroclaw', 'gdansk', 'poznan'
  ],
  // Greece
  'Greece': [
    'greek', 'greece', 'athens', 'thessaloniki'
  ],
  // Czech Republic
  'Czech Republic': [
    'czech', 'czech republic', 'czechia', 'prague', 'brno'
  ],
  // Brazil
  'Brazil': [
    'brazilian', 'brazil', 'sao paulo', 'rio de janeiro', 'salvador', 'brasilia'
  ],
  // Mexico
  'Mexico': [
    'mexican', 'mexico', 'mexico city', 'guadalajara', 'monterrey'
  ],
  // Argentina
  'Argentina': [
    'argentinian', 'argentine', 'argentina', 'buenos aires', 'cordoba', 'rosario'
  ],
  // Chile
  'Chile': [
    'chilean', 'chile', 'santiago'
  ],
  // Colombia
  'Colombia': [
    'colombian', 'colombia', 'bogota', 'medellin', 'cali'
  ],
  // Jamaica
  'Jamaica': [
    'jamaican', 'jamaica', 'kingston'
  ],
  // Cuba
  'Cuba': [
    'cuban', 'cuba', 'havana'
  ],
  // Russia
  'Russia': [
    'russian', 'russia', 'moscow', 'saint petersburg'
  ],
  // Ukraine
  'Ukraine': [
    'ukrainian', 'ukraine', 'kyiv', 'kiev', 'lviv', 'odessa'
  ],
  // Iran
  'Iran': [
    'iranian', 'iran', 'tehran'
  ],
  // Israel
  'Israel': [
    'israeli', 'israel', 'tel aviv', 'jerusalem'
  ],
  // Turkey
  'Turkey': [
    'turkish', 'turkey', 'istanbul', 'ankara'
  ],
  // South Africa
  'South Africa': [
    'south african', 'south africa', 'johannesburg', 'cape town', 'durban'
  ],
  // Nigeria
  'Nigeria': [
    'nigerian', 'nigeria', 'lagos', 'abuja'
  ],
  // India
  'India': [
    'indian', 'india', 'mumbai', 'delhi', 'bangalore', 'kolkata'
  ],
  // China
  'China': [
    'chinese', 'china', 'beijing', 'shanghai', 'guangzhou', 'hong kong'
  ],
  // Taiwan
  'Taiwan': [
    'taiwanese', 'taiwan', 'taipei'
  ],
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
 * Scan arbitrary text (tags or bio) for national keywords using whole-word regex
 * and weighted scoring to find the country of origin.
 */
function findCountryInText(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.toLowerCase();
  const scores = {};

  for (const [country, keywords] of Object.entries(countryKeywords)) {
    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('(?:^|[^a-z0-9])' + escaped + '(?:$|[^a-z0-9])', 'i');

      if (regex.test(clean)) {
        // Earlier keywords in list (national demonyms, e.g. "american", "irish") carry highest weight
        const isNational = i < 3;
        scores[country] = (scores[country] || 0) + (isNational ? 6 : 2);
      }
    }
  }

  let bestCountry = null;
  let bestScore = 0;
  for (const [country, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCountry = country;
    }
  }

  return bestCountry;
}

/**
 * Infer country from an array of Last.fm tag objects { name, url }
 */
function inferCountryFromTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  const joinedTags = tags.map((t) => t.name || '').join(' ');
  return findCountryInText(joinedTags);
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
 * Get artist info with deep country recognition:
 * Checks tags, bio lead sentences, and full bio description.
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

    const tags = data.artist?.tags?.tag || [];
    const bio = data.artist?.bio?.summary || '';

    // Step 1: Infer from artist tags
    let country = inferCountryFromTags(tags);

    // Step 2: Infer from the first 2-3 sentences of bio (Wikipedia-style origin statement)
    if (!country && bio) {
      const leadSentences = bio.split('.').slice(0, 3).join('.');
      country = findCountryInText(leadSentences);
    }

    // Step 3: Infer from full bio
    if (!country && bio) {
      country = findCountryInText(bio);
    }

    const result = { tags, bio, country };
    cache.set(cacheKey, result, 86400); // cache artist info for 24 hours
    return result;
  } catch (err) {
    console.warn(`[lastfm] artist.getInfo failed for "${artistName}": ${err.message}`);
    const result = { tags: [], bio: '', country: null };
    cache.set(cacheKey, result, 300);
    return result;
  }
}

/**
 * Returns tracks grouped by country, with album color and proxy URLs.
 * Shape: { [countryName]: { tracks, topAlbum, topAlbumCover, color, trackCount } }
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

  // 5. Find top album per country + extract color + format proxy URLs
  const result = {};
  await Promise.all(
    Object.entries(byCountry).map(async ([country, data]) => {
      // Find most-played album in this country
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
      const proxyCover = topAlbumCover
        ? `${APP_BASE_PATH}/api/image-proxy?url=${encodeURIComponent(topAlbumCover)}`
        : '';

      result[country] = {
        tracks: data.tracks.map((t) => ({
          ...t,
          albumCover: t.albumCover
            ? `${APP_BASE_PATH}/api/image-proxy?url=${encodeURIComponent(t.albumCover)}`
            : '',
        })),
        topAlbum,
        topAlbumCover: proxyCover,
        topAlbumCoverOriginal: topAlbumCover,
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

module.exports = { getRecentTracks, getCountryTracks, getArtistInfo };
