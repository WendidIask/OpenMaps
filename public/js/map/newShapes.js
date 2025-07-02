import { addSidebarEntry, getSidebarCount } from './sidebar.js';

export default function setupNewShapeHandler(map, group) {
    map.on(L.Draw.Event.CREATED, async e => {
        const layer = e.layer;
        group.addLayer(layer);

        const geo = layer.toGeoJSON();
        if (layer instanceof L.Circle) {
            geo.properties = { _isCircle: true, radius: layer.getRadius() };
        }

        const baseName = layer instanceof L.Circle ? 'Circle' :
                         layer instanceof L.Polygon ? 'Polygon' :
                         layer instanceof L.Polyline ? 'Line' :
                         layer instanceof L.Marker ? 'Point' : 'Shape';

        const name = `${baseName} ${getSidebarCount() + 1}`;

        try {
            const res = await fetch('/createShape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shape: geo, name }),
            });
            if (!res.ok) throw new Error('Save failed');
            const { id } = await res.json();

            layer._shapeId = id;
            addSidebarEntry(map, layer, name, id);
            if (layer._sidebarEntry) layer._sidebarEntry.activate();
        } catch (err) {
            console.error(err);
            group.removeLayer(layer);
        }
    });
}
