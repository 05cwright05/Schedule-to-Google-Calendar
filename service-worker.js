chrome.runtime.onMessage.addListener((msg) => {
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
  });
  