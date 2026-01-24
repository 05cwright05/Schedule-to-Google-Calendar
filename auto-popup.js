// This script runs automatically when the user visits the Purdue timetabling page
// It sends a message to the background script to open the extension popup

// Wait a moment for the page to fully load
setTimeout(() => {
    // Send message to background script to open the popup
    chrome.runtime.sendMessage({ action: 'openPopup' }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('Could not open popup automatically:', chrome.runtime.lastError.message);
        }
    });
}, 500);
