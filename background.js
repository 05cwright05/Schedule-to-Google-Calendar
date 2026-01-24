// // Source - https://stackoverflow.com/a
// // Posted by gkalpak, modified by community. See post 'Timeline' for change history
// // Retrieved 2026-01-20, License - CC BY-SA 3.0

// // Regex-pattern to check URLs against. 
// // It matches URLs like: http[s]://[...]stackoverflow.com[...]
// var urlRegex = /^https?:\/\/(?:[^./?#]+\.)?stackoverflow\.com/;

// // A function to use as callback
// function doStuffWithDom(domContent) {
//     console.log('I received the following DOM content:\n' + domContent);
// }

// // When the browser-action button is clicked...
// chrome.browserAction.onClicked.addListener(function (tab) {
//     // ...check the URL of the active tab against our pattern and...
//     if (urlRegex.test(tab.url)) {
//         // ...if it matches, send a message specifying a callback too
//         chrome.tabs.sendMessage(tab.id, {text: 'report_back'}, doStuffWithDom);
//     }
// });

/**
 * Converts schedule day codes to RRULE BYDAY format
 * M=Monday, T=Tuesday, W=Wednesday, R=Thursday, F=Friday
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
 * Assumes current year for start, handles year rollover
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
    
    // Handle year rollover (e.g., starts in August, ends in May next year)
    if (endMonth < startMonth) {
        endYear = currentYear + 1;
    }
    
    return {
        startDate: new Date(startYear, startMonth - 1, startDay),
        endDate: new Date(endYear, endMonth - 1, endDay)
    };
}

/**
 * Formats date for RRULE UNTIL (e.g., "20260501T235959Z")
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
 * Generates a deterministic event ID from class attributes.
 * Google Calendar event IDs must be 5-1024 chars, using only base32hex (a-v, 0-9).
 * We convert the combined string to a simple hash-like encoding.
 */
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
    // Simple encoding: convert each char code to base32hex representation
    let encoded = '';
    for (let i = 0; i < uniqueStr.length; i++) {
        const charCode = uniqueStr.charCodeAt(i);
        // Convert to base 32 and map to valid chars (0-9 = 0-9, 10-31 = a-v)
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

/**
 * Converts a number 0-31 to base32hex character (0-9, a-v)
 */
function toBase32Hex(num) {
    if (num < 10) {
        return String(num);
    }
    return String.fromCharCode('a'.charCodeAt(0) + (num - 10));
}

/**
 * Checks if an event with the given ID already exists in the calendar.
 * Returns the event if found, null if not found (404).
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
            return null; // Event doesn't exist
        }
        
        if (response.ok) {
            return await response.json(); // Event exists
        }
        
        // Other error - log it but treat as "doesn't exist" to allow creation attempt
        console.warn("Unexpected response checking event:", response.status);
        return null;
    } catch (error) {
        console.error("Error checking if event exists:", error);
        return null;
    }
}
/**
 * Formats date for ICS file format (YYYYMMDD)
 */
function formatICSDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

/**
 * Formats datetime for ICS file format (YYYYMMDDTHHMMSS)
 */
function formatICSDateTime(date, time) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(time.hours).padStart(2, '0');
    const minutes = String(time.minutes).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}00`;
}

/**
 * Escapes special characters for ICS file format
 */
function escapeICSText(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

/**
 * Creates an ICS file from schedule data and triggers download
 */
function createICSFile(scheduleData) {
    console.log("Creating ICS file");
    console.log(scheduleData);
    
    const timeZone = "America/Indiana/Indianapolis"; // Purdue timezone
    
    // Start building the ICS file
    let icsContent = 'BEGIN:VCALENDAR\r\n';
    icsContent += 'VERSION:2.0\r\n';
    icsContent += 'PRODID:-//Purdue Schedule//EN\r\n';
    icsContent += 'CALSCALE:GREGORIAN\r\n';
    icsContent += 'METHOD:PUBLISH\r\n';
    icsContent += `X-WR-TIMEZONE:${timeZone}\r\n`;
    
    // Add timezone component
    icsContent += 'BEGIN:VTIMEZONE\r\n';
    icsContent += `TZID:${timeZone}\r\n`;
    icsContent += 'BEGIN:STANDARD\r\n';
    icsContent += 'DTSTART:20231105T020000\r\n';
    icsContent += 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\n';
    icsContent += 'TZOFFSETFROM:-0400\r\n';
    icsContent += 'TZOFFSETTO:-0500\r\n';
    icsContent += 'END:STANDARD\r\n';
    icsContent += 'BEGIN:DAYLIGHT\r\n';
    icsContent += 'DTSTART:20240310T020000\r\n';
    icsContent += 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\n';
    icsContent += 'TZOFFSETFROM:-0500\r\n';
    icsContent += 'TZOFFSETTO:-0400\r\n';
    icsContent += 'END:DAYLIGHT\r\n';
    icsContent += 'END:VTIMEZONE\r\n';
    
    // Process each class
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
            
            // Find the first occurrence that matches the schedule days
            const firstOccurrence = findFirstOccurrence(dateRange.startDate, classItem.days);
            
            // Build the RRULE for ICS format
            const byDay = parseDaysToRRule(classItem.days);
            const untilDate = formatICSDate(dateRange.endDate) + 'T235959';
            
            // Generate unique ID for the event
            const eventId = generateEventId(classItem);
            
            // Add event to ICS content
            icsContent += 'BEGIN:VEVENT\r\n';
            icsContent += `UID:${eventId}@purdue-schedule\r\n`;
            icsContent += `DTSTAMP:${formatICSDateTime(new Date(), { hours: 0, minutes: 0 })}\r\n`;
            icsContent += `DTSTART;TZID=${timeZone}:${formatICSDateTime(firstOccurrence, startTime)}\r\n`;
            icsContent += `DTEND;TZID=${timeZone}:${formatICSDateTime(firstOccurrence, endTime)}\r\n`;
            icsContent += `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${untilDate}\r\n`;
            icsContent += `SUMMARY:${escapeICSText(classItem.name)}\r\n`;
            icsContent += `LOCATION:${escapeICSText(classItem.room)}\r\n`;
            icsContent += `DESCRIPTION:CRN: ${escapeICSText(classItem.crn)}\r\n`;
            icsContent += 'STATUS:CONFIRMED\r\n';
            icsContent += 'END:VEVENT\r\n';
            
            console.log("Added event to ICS:", classItem.name);
        } catch (error) {
            console.error("Error processing class for ICS:", classItem, error);
        }
    }
    
    // Close the calendar
    icsContent += 'END:VCALENDAR\r\n';
    chrome.runtime.sendMessage({
        type: "DOWNLOAD_ICS",
        icsContent
      });
    
    // // Create a blob and trigger download
    // const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    // const url = URL.createObjectURL(blob);
    
    // // Create a download link and click it
    // chrome.downloads.download({
    //     url: url,
    //     filename: 'purdue_schedule.ics',
    //     saveAs: true
    // }, (downloadId) => {
    //     if (chrome.runtime.lastError) {
    //         console.error("Download failed:", chrome.runtime.lastError);
    //     } else {
    //         console.log("ICS file download started:", downloadId);
    //     }
    //     // Clean up the URL after a short delay
    //     setTimeout(() => URL.revokeObjectURL(url), 1000);
    // });
    
    // console.log("ICS file created and download triggered");
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
