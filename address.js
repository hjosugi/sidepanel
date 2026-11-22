import { toUrl } from './urls.js';

/**
 * アドレス欄。編集していないときはページのタイトルを、編集中は URL を表示する。
 * Enter で、URL として読める入力は onOpen に、それ以外は onSearch に渡す。
 */
export function createAddressBar({ input, onOpen, onSearch }) {
  let url = '';
  let label = '';
  // クリックで入ったときも全体を選択したままにする（mouseup で選択が解除されるため）
  let keepSelection = false;

  function show() {
    if (document.activeElement !== input) input.value = label;
    input.title = url;
  }

  input.addEventListener('focus', () => {
    if (url) input.value = url;
    input.select();
    keepSelection = true;
  });
  input.addEventListener('mouseup', (event) => {
    if (keepSelection) event.preventDefault();
    keepSelection = false;
  });
  input.addEventListener('blur', () => {
    keepSelection = false;
    show();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      // 一覧を閉じる Esc より先に、編集だけを取り消す
      event.preventDefault();
      event.stopPropagation();
      input.blur();
      return;
    }
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const target = toUrl(text);
    input.blur();
    if (target) onOpen(target);
    else onSearch(text);
  });

  return {
    /** 表示中のページの URL と表示名。ページがなければ空文字 */
    update(nextUrl, nextLabel) {
      url = nextUrl;
      label = nextLabel;
      show();
    },
    focus() {
      input.focus();
    },
  };
}
