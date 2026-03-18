chrome.action.onClicked.addListener(async (tab) => {
    // Only capture screenshots on normal web pages (not internal or extension pages).
    if (!tab.url || !/^https?:/.test(tab.url)) {
        console.warn("Cannot scan QR codes on this page type:", tab.url)
        return
    }

    // Always use freeze mode: capture screenshot first, then start selection
    chrome.tabs.captureVisibleTab(
        null,
        { format: "png" },
        (screenshotDataUrl) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "Screenshot capture failed:",
                    chrome.runtime.lastError.message,
                )
                return
            }

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["jsQR.js", "content.js"],
            })
            chrome.scripting
                .insertCSS({
                    target: { tabId: tab.id },
                    files: ["content.css"],
                })
                .then(() => {
                    // Send screenshot to content script after a brief delay to ensure script is loaded
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tab.id, {
                            action: "START_SELECTION",
                            screenshotDataUrl: screenshotDataUrl,
                        })
                    }, 100)
                })
        },
    )
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "REQUEST_NEW_CAPTURE") {
        // Capture new screenshot for next scan
        chrome.tabs.captureVisibleTab(
            null,
            { format: "png" },
            (screenshotDataUrl) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "Screenshot capture failed:",
                        chrome.runtime.lastError.message,
                    )
                    return
                }

                chrome.tabs.sendMessage(sender.tab.id, {
                    action: "START_SELECTION",
                    screenshotDataUrl: screenshotDataUrl,
                })
            },
        )
    }
})
