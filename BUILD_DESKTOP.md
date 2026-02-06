# Building Expert Agent Desktop App

## Prerequisites

- **Node.js 20+**
- **npm** (comes with Node.js)

## Quick Build (One Command)

### Windows (.exe)
```bash
npm run desktop:package
```
Output: `dist-desktop/Expert Agent Setup 2.0.0-alpha.7.exe`

### macOS (.dmg)
```bash
npm run desktop:package:mac
```
Output: `dist-desktop/Expert Agent-2.0.0-alpha.7.dmg`

### All Platforms
```bash
npm run desktop:package:all
```

## Step-by-Step Build

If the one-liner fails, run each step manually:

```bash
# 1. Install root dependencies (electron)
npm install

# 2. Install server dependencies
cd server && npm install && cd ..

# 3. Install web dependencies
cd web && npm install && cd ..

# 4. Build web frontend
cd web && npm run build && cd ..

# 5. Build server
cd server && npm run build && cd ..

# 6. Build desktop (Electron main process)
cd desktop && npx tsc && cd ..

# 7. Copy web dist to server/public (for static serving)
mkdir -p server/public
cp -r web/dist/* server/public/

# 8. Build installer
npx electron-builder --mac    # macOS .dmg
npx electron-builder --win    # Windows .exe (only on Windows)
npx electron-builder --linux  # Linux .AppImage
```

## macOS Specific Notes

### Code Signing (Optional)
For distribution outside the Mac App Store, you'll want to sign the app:

```bash
# Set these env vars before building:
export CSC_LINK=/path/to/your/certificate.p12
export CSC_KEY_PASSWORD=your-cert-password

npm run desktop:package:mac
```

Without signing, users will need to right-click > Open to bypass Gatekeeper.

### Apple Silicon (M1/M2/M3)
electron-builder auto-detects your architecture. To build for both:
```bash
npx electron-builder --mac --arm64 --x64
```

## What Gets Built

| Platform | File | Size | Install Method |
|----------|------|------|----------------|
| Windows | `Expert Agent Setup X.X.X.exe` | ~183 MB | Run installer, creates desktop shortcut |
| macOS | `Expert Agent-X.X.X.dmg` | ~180 MB | Open DMG, drag to Applications |
| Linux | `Expert Agent-X.X.X.AppImage` | ~180 MB | `chmod +x` and run |

## Architecture

The desktop app bundles:
- **Electron** — Chrome-based desktop shell
- **Express server** — Node.js backend (forked as child process)
- **React admin UI** — Served as static files from the Express server
- **SQLite** — Embedded database (no external DB needed)

On launch:
1. Electron starts → forks server process on port 4100
2. Server creates `expert-agent.db` in user's app data directory
3. Browser window opens → loads `http://localhost:4100`
4. First run shows Setup Wizard (enter API keys + name agent)

## Troubleshooting

### `Cannot compute electron version`
```bash
npm install  # Install root devDependencies (electron)
```

### `better-sqlite3` native module error on Mac
```bash
cd server && npx electron-rebuild -f -w better-sqlite3
```

### Build fails with code signing error (Mac)
```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac
```
