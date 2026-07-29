from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./dystopiacty.db"
    gemma_model_id: str = "google/gemma-4-12B-it"
    google_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
    openweather_api_key: str = ""
    tomtom_api_key: str = ""
    nominatim_email: str = ""
    demo_city_name: str = "Bengaluru"
    http_ssl_verify: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
