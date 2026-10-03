export const $ = selector => document.querySelector(selector);
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const icons = {
  play: '<path d="m8 5 11 7-11 7z"/>', heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 8 15 8 15S25 10 20 5Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', arrow: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>', tv: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 22h8M8 2l4 3 4-3"/>',
};
export function icon(name) {
  const span = el('span', 'icon');
  // Static, application-owned paths only; playlist content never enters innerHTML.
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.tv}</svg>`;
  return span;
}
export function decorateIcons() { document.querySelectorAll('[data-icon]').forEach(node => node.prepend(icon(node.dataset.icon))); }
export function notify(message, error = false) {
  const node = $('#notice');
  node.textContent = message;
  node.classList.toggle('error', error);
  node.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { node.hidden = true; }, error ? 12000 : 6000);
}
export function channelLogo(channel) {
  const wrap = el('span', 'channel-logo', channel.name.split(/\s+/).slice(0, 2).map(word => word[0] || '').join('').toLocaleUpperCase('tr'));
  if (channel.logo) {
    const image = document.createElement('img');
    image.src = channel.logo; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove(), { once: true }); wrap.append(image);
  }
  return wrap;
}
export function favoriteButton(channel, saved, action) {
  const button = el('button', 'icon-button favorite');
  button.type = 'button'; button.append(icon('heart')); button.setAttribute('aria-pressed', String(saved));
  button.setAttribute('aria-label', `${channel.name}: ${saved ? 'favorilerden çıkar' : 'favorilere ekle'}`);
  button.addEventListener('click', action);
  return button;
}
