
// ==========================================
// INVENTORY MANAGEMENT SCRIPT
// ==========================================

let inventoryData = {};
let salesData = {};
let currentCurrency = 'USD';
let exchangeRate = 4100;
let itemToSellId = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log("Inventory Script Loaded");

    // Initialize Data Listeners
    setupInventoryListener();
    setupSalesListener();

    // Event Listeners
    setupEventListeners();
});

function setupInventoryListener() {
    inventoryRef.on('value', (snapshot) => {
        inventoryData = snapshot.val() || {};
        renderInventoryTable();
        updateSummaryCards();
    });
}

function setupSalesListener() {
    salesRef.on('value', (snapshot) => {
        salesData = snapshot.val() || {};
        renderSalesTable();
    });
}

function renderSalesTable() {
    const tbody = document.getElementById('soldStockTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchInput = document.getElementById('inventorySearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    let index = 1;
    // Sort by date desc (optional) or just entry
    const items = Object.entries(salesData).reverse(); // Show latest first

    items.forEach(([id, item]) => {
        if (searchTerm && !item.itemName.toLowerCase().includes(searchTerm)) return;

        const date = item.soldDate || formatDate(item.soldAt);
        const keeper = item.stockKeeper || '-';
        const note = item.note || '-';
        const totalPrice = item.totalPrice || 0;
        const unitPrice = item.pricePerUnit || 0;

        const unitPriceKHR = item.pricePerUnitKHR || (unitPrice * exchangeRate);
        const tr = document.createElement('tr');
        const totalPriceKHR = totalPrice * exchangeRate;

        tr.innerHTML = `
            <td class="ps-4 text-muted">${index++}</td>
            <td class="text-secondary small">${date}</td>
            <td class="text-secondary fw-bold">${keeper}</td>
            <td class="fw-bold text-dark">${item.itemName}</td>
            <td class="text-center"><span class="badge bg-danger">${item.quantity}</span></td>
            <td class="text-end text-muted">${unitPriceKHR.toLocaleString('en-US')} ៛</td>
            <td class="text-end fw-bold text-success">$${parseFloat(totalPrice).toFixed(2)}</td>
            <td class="text-end fw-bold text-primary">${totalPriceKHR.toLocaleString('en-US')} ៛</td>
            <td class="small text-muted text-truncate" style="max-width: 150px;">${note}</td>
            <td class="text-center">
                <button class="btn btn-action btn-delete" onclick="deleteSaleRecord('${id}')" title="លុប">
                    <i class="fi fi-rr-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteSaleRecord(saleId) {
    if (!confirm("តើអ្នកពិតជាចង់លុបកំណត់ត្រាលក់នេះមែនទេ? ស្តុកនឹងត្រូវបានបង្វិលសងវិញ។")) return;

    const sale = salesData[saleId];
    if (!sale) return;

    const itemId = sale.itemId;
    const qty = parseInt(sale.quantity) || 0;

    // Restore Stock Logic
    if (itemId && inventoryData[itemId]) {
        const item = inventoryData[itemId];
        const currentStockOut = parseInt(item.stockOut) || 0;
        const newStockOut = Math.max(0, currentStockOut - qty); // Prevent negative

        inventoryRef.child(itemId).update({ stockOut: newStockOut });
    }

    // Remove Sale Record
    salesRef.child(saleId).remove()
        .then(() => alert("លុបកំណត់ត្រាលក់ជោគជ័យ!"))
        .catch(err => alert("កំហុស: " + err.message));
}

function deleteAllSales() {
    if (Object.keys(salesData).length === 0) return alert("គ្មានទិន្នន័យសម្រាប់លុបទេ!");

    const confirmInput = prompt("តើអ្នកពិតជាចង់លុបប្រវត្តិលក់ *ទាំងអស់* មែនទេ? ស្តុកទាំងអស់នឹងត្រូវបានបង្វិលសងវិញ។\n\nវាយពាក្យ 'DELETE' ដើម្បីបញ្ជាក់:");
    if (confirmInput !== 'DELETE') return;

    // Process all sales to restore stock
    const updates = {};
    const stockRestorations = {}; // Map itemId -> qty to restore

    Object.entries(salesData).forEach(([saleId, sale]) => {
        // Mark sale for deletion
        updates[`sales/${saleId}`] = null;

        // Aggregate stock restoration
        const itemId = sale.itemId;
        const qty = parseInt(sale.quantity) || 0;

        if (itemId) {
            stockRestorations[itemId] = (stockRestorations[itemId] || 0) + qty;
        }
    });

    // Apply stock restorations
    Object.entries(stockRestorations).forEach(([itemId, qtyToRestore]) => {
        if (inventoryData[itemId]) {
            const currentStockOut = parseInt(inventoryData[itemId].stockOut) || 0;
            const newStockOut = Math.max(0, currentStockOut - qtyToRestore);

            // We can't put this in the same multi-path update easily because paths are different refs usually
            // but here we have refs. Let's just update directly.
            inventoryRef.child(itemId).update({ stockOut: newStockOut });
        }
    });

    // Delete all sales
    salesRef.remove()
        .then(() => alert("លុបប្រវត្តិទាំងអស់ជោគជ័យ!"))
        .catch(err => alert("កំហុស: " + err.message));
}

function setupEventListeners() {
    // Currency Toggle
    const currencySelector = document.getElementById('currencySelector');
    if (currencySelector) {
        currencySelector.addEventListener('change', (e) => {
            currentCurrency = e.target.value;
            renderInventoryTable();
            updateSummaryCards();
        });
    }

    const exchangeInput = document.getElementById('exchangeRate');
    if (exchangeInput) {
        exchangeInput.addEventListener('change', (e) => {
            exchangeRate = parseInt(e.target.value) || 4100;
            renderInventoryTable();
            updateSummaryCards();
        });
    }

    // Add Inventory Form
    const addForm = document.getElementById('addInventoryForm');
    if (addForm) {
        addForm.addEventListener('submit', handleAddInventory);
    }

    // Handle "Other" selection
    const nameSelect = document.getElementById('itemNameSelect');
    if (nameSelect) {
        nameSelect.addEventListener('change', function () {
            const otherContainer = document.getElementById('otherItemNameContainer');
            if (this.value === 'ផ្សេងៗ') {
                otherContainer.style.display = 'block';
                document.getElementById('otherItemNameInput').required = true;
            } else {
                otherContainer.style.display = 'none';
                document.getElementById('otherItemNameInput').required = false;
            }
        });
    }

    // Search
    const searchInput = document.getElementById('inventorySearchInput');
    if (searchInput) {
        searchInput.addEventListener('keyup', () => {
            renderInventoryTable();
            renderSalesTable();
        });
    }

    // Date/Today Button (Import)
    document.getElementById('todayBtn')?.addEventListener('click', () => {
        const today = new Date();
        const d = String(today.getDate()).padStart(2, '0');
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const y = today.getFullYear();
        document.getElementById('importDate').value = `${d}/${m}/${y}`;
    });

    // Sell Stock Form
    const sellForm = document.getElementById('sellStockForm');
    if (sellForm) {
        sellForm.addEventListener('submit', handleSellStock);
    }

    // Sell Date/Today Button
    document.getElementById('todaySellBtn')?.addEventListener('click', () => {
        const today = new Date();
        const d = String(today.getDate()).padStart(2, '0');
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const y = today.getFullYear();
        document.getElementById('sellDate').value = `${d}/${m}/${y}`;
    });

    // Calculate Sell Totals on Quantity Change
    // Calculate Sell Totals
    const sellQtyInput = document.getElementById('sellQuantity');
    const sellUnitPriceInput = document.getElementById('sellUnitPrice');
    const sellTotalUSDInput = document.getElementById('sellTotalPriceUSD');
    const sellTotalKHRInput = document.getElementById('sellTotalPriceKHR');

    const updateSellCalc = () => {
        const qty = parseInt(sellQtyInput.value) || 0;
        const unitPriceKHR = parseFloat(sellUnitPriceInput.value) || 0;

        const totalKHR = qty * unitPriceKHR;
        const totalUSD = exchangeRate > 0 ? (totalKHR / exchangeRate) : 0;

        // Update Totals
        sellTotalKHRInput.value = totalKHR.toLocaleString('en-US');
        sellTotalUSDInput.value = totalUSD.toFixed(2);
    };

    if (sellQtyInput) sellQtyInput.addEventListener('input', updateSellCalc);
    if (sellUnitPriceInput) sellUnitPriceInput.addEventListener('input', updateSellCalc);

    // Optional: Update KHR if Total USD is manually edited
    // (Disabled or updated since we primarily use KHR now)
    /*
    if (sellTotalUSDInput) {
        sellTotalUSDInput.addEventListener('input', function () {
            const total = parseFloat(this.value) || 0;
            sellTotalKHRInput.value = (total * exchangeRate).toLocaleString('en-US');
        });
    }
    */

    // Restock Modal Form
    const restockForm = document.getElementById('restockForm');
    if (restockForm) {
        restockForm.addEventListener('submit', handleRestock);
    }

    // Restock Date/Today Button
    document.getElementById('todayRestockBtn')?.addEventListener('click', () => {
        const today = new Date();
        const d = String(today.getDate()).padStart(2, '0');
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const y = today.getFullYear();
        document.getElementById('restockDate').value = `${d}/${m}/${y}`;
    });

    // Transfer Form
    const transferForm = document.getElementById('transferForm');
    if (transferForm) {
        transferForm.addEventListener('submit', handleTransfer);
    }

    // Transfer Date/Today Button
    document.getElementById('transferTodayBtn')?.addEventListener('click', () => {
        const today = new Date();
        const d = String(today.getDate()).padStart(2, '0');
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const y = today.getFullYear();
        document.getElementById('transferDate').value = `${d}/${m}/${y}`;
    });

    // Return Stock Form
    const returnForm = document.getElementById('returnStockForm');
    if (returnForm) {
        returnForm.addEventListener('submit', handleReturnStock);
    }

    // Return Date/Today Button
    document.getElementById('returnTodayBtn')?.addEventListener('click', () => {
        const today = new Date();
        const d = String(today.getDate()).padStart(2, '0');
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const y = today.getFullYear();
        document.getElementById('returnDate').value = `${d}/${m}/${y}`;
    });
    // Edit Inventory Form
    const editForm = document.getElementById('editInventoryForm');
    if (editForm) {
        editForm.addEventListener('submit', handleEditInventory);
    }
}

// ==========================================
// CRUD OPERATIONS
// ==========================================

function handleAddInventory(e) {
    e.preventDefault();

    const nameSelect = document.getElementById('itemNameSelect');
    let name = nameSelect.value;
    if (name === 'ផ្សេងៗ') {
        name = document.getElementById('otherItemNameInput').value;
    }

    const qty = parseInt(document.getElementById('quantity').value) || 0;
    const oldStock = parseInt(document.getElementById('oldStock').value) || 0;
    const officeInitial = parseInt(document.getElementById('officeInitialStock').value) || 0;
    const stockKeeper = document.getElementById('stockKeeperName').value;

    const item = {
        itemName: name,
        supplierName: "",
        stockKeeper: stockKeeper,
        importDate: document.getElementById('importDate').value,

        // New Logic
        warehouseIn: qty,     // Initial Stock In (Warehouse)
        oldStock: oldStock,   // Old Stock
        officeIn: officeInitial, // Initial Office Stock
        stockOut: 0,          // Nothing sold yet

        unitCost: 0,
        sellingPrice: 0,
        notes: document.getElementById('itemNotes').value,
        createdAt: new Date().toISOString()
    };

    inventoryRef.push(item)
        .then(() => {
            alert("បញ្ចូលស្តុកជោគជ័យ!");
            e.target.reset();
            const modalEl = document.getElementById('addInventoryModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
        })
        .catch(err => alert("កំហុស: " + err.message));
}

// Open Restock Modal
function openRestockModal(id) {
    const item = inventoryData[id];
    if (!item) return;

    // Populate Modal
    document.getElementById('restockItemId').value = id;
    document.getElementById('restockItemNameDisplay').innerText = item.itemName;

    const warehouseIn = parseInt(item.warehouseIn) || parseInt(item.totalIn) || parseInt(item.quantity) || 0;
    const oldStock = parseInt(item.oldStock) || 0; // Include Old Stock
    const officeIn = parseInt(item.officeIn) || 0;
    const currentWarehouse = (warehouseIn + oldStock) - officeIn;
    document.getElementById('restockCurrentStockDisplay').value = currentWarehouse;

    document.getElementById('restockQuantity').value = '';
    document.getElementById('restockSupplier').value = item.supplierName || '';
    document.getElementById('restockUnitCost').value = item.unitCost || '';
    document.getElementById('restockNote').value = '';

    // Set Date Default
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    document.getElementById('restockDate').value = `${d}/${m}/${y}`;

    // Show Modal
    const modalEl = document.getElementById('restockModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function handleRestock(e) {
    e.preventDefault();
    const id = document.getElementById('restockItemId').value;
    const item = inventoryData[id];
    if (!item) return;

    const qty = parseInt(document.getElementById('restockQuantity').value);

    if (isNaN(qty) || qty <= 0) {
        alert("ចំនួនមិនត្រឹមត្រូវ!");
        return;
    }

    const currentWarehouseIn = parseInt(item.warehouseIn) || parseInt(item.totalIn) || parseInt(item.quantity) || 0;
    const newWarehouseIn = currentWarehouseIn + qty;

    const updates = {
        warehouseIn: newWarehouseIn,
        totalIn: newWarehouseIn // Keep for compatibility
    };

    const supplier = document.getElementById('restockSupplier').value;
    const unitCost = parseFloat(document.getElementById('restockUnitCost').value);
    const note = document.getElementById('restockNote').value;
    const dateStr = document.getElementById('restockDate').value;

    if (supplier) updates.supplierName = supplier;
    if (!isNaN(unitCost)) updates.unitCost = unitCost;
    if (note) updates.notes = (item.notes ? item.notes + '\n' : '') + `[Restock Warehouse ${dateStr}: +${qty}] ${note}`;

    inventoryRef.child(id).update(updates).then(() => {
        alert("បន្ថែមស្តុកជោគជ័យ!");
        const modalEl = document.getElementById('restockModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
    });
}

// Open Transfer Modal
function openTransferModal(id) {
    const item = inventoryData[id];
    if (!item) return;

    const warehouseIn = parseInt(item.warehouseIn) || parseInt(item.totalIn) || parseInt(item.quantity) || 0;
    const oldStock = parseInt(item.oldStock) || 0;
    const officeIn = parseInt(item.officeIn) || 0;
    const currentWarehouse = (warehouseIn + oldStock) - officeIn;

    document.getElementById('transferItemId').value = id;
    document.getElementById('transferItemName').innerText = item.itemName;
    document.getElementById('transferWarehouseStock').value = currentWarehouse;
    document.getElementById('transferQty').value = '';
    document.getElementById('transferNote').value = '';

    // Set Date Default
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    document.getElementById('transferDate').value = `${d}/${m}/${y}`;

    const modalEl = document.getElementById('transferModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function handleTransfer(e) {
    e.preventDefault();
    const id = document.getElementById('transferItemId').value;
    const item = inventoryData[id];
    if (!item) return;

    const qty = parseInt(document.getElementById('transferQty').value) || 0;
    const warehouseIn = parseInt(item.warehouseIn) || parseInt(item.totalIn) || parseInt(item.quantity) || 0;
    const oldStock = parseInt(item.oldStock) || 0;
    const officeIn = parseInt(item.officeIn) || 0;
    const currentWarehouse = (warehouseIn + oldStock) - officeIn;

    if (qty <= 0 || qty > currentWarehouse) {
        alert("ចំនួនផ្ទេរមិនត្រឹមត្រូវ ឬលើសពីស្តុកក្នុងឃ្លាំង!");
        return;
    }

    const newOfficeIn = officeIn + qty;
    const note = document.getElementById('transferNote').value;
    const dateStr = document.getElementById('transferDate').value;

    const updates = {
        officeIn: newOfficeIn
    };
    const logEntry = `[Transfer -> Office ${dateStr}: ${qty}] ${note}`;
    updates.notes = (item.notes ? item.notes + '\n' : '') + logEntry;

    inventoryRef.child(id).update(updates).then(() => {
        alert("ផ្ទេរស្តុកទៅការិយាល័យបានជោគជ័យ!");
        const modalEl = document.getElementById('transferModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
    });
}

// Open Return Modal
function openReturnModal(id) {
    const item = inventoryData[id];
    if (!item) return;

    const warehouseIn = parseInt(item.warehouseIn) || parseInt(item.totalIn) || parseInt(item.quantity) || 0;
    const oldStock = parseInt(item.oldStock) || 0;
    const officeIn = parseInt(item.officeIn) || 0;
    const stockOut = parseInt(item.stockOut) || 0; // Sold

    // Items effectively IN the office (Transferred In - Sold)
    const currentOffice = Math.max(0, officeIn - stockOut);

    document.getElementById('returnItemId').value = id;
    document.getElementById('returnItemName').innerText = item.itemName;
    document.getElementById('returnOfficeStock').value = currentOffice;
    document.getElementById('returnQty').value = '';
    document.getElementById('returnNote').value = '';

    // Set Date Default
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    document.getElementById('returnDate').value = `${d}/${m}/${y}`;

    const modalEl = document.getElementById('returnStockModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function handleReturnStock(e) {
    e.preventDefault();
    const id = document.getElementById('returnItemId').value;
    const item = inventoryData[id];
    if (!item) return;

    const qty = parseInt(document.getElementById('returnQty').value) || 0;
    const officeIn = parseInt(item.officeIn) || 0;
    const stockOut = parseInt(item.stockOut) || 0;
    const currentOffice = Math.max(0, officeIn - stockOut);

    if (qty <= 0 || qty > currentOffice) {
        alert("ចំនួនត្រឡប់មិនត្រឹមត្រូវ ឬលើសពីស្តុកនៅការិយាល័យ!");
        return;
    }

    // Returning to warehouse means DECREASING the 'officeIn' count
    // Because officeIn represents "Total transferred FROM warehouse TO office"
    // So if we return, we are effectively un-transferring.
    const newOfficeIn = Math.max(0, officeIn - qty);

    const note = document.getElementById('returnNote').value;
    const dateStr = document.getElementById('returnDate').value;

    const updates = {
        officeIn: newOfficeIn
    };
    const logEntry = `[Return <- Warehouse ${dateStr}: ${qty}] ${note}`;
    updates.notes = (item.notes ? item.notes + '\n' : '') + logEntry;

    inventoryRef.child(id).update(updates).then(() => {
        alert("ត្រឡប់ស្តុកចូលឃ្លាំងបានជោគជ័យ!");
        const modalEl = document.getElementById('returnStockModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
    });
}

// Open Sell Modal
function openSellModal(id) {
    itemToSellId = id;
    const item = inventoryData[id];
    if (!item) return;

    // Calculate current office stock
    const officeIn = parseInt(item.officeIn) || 0;
    const stockOut = parseInt(item.stockOut) || 0;
    const currentOffice = officeIn - stockOut;

    document.getElementById('sellItemId').value = id;
    document.getElementById('sellItemNameDisplay').innerText = item.itemName;
    document.getElementById('currentStockDisplay').value = currentOffice;
    document.getElementById('sellQuantity').value = '';
    const unitPriceKHR = Math.round(parseFloat(item.sellingPrice || 0) * exchangeRate);
    document.getElementById('sellUnitPrice').value = unitPriceKHR || '';
    document.getElementById('sellTotalPriceUSD').value = '0.00';
    document.getElementById('sellTotalPriceKHR').value = '0';
    document.getElementById('sellStockKeeper').value = item.stockKeeper || ''; // Default to item's keeper
    document.getElementById('sellNote').value = '';

    // Set Date Default
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    document.getElementById('sellDate').value = `${d}/${m}/${y}`;

    // Show Modal
    const modalEl = document.getElementById('sellStockModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function handleSellStock(e) {
    e.preventDefault();
    const id = document.getElementById('sellItemId').value;
    const item = inventoryData[id];
    if (!item) return;

    const qty = parseInt(document.getElementById('sellQuantity').value);
    const keeper = document.getElementById('sellStockKeeper').value;
    const note = document.getElementById('sellNote').value;
    const dateStr = document.getElementById('sellDate').value;

    // Calculate current office stock
    const officeIn = parseInt(item.officeIn) || 0;
    const stockOut = parseInt(item.stockOut) || 0;
    const currentOffice = officeIn - stockOut;

    if (isNaN(qty) || qty <= 0) {
        alert("ចំនួនមិនត្រឹមត្រូវ!");
        return;
    }

    if (qty > currentOffice) {
        alert(`ស្តុកការិយាល័យមិនគ្រប់គ្រាន់! នៅសល់តែ ${currentOffice} ប៉ុណ្ណោះ។ សូមផ្ទេរស្តុកពីឃ្លាំងជាមុនសិន។`);
        return;
    }

    const unitPriceKHR = parseFloat(document.getElementById('sellUnitPrice').value) || 0;
    const totalPriceUSD = parseFloat(document.getElementById('sellTotalPriceUSD').value) || 0;
    const unitPriceUSD = exchangeRate > 0 ? (unitPriceKHR / exchangeRate) : 0;

    // Process Sale
    const newStockOut = stockOut + qty;

    // Log Sale
    const saleRecord = {
        itemId: id,
        itemName: item.itemName,
        quantity: qty,
        soldAt: new Date().toISOString(),
        soldDate: dateStr, // User input date
        totalPrice: totalPriceUSD,
        pricePerUnit: unitPriceUSD,
        pricePerUnitKHR: unitPriceKHR, // Save the original KHR input
        stockKeeper: keeper,
        note: note,
        currency: 'USD',
        exchangeRate: exchangeRate // Capture the rate used
    };

    // Atomic update
    inventoryRef.child(id).update({ stockOut: newStockOut });
    salesRef.push(saleRecord).then(() => {
        alert("លក់ចេញជោគជ័យ!");
        // Hide Modal
        const modalEl = document.getElementById('sellStockModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
    });
}

function deleteItem(id) {
    if (confirm("តើអ្នកពិតជាចង់លុបទិន្នន័យនេះមែនទេ?")) {
        inventoryRef.child(id).remove();
    }
}

// Open Edit Modal
function openEditModal(id) {
    const item = inventoryData[id];
    if (!item) return;

    document.getElementById('editItemId').value = id;
    document.getElementById('editItemName').value = item.itemName;
    document.getElementById('editStockKeeper').value = item.stockKeeper || '';
    document.getElementById('editUnitCost').value = item.unitCost || '';
    document.getElementById('editSellingPrice').value = item.sellingPrice || '';
    document.getElementById('editNote').value = item.notes || '';

    // Advanced Stock Fields
    document.getElementById('editOldStock').value = item.oldStock || 0;
    document.getElementById('editOfficeInitialStock').value = item.officeIn || 0;

    const modalEl = document.getElementById('editInventoryModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function handleEditInventory(e) {
    e.preventDefault();
    const id = document.getElementById('editItemId').value;

    const updates = {
        itemName: document.getElementById('editItemName').value,
        stockKeeper: document.getElementById('editStockKeeper').value,
        unitCost: parseFloat(document.getElementById('editUnitCost').value) || 0,
        sellingPrice: parseFloat(document.getElementById('editSellingPrice').value) || 0,
        notes: document.getElementById('editNote').value,
        oldStock: parseInt(document.getElementById('editOldStock').value) || 0,
        officeIn: parseInt(document.getElementById('editOfficeInitialStock').value) || 0
    };

    inventoryRef.child(id).update(updates).then(() => {
        alert("កែប្រែទិន្នន័យជោគជ័យ!");
        const modalEl = document.getElementById('editInventoryModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
    });
}

// ==========================================
// RENDER FUNCTIONS
// ==========================================

function renderInventoryTable() {
    const tbody = document.getElementById('currentStockTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchInput = document.getElementById('inventorySearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    let index = 1;
    const items = Object.entries(inventoryData);

    // Render columns: #, Old Stock, Item Name, Import Date, Warehouse Stock, Office Stock, Sold Out, Total, Stock Keeper, Actions
    items.forEach(([id, item]) => {
        if (searchTerm && !item.itemName.toLowerCase().includes(searchTerm)) return;

        // 1. Total Received into Warehouse (ever)
        const warehouseIn = parseInt(item.warehouseIn) || parseInt(item.totalIn) || parseInt(item.quantity) || 0;
        const oldStock = parseInt(item.oldStock) || 0;

        // 2. Total Transferred to Office (ever)
        const officeIn = parseInt(item.officeIn) || 0;

        // 3. Total Sold (ever)
        const stockOut = parseInt(item.stockOut) || 0;

        // Current Balances
        const totalReceived = warehouseIn + oldStock;
        const currentWarehouse = Math.max(0, totalReceived - officeIn);
        const currentOffice = Math.max(0, officeIn - stockOut);

        const totalRemaining = currentWarehouse + currentOffice;

        const stockKeeper = item.stockKeeper || '-';
        const importDate = item.importDate || formatDate(item.createdAt) || '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ps-4 text-muted">${index++}</td>
            <td class="text-center text-muted fw-bold">${oldStock > 0 ? oldStock : '-'}</td>
            <td class="fw-bold text-dark">${item.itemName}</td>
            <td class="small text-muted">${importDate}</td>
            <td class="text-center"><span class="badge bg-secondary" style="font-size: 0.9rem;">${currentWarehouse}</span></td>
            <td class="text-center"><span class="badge bg-primary" style="font-size: 0.9rem;">${currentOffice}</span></td>
            <td class="text-center"><span class="badge bg-danger" style="font-size: 0.9rem;">${stockOut}</span></td>
            <td class="text-center"><span class="badge bg-success" style="font-size: 1rem;">${totalRemaining}</span></td>
            <td class="text-secondary small fw-bold">${stockKeeper}</td>
            <td class="text-center pe-4">
                <button class="btn btn-action btn-add-stock" onclick="openRestockModal('${id}')" title="ចូលឃ្លាំង (+)">
                    <i class="fi fi-rr-plus"></i>
                </button>
                <button class="btn btn-action btn-info text-white" onclick="openTransferModal('${id}')" title="ផ្ទេរទៅការិយាល័យ (->)">
                    <i class="fi fi-rr-exchange-alt"></i>
                </button>
                <button class="btn btn-action btn-secondary text-white" onclick="openReturnModal('${id}')" title="ត្រឡប់ចូលឃ្លាំង (<-)">
                    <i class="fi fi-rr-undo"></i>
                </button>
                <button class="btn btn-action btn-sell-stock" onclick="openSellModal('${id}')" title="លក់ចេញពីការិយាល័យ (-)">
                    <i class="fi fi-rr-minus"></i>
                </button>
                <button class="btn btn-action btn-warning text-dark" onclick="openEditModal('${id}')" title="កែប្រែ (Edit)">
                    <i class="fi fi-rr-edit"></i>
                </button>
                <button class="btn btn-action btn-delete" onclick="deleteItem('${id}')" title="លុប">
                    <i class="fi fi-rr-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateSummaryCards() {
    let statTotalIn = 0;
    let statTotalOut = 0;
    let totalItems = 0; // Remaining
    let totalVal = 0;

    Object.values(inventoryData).forEach(item => {
        // Use the same robust parsing as renderInventoryTable
        const warehouseIn = parseInt(item.warehouseIn) || parseInt(item.totalIn) || parseInt(item.quantity) || 0;
        const oldStock = parseInt(item.oldStock) || 0;
        const stockOut = parseInt(item.stockOut) || 0;

        const totalReceived = warehouseIn + oldStock;
        const remaining = totalReceived - stockOut;

        statTotalIn += totalReceived;
        statTotalOut += stockOut;
        totalItems += remaining;
        totalVal += (remaining * (parseFloat(item.unitCost) || 0));
    });

    if (document.getElementById('totalItems')) document.getElementById('totalItems').innerText = totalItems;
    if (document.getElementById('statTotalIn')) document.getElementById('statTotalIn').innerText = statTotalIn;
    if (document.getElementById('statTotalOut')) document.getElementById('statTotalOut').innerText = statTotalOut;
    if (document.getElementById('totalCost')) document.getElementById('totalCost').innerText = formatMoney(totalVal);
}

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

function getFilteredData(category, period) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const currentDay = today.getDate();

    let data = [];
    let dateField = '';

    if (category === 'stockOut') {
        data = Object.values(salesData);
        dateField = 'soldAt'; // ISO format
    } else {
        // inventory or stockIn
        data = Object.values(inventoryData);
        dateField = 'importDate'; // DD/MM/YYYY text format
    }

    if (period === 'all') return data;

    return data.filter(item => {
        let itemDate;
        const val = item[dateField];
        if (!val) return false;

        if (category === 'stockOut') {
            itemDate = new Date(val); // ISO
        } else {
            // Assume DD/MM/YYYY for inventory
            const parts = val.split('/');
            if (parts.length === 3) {
                itemDate = new Date(parts[2], parts[1] - 1, parts[0]);
            } else {
                itemDate = new Date(item.createdAt); // Fallback
            }
        }

        if (isNaN(itemDate.getTime())) return false;

        if (period === 'daily') {
            return itemDate.getDate() === currentDay &&
                itemDate.getMonth() === currentMonth &&
                itemDate.getFullYear() === currentYear;
        } else if (period === 'monthly') {
            return itemDate.getMonth() === currentMonth &&
                itemDate.getFullYear() === currentYear;
        }
        return true;
    });
}

async function exportToPDF() {
    const category = document.getElementById('reportCategory').value;
    const period = document.getElementById('exportType').value;

    let title = "របាយការណ៍ស្តុកសរុប (Global Inventory Report)";
    if (category === 'stockIn') title = "របាយការណ៍ស្តុកចូល (Stock In Report)";
    else if (category === 'stockOut') title = "របាយការណ៍លក់ទំនិញ (Sales Report)";

    const filteredData = getFilteredData(category, period);

    if (filteredData.length === 0) {
        alert("គ្មានទិន្នន័យសម្រាប់បោះពុម្ព (No data to export)");
        return;
    }

    // Helper for Khmer Date
    const getKhmerFullDate = () => {
        const now = new Date();
        const months = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
        const khmerNumbers = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
        const toKhmerNum = (num) => String(num).split('').map(n => khmerNumbers[parseInt(n)] || n).join('');
        return `ថ្ងៃទី ${toKhmerNum(now.getDate())} ខែ ${months[now.getMonth()]} ឆ្នាំ ${toKhmerNum(now.getFullYear())}`;
    };

    let win = window.open('', '_blank');
    let html = `<html><head><title>${title}</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <style>
             @font-face {
                font-family: 'Khmer OS Battambang';
                src: url('fonts/KhmerOSBattambang.woff2') format('woff2'),
                     url('fonts/KhmerOSBattambang.ttf') format('truetype');
            }
            body { font-family: 'Khmer OS Battambang', sans-serif; padding: 40px; color: #333; line-height: 1.6; }
            .header-layout { display: flex; align-items: center; justify-content: center; margin-bottom: 30px; border-bottom: 2px solid #e91e63; padding-bottom: 20px; }
            .logo { width: 120px; height: 120px; object-fit: contain; margin-right: 30px; }
            .school-info { text-align: center; }
            .school-info h1 { margin: 0; color: #e91e63; font-size: 28px; }
            .school-info h2 { margin: 5px 0; color: #555; font-size: 20px; font-weight: normal; }
            .report-title { text-align: center; margin: 20px 0; }
            .report-title h3 { font-size: 22px; text-decoration: underline; margin-bottom: 5px; }
            
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th, td { border: 1px solid #999; padding: 10px; text-align: center; }
            th { background-color: #f2f2f2; color: #333; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            .text-left { text-align: left; }
            .text-right { text-align: right; }
            .fw-bold { font-weight: bold; }
            .price-col { color: #2e7d32; font-weight: bold; }
            
            .summary-box { margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px; border: 1px solid #ddd; }
            .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
            .summary-item { text-align: center; }
            .summary-label { font-size: 0.9rem; color: #666; display: block; }
            .summary-value { font-size: 1.2rem; font-weight: bold; color: #e91e63; }

            .footer-date { text-align: right; margin-top: 40px; font-style: italic; font-weight: bold; }
            .footer-signatures { margin-top: 20px; display: flex; justify-content: space-between; }
            .sig-box { text-align: center; width: 22%; }
            .sig-name { margin-top: 70px; font-weight: bold; border-top: 1px solid #333; padding-top: 5px; }
            
            @media print {
                @page { size: landscape; margin: 15mm; }
                .no-print { display: none; }
                body { padding: 0; }
            }
            .action-bar { position: fixed; top: 20px; left: 40px; right: 40px; display: flex; justify-content: space-between; z-index: 1000; }
            .btn { padding: 10px 20px; border: none; border-radius: 50px; cursor: pointer; font-family: inherit; font-weight: bold; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
            .btn-print { background: #e91e63; color: white; }
            .btn-home { background: #6c757d; color: white; text-decoration: none; }
        </style>
    </head><body>
    
    <div class="action-bar no-print">
        <button class="btn btn-home" onclick="window.close()">
            <i class="fi fi-rr-home"></i> ត្រឡប់ទៅផ្ទាំងដើម (Back Home)
        </button>
        <button class="btn btn-print" onclick="window.print()">
            <i class="fi fi-rr-print"></i> បោះពុម្ពរបាយការណ៍ (Print Report)
        </button>
    </div>

    <div class="header-layout">
        <img src="img/1.jpg" class="logo">
        <div class="school-info">
            <h1>សាលាអន្តរជាតិ អាយធី ឃេ</h1>
            <h2>International School ITK</h2>
            <p style="margin: 5px 0; font-size: 0.9rem;">អាសយដ្ឋាន៖ ភូមិស្វាយធំ សង្កាត់ក្រាំងអំពិល ក្រុងកំពត ខេត្តកំពត</p>
        </div>
    </div>

    <div class="report-title">
        <h3>${title}</h3>
        <p>ប្រភេទ: <span class="fw-bold">${period === 'daily' ? "ប្រចាំថ្ងៃ" : (period === 'monthly' ? "ប្រចាំខែ" : "ទាំងអស់")}</span> | បោះពុម្ពដោយ: <span class="fw-bold">${localStorage.getItem('userName') || 'Admin'}</span></p>
    </div>

    <table>
        <thead>
            <tr>
               ${category === 'stockOut' ?
            `<th>ល.រ</th>
                  <th>កាលបរិច្ឆេទ</th>
                  <th>ឈ្មោះទំនិញ</th>
                  <th>ចំនួនលក់</th>
                  <th>តម្លៃរាយ (៛)</th>
                  <th>តម្លៃ ($)</th>
                  <th>សរុប ($)</th>
                  <th>សរុប (៛)</th>
                  <th>អ្នកលក់</th>`
            :
            `<th>ល.រ</th>
                  <th class="text-left">ឈ្មោះទំនិញ</th>
                  <th>ស្តុកចាស់</th>
                  <th>ថ្ងៃនាំចូល</th>
                  <th>ឃ្លាំង</th>
                  <th>អូហ្វីស</th>
                  <th>លក់ចេញ</th>
                  <th class="fw-bold">សរុបគ្រាប់</th>
                  <th>តម្លៃរាយ (៛)</th>
                  <th>សរុប ($)</th>
                  <th>សរុប (៛)</th>`
        }
            </tr>
        </thead>
        <tbody>
        ${filteredData.map((item, index) => {
            if (category === 'stockOut') {
                const totalUSD = parseFloat(item.totalPrice) || 0;
                const totalKHR = totalUSD * exchangeRate;
                const unitPriceKHR = item.pricePerUnitKHR || (item.pricePerUnit * exchangeRate) || 0;
                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${item.soldDate || '-'}</td>
                        <td class="text-left fw-bold">${item.itemName}</td>
                        <td class="fw-bold">${item.quantity}</td>
                        <td>${Math.round(unitPriceKHR).toLocaleString()} ៛</td>
                        <td>$${parseFloat(item.pricePerUnit || 0).toFixed(2)}</td>
                        <td class="price-col">$${totalUSD.toFixed(2)}</td>
                        <td class="price-col text-primary">${Math.round(totalKHR).toLocaleString()} ៛</td>
                        <td>${item.stockKeeper || '-'}</td>
                    </tr>`;
            } else {
                const warehouseIn = parseInt(item.warehouseIn) || parseInt(item.totalIn) || parseInt(item.quantity) || 0;
                const oldStock = parseInt(item.oldStock) || 0;
                const officeIn = parseInt(item.officeIn) || 0;
                const stockOut = parseInt(item.stockOut) || 0;

                const totalReceived = warehouseIn + oldStock;
                const currentWarehouse = Math.max(0, totalReceived - officeIn);
                const currentOffice = Math.max(0, officeIn - stockOut);

                const totalRemaining = currentWarehouse + currentOffice;
                const importDate = item.importDate || formatDate(item.createdAt) || '-';

                const unitPriceUSD = parseFloat(item.sellingPrice || 0);
                const unitPriceKHR = Math.round(unitPriceUSD * exchangeRate);
                const totalValUSD = totalRemaining * unitPriceUSD;
                const totalValKHR = totalRemaining * unitPriceKHR;

                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td class="text-left fw-bold">${item.itemName}</td>
                        <td>${oldStock > 0 ? oldStock : '-'}</td>
                        <td>${importDate}</td>
                        <td>${currentWarehouse}</td>
                        <td>${currentOffice}</td>
                        <td>${stockOut}</td>
                        <td class="fw-bold">${totalRemaining}</td>
                        <td>${unitPriceKHR.toLocaleString()} ៛</td>
                        <td class="price-col">$${totalValUSD.toFixed(2)}</td>
                        <td class="price-col">${totalValKHR.toLocaleString()} ៛</td>
                    </tr>`;
            }
        }).join('')}
        
        <!-- Grand Total Row -->
        ${(() => {
            if (category === 'stockOut') {
                let grandTotalUSD = filteredData.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
                let grandTotalQty = filteredData.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
                let grandTotalKHR = grandTotalUSD * exchangeRate;
                return `
                    <tr style="background-color: #f2f2f2; font-weight: bold; border-top: 2px solid #333;">
                        <td colspan="3" class="text-right">សរុបរួម (Grand Total):</td>
                        <td>${grandTotalQty}</td>
                        <td>-</td>
                        <td>-</td>
                        <td class="price-col">$${grandTotalUSD.toFixed(2)}</td>
                        <td class="price-col text-primary">${Math.round(grandTotalKHR).toLocaleString()} ៛</td>
                        <td>-</td>
                    </tr>`;
            } else {
                let tOld = 0, tWh = 0, tOff = 0, tOut = 0, tTotal = 0, tValUSD = 0;
                filteredData.forEach(item => {
                    const warehouseIn = parseInt(item.warehouseIn) || parseInt(item.totalIn) || parseInt(item.quantity) || 0;
                    const oldStock = parseInt(item.oldStock) || 0;
                    const officeIn = parseInt(item.officeIn) || 0;
                    const stockOut = parseInt(item.stockOut) || 0;

                    const totalReceived = warehouseIn + oldStock;
                    const currentWarehouse = Math.max(0, totalReceived - officeIn);
                    const currentOffice = Math.max(0, officeIn - stockOut);
                    const totalRemaining = currentWarehouse + currentOffice;

                    tOld += oldStock;
                    tWh += currentWarehouse;
                    tOff += currentOffice;
                    tOut += stockOut;
                    tTotal += totalRemaining;
                    tValUSD += (totalRemaining * (parseFloat(item.sellingPrice) || 0));
                });
                const tValKHR = tValUSD * exchangeRate;

                return `
                    <tr style="background-color: #f2f2f2; font-weight: bold; border-top: 2px solid #333;">
                        <td colspan="2" class="text-right">សរុបរួម (Grand Total):</td>
                        <td>${tOld}</td>
                        <td>-</td>
                        <td>${tWh}</td>
                        <td>${tOff}</td>
                        <td>${tOut}</td>
                        <td>${tTotal}</td>
                        <td>-</td>
                        <td class="price-col">$${tValUSD.toFixed(2)}</td>
                        <td class="price-col text-primary">${Math.round(tValKHR).toLocaleString()} ៛</td>
                    </tr>`;
            }
        })()}

        </tbody>
    </table>

    ${(() => {
            if (category === 'stockOut') {
                let grandTotalUSD = filteredData.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
                let grandTotalQty = filteredData.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
                return `
                <div class="summary-box">
                    <h4 style="margin: 0 0 15px 0;"><i class="fi fi-rr-checkhart-histogram me-2"></i> សង្ខេបការលក់សរុប (Grand Summary)</h4>
                    <div class="summary-grid">
                        <div class="summary-item">
                            <span class="summary-label">ចំនួនលក់សរុប (Total Sold)</span>
                            <span class="summary-value">${grandTotalQty} គ្រឿង</span>
                        </div>
                        <div class="summary-item">
                            <span class="summary-label">ទឹកប្រាក់សរុប ($)</span>
                            <span class="summary-value">$${grandTotalUSD.toFixed(2)}</span>
                        </div>
                        <div class="summary-item">
                            <span class="summary-label">ទឹកប្រាក់សរុប (៛)</span>
                            <span class="summary-value">${Math.round(grandTotalUSD * exchangeRate).toLocaleString()} ៛</span>
                        </div>
                    </div>
                </div>`;
            } else {
                let totalWarehouse = 0, totalOffice = 0, totalSold = 0, totalQty = 0, totalValUSD = 0;
                filteredData.forEach(item => {
                    const warehouseIn = parseInt(item.warehouseIn) || parseInt(item.totalIn) || parseInt(item.quantity) || 0;
                    const oldStock = parseInt(item.oldStock) || 0;
                    const officeIn = parseInt(item.officeIn) || 0;
                    const stockOut = parseInt(item.stockOut) || 0;

                    const totalReceived = warehouseIn + oldStock;
                    const cWh = Math.max(0, totalReceived - officeIn);
                    const cOff = Math.max(0, officeIn - stockOut);
                    const rem = cWh + cOff;

                    totalWarehouse += cWh;
                    totalOffice += cOff;
                    totalSold += stockOut;
                    totalQty += rem;
                    totalValUSD += (rem * (parseFloat(item.sellingPrice) || 0));
                });

                return `
                <div class="summary-box">
                    <h4 style="margin: 0 0 15px 0;"><i class="fi fi-rr-box-alt me-2"></i> សង្ខេបតុល្យភាពស្តុក និងទឹកប្រាក់ (Inventory Value Summary)</h4>
                    <div class="summary-grid" style="grid-template-columns: repeat(4, 1fr);">
                        <div class="summary-item">
                            <span class="summary-label">ស្តុកសរុប (Total Qty)</span>
                            <span class="summary-value">${totalQty}</span>
                        </div>
                        <div class="summary-item">
                            <span class="summary-label">លក់ចេញសរុប (Total Sold)</span>
                            <span class="summary-value" style="color: #666;">${totalSold}</span>
                        </div>
                        <div class="summary-item">
                            <span class="summary-label">តម្លៃស្តុកសរុប ($)</span>
                            <span class="summary-value">$${totalValUSD.toFixed(2)}</span>
                        </div>
                        <div class="summary-item">
                            <span class="summary-label">តម្លៃស្តុកសរុប (៛)</span>
                            <span class="summary-value">${Math.round(totalValUSD * exchangeRate).toLocaleString()} ៛</span>
                        </div>
                    </div>
                </div>`;
            }
        })()}

    <div class="footer-date">
        កាលបរិច្ឆេទ: ${getKhmerFullDate()}
    </div>

    <div class="footer-signatures">
        <div class="sig-box">
            <p>រៀបចំដោយ</p>
            <div class="sig-name" style="margin-top: 40px; font-weight: bold;">${document.getElementById('user-display-name') ? document.getElementById('user-display-name').textContent : 'អ្នកកាន់ស្តុក'}</div>
        </div>
        <div class="sig-box">
            <p>ត្រួតពិនិត្យដោយ</p>
            <div class="sig-name">ប្រធានផ្នែក</div>
        </div>
        <div class="sig-box">
            <p>ពិនិត្យដោយ</p>
            <div class="sig-name">គណនេយ្យករ</div>
        </div>
        <div class="sig-box">
            <p>អនុម័តដោយ</p>
            <div class="sig-name">នាយកសាលា</div>
        </div>
    </div>

    <script>
        setTimeout(() => {
            window.print();
        }, 800);
    </script>
    </body></html>`;

    win.document.write(html);
    win.document.close();
}

function exportToExcel() {
    const category = document.getElementById('reportCategory').value;
    const period = document.getElementById('exportType').value;
    const filteredData = getFilteredData(category, period);

    let exportData = [];

    if (category === 'stockOut') {
        exportData = filteredData.map((item, index) => ({
            "ល.រ (No)": index + 1,
            "កាលបរិច្ឆេទ (Date)": item.soldDate || '-',
            "ឈ្មោះទំនិញ (Item Name)": item.itemName,
            "ចំនួនលក់ (Qty)": item.quantity,
            "តម្លៃរាយ (Unit Price $)": parseFloat(item.pricePerUnit || 0).toFixed(2),
            "សរុប (Total $)": parseFloat(item.totalPrice || 0).toFixed(2),
            "សរុប (Total ៛)": Math.round((item.totalPrice || 0) * exchangeRate),
            "អ្នកលក់ (Seller)": item.stockKeeper || '-'
        }));
    } else {
        exportData = filteredData.map((item, index) => {
            const warehouseIn = parseInt(item.warehouseIn) || parseInt(item.totalIn) || parseInt(item.quantity) || 0;
            const officeIn = parseInt(item.officeIn) || 0;
            const stockOut = parseInt(item.stockOut) || 0;
            const currentWh = Math.max(0, warehouseIn - officeIn);
            const currentOff = Math.max(0, officeIn - stockOut);

            return {
                "ល.រ (No)": index + 1,
                "ឈ្មោះទំនិញ (Item Name)": item.itemName,
                "ថ្ងៃនាំចូល (Import Date)": item.importDate || formatDate(item.createdAt) || '-',
                "ក្នុងឃ្លាំង (Warehouse)": currentWh,
                "ការិយាល័យ (Office)": currentOff,
                "លក់ចេញ (Sold Out)": stockOut,
                "ស្តុកសរុប (Total Stock)": currentWh + currentOff,
                "តម្លៃលក់ ($)": parseFloat(item.sellingPrice || 0).toFixed(2),
                "តម្លៃលក់ (៛)": Math.round((item.sellingPrice || 0) * exchangeRate)
            };
        });
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `${category}_report_${period}.xlsx`);
}

function formatMoney(amount) {
    if (currentCurrency === 'KHR') {
        const val = amount * exchangeRate;
        return val.toLocaleString('en-US') + ' ៛';
    }
    return '$' + parseFloat(amount).toFixed(2);
}

function formatDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;

    const khmerNumerals = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
    const toKhmerNum = (num) => num.toString().split('').map(char => {
        const n = parseInt(char);
        return isNaN(n) ? char : khmerNumerals[n];
    }).join('');

    const day = toKhmerNum(d.getDate());
    const month = toKhmerNum(d.getMonth() + 1);
    const year = toKhmerNum(d.getFullYear());

    return `${day}/${month}/${year}`;
}

// Global exposure
window.openRestockModal = openRestockModal;
window.openTransferModal = openTransferModal;
window.openSellModal = openSellModal;
window.deleteItem = deleteItem;
window.exportToPDF = exportToPDF;
window.exportToExcel = exportToExcel;
window.deleteSaleRecord = deleteSaleRecord;
window.deleteAllSales = deleteAllSales;
