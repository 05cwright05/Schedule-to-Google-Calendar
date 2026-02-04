window.onload = function() {
    document.querySelector('#add-google').addEventListener('click', async function() {
      try {
        // Get the auth token
        const token = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken({interactive: true}, function(token) {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(token);
            }
          });
        });

        console.log("Token received, opening results page...");

        // Store schedule data and token for the results page to process
        await chrome.storage.local.set({ 
          pendingSync: {
            scheduleData: scheduleData,
            token: token
          }
        });

        // Open the result page in a new tab immediately
        window.open(chrome.runtime.getURL('result.html'));

        // Close the popup after a short delay to allow the tab to open
        setTimeout(() => {
          window.close();
        }, 100);

      } catch (error) {
        console.error("Error during Google Calendar sync:", error);
        
        // Parse and simplify error message
        let errorMessage = error.message || String(error);
        
        // Store error result
        await chrome.storage.local.set({ 
          syncResults: [{ 
            success: false, 
            class: 'Google Calendar Sync', 
            error: errorMessage
          }]
        });

        // Open the result page to show error
        window.open(chrome.runtime.getURL('result.html'));
        
        setTimeout(() => {
          window.close();
        }, 100);
      }
    });
  };
