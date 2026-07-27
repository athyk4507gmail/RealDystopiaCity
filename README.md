# CityPulse AI

Unified intelligence platform for sustainable cities — water distribution, traffic management, and cross-system city metabolism. All AI reasoning powered by **Google Gemma 4** (`google/gemma-4-12B-it`).

## Architecture

```
nexu/
├── backend/          FastAPI + PostgreSQL + Gemma 4
├── frontend/         Next.js + Mapbox GL + Recharts
└── docker-compose.yml
```

### Modules

| Module | Route | Description |
|--------|-------|-------------|
| Water Distribution | `/water` | AI scheduling, leakage detection, demand forecasting |
| Trust Score | `/trust-score` | Bus route reliability scoring |
| Risk Zones | `/risk-zones` | Driver behavior accident prediction |
| Traffic Mood | `/traffic-mood` | Event-based congestion prediction + car simulation |
| Traffic Management | `/traffic` | Signal timing, ambulance green corridor |
| City Metabolism | `/metabolism` | Cross-system cascade + stress testing |

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Mapbox access token ([mapbox.com](https://mapbox.com))
- (Optional) Google API key for live Gemma 4, or Ollama with `gemma4:12b-it`

### 1. Start Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Copy env (optional — SQLite works out of the box)
cp .env.example .env

uvicorn app.main:app --reload --port 8000
```

The backend uses **SQLite by default** (no Docker required). For PostgreSQL, use Docker:

```bash
docker compose up -d db
# Set DATABASE_URL=postgresql+psycopg://citypulse:citypulse@localhost:5432/citypulse in backend/.env
```

### 2. Start Frontend

```bash
cd frontend
cp .env.local.example .env.local
# Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### AI Configuration

Gemma 4 integration supports three modes (tried in order):

1. **Google AI API** — set `GOOGLE_API_KEY` in `backend/.env`
2. **Ollama local** — run `ollama pull gemma4:12b-it` and set `OLLAMA_BASE_URL`
3. **Rule-based fallback** — works offline for demos without any API key

Model ID: `google/gemma-4-12B-it` (configurable via `GEMMA_MODEL_ID`)

### Realistic Data Layer Configuration

Add these to `backend/.env` to enable live/grounded data providers:

- `OPENWEATHER_API_KEY` — live weather by ward lat/lng
- `TOMTOM_API_KEY` — live road congestion baseline
- `NOMINATIM_EMAIL` — optional contact field for OSM data fetches
- `DEMO_CITY_NAME` — city name for Overpass boundary/road pulls (`Bengaluru` default)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/water/wards` | GET | List all wards |
| `/api/water/schedule` | GET | Today's AI schedule |
| `/api/water/schedule/generate` | POST | Regenerate with Gemma 4 |
| `/api/water/leakage/detect` | POST | Image leakage detection |
| `/api/trust-score/routes` | GET | Bus route trust scores |
| `/api/risk-zones/timeline` | GET | Risk evolution timeline |
| `/api/traffic-mood/predict` | GET | Event-based surge predictions |
| `/api/traffic/ambulance-corridor` | POST | Green corridor simulation |
| `/api/metabolism/stress-test/{event}` | POST | Cross-system cascade |
| `/api/integrations/weather?lat=&lng=` | GET | OpenWeatherMap live weather (15-minute cache) |
| `/api/integrations/locations?city=` | GET | OSM ward/road geometry for canonical location set |
| `/api/integrations/traffic?lat=&lng=` | GET | TomTom live congestion snapshot |
| `/api/risk-zones/black-spots` | GET | Reported accident-prone junction anchors |
| `/api/chat/` | POST | Global Gemma 4 chat |

## Tech Stack

- **Frontend:** Next.js 15, React, TypeScript, Tailwind CSS, Mapbox GL JS, Recharts
- **Backend:** FastAPI, SQLAlchemy, PostgreSQL + PostGIS
- **AI:** Google Gemma 4 (multimodal), XGBoost/scikit-learn for numeric predictions
- **Simulation:** Animated map markers (CSS/SVG, no physics engine)

## Demo Tips

1. Start with **Water** module — click "Regenerate Schedule" to see Gemma 4 reasoning per ward
2. **Traffic Mood** — click "Trigger" on an event to watch cars build up on the map
3. **Traffic** — click "Ambulance Green Corridor" for cascading green signals
4. **Risk Zones** — hit "Play Timeline" to watch risk zones evolve over 5 weeks
5. **City Metabolism** — trigger a "Heatwave" stress test for the cascade animation
6. Use **Ask CityPulse AI** chat (bottom-right) on any page for natural-language Q&A
