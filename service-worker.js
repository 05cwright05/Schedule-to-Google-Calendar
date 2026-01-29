let lastPopupAttemptAt = 0;
let popupAttemptInFlight = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "DOWNLOAD_ICS") {
    const dataUrl =
      "data:text/calendar;charset=utf-8," + encodeURIComponent(msg.icsContent);

    chrome.downloads.download(
      {
        url: dataUrl,
        filename: "purdue_schedule.ics",
        saveAs: true,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
        } else {
          console.log("Download started:", downloadId);
        }
      }
    );
  }

  if (msg.action === "openPopupWindow") {
    // Avoid back-to-back attempts that can trigger "fallback window" behavior.
    const now = Date.now();
    if (popupAttemptInFlight || now - lastPopupAttemptAt < 300) {
      sendResponse({ success: true, ignored: true });
      return;
    }
    lastPopupAttemptAt = now;
    popupAttemptInFlight = true;

    // Open the standard extension action popup only.
    chrome.action
      .openPopup()
      .then(() => {
        popupAttemptInFlight = false;
        sendResponse({ success: true });
      })
      .catch((error) => {
        popupAttemptInFlight = false;

        // Some Chrome builds reject if a popup is already open / just closed.
        // In that case, do NOT open a separate window—just no-op.
        const msgText = String(error?.message || error || "");
        if (/already\s+open|popup.*open/i.test(msgText)) {
          sendResponse({ success: true, ignored: true });
          return;
        }

        console.log("Regular popup failed (no fallback window):", error);
        sendResponse({ success: false, error: msgText });
      });

    return true; // Keep the message channel open for async response
  }
});
  