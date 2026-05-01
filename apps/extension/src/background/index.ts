// background service worker - 长连接代理 SSE + OAuth 跳转
// Phase 1 将实现 chrome.runtime.connect 长连接代理 fetch
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

export {};
