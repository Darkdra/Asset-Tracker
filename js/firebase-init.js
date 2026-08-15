import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let firebaseConfig;
try {
  ({ firebaseConfig } = await import("./firebase-config.js"));
} catch (err) {
  // firebase-config.js is missing — this happens if you haven't created it
  // locally yet, or if the CI deploy step failed to generate it.
  document.body.innerHTML =
    '<div style="font-family:monospace;padding:40px;max-width:640px;margin:0 auto;line-height:1.6">' +
    "<h2>Missing js/firebase-config.js</h2>" +
    "<p>Copy <code>js/firebase-config.template.js</code> to <code>js/firebase-config.js</code> and fill in " +
    "your Firebase project's web app credentials (see README.md). " +
    "If you're viewing this on the deployed GitHub Pages site, the deploy workflow failed to generate " +
    "this file from your repository secrets — check the Actions tab.</p></div>";
  throw err;
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Persists Firestore data to IndexedDB so the app (installed as a PWA or
// just opened offline in a browser) can still show your last-synced net
// worth, categories, and items without a connection. Writes made offline
// queue automatically and sync once you're back online.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
});
