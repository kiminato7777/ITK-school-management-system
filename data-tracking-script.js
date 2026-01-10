/**
 * data-tracking-script.js
 * Script for managing student data display from Firebase Realtime Database
 * Features: View details, Edit (real-time update), Delete, Mark as Paid, Search (DataTables), Reports
 */

// Global Variables
let studentDataTable;
let allStudentsData = {};

// View Mode (active or dropout)
const urlParams = new URLSearchParams(window.location.search);
const viewMode = urlParams.get('view') || 'active';
const studentsRef = firebase.database().ref('students');
let studentDetailsModal = null;

const KhmerLocale = {
    weekdays: {
        shorthand: ["អា", "ច", "អង្គ", "ពុ", "ព្រ", "សុ", "ស"],
        longhand: ["អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"],
    },
    months: {
        shorthand: ["មករា", "កុម្ភៈ", "មិនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"],
        longhand: ["មករា", "កុម្ភៈ", "មិនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"],
    }
};

// Statistics
let statistics = {
    total: 0,
    paid: 0,
    pending: 0,
    installment: 0,
    warning: 0,
    overdue: 0
};

// Alert notifications
let notifications = {
    overdue: [],
    warning: []
};

// Current filters state
let currentFilters = {
    searchName: '',
    status: 'all',
    filterTime: 'all',
    filterLevel: 'all',
    gender: 'all',
    startDate: '',
    endDate: ''
};

// ----------------------------------------------------
// Utility Functions
// ----------------------------------------------------

const getDateObject = (dateStr) => {
    if (!dateStr || ['មិនមាន', 'N/A', ''].includes(dateStr)) return null;
    const engDate = convertToEnglishDate(dateStr);
    if (!engDate) return null;
    const parts = engDate.split('/');
    if (parts.length === 3) {
        return new Date(parts[2], parts[0] - 1, parts[1]);
    }
    return null;
};

const filterStudents = (studentsArray) => {
    return studentsArray.filter(s => {
        // 0. Dropout/Active Filter
        const studentStatus = s.status || 'active';
        if (viewMode === 'dropout') {
            if (studentStatus !== 'dropout') return false;
        } else {
            if (studentStatus === 'dropout') return false;
        }

        // 1. Name Search
        if (currentFilters.searchName) {
            const term = currentFilters.searchName.toLowerCase().trim();
            if (term) {
                const khmerName = `${s.lastName || ''} ${s.firstName || ''}`.toLowerCase();
                const khmerNameNoSpace = `${s.lastName || ''}${s.firstName || ''}`.toLowerCase(); // Handle typing without spaces
                const chineseName = `${s.chineseLastName || ''} ${s.chineseFirstName || ''}`.toLowerCase();
                const displayId = (s.displayId || '').toLowerCase();

                // Search in all relevant fields
                if (!khmerName.includes(term) &&
                    !khmerNameNoSpace.includes(term) &&
                    !chineseName.includes(term) &&
                    !displayId.includes(term)) {
                    return false;
                }
            }
        }

        // 2. Status Filter
        if (currentFilters.status !== 'all') {
            const statusObj = getPaymentStatus(s);
            if (statusObj.status !== currentFilters.status) return false;
        }

        // 3. Time Filter
        if (currentFilters.filterTime !== 'all') {
            const sTime = (s.studyTime || '').trim();
            if (sTime !== currentFilters.filterTime) return false;
        }

        // 4. Level Filter
        if (currentFilters.filterLevel !== 'all') {
            const sLevel = (s.studyLevel || '').trim();
            if (sLevel !== currentFilters.filterLevel) return false;
        }

        // 5. Gender Filter
        if (currentFilters.gender !== 'all') {
            if (s.gender !== currentFilters.gender) return false;
        }

        // 6. Date Range Filter
        if (currentFilters.startDate || currentFilters.endDate) {
            const studentDate = getDateObject(s.startDate);
            if (!studentDate) return false;

            if (currentFilters.startDate) {
                const start = new Date(currentFilters.startDate);
                start.setHours(0, 0, 0, 0);
                if (studentDate < start) return false;
            }

            if (currentFilters.endDate) {
                const end = new Date(currentFilters.endDate);
                end.setHours(23, 59, 59, 999);
                if (studentDate > end) return false;
            }
        }

        return true;
    });
};

const showAlert = (message, type = 'success', duration = 5000) => {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;

    const wrapper = document.createElement('div');
    const iconMap = {
        'success': 'check-circle',
        'danger': 'cross-circle',
        'warning': 'exclamation',
        'info': 'info'
    };

    wrapper.innerHTML = [
        `<div class="alert alert-${type} alert-dismissible fade show" role="alert" style="min-width: 300px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 12px; border: none; margin-bottom: 10px;">`,
        ` <div class="d-flex align-items-center"><i class="fi fi-rr-${iconMap[type] || 'info'} me-3 fs-4"></i><div>${message}</div></div>`,
        ' <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
        '</div>'
    ].join('');

    const existingAlerts = alertContainer.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());

    alertContainer.append(wrapper);

    setTimeout(() => {
        if (wrapper.parentNode) {
            $(wrapper).fadeOut(500, function () { $(this).remove(); });
        }
    }, duration);
};

const showLoading = (isLoading) => {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.style.display = isLoading ? 'flex' : 'none';
};

const calculateTotalAmount = (student) => {
    if (!student) return 0;
    const tuitionFee = parseFloat(student.tuitionFee) || 0;
    const materialFee = parseFloat(student.materialFee) || 0;
    const adminFee = parseFloat(student.adminFee) || 0;

    // Support both new discountAmount and legacy discount field
    // Also support discountPercent if available
    const discountAmount = parseFloat(student.discountAmount || student.discount) || 0;
    const discountPercent = parseFloat(student.discountPercent) || 0;
    const totalDiscount = discountAmount + (tuitionFee * discountPercent / 100);

    const totalAmount = tuitionFee + materialFee + adminFee - totalDiscount;
    return totalAmount > 0 ? totalAmount : 0;
};

const calculateTotalPaid = (student) => {
    if (!student) return 0;
    let totalPaid = parseFloat(student.initialPayment) || 0;

    if (student.installments) {
        // គាំទ្រទាំង Array និង Object (Firebase អាចនឹងផ្ញើមកជា Object ប្រសិនបើ Index មិនមែនជាលេខរៀង)
        const installments = Array.isArray(student.installments) ? student.installments : Object.values(student.installments);
        installments.forEach(inst => {
            if (inst.paid || inst.status === 'paid') {
                totalPaid += (parseFloat(inst.paidAmount || inst.amount) || 0);
            }
        });
    }
    return totalPaid;
};

const calculateRemainingAmount = (student) => {
    if (!student) return 0;
    return Math.max(0, calculateTotalAmount(student) - calculateTotalPaid(student));
};

const getPaymentStatus = (student) => {
    if (!student) return { text: 'N/A', badge: 'status-pending', status: 'pending', daysRemaining: 0 };

    const remainingAmount = calculateRemainingAmount(student);
    if (remainingAmount <= 0) return { text: '✅ បង់រួច', badge: 'status-paid', status: 'paid', daysRemaining: 0 };

    const nextPaymentDateStr = student.dueDate || student.nextPaymentDate;
    if (nextPaymentDateStr && !['មិនមាន', 'N/A', ''].includes(nextPaymentDateStr)) {
        const engDate = convertToEnglishDate(nextPaymentDateStr);
        if (engDate) {
            const parts = engDate.split('/');
            if (parts.length === 3) {
                const [month, day, year] = parts.map(Number);
                const nextDueDate = new Date(year, month - 1, day);
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (!isNaN(nextDueDate.getTime())) {
                    const diffDays = Math.ceil((nextDueDate - today) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) return { text: `❌ ហួសកំណត់ (${Math.abs(diffDays)} ថ្ងៃ)`, badge: 'status-pending', status: 'overdue', daysRemaining: diffDays };
                    // Updated to 3 days alert as requested
                    if (diffDays <= 3) return { text: `⏳ ជិតដល់កំណត់ (${diffDays} ថ្ងៃ)`, badge: 'status-warning', status: 'warning', daysRemaining: diffDays };
                }
            }
        }
    }

    const dbStatus = student.paymentStatus || 'Pending';
    if (['Paid', 'បង់រួច'].includes(dbStatus)) return { text: '✅ បង់រួច', badge: 'status-paid', status: 'paid', daysRemaining: 0 };
    if (['Installment', 'Partial', 'នៅជំណាក់'].includes(dbStatus)) return { text: '⏳ នៅជំណាក់', badge: 'status-installment', status: 'installment', daysRemaining: 0 };

    return { text: '❌ មិនទាន់បង់', badge: 'status-pending', status: 'pending', daysRemaining: 0 };
};

// ----------------------------------------------------
// Date Conversion Functions
// ----------------------------------------------------

const convertToKhmerDate = (dateStr) => {
    if (!dateStr || ['N/A', '', 'មិនមាន', 'null', 'undefined'].includes(dateStr)) return 'មិនមាន';

    // If it already has Khmer month name or "ថ្ងៃទី", return as is
    const khmerMonths = KhmerLocale.months.longhand;
    const hasKhmerMonth = khmerMonths.some(m => dateStr.toString().includes(m));
    if (hasKhmerMonth || dateStr.toString().includes('ថ្ងៃទី')) return dateStr;

    try {
        let d = new Date(dateStr);

        // Handle DD/MM/YYYY format
        if (isNaN(d.getTime()) && dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                // Try Day/Month/Year
                d = new Date(parts[2], parts[1] - 1, parts[0]);
            }
        }

        if (!isNaN(d.getTime())) {
            const day = d.getDate();
            const month = khmerMonths[d.getMonth()];
            const year = d.getFullYear();
            return `ថ្ងៃទី ${day} ${month} ${year}`;
        }
        return dateStr;
    } catch (e) { return dateStr; }
};

const convertToEnglishDate = (khmerDateStr) => {
    if (!khmerDateStr || ['មិនមាន', '', 'N/A'].includes(khmerDateStr)) return null;
    try {
        const match = khmerDateStr.match(/ថ្ងៃទី\s*(\d+)\/(\d+)\/(\d+)/);
        if (match) return `${parseInt(match[2])}/${parseInt(match[1])}/${match[3]}`;
        if (khmerDateStr.includes('/') && !khmerDateStr.includes('ថ្ងៃទី')) {
            const p = khmerDateStr.split('/');
            if (p.length === 3) return `${parseInt(p[1])}/${parseInt(p[0])}/${p[2]}`;
        }
        return null;
    } catch (e) { return null; }
};

const formatDueDateWithColor = (student) => {
    if (!student) return '<span class="text-muted">មិនមាន</span>';
    const dateStr = student.dueDate || student.nextPaymentDate || 'មិនមាន';
    if (['មិនមាន', 'N/A', ''].includes(dateStr)) return '<span class="text-muted">មិនមាន</span>';

    const khDate = convertToKhmerDate(dateStr);
    const status = getPaymentStatus(student);
    if (status.status === 'overdue') return `<span class="overdue text-danger fw-bold">${khDate} (ហួស ${Math.abs(status.daysRemaining)} ថ្ងៃ)</span>`;
    if (status.status === 'warning') return `<span class="due-soon text-warning fw-bold">${khDate} (${status.daysRemaining} ថ្ងៃ)</span>`;
    return `<span class="normal-due">${khDate}</span>`;
};

const formatStudyType = (student) => {
    if (!student) return 'មិនមាន';
    const types = { 'cFullTime': 'ចិនពេញម៉ោង', 'cPartTime': 'ចិនក្រៅម៉ោង', 'eFullTime': 'អង់គ្លេសពេញម៉ោង', 'ePartTime': 'អង់គ្លេសក្រៅម៉ោង' };
    return types[student.studyType] || student.studyType || 'មិនមាន';
};

const populateDynamicFilters = (students) => {
    // Helper to populate a select element
    const populateSelect = (elementId, attribute, defaultText, customSort, extraSelectId) => {
        const select = document.getElementById(elementId);
        const extraSelect = extraSelectId ? document.getElementById(extraSelectId) : null;
        if (!select && !extraSelect) return;

        // Get unique values
        const values = new Set();
        students.forEach(s => {
            if (s[attribute]) {
                const val = s[attribute].trim();
                // Avoid empty or N/A values if desired, or keep them
                if (val && !['N/A', 'មិនមាន', ''].includes(val)) {
                    values.add(val);
                }
            }
        });

        const sortedValues = Array.from(values).sort(customSort || ((a, b) => a.localeCompare(b)));

        // Populate main filter select
        if (select) {
            const currentValue = select.value;
            let allOption = select.querySelector('option[value="all"]');
            if (!allOption) allOption = new Option(defaultText, "all");

            select.innerHTML = '';
            select.appendChild(allOption);

            sortedValues.forEach(val => {
                const option = document.createElement('option');
                option.value = val;
                option.textContent = val;
                select.appendChild(option);
            });

            if (sortedValues.includes(currentValue)) {
                select.value = currentValue;
            } else {
                select.value = 'all';
                if (attribute === 'studyTime') currentFilters.filterTime = 'all';
                if (attribute === 'studyLevel') currentFilters.filterLevel = 'all';
            }
        }

        // Populate extra select (e.g., in Change Class Modal)
        if (extraSelect) {
            const currentExtraValue = extraSelect.value;
            const firstOption = extraSelect.querySelector('option:not([value])') || extraSelect.options[0];
            const firstOptionText = firstOption ? firstOption.textContent : '-- ជ្រើសរើស --';

            extraSelect.innerHTML = `<option value="">${firstOptionText}</option>`;
            sortedValues.forEach(val => {
                const option = document.createElement('option');
                option.value = val;
                option.textContent = val;
                extraSelect.appendChild(option);
            });
            if (currentExtraValue && sortedValues.includes(currentExtraValue)) {
                extraSelect.value = currentExtraValue;
            }
        }
    };

    // Custom sort for times (simple string sort might be enough, but time sort is better)
    const timeSort = (a, b) => {
        // Simple heuristic: compare start hour
        const getStartHour = (t) => parseInt(t.split(':')[0]) || 0;
        return getStartHour(a) - getStartHour(b);
    };

    // Custom sort for levels (try to sort by level number)
    const levelSort = (a, b) => {
        const getLevelNum = (l) => {
            if (l.includes('មូលដ្ឋាន')) return 0;
            const match = l.match(/(\d+)/);
            return match ? parseInt(match[1]) : 99;
        };
        return getLevelNum(a) - getLevelNum(b);
    };

    populateSelect('filterTime', 'studyTime', '🔍 ទាំងអស់ (ម៉ោង)', timeSort, 'cc_studyTime');
    populateSelect('filterLevel', 'studyLevel', '🎓 ទាំងអស់ (កម្រិត)', levelSort, 'cc_studyLevel');
};

// ----------------------------------------------------
// Core Functions: Loading & Rendering
// ----------------------------------------------------

let rawStudentsArray = [];

function renderFilteredTable() {
    // Update title based on view mode
    const titleElement = document.querySelector('.header-title span');
    if (titleElement) {
        titleElement.textContent = viewMode === 'dropout' ? 'បញ្ជីឈ្មោះសិស្សបោះបង់ការសិក្សា' : 'បញ្ជីឈ្មោះសិស្សទាំងអស់';
    }

    const filtered = filterStudents(rawStudentsArray);
    updateStatistics(filtered);
    renderTableData(filtered);
}

const loadStudentData = () => {
    showLoading(true);
    studentsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        allStudentsData = {};
        rawStudentsArray = [];

        if (data) {
            Object.keys(data).forEach(key => {
                const s = data[key];
                if (s && (s.displayId || s.lastName)) {
                    s.key = key;
                    allStudentsData[key] = s;
                    rawStudentsArray.push(s);
                }
            });

            // Sort by ID number (stripping 'ITK' or 'ITK-')
            rawStudentsArray.sort((a, b) => {
                const idA = parseInt((a.displayId || '').replace(/\D/g, '')) || 0;
                const idB = parseInt((b.displayId || '').replace(/\D/g, '')) || 0;
                return idA - idB;
            });
        }

        populateDynamicFilters(rawStudentsArray);
        renderFilteredTable();
        checkPaymentAlerts(allStudentsData);
        showLoading(false);
    }, (error) => {
        console.error("Firebase Error:", error);
        showAlert(`Error: ${error.message}`, 'danger');
        showLoading(false);
    });
};

function updateStatistics(students) {
    const stats = { total: 0, paid: 0, pending: 0, installment: 0, warning: 0, overdue: 0 };
    students.forEach(s => {
        stats.total++;
        const status = getPaymentStatus(s).status;
        if (stats.hasOwnProperty(status)) stats[status]++;
        else if (status === 'warning') stats.warning++;
        else if (status === 'overdue') stats.overdue++;
    });
    // This could update a UI if we had stats boxes, but for now it's just updating the data.
    statistics = stats;
}

function renderTableData(studentsArray) {
    const tableId = '#studentTable';
    const tbody = document.querySelector(tableId + ' tbody');
    if (!tbody) return;

    // Helper to build row HTML content
    const buildRowContent = (s, i) => {
        const total = calculateTotalAmount(s);
        const remaining = calculateRemainingAmount(s);
        const status = getPaymentStatus(s);

        // Hidden search terms
        const searchTerms = `${s.lastName || ''}${s.firstName || ''} ${s.chineseLastName || ''} ${s.chineseFirstName || ''} ${s.displayId || ''}`.toLowerCase();

        return `
            <td class="text-center fw-bold text-secondary">${i + 1}</td>
            <td class="text-center"><span class="badge bg-light text-dark border shadow-sm">${s.displayId}</span></td>
            <td class="student-name-cell" onclick="viewStudentDetails('${s.key}')">
                <div class="fw-bold">${s.lastName || ''} ${s.firstName || ''}</div>
                <div class="text-muted small">${s.chineseLastName || ''}${s.chineseFirstName || ''}</div>
                <span class="d-none">${searchTerms}</span>
            </td>
            <td class="text-center">${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</td>
            <td class="text-center">${s.generation || 'N/A'}</td>
            <td class="text-center">${s.subject || 'N/A'}</td>
            <td class="text-center">${s.studyTime || 'N/A'}</td>
            <td class="text-center">${s.studyLevel || 'N/A'}</td>
            <td class="text-center">${s.teacherName || 'N/A'}</td>
            <td class="text-center">${convertToKhmerDate(s.startDate)}</td>
            <td class="text-center">${formatDueDateWithColor(s)}</td>
            <td class="text-center">${s.paymentMonths || 1}</td>
            <td class="text-center fw-bold text-primary"><i class="fi fi-rr-dollar me-1 small"></i>${total.toFixed(2)}</td>
            <td class="text-center fw-bold text-success"><i class="fi fi-rr-hand-holding-usd me-1 small"></i>${(parseFloat(s.initialPayment) || 0).toFixed(2)}</td>
            <td class="text-center fw-bold ${remaining > 0 ? 'text-danger' : 'text-success'}">
                <i class="fi fi-rr-hand-holding-usd me-1 ${remaining > 0 ? 'text-danger' : 'text-success'}"></i>${remaining.toFixed(2)}
            </td>
            <td class="text-center">
                <span class="payment-status-badge ${status.badge} shadow-sm">
                    <i class="fi ${status.status === 'paid' ? 'fi-rr-check' : 'fi-rr-hourglass'} me-1"></i>${status.text}
                </span>
            </td>
            <td class="text-center">
                <div class="action-buttons-table">
                    ${viewMode === 'dropout' ?
                `<button class="btn btn-sm btn-success restore-btn shadow-sm" onclick="restoreStudent('${s.key}')" title="ចូលរៀនវិញ"><i class="fi fi-rr-undo"></i></button>` :
                `<button class="btn btn-sm btn-warning edit-btn shadow-sm" onclick="showEditModal('${s.key}')" title="កែប្រែ"><i class="fi fi-rr-user-pen"></i></button>
                 <button class="btn btn-sm btn-dark dropout-btn shadow-sm" onclick="markAsDropout('${s.key}')" title="បោះបង់ការសិក្សា"><i class="fi fi-rr-user-xmark"></i></button>`
            }
                    ${remaining > 0 && viewMode !== 'dropout' ? `<button class="btn btn-sm btn-success mark-paid-btn shadow-sm" onclick="markAsPaid('${s.key}')" title="បង់ប្រាក់"><i class="fi fi-rr-file-invoice-dollar"></i></button>` : ''}
                    <button class="btn btn-sm btn-danger delete-btn shadow-sm" 
                        data-key="${s.key}" 
                        data-display-id="${s.displayId}" 
                        title="លុប"><i class="fi fi-rr-user-minus"></i></button>
                </div>
            </td>`;
    };

    // Case 1: DataTable NOT initialized yet (First Load)
    if (!$.fn.DataTable.isDataTable(tableId)) {
        let html = '';
        if (studentsArray.length > 0) {
            studentsArray.forEach((s, i) => {
                html += `<tr class="align-middle animate__animated animate__fadeIn" style="animation-delay: ${Math.min(i * 0.05, 1)}s;">${buildRowContent(s, i)}</tr>`;
            });
        }
        tbody.innerHTML = html;
        initializeDataTable(studentsArray);
        return;
    }

    // Case 2: DataTable ALREADY initialized (Updates) -> Use API to avoid flash
    const table = $(tableId).DataTable();
    const currentPage = table.page(); // Save page

    // De-couple from DOM for speed
    // Clear old data
    table.clear();

    if (studentsArray.length > 0) {
        const newRows = [];
        studentsArray.forEach((s, i) => {
            const tr = document.createElement('tr');
            tr.className = "align-middle animate__animated animate__fadeIn";
            // Reduce animation delay for updates to feel snappier or remove it
            // tr.style.animationDelay = (i * 0.02) + 's'; 
            tr.innerHTML = buildRowContent(s, i);
            newRows.push(tr);
        });
        // Batch add
        table.rows.add(newRows);
    }

    // Draw and restore page
    table.draw(false);

    // Only restore page if we have enough data (handled by draw false usually, but explicit safety check)
    if (currentPage > 0 && currentPage < table.page.info().pages) {
        table.page(currentPage).draw(false);
    }
}

function initializeDataTable(studentsArray) {
    if (!$.fn.DataTable.isDataTable('#studentTable')) {
        studentDataTable = $('#studentTable').DataTable({
            ordering: false,
            pagingType: 'full_numbers', // Show First, Prev, Numbers, Next, Last
            dom: '<"row mb-3"<"col-md-6"l><"col-md-6">>rt<"row mt-3 align-items-center"<"col-md-6"i><"col-md-6 d-flex justify-content-end"p>><"clear">',
            columnDefs: [{ orderable: false, targets: '_all' }],
            order: [[1, 'asc']], // Order by Student ID
            language: {
                search: "ស្វែងរក:",
                lengthMenu: "បង្ហាញ _MENU_ ទិន្នន័យ",
                info: "បង្ហាញ _START_ ទៅ _END_ នៃ _TOTAL_ ទិន្នន័យ",
                infoEmpty: "បង្ហាញ 0 ទៅ 0 នៃ 0 ទិន្នន័យ",
                infoFiltered: "(បានច្រោះពីទិន្នន័យសរុប _MAX_)",
                zeroRecords: '<div class="text-center text-muted py-5"><i class="fi fi-rr-search fs-1 mb-3 d-block"></i>រកមិនឃើញទិន្នន័យដែលអ្នកស្វែងរកទេ</div>',
                emptyTable: '<div class="text-center text-muted py-5"><i class="fi fi-rr-database fs-1 mb-3 d-block animate__animated animate__pulse animate__infinite"></i>គ្មានទិន្នន័យសិស្សទេ</div>',
                paginate: {
                    first: '<i class="fi fi-rr-angle-double-left"></i>',
                    last: '<i class="fi fi-rr-angle-double-right"></i>',
                    previous: '<i class="fi fi-rr-angle-small-left"></i>',
                    next: '<i class="fi fi-rr-angle-small-right"></i>'
                }
            }
        });
    }

    // Update Display Counts
    const count = studentsArray.length;
    if (document.getElementById('displayCount')) document.getElementById('displayCount').textContent = count;
    if (document.getElementById('totalDisplayCount')) document.getElementById('totalDisplayCount').textContent = count;
}

// ----------------------------------------------------
// Details Modal
// ----------------------------------------------------

function viewStudentDetails(studentKey) {
    const s = allStudentsData[studentKey];
    if (!s) return showAlert('រកមិនឃើញទិន្នន័យ!', 'danger');

    showLoading(true);
    const total = calculateTotalAmount(s);
    const paid = calculateTotalPaid(s);
    const remaining = calculateRemainingAmount(s);
    const status = getPaymentStatus(s);

    const bodyContent = `
        <div class="container-fluid p-0 animate__animated animate__fadeIn">
            <!-- 1. Top Profile Card -->
            <div class="card border-0 shadow-sm mb-4 overflow-hidden rounded-4">
                <div class="card-body p-0">
                    <div class="row g-0">
                        <div class="col-md-8 p-4 d-flex align-items-center">
                            <div class="me-4 position-relative">
                                ${s.imageUrl ?
            `<img src="${s.imageUrl}" class="rounded-circle border border-4 border-white shadow" style="width: 120px; height: 120px; object-fit: cover;">` :
            `<div class="rounded-circle bg-light d-flex align-items-center justify-content-center border border-4 border-white shadow text-secondary" style="width: 120px; height: 120px; font-size: 3.5rem;"><i class="fi fi-rr-user"></i></div>`
        }
                                <span class="position-absolute bottom-0 end-0 badge rounded-pill ${status.badge} border border-white p-2 shadow-sm" style="font-size: 0.8rem;">${status.text}</span>
                            </div>
                            <div>
                                <h2 class="fw-bold text-dark mb-1">${s.lastName} ${s.firstName}</h2>
                                <h5 class="text-secondary fw-normal mb-3" style="font-style: italic;">${s.chineseLastName || ''}${s.chineseFirstName || ''}</h5>
                                <div class="d-flex flex-wrap text-secondary gap-3">
                                    <span class="bg-light px-3 py-1 rounded-pill small"><i class="fi fi-rr-id-card-clip-alt me-2 text-primary"></i>ID: <strong>${s.displayId}</strong></span>
                                    <span class="bg-light px-3 py-1 rounded-pill small"><i class="fi fi-rr-venus-mars me-2 text-info"></i> ${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</span>
                                    <span class="bg-light px-3 py-1 rounded-pill small"><i class="fi fi-rr-layers me-2 text-success"></i> ${s.studyLevel || 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 bg-light p-4 d-flex flex-column justify-content-center gap-2 border-start">
                             <button class="btn btn-warning btn-sm w-100 rounded-pill shadow-sm fw-bold border-0 text-dark transition-all hover-scale" onclick="showEditModal('${s.key}')">
                                <i class="fi fi-rr-pen-clip me-2"></i>កែប្រែ (Edit)
                            </button>
                             <button class="btn btn-primary btn-sm w-100 rounded-pill shadow-sm fw-bold border-0 transition-all hover-scale" onclick="openChangeClassModal('${s.key}')">
                                <i class="fi fi-rr-exchange me-2"></i>ប្តូរថ្នាក់ (Change Class)
                            </button>
                            <button class="btn btn-info btn-sm w-100 rounded-pill shadow-sm fw-bold border-0 text-white transition-all hover-scale" onclick="printPOSInvoice('${s.key}')">
                                <i class="fi fi-rr-print me-2"></i>វិក្កយបត្រ (POS)
                            </button>
                            ${remaining > 0 ? `
                            <button class="btn btn-success btn-sm w-100 rounded-pill shadow-sm fw-bold border-0 transition-all hover-scale" onclick="markAsPaid('${s.key}')">
                                <i class="fi fi-rr-money-bill-wave me-2"></i>បង់ប្រាក់ (Pay)
                            </button>` : ''}
                        </div>
                    </div>
                </div>
            </div>

            <!-- 2. Structured Information Sections (List Tables) -->
            <div class="row g-4 mb-4">
                <!-- Personal & Contact Info -->
                <div class="col-md-6">
                    <div class="card border-0 shadow-sm rounded-4 h-100">
                        <div class="card-header bg-white py-3 fw-bold border-0 d-flex justify-content-between align-items-center">
                            <span><i class="fi fi-rr-user text-primary me-2"></i>ព័ត៌មានផ្ទាល់ខ្លួន & ទំនាក់ទំនង</span>
                            <button class="btn btn-sm btn-light rounded-circle" onclick="showEditModal('${s.key}')"><i class="fi fi-rr-pen-clip text-primary"></i></button>
                        </div>
                        <div class="card-body p-0">
                            <table class="table table-sm table-borderless mb-0">
                                <tbody class="dynamic-info-list">
                                    <tr class="border-bottom border-light">
                                        <td class="ps-4 py-3 text-muted small w-40">ថ្ងៃខែឆ្នាំកំណើត</td>
                                        <td class="pe-4 py-3 fw-bold text-end">${convertToKhmerDate(s.dob)}</td>
                                    </tr>
                                    <tr class="border-bottom border-light">
                                        <td class="ps-4 py-3 text-muted small">ទូរស័ព្ទផ្ទាល់ខ្លួន</td>
                                        <td class="pe-4 py-3 fw-bold text-end text-primary">${s.personalPhone || '-'}</td>
                                    </tr>
                                    <tr class="border-bottom border-light">
                                        <td class="ps-4 py-3 text-muted small">ជំនាន់ (Gen)</td>
                                        <td class="pe-4 py-3 fw-bold text-end">${s.generation || '-'}</td>
                                    </tr>
                                    <tr>
                                        <td class="ps-4 py-3 text-muted small">អាសយដ្ឋាន</td>
                                        <td class="pe-4 py-3 fw-bold text-end small">${s.address || s.studentAddress || 'មិនមាន'}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Academic Info -->
                <div class="col-md-6">
                    <div class="card border-0 shadow-sm rounded-4 h-100">
                        <div class="card-header bg-white py-3 fw-bold border-0 d-flex justify-content-between align-items-center">
                            <span><i class="fi fi-rr-graduation-cap text-success me-2"></i>ព័ត៌មានការសិក្សា (Academic)</span>
                            <button class="btn btn-sm btn-light rounded-circle" onclick="openChangeClassModal('${s.key}')"><i class="fi fi-rr-pen-clip text-success"></i></button>
                        </div>
                        <div class="card-body p-0">
                            <table class="table table-sm table-borderless mb-0">
                                <tbody class="dynamic-info-list">
                                    <tr class="border-bottom border-light">
                                        <td class="ps-4 py-3 text-muted small w-40">កម្រិតសិក្សា</td>
                                        <td class="pe-4 py-3 fw-bold text-end"><span class="badge bg-success bg-opacity-10 text-success">${s.studyLevel || 'N/A'}</span></td>
                                    </tr>
                                    <tr class="border-bottom border-light">
                                        <td class="ps-4 py-3 text-muted small">ម៉ោងសិក្សា</td>
                                        <td class="pe-4 py-3 fw-bold text-end">${s.studyTime || '-'}</td>
                                    </tr>
                                    <tr class="border-bottom border-light">
                                        <td class="ps-4 py-3 text-muted small">មុខវិជ្ជា</td>
                                        <td class="pe-4 py-3 fw-bold text-end">${s.subject || 'N/A'}</td>
                                    </tr>
                                    <tr>
                                        <td class="ps-4 py-3 text-muted small">គ្រូបង្រៀន</td>
                                        <td class="pe-4 py-3 fw-bold text-end">${s.teacherName || 'N/A'}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Guardian Info -->
                <div class="col-md-6">
                    <div class="card border-0 shadow-sm rounded-4 h-100">
                        <div class="card-header bg-white py-3 fw-bold border-0 d-flex justify-content-between align-items-center">
                            <span><i class="fi fi-rr-users text-warning me-2"></i>ព័ត៌មានអាណាព្យាបាល (Guardian)</span>
                            <button class="btn btn-sm btn-light rounded-circle" onclick="showEditModal('${s.key}')"><i class="fi fi-rr-pen-clip text-warning"></i></button>
                        </div>
                        <div class="card-body p-0">
                            <table class="table table-sm table-borderless mb-0">
                                <tbody class="dynamic-info-list">
                                    <tr class="border-bottom border-light">
                                        <td class="ps-4 py-3 text-muted small w-40">ឈ្មោះឪពុក</td>
                                        <td class="pe-4 py-3 fw-bold text-end">${s.fatherName || '-'}</td>
                                    </tr>
                                    <tr class="border-bottom border-light">
                                        <td class="ps-4 py-3 text-muted small">លេខឪពុក</td>
                                        <td class="pe-4 py-3 fw-bold text-end">${s.fatherPhone || '-'}</td>
                                    </tr>
                                    <tr class="border-bottom border-light">
                                        <td class="ps-4 py-3 text-muted small">ឈ្មោះម្តាយ</td>
                                        <td class="pe-4 py-3 fw-bold text-end">${s.motherName || '-'}</td>
                                    </tr>
                                    <tr>
                                        <td class="ps-4 py-3 text-muted small">លេខម្តាយ</td>
                                        <td class="pe-4 py-3 fw-bold text-end">${s.motherPhone || '-'}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Financial Brief -->
                <div class="col-md-6">
                    <div class="card border-0 shadow-sm rounded-4 h-100">
                        <div class="card-header bg-white py-3 fw-bold border-0 d-flex justify-content-between align-items-center">
                            <span><i class="fi fi-rr-hand-holding-usd text-danger me-2"></i>សង្ខេបហិរញ្ញវត្ថុ</span>
                            <button class="btn btn-sm btn-light rounded-circle" onclick="markAsPaid('${s.key}')"><i class="fi fi-rr-plus text-danger"></i></button>
                        </div>
                        <div class="card-body p-0">
                             <table class="table table-sm table-borderless mb-0">
                                <tbody class="dynamic-info-list">
                                    <tr class="border-bottom border-light">
                                        <td class="ps-4 py-3 text-muted small w-40">ថ្លៃសិក្សាសរុប</td>
                                        <td class="pe-4 py-3 fw-bold text-end h5 mb-0">$${total.toFixed(2)}</td>
                                    </tr>
                                    <tr class="border-bottom border-light text-success">
                                        <td class="ps-4 py-3 small">បានបង់សរុប</td>
                                        <td class="pe-4 py-3 fw-bold text-end">$${paid.toFixed(2)}</td>
                                    </tr>
                                    <tr class="border-bottom border-light text-danger">
                                        <td class="ps-4 py-3 small">នៅជំណាក់ (ខ្វះ)</td>
                                        <td class="pe-4 py-3 fw-bold text-end">$${remaining.toFixed(2)}</td>
                                    </tr>
                                    <tr class="text-warning">
                                        <td class="ps-4 py-3 small">ថ្ងៃត្រូវបង់បន្ទាប់</td>
                                        <td class="pe-4 py-3 fw-bold text-end">${(s.dueDate || s.nextPaymentDate) ? convertToKhmerDate(s.dueDate || s.nextPaymentDate) : 'N/A'}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 3. Dynamic Action Grid (Attendance, scores, etc) -->
            <div class="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
                <div class="card-body p-0">
                    <div class="row g-0 text-center">
                        <div class="col border-end p-3 transition-all hover-bg-light cursor-pointer" onclick="openAttendanceModal('${s.key}')">
                            <div class="bg-danger bg-opacity-10 rounded-circle d-inline-flex p-3 mb-2">
                                <i class="fi fi-rr-clipboard-list text-danger"></i>
                            </div>
                            <h6 class="fw-bold small mb-1">អវត្តមាន</h6>
                            <span class="badge bg-danger rounded-pill">${Object.keys(s.attendance || {}).length}</span>
                        </div>
                        <div class="col border-end p-3 transition-all hover-bg-light cursor-pointer" onclick="openScoresModal('${s.key}')">
                            <div class="bg-info bg-opacity-10 rounded-circle d-inline-flex p-3 mb-2">
                                <i class="fi fi-rr-stats text-info"></i>
                            </div>
                            <h6 class="fw-bold small mb-1">ពិន្ទុ</h6>
                            <span class="badge bg-info text-dark rounded-pill">${calculateAverageScore(s)}%</span>
                        </div>
                        <div class="col border-end p-3 transition-all hover-bg-light cursor-pointer" onclick="openMonthlyPaymentModal('${s.key}')">
                            <div class="bg-primary bg-opacity-10 rounded-circle d-inline-flex p-3 mb-2">
                                <i class="fi fi-rr-calendar-check text-primary"></i>
                            </div>
                            <h6 class="fw-bold small mb-1">បង់តាមខែ</h6>
                        </div>
                        <div class="col p-3 transition-all hover-bg-light cursor-pointer" onclick="openAdditionalPaymentModal('${s.key}')">
                            <div class="bg-success bg-opacity-10 rounded-circle d-inline-flex p-3 mb-2">
                                <i class="fi fi-rr-hand-holding-usd text-success"></i>
                            </div>
                            <h6 class="fw-bold small mb-1">បង់បន្ថែម</h6>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 4. Payment History Tabs -->
            <div class="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
                <div class="card-header bg-white border-0 py-3 d-flex justify-content-between align-items-center">
                    <span class="fw-bold"><i class="fi fi-rr-time-past text-secondary me-2"></i>ប្រវត្តិការបង់ប្រាក់រាយ</span>
                    <ul class="nav nav-pills bg-light p-1 rounded-pill" id="paymentTabs" role="tablist">
                        <li class="nav-item"><button class="nav-link active rounded-pill py-1 px-3 small" data-bs-toggle="pill" data-bs-target="#tab-monthly">តាមខែ</button></li>
                        <li class="nav-item"><button class="nav-link rounded-pill py-1 px-3 small" data-bs-toggle="pill" data-bs-target="#tab-installments">រំលស់</button></li>
                        <li class="nav-item"><button class="nav-link rounded-pill py-1 px-3 small" data-bs-toggle="pill" data-bs-target="#tab-additional">ផ្សេងៗ</button></li>
                    </ul>
                </div>
                <div class="card-body p-0">
                    <div class="tab-content" id="paymentTabsContent">
                        <div class="tab-pane fade show active" id="tab-monthly" role="tabpanel">
                            <div class="table-responsive">
                                <table class="table table-hover mb-0 small">
                                    <thead class="table-light">
                                        <tr><th class="ps-4">កាលបរិច្ឆេទ</th><th>ចំនួនខែ</th><th>ទឹកប្រាក់</th><th>ថ្ងៃផុតកំណត់ថ្មី</th><th>សម្មាល់</th><th class="text-center">សកម្មភាព</th></tr>
                                    </thead>
                                    <tbody>${renderMonthlyPaymentRows(s)}</tbody>
                                </table>
                            </div>
                        </div>
                        <div class="tab-pane fade" id="tab-installments" role="tabpanel">
                            <div class="table-responsive">
                                <table class="table table-hover mb-0 small">
                                    <thead class="table-light">
                                        <tr><th class="ps-4">លើកទី</th><th>ថ្ងៃបង់</th><th>ទឹកប្រាក់</th><th>កំណត់សម្គាល់</th><th class="text-center">សកម្មភាព</th></tr>
                                    </thead>
                                    <tbody>${renderInstallmentRows(s)}</tbody>
                                </table>
                            </div>
                        </div>
                        <div class="tab-pane fade" id="tab-additional" role="tabpanel">
                            <div class="table-responsive">
                                <table class="table table-hover mb-0 small">
                                    <thead class="table-light">
                                        <tr><th class="ps-4">កាលបរិច្ឆេទ</th><th>ប្រភេទ</th><th>ទឹកប្រាក់</th><th>សម្គាល់</th><th class="text-center">សកម្មភាព</th></tr>
                                    </thead>
                                    <tbody>${renderAdditionalPaymentRows(s)}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;

    function renderInstallmentRows(student) {
        let rows = '';
        if (!student.installments) {
            const initial = parseFloat(student.initialPayment) || 0;
            if (initial > 0) {
                rows = `<tr>
                    <td class="ps-4 fw-bold">1</td>
                    <td>${convertToKhmerDate(student.startDate)}</td>
                    <td class="fw-bold text-success">$${initial.toFixed(2)}</td>
                    <td class="text-muted">បង់ដំបូង</td>
                    <td class="text-center text-muted small">ប្រព័ន្ធ (System)</td>
                </tr>`;
                return rows;
            }
            return `<tr><td colspan="5" class="text-center py-5 text-muted">មិនមានព័ត៌មានការបង់រំលស់ទេ</td></tr>`;
        }

        const installments = Object.entries(student.installments);
        if (installments.length === 0) {
            return `<tr><td colspan="5" class="text-center py-5 text-muted">មិនមានព័ត៌មានការបង់រំលស់ទេ</td></tr>`;
        }

        return installments.map(([key, inst], index) => `
            <tr>
                <td class="ps-4 fw-bold">${inst.stage || (index + 1)}</td>
                <td>${convertToKhmerDate(inst.date)}</td>
                <td class="fw-bold text-dark">$${(parseFloat(inst.amount) || 0).toFixed(2)}</td>
                <td class="text-muted text-truncate" style="max-width: 150px;">${inst.note || inst.receiver || '-'}</td>
                <td class="text-center">
                    <button class="btn btn-sm text-primary" onclick="editPaymentItem('${student.key}', 'installments', '${key}')"><i class="fi fi-rr-edit"></i></button>
                    <button class="btn btn-sm text-danger" onclick="deletePaymentItem('${student.key}', 'installments', '${key}')"><i class="fi fi-rr-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    function renderMonthlyPaymentRows(student) {
        if (!student.monthlies) return `<tr><td colspan="6" class="text-center py-5 text-muted">មិនមានព័ត៌មានការបង់តាមខែទេ</td></tr>`;
        const monthlies = Object.entries(student.monthlies).sort((a, b) => new Date(b[1].date) - new Date(a[1].date));
        if (monthlies.length === 0) return `<tr><td colspan="6" class="text-center py-5 text-muted">មិនមានព័ត៌មានការបង់តាមខែទេ</td></tr>`;
        return monthlies.map(([key, m]) => `
            <tr>
                <td class="ps-4 fw-bold text-dark">${convertToKhmerDate(m.date)}</td>
                <td class="text-center"><span class="badge bg-primary rounded-pill px-3">${m.months} ខែ</span></td>
                <td class="fw-bold text-success">$${(parseFloat(m.amount) || 0).toFixed(2)}</td>
                <td class="text-danger fw-bold">${convertToKhmerDate(m.nextDueDate)}</td>
                <td class="text-muted small">${m.note || '-'}</td>
                <td class="text-center">
                    <button class="btn btn-sm text-primary" onclick="editPaymentItem('${student.key}', 'monthlies', '${key}')"><i class="fi fi-rr-edit"></i></button>
                    <button class="btn btn-sm text-danger" onclick="deletePaymentItem('${student.key}', 'monthlies', '${key}')"><i class="fi fi-rr-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    function renderAdditionalPaymentRows(student) {
        if (!student.additionalPayments) return `<tr><td colspan="5" class="text-center py-5 text-muted">មិនមានព័ត៌មានការបង់ផ្សេងៗទេ</td></tr>`;
        const adds = Object.entries(student.additionalPayments).sort((a, b) => new Date(b[1].date) - new Date(a[1].date));
        if (adds.length === 0) return `<tr><td colspan="5" class="text-center py-5 text-muted">មិនមានព័ត៌មានការបង់ផ្សេងៗទេ</td></tr>`;
        return adds.map(([key, a]) => `
            <tr>
                <td class="ps-4 fw-bold text-dark">${convertToKhmerDate(a.date)}</td>
                <td><span class="badge bg-info text-dark rounded-pill">${a.title || 'ផ្សេងៗ'}</span></td>
                <td class="fw-bold text-primary">$${(parseFloat(a.amount) || 0).toFixed(2)}</td>
                <td class="text-muted small">${a.note || '-'}</td>
                <td class="text-center">
                    <button class="btn btn-sm text-primary" onclick="editPaymentItem('${student.key}', 'additionalPayments', '${key}')"><i class="fi fi-rr-edit"></i></button>
                    <button class="btn btn-sm text-danger" onclick="deletePaymentItem('${student.key}', 'additionalPayments', '${key}')"><i class="fi fi-rr-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    function calculateAverageScore(student) {
        if (!student.scores) return 0;
        const scores = Object.values(student.scores);
        if (scores.length === 0) return 0;
        const sum = scores.reduce((acc, curr) => acc + (parseFloat(curr.score) || 0), 0);
        return (sum / scores.length).toFixed(1);
    }

    const modalEl = document.getElementById('studentDetailsModal');
    const modalContent = document.getElementById('modalBodyContent');
    if (modalContent) {
        modalContent.innerHTML = bodyContent;
        if (!studentDetailsModal) {
            studentDetailsModal = new bootstrap.Modal(modalEl, {
                backdrop: 'static',
                keyboard: false
            });
        }

        // Remove aria-hidden before showing to avoid focus conflict
        modalEl.removeAttribute('aria-hidden');
        studentDetailsModal.show();
    }
    showLoading(false);
}

// Logic for Deleting & Editing Payment Items
async function deletePaymentItem(studentKey, type, itemKey) {
    const result = await Swal.fire({
        title: 'តើអ្នកប្រាកដទេ?',
        text: "ទិន្នន័យនេះនឹងត្រូវលុបចេញជារៀងរហូត!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'យល់ព្រមលុប',
        cancelButtonText: 'បោះបង់'
    });

    if (result.isConfirmed) {
        showLoading(true);
        try {
            await database.ref(`students/${studentKey}/${type}/${itemKey}`).remove();
            showAlert('លុបទិន្នន័យបានជោគជ័យ', 'success');
            viewStudentDetails(studentKey); // Refresh
        } catch (error) {
            showAlert('Error: ' + error.message, 'danger');
        } finally {
            showLoading(false);
        }
    }
}

async function editPaymentItem(studentKey, type, itemKey) {
    const student = allStudentsData[studentKey];
    const item = student[type][itemKey];

    let html = '';
    if (type === 'monthlies') {
        html = `
            <input id="swal-date" class="swal2-input" type="date" value="${item.date}">
            <input id="swal-amount" class="swal2-input" type="number" step="0.01" value="${item.amount}" placeholder="Amount">
            <input id="swal-months" class="swal2-input" type="number" value="${item.months}" placeholder="Months">
            <input id="swal-note" class="swal2-input" type="text" value="${item.note || ''}" placeholder="Note">
        `;
    } else if (type === 'installments' || type === 'additionalPayments') {
        html = `
            <input id="swal-date" class="swal2-input" type="date" value="${item.date}">
            <input id="swal-amount" class="swal2-input" type="number" step="0.01" value="${item.amount}" placeholder="Amount">
            <input id="swal-note" class="swal2-input" type="text" value="${item.note || item.title || ''}" placeholder="Note/Title">
        `;
    }

    const { value: formValues } = await Swal.fire({
        title: 'កែប្រែទិន្នន័យបង់ប្រាក់',
        html: html,
        focusConfirm: false,
        showCancelButton: true,
        preConfirm: () => {
            const updates = {
                date: document.getElementById('swal-date').value,
                amount: parseFloat(document.getElementById('swal-amount').value),
                note: document.getElementById('swal-note').value
            };
            if (type === 'monthlies') {
                updates.months = parseInt(document.getElementById('swal-months').value);
            }
            return updates;
        }
    });

    if (formValues) {
        showLoading(true);
        try {
            await database.ref(`students/${studentKey}/${type}/${itemKey}`).update(formValues);
            showAlert('ធ្វើបច្ចុប្បន្នភាពបានជោគជ័យ', 'success');
            viewStudentDetails(studentKey);
        } catch (error) {
            showAlert('Error: ' + error.message, 'danger');
        } finally {
            showLoading(false);
        }
    }
}

// --- New Academic Feature Functions ---

function openChangeClassModal(studentKey) {
    const s = allStudentsData[studentKey];
    if (!s) return;

    document.getElementById('cc_studentKey').value = studentKey;
    document.getElementById('cc_studyLevel').value = s.studyLevel || '';
    document.getElementById('cc_subject').value = s.subject || '';
    document.getElementById('cc_studyTime').value = s.studyTime || '';
    document.getElementById('cc_teacherName').value = s.teacherName || '';

    const modalEl = document.getElementById('changeClassModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });

    modalEl.removeAttribute('aria-hidden');
    modal.show();
}

document.getElementById('changeClassForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const key = document.getElementById('cc_studentKey').value;
    const updates = {
        studyLevel: document.getElementById('cc_studyLevel').value,
        subject: document.getElementById('cc_subject').value,
        studyTime: document.getElementById('cc_studyTime').value,
        teacherName: document.getElementById('cc_teacherName').value
    };

    showLoading(true);
    database.ref('students/' + key).update(updates)
        .then(() => {
            showAlert('ប្តូរថ្នាក់បានជោគជ័យ!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('changeClassModal')).hide();
            // Refresh details if open
            viewStudentDetails(key);
        })
        .catch(err => showAlert(err.message, 'danger'))
        .finally(() => showLoading(false));
});

function openAttendanceModal(studentKey) {
    const s = allStudentsData[studentKey];
    if (!s) return;

    document.getElementById('att_studentKey').value = studentKey;
    document.getElementById('att_date').value = new Date().toISOString().split('T')[0];

    renderAttendanceList(studentKey);

    const modalEl = document.getElementById('attendanceModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });

    modalEl.removeAttribute('aria-hidden');
    modal.show();
}

function renderAttendanceList(studentKey) {
    const s = allStudentsData[studentKey];
    const tbody = document.getElementById('attendanceListBody');
    const totalEl = document.getElementById('att_totalAbsences');

    if (!s || !tbody) return;

    const attendances = s.attendance ? Object.entries(s.attendance) : [];
    if (attendances.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-muted">មិនទាន់មានទិន្នន័យអវត្តមានទេ</td></tr>`;
        totalEl.textContent = '0';
    } else {
        // Sort by date desc
        attendances.sort((a, b) => new Date(b[1].date) - new Date(a[1].date));

        tbody.innerHTML = attendances.map(([key, at]) => `
            <tr>
                <td class="fw-bold text-dark">${convertToKhmerDate(at.date)}</td>
                <td><span class="badge ${at.reason === 'ឈឺ' ? 'bg-primary' : at.reason === 'ច្បាប់' ? 'bg-warning text-dark' : 'bg-danger'}">${at.reason || 'អវត្តមាន'}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm text-primary" onclick="editAttendance('${studentKey}', '${key}')">
                        <i class="fi fi-rr-edit"></i>
                    </button>
                    <button class="btn btn-sm text-danger" onclick="deleteAttendance('${studentKey}', '${key}')">
                        <i class="fi fi-rr-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        totalEl.textContent = attendances.length;
    }
}

document.getElementById('markAttendanceForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const key = document.getElementById('att_studentKey').value;
    const newAtt = {
        date: document.getElementById('att_date').value,
        reason: document.getElementById('att_reason').value,
        note: document.getElementById('att_note').value,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    database.ref('students/' + key + '/attendance').push(newAtt)
        .then(() => {
            showAlert('កត់ត្រាអវត្តមានជោគជ័យ', 'success');
            document.getElementById('att_note').value = '';
            renderAttendanceList(key);
            // Also refresh student details if open
            viewStudentDetails(key);
        })
        .catch(err => showAlert(err.message, 'danger'));
});

async function deleteAttendance(studentKey, attKey) {
    const result = await Swal.fire({
        title: 'តើអ្នកប្រាកដទេ?',
        text: "អវត្តមាននេះនឹងត្រូវលុបចេញ!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'យល់ព្រមលុប',
        cancelButtonText: 'បោះបង់'
    });

    if (result.isConfirmed) {
        database.ref('students/' + studentKey + '/attendance/' + attKey).remove()
            .then(() => {
                showAlert('លុបជោគជ័យ', 'success');
                renderAttendanceList(studentKey);
                viewStudentDetails(studentKey);
            });
    }
}

async function editAttendance(studentKey, attKey) {
    const at = allStudentsData[studentKey].attendance[attKey];
    const { value: formValues } = await Swal.fire({
        title: 'កែប្រែអវត្តមាន',
        html: `
            <input id="swal-date" class="swal2-input" type="date" value="${at.date}">
            <select id="swal-reason" class="swal2-input">
                <option value="ឈឺ" ${at.reason === 'ឈឺ' ? 'selected' : ''}>ឈឺ (Sick)</option>
                <option value="ច្បាប់" ${at.reason === 'ច្បាប់' ? 'selected' : ''}>ច្បាប់ (Permission)</option>
                <option value="អវត្តមាន" ${at.reason === 'អវត្តមាន' ? 'selected' : ''}>អវត្តមាន (Absent)</option>
            </select>
            <input id="swal-note" class="swal2-input" type="text" value="${at.note || ''}" placeholder="Note">
        `,
        focusConfirm: false,
        showCancelButton: true,
        preConfirm: () => {
            return {
                date: document.getElementById('swal-date').value,
                reason: document.getElementById('swal-reason').value,
                note: document.getElementById('swal-note').value
            }
        }
    });

    if (formValues) {
        database.ref('students/' + studentKey + '/attendance/' + attKey).update(formValues)
            .then(() => {
                showAlert('កែប្រែបានជោគជ័យ', 'success');
                renderAttendanceList(studentKey);
                viewStudentDetails(studentKey);
            });
    }
}

function openScoresModal(studentKey) {
    const s = allStudentsData[studentKey];
    if (!s) return;

    document.getElementById('score_studentKey').value = studentKey;
    const currentMonth = new Date().toLocaleString('km-KH', { month: 'long' });
    document.getElementById('score_month').value = currentMonth;

    renderScoresList(studentKey);

    const modalEl = document.getElementById('scoresModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });

    modalEl.removeAttribute('aria-hidden');
    modal.show();
}

function renderScoresList(studentKey) {
    const s = allStudentsData[studentKey];
    const tbody = document.getElementById('scoresListBody');
    if (!s || !tbody) return;

    const scores = s.scores ? Object.entries(s.scores) : [];
    if (scores.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted">មិនទាន់មានទិន្នន័យពិន្ទុទេ</td></tr>`;
    } else {
        scores.sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
        tbody.innerHTML = scores.map(([key, sc]) => `
            <tr>
                <td class="fw-bold">${sc.month}</td>
                <td class="text-center fw-bold text-primary">${sc.score}%</td>
                <td class="text-center"><span class="badge bg-light text-dark border">${sc.grade || '-'}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm text-primary" onclick="editScore('${studentKey}', '${key}')">
                        <i class="fi fi-rr-edit"></i>
                    </button>
                    <button class="btn btn-sm text-danger" onclick="deleteScore('${studentKey}', '${key}')">
                        <i class="fi fi-rr-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }
}

document.getElementById('addScoreForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const key = document.getElementById('score_studentKey').value;
    const scoreVal = parseFloat(document.getElementById('score_value').value);

    if (scoreVal < 0 || scoreVal > 100) {
        return showAlert('ពិន្ទុត្រូវនៅចន្លោះ 0 ដល់ 100', 'warning');
    }

    const newScore = {
        month: document.getElementById('score_month').value,
        score: scoreVal,
        grade: document.getElementById('score_grade').value,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    database.ref('students/' + key + '/scores').push(newScore)
        .then(() => {
            showAlert('រក្សាទុកពិន្ទុជោគជ័យ', 'success');
            document.getElementById('score_value').value = '';
            document.getElementById('score_grade').value = '';
            renderScoresList(key);
            viewStudentDetails(key);
        })
        .catch(err => showAlert(err.message, 'danger'));
});

async function deleteScore(studentKey, scoreKey) {
    const result = await Swal.fire({
        title: 'តើអ្នកប្រាកដទេ?',
        text: "ពិន្ទុនេះនឹងត្រូវលុបចេញ!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'យល់ព្រមលុប',
        cancelButtonText: 'បោះបង់'
    });

    if (result.isConfirmed) {
        database.ref('students/' + studentKey + '/scores/' + scoreKey).remove()
            .then(() => {
                showAlert('លុបជោគជ័យ', 'success');
                renderScoresList(studentKey);
                viewStudentDetails(studentKey);
            });
    }
}

async function editScore(studentKey, scoreKey) {
    const sc = allStudentsData[studentKey].scores[scoreKey];
    const { value: formValues } = await Swal.fire({
        title: 'កែប្រែពិន្ទុ',
        html: `
            <input id="swal-month" class="swal2-input" type="text" value="${sc.month}" placeholder="Month">
            <input id="swal-score" class="swal2-input" type="number" value="${sc.score}" placeholder="Score">
            <input id="swal-grade" class="swal2-input" type="text" value="${sc.grade || ''}" placeholder="Grade">
        `,
        focusConfirm: false,
        showCancelButton: true,
        preConfirm: () => {
            return {
                month: document.getElementById('swal-month').value,
                score: parseFloat(document.getElementById('swal-score').value),
                grade: document.getElementById('swal-grade').value
            }
        }
    });

    if (formValues) {
        database.ref('students/' + studentKey + '/scores/' + scoreKey).update(formValues)
            .then(() => {
                showAlert('កែប្រែបានជោគជ័យ', 'success');
                renderScoresList(studentKey);
                viewStudentDetails(studentKey);
            });
    }
}

function openMonthlyPaymentModal(studentKey) {
    const s = allStudentsData[studentKey];
    if (!s) return;

    document.getElementById('mp_studentKey').value = studentKey;
    document.getElementById('mp_date').value = new Date().toISOString().split('T')[0];
    document.getElementById('mp_amount').value = s.tuitionFee || '';
    document.getElementById('mp_note').value = '';

    const modalEl = document.getElementById('monthlyPaymentModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });

    modalEl.removeAttribute('aria-hidden');
    modal.show();
}

document.getElementById('monthlyPaymentForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const key = document.getElementById('mp_studentKey').value;
    const months = parseInt(document.getElementById('mp_months').value);
    const amount = parseFloat(document.getElementById('mp_amount').value);
    const date = document.getElementById('mp_date').value;
    const note = document.getElementById('mp_note').value;
    const s = allStudentsData[key];

    if (amount <= 0) return showAlert('ចំនួនទឹកប្រាក់ត្រូវតែធំជាង 0', 'warning');

    // Calculate next due date
    let currentDueDate = s.dueDate || s.nextPaymentDate || new Date().toISOString().split('T')[0];
    let nextDate = '';
    const engDate = convertToEnglishDate(currentDueDate);

    if (engDate) {
        const d = new Date(engDate);
        d.setMonth(d.getMonth() + months);
        nextDate = d.toISOString().split('T')[0];
    } else {
        const d = new Date(currentDueDate);
        if (isNaN(d.getTime())) {
            const today = new Date();
            today.setMonth(today.getMonth() + months);
            nextDate = today.toISOString().split('T')[0];
        } else {
            d.setMonth(d.getMonth() + months);
            nextDate = d.toISOString().split('T')[0];
        }
    }

    const newPayment = {
        date: date,
        months: months,
        amount: amount,
        nextDueDate: nextDate,
        note: note,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    showLoading(true);
    // 1. Add to monthlies history
    database.ref('students/' + key + '/monthlies').push(newPayment)
        .then(() => {
            // 2. Update student status and due date
            return database.ref('students/' + key).update({
                paymentStatus: 'Paid',
                dueDate: nextDate,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
        })
        .then(() => {
            // 3. Record Transaction
            recordTransaction({
                type: 'income',
                amount: amount,
                date: date,
                categoryId: 'tuition',
                categoryName: 'ថ្លៃសិក្សា (Tuition Fee)',
                description: `បន្តថ្លៃសិក្សា (${months} ខែ): ${s.lastName} ${s.firstName} (${s.displayId})`,
                referenceId: s.displayId
            });

            showAlert('បន្តកាលបរិច្ឆេទសិក្សាជោគជ័យ', 'success');
            bootstrap.Modal.getInstance(document.getElementById('monthlyPaymentModal')).hide();
            viewStudentDetails(key);
        })
        .catch(err => showAlert(err.message, 'danger'))
        .finally(() => showLoading(false));
});

function openAdditionalPaymentModal(studentKey) {
    const s = allStudentsData[studentKey];
    if (!s) return;

    document.getElementById('ap_studentKey').value = studentKey;
    document.getElementById('ap_amount').value = '';
    document.getElementById('ap_note').value = '';

    const modalEl = document.getElementById('additionalPaymentModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });

    modalEl.removeAttribute('aria-hidden');
    modal.show();
}

document.getElementById('additionalPaymentForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const key = document.getElementById('ap_studentKey').value;
    const amount = parseFloat(document.getElementById('ap_amount').value);
    const type = document.getElementById('ap_type').value;
    const note = document.getElementById('ap_note').value;
    const s = allStudentsData[key];

    if (amount <= 0) return showAlert('ចំនួនទឹកប្រាក់ត្រូវតែធំជាង 0', 'warning');

    const newPayment = {
        title: type,
        amount: amount,
        note: note,
        date: new Date().toISOString()
    };

    showLoading(true);
    database.ref('students/' + key + '/additionalPayments').push(newPayment)
        .then(() => {
            // Also update total extra payment for student if needed, or just record transaction
            const currentExtra = parseFloat(s.extraPayment || 0);
            return database.ref('students/' + key).update({
                extraPayment: currentExtra + amount,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
        })
        .then(() => {
            // Record Income Transaction
            recordTransaction({
                type: 'income',
                amount: amount,
                date: new Date().toISOString().split('T')[0],
                categoryId: 'other_income',
                categoryName: 'ចំណូលផ្សេងៗ (Other Income)',
                description: `បង់ថ្លៃ${type}: ${s.lastName} ${s.firstName} (${s.displayId})`,
                referenceId: s.displayId
            });

            showAlert('បង់ប្រាក់បន្ថែមបានជោគជ័យ', 'success');
            bootstrap.Modal.getInstance(document.getElementById('additionalPaymentModal')).hide();
            viewStudentDetails(key);
        })
        .catch(err => showAlert(err.message, 'danger'))
        .finally(() => showLoading(false));
});

// ----------------------------------------------------
// Edit Logic
// ----------------------------------------------------

function showEditModal(key) {
    const student = allStudentsData[key];
    if (student) {
        createEditModal(student);
    } else {
        showAlert('រកមិនឃើញទិន្នន័យសិស្ស!', 'danger');
    }
}

function createEditModal(studentData) {
    const studentKey = studentData.key;
    const modalId = 'editStudentModal';
    let existingModal = document.getElementById(modalId);
    if (existingModal) {
        const modal = bootstrap.Modal.getInstance(existingModal);
        if (modal) modal.dispose();
        existingModal.remove();
    }

    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-xl modal-dialog-centered">
                <div class="modal-content border-0 shadow-lg" style="border-radius: 20px; overflow: hidden;">
                    <!-- Modern Header -->
                    <div class="modal-header border-0 p-4 text-white" style="background: linear-gradient(135deg, #2C0157 0%, #4a148c 100%);">
                        <div class="d-flex align-items-center">
                            <div>
                                <h4 class="modal-title fw-bold mb-0">កែប្រែព័ត៌មានសិស្ស (Edit Student)</h4>
                                <small class="opacity-75">ID: ${studentData.displayId || 'N/A'} - ${studentData.lastName || ''} ${studentData.firstName || ''}</small>
                            </div>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>

                    <!-- Custom Tab Navigation -->
                    <div class="bg-white px-4 border-bottom">
                        <ul class="nav nav-pills modal-nav-tabs" id="editStudentTabs" role="tablist">
                            <li class="nav-item" role="presentation">
                                <button class="nav-link active py-3" id="personal-tab" data-bs-toggle="tab" data-bs-target="#personal-pane" type="button" role="tab"><i class="fi fi-rr-user me-2"></i>ព័ត៌មានផ្ទាល់ខ្លួន</button>
                            </li>
                            <li class="nav-item" role="presentation">
                                <button class="nav-link py-3" id="academic-tab" data-bs-toggle="tab" data-bs-target="#academic-pane" type="button" role="tab"><i class="fi fi-rr-graduation-cap me-2"></i>ការសិក្សានិងហិរញ្ញវត្ថុ</button>
                            </li>
                        </ul>
                    </div>

                    <div class="modal-body p-0 bg-light">
                        <div class="tab-content" id="editStudentTabsContent">
                            <!-- Tab 1: Personal Information -->
                            <div class="tab-pane fade show active p-4" id="personal-pane" role="tabpanel">
                                <div class="row g-4">
                                    <div class="col-lg-12">
                                        <div class="card border-0 shadow-sm rounded-4 p-4">
                                            <h5 class="fw-bold mb-4 text-primary border-bottom pb-2"><i class="fi fi-rr-id-card-clip-alt me-2"></i>ព័ត៌មានក្នុងបញ្ជី (Identification)</h5>
                                            <div class="row g-3">
                                                <div class="col-md-3">
                                                    <label class="form-label small fw-bold text-muted"><i class="fi fi-rr-hashtag me-1"></i>អត្តលេខ (ID)</label>
                                                    <input type="text" class="form-control bg-light fw-bold" id="edit_displayId" value="${studentData.displayId || ''}" readonly>
                                                </div>
                                                <div class="col-md-4">
                                                    <label class="form-label small fw-bold text-muted"><i class="fi fi-rr-user me-1"></i>ឈ្មោះខ្មែរ (Full Name KH)</label>
                                                    <input type="text" class="form-control" id="edit_fullNameKhmer" value="${(studentData.lastName || '') + ' ' + (studentData.firstName || '')}">
                                                </div>
                                                <div class="col-md-5">
                                                    <label class="form-label small fw-bold text-muted"><i class="fi fi-rr-text me-1"></i>ឈ្មោះឡាតាំង (Full Name EN)</label>
                                                    <input type="text" class="form-control" id="edit_fullNameEnglish" value="${(studentData.englishLastName || '') + ' ' + (studentData.englishFirstName || '')}">
                                                </div>
                                                <div class="col-md-3">
                                                    <label class="form-label small fw-bold text-muted"><i class="fi fi-rr-venus-mars me-1"></i>ភេទ (Gender)</label>
                                                    <select class="form-select" id="edit_gender">
                                                        <option value="Male" ${studentData.gender === 'Male' ? 'selected' : ''}>ប្រុស (Male)</option>
                                                        <option value="Female" ${studentData.gender === 'Female' ? 'selected' : ''}>ស្រី (Female)</option>
                                                    </select>
                                                </div>
                                                <div class="col-md-3">
                                                    <label class="form-label small fw-bold text-muted"><i class="fi fi-rr-calendar me-1"></i>ថ្ងៃខែឆ្នាំកំណើត (DOB)</label>
                                                    <input type="text" class="form-control date-picker-modal" id="edit_dob" value="${studentData.dob || ''}">
                                                </div>
                                                <div class="col-md-3">
                                                    <label class="form-label small fw-bold text-muted"><i class="fi fi-rr-layers me-1"></i>ជំនាន់ (Gen)</label>
                                                    <input type="text" class="form-control" id="edit_generation" value="${studentData.generation || ''}">
                                                </div>
                                                <div class="col-md-3">
                                                    <label class="form-label small fw-bold text-muted"><i class="fi fi-rr-phone-call me-1"></i>លេខទូរស័ព្ទ</label>
                                                    <input type="text" class="form-control" id="edit_studentPhone" value="${studentData.studentPhone || ''}">
                                                </div>
                                                <div class="col-12">
                                                    <label class="form-label small fw-bold text-muted"><i class="fi fi-rr-marker me-1"></i>អាសយដ្ឋានបច្ចុប្បន្ន (Current Address)</label>
                                                    <input type="text" class="form-control" id="edit_studentAddress" value="${studentData.address || studentData.studentAddress || ''}">
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Guardian Section -->
                                    <div class="col-md-6">
                                        <div class="card border-0 shadow-sm rounded-4 p-4 h-100">
                                            <h5 class="fw-bold mb-4 text-info border-bottom pb-2"><i class="fi fi-rr-male me-2"></i>ព័ត៌មានឪពុក (Father's)</h5>
                                            <div class="row g-3">
                                                <div class="col-12"><label class="small fw-bold text-muted"><i class="fi fi-rr-portrait me-1"></i>ឈ្មោះ</label><input type="text" class="form-control" id="edit_fatherName" value="${studentData.fatherName || ''}"></div>
                                                <div class="col-6"><label class="small fw-bold text-muted"><i class="fi fi-rr-briefcase me-1"></i>មុខរបរ</label><input type="text" class="form-control" id="edit_fatherJob" value="${studentData.fatherJob || ''}"></div>
                                                <div class="col-6"><label class="small fw-bold text-muted"><i class="fi fi-rr-phone-call me-1"></i>លេខទូរស័ព្ទ</label><input type="text" class="form-control" id="edit_fatherPhone" value="${studentData.fatherPhone || ''}"></div>
                                                <div class="col-12"><label class="small fw-bold text-muted"><i class="fi fi-rr-marker me-1"></i>អាសយដ្ឋាន</label><textarea class="form-control" id="edit_fatherAddress" rows="1">${studentData.fatherAddress || ''}</textarea></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="card border-0 shadow-sm rounded-4 p-4 h-100">
                                            <h5 class="fw-bold mb-4 text-danger border-bottom pb-2"><i class="fi fi-rr-female me-2"></i>ព័ត៌មានម្តាយ (Mother's)</h5>
                                            <div class="row g-3">
                                                <div class="col-12"><label class="small fw-bold text-muted"><i class="fi fi-rr-portrait me-1"></i>ឈ្មោះ</label><input type="text" class="form-control" id="edit_motherName" value="${studentData.motherName || ''}"></div>
                                                <div class="col-6"><label class="small fw-bold text-muted"><i class="fi fi-rr-briefcase me-1"></i>មុខរបរ</label><input type="text" class="form-control" id="edit_motherJob" value="${studentData.motherJob || ''}"></div>
                                                <div class="col-6"><label class="small fw-bold text-muted"><i class="fi fi-rr-phone-call me-1"></i>លេខទូរស័ព្ទ</label><input type="text" class="form-control" id="edit_motherPhone" value="${studentData.motherPhone || ''}"></div>
                                                <div class="col-12"><label class="small fw-bold text-muted"><i class="fi fi-rr-marker me-1"></i>អាសយដ្ឋាន</label><textarea class="form-control" id="edit_motherAddress" rows="1">${studentData.motherAddress || ''}</textarea></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="text-end mt-4">
                                    <button class="btn btn-primary px-4 py-2 rounded-3 shadow-sm" type="button" onclick="document.getElementById('academic-tab').click()">
                                        បន្តទៅកាន់ហិរញ្ញវត្ថុ <i class="fi fi-rr-arrow-small-right ms-2"></i>
                                    </button>
                                </div>
                            </div>

                            <!-- Tab 2: Academic & Financial -->
                            <div class="tab-pane fade p-4" id="academic-pane" role="tabpanel">
                                <div class="row g-4">
                                    <!-- Academic Info -->
                                    <div class="col-md-12">
                                        <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
                                            <h5 class="fw-bold mb-4 text-success border-bottom pb-2"><i class="fi fi-rr-book-alt me-2"></i>ព័ត៌មានសិក្សា (Academic)</h5>
                                            <div class="row g-3">
                                                <div class="col-md-3"><label class="small fw-bold text-muted"><i class="fi fi-rr-graduation-cap me-1"></i>កម្រិតសិក្សា</label><input type="text" class="form-control fw-bold" id="edit_studyLevel" value="${studentData.studyLevel || ''}"></div>
                                                <div class="col-md-3"><label class="small fw-bold text-muted"><i class="fi fi-rr-book me-1"></i>មុខវិជ្ជា</label><input type="text" class="form-control" id="edit_subject" value="${studentData.subject || ''}"></div>
                                                <div class="col-md-3"><label class="small fw-bold text-muted"><i class="fi fi-rr-clock me-1"></i>ម៉ោងសិក្សា</label>
                                                    <select class="form-select fw-bold" id="edit_studyTime" onchange="toggleEditCustomStudyTime()">
                                                        <option value="">ជ្រើសរើសម៉ោង...</option>
                                                        <option value="8:00-10:30ថ្ងៃ" ${studentData.studyTime === '8:00-10:30ថ្ងៃ' ? 'selected' : ''}>8:00-10:30ថ្ងៃ</option>
                                                        <option value="1:00-3:30ល្ងាច" ${studentData.studyTime === '1:00-3:30ល្ងាច' ? 'selected' : ''}>1:00-3:30ល្ងាច</option>
                                                        <option value="1:00-2:00ល្ងាច" ${studentData.studyTime === '1:00-2:00ល្ងាច' ? 'selected' : ''}>1:00-2:00ល្ងាច</option>
                                                        <option value="2:00pm-3:00pm" ${studentData.studyTime === '2:00pm-3:00pm' ? 'selected' : ''}>2:00pm-3:00pm</option>
                                                        <option value="3:00pm-4:00pm" ${studentData.studyTime === '3:00pm-4:00pm' ? 'selected' : ''}>3:00pm-4:00pm</option>
                                                        <option value="5:00pm-6:00pm" ${studentData.studyTime === '5:00pm-6:00pm' ? 'selected' : ''}>5:00pm-6:00pm</option>
                                                        <option value="6:00pm-7:00pm" ${studentData.studyTime === '6:00pm-7:00pm' ? 'selected' : ''}>6:00pm-7:00pm</option>
                                                        <option value="7:00pm-8:00pm" ${studentData.studyTime === '7:00pm-8:00pm' ? 'selected' : ''}>7:00pm-8:00pm</option>
                                                        <option value="custom" ${['8:00-10:30ថ្ងៃ', '1:00-3:30ល្ងាច', '1:00-2:00ល្ងាច', '2:00pm-3:00pm', '3:00pm-4:00pm', '5:00pm-6:00pm', '6:00pm-7:00pm', '7:00pm-8:00pm'].includes(studentData.studyTime) || !studentData.studyTime ? '' : 'selected'}>បញ្ចូលម៉ោងផ្សេងៗ...</option>
                                                    </select>
                                                    <div id="editCustomStudyTimeContainer" class="mt-2" style="display: ${['8:00-10:30ថ្ងៃ', '1:00-3:30ល្ងាច', '1:00-2:00ល្ងាច', '2:00pm-3:00pm', '3:00pm-4:00pm', '5:00pm-6:00pm', '6:00pm-7:00pm', '7:00pm-8:00pm'].includes(studentData.studyTime) || !studentData.studyTime ? 'none' : 'block'};">
                                                        <input type="text" class="form-control" id="edit_customStudyTime" value="${studentData.studyTime || ''}" placeholder="បញ្ចូលម៉ោងសិក្សា...">
                                                    </div>
                                                </div>

                                                <div class="col-md-3"><label class="small fw-bold text-muted"><i class="fi fi-rr-chalkboard-user me-1"></i>គ្រូ</label><input type="text" class="form-control" id="edit_teacherName" value="${studentData.teacherName || ''}"></div>
                                                <div class="col-md-3">
                                                    <label class="small fw-bold text-muted"><i class="fi fi-rr-user me-1"></i>ស្ថានភាពសិស្ស</label>
                                                    <select class="form-select fw-bold" id="edit_status">
                                                        <option value="active" ${studentData.status === 'active' || !studentData.status ? 'selected' : ''}>កំពុងសិក្សា (Active)</option>
                                                        <option value="dropout" ${studentData.status === 'dropout' ? 'selected' : ''}>បោះបង់ការសិក្សា (Dropout)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Payment Plan -->
                                    <div class="col-lg-6">
                                        <div class="card border-0 shadow-sm rounded-4 p-4 mb-4 h-100">
                                            <h5 class="fw-bold mb-4 text-purple border-bottom pb-2"><i class="fi fi-rr-tags me-2"></i>ជ្រើសរើសកញ្ចប់ (Payment Plan)</h5>

                                            <div class="mb-4">
                                                <label class="small fw-bold text-muted d-block mb-2">ប្រភេទសិស្ស</label>
                                                <div class="btn-group w-100" role="group">
                                                    <input type="radio" class="btn-check" name="editStudentType" id="editTypeNew" value="new" ${!studentData.isOldStudent ? 'checked' : ''}>
                                                        <label class="btn btn-outline-primary py-3 fw-bold" for="editTypeNew">សិស្សថ្មី</label>
                                                        <input type="radio" class="btn-check" name="editStudentType" id="editTypeOld" value="old" ${studentData.isOldStudent ? 'checked' : ''}>
                                                            <label class="btn btn-outline-success py-3 fw-bold" for="editTypeOld">សិស្សចាស់</label>
                                                        </div>
                                                </div>

                                                <div class="row g-2 mb-4">
                                                    <div class="col-6"><input type="radio" class="btn-check" name="editPaymentOption" id="editOpt1" value="1" ${studentData.studyDuration == 1 ? 'checked' : ''}><label class="btn btn-outline-secondary w-100 py-2 rounded-3" for="editOpt1"><div class="fw-bold">1 ខែ</div><div class="badge bg-primary" id="priceDisplay1">$...</div></label></div>
                                                    <div class="col-6"><input type="radio" class="btn-check" name="editPaymentOption" id="editOpt3" value="3" ${studentData.studyDuration == 3 ? 'checked' : ''}><label class="btn btn-outline-secondary w-100 py-2 rounded-3" for="editOpt3"><div class="fw-bold">3 ខែ</div><div class="badge bg-success" id="priceDisplay3">$...</div></label></div>
                                                    <div class="col-6"><input type="radio" class="btn-check" name="editPaymentOption" id="editOpt6" value="6" ${studentData.studyDuration == 6 ? 'checked' : ''}><label class="btn btn-outline-secondary w-100 py-2 rounded-3" for="editOpt6"><div class="fw-bold">6 ខែ</div><div class="badge bg-info" id="priceDisplay6">$...</div></label></div>
                                                    <div class="col-6"><input type="radio" class="btn-check" name="editPaymentOption" id="editOpt12" value="12" ${studentData.studyDuration == 12 ? 'checked' : ''}><label class="btn btn-outline-secondary w-100 py-2 rounded-3" for="editOpt12"><div class="fw-bold">12 ខែ</div><div class="badge bg-warning text-dark" id="priceDisplay12">$...</div></label></div>
                                                </div>

                                                <div class="row g-3">
                                                    <div class="col-4"><label class="small fw-bold text-muted"><i class="fi fi-rr-calendar-plus me-1"></i>ចូលរៀន</label><input type="text" class="form-control date-picker-modal fw-bold" id="edit_startDate" value="${studentData.startDate || ''}"></div>
                                                    <div class="col-4"><label class="small fw-bold text-muted"><i class="fi fi-rr-calendar-check me-1"></i>ថ្ងៃបង់ប្រាក់</label><input type="text" class="form-control date-picker-modal fw-bold text-info" id="edit_paymentDate" value="${studentData.paymentDate || studentData.startDate || ''}"></div>
                                                    <div class="col-4"><label class="small fw-bold text-muted"><i class="fi fi-rr-calendar-xmark me-1"></i>ផុតកំណត់</label><input type="text" class="form-control date-picker-modal fw-bold text-danger" id="edit_dueDate" value="${studentData.dueDate || ''}"></div>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Financial & Summary -->
                                        <div class="col-lg-6">
                                            <div class="card border-0 shadow-sm rounded-4 p-4 h-100">
                                                <h5 class="fw-bold mb-4 text-orange border-bottom pb-2"><i class="fi fi-rr-money-bill-wave me-2"></i>ហិរញ្ញវត្ថុ និងសង្ខេប (Financial)</h5>
                                                <div class="row g-3 mb-4">
                                                    <div class="col-6"><label class="small fw-bold text-muted"><i class="fi fi-rr-dollar me-1"></i>ថ្លៃសិក្សា ($)</label><input type="number" step="0.01" class="form-control fw-bold border-primary shadow-sm" id="edit_tuitionFee" value="${studentData.tuitionFee || 0}"></div>
                                                    <div class="col-6"><label class="small fw-bold text-muted"><i class="fi fi-rr-calendar me-1"></i>រយៈពេល (ខែ)</label><input type="number" class="form-control fw-bold border-primary shadow-sm" id="edit_studyDuration" value="${studentData.studyDuration || 0}"></div>
                                                    <div class="col-6"><label class="small fw-bold text-muted"><i class="fi fi-rr-hand-holding-usd me-1"></i>បង់ដំបូង ($)</label><input type="number" step="0.01" class="form-control text-success fw-bold bg-success-subtle border-success" id="edit_initialPayment" value="${studentData.initialPayment || 0}"></div>
                                                    <div class="col-6"><label class="small fw-bold text-muted"><i class="fi fi-rr-money-check-edit me-1"></i>បង់បន្ថែម ($)</label><input type="number" step="0.01" class="form-control text-primary fw-bold" id="edit_extraPayment" value="${studentData.extraPayment || 0}"></div>
                                                    <div class="col-4"><label class="small fw-bold text-muted"><i class="fi fi-rr-label me-1"></i>បញ្ចុះ $</label><input type="number" step="0.01" class="form-control" id="edit_discountAmount" value="${studentData.discountAmount || 0}"></div>
                                                    <div class="col-4"><label class="small fw-bold text-muted"><i class="fi fi-rr-percentage me-1"></i>បញ្ចុះ %</label><input type="number" step="0.01" class="form-control" id="edit_discountPercent" value="${studentData.discountPercent || 0}"></div>
                                                    <div class="col-4"><label class="small fw-bold text-muted"><i class="fi fi-rr-info me-1"></i>ស្ថានភាព</label><select class="form-select fw-bold border-2" id="edit_paymentStatus"><option value="Paid" ${studentData.paymentStatus === 'Paid' ? 'selected' : ''}>✅ បង់រួច</option><option value="Pending" ${studentData.paymentStatus === 'Pending' ? 'selected' : ''}>⚠️ មិនទាន់បង់</option><option value="Installment" ${studentData.paymentStatus === 'Installment' ? 'selected' : ''}>🏦 នៅជំណាក់</option></select></div>
                                                </div>

                                                <div class="p-3 border-start border-4 border-primary rounded-end shadow-sm bg-white animate__animated animate__fadeIn">
                                                    <div class="d-flex justify-content-between mb-1"><span class="small text-muted">សរុបត្រូវបង់:</span><span class="fw-bold" id="editTotalToPayDisplay">$0.00</span></div>
                                                    <div class="d-flex justify-content-between mb-1 text-success"><span class="small">បង់បានសរុប:</span><span class="fw-bold" id="editTotalPaidDisplay">$0.00</span></div>
                                                    <hr class="my-2">
                                                        <div class="d-flex justify-content-between align-items-center"><span class="h5 mb-0 fw-bold">នៅខ្វះ (Balance):</span><span class="h4 mb-0 fw-bold" id="editBalanceDisplay">$0.00</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="modal-footer border-0 bg-white p-4 shadow-top">
                            <button type="button" class="btn btn-light px-4 py-2 rounded-pill border fw-bold me-auto" data-bs-dismiss="modal">បោះបង់ (Cancel)</button>
                            <button type="button" class="btn btn-success px-5 py-2 rounded-pill fw-bold shadow-lg shadow-success-subtle scale-up" onclick="saveStudentChanges('${studentKey}')">
                                <i class="fi fi-rr-check-circle me-2"></i> រក្សាទុកកែប្រែ (Save Changes)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = new bootstrap.Modal(document.getElementById(modalId));

    // Initialize Flatpickr and Add Logic
    const fpConfig = {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "j M Y",
        locale: typeof KhmerLocale !== 'undefined' ? KhmerLocale : "en"
    };

    if (typeof flatpickr !== 'undefined') {
        flatpickr(".date-picker-modal", fpConfig);
    } else {
        console.warn('Flatpickr not immediately available, retrying...');
        setTimeout(() => {
            if (typeof flatpickr !== 'undefined') flatpickr(".date-picker-modal", fpConfig);
        }, 500);
    }

    // Automation Logic
    const prices = {
        new: { "1": 55, "3": 110, "6": 198, "12": 358 },
        old: { "1": 40, "3": 100, "6": 180, "12": 268 }
    };

    function updatePriceLabels() {
        const typeEl = document.querySelector('input[name="editStudentType"]:checked');
        if (!typeEl) return;
        const type = typeEl.value;

        const p1 = document.getElementById('priceDisplay1');
        const p3 = document.getElementById('priceDisplay3');
        const p6 = document.getElementById('priceDisplay6');
        const p12 = document.getElementById('priceDisplay12');

        if (p1) p1.textContent = `$${prices[type]["1"]} `;
        if (p3) p3.textContent = `$${prices[type]["3"]} `;
        if (p6) p6.textContent = `$${prices[type]["6"]} `;
        if (p12) p12.textContent = `$${prices[type]["12"]} `;
    }

    function syncPlanToForm() {
        const type = document.querySelector('input[name="editStudentType"]:checked').value;
        const option = document.querySelector('input[name="editPaymentOption"]:checked');
        if (option) {
            const months = option.value;
            const fee = prices[type][months];
            document.getElementById('edit_tuitionFee').value = fee;
            document.getElementById('edit_studyDuration').value = months;
            calculateEditFormTotals();
            updateEditDueDate();
        }
    }

    // Event Listeners
    document.querySelectorAll('input[name="editStudentType"]').forEach(r => r.addEventListener('change', () => { updatePriceLabels(); syncPlanToForm(); }));
    document.querySelectorAll('input[name="editPaymentOption"]').forEach(r => r.addEventListener('change', syncPlanToForm));
    ['edit_tuitionFee', 'edit_initialPayment', 'edit_extraPayment', 'edit_studyDuration', 'edit_discountAmount', 'edit_discountPercent'].forEach(id => {
        document.getElementById(id).addEventListener('input', calculateEditFormTotals);
    });

    // Special Auto-Calculation for Due Date
    const editStartDateInput = document.getElementById('edit_startDate');
    if (editStartDateInput && editStartDateInput._flatpickr) {
        editStartDateInput._flatpickr.set('onChange', (selectedDates, dateStr) => {
            const paymentDateInput = document.getElementById('edit_paymentDate');
            if (paymentDateInput && !paymentDateInput.value) {
                const fpPay = paymentDateInput._flatpickr;
                if (fpPay) fpPay.setDate(dateStr);
            }
            updateEditDueDate();
        });
    }

    updatePriceLabels();
    calculateEditFormTotals();
    modal.show();
}

/**
 * Update Due Date based on Start Date and Duration in Edit Modal
 */
function updateEditDueDate() {
    const startDateVal = document.getElementById('edit_startDate').value;
    const durationMonths = parseInt(document.getElementById('edit_studyDuration').value) || 0;
    const dueDateInput = document.getElementById('edit_dueDate');

    if (!startDateVal || durationMonths <= 0 || !dueDateInput) return;

    const startDate = new Date(startDateVal);
    if (isNaN(startDate.getTime())) return;

    const dueDate = new Date(startDate);
    const expectedMonth = dueDate.getMonth() + durationMonths;
    dueDate.setMonth(expectedMonth);

    // Handle EOM cases
    if (dueDate.getMonth() > (expectedMonth % 12)) {
        dueDate.setDate(0);
    }

    const yyyy = dueDate.getFullYear();
    const mm = String(dueDate.getMonth() + 1).padStart(2, '0');
    const dd = String(dueDate.getDate()).padStart(2, '0');
    const formatted = `${yyyy} -${mm} -${dd} `;

    const fp = dueDateInput._flatpickr;
    if (fp) fp.setDate(formatted);
    else dueDateInput.value = formatted;
}

/**
 * Financial Calculation for Edit Modal
 */
function calculateEditFormTotals() {
    const tuition = parseFloat(document.getElementById('edit_tuitionFee').value) || 0;
    const duration = parseInt(document.getElementById('edit_studyDuration').value) || 1;
    const discountAmount = parseFloat(document.getElementById('edit_discountAmount').value) || 0;
    const discountPercent = parseFloat(document.getElementById('edit_discountPercent').value) || 0;
    const initialPayment = parseFloat(document.getElementById('edit_initialPayment').value) || 0;
    const extraPayment = parseFloat(document.getElementById('edit_extraPayment').value) || 0;

    const totalDiscount = discountAmount + (tuition * discountPercent / 100);
    const totalToPay = tuition - totalDiscount;
    const totalPaid = initialPayment + extraPayment;
    const balance = totalToPay - totalPaid;

    // Update Labels
    const tuitionLabel = document.getElementById('edit_tuitionLabel');
    if (tuitionLabel) tuitionLabel.textContent = tuition.toFixed(2);

    const durationLabel = document.getElementById('edit_durationLabel');
    if (durationLabel) durationLabel.textContent = duration;

    const totalToPayDisplay = document.getElementById('editTotalToPayDisplay');
    if (totalToPayDisplay) totalToPayDisplay.textContent = `$${totalToPay.toFixed(2)} `;

    const totalPaidDisplay = document.getElementById('editTotalPaidDisplay');
    if (totalPaidDisplay) totalPaidDisplay.textContent = `$${totalPaid.toFixed(2)} `;

    const balanceEl = document.getElementById('editBalanceDisplay');
    balanceEl.textContent = `$${balance.toFixed(2)} `;

    // Animate color
    balanceEl.className = 'h4 fw-bold mb-0 animate__animated';
    if (balance > 0.01) {
        balanceEl.classList.add('text-danger', 'animate__pulse');
    } else if (balance < -0.01) {
        balanceEl.classList.add('text-warning');
    } else {
        balanceEl.classList.add('text-success');
    }
}

// Custom study time toggle for Edit Modal
window.toggleEditCustomStudyTime = function () {
    const select = document.getElementById('edit_studyTime');
    const customContainer = document.getElementById('editCustomStudyTimeContainer');
    if (select.value === 'custom') {
        customContainer.style.display = 'block';
        document.getElementById('edit_customStudyTime').focus();
    } else {
        customContainer.style.display = 'none';
    }
};

function saveStudentChanges(key) {
    const studentType = document.querySelector('input[name="editStudentType"]:checked').value;
    const fullNameKhmer = document.getElementById('edit_fullNameKhmer').value.trim();
    const names = fullNameKhmer.split(' ');
    const lastName = names[0] || '';
    const firstName = names.slice(1).join(' ') || '';

    const fullNameEnglish = document.getElementById('edit_fullNameEnglish').value.trim();
    const engNames = fullNameEnglish.split(' ');
    const engLastName = engNames[0] || '';
    const engFirstName = engNames.slice(1).join(' ') || '';

    const updatedData = {
        lastName: lastName,
        firstName: firstName,
        englishLastName: engLastName,
        englishFirstName: engFirstName,
        gender: document.getElementById('edit_gender').value,
        dob: document.getElementById('edit_dob').value,
        address: document.getElementById('edit_studentAddress').value,
        generation: document.getElementById('edit_generation').value,

        // Parents
        fatherName: document.getElementById('edit_fatherName').value,
        fatherJob: document.getElementById('edit_fatherJob').value,
        fatherPhone: document.getElementById('edit_fatherPhone').value,
        fatherAddress: document.getElementById('edit_fatherAddress').value,
        motherName: document.getElementById('edit_motherName').value,
        motherJob: document.getElementById('edit_motherJob').value,
        motherPhone: document.getElementById('edit_motherPhone').value,
        motherAddress: document.getElementById('edit_motherAddress').value,

        // Study
        studyLevel: document.getElementById('edit_studyLevel').value,
        subject: document.getElementById('edit_subject').value,
        studyTime: document.getElementById('edit_studyTime').value === 'custom' ? document.getElementById('edit_customStudyTime').value : document.getElementById('edit_studyTime').value,
        teacherName: document.getElementById('edit_teacherName').value,
        status: document.getElementById('edit_status').value,

        // Finance
        tuitionFee: parseFloat(document.getElementById('edit_tuitionFee').value) || 0,
        studyDuration: parseInt(document.getElementById('edit_studyDuration').value) || 0,
        initialPayment: parseFloat(document.getElementById('edit_initialPayment').value) || 0,
        extraPayment: parseFloat(document.getElementById('edit_extraPayment').value) || 0,
        discountAmount: parseFloat(document.getElementById('edit_discountAmount').value) || 0,
        discountPercent: parseFloat(document.getElementById('edit_discountPercent').value) || 0,
        paymentStatus: document.getElementById('edit_paymentStatus').value,
        isOldStudent: studentType === 'old',

        // Dates
        startDate: document.getElementById('edit_startDate').value,
        paymentDate: document.getElementById('edit_paymentDate') ? document.getElementById('edit_paymentDate').value : document.getElementById('edit_startDate').value,
        dueDate: document.getElementById('edit_dueDate').value,
        nextPaymentDate: document.getElementById('edit_dueDate').value, // compatibility

        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    showLoading(true);
    const oldStudent = allStudentsData[key];
    const prevPaid = (parseFloat(oldStudent.initialPayment) || 0) + (parseFloat(oldStudent.extraPayment) || 0);
    const newPaid = updatedData.initialPayment + updatedData.extraPayment;

    studentsRef.child(key).update(updatedData)
        .then(() => {
            // Record difference as transaction if payment increased
            if (newPaid > prevPaid) {
                recordTransaction({
                    type: 'income',
                    amount: newPaid - prevPaid,
                    date: updatedData.paymentDate || new Date().toISOString().split('T')[0],
                    categoryId: 'tuition',
                    categoryName: 'ថ្លៃសិក្សា (Tuition Fee)',
                    description: `បង់ប្រាក់បន្ថែម(កែប្រែ): ${fullNameKhmer} (${updatedData.displayId})`,
                    referenceId: updatedData.displayId
                });
            }

            showAlert('កែប្រែបានជោគជ័យ', 'success');
            const modalEl = document.getElementById('editStudentModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        })
        .catch(error => {
            console.error("Update error:", error);
            showAlert('កំហុសក្នុងការរក្សាទុក: ' + error.message, 'danger');
        })
        .finally(() => showLoading(false));
}



// ----------------------------------------------------
// Actions: Delete & Mark as Paid
// ----------------------------------------------------

function deleteStudent(key, displayId) {
    if (!confirm(`តើអ្នកចង់លុបសិស្ស ID: ${displayId} មែនទេ ? `)) return;
    studentsRef.child(key).remove()
        .then(() => showAlert(`លុប ID: ${displayId} ជោគជ័យ`, 'success'))
        .catch(e => showAlert(e.message, 'danger'));
}

function markAsPaid(key) {
    const s = allStudentsData[key];
    if (!s) return;
    if (!confirm('តើអ្នកពិតជាចង់កំណត់ថាបង់ប្រាក់រួចរាល់សម្រាប់ថ្ងៃនេះមែនទេ?')) return;

    const months = parseInt(s.studyDuration || s.paymentMonths || 1);
    let nextDate = '';
    const currentDueDate = s.dueDate || s.nextPaymentDate || new Date().toISOString().split('T')[0];
    const engDate = convertToEnglishDate(currentDueDate);

    if (engDate) {
        const d = new Date(engDate);
        d.setMonth(d.getMonth() + months);
        nextDate = d.toISOString().split('T')[0];
    } else {
        // Fallback if date conversion fails
        const today = new Date();
        today.setMonth(today.getMonth() + months);
        nextDate = today.toISOString().split('T')[0];
    }

    studentsRef.child(key).update({
        paymentStatus: 'Paid',
        dueDate: nextDate,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        // Record Transaction
        const amountToRecord = calculateRemainingAmount(s);
        if (amountToRecord > 0) {
            recordTransaction({
                type: 'income',
                amount: amountToRecord,
                date: new Date().toISOString().split('T')[0],
                categoryId: 'tuition',
                categoryName: 'ថ្លៃសិក្សា (Tuition Fee)',
                description: `បង់ថ្លៃសិក្សា: ${s.lastName} ${s.firstName} (${s.displayId})`,
                referenceId: s.displayId
            });
        }

        // Also update initial/extra payment to reflect fully paid status? 
        // Usually better to add to extraPayment or installments.
        // For now, at least record the transaction for income-expense.html

        showAlert('បង់ប្រាក់រួចរាល់ និងបានបន្តកាលបរិច្ឆេទបន្ទាប់', 'success');
        const modalEl = document.getElementById('studentDetailsModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    });
}

function markAsDropout(key) {
    if (!confirm('តើអ្នកពិតជាចង់កំណត់សិស្សនេះជា "សិស្សបោះបង់ការសិក្សា" មែនទេ?')) return;

    studentsRef.child(key).update({
        status: 'dropout',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        showAlert('បានកំណត់សិស្សជាបោះបង់ការសិក្សាជោគជ័យ', 'success');
        // The listener on value will auto-reload the table
    }).catch(e => showAlert('កំហុស: ' + e.message, 'danger'));
}

function restoreStudent(key) {
    if (!confirm('តើអ្នកពិតជាចង់កំណត់សិស្សនេះឱ្យ "ចូលរៀនវិញ" មែនទេ?')) return;

    studentsRef.child(key).update({
        status: 'active',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        showAlert('បានកំណត់សិស្សឱ្យចូលរៀនវិញជោគជ័យ', 'success');
        // The listener on value will auto-reload the table
    }).catch(e => showAlert('កំហុស: ' + e.message, 'danger'));
}

/**
 * Record a transaction in the transactions table for income-expense.html
 */
async function recordTransaction(transactionData) {
    try {
        const currentUser = firebase.auth().currentUser;
        const userEmail = currentUser ? currentUser.email : 'System';

        const finalData = {
            ...transactionData,
            user: userEmail,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        await firebase.database().ref('transactions').push(finalData);
        console.log('Transaction recorded:', finalData.description);
    } catch (e) {
        console.error('Error recording transaction:', e);
    }
}

// ----------------------------------------------------
// Alerts & Notifications
// ----------------------------------------------------

function checkPaymentAlerts(data) {
    notifications = { overdue: [], warning: [] };
    if (!data) return updateNotificationCount(0);

    Object.keys(data).forEach(key => {
        const s = data[key];
        const status = getPaymentStatus(s);
        const remaining = calculateRemainingAmount(s);
        if (remaining > 0) {
            if (status.status === 'overdue') notifications.overdue.push({ id: key, name: `${s.lastName} ${s.firstName}`, days: Math.abs(status.daysRemaining) });
            else if (status.status === 'warning') notifications.warning.push({ id: key, name: `${s.lastName} ${s.firstName}`, days: status.daysRemaining });
        }
    });

    const totalAlerts = notifications.overdue.length + notifications.warning.length;
    updateNotificationCount(totalAlerts);
    renderAlertPanel();

    // Proactive Alert (Toast) if there are overdue or warning students
    if ((notifications.overdue.length > 0 || notifications.warning.length > 0) && !window.paymentAlertShown) {
        window.paymentAlertShown = true;
        const overdueCount = notifications.overdue.length;
        const warningCount = notifications.warning.length;

        let alertMsg = '';
        if (overdueCount > 0) alertMsg += `មានសិស្ស ${overdueCount} នាក់ហួសកាលបរិច្ឆេទបង់ប្រាក់។ `;
        if (warningCount > 0) alertMsg += `មានសិស្ស ${warningCount} នាក់ជិតដល់ថ្ងៃបង់ប្រាក់ (ក្នុង៣ថ្ងៃ)។ `;

        Swal.fire({
            title: 'ការជូនដំណឹងអំពីការបង់ប្រាក់!',
            text: alertMsg + 'សូមពិនិត្យមើលបញ្ជីជូនដំណឹង!',
            icon: overdueCount > 0 ? 'error' : 'warning',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 8000,
            timerProgressBar: true
        });
    }
}

function updateNotificationCount(count) {
    const badge = document.getElementById('notificationCount');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

function renderAlertPanel() {
    const list = document.getElementById('alertList');
    if (!list) return;

    let html = '';
    if (notifications.overdue.length === 0 && notifications.warning.length === 0) {
        html = '<div class="p-4 text-center text-muted"><i class="fas fa-check-circle fa-2x mb-2 d-block text-success"></i>គ្មានការជូនដំណឹង</div>';
    } else {
        notifications.overdue.forEach(n => {
            html += `<div class="alert-item overdue p-3 border-bottom d-flex align-items-center" onclick="viewStudentDetails('${n.id}')" style="cursor:pointer">
                <div class="me-3 p-2 bg-white rounded-circle"><i class="fas fa-flag text-danger"></i></div>
                <div>
                    <div class="fw-bold text-danger">ហួសកំណត់: ${n.name}</div>
                    <small class="text-muted"><i class="far fa-calendar-times me-1"></i>ហួស ${n.days} ថ្ងៃ</small>
                </div>
            </div>`;
        });
        notifications.warning.forEach(n => {
            html += `<div class="alert-item warning p-3 border-bottom d-flex align-items-center" onclick="viewStudentDetails('${n.id}')" style="cursor:pointer">
                <div class="me-3 p-2 bg-white rounded-circle"><i class="fas fa-hourglass-start text-warning"></i></div>
                <div>
                    <div class="fw-bold text-warning">ជិតដល់ថ្ងៃបង់: ${n.name}</div>
                    <small class="text-muted"><i class="far fa-clock me-1"></i>នៅសល់ ${n.days} ថ្ងៃ</small>
                </div>
            </div>`;
        });
    }
    list.innerHTML = html;
}

// ----------------------------------------------------
// Reports
// ----------------------------------------------------

function exportToExcel() {
    let csv = '\uFEFFល.រ,អត្តលេខ,ឈ្មោះ,ភេទ,លេខទូរស័ព្ទ,ម៉ោង,កម្រិត,ថ្ងៃចុះឈ្មោះ,ថ្ងៃផុតកំណត់,តម្លៃ,ខ្វះ,ស្ថានភាព\n';
    Object.values(allStudentsData).forEach((s, i) => {
        csv += `${i + 1},${s.displayId}, "${s.lastName} ${s.firstName}", ${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'},${s.personalPhone},${s.studyTime},${s.studyLevel},${convertToKhmerDate(s.startDate)},${convertToKhmerDate(s.dueDate || s.nextPaymentDate)},$${calculateTotalAmount(s)},$${calculateRemainingAmount(s)},${getPaymentStatus(s).text} \n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Student_Data_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

function generateDetailedAlertReport() {
    const students = Object.values(allStudentsData).filter(s => ['overdue', 'warning'].includes(getPaymentStatus(s).status) && calculateRemainingAmount(s) > 0);
    if (students.length === 0) return showAlert('គ្មានសិស្សត្រូវជូនដំណឹង', 'info');

    let win = window.open('', '_blank');
    let html = `<html><head><title>របាយការណ៍សិស្សហួសកំណត់</title>
        <style>
            @font-face {
                font-family: 'Khmer OS Battambang';
                src: url('fonts/Khmer OS Battambang.ttf') format('truetype');
            }
            body { font-family: 'Khmer OS Battambang', sans-serif !important; padding: 40px; color: #333; }
            .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px; border-bottom: 3px solid #dc3545; padding-bottom: 20px; }
            .school-info { display: flex; align-items: center; gap: 20px; }
            .logo { width: 80px; height: 80px; object-fit: cover; border-radius: 10px; border: 2px solid #dc3545; }
            .school-name h2 { margin: 0; color: #2C0157; }
            .report-title { text-align: center; margin: 30px 0; }
            .report-title h1 { color: #dc3545; font-size: 1.8rem; text-decoration: underline; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #dee2e6; padding: 12px; text-align: center; }
            th { background-color: #2C0157; color: white; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .footer { margin-top: 50px; text-align: right; font-style: italic; font-size: 0.9rem; }
            @media print { .no-print { display: none; } }
        </style></head><body>
        <div class="header">
            <div class="school-info">
                <img src="img/1.jpg" class="logo">
                <div class="school-name">
                    <h2>សាលាអន្តរជាតិ អាយធីឃេ (ITK School)</h2>
                    <p>របាយការណ៍សិស្សហួសកំណត់បង់ប្រាក់</p>
                </div>
            </div>
            <div class="date-info">
                <p>កាលបរិច្ឆេទ: ${new Date().toLocaleDateString('km-KH')}</p>
                <button class="no-print" onclick="window.print()" style="padding: 8px 20px; background: #2C0157; color: white; border: none; border-radius: 5px; cursor: pointer;">បោះពុម្ព</button>
            </div>
        </div>
        <div class="report-title">
            <h1>របាយការណ៍សិស្សហួសកំណត់បង់ប្រាក់</h1>
        </div>
        <table>
            <thead>
                <tr>
                    <th>អត្តលេខ</th>
                    <th>ឈ្មោះសិស្ស</th>
                    <th>កម្រិតសិក្សា</th>
                    <th>គ្រូបន្ទុកថ្នាក់</th>
                    <th>ថ្ងៃផុតកំណត់</th>
                    <th>ទឹកប្រាក់នៅខ្វះ</th>
                </tr>
            </thead>
            <tbody>`;

    students.forEach(s => {
        html += `<tr>
            <td style="font-weight: bold; color: #2C0157;">${s.displayId}</td>
            <td>${s.lastName} ${s.firstName}</td>
            <td>${s.studyLevel || '-'}</td>
            <td>${s.teacherName || '-'}</td>
            <td style="color: #dc3545; font-weight: bold;">${convertToKhmerDate(s.dueDate || s.nextPaymentDate)}</td>
            <td style="color: #dc3545; font-weight: bold;">$${calculateRemainingAmount(s).toFixed(2)}</td>
        </tr>`;
    });

    html += `</tbody></table>
        <div class="footer">
            <p>បោះពុម្ពដោយ: Admin នៅថ្ងៃទី ${new Date().toLocaleString('km-KH')}</p>
        </div>
    </body></html>`;

    win.document.write(html);
    win.document.close();
}

function generateMonthlyReport() {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    const monthlyStudents = Object.values(allStudentsData).filter(student => {
        if (!student.startDate || student.startDate === 'មិនមាន') return false;
        try {
            const engStartDate = convertToEnglishDate(student.startDate);
            if (!engStartDate) return false;
            const dateParts = engStartDate.split('/');
            return parseInt(dateParts[0]) === currentMonth && parseInt(dateParts[2]) === currentYear;
        } catch (e) { return false; }
    });

    if (monthlyStudents.length === 0) {
        return showAlert('គ្មានទិន្នន័យសិស្សចុះឈ្មោះក្នុងខែនេះទេ', 'info');
    }

    monthlyStudents.sort((a, b) => (parseInt(a.displayId) || 0) - (parseInt(b.displayId) || 0));

    let win = window.open('', '_blank');
    let html = `<html><head><title>របាយការណ៍ប្រចាំខែ</title>
        <style>
            @font-face {
                font-family: 'Khmer OS Battambang';
                src: url('fonts/Khmer OS Battambang.ttf') format('truetype');
            }
            body { font-family: 'Khmer OS Battambang', sans-serif !important; padding: 40px; color: #333; }
            .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px; border-bottom: 3px solid #2C0157; padding-bottom: 20px; }
            .school-info { display: flex; align-items: center; gap: 20px; }
            .logo { width: 80px; height: 80px; object-fit: cover; border-radius: 10px; border: 2px solid #2C0157; }
            .school-name h2 { margin: 0; color: #2C0157; }
            .report-title { text-align: center; margin: 30px 0; }
            .report-title h1 { color: #2C0157; font-size: 1.8rem; text-decoration: underline; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #dee2e6; padding: 12px; text-align: center; }
            th { background-color: #2C0157; color: white; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .footer { margin-top: 50px; text-align: right; font-style: italic; font-size: 0.9rem; }
            @media print { .no-print { display: none; } }
        </style></head><body>
        <div class="header">
            <div class="school-info">
                <img src="img/1.jpg" class="logo">
                <div class="school-name">
                    <h2>សាលាអន្តរជាតិ អាយធីឃេ (ITK School)</h2>
                    <p>របាយការណ៍សិស្សចុះឈ្មោះថ្មីប្រចាំខែ</p>
                </div>
            </div>
            <div class="date-info">
                <p>ខែ: ${currentMonth}/${currentYear}</p>
                <button class="no-print" onclick="window.print()" style="padding: 8px 20px; background: #2C0157; color: white; border: none; border-radius: 5px; cursor: pointer;">បោះពុម្ព</button>
            </div>
        </div>
        <div class="report-title">
            <h1>របាយការណ៍សិស្សចុះឈ្មោះថ្មីប្រចាំខែ ${currentMonth} ឆ្នាំ ${currentYear}</h1>
        </div>
        <table>
            <thead>
                <tr>
                    <th>អត្តលេខ</th>
                    <th>ឈ្មោះសិស្ស</th>
                    <th>កម្រិតសិក្សា</th>
                    <th>គ្រូបង្រៀន/បន្ទុកថ្នាក់</th>
                    <th>ថ្ងៃចុះឈ្មោះ</th>
                    <th>តម្លៃសិក្សា ($)</th>
                </tr>
            </thead>
            <tbody>`;

    monthlyStudents.forEach(s => {
        html += `<tr>
            <td style="font-weight: bold; color: #2C0157;">${s.displayId}</td>
            <td>${s.lastName} ${s.firstName}</td>
            <td>${s.studyLevel || '-'}</td>
            <td>${s.teacherName || '-'}</td>
            <td>${convertToKhmerDate(s.startDate)}</td>
            <td style="font-weight: bold;">$${calculateTotalAmount(s).toFixed(2)}</td>
        </tr>`;
    });

    html += `</tbody></table>
        <div class="footer">
            <p>បោះពុម្ពដោយ: Admin នៅថ្ងៃទី ${new Date().toLocaleString('km-KH')}</p>
        </div>
    </body></html>`;

    win.document.write(html);
    win.document.close();
}

function checkAllPayments() {
    if (!allStudentsData || Object.keys(allStudentsData).length === 0) {
        showAlert('គ្មានទិន្នន័យសិស្សទេ', 'info');
        return;
    }

    let warningCount = 0;
    let overdueCount = 0;
    let totalDue = 0;

    Object.values(allStudentsData).forEach(student => {
        const paymentStatus = getPaymentStatus(student);
        if (paymentStatus.status === 'warning') {
            warningCount++;
            totalDue += calculateRemainingAmount(student);
        } else if (paymentStatus.status === 'overdue') {
            overdueCount++;
            totalDue += calculateRemainingAmount(student);
        }
    });

    const totalAlerts = warningCount + overdueCount;

    if (totalAlerts > 0) {
        showAlert(`ការពិនិត្យ៖ ${overdueCount} នាក់ហួសកំណត់, ${warningCount} នាក់ជិតដល់កំណត់ | សរុបទឹកប្រាក់ខ្វះ: $${totalDue.toFixed(2)} `, 'warning', 8000);
    } else {
        showAlert('គ្មានសិស្សហួសកំណត់ ឬជិតដល់កំណត់ទេ', 'success');
    }
}

// ----------------------------------------------------
// Init
// ----------------------------------------------------

$(document).ready(function () {
    // Wait for auth to be ready before loading data to avoid permission_denied errors
    let isDataListenerAttached = false;
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // console.log("✅ Authenticated User:", user.email, user.uid);
            if (!isDataListenerAttached) {
                // Add a small delay to ensure connection is ready and claims are propagated
                setTimeout(() => {
                    console.log("🚀 Starting data load...");
                    loadStudentData();
                }, 1000);
                isDataListenerAttached = true;
            }
        } else {
            console.warn("User not authenticated, skipping data load.");
        }
    });

    // Notification Panel Toggle
    $('#notificationsBtn').on('click', (e) => {
        e.stopPropagation();
        $('#alertPanel').toggleClass('show');
    });
    $(document).on('click', () => $('#alertPanel').removeClass('show'));

    // Button Actions
    $(document).on('click', '.edit-btn', function (e) { e.stopPropagation(); showEditModal($(this).data('key')); });
    $(document).on('click', '.delete-btn', function (e) { e.stopPropagation(); deleteStudent($(this).data('key'), $(this).data('display-id')); });
    $(document).on('click', '.mark-paid-btn', function (e) { e.stopPropagation(); markAsPaid($(this).data('key')); });

    // Report/Export Buttons
    $('#exportExcelBtn').on('click', exportToExcel);
    $('#exportPDFBtn').on('click', generateDetailedAlertReport);

    // Filter Listeners
    $('#searchName').on('input', function () { currentFilters.searchName = $(this).val(); renderFilteredTable(); });
    $('#filterStatus').on('change', function () { currentFilters.status = $(this).val(); renderFilteredTable(); });
    $('#filterTime').on('change', function () { currentFilters.filterTime = $(this).val(); renderFilteredTable(); });
    $('#filterLevel').on('change', function () { currentFilters.filterLevel = $(this).val(); renderFilteredTable(); });
    $('#filterGender').on('change', function () { currentFilters.gender = $(this).val(); renderFilteredTable(); });
    $('#startDateFilter').on('change', function () { currentFilters.startDate = $(this).val(); renderFilteredTable(); });
    $('#endDateFilter').on('change', function () { currentFilters.endDate = $(this).val(); renderFilteredTable(); });

    $('#clearFiltersBtn').on('click', function () {
        currentFilters = {
            searchName: '',
            status: 'all',
            filterTime: 'all',
            filterLevel: 'all',
            gender: 'all',
            startDate: '',
            endDate: ''
        };
        $('#searchName').val('');
        $('#filterStatus').val('all');
        $('#filterTime').val('all');
        $('#filterLevel').val('all');
        $('#filterGender').val('all');
        $('#startDateFilter').val('');
        $('#endDateFilter').val('');
        renderFilteredTable();
        showAlert('បានសម្អាតការស្វែងរក', 'info');
    });

    // Quick search focus (Ctrl+F)
    $(document).on('keydown', (e) => {
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            $('#searchName').focus();
        }
    });

    console.log('✅ Data Tracking System Successfully Loaded');

    // Make functions globally accessible for HTML onclick attributes
    window.viewStudentDetails = viewStudentDetails;
    window.showEditModal = showEditModal;
    window.saveStudentChanges = saveStudentChanges;
    window.deleteStudent = deleteStudent;
    window.markAsPaid = markAsPaid;
    window.generateMonthlyReport = generateMonthlyReport;
    window.generateDetailedAlertReport = generateDetailedAlertReport;
    window.checkAllPayments = checkAllPayments;
    // ----------------------------------------------------
    // Report Center Logic
    // ----------------------------------------------------

    function openReportCenterModal() {
        const modal = new bootstrap.Modal(document.getElementById('reportCenterModal'));

        // Populate Selects
        const subjects = new Set();
        const levels = new Set();

        Object.values(allStudentsData).forEach(s => {
            if (s.subject) subjects.add(s.subject);
            if (s.studyLevel) levels.add(s.studyLevel);
        });

        const subjectSelect = document.getElementById('reportSubjectSelect');
        const levelSelect = document.getElementById('reportLevelSelect');

        // Helper to populate
        const pop = (sel, set) => {
            sel.innerHTML = '<option value="all">ទាំងអស់ (All)</option>';
            Array.from(set).sort().forEach(val => {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = val;
                sel.appendChild(opt);
            });
        };

        pop(subjectSelect, subjects);
        pop(levelSelect, levels);

        // Set default month to current
        const today = new Date();
        const monthStr = today.toISOString().slice(0, 7);
        document.getElementById('reportMonthSelect').value = monthStr;

        modal.show();
    }

    async function generatePDFReport(type, action = 'download') {
        showLoading(true);
        const { jsPDF } = window.jspdf;

        // Load Logo (Base64)
        let logoBase64 = null;
        if (typeof SCHOOL_LOGO_BASE64 !== 'undefined') {
            logoBase64 = SCHOOL_LOGO_BASE64;
        } else {
            console.warn("SCHOOL_LOGO_BASE64 not defined, attempting fetch...");
            logoBase64 = await getBase64ImageFromUrl('img/logo.jpg');
        }

        const doc = new jsPDF({ orientation: 'landscape' });

        let myFontBase64 = null;

        // 1. Try fetching from file (Priority as requested: Khmer OS Battambang Regular.ttf)
        // 1. Try using global variable first (Khmer OS Battambang)
        if (typeof fontKhmerOSBattambang !== 'undefined') {
            myFontBase64 = fontKhmerOSBattambang;
        }

        // 2. If not found, try fetching from file
        if (!myFontBase64) {
            try {
                const response = await fetch('fonts/Khmer OS Battambang Regular.ttf');
                if (response.ok) {
                    const blob = await response.blob();
                    myFontBase64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result.split(',')[1]);
                        reader.readAsDataURL(blob);
                    });
                } else {
                    console.log("Font file 'Khmer OS Battambang Regular.ttf' fetch not ok, status:", response.status, "Attempting fallback 'Khmer OS Battambang.ttf'");
                    // Fallback try the other filename just in case
                    const res2 = await fetch('fonts/Khmer OS Battambang.ttf');
                    if (res2.ok) {
                        const blob = await res2.blob();
                        myFontBase64 = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result.split(',')[1]);
                            reader.readAsDataURL(blob);
                        });
                    } else {
                        console.log("Fallback font file 'Khmer OS Battambang.ttf' fetch not ok, status:", res2.status);
                    }
                }
            } catch (e) {
                console.warn("Could not fetch font from file (might be local file protocol or network issue):", e);
            }
        }

        // 2. Fallback to global variable from khmer-font.js
        if (!myFontBase64 && typeof fontKhmerOSBattambang !== 'undefined') {
            myFontBase64 = fontKhmerOSBattambang;
        }

        if (myFontBase64) {
            doc.addFileToVFS("KhmerOSBattambang.ttf", myFontBase64);
            doc.addFont("KhmerOSBattambang.ttf", "KhmerOSBattambang", "normal");
            doc.setFont("KhmerOSBattambang");
        } else {
            console.warn("KhmerOSBattambang font not found anywhere. Please check fonts/Khmer OS Battambang.ttf or khmer-font.js");
        }

        let title = "របាយការណ៍";
        let subTitle = "";
        let filteredData = [];

        // Columns config
        const columns = [
            { header: 'ល.រ', dataKey: 'index' },
            { header: 'អត្តលេខ', dataKey: 'id' },
            { header: 'ឈ្មោះសិស្ស', dataKey: 'name' },
            { header: 'ភេទ', dataKey: 'gender' },
            { header: 'កម្រិតសិក្សា', dataKey: 'level' },
            { header: 'មុខវិជ្ជា', dataKey: 'subject' },
            { header: 'គ្រូបង្រៀន', dataKey: 'teacher' },
            { header: 'កាលបរិច្ឆេទ', dataKey: 'date' },
            { header: 'ស្ថានភាព', dataKey: 'status' }
        ];

        const currentStudents = Object.values(allStudentsData);

        if (type === 'monthly') {
            const monthVal = document.getElementById('reportMonthSelect').value;
            if (monthVal) {
                const [y, m] = monthVal.split('-');
                const monthName = KhmerLocale.months.longhand[parseInt(m) - 1];
                title = `របាយការណ៍សិស្សថ្មីប្រចាំខែ ${monthName} ឆ្នាំ ${y}`;
                filteredData = currentStudents.filter(s => {
                    if (!s.startDate) return false;
                    let d = getDateObject(s.startDate);
                    if (!d) return false;
                    return d.toISOString().slice(0, 7) === monthVal;
                });
                subTitle = `សិស្សចុះឈ្មោះថ្មីក្នុងខែនេះ: ${filteredData.length} នាក់`;
            } else {
                title = `របាយការណ៍ប្រចាំខែ`;
                filteredData = currentStudents;
            }

        } else if (type === 'subject') {
            const subj = document.getElementById('reportSubjectSelect').value;
            title = `របាយការណ៍សិស្សតាមមុខវិជ្ជា`;
            subTitle = `មុខវិជ្ជា: ${subj === 'all' ? 'ទាំងអស់' : subj}`;
            filteredData = currentStudents.filter(s => subj === 'all' || s.subject === subj);

        } else if (type === 'level') {
            const lvl = document.getElementById('reportLevelSelect').value;
            title = `របាយការណ៍សិស្សតាមកម្រិតសិក្សា`;
            filteredData = currentStudents.filter(s => lvl === 'all' || s.studyLevel === lvl);

            // If filtered by level, try to find the teacher's name (heuristic: first student in that class)
            if (lvl !== 'all' && filteredData.length > 0) {
                const teacher = filteredData[0].teacherName || 'មិនទាន់មាន';
                subTitle = `កម្រិត: ${lvl} | គ្រូបន្ទុកថ្នាក់: ${teacher} | សរុប: ${filteredData.length} នាក់`;
            } else {
                subTitle = `កម្រិត: ${lvl === 'all' ? 'ទាំងអស់' : lvl} | សរុប: ${filteredData.length} នាក់`;
            }

        } else if (type === 'upcoming') {
            title = "របាយការណ៍សិស្សត្រូវបង់ប្រាក់ (ជិតដល់ថ្ងៃ)";
            subTitle = "សម្រាប់រយៈពេល ១០ ថ្ងៃខាងមុខ និងសិស្សហួសកំណត់បង់";
            const today = new Date();
            const tenDaysLater = new Date();
            tenDaysLater.setDate(today.getDate() + 10);

            filteredData = currentStudents.filter(s => {
                const status = getPaymentStatus(s);
                if (status.status === 'paid') return false;
                const d = getDateObject(s.dueDate || s.nextPaymentDate);
                if (!d) return false;
                return d <= tenDaysLater;
            });
        }

        // Sort by ID
        filteredData.sort((a, b) => {
            const idA = parseInt((a.displayId || '').replace(/\D/g, '')) || 0;
            const idB = parseInt((b.displayId || '').replace(/\D/g, '')) || 0;
            return idA - idB;
        });

        // Map rows
        const rows = filteredData.map((s, index) => ({
            index: index + 1,
            id: s.displayId,
            name: `${s.lastName} ${s.firstName} `,
            gender: s.gender === 'Male' ? 'ប្រុស' : 'ស្រី',
            level: s.studyLevel || '',
            subject: s.subject || '',
            teacher: s.teacherName || 'N/A',
            date: convertToKhmerDate(type === 'upcoming' ? (s.dueDate || s.nextPaymentDate) : s.startDate),
            status: getPaymentStatus(s).text
        }));

        // --- Generate PDF Content ---
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        let yPos = 20;

        // 1. Header Section
        // Logo
        if (logoBase64) {
            doc.addImage(logoBase64, 'JPEG', margin, 15, 25, 25);
        }

        // School Name (Khmer & English)
        doc.setFontSize(18);
        doc.setTextColor(44, 1, 87); // Dark Blue/Purple
        doc.text("សាលាអន្តរជាតិ អាយធីឃេ", pageWidth / 2, 22, { align: "center" });

        doc.setFontSize(11);
        doc.text("ITK INTERNATIONAL SCHOOL", pageWidth / 2, 29, { align: "center" });

        doc.setFont("KhmerOSBattambang", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text("អាសយដ្ឋាន: ភូមិរោងគោ ឃុំរោងគោ ក្រុងបាវិត ខេត្តស្វាយរៀង", pageWidth / 2, 35, { align: "center" });
        doc.text("ទូរស័ព្ទ: 097 553 79 37 / 071 52 88882", pageWidth / 2, 40, { align: "center" });

        // Line Divider
        yPos = 48;
        doc.setDrawColor(44, 1, 87);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);

        // 2. Report Title
        yPos += 15;
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.text(title, pageWidth / 2, yPos, { align: "center" });

        if (subTitle) {
            yPos += 8;
            doc.setFontSize(11);
            doc.setTextColor(80);
            doc.text(subTitle, pageWidth / 2, yPos, { align: "center" });
        }

        yPos += 5;
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`កាលបរិច្ឆេទបង្កើត: ${new Date().toLocaleDateString('km-KH')} `, pageWidth - margin, yPos, { align: 'right' });

        // 3. Table
        yPos += 5;
        doc.autoTable({
            columns: columns,
            body: rows,
            startY: yPos,
            styles: {
                font: "KhmerOSBattambang",
                fontSize: 10,
                cellPadding: 4,
                lineColor: [200, 200, 200],
                lineWidth: 0.1
            },
            headStyles: {
                fillColor: [44, 1, 87],
                textColor: 255,
                halign: 'center',
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: {
                halign: 'center',
                valign: 'middle'
            },
            alternateRowStyles: {
                fillColor: [248, 248, 255]
            },
            columnStyles: {
                0: { cellWidth: 15 }, // Index
                1: { cellWidth: 25 }, // ID
                2: { cellWidth: 40, halign: 'left' }, // Name
                7: { cellWidth: 30, fontStyle: 'bold' }
            },
            didParseCell: function (data) {
                // Custom coloring for status
                if (data.section === 'body' && data.column.dataKey === 'status') {
                    const text = data.cell.raw;
                    if (text.includes('បង់រួច') || text.includes('Paid')) data.cell.styles.textColor = [46, 204, 113];
                    else if (text.includes('ហួស') || text.includes('Overdue') || text.includes('មិនទាន់')) data.cell.styles.textColor = [231, 76, 60];
                    else data.cell.styles.textColor = [243, 156, 18];
                }
            }
        });

        // 4. Footer Summary (If space allows)
        let finalY = doc.lastAutoTable.finalY + 10;
        if (finalY > pageHeight - 30) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFillColor(245, 245, 245);
        doc.roundedRect(margin, finalY, pageWidth - (margin * 2), 30, 3, 3, 'F');

        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text("សង្ខេបព័ត៌មាន:", margin + 5, finalY + 8);
        doc.setFontSize(9);
        doc.text(`- ចំនួនសិស្សសរុបក្នុងតារាង: ${filteredData.length} នាក់`, margin + 10, finalY + 16);
        doc.text(`- អ្នកបង្កើតរបាយការណ៍: Admin`, margin + 10, finalY + 22);

        // Page Numbers
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`ទំព័រ ${i} នៃ ${pageCount} `, pageWidth / 2, pageHeight - 10, { align: 'center' });
        }

        if (action === 'preview') {
            const pdfBlob = doc.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
        } else {
            doc.save(`${title.replace(/\s/g, '_')}.pdf`);
        }
        showLoading(false);
    }

    function getBase64ImageFromUrl(url) {
        return new Promise((resolve, reject) => {
            var img = new Image();
            img.setAttribute('crossOrigin', 'anonymous');
            img.onload = () => {
                var canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                var ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                var dataURL = canvas.toDataURL("image/jpeg");
                resolve(dataURL);
            };
            img.onerror = error => resolve(null);
            img.src = url;
        });
    }

    // Export new functions to window
    window.openReportCenterModal = openReportCenterModal;
    window.generatePDFReport = generatePDFReport;

    window.exportToExcel = exportToExcel;
    window.printPOSInvoice = printPOSInvoice;
});

// ----------------------------------------------------
// POS Invoice Printing
// ----------------------------------------------------

function printPOSInvoice(studentKey) {
    const s = allStudentsData[studentKey];
    if (!s) return showAlert('រកមិនឃើញទិន្នន័យសិស្ស!', 'danger');

    const total = calculateTotalAmount(s);
    const paid = calculateTotalPaid(s);
    const remaining = calculateRemainingAmount(s);

    // Logo Path - Checking relative path based on file location
    const logoSrc = 'img/logo.jpg';

    const width = 350;
    const height = 600;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    const printWindow = window.open('', 'Print Invoice', `width = ${width}, height = ${height}, top = ${top}, left = ${left} `);

    // POS CSS
    const styles = `
        <style>
             @font-face {
                font-family: 'Khmer OS Battambang';
                src: url('fonts/Khmer OS Battambang.ttf') format('truetype');
            }
            
            body {
                font-family: 'Khmer OS Battambang', sans-serif !important;
                margin: 0;
                padding: 15px;
                font-size: 11px;
                color: #000;
                line-height: 1.4;
            }
            
            .header {
                text-align: center;
                margin-bottom: 15px;
                border-bottom: 1px dashed #000;
                padding-bottom: 10px;
            }
            
            .logo {
                width: 60px;
                height: 60px;
                margin-bottom: 8px;
                border-radius: 50%;
                object-fit: cover;
                border: 1px solid #ddd;
            }
            
            .school-name {
                font-weight: bold;
                font-size: 14px;
                margin-bottom: 4px;
                text-transform: uppercase;
            }
            
            .invoice-title {
                font-weight: bold;
                font-size: 12px;
                margin-top: 5px;
                border: 1px solid #000;
                display: inline-block;
                padding: 2px 10px;
                border-radius: 4px;
            }

            .info-grid {
                display: grid;
                grid-template-columns: auto 1fr;
                gap: 2px 10px;
                margin-bottom: 15px;
            }

            .label { font-weight: bold; color: #444; }
            .value { text-align: right; }

            .line-divider { border-bottom: 1px dashed #000; margin: 10px 0; }
            
            .financial-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 4px;
            }

            .total-row {
                display: flex;
                justify-content: space-between;
                font-weight: bold;
                font-size: 13px;
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid #000;
            }

            .footer {
                text-align: center;
                margin-top: 25px;
                font-size: 9px;
                color: #555;
            }
            
            .thank-you {
                font-weight: bold;
                font-size: 11px;
                margin-bottom: 5px;
            }

            @media print {
                .no-print { display: none; }
                body { padding: 0; }
                @page { margin: 0; }
            }
        </style >
        `;

    const html = `
        < !DOCTYPE html >
            <html>
                <head>
                    <title>POS Invoice - ${s.displayId}</title>
                    ${styles}
                </head>
                <body>
                    <div class="header">
                        <img src="${logoSrc}" class="logo" alt="Logo">
                            <div class="school-name">សាលាអន្តរជាតិ អាយធីឃេ</div>
                            <div style="font-size: 10px;">ITK INTERNATIONAL SCHOOL</div>
                            <div class="invoice-title">វិក្កយបត្រ / INVOICE</div>
                            <div style="margin-top: 5px; font-size: 9px;">
                                Date: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString()}
                            </div>
                    </div>

                    <div class="info-grid">
                        <div class="label">អត្តលេខ/ID:</div>
                        <div class="value fw-bold">${s.displayId || '-'}</div>

                        <div class="label">ឈ្មោះ/Name:</div>
                        <div class="value fw-bold">${s.lastName} ${s.firstName}</div>

                        <div class="label">English:</div>
                        <div class="value">${s.englishName || (s.lastName + ' ' + s.firstName).toUpperCase()}</div>

                        <div class="label">កម្រិត/Level:</div>
                        <div class="value">${s.studyLevel || '-'}</div>

                        <div class="label">វគ្គ/Shift:</div>
                        <div class="value">${formatStudyType(s)}</div>
                    </div>

                    <div class="line-divider"></div>

                    <div class="financial-row">
                        <span>ថ្លៃសិក្សា (Tuition)</span>
                        <span>$${(parseFloat(s.tuitionFee) || 0).toFixed(2)}</span>
                    </div>
                    <div class="financial-row">
                        <span>ថ្លៃសម្ភារៈ (Materials)</span>
                        <span>$${(parseFloat(s.materialFee) || 0).toFixed(2)}</span>
                    </div>
                    <div class="financial-row">
                        <span>ថ្លៃរដ្ឋបាល (Admin)</span>
                        <span>$${(parseFloat(s.adminFee) || 0).toFixed(2)}</span>
                    </div>

                    ${(parseFloat(s.discountAmount || s.discount) > 0) ? `
            <div class="financial-row" style="color: #d63384;">
                <span>បញ្ចុះតម្លៃ (Discount)</span>
                <span>-$${(parseFloat(s.discountAmount || s.discount) || 0).toFixed(2)}</span>
            </div>` : ''}

                    <div class="total-row">
                        <span>សរុបរួម (Grand Total)</span>
                        <span>$${total.toFixed(2)}</span>
                    </div>

                    <div class="financial-row" style="font-weight: bold; margin-top: 5px;">
                        <span>បង់រួច (Paid)</span>
                        <span>$${paid.toFixed(2)}</span>
                    </div>

                    <div class="financial-row" style="font-weight: bold; margin-top: 5px; font-size: 12px;">
                        <span>${remaining > 0 ? 'នៅខ្វះ (Due)' : 'ប្រាក់អាប់ (Change)'}</span>
                        <span style="${remaining > 0 ? 'color: red;' : 'color: green;'}">
                            $${Math.abs(remaining).toFixed(2)}
                        </span>
                    </div>

                    <div class="footer">
                        <div class="thank-you">សូមអរគុណ! THANK YOU!</div>
                        <div>បេឡាករ (Cashier): Admin</div>
                        <div style="margin-top: 3px;">ទំនាក់ទំនង: 012 345 678</div>
                    </div>

                    <script>
                // Auto print after images load
                window.addEventListener('load', () => {
                            setTimeout(() => {
                                window.print();
                            }, 500);
                });
                    </script>
                </body>
            </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
}
