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
        
        rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll("td"));
            if (cells.length === 0) return; // Skip header rows
            
            const getText = (index) => cells[index]?.textContent.trim() || "";
            
            // Valid course types we expect
            // quoted from https://www.purdue.edu/registrar/faculty/Courses%20and%20Curriculum/schedule-type-classifications.html?utm_source=chatgpt.com
            const validTypes = ["Lec", "Lab", "Pso", "Rec", "Prs", "Lbp", "Cln", "Sd", "Ex", "Res", "Ind", "Dis"];
            
            // Check if column 1 (subject) has content - indicates main course row
            const subject = getText(1);
            const type = getText(3);
            
            // Skip rows without a valid course type
            if (!validTypes.includes(type)) {
                return;
            }
            
            // Main course row: has Subject column filled
            if (subject) {
                scheduleData.push({
                    subject: subject,
                    course: getText(2),
                    type: type,
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
            } 
            // Sub-section row: no subject (Lab, Pso, etc.)
            else {
                scheduleData.push({
                    subject: "", // Will be inherited from parent course
                    course: "",
                    type: type,
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
            }
        });
    });
    
    console.log("Parsed schedule JSON:", JSON.stringify(scheduleData, null, 2));
    return scheduleData;
}
