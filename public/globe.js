/**
 * ALGSCR — globe.js
 * Three.js interactive 3D globe with country highlighting.
 *
 * Approach:
 *  1. Load world topology (TopoJSON) from CDN
 *  2. Project GeoJSON country polygons onto a unit sphere
 *  3. Render base globe sphere (ocean) + country meshes on top
 *  4. Highlighted countries: different color + slight scale-out for extrusion
 *  5. Auto-rotate, mouse drag, raycasting for clicks
 */

(async function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------
  const GLOBE_RADIUS   = 1.0;
  const COUNTRY_OFFSET = 0.001;   // normal countries sit just above sphere
  const EXTRUDE_OFFSET = 0.025;   // highlighted countries extruded further
  const OCEAN_COLOR    = 0x0a1628;
  const COUNTRY_COLOR  = 0x1a2a3a;
  const ATMO_COLOR     = 0x1a4a7a;
  const ROTATE_SPEED   = 0.0012;

  // -------------------------------------------------------------------------
  // Scene setup
  // -------------------------------------------------------------------------
  const canvas   = document.getElementById('globe-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x07090f);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 2.8;

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(5, 3, 5);
  scene.add(dirLight);
  const rimLight = new THREE.DirectionalLight(0x4fc3f7, 0.3);
  rimLight.position.set(-5, -2, -3);
  scene.add(rimLight);

  // -------------------------------------------------------------------------
  // Globe sphere (ocean)
  // -------------------------------------------------------------------------
  const globeGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
  const globeMat = new THREE.MeshPhongMaterial({
    color: OCEAN_COLOR,
    shininess: 60,
    specular: new THREE.Color(0x1a3a5a),
  });
  const globe = new THREE.Mesh(globeGeo, globeMat);
  scene.add(globe);

  // Atmosphere glow (additive ring)
  const atmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.03, 64, 64);
  const atmoMat = new THREE.MeshPhongMaterial({
    color: ATMO_COLOR,
    transparent: true,
    opacity: 0.12,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(atmoGeo, atmoMat));

  // -------------------------------------------------------------------------
  // Globe group (rotation target)
  // -------------------------------------------------------------------------
  const globeGroup = new THREE.Group();
  globeGroup.add(globe);
  scene.add(globeGroup);

  // -------------------------------------------------------------------------
  // Convert lat/lon → 3D point on sphere
  // -------------------------------------------------------------------------
  function latLonToVec3(lat, lon, r) {
    const phi   = (90 - lat)  * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(theta),
    );
  }

  // -------------------------------------------------------------------------
  // Build a BufferGeometry for a GeoJSON polygon projected onto the sphere.
  //
  // Strategy:
  //   1. Flatten the polygon rings into 2D (lon, lat) space.
  //   2. Run earcut triangulation in 2D — handles non-convex shapes correctly.
  //   3. Map each resulting vertex back to a 3D point on the sphere.
  //
  // This replaces the broken centroid-fan approach which produced crossed
  // triangles (artifacts) for any non-convex country shape.
  // -------------------------------------------------------------------------
  function buildPolygonGeometry(rings, radius) {
    // rings[0] = outer ring, rings[1..] = holes (earcut supports holes)
    // earcut expects a flat Float64Array of [x,y, x,y, ...] plus a hole index array.

    const flatCoords = [];   // flat 2D [lon, lat, lon, lat ...]
    const holeIndices = [];  // vertex index where each hole starts

    for (let r = 0; r < rings.length; r++) {
      if (r > 0) holeIndices.push(flatCoords.length / 2);
      const ring = rings[r];
      // Skip closing duplicate vertex if present
      const len = ring.length;
      const last = len - 1;
      const isClosed = (ring[0][0] === ring[last][0] && ring[0][1] === ring[last][1]);
      const end = isClosed ? last : len;
      for (let i = 0; i < end; i++) {
        flatCoords.push(ring[i][0], ring[i][1]); // lon, lat
      }
    }

    if (flatCoords.length < 6) return null; // degenerate

    // Triangulate in 2D lon/lat space
    let indices;
    try {
      indices = earcut(flatCoords, holeIndices.length ? holeIndices : null, 2);
    } catch (_) {
      return null;
    }
    if (!indices || indices.length === 0) return null;

    // Build 3D positions from triangulated indices
    const positions = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++) {
      const vi = indices[i];
      const lon = flatCoords[vi * 2];
      const lat = flatCoords[vi * 2 + 1];
      const v = latLonToVec3(lat, lon, radius);
      positions[i * 3]     = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const countryMeshes = new Map();  // countryName → [mesh, ...]
  let   countryData   = {};         // from /api/country-tracks
  let   isAutoRotating = true;

  // -------------------------------------------------------------------------
  // Load world topology
  // -------------------------------------------------------------------------
  UI.showLoading('Loading globe data…');

  let topoData;
  try {
    const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
    if (!res.ok) throw new Error('Failed to fetch world topology');
    topoData = await res.json();
  } catch (err) {
    UI.showError('Could not load world map: ' + err.message);
    UI.hideLoading();
    return;
  }

  // Convert TopoJSON → GeoJSON features
  const countries = topojson.feature(topoData, topoData.objects.countries);

  // ISO numeric id → name lookup (embedded subset; full list via name property)
  const isoNumericToName = buildIsoLookup();

  // -------------------------------------------------------------------------
  // Build base country meshes
  // -------------------------------------------------------------------------
  function buildCountryMesh(feature, color, offset, opacity = 1.0) {
    const meshes = [];
    const geomType = feature.geometry.type;
    // Normalize to array-of-polygons; each polygon = [outerRing, ...holes]
    const polys = geomType === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates; // MultiPolygon

    for (const poly of polys) {
      if (!poly || !poly[0] || poly[0].length < 3) continue;
      try {
        // Pass all rings (outer + holes) to earcut-based builder
        const geo = buildPolygonGeometry(poly, GLOBE_RADIUS + offset);
        if (!geo) continue;
        const mat = new THREE.MeshPhongMaterial({
          color,
          shininess: 30,
          transparent: opacity < 1,
          opacity,
          side: THREE.FrontSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        globeGroup.add(mesh);
        meshes.push(mesh);
      } catch (_) { /* skip degenerate polygons */ }
    }
    return meshes;
  }

  // Render all countries in base style first
  for (const feature of countries.features) {
    const name = isoNumericToName[feature.id] || feature.properties?.name || String(feature.id);
    const meshes = buildCountryMesh(feature, COUNTRY_COLOR, COUNTRY_OFFSET);
    countryMeshes.set(name, { meshes, feature, name });
  }

  // -------------------------------------------------------------------------
  // Load music data from server
  // -------------------------------------------------------------------------
  UI.showLoading('Fetching your listening history…');
  try {
    const res = await fetch('/api/country-tracks');
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Unknown server error');
    countryData = json.countries;
  } catch (err) {
    UI.showError('Could not load music data: ' + err.message);
    UI.hideLoading();
    countryData = {};
  }

  // -------------------------------------------------------------------------
  // Apply highlight to listened countries
  // -------------------------------------------------------------------------
  for (const [name, data] of Object.entries(countryData)) {
    // Find matching country entry (fuzzy match)
    const entry = findCountryEntry(name);
    if (!entry) continue;

    // Remove old base meshes
    for (const m of entry.meshes) {
      globeGroup.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }

    // Build highlighted meshes
    const color = new THREE.Color(data.color || '#4fc3f7');
    const newMeshes = buildCountryMesh(entry.feature, color, EXTRUDE_OFFSET);
    entry.meshes = newMeshes;
    entry.highlighted = true;
    entry.musicData = data;

    // Add emissive glow
    for (const m of newMeshes) {
      m.material.emissive = new THREE.Color(data.color || '#4fc3f7');
      m.material.emissiveIntensity = 0.25;
    }
  }

  UI.hideLoading();

  // -------------------------------------------------------------------------
  // Country outline borders (optional — adds visual quality)
  // -------------------------------------------------------------------------
  try {
    const borders = topojson.mesh(topoData, topoData.objects.countries, (a, b) => a !== b);
    const borderPts = [];
    borders.coordinates.forEach(line => {
      for (let i = 0; i < line.length - 1; i++) {
        const a = latLonToVec3(line[i][1],   line[i][0],   GLOBE_RADIUS + 0.002);
        const b = latLonToVec3(line[i+1][1], line[i+1][0], GLOBE_RADIUS + 0.002);
        borderPts.push(a, b);
      }
    });
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x1e3a5a, transparent: true, opacity: 0.5 });
    const borderLines = new THREE.LineSegments(borderGeo, borderMat);
    globeGroup.add(borderLines);
  } catch (_) {}

  // -------------------------------------------------------------------------
  // Stars background
  // -------------------------------------------------------------------------
  const starCount = 2000;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount * 3; i++) {
    starPositions[i] = (Math.random() - 0.5) * 100;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.6 });
  scene.add(new THREE.Points(starGeo, starMat));

  // -------------------------------------------------------------------------
  // Interaction — drag to rotate
  // -------------------------------------------------------------------------
  let isDragging = false;
  let prevMouse  = { x: 0, y: 0 };
  let velocity   = { x: 0, y: 0 };
  let targetRotation = { x: globeGroup.rotation.x, y: globeGroup.rotation.y };

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mouseup',   onPointerUp);
  canvas.addEventListener('mouseleave',onPointerUp);
  canvas.addEventListener('touchstart', e => onPointerDown(e.touches[0]), { passive: true });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); onPointerMove(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchend',   onPointerUp);

  function onPointerDown(e) {
    isDragging = true;
    isAutoRotating = false;
    prevMouse = { x: e.clientX, y: e.clientY };
    velocity  = { x: 0, y: 0 };
  }
  function onPointerMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    velocity = { x: dx * 0.005, y: dy * 0.005 };
    globeGroup.rotation.y += velocity.x;
    globeGroup.rotation.x += velocity.y;
    // Clamp vertical
    globeGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, globeGroup.rotation.x));
    prevMouse = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() {
    isDragging = false;
    // Resume auto-rotation after a pause
    setTimeout(() => { isAutoRotating = true; }, 2000);
  }

  // -------------------------------------------------------------------------
  // Click / tap → raycasting → country detection
  // -------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const mouse2D   = new THREE.Vector2();

  // Collect all meshes that have country info for raycasting
  function getAllPickable() {
    const result = [];
    for (const [, entry] of countryMeshes) {
      for (const m of entry.meshes) {
        m.userData.countryEntry = entry;
        result.push(m);
      }
    }
    return result;
  }

  canvas.addEventListener('click', (e) => {
    // Don't fire if it was a drag
    if (Math.abs(velocity.x) > 0.01 || Math.abs(velocity.y) > 0.01) return;

    mouse2D.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse2D.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse2D, camera);
    const pickable = getAllPickable();
    const hits = raycaster.intersectObjects(pickable, false);

    if (hits.length > 0) {
      const entry = hits[0].object.userData.countryEntry;
      if (entry) {
        const data = countryData[entry.name] || { tracks: [], topAlbum: '', topAlbumCover: '', color: '#4fc3f7' };
        UI.showCountryPanel(entry.name, data);
      }
    } else {
      // Click on ocean — close panel
      UI.hideCountryPanel();
    }
  });

  // -------------------------------------------------------------------------
  // Zoom with scroll
  // -------------------------------------------------------------------------
  canvas.addEventListener('wheel', (e) => {
    camera.position.z = Math.max(1.5, Math.min(5, camera.position.z + e.deltaY * 0.002));
  }, { passive: true });

  // -------------------------------------------------------------------------
  // Resize handler
  // -------------------------------------------------------------------------
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // -------------------------------------------------------------------------
  // Animation loop
  // -------------------------------------------------------------------------
  function animate() {
    requestAnimationFrame(animate);

    if (isAutoRotating && !isDragging) {
      globeGroup.rotation.y += ROTATE_SPEED;
    }

    // Dampen velocity
    if (!isDragging) {
      velocity.x *= 0.92;
      velocity.y *= 0.92;
    }

    renderer.render(scene, camera);
  }
  animate();

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function findCountryEntry(name) {
    // Exact match
    if (countryMeshes.has(name)) return countryMeshes.get(name);
    // Case-insensitive
    const lower = name.toLowerCase();
    for (const [key, entry] of countryMeshes) {
      if (key.toLowerCase() === lower) return entry;
    }
    // Partial match
    for (const [key, entry] of countryMeshes) {
      if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) return entry;
    }
    return null;
  }

  /**
   * ISO 3166-1 numeric → country name lookup table.
   * This covers the countries in the world-atlas 110m dataset.
   */
  function buildIsoLookup() {
    return {
      4: 'Afghanistan', 8: 'Albania', 12: 'Algeria', 24: 'Angola',
      32: 'Argentina', 36: 'Australia', 40: 'Austria', 50: 'Bangladesh',
      56: 'Belgium', 64: 'Bhutan', 68: 'Bolivia', 76: 'Brazil',
      100: 'Bulgaria', 104: 'Myanmar', 116: 'Cambodia', 120: 'Cameroon',
      124: 'Canada', 144: 'Sri Lanka', 152: 'Chile', 156: 'China',
      170: 'Colombia', 180: 'DR Congo', 188: 'Costa Rica', 191: 'Croatia',
      192: 'Cuba', 196: 'Cyprus', 203: 'Czech Republic', 204: 'Benin',
      208: 'Denmark', 218: 'Ecuador', 818: 'Egypt', 222: 'El Salvador',
      231: 'Ethiopia', 246: 'Finland', 250: 'France', 266: 'Gabon',
      276: 'Germany', 288: 'Ghana', 300: 'Greece', 320: 'Guatemala',
      324: 'Guinea', 332: 'Haiti', 340: 'Honduras', 348: 'Hungary',
      356: 'India', 360: 'Indonesia', 364: 'Iran', 368: 'Iraq',
      372: 'Ireland', 376: 'Israel', 380: 'Italy', 388: 'Jamaica',
      392: 'Japan', 400: 'Jordan', 398: 'Kazakhstan', 404: 'Kenya',
      408: 'North Korea', 410: 'South Korea', 414: 'Kuwait', 418: 'Laos',
      422: 'Lebanon', 428: 'Latvia', 440: 'Lithuania', 442: 'Luxembourg',
      450: 'Madagascar', 454: 'Malawi', 458: 'Malaysia', 466: 'Mali',
      484: 'Mexico', 496: 'Mongolia', 504: 'Morocco', 508: 'Mozambique',
      516: 'Namibia', 524: 'Nepal', 528: 'Netherlands', 554: 'New Zealand',
      558: 'Nicaragua', 562: 'Niger', 566: 'Nigeria', 578: 'Norway',
      586: 'Pakistan', 591: 'Panama', 600: 'Paraguay', 604: 'Peru',
      608: 'Philippines', 616: 'Poland', 620: 'Portugal', 630: 'Puerto Rico',
      642: 'Romania', 643: 'Russia', 646: 'Rwanda', 682: 'Saudi Arabia',
      686: 'Senegal', 694: 'Sierra Leone', 703: 'Slovakia', 706: 'Somalia',
      710: 'South Africa', 716: 'Zimbabwe', 724: 'Spain', 729: 'Sudan',
      752: 'Sweden', 756: 'Switzerland', 760: 'Syria', 762: 'Tajikistan',
      764: 'Thailand', 768: 'Togo', 788: 'Tunisia', 792: 'Turkey',
      800: 'Uganda', 804: 'Ukraine', 784: 'United Arab Emirates',
      826: 'United Kingdom', 840: 'United States of America',
      858: 'Uruguay', 860: 'Uzbekistan', 862: 'Venezuela', 704: 'Vietnam',
      887: 'Yemen', 894: 'Zambia',
    };
  }

})();
