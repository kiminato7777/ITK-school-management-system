
// DOM Elements
const transactionForm = document.getElementById('transactionForm');
const transactionsTableBody = document.getElementById('transactionsTableBody');
const totalIncomeEl = document.getElementById('totalIncome');
const totalExpenseEl = document.getElementById('totalExpense');
const netBalanceEl = document.getElementById('netBalance');
const filterTypeEl = document.getElementById('filterType');
const dateRangeFilterEl = document.getElementById('dateRangeFilter');
const searchInput = document.getElementById('searchTransaction');
const categorySelect = document.getElementById('category');
const typeRadios = document.querySelectorAll('input[name="type"]');

// Database References
const transactionsRef = database.ref('transactions');

// State
let transactions = [];
let filteredTransactions = [];
const INCOME_CATEGORIES = [
    { id: 'tuition', name: 'ថ្លៃសិក្សា (Tuition Fee)' },
    { id: 'uniform', name: 'លក់ឯកសណ្ឋាន (Uniform)' },
    { id: 'book', name: 'លក់សៀវភៅ (Books)' },
    { id: 'enrollment', name: 'ចុះឈ្មោះ (Enrollment)' },
    { id: 'other_income', name: 'ចំណូលផ្សេងៗ (Other)' }
];
const EXPENSE_CATEGORIES = [
    { id: 'salary', name: 'ប្រាក់ខែបុគ្គលិក (Salary)' },
    { id: 'utilities', name: 'ទឹកភ្លើង/អ៊ីនធឺណិត (Utilities)' },
    { id: 'rent', name: 'ថ្លៃឈ្នួលអគារ (Rent)' },
    { id: 'supplies', name: 'សម្ភារៈការិយាល័យ (Supplies)' },
    { id: 'maintenance', name: 'ជួសជុល/ថែទាំ (Maintenance)' },
    { id: 'marketing', name: 'ទីផ្សារ (Marketing)' },
    { id: 'other_expense', name: 'ចំណាយផ្សេងៗ (Other)' }
];

// Flatpickr Init
flatpickr("#transactionDate", {
    dateFormat: "Y-m-d",
    defaultDate: "today"
});

flatpickr("#dateRangeFilter", {
    mode: "range",
    dateFormat: "Y-m-d"
});

flatpickr("#editDate", {
    dateFormat: "Y-m-d"
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateCategoryOptions('income'); // Default
    loadTransactions();
    setupEventListeners();
});

function setupEventListeners() {
    // Radio Change (Income vs Expense)
    typeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            updateCategoryOptions(e.target.value);
        });
    });

    // Form Submit
    transactionForm.addEventListener('submit', handleTransactionSubmit);

    // Filters
    filterTypeEl.addEventListener('change', applyFilters);
    dateRangeFilterEl.addEventListener('change', applyFilters);
    searchInput.addEventListener('input', applyFilters);

    // Clear Filters
    document.getElementById('clearFilters').addEventListener('click', () => {
        filterTypeEl.value = 'all';
        searchInput.value = '';
        // Clear flatpickr
        const fpFilter = document.querySelector("#dateRangeFilter")?._flatpickr;
        if (fpFilter) fpFilter.clear();
        applyFilters();
    });

    // Edit Form Submit
    const editTransactionForm = document.getElementById('editTransactionForm');
    if (editTransactionForm) {
        editTransactionForm.addEventListener('submit', handleEditSubmit);
    }

    // Radio change for Edit modal
    const editTypeRadios = document.querySelectorAll('input[name="editType"]');
    editTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            updateCategoryOptions(e.target.value, 'editCategory');
        });
    });
}

function updateCategoryOptions(type, selectId = 'category') {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '';
    const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        select.appendChild(option);
    });
}

function handleTransactionSubmit(e) {
    e.preventDefault();

    const type = document.querySelector('input[name="type"]:checked').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const date = document.getElementById('transactionDate').value;
    const category = document.getElementById('category').value;
    // Get text of selected category for easier display later
    const categoryName = document.getElementById('category').options[document.getElementById('category').selectedIndex].text;
    const description = document.getElementById('description').value;
    const referenceId = document.getElementById('referenceId').value;

    const currentUser = firebase.auth().currentUser;
    const userEmail = currentUser ? currentUser.email : 'Unknown';

    if (!amount || isNaN(amount)) {
        Swal.fire('Error', 'Please enter a valid amount', 'error');
        return;
    }

    const newTransaction = {
        type,
        amount,
        date,
        categoryId: category,
        categoryName,
        description,
        referenceId,
        user: userEmail,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    const newRef = transactionsRef.push();
    newRef.set(newTransaction)
        .then(() => {
            Swal.fire({
                icon: 'success',
                title: 'Success',
                text: 'Transaction added successfully!',
                timer: 1500,
                showConfirmButton: false
            });
            transactionForm.reset();
            // Reset to defaults
            document.getElementById('typeIncome').checked = true;
            updateCategoryOptions('income');
            const fp = document.querySelector("#transactionDate")._flatpickr;
            fp.setDate("today");

            // Close modal
            const modalEl = document.getElementById('addTransactionModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
        })
        .catch(error => {
            console.error(error);
            Swal.fire('Error', error.message, 'error');
        });
}

function loadTransactions() {
    // Optimized query to avoid index warning (using default Key order which is time-based)
    transactionsRef.limitToLast(200).on('value', (snapshot) => {
        transactions = [];
        snapshot.forEach(childSnapshot => {
            transactions.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });

        // Firebase returns ascending by default key/date usually, let's reverse to show newest first
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        filteredTransactions = [...transactions];
        updateUI();
    });
}

function updateUI() {
    renderTable();
    calculateStats();
}

function renderTable() {
    transactionsTableBody.innerHTML = '';

    if (filteredTransactions.length === 0) {
        transactionsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4 text-muted">
                    No transactions found.
                </td>
            </tr>`;
        return;
    }

    filteredTransactions.forEach(t => {
        const row = document.createElement('tr');
        row.className = 'transaction-list-item';

        const isIncome = t.type === 'income';
        const amountClass = isIncome ? 'amount-income' : 'amount-expense';
        const sign = isIncome ? '+' : '-';
        const icon = isIncome ? 'fi-rr-arrow-small-up text-success' : 'fi-rr-arrow-small-down text-danger';

        row.innerHTML = `
            <td class="px-4">${formatDate(t.date)}</td>
            <td>
                <div class="fw-bold text-dark">${t.description || "គ្មានការពិពណ៌នា"}</div>
                ${t.referenceId ? `<small class="text-muted">Ref: ${t.referenceId}</small>` : ''}
            </td>
            <td>
                <span class="badge ${isIncome ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'} border ${isIncome ? 'border-success-subtle' : 'border-danger-subtle'} rounded-pill px-3">
                    <i class="fi ${isIncome ? 'fi-rr-arrow-small-up' : 'fi-rr-arrow-small-down'} me-1"></i>
                    ${isIncome ? 'ចំណូល' : 'ចំណាយ'}
                </span>
            </td>
             <td>${t.categoryName || t.categoryId}</td>
            <td class="text-end ${amountClass}">${sign}$${t.amount.toFixed(2)}</td>
            <td><small class="text-muted">${t.user.split('@')[0]}</small></td>
            <td class="text-center">
                <div class="d-flex justify-content-center gap-1">
                    <button class="btn btn-sm btn-outline-warning" onclick='openEditModal(${JSON.stringify(t)})' title="កែប្រែ">
                        <i class="fi fi-rr-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteTransaction('${t.id}')" title="លុប">
                        <i class="fi fi-rr-trash"></i>
                    </button>
                </div>
            </td>
        `;
        transactionsTableBody.appendChild(row);
    });
}

function calculateStats() {
    let totalIncome = 0;
    let totalExpense = 0;

    // Calculate from ALL loaded transactions (or filtered ones? Usually stats reflect filter context)
    // Let's use filtered transactions for dynamic stats
    filteredTransactions.forEach(t => {
        if (t.type === 'income') {
            totalIncome += t.amount;
        } else {
            totalExpense += t.amount;
        }
    });

    totalIncomeEl.textContent = `$${totalIncome.toFixed(2)}`;
    totalExpenseEl.textContent = `$${totalExpense.toFixed(2)}`;

    const balance = totalIncome - totalExpense;
    netBalanceEl.textContent = `$${balance.toFixed(2)}`;

    // Color code balance
    if (balance >= 0) {
        netBalanceEl.className = 'fw-bold mb-0 text-white'; // Inherits card color
    } else {
        // If we want to show negative balance distinctly?
        // But the card is blue. Let's keep it white text.
    }
}

function applyFilters() {
    const typeFilter = filterTypeEl.value;
    const searchQuery = searchInput.value.toLowerCase();

    // Date Range
    // flatpickr range string: "2023-10-01 to 2023-10-15"
    const dateRangeVal = dateRangeFilterEl.value;
    let startDate = null;
    let endDate = null;

    if (dateRangeVal.includes("to")) {
        const parts = dateRangeVal.split(" to ");
        startDate = new Date(parts[0]);
        endDate = new Date(parts[1]);
        // Set endDate to end of day
        endDate.setHours(23, 59, 59, 999);
    } else if (dateRangeVal) {
        // Single date
        startDate = new Date(dateRangeVal);
        endDate = new Date(dateRangeVal);
        endDate.setHours(23, 59, 59, 999);
    }

    filteredTransactions = transactions.filter(t => {
        // Type
        if (typeFilter !== 'all' && t.type !== typeFilter) return false;

        // Search
        const searchMatch = (t.description && t.description.toLowerCase().includes(searchQuery)) ||
            (t.categoryName && t.categoryName.toLowerCase().includes(searchQuery)) ||
            (t.referenceId && t.referenceId.toLowerCase().includes(searchQuery));
        if (!searchMatch) return false;

        // Date
        if (startDate && endDate) {
            const tDate = new Date(t.date);
            if (tDate < startDate || tDate > endDate) return false;
        }

        return true;
    });

    updateUI();
}

function deleteTransaction(id) {
    Swal.fire({
        title: 'Are you sure?',
        text: "You won't be able to revert this!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            transactionsRef.child(id).remove()
                .then(() => {
                    Swal.fire('Deleted!', 'Transaction has been deleted.', 'success');
                })
                .catch(err => {
                    Swal.fire('Error', err.message, 'error');
                });
        }
    });
}

function formatDate(dateString) {
    // Basic YYYY-MM-DD to readable
    const date = new Date(dateString);
    return date.toLocaleDateString('km-KH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function openEditModal(transaction) {
    document.getElementById('editId').value = transaction.id;
    document.getElementById('editAmount').value = transaction.amount;
    document.getElementById('editDescription').value = transaction.description;
    document.getElementById('editDate').value = transaction.date;

    // Set Radio
    if (transaction.type === 'income') {
        document.getElementById('editTypeIncome').checked = true;
    } else {
        document.getElementById('editTypeExpense').checked = true;
    }

    // Update categories and set value
    updateCategoryOptions(transaction.type, 'editCategory');
    document.getElementById('editCategory').value = transaction.categoryId;

    const modal = new bootstrap.Modal(document.getElementById('editTransactionModal'));
    modal.show();
}

function handleEditSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const type = document.querySelector('input[name="editType"]:checked').value;
    const amount = parseFloat(document.getElementById('editAmount').value);
    const date = document.getElementById('editDate').value;
    const categoryId = document.getElementById('editCategory').value;
    const categoryName = document.getElementById('editCategory').options[document.getElementById('editCategory').selectedIndex].text;
    const description = document.getElementById('editDescription').value;

    const updateData = {
        type, amount, date, categoryId, categoryName, description,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    transactionsRef.child(id).update(updateData)
        .then(() => {
            Swal.fire('ជោគជ័យ', 'ទិន្នន័យត្រូវបានកែប្រែ!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('editTransactionModal')).hide();
        })
        .catch(err => Swal.fire('Error', err.message, 'error'));
}

/**
 * Report Export Functionality
 */
function exportReport(period, format) {
    const now = new Date();
    let reportTitle = "";
    let dataToExport = [];

    if (period === 'daily') {
        const todayStr = now.toISOString().split('T')[0];
        dataToExport = transactions.filter(t => t.date === todayStr);
        reportTitle = `របាយការណ៍ប្រចាំថ្ងៃ_${todayStr}`;
    } else if (period === 'monthly') {
        const month = now.getMonth();
        const year = now.getFullYear();
        dataToExport = transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === month && d.getFullYear() === year;
        });
        reportTitle = `របាយការណ៍ប្រចាំខែ_${month + 1}_${year}`;
    } else if (period === 'yearly') {
        const year = now.getFullYear();
        dataToExport = transactions.filter(t => {
            const d = new Date(t.date);
            return d.getFullYear() === year;
        });
        reportTitle = `របាយការណ៍ប្រចាំឆ្នាំ_${year}`;
    }

    if (dataToExport.length === 0) {
        return Swal.fire('ព័ត៌មាន', 'គ្មានទិន្នន័យសម្រាប់ទាញយកទេ!', 'info');
    }

    if (format === 'excel') {
        exportToExcel(dataToExport, reportTitle);
    } else {
        exportToPDF(dataToExport, reportTitle);
    }
}

function exportToExcel(data, filename) {
    const worksheetData = data.map(t => ({
        'កាលបរិច្ឆេទ': t.date,
        'ប្រភេទ': t.type === 'income' ? 'ចំណូល' : 'ចំណាយ',
        'ប្រភេទរង': t.categoryName,
        'ការពិពណ៌នា': t.description,
        'ចំនួន ($)': t.amount.toFixed(2),
        'អ្នកបញ្ចូល': t.user
    }));

    const ws = XLSX.utils.json_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

function exportToPDF(data, filename) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Register Khmer Font
    if (typeof fontKhmerOSBattambang !== 'undefined') {
        doc.addFileToVFS('KhmerOSBattambang.ttf', fontKhmerOSBattambang);
        doc.addFont('KhmerOSBattambang.ttf', 'Khmer OS Battambang', 'normal');
        doc.setFont('Khmer OS Battambang');
    }

    // Header Branding
    firebase.database().ref('settings/general').once('value', snapshot => {
        const settings = snapshot.val() || {};
        const schoolName = settings.schoolName || 'សាលាអន្តរជាតិ អាយធីឃេ';

        doc.setFontSize(18);
        doc.text(schoolName, 105, 15, { align: 'center' });

        doc.setFontSize(14);
        doc.text(filename.replace(/_/g, ' '), 105, 25, { align: 'center' });

        const body = data.map((t, index) => [
            index + 1,
            t.date,
            t.type === 'income' ? 'ចំណូល' : 'ចំណាយ',
            t.categoryName || '',
            t.description || '',
            `$${t.amount.toFixed(2)}`
        ]);

        doc.autoTable({
            head: [['ល.រ', 'កាលបរិច្ឆេទ', 'ប្រភេទ', 'ប្រភេទរង', 'ការពិពណ៌នា', 'ចំនួនទឹកប្រាក់']],
            body: body,
            startY: 35,
            styles: {
                font: 'Khmer OS Battambang',
                fontSize: 10,
                cellPadding: 3
            },
            headStyles: {
                fillColor: [44, 1, 87],
                textColor: [255, 255, 255],
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'center' },
                5: { halign: 'right' }
            },
            didDrawPage: function (data) {
                // Footer page number
                const str = "ទំព័រទី " + doc.internal.getNumberOfPages();
                doc.setFontSize(10);
                doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 10);
            }
        });

        doc.save(`${filename}.pdf`);
    });
}

// Global scope
window.deleteTransaction = deleteTransaction;
window.openEditModal = openEditModal;
window.exportReport = exportReport;
