// Copy this file to js/firebase-config.js and fill in the values from
// Firebase Console → Project settings → General → "Your apps" → SDK setup.
//
// js/firebase-config.js is listed in .gitignore and is never committed.
// When deployed via GitHub Actions, this file is generated automatically
// from your repository secrets — see README.md.

export const firebaseConfig = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__",
};
