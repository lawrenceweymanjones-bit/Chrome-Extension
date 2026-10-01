# Snap Gallery

A small Chrome extension that saves screenshots of the current tab into a local gallery you can browse later. Everything stays in your browser — nothing is uploaded anywhere.

## Features

- One-click capture of the visible tab from the toolbar popup, or `Alt+Shift+S` (`⌥⇧S` on Mac)
- Gallery page (`Alt+Shift+G`) with a grid of thumbnails showing page title, site and date
- Click any shot to view it full size, step through with arrow keys, add a note, download the PNG, or delete it
- Screenshots are stored as binary in IndexedDB, with small JPEG thumbnails so the grid stays fast

## Install (unpacked)

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.
5. Pin the Snap Gallery icon from the puzzle-piece menu so it's always in your toolbar.

If the keyboard shortcuts don't work, set them at `chrome://extensions/shortcuts` — Chrome sometimes declines a suggested shortcut if another extension already uses it.

## How it works

| File | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 config, permissions and keyboard commands |
| `background.js` | Service worker: captures the tab with `chrome.tabs.captureVisibleTab`, stores it, opens the gallery |
| `db.js` | Shared IndexedDB wrapper (`SnapDB`) used by the worker, popup and gallery |
| `popup.html/js` | Toolbar popup with Capture and Open gallery buttons |
| `gallery.html/js` | The gallery page: grid, viewer, notes, download, delete |

Chrome won't allow capturing its own internal pages (`chrome://`, the Web Store, etc.) — you'll see a short error in the popup if you try.

## Permissions

- `activeTab` / `tabs` — read the current tab's title and URL and capture it
- `storage` / `unlimitedStorage` — keep screenshots in IndexedDB without hitting the default quota
