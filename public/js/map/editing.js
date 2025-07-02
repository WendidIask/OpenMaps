let editingLayer = null;

export function enableEditing(layer) {
    disableEditing();
    editingLayer = layer;
    if (layer.editing && !layer.editing.enabled()) {
        layer.editing.enable();
        layer.on('edit', hookLayerAutosave);
    }
}

export function disableEditing() {
    if (editingLayer?.editing?.enabled()) {
        editingLayer.off('edit', hookLayerAutosave);
        editingLayer.editing.disable();
    }
    editingLayer = null;
}

export function hookLayerAutosave(e) {
    const layer = e.target;
    if (!layer._shapeId) return;

    const geo = layer.toGeoJSON();
    if (layer instanceof L.Circle) {
        geo.properties = { ...geo.properties, _isCircle: true, radius: layer.getRadius() };
    }

    fetch('/updateShape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: layer._shapeId, shape: geo }),
    }).catch(console.error);
}
