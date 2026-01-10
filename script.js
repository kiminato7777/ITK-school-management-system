// --- JAVASCRIPT LOGIC V5 (COMPLETED) ---

// Payment Form Variables
const PAYMENT_FORM = document.getElementById('paymentForm');
const TABLE_BODY = document.querySelector('#paymentTable tbody');
const STUDENT_ID_INPUT = document.getElementById('studentId');
const FORM_TITLE = document.getElementById('formTitle');
const SAVE_BTN = document.getElementById('saveBtn');
const REG_FORM = document.getElementById('studentRegistrationForm');

const CONTENT_SECTIONS = document.querySelectorAll('.content-section');

// Load data from Local Storage (using v3 key)
let students = JSON.parse(localStorage.getItem('students_v3')) || [];
let genderChart, balanceChart;

// ----------------------------------------------------
// មុខងារសម្រាប់ប្តូរ Section
// ----------------------------------------------------

window.showSection = function (sectionId, element) {
    CONTENT_SECTIONS.forEach(section => {
        section.style.display = 'none';
    });
    document.getElementById(sectionId).style.display = 'block';

    // Update active link
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    element.classList.add('active');

    if (sectionId === 'dashboard-section' || sectionId === 'table-section') {
        // Re-render table and charts whenever the user views dashboard or table
        renderTable();
    }
    // Ensure the form is reset when switching to the payment form
    if (sectionId === 'form-section') {
        resetForm();
    }
};

// ----------------------------------------------------
// មុខងារទាក់ទងនឹង Payment (រក្សាទុក/កែប្រែ/លុប)
// ----------------------------------------------------

function calculateRemaining(tuition, p1, p2, p3) {
    const t = parseFloat(tuition) || 0;
    const paid1 = parseFloat(p1) || 0;
    const paid2 = parseFloat(p2) || 0;
    const paid3 = parseFloat(p3) || 0;
    const totalPaid = paid1 + paid2 + paid3;
    const remaining = t - totalPaid;
    return { totalPaid: totalPaid, remaining: remaining };
}

function renderCharts(paid, remaining) {
    const maleCount = students.filter(s => s.gender === 'ប្រុស').length;
    const femaleCount = students.filter(s => s.gender === 'ស្រី').length;

    // Destroy previous charts before creating new ones
    if (genderChart) genderChart.destroy();
    genderChart = new Chart(document.getElementById('genderChart'), {
        type: 'doughnut', data: { labels: ['ប្រុស', 'ស្រី'], datasets: [{ data: [maleCount, femaleCount], backgroundColor: ['#0d6efd', '#6f42c1'], hoverOffset: 4 }] },
        options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });

    if (balanceChart) balanceChart.destroy();
    balanceChart = new Chart(document.getElementById('balanceChart'), {
        type: 'pie', data: { labels: ['បង់រួច', 'នៅខ្វះ'], datasets: [{ data: [paid, remaining], backgroundColor: ['#198754', '#dc3545'], hoverOffset: 4 }] },
        options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });
}

function renderTable() {
    TABLE_BODY.innerHTML = '';
    let totalTuition = 0; let totalPaidAmount = 0; let totalRemainingAmount = 0;

    if (students.length === 0) {
        TABLE_BODY.innerHTML = '<tr><td colspan="12" class="text-center">មិនទាន់មានទិន្នន័យបង់ថ្លៃសិក្សានៅឡើយទេ។</td></tr>';
    }

    students.forEach((student, index) => {
        const { totalPaid, remaining } = calculateRemaining(student.tuitionFee, student.paymentDate1, student.paymentDate2, student.paymentDate3);
        totalTuition += parseFloat(student.tuitionFee) || 0;
        totalPaidAmount += totalPaid;
        totalRemainingAmount += remaining;

        const row = TABLE_BODY.insertRow();
        row.innerHTML = `
            <td>${index + 1}</td><td>${student.idNumber}</td><td>${student.khName}</td><td>${student.gender}</td>
            <td>$${(parseFloat(student.tuitionFee) || 0).toFixed(2)}</td><td>$${(parseFloat(student.paymentDate1) || 0).toFixed(2)}</td>
            <td>$${(parseFloat(student.paymentDate2) || 0).toFixed(2)}</td><td>$${(parseFloat(student.paymentDate3) || 0).toFixed(2)}</td>
            <td>$${totalPaid.toFixed(2)}</td>
            <td class="${remaining > 0 ? 'remaining-balance' : 'text-success'}">$${remaining.toFixed(2)}</td>
            <td>${student.nextPaymentDate}</td>
            <td>
                <button class="btn btn-sm btn-info me-1" onclick="editStudent('${student.id}')" title="កែប្រែ"><i class="fi fi-rr-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteStudent('${student.id}')" title="លុប"><i class="fi fi-rr-trash"></i></button>
            </td>
        `;
    });

    // Update Stats Cards
    document.getElementById('totalStudents').textContent = students.length;
    document.getElementById('totalTuition').textContent = `$${totalTuition.toFixed(2)}`;
    document.getElementById('totalPaid').textContent = `$${totalPaidAmount.toFixed(2)}`;
    document.getElementById('totalRemaining').textContent = `$${totalRemainingAmount.toFixed(2)}`;

    renderCharts(totalPaidAmount, totalRemainingAmount);
}

function saveStudents() {
    localStorage.setItem('students_v3', JSON.stringify(students));
    renderTable();
}

PAYMENT_FORM.addEventListener('submit', function (e) {
    e.preventDefault();
    const data = {
        id: STUDENT_ID_INPUT.value || Date.now().toString(),
        idNumber: document.getElementById('idNumber').value,
        khName: document.getElementById('khName').value,
        chName: document.getElementById('chName').value,
        gender: document.getElementById('gender').value,
        studyTime: document.getElementById('studyTime').value,
        teacher: document.getElementById('teacher').value,
        numMonths: document.getElementById('numMonths').value,
        tuitionFee: document.getElementById('tuitionFee').value,
        dueDate: document.getElementById('dueDate').value,
        nextPaymentDate: document.getElementById('nextPaymentDate').value,
        info: document.getElementById('info').value,
        paymentDate1: document.getElementById('paymentDate1').value || '0',
        paymentDate2: document.getElementById('paymentDate2').value || '0',
        paymentDate3: document.getElementById('paymentDate3').value || '0',
        notes: document.getElementById('notes').value
    };
    const existingIndex = students.findIndex(s => s.id === data.id);
    if (existingIndex > -1) {
        students[existingIndex] = data;
        alert('ទិន្នន័យបង់ថ្លៃត្រូវបានកែប្រែដោយជោគជ័យ!');
    } else {
        students.push(data);
        alert('ការបញ្ចូលទិន្នន័យបង់ថ្លៃសិក្សាថ្មីបានជោគជ័យ!');
    }
    saveStudents();
    resetForm();
    showSection('table-section', document.querySelector('[data-section="table-section"]'));
});

window.editStudent = function (id) {
    const student = students.find(s => s.id === id);
    if (student) {
        document.getElementById('idNumber').value = student.idNumber;
        document.getElementById('khName').value = student.khName;
        document.getElementById('chName').value = student.chName;
        document.getElementById('gender').value = student.gender;
        document.getElementById('studyTime').value = student.studyTime;
        document.getElementById('teacher').value = student.teacher;
        document.getElementById('numMonths').value = student.numMonths;
        document.getElementById('tuitionFee').value = student.tuitionFee;
        document.getElementById('dueDate').value = student.dueDate;
        document.getElementById('nextPaymentDate').value = student.nextPaymentDate;
        document.getElementById('paymentDate1').value = student.paymentDate1;
        document.getElementById('paymentDate2').value = student.paymentDate2;
        document.getElementById('paymentDate3').value = student.paymentDate3;
        document.getElementById('info').value = student.info;
        document.getElementById('notes').value = student.notes;
        STUDENT_ID_INPUT.value = student.id;

        FORM_TITLE.textContent = 'កែប្រែទិន្នន័យបង់ថ្លៃសិក្សា';
        SAVE_BTN.innerHTML = '<i class="fi fi-rr-disk"></i> រក្សាទុកការកែប្រែ';

        showSection('form-section', document.querySelector('[data-section="form-section"]'));
        document.getElementById('idNumber').focus();
    }
}

window.deleteStudent = function (id) {
    if (confirm('តើអ្នកពិតជាចង់លុបកំណត់ត្រានេះមែនទេ?')) {
        students = students.filter(s => s.id !== id);
        saveStudents();
        alert('កំណត់ត្រាត្រូវបានលុបដោយជោគជ័យ។');
        showSection('dashboard-section', document.querySelector('[data-section="dashboard-section"]'));
    }
}

function resetForm() {
    PAYMENT_FORM.reset();
    STUDENT_ID_INPUT.value = '';
    FORM_TITLE.textContent = 'បញ្ចូលទិន្នន័យបង់ថ្លៃសិក្សា';
    SAVE_BTN.innerHTML = '<i class="fi fi-rr-disk"></i> រក្សាទុក';
}

// ----------------------------------------------------
// មុខងារទាក់ទងនឹង Registration (ចុះឈ្មោះ) - Embedded Logic
// ----------------------------------------------------

REG_FORM.addEventListener('submit', function (e) {
    e.preventDefault();
    const firstName = document.getElementById('reg_firstName').value;
    alert(`ទម្រង់ចុះឈ្មោះសិស្សថ្មីសម្រាប់៖ ${firstName} ត្រូវបានបញ្ជូនដោយជោគជ័យ!`);
    REG_FORM.reset();
    showSection('dashboard-section', document.querySelector('[data-section="dashboard-section"]'));
});


// ----------------------------------------------------
// Initialization
// ----------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    renderTable();
});