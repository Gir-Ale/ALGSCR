/**
 * ALGSCR — globe.js
 * High-performance 3D interactive music globe powered by Globe.gl & Three.js.
 *
 * Features:
 *  - 3D sphere with night earth texture & atmospheric glow
 *  - Country polygons with true 3D extrusion for listened countries
 *  - Mapped album cover image texture onto the surface of listened countries
 *  - Smooth orbital controls with auto-rotation and interactive pause
 *  - Centered camera transition on country click
 *  - Rich interactive tooltips and detail panel integration
 *  - Resilient offline fallback if Last.fm or API fails
 */

(async function () {
  'use strict';

  const container = document.getElementById('globe-container');
  if (!container) {
    console.error('Globe container element #globe-container not found.');
    return;
  }

  let world = null;
  let activeCountry = null;
  let hoveredCountry = null;
  let musicDataByCountry = {};
  let countriesFeatures = [];
  let autoRotateTimeout = null;

  // Texture loader & material cache for album covers
  const materialCache = new Map();
  let textureLoader = null;

  // ---------------------------------------------------------------------------
  // Helper: Create or retrieve textured material for a country's top album
  // ---------------------------------------------------------------------------
  function getCountryCapMaterial(feat) {
    if (!feat || !feat._musicData || !feat._musicData.topAlbumCover) {
      return null;
    }

    const THREE = window.THREE || {};
    if (!THREE.TextureLoader) {
      return null;
    }

    const coverUrl = feat._musicData.topAlbumCover;
    if (materialCache.has(coverUrl)) {
      return materialCache.get(coverUrl);
    }

    if (!textureLoader) {
      textureLoader = new THREE.TextureLoader();
    }

    // Load texture from our server proxy
    const texture = textureLoader.load(
      coverUrl,
      () => {
        // Once texture arrives, trigger a material update on the globe
        if (world) {
          world.polygonCapMaterial(world.polygonCapMaterial());
        }
      },
      undefined,
      (err) => {
        console.warn('Could not load album art texture for', feat._countryName, err);
      }
    );

    texture.wrapS = THREE.ClampToEdgeWrapping || 1001;
    texture.wrapT = THREE.ClampToEdgeWrapping || 1001;
    texture.minFilter = THREE.LinearFilter || 1006;
    texture.generateMipmaps = true;

    // Use MeshLambertMaterial or MeshBasicMaterial so the album cover image is rendered on the country surface
    const MaterialClass = THREE.MeshLambertMaterial || THREE.MeshBasicMaterial;
    const mat = new MaterialClass({
      map: texture,
      side: THREE.DoubleSide || 2,
    });

    materialCache.set(coverUrl, mat);
    return mat;
  }

  // ---------------------------------------------------------------------------
  // Helper: Convert hex color to darker side color for 3D extrusion walls
  // ---------------------------------------------------------------------------
  function getSideColor(hex) {
    if (!hex) return 'rgba(30, 80, 120, 0.7)';
    let clean = hex.replace('#', '');
    if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
    let r = Math.floor((parseInt(clean.substring(0, 2), 16) || 50) * 0.6);
    let g = Math.floor((parseInt(clean.substring(2, 4), 16) || 50) * 0.6);
    let b = Math.floor((parseInt(clean.substring(4, 6), 16) || 50) * 0.6);
    return `rgba(${r}, ${g}, ${b}, 0.88)`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------------------------------------------------------------------------
  // Helper: Compute geographic centroid of a GeoJSON Feature
  // ---------------------------------------------------------------------------
  function getFeatureCenter(feature) {
    let totalLat = 0, totalLng = 0, count = 0;
    function processCoords(coords) {
      if (typeof coords[0] === 'number') {
        totalLng += coords[0];
        totalLat += coords[1];
        count++;
      } else {
        coords.forEach(processCoords);
      }
    }
    if (feature.geometry && feature.geometry.coordinates) {
      processCoords(feature.geometry.coordinates);
    }
    return count > 0 ? { lat: totalLat / count, lng: totalLng / count } : { lat: 20, lng: 0 };
  }

  // ---------------------------------------------------------------------------
  // Helper: Robust Country Matcher
  // ---------------------------------------------------------------------------
  const ALIAS_MAP = {
    'usa': 'United States of America',
    'united states': 'United States of America',
    'us': 'United States of America',
    'uk': 'United Kingdom',
    'great britain': 'United Kingdom',
    'england': 'United Kingdom',
    'scotland': 'United Kingdom',
    'wales': 'United Kingdom',
    'korea': 'South Korea',
    'republic of korea': 'South Korea',
    'russia': 'Russia',
    'russian federation': 'Russia',
    'czechia': 'Czech Republic',
  };

  function matchCountryFeature(countryName, features) {
    const raw = (countryName || '').trim().toLowerCase();
    if (!raw) return null;

    const target = (ALIAS_MAP[raw] || countryName).trim().toLowerCase();

    // 1. Exact matches on official admin / name
    let found = features.find(f => {
      const p = f.properties || {};
      return (p.ADMIN && p.ADMIN.toLowerCase() === target) ||
             (p.NAME && p.NAME.toLowerCase() === target) ||
             (p.NAME_LONG && p.NAME_LONG.toLowerCase() === target) ||
             (p.FORMAL_EN && p.FORMAL_EN.toLowerCase() === target);
    });
    if (found) return found;

    // 2. Fallback substring match for compound or alternate names
    found = features.find(f => {
      const p = f.properties || {};
      const admin = (p.ADMIN || '').toLowerCase();
      const name = (p.NAME || '').toLowerCase();
      return (admin && (admin.includes(target) || target.includes(admin))) ||
             (name && (name.includes(target) || target.includes(name)));
    });

    return found || null;
  }

  // ---------------------------------------------------------------------------
  // Step 1: Initialize Globe
  // ---------------------------------------------------------------------------
  UI.showLoading('Initializing 3D World Globe…');

  world = Globe()(container)
    .globeImageUrl('/earth-night.jpg')
    .backgroundColor('#07090f')
    .showAtmosphere(true)
    .atmosphereColor('#4fc3f7')
    .atmosphereAltitude(0.18)
    .polygonAltitude(feat => {
      if (feat === activeCountry) return 0.085;
      if (feat === hoveredCountry && feat._musicData) return 0.075;
      if (feat._musicData) return 0.055; // Extruded 3D country
      if (feat === hoveredCountry) return 0.015;
      return 0.005; // Normal base level
    })
    .polygonCapMaterial(feat => {
      // Maps the album cover image onto the country cap
      return getCountryCapMaterial(feat);
    })
    .polygonCapColor(feat => {
      // Fallback color if capMaterial is null (or while texture is loading)
      if (feat._musicData) {
        return feat._musicData.color || '#4fc3f7';
      }
      return 'rgba(25, 42, 65, 0.72)';
    })
    .polygonSideColor(feat => {
      // 3D side walls use the dominant album color
      if (feat._musicData) {
        return getSideColor(feat._musicData.color || '#4fc3f7');
      }
      return 'rgba(15, 25, 40, 0.35)';
    })
    .polygonStrokeColor(feat => {
      if (feat === activeCountry) return '#ffffff';
      if (feat._musicData) return 'rgba(255, 255, 255, 0.9)';
      return 'rgba(70, 110, 150, 0.35)';
    })
    .polygonLabel(feat => {
      const name = feat.properties.ADMIN || feat.properties.NAME || 'Country';
      if (feat._musicData) {
        const count = feat._musicData.tracks ? feat._musicData.tracks.length : 0;
        const album = feat._musicData.topAlbum || 'Various Albums';
        const color = feat._musicData.color || '#4fc3f7';
        const thumb = feat._musicData.topAlbumCover;
        return `
          <div class="globe-tooltip">
            <div class="globe-tooltip-header">
              ${thumb ? `<img src="${thumb}" class="globe-tooltip-thumb" alt="Album" />` : ''}
              <div>
                <div class="globe-tooltip-title">${escapeHtml(name)}</div>
                <div class="globe-tooltip-sub">💿 ${escapeHtml(album)}</div>
              </div>
            </div>
            <div class="globe-tooltip-badge" style="background: ${color}">
              🎵 ${count} scrobbled track${count !== 1 ? 's' : ''}
            </div>
          </div>
        `;
      }
      return `
        <div class="globe-tooltip">
          <div class="globe-tooltip-title">${escapeHtml(name)}</div>
          <div class="globe-tooltip-muted">No recent scrobbles</div>
        </div>
      `;
    })
    .onPolygonHover(hoverFeat => {
      hoveredCountry = hoverFeat;
      container.style.cursor = hoverFeat ? 'pointer' : 'grab';
      world.polygonAltitude(world.polygonAltitude());
    })
    .onPolygonClick((feat, event) => {
      if (!feat) return;
      selectCountry(feat);
    })
    .onGlobeClick(() => {
      activeCountry = null;
      world.polygonAltitude(world.polygonAltitude());
      world.polygonStrokeColor(world.polygonStrokeColor());
      UI.hideCountryPanel();
    });

  // ---------------------------------------------------------------------------
  // Orbit Controls setup
  // ---------------------------------------------------------------------------
  const controls = world.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  function pauseAutoRotate() {
    controls.autoRotate = false;
    clearTimeout(autoRotateTimeout);
  }

  function scheduleResumeAutoRotate() {
    clearTimeout(autoRotateTimeout);
    autoRotateTimeout = setTimeout(() => {
      if (!activeCountry) {
        controls.autoRotate = true;
      }
    }, 4000);
  }

  container.addEventListener('pointerdown', pauseAutoRotate);
  container.addEventListener('pointerup', scheduleResumeAutoRotate);
  container.addEventListener('wheel', () => {
    pauseAutoRotate();
    scheduleResumeAutoRotate();
  }, { passive: true });

  // ---------------------------------------------------------------------------
  // Step 2: Fetch Local Country Boundaries (GeoJSON)
  // ---------------------------------------------------------------------------
  try {
    const geoRes = await fetch('/countries.geojson');
    if (!geoRes.ok) throw new Error('Failed to load local geographic data');
    const geoData = await geoRes.json();
    countriesFeatures = geoData.features || [];
  } catch (err) {
    console.error('Map boundary error:', err);
    UI.showError('Could not load map borders: ' + err.message);
    UI.hideLoading();
    return;
  }

  // Initial render of the world
  world.polygonsData(countriesFeatures);

  // ---------------------------------------------------------------------------
  // Step 3: Fetch Last.fm Listening History from Backend
  // ---------------------------------------------------------------------------
  UI.showLoading('Retrieving your music journey from Last.fm…');
  try {
    const musicRes = await fetch('/api/country-tracks');
    if (!musicRes.ok) throw new Error(`Server returned status ${musicRes.status}`);
    const json = await musicRes.json();

    if (!json.ok) {
      throw new Error(json.error || 'Server reported an error loading music data');
    }

    musicDataByCountry = json.countries || {};

    // Map music data to matching GeoJSON country features
    let matchedCount = 0;
    for (const [countryName, data] of Object.entries(musicDataByCountry)) {
      const feat = matchCountryFeature(countryName, countriesFeatures);
      if (feat) {
        feat._musicData = data;
        feat._countryName = countryName;
        // Pre-warm material cache for this country's album cover
        getCountryCapMaterial(feat);
        matchedCount++;
      } else {
        console.warn('Could not match listening country with map feature:', countryName);
      }
    }

    console.log(`Matched ${matchedCount} music countries on the 3D globe.`);

    // Refresh polygon styling with newly attached music data & materials
    world.polygonsData([...countriesFeatures]);

    UI.hideLoading();
  } catch (err) {
    console.error('Listening history error:', err);
    UI.showError('Notice: Last.fm data could not be refreshed (' + err.message + '). Browsing offline globe.');
    UI.hideLoading();
  }

  // ---------------------------------------------------------------------------
  // Interaction: Select Country
  // ---------------------------------------------------------------------------
  function selectCountry(feat) {
    activeCountry = feat;
    pauseAutoRotate();

    const countryName = feat._countryName || feat.properties.ADMIN || feat.properties.NAME || 'Country';
    const center = getFeatureCenter(feat);

    // Smooth camera glide to the clicked country
    world.pointOfView({
      lat: center.lat,
      lng: center.lng,
      altitude: 1.85,
    }, 1200);

    // Refresh visual highlights
    world.polygonAltitude(world.polygonAltitude());
    world.polygonStrokeColor(world.polygonStrokeColor());

    // Show side panel
    if (feat._musicData) {
      UI.showCountryPanel(countryName, feat._musicData);
    } else {
      UI.showCountryPanel(countryName, {
        tracks: [],
        topAlbum: 'No tracks recorded',
        color: '#4fc3f7',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Responsive resize
  // ---------------------------------------------------------------------------
  window.addEventListener('resize', () => {
    if (world) {
      world.width(window.innerWidth).height(window.innerHeight);
    }
  });

})();
