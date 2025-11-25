(function() {

    if (!window.qrListenerAdded) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "PROCESS_IMAGE") {
                processImage(request.dataUrl, request.area);
            } else if (request.action === "START_SELECTION") {
                startSelection(request.screenshotDataUrl);
            }
        });
        window.qrListenerAdded = true;
    }

    if (window.qrSelectionActive) {
        const existingOverlay = document.querySelector('.qr-selection-overlay');
        if (existingOverlay) {
            if (existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay);
            }
        }
    }

    window.qrSelectionActive = true;

    let startX, startY, endX, endY;
    let overlay, selectionBox, freezeImage;

    function startSelection(screenshotDataUrl) {
        createOverlay(screenshotDataUrl);
    }

    function createOverlay(screenshotDataUrl) {
        overlay = document.createElement('div');
        overlay.className = 'qr-selection-overlay';
        
        // If freeze mode and screenshot provided, show frozen screen
        if (screenshotDataUrl) {
            freezeImage = document.createElement('img');
            freezeImage.src = screenshotDataUrl;
            freezeImage.className = 'qr-freeze-image';
            overlay.appendChild(freezeImage);
        }
        
        document.body.appendChild(overlay);

        // Instruction text
        const instructionText = document.createElement('div');
        instructionText.className = 'qr-instruction-text';
        instructionText.innerText = 'Drag to Scan QR Code';
        overlay.appendChild(instructionText);

        const closeBtn = document.createElement('div');
        closeBtn.innerText = '×';
        closeBtn.className = 'qr-close-btn';
        closeBtn.onclick = removeOverlay;
        overlay.appendChild(closeBtn);

        selectionBox = document.createElement('div');
        selectionBox.className = 'qr-selection-box';
        selectionBox.style.display = 'none';
        overlay.appendChild(selectionBox);

        overlay.addEventListener('mousedown', onMouseDown);
    }


    function removeOverlay() {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        window.qrSelectionActive = false;
    }

    function onMouseDown(e) {
        if (e.target.className === 'qr-close-btn') return; 

        e.preventDefault();
        startX = e.clientX;
        startY = e.clientY;
        endX = startX;
        endY = startY;
        
        selectionBox.style.left = startX + 'px';
        selectionBox.style.top = startY + 'px';
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        selectionBox.style.display = 'block';

        overlay.addEventListener('mousemove', onMouseMove);
        overlay.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
        e.preventDefault();
        endX = e.clientX;
        endY = e.clientY;

        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        selectionBox.style.left = left + 'px';
        selectionBox.style.top = top + 'px';
        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';
    }

    function onMouseUp(e) {
        overlay.removeEventListener('mousemove', onMouseMove);
        overlay.removeEventListener('mouseup', onMouseUp);
        
        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        if (width < 10 || height < 10) {
            removeOverlay();
            return;
        }

        // Always use freeze mode - process screenshot directly
        if (freezeImage) {
            const screenshotDataUrl = freezeImage.src;
            removeOverlay();
            processImage(screenshotDataUrl, { left, top, width, height });
        }
    }

    function processImage(dataUrl, area) {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            const scale = img.width / window.innerWidth; 

            const cropX = area.left * scale;
            const cropY = area.top * scale;
            const cropWidth = area.width * scale;
            const cropHeight = area.height * scale;

            canvas.width = cropWidth;
            canvas.height = cropHeight;

            ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

            const imageData = ctx.getImageData(0, 0, cropWidth, cropHeight);
            
            // jsQR usage
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
                showResult(code.data);
            } else {
                showResult("No QR code found.");
            }
        };
        img.src = dataUrl;
    }

    function showResult(text) {
        const existingPopup = document.querySelector('.qr-result-popup');
        if (existingPopup) {
            document.body.removeChild(existingPopup);
        }

        const popup = document.createElement('div');
        popup.className = 'qr-result-popup';
        
        const title = document.createElement('h3');
        title.innerText = 'QR Code Result';
        popup.appendChild(title);

        const content = document.createElement('p');
        content.innerText = text;
        popup.appendChild(content);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.innerText = '×';
        closeBtn.onclick = () => {
            if (document.body.contains(popup)) {
                document.body.removeChild(popup);
            }
        };
        popup.appendChild(closeBtn);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '10px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.flexWrap = 'wrap';

        if (text !== "No QR code found.") {
            const copyBtn = document.createElement('button');
            copyBtn.innerText = 'Copy';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(text);
                copyBtn.innerText = 'Copied!';
                setTimeout(() => copyBtn.innerText = 'Copy', 2000);
            };
            buttonContainer.appendChild(copyBtn);
            
            if (text.startsWith('http')) {
                 const openBtn = document.createElement('button');
                 openBtn.innerText = 'Open';
                 openBtn.onclick = () => {
                     window.open(text, '_blank');
                 };
                 buttonContainer.appendChild(openBtn);
            }
        }

        // Add "Scan Again" button
        const scanAgainBtn = document.createElement('button');
        scanAgainBtn.innerText = 'Scan Again';
        scanAgainBtn.style.background = '#28a745';
        scanAgainBtn.onclick = () => {
            if (document.body.contains(popup)) {
                document.body.removeChild(popup);
            }
            
            // Always capture new screenshot for next scan
            chrome.runtime.sendMessage({ action: "REQUEST_NEW_CAPTURE" });
        };
        buttonContainer.appendChild(scanAgainBtn);

        popup.appendChild(buttonContainer);
        document.body.appendChild(popup);
    }
})();
