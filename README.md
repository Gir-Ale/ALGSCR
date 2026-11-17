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

**The API key never leaves the server.** The browser only talks to `localhost:3000`.

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
