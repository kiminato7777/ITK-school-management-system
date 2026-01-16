const KhmerLocale = {
    weekdays: {
        shorthand: ["អា", "ច", "អង្គ", "ពុ", "ព្រ", "សុ", "ស"],
        longhand: ["អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"],
    },
    months: {
        shorthand: ["មករា", "កុម្ភៈ", "មិនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"],
        longhand: ["មករា", "កុម្ភៈ", "មិនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"],
    },
    orders: ["មករា", "កុម្ភៈ", "មិនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]
};

document.addEventListener('DOMContentLoaded', function () {
    const database = firebase.database();

    // DOM Elements
    const studentForm = document.getElementById('studentRegistrationForm');
    const submitBtn = document.getElementById('submitBtn');
    const updateBtn = document.getElementById('updateBtn');
    const resetBtn = document.getElementById('resetBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const displayId = document.getElementById('reg_displayId');
    const formTitle = document.getElementById('formTitle');

    let isEditMode = false;
    let currentStudentKey = null;

    // Initialize
    setupEventListeners();
    setupFinancialCalculation();

    // Flatpickr
    flatpickr.localize(KhmerLocale);
    flatpickr(".date-picker", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "j M Y",
        allowInput: true,
        onChange: function (selectedDates, dateStr, instance) {
            if (instance.element.id === 'reg_startDate') {
                updateDueDate();
                // Sync payment date to start date if empty
                const pDate = document.getElementById('reg_paymentDate');
                if (pDate && !pDate.value) setDateValue('reg_paymentDate', dateStr);
            }
        }
    });

    // Check Edit Mode
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('id');
    if (editId) {
        loadStudentForEdit(editId);
    } else {
        generateUniqueStudentId();
    }

    // --- ID Management ---
    async function generateUniqueStudentId() {
        try {
            const snapshot = await database.ref('students').once('value');
            let maxId = 0;
            if (snapshot.exists()) {
                Object.values(snapshot.val()).forEach(s => {
                    if (s.displayId) {
                        const match = s.displayId.match(/ITK(\d+)/);
                        if (match) {
                            const val = parseInt(match[1]);
                            if (val > maxId) maxId = val;
                        }
                    }
                });
            }
            const newId = maxId + 1;
            displayId.value = `ITK${newId.toString().padStart(4, '0')}`;
        } catch (e) {
            console.error(e);
            displayId.value = "ITK0001";
        }
    }

    // --- Events ---
    function setupEventListeners() {
        studentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (validateForm()) {
                if (isEditMode) await updateStudent();
                else await saveNewStudent();
            }
        });

        if (updateBtn) updateBtn.addEventListener('click', () => studentForm.requestSubmit());
        if (resetBtn) resetBtn.addEventListener('click', () => { resetForm(); generateUniqueStudentId(); });
        if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => {
            window.location.search = ''; // Reload without params
        });

        // Prevent Khmer Numerals in ID
        if (displayId) {
            displayId.addEventListener('input', (e) => {
                const val = e.target.value;
                if (/[\u17E0-\u17E9]/.test(val)) {
                    e.target.value = val.replace(/[\u17E0-\u17E9]/g, '');
                    Swal.fire({
                        icon: 'warning',
                        title: 'ហាមឃាត់',
                        text: 'មិនអនុញ្ញាតអោយប្រើលេខខ្មែរសម្រាប់អត្តលេខទេ! សូមប្រើលេខឡាតាំង (0-9)។',
                        toast: true,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 3000
                    });
                }
            });
        }
    }

    function validateForm() {
        const fullKhmer = document.getElementById('reg_fullNameKhmer').value.trim();
        if (!fullKhmer) {
            Swal.fire('Error', 'សូមបំពេញឈ្មោះសិស្ស', 'error');
            return false;
        }
        return true;
    }

    // --- Finance ---
    // --- Finance & Logic ---
    function setupFinancialCalculation() {
        // Standard inputs
        const inputs = [
            'reg_tuitionFee_manual', 'reg_studyDuration_manual', 'reg_materialFee_manual',
            'reg_adminFee_manual', 'reg_initialPayment_manual', 'reg_extraPayment_manual',
            'reg_discount_manual', 'reg_discountPercent_manual', 'reg_paymentDate'
        ];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => {
                calculateTotal();
                if (id === 'reg_studyDuration_manual' || id === 'reg_paymentDate') updateDueDate();
            });
        });

        // Date pickers change events
        const datePickers = ['reg_startDate', 'reg_paymentDate'];
        datePickers.forEach(id => {
            const el = document.getElementById(id);
            if (el && el._flatpickr) {
                el._flatpickr.config.onChange.push(function (selectedDates, dateStr) {
                    if (id === 'reg_startDate' && !document.getElementById('reg_paymentDate').value) {
                        setDateValue('reg_paymentDate', dateStr);
                    }
                    updateDueDate();
                });
            }
        });

        // New Logic: Student Type & Payment Type
        const radios = document.querySelectorAll('input[name="studentType"], input[name="paymentType"]');
        radios.forEach(r => r.addEventListener('change', updatePricing));

        const specialDur = document.getElementById('reg_specialDuration');
        if (specialDur) specialDur.addEventListener('change', updatePricing);

        // Initial call
        updatePricing();
    }

    function updatePricing() {
        const studentTypeRadios = document.querySelector('input[name="studentType"]:checked');
        const paymentTypeRadios = document.querySelector('input[name="paymentType"]:checked');

        if (!studentTypeRadios || !paymentTypeRadios) return;

        const studentType = studentTypeRadios.value; // 'new' or 'old'
        const paymentType = paymentTypeRadios.value; // 'normal' or 'special'
        const specialContainer = document.getElementById('specialOptionsContainer');
        const specialDurationSelect = document.getElementById('reg_specialDuration');
        const specialTag = document.getElementById('specialTag');

        let fee = 0;
        let months = 1;

        if (paymentType === 'normal') {
            if (specialContainer) specialContainer.style.display = 'none';
            if (specialTag) specialTag.classList.add('d-none');
            months = 1;
            // Normal Check: 1 month 12$(Old) - 1 month 15$(New)
            if (studentType === 'old') fee = 12;
            else fee = 15;
        } else {
            if (specialContainer) specialContainer.style.display = 'block';
            if (specialTag) specialTag.classList.remove('d-none');
            months = parseInt(specialDurationSelect.value);

            // Special Check
            if (studentType === 'new') {
                // New: 3m 45$, 6m 90$, 12m 180$
                if (months === 3) fee = 45;
                else if (months === 6) fee = 90;
                else if (months === 12) fee = 180;
            } else {
                // Old: 3m 36$, 6m 72$, 12m 144$
                if (months === 3) fee = 36;
                else if (months === 6) fee = 72;
                else if (months === 12) fee = 144;
            }
        }

        // Update fields
        setValue('reg_tuitionFee_manual', fee);
        setValue('reg_studyDuration_manual', months);
        // Only trigger total calculation, date update will happen if duration changed
        calculateTotal();
        updateDueDate();
    }

    function calculateTotal() {
        const tuition = getNum('reg_tuitionFee_manual');
        const material = getNum('reg_materialFee_manual');
        const admin = getNum('reg_adminFee_manual');
        const initial = getNum('reg_initialPayment_manual');
        const extra = getNum('reg_extraPayment_manual');
        const discCash = getNum('reg_discount_manual');
        const discPer = getNum('reg_discountPercent_manual');

        const totalDiscount = discCash + (tuition * discPer / 100);
        const totalFees = (tuition + material + admin) - totalDiscount;
        const totalPaid = initial + extra;
        const balance = totalFees - totalPaid;

        setSummary('summaryTotalFees', totalFees);
        setSummary('summaryPaid', totalPaid);
        setSummary('summaryBalance', balance);

        const balEl = document.getElementById('summaryBalance');
        if (balEl) {
            balEl.className = balance > 0.01 ? 'h5 fw-bold text-danger mb-0' : 'h5 fw-bold text-success mb-0';
        }
    }

    function updateDueDate() {
        // Requirement: Date of joining school (Start Date) -> Payment Date -> Due Date -> Next Due Date
        // Logic: Due Date (កាលបរិច្ឆេទកំណត់បង់) = Payment Date + Duration (Months)
        // Logic: Next Due Date (កាលបរិច្ឆេទកំណត់បង់បន្ទាប់) = Due Date + 1 month (usually) OR Duration?
        // Let's stick to Duration to match the 'Special' pack logic.

        const paymentDateVal = document.getElementById('reg_paymentDate').value;
        const startDateVal = document.getElementById('reg_startDate').value;

        // Base date for calculation is Payment Date if available, else Start Date
        const baseDateVal = paymentDateVal || startDateVal;
        const months = parseInt(document.getElementById('reg_studyDuration_manual').value) || 0;

        if (!baseDateVal || months <= 0) return;

        // Calculate Due Date (End of current paid period)
        const dueDate = addMonthsToDate(baseDateVal, months);
        const dueDateStr = formatDateString(dueDate);
        setDateValue('reg_dueDate', dueDateStr);

        // Calculate Next Due Date (The day student must pay again)
        // Usually, the Next Due Date is the same as the Due Date of the current period.
        // But the user requested "Next Due Date (auto calculated based on number of months)".
        // If they pay for 3 months, the next time they pay is in 3 months.
        setDateValue('reg_nextDueDate', dueDateStr);
    }

    function addMonthsToDate(dateStr, months) {
        const d = new Date(dateStr);
        const currentDay = d.getDate();
        const targetMonth = d.getMonth() + months;
        const targetYear = d.getFullYear() + Math.floor(targetMonth / 12);
        const safeMonth = targetMonth % 12;

        // Set year and month
        d.setFullYear(targetYear);
        d.setMonth(safeMonth);

        // Handle day overflow (e.g., Jan 31 + 1 month -> Feb 28/29)
        if (d.getDate() !== currentDay) {
            d.setDate(0); // Go to last day of previous month
        }

        return d;
    }

    function formatDateString(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // --- Data Management ---
    function collectData() {
        const tuition = getNum('reg_tuitionFee_manual');
        const initial = getNum('reg_initialPayment_manual');
        const extra = getNum('reg_extraPayment_manual');
        const material = getNum('reg_materialFee_manual');
        const admin = getNum('reg_adminFee_manual');
        const dc = getNum('reg_discount_manual');
        const dp = getNum('reg_discountPercent_manual');

        return {
            displayId: displayId.value,
            lastName: getValue('reg_fullNameKhmer'),
            firstName: '',
            englishLastName: getValue('reg_fullNameEnglish'),
            englishFirstName: '',
            gender: getValue('reg_gender'),
            dob: getValue('reg_dob'),
            address: getValue('reg_studentAddress'),
            generation: getValue('reg_generation'),

            // Guardian
            fatherName: getValue('reg_fatherName'),
            fatherJob: getValue('reg_fatherJob'),
            fatherPhone: getValue('reg_fatherPhone'),
            fatherAddress: getValue('reg_fatherAddress'),
            motherName: getValue('reg_motherName'),
            motherJob: getValue('reg_motherJob'),
            motherPhone: getValue('reg_motherPhone'),
            motherAddress: getValue('reg_motherAddress'),

            // Study
            studyLevel: getValue('reg_studyLevel'),
            subject: getValue('reg_subject'),
            studyTime: getValue('reg_studyTime') === 'custom' ? getValue('reg_customStudyTime') : getValue('reg_studyTime'),
            teacherName: getValue('reg_teacherName'),
            status: getValue('reg_status') || 'active',

            // Finance
            tuitionFee: tuition,
            initialPayment: initial,
            extraPayment: extra,
            studyDuration: getNum('reg_studyDuration_manual'),
            materialFee: material,
            adminFee: admin,
            discountAmount: dc,
            discountPercent: dp,

            paymentDate: getValue('reg_paymentDate'),
            startDate: getValue('reg_startDate'),
            dueDate: getValue('reg_dueDate'),
            nextDueDate: getValue('reg_nextDueDate'),
            paymentStatus: (tuition - dc - (tuition * dp / 100)) <= (initial + extra) ? 'Paid' : 'Pending',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
    }

    async function saveNewStudent() {
        try {
            const data = collectData();

            // Validate ID Uniqueness
            if (!data.displayId) {
                Swal.fire('Error', 'សូមបំពេញអត្តលេខ (ID)!', 'error');
                return;
            }
            const idTaken = await isIdTaken(data.displayId);
            if (idTaken) {
                Swal.fire('Error', `អត្តលេខ ${data.displayId} មាននៅក្នុងប្រព័ន្ធរួចហើយ! សូមប្រើអត្តលេខផ្សេង។`, 'error');
                return;
            }

            data.createdAt = firebase.database.ServerValue.TIMESTAMP;
            await database.ref('students').push(data);

            // Record Transaction if payment is made
            const totalPaid = (data.initialPayment || 0) + (data.extraPayment || 0);
            if (totalPaid > 0) {
                await recordRegistrationTransaction(data, totalPaid);
            }

            Swal.fire('Success', 'ចុះឈ្មោះសិស្សថ្មីជោគជ័យ!', 'success');
            resetForm();
            generateUniqueStudentId();
        } catch (e) {
            Swal.fire('Error', e.message, 'error');
        }
    }

    async function updateStudent() {
        try {
            const data = collectData();

            // Fetch old data to compare payment and ID
            const snap = await database.ref(`students/${currentStudentKey}`).once('value');
            const oldData = snap.val() || {};

            // Check ID Uniqueness if changed
            if (data.displayId !== oldData.displayId) {
                const idTaken = await isIdTaken(data.displayId);
                if (idTaken) {
                    Swal.fire('Error', `អត្តលេខ ${data.displayId} មាននៅក្នុងប្រព័ន្ធរួចហើយ! សូមប្រើអត្តលេខផ្សេង។`, 'error');
                    return;
                }
            }

            const prevPaid = (parseFloat(oldData.initialPayment) || 0) + (parseFloat(oldData.extraPayment) || 0);
            const newPaid = (data.initialPayment || 0) + (data.extraPayment || 0);

            await database.ref(`students/${currentStudentKey}`).update(data);

            // Record difference if payment increased
            if (newPaid > prevPaid) {
                await recordRegistrationTransaction(data, newPaid - prevPaid);
            }

            Swal.fire('Success', 'កែប្រែជោគជ័យ', 'success').then(() => {
                window.location.href = 'data-tracking.html';
            });
        } catch (e) {
            Swal.fire('Error', e.message, 'error');
        }
    }

    async function loadStudentForEdit(key) {
        currentStudentKey = key;
        isEditMode = true;
        formTitle.textContent = "កែសម្រួលព័ត៌មានសិស្ស";
        document.getElementById('editButtons').style.display = 'flex';
        submitBtn.style.display = 'none';

        const snap = await database.ref(`students/${key}`).once('value');
        if (snap.exists()) {
            const d = snap.val();
            setValue('reg_displayId', d.displayId);
            setValue('reg_fullNameKhmer', (d.lastName || '') + ' ' + (d.firstName || ''));
            setValue('reg_fullNameEnglish', (d.englishLastName || '') + ' ' + (d.englishFirstName || ''));
            setValue('reg_gender', d.gender);
            setDateValue('reg_dob', d.dob);
            setValue('reg_studentAddress', d.address || d.studentAddress);
            setValue('reg_generation', d.generation);

            setValue('reg_fatherName', d.fatherName);
            setValue('reg_fatherJob', d.fatherJob);
            setValue('reg_fatherPhone', d.fatherPhone);
            setValue('reg_fatherAddress', d.fatherAddress);
            setValue('reg_motherName', d.motherName);
            setValue('reg_motherJob', d.motherJob);
            setValue('reg_motherPhone', d.motherPhone);
            setValue('reg_motherAddress', d.motherAddress);

            setValue('reg_studyLevel', d.studyLevel);
            setValue('reg_subject', d.subject);
            setValue('reg_studyTime', d.studyTime);
            setValue('reg_teacherName', d.teacherName);
            setValue('reg_status', d.status || 'active');

            setValue('reg_tuitionFee_manual', d.tuitionFee);
            setValue('reg_studyDuration_manual', d.studyDuration);
            setValue('reg_materialFee_manual', d.materialFee);
            setValue('reg_adminFee_manual', d.adminFee);
            setValue('reg_initialPayment_manual', d.initialPayment);
            setValue('reg_extraPayment_manual', d.extraPayment);
            setValue('reg_discount_manual', d.discountAmount);
            setValue('reg_discountPercent_manual', d.discountPercent);

            setDateValue('reg_paymentDate', d.paymentDate);
            setDateValue('reg_startDate', d.startDate);
            setDateValue('reg_dueDate', d.dueDate);
            setDateValue('reg_nextDueDate', d.nextDueDate);
            calculateTotal();
        }
    }

    // --- Helpers ---
    async function isIdTaken(id) {
        // Query firebase to see if displayId exists
        const snapshot = await database.ref('students').orderByChild('displayId').equalTo(id).once('value');
        return snapshot.exists();
    }

    function getNum(id) { const el = document.getElementById(id); return el ? parseFloat(el.value) || 0 : 0; }
    function getValue(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
    function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; }
    function setDateValue(id, val) {
        const el = document.getElementById(id);
        if (el && el._flatpickr) el._flatpickr.setDate(val);
        else if (el) el.value = val || '';
    }
    function setSummary(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = `$${val.toFixed(2)}`;
    }

    // --- Helper for Recording Transaction ---
    async function recordRegistrationTransaction(studentData, amount) {
        try {
            const currentUser = firebase.auth().currentUser;
            const userEmail = currentUser ? currentUser.email : 'System';

            const transactionData = {
                type: 'income',
                amount: parseFloat(amount),
                date: studentData.paymentDate || new Date().toISOString().split('T')[0],
                categoryId: 'enrollment', // Must match ID in income-expense script
                categoryName: 'ចុះឈ្មោះ (Enrollment)',
                description: `ចុះឈ្មោះសិស្សថ្មី: ${studentData.lastName} ${studentData.englishLastName} (${studentData.displayId})`,
                referenceId: studentData.displayId,
                user: userEmail,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            };

            await database.ref('transactions').push(transactionData);
            console.log('Transaction recorded for student registration');
        } catch (e) {
            console.error('Error recording transaction:', e);
        }
    }

    function resetForm() { studentForm.reset(); calculateTotal(); }
});