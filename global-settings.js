/**
 * global-settings.js
 * Centralized script to apply system-wide dynamic settings (Theme, Logo, Footer, Title)
 */

document.addEventListener('DOMContentLoaded', () => {
    // Wait for Firebase to be initialized
    const checkFirebase = setInterval(() => {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            clearInterval(checkFirebase);
            applyGlobalSettings();
            applyRolePermissions();
            loadUserProfilePhoto(); // Load user photo from localStorage
        }
    }, 100);
});

function applyGlobalSettings() {
    const settingsRef = firebase.database().ref('settings');

    settingsRef.on('value', (snapshot) => {
        const settings = snapshot.val();
        if (!settings) return;

        // 1. Title & School Name
        if (settings.schoolName) {
            document.title = settings.schoolName;
            const sidebarTitle = document.querySelector('.sidebar-header span, .sidebar-title-text');
            if (sidebarTitle) {
                // Keep the icon if it exists
                const icon = sidebarTitle.querySelector('i');
                sidebarTitle.innerHTML = '';
                if (icon) sidebarTitle.appendChild(icon);
                sidebarTitle.appendChild(document.createTextNode(' ' + settings.schoolName));
            }
        }

        // 2. Logo
        if (settings.logoPath) {
            const logos = document.querySelectorAll('#sidebar-logo, .school-logo, .logo');
            logos.forEach(logo => {
                logo.src = settings.logoPath;
            });
        }

        // 3. Theme Colors & Styles (2026 Upgrade)
        if (settings.theme) {
            const root = document.documentElement;
            const theme = settings.theme;

            if (theme.primaryColor) {
                root.style.setProperty('--bs-pink-primary', theme.primaryColor);
                root.style.setProperty('--primary-color', theme.primaryColor);

                // Update sidebar color if it uses the primary color
                const sidebar = document.getElementById('sidebar');
                if (sidebar && theme.sidebarMode !== 'glass') {
                    sidebar.style.backgroundColor = theme.primaryColor;
                }

                const sidebarHeader = document.querySelector('.sidebar-header');
                if (sidebarHeader && theme.sidebarMode !== 'glass') {
                    sidebarHeader.style.backgroundColor = theme.primaryColor;
                }
            }

            // Background Styles
            if (theme.bgColor) {
                root.style.setProperty('--bs-body-bg', theme.bgColor);

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
            }

            // Sidebar Modes
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                if (theme.sidebarMode === 'glass') {
                    sidebar.style.background = 'rgba(255, 255, 255, 0.7)';
                    sidebar.style.backdropFilter = 'blur(10px)';
                    sidebar.style.borderRight = '1px solid rgba(255, 255, 255, 0.3)';
                    // Text adjustments for glass
                    const links = sidebar.querySelectorAll('.nav-link');
                    links.forEach(l => {
                        if (!l.classList.contains('active')) l.style.color = '#333';
                    });
                } else if (theme.sidebarMode === 'light') {
                    sidebar.style.backgroundColor = '#ffffff';
                    sidebar.style.boxShadow = '2px 0 10px rgba(0,0,0,0.05)';
                    const links = sidebar.querySelectorAll('.nav-link');
                    links.forEach(l => {
                        if (!l.classList.contains('active')) l.style.color = '#333';
                    });
                }
            }

            if (theme.khmerFont) {
                root.style.setProperty('--khmer-font', theme.khmerFont);
                document.body.style.fontFamily = theme.khmerFont;

                // Create or update dynamic font style
                let fontStyle = document.getElementById('dynamic-font-style');
                if (!fontStyle) {
                    fontStyle = document.createElement('style');
                    fontStyle.id = 'dynamic-font-style';
                    document.head.appendChild(fontStyle);
                }
                fontStyle.textContent = `
                    * { 
                        font-family: ${theme.khmerFont} !important; 
                    }
                    .form-control, .form-select, input, textarea, button, .btn {
                        font-family: ${theme.khmerFont} !important;
                    }
                `;
            }

            // Apply Dark Mode
            if (theme.enableDarkMode) {
                document.body.classList.add('dark-mode');
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.body.classList.remove('dark-mode');
                document.documentElement.setAttribute('data-theme', 'light');
            }
        }

        // 4. Footer & Copyright
        const footers = document.querySelectorAll('.footer, .app-footer, footer');
        if (footers.length > 0) {
            const year = new Date().getFullYear();
            const developer = settings.developerName || 'មាស មករា';
            const footerText = settings.footerText || `គ្រប់គ្រងសាលា`;
            const copyrightHtml = `© ${year} ${footerText}. Developed by ${developer}.`;

            footers.forEach(footer => {
                const p = footer.querySelector('p') || footer;
                p.innerHTML = `<i class="fi fi-rr-copyright me-1"></i> ${copyrightHtml}`;
            });
        }
    });
}

/**
 * Automatically update navigation bar based on user permissions
 * and ensure dynamic roles are handled.
 */
function applyRolePermissions() {
    firebase.auth().onAuthStateChanged(user => {
        if (!user) return;

        firebase.database().ref('users/' + user.uid).once('value', snapshot => {
            const userData = snapshot.val();
            if (!userData) return;

            const perms = userData.permissions || {};
            const role = userData.role || 'staff';
            const isAdmin = role === 'admin' || user.email === 'admin@school.com' || user.email === 'adminitk@gmail.com';

            // Show/Hide Nav Items based on permissions
            const navMap = {
                'index.html': 'dashboard',
                'registration.html': 'registration',
                'data-tracking.html': 'data',
                'inventory.html': 'inventory',
                'income-expense.html': 'finance',
                'user-management.html': 'admin',
                'settings.html': 'admin'
            };

            const navLinks = document.querySelectorAll('#sidebar .nav-link');
            navLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (!href || href === '#' || href === 'index.html') return;

                const permKey = navMap[href];
                if (permKey) {
                    if (isAdmin) {
                        link.style.display = 'block';
                    } else if (perms[permKey] === false) {
                        link.style.display = 'none';
                    } else if (perms[permKey] === true) {
                        link.style.display = 'block';
                    } else {
                        // Default behavior if permission not set
                        // link.style.display = 'none'; 
                    }
                }
            });

            // Special UI for Admin
            if (isAdmin) {
                const adminOnly = document.querySelectorAll('.admin-only');
                adminOnly.forEach(el => el.classList.remove('d-none'));
            } else {
                const adminOnly = document.querySelectorAll('.admin-only');
                adminOnly.forEach(el => el.classList.add('d-none'));

                // If on a restricted page, redirect
                const currentPage = window.location.pathname.split('/').pop();
                if ((currentPage === 'user-management.html' || currentPage === 'settings.html' || currentPage === 'income-expense.html') && !isAdmin && !perms[navMap[currentPage]]) {
                    window.location.href = 'index.html';
                }
            }
        });
    });
}

/**
 * Load user profile photo from localStorage and display in sidebar
 */
function loadUserProfilePhoto() {
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            const uid = user.uid;
            const storageKey = `user_photo_${uid}`;
            const photoData = localStorage.getItem(storageKey);

            const photoEl = document.getElementById('sidebar-user-photo');
            const iconEl = document.getElementById('sidebar-user-icon');

            if (photoData && photoEl && iconEl) {
                photoEl.src = photoData;
                photoEl.style.display = 'block';
                iconEl.style.display = 'none';
            } else if (photoEl && iconEl) {
                photoEl.style.display = 'none';
                iconEl.style.display = 'block';
            }
        }
    });
}
