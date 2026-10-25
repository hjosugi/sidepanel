// ツールバーのアイコンでサイドパネルを開閉する。これ以外の常駐処理は持たない。
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
