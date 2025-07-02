import { enableEditing } from './editing.js';
import { showStylePane } from './stylePane.js';

const sidebarHeader = document.getElementById('sidebarHeader');
const sidebarList = document.getElementById('lineList');

// Initialize sidebar expanded state
sidebarList.style.display = 'block';
sidebarHeader.textContent = 'Lines ▼';

// Toggle sidebar visibility on header click
sidebarHeader.addEventListener('click', () => {
    if (sidebarList.style.display === 'none') {
        sidebarList.style.display = 'block';
        sidebarHeader.textContent = 'Lines ▼';
    } else {
        sidebarList.style.display = 'none';
        sidebarHeader.textContent = 'Lines ►';
    }
});

export function clearActive() {
    sidebarList.querySelectorAll('.activeRow').forEach(li => li.classList.remove('activeRow'));
}

export function addSidebarEntry(map, layer, name, id) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = name;
    li.appendChild(span);

    // Rename button
    const btnRename = document.createElement('button');
    btnRename.textContent = '✎';
    btnRename.title = 'Rename';
    btnRename.style.cssText = 'margin-left:6px;border:none;background:none;cursor:pointer';
    li.appendChild(btnRename);

    // Delete button
    const btnDelete = document.createElement('button');
    btnDelete.textContent = '🗑';
    btnDelete.title = 'Delete';
    btnDelete.style.cssText = 'margin-left:6px;border:none;background:none;cursor:pointer;color:red';
    li.appendChild(btnDelete);

    if (id) li.dataset.shapeid = id;
    li.classList.add('sidebarRow');

    const activate = () => {
        clearActive();
        li.classList.add('activeRow');
        showStylePane(layer);
        enableEditing(layer);

        // Zoom logic:
        if (layer.getBounds) {
            map.fitBounds(layer.getBounds(), { maxZoom: 16, animate: true });
        } else if (layer.getLatLng) {
            map.setView(layer.getLatLng(), 16, { animate: true });
        }
    };

    li.activate = activate;

    li.onclick = e => {
        if (e.target !== btnRename && e.target !== btnDelete) activate();
    };

    layer.on('click', () => {
        clearActive();
        li.classList.add('activeRow');
        showStylePane(layer);
        enableEditing(layer);
    });

    btnRename.onclick = () => {
        const newName = prompt('New name', span.textContent);
        if (!newName) return;
        span.textContent = newName;
        fetch('/renameShape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: layer._shapeId, name: newName }),
        }).catch(console.error);
    };

    btnDelete.onclick = () => {
        if (!confirm(`Delete shape "${span.textContent}"? This action cannot be undone.`)) return;

        fetch('/deleteShape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: layer._shapeId }),
        })
            .then(res => {
                if (!res.ok) throw new Error('Delete failed');
                // Remove layer from map and sidebar
                if (map.hasLayer(layer)) map.removeLayer(layer);
                li.remove();
                clearActive();
            })
            .catch(err => {
                console.error(err);
                alert('Failed to delete shape.');
            });
    };

    sidebarList.appendChild(li);
    layer._sidebarEntry = li;
}

export function getSidebarCount() {
    return sidebarList.querySelectorAll('li.sidebarRow').length;
}
