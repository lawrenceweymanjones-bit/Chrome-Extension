const captureBtn = document.getElementById('capture');
const galleryBtn = document.getElementById('gallery');
const status = document.getElementById('status');
const count = document.getElementById('count');

function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

function setStatus(text, kind = '') {
  status.textContent = text;
  status.className = kind;
}

async function refreshCount() {
  const res = await send({ type: 'count' });
  if (res && res.ok) {
    count.textContent = res.count ? `${res.count} saved` : '';
  }
}

captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true;
  setStatus('Capturing…');
  const res = await send({ type: 'capture' });
  if (res && res.ok) {
    setStatus('Saved to gallery', 'ok');
    refreshCount();
  } else {
    setStatus(res?.error || 'Capture failed', 'err');
  }
  captureBtn.disabled = false;
});

galleryBtn.addEventListener('click', async () => {
  await send({ type: 'open-gallery' });
  window.close();
});

refreshCount();
