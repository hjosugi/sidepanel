const ROW = 'summary, .bm:not(.unsupported)';

export function createTreeNavigation(tree, searchInput) {
  let tabStop = null;
  const rows = document.createTreeWalker(tree, NodeFilter.SHOW_ELEMENT, (el) => {
    // 閉じたフォルダでは見出しだけを辿る。表示判定のためのレイアウト計算は不要。
    if (el.tagName !== 'SUMMARY' && el.parentElement.matches('details:not([open])')) {
      return NodeFilter.FILTER_REJECT;
    }
    if (el.tagName === 'DETAILS') return NodeFilter.FILTER_SKIP;
    return el.matches(ROW) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
  });

  function firstRow() {
    rows.currentNode = tree;
    return rows.firstChild();
  }

  function setTabStop(row) {
    if (row === tabStop) return;
    if (tabStop) tabStop.tabIndex = -1;
    if (row) row.tabIndex = 0;
    tabStop = row;
  }

  function reset() {
    const row = document.activeElement?.closest(ROW);
    setTabStop(tree.contains(row) ? row : firstRow());
  }

  tree.addEventListener('focusin', (event) => {
    const row = event.target.closest(ROW);
    if (row) setTabStop(row);
  });

  tree.addEventListener('keydown', (event) => {
    const row = event.target.closest(ROW);
    if (!row) return;
    rows.currentNode = row;
    switch (event.key) {
      case 'ArrowDown':
        rows.nextNode()?.focus();
        break;
      case 'ArrowUp':
        (rows.previousNode() ?? searchInput).focus();
        break;
      case 'Home':
        firstRow()?.focus();
        break;
      case 'End':
        rows.currentNode = tree;
        rows.lastChild()?.focus();
        break;
      case 'ArrowRight':
        if (row.tagName !== 'SUMMARY') return;
        if (row.parentElement.open) rows.nextNode()?.focus();
        else row.parentElement.open = true;
        break;
      case 'ArrowLeft': {
        const folder = row.closest('details');
        if (row.tagName === 'SUMMARY' && folder.open) folder.open = false;
        else {
          const parent =
            row.tagName === 'SUMMARY' ? folder.parentElement.closest('details') : folder;
          if (!parent) return;
          parent.firstElementChild.focus();
        }
        break;
      }
      case 'Enter':
      case ' ':
        if (!row.classList.contains('bm')) return;
        row.click();
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  return { firstRow, reset };
}
