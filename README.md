# Lumen

Docker, process and service management panel for a UGREEN DXP4800 NAS.

Phase 1 serves the panel from one Go process: container discovery, status, ports, icons, live CPU/memory/network, container actions, logs, and a single admin password. Later pages (processes, alerts, image updates) still use the UI shell.

- Stack: React 19, Vite 8, Tailwind v4, shadcn/ui (preset `bYAK`: radix-nova, neutral, Tabler icons, Inter), Recharts, dnd-kit, react-router.
- Design rules: `taste-skill` v2 (`.agents/skills/design-taste-frontend`), installed with `npx skills add Leonxlnx/taste-skill`.

## Run

```bash
# API on :7878, talks to the local Docker socket
go run ./cmd/lumen

# UI dev server proxies /api to :7878
npm install
npm run dev
```

The first visit asks for an admin password (at least 10 characters). Forget it with `docker exec lumen lumen reset-password` when running from compose, or delete `data/state.json` in local dev.

```bash
docker compose up -d --build   # privileged, pid: host, docker.sock, port 7878
```

Append `?state=loading`, `?state=empty` or `?state=error` to list pages to preview non-happy states.

## Layout

- `src/pages/` one file per screen (overview, home, services, service-detail, ports, processes, updates, alerts, resources, settings, login)
- `src/components/` app shell, service icon, icon picker, edit sheet, status/port chips, charts, page states
- `src/lib/icons.ts` image name to icon slug matching for Dashboard Icons and selfh.st
- `src/mock/` sample data shaped like the planned API
