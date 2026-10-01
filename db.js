// Shared IndexedDB helper. Loaded by the service worker (importScripts),
// the popup and the gallery page (<script>). Attaches `SnapDB` to the
// global scope so each context can use the same API.

(function (global) {
  const DB_NAME = 'snap-gallery';
  const DB_VERSION = 1;
  const STORE = 'shots';

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(STORE, mode);
          const store = t.objectStore(STORE);
          let result;
          try {
            result = fn(store);
          } catch (e) {
            reject(e);
            return;
          }
          t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        })
    );
  }

  function makeId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // Convert a data URL (from captureVisibleTab) into a Blob so the
  // database stores compact binary rather than a base64 string.
  async function dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return res.blob();
  }

  // Thumbnail width. Cards are up to ~500 CSS px wide, so 1200 keeps them
  // crisp on 2x displays; WebP keeps the stored size small.
  const THUMB_WIDTH = 1200;

  // Produce a thumbnail so the gallery grid loads fast. Uses high-quality
  // resampling so downscaled text stays legible.
  async function makeThumbnail(blob, maxWidth = THUMB_WIDTH) {
    try {
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, maxWidth / bitmap.width);
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      return await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
    } catch (e) {
      return blob; // fall back to the full image
    }
  }

  const SnapDB = {
    async add({ dataUrl, title, url }) {
      const blob = await dataUrlToBlob(dataUrl);
      const thumb = await makeThumbnail(blob);
      let width = 0;
      let height = 0;
      try {
        const bmp = await createImageBitmap(blob);
        width = bmp.width;
        height = bmp.height;
        bmp.close();
      } catch (e) {}
      const shot = {
        id: makeId(),
        createdAt: Date.now(),
        title: title || '',
        url: url || '',
        note: '',
        width,
        height,
        size: blob.size,
        blob,
        thumb,
        thumbWidth: THUMB_WIDTH,
      };
      await tx('readwrite', (s) => s.add(shot));
      return shot;
    },

    // Returns all shots, newest first, without the full-size blob.
    async list() {
      const all = await tx('readonly', (s) => s.getAll());
      return all
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ blob, ...rest }) => rest);
    },

    get(id) {
      return tx('readonly', (s) => s.get(id));
    },

    async update(id, patch) {
      const shot = await this.get(id);
      if (!shot) return null;
      const next = { ...shot, ...patch, id };
      await tx('readwrite', (s) => s.put(next));
      return next;
    },

    // Rebuild the thumbnail for a shot saved with an older, smaller size.
    async refreshThumbnail(id) {
      const shot = await this.get(id);
      if (!shot || !shot.blob) return null;
      const thumb = await makeThumbnail(shot.blob);
      return this.update(id, { thumb, thumbWidth: THUMB_WIDTH });
    },

    needsThumbnailRefresh(shot) {
      return !shot.thumbWidth || shot.thumbWidth < THUMB_WIDTH;
    },

    remove(id) {
      return tx('readwrite', (s) => s.delete(id));
    },

    clear() {
      return tx('readwrite', (s) => s.clear());
    },

    count() {
      return tx('readonly', (s) => s.count());
    },
  };

  global.SnapDB = SnapDB;
})(typeof self !== 'undefined' ? self : window);
