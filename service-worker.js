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
    
    if (msg.action === "openPopup") {
      // Open the extension popup by opening the popup page in the current tab
      chrome.action.openPopup().catch((error) => {
        // If openPopup fails (it often does due to user gesture requirements),
        // we can't programmatically open the popup, but we can notify the user
        console.log("Auto-popup attempted:", error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep the message channel open for async response
    }
  });
  