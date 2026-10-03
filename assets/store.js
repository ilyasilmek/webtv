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
    request.onsuccess = () => {
      const metadata=request.result||{};
      const channels=tx.objectStore('library').get('channels');
      channels.onsuccess=()=>resolve({...structuredClone(EMPTY),...metadata,channels:channels.result||metadata.channels||[]});
      channels.onerror=()=>reject(new Error('Kanal listesi okunamadı. Sayfayı yenileyin.'));
    };
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
      const saved=event.target.result||{};
      store.get('channels').onsuccess=event=> {
        try {
          const previous=event.target.result||saved.channels||[];
          next=change({...structuredClone(EMPTY),...saved,channels:previous});
          // A favorite or last-channel change must not rewrite a large IPTV archive.
          if(next.channels!==previous||event.target.result===undefined)store.put(next.channels,'channels');
          const {channels,...metadata}=next;store.put(metadata,'state');
        } catch(error){failure=error;tx.abort();}
      };
    };
    tx.oncomplete = () => { resolve(next); channel?.postMessage('changed'); };
    tx.onabort = tx.onerror = () => reject(failure || new Error('Liste kaydedilemedi. Tarayıcı depolama alanını kontrol edin.'));
  });
}
export async function toggleFavorite(id) {
  return updateState(state => ({ ...state, favorites: state.favorites.includes(id) ? state.favorites.filter(value => value !== id) : [...state.favorites, id] }));
}
