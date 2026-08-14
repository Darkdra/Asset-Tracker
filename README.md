# Asset Tracker

A private, single-user net worth & liabilities ledger. Plain HTML/CSS/JS
front end (no build step) hosted on GitHub Pages, with Firebase Authentication
for sign-in and Cloud Firestore for storage.

Two themes are built in: **Noir Ledger** (black + pastel red, default) and
**Ivory Ledger** (white + gold) — toggle with the switch next to the gear icon.

---

## How it's built

```
index.html              Login screen + app shell
css/styles.css           All styling, both themes (CSS variables)
js/firebase-init.js      Initializes Firebase from js/firebase-config.js
js/firebase-config.template.js   Placeholder config — copy this, never commit the real one
js/data.js                Firestore reads/writes (categories, sections, items, history)
js/theme.js               Theme + sidebar-collapse state (localStorage)
js/ui.js                  Formatting, toasts, modal, chart rendering
js/app.js                 Routing, view rendering, all event handling
firestore.rules            Security rules — restricts data to your own uid
.github/workflows/deploy.yml   Builds firebase-config.js from GitHub Secrets and deploys
```

No npm install, no bundler — GitHub Pages serves the files as-is.

---

## Part 1 — Set up Firebase

### 1. Create a Firebase project
Go to <https://console.firebase.google.com>, **Add project**, give it a name
(e.g. `my-asset-tracker`). You can leave Google Analytics off — you don't need it.

### 2. Register a web app
In the project, click the **`</>`** (web) icon → give it a nickname → **Register app**.
Firebase shows you a `firebaseConfig` object with six values:
`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
Keep this tab open — you'll need these in Part 3.

### 3. Enable Email/Password sign-in
**Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**

### 4. Create your one account
**Authentication → Users → Add user.** Enter the email and password you want to
sign in with. This app never calls Firebase's "create account" function itself —
there is no sign-up form anywhere in the code — so this console-created account
is the *only* account that will ever exist. This is abuse-prevention **#1**.

### 5. Enable Firestore
**Build → Firestore Database → Create database → Production mode** → pick a
region close to you.

### 6. Publish the security rules
Open the **Rules** tab in Firestore and replace the contents with everything
in [`firestore.rules`](./firestore.rules) from this repo, then **Publish**.

These rules mean: *a request can only read or write documents under
`/users/{uid}` if it's authenticated and its `uid` matches that path.*
Since only your one account can authenticate, this is abuse-prevention **#4**.

### 7. Restrict your API key to your domain
Firebase web API keys aren't secret by design, but locking one down costs
nothing and blocks scripted abuse outright:
1. Go to <https://console.cloud.google.com/apis/credentials> and pick the
   same project.
2. Click the API key that matches your Firebase web app (usually named
   "Browser key (auto created by Firebase)").
3. Under **Application restrictions**, choose **Websites** and add:
   ```
   https://YOUR-GITHUB-USERNAME.github.io/*
   ```
   (add `http://localhost:*/*` too if you want to test locally).
4. Save.

Requests from any other origin are now rejected before they reach Firebase.
This is abuse-prevention **#2**.

> Firebase Auth also automatically throttles and temporarily blocks repeated
> failed sign-in attempts from the same source — nothing to configure. This
> is abuse-prevention **#3**.

### 8. Set a budget alert
1. Go to <https://console.cloud.google.com/billing>, select the billing
   account linked to this project.
2. **Budgets & alerts → Create budget.**
3. Scope it to this project, set an amount like **SGD $1** (or whatever
   makes you comfortable), keep the default alert thresholds (50/90/100%).
4. Save.

Since your expected usage is $0/month, any alert firing means something
unexpected is happening and you'll get an email. This is abuse-prevention **#5**.

> Note: to actually use Email/Password auth and Firestore outside of very
> light testing, Firebase asks you to be on the **Blaze** (pay-as-you-go)
> plan. Blaze doesn't mean "pay immediately" — it means "billed only past
> the free limits." For one personal user, you'll stay at $0.00. The budget
> alert above is your safety net regardless.

---

## Part 2 — Push the code to GitHub

### 1. Create the repository
On GitHub, **New repository** → name it (e.g. `asset-tracker`) → keep it
**Public** or **Private**, either works with GitHub Pages → **Create**
(don't initialize with a README, this project already has one).

### 2. Push this project
From the folder containing these files:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/asset-tracker.git
git push -u origin main
```

### 3. Add your Firebase config as repository secrets
Your real credentials are never committed — the deploy workflow generates
`js/firebase-config.js` at deploy time from GitHub Secrets.

Go to **Settings → Secrets and variables → Actions → New repository secret**,
and add each of these six (values from Part 1, step 2):

| Secret name | Value |
|---|---|
| `FIREBASE_API_KEY` | apiKey |
| `FIREBASE_AUTH_DOMAIN` | authDomain |
| `FIREBASE_PROJECT_ID` | projectId |
| `FIREBASE_STORAGE_BUCKET` | storageBucket |
| `FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
| `FIREBASE_APP_ID` | appId |

### 4. Turn on GitHub Pages via Actions
**Settings → Pages → Build and deployment → Source → GitHub Actions.**
(You don't need to pick a branch — the workflow handles deployment.)

### 5. Deploy
The workflow at `.github/workflows/deploy.yml` runs automatically on every
push to `main`. If it already ran before you added the secrets, re-run it:
**Actions tab → Deploy to GitHub Pages → Run workflow** (or push an empty
commit: `git commit --allow-empty -m "Deploy" && git push`).

When it finishes, your site is live at:
```
https://YOUR-GITHUB-USERNAME.github.io/asset-tracker/
```
(check **Settings → Pages** for the exact URL). Sign in with the email/password
you created in Part 1, step 4.

Remember to go back to Part 1, step 7 and use this exact URL's origin when
restricting the API key.

---

## Local testing (optional, before you deploy)

```bash
cp js/firebase-config.template.js js/firebase-config.js
```
Fill in the same six values directly in that file, then serve the folder
with any static server, e.g.:
```bash
npx serve .
# or
python3 -m http.server 8080
```
`js/firebase-config.js` is in `.gitignore`, so this local copy is never
pushed — only the CI-generated one on GitHub Pages exists "for real."

---

## Data model (Firestore)

```
users/{uid}
  categories/{categoryId}            { name, icon, order }
    sections/{sectionId}             { name, order }
      items/{itemId}                 { name, value, order, updatedAt }
  networthSnapshots/{YYYY-MM-DD}     { date, total, updatedAt }
```

- **Net worth** = sum of every item's `value` across every category/section.
  Values can be negative (liabilities), matching the wireframe.
- Every time an item is added, edited, or deleted, the app recomputes the
  total and upserts today's `networthSnapshots` doc — that's what feeds the
  performance chart and the 1m/3m/All toggle on the dashboard.

---

## Troubleshooting

- **"Missing js/firebase-config.js" screen on the live site** — the Actions
  workflow ran before all six secrets existed, or the workflow failed. Check
  the **Actions** tab for the failed step, add the missing secret, and
  re-run.
- **Login fails with correct credentials** — double check the API key
  restriction in Part 1, step 7 includes your exact Pages URL's origin.
- **`permission-denied` errors in the browser console** — the Firestore
  rules probably weren't published (Part 1, step 6), or you're signed in as
  a different uid than the data was written under.
