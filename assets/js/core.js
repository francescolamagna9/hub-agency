/* ============================================================
   CORE.JS — Agency Hub
   Navigazione shell, sidebar, utils condivisi
   ============================================================ */

// ── SIDEBAR (mobile) ──────────────────────────────────────
function sidebarToggle() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function sidebarClose() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ── MODAL ─────────────────────────────────────────────────
function modalOpen(id)  { document.getElementById(id).classList.add('open');    }
function modalClose(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ── TOAST ─────────────────────────────────────────────────
function toast(msg, type = 'ok', duration = 2800) {
  const colors = {
    ok:   { bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.30)',  icon: '✓' },
    err:  { bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.30)', icon: '✕' },
    info: { bg: 'rgba(124,106,255,0.15)', border: 'rgba(124,106,255,0.30)', icon: 'ℹ' },
  };
  const c = colors[type] || colors.ok;
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed; bottom:80px; right:20px; z-index:9999;
    background:${c.bg}; border:1px solid ${c.border};
    backdrop-filter:blur(16px);
    color:#f0efff; font-size:13px; font-weight:500;
    padding:12px 18px; border-radius:12px;
    display:flex; align-items:center; gap:9px;
    box-shadow:0 8px 32px rgba(0,0,0,0.35);
    animation:toastIn .25s ease both;
    max-width:320px; line-height:1.4;
  `;
  t.innerHTML = `<span style="font-size:15px">${c.icon}</span>${msg}`;
  if (!document.getElementById('toast-style')) {
    const s = document.createElement('style');
    s.id = 'toast-style';
    s.textContent = `@keyframes toastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
    @keyframes toastOut{from{opacity:1}to{opacity:0;transform:translateY(8px)}}`;
    document.head.appendChild(s);
  }
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut .25s ease forwards';
    setTimeout(() => t.remove(), 260);
  }, duration);
}

// ── COPY ──────────────────────────────────────────────────
function copyText(text, label = '') {
  navigator.clipboard.writeText(text).then(() => {
    toast(`${label ? label + ' ' : ''}copiato!`, 'ok');
  }).catch(() => toast('Copia fallita', 'err'));
}

// ── ESC HTML ──────────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── DOWNLOAD FILE ─────────────────────────────────────────
function downloadFile(filename, content, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
}

// ── DEBOUNCE ──────────────────────────────────────────────
function debounce(fn, delay = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ── LOCAL STORAGE HELPERS ─────────────────────────────────
const store = {
  get:    (k, def = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set:    (k, v)          => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  remove: (k)             => { try { localStorage.removeItem(k); } catch {} },
};

// ── NAV ACTIVE STATE (per link sidebar/bnav) ──────────────
function setNavActive(pageKey) {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === pageKey);
  });
}

// ── MARK HUB STAT ─────────────────────────────────────────
function hubStatIncrement(key) {
  const cur = store.get('hub_stats', {});
  cur[key] = (cur[key] || 0) + 1;
  store.set('hub_stats', cur);
}
function hubStatGet(key) {
  return store.get('hub_stats', {})[key] || 0;
}

// ── SYNC-AWARE SAVE ────────────────────────────────────────
// Salva nel localStorage E sincronizza su GitHub se configurato
// Uso: syncSave('hub_skills', skillsArray)
async function syncSave(key, data) {
  // 1. Salva sempre in locale prima
  store.set(key, data);
  // 2. Se GitHub è configurato, pusha in background
  if (typeof GitHubSync !== 'undefined' && GitHubSync.isConfigured()) {
    try {
      await GitHubSync.pushKey(key);
    } catch(e) {
      // Il salvataggio locale è già avvenuto — l'errore sync non blocca l'UX
      console.warn('Sync error (local save OK):', e.message);
    }
  }
}

// ── SYNC INDICATOR CSS (iniettato una volta) ───────────────
(function injectSyncStyles() {
  if (document.getElementById('sync-styles')) return;
  const s = document.createElement('style');
  s.id = 'sync-styles';
  s.textContent = `
    .sync-indicator {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 11px; font-weight: 500; padding: 4px 10px;
      border-radius: 20px; transition: all .3s ease;
    }
    .sync-indicator::before {
      content: ''; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
    }
    .sync-idle    { color: rgba(240,239,255,.35); }
    .sync-idle::before    { background: rgba(240,239,255,.25); }
    .sync-syncing { color: #fbbf24; }
    .sync-syncing::before { background: #fbbf24; animation: syncPulse 1s ease-in-out infinite; }
    .sync-ok      { color: #34d399; }
    .sync-ok::before      { background: #34d399; box-shadow: 0 0 5px #34d399; }
    .sync-err     { color: #f87171; }
    .sync-err::before     { background: #f87171; }
    @keyframes syncPulse { 0%,100% { opacity:.4; transform:scale(.8); } 50% { opacity:1; transform:scale(1); } }
  `;
  document.head.appendChild(s);
})();
