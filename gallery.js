const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const meta = document.getElementById('meta');
const clearBtn = document.getElementById('clear');

const viewer = document.getElementById('viewer');
const fullImg = document.getElementById('full');
const vTitle = document.getElementById('vTitle');
const vUrl = document.getElementById('vUrl');
const vInfo = document.getElementById('vInfo');
const noteEl = document.getElementById('note');
const savedEl = document.getElementById('saved');

let shots = [];          // metadata list, newest first
let current = -1;        // index into shots currently shown in viewer
let fullObjectUrl = null;
const thumbUrls = new Map();

const fmtDate = (ts) =>
  new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const fmtSize = (bytes) =>
  bytes > 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + ' MB'
    : Math.round(bytes / 1024) + ' KB';

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return url;
  }
}

function slug(s) {
  return (s || 'screenshot').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// Upgrade thumbnails saved by older versions, one at a time, then re-render.
let upgrading = false;
async function upgradeOldThumbnails() {
  if (upgrading) return;
  const stale = shots.filter((s) => SnapDB.needsThumbnailRefresh(s));
  if (!stale.length) return;
  upgrading = true;
  try {
    for (const s of stale) await SnapDB.refreshThumbnail(s.id);
  } finally {
    upgrading = false;
  }
  if (current < 0) render();
}

async function render() {
  shots = await SnapDB.list();
  upgradeOldThumbnails();

  // Release old thumbnail URLs.
  for (const u of thumbUrls.values()) URL.revokeObjectURL(u);
  thumbUrls.clear();

  grid.innerHTML = '';
  empty.hidden = shots.length > 0;
  clearBtn.hidden = shots.length === 0;
  meta.textContent = shots.length
    ? `${shots.length} screenshot${shots.length === 1 ? '' : 's'}`
    : '';

  shots.forEach((shot, i) => {
    const url = URL.createObjectURL(shot.thumb);
    thumbUrls.set(shot.id, url);

    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="thumb"><img loading="lazy" alt="" /></div>
      <div class="body">
        <div class="title"></div>
        <div class="url"></div>
        <div class="date"></div>
        <div class="note" hidden></div>
      </div>`;
    card.querySelector('img').src = url;
    card.querySelector('.title').textContent = shot.title || 'Untitled';
    card.querySelector('.url').textContent = hostOf(shot.url);
    card.querySelector('.date').textContent = fmtDate(shot.createdAt);
    if (shot.note) {
      const n = card.querySelector('.note');
      n.textContent = shot.note;
      n.hidden = false;
    }
    card.addEventListener('click', () => openViewer(i));
    grid.appendChild(card);
  });
}

async function openViewer(i) {
  if (i < 0 || i >= shots.length) return;
  current = i;
  const shot = await SnapDB.get(shots[i].id);
  if (!shot) return render();

  if (fullObjectUrl) URL.revokeObjectURL(fullObjectUrl);
  fullObjectUrl = URL.createObjectURL(shot.blob);
  fullImg.src = fullObjectUrl;

  vTitle.textContent = shot.title || 'Untitled';
  vUrl.textContent = shot.url;
  vUrl.href = shot.url;
  vInfo.textContent = [
    fmtDate(shot.createdAt),
    shot.width && shot.height ? `${shot.width} × ${shot.height}` : null,
    fmtSize(shot.size),
  ]
    .filter(Boolean)
    .join(' · ');
  noteEl.value = shot.note || '';
  savedEl.textContent = '';

  document.getElementById('prev').disabled = i === 0;
  document.getElementById('next').disabled = i === shots.length - 1;

  viewer.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeViewer() {
  viewer.classList.remove('open');
  document.body.style.overflow = '';
  if (fullObjectUrl) {
    URL.revokeObjectURL(fullObjectUrl);
    fullObjectUrl = null;
  }
  fullImg.removeAttribute('src');
  current = -1;
  render(); // pick up any note edits in the grid
}

// Debounced autosave for the note.
let noteTimer = null;
noteEl.addEventListener('input', () => {
  clearTimeout(noteTimer);
  savedEl.textContent = 'Saving…';
  noteTimer = setTimeout(async () => {
    if (current < 0) return;
    await SnapDB.update(shots[current].id, { note: noteEl.value });
    shots[current].note = noteEl.value;
    savedEl.textContent = 'Saved';
  }, 400);
});

document.getElementById('close').addEventListener('click', closeViewer);
document.getElementById('prev').addEventListener('click', () => openViewer(current - 1));
document.getElementById('next').addEventListener('click', () => openViewer(current + 1));
viewer.querySelector('.stage').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeViewer();
});

document.getElementById('download').addEventListener('click', async () => {
  if (current < 0) return;
  const shot = shots[current];
  const a = document.createElement('a');
  a.href = fullObjectUrl;
  a.download = `${slug(shot.title)}-${new Date(shot.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
  a.click();
});

document.getElementById('delete').addEventListener('click', async () => {
  if (current < 0) return;
  if (!confirm('Delete this screenshot?')) return;
  const idx = current;
  await SnapDB.remove(shots[idx].id);
  shots.splice(idx, 1);
  if (!shots.length) return closeViewer();
  openViewer(Math.min(idx, shots.length - 1));
});

clearBtn.addEventListener('click', async () => {
  if (!confirm(`Delete all ${shots.length} screenshots? This cannot be undone.`)) return;
  await SnapDB.clear();
  render();
});

document.addEventListener('keydown', (e) => {
  if (!viewer.classList.contains('open')) return;
  if (e.target === noteEl && e.key !== 'Escape') return;
  if (e.key === 'Escape') closeViewer();
  if (e.key === 'ArrowLeft') openViewer(current - 1);
  if (e.key === 'ArrowRight') openViewer(current + 1);
});

// Refresh when the background worker tells us something changed,
// or when the tab regains focus.
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'refresh' && current < 0) render();
  });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && current < 0) render();
});

render();
