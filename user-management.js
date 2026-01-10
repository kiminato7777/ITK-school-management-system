/**
 * user-management.js
 * Handles user creation, listing, and permission management.
 */

const usersRef = firebase.database().ref('users');
const rolesRef = firebase.database().ref('system_roles');
let editModalInstance = null;
let changePasswordModalInstance = null;
let systemRoles = {};
let currentEditUserUid = null;
let currentEditUserEmail = null;

document.addEventListener('DOMContentLoaded', () => {
    loadSystemRoles();
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

    // Initialize Change Password Modal
    const changePasswordModalEl = document.getElementById('changePasswordModal');
    if (changePasswordModalEl) {
        if (typeof bootstrap !== 'undefined') {
            try {
                changePasswordModalInstance = new bootstrap.Modal(changePasswordModalEl, {
                    backdrop: 'static',
                    keyboard: false
                });
            } catch (error) {
                console.error("Error initializing change password modal:", error);
            }
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

    // Handle Change Password Form
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', handleChangePassword);
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
            let roleLabel = roleKey.charAt(0).toUpperCase() + roleKey.slice(1);

            // Fetch from systemRoles if available
            if (systemRoles[roleKey]) {
                roleBadgeClass = systemRoles[roleKey].color || 'bg-info';
                roleLabel = systemRoles[roleKey].label || roleLabel;
            } else if (roleKey === 'admin') {
                roleBadgeClass = 'bg-danger';
                roleLabel = 'Admin';
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
    });
}

function getPermissionBadges(perms) {
    if (!perms) return '<span class="text-muted small">No Access</span>';

    const map = {
        'dashboard': { label: 'Dashboard', color: 'bg-primary', icon: 'fi-rr-home' },
        'registration': { label: 'Registration', color: 'bg-success', icon: 'fi-rr-user-add' },
        'data': { label: 'Data', color: 'bg-info text-dark', icon: 'fi-rr-database' },
        'inventory': { label: 'Inventory', color: 'bg-warning text-dark', icon: 'fi-rr-boxes' },
        'finance': { label: 'Finance', color: 'bg-danger', icon: 'fi-rr-file-invoice-dollar' }
    };

    return Object.keys(perms).filter(k => perms[k]).map(k => {
        const conf = map[k];
        return conf ? `<span class="badge ${conf.color} me-1 mb-1"><i class="fi ${conf.icon} me-1"></i>${conf.label}</span>` : '';
    }).join('');
}

function loadSystemRoles() {
    rolesRef.on('value', snapshot => {
        systemRoles = snapshot.val() || {
            admin: { label: 'Admin', color: 'bg-danger' },
            teacher: { label: 'គ្រូបង្រៀន (Teacher)', color: 'bg-success' },
            staff: { label: 'បុគ្គលិក (Staff)', color: 'bg-primary' }
        };
        const newRoleSelect = document.getElementById('newUserRole');
        const editRoleSelect = document.getElementById('editUserRole');

        if (newRoleSelect && editRoleSelect) {
            let optionsHtml = '';
            Object.keys(systemRoles).forEach(key => {
                const role = systemRoles[key];
                optionsHtml += `<option value="${key}">${role.label}</option>`;
            });
            newRoleSelect.innerHTML = optionsHtml;
            editRoleSelect.innerHTML = optionsHtml;
        }
    });
}

function checkAdminRole(select, mode = 'new') {
    if (select.value === 'admin') {
        if (mode === 'new') {
            document.getElementById('permDashboard').checked = true;
            document.getElementById('permRegistration').checked = true;
            document.getElementById('permData').checked = true;
            document.getElementById('permInventory').checked = true;
            document.getElementById('permFinance').checked = true;
        } else {
            document.getElementById('editPermDashboard').checked = true;
            document.getElementById('editPermRegistration').checked = true;
            document.getElementById('editPermData').checked = true;
            document.getElementById('editPermInventory').checked = true;
            document.getElementById('editPermFinance').checked = true;
        }
    }
}

/**
 * Opens the Edit Modal and populates data
 */
function openEditModal(uid, email, displayName, role, perms) {
    currentEditUserUid = uid;
    currentEditUserEmail = email;

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
    document.getElementById('editPermFinance').checked = !!p.finance;

    // Load existing photo from localStorage
    const photoData = loadPhotoFromLocal(uid);
    const preview = document.getElementById('editUserPhotoPreview');
    const icon = document.getElementById('editUserPhotoIcon');

    if (photoData && preview && icon) {
        preview.src = photoData;
        preview.style.display = 'block';
        icon.style.display = 'none';
    } else if (preview && icon) {
        preview.style.display = 'none';
        icon.style.display = 'block';
    }

    if (editModalInstance) editModalInstance.show();
}

/**
 * Convert photo to base64 and store in localStorage
 */
async function savePhotoLocally(file, uid) {
    if (!file) return null;

    return new Promise((resolve, reject) => {
        // Check file size (max 2MB for localStorage)
        if (file.size > 2 * 1024 * 1024) {
            reject(new Error('រូបភាពធំពេក! សូមជ្រើសរើសរូបភាពតូចជាង 2MB'));
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const base64String = e.target.result;
                const storageKey = `user_photo_${uid}`;

                // Save to localStorage
                localStorage.setItem(storageKey, base64String);

                resolve(base64String);
            } catch (error) {
                reject(new Error('មិនអាចរក្សាទុករូបភាព: ' + error.message));
            }
        };
        reader.onerror = function () {
            reject(new Error('មិនអាចអានរូបភាព'));
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Load photo from localStorage
 */
function loadPhotoFromLocal(uid) {
    const storageKey = `user_photo_${uid}`;
    return localStorage.getItem(storageKey);
}

/**
 * Update User Permissions and Photo
 */
async function handleUpdateUser(e) {
    e.preventDefault();

    const uid = document.getElementById('editUserUid').value;
    const displayName = document.getElementById('editDisplayName').value.trim();
    const role = document.getElementById('editUserRole').value;
    const photoFile = document.getElementById('editUserPhoto').files[0];

    const permissions = {
        dashboard: document.getElementById('editPermDashboard').checked,
        registration: document.getElementById('editPermRegistration').checked,
        data: document.getElementById('editPermData').checked,
        inventory: document.getElementById('editPermInventory').checked,
        finance: document.getElementById('editPermFinance').checked
    };

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> កំពុងរក្សាទុក...';
    btn.disabled = true;

    try {
        const updateData = {
            permissions: permissions,
            displayName: displayName,
            role: role
        };

        // Save photo locally if selected
        if (photoFile) {
            await savePhotoLocally(photoFile, uid);
            // Don't save photoURL to database, just mark that photo exists
            updateData.hasPhoto = true;
        }

        await usersRef.child(uid).update(updateData);

        alert("✅ ទិន្នន័យត្រូវបានកែប្រែជោគជ័យ!");
        if (editModalInstance) editModalInstance.hide();

        // Reset photo input
        document.getElementById('editUserPhoto').value = '';

    } catch (error) {
        alert("❌ បរាជ័យ: " + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/**
 * Creates a new user with photo
 */
async function handleCreateUser(e) {
    e.preventDefault();

    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const displayName = document.getElementById('newDisplayName').value.trim();
    const role = document.getElementById('newUserRole').value;
    const photoFile = document.getElementById('newUserPhoto').files[0];

    const permissions = {
        dashboard: document.getElementById('permDashboard').checked,
        registration: document.getElementById('permRegistration').checked,
        data: document.getElementById('permData').checked,
        inventory: document.getElementById('permInventory').checked,
        finance: document.getElementById('permFinance').checked
    };

    if (!email || !password || !displayName) return alert("សូមបញ្ចូលឈ្មោះ, អ៊ីមែល និងពាក្យសម្ងាត់!");

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> កំពុងបង្កើត...';
    btn.disabled = true;

    // Use a secondary app to create user
    const secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");

    try {
        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;

        const userData = {
            email: email,
            displayName: displayName,
            role: role,
            permissions: permissions,
            createdAt: new Date().toISOString()
        };

        // Save photo locally if selected
        if (photoFile) {
            await savePhotoLocally(photoFile, uid);
            // Don't save photoURL to database, just mark that photo exists
            userData.hasPhoto = true;
        }

        await usersRef.child(uid).set(userData);

        alert("✅ បង្កើតអ្នកប្រើប្រាស់ជោគជ័យ!");
        document.getElementById('createUserForm').reset();

        // Reset checkboxes
        document.getElementById('permDashboard').checked = false;
        document.getElementById('permInventory').checked = false;
        document.getElementById('permFinance').checked = false;
        document.getElementById('permRegistration').checked = true;
        document.getElementById('permData').checked = true;

        secondaryApp.delete();

    } catch (error) {
        console.error(error);
        alert("❌ បរាជ័យ: " + error.message);
        secondaryApp.delete();
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/**
 * Open Change Password Modal
 */
function openChangePasswordModal() {
    if (!currentEditUserUid || !currentEditUserEmail) {
        alert("សូមជ្រើសរើសអ្នកប្រើប្រាស់ជាមុនសិន!");
        return;
    }

    document.getElementById('changePassUserUid').value = currentEditUserUid;
    document.getElementById('changePassUserEmail').value = currentEditUserEmail;
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';

    if (editModalInstance) editModalInstance.hide();
    if (changePasswordModalInstance) changePasswordModalInstance.show();
}

/**
 * Handle Change Password
 */
async function handleChangePassword(e) {
    e.preventDefault();

    const uid = document.getElementById('changePassUserUid').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        alert("❌ ពាក្យសម្ងាត់មិនត្រូវគ្នា!");
        return;
    }

    if (newPassword.length < 6) {
        alert("❌ ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច 6 តួអក្សរ!");
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> កំពុងដូរ...';
    btn.disabled = true;

    try {
        // Save to database (for reference only)
        await usersRef.child(uid).update({
            passwordUpdatedAt: new Date().toISOString(),
            passwordNote: 'Password updated via admin panel'
        });

        alert("✅ ពាក្យសម្ងាត់ត្រូវបានរក្សាទុកក្នុង Database!\n\nចំណាំ: ដើម្បីដូរពាក្យសម្ងាត់ Authentication សូមប្រើ Firebase Console។");

        if (changePasswordModalInstance) changePasswordModalInstance.hide();
        if (editModalInstance) editModalInstance.show();

    } catch (error) {
        alert("❌ បរាជ័យ: " + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function deleteUser(uid, email) {
    if (confirm(`តើអ្នកពិតជាចង់លុបអ្នកប្រើប្រាស់ ${email} ពីប្រព័ន្ធមែនទេ? \n(ចំណាំ៖ វានឹងលុបតែទិន្នន័យពី Database ប៉ុណ្ណោះ អ្នកត្រូវលុប Login Auth ដោយដៃតាមរយះ Firebase Console ប្រសិនបើចង់លុបដាច់ ១០០%)`)) {
        usersRef.child(uid).remove()
            .then(() => alert("បានលុបចេញពីបញ្ជី។"))
            .catch(err => alert("កំហុស៖ " + err.message));
    }
}

