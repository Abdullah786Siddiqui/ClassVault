# Class Notes Vault: Project Specification

> This document is the full brief for building the app. Read it completely before writing code. Follow the phases in order and ask before deviating from the decisions marked **FINAL**.

---

## 1. Problem

University students cannot capture everything a teacher says in class. Writing by hand is slow, important spoken points are forgotten, and photos of the board get lost in the phone gallery. Before exams the student has no single place with everything the teacher taught.

## 2. Solution

An installable **PWA (Progressive Web App)** where a student quickly saves **text notes, photos and files** into a clear hierarchy (Semester → Mid/Final → Subject). Everything is saved instantly on the phone (works offline in class) and automatically uploaded to the student's **Google Drive** inside real folders. At exam time everything is in one place, on the phone or on a laptop via drive.google.com.

**Primary user:** a single university student (the author), mobile first. UI language: English labels (the developer speaks Urdu/Roman Urdu, so keep code comments simple).

---

## 3. Core concepts and hierarchy (FINAL)

```
Semester
 ├── Subjects (added ONCE per semester)
 ├── Mid    → shows all semester subjects → each subject has its own items
 └── Final  → shows all semester subjects → each subject has its own items
```

- A subject is added **once** to a semester. It automatically appears under both Mid and Final.
- **Mid and Final data are completely separate.** A note saved under Mid/Maths does not appear in Final/Maths.
- Inside a subject (for a given exam), the user can add three types of items:
  1. **Text note**
  2. **Photo** (camera or gallery), with an optional caption
  3. **File** (any file: PDF, docx, pptx, etc.)

### Google Drive folder structure (FINAL)

Real folders must be created in the user's Drive:

```
Class Notes Vault/
 └── Semester 1/
      ├── Mid/
      │    ├── Maths/    → note files, photos, files
      │    └── Physics/
      └── Final/
           ├── Maths/
           └── Physics/
```

- Folder names come from the names the user typed. Create folders lazily (only when the first item is uploaded) and cache folder IDs.
- Text notes are uploaded as `.txt` files (name: `YYYY-MM-DD_HH-mm_<first words of note>.txt`).
- Photo captions are stored in the Drive file's `description` field.
- Use `appProperties` on uploaded files to store metadata (e.g. `starred`, `itemId`, `createdAt`) so the app can rebuild its view from Drive.

---

## 4. Storage and sync architecture (FINAL: offline-first)

Class has unreliable internet and little time, so **saving must never wait for the network.**

1. User saves a note/photo/file → it is written **immediately to Dexie (IndexedDB)** with `syncStatus = 'pending'` (works fully offline).
2. A sync service uploads pending items to Google Drive (correct folder path) when online and signed in.
3. After a successful upload: set `syncStatus = 'synced'`, store `driveFileId`, and **delete the local blob** (to save phone storage). Keep the small metadata record.
4. Status icon on every item: ⏳ pending, ✅ synced, ⚠️ failed (with retry).

**When sync runs** (must work on all phones):
- When the app opens
- When the `online` event fires
- When the user taps "Sync now"
- After saving an item (if online)
- Additionally, use Background Sync API where supported (Android Chrome only). iOS does not support it, so the above triggers are mandatory.

**Other storage rules:**
- Call `navigator.storage.persist()` on first run so the browser does not evict local data.
- Never delete a local blob until the Drive upload is confirmed successful.
- Handle failures with retry and exponential backoff. One failed item must not block the others.
- Viewing a `synced` item whose blob was removed: fetch it from Drive on demand (needs internet) and show a clear message if offline. (Optional improvement: keep small thumbnails locally for photos.)

---

## 5. Tech stack (FINAL)

| Purpose | Technology |
|---|---|
| UI | **Vue 3** (Composition API, `<script setup>`), JavaScript (TypeScript optional, ask the user) |
| Routing | **Vue Router** |
| State | **Pinia** |
| Build | **Vite** |
| Styling | **Tailwind CSS** (mobile first, dark mode via `class` strategy) |
| PWA | **vite-plugin-pwa** (manifest + service worker, offline app shell) |
| Local storage | **Dexie.js** (IndexedDB) |
| Auth | **Google Identity Services** (token model, OAuth 2.0) |
| Cloud storage | **Google Drive API v3** via plain `fetch` (no heavy SDK needed) |
| Hosting | **GitHub Pages** or **Netlify** (free, HTTPS required for PWA) |

**No backend server.** The browser talks directly to Google.

### Auth details and limits

- OAuth scope: **`https://www.googleapis.com/auth/drive.file` only**. The app can only see files/folders it created. Do not request broader scopes.
- Without a backend, the access token lasts about **1 hour**. Implement silent re-request of the token (`prompt: ''`) and a visible **"Reconnect Google Drive"** button when silent renewal fails. Offline saving must keep working even when signed out.
- The Google Client ID is a public value and goes in `.env` as `VITE_GOOGLE_CLIENT_ID`. Never put a client secret in the project.

---

## 6. Screens and navigation

1. **Home**: list of semesters, "Add Semester" button, sync status indicator (pending count, last sync), Google sign-in/reconnect state.
2. **Semester**: two large buttons **Mid** and **Final**, plus "Manage subjects" (add, rename, delete subject).
3. **Subject list** (for the chosen Mid/Final): all subjects of that semester.
4. **Subject screen**: tabs **Notes | Photos | Files**, floating **"+"** button, items sorted newest first with sync status icons.
5. **Add item**: write text, take a photo with the camera (`<input type="file" accept="image/*" capture="environment">`), pick from gallery, or pick any file.
6. **Viewer**: full-screen photo view, note view/edit, file open/download.

Route sketch: `/` → `/semester/:semId` → `/semester/:semId/:exam(mid|final)` → `/semester/:semId/:exam/subject/:subId`

**UX priorities:** speed in class. Adding a note must take as few taps as possible. Large touch targets, one-hand use, instant feedback.

---

## 7. Data model (Dexie)

```js
semesters: ++id, name, createdAt
subjects:  ++id, semesterId, name, createdAt
items:     ++id, semesterId, subjectId, exam('mid'|'final'),
           type('text'|'photo'|'file'),
           title, text, caption, fileName, mimeType, blob,
           starred(0|1), syncStatus('pending'|'synced'|'failed'),
           driveFileId, errorMessage, createdAt, updatedAt
driveFolders: key (path string, e.g. "Semester 1/Mid/Maths"), driveFolderId
settings:  key, value
```

Deleting a semester/subject: confirm with the user, and decide whether Drive files are also deleted (default: **do not delete from Drive**, only remove from the app, and say so in the confirmation dialog).

---

## 8. Suggested project structure

```
src/
 ├── main.js
 ├── App.vue
 ├── router/index.js
 ├── views/
 │    ├── HomeView.vue
 │    ├── SemesterView.vue
 │    ├── SubjectListView.vue
 │    └── SubjectView.vue
 ├── components/
 │    ├── SyncStatusIcon.vue
 │    ├── AddItemSheet.vue
 │    ├── NoteCard.vue
 │    ├── PhotoGrid.vue
 │    └── FileRow.vue
 ├── stores/
 │    ├── semesters.js
 │    ├── items.js
 │    ├── auth.js
 │    └── sync.js
 └── services/
      ├── db.js        (Dexie setup)
      ├── auth.js      (Google Identity Services)
      ├── drive.js     (find/create folders, upload, download, list)
      └── sync.js      (queue processing, retry, triggers)
```

---

## 9. Phases

### Phase 1: MVP (build this first)
1. Vue + Vite + Tailwind + Router + Pinia project setup.
2. PWA: manifest, icons, service worker, installable, offline app shell.
3. Dexie database and all screens above, **fully working offline with no Google yet**.
4. Add/edit/delete: semesters, subjects, text notes, photos (camera + gallery), files.
5. Request persistent storage.
6. **Then** Google sign-in and Drive upload with folder creation, sync queue, status icons, retry.

### Phase 2
- ⭐ Important/star toggle and a "starred only" filter (for exam revision)
- Search across all subjects (text, titles, captions)
- Date grouping/sorting
- Dark mode toggle
- Rebuild the library from Drive on a new phone/after reinstall

### Phase 3 (optional)
- Share notes with friends (Drive sharing link)
- Image compression before upload, thumbnails
- OCR on board photos

---

## 10. Google Cloud setup (the user will do this; guide them step by step)

1. Go to console.cloud.google.com → create a project (e.g. "Class Notes Vault").
2. Enable **Google Drive API**.
3. Configure the **OAuth consent screen** (External, add the user's own Gmail as a **test user**; no verification is needed for personal use with `drive.file`).
4. Create **OAuth Client ID** → type **Web application**.
5. Add **Authorized JavaScript origins**: `http://localhost:5173` and the final hosted URL (GitHub Pages/Netlify).
6. Copy the Client ID into `.env` as `VITE_GOOGLE_CLIENT_ID`.

Note: apps in "Testing" mode may require re-consent after a period; mention this if sign-in starts failing.

---

## 11. Deployment

- Build with `npm run build`, deploy `dist/` to Netlify or GitHub Pages (set Vite `base` correctly for GitHub Pages).
- HTTPS is mandatory for service workers and install prompts.
- Show a custom "Install app" button using the `beforeinstallprompt` event on Android; on iOS show brief instructions (Share → Add to Home Screen).

---

## 12. Acceptance criteria for Phase 1

- [ ] App installs to the phone home screen and opens offline.
- [ ] Can create a semester, add subjects once, and see the same subjects under both Mid and Final with separate data.
- [ ] Can add a text note, a camera photo with caption, and a file in under ~5 taps.
- [ ] All data survives closing/reopening the app and works in airplane mode.
- [ ] After signing in, pending items upload automatically to the correct Drive folder path and show ✅.
- [ ] Failed uploads show ⚠️ and can be retried; nothing is lost.
- [ ] Local blobs are removed only after confirmed upload.
- [ ] No secrets in the repo; only `drive.file` scope is requested.

---

## 13. Instructions for Claude Code

- Start with Phase 1, steps 1 to 5 (offline app, no Google). Let the user test, then do step 6.
- Keep code simple and well commented. The developer knows Vue but is not an expert.
- Prefer small, focused components and commit in logical steps.
- After each milestone, tell the user how to run and test it on their phone (use `npm run dev -- --host` and, for PWA testing, a deployed HTTPS build).
- Ask the user before adding any dependency that is not listed in section 5.
- Do not change the decisions marked **FINAL** without asking.
