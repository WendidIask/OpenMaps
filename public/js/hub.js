document.addEventListener('DOMContentLoaded', () => {
    const MAP_STYLES = [
        {
            id: 'osm',
            name: 'OpenStreetMap',
            img: 'https://tile.openstreetmap.org/0/0/0.png',
            tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        },
        {
            id: 'carto-dark',
            name: 'Carto • Dark Matter',
            img: 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/0/0/0.png',
            tileUrl: 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'
        },
        {
            id: 'carto-light',
            name: 'Carto • Positron',
            img: 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/0/0/0.png',
            tileUrl: 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png'
        },
        {
            id: 'esri-imagery',
            name: 'Esri • Imagery',
            img: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/0/0/0',
            tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        },
        {
            id: 'esri-topo',
            name: 'Esri • Topographic',
            img: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/0/0/0',
            tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
        },
        {
            id: 'esri-streets',
            name: 'Esri • Streets',
            img: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/0/0/0',
            tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
        },
        {
            id: 'wikimedia',
            name: 'Wikimedia',
            img: 'https://maps.wikimedia.org/osm-intl/0/0/0.png',
            tileUrl: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png'
        },
        {
            id: 'opentopomap',
            name: 'OpenTopoMap',
            img: 'https://a.tile.opentopomap.org/0/0/0.png',
            tileUrl: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png'
        }
    ];


    function getTileUrl(styleId) {
        const style = MAP_STYLES.find(s => s.id === styleId);
        console.log(style)
        return style ? style.tileUrl : MAP_STYLES[0].tileUrl;
    }

    async function loadMap(mapId) {
        try {
            const res = await fetch('/loadMap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mapID: Number(mapId) }),
            });
            if (!res.ok) throw new Error('Failed to load map');
            await res.json();
            window.location.href = '/map';
        } catch (err) {
            alert(err.message || 'Error loading map');
            console.error(err);
        }
    }

    async function initPreview(div) {
        const mapId = div.dataset.mapid;

        try {
            // Fetch the user's style from your existing style endpoint
            const styleRes = await fetch('/user/style');
            if (!styleRes.ok) throw new Error(`Failed to fetch user style: status ${styleRes.status}`);
            const { style } = await styleRes.json();
            console.log(style)

            const styleId = style || 'osm';  // fallback to default style
            const tileUrl = getTileUrl(styleId);

            const previewMap = L.map(div, {
                zoomControl: false,
                attributionControl: false,
                dragging: false,
                doubleClickZoom: false,
                scrollWheelZoom: false,
                boxZoom: false,
                touchZoom: false,
                keyboard: false,
                inertia: false,
                zoomAnimation: false,
                fadeAnimation: false,
                markerZoomAnimation: false,
            });

            L.tileLayer(tileUrl, {
                maxZoom: 19,
                updateWhenIdle: true,
                updateWhenZooming: false,
            }).addTo(previewMap);

            // Now fetch shapes and add them to the map (same as before)
            const shapesRes = await fetch(`/api/map/${mapId}/shapes`);
            if (!shapesRes.ok) throw new Error(`status ${shapesRes.status}`);
            const shapes = await shapesRes.json();

            const layers = [];
            shapes.forEach(({ GEOJSON, COLOR, WIDTH }) => {
                const geojson = JSON.parse(GEOJSON);
                const layer = L.geoJSON(geojson, {
                    style: {
                        color: COLOR || '#3388ff',
                        weight: WIDTH || 3,
                        fillColor: COLOR || '#3388ff',
                        fillOpacity: 0.4,
                    },
                    interactive: false,
                    pointToLayer: (feature, latlng) => {
                        if (
                            feature.geometry.type === 'Point' &&
                            feature.properties &&
                            typeof feature.properties.radius === 'number'
                        ) {
                            return L.circle(latlng, {
                                radius: feature.properties.radius,
                                color: COLOR || '#3388ff',
                                fillColor: COLOR || '#3388ff',
                                fillOpacity: 0.4,
                                weight: WIDTH || 3,
                            });
                        }
                        return L.marker(latlng);
                    },
                });
                layer.addTo(previewMap);
                layers.push(layer);
            });

            if (layers.length) {
                const allLayers = [];
                layers.forEach(group => group.eachLayer(layer => allLayers.push(layer)));

                const nonCircleLayers = allLayers.filter(layer => !(layer instanceof L.Circle));

                if (nonCircleLayers.length) {
                    const group = L.featureGroup(nonCircleLayers);
                    previewMap.fitBounds(group.getBounds().pad(0.2), { maxZoom: 15, animate: false });
                } else {
                    previewMap.setView([-33.8688, 151.2093], 13, { animate: false });
                }
            } else {
                previewMap.setView([-33.8688, 151.2093], 13, { animate: false });
            }
        } catch (err) {
            console.error('Failed to initialize preview for map', mapId, err);
        }
    }


    document.querySelectorAll('.mapPreview').forEach(div => {
        initPreview(div);
        div.addEventListener('click', () => {
            const mapItem = div.closest('.mapItem');
            if (!mapItem) return;
            const mapId = mapItem.dataset.mapid;
            if (!mapId) return;
            loadMap(mapId);
        });
    });

    document.querySelectorAll('.mapName').forEach(h4 => {
        h4.addEventListener('click', () => {
            const mapItem = h4.closest('.mapItem');
            if (!mapItem) return;
            const mapId = mapItem.dataset.mapid;
            if (!mapId) return;
            loadMap(mapId);
        });
        h4.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const mapItem = h4.closest('.mapItem');
                if (!mapItem) return;
                const mapId = mapItem.dataset.mapid;
                if (!mapId) return;
                loadMap(mapId);
            }
        });
    });

    document.querySelectorAll('.deleteMapBtn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const mapItem = btn.closest('.mapItem');
            const mapId = mapItem.dataset.mapid;
            const mapName = mapItem.dataset.mapname;

            if (!confirm(`Are you sure you want to delete the map "${mapName}"? This action cannot be undone.`)) {
                return;
            }

            try {
                const res = await fetch('/deleteMap', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mapID: mapId }),
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert('Failed to delete map: ' + (err.error || res.statusText));
                    return;
                }
                mapItem.remove();
            } catch (err) {
                console.error(err);
                alert('Network error while deleting map.');
            }
        });
    });

    document.getElementById('createMapBtn').addEventListener('click', createMap);
});

async function createMap() {
    const mapName = prompt("Enter the new map's name:");
    if (!mapName) {
        alert("Map name is required.");
        return;
    }

    try {
        const res = await fetch('/createMap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: mapName })
        });
        
        if (!res.ok) {
            throw new Error('Failed to create map');
        }
        
        window.location.href = '/map';
    } catch (err) {
        alert(err.message || 'Error creating map');
        console.error(err);
    }
}
