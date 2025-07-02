/* Quick list of styles you support */
const MAP_STYLES = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    img: 'https://tile.openstreetmap.org/0/0/0.png'
  },
  {
    id: 'carto-dark',
    name: 'Carto • Dark Matter',
    img: 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/0/0/0.png'
  },
  {
    id: 'carto-light',
    name: 'Carto • Positron',
    img: 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/0/0/0.png'
  },
  {
    id: 'esri-imagery',
    name: 'Esri • Imagery',
    img: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/0/0/0'
  },
  {
    id: 'esri-topo',
    name: 'Esri • Topographic',
    img: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/0/0/0'
  },
  {
    id: 'esri-streets',
    name: 'Esri • Streets',
    img: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/0/0/0'
  },
  {
    id: 'wikimedia',
    name: 'Wikimedia',
    img: 'https://maps.wikimedia.org/osm-intl/0/0/0.png'
  },
  {
    id: 'opentopomap',
    name: 'OpenTopoMap',
    img: 'https://a.tile.opentopomap.org/0/0/0.png'
  }
];

const grid       = document.getElementById('stylesGrid');
const toast      = document.getElementById('toast');
const logoutBtn  = document.getElementById('logoutBtn');

let currentStyle = 'osm';

/* ------- helpers ------- */
function showToast(msg='Saved!') {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 1800);
}

function renderCards() {
  grid.innerHTML = '';
  MAP_STYLES.forEach(s => {
    const card = document.createElement('div');
    card.className = 'map-card' + (s.id === currentStyle ? ' active' : '');
    card.dataset.id = s.id;

    card.innerHTML = `
      <div class="map-header">
        <span class="map-name">${s.name}</span>
        ${s.id === currentStyle ? '<i class="fas fa-check text-green-600"></i>' : ''}
      </div>
      <img src="${s.img}" alt="${s.name} preview" class="map-preview" />
    `;

    card.addEventListener('click', () => {
      currentStyle = s.id;
      renderCards();
      // save immediately
      saveStyle(s.id);
    });

    grid.appendChild(card);
  });
}

/* ------- fetch current setting on load ------- */
fetch('/user/style')
  .then(r => r.ok ? r.json() : null)
  .then(data => { if (data?.style) currentStyle = data.style; })
  .finally(renderCards);

/* ------- save style function ------- */
function saveStyle(styleId) {
  fetch('/user/style', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ style: styleId })
  })
  .then(r => {
    if (!r.ok) throw new Error('failed');
    showToast();
  })
  .catch(() => alert('Unable to save style - please try again.'));
}

/* ------- logout ------- */
logoutBtn.addEventListener('click', e => {
  e.preventDefault();
  fetch('/logout', { method: 'POST' }).then(() => (window.location.href = '/'));
});
