/**
 * Firebase Configuration and Initialization
 * Centralized configuration for the school management system
 */

const firebaseConfig = {
  apiKey: "AIzaSyBFyNIJw69g-d8qEU6cFRQrdRg4Er-ZngM",
  authDomain: "itk-shcool.firebaseapp.com",
  databaseURL: "https://itk-shcool-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "itk-shcool",
  storageBucket: "itk-shcool.firebasestorage.app",
  messagingSenderId: "788690021304",
  appId: "1:788690021304:web:7bcb1935820b25a92c7d4d"
};

// Initialize Firebase if not already initialized
if (typeof firebase !== 'undefined') {
    if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
        console.log("🔥 Firebase initialized (Centralized)");
    } else {
        console.log("🔥 Firebase already initialized");
    }

    // Global references
    window.db = firebase.database();
    window.storage = (typeof firebase.storage !== 'undefined') ? firebase.storage() : null;

    // Keep 'database' as a global constant if expected by other scripts
    if (typeof window.database === 'undefined') {
        window.database = window.db;
    }
} else {
    console.error("❌ Firebase SDK not found. Please ensure Firebase scripts are loaded before firebase-config.js");
}
