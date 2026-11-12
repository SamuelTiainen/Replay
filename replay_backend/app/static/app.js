const gallery = document.getElementById('gallery');
const status = document.getElementById('status');
const kind = document.getElementById('kind');
const order = document.getElementById('order');
const dialog = document.getElementById('viewer');
const viewerContent = document.getElementById('viewerContent');
let allMedia = [];
let lastSignature = '';
order.value = localStorage.getItem('replay-order') === 'old' ? 'old' : 'new';
kind.value = localStorage.getItem('replay-kind') || 'all';

function render() {
  const filtered = allMedia.filter(item => kind.value === 'all' || item.kind === kind.value);
  if (order.value === 'old') filtered.reverse();
  gallery.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('p'); empty.className = 'empty';
    empty.textContent = 'Ei vielä mediaa. Kopioi JPG-, PNG- tai MP4-tiedosto incoming-kansioon.';
    gallery.append(empty); return;
  }
  for (const item of filtered) {
    const button = document.createElement('button'); button.className = 'tile';
    if (item.thumb) {
      const img = document.createElement('img'); img.src = item.thumb; img.loading = 'lazy';
      img.alt = item.filename; button.append(img);
    } else {
      const icon = document.createElement('div'); icon.className = 'placeholder';
      icon.textContent = '▶'; button.append(icon);
    }
    const meta = document.createElement('span'); meta.className = 'meta';
    meta.textContent = `${item.kind === 'photo' ? 'KUVA' : 'VIDEO'} · ${item.filename}`;
    button.append(meta); button.addEventListener('click', () => openViewer(item)); gallery.append(button);
  }
}
function openViewer(item) {
  viewerContent.replaceChildren();
  const element = document.createElement(item.kind === 'video' ? 'video' : 'img');
  element.src = item.preview;
  if (item.kind === 'video') { element.controls = true; element.autoplay = false; }
  else element.alt = item.filename;
  viewerContent.append(element);
  dialog.showModal();
}
document.getElementById('close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => viewerContent.replaceChildren());
kind.addEventListener('change', () => { localStorage.setItem('replay-kind', kind.value); render(); });
order.addEventListener('change', () => { localStorage.setItem('replay-order', order.value); render(); });
async function refresh() {
  try {
    const response = await fetch('/api/manifest', {cache: 'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const signature = payload.photos.map(p => p.id).join(',');
    if (signature !== lastSignature) { allMedia = payload.photos; lastSignature = signature; render(); }
    status.textContent = `${payload.count} tiedostoa · päivitys 5 s välein`;
  } catch (err) { status.textContent = `Yhteysvirhe: ${err.message}`; }
}
refresh(); setInterval(refresh, 5000);
