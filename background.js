chrome.action.onClicked.addListener(async (tab) => {
    const isScanable =
        tab.url &&
        (/^https?:/.test(tab.url) ||
            tab.url.startsWith("file:") ||
            tab.url.startsWith(chrome.runtime.getURL("")))
    if (!isScanable) return

    try {
        const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, {
            format: "png",
        })

        await Promise.all([
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["jsQR.js", "content.js"],
            }),
            chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ["content.css"],
            }),
        ])

        chrome.tabs.sendMessage(tab.id, {
            action: "START_SELECTION",
            screenshotDataUrl,
        })
    } catch (e) {}
})

chrome.runtime.onMessage.addListener(async (request, sender) => {
    if (request.action === "REQUEST_NEW_CAPTURE" && sender.tab?.id) {
        try {
            const screenshotDataUrl = await chrome.tabs.captureVisibleTab(
                null,
                { format: "png" },
            )
            chrome.tabs.sendMessage(sender.tab.id, {
                action: "START_SELECTION",
                screenshotDataUrl,
            })
        } catch (e) {}
    }
})

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install" || details.reason === "update") {
        chrome.tabs.create({ url: "update.html" })
    }
})
