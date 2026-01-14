/**
 * user-management.js
 * Handles user creation, listing, and permission management.
 */

const usersRef = firebase.database().ref('users');
let editModalInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    loadUsers();

    // Initialize Modal
    const editModalEl = document.getElementById('editUserModal');
    if (editModalEl) {
        // Check if bootstrap is available
        if (typeof bootstrap !== 'undefined') {
            editModalInstance = new bootstrap.Modal(editModalEl);
        } else {
            console.error("Bootstrap JS not loaded!");
        }
    }

    firebase.auth().onAuthStateChanged(user => {
        if (!user || user.email !== 'adminitk@gmail.com') {
            // Handled by auth-check.js
        }
    });

    // Handle Create User Form
    const createUserForm = document.getElementById('createUserForm');
    if (createUserForm) {
        createUserForm.addEventListener('submit', handleCreateUser);
    }

    // Handle Edit User Form
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', handleUpdateUser);
    }
});

/**
 * Loads and displays users from Firebase Realtime Database
 */
function loadUsers() {
    usersRef.on('value', snapshot => {
        const users = snapshot.val();
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';

        if (!users) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4">មិនទាន់មានអ្នកប្រើប្រាស់នៅឡើយ</td></tr>';
            return;
        }

        const uniqueRoles = new Set(['admin', 'staff']); // Default roles

        Object.keys(users).forEach(key => {
            const user = users[key];
            if (user.role) {
                uniqueRoles.add(user.role.toLowerCase());
            }

            const isTargetAdmin = user.email === 'adminitk@gmail.com';
            const userRole = user.role || (isTargetAdmin ? 'admin' : 'staff');

            // Force Super Admin to have all permissions visually
            let displayPerms = user.permissions || {};
            if (isTargetAdmin) {
                displayPerms = {
                    dashboard: true,
                    registration: true,
                    data: true,
                    inventory: true,
                    incomeExpense: true,
                    userManagement: true
                };
            }

            const permsJson = JSON.stringify(displayPerms).replace(/"/g, '&quot;');
            const permissionsBadges = getPermissionBadges(displayPerms);

            // Role Badge Logics
            const rLower = userRole.toLowerCase();
            let roleBadgeClass = 'bg-info text-dark'; // Default for custom roles (e.g. Manager, Finance)

            if (rLower === 'admin' || rLower === 'អ្នកគ្រប់គ្រង') roleBadgeClass = 'bg-warning text-dark';
            else if (rLower === 'staff' || rLower === 'បុគ្គលិក') roleBadgeClass = 'bg-primary';

            const displayName = user.name || (isTargetAdmin ? 'Super Admin' : user.email.split('@')[0]);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="ps-4">
                    <div class="fw-bold text-dark">${displayName}</div>
                </td>
                <td class="text-primary">${user.email}</td>
                <td><span class="badge ${roleBadgeClass} text-uppercase">${userRole}</span></td>
                <td>${permissionsBadges}</td>
                <td class="text-end pe-4">
                    <button class="btn btn-sm btn-outline-warning me-2" onclick='openEditModal("${key}", "${user.name || ""}", "${user.email}", ${permsJson}, "${userRole}")'>
                        <i class="fi fi-rr-edit"></i> កែប្រែ
                    </button>
                    ${!isTargetAdmin ? `
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${key}', '${user.email}')">
                        <i class="fi fi-rr-trash"></i> លុប
                    </button>
                    ` : '<span class="badge bg-secondary ms-1">System Protected</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Update Dropdowns with collected roles
        updateRoleDropdowns(Array.from(uniqueRoles));
    });
}

function updateRoleDropdowns(roles) {
    const selects = ['newUserRole', 'editUserRole'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        const currentVal = select.value;
        // Keep "admin" and "staff" at top, then sort others
        const sortedRoles = roles.sort((a, b) => {
            const al = a.toLowerCase();
            const bl = b.toLowerCase();
            if (al === 'admin') return -1;
            if (bl === 'admin') return 1;
            if (al === 'staff') return -1;
            if (bl === 'staff') return 1;
            return al.localeCompare(bl);
        });

        select.innerHTML = sortedRoles.map(r => {
            // Capitalize first letter for display
            const display = r.charAt(0).toUpperCase() + r.slice(1);
            const isSelected = r.toLowerCase() === 'staff' ? 'selected' : '';
            return `<option value="${r}" ${isSelected}>${display}</option>`;
        }).join('');

        // Restore previous selection if still exists, otherwise default
        if (roles.includes(currentVal)) {
            select.value = currentVal;
        }
    });
}

function promptNewRole(selectId) {
    const roleName = prompt("សូមបញ្ចូលឈ្មោះតួនាទីថ្មី (Enter new Role name):");
    if (roleName && roleName.trim() !== "") {
        const cleanRole = roleName.trim().toLowerCase();
        const select = document.getElementById(selectId);

        // Check if exists
        let exists = false;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === cleanRole) {
                exists = true;
                select.options[i].selected = true;
                break;
            }
        }

        if (!exists) {
            const option = document.createElement("option");
            option.value = cleanRole;
            option.text = cleanRole.charAt(0).toUpperCase() + cleanRole.slice(1) + " (New)";
            option.selected = true;
            select.add(option);
        }
    }
}

function getPermissionBadges(perms) {
    if (!perms) return '<span class="text-muted small">No Access</span>';

    const map = {
        'dashboard': { label: 'Dashboard', color: 'bg-primary' },
        'registration': { label: 'Registration', color: 'bg-success' },
        'data': { label: 'Data', color: 'bg-info text-dark' },
        'inventory': { label: 'Inventory', color: 'bg-warning text-dark' },
        'incomeExpense': { label: 'Income/Exp', color: 'bg-danger' },
        'userManagement': { label: 'User Mgmt', color: 'bg-dark' }
    };

    return Object.keys(perms).filter(k => perms[k]).map(k => {
        const conf = map[k];
        return conf ? `<span class="badge ${conf.color} me-1 mb-1">${conf.label}</span>` : '';
    }).join('');
}

/**
 * Opens the Edit Modal and populates data
 */
function openEditModal(uid, name, email, perms, role) {
    document.getElementById('editUserUid').value = uid;
    document.getElementById('editUserName').value = name;
    document.getElementById('editUserEmail').value = email;
    document.getElementById('editUserRole').value = role || 'staff';
    document.getElementById('editUserPassword').value = ''; // Reset password field

    // Set checkboxes
    const p = typeof perms === 'string' ? JSON.parse(perms) : perms;
    document.getElementById('editPermDashboard').checked = !!p.dashboard;
    document.getElementById('editPermRegistration').checked = !!p.registration;
    document.getElementById('editPermData').checked = !!p.data;
    document.getElementById('editPermInventory').checked = !!p.inventory;
    document.getElementById('editPermIncomeExpense').checked = !!p.incomeExpense;
    document.getElementById('editPermUserManagement').checked = !!p.userManagement;

    if (editModalInstance) editModalInstance.show();
}

/**
 * Update User Permissions
 */
function handleUpdateUser(e) {
    e.preventDefault();

    const uid = document.getElementById('editUserUid').value;
    const name = document.getElementById('editUserName').value.trim();
    const role = document.getElementById('editUserRole').value;
    const newPassword = document.getElementById('editUserPassword').value;

    const permissions = {
        dashboard: document.getElementById('editPermDashboard').checked,
        registration: document.getElementById('editPermRegistration').checked,
        data: document.getElementById('editPermData').checked,
        inventory: document.getElementById('editPermInventory').checked,
        incomeExpense: document.getElementById('editPermIncomeExpense').checked,
        userManagement: document.getElementById('editPermUserManagement').checked
    };

    const btn = e.target.querySelector('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fi fi-rr-refresh fa-spin"></i> កំពុងរក្សាទុក...';
    btn.disabled = true;

    // Base update data
    const updateData = {
        name: name,
        role: role,
        permissions: permissions
    };

    // If password provided, we cannot easily update it for another user via client SDK
    // But we can store it in DB (NOT SECURE) or handle it if we had Admin SDK.
    // For now, we will just alert the user that Password change requires Admin Console or Re-login
    // However, if the user requested it, let's see if we can do anything.
    // We'll proceed with updating the Profile Data first.

    usersRef.child(uid).update(updateData)
        .then(() => {
            alert("✅ ទិន្នន័យត្រូវបានកែប្រែជោគជ័យ!");
            if (editModalInstance) editModalInstance.hide();
        })
        .catch((error) => {
            alert("❌ បរាជ័យ: " + error.message);
        })
        .finally(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

/**
 * Creates a new user using a secondary Firebase App instance.
 */
function handleCreateUser(e) {
    e.preventDefault();

    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;

    const role = document.getElementById('newUserRole').value; // Get role

    const permissions = {
        dashboard: document.getElementById('permDashboard').checked,
        registration: document.getElementById('permRegistration').checked,
        data: document.getElementById('permData').checked,
        inventory: document.getElementById('permInventory').checked,
        incomeExpense: document.getElementById('permIncomeExpense').checked,
        userManagement: document.getElementById('permUserManagement').checked
    };

    if (!name || !email || !password) return alert("សូមបញ្ចូលឈ្មោះ អ៊ីមែល និងពាក្យសម្ងាត់!");

    const btn = e.target.querySelector('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fi fi-rr-refresh fa-spin"></i> កំពុងបង្កើត...';
    btn.disabled = true;

    // Use a secondary app to create user
    const secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");

    secondaryApp.auth().createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // User created in Auth. Now save profile to Database.
            const uid = userCredential.user.uid;

            // Save to 'users' node
            return usersRef.child(uid).set({
                name: name,
                email: email,
                role: role, // Use selected role
                permissions: permissions,
                createdAt: new Date().toISOString()
            });
        })
        .then(() => {
            alert("✅ បង្កើតអ្នកប្រើប្រាស់ជោគជ័យ!");
            document.getElementById('createUserForm').reset();
            // Reset checkboxes
            document.getElementById('permDashboard').checked = false;
            document.getElementById('permInventory').checked = false;
            document.getElementById('permIncomeExpense').checked = false;
            document.getElementById('permUserManagement').checked = false;
            document.getElementById('permRegistration').checked = true;
            document.getElementById('permData').checked = true;

            secondaryApp.delete();
        })
        .catch((error) => {
            console.error(error);
            alert("❌ បរាជ័យ: " + error.message);
            secondaryApp.delete();
        })
        .finally(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

function deleteUser(uid, email) {
    if (confirm(`តើអ្នកពិតជាចង់លុបអ្នកប្រើប្រាស់ ${email} ពីប្រព័ន្ធមែនទេ? \n(ចំណាំ៖ វានឹងលុបតែទិន្នន័យពី Database ប៉ុណ្ណោះ អ្នកត្រូវលុប Login Auth ដោយដៃតាមរយះ Firebase Console ប្រសិនបើចង់លុបដាច់ ១០០%)`)) {
        usersRef.child(uid).remove()
            .then(() => alert("បានលុបចេញពីបញ្ជី។"))
            .catch(err => alert("កំហុស៖ " + err.message));
    }
}

// Helper to toggle password outside DOMContentLoaded to be global
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === "password") {
        input.type = "text";
        icon.className = "fi fi-rr-eye-crossed";
    } else {
        input.type = "password";
        icon.className = "fi fi-rr-eye";
    }
}

