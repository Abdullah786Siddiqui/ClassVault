# ClassVault

ClassVault is an offline-first study-space PWA for organizing semester notes, photos, and files, with optional Google Drive sync.

When connected, the app reconciles its ClassVault Drive folder on startup, manual sync, and when returning to the app. New or updated Drive files are reflected locally, and locally mirrored files removed from Drive are removed from the app; unsynced local items are kept.

## Configure Google Drive

Copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID` to your Google OAuth web client ID for local development. Keep `.env` local; environment files are excluded from Git.

For Cloudflare Pages, add `VITE_GOOGLE_CLIENT_ID` under **Settings → Environment variables** for both Production and Preview, then trigger a new deployment. Cloudflare must have the variable before it builds the app; changing it does not update an already deployed build.

Vite embeds this public OAuth client ID in the generated client bundle, so it must be available at build time. Never add a Google client secret to the frontend or repository.

If the variable is not set, ClassVault continues to work locally and offline, but Google Drive connection is unavailable.

## Development

```sh
npm install
npm run dev
```
