window.onload = function() {
    document.querySelector('#add-google').addEventListener('click', function() {
      chrome.identity.getAuthToken({interactive: true}, function(token) {
        if (chrome.runtime.lastError) {
          console.error("Authentication failed:", chrome.runtime.lastError);
          chrome.notifications.create('auth-error', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Authentication Failed',
            message: 'Could not authenticate with Google Calendar',
            priority: 2
          });
          return;
        }
        
        console.log("Token received, sending to background script");
        
        // Send message to service worker to handle the sync
        chrome.runtime.sendMessage({
          type: 'ADD_TO_GOOGLE_CALENDAR',
          scheduleData: scheduleData,
          token: token
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.error("Failed to send message:", chrome.runtime.lastError);
          } else {
            console.log("Message sent successfully:", response);
          }
        });
      });
    });
  };