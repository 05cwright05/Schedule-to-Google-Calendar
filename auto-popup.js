// This script runs automatically when the user visits the Purdue timetabling page
// It injects a floating button with the extension logo that opens the popup when clicked

(function() {
    // Prevent duplicate injection
    if (document.getElementById('purdue-calendar-ext-btn')) return;

    // Create the floating button container
    const floatingBtn = document.createElement('div');
    floatingBtn.id = 'purdue-calendar-ext-btn';
    
    // Create the logo image
    const logo = document.createElement('img');
    logo.src = chrome.runtime.getURL('logo-removebg-preview.png');
    logo.alt = 'Purdue Calendar Extension';
    
    // Style the floating button
    floatingBtn.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 64px;
        height: 64px;
        border-radius: 12px;
        cursor: pointer;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
    `;
    
    // Style the logo image
    logo.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: 12px;
    `;
    
    // Hover effects
    floatingBtn.addEventListener('mouseenter', () => {
        floatingBtn.style.transform = 'scale(1.1)';
        floatingBtn.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
    });
    
    floatingBtn.addEventListener('mouseleave', () => {
        floatingBtn.style.transform = 'scale(1)';
        floatingBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    });
    
    // Click handler - opens the extension popup
    floatingBtn.addEventListener('click', () => {
        // Check if extension context is still valid
        if (!chrome.runtime?.id) {
            console.log('Extension context invalidated. Please refresh the page.');
            // Remove the old button and let the page be refreshed
            floatingBtn.remove();
            return;
        }
        
        try {
            chrome.runtime.sendMessage({ action: 'openPopupWindow' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('Could not open popup:', chrome.runtime.lastError.message);
                    // If extension was reloaded, suggest refresh
                    if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                        console.log('Please refresh the page to use the updated extension.');
                    }
                }
            });
        } catch (error) {
            console.log('Extension error:', error.message);
            floatingBtn.remove();
        }
    });
    
    floatingBtn.appendChild(logo);
    document.body.appendChild(floatingBtn);
})();
