# Nomi

Nomi is a desktop-first AI video production workspace for writing scripts, generating images and videos, arranging a timeline, and exporting results.

All project records are stored on your machine. New projects create real folders under:

```txt
Documents/Nomi Projects
```

Generated or imported assets are copied into the project folder, so saved project files reference local assets instead of remote storage.

## Run

```bash
corepack enable
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

## Current Structure

```txt
electron/          Electron main process, preload bridge, local runtime
src/               React renderer and desktop IPC adapters
public/            Static renderer assets
scripts/           Desktop development helpers
```

## Architecture

- Renderer code keeps the existing API-oriented adapter layer.
- In desktop runtime, those adapters call `window.nomiDesktop` IPC instead of a standalone API server.
- Project data is written to local `project.json` files.
- Generated assets are downloaded into local project `assets/` folders.
- Agent chat is retained as a local desktop service that uses the configured text model.
- Model/provider configuration is stored in the desktop app data directory.

Apache-2.0 License
