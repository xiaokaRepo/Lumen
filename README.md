# Lumen (UI prototype)

Docker, process and service management panel for a UGREEN DXP4800 NAS. This branch contains the **frontend UI prototype only**: every page runs on mock data in `src/mock/`. There is no backend yet.

- Stack: React 19, Vite 8, Tailwind v4, shadcn/ui (preset `bYAK`: radix-nova, neutral, Tabler icons, Inter), Recharts, dnd-kit, react-router.
- Design rules: `taste-skill` v2 (`.agents/skills/design-taste-frontend`), installed with `npx skills add Leonxlnx/taste-skill`.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run lint && npm run typecheck
```

The prototype starts logged in. Use the user menu to log out and see `/login`; `/login?setup=1` shows first-run password setup.

Append `?state=loading`, `?state=empty` or `?state=error` to list pages to preview non-happy states.

## Layout

- `src/pages/` one file per screen (overview, home, services, service-detail, ports, processes, updates, alerts, resources, settings, login)
- `src/components/` app shell, service icon, icon picker, edit sheet, status/port chips, charts, page states
- `src/lib/icons.ts` image name to icon slug matching for Dashboard Icons and selfh.st
- `src/mock/` sample data shaped like the planned API
