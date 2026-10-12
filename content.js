;(function () {
    if (!window.qrListenerAdded) {
        chrome.runtime.onMessage.addListener(
            (request, sender, sendResponse) => {
                if (request.action === "PROCESS_IMAGE") {
                    processImage(request.dataUrl, request.area)
                } else if (request.action === "START_SELECTION") {
                    startSelection(request.screenshotDataUrl)
                }
            },
        )
        window.qrListenerAdded = true
    }

    if (window.qrSelectionActive) {
        const existingOverlay = document.querySelector(".qr-selection-overlay")
        if (existingOverlay) {
            if (existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay)
            }
        }
    }

    window.qrSelectionActive = true

    let startX, startY, endX, endY
    let overlay, selectionBox, freezeImage

    function startSelection(screenshotDataUrl) {
        createOverlay(screenshotDataUrl)
    }

    function createOverlay(screenshotDataUrl) {
        overlay = document.createElement("div")
        overlay.className = "qr-selection-overlay"

        if (screenshotDataUrl) {
            freezeImage = document.createElement("img")
            freezeImage.src = screenshotDataUrl
            freezeImage.className = "qr-freeze-image"
            overlay.appendChild(freezeImage)
        }

        document.body.appendChild(overlay)

        const instructionText = document.createElement("div")
        instructionText.className = "qr-instruction-text"
        instructionText.innerText = "Drag to Scan QR Code"
        overlay.appendChild(instructionText)

        const closeBtn = document.createElement("div")
        closeBtn.innerText = "×"
        closeBtn.className = "qr-close-btn"
        closeBtn.onclick = removeOverlay
        overlay.appendChild(closeBtn)

        selectionBox = document.createElement("div")
        selectionBox.className = "qr-selection-box"
        selectionBox.style.display = "none"
        overlay.appendChild(selectionBox)

        overlay.addEventListener("mousedown", onMouseDown)
    }

    function removeOverlay() {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay)
        }
        window.qrSelectionActive = false
    }

    function onMouseDown(e) {
        if (e.target.className === "qr-close-btn") return

        e.preventDefault()
        startX = e.clientX
        startY = e.clientY
        endX = startX
        endY = startY

        selectionBox.style.left = startX + "px"
        selectionBox.style.top = startY + "px"
        selectionBox.style.width = "0px"
        selectionBox.style.height = "0px"
        selectionBox.style.display = "block"

        overlay.addEventListener("mousemove", onMouseMove)
        overlay.addEventListener("mouseup", onMouseUp)
    }

    function onMouseMove(e) {
        e.preventDefault()
        endX = e.clientX
        endY = e.clientY

        const left = Math.min(startX, endX)
        const top = Math.min(startY, endY)
        const width = Math.abs(endX - startX)
        const height = Math.abs(endY - startY)

        selectionBox.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;display:block;`
    }

    function onMouseUp(e) {
        overlay.removeEventListener("mousemove", onMouseMove)
        overlay.removeEventListener("mouseup", onMouseUp)

        const left = Math.min(startX, endX)
        const top = Math.min(startY, endY)
        const width = Math.abs(endX - startX)
        const height = Math.abs(endY - startY)

        if (width < 10 || height < 10) {
            removeOverlay()
            return
        }

        if (freezeImage) {
            const screenshotDataUrl = freezeImage.src
            removeOverlay()
            processImage(screenshotDataUrl, { left, top, width, height })
        }
    }

    const barcodeDetector =
        "BarcodeDetector" in window
            ? new BarcodeDetector({ formats: ["qr_code"] })
            : null

    async function scanCanvasOrData(canvas, customImageData) {
        if (barcodeDetector && canvas) {
            try {
                const barcodes = await barcodeDetector.detect(canvas)
                if (barcodes[0]?.rawValue) return barcodes[0].rawValue
            } catch {}
        }
        const imgData =
            customImageData ||
            canvas
                .getContext("2d")
                .getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: "attemptBoth",
        })
        return code ? code.data : null
    }

    async function decodeQRFromCanvas(canvas) {
        let res = await scanCanvasOrData(canvas)
        if (res) return res

        const width = canvas.width
        const height = canvas.height

        if (width > 1000 || height > 1000) {
            const downCanvas = document.createElement("canvas")
            downCanvas.width = width >> 1
            downCanvas.height = height >> 1
            const downCtx = downCanvas.getContext("2d")
            downCtx.drawImage(canvas, 0, 0, downCanvas.width, downCanvas.height)
            res = await scanCanvasOrData(downCanvas)
            if (res) return res
        }

        if (width < 300 || height < 300) {
            const scale = Math.max(
                2,
                Math.ceil(300 / Math.min(width, height)),
            )
            const upCanvas = document.createElement("canvas")
            upCanvas.width = width * scale
            upCanvas.height = height * scale
            const upCtx = upCanvas.getContext("2d")
            upCtx.imageSmoothingEnabled = false
            upCtx.drawImage(canvas, 0, 0, upCanvas.width, upCanvas.height)
            res = await scanCanvasOrData(upCanvas)
            if (res) return res
        }

        const ctx = canvas.getContext("2d")
        const origData = ctx.getImageData(0, 0, width, height)
        const d = origData.data
        const len = d.length

        const sharpData = ctx.createImageData(width, height)
        const sd = sharpData.data
        const rowStride = width << 2
        for (let y = 1; y < height - 1; y++) {
            const yOffset = y * rowStride
            for (let x = 1; x < width - 1; x++) {
                const idx = yOffset + (x << 2)
                for (let c = 0; c < 3; c++) {
                    const val =
                        5 * d[idx + c] -
                        d[idx - rowStride + c] -
                        d[idx + rowStride + c] -
                        d[idx - 4 + c] -
                        d[idx + 4 + c]
                    sd[idx + c] = val < 0 ? 0 : val > 255 ? 255 : val
                }
                sd[idx + 3] = 255
            }
        }
        res = await scanCanvasOrData(null, sharpData)
        if (res) return res

        let min = 255
        let max = 0
        for (let i = 0; i < len; i += 4) {
            const gray = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8
            if (gray < min) min = gray
            if (gray > max) max = gray
        }

        const contrastData = ctx.createImageData(width, height)
        const cd = contrastData.data
        const range = max - min || 1
        for (let i = 0; i < len; i += 4) {
            const gray = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8
            const norm = (((gray - min) * 255) / range) | 0
            const val = norm < 0 ? 0 : norm > 255 ? 255 : norm
            cd[i] = cd[i + 1] = cd[i + 2] = val
            cd[i + 3] = 255
        }
        res = await scanCanvasOrData(null, contrastData)
        if (res) return res

        const binData = ctx.createImageData(width, height)
        const bd = binData.data
        const thresholds = [(min + max) >> 1, 90, 165]
        for (const th of thresholds) {
            for (let i = 0; i < len; i += 4) {
                const gray = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8
                const val = gray >= th ? 255 : 0
                bd[i] = bd[i + 1] = bd[i + 2] = val
                bd[i + 3] = 255
            }
            res = await scanCanvasOrData(null, binData)
            if (res) return res
        }

        const rotCanvas = document.createElement("canvas")
        const rotCtx = rotCanvas.getContext("2d")
        for (const angle of [90, 180, 270]) {
            const swap = angle === 90 || angle === 270
            rotCanvas.width = swap ? height : width
            rotCanvas.height = swap ? width : height
            rotCtx.translate(rotCanvas.width * 0.5, rotCanvas.height * 0.5)
            rotCtx.rotate((angle * Math.PI) / 180)
            rotCtx.drawImage(canvas, -width * 0.5, -height * 0.5)
            res = await scanCanvasOrData(rotCanvas)
            if (res) return res
        }

        return null
    }

    function processImage(dataUrl, area) {
        const img = new Image()
        img.onload = async () => {
            const scaleX = img.width / window.innerWidth
            const scaleY = img.height / window.innerHeight

            const padX = area.width * 0.15
            const padY = area.height * 0.15
            const paddedLeft = Math.max(0, area.left - padX)
            const paddedTop = Math.max(0, area.top - padY)
            const paddedRight = Math.min(
                window.innerWidth,
                area.left + area.width + padX,
            )
            const paddedBottom = Math.min(
                window.innerHeight,
                area.top + area.height + padY,
            )

            const canvas = document.createElement("canvas")
            const ctx = canvas.getContext("2d")

            const cropX = paddedLeft * scaleX
            const cropY = paddedTop * scaleY
            const cropWidth = (paddedRight - paddedLeft) * scaleX
            const cropHeight = (paddedBottom - paddedTop) * scaleY

            canvas.width = cropWidth
            canvas.height = cropHeight
            ctx.drawImage(
                img,
                cropX,
                cropY,
                cropWidth,
                cropHeight,
                0,
                0,
                cropWidth,
                cropHeight,
            )

            let result = await decodeQRFromCanvas(canvas)

            if (!result) {
                const exactCropX = area.left * scaleX
                const exactCropY = area.top * scaleY
                const exactCropWidth = area.width * scaleX
                const exactCropHeight = area.height * scaleY

                canvas.width = exactCropWidth
                canvas.height = exactCropHeight
                ctx.drawImage(
                    img,
                    exactCropX,
                    exactCropY,
                    exactCropWidth,
                    exactCropHeight,
                    0,
                    0,
                    exactCropWidth,
                    exactCropHeight,
                )

                result = await decodeQRFromCanvas(canvas)
            }

            showResult(result || "No QR code found.")
        }
        img.src = dataUrl
    }

    function showResult(text) {
        const existingPopup = document.querySelector(".qr-result-popup")
        if (existingPopup) {
            document.body.removeChild(existingPopup)
        }

        const popup = document.createElement("div")
        popup.className = "qr-result-popup"

        const title = document.createElement("h3")
        title.innerText = "QR Code Result"
        popup.appendChild(title)

        const content = document.createElement("p")
        content.innerText = text
        popup.appendChild(content)

        const closeBtn = document.createElement("button")
        closeBtn.className = "close-btn"
        closeBtn.innerText = "×"
        closeBtn.onclick = () => {
            if (document.body.contains(popup)) {
                document.body.removeChild(popup)
            }
        }
        popup.appendChild(closeBtn)

        const buttonContainer = document.createElement("div")
        buttonContainer.style.marginTop = "10px"
        buttonContainer.style.display = "flex"
        buttonContainer.style.gap = "10px"
        buttonContainer.style.flexWrap = "wrap"

        if (text !== "No QR code found.") {
            const copyBtn = document.createElement("button")
            copyBtn.innerText = "Copy"
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(text)
                copyBtn.innerText = "Copied!"
                setTimeout(() => (copyBtn.innerText = "Copy"), 2000)
            }
            buttonContainer.appendChild(copyBtn)

            if (text.startsWith("http")) {
                const openBtn = document.createElement("button")
                openBtn.innerText = "Open"
                openBtn.onclick = () => {
                    window.open(text, "_blank")
                }
                buttonContainer.appendChild(openBtn)
            }
        }

        const scanAgainBtn = document.createElement("button")
        scanAgainBtn.innerText = "Scan Again"
        scanAgainBtn.style.background = "#28a745"
        scanAgainBtn.onclick = () => {
            if (document.body.contains(popup)) {
                document.body.removeChild(popup)
            }

            chrome.runtime.sendMessage({ action: "REQUEST_NEW_CAPTURE" })
        }
        buttonContainer.appendChild(scanAgainBtn)

        popup.appendChild(buttonContainer)
        document.body.appendChild(popup)
    }
})()
