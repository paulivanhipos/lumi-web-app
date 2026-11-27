# Lumi – System Test Plan (Task 1.07)

**Owner:** QA (lead), BE  |  **Version:** 0.2  |  **Status:** Draft for team review
**System under test:** Lumi – Bucket List & Diary (https://lumi-webapp.vercel.app), source in `Lumi/` of the repository (Firebase Auth + Firestore, browser app).
**Related docs:** Project Proposal and System Requirements v0.1 (FR-01 to FR-14, NFR-01 to NFR-07), AI Design Note v0.1.

## 1. Purpose and scope
Verify that Lumi saves entries correctly, controls who can read what, handles letters with release dates, and gives AI answers only from content the asker may see. Test IDs: `LUMI-AT-01` to `LUMI-AT-20`.
**Out of scope:** load/performance, Firebase internals, real user data.

## 2. How this version was prepared
The first pass is a **code review** of `firestore.rules`, `app.js`, `firebase.js`, `lumi-ai-prompt.js`. The live app was **not** run in a browser. So each test has a status:
- **PASS (code review)** – the code does what is expected; confirm once on the live app.
- **TO RUN (manual)** – needs a person to try it on the live app.
- **GAP (not built)** – the expected behaviour does not exist in Lumi yet.
Result of the first pass: 11 PASS (code review), 5 TO RUN, 4 GAP.

## 3. Test data (stored in `test-data/`)
- `fictional-owner.json` – invented owner **Tomas Verano**, 19 diary entries + 1 letter (20 items), tags `family`, `business`, `personal`, `bucket-list`, `letter`, dates in 2026, a letter to daughter **Isla** with release date **2030-06-15**. Invented contacts: Maria Santos (business partner) and Isla. All emails use `example.test`. No real personal data.
- `access-test-table.csv` – columns: test_id, system, requirement, asker, entry, expected_result, basis, status, notes.

## 4. Test areas mapped to Lumi

| Area | What it means in Lumi | Key cases | IDs |
|------|-----------------------|-----------|-----|
| Parser | Input validation and loading saved data (letter form checks, `JSON.parse` of saved state, import/export JSON) | past date, no date, empty body, corrupted storage | 14, 15, 16, 20 |
| Access rules | Firestore rules (owner only), login, PIN, "Share with family" flag | other user, not logged in, Maria, Isla, revoke | 1–4, 5–10, 11–13, 17 |
| Entry pipeline | Compose → draft → save → localStorage → Firestore sync (`users/{uid}/entries`) | create/edit/delete, offline then sync, photo upload | (manual, section 6) |
| Hash chain | Tamper detection of saved entries | edit an entry, delete middle entry | 18 |
| Writing modes | Journal entry (mood, text, photos, places), draft, letter, dream/bucket item, memory, voice input | each mode saves right fields; letter needs date | (manual, section 6) |
| AI answers | Lumi AI (Gemini via Firebase AI Logic) using the user's own data; fallback replies | Maria asks about Tomas, prompt injection, no data, AI offline | 9, 19 |

## 5. Findings from code review

| ID | Finding | Related requirement | Severity |
|----|---------|---------------------|----------|
| F-1 | Firestore rules allow **owner only**. There is no asker, trustee or grant. Any case where Maria or Isla should be allowed (LUMI-AT-05, 10) cannot pass. | FR-05, FR-06, FR-10 | High (design gap) |
| F-2 | "Share with family" is a `shared` flag in the owner's own data, not a server-enforced permission. Revoking (FR-14) is not enforced for another person. Lumi also has no tag field (`family`, `business`). | FR-05, FR-14 | High |
| F-3 | No hash chain for entries. SHA-256 is used only for password and PIN. | NFR-04 | Medium (if required) |
| F-4 | `lumi-ai-prompt.js` has no rule to treat diary text as untrusted data, and no rule to refuse restricted content. | NFR-03, FR-08 | Medium |
| F-5 | No audit log of access decisions. | FR-12 | Medium |

## 6. Manual tests to run on the live app (entry pipeline and writing modes)
1. Sign up, add a journal entry (mood + text), refresh, confirm it stays. Check Firestore `users/{uid}/entries`.
2. Add entry with photo and place, then edit and delete it.
3. Turn internet off, add an entry, turn it on, confirm sync.
4. Start an entry, leave, return: draft is kept.
5. Add a letter with a future date; confirm it stays locked, then test with a date 1–2 minutes ahead.
6. Add a dream/bucket item and a memory; check required fields.
7. Use voice input in Chrome or Edge.
8. Turn AI on/off (`FIREBASE_USE_AI`) and confirm fallback replies.

## 7. Entry / exit criteria
- **Entry:** test data loaded into a test Firebase project (never production); two extra test accounts (Maria, Isla).
- **Exit:** all TO RUN done; every GAP has a decision in Kaneo (build it, or change the requirement); no open High finding without an owner.

## 8. Roles and defects
QA lead runs the plan; BE loads data and checks rules. Defects go to Kaneo with steps, expected vs actual, test ID and screenshot. Access leaks are Critical.

## 9. Open items
- Handout's sample scenarios for Maria are not in this repo; LUMI-AT-05 to 10 are placeholders to be replaced.
- Confirm if Lumi is the deployed name of ALAALA (see AI Design Note section 7).
- Repository and Kaneo links: GitHub URL `[ ]`, Kaneo URL `[ ]`.
