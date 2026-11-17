/**
 * ALGSCR — UI module
 * Manages the country panel, error banner, and loading state.
 */

const UI = (() => {
  const panel      = document.getElementById('country-panel');
  const panelClose = document.getElementById('panel-close-btn');
  const panelName  = document.getElementById('panel-country-name');
  const panelAlbum = document.getElementById('panel-album-name');
  const panelArt   = document.getElementById('panel-album-art');
  const panelDot   = document.getElementById('panel-color-dot');
  const panelCount = document.getElementById('panel-track-count');
  const trackList  = document.getElementById('track-list');
  const loading    = document.getElementById('loading');
  const errorBanner= document.getElementById('error-banner');
  const errorMsg   = document.getElementById('error-message');

  // ---- Loading ----
  function showLoading(text = 'Loading your music world…') {
    loading.querySelector('.loading-text').textContent = text;
    loading.classList.remove('fade-out');
    loading.style.display = 'flex';
  }

  function hideLoading() {
    loading.classList.add('fade-out');
    setTimeout(() => { loading.style.display = 'none'; }, 600);
  }

  // ---- Error ----
  function showError(message) {
    errorMsg.textContent = message;
    errorBanner.classList.remove('hidden');
  }

  function hideError() {
    errorBanner.classList.add('hidden');
  }

  // ---- Country panel ----
  function showCountryPanel(countryName, countryData) {
    const { tracks = [], topAlbum = '', topAlbumCover = '', color = '#4fc3f7' } = countryData;

    panelName.textContent  = countryName;
    panelAlbum.textContent = topAlbum || 'Various albums';
    panelDot.style.background = color;
    panelDot.style.boxShadow = `0 0 12px ${color}`;
    panelCount.textContent = `${tracks.length} recent track${tracks.length !== 1 ? 's' : ''}`;

    if (topAlbumCover) {
      panelArt.src = topAlbumCover;
      panelArt.classList.remove('hidden');
    } else {
      panelArt.classList.add('hidden');
    }

    // Build track list (show at most 50)
    trackList.innerHTML = '';
    const display = tracks.slice(0, 50);
    for (const track of display) {
      const li = document.createElement('li');
      li.className = 'track-item';

      const name = document.createElement('span');
      name.className = 'track-name';
      name.textContent = track.name;

      const artist = document.createElement('span');
      artist.className = 'track-artist';
      artist.textContent = track.artist;

      li.appendChild(name);
      li.appendChild(artist);

      if (track.date) {
        const date = document.createElement('span');
        date.className = 'track-date';
        date.textContent = new Date(track.date).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        li.appendChild(date);
      }

      trackList.appendChild(li);
    }

    if (tracks.length > 50) {
      const more = document.createElement('li');
      more.className = 'track-item';
      more.style.textAlign = 'center';
      more.style.color = 'var(--text-muted)';
      more.textContent = `… and ${tracks.length - 50} more`;
      trackList.appendChild(more);
    }

    panel.classList.remove('hidden');
  }

  function hideCountryPanel() {
    panel.classList.add('hidden');
  }

  // Close button
  panelClose.addEventListener('click', hideCountryPanel);

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideCountryPanel();
  });

  return { showLoading, hideLoading, showError, hideError, showCountryPanel, hideCountryPanel };
})();
