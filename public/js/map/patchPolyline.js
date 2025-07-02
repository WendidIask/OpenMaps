export default function patchPolyline(featureGroup) {
    const P = L.Draw.Polyline.prototype;

    const origCreateMarker = P._createMarker;
    const origFinishShape = P._finishShape;
    const origFireCreatedEvent = P._fireCreatedEvent;

    P._convertedToPolygon = false;

    P._createMarker = function(latlng) {
        const marker = origCreateMarker.call(this, latlng);
        marker.on('click', () => {
            if (this._markers.length >= 3 && marker === this._markers[0]) {
                this._convertedToPolygon = true;
                closeAndConvert.call(this);
            }
        });
        return marker;
    };

    P._fireCreatedEvent = function(layer) {
        if (this._convertedToPolygon) {
            this._convertedToPolygon = false;
            return;
        }
        origFireCreatedEvent.call(this, layer);
    };

    function closeAndConvert() {
        if (!this._poly) return;

        const latlngs = this._poly.getLatLngs();
        if (latlngs.length < 3) {
            this._convertedToPolygon = false;
            return origFinishShape.call(this);
        }

        latlngs.push(latlngs[0]);

        const polygon = L.polygon(latlngs, {
            color: '#3388ff',
            weight: 3,
            fillColor: '#3388ff',
            fillOpacity: 0.4,
        });

        if (this._map.hasLayer(this._poly)) this._map.removeLayer(this._poly);
        featureGroup.removeLayer(this._poly);

        this._map.addLayer(polygon);
        featureGroup.addLayer(polygon);

        setTimeout(() => {
            this._map.fire(L.Draw.Event.CREATED, {
                layer: polygon,
                layerType: 'polygon',
            });
        }, 0);

        origFinishShape.call(this);
    }
}
