// Clicking the extension icon opens the list of saved phrases.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("saved.html") });
});
