const EMPTY = { channels: [], favorites: [], lastId: '', listName: '' };
let database;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('webtv-library') : null;
export function subscribe(listener) { channel?.addEventListener('message', listener); }
function db() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('webtv', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('library');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Tarayıcı depolamasına erişilemedi. Gizli mod veya site izinlerini kontrol edin.'));
    request.onblocked = () => reject(new Error('Diğer WebTV sekmesini kapatıp tekrar deneyin.'));
  });
  return database;
}
export async function readState() {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('library', 'readonly');
    const request = tx.objectStore('library').get('state');
    request.onsuccess = () => resolve({ ...structuredClone(EMPTY), ...request.result });
    request.onerror = () => reject(new Error('Kanal listesi okunamadı. Sayfayı yenileyin.'));
  });
}
// Read and change inside one transaction so other tabs cannot overwrite newer favorites.
export async function updateState(change) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('library', 'readwrite');
    const store = tx.objectStore('library');
    let next, failure;
    store.get('state').onsuccess = event => {
      try { next = change({ ...structuredClone(EMPTY), ...event.target.result }); store.put(next, 'state'); }
      catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { resolve(next); channel?.postMessage('changed'); };
    tx.onabort = tx.onerror = () => reject(failure || new Error('Liste kaydedilemedi. Tarayıcı depolama alanını kontrol edin.'));
  });
}
export async function toggleFavorite(id) {
  return updateState(state => ({ ...state, favorites: state.favorites.includes(id) ? state.favorites.filter(value => value !== id) : [...state.favorites, id] }));
}
