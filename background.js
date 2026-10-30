// Clicking the extension icon opens the list of saved phrases.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("saved.html") });
});

// -----------------------------------------
// TEAMMATE'S WORDBANK BACKEND API
// -----------------------------------------

const WORDBANK_API = 'http://100.87.150.51:3000';

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    if (message.type !== 'WORDBANK_SAVE_TOKEN') {
      return;
    }

    async function saveToken() {
      try {
        const response = await fetch(
          `${WORDBANK_API}/tokens`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              text: message.text,
              source_language: message.source_language,
              source_url: message.source_url
            })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Save failed');
        }

        sendResponse({
          success: true,
          data: result
        });

      } catch (error) {
        sendResponse({
          success: false,
          error: error.message
        });
      }
    }

    saveToken();

    return true;
  }
);