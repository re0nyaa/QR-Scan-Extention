chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.url || !/^https?:/.test(tab.url)) {
        console.warn("Cannot scan QR codes on this page type:", tab.url)
        return
    }

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

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install" || details.reason === "update") {
        chrome.tabs.create({ url: "update.html" })
    }
})
