from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Ward(Base):
    __tablename__ = "wards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    population: Mapped[int] = mapped_column(Integer)
    houses: Mapped[int] = mapped_column(Integer)
    tank_capacity_litres: Mapped[float] = mapped_column(Float)
    available_water_litres: Mapped[float] = mapped_column(Float)
    last_supply_date: Mapped[date] = mapped_column(Date)
    avg_daily_consumption: Mapped[float] = mapped_column(Float)
    complaints: Mapped[int] = mapped_column(Integer, default=0)
    leakage_reports: Mapped[int] = mapped_column(Integer, default=0)
    temperature_c: Mapped[float] = mapped_column(Float)
    growth_rate_pct: Mapped[float] = mapped_column(Float)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    polygon: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


class WaterComplaint(Base):
    __tablename__ = "water_complaints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ward_id: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolution_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_team: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_synthetic_seed: Mapped[bool] = mapped_column(Boolean, default=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)


class WaterSchedule(Base):
    __tablename__ = "water_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ward_id: Mapped[int] = mapped_column(Integer)
    supply_today: Mapped[bool] = mapped_column(Boolean)
    allocation_litres: Mapped[float] = mapped_column(Float)
    duration_hours: Mapped[float] = mapped_column(Float)
    supply_start_time: Mapped[str] = mapped_column(String(5), default="06:00")
    supply_end_time: Mapped[str] = mapped_column(String(5), default="09:00")
    priority: Mapped[str] = mapped_column(String(10))
    reasoning: Mapped[str] = mapped_column(Text)
    sub_localities: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, default=list)
    schedule_date: Mapped[date] = mapped_column(Date)
    fairness_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    days_since_supply: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    forced_supply: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=False)
    overridden: Mapped[bool] = mapped_column(Boolean, default=False)
    override_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class BusRoute(Base):
    __tablename__ = "bus_routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    route_number: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(100))
    stops: Mapped[int] = mapped_column(Integer)
    avg_delay_minutes: Mapped[float] = mapped_column(Float)
    trust_score: Mapped[float] = mapped_column(Float)
    time_slot: Mapped[str] = mapped_column(String(20))
    citizen_reports_on_time: Mapped[int] = mapped_column(Integer, default=0)
    citizen_reports_late: Mapped[int] = mapped_column(Integer, default=0)


class RoadSegment(Base):
    __tablename__ = "road_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    coordinates: Mapped[list] = mapped_column(JSON)
    hard_braking_events: Mapped[int] = mapped_column(Integer)
    swerving_events: Mapped[int] = mapped_column(Integer)
    speed_variance: Mapped[float] = mapped_column(Float)
    risk_score: Mapped[float] = mapped_column(Float)
    accident_count: Mapped[int] = mapped_column(Integer, default=0)
    week_index: Mapped[int] = mapped_column(Integer, default=0)


class TrafficSignal(Base):
    __tablename__ = "traffic_signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    green_time_sec: Mapped[int] = mapped_column(Integer, default=30)
    queue_length: Mapped[int] = mapped_column(Integer, default=0)
    congestion_pct: Mapped[float] = mapped_column(Float, default=0)


class TrafficEvent(Base):
    __tablename__ = "traffic_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    event_type: Mapped[str] = mapped_column(String(50))
    location: Mapped[str] = mapped_column(String(100))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    event_time: Mapped[datetime] = mapped_column(DateTime)
    crowd_size: Mapped[int] = mapped_column(Integer)
    affected_roads: Mapped[list] = mapped_column(JSON, default=list)
    predicted_severity: Mapped[str] = mapped_column(String(10), default="medium")
    hours_before_surge: Mapped[float] = mapped_column(Float, default=2)
    reasoning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    module: Mapped[str] = mapped_column(String(50), default="global")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
class BudgetProject(Base):
    __tablename__ = "budget_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ward_id: Mapped[int] = mapped_column(Integer)
    project_name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(50))  # road_repair, water_pipeline, streetlight, drainage, park_maintenance
    allocated_amount: Mapped[float] = mapped_column(Float)  # in INR
    spent_amount: Mapped[float] = mapped_column(Float)  # in INR
    percent_complete: Mapped[float] = mapped_column(Float)  # 0-100
    start_date: Mapped[date] = mapped_column(Date)
    expected_end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active, completed, stalled, cancelled
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Gemma-generated summaries (cached to avoid repeated API calls)
    gemma_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gemma_summary_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    gemma_anomaly_flag: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # delayed, stalled, inconsistent, none
    gemma_anomaly_explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gemma_anomaly_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Data source tracking (real vs mock)
    data_source: Mapped[str] = mapped_column(String(50), default="mock")  # real_scraped, mock_realistic
    source_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    scraped_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)