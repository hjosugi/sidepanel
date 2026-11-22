import { displayUrl, toUrl } from './urls.js';

/**
 * アドレス欄。ふだんは https:// を省いた URL を、編集中は完全な URL を表示する
 * （ページのタイトルはタブに出る）。
 * Enter で、URL として読める入力は onOpen に、それ以外は onSearch に渡す。
 */
export function createAddressBar({ input, onOpen, onSearch }) {
  let url = '';
  // クリックで入ったときも全体を選択したままにする（mouseup で選択が解除されるため）
  let keepSelection = false;

  function show() {
    if (document.activeElement !== input) input.value = url ? displayUrl(url) : '';
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
    /** 表示中のページの URL。ページがなければ空文字 */
    update(nextUrl) {
      url = nextUrl;
      show();
    },
    focus() {
      input.focus();
    },
  };
}
