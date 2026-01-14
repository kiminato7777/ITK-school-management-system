// Firebase References
const transactionsRef = database.ref('transactions');
const studentsRef = database.ref('students');
const salesRef = database.ref('sales'); // Inventory Sales
const usersRef = database.ref('users');

// Cache Current User Name
let currentUserName = '';

// State Variables
let transactionsData = [];
// Pagination State
let currentPage = 1;
const itemsPerPage = 10;
let currentFilter = 'all'; // all, income, expense

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
    // Initial Setup
    setupEventListeners();
    fetchTransactions();

    // Set default date to today in Modal
    document.getElementById('transDate').valueAsDate = new Date();

    // Fetch Current User Details
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            // Priority: 1. DB Display Name, 2. Auth Display Name, 3. Email Name
            usersRef.child(user.uid).once('value').then(snap => {
                const userData = snap.val();
                if (userData && (userData.name || userData.displayName || userData.username)) {
                    currentUserName = userData.name || userData.displayName || userData.username;
                } else if (user.displayName) {
                    currentUserName = user.displayName;
                } else {
                    // Extract name from email (e.g. 'long.mmo' from 'long.mmo@gmail.com')
                    currentUserName = user.email.split('@')[0];
                }
            });
        }
    });
});

// ==========================================
// CORE FUNCTIONS
// ==========================================

function fetchTransactions() {
    showLoading(true);

    // Use .on() instead of .once() for real-time updates
    let transSnap = null;
    let studentsSnap = null;
    let salesSnap = null;

    const checkAllLoaded = () => {
        // Only process if all sources have returned at least once
        if (transSnap !== null && studentsSnap !== null && salesSnap !== null) {
            processAllData();
        }
    };

    const processAllData = () => {
        transactionsData = [];

        // 1. Process Manual Transactions
        const transData = transSnap ? transSnap.val() : null;
        const overrideIds = new Set(); // Track IDs that exist in manual transactions

        if (transData) {
            Object.keys(transData).forEach(key => {
                const item = transData[key];
                overrideIds.add(key); // Add to overrides

                let defaultPayer = item.payer;
                let defaultReceiver = item.receiver;

                // Smart Defaults for Legacy Data
                if (!defaultPayer) {
                    if (item.type === 'income') defaultPayer = 'សិស្ស/អាណាព្យាបាល (General)';
                    else defaultPayer = 'សាលា (School)';
                }
                if (!defaultReceiver) {
                    if (item.type === 'income') defaultReceiver = 'សាលា (School)';
                    else defaultReceiver = 'អ្នកលក់/បុគ្គលិក (Vendor/Staff)';
                }

                transactionsData.push({
                    id: key,
                    sourceType: 'manual',
                    ...item,
                    date: item.date || (item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
                    amount: parseFloat(item.amount) || 0,
                    payer: defaultPayer,
                    receiver: defaultReceiver
                });
            });
        }

        // 2. Process Student Income (Registration + Installments)
        const studentsData = studentsSnap ? studentsSnap.val() : null;
        if (studentsData) {
            Object.values(studentsData).forEach(student => {
                const name = `${student.lastName || ''} ${student.firstName || ''}`;

                // A. Initial Payment (Registration)
                const regId = `reg_${student.key || student.id}`;
                const initialPay = parseFloat(student.initialPayment) || 0;

                if (initialPay > 0 && !overrideIds.has(regId)) {
                    transactionsData.push({
                        id: regId,
                        type: 'income',
                        category: `ចុះឈ្មោះសិស្ស - ${name}`,
                        description: `សិស្ស៖ ${name} (${student.displayId || 'N/A'}) - បង់ដំបូង`,
                        amount: initialPay,
                        date: student.startDate || new Date().toISOString().split('T')[0],
                        sourceType: 'system',
                        payer: 'អាណាព្យាបាល',
                        receiver: student.receiver || 'Admin',
                        recorder: 'System'
                    });
                }

                // B. Installments/Additional Payments
                if (student.installments) {
                    const instObj = isArray(student.installments) ? student.installments : Object.values(student.installments);
                    instObj.forEach((inst, idx) => {
                        const instId = `inst_${student.key}_${idx}`;
                        const amt = parseFloat(inst.amount) || 0;
                        if (amt > 0 && !overrideIds.has(instId)) {
                            transactionsData.push({
                                id: instId,
                                type: 'income',
                                category: `បង់ប្រាក់បន្ថែម - ${name}`,
                                description: `សិស្ស៖ ${name} - ដំណាក់កាល/Stage ${inst.stage || (idx + 1)}`,
                                amount: amt,
                                date: inst.date || new Date().toISOString().split('T')[0],
                                sourceType: 'system',
                                payer: 'អាណាព្យាបាល',
                                receiver: inst.receiver || 'Admin',
                                recorder: 'System'
                            });
                        }
                    });
                }
            });
        }

        // 3. Process Inventory Sales (Check overrides too just in case)
        const salesData = salesSnap ? salesSnap.val() : null;
        if (salesData) {
            Object.entries(salesData).forEach(([key, sale]) => {
                const saleId = `sale_${key}`;
                const amt = parseFloat(sale.totalPrice) || 0;
                if (amt > 0 && !overrideIds.has(saleId)) {
                    transactionsData.push({
                        id: saleId,
                        type: 'income',
                        category: 'Inventory Sale (លក់សម្ភារៈ)',
                        description: `${sale.itemName} (Qty: ${sale.quantity})`,
                        amount: amt,
                        date: sale.soldDate || (sale.soldAt ? sale.soldAt.split('T')[0] : new Date().toISOString().split('T')[0]),
                        sourceType: 'system',
                        payer: 'General/Customer',
                        receiver: sale.stockKeeper || 'Admin',
                        recorder: 'System'
                    });
                }
            });
        }

        // Sort by date descending (newest first)
        transactionsData.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (dateA > dateB) return -1;
            if (dateA < dateB) return 1;

            if (a.createdAt && b.createdAt) return b.createdAt - a.createdAt;

            if (a.id < b.id) return 1;
            if (a.id > b.id) return -1;
            return 0;
        });

        // --- Calculate Totals for Dashboard Cards ---
        let totalIncome = 0;
        let totalExpense = 0;

        transactionsData.forEach(t => {
            const val = parseFloat(t.amount) || 0;
            if (t.type === 'income') {
                totalIncome += val;
            } else {
                totalExpense += val;
            }
        });

        const netBalance = totalIncome - totalExpense;

        // Update UI
        if (document.getElementById('totalIncomeDisplay')) animateValue('totalIncomeDisplay', totalIncome);
        if (document.getElementById('totalExpenseDisplay')) animateValue('totalExpenseDisplay', totalExpense);
        if (document.getElementById('netBalanceDisplay')) animateValue('netBalanceDisplay', netBalance);

        renderTable();
        showLoading(false);
    };

    // Set up real-time listeners
    transactionsRef.on('value', snapshot => {
        transSnap = snapshot;
        checkAllLoaded();
    });

    studentsRef.on('value', snapshot => {
        studentsSnap = snapshot;
        checkAllLoaded();
    });

    salesRef.on('value', snapshot => {
        salesSnap = snapshot;
        checkAllLoaded();
    });
}
// Helper for Array check
function isArray(what) {
    return Object.prototype.toString.call(what) === '[object Array]';
}

function renderTable(resetPage = false) {
    const tableBody = document.getElementById('transactionsTableBody');
    const searchText = document.getElementById('searchDescription') ? document.getElementById('searchDescription').value.toLowerCase() : '';

    if (resetPage) currentPage = 1;

    tableBody.innerHTML = '';

    // Apply Filters (Search Only)
    let filteredData = transactionsData.filter(item => {
        if (searchText) {
            const searchStr = `${item.category} ${item.description} ${item.payer} ${item.receiver} ${item.recorder}`.toLowerCase();
            if (!searchStr.includes(searchText)) return false;
        }
        return true;
    });

    // Update Counts
    document.getElementById('displayCount').textContent = filteredData.length;
    document.getElementById('totalCount').textContent = transactionsData.length;

    if (filteredData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-5 text-muted">
                    <i class="fi fi-rr-inbox fa-3x mb-3 opacity-25"></i>
                    <p>មិនមានទិន្នន័យ (No Data Found)</p>
                </td>
            </tr>
        `;
        document.getElementById('paginationControls').innerHTML = ''; // Clear pagination
        return;
    }

    // Pagination Logic
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = 1;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    // Render Rows
    paginatedData.forEach((item, index) => {
        // Calculate true index for "No." column
        const trueIndex = startIndex + index;

        const row = document.createElement('tr');

        // Type Badge
        const typeBadge = item.type === 'income'
            ? '<span class="badge bg-success bg-opacity-10 text-success px-3 py-2 rounded-pill"><i class="fi fi-rr-arrow-up me-1"></i>ចំណូល</span>'
            : '<span class="badge bg-danger bg-opacity-10 text-danger px-3 py-2 rounded-pill"><i class="fi fi-rr-arrow-down me-1"></i>ចំណាយ</span>';

        // Amount Formatting
        const amountClass = item.type === 'income' ? 'text-success' : 'text-danger';
        const amountPrefix = item.type === 'income' ? '+' : '-';
        const payerName = item.payer || '-';
        const receiverName = item.receiver || '-';

        const actionButtons = `
            <div class="d-flex justify-content-center">
                <button class="btn btn-light text-primary shadow-sm rounded-circle me-2" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;" onclick="editTransaction('${item.id}')" title="កែប្រែ (Edit)">
                    <i class="fi fi-rr-edit" style="font-size: 14px;"></i>
                </button>
                <button class="btn btn-light text-danger shadow-sm rounded-circle" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;" onclick="deleteTransaction('${item.id}')" title="លុប (Delete)">
                    <i class="fi fi-rr-trash" style="font-size: 14px;"></i>
                </button>
            </div>
        `;

        row.innerHTML = `
            <td class="ps-4 text-center text-muted small">${trueIndex + 1}</td>
            <td class="text-center fw-bold text-muted" style="font-family: 'Khmer OS Battambang', sans-serif;">${formatDate(item.date)}</td>
            <td class="text-center">${typeBadge}</td>
            <td class="text-start">
                <div class="fw-bold text-dark">${item.category}</div>
                <div class="small text-muted opacity-75" style="font-size: 0.75rem;">${item.sourceType || 'manual'}</div>
            </td>
            <td class="text-start">
                <div class="text-secondary fw-bold" style="font-size: 0.85rem;">
                    <i class="fi fi-rr-user-tag me-1 opacity-50"></i>${payerName}
                </div>
            </td>
            <td class="text-start">
                <div class="text-secondary fw-bold" style="font-size: 0.85rem;">
                    <i class="fi fi-rr-member-list me-1 opacity-50"></i>${receiverName}
                </div>
            </td>
            <td class="text-start">
                <small class="text-muted text-wrap d-block" style="max-width: 200px; line-height: 1.2;">
                    ${item.description || '<span class="opacity-25">-</span>'}
                </small>
            </td>
            <td class="text-end ${amountClass} fw-bold fs-6">
                ${amountPrefix}$${parseFloat(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td class="text-center pe-4">
                ${actionButtons}
            </td>
        `;
        tableBody.appendChild(row);
    });

    renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
    const paginationContainer = document.getElementById('paginationControls');
    paginationContainer.innerHTML = '';

    if (totalPages <= 1) return;

    // Previous Button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#" onclick="changePage(${currentPage - 1})"><i class="fi fi-rr-angle-small-left"></i></a>`;
    paginationContainer.appendChild(prevLi);

    let startPage = Math.max(1, currentPage - 1);
    let endPage = Math.min(totalPages, currentPage + 1);

    if (startPage > 1) {
        paginationContainer.insertAdjacentHTML('beforeend', `<li class="page-item"><a class="page-link" href="#" onclick="changePage(1)">1</a></li>`);
        if (startPage > 2) {
            paginationContainer.insertAdjacentHTML('beforeend', `<li class="page-item disabled"><span class="page-link">...</span></li>`);
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" onclick="changePage(${i})">${i}</a>`;
        paginationContainer.appendChild(li);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationContainer.insertAdjacentHTML('beforeend', `<li class="page-item disabled"><span class="page-link">...</span></li>`);
        }
        paginationContainer.insertAdjacentHTML('beforeend', `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${totalPages})">${totalPages}</a></li>`);
    }

    // Next Button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#" onclick="changePage(${currentPage + 1})"><i class="fi fi-rr-angle-small-right"></i></a>`;
    paginationContainer.appendChild(nextLi);
}

function changePage(page) {
    if (page < 1) return;
    currentPage = page;
    renderTable(false); // Do not reset page, use the new one
}

// ==========================================
// EVENT HANDLERS
// ==========================================

function setupEventListeners() {
    // Modal Form Submit
    document.getElementById('transactionForm').addEventListener('submit', handleFormSubmit);

    // Type Toggle in Modal (Switch Categories)
    const typeRadios = document.getElementsByName('transType');
    typeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            toggleCategoryOptions(e.target.value);
        });
    });

    // Filter Button
    const btnFilter = document.getElementById('btnFilter');
    if (btnFilter) {
        btnFilter.addEventListener('click', renderTable);
    }

    // Search Input (Real-time filtering)
    const searchInput = document.getElementById('searchDescription');
    if (searchInput) {
        searchInput.addEventListener('keyup', () => renderTable(true));
    }

    // Reset Modal on Open (if adding new)
    const modal = document.getElementById('transactionModal');
    modal.addEventListener('show.bs.modal', (event) => {
        // If relatedTarget is null/undefined, it might be an edit call triggered manually,
        // but usually the button triggers it.
        if (event.relatedTarget && event.relatedTarget.getAttribute('data-bs-target') === '#transactionModal') {
            // Reset Form
            document.getElementById('transactionForm').reset();
            document.getElementById('editTransactionId').value = '';
            document.getElementById('modalTitle').innerHTML = '<i class="fi fi-rr-plus-circle me-2"></i>បញ្ចូលចំណូល/ចំណាយថ្មី';

            // Reset Type to Income
            document.getElementById('typeIncome').checked = true;
            toggleCategoryOptions('income');

            // Set Date to Today
            document.getElementById('transDate').valueAsDate = new Date();

            // Auto-fill Receiver with current user
            // Auto-fill Receiver with current user
            if (currentUserName) {
                document.getElementById('transReceiver').value = currentUserName;
            } else if (firebase.auth().currentUser) {
                document.getElementById('transReceiver').value = firebase.auth().currentUser.email.split('@')[0];
            }
        }
    });
}

function handleFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('editTransactionId').value;
    const type = document.querySelector('input[name="transType"]:checked').value;
    const date = document.getElementById('transDate').value;
    const amount = parseFloat(document.getElementById('transAmount').value);
    const amountKH = parseFloat(document.getElementById('transAmountKH').value) || 0;

    // New Fields
    const payer = document.getElementById('transPayer').value;
    const receiver = document.getElementById('transReceiver').value || currentUserName || 'System/Admin';

    // Category/Description Logic
    let category = '';
    if (type === 'income') {
        category = document.getElementById('transIncomeSource').value.trim();
        if (!category) {
            alert("សូមបញ្ចូលប្រភពចំណូល (Please enter income source)");
            return;
        }
    } else {
        category = document.getElementById('transExpenseCategory').value;
        if (!category) {
            alert("សូមជ្រើសរើសប្រភេទចំណាយ (Please select expense category)");
            return;
        }
    }

    const description = document.getElementById('transDescription').value;

    const transactionData = {
        type,
        date,
        amount,
        amountKH,
        category,
        description,
        payer,
        receiver,
        recorder: currentUserName || 'System/Admin',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    showLoading(true);

    if (id) {
        // Update
        transactionsRef.child(id).update(transactionData)
            .then(() => {
                closeModal();
                showLoading(false);
                // alert("កែប្រែបានជោគជ័យ (Updated successfully)");
            })
            .catch(err => {
                console.error(err);
                showLoading(false);
                alert("កំហុសក្នុងការកែប្រែ (Error updating)");
            });
    } else {
        // Create
        transactionData.createdAt = firebase.database.ServerValue.TIMESTAMP;
        transactionsRef.push(transactionData)
            .then(() => {
                closeModal();
                showLoading(false);
                // alert("រក្សាទុកបានជោគជ័យ (Saved successfully)");
            })
            .catch(err => {
                console.error(err);
                showLoading(false);
                alert("កំហុសក្នុងការរក្សាទុក (Error saving)");
            });
    }
}

function editTransaction(id) {
    const item = transactionsData.find(t => t.id === id);
    if (!item) return;

    // Set Values
    document.getElementById('editTransactionId').value = id;
    document.getElementById('transDate').value = item.date;
    document.getElementById('transAmount').value = item.amount;
    document.getElementById('transAmountKH').value = item.amountKH || 0;
    document.getElementById('transDescription').value = item.description || '';

    // Set Payer and Receiver Fields
    document.getElementById('transPayer').value = item.payer || '';
    document.getElementById('transReceiver').value = item.receiver || '';

    // Set Type
    if (item.type === 'income') {
        document.getElementById('typeIncome').checked = true;
    } else {
        document.getElementById('typeExpense').checked = true;
    }
    toggleCategoryOptions(item.type);

    // Set Category (after toggling options)
    if (item.type === 'income') {
        document.getElementById('transIncomeSource').value = item.category || '';
    } else {
        document.getElementById('transExpenseCategory').value = item.category || '';
    }

    // Update Title
    document.getElementById('modalTitle').innerHTML = '<i class="fi fi-rr-edit me-2"></i>កែប្រែទិន្នន័យ (Edit)';

    // Open Modal
    const modal = new bootstrap.Modal(document.getElementById('transactionModal'));
    modal.show();
}

function deleteTransaction(id) {
    if (!confirm("តើអ្នកពិតជាចង់លុបទិន្នន័យនេះមែនទេ? (Are you sure?)")) return;

    showLoading(true);

    // Check if it is a system-linked ID
    if (id.startsWith('reg_')) {
        // Registration Payment: reg_{key}
        const studentKey = id.replace('reg_', '');
        studentsRef.child(studentKey).update({ initialPayment: 0 })
            .then(() => {
                showLoading(false);
                alert("លុបការបង់ប្រាក់ចុះឈ្មោះជោគជ័យ (Registration payment cleared)");
            })
            .catch(err => {
                console.error(err);
                showLoading(false);
                alert("កំហុសក្នុងការលុប (Error deleting)");
            });

    } else if (id.startsWith('inst_')) {
        // Installment
        const parts = id.split('_');
        const idx = parseInt(parts.pop());
        parts.shift(); // remove 'inst'
        const studentKey = parts.join('_');

        studentsRef.child(studentKey).child('installments').once('value')
            .then(snapshot => {
                let installs = snapshot.val();
                if (!installs) {
                    showLoading(false);
                    return;
                }
                let instArray = isArray(installs) ? installs : Object.values(installs);

                if (idx >= 0 && idx < instArray.length) {
                    instArray.splice(idx, 1);
                    return studentsRef.child(studentKey).update({ installments: instArray });
                }
            })
            .then(() => {
                showLoading(false);
                alert("លុបប្រវត្តិបង់រំលស់ជោគជ័យ (Installment deleted)");
            })
            .catch(err => {
                console.error(err);
                showLoading(false);
                alert("កំហុសក្នុងការលុប (Error deleting)");
            });

    } else if (id.startsWith('sale_')) {
        alert("មិនអាចលុបការលក់ពីទីនេះបានទេ សូមទៅកាន់ស្តុក (Cannot delete sales from here, please use Inventory)");
        showLoading(false);
    } else {
        transactionsRef.child(id).remove()
            .then(() => {
                showLoading(false);
            })
            .catch(err => {
                console.error(err);
                showLoading(false);
                alert("កំហុសក្នុងការលុប (Error deleting)");
            });
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function toggleCategoryOptions(type) {
    const incomeContainer = document.getElementById('incomeInputContainer');
    const expenseContainer = document.getElementById('expenseSelectContainer');

    if (type === 'income') {
        incomeContainer.style.display = 'block';
        expenseContainer.style.display = 'none';

        document.getElementById('transIncomeSource').setAttribute('required', 'required');
        document.getElementById('transExpenseCategory').removeAttribute('required');
    } else {
        incomeContainer.style.display = 'none';
        expenseContainer.style.display = 'block';

        document.getElementById('transIncomeSource').removeAttribute('required');
        document.getElementById('transExpenseCategory').setAttribute('required', 'required');
    }
}

const khmerMonths = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];

function formatDate(dateString) {
    if (!dateString) return '';

    const khmerNumerals = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
    const toKhmerNum = (num) => num.toString().split('').map(char => {
        const n = parseInt(char);
        return isNaN(n) ? char : khmerNumerals[n];
    }).join('');
    const khmerMonthsList = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];

    let d;
    if (typeof dateString === 'string') {
        const parts = dateString.split(/[-/]/);
        if (parts.length === 3) {
            if (parts[2].length === 4) {
                d = new Date(parts[2], parts[1] - 1, parts[0]);
            } else if (parts[0].length === 4) {
                d = new Date(parts[0], parts[1] - 1, parts[2]);
            } else {
                d = new Date(dateString);
            }
        } else {
            d = new Date(dateString);
        }
    } else {
        d = new Date(dateString);
    }

    if (isNaN(d.getTime())) return dateString;

    const day = toKhmerNum(String(d.getDate()).padStart(2, '0'));
    const month = khmerMonthsList[d.getMonth()];
    const year = toKhmerNum(d.getFullYear());

    return `${day}-${month}-${year}`;
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) overlay.style.display = 'flex';
    else overlay.style.display = 'none';
}

function closeModal() {
    // Remove focus from any focused element inside modal to prevent aria-hidden warning
    if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
    }

    const modalEl = document.getElementById('transactionModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
}

function animateValue(id, value) {
    const el = document.getElementById(id);
    el.textContent = '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (id === 'netBalanceDisplay') {
        if (value >= 0) {
            el.className = 'fw-bold text-primary mb-0';
        } else {
            el.className = 'fw-bold text-danger mb-0';
        }
    }
}

// ==========================================
// REPORT GENERATION
// ==========================================

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

function getFilteredExportData() {
    const searchText = document.getElementById('searchDescription') ? document.getElementById('searchDescription').value.toLowerCase() : '';
    const reportTypeSelector = document.getElementById('reportTypeSelector');
    const typeFilter = reportTypeSelector ? reportTypeSelector.value : 'all';

    return transactionsData.filter(item => {
        // Search Filter
        if (searchText) {
            const searchStr = `${item.category} ${item.description} ${item.payer} ${item.receiver} ${item.recorder}`.toLowerCase();
            if (!searchStr.includes(searchText)) return false;
        }
        // Type Filter (Income/Expense)
        if (typeFilter !== 'all') {
            if (item.type !== typeFilter) return false;
        }
        return true;
    });
}

function exportToExcel() {
    const dataToExport = getFilteredExportData();
    if (dataToExport.length === 0) {
        alert("មិនមានទិន្នន័យដើម្បីនាំចេញ (No data to export)");
        return;
    }

    // Format data for Excel
    const excelData = dataToExport.map((item, index) => ({
        "ល.រ (No.)": index + 1,
        "កាលបរិច្ឆេទ (Date)": formatDate(item.date),
        "ប្រភេទ (Type)": item.type === 'income' ? 'ចំណូល' : 'ចំណាយ',
        "ប្រភព/ចំណាយ (Category)": item.category,
        "អ្នកចំណាយ (Payer)": item.payer || '-',
        "អ្នកទទួល (Receiver)": item.receiver || '-',
        "ការបរិយាយ (Description)": item.description || '-',
        "ទឹកប្រាក់ (Amount $)": parseFloat(item.amount).toFixed(2),
        "ទឹកប្រាក់ (Amount ៛)": item.amountKH || 0
    }));

    // Create WorkSheet
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Income & Expense");

    // Download File
    const timestamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Income_Expense_Report_${timestamp}.xlsx`);
}

function exportReport(type) {
    // Determine Report Type (All, Income, Expense)
    const reportTypeSelector = document.getElementById('reportTypeSelector');
    const reportType = reportTypeSelector ? reportTypeSelector.value : 'all';

    let titleRaw = "របាយការណ៍";
    let title = "";
    let filteredData = [];
    let periodText = "";

    // Determine Base Title based on Type
    if (reportType === 'income') titleRaw = "របាយការណ៍ចំណូល (Income Report)";
    else if (reportType === 'expense') titleRaw = "របាយការណ៍ចំណាយ (Expense Report)";
    else titleRaw = "របាយការណ៍ចំណូលចំណាយ (Income & Expense Report)";

    if (type === 'daily') {
        const today = new Date().toISOString().split('T')[0];
        title = `${titleRaw} ប្រចាំថ្ងៃ (Daily)`;
        periodText = `ប្រចាំថ្ងៃទី: ${formatDate(today)} `;
        filteredData = transactionsData.filter(item => item.date === today);
    } else if (type === 'monthly') {
        const currentYear = new Date().getFullYear();
        const promptMonth = prompt("សូមបញ្ចូលខែ (1-12) សម្រាប់របាយការណ៍:", new Date().getMonth() + 1);
        if (!promptMonth) return;

        const month = parseInt(promptMonth);
        if (isNaN(month) || month < 1 || month > 12) {
            alert("ខែមិនត្រឹមត្រូវ (Invalid Month)");
            return;
        }

        const promptYear = prompt("សូមបញ្ចូលឆ្នាំ:", currentYear);
        const year = parseInt(promptYear) || currentYear;

        const khmerMonthName = (khmerMonths && khmerMonths[month - 1]) ? khmerMonths[month - 1] : month;
        title = `${titleRaw} ប្រចាំខែ ${khmerMonthName} ឆ្នាំ ${year}`;
        periodText = `ប្រចាំខែ: ${khmerMonthName} ឆ្នាំ ${year}`;

        filteredData = transactionsData.filter(item => {
            const d = new Date(item.date);
            return (d.getMonth() + 1) === month && d.getFullYear() === year;
        });
    } else if (type === 'yearly') {
        const currentYear = new Date().getFullYear();
        const promptYear = prompt("សូមបញ្ចូលឆ្នាំ (Year):", currentYear);
        if (!promptYear) return;
        const year = parseInt(promptYear);
        if (isNaN(year)) {
            alert("ឆ្នាំមិនត្រឹមត្រូវ (Invalid Year)");
            return;
        }

        title = `${titleRaw} ប្រចាំឆ្នាំ ${year}`;
        periodText = `ប្រចាំឆ្នាំ: ${year}`;

        filteredData = transactionsData.filter(item => {
            const d = new Date(item.date);
            return d.getFullYear() === year;
        });
    } else if (type === 'current') {
        title = `${titleRaw} (Filtered View)`;
        periodText = "តាមការស្វែងរកបច្ចុប្បន្ន";
        filteredData = getFilteredExportData();
    }

    // Secondary filtering by type (if not already handled in 'current')
    if (type !== 'current') {
        if (reportType === 'income') {
            filteredData = filteredData.filter(item => item.type === 'income');
        } else if (reportType === 'expense') {
            filteredData = filteredData.filter(item => item.type === 'expense');
        }
    }

    if (filteredData.length === 0) {
        alert("គ្មានទិន្នន័យសម្រាប់ period នេះទេ (No data found)");
        return;
    }

    // Sort by date/time
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Separate Data for Sectioning
    const incomeData = filteredData.filter(item => item.type === 'income');
    const expenseData = filteredData.filter(item => item.type === 'expense');

    let totalIncome = 0;
    let totalExpense = 0;

    const generateTableRows = (data, startIdx = 0) => {
        return data.map((item, index) => {
            const amt = parseFloat(item.amount);
            if (item.type === 'income') totalIncome += amt;
            else totalExpense += amt;

            const typeColor = item.type === 'income' ? 'text-success' : 'text-danger';
            const amountPrefix = item.type === 'income' ? '+' : '-';

            return `
                <tr>
                    <td class="text-center">${startIdx + index + 1}</td>
                    <td>${formatDate(item.date)}</td>
                    <td>${item.category}</td>
                    <td class="text-start fw-bold text-secondary">${item.payer || '-'}</td>
                    <td class="text-start fw-bold text-secondary">${item.receiver || '-'}</td>
                    <td>${item.description || '-'}</td>
                    <td class="text-end fw-bold ${typeColor}">${amountPrefix}$${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
            `;
        }).join('');
    };

    let reportContentHtml = "";

    // 1. Income Section
    if (incomeData.length > 0 && reportType !== 'expense') {
        const subtotal = incomeData.reduce((sum, item) => sum + parseFloat(item.amount), 0);
        reportContentHtml += `
            <div class="section-title">
                <i class="fas fa-arrow-circle-up text-success"></i> ១. ផ្នែកចំណូល (Income Section)
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 40px;">ល.រ</th>
                        <th style="width: 90px;">កាលបរិច្ឆេទ</th>
                        <th>ប្រភពចំណូល</th>
                        <th>អ្នកបង់/អ្នកចំណាយ</th>
                        <th>អ្នកទទួល</th>
                        <th>ការបរិយាយ</th>
                        <th style="width: 100px;">ទឹកប្រាក់ ($)</th>
                    </tr>
                </thead>
                <tbody>${generateTableRows(incomeData)}</tbody>
                <tfoot>
                    <tr style="background:#f0fff0; font-weight:bold;">
                        <td colspan="6" class="text-end">សរុបផ្នែកចំណូល (Income Subtotal):</td>
                        <td class="text-end text-success">+$${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    // 2. Expense Section
    if (expenseData.length > 0 && reportType !== 'income') {
        const subtotal = expenseData.reduce((sum, item) => sum + parseFloat(item.amount), 0);
        reportContentHtml += `
            <div class="section-title" style="margin-top:30px;">
                <i class="fas fa-arrow-circle-down text-danger"></i> ២. ផ្នែកចំណាយ (Expense Section)
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 40px;">ល.រ</th>
                        <th style="width: 90px;">កាលបរិច្ឆេទ</th>
                        <th>ចំណាយទៅលើ</th>
                        <th>អ្នកចំណាយ</th>
                        <th>អ្នកទទួល</th>
                        <th>ការបរិយាយ</th>
                        <th style="width: 100px;">ទឹកប្រាក់ ($)</th>
                    </tr>
                </thead>
                <tbody>${generateTableRows(expenseData, incomeData.length)}</tbody>
                <tfoot>
                    <tr style="background:#fffafa; font-weight:bold;">
                        <td colspan="6" class="text-end">សរុបផ្នែកចំណាយ (Expense Subtotal):</td>
                        <td class="text-end text-danger">-$${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    const netBalance = totalIncome - totalExpense;
    const balanceClass = netBalance >= 0 ? 'text-primary' : 'text-danger';
    const currentUserNameDisp = currentUserName || (firebase.auth().currentUser ? firebase.auth().currentUser.displayName : 'Admin');

    let win = window.open('', '_blank');
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/')) + "/";

    let html = `<html><head><title>${title}</title>
         <base href="${baseUrl}">
         <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <style>
             @font-face { font-family: 'Khmer OS Battambang'; src: url('fonts/KhmerOSBattambang.woff2') format('woff2'); }
             body { font-family: 'Khmer OS Battambang', sans-serif !important; padding: 20px; color: #333; }
             @page { size: A4 landscape; margin: 15mm; }
             .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid rgb(31, 6, 55); padding-bottom: 15px; margin-bottom: 20px; }
             .header-logo img { height: 90px; }
             .header-text { flex: 1; text-align: center; }
             .section-title { font-size: 16px; font-weight: bold; color: rgb(31, 6, 55); padding: 5px 10px; border-left: 5px solid rgb(31, 6, 55); background: #f8f9fa; margin-bottom: 10px; }
             table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 11px; }
             th, td { border: 1px solid #999; padding: 6px; }
             th { background-color: rgb(31, 6, 55); color: white; font-weight: bold; }
             .text-center { text-align: center; }
             .text-end { text-align: right; }
             .text-success { color: #198754; }
             .text-danger { color: #dc3545; }
             .summary-section { margin-top: 25px; display: flex; justify-content: flex-end; }
             .summary-card { border: 2px solid rgb(31, 6, 55); padding: 15px; border-radius: 12px; width: 320px; background: #fff; }
             .footer-signature { margin-top: 50px; display: flex; justify-content: space-between; padding: 0 40px; }
             .signature-block { text-align: center; }
             .signature-line { margin-top: 50px; border-top: 1px solid #000; width: 160px; margin: 0 auto; }
        </style>
    </head>
    <body>
        <div class="header-container">
            <div class="header-logo"><img src="img/logo.jpg" onerror="this.src='img/1.jpg'" alt="Logo"></div>
            <div class="header-text">
                <p>អាសយដ្ឋាន៖ ភូមិត្រពាំងព្រីងខាងត្បូង ឃុំត្រពាំងព្រីង ស្រុកទឹកឈូ ខេត្តកំពត</p>
                <p>លេខទូរស័ព្ទ៖ 097 75 33 473</p>
                <h3 style="text-decoration: underline; margin:10px 0;">${title}</h3>
                <p style="font-size:12px;">Generated on: ${new Date().toLocaleString('en-GB')} | Prepared by: ${currentUserNameDisp}</p>
            </div>
            <div style="width:120px;"></div>
        </div>
        
        ${reportContentHtml}

        <div class="summary-section">
            <div class="summary-card">
                 <h5 style="margin:0 0 10px 0; border-bottom:1px solid #eee; padding-bottom:5px;">សេចក្តីសង្ខេប (Summary)</h5>
                 ${reportType !== 'expense' ? `<div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>ចំណូលសរុប:</span><span class="text-success fw-bold">+$${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>` : ''}
                 ${reportType !== 'income' ? `<div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>ចំណាយសរុប:</span><span class="text-danger fw-bold">-$${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>` : ''}
                 ${reportType === 'all' ? `<hr><div style="display:flex; justify-content:space-between; font-weight:bold; font-size:16px;"><span>ទឹកប្រាក់នៅសល់:</span><span class="${balanceClass}">$${netBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>` : ''}
            </div>
        </div>
        <div class="footer-signature">
            <div class="signature-block"><p>អ្នករៀបចំ</p><div class="signature-line"></div><p style="margin-top:10px; font-weight:bold;">${currentUserNameDisp}</p></div>
            <div class="signature-block"><p>អ្នកត្រួតពិនិត្យ</p><div class="signature-line"></div></div>
            <div class="signature-block"><p>អ្នកអនុម័ត</p><div class="signature-line"></div></div>
        </div>
        <script>window.onload = function() { setTimeout(() => { window.print(); }, 500); }</script>
    </body></html>`;

    win.document.write(html);
    win.document.close();
}

// Global Exports
window.exportReport = exportReport;
window.exportToExcel = exportToExcel;
window.getFilteredExportData = getFilteredExportData;


