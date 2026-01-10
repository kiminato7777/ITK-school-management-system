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
            try {
                // Initialize with explicit options to avoid config errors
                editModalInstance = new bootstrap.Modal(editModalEl, {
                    backdrop: 'static',
                    keyboard: false
                });
            } catch (error) {
                console.error("Error initializing modal:", error);
            }
        } else {
            console.error("Bootstrap JS not loaded!");
        }
    }

    // Prevent non-admins
    firebase.auth().onAuthStateChanged(user => {
        if (!user || (user.email !== 'admin@school.com' && user.email !== 'adminitk@gmail.com')) {
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

        Object.keys(users).forEach(key => {
            const user = users[key];
            const isTargetAdmin = user.email === 'admin@school.com' || user.email === 'adminitk@gmail.com';

            // Encode permissions to pass to function safely (escape quotes)
            const permsJson = JSON.stringify(user.permissions || {}).replace(/"/g, '&quot;');

            const permissionsBadges = getPermissionBadges(user.permissions);

            const roleKey = user.role || (isTargetAdmin ? 'admin' : 'staff');
            let roleBadgeClass = 'bg-info';
            let roleLabel = 'Staff';

            if (roleKey === 'admin') {
                roleBadgeClass = 'bg-danger';
                roleLabel = 'Admin';
            } else if (roleKey === 'teacher') {
                roleBadgeClass = 'bg-success';
                roleLabel = 'Teacher';
            } else {
                roleLabel = roleKey.charAt(0).toUpperCase() + roleKey.slice(1);
            }

            // Override for Hardcoded Admins
            if (isTargetAdmin) {
                roleBadgeClass = 'bg-warning text-dark';
                roleLabel = 'System Admin';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="ps-4">
                    <div class="fw-bold text-primary">${user.displayName || 'No Name'}</div>
                    <div class="small text-muted">${user.email}</div>
                </td>
                <td><span class="badge ${roleBadgeClass}">${roleLabel}</span></td>
                <td>${permissionsBadges}</td>
                <td class="text-end pe-4">
                    <button class="btn btn-sm btn-outline-warning me-2" onclick='openEditModal("${key}", "${user.email}", "${user.displayName || ""}", "${user.role || "staff"}", ${permsJson})'>
                        <i class="fas fa-edit"></i> កែប្រែ
                    </button>
                    ${!isTargetAdmin ? `
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${key}', '${user.email}')">
                        <i class="fas fa-trash-alt"></i> លុប
                    </button>
                    ` : '<span class="badge bg-secondary ms-1">System Protected</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
}

function getPermissionBadges(perms) {
    if (!perms) return '<span class="text-muted small">No Access</span>';

    const map = {
        'dashboard': { label: 'Dashboard', color: 'bg-primary' },
        'registration': { label: 'Registration', color: 'bg-success' },
        'data': { label: 'Data', color: 'bg-info text-dark' },
        'inventory': { label: 'Inventory', color: 'bg-warning text-dark' }
    };

    return Object.keys(perms).filter(k => perms[k]).map(k => {
        const conf = map[k];
        return conf ? `<span class="badge ${conf.color} me-1 mb-1">${conf.label}</span>` : '';
    }).join('');
}

/**
 * Opens the Edit Modal and populates data
 */
function openEditModal(uid, email, displayName, role, perms) {
    document.getElementById('editUserUid').value = uid;
    document.getElementById('editUserEmail').value = email;
    document.getElementById('editDisplayName').value = displayName;
    document.getElementById('editUserRole').value = role;

    // Set checkboxes
    const p = typeof perms === 'string' ? JSON.parse(perms) : perms;
    document.getElementById('editPermDashboard').checked = !!p.dashboard;
    document.getElementById('editPermRegistration').checked = !!p.registration;
    document.getElementById('editPermData').checked = !!p.data;
    document.getElementById('editPermInventory').checked = !!p.inventory;

    if (editModalInstance) editModalInstance.show();
}

/**
 * Update User Permissions
 */
function handleUpdateUser(e) {
    e.preventDefault();

    const uid = document.getElementById('editUserUid').value;
    const displayName = document.getElementById('editDisplayName').value.trim();
    const role = document.getElementById('editUserRole').value;
    const permissions = {
        dashboard: document.getElementById('editPermDashboard').checked,
        registration: document.getElementById('editPermRegistration').checked,
        data: document.getElementById('editPermData').checked,
        inventory: document.getElementById('editPermInventory').checked
    };

    const btn = e.target.querySelector('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> កំពុងរក្សាទុក...';
    btn.disabled = true;

    usersRef.child(uid).update({
        permissions: permissions,
        displayName: displayName,
        role: role
    })
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

    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const displayName = document.getElementById('newDisplayName').value.trim();
    const role = document.getElementById('newUserRole').value;

    const permissions = {
        dashboard: document.getElementById('permDashboard').checked,
        registration: document.getElementById('permRegistration').checked,
        data: document.getElementById('permData').checked,
        inventory: document.getElementById('permInventory').checked
    };

    if (!email || !password || !displayName) return alert("សូមបញ្ចូលឈ្មោះ, អ៊ីមែល និងពាក្យសម្ងាត់!");

    const btn = e.target.querySelector('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> កំពុងបង្កើត...';
    btn.disabled = true;

    // Use a secondary app to create user
    const secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");

    secondaryApp.auth().createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // User created in Auth. Now save profile to Database.
            const uid = userCredential.user.uid;

            // Save to 'users' node
            return usersRef.child(uid).set({
                email: email,
                displayName: displayName,
                role: role,
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

