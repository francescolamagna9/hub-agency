/* ============================================================
   GITHUB-SYNC.JS — Agency Hub v2.1
   Motore di sincronizzazione con GitHub API
   
   Funzionalità:
   - Lettura JSON da repo all'avvio
   - Scrittura JSON ad ogni salvataggio
   - Upload file fisici (skill, template)
   - Download file fisici
   - Gestione SHA per aggiornamenti (richiesto da GitHub API)
   ============================================================ */

const GitHubSync = (() => {

  // ── CONFIG ─────────────────────────────────────────────
  const API_BASE = 'https://api.github.com';

  function getConfig() {
    return store.get('hub_github', {});
  }

  function isConfigured() {
    const cfg = getConfig();
    return !!(cfg.token && cfg.repo);
  }

  function getHeaders() {
    const cfg = getConfig();
    return {
      'Authorization': `token ${cfg.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  function getBranch() {
    return getConfig().branch || 'main';
  }

  // ── STATUS UI ──────────────────────────────────────────
  function setSyncStatus(type, msg) {
    // type: 'syncing' | 'ok' | 'err' | 'idle'
    const indicators = document.querySelectorAll('.sync-indicator');
    indicators.forEach(el => {
      el.className = 'sync-indicator sync-' + type;
      el.title = msg || '';
    });
    // Update sidebar footer if exists
    const dot  = document.getElementById('sb-api-dot');
    const lbl  = document.getElementById('sb-api-label');
    const ghLbl = document.getElementById('sb-gh-status');
    if (ghLbl) ghLbl.textContent = msg || '';
    
    // Store last sync time on success
    if (type === 'ok') {
      store.set('hub_last_sync', new Date().toISOString());
    }
  }

  function getLastSync() {
    const t = store.get('hub_last_sync', null);
    if (!t) return 'Mai sincronizzato';
    const d = new Date(t);
    return d.toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit' }) + 
           ' · ' + d.toLocaleDateString('it', { day: '2-digit', month: '2-digit' });
  }

  // ── GET FILE (with SHA) ────────────────────────────────
  async function getFile(path) {
    const cfg = getConfig();
    const url = `${API_BASE}/repos/${cfg.repo}/contents/${path}?ref=${getBranch()}`;
    const res = await fetch(url, { headers: getHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub GET ${path}: ${res.status}`);
    return await res.json(); // { sha, content, encoding, ... }
  }

  // ── PUT FILE ───────────────────────────────────────────
  async function putFile(path, content, message, sha = null) {
    const cfg = getConfig();
    const url = `${API_BASE}/repos/${cfg.repo}/contents/${path}`;
    
    const body = {
      message: message || `Agency Hub: update ${path}`,
      content: btoa(unescape(encodeURIComponent(content))), // base64 encode with UTF-8 support
      branch:  getBranch(),
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub PUT ${path}: ${res.status}`);
    }
    return await res.json();
  }

  // ── WRITE JSON DATA ────────────────────────────────────
  async function writeData(key, data) {
    if (!isConfigured()) return;

    const path    = `data/${key}.json`;
    const content = JSON.stringify(data, null, 2);

    try {
      // Get current SHA if file exists (required for updates)
      const existing = await getFile(path);
      const sha = existing ? existing.sha : null;
      await putFile(path, content, `Hub: save ${key}`, sha);
    } catch (e) {
      console.error(`GitHubSync.writeData(${key}):`, e.message);
      throw e;
    }
  }

  // ── READ JSON DATA ─────────────────────────────────────
  async function readData(key) {
    if (!isConfigured()) return null;

    const path = `data/${key}.json`;
    try {
      const file = await getFile(path);
      if (!file) return null;
      // GitHub returns content as base64
      const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
      return JSON.parse(decoded);
    } catch (e) {
      console.error(`GitHubSync.readData(${key}):`, e.message);
      return null;
    }
  }

  // ── UPLOAD BINARY/TEXT FILE ────────────────────────────
  // For skill files: reads as base64 or text and uploads to /data/files/
  async function uploadFile(filename, content, isBase64 = false) {
    if (!isConfigured()) return null;

    // Check file size — GitHub API limit is 25MB per file
    const MAX_BYTES = 25 * 1024 * 1024; // 25MB
    const estimatedSize = isBase64
      ? Math.ceil((content.length - (content.indexOf(',') + 1)) * 0.75)
      : new Blob([content]).size;

    if (estimatedSize > MAX_BYTES) {
      throw new Error(`File troppo grande per GitHub (${(estimatedSize/1024/1024).toFixed(1)}MB — limite 25MB)`);
    }

    // Sanitize filename
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `data/files/${safeName}`;

    try {
      const existing = await getFile(path);
      const sha = existing ? existing.sha : null;

      const cfg = getConfig();
      const url = `${API_BASE}/repos/${cfg.repo}/contents/${path}`;

      // If already base64 (from FileReader.readAsDataURL), strip the data: prefix
      let b64content = isBase64 
        ? content.split(',')[1] || content
        : btoa(unescape(encodeURIComponent(content)));

      const body = {
        message: `Hub: upload file ${safeName}`,
        content: b64content,
        branch:  getBranch(),
      };
      if (sha) body.sha = sha;

      const res = await fetch(url, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Upload ${path}: ${res.status}`);
      }

      const result = await res.json();
      // Return the raw download URL
      return result.content.download_url;
    } catch (e) {
      console.error(`GitHubSync.uploadFile(${filename}):`, e.message);
      throw e;
    }
  }

  // ── GET FILE DOWNLOAD URL ──────────────────────────────
  function getFileUrl(filename) {
    const cfg = getConfig();
    if (!cfg.repo) return null;
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const branch = getBranch();
    // Raw GitHub URL for public repos
    return `https://raw.githubusercontent.com/${cfg.repo}/${branch}/data/files/${safeName}`;
  }

  // ── PULL ALL DATA (on startup) ─────────────────────────
  async function pullAll() {
    if (!isConfigured()) return false;

    // Check network
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatus('idle', 'Offline — usando dati locali');
      return false;
    }

    setSyncStatus('syncing', 'Sincronizzazione in corso…');

    const KEYS = ['hub_progetti','hub_interventi','hub_skills','hub_archivio','hub_roadmap','hub_stats','hub_activity'];

    let synced = 0;
    const errors = [];

    for (const key of KEYS) {
      try {
        const remoteData = await readData(key);
        if (remoteData !== null) {
          // Last-write-wins: remote overwrites local on pull
          store.set(key, remoteData);
          synced++;
        }
      } catch (e) {
        errors.push(key);
      }
    }

    if (errors.length === 0) {
      setSyncStatus('ok', `Sincronizzato · ${getLastSync()}`);
      return true;
    } else {
      setSyncStatus('err', `Errori su: ${errors.join(', ')}`);
      return false;
    }
  }

  // ── PUSH SINGLE KEY (on save) ──────────────────────────
  async function pushKey(key) {
    if (!isConfigured()) return false;

    // Check network connectivity
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatus('idle', 'Offline — dati salvati in locale');
      return false;
    }

    setSyncStatus('syncing', 'Salvataggio in corso…');

    try {
      const data = store.get(key, key.startsWith('hub_') ? [] : {});
      await writeData(key, data);
      setSyncStatus('ok', `Salvato · ${getLastSync()}`);
      return true;
    } catch (e) {
      setSyncStatus('err', 'Errore sync: ' + e.message);
      toast('Errore sincronizzazione GitHub: ' + e.message, 'err');
      return false;
    }
  }

  // ── PUSH ALL (manual full sync) ────────────────────────
  async function pushAll() {
    if (!isConfigured()) return false;

    setSyncStatus('syncing', 'Push completo…');
    toast('Sincronizzazione completa in corso…', 'info');

    const KEYS = ['hub_progetti','hub_interventi','hub_skills','hub_archivio','hub_roadmap','hub_stats','hub_activity'];
    const errors = [];

    for (const key of KEYS) {
      try {
        const data = store.get(key, []);
        if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
          await writeData(key, data);
        }
      } catch(e) {
        errors.push(key);
      }
    }

    if (errors.length === 0) {
      setSyncStatus('ok', `Sync completo · ${getLastSync()}`);
      toast('Sincronizzazione completata!', 'ok');
      return true;
    } else {
      setSyncStatus('err', `Errori: ${errors.join(', ')}`);
      toast('Sync parziale — errori su: ' + errors.join(', '), 'err');
      return false;
    }
  }

  // ── TEST CONNECTION ────────────────────────────────────
  async function testConnection() {
    const cfg = getConfig();
    if (!cfg.token || !cfg.repo) {
      throw new Error('Token e repository non configurati');
    }

    const res = await fetch(`${API_BASE}/repos/${cfg.repo}`, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Errore ${res.status}`);
    }

    const data = await res.json();
    return {
      name:    data.full_name,
      private: data.private,
      branch:  getBranch(),
    };
  }

  // ── INIT DATA FOLDER ──────────────────────────────────
  // Creates data/.gitkeep if data/ folder doesn't exist
  async function initDataFolder() {
    if (!isConfigured()) return;
    try {
      const existing = await getFile('data/.gitkeep');
      if (!existing) {
        await putFile('data/.gitkeep', '# Agency Hub data folder\n', 'Hub: init data folder');
      }
    } catch(e) {
      // Non critico
      console.warn('Could not init data folder:', e.message);
    }
  }

  // ── PUBLIC API ─────────────────────────────────────────
  return {
    isConfigured,
    pullAll,
    pushKey,
    pushAll,
    uploadFile,
    getFileUrl,
    testConnection,
    initDataFolder,
    getLastSync,
    setSyncStatus,
  };

})();
