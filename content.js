// Store schedule data globally for access by calendar functions
let scheduleData = null;

document.getElementById('read-content').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // Grab all HTML and send it back
                return document.documentElement.outerHTML;
            },
        }).then((results) => {
            // Access the page's HTML in this script
            const pageContent = results[0].result;
            console.log('Page content:', pageContent);

            // Pass the entire page content to getScheduleData for parsing
            scheduleData = getScheduleData(pageContent);
            
            // Now you have the parsed schedule data to work with
            console.log('Parsed schedule:', scheduleData);

            // Trigger slide animation
            showActionsPage();
        });
    });
});

function showActionsPage() {
    const initialPage = document.getElementById('page-initial');
    const actionsPage = document.getElementById('page-actions');
    
    initialPage.classList.add('slide-out');
    actionsPage.classList.add('slide-in');
}

// Calendar action button handlers
document.getElementById('add-google').addEventListener('click', () => {
    addGoogleCalendar(scheduleData);

});

document.getElementById('add-microsoft').addEventListener('click', () => {
    addToMicrosoftCalendar(scheduleData);
});

document.getElementById('add-apple').addEventListener('click', () => {
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

