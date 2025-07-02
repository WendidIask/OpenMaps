import { addSidebarEntry } from './sidebar.js';

export default function loadShapes(map, group) {
    window.SHAPES.forEach(({ id, name, geojson, color, weight }) => {
        if (!geojson) return;

        const colorVal = color || '#3388ff';
        const weightVal = weight || 3;

        let layer;
        if (geojson?.properties?._isCircle && geojson.geometry?.type === 'Point') {
            const [lng, lat] = geojson.geometry.coordinates;
            layer = L.circle([lat, lng], {
                radius: geojson.properties.radius,
                color: colorVal,
                weight: weightVal,
                fillColor: colorVal,
                fillOpacity: 0.4,
            });
        } else {
            layer = L.geoJSON(geojson, {
                style: {
                    color: colorVal,
                    weight: weightVal,
                    fillColor: colorVal,
                    fillOpacity: 0.4,
                },
            }).getLayers()[0];
        }

        layer._shapeId = id;
        addSidebarEntry(map, layer, name || `id ${id}`, id);
        group.addLayer(layer);
    });
}
