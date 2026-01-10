/**
 * auth-check.js
 * Protects pages from unauthorized access.
 */
document.addEventListener("DOMContentLoaded", () => {
    // Determine if we are on the login page
    const isLoginPage = window.location.pathname.endsWith("login.html") || window.location.pathname.endsWith("login");

    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // console.log("Authenticated as: " + user.email);
            if (isLoginPage) window.location.href = "index.html";

            // UI Elements
            const emailEl = document.getElementById('user-display-email');
            const roleEl = document.getElementById('user-role-badge');
            const gmailEl = document.getElementById('user-display-gmail');

            // Fetch extra user details from DB
            firebase.database().ref('users/' + user.uid).once('value').then(snapshot => {
                const userData = snapshot.val();

                // Display Name (from DB or Auth or Email)
                let tempDisplayName = userData && userData.displayName ? userData.displayName : (user.displayName || user.email);
                // Truncate if too long (optional, but good for sidebar)
                // if (tempDisplayName.length > 20) tempDisplayName = tempDisplayName.substring(0, 18) + '...';

                // Set Primary Name Display
                if (emailEl) {
                    emailEl.textContent = tempDisplayName;
                    emailEl.title = tempDisplayName; // Tooltip shows full name
                }

                // Set Gmail Display (Explicit Field)
                if (gmailEl) {
                    gmailEl.textContent = user.email;
                    gmailEl.title = user.email;
                }
            }).catch(err => {
                console.error("Error fetching user details:", err);
                // Fallback if DB fetch fails
                if (emailEl) emailEl.textContent = user.email;
                if (gmailEl) gmailEl.textContent = user.email;
            });

            const isSuperAdmin = user.email === 'admin@school.com' || user.email === 'adminitk@gmail.com';

            // Function to apply permissions
            const applyPermissions = (perms) => {
                // Default Permissions (if null)
                const p = perms || { dashboard: false, registration: true, data: true, inventory: false };

                // 1. Hide/Show Sidebar Links
                const links = {
                    'index.html': p.dashboard,
                    'registration.html': p.registration,
                    'data-tracking.html': p.data,
                    'inventory.html': p.inventory,
                    'user-management.html': false // Always false for non-super-admin
                };

                // Apply visibility
                for (const [page, allowed] of Object.entries(links)) {
                    const link = document.querySelector(`a[href="${page}"]`);
                    if (link) link.style.display = allowed ? 'block' : 'none';
                }

                // 2. Check Current Page Access
                const path = window.location.pathname;
                const currentPage = path.split('/').pop() || 'index.html';

                // Map pages to permission keys
                const pagePermissionMap = {
                    'index.html': 'dashboard',
                    'registration.html': 'registration',
                    'data-tracking.html': 'data',
                    'inventory.html': 'inventory',
                    'user-management.html': 'admin_only'
                };

                const requiredPerm = pagePermissionMap[currentPage];

                // Allow if permission is true, OR if it's not in the map (public?), OR if super admin
                if (requiredPerm && requiredPerm !== 'admin_only' && !p[requiredPerm]) {
                    console.warn(`Access denied to ${currentPage}. Redirecting...`);
                    // Find a safe page to redirect to
                    if (p.registration) window.location.href = "registration.html";
                    else if (p.data) window.location.href = "data-tracking.html";
                    else alert("គណនីរបស់អ្នកមិនមានសិទ្ធិប្រើប្រាស់ណាមួយទេ។ សូមទាក់ទង Admin។");
                } else if (requiredPerm === 'admin_only') {
                    console.warn(`Access denied (Admin Only). Redirecting...`);
                    window.location.href = "index.html"; // Will re-check and redirect based on perms
                }
            };

            // Logic Flow
            if (isSuperAdmin) {
                if (roleEl) {
                    roleEl.textContent = 'Admin (អ្នកគ្រប់គ្រង)';
                    roleEl.className = 'badge bg-warning text-dark mt-1 fw-normal';
                }
                // Admin sees everything
                const allLinks = document.querySelectorAll('.sidebar .nav-link');
                allLinks.forEach(l => l.style.display = 'block');
            } else {
                if (roleEl) {
                    roleEl.textContent = 'Staff (បុគ្គលិក)';
                    roleEl.className = 'badge bg-info mt-1 fw-normal';
                }

                // Fetch permissions from DB
                firebase.database().ref('users/' + user.uid).once('value').then(snapshot => {
                    const userData = snapshot.val();
                    const perms = userData ? userData.permissions : null;
                    applyPermissions(perms);
                }).catch(err => {
                    console.error("Error fetching permissions:", err);
                    // Fallback: Registration only
                    applyPermissions({ dashboard: false, registration: true, data: false, inventory: false });
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
