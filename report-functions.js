// ============================================
// Report Generation Functions
// ============================================

// Helper function to get logo as base64
function getLogoBase64() {
    // Return a placeholder - in production, this should be the actual base64 encoded logo
    return 'img/1.jpg'; // Path to logo
}

// Helper function to create report header with logo
// Helper to create consistent report header with address
function createReportHeader(title, subtitle = '') {
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

    return `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 3px double #333; padding-bottom: 15px;">
            <div style="flex: 1;">
                 <img src="${getLogoBase64()}" style="height: 100px; width: auto;" alt="Logo">
            </div>
            <div style="flex: 2; text-align: center;">
                <h2 style="margin: 0 0 5px 0; font-family: 'Khmer OS Battambang', serif; color: rgb(31, 6, 55);">សាលារៀន អាយ ធី ខេ</h2>
                <h3 style="margin: 0 0 5px 0; color: #555;">ITK School</h3>
                <p style="margin: 5px 0; font-size: 14px; color: #333;">អាសយដ្ឋាន៖ ភូមិត្រពាំងព្រីងខាងត្បូង ឃុំត្រពាំងព្រីង ស្រុកទឹកឈូ ខេត្តកំពត</p>
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #333;">លេខទូរស័ព្ទ៖ 097 75 33 473</p>
                <h4 style="margin: 10px 0 0 0; text-decoration: underline;">${title}</h4>
                ${subtitle ? `<p style="margin: 5px 0 0 0; font-size: 14px;">${subtitle}</p>` : ''}
            </div>
            <div style="flex: 1; text-align: right; font-size: 12px;">
                <p style="margin: 0;">កាលបរិច្ឆេទ: ${dateStr}</p>
            </div>
        </div>
    `;
}

// Monthly Report
function generateMonthlyReport() {
    const selectedMonth = document.getElementById('monthlyReportSelect').value;
    const [year, month] = selectedMonth.split('-');
    const monthNames = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
    const monthName = monthNames[parseInt(month) - 1];

    // Filter students by registration month
    const studentsInMonth = Object.values(allStudentsData).filter(s => {
        if (!s.startDate) return false;
        const startDate = new Date(s.startDate);
        return startDate.getFullYear() === parseInt(year) && (startDate.getMonth() + 1) === parseInt(month);
    });

    if (studentsInMonth.length === 0) {
        return Swal.fire('គ្មានទិន្នន័យ', `មិនមានសិស្សចុះឈ្មោះក្នុងខែ ${monthName} ${year} ទេ`, 'info');
    }

    // Create preview modal
    const reportContent = createMonthlyReportHTML(studentsInMonth, monthName, year);
    showReportPreview(reportContent, `របាយការណ៍ប្រចាំខែ ${monthName} ${year}`);
}

function createMonthlyReportHTML(students, monthName, year) {
    const totalStudents = students.length;
    const maleCount = students.filter(s => s.gender === 'Male').length;
    const femaleCount = students.filter(s => s.gender === 'ស្រី' || s.gender === 'Female').length;
    const totalAmount = students.reduce((sum, s) => sum + calculateTotalAmount(s), 0);

    let rows = '';
    students.forEach((s, index) => {
        rows += `
            <tr style="font-family: 'Khmer OS Battambang', sans-serif;">
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${index + 1}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${s.displayId}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${s.lastName} ${s.firstName}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${s.subject || '-'}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${s.studyLevel || '-'}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${s.teacherName || '-'}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${calculateTotalAmount(s).toFixed(2)}</td>
            </tr>
        `;
    });

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>របាយការណ៍ប្រចាំខែ ${monthName} ${year}</title>
            <style>
                @font-face {
                    font-family: 'Khmer OS Battambang';
                    src: url('fonts/KhmerOSBattambang.ttf') format('truetype');
                }
                body {
                    font-family: 'Khmer OS Battambang', sans-serif;
                    padding: 40px;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                th {
                    background-color: rgb(31, 6, 55);
                    color: white;
                    padding: 12px;
                    text-align: center;
                    border: 1px solid #ddd;
                }
                .summary-box {
                    display: flex;
                    justify-content: space-around;
                    margin: 20px 0;
                    gap: 15px;
                }
                .summary-item {
                    flex: 1;
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    text-align: center;
                    border-left: 4px solid rgb(31, 6, 55);
                }
                @page {
                    size: A4 landscape;
                    margin: 15mm;
                }
                @media print {
                    body { padding: 20px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            ${createReportHeader(`របាយការណ៍ប្រចាំខែ ${monthName} ${year}`, 'បញ្ជីសិស្សចុះឈ្មោះថ្មី')}
            
            <div class="summary-box">
                <div class="summary-item">
                    <h3 style="margin: 0; color: rgb(31, 6, 55);">${totalStudents}</h3>
                    <p style="margin: 5px 0 0 0; color: #666;">សិស្សសរុប</p>
                </div>
                <div class="summary-item">
                    <h3 style="margin: 0; color: #007bff;">${maleCount}</h3>
                    <p style="margin: 5px 0 0 0; color: #666;">ប្រុស</p>
                </div>
                <div class="summary-item">
                    <h3 style="margin: 0; color: #e83e8c;">${femaleCount}</h3>
                    <p style="margin: 5px 0 0 0; color: #666;">ស្រី</p>
                </div>
                <div class="summary-item">
                    <h3 style="margin: 0; color: #28a745;">$${totalAmount.toFixed(2)}</h3>
                    <p style="margin: 5px 0 0 0; color: #666;">ចំណូលសរុប</p>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th width="5%">ល.រ</th>
                        <th width="10%">អត្តលេខ</th>
                        <th width="20%">ឈ្មោះ</th>
                        <th width="8%">ភេទ</th>
                        <th width="15%">មុខវិជ្ជា</th>
                        <th width="10%">កម្រិត</th>
                        <th width="17%">គ្រូ</th>
                        <th width="15%">ចំនួនទឹកប្រាក់</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </body>
        </html>
    `;
}

// Subject Report
function generateSubjectReport() {
    const selectedSubject = document.getElementById('subjectReportSelect').value;

    let filteredStudents = Object.values(allStudentsData);
    if (selectedSubject !== 'all') {
        filteredStudents = filteredStudents.filter(s =>
            s.subject && s.subject.toUpperCase().includes(selectedSubject)
        );
    }

    if (filteredStudents.length === 0) {
        return Swal.fire('គ្មានទិន្នន័យ', 'មិនមានសិស្សក្នុងមុខវិជ្ជានេះទេ', 'info');
    }

    const reportContent = createSubjectReportHTML(filteredStudents, selectedSubject);
    showReportPreview(reportContent, `របាយការណ៍តាមមុខវិជ្ជា ${selectedSubject === 'all' ? 'ទាំងអស់' : selectedSubject}`);
}

function createSubjectReportHTML(students, subject) {
    const subjectName = subject === 'all' ? 'ទាំងអស់' : subject;

    // Group by subject
    const bySubject = {};
    students.forEach(s => {
        const subj = s.subject || 'មិនបានកំណត់';
        if (!bySubject[subj]) bySubject[subj] = [];
        bySubject[subj].push(s);
    });

    let content = '';
    Object.keys(bySubject).sort().forEach(subj => {
        const subjectStudents = bySubject[subj];
        const totalAmount = subjectStudents.reduce((sum, s) => sum + calculateTotalAmount(s), 0);

        let rows = '';
        subjectStudents.forEach((s, index) => {
            rows += `
                <tr style="font-family: 'Khmer OS Battambang', sans-serif;">
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${index + 1}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${s.displayId}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${s.lastName} ${s.firstName}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${s.studyLevel || '-'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${s.teacherName || '-'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${calculateTotalAmount(s).toFixed(2)}</td>
                </tr>
            `;
        });

        content += `
            <h3 style="font-family: 'Khmer OS Battambang', sans-serif; color: rgb(31, 6, 55); margin-top: 30px; border-bottom: 2px solid rgb(31, 6, 55); padding-bottom: 10px;">
                ${subj} (${subjectStudents.length} នាក់ - $${totalAmount.toFixed(2)})
            </h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                <thead>
                    <tr>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 5%;">ល.រ</th>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 12%;">អត្តលេខ</th>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 25%;">ឈ្មោះ</th>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 10%;">ភេទ</th>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 12%;">កម្រិត</th>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 21%;">គ្រូ</th>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 15%;">ចំនួនទឹកប្រាក់</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    });

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>របាយការណ៍តាមមុខវិជ្ជា ${subjectName}</title>
            <style>
                @font-face {
                    font-family: 'Khmer OS Battambang';
                    src: url('fonts/KhmerOSBattambang.ttf') format('truetype');
                }
                body {
                    font-family: 'Khmer OS Battambang', sans-serif;
                    padding: 40px;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                @page {
                    size: A4 landscape;
                    margin: 15mm;
                }
                @media print {
                    body { padding: 20px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            ${createReportHeader(`របាយការណ៍តាមមុខវិជ្ជា`, `${subjectName} - សរុប ${students.length} នាក់`)}
            ${content}
        </body>
        </html>
    `;
}

// Level Report
function generateLevelReport() {
    const selectedLevel = document.getElementById('levelReportSelect').value;

    let filteredStudents = Object.values(allStudentsData);
    if (selectedLevel !== 'all') {
        filteredStudents = filteredStudents.filter(s => s.studyLevel === selectedLevel);
    }

    if (filteredStudents.length === 0) {
        return Swal.fire('គ្មានទិន្នន័យ', 'មិនមានសិស្សក្នុងកម្រិតនេះទេ', 'info');
    }

    const reportContent = createLevelReportHTML(filteredStudents, selectedLevel);
    showReportPreview(reportContent, `របាយការណ៍តាមកម្រិត ${selectedLevel === 'all' ? 'ទាំងអស់' : selectedLevel}`);
}

function createLevelReportHTML(students, level) {
    const levelName = level === 'all' ? 'ទាំងអស់' : level;

    // Group by level
    const byLevel = {};
    students.forEach(s => {
        const lv = s.studyLevel || 'មិនបានកំណត់';
        if (!byLevel[lv]) byLevel[lv] = [];
        byLevel[lv].push(s);
    });

    let content = '';
    Object.keys(byLevel).sort().forEach(lv => {
        const levelStudents = byLevel[lv];
        const totalAmount = levelStudents.reduce((sum, s) => sum + calculateTotalAmount(s), 0);

        let rows = '';
        levelStudents.forEach((s, index) => {
            rows += `
                <tr style="font-family: 'Khmer OS Battambang', sans-serif;">
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${index + 1}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${s.displayId}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${s.lastName} ${s.firstName}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${s.subject || '-'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${s.teacherName || '-'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${calculateTotalAmount(s).toFixed(2)}</td>
                </tr>
            `;
        });

        content += `
            <h3 style="font-family: 'Khmer OS Battambang', sans-serif; color: rgb(31, 6, 55); margin-top: 30px; border-bottom: 2px solid rgb(31, 6, 55); padding-bottom: 10px;">
                កម្រិត ${lv} (${levelStudents.length} នាក់ - $${totalAmount.toFixed(2)})
            </h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                <thead>
                    <tr>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 5%;">ល.រ</th>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 12%;">អត្តលេខ</th>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 23%;">ឈ្មោះ</th>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 10%;">ភេទ</th>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 18%;">មុខវិជ្ជា</th>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 17%;">គ្រូ</th>
                        <th style="background-color: rgb(31, 6, 55); color: white; padding: 12px; border: 1px solid #ddd; width: 15%;">ចំនួនទឹកប្រាក់</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    });

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>របាយការណ៍តាមកម្រិត ${levelName}</title>
            <style>
                @font-face {
                    font-family: 'Khmer OS Battambang';
                    src: url('fonts/KhmerOSBattambang.ttf') format('truetype');
                }
                body {
                    font-family: 'Khmer OS Battambang', sans-serif;
                    padding: 40px;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                @page {
                    size: A4 landscape;
                    margin: 15mm;
                }
                @media print {
                    body { padding: 20px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            ${createReportHeader(`របាយការណ៍តាមកម្រិត`, `${levelName} - សរុប ${students.length} នាក់`)}
            ${content}
        </body>
        </html>
    `;
}

// Upcoming Payments Report
function generateUpcomingPaymentsReport() {
    const today = new Date();
    const tenDaysLater = new Date(today.getTime() + (10 * 24 * 60 * 60 * 1000));

    const upcomingStudents = Object.values(allStudentsData).filter(s => {
        if (!s.dueDate && !s.nextPaymentDate) return false;
        const dueDate = new Date(s.dueDate || s.nextPaymentDate);
        const remaining = calculateRemainingAmount(s);
        return dueDate >= today && dueDate <= tenDaysLater && remaining > 0;
    }).sort((a, b) => {
        const dateA = new Date(a.dueDate || a.nextPaymentDate);
        const dateB = new Date(b.dueDate || b.nextPaymentDate);
        return dateA - dateB;
    });

    if (upcomingStudents.length === 0) {
        return Swal.fire('គ្មានទិន្នន័យ', 'មិនមានសិស្សត្រូវបង់ប្រាក់ក្នុង ១០ ថ្ងៃខាងមុខទេ', 'info');
    }

    const reportContent = createUpcomingPaymentsHTML(upcomingStudents);
    showReportPreview(reportContent, `របាយការណ៍ជិតដល់ថ្ងៃបង់ (${upcomingStudents.length} នាក់)`);
}

function createUpcomingPaymentsHTML(students) {
    const totalRemaining = students.reduce((sum, s) => sum + calculateRemainingAmount(s), 0);

    let rows = '';
    students.forEach((s, index) => {
        const dueDate = new Date(s.dueDate || s.nextPaymentDate);
        const today = new Date();
        const daysLeft = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        const remaining = calculateRemainingAmount(s);

        rows += `
            <tr style="font-family: 'Khmer OS Battambang', sans-serif;">
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${index + 1}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${s.displayId}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${s.lastName} ${s.firstName}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${s.subject || '-'}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${convertToKhmerDate(s.dueDate || s.nextPaymentDate)}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center; color: ${daysLeft <= 3 ? '#dc3545' : '#ffc107'}; font-weight: bold;">${daysLeft} ថ្ងៃ</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right; color: #dc3545; font-weight: bold;">$${remaining.toFixed(2)}</td>
            </tr>
        `;
    });

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>របាយការណ៍ជិតដល់ថ្ងៃបង់</title>
            <style>
                @font-face {
                    font-family: 'Khmer OS Battambang';
                    src: url('fonts/KhmerOSBattambang.ttf') format('truetype');
                }
                body {
                    font-family: 'Khmer OS Battambang', sans-serif;
                    padding: 40px;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                th {
                    background-color: rgb(31, 6, 55);
                    color: white;
                    padding: 12px;
                    text-align: center;
                    border: 1px solid #ddd;
                }
                .summary-box {
                    background: #fff3cd;
                    border-left: 4px solid #ffc107;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 8px;
                }
                @page {
                    size: A4 landscape;
                    margin: 15mm;
                }
                @media print {
                    body { padding: 20px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            ${createReportHeader('របាយការណ៍ជិតដល់ថ្ងៃបង់', 'សិស្សត្រូវបង់ប្រាក់ក្នុង ១០ ថ្ងៃខាងមុខ')}
            
            <div class="summary-box">
                <h3 style="margin: 0 0 10px 0; color: rgb(31, 6, 55);">សង្ខេប</h3>
                <p style="margin: 5px 0; font-size: 16px;"><strong>ចំនួនសិស្ស:</strong> ${students.length} នាក់</p>
                <p style="margin: 5px 0; font-size: 16px;"><strong>ប្រាក់ត្រូវទទួល:</strong> <span style="color: #dc3545; font-weight: bold;">$${totalRemaining.toFixed(2)}</span></p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th width="5%">ល.រ</th>
                        <th width="12%">អត្តលេខ</th>
                        <th width="25%">ឈ្មោះ</th>
                        <th width="18%">មុខវិជ្ជា</th>
                        <th width="15%">ថ្ងៃផុតកំណត់</th>
                        <th width="10%">នៅសល់</th>
                        <th width="15%">ចំនួនត្រូវបង់</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </body>
        </html>
    `;
}

// Show Report Preview Modal
function showReportPreview(htmlContent, title) {
    Swal.fire({
        title: title,
        html: `
            <div style="text-align: left; max-height: 500px; overflow-y: auto; border: 1px solid #ddd; padding: 20px; background: white;">
                <iframe id="reportPreviewFrame" style="width: 100%; height: 600px; border: none;"></iframe>
            </div>
        `,
        width: '90%',
        showCancelButton: true,
        confirmButtonText: '<i class="fi fi-rr-print"></i> បោះពុម្ព',
        cancelButtonText: '<i class="fi fi-rr-cross"></i> បិទ',
        confirmButtonColor: 'rgb(31, 6, 55)',
        didOpen: () => {
            const iframe = document.getElementById('reportPreviewFrame');
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(htmlContent);
            iframeDoc.close();
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const iframe = document.getElementById('reportPreviewFrame');
            iframe.contentWindow.print();
        }
    });
}
