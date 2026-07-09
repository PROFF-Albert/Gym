# ELEV8 — Firebase Auth Wiring (Go-Live Checklist)

## What's done
- `firebase-init.js` — Firebase app init (needs your real config pasted in)
- `auth.js` — signup, login, logout, role-based routing, Firestore profile write
- `signup.html` / `login.html` — wired to call `handleSignup()` / `handleLogin()`, with an error box
- All 12 other pages — Logout button now calls `handleLogout()` (real sign-out) instead of just linking to login.html

## What YOU need to do before going live

### 1. Paste your Firebase config
Open `firebase-init.js`, replace the `REPLACE_ME` values with what Firebase gave you when you registered the web app.

### 2. Enable Email/Password sign-in
Firebase Console → Build → Authentication → Sign-in method → Email/Password → Enable.

### 3. Create Firestore database
Firebase Console → Build → Firestore Database → Create database → production mode → pick a region.

### 4. Deploy the security rules
Firebase Console → Firestore Database → Rules tab → paste the contents of `firestore.rules` → Publish.
(This restricts each user to only reading/writing their own profile doc — required, or anyone could read everyone's data.)

### 5. Authorize your domain
Firebase Console → Authentication → Settings → Authorized domains → add your live domain (e.g. `shnn.com` or whatever you're deploying to). `localhost` is allowed by default for local testing.

### 6. Drop all files into your site folder
Copy `firebase-init.js` and `auth.js` into the same folder as your HTML pages (same level as `gym.css`). The paths in the `<script>` tags assume they're siblings.

### 7. Test the flow locally first
- Sign up as "Member" → should land on `userdashboard.html`
- Sign up as "Gym Owner" → should land on `ownersdashboard.html`
- Log out → should return to `login.html`
- Log back in with either account → should route to the correct dashboard again

## Known limitations (fine for tonight, fix soon after)
- **No page guarding yet.** Anyone can type `ownersdashboard.html` in the URL bar directly without being logged in. Since you said this is OK for now, it's not blocking launch — but plan to add an `onAuthStateChanged` check on each protected page soon.
- **No password reset flow** — add `sendPasswordResetEmail` later if needed.
- **No email verification** — accounts work immediately on signup.
- **Firestore rules only cover `/users/{uid}`** — if you add more collections later (gyms, subscriptions, payments) they'll need their own rules or they'll be locked out by default in production mode.

## File reference
```
firebase-init.js     <- your Firebase config lives here
auth.js              <- all auth logic (signup/login/logout)
signup.html          <- wired
login.html           <- wired
gym.html             <- logout wired
gym-profile.html     <- logout wired
gyms.html            <- logout wired
member.html          <- logout wired
member-profile.html  <- logout wired
ownersdashboard.html <- logout wired
owners-subscription.html <- logout wired
payment.html         <- logout wired
settings.html        <- logout wired
subscription.html    <- logout wired
userdashboard.html   <- logout wired
user-subscription.html <- logout wired
```
