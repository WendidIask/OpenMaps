import { disableEditing } from './editing.js';

let pane, colInp, wInp, wVal, applyCb, current = null;

export function initStylePane(applyCbRef) {
    applyCb = applyCbRef;

    pane = document.getElementById('stylePane');
    colInp = document.getElementById('styColor');
    wInp = document.getElementById('styW');
    wVal = document.getElementById('wVal');
    const btnX = document.getElementById('closeSty');

    colInp.oninput = () => applyCb(current, colInp.value, +wInp.value);
    wInp.oninput = () => {
        wVal.textContent = wInp.value;
        applyCb(current, colInp.value, +wInp.value);
    };
    btnX.onclick = () => {
        hideStylePane()
    };
}

export function showStylePane(layer) {
    current = layer;
    const o = layer.options || {};
    colInp.value = o.color || '#3388ff';
    wInp.value = o.weight || 3;
    wVal.textContent = wInp.value;
    pane.style.display = 'block';
}

export function hideStylePane() {
    pane.style.display = 'none';
    current = null;
    window.dispatchEvent(new Event('stylePaneClosed'));
}
