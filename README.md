# CYAN-Housing-Planner

[繁體中文](readme-zh-hk.md)

**Self-hosted 2D/3D floor plan editor** — draw plans in 2D, preview and walk through them in 3D, and keep every project on your own server.

Forked from the MIT-licensed [openplan3d](https://github.com/laanlabs/openPlan3D) project and reworked into a multi-user, self-hostable app: accounts, per-user project storage, quotas and an admin console, with no cloud dependencies.

<p align="center">
  <img src="plan1_2d.jpg" alt="2D Floor Plan View" width="48%">
  <img src="plan1_3d.jpg" alt="3D Floor Plan View" width="48%">
</p>
<p align="center">
  <img src="plan4_2d.jpg" alt="Detailed 2D Plan" width="48%">
  <img src="plan4_3d.jpg" alt="Detailed 3D View" width="48%">
</p>

---

## Features

### Accounts & storage
- **Server-side library** — projects, thumbnails, version history and recovery data live in a SQLite file under `DATA_DIR`; nothing is kept in the browser
- **Sign-up / sign-in** with cookie sessions; users only ever see their own plans
- **Per-user project quota** — plan allowance from `plans.json` (`free` 50 / `pro` 200) + admin-granted bonus slots; paid plans carry an expiry date and fall back to `free`
- **Share links** — per-project public links with optional password and 1/7/30-day expiry; regenerate or revoke anytime from the project menu
- **Admin console** (`/admin`) — activate/deactivate accounts (with a reason shown at sign-in), change plans, grant bonus slots

### Drawing tools
- Walls with snapping and angle constraints; doors & windows in multiple styles; straight/L/U stairs
- Rooms auto-detected from walls, with labels and colors
- Categorized furniture catalog with drag-and-drop, rotation, resizing (full 3D models)

### 3D view
- Real-time 3D preview (`Tab`) and first-person walkthrough
- Material editor (wood, tile, marble, carpet, concrete, brick, …) and adjustable lighting

### Pro tools
- Snap to grid, smart guides, multi-select + align/distribute, layers, annotations, room presets
- Undo/redo with grouped operations and restore-able version history snapshots

### Import / export
- **Export**: SVG, DXF, PDF (title block), PNG, editable JSON, project package ZIP
- **Import**: JSON projects, Apple RoomPlan scan files, project package ZIP, clipboard images
- Whole-library backup/restore from the project list

### Multi-language
- English, Português, 繁體中文（香港）
- Drop a new `<locale>.json` into [`src/lib/i18n/languages/`](src/lib/i18n/languages/) to add a language — see [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Self-host with Docker

The app is a Node 24 server with SQLite storage — one container, no external services:

```bash
docker build -t cyan-housing-planner .
docker run -d -p 3000:3000 -v cyan-data:/data \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='change-me' \
  --name cyan-planner cyan-housing-planner
```

Open http://localhost:3000, sign in as the admin account (created from the env vars on first boot), and start planning. The `-v cyan-data:/data` mount keeps accounts and plans across rebuilds.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listen port inside the container |
| `DATA_DIR` | `/data` (`data/` outside Docker) | SQLite database directory |
| `ADMIN_USERNAME` | — | With `ADMIN_PASSWORD`, ensures this user exists as an admin at every boot — also the password-reset path for that account |
| `ADMIN_PASSWORD` | — | The env admin's password; rotated into the DB on each boot while set |
| `MAX_PROJECTS_PER_USER` | `50` | Overrides the `free` plan quota from `plans.json` |
| `PLANS_FILE` | `plans.json` | Path to the plan catalog; mount your own with `-v ./plans.json:/app/plans.json` |
| `REGISTRATION_OPEN` | `true` | `false` closes public sign-ups |
| `AUTH_RATE_LIMIT` | `20` per minute per IP | Login/register attempts cap; `0` disables |
| `BODY_SIZE_LIMIT` | `64M` | Max request body — large plans and library restores need this |
| `ORIGIN` | request origin | Public URL when behind a reverse proxy (e.g. `https://plans.example.com`) |

Running without Docker: `npm run build` then `DATA_DIR=data PORT=3000 node build/index.js`.

---

## Development

Requires Node.js 24 (see `.nvmrc`) — the server uses `node:sqlite`.

```bash
git clone https://github.com/Ceplavia/CYAN-Housing-Planner.git
cd CYAN-Housing-Planner
npm ci
npm run dev
```

Checks before submitting changes:

```bash
npm test                      # vitest unit suite
npm run check                 # svelte-check
npm run build                 # production build
npx playwright install chromium
npm run test:browser          # browser suite (runs its own isolated DB)
```

Browser tests spin up the production build with a throwaway `DATA_DIR` and a seeded `e2e_admin` account — they never touch your real `data/` directory.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `V` / `W` / `D` / `T` / `H` | Select / wall / door / annotation / pan |
| `R` | Rotate selected furniture |
| `Tab` | Toggle 2D / 3D view |
| `Delete` / `Backspace` | Delete selected element(s) |
| `Escape` | Deselect / cancel |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+S` | Save project |

---

## Tech stack

- [SvelteKit](https://svelte.dev) + adapter-node — app framework and server
- [Three.js](https://threejs.org) — 3D rendering
- [Tailwind CSS](https://tailwindcss.com) + TypeScript
- [`node:sqlite`](https://nodejs.org/api/sqlite.html) — accounts, sessions and project storage
- jsPDF, dxf-writer, jszip — exports

## License

[MIT](LICENSE)
