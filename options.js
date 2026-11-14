import { getLang, setLang, t } from './i18n.js';
import { getSettings, MAX_PAGES, normalizeSettings, setSettings } from './store.js';

const lang = document.getElementById('lang');
const mobile = document.getElementById('mobile');
const pages = document.getElementById('pages');
const desktop = document.getElementById('desktop');
const desktopEmpty = document.getElementById('desktop-empty');
const status = document.getElementById('status');

let settings = await getSettings();
setLang(settings.lang ?? 'en');

for (let count = 1; count <= MAX_PAGES; count++) {
  pages.append(new Option(String(count), String(count)));
}

function render() {
  document.title = t('options.title');
  lang.value = getLang();
  mobile.checked = settings.mobileUA;
  pages.value = String(settings.maxPages);
  desktop.replaceChildren(
    ...settings.desktopHosts.map((host) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = host;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = t('options.remove', { host });
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () =>
        save({ desktopHosts: settings.desktopHosts.filter((saved) => saved !== host) }),
      );
      item.append(name, remove);
      return item;
    }),
  );
  desktopEmpty.hidden = settings.desktopHosts.length > 0;
}

async function save(patch) {
  settings = await setSettings(patch);
  // パネルが開いていれば、バックグラウンドがルールとスクリプトを更新する
  await chrome.runtime.sendMessage({ type: 'settings-changed' }).catch(() => {});
  render();
  status.textContent = t('options.saved');
}

lang.addEventListener('change', () => {
  setLang(lang.value);
  save({ lang: getLang() });
});
mobile.addEventListener('change', () => save({ mobileUA: mobile.checked }));
pages.addEventListener('change', () => save({ maxPages: Number(pages.value) }));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  settings = normalizeSettings(changes.settings.newValue);
  if (settings.lang && settings.lang !== getLang()) setLang(settings.lang);
  render();
});

render();
