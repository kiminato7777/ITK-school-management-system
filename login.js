// Basic Input Animations (Highlighting)
let usernameRef = document.getElementById("username");
let passwordRef = document.getElementById("password");

// Toggle Password Visibility
const togglePassword = document.getElementById('togglePassword');
if (togglePassword) {
  togglePassword.addEventListener('click', function (e) {
    // toggle the type attribute
    const type = passwordRef.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordRef.setAttribute('type', type);

    // toggle the eye slash icon
    this.classList.toggle('fa-eye-slash');
    this.classList.toggle('fa-eye');
  });
}

/**
 * AUTHENTICATION LOGIC
 */
const loginForm = document.getElementById('loginForm');


if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = usernameRef.value.trim();
    const password = passwordRef.value;

    if (!email || !password) {
      showCustomAlert("សូមបញ្ចូលអ៊ីមែល និងពាក្យសម្ងាត់!");
      return;
    }

    const loginBtn = document.querySelector('button');
    const originalText = loginBtn.innerText;
    loginBtn.innerText = "កំពុងចូល...";
    loginBtn.disabled = true;

    firebase.auth().signInWithEmailAndPassword(email, password)
      .then((userCredential) => {
        // Signed in
        console.log("Logged in:", userCredential.user);

        // Update Last Login in Database
        const uid = userCredential.user.uid;
        const userRef = firebase.database().ref('users/' + uid);

        userRef.update({
          lastLogin: new Date().toISOString()
        }).then(() => {
          window.location.href = "index.html";
        }).catch((err) => {
          console.error("Error updating last login:", err);
          // Still redirect even if update fails
          window.location.href = "index.html";
        });
      })
      .catch((error) => {
        console.error("Login error:", error);

        let errorMessage = "មានបញ្ហាកក្នុងការចូលប្រើប្រាស់។";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-login-credentials') {
          errorMessage = "អ៊ីមែល ឬ ពាក្យសម្ងាត់មិនត្រឹមត្រូវ!";
        } else if (error.code === 'auth/invalid-email') {
          errorMessage = "ទម្រង់អ៊ីមែលមិនត្រឹមត្រូវ!";
        } else if (error.code === 'auth/too-many-requests') {
          errorMessage = "ការព្យាយាមចូលច្រើនដងពេក។ សូមរង់ចាំមួយសន្ទុះ!";
        } else {
          errorMessage = "មានបញ្ហាកក្នុងការចូល៖ " + error.message;
        }

        showCustomAlert(errorMessage);
        loginBtn.innerText = originalText;
        loginBtn.disabled = false;
      });
  });
}

function showCustomAlert(message) {
  const alertBox = document.getElementById("customAlert");
  alertBox.innerText = message;
  alertBox.style.display = "block";
  setTimeout(() => {
    alertBox.style.display = "none";
  }, 3000);
}

// Check auth state
firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    console.log("User already logged in, redirecting...");
    // Optional: if you want to prevent going back to login while logged in
    // window.location.href = "index.html";
  }
});