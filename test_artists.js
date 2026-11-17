require('./server/node_modules/dotenv').config({ path: './.env' });
const { getRecentTracks, getCountryTracks } = require('./server/lastfm');
const fetch = require('./server/node_modules/node-fetch');

async function testArtists() {
  const tracks = await getRecentTracks('GIRAL4');
  console.log('Total tracks fetched:', tracks.length);
  const artistCounts = {};
  tracks.forEach(t => {
    artistCounts[t.artist] = (artistCounts[t.artist] || 0) + 1;
  });

  const countryData = await getCountryTracks('GIRAL4');
  console.log('Countries currently identified:', Object.keys(countryData));

  // Find all tracks that have been mapped
  const mappedTrackNames = new Set();
  for (const c of Object.values(countryData)) {
    c.tracks.forEach(t => mappedTrackNames.add(t.name + ' - ' + t.artist));
  }

  console.log(`Mapped tracks: ${mappedTrackNames.size} / ${tracks.length}`);

  // Find artists that were NOT mapped to any country
  const unmappedArtists = {};
  tracks.forEach(t => {
    const key = t.name + ' - ' + t.artist;
    if (!mappedTrackNames.has(key)) {
      unmappedArtists[t.artist] = (unmappedArtists[t.artist] || 0) + 1;
    }
  });

  console.log('\nUnmapped artists:');
  for (const [artist, count] of Object.entries(unmappedArtists)) {
    console.log(` - ${artist} (${count} tracks)`);
  }
}

testArtists().catch(console.error);

