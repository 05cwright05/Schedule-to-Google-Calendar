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
            const scheduleData = getScheduleData(pageContent);
            
            // Now you have the parsed schedule data to work with
            console.log('Parsed schedule:', scheduleData);
        });
    });
});
