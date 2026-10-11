# ClassVault

ClassVault is an offline-first study-space PWA for organizing semester notes, photos, and files, with optional Google Drive sync.

## Configure Google Drive

Copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID` to your Google OAuth web client ID. Keep `.env` local; environment files are excluded from Git.

For production, provide `VITE_GOOGLE_CLIENT_ID` to the build environment (for example, as a GitHub Actions repository variable) before running `npm run build`. Vite embeds this value in the generated client bundle, so it must be available at build time.

If the variable is not set, ClassVault continues to work locally and offline, but Google Drive connection is unavailable.

## Development

```sh
npm install
npm run dev
```
