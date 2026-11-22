# Lumi — Bucket List & Diary (Firebase)

Gumagamit ang Lumi ng **Firebase**:
- **Firebase Authentication**: accounts (email at password)
- **Cloud Firestore**: lahat ng data (dreams, journal, memories, goals, letters…)
- **Photos at videos**: naka-save din sa Firestore (libre, Spark plan).
  Puwede ring Firebase Storage kung naka-Blaze plan kayo.

Hindi na kailangan ng XAMPP, PHP o MySQL.

---

## A. I-setup ang Firebase (isang beses lang)

1. Pumunta sa **https://console.firebase.google.com** at mag-login sa Google account.
2. I-click ang **Create a project**, pangalanan (hal. `lumi-app`), tapos **Continue** hanggang matapos.
   (Puwedeng i-off ang Google Analytics.)
3. **Gumawa ng Web App:** sa Project Overview, i-click ang icon na **`</>`** (Web).
   Pangalanan ng `Lumi`, tapos i-click ang **Register app**.
   Lalabas ang code na may `const firebaseConfig = { apiKey: ..., ... }`.
   **Kopyahin ang laman ng `{ ... }`.**
4. Buksan ang **`js/firebase-config.js`** at **i-paste** ito kapalit ng `FIREBASE_CONFIG = { ... }`.
5. **I-on ang login:** pumunta sa **Build → Authentication → Get started → Sign-in method**.
   Piliin ang **Email/Password**, i-**Enable**, at i-**Save**.
6. **Gumawa ng database:** pumunta sa **Build → Firestore Database → Create database**.
   Pumili ng location (hal. `asia-southeast1`), tapos **Start in production mode → Create**.
7. **Security rules:** sa Firestore, pumunta sa tab na **Rules**.
   Burahin ang laman, i-paste ang laman ng **`firestore.rules`**, at i-click ang **Publish**.
   (Dahil dito, sariling data lang ang makikita ng bawat user.)

## B. Patakbuhin sa VS Code

1. Buksan ang folder sa VS Code: **File → Open Folder → Lumi**.
2. I-install ang extension na **Live Server** (ni Ritwick Dey).
3. I-right-click ang **`index.html`** at piliin ang **Open with Live Server**.
4. Bubukas ito sa `http://127.0.0.1:5500/`. Mag-**Sign up**.
5. Sa **Menu → Settings**, dapat makita ang **"🔥 Connected to Firebase"**.

> Kung "Offline mode" ang lumabas, tingnan kung tama ang na-paste sa `js/firebase-config.js`.

## C. Tingnan ang data

Sa Firebase console:
- **Authentication → Users**: lahat ng accounts.
- **Firestore Database → Data**: `users` → (user ID) → `dreams`, `entries`, `memories`, `goals`,
  `letters`, `events`, `customDest`, `files` (photos at videos), `state` (settings, theme, AI chat…).

## D. (Optional) I-online para mabuksan kahit saan, gamit ang Firebase Hosting

1. I-install ang Node.js (https://nodejs.org).
2. Sa Terminal ng VS Code:
   ```
   npm install -g firebase-tools
   firebase login
   firebase use --add        (piliin ang project ninyo)
   firebase deploy --only hosting,firestore
   ```
3. Bibigyan kayo ng link, hal. `https://lumi-app.web.app`, na puwedeng buksan kahit sa cellphone.

## E. (Optional) Firebase Storage para sa malalaking video

Default: naka-save ang photos at videos sa Firestore (libre, hanggang **60 MB** bawat file).
Kung gusto ninyo ng Firebase Storage:
1. Kailangang i-upgrade ang project sa **Blaze plan** (may libreng quota pa rin, pero kailangan ng card).
2. Pumunta sa **Build → Storage → Get started**, at i-paste ang `storage.rules` sa **Rules → Publish**.
3. Sa `js/firebase-config.js`, gawing `const FIREBASE_USE_STORAGE = true;`

## Mga file

| File | Laman |
|---|---|
| `index.html` | Ang app |
| `css/style.css` | Design |
| `css/responsive.css` | Layout para sa phone, tablet at laptop |
| `js/app.js` | Lahat ng features ng Lumi |
| `js/firebase-sdk.js` | Firebase library (naka-include na, hindi kailangang i-download) |
| `js/firebase-config.js` | **Dito ilalagay ang config ng Firebase project ninyo** |
| `js/firebase.js` | Koneksyon ng Lumi sa Firebase (login, save, upload) |
| `firestore.rules` | Security rules ng database |
| `storage.rules` | Security rules ng Storage (kung gagamitin) |
| `firebase.json` | Para sa `firebase deploy` |
| `extra/` | Lumang PHP + MySQL version at offline version |

## Kung may error

| Error | Ayos |
|---|---|
| "Email/Password sign-in is not enabled" | Gawin ang Step A5 |
| "permission denied" | Gawin ang Step A7 (i-Publish ang rules) |
| "The Firebase apiKey… is wrong" | Kopyahin ulit ang config (Step A3–A4) |
| Offline mode | Mali o kulang ang `firebase-config.js`, o binuksan nang direkta ang file. Gamitin ang Live Server |
| Nakalimutan ang password | Sa Log In, i-type ang email at i-click ang **Forgot password?**. May ipapadalang email |

## Libreng limit (Spark plan)
Firestore: 1 GiB na data, 50,000 reads at 20,000 writes kada araw. Sapat ito para sa school project.
Para makatipid, ang mga binago lang ang ina-upload ng Lumi.

## ✅ Checklist bago ang presentation

1. **Gamitin ang Google Chrome o Microsoft Edge.** Mas maganda ang boses ni Lumi at gumagana ang mic.
2. **Siguraduhing may internet.** Kailangan ito ng Firebase para sa login at pag-save.
3. Buksan gamit ang **Live Server** (o ang Firebase Hosting link). **Huwag i-double-click** ang `index.html`.
4. Pindutin ang **Ctrl + F5** bago magsimula para siguradong pinakabagong version ang nakabukas.
5. Sa **Menu → Settings**, tingnan kung **"🔥 Connected to Firebase"** ang nakalagay.
6. **Gumawa ng demo account bago ang presentation** at lagyan na ng 2–3 dreams, isang journal entry
   at isang memory na may litrato, para hindi nagsisimula sa wala.
7. **Lakasan ang volume** ng laptop para marinig ang boses ni Lumi (Mood Boost, Memory Collection, Congratulations).
8. **Kung mawalan ng internet:** gagana pa rin ang app, pero sa laptop lang mase-save ang data
   at mag-a-update ito kapag bumalik ang internet. Puwede ring gamitin ang
   `extra/lumi-offline-single-file.html` bilang backup (hindi kailangan ng internet o Firebase).

### Mga feature na magandang ipakita (demo flow)
1. Sign up o Log in (ipakita ang eye icon sa password)
2. Home: bati ayon sa oras, Quick add, at mga bilang ng dreams
3. Magdagdag ng dream na may cover photo at target date, at i-mark as favorite
4. Journal: piliin ang mood at isulat ang entry (naka-lock sa petsa ngayon)
5. Memory Collection: mag-add ng memory (litrato o video) para sa dream, at hintayin ang **Congratulations** pagkalipas ng 5 segundo
6. AI: Best Friend chat, Lumi Memory Collection, at Mood Boost
7. Notifications (🔔): pindutin para buksan ang item
8. Settings: PIN lock at Themes

## F. 🤖 Lumi AI na may totoong AI (Gemini)

Kapag naka-set up ito, kaya nang sagutin ni Lumi AI ang **kahit anong tanong** (kaalaman, payo,
pag-aaral, programming at kuwentuhan). Kilala rin niya ang mga dreams, journal at memories ng user.
Kapag hindi naka-set up o walang internet, babalik si Lumi sa simpleng built-in replies, kaya hindi masisira ang chat.

1. Sa Firebase console, pumunta sa **AI Services → AI Logic** (o **Build → AI Logic**) at i-click ang **Get started**.
2. Piliin ang **Gemini Developer API**. Libre ito at gumagana sa Spark plan. I-click ang **Enable API** o **Continue** hanggang matapos.
3. Kapag tinanong tungkol sa **App Check**, may dalawang paraan:
   - **Mabilis (para sa demo):** Sa **Build → App Check → APIs**, hanapin ang **Firebase AI Logic** at i-click ang **Unenforce**
     kung naka-"Enforced". (Hindi ito kasing-secure ng opsyon B.)
   - **Secure:** Sa **App Check → Apps**, i-register ang web app gamit ang **reCAPTCHA Enterprise**. Idagdag ang mga domain
     na `lumi-89e31.web.app`, `localhost` at `127.0.0.1` sa reCAPTCHA key. Kopyahin ang **site key** at ilagay sa
     `js/firebase-config.js` → `FIREBASE_RECAPTCHA_SITE_KEY = "..."`. Kapag gamit ang Live Server, buksan ang
     browser console (F12), kopyahin ang **"App Check debug token"**, at idagdag ito sa **App Check → Apps → ⋮ → Manage debug tokens**.
4. I-deploy ulit: `firebase deploy --only hosting`.
5. Sa **AI → Best Friend**, dapat nakalagay ang **"✨ Lumi AI · powered by Gemini"**. Subukang magtanong ng kahit ano.

**Pagbabago ng ugali ni Lumi:** I-edit ang `js/lumi-ai-prompt.js` (ang system prompt).
**Pag-off ng AI:** Sa `js/firebase-config.js`, gawing `const FIREBASE_USE_AI = false;`.
**Tandaan:** May limit kada minuto at kada araw ang libreng Gemini tier. Kapag naabot ito, pansamantalang simple replies muna ang gagamitin.
