from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _add_columns(table: str, column_defs: dict[str, str]) -> list[str]:
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return []
    existing = {col["name"] for col in inspector.get_columns(table)}
    return [
        f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"
        for name, ddl in column_defs.items()
        if name not in existing
    ]


def migrate_schema() -> None:
    alterations: list[str] = []

    alterations.extend(
        _add_columns(
            "water_schedules",
            {
                "supply_start_time": "VARCHAR(5) DEFAULT '06:00'",
                "supply_end_time": "VARCHAR(5) DEFAULT '09:00'",
                "sub_localities": "JSON",
                "fairness_score": "FLOAT",
                "days_since_supply": "INTEGER",
                "forced_supply": "BOOLEAN DEFAULT 0",
                "overridden": "BOOLEAN DEFAULT 0",
                "override_reason": "TEXT",
            },
        )
    )

    alterations.extend(
        _add_columns(
            "water_complaints",
            {
                "resolved_at": "DATETIME",
                "resolution_comment": "TEXT",
                "assigned_team": "VARCHAR(100)",
                "is_synthetic_seed": "BOOLEAN DEFAULT 0",
            },
        )
    )

    if not alterations:
        return

    with engine.begin() as conn:
        for statement in alterations:
            conn.execute(text(statement))
