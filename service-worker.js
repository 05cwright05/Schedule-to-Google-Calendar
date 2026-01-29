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

  if (msg.type === "ADD_TO_GOOGLE_CALENDAR") {
    // Handle Google Calendar sync in background
    handleGoogleCalendarSync(msg.scheduleData, msg.token);
    sendResponse({ success: true });
    return true;
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

// ========== Google Calendar Functions ==========

async function handleGoogleCalendarSync(scheduleData, token) {
  console.log("Starting Google Calendar sync in background");
  
  // Show initial notification
  chrome.notifications.create('sync-start', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Syncing to Google Calendar',
    message: `Adding ${scheduleData.length} classes to your calendar...`,
    priority: 2
  });

  try {
    const results = await addGoogleCalendar(scheduleData, token);
    
    // Count successes and skips
    const added = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.success && r.skipped).length;
    const failed = results.filter(r => !r.success).length;
    
    // Show success notification
    let message = '';
    if (added > 0) {
      message += `✓ ${added} class${added !== 1 ? 'es' : ''} added`;
    }
    if (skipped > 0) {
      message += `${added > 0 ? '\n' : ''}↷ ${skipped} already existed`;
    }
    if (failed > 0) {
      message += `${(added > 0 || skipped > 0) ? '\n' : ''}✗ ${failed} failed`;
    }
    
    chrome.notifications.create('sync-complete', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: failed > 0 ? 'Sync Completed with Errors' : 'Successfully Synced!',
      message: message || 'All classes processed',
      priority: 2
    });
    
    console.log("Google Calendar sync complete:", results);
  } catch (error) {
    console.error("Google Calendar sync failed:", error);
    
    // Show error notification
    chrome.notifications.create('sync-error', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Sync Failed',
      message: `Error: ${error.message || 'Unknown error occurred'}`,
      priority: 2
    });
  }
}

async function addGoogleCalendar(scheduleData, token) {
    console.log("Adding to Google Calendar v6 (with duplicate check)");
    console.log("Schedule data:", scheduleData);
    
    const calendarId = "primary";
    const timeZone = "America/Indiana/Indianapolis"; // Purdue timezone
    const results = [];
    
    for (const classItem of scheduleData) {
        try {
            // Parse the date range
            const dateRange = parseDateRange(classItem.dateRange);
            if (!dateRange) {
                console.error("Failed to parse date range:", classItem.dateRange);
                continue;
            }
            
            // Parse start and end times
            const startTime = parseTime(classItem.startTime);
            const endTime = parseTime(classItem.endTime);
            if (!startTime || !endTime) {
                console.error("Failed to parse times:", classItem.startTime, classItem.endTime);
                continue;
            }
            
            // Generate deterministic event ID from class attributes
            const eventId = generateEventId(classItem);
            console.log("Generated event ID:", eventId);
            
            // Check if event already exists
            const existingEvent = await checkEventExists(calendarId, eventId, token);
            if (existingEvent) {
                console.log("Event already exists, skipping:", existingEvent.summary);
                results.push({ 
                    success: true, 
                    class: classItem.name, 
                    eventId: eventId,
                    skipped: true,
                    message: "Event already exists"
                });
                continue;
            }
            
            // Find the first occurrence that matches the schedule days
            const firstOccurrence = findFirstOccurrence(dateRange.startDate, classItem.days);
            
            // Build the RRULE
            const byDay = parseDaysToRRule(classItem.days);
            const untilDate = formatUntilDate(dateRange.endDate);
            const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${untilDate}`;
            
            // Create the event object with deterministic ID
            const event = {
                id: eventId,
                summary: classItem.name,
                location: classItem.room,
                start: {
                    dateTime: createDateTime(firstOccurrence, startTime),
                    timeZone: timeZone
                },
                end: {
                    dateTime: createDateTime(firstOccurrence, endTime),
                    timeZone: timeZone
                },
                recurrence: [rrule]
            };
            
            console.log("Creating event:", event);
            
            // Make the API request
            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(event)
                }
            );
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error("Failed to create event:", errorData);
                results.push({ 
                    success: false, 
                    class: classItem.name, 
                    error: errorData 
                });
            } else {
                const createdEvent = await response.json();
                console.log("Event created successfully:", createdEvent);
                results.push({ 
                    success: true, 
                    class: event.summary, 
                    eventId: createdEvent.id,
                    skipped: false
                });
            }
        } catch (error) {
            console.error("Error creating event for class:", classItem, error);
            results.push({ 
                success: false, 
                class: classItem.name, 
                error: error.message 
            });
        }
    }
    
    return results;
}

// Helper functions
function parseDaysToRRule(days) {
    const dayMap = {
        'M': 'MO',
        'T': 'TU',
        'W': 'WE',
        'R': 'TH',
        'F': 'FR',
        'S': 'SA',
        'U': 'SU'
    };
    return days.split('').map(d => dayMap[d]).filter(Boolean).join(',');
}

function parseTime(timeStr) {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})([ap])$/i);
    if (!match) return null;
    
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toLowerCase();
    
    if (period === 'p' && hours !== 12) {
        hours += 12;
    } else if (period === 'a' && hours === 12) {
        hours = 0;
    }
    
    return { hours, minutes };
}

function parseDateRange(dateRangeStr) {
    const parts = dateRangeStr.split(' - ');
    if (parts.length !== 2) return null;
    
    const [startPart, endPart] = parts;
    const [startMonth, startDay] = startPart.split('/').map(Number);
    const [endMonth, endDay] = endPart.split('/').map(Number);
    
    const currentYear = new Date().getFullYear();
    let startYear = currentYear;
    let endYear = currentYear;
    
    // Handle year rollover (e.g., starts in August, ends in May next year)
    if (endMonth < startMonth) {
        endYear = currentYear + 1;
    }
    
    return {
        startDate: new Date(startYear, startMonth - 1, startDay),
        endDate: new Date(endYear, endMonth - 1, endDay)
    };
}

function formatUntilDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}T235959Z`;
}

function createDateTime(date, time) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(time.hours).padStart(2, '0');
    const minutes = String(time.minutes).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}:00`;
}

function findFirstOccurrence(startDate, days) {
    const dayMap = { 'M': 1, 'T': 2, 'W': 3, 'R': 4, 'F': 5, 'S': 6, 'U': 0 };
    const targetDays = days.split('').map(d => dayMap[d]).filter(d => d !== undefined);
    
    const date = new Date(startDate);
    // Find the first day that matches one of the schedule days
    for (let i = 0; i < 7; i++) {
        if (targetDays.includes(date.getDay())) {
            return date;
        }
        date.setDate(date.getDate() + 1);
    }
    return startDate;
}

function generateEventId(classItem) {
    // Combine key attributes into a unique string
    const uniqueStr = [
        classItem.subject,
        classItem.course,
        classItem.type,
        classItem.crn,
        classItem.days,
        classItem.startTime,
        classItem.endTime,
        classItem.dateRange,
        classItem.room
    ].join('|').toLowerCase();
    
    // Convert to base32hex-compatible characters (a-v, 0-9)
    let encoded = '';
    for (let i = 0; i < uniqueStr.length; i++) {
        const charCode = uniqueStr.charCodeAt(i);
        const high = Math.floor(charCode / 32) % 32;
        const low = charCode % 32;
        encoded += toBase32Hex(high) + toBase32Hex(low);
    }
    
    // Ensure minimum length of 5 and max of 1024
    if (encoded.length < 5) {
        encoded = encoded.padEnd(5, '0');
    }
    if (encoded.length > 1024) {
        encoded = encoded.substring(0, 1024);
    }
    
    return encoded;
}

function toBase32Hex(num) {
    if (num < 10) {
        return String(num);
    }
    return String.fromCharCode('a'.charCodeAt(0) + (num - 10));
}

async function checkEventExists(calendarId, eventId, token) {
    try {
        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        
        if (response.status === 404) {
            return null; // Event doesn't exist
        }
        
        if (response.ok) {
            return await response.json(); // Event exists
        }
        
        console.warn("Unexpected response checking event:", response.status);
        return null;
    } catch (error) {
        console.error("Error checking if event exists:", error);
        return null;
    }
}
  