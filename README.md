# Lumen

Docker, process and service management panel for a UGREEN DXP4800 NAS.

The panel signs in with one password and only lists services, sends actions, and shows status. Each machine runs `lumen-agent` (its own image), which talks to local Docker, processes, disk, and the sleep proxy on that machine. See [docs/agent.md](docs/agent.md). Alerts go out through Bark, Telegram, or WeCom. Image checks compare registry digests and only notify.

- Stack: React 19, Vite 8, Tailwind v4, shadcn/ui (preset `bYAK`: radix-nova, neutral, Tabler icons, Inter), Recharts, dnd-kit, react-router.
- Design rules: `taste-skill` v2 (`.agents/skills/design-taste-frontend`), installed with `npx skills add Leonxlnx/taste-skill`.

## Run

```bash
# Agent on the machine that has Docker. The token is shared with the panel.
LUMEN_AGENT_TOKEN=change-me LUMEN_ADDR=:7879 go run ./cmd/lumen-agent

# Panel on :7878. Add the agent under 主机.
LUMEN_ADDR=:7878 go run ./cmd/lumen

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
