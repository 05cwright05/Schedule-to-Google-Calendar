// Source - https://stackoverflow.com/a
// Posted by gkalpak, modified by community. See post 'Timeline' for change history
// Retrieved 2026-01-20, License - CC BY-SA 3.0

// Regex-pattern to check URLs against. 
// It matches URLs like: http[s]://[...]stackoverflow.com[...]
var urlRegex = /^https?:\/\/(?:[^./?#]+\.)?stackoverflow\.com/;

// A function to use as callback
function doStuffWithDom(domContent) {
    console.log('I received the following DOM content:\n' + domContent);
}

// When the browser-action button is clicked...
chrome.browserAction.onClicked.addListener(function (tab) {
    // ...check the URL of the active tab against our pattern and...
    if (urlRegex.test(tab.url)) {
        // ...if it matches, send a message specifying a callback too
        chrome.tabs.sendMessage(tab.id, {text: 'report_back'}, doStuffWithDom);
    }
});

function addGoogleCalendar(scheduleData) {
    console.log("adding to google jawn v4")
    console.log(scheduleData)
}
