/* =============================================================
   🔥 FIREBASE SETTINGS — paste your own project's config here
   Firebase console → Project settings (⚙️) → General →
   "Your apps" → Web app (</>) → SDK setup and configuration → Config
   ============================================================= */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBzlE2JYy0M2yaombSpw15mOtCTVREjdqo",
  authDomain: "lumi-web-app.firebaseapp.com",
  projectId: "lumi-web-app",
  storageBucket: "lumi-web-app.firebasestorage.app",
  messagingSenderId: "118509721297",
  appId: "1:118509721297:web:2d3c9f7878cf099b1657f0"
};

/* Photos & videos:
   false = saved inside Firestore (works on the FREE Spark plan)
   true  = saved in Firebase Storage (needs the Blaze plan) */
const FIREBASE_USE_STORAGE = false;

/* 🤖 Lumi AI (Gemini through Firebase AI Logic)
   true  = Lumi AI uses Gemini (turn on "AI Logic" in the Firebase console first)
   false = Lumi AI uses the simple built-in replies */
const FIREBASE_USE_AI = true;
/* Gemini model. "gemini-flash-latest" always points to the newest Flash model. */
const LUMI_AI_MODEL = "gemini-flash-latest";
/* Optional: reCAPTCHA Enterprise site key for App Check (see README, part F). Leave "" if not used. */
const FIREBASE_RECAPTCHA_SITE_KEY = "";
