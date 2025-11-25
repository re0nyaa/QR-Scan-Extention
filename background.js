chrome.action.onClicked.addListener(async (tab) => {
  // Always use freeze mode: capture screenshot first, then start selection
  chrome.tabs.captureVisibleTab(null, { format: "png" }, (screenshotDataUrl) => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["jsQR.js", "content.js"]
    });
    chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"]
    }).then(() => {
      // Send screenshot to content script after a brief delay to ensure script is loaded
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, {
          action: "START_SELECTION",
          screenshotDataUrl: screenshotDataUrl
        });
      }, 100);
    });
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "REQUEST_NEW_CAPTURE") {
    // Capture new screenshot for next scan
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (screenshotDataUrl) => {
      chrome.tabs.sendMessage(sender.tab.id, {
        action: "START_SELECTION",
        screenshotDataUrl: screenshotDataUrl
      });
    });
  }
});
