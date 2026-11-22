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
 * Edge のサイドバーのように、ピン留めしたサイトと開いているページをアイコンで並べる。
 * ピンに当たるページはそのピンのアイコンで表し、残りのページは区切りの後ろに並べる。
 */
export function createDock({ element, onSelectPage, onOpenPin, onClosePage, onMovePin }) {
  let pins = [];
  let pages = [];

  function itemButton(url, label, page, current) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dock-item';
    button.dataset.url = url;
    button.title = label;
    button.setAttribute('aria-label', label);
    const img = document.createElement('img');
    Object.assign(img, { alt: '' }, iconSources(url));
    button.append(img);
    if (page) {
      button.dataset.pageId = String(page.id);
      button.dataset.alive = '';
      if (page === current) button.setAttribute('aria-current', 'page');
    }
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
    element.hidden = !pins.length && pages.length < 2;
    if (element.hidden) {
      element.replaceChildren();
      return;
    }
    const { pinned, loose } = assignPages(pins, pages);
    const items = pins.map((pin, index) => {
      const page = pinned.get(pin.url);
      const label = page ? state.label(page) : pin.name || pin.url;
      const button = itemButton(pin.url, label, page, state.current);
      button.dataset.pin = String(index);
      button.draggable = true;
      return button;
    });
    if (pins.length && loose.length) {
      const separator = document.createElement('span');
      separator.className = 'dock-separator';
      items.push(separator);
    }
    for (const page of loose) {
      items.push(itemButton(page.url, state.label(page), page, state.current));
    }
    element.replaceChildren(...items);
    element
      .querySelector('[aria-current]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function pageOf(target) {
    const id = target.closest('.dock-item')?.dataset.pageId;
    return pages.find((page) => String(page.id) === id) ?? null;
  }

  element.addEventListener('click', (event) => {
    const button = event.target.closest('.dock-item');
    if (!button) return;
    const page = pageOf(button);
    if (page) {
      onSelectPage(page);
      return;
    }
    const pin = pins[Number(button.dataset.pin)];
    if (pin) onOpenPin(pin);
  });

  // 中クリックで開いているページを閉じる（mousedown を止めないと自動スクロールが始まる）
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
