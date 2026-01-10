/**
 * settings-script.js
 * Logic for managing system-wide settings and roles.
 */

const settingsRef = firebase.database().ref('settings');
const rolesRef = firebase.database().ref('system_roles');
let addRoleModal = null;

document.addEventListener('DOMContentLoaded', () => {
    addRoleModal = new bootstrap.Modal(document.getElementById('addRoleModal'));

    loadGeneralSettings();
    loadRoles();

    // Form Event Listeners
    document.getElementById('generalSettingsForm').addEventListener('submit', saveGeneralSettings);
    document.getElementById('themeSettingsForm').addEventListener('submit', saveThemeSettings);
    document.getElementById('addRoleForm').addEventListener('submit', handleAddRole);

    // Sync Hex and Color pickers
    document.getElementById('primaryColor').addEventListener('input', (e) => {
        document.getElementById('primaryColorHex').value = e.target.value.toUpperCase();
    });
    document.getElementById('bgColor').addEventListener('input', (e) => {
        document.getElementById('bgColorHex').value = e.target.value.toUpperCase();
    });
});

/**
 * Loads general settings from Firebase
 */
function loadGeneralSettings() {
    settingsRef.once('value', (snapshot) => {
        const settings = snapshot.val();
        if (settings) {
            document.getElementById('schoolName').value = settings.schoolName || '';
            document.getElementById('footerText').value = settings.footerText || '';
            document.getElementById('developerName').value = settings.developerName || '';
            document.getElementById('logoPath').value = settings.logoPath || '';

            if (settings.theme) {
                document.getElementById('primaryColor').value = settings.theme.primaryColor || '#2C0157';
                document.getElementById('primaryColorHex').value = (settings.theme.primaryColor || '#2C0157').toUpperCase();
                document.getElementById('bgColor').value = settings.theme.bgColor || '#ffffff';
                document.getElementById('bgColorHex').value = (settings.theme.bgColor || '#ffffff').toUpperCase();
                document.getElementById('enableAnimations').checked = settings.theme.enableAnimations !== false;
                document.getElementById('bgStyle').value = settings.theme.bgStyle || 'solid';
                document.getElementById('sidebarMode').value = settings.theme.sidebarMode || 'dark';
                document.getElementById('enableAutoNavbar').checked = settings.theme.enableAutoNavbar !== false;
                document.getElementById('khmerFont').value = settings.theme.khmerFont || "'Khmer OS Battambang', sans-serif";

                // Load new settings
                document.getElementById('enableAutoSave').checked = settings.theme.enableAutoSave !== false;
                document.getElementById('enableNotifications').checked = settings.theme.enableNotifications !== false;
                document.getElementById('enableSoundEffects').checked = settings.theme.enableSoundEffects || false;
                document.getElementById('enableDarkMode').checked = settings.theme.enableDarkMode || false;

                // Apply font preview on load
                previewFont();
            }
        }
    });
}

/**
 * Saves general information
 */
function saveGeneralSettings(e) {
    e.preventDefault();
    const data = {
        schoolName: document.getElementById('schoolName').value.trim(),
        footerText: document.getElementById('footerText').value.trim(),
        developerName: document.getElementById('developerName').value.trim(),
        logoPath: document.getElementById('logoPath').value.trim(),
        updatedAt: new Date().toISOString()
    };

    showSaveIndicator();
    settingsRef.update(data)
        .then(() => console.log('General settings saved'))
        .catch(err => alert('កំហុស: ' + err.message));
}

/**
 * Saves theme settings
 */
function saveThemeSettings(e) {
    e.preventDefault();
    const theme = {
        primaryColor: document.getElementById('primaryColor').value,
        bgColor: document.getElementById('bgColor').value,
        bgStyle: document.getElementById('bgStyle').value,
        sidebarMode: document.getElementById('sidebarMode').value,
        khmerFont: document.getElementById('khmerFont').value,
        enableAnimations: document.getElementById('enableAnimations').checked,
        enableAutoNavbar: document.getElementById('enableAutoNavbar').checked,
        enableAutoSave: document.getElementById('enableAutoSave').checked,
        enableNotifications: document.getElementById('enableNotifications').checked,
        enableSoundEffects: document.getElementById('enableSoundEffects').checked,
        enableDarkMode: document.getElementById('enableDarkMode').checked
    };

    showSaveIndicator();
    settingsRef.child('theme').set(theme)
        .then(() => {
            // Apply colors to the current page as preview
            applyThemePreview(theme);
            console.log('Theme settings saved successfully');
        })
        .catch(err => alert('កំហុស: ' + err.message));
}

/**
 * Apply theme preview to current page
 */
function applyThemePreview(theme) {
    const root = document.documentElement;

    // Apply colors
    root.style.setProperty('--bs-pink-primary', theme.primaryColor);
    root.style.setProperty('--primary-color', theme.primaryColor);

    // Apply background
    if (theme.bgStyle === 'solid') {
        document.body.style.background = theme.bgColor;
    } else if (theme.bgStyle === 'gradient') {
        document.body.style.background = `linear-gradient(135deg, ${theme.bgColor} 0%, #f0f2f5 100%)`;
    } else if (theme.bgStyle === 'mesh') {
        document.body.style.background = `radial-gradient(at 0% 0%, ${theme.bgColor} 0px, transparent 50%), 
                                         radial-gradient(at 50% 0%, #e0e7ff 0px, transparent 50%), 
                                         radial-gradient(at 100% 0%, #f5f3ff 0px, transparent 50%)`;
    } else if (theme.bgStyle === 'pattern') {
        document.body.style.backgroundColor = theme.bgColor;
        document.body.style.backgroundImage = `radial-gradient(#d1d5db 1px, transparent 1px)`;
        document.body.style.backgroundSize = `20px 20px`;
    }

    // Apply font
    if (theme.khmerFont) {
        root.style.setProperty('--khmer-font', theme.khmerFont);
        document.body.style.fontFamily = theme.khmerFont;
    }

    // Apply dark mode
    if (theme.enableDarkMode) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

/**
 * Preview font in real-time
 */
function previewFont() {
    const selectedFont = document.getElementById('khmerFont').value;
    const previewBox = document.getElementById('fontPreview');

    if (previewBox) {
        previewBox.style.fontFamily = selectedFont;

        // Add a subtle animation
        previewBox.style.transform = 'scale(0.95)';
        setTimeout(() => {
            previewBox.style.transform = 'scale(1)';
        }, 150);
    }
}


/**
 * Roles Management
 */
function loadRoles() {
    rolesRef.on('value', (snapshot) => {
        const roles = snapshot.val();
        const container = document.getElementById('rolesList');
        container.innerHTML = '';

        if (!roles) {
            // Default roles if none exist
            const defaults = {
                admin: { label: 'Admin', color: 'bg-danger' },
                teacher: { label: 'គ្រូបង្រៀន (Teacher)', color: 'bg-success' },
                staff: { label: 'បុគ្គលិក (Staff)', color: 'bg-primary' }
            };
            rolesRef.set(defaults);
            return;
        }

        Object.keys(roles).forEach(key => {
            const role = roles[key];
            const div = document.createElement('div');
            div.className = 'role-item';
            div.innerHTML = `
                <div>
                    <span class="badge ${role.color} me-2">${role.label}</span>
                    <small class="text-muted font-monospace d-block">Key: ${key}</small>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteRole('${key}')">
                        <i class="fi fi-rr-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    });
}

function openAddRoleModal() {
    addRoleModal.show();
}

function handleAddRole(e) {
    e.preventDefault();
    const key = document.getElementById('roleKey').value.trim().toLowerCase();
    const label = document.getElementById('roleLabelKh').value.trim();
    const color = document.getElementById('roleColor').value;

    if (!key || !label) return;

    rolesRef.child(key).set({
        label: label,
        color: color
    }).then(() => {
        addRoleModal.hide();
        document.getElementById('addRoleForm').reset();
    });
}

function deleteRole(key) {
    if (key === 'admin') return alert('អ្នកមិនអាចលុបតួនាទី Admin បានទេ!');
    if (confirm(`តើអ្នកពិតជាចង់លុបតួនាទី "${key}" មែនទេ?`)) {
        rolesRef.child(key).remove();
    }
}

function showSaveIndicator() {
    const el = document.getElementById('saveIndicator');
    el.classList.remove('d-none');
    setTimeout(() => {
        el.classList.add('d-none');
    }, 3000);
}

function clearLocalCache() {
    localStorage.clear();
    sessionStorage.clear();
    alert('Cache ត្រូវបានសម្អាត! សូម Refresh ទំព័រឡើងវិញ។');
    location.reload();
}
