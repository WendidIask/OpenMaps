import patchPolyline from './patchPolyline.js';
import { enableEditing, disableEditing, hookLayerAutosave } from './editing.js';
import { addSidebarEntry, clearActive } from './sidebar.js';
import { showStylePane, hideStylePane, initStylePane } from './stylePane.js';
import loadShapes from './loadShapes.js';
import setupNewShapeHandler from './newShapes.js';

const MAP = window.MAP_CONFIG;

const TILE_LAYERS = {
  osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'carto-dark': 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
  'stamen-toner': 'https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',
  'stamen-watercolor': 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
  'esri-imagery': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
};

document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map', {
        maxBoundsViscosity: 1,
        minZoom: 2,
        worldCopyJump: true,
        doubleClickZoom: false
    }).setView([MAP.lat, MAP.lon], MAP.zoom);

    // Choose tile URL based on user style or fallback to osm
    console.log(window.USER_MAP_STYLE)
    const selectedStyle = window.USER_MAP_STYLE || 'osm';
    const tileUrlTemplate = TILE_LAYERS[selectedStyle] || TILE_LAYERS.osm;

    L.tileLayer(tileUrlTemplate, {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const drawnItems = new L.FeatureGroup().addTo(map);
    patchPolyline(drawnItems);

    new L.Control.Draw({
        edit: { featureGroup: drawnItems, edit: false, remove: false },
        draw: {
            polyline: { shapeOptions: { color: '#3388ff', weight: 4 } },
            polygon: false,
            rectangle: false,
            circle: true,
            marker: true,
            circlemarker: false
        }
    }).addTo(map);

    // Custom Back to Hub control
    const BackToHubControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: () => {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            const btn = L.DomUtil.create('a', '', container);
            Object.assign(btn.style, {
                fontSize: '18px',
                lineHeight: '26px',
                textAlign: 'center',
                textDecoration: 'none',
                color: '#3388ff',
                cursor: 'pointer',
                width: '26px',
                height: '26px',
                display: 'block',
            });
            btn.href = '/hub';
            btn.title = 'Back to Hub';
            btn.innerHTML = '&#x2b05;'; // Unicode left arrow
            L.DomEvent.disableClickPropagation(container);
            return container;
        }
    });
    map.addControl(new BackToHubControl());

    function applyStyleAndSave(layer, color, weight) {
        if (layer.setStyle) layer.setStyle({ color, weight, fillColor: color });
        if (layer._shapeId) {
            fetch('/updateStyle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: layer._shapeId, color, weight })
            }).catch(console.error);
        }
    }

    initStylePane(applyStyleAndSave);
    loadShapes(map, drawnItems);
    setupNewShapeHandler(map, drawnItems);

    map.on('click', e => {
        if (e.originalEvent.target === map.getContainer()) {
            hideStylePane();
        }
    });

    window.addEventListener('stylePaneClosed', () => {
        disableEditing();
        clearActive();
    });

    if (Array.isArray(window.BOUNDS) && window.BOUNDS.length) {
        map.fitBounds(window.BOUNDS, { padding: [20, 20] });
    } else {
        map.setView([MAP.lat, MAP.lon], MAP.zoom);
    }
});
