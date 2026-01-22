/**
 * Parses the page HTML and extracts schedule data from table elements.
 * @param {string} pageContent - The full HTML of the page as a string
 * @returns {Array} Array of schedule objects with class info
 */
function getScheduleData(pageContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(pageContent, "text/html");
    
    // Place holder jawn while i figure out how the data is actually stored
    doc.querySelectorAll("table.unitime-WebTable, .unitime-WebTable").forEach(table => {
        const rows = Array.from(table.querySelectorAll("tr"));
        print(rows);
    });
    scheduleData = [];
    return scheduleData;
}
