import { t } from './i18n.js';
import { iconSources, matchPin } from './urls.js';

const PIN_TYPE = 'application/x-sidepanel-pin';

/**
 * 開いているページをピンに割り当てる。1 つのピンには 1 ページだけを割り当て、
 * どのピンにも当たらないページ（と、2 つ目以降のページ）は loose に入れる。
 * @returns {{ pinned: Map<string, object>, loose: object[] }} pinned はピンの URL → ページ
 */
export function assignPages(pins, pages) {
  const pinned = new Map();
  const loose = [];
  for (const page of pages) {
    const match = page.url ? matchPin(pins, page.url) : null;
    if (match && !pinned.has(match.url)) pinned.set(match.url, page);
    else loose.push(page);
  }
  return { pinned, loose };
}

/**
 * ブラウザのタブ列と同じ形で、開いているページとピン留めしたサイトを並べる。
 * ピンは Chrome の固定タブのように左端にアイコンだけで並び、そのサイトのページを表す。
 * ほかのページはファビコン・タイトル・閉じるボタンのあるタブになる。
 */
export function createDock({ element, onSelectPage, onOpenPin, onClosePage, onMovePin, onNewTab }) {
  let pins = [];
  let pages = [];

  function item(kind, url, label, page, current) {
    const tab = document.createElement('div');
    tab.className = `dock-item ${kind}`;
    tab.dataset.url = url;
    tab.title = label;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'dock-open';
    open.setAttribute('aria-label', label);
    const img = document.createElement('img');
    Object.assign(img, { alt: '' }, iconSources(url));
    open.append(img);
    tab.append(open);
    if (kind === 'tab') {
      const text = document.createElement('span');
      text.className = 'dock-title';
      text.textContent = label;
      open.append(text);
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'dock-close';
      close.title = t('dock.close', { name: label });
      close.setAttribute('aria-label', close.title);
      close.innerHTML =
        '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="m5 5 6 6m0-6-6 6"/></svg>';
      tab.append(close);
    }
    if (page) {
      tab.dataset.pageId = String(page.id);
      tab.dataset.alive = '';
      if (page === current) {
        tab.classList.add('current');
        open.setAttribute('aria-current', 'page');
      }
    }
    return tab;
  }

  function newTabButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dock-new';
    button.title = t('dock.new');
    button.setAttribute('aria-label', button.title);
    button.innerHTML =
      '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>';
    return button;
  }

  /**
   * @param {object} state
   * @param {{ url: string, name: string }[]} state.pins
   * @param {object[]} state.pages 開いているページ
   * @param {object | null} state.current 表示中のページ（一覧を開いているときは null）
   * @param {(page: object) => string} state.label ページの表示名
   */
  function render(state) {
    pins = state.pins;
    pages = state.pages;
    element.hidden = !pins.length && !pages.length;
    if (element.hidden) {
      element.replaceChildren();
      return;
    }
    const { pinned, loose } = assignPages(pins, pages);
    const items = pins.map((pin, index) => {
      const page = pinned.get(pin.url);
      const label = page ? state.label(page) : pin.name || pin.url;
      const tab = item('pin', pin.url, label, page, state.current);
      tab.dataset.pin = String(index);
      tab.draggable = true;
      return tab;
    });
    for (const page of loose) {
      items.push(item('tab', page.url, state.label(page), page, state.current));
    }
    element.replaceChildren(...items, newTabButton());
    element
      .querySelector('[aria-current]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function pageOf(target) {
    const id = target.closest('.dock-item')?.dataset.pageId;
    return pages.find((page) => String(page.id) === id) ?? null;
  }

  element.addEventListener('click', (event) => {
    if (event.target.closest('.dock-new')) {
      onNewTab();
      return;
    }
    const tab = event.target.closest('.dock-item');
    if (!tab) return;
    const page = pageOf(tab);
    if (page && event.target.closest('.dock-close')) {
      onClosePage(page);
      return;
    }
    if (page) {
      onSelectPage(page);
      return;
    }
    const pin = pins[Number(tab.dataset.pin)];
    if (pin) onOpenPin(pin);
  });

  // ブラウザのタブと同じく、中クリックでも閉じる（mousedown を止めないと自動スクロールが始まる）
  element.addEventListener('mousedown', (event) => {
    if (event.button === 1 && pageOf(event.target)) event.preventDefault();
  });
  element.addEventListener('auxclick', (event) => {
    const page = pageOf(event.target);
    if (event.button !== 1 || !page) return;
    event.preventDefault();
    onClosePage(page);
  });

  // ピンはドラッグで並べ替える
  element.addEventListener('dragstart', (event) => {
    const button = event.target.closest('.dock-item[data-pin]');
    if (!button) return;
    event.dataTransfer.setData(PIN_TYPE, button.dataset.pin);
    event.dataTransfer.effectAllowed = 'move';
  });
  element.addEventListener('dragover', (event) => {
    if (!event.dataTransfer.types.includes(PIN_TYPE)) return;
    if (!event.target.closest('.dock-item[data-pin]')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });
  element.addEventListener('drop', (event) => {
    const target = event.target.closest('.dock-item[data-pin]');
    const raw = event.dataTransfer.getData(PIN_TYPE);
    if (!target || raw === '') return;
    event.preventDefault();
    const from = Number(raw);
    const to = Number(target.dataset.pin);
    if (Number.isInteger(from) && from !== to) onMovePin(from, to);
  });

  return { render };
}
