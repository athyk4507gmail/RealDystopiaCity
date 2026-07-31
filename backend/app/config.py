from pydantic_settings import BaseSettings
import logging

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    database_url: str = "sqlite:///./dystopiacty.db"
    gemma_model_id: str = "gemma-4-26b-a4b-it"  # Matches GEMMA_MODEL_ID in .env
    google_api_key: str = ""
    # Generic OpenAI-compatible provider (HuggingFace, OpenRouter, Groq, Together, etc.)
    gemma_api_key: str = ""
    gemma_api_base_url: str = ""  # e.g. https://api-inference.huggingface.co/models/google/gemma-4-26b-a4b-it/v1
    ollama_base_url: str = "http://localhost:11434"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3010,http://127.0.0.1:3010,http://localhost:3001,http://127.0.0.1:3001"
    openweather_api_key: str = ""
    tomtom_api_key: str = ""
    nominatim_email: str = ""
    demo_city_name: str = "Bengaluru"
    http_ssl_verify: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
# Log on startup to confirm key is loaded
if settings.google_api_key:
    masked = settings.google_api_key[:10] + "..." if len(settings.google_api_key) > 10 else "***"
    print(f"[CONFIG] GOOGLE_API_KEY loaded: {masked}")
else:
    print(f"[CONFIG] WARNING: GOOGLE_API_KEY not set or empty")
print(f"[CONFIG] GEMMA_MODEL_ID: {settings.gemma_model_id}")
print(f"[CONFIG] Using model: {settings.gemma_model_id}")
