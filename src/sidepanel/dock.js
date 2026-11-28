import { t } from '../shared/i18n.js';
import { MAX_PINS } from '../shared/store.js';
import { iconSources, matchPin } from '../shared/urls.js';

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
export function createDock({
  element,
  onSelectPage,
  onOpenPin,
  onClosePage,
  onTogglePin,
  onMovePin,
  onNewTab,
}) {
  const menu = document.getElementById('dock-menu');
  const togglePin = document.getElementById('dock-toggle-pin');
  const close = document.getElementById('dock-close-page');
  let pins = [];
  let pages = [];
  let menuTarget = null;

  function item(kind, url, label, page, current) {
    const tab = document.createElement('div');
    tab.className = `dock-item ${kind}`;
    tab.dataset.url = url;
    tab.title = label;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'dock-open';
    open.setAttribute('aria-label', label);
    open.setAttribute('aria-keyshortcuts', 'Shift+F10');
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
    const focused = document.activeElement?.closest('.dock-item');
    const focusClose = document.activeElement?.classList.contains('dock-close');
    pins = state.pins;
    pages = state.pages;
    element.hidden = !pins.length && !pages.length;
    if (element.hidden) {
      menu.hidePopover();
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
    if (focused) {
      const tab = findItem(focused.dataset) ?? element.querySelector('.current, .dock-item');
      const button = focusClose && tab?.querySelector('.dock-close');
      (button || tab?.querySelector('.dock-open') || element.querySelector('.dock-new')).focus({
        preventScroll: true,
      });
    }
    if (menu.matches(':popover-open')) updateMenu();
    element
      .querySelector('[aria-current]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function pageOf(target) {
    const id = target.closest('.dock-item')?.dataset.pageId;
    return pages.find((page) => String(page.id) === id) ?? null;
  }

  function findItem(target) {
    if (!target) return null;
    const { pageId, url } = target;
    if (pageId) return element.querySelector(`[data-page-id="${CSS.escape(pageId)}"]`);
    return element.querySelector(`.pin[data-url="${CSS.escape(url)}"]`);
  }

  function updateMenu() {
    const tab = findItem(menuTarget);
    if (!tab) {
      menu.hidePopover();
      return;
    }
    const pinned = tab.dataset.pin !== undefined;
    togglePin.textContent = t(pinned ? 'pin.remove' : 'pin.add');
    togglePin.disabled = !pinned && pins.length >= MAX_PINS;
    close.disabled = !pageOf(tab);
  }

  function openMenu(tab, x, y) {
    menuTarget = { ...tab.dataset };
    tab.querySelector('.dock-open').focus({ preventScroll: true });
    updateMenu();
    menu.showPopover();
    menu.style.left = `${Math.max(0, Math.min(x, innerWidth - menu.offsetWidth))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, innerHeight - menu.offsetHeight))}px`;
    menu.querySelector('button:enabled')?.focus();
  }

  element.addEventListener('contextmenu', (event) => {
    const tab = event.target.closest('.dock-item');
    if (!tab) return;
    event.preventDefault();
    openMenu(tab, event.clientX, event.clientY);
  });
  element.addEventListener('keydown', (event) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    const tab = event.target.closest('.dock-item');
    if (!tab) return;
    event.preventDefault();
    const { left, bottom } = tab.getBoundingClientRect();
    openMenu(tab, left, bottom);
  });
  menu.addEventListener('click', (event) => {
    const tab = findItem(menuTarget);
    const button = event.target.closest('button');
    if (!tab || !button) return;
    const page = pageOf(tab);
    menu.hidePopover();
    tab.querySelector('.dock-open').focus({ preventScroll: true });
    if (button === togglePin) onTogglePin(page, pins[Number(tab.dataset.pin)]);
    else if (page && button === close) onClosePage(page);
  });
  menu.addEventListener('keydown', (event) => {
    const buttons = [...menu.querySelectorAll('button:enabled')];
    let target;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        target = buttons.find((button) => button !== document.activeElement);
        break;
      case 'Home':
        target = buttons[0];
        break;
      case 'End':
        target = buttons.at(-1);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        menu.hidePopover();
        findItem(menuTarget)?.querySelector('.dock-open').focus();
        return;
      default:
        return;
    }
    event.preventDefault();
    target?.focus();
  });
  addEventListener('blur', () => menu.hidePopover());

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
    event.dataTransfer.setData(PIN_TYPE, button.dataset.url);
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
    const from = event.dataTransfer.getData(PIN_TYPE);
    if (!target || !from) return;
    event.preventDefault();
    if (from !== target.dataset.url) onMovePin(from, target.dataset.url);
  });

  return { render };
}
