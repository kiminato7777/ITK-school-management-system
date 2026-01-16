/**
 * auth-check.js
 * Protects pages from unauthorized access.
 */
document.addEventListener("DOMContentLoaded", () => {
    // Determine if we are on the login page
    const isLoginPage = window.location.pathname.endsWith("login.html") || window.location.pathname.endsWith("login");

    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            if (isLoginPage) window.location.href = "index.html";

            // UI Elements
            const nameEl = document.getElementById('user-display-name');
            const emailEl = document.getElementById('user-display-email');
            const roleEl = document.getElementById('user-role-badge');

            const isSuperAdmin = user.email === 'adminitk@gmail.com';

            /**
             * applyPermissions
             * Hides sidebar links and redirects if user doesn't have access to the current page.
             */
            const applyPermissions = (perms) => {
                const p = perms || { dashboard: false, registration: true, data: true, inventory: false, incomeExpense: false, userManagement: false };
                const links = {
                    'index.html': p.dashboard,
                    'registration.html': p.registration,
                    'data-tracking.html': p.data,
                    'inventory.html': p.inventory,
                    'income-expense.html': p.incomeExpense,
                    'user-management.html': p.userManagement
                };

                for (const [page, allowed] of Object.entries(links)) {
                    document.querySelectorAll(`a[href="${page}"]`).forEach(link => {
                        link.style.display = allowed ? '' : 'none';
                    });
                }

                const path = window.location.pathname;
                const currentPage = path.split('/').pop() || 'index.html';
                const pagePermissionMap = {
                    'index.html': 'dashboard',
                    'registration.html': 'registration',
                    'data-tracking.html': 'data',
                    'inventory.html': 'inventory',
                    'income-expense.html': 'incomeExpense',
                    'user-management.html': 'userManagement'
                };

                const requiredPerm = pagePermissionMap[currentPage];
                if (requiredPerm && requiredPerm !== 'admin_only' && !p[requiredPerm]) {
                    if (p.registration) window.location.href = "registration.html";
                    else if (p.data) window.location.href = "data-tracking.html";
                    else if (p.incomeExpense) window.location.href = "income-expense.html";
                    else if (p.userManagement) window.location.href = "user-management.html";
                    else alert("គណនីរបស់អ្នកមិនមានសិទ្ធិប្រើប្រាស់ណាមួយទេ។ សូមទាក់ទង Admin។");
                }
            };

            // Function to set profile UI
            const setProfileUI = (name, email) => {
                if (nameEl) nameEl.textContent = name;
                if (emailEl) {
                    emailEl.textContent = email;
                    emailEl.title = email;
                }
            };

            // Logic Flow
            if (isSuperAdmin) {
                setProfileUI('Super Admin', user.email);
                if (roleEl) {
                    roleEl.textContent = 'Admin (អ្នកគ្រប់គ្រង)';
                    roleEl.className = 'badge bg-warning text-dark mt-1 fw-normal';
                }
                // Admin sees everything
                const allLinks = document.querySelectorAll('.sidebar .nav-link');
                allLinks.forEach(l => l.style.display = 'block');
            } else {
                // Role will be set after fetching data from DB

                // Fetch data from DB
                firebase.database().ref('users/' + user.uid).once('value').then(snapshot => {
                    const userData = snapshot.val();
                    const displayName = userData && userData.name ? userData.name : user.email.split('@')[0];
                    setProfileUI(displayName, user.email);

                    // Update Role Badge dynamically
                    if (roleEl && userData && userData.role) {
                        const r = userData.role.toLowerCase();
                        roleEl.textContent = r.charAt(0).toUpperCase() + r.slice(1); // Capitalize

                        // Apply styling based on role
                        if (r === 'admin' || r === 'អ្នកគ្រប់គ្រង') {
                            roleEl.className = 'badge bg-warning text-dark mt-1 fw-normal';
                        } else {
                            roleEl.className = 'badge bg-info mt-1 fw-normal'; // Default/Staff
                        }
                    } else {
                        // Default if no role in DB
                        if (roleEl) {
                            roleEl.textContent = 'Staff';
                            roleEl.className = 'badge bg-info mt-1 fw-normal';
                        }
                    }

                    const perms = userData ? userData.permissions : null;
                    applyPermissions(perms);
                }).catch(err => {
                    console.error("Error fetching user data:", err);
                    setProfileUI(user.email.split('@')[0], user.email);
                    applyPermissions({ dashboard: false, registration: true, data: false, inventory: false, incomeExpense: false, userManagement: false });
                });
            }

        } else {
            console.warn("User not authenticated.");
            if (!isLoginPage) window.location.href = "login.html";
        }
    });
});

/**
 * Handle Logout
 * Signs out the updated user and redirects to login page.
 */
function handleLogout(event) {
    if (event) event.preventDefault();

    if (confirm("តើអ្នកពិតជាចង់ចាកចេញមែនទេ?")) {
        firebase.auth().signOut().then(() => {
            console.log("User signed out.");
            window.location.href = "login.html";
        }).catch((error) => {
            console.error("Logout Error:", error);
            alert("មានបញ្ហាក្នុងការចាកចេញ។");
        });
    }
}
