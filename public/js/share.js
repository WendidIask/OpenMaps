(function () {
  const editorsList        = document.getElementById('editorsList');
  const shareUsernameInput = document.getElementById('shareUsername');
  const btnShare           = document.getElementById('btnShare');
  const shareMessage       = document.getElementById('shareMessage');

  /* helper -------------------------------------------------------- */
  const showMessage = (msg, isError = true) => {
    shareMessage.style.color = isError ? 'red' : 'green';
    shareMessage.textContent = msg;
    if (msg) setTimeout(() => (shareMessage.textContent = ''), 4_000);
  };

  /* load current editors ----------------------------------------- */
  async function loadEditors() {
    editorsList.innerHTML = '<li>Loading editors…</li>';
    try {
      const res = await fetch('/editors');
      if (res.status === 403) {
        document.getElementById('sharePanel').style.display = 'none';
        return;
      }
      if (!res.ok) throw new Error('failed');

      /** ── normalise whatever the server returns ─────────────── */
      const raw = await res.json();
      const editors = Array.isArray(raw.editors) ? raw.editors : Array.isArray(raw) ? raw : [];

      if (!editors.length) {
        editorsList.innerHTML = '<li><i>No editors added</i></li>';
        return;
      }

      /* ── build list ─────────────────────────────────────────── */
      editorsList.innerHTML = '';
      editors.forEach(username => {
        const li = document.createElement('li');
        li.classList.add('sidebarRow');                 // ← same class as shape sidebar

        /* username */
        const span = document.createElement('span');
        span.textContent = username;
        li.appendChild(span);

        /* ×-button styled exactly like the sidebar buttons */
        const btn = document.createElement('button');
        btn.textContent = '×';
        btn.title = `Remove ${username}`;
        btn.dataset.username = username;
        btn.style.cssText = 'margin-left:6px;border:none;background:none;cursor:pointer;color:red';
        btn.addEventListener('click', removeEditor);
        li.appendChild(btn);

        editorsList.appendChild(li);
      });
    } catch (err) {
      console.error(err);
      editorsList.innerHTML = '<li>Error loading editors.</li>';
    }
  }

  /* add ----------------------------------------------------------- */
  async function addEditor() {
    const username = shareUsernameInput.value.trim();
    if (!username) return showMessage('Please enter a username.');

    btnShare.disabled = true;
    try {
      const res = await fetch('/share', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ editorUsername: username })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) showMessage(data.error || 'Failed to add editor.');
      else {
        showMessage(`Added “${username}”.`, false);
        shareUsernameInput.value = '';
        loadEditors();
      }
    } catch (e) {
      console.error(e);
      showMessage('Network error.');
    } finally {
      btnShare.disabled = false;
    }
  }

  /* remove -------------------------------------------------------- */
  async function removeEditor(e) {
    const username = e.currentTarget.dataset.username;   // <‑‑ read it back
    if (!username || !confirm(`Remove editor “${username}”?`)) return;

    try {
      const res  = await fetch('/unshare', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ editorUsername: username })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) showMessage(data.error || 'Failed to remove editor.');
      else {
        showMessage('Editor removed.', false);
        loadEditors();
      }
    } catch (err) {
      console.error(err);
      showMessage('Network error.');
    }
  }

  /* wire‑up ------------------------------------------------------- */
  btnShare.addEventListener('click', addEditor);
  shareUsernameInput.addEventListener('keydown', e => e.key === 'Enter' && addEditor());
  loadEditors();           // initial
})();
