import { parseM3U, makeChannel, fetchPlaylist, filterChannels, groupsFor, mergeChannels, MAX_BYTES } from './core.js';
import { readState, updateState, toggleFavorite, subscribe } from './store.js';
import { $, el, icon, decorateIcons, notify, channelLogo, favoriteButton } from './ui.js';

let state = { channels: [], favorites: [], listName: '', lastId: '' };
let group = '', favoritesOnly = false, limit = 100, panel = 'file', importing = false;
decorateIcons();
const dialog = $('#import-dialog');
function openImport() { $('#import-error').hidden = true; dialog.showModal(); }
function closeImport() { if (!importing) dialog.close(); }
$('#add-list').onclick = $('#empty-add').onclick = openImport;
$('#close-dialog').onclick = closeImport;
dialog.addEventListener('cancel', event => { if (importing) event.preventDefault(); });

function render() {
  const focusedFavorite = document.activeElement?.dataset.favorite;
  const results = filterChannels(state.channels, { query: $('#search').value, group, favoritesOnly, favorites: state.favorites });
  $('#all-count').textContent = state.channels.length;
  $('#fav-count').textContent = state.channels.filter(channel => state.favorites.includes(channel.id)).length;
  $('#all-channels').classList.toggle('active', !favoritesOnly && !group);
  $('#favorites').classList.toggle('active', favoritesOnly);
  $('#all-channels').setAttribute('aria-pressed', String(!favoritesOnly && !group));
  $('#favorites').setAttribute('aria-pressed', String(favoritesOnly));
  $('#view-title').textContent = favoritesOnly ? 'Favoriler' : group || 'Tüm kanallar';
  $('#result-count').textContent = `${results.length} KANAL`;
  $('#list-description').textContent = state.channels.length ? `${state.listName || 'Kanal arşivi'} · ${state.channels.length} kanal` : 'Kanal listenizi ekleyin, izlemek istediğiniz yayını seçin.';
  $('#empty').hidden = Boolean(state.channels.length);
  $('#no-results').hidden = !state.channels.length || Boolean(results.length);
  $('#clear-list').hidden = !state.channels.length;
  $('#load-more-wrap').hidden = results.length <= limit;
  const last = state.channels.find(channel => channel.id === state.lastId);
  $('#continue').hidden = !last;
  if (last) { $('#last-name').textContent = last.name; $('#last-group').textContent = last.group; $('#last-link').href = `./watch.html?channel=${encodeURIComponent(last.id)}`; }
  const list = $('#channel-list'); list.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const [index, channel] of results.slice(0, limit).entries()) {
    const row = el('div', 'channel-row');
    const link = el('a', 'channel-link'); link.href = `./watch.html?channel=${encodeURIComponent(channel.id)}`;
    link.append(el('span', 'channel-number', String(index + 1).padStart(2, '0')), channelLogo(channel));
    const details = el('span', 'channel-details'); details.append(el('strong', '', channel.name), el('span', 'muted', channel.group));
    const action = el('span', 'row-action', 'İzle'); action.append(icon('chevron')); link.append(details, action); row.append(link);
    const favorite = favoriteButton(channel, state.favorites.includes(channel.id), async () => {
      try { state = await toggleFavorite(channel.id); render(); } catch (error) { notify(error.message, true); }
    }); favorite.dataset.favorite = channel.id; row.append(favorite); fragment.append(row);
  }
  list.append(fragment);
  if (focusedFavorite) document.querySelector(`[data-favorite="${focusedFavorite}"]`)?.focus({ preventScroll: true });
  renderCategories();
}
function renderCategories() {
  const container = $('#categories'); container.replaceChildren();
  const select = $('#category-select'); select.replaceChildren(new Option('Tüm kategoriler', ''));
  for (const name of groupsFor(state.channels)) {
    const button = el('button', `category-item${name === group ? ' active' : ''}`, name);
    button.setAttribute('aria-pressed', String(name === group));
    button.onclick = () => { group = name; favoritesOnly = false; limit = 100; render(); };
    container.append(button); select.add(new Option(name, name));
  }
  select.value = group;
}
function resetFilters() { group = ''; favoritesOnly = false; limit = 100; $('#search').value = ''; render(); }
$('#all-channels').onclick = resetFilters;
$('#favorites').onclick = () => { favoritesOnly = true; group = ''; limit = 100; render(); };
$('#reset-filters').onclick = resetFilters;
$('#search').oninput = () => { limit = 100; render(); };
$('#category-select').onchange = event => { group = event.target.value; favoritesOnly = false; limit = 100; render(); };
$('#load-more').onclick = () => { limit += 100; render(); };
const tabs = [...document.querySelectorAll('[data-panel]')];
function selectTab(tab) {
  panel = tab.dataset.panel;
  for (const item of tabs) {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1;
    $(`#panel-${item.dataset.panel}`).hidden = !active;
  }
  $('#import-error').hidden = true;
}
tabs.forEach((tab, index) => {
  tab.onclick = () => selectTab(tab);
  tab.onkeydown = event => {
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus(); selectTab(tabs[next]);
    }
  };
});
$('#playlist-file').onchange = () => { $('#file-name').textContent = $('#playlist-file').files[0]?.name || '.m3u veya .m3u8 · en fazla 8 MB'; };

async function saveChannels(channels, name, mode) {
  state = await updateState(current => {
    const next = mode === 'replace' ? channels : mergeChannels(current.channels, channels);
    const ids = new Set(next.map(channel => channel.id));
    return { ...current, channels: next, listName: name, favorites: current.favorites.filter(id => ids.has(id)), lastId: ids.has(current.lastId) ? current.lastId : '' };
  });
  resetFilters();
}
$('#import-form').onsubmit = async event => {
  event.preventDefault();
  if (importing) return;
  importing = true;
  $('#import-error').hidden = true;
  $('#import-submit').textContent = 'Liste alınıyor…'; $('#import-submit').disabled = true;
  // Keep the chosen mode and all input fields fixed until this import completes.
  const mode = $('#import-mode').value;
  const inputs = [...dialog.querySelectorAll('input, select, [role="tab"], #close-dialog')]; inputs.forEach(input => { input.disabled = true; });
  try {
    let result, name;
    if (panel === 'stream') {
      if (!$('#stream-name').value.trim()) throw new Error('Kanal adını girin.');
      result = { channels: [makeChannel({ name: $('#stream-name').value, url: $('#stream-url').value, type: $('#stream-type').value })], skipped: 0, duplicates: 0 };
      name = state.listName || 'Kanal arşivi';
    } else if (panel === 'file') {
      const file = $('#playlist-file').files[0];
      if (!file) throw new Error('Bir M3U dosyası seçin.');
      if (file.size > MAX_BYTES) throw new Error('Liste en fazla 8 MB olabilir.');
      result = parseM3U(await file.text()); name = file.name;
    } else {
      const remote = await fetchPlaylist($('#playlist-url').value);
      result = parseM3U(remote.text, remote.base); name = 'Bağlantıdan eklenen liste';
    }
    await saveChannels(result.channels, name, mode);
    dialog.close(); $('#import-form').reset(); $('#file-name').textContent = '.m3u veya .m3u8 · en fazla 8 MB';
    let message = `${result.channels.length} kanal işlendi. Arşivde ${state.channels.length} kanal var.`;
    if (result.skipped) message += ` ${result.skipped} desteklenmeyen bağlantı atlandı.`;
    if (result.duplicates) message += ` ${result.duplicates} tekrar birleştirildi.`;
    notify(message);
  } catch (error) { $('#import-error').textContent = error.message; $('#import-error').hidden = false; }
  finally { importing = false; $('#import-submit').textContent = 'Kanalları ekle'; $('#import-submit').disabled = false; inputs.forEach(input => { input.disabled = false; }); }
};
$('#demo').onclick = async () => {
  $('#demo').disabled = true;
  try {
    await saveChannels([makeChannel({ name: 'Örnek yayın', group: 'Test videosu', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls' })], state.listName || 'Örnek liste', 'merge');
    notify('Örnek yayın eklendi. İzle düğmesiyle oynatıcıyı deneyebilirsiniz.');
  } catch (error) { notify(error.message, true); }
  finally { $('#demo').disabled = false; }
};
$('#clear-list').onclick = () => $('#clear-dialog').showModal();
$('#cancel-clear').onclick = () => $('#clear-dialog').close();
$('#confirm-clear').onclick = async () => {
  $('#confirm-clear').disabled = true;
  try { state = await updateState(() => ({ channels: [], favorites: [], lastId: '', listName: '' })); $('#clear-dialog').close(); resetFilters(); notify('Kanal listesi temizlendi.'); }
  catch (error) { notify(error.message, true); }
  finally { $('#confirm-clear').disabled = false; }
};
subscribe(async () => { try { state = await readState(); render(); } catch (error) { notify(error.message, true); } });
try { state = await readState(); render(); }
catch (error) { render(); notify(error.message, true); }
