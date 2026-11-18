# ALGSCR Interactive Music Globe

A web app that renders an interactive 3D globe where countries you've recently listened to music from light up, extruded and colored by the dominant color of your most-played album from that country. Click any country to see your listening history from there.

## Features

-  **3D rotating globe** built with Three.js
-  **Album-color-extracted country highlights** using `node-vibrant`
-  **Extruded highlighted countries** for visual depth
-  **Click any country** to see tracks listened from there
-  **5-minute server-side cache** to minimize Last.fm API calls
-  **Docker-ready** one command to run

## Quick Start

### With Docker (recommended)

```bash
# 1. Copy and fill in your credentials
cp .env.example .env
# Edit .env to set LASTFM_API_KEY and LASTFM_USER

# 2. Start everything
docker compose up

# 3. Open http://localhost:3000
```

### Without Docker

```bash
cd server
npm install
cd ..

# Make sure .env is in the project root
node server/index.js

# Open http://localhost:3000
```

### Deploy on the course server

The visit-counter remains at `https://student10.wt.thomasjuldo.com/`. ALGSCR
is served beside it at
`https://student10.wt.thomasjuldo.com/music/`. This uses the visit-counter's
existing Caddy container; it does not start another listener on ports 80/443.
The `Caddyfile` in this repository is a reference; add only its `/music` handler
to the existing visit-counter Caddyfile, rather than replacing that file.

For a first deployment, clone the repository and create `.env` on the server:

```bash
git clone https://github.com/Gir-Ale/ALGSCR.git
cd ALGSCR
nano .env
```

Set your Last.fm credentials in `.env`:

```env
LASTFM_API_KEY=your_lastfm_api_key
LASTFM_USER=your_lastfm_username
```

Keep the existing `.env` credentials when updating; remove the obsolete
`ALGSCR_HOST_PORT` setting if you added it for the old port-based setup. Push
the updated project to GitHub from your computer, then update the server copy:

```bash
cd ~/ALGSCR
git pull
docker network inspect visit-counter_default
```

Start ALGSCR; this connects its private app port to the existing Caddy network:

```bash
docker compose -f docker-compose.yml -f compose.server.yaml up -d --build
```

In `/root/visit-counter/Caddyfile`, add this handler inside the existing
`student10.wt.thomasjuldo.com` block, **before** its catch-all `handle`:

```caddyfile
handle_path /music/* {
    reverse_proxy algscr:3000
}
```

Keep the existing `/api/*` and catch-all handlers unchanged. Then reload the
existing Caddy from the visit-counter directory:

```bash
cd ~/visit-counter
docker compose -f compose.yaml -f compose.server.yaml exec caddy \
  caddy reload --config /etc/caddy/Caddyfile
```

Check `https://student10.wt.thomasjuldo.com/music/` and
`https://student10.wt.thomasjuldo.com/`; the former should show ALGSCR and the
latter should still show the visit-counter. For later updates, push from your
computer, then run `git pull` and the ALGSCR Compose command on the server. The
production override removes the app's public port mapping and keeps local
development at `http://localhost:3000`.

## Environment Variables

| Variable         | Description                     | Default  |
|------------------|---------------------------------|----------|
| `LASTFM_API_KEY` | Your Last.fm API key            | —        |
| `LASTFM_USER`    | Last.fm username to display     | `GIRAL4` |
| `PORT`           | Port the server listens on      | `3000`   |

## API Endpoints

| Endpoint                | Description                                      |
|-------------------------|--------------------------------------------------|
| `GET /api/recent-tracks`| Last 200 recent tracks for the configured user   |
| `GET /api/country-tracks`| Tracks grouped by country with album colors      |
| `GET /api/health`       | Health check                                     |

## Architecture

```
Browser ──► Express Server (Node.js :3000)
                │
                ├── Serves public/ (index.html, globe.js, ui.js, style.css)
                │
                ├── GET /api/recent-tracks  ──► Last.fm API (cached 5 min)
                │
                └── GET /api/country-tracks ──► Last.fm API
                                                 + node-vibrant color extraction
                                                 (cached 5 min)
```

**The API key never leaves the server.** The browser uses the same-origin app
and API; it never calls Last.fm directly.

## Project Structure

```
ALGSCR/
├── server/
│   ├── index.js        # Express entry point
│   ├── cache.js        # In-memory TTL cache
│   ├── lastfm.js       # Last.fm API + country detection
│   ├── colorExtract.js # Album color extraction (node-vibrant)
│   └── package.json
├── public/
│   ├── index.html      # Main page
│   ├── globe.js        # Three.js globe
│   ├── ui.js           # Panel / overlay UI
│   └── style.css       # Dark glassmorphism styles
├── .env.example        # Credential template
├── .gitignore
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## How Country Detection Works

1. Fetches the last 200 tracks via `user.getRecentTracks`
2. For each unique artist, calls `artist.getInfo` to get their tags
3. Matches tag names against a demonym→country lookup table (e.g., `"british"` → `"United Kingdom"`)
4. Groups tracks by inferred country
5. Finds the most-played album per country and extracts its dominant color with `node-vibrant`

## Globe Controls

| Action           | Control                        |
|------------------|--------------------------------|
| Rotate           | Click & drag                   |
| Zoom             | Scroll wheel                   |
| View country     | Click on a highlighted country |
| Close panel      | Click ✕ or press Escape        |
