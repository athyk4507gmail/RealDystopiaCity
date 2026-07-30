from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, SessionLocal, engine, migrate_schema
from app.routers import budget, chat, complaints, gemma, integrations, metabolism, risk_zones, traffic, traffic_mood, trust_score, water
from app.seed.data import seed_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    migrate_schema()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="CityPulse AI",
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

app.include_router(water.router)
app.include_router(complaints.router)
app.include_router(trust_score.router)
app.include_router(risk_zones.router)
app.include_router(traffic_mood.router)
app.include_router(traffic.router)
app.include_router(metabolism.router)
app.include_router(chat.router)
app.include_router(gemma.router)
app.include_router(budget.router)
app.include_router(integrations.router)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "platform": "CityPulse AI",
        "gemma_model": settings.gemma_model_id,
        "ai_mode": "live" if settings.google_api_key else "fallback",
    }
