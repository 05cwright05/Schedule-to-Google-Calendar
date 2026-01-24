function printRow(row) {
    const cells = Array.from(row.querySelectorAll("td"));
    const cellContents = cells.map(cell => cell.textContent.trim()).filter(text => text.length > 0);
    console.log(cellContents.join(" | "));
}

/**
 * Parses the page HTML and extracts schedule data from table elements.
 * @param {string} pageContent - The full HTML of the page as a string
 * @returns {Array} Array of schedule objects with class info
 */
function getScheduleData(pageContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(pageContent, "text/html");
    const scheduleData = [];
    console.log("VERSION 2.1")
    
    doc.querySelectorAll("table.unitime-WebTable, .unitime-WebTable").forEach(table => {
        const rows = Array.from(table.querySelectorAll("tr"));
        
        // Track current parent course for inheritance
        let currentSubject = "";
        let currentCourse = "";
        
        rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll("td"));
            if (cells.length === 0) return; // Skip header rows
            
            const getText = (index) => cells[index]?.textContent.trim() || "";
            
            // Valid course types we expect
            // quoted from https://www.purdue.edu/registrar/faculty/Courses%20and%20Curriculum/schedule-type-classifications.html?utm_source=chatgpt.com
            const validTypes = ["Lec", "Lab", "Pso", "Rec", "Prs", "Lbp", "Cln", "Sd", "Ex", "Res", "Ind", "Dis"];
            const regexCRN = /^\d{4,6}-/;
            
            // Check if column 1 (subject) has content - indicates main course row
            const subject = getText(1);
            const type = getText(3);
            const crn = getText(4);
            
            //probs better to check the crn - not sure tho cuz its not posted on purdue what this officailly could look like 
            // if (!regexCRN.test(crn)) {
            //     return;
            // }
            
            // Skip rows without a valid course type
            if (!validTypes.includes(type)) {
                return;
            }
            
            // Main course row: has Subject column filled
            if (subject) {
                // Update current parent course for inheritance
                currentSubject = subject;
                currentCourse = getText(2);
            }
            
            // Create schedule entry (for both main and sub-section rows)
            scheduleData.push({
                subject: currentSubject,
                course: currentCourse,
                type: type,
                name: currentSubject + " " + currentCourse + " " + type,
                crn: getText(4),
                availability: getText(5),
                days: getText(6),
                startTime: getText(7),
                endTime: getText(8),
                dateRange: getText(9),
                room: getText(10),
                instructor: getText(11),
                requires: getText(12),
                credits: getText(14),
                gradeMode: getText(15)
            });
        });
    });
    
    console.log("Parsed schedule JSON:", JSON.stringify(scheduleData, null, 2));
    return scheduleData;
}
