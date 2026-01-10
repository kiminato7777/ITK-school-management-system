document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const inventoryRef = database.ref('inventory');
    const salesRef = database.ref('sales');
    const todayBtn = document.getElementById('todayBtn');
    const importDateInput = document.getElementById('importDate');
    const currencySelector = document.getElementById('currencySelector');
    const exchangeRateInput = document.getElementById('exchangeRate');
    const itemNameSelect = document.getElementById('itemNameSelect');
    const otherItemNameContainer = document.getElementById('otherItemNameContainer');
    const otherItemNameInput = document.getElementById('otherItemNameInput');
    const searchInput = document.getElementById('inventorySearchInput');
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    const filterSalesBtn = document.getElementById('filterSalesBtn');

    // Chart Instance
    let salesChartInstance = null;

    // State
    let inventoryData = {};
    let salesData = {};
    let currentCurrency = 'USD';
    let exchangeRate = 4100;

    // Initialize
    initialize();

    function initialize() {
        // Set Today's Date
        todayBtn.addEventListener('click', () => {
            const today = new Date();
            const dd = String(today.getDate()).padStart(2, '0');
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const yyyy = today.getFullYear();
            importDateInput.value = `${dd}/${mm}/${yyyy}`;
        });

        // Event Listeners
        currencySelector.addEventListener('change', updateCurrencySettings);
        exchangeRateInput.addEventListener('change', updateCurrencySettings);
        itemNameSelect.addEventListener('change', toggleOtherInput);
        document.getElementById('addInventoryForm').addEventListener('submit', handleAddInventory);
        document.getElementById('editInventoryForm').addEventListener('submit', handleUpdateInventory);
        searchInput.addEventListener('input', renderInventoryTable);
        filterSalesBtn.addEventListener('click', renderSalesTable);

        // Input Calculations for Add Modal
        ['quantity', 'unitCost'].forEach(id => {
            document.getElementById(id).addEventListener('input', calculateTotalCost);
        });

        // Initialize Settings
        updateCurrencySettings();

        // Listen for Data
        fetchInventory();
        fetchSales();
    }

    // --- Data Fetching ---

    function fetchInventory() {
        inventoryRef.on('value', (snapshot) => {
            inventoryData = snapshot.val() || {};
            renderInventoryTable();
            updateStats();
        });
    }

    function fetchSales() {
        salesRef.on('value', (snapshot) => {
            salesData = snapshot.val() || {};
            renderSalesTable(); // Initial render with no filter or default
            updateStats();
        });
    }

    // --- Core Funcs ---

    function updateCurrencySettings() {
        currentCurrency = currencySelector.value;
        exchangeRate = parseInt(exchangeRateInput.value) || 4100;

        // Update UI Symbols
        document.querySelectorAll('[id^="currentCurrency"], [id^="add-currency"], [id^="add-unit-currency"], [id^="add-selling-currency"]').forEach(el => {
            el.textContent = currentCurrency === 'USD' ? '$' : '៛';
        });

        // Re-render
        renderInventoryTable();
        renderSalesTable();
        updateStats();
    }

    function formatCurrency(amountUSD) {
        if (!amountUSD) return currentCurrency === 'USD' ? '$0.00' : '0 ៛';
        if (currentCurrency === 'USD') {
            return '$' + parseFloat(amountUSD).toFixed(2);
        } else {
            return Math.ceil(parseFloat(amountUSD) * exchangeRate).toLocaleString() + ' ៛';
        }
    }

    function toggleOtherInput() {
        if (itemNameSelect.value === 'ផ្សេងៗ') {
            otherItemNameContainer.style.display = 'block';
            otherItemNameInput.setAttribute('required', 'true');
        } else {
            otherItemNameContainer.style.display = 'none';
            otherItemNameInput.removeAttribute('required');
        }
    }

    function calculateTotalCost() {
        const qty = parseFloat(document.getElementById('quantity').value) || 0;
        const cost = parseFloat(document.getElementById('unitCost').value) || 0;
        document.getElementById('totalCostDisplay').value = (qty * cost).toFixed(2);
    }

    // --- Rendering ---

    function renderInventoryTable() {
        const tbody = document.getElementById('currentStockTableBody');
        tbody.innerHTML = '';

        const searchTerm = searchInput.value.toLowerCase().trim();
        let items = Object.entries(inventoryData).map(([key, val]) => ({ key, ...val }));

        // Filter
        if (searchTerm) {
            items = items.filter(item => item.itemName.toLowerCase().includes(searchTerm));
        }

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">មិនមានទិន្នន័យ</td></tr>';
            return;
        }

        items.forEach((item, index) => {
            const tr = document.createElement('tr');
            const totalCostVal = (item.quantity * item.unitCost).toFixed(2);

            // Check low stock
            const lowStockClass = item.quantity <= 5 ? 'table-danger' : '';
            if (lowStockClass) tr.classList.add('table-danger');

            tr.innerHTML = `
                <td>${index + 1}</td>
                <td class="fw-bold">${item.itemName}</td>
                <td><span class="badge ${item.quantity > 5 ? 'bg-success' : 'bg-danger'}">${item.quantity}</span></td>
                <td class="text-end">${formatCurrency(item.unitCost)}</td>
                <td class="text-end fw-bold text-primary">${formatCurrency(item.sellingPrice)}</td>
                <td class="text-end">${formatCurrency(totalCostVal)}</td>
                <td>${item.importDate}</td>
                <td>
                    <button class="btn btn-sm btn-outline-success me-1" onclick="openSellModal('${item.key}')" title="លក់"><i class="fi fi-rr-shopping-cart"></i></button>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditModal('${item.key}')" title="កែប្រែ"><i class="fi fi-rr-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteItem('${item.key}')" title="លុប"><i class="fi fi-rr-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderSalesTable() {
        const tbody = document.getElementById('salesReportTableBody');
        tbody.innerHTML = '';

        let sales = Object.entries(salesData).map(([key, val]) => ({ key, ...val }));

        // Date Filter
        const start = startDateFilter.value;
        const end = endDateFilter.value;

        if (start && end) {
            const startDate = new Date(start);
            const endDate = new Date(end);
            endDate.setHours(23, 59, 59); // End of day

            sales = sales.filter(item => {
                // salesDate format usually ISO or timestamp. Let's assume ISO or timestamp from logic below.
                // We will save as ISO string or timestamp. Let's standadize on timestamp for filter.
                const itemDate = new Date(item.timestamp);
                return itemDate >= startDate && itemDate <= endDate;
            });
        }

        // Sort newest first
        sales.sort((a, b) => b.timestamp - a.timestamp);

        document.getElementById('filteredSalesCount').textContent = sales.length;

        if (sales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">មិនមានទិន្នន័យលក់ក្នុងចន្លោះពេលនេះ។</td></tr>';
            updateChart([]);
            return;
        }

        // Aggregate for Chart
        const chartData = {};

        sales.forEach(sale => {
            const tr = document.createElement('tr');
            const total = (sale.quantity * sale.sellingPrice).toFixed(2);

            // Format Date for Display
            const dateObj = new Date(sale.timestamp);
            const dateStr = dateObj.toLocaleDateString('km-KH');

            // Chart Data Aggregation (Group by Date)
            const dateKey = dateObj.toLocaleDateString('en-CA'); // YYYY-MM-DD
            if (!chartData[dateKey]) chartData[dateKey] = 0;
            chartData[dateKey] += parseFloat(total);

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td class="fw-bold">${sale.itemName}</td>
                <td class="text-end">${sale.quantity}</td>
                <td class="text-end">${formatCurrency(sale.unitCost)}</td>
                <td class="text-end">${formatCurrency(sale.sellingPrice)}</td>
                <td class="text-end fw-bold text-success">${formatCurrency(total)}</td>
                <td>${sale.seller || 'N/A'}</td>
                <td>
                     <button class="btn btn-sm btn-light text-danger" onclick="revertSale('${sale.key}')" title="បោះបង់ការលក់ (Revert)"><i class="fi fi-rr-undo"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Update Chart
        updateChart(chartData);
    }

    function updateChart(dataObj) {
        const ctx = document.getElementById('salesChart').getContext('2d');

        // Prepare data
        const labels = Object.keys(dataObj).sort(); // Date strings
        const values = labels.map(l => dataObj[l]);

        if (salesChartInstance) {
            salesChartInstance.destroy();
        }

        salesChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `ចំណូលលក់ (${currentCurrency})`, // Sales Revenue
                    data: values.map(v => currentCurrency === 'USD' ? v : v * exchangeRate),
                    borderColor: '#2C0157',
                    backgroundColor: 'rgba(44, 1, 87, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { borderDash: [5, 5] }
                    },
                    x: {
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    function updateStats() {
        let totalItems = 0;
        let totalCost = 0;
        let lowStock = 0;

        Object.values(inventoryData).forEach(item => {
            const qty = parseInt(item.quantity) || 0;
            const cost = parseFloat(item.unitCost) || 0;

            totalItems += qty;
            totalCost += (qty * cost);
            if (qty <= 5) lowStock++;
        });

        let totalRevenue = 0;
        Object.values(salesData).forEach(sale => {
            totalRevenue += (sale.quantity * sale.sellingPrice);
        });

        // UI Update
        // Animate numbers? For now just set text
        document.getElementById('totalItems').textContent = totalItems;
        document.getElementById('totalCost').textContent = formatCurrency(totalCost);
        document.getElementById('totalSalesRevenue').textContent = formatCurrency(totalRevenue);
        document.getElementById('lowStockCount').textContent = lowStock;
    }

    // --- Actions ---

    // 1. Add Inventory
    function handleAddInventory(e) {
        e.preventDefault();

        const nameSelect = document.getElementById('itemNameSelect').value;
        const nameOther = document.getElementById('otherItemNameInput').value;
        const finalName = nameSelect === 'ផ្សេងៗ' ? nameOther : nameSelect;

        if (!finalName) return alert('សូមបញ្ចូលឈ្មោះសម្ភារៈ');

        const newItem = {
            itemName: finalName,
            supplier: document.getElementById('supplierName').value,
            importDate: document.getElementById('importDate').value,
            quantity: parseInt(document.getElementById('quantity').value),
            unitCost: parseFloat(document.getElementById('unitCost').value),
            sellingPrice: parseFloat(document.getElementById('sellingPrice').value),
            notes: document.getElementById('itemNotes').value,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        inventoryRef.push(newItem)
            .then(() => {
                bootstrap.Modal.getInstance(document.getElementById('addInventoryModal')).hide();
                e.target.reset();
                // SweetAlert would be nice here, but using standard alert or silent for now
                // alert('បញ្ចូលជោគជ័យ!');
            })
            .catch(err => alert(err.message));
    }

    // 2. Sell Item
    window.openSellModal = function (key) {
        const item = inventoryData[key];
        if (!item) return;

        // Store selected item key on the modal DOM or a variable
        const modal = document.getElementById('sellItemModal');
        modal.dataset.itemKey = key;

        new bootstrap.Modal(modal).show();
    };

    // Handle Sell Buttons Click
    document.querySelectorAll('.sell-currency-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const currency = btn.dataset.currency;
            const modal = document.getElementById('sellItemModal');
            const key = modal.dataset.itemKey;
            const item = inventoryData[key];

            if (!item) return;

            // Prompt for quantity
            // This is a simple blocking prompt. Enhanced UI could use a form inside modal.
            // Given the UI shows buttons immediately, let's ask qty now.
            const qtyStr = prompt(`លក់ "${item.itemName}"។ \nចំនួននៅសល់: ${item.quantity}\nសូមបញ្ចូលចំនួនលក់:`, "1");
            if (!qtyStr) return;

            const qty = parseInt(qtyStr);
            if (isNaN(qty) || qty <= 0) return alert('ចំនួនមិនត្រឹមត្រូវ');
            if (qty > item.quantity) return alert('ចំនួនក្នុងស្តុកមិនគ្រប់គ្រាន់');

            confirmSale(key, item, qty, currency);
        });
    });

    function confirmSale(key, item, qty, currency) {
        const saleRecord = {
            itemName: item.itemName,
            quantity: qty,
            unitCost: item.unitCost,
            sellingPrice: item.sellingPrice, // Stores base USD price
            currencyUsed: currency,
            exchangeRate: exchangeRate, // Rate at moment of sale
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            seller: document.getElementById('user-display-email').textContent || 'Unknown',
            inventoryKey: key
        };

        // 1. Update Inventory
        inventoryRef.child(key).update({
            quantity: item.quantity - qty
        }).then(() => {
            // 2. Add Sale Record
            return salesRef.push(saleRecord);
        }).then(() => {
            bootstrap.Modal.getInstance(document.getElementById('sellItemModal')).hide();
        }).catch(err => alert(err.message));
    }

    // 3. Edit Inventory
    window.openEditModal = function (key) {
        const item = inventoryData[key];
        if (!item) return;

        document.getElementById('edit-inventory-id').value = key;
        document.getElementById('edit-itemName').value = item.itemName;
        document.getElementById('edit-quantity').value = item.quantity;
        document.getElementById('edit-unitCost').value = item.unitCost;
        document.getElementById('edit-sellingPrice').value = item.sellingPrice;
        document.getElementById('edit-supplierName').value = item.supplier || '';
        document.getElementById('edit-itemNotes').value = item.notes || '';

        new bootstrap.Modal(document.getElementById('editInventoryModal')).show();
    };

    function handleUpdateInventory(e) {
        e.preventDefault();
        const key = document.getElementById('edit-inventory-id').value;
        const updates = {
            itemName: document.getElementById('edit-itemName').value,
            quantity: parseInt(document.getElementById('edit-quantity').value),
            unitCost: parseFloat(document.getElementById('edit-unitCost').value),
            sellingPrice: parseFloat(document.getElementById('edit-sellingPrice').value),
            supplier: document.getElementById('edit-supplierName').value,
            notes: document.getElementById('edit-itemNotes').value
        };

        inventoryRef.child(key).update(updates)
            .then(() => {
                bootstrap.Modal.getInstance(document.getElementById('editInventoryModal')).hide();
            })
            .catch(err => alert(err.message));
    }

    // 4. Delete Item
    window.deleteItem = function (key) {
        if (confirm('តើអ្នកពិតជាចង់លុបទិន្នន័យនេះមែនទេ?')) {
            inventoryRef.child(key).remove();
        }
    };

    // 5. Revert Sale (Undo)
    window.revertSale = function (saleKey) {
        const sale = salesData[saleKey];
        if (!sale) return;

        if (confirm(`បោះបង់ការលក់ "${sale.itemName}" ចំនួន ${sale.quantity} ឯកតា? \nស្តុកនឹងត្រូវបានបញ្ចូលមកវិញ។`)) {
            // Find inventory item to restore stock
            // Note: inventoryKey might be stored in saleRecord if we added it (I added it in confirmSale)
            // If the item was deleted from inventory, we can't easily restore stock to the same ID unless we check or recreate.
            // For simplicity, let's try to update if key exists.

            const invKey = sale.inventoryKey;

            // Check if item still exists
            inventoryRef.child(invKey).once('value', snapshot => {
                if (snapshot.exists()) {
                    const currentQty = snapshot.val().quantity || 0;
                    inventoryRef.child(invKey).update({
                        quantity: currentQty + sale.quantity
                    }).then(() => {
                        // Remove sale record
                        salesRef.child(saleKey).remove();
                    });
                } else {
                    alert('Items no longer exists in inventory. Cannot restore stock, but will remove sale record.');
                    salesRef.child(saleKey).remove();
                }
            });
        }
    };

});