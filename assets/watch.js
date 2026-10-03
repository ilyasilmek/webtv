import { filterChannels, groupsFor } from './core.js';
import { readState, updateState, toggleFavorite, subscribe } from './store.js';
import { Player } from './player.js';
import { $, el, icon, decorateIcons, notify, channelLogo, favoriteButton } from './ui.js';

decorateIcons();
let state = { channels: [], favorites: [] }, selected = null, favoritesOnly = false, limit = 100;
let pendingSelection = 0;
const player = new Player($('#video'), (kind, description) => {
  const labels = { error: 'Yayın açılamadı', loading: 'Yayın açılıyor…', buffering: 'Yayın yükleniyor…', playing: 'Yayın açık', paused: 'Duraklatıldı', ready: 'Oynat düğmesine basın', ended: 'Yayın sona erdi' };
  $('#player-state').textContent = labels[kind] || description;
  $('#video-frame').dataset.state = kind;
  $('#player-state').dataset.state = kind;
  $('#video-message').hidden = !['error', 'loading'].includes(kind);
  $('#retry').hidden = kind !== 'error';
  $('#message-title').textContent = kind === 'error' ? 'Yayın açılamadı.' : 'Yayın açılıyor.';
  $('#message-description').textContent = kind === 'loading' ? 'Kaynağa bağlanılıyor.' : description;
});
function matches() { return filterChannels(state.channels, { query: $('#watch-search').value, group: $('#watch-category').value, favoritesOnly, favorites: state.favorites }); }
function renderList() {
  const result = matches();
  const list = $('#watch-list'); list.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const channel of result.slice(0, limit)) {
    const button = el('button', `watch-channel${channel.id === selected?.id ? ' selected' : ''}`);
    button.dataset.channel = channel.id; button.setAttribute('aria-pressed', String(channel.id === selected?.id));
    button.append(channelLogo(channel));
    const text = el('span', 'channel-details'); text.append(el('strong', '', channel.name), el('span', 'muted', channel.group));
    button.append(text, icon(channel.id === selected?.id ? 'play' : 'chevron'));
    button.onclick = () => selectChannel(channel); fragment.append(button);
  }
  list.append(fragment);
  $('#watch-count').textContent = result.length;
  $('#watch-empty').hidden = Boolean(result.length);
  $('#watch-more').hidden = result.length <= limit;
  $('#watch-fav-filter').setAttribute('aria-pressed', String(favoritesOnly));
  $('#previous').disabled = $('#next').disabled = !selected || result.length < 2;
}
function renderFavorite() {
  $('#watch-favorite').replaceChildren();
  if (!selected) return;
  $('#watch-favorite').append(favoriteButton(selected, state.favorites.includes(selected.id), async () => {
    try { state = await toggleFavorite(selected.id); renderFavorite(); renderList(); $('#watch-favorite button')?.focus(); }
    catch (error) { notify(error.message, true); }
  }));
}
async function selectChannel(channel, { save = true } = {}) {
  const request = ++pendingSelection;
  selected = channel;
  $('#watch-name').textContent = channel.name;
  $('#watch-detail').textContent = channel.group;
  $('#watch-group').textContent = channel.group;
  document.title = `${channel.name} — WebTV`;
  const url = new URL(location.href); url.search = ''; url.searchParams.set('channel', channel.id); history.replaceState(null, '', url);
  renderFavorite(); renderList();
  $(`[data-channel="${channel.id}"]`)?.focus({ preventScroll: true });
  player.open(channel);
  if (save) {
    try {
      const latest = await updateState(current => ({ ...current, lastId: current.channels.some(item => item.id === channel.id) ? channel.id : current.lastId }));
      if (request === pendingSelection) state = latest;
    } catch (error) { notify(error.message, true); }
  }
}
function renderCategories() {
  const select = $('#watch-category'), previous = select.value;
  select.replaceChildren(new Option('Tüm kategoriler', ''));
  for (const group of groupsFor(state.channels)) select.add(new Option(group, group));
  select.value = groupsFor(state.channels).includes(previous) ? previous : '';
}
$('#watch-search').oninput = () => { limit = 100; renderList(); };
$('#watch-category').onchange = () => { limit = 100; renderList(); };
$('#watch-fav-filter').onclick = () => { favoritesOnly = !favoritesOnly; limit = 100; renderList(); };
$('#watch-more').onclick = () => { limit += 100; renderList(); };
function nextChannel(direction) {
  const channels = matches(); if (!channels.length) return;
  const index = channels.findIndex(channel => channel.id === selected?.id);
  selectChannel(channels[index < 0 ? 0 : (index + direction + channels.length) % channels.length]);
}
$('#previous').onclick = () => nextChannel(-1);
$('#next').onclick = () => nextChannel(1);
$('#retry').onclick = () => { if (selected) player.open(selected); };
if (document.pictureInPictureEnabled) {
  $('#pip').hidden = false;
  $('#pip').onclick = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if ($('#video').readyState >= 2) await $('#video').requestPictureInPicture();
      else notify('Yayın açıldıktan sonra bu özelliği kullanabilirsiniz.');
    } catch { notify('Bu yayında pencere içinde izleme kullanılamıyor.', true); }
  };
}
window.addEventListener('pagehide', () => player.stop());
window.addEventListener('pageshow', event => { if (event.persisted && selected) player.open(selected); });
subscribe(async () => {
  try {
    state = await readState(); renderCategories();
    if (selected && !state.channels.some(channel => channel.id === selected.id)) {
      player.stop(); selected = null; ++pendingSelection;
      $('#watch-name').textContent = 'Kanal kaldırıldı'; $('#watch-detail').textContent = 'Kanal listesinden başka bir yayın seçin.';
      $('#player-state').textContent = 'Kanal seçin'; $('#video-message').hidden = false; $('#retry').hidden = true;
      $('#message-title').textContent = 'Kanal kaldırıldı.'; $('#message-description').textContent = 'Başka bir kanal seçin veya listenizi ekleyin.';
      renderFavorite();
    }
    renderList(); renderFavorite();
  } catch (error) { notify(error.message, true); }
});
try {
  state = await readState(); renderCategories(); renderList();
  const id = new URL(location.href).searchParams.get('channel');
  const channel = state.channels.find(channel => channel.id === id) || (!id && state.channels.find(channel => channel.id === state.lastId));
  if (channel) selectChannel(channel);
  else {
    $('#watch-detail').textContent = state.channels.length ? 'Listeden izlemek istediğiniz kanalı seçin.' : 'Önce kanal listesini ekleyin.';
    if (id) notify('Bu kanal bu tarayıcıdaki listede bulunamadı.', true);
    if (!state.channels.length) $('#message-description').textContent = 'Kanal listesi sayfasından M3U dosyanızı veya yayın bağlantınızı ekleyin.';
  }
} catch (error) { $('#watch-detail').textContent = error.message; notify(error.message, true); }
