chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "DOWNLOAD_ICS") {
      const dataUrl =
        "data:text/calendar;charset=utf-8," +
        encodeURIComponent(msg.icsContent);
  
      chrome.downloads.download({
        url: dataUrl,
        filename: "purdue_schedule.ics",
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
        } else {
          console.log("Download started:", downloadId);
        }
      });
    }
    
    if (msg.action === "openPopupWindow") {
      // Store the source tab ID so the popup knows which tab to read from
      const sourceTabId = sender.tab?.id;
      if (sourceTabId) {
        chrome.storage.local.set({ sourceTabId: sourceTabId });
      }
      
      // Try to open the regular popup
      chrome.action.openPopup().then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        // If that fails, open as a small popup window as fallback
        console.log("Regular popup failed, opening as window:", error);
        const popupUrl = chrome.runtime.getURL('index.html');
        chrome.windows.create({
          url: popupUrl,
          type: 'popup',
          width: 420,
          height: 600,
          focused: true
        }, (window) => {
          if (chrome.runtime.lastError) {
            console.error("Failed to open popup window:", chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true, windowId: window.id });
          }
        });
      });
      return true; // Keep the message channel open for async response
    }
  });
  