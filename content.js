// Store schedule data globally for access by calendar functions
let scheduleData = null;

document.getElementById('read-content').addEventListener('click', () => {
    // Check if we have a stored source tab ID (from floating button click)
    chrome.storage.local.get(['sourceTabId'], (result) => {
        const executeOnTab = (tabId) => {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    // Grab all HTML and send it back
                    return document.documentElement.outerHTML;
                },
            }).then((results) => {
                // Clear the stored source tab ID after use
                chrome.storage.local.remove('sourceTabId');
                
                // Access the page's HTML in this script
                const pageContent = results[0].result;
                console.log('Page content:', pageContent);

                // Check if user is on the Time Grid view instead of List of Classes
                const warningElement = document.getElementById('wrong-page-warning');
                if (pageContent.includes('Selected tab Time Grid')) {
                    // Show warning and don't proceed
                    warningElement.classList.add('show');
                    return;
                }
                
                // Hide warning if it was previously shown
                warningElement.classList.remove('show');

                // Pass the entire page content to getScheduleData for parsing
                scheduleData = getScheduleData(pageContent);
                
                // Now you have the parsed schedule data to work with
                console.log('Parsed schedule:', scheduleData);

                // Populate edit page and show it
                populateEditPage();
                showEditPage();
            });
        };
        
        if (result.sourceTabId) {
            // Use the stored source tab ID (opened from floating button)
            executeOnTab(result.sourceTabId);
        } else {
            // Fall back to querying for active tab (opened from extension icon)
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                executeOnTab(tab.id);
            });
        }
    });
});

function populateEditPage() {
    const eventsList = document.getElementById('events-list');
    eventsList.innerHTML = '';

    scheduleData.forEach((event, index) => {
        const card = document.createElement('div');
        card.className = 'event-card';
        card.dataset.index = index;

        card.innerHTML = `
            <div class="event-card-header">
                <span class="event-title">${event.subject} ${event.course}</span>
                <button class="delete-event" data-index="${index}">&times;</button>
            </div>
            <div class="event-field">
                <label>Name</label>
                <input type="text" data-field="name" value="${escapeHtml(event.name || '')}">
            </div>
            <div class="event-field">
                <label>Location</label>
                <input type="text" data-field="room" value="${escapeHtml(event.room || '')}">
            </div>
            <div class="event-row">
                <div class="event-field">
                    <label>Days</label>
                    <input type="text" data-field="days" value="${escapeHtml(event.days || '')}">
                    <span class="error-message" style="display: none;">Only use M, W, F, T, R, S, U without repeats</span>
                </div>
                <div class="event-field">
                    <label>Time</label>
                    <input type="text" data-field="time" value="${escapeHtml((event.startTime || '') + (event.endTime ? ' - ' + event.endTime : ''))}" class="time-input">
                    <span class="error-message" style="display: none;">Format must be: 9:20a - 10:30a or 4:30p - 5:20p</span>
                </div>
            </div>
        `;

        eventsList.appendChild(card);
    });

    // Add event listeners for input changes
    eventsList.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', handleInputChange);
        // Add real-time validation for time inputs
        if (input.dataset.field === 'time') {
            input.addEventListener('input', validateTimeInput);
        }
        // Add real-time validation for days inputs
        if (input.dataset.field === 'days') {
            input.addEventListener('input', validateDaysInput);
        }
    });

    // Add event listeners for delete buttons
    eventsList.querySelectorAll('.delete-event').forEach(btn => {
        btn.addEventListener('click', handleDeleteEvent);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function validateDaysInput(e) {
    const input = e.target;
    const value = input.value.trim().toUpperCase();
    const errorMessage = input.parentElement.querySelector('.error-message');
    
    // Valid day letters
    const validDays = ['M', 'W', 'F', 'T', 'R', 'S', 'U'];
    
    // Check if empty (valid)
    if (value === '') {
        input.style.border = '';
        input.style.outline = '';
        if (errorMessage) {
            errorMessage.style.display = 'none';
        }
        return;
    }
    
    // Check for invalid characters
    const chars = value.split('');
    const hasInvalidChars = chars.some(char => !validDays.includes(char));
    
    // Check for duplicates
    const hasDuplicates = chars.length !== new Set(chars).size;
    
    if (hasInvalidChars || hasDuplicates) {
        // Invalid format
        input.style.border = '2px solid #dc3545';
        input.style.outline = 'none';
        if (errorMessage) {
            errorMessage.style.display = 'block';
        }
    } else {
        // Valid format - update input to uppercase
        input.value = value;
        input.style.border = '';
        input.style.outline = '';
        if (errorMessage) {
            errorMessage.style.display = 'none';
        }
    }
}

function validateTimeInput(e) {
    const input = e.target;
    const value = input.value.trim();
    const errorMessage = input.parentElement.querySelector('.error-message');
    
    // Regex pattern to match time format: "9:20a - 10:30a" or "4:30p - 5:20p"
    // Allows for optional leading zeros and spaces around the dash
    const timePattern = /^\d{1,2}:\d{2}[ap]\s*-\s*\d{1,2}:\d{2}[ap]$/i;
    
    if (value === '' || timePattern.test(value)) {
        // Valid format or empty
        input.style.border = '';
        input.style.outline = '';
        if (errorMessage) {
            errorMessage.style.display = 'none';
        }
    } else {
        // Invalid format
        input.style.border = '2px solid #dc3545';
        input.style.outline = 'none';
        if (errorMessage) {
            errorMessage.style.display = 'block';
        }
    }
}

function handleInputChange(e) {
    const card = e.target.closest('.event-card');
    const index = parseInt(card.dataset.index);
    const field = e.target.dataset.field;
    const value = e.target.value;

    if (field === 'time') {
        // Parse time field back to startTime and endTime
        const parts = value.split(' - ');
        scheduleData[index].startTime = parts[0]?.trim() || '';
        scheduleData[index].endTime = parts[1]?.trim() || '';
    } else {
        scheduleData[index][field] = value;
    }

    console.log('Updated schedule:', scheduleData);
}

function handleDeleteEvent(e) {
    const index = parseInt(e.target.dataset.index);
    scheduleData.splice(index, 1);
    populateEditPage(); // Re-render the list
}

function showEditPage() {
    const initialPage = document.getElementById('page-initial');
    const editPage = document.getElementById('page-edit');
    
    initialPage.classList.add('slide-out');
    editPage.classList.add('slide-in');
}

function showActionsPage() {
    const editPage = document.getElementById('page-edit');
    const actionsPage = document.getElementById('page-actions');
    
    editPage.classList.add('slide-out');
    actionsPage.classList.add('slide-in');
}

function showEditFromActions() {
    const editPage = document.getElementById('page-edit');
    const actionsPage = document.getElementById('page-actions');
    
    actionsPage.classList.remove('slide-in');
    editPage.classList.remove('slide-out');
}

// Continue button handler
document.getElementById('continue-btn').addEventListener('click', () => {
    showActionsPage();
});

// Back to edit handler
document.getElementById('back-to-edit').addEventListener('click', () => {
    showEditFromActions();
});

// Calendar action button handlers
document.getElementById('add-google').addEventListener('click', () => {
    addGoogleCalendar(scheduleData);
});

document.getElementById('add-microsoft')?.addEventListener('click', () => {
    addToMicrosoftCalendar(scheduleData);
});

document.getElementById('add-apple')?.addEventListener('click', () => {
    addToAppleCalendar(scheduleData);
});

document.getElementById('download-ics').addEventListener('click', () => {
    createICSFile(scheduleData);
});


function addToMicrosoftCalendar(scheduleData) {
    // TODO: Implement Microsoft Calendar integration
    console.log("adding to msft")
}

function addToAppleCalendar(scheduleData) {
    // TODO: Implement Apple Calendar integration
    console.log("adding to apple calendar")
}

