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

async function addGoogleCalendar(scheduleData, token) {
    console.log("Adding to Google Calendar v5");
    console.log("Schedule data:", scheduleData);
    
    const calendarId = "primary";
    const timeZone = "America/Indiana/Indianapolis"; // Purdue timezone
    const results = [];
    let prevClassItem = null;
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
            
            // Build the RRULE
            const byDay = parseDaysToRRule(classItem.days);
            const untilDate = formatUntilDate(dateRange.endDate);
            const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${untilDate}`;
            
            // Create the event object
            const event = {
                summary: `${classItem.subject} ${classItem.course} ${classItem.type}`,
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
                results.push({ success: false, class: classItem.summary, error: errorData });
            } else {
                const createdEvent = await response.json();
                console.log("Event created successfully:", createdEvent);
                results.push({ success: true, class: event.summary, eventId: createdEvent.id });
            }
        } catch (error) {
            console.error("Error creating event for class:", classItem, error);
            results.push({ success: false, class: `${classItem.subject} ${classItem.course}`, error: error.message });
        }
    }
    
    return results;
}
