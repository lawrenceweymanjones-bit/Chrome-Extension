importScripts('db.js');

const GALLERY_URL = chrome.runtime.getURL('gallery.html');

async function captureActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab');

  // Chrome refuses to capture its own internal pages.
  const url = tab.url || '';
  if (/^(chrome|chrome-extension|edge|about|devtools):/i.test(url)) {
    throw new Error("Chrome doesn't allow capturing this page");
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const shot = await SnapDB.add({ dataUrl, title: tab.title, url });

  // Brief badge flash so the user knows it worked.
  await chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
  await chrome.action.setBadgeText({ text: '✓' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1500);

  return { id: shot.id, title: shot.title, createdAt: shot.createdAt };
}

async function openGallery() {
  const tabs = await chrome.tabs.query({ url: GALLERY_URL });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    // Let the gallery know it should refresh.
    chrome.tabs.sendMessage(tabs[0].id, { type: 'refresh' }).catch(() => {});
  } else {
    await chrome.tabs.create({ url: GALLERY_URL });
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === 'capture') await captureActiveTab();
    if (command === 'open-gallery') await openGallery();
  } catch (e) {
    console.error(e);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'capture') {
        const shot = await captureActiveTab();
        sendResponse({ ok: true, shot });
      } else if (msg.type === 'open-gallery') {
        await openGallery();
        sendResponse({ ok: true });
      } else if (msg.type === 'count') {
        sendResponse({ ok: true, count: await SnapDB.count() });
      } else {
        sendResponse({ ok: false, error: 'Unknown message' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();
  return true; // keep the channel open for the async response
});
