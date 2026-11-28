import { t } from './i18n.js';
import { addressTarget, displayUrl } from './urls.js';

/**
 * アドレス欄。ふだんは https:// を省いた URL を、編集中は完全な URL を表示する
 * （ページのタイトルはタブに出る）。
 * Enter で Web アドレスまたは検索結果をパネルに開く。
 */
export function createAddressBar({ input, onOpen }) {
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
    input.setCustomValidity('');
    show();
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
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
    const target = addressTarget(text);
    if (!target) {
      input.setCustomValidity(t('address.unsupported'));
      input.reportValidity();
      return;
    }
    input.blur();
    onOpen(target);
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
