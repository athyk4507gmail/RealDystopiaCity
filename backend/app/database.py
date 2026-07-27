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


def migrate_schema() -> None:
    inspector = inspect(engine)
    if "water_schedules" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("water_schedules")}
    alterations = []
    if "supply_start_time" not in columns:
        alterations.append("ALTER TABLE water_schedules ADD COLUMN supply_start_time VARCHAR(5) DEFAULT '06:00'")
    if "supply_end_time" not in columns:
        alterations.append("ALTER TABLE water_schedules ADD COLUMN supply_end_time VARCHAR(5) DEFAULT '09:00'")
    if "sub_localities" not in columns:
        alterations.append("ALTER TABLE water_schedules ADD COLUMN sub_localities JSON")

    if not alterations:
        return

    with engine.begin() as conn:
        for statement in alterations:
            conn.execute(text(statement))
