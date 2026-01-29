// Helper functions for Google Calendar sync (copied from background.js)

/**
 * Converts schedule day codes to RRULE BYDAY format
 */
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

/**
 * Parses time string like "9:30a" or "10:20a" to { hours, minutes }
 */
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

/**
 * Parses date range like "01/12 - 05/01" to start and end Date objects
 */
function parseDateRange(dateRangeStr) {
    const parts = dateRangeStr.split(' - ');
    if (parts.length !== 2) return null;
    
    const [startPart, endPart] = parts;
    const [startMonth, startDay] = startPart.split('/').map(Number);
    const [endMonth, endDay] = endPart.split('/').map(Number);
    
    const currentYear = new Date().getFullYear();
    let startYear = currentYear;
    let endYear = currentYear;
    
    // Handle year rollover
    if (endMonth < startMonth) {
        endYear = currentYear + 1;
    }
    
    return {
        startDate: new Date(startYear, startMonth - 1, startDay),
        endDate: new Date(endYear, endMonth - 1, endDay)
    };
}

/**
 * Formats date for RRULE UNTIL
 */
function formatUntilDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}T235959Z`;
}

/**
 * Creates a full datetime string in RFC3339 format
 */
function createDateTime(date, time) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(time.hours).padStart(2, '0');
    const minutes = String(time.minutes).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}:00`;
}

/**
 * Finds the first occurrence date that matches one of the specified days
 */
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

/**
 * Generates a deterministic event ID from class attributes
 */
function generateEventId(classItem) {
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
    
    let encoded = '';
    for (let i = 0; i < uniqueStr.length; i++) {
        const charCode = uniqueStr.charCodeAt(i);
        const high = Math.floor(charCode / 32) % 32;
        const low = charCode % 32;
        encoded += toBase32Hex(high) + toBase32Hex(low);
    }
    
    if (encoded.length < 5) {
        encoded = encoded.padEnd(5, '0');
    }
    if (encoded.length > 1024) {
        encoded = encoded.substring(0, 1024);
    }
    
    return encoded;
}

/**
 * Converts a number 0-31 to base32hex character
 */
function toBase32Hex(num) {
    if (num < 10) {
        return String(num);
    }
    return String.fromCharCode('a'.charCodeAt(0) + (num - 10));
}

/**
 * Checks if an event with the given ID already exists
 */
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
            return null;
        }
        
        if (response.ok) {
            const event = await response.json();
            if (event.status === 'cancelled') {
                return null;
            }
            return event;
        }
        
        return null;
    } catch (error) {
        console.error("Error checking if event exists:", error);
        return null;
    }
}

/**
 * Main function to add events to Google Calendar
 */
async function addGoogleCalendar(scheduleData, token) {
    console.log("Adding to Google Calendar");
    console.log("Schedule data:", scheduleData);
    
    const calendarId = "primary";
    const timeZone = "America/Indiana/Indianapolis";
    const results = [];
    
    for (const classItem of scheduleData) {
        try {
            const dateRange = parseDateRange(classItem.dateRange);
            if (!dateRange) {
                console.error("Failed to parse date range:", classItem.dateRange);
                continue;
            }
            
            const startTime = parseTime(classItem.startTime);
            const endTime = parseTime(classItem.endTime);
            if (!startTime || !endTime) {
                console.error("Failed to parse times:", classItem.startTime, classItem.endTime);
                continue;
            }
            
            const eventId = generateEventId(classItem);
            console.log("Generated event ID:", eventId);
            
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
            
            const firstOccurrence = findFirstOccurrence(dateRange.startDate, classItem.days);
            const byDay = parseDaysToRRule(classItem.days);
            const untilDate = formatUntilDate(dateRange.endDate);
            const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${untilDate}`;
            
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
                
                if (response.status === 409) {
                    console.log("Conflict detected, attempting to update:", eventId);
                    
                    const updateResponse = await fetch(
                        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
                        {
                            method: 'PUT',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(event)
                        }
                    );
                    
                    if (updateResponse.ok) {
                        const updatedEvent = await updateResponse.json();
                        console.log("Event updated successfully:", updatedEvent);
                        results.push({ 
                            success: true, 
                            class: event.summary, 
                            eventId: updatedEvent.id,
                            skipped: false,
                            updated: true
                        });
                    } else {
                        const updateError = await updateResponse.json();
                        console.error("Failed to update event:", updateError);
                        results.push({ 
                            success: false, 
                            class: classItem.name, 
                            error: updateError 
                        });
                    }
                } else {
                    results.push({ 
                        success: false, 
                        class: classItem.name, 
                        error: errorData 
                    });
                }
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

// SVG icons
const icons = {
  success: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  warning: '<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  error: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
  check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  skip: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>',
  x: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
};

// Check if we have pending sync data or existing results
chrome.storage.local.get(['pendingSync', 'syncResults'], async function(data) {
  if (data.pendingSync) {
    // We have pending sync data - show loading and process it
    const { scheduleData, token } = data.pendingSync;
    
    // Clear the pending sync data
    chrome.storage.local.remove('pendingSync');
    
    try {
      console.log("Starting sync process...");
      
      // Perform the sync (this will take time)
      const results = await addGoogleCalendar(scheduleData, token);
      console.log("Sync results:", results);
      
      // Display the results
      displayResults(results);
      
    } catch (error) {
      console.error("Error during sync:", error);
      
      // Show error
      const errorMessage = error.message || String(error);
      displayResults([{ 
        success: false, 
        class: 'Google Calendar Sync', 
        error: errorMessage
      }]);
    }
  } else if (data.syncResults) {
    // We have existing results - display them immediately
    const results = data.syncResults;
    
    if (!results || !Array.isArray(results) || results.length === 0) {
      showError('No sync results found. Please try again.');
      return;
    }

    displayResults(results);
  } else {
    // No data at all
    showError('No sync data found. Please try again.');
  }
});

function displayResults(results) {
  const loadingSection = document.getElementById('loading-section');
  const resultsSection = document.getElementById('results-section');
  const statusIcon = document.getElementById('status-icon');
  const statusTitle = document.getElementById('status-title');
  const statusMessage = document.getElementById('status-message');
  const resultsList = document.getElementById('results-list');
  const summaryFailed = document.getElementById('summary-failed');

  // Count results
  const added = results.filter(r => r.success && !r.skipped).length;
  const skipped = results.filter(r => r.success && r.skipped).length;
  const failed = results.filter(r => !r.success).length;
  const total = results.length;

  // Update counts
  document.getElementById('count-added').textContent = added;
  document.getElementById('count-skipped').textContent = skipped;
  document.getElementById('count-failed').textContent = failed;

  // Show failed count if any failures
  if (failed > 0) {
    summaryFailed.style.display = 'block';
  }

  // Determine overall status
  let statusClass, icon, title, message;
  
  if (failed === 0 && added > 0) {
    statusClass = 'success';
    icon = icons.success;
    title = 'Sync Complete!';
    message = `Successfully added ${added} event${added !== 1 ? 's' : ''} to your calendar`;
  } else if (failed === 0 && added === 0 && skipped > 0) {
    statusClass = 'success';
    icon = icons.success;
    title = 'Already Synced';
    message = `All ${skipped} event${skipped !== 1 ? 's' : ''} were already in your calendar`;
  } else if (failed > 0 && (added > 0 || skipped > 0)) {
    statusClass = 'partial';
    icon = icons.warning;
    title = 'Partially Complete';
    message = `${failed} event${failed !== 1 ? 's' : ''} failed to sync`;
  } else {
    statusClass = 'error';
    icon = icons.error;
    title = 'Sync Failed';
    message = 'Unable to add events to your calendar';
  }

  statusIcon.className = 'status-icon ' + statusClass;
  statusIcon.innerHTML = icon;
  statusTitle.textContent = title;
  statusMessage.textContent = message;

  // Build results list
  resultsList.innerHTML = '';
  for (const result of results) {
    const item = document.createElement('div');
    item.className = 'result-item';

    let iconClass, iconSvg, statusText;
    if (result.success && !result.skipped) {
      iconClass = 'added';
      iconSvg = icons.check;
      statusText = 'Added to calendar';
    } else if (result.success && result.skipped) {
      iconClass = 'skipped';
      iconSvg = icons.skip;
      statusText = result.message || 'Already exists';
    } else {
      iconClass = 'failed';
      iconSvg = icons.x;
      statusText = formatErrorMessage(result.error);
    }

    item.innerHTML = `
      <div class="result-icon ${iconClass}">${iconSvg}</div>
      <div class="result-details">
        <div class="result-name">${escapeHtml(result.class || 'Unknown Event')}</div>
        <div class="result-status ${iconClass === 'failed' ? 'failed' : ''}">${escapeHtml(statusText)}</div>
      </div>
    `;

    resultsList.appendChild(item);
  }

  // Show results, hide loading
  loadingSection.classList.add('hidden');
  resultsSection.classList.add('visible');

  // Clear stored results after displaying
  chrome.storage.local.remove('syncResults');
}

function showError(message) {
  const loadingSection = document.getElementById('loading-section');
  const resultsSection = document.getElementById('results-section');
  const statusIcon = document.getElementById('status-icon');
  const statusTitle = document.getElementById('status-title');
  const statusMessage = document.getElementById('status-message');
  const summary = document.getElementById('summary');
  const resultsList = document.getElementById('results-list');

  statusIcon.className = 'status-icon error';
  statusIcon.innerHTML = icons.error;
  statusTitle.textContent = 'Error';
  statusMessage.textContent = message;
  summary.style.display = 'none';
  resultsList.style.display = 'none';

  loadingSection.classList.add('hidden');
  resultsSection.classList.add('visible');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatErrorMessage(error) {
  if (!error) return 'Failed to add';
  
  const errorText = error.message || error.error?.message || String(error);
  
  // Handle OAuth errors
  if (errorText.includes('bad client id')) {
    return 'Invalid OAuth configuration. Please check extension setup.';
  }
  if (errorText.includes('OAuth2')) {
    return 'Authentication failed. Please try again.';
  }
  if (errorText.includes('token')) {
    return 'Authentication token expired. Please try again.';
  }
  
  // Handle API errors
  if (errorText.includes('quota')) {
    return 'Google Calendar API quota exceeded. Try again later.';
  }
  if (errorText.includes('permission')) {
    return 'Missing calendar permissions. Re-authorize the extension.';
  }
  if (errorText.includes('network') || errorText.includes('fetch')) {
    return 'Network error. Check your connection and try again.';
  }
  
  // Default fallback - shorten long technical errors
  if (errorText.length > 80) {
    return 'An error occurred. Check browser console for details.';
  }
  
  return errorText;
}

// Close button handler
document.getElementById('close-btn').addEventListener('click', function() {
  window.close();
});
