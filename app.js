pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Elements
const fileInput = document.getElementById('file-upload');
const loader = document.getElementById('loader');
const progressBar = document.getElementById('progress-bar');
const viewStage = document.getElementById('view-stage');
const settingsToggle = document.getElementById('settings-toggle');
const settingsMenu = document.getElementById('settings-menu');

// State
let extractedParagraphs = [];
let virtualPages = []; // Holds arrays of paragraphs for each page
let currentPageIndex = 0;
let currentFontSize = 18;

// --- 1. Settings Menu Fixes ---
settingsToggle.addEventListener('click', (e) => {
    e.stopPropagation(); // Stop click from reaching the document
    settingsMenu.classList.toggle('hidden');
});

// Click outside to close menu
document.addEventListener('click', (e) => {
    if (!settingsMenu.contains(e.target) && !settingsToggle.contains(e.target)) {
        settingsMenu.classList.add('hidden');
    }
});

// --- 2. PDF Upload & Extraction ---
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;
    const reader = new FileReader();
    reader.onload = () => loadAndExtractPDF(new Uint8Array(reader.result));
    reader.readAsArrayBuffer(file);
});

async function loadAndExtractPDF(data) {
    loader.classList.remove('hidden');
    extractedParagraphs = [];
    
    try {
        const pdf = await pdfjsLib.getDocument(data).promise;
        let currentP = '';
        let lastY = -1;

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            textContent.items.forEach(item => {
                const currentY = item.transform[5];
                if (lastY !== -1 && Math.abs(lastY - currentY) > 12) {
                    if (currentP.trim().length > 0) extractedParagraphs.push(currentP.trim());
                    currentP = '';
                }
                currentP += item.str + ' ';
                lastY = currentY;
            });
        }
        if (currentP.trim().length > 0) extractedParagraphs.push(currentP.trim());

        currentPageIndex = 0;
        paginateVirtually(); // Run the pagination engine

    } catch (error) {
        console.error("PDF Read Error:", error);
        alert("Error reading PDF. It might be an image-only scan.");
    }
    loader.classList.add('hidden');
}


// --- 3. The Virtual Pagination Engine (Fast Sentence Splitting) ---
function paginateVirtually() {
    if (extractedParagraphs.length === 0) return;

    if (document.body.classList.contains('mode-vertical')) {
        const curr = document.getElementById('curr-page');
        curr.innerHTML = extractedParagraphs.map(text => `<p>${text}</p>`).join('');
        viewStage.addEventListener('scroll', updateProgress);
        updateProgress();
        return;
    }

    viewStage.removeEventListener('scroll', updateProgress);
    
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: ${viewStage.clientWidth}px;
        padding: 25px;
        visibility: hidden;
        z-index: -1000;
        height: auto; 
        box-sizing: border-box;
    `;
    document.body.appendChild(tempDiv);

    virtualPages = [];
    let currentPageContent = [];
    const maxHeight = viewStage.clientHeight;

    extractedParagraphs.forEach(text => {
        const p = document.createElement('p');
        p.textContent = text;
        tempDiv.appendChild(p);

        if (tempDiv.clientHeight <= maxHeight) {
            // Fast Path: Entire paragraph fits perfectly
            currentPageContent.push(`<p>${text}</p>`);
        } else {
            // OVERFLOW DETECTED: Split by sentences instead of words for massive performance boost
            tempDiv.removeChild(p);
            
            // Regex splits by . ! or ? and keeps the punctuation attached to the sentence
            const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [text];
            
            let currentText = '';
            let splitP = document.createElement('p');
            tempDiv.appendChild(splitP);

            for (let i = 0; i < sentences.length; i++) {
                const sentence = sentences[i].trim();
                if (!sentence) continue;

                const testText = currentText + (currentText ? ' ' : '') + sentence;
                splitP.textContent = testText;

                if (tempDiv.clientHeight > maxHeight) {
                    // This sentence caused the overflow
                    splitP.textContent = currentText;
                    
                    if (currentText.trim()) {
                        // Push what we have so far
                        currentPageContent.push(`<p style="margin-bottom: 0;">${currentText}</p>`);
                    }
                    
                    if (currentPageContent.length > 0) {
                        virtualPages.push([...currentPageContent]);
                    }
                    
                    // Start fresh page
                    currentPageContent = [];
                    tempDiv.innerHTML = ''; 
                    
                    splitP = document.createElement('p');
                    tempDiv.appendChild(splitP);
                    
                    // The sentence that broke the layout becomes the start of the next page
                    currentText = sentence;
                    splitP.textContent = currentText;
                } else {
                    // Sentence fits perfectly, keep building
                    currentText = testText;
                }
            }
            
            // Push the final remaining sentences of the paragraph
            if (currentText.trim()) {
                currentPageContent.push(`<p>${currentText}</p>`);
            }
        }
    });
    
    if (currentPageContent.length > 0) virtualPages.push(currentPageContent);
    document.body.removeChild(tempDiv);
    
    if (currentPageIndex >= virtualPages.length) {
        currentPageIndex = Math.max(0, virtualPages.length - 1);
    }

    renderVirtualPages();
}

function renderVirtualPages() {
    const prev = document.getElementById('prev-page');
    const curr = document.getElementById('curr-page');
    const next = document.getElementById('next-page');

    if (virtualPages.length === 0) return;

    // Notice we removed the .map wrapper here because we are now 
    // pushing pre-formatted HTML strings during the measuring phase.
    curr.innerHTML = virtualPages[currentPageIndex].join('');
    
    if (currentPageIndex > 0) {
        prev.innerHTML = virtualPages[currentPageIndex - 1].join('');
    } else {
        prev.innerHTML = '';
    }
    
    if (currentPageIndex < virtualPages.length - 1) {
        next.innerHTML = virtualPages[currentPageIndex + 1].join('');
    } else {
        next.innerHTML = '';
    }
    
    updateProgress();
}

// --- 4. Animation & Navigation Logic ---
function goToNextPage() {
    if (currentPageIndex < virtualPages.length - 1) {
        const next = document.getElementById('next-page');
        next.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        next.style.transform = "translate3d(0, 0, 0)"; // Next page slides in OVER current
        
        setTimeout(() => {
            currentPageIndex++;
            resetSlides();
        }, 300);
    }
}

function goToPrevPage() {
    if (currentPageIndex > 0) {
        const curr = document.getElementById('curr-page');
        curr.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        curr.style.transform = "translate3d(100%, 0, 0)"; // Current page slides AWAY to reveal prev
        
        setTimeout(() => {
            currentPageIndex--;
            resetSlides();
        }, 300);
    }
}

function resetSlides() {
    const slides = [document.getElementById('prev-page'), document.getElementById('curr-page'), document.getElementById('next-page')];
    
    // Disable transitions for instant reset
    slides.forEach(s => s.style.transition = 'none');
    
    renderVirtualPages();
    
    // Reset Hardware transforms back to starting state
    slides[0].style.transform = "translate3d(0, 0, 0)"; // Prev stays hidden underneath
    slides[1].style.transform = "translate3d(0, 0, 0)"; // Curr is visible
    slides[2].style.transform = "translate3d(100%, 0, 0)"; // Next waits on the right
}

// Keyboard Listeners
document.addEventListener('keydown', (e) => {
    if (document.body.classList.contains('mode-stack') && virtualPages.length > 0) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') goToNextPage();
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goToPrevPage();
    }
});

// Mobile Touch Listeners (Stage only, not whole document)
let startX = 0;
viewStage.addEventListener('touchstart', e => startX = e.touches[0].clientX);
viewStage.addEventListener('touchend', e => {
    if (document.body.classList.contains('mode-vertical')) return;
    
    const diff = e.changedTouches[0].clientX - startX;
    const threshold = window.innerWidth * 0.15; // 15% screen swipe to trigger
    
    if (diff < -threshold) goToNextPage(); // Swiped Left
    else if (diff > threshold) goToPrevPage(); // Swiped Right
});


// --- 5. UI Control Utilities ---
function setTheme(themeClass, clickedBtn) {
    document.body.className = document.body.className.replace(/theme-\w+/, themeClass);
    if (clickedBtn) {
        clickedBtn.parentElement.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
        clickedBtn.classList.add('active');
    }
}

function setMode(modeClass, clickedBtn) {
    document.body.className = document.body.className.replace(/mode-\w+/, modeClass);
    if (clickedBtn) {
        clickedBtn.parentElement.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
        clickedBtn.classList.add('active');
    }
    loader.classList.remove('hidden');
    setTimeout(() => {
        paginateVirtually(); 
        loader.classList.add('hidden');
    }, 50);
}

function changeFontSize(change) {
    currentFontSize += change;
    // Set min and max limits
    if(currentFontSize < 12) currentFontSize = 12;
    if(currentFontSize > 32) currentFontSize = 32;

    document.documentElement.style.setProperty('--font-size', `${currentFontSize}px`);
    
    // Important: Re-measure the book because font sizes changed the paragraph heights!
    if(extractedParagraphs.length > 0 && document.body.classList.contains('mode-stack')) {
        loader.classList.remove('hidden');
        setTimeout(() => {
            paginateVirtually();
            loader.classList.add('hidden');
        }, 100); 
    }
}

function updateProgress() {
    let percentage = 0;
    if (document.body.classList.contains('mode-stack')) {
        if (virtualPages.length > 1) {
            percentage = (currentPageIndex / (virtualPages.length - 1)) * 100;
        }
    } else {
        const maxScroll = viewStage.scrollHeight - viewStage.clientHeight;
        if (maxScroll > 0) percentage = (viewStage.scrollTop / maxScroll) * 100;
        else percentage = 100;
    }
    progressBar.style.width = `${percentage}%`;
}