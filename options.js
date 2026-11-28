import { getLang, setLang, t } from './i18n.js';
import {
  getSettings,
  MAX_PAGES,
  normalizeSettings,
  readLocal,
  reorderPins,
  setSettings,
} from './store.js';
import { displayUrl, hostOf, iconSources, SEARCH_ENGINES, toUrl } from './urls.js';
import { ZOOM_LEVELS, zoomPercent } from './zoom.js';

const lang = document.getElementById('lang');
const searchEngine = document.getElementById('search-engine');
const mobile = document.getElementById('mobile');
const pages = document.getElementById('pages');
const zoom = document.getElementById('zoom');
const siteZoom = document.getElementById('site-zoom');
const siteZoomEmpty = document.getElementById('site-zoom-empty');
const startups = [...document.querySelectorAll('input[name="startup"]')];
const startForm = document.getElementById('start-form');
const startUrl = document.getElementById('start-url');
const startCurrent = document.getElementById('start-current');
const startSuggestions = document.getElementById('start-suggestions');
const startError = document.getElementById('start-error');
const pins = document.getElementById('pins');
const pinsEmpty = document.getElementById('pins-empty');
const desktop = document.getElementById('desktop');
const desktopEmpty = document.getElementById('desktop-empty');
const unframed = document.getElementById('unframed');
const unframedEmpty = document.getElementById('unframed-empty');
const unframedForm = document.getElementById('unframed-form');
const unframedHost = document.getElementById('unframed-host');
const unframedError = document.getElementById('unframed-error');
const status = document.getElementById('status');

let settings = await getSettings();
setLang(settings.lang ?? 'en');
for (const name of SEARCH_ENGINES.keys()) searchEngine.append(new Option(name, name));

for (let count = 1; count <= MAX_PAGES; count++) {
  pages.append(new Option(String(count), String(count)));
}
for (const level of ZOOM_LEVELS) zoom.append(new Option(zoomPercent(level), String(level)));

function iconButton(text, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

function hostList(list, empty, hosts, key) {
  list.replaceChildren(
    ...hosts.map((host) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = host;
      item.append(
        name,
        iconButton('×', t('options.remove', { host }), () =>
          save({ [key]: settings[key].filter((saved) => saved !== host) }),
        ),
      );
      return item;
    }),
  );
  empty.hidden = hosts.length > 0;
}

function renderSiteZoom() {
  const entries = Object.entries(settings.siteZoom);
  siteZoom.replaceChildren(
    ...entries.map(([host, level]) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = host;
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = zoomPercent(level);
      const remove = iconButton('×', t('options.remove', { host }), () => {
        const next = { ...settings.siteZoom };
        delete next[host];
        save({ siteZoom: next });
      });
      item.append(name, value, remove);
      return item;
    }),
  );
  siteZoomEmpty.hidden = entries.length > 0;
}

function movePin(from, to) {
  save(({ pins }) => ({ pins: reorderPins(pins, from, to) }));
}

function renderPins() {
  const count = settings.pins.length;
  pins.replaceChildren(
    ...settings.pins.map((pin, index, list) => {
      const name = pin.name || displayUrl(pin.url);
      const item = document.createElement('li');
      const img = document.createElement('img');
      Object.assign(img, { alt: '', width: 16, height: 16 }, iconSources(pin.url));
      const text = document.createElement('span');
      text.className = 'name';
      text.textContent = name;
      text.title = pin.url;
      const up = iconButton('↑', t('options.up', { name }), () =>
        movePin(pin.url, list[index - 1]?.url),
      );
      const down = iconButton('↓', t('options.down', { name }), () =>
        movePin(pin.url, list[index + 1]?.url),
      );
      up.disabled = index === 0;
      down.disabled = index === count - 1;
      const remove = iconButton('×', t('options.unpin', { name }), () =>
        save(({ pins }) => ({ pins: pins.filter((item) => item.url !== pin.url) })),
      );
      item.append(img, text, up, down, remove);
      return item;
    }),
  );
  pinsEmpty.hidden = count > 0;
  startSuggestions.replaceChildren(...settings.pins.map((pin) => new Option(pin.name, pin.url)));
}

function render() {
  searchEngine.value = settings.searchEngine;
  document.title = t('options.title');
  lang.value = getLang();
  mobile.checked = settings.mobileUA;
  pages.value = String(settings.maxPages);
  zoom.value = String(settings.zoom);
  for (const radio of startups) radio.checked = radio.value === settings.startup;
  if (document.activeElement !== startUrl) startUrl.value = settings.startUrl;
  startCurrent.disabled = !readLocal('last', null)?.url;
  startError.hidden = !(settings.startup === 'url' && !settings.startUrl);
  renderPins();
  renderSiteZoom();
  hostList(desktop, desktopEmpty, settings.desktopHosts, 'desktopHosts');
  hostList(unframed, unframedEmpty, settings.unframedHosts, 'unframedHosts');
}

async function save(patch) {
  settings = await setSettings(patch);
  // パネルが開いていれば、バックグラウンドがルールとスクリプトを更新する
  await chrome.runtime.sendMessage({ type: 'settings-changed' }).catch(() => {});
  render();
  status.textContent = t('options.saved');
}

function saveStartUrl() {
  const text = startUrl.value.trim();
  const url = text ? toUrl(text) : '';
  if (url === null) {
    startError.hidden = false;
    return;
  }
  startError.hidden = true;
  save(url ? { startUrl: url, startup: 'url' } : { startUrl: '' });
}

lang.addEventListener('change', () => {
  setLang(lang.value);
  save({ lang: getLang() });
});
mobile.addEventListener('change', () => save({ mobileUA: mobile.checked }));
searchEngine.addEventListener('change', () => save({ searchEngine: searchEngine.value }));
pages.addEventListener('change', () => save({ maxPages: Number(pages.value) }));
zoom.addEventListener('change', () => save({ zoom: Number(zoom.value) }));
for (const radio of startups) {
  radio.addEventListener('change', () => {
    if (radio.checked) save({ startup: radio.value });
  });
}
startForm.addEventListener('submit', (event) => {
  event.preventDefault();
  saveStartUrl();
});
startUrl.addEventListener('change', saveStartUrl);
startCurrent.addEventListener('click', () => {
  const url = readLocal('last', null)?.url;
  if (!url) return;
  startUrl.value = url;
  saveStartUrl();
});
unframedForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = unframedHost.value.trim();
  const host = hostOf(toUrl(text) ?? '').replace(/^www\./, '');
  unframedError.hidden = Boolean(host);
  if (!host) return;
  unframedHost.value = '';
  save({ unframedHosts: [...settings.unframedHosts, host] });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  settings = normalizeSettings(changes.settings.newValue);
  if (settings.lang && settings.lang !== getLang()) setLang(settings.lang);
  render();
});

render();
