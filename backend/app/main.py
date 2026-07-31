import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import Base, SessionLocal, engine, migrate_schema
from app.routers import (
    agent,
    budget,
    chat,
    complaints,
    gemma,
    health_watch,
    integrations,
    metabolism,
    risk_zones,
    traffic,
    traffic_management,
    traffic_mood,
    trust_score,
    water,
)
from app.seed.data import seed_database
from app.services.gemma import explain_live_camera, explain_live_cameras_batch
from app.services.live_camera import live_camera_background_loop

STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger("dystopiacity")


def _mask_secret(value: str) -> str:
    if not value:
        return "EMPTY"
    return f"SET ({value[:8]}...)"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "Gemma config at startup — GOOGLE_API_KEY=%s GEMMA_API_KEY=%s GEMMA_API_BASE_URL=%s",
        _mask_secret(settings.google_api_key),
        _mask_secret(settings.gemma_api_key),
        settings.gemma_api_base_url or "EMPTY",
    )
    Base.metadata.create_all(bind=engine)
    migrate_schema()

    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()

    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    camera_task = asyncio.create_task(
        live_camera_background_loop(explain_live_camera, explain_live_cameras_batch)
    )

    try:
        yield
    finally:
        camera_task.cancel()
        try:
            await camera_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="DystopiaCITY",
    description="Unified intelligence platform for sustainable cities",
    version="1.0.0",
    lifespan=lifespan,
)


origins = [o.strip() for o in settings.cors_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Core modules
app.include_router(water.router)
app.include_router(complaints.router)
app.include_router(trust_score.router)
app.include_router(risk_zones.router)

# Traffic modules
app.include_router(traffic.router)
app.include_router(traffic_management.router)
app.include_router(traffic_mood.router)

# AI / Intelligence modules
app.include_router(gemma.router)
app.include_router(chat.router)

# Other modules
app.include_router(metabolism.router)
app.include_router(health_watch.router)
app.include_router(budget.router)
app.include_router(agent.router)
app.include_router(integrations.router)


app.mount(
    "/static",
    StaticFiles(directory=STATIC_DIR),
    name="static",
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "platform": "DystopiaCITY",
        "gemma_model": settings.gemma_model_id,
        "ai_mode": "live" if (settings.google_api_key or settings.gemma_api_key) else "fallback",
    }
