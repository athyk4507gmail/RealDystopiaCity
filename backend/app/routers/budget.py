from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BudgetProject, WaterComplaint
from app.services.budget_gemma import BudgetGemmaService

router = APIRouter(prefix="/api/budget-watch", tags=["budget-watch"])

budget_gemma_service = BudgetGemmaService()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class BudgetProjectCreate(BaseModel):
    ward_id: int
    project_name: str
    category: str
    allocated_amount: float
    spent_amount: float
    percent_complete: float
    start_date: date
    expected_end_date: date
    status: str = "active"
    data_source: str = "mock_realistic"
    source_url: Optional[str] = None


class BudgetProjectResponse(BaseModel):
    id: int
    ward_id: int
    project_name: str
    category: str
    allocated_amount: float
    spent_amount: float
    percent_complete: float
    start_date: str
    expected_end_date: str
    status: str
    last_updated: str
    created_at: str
    gemma_summary: Optional[str] = None
    gemma_summary_generated_at: Optional[str] = None
    gemma_anomaly_flag: Optional[str] = None
    gemma_anomaly_explanation: Optional[str] = None
    gemma_anomaly_generated_at: Optional[str] = None
    data_source: str
    source_url: Optional[str] = None
    scraped_at: Optional[str] = None
    related_complaints: list = Field(default_factory=list)
    days_overdue: Optional[int] = None
    progress_since_last_update: Optional[float] = None


class BudgetSummaryResponse(BaseModel):
    total_projects: int
    total_allocated: float
    total_spent: float
    overall_completion_rate: float
    projects_delayed: int
    projects_flagged: int
    projects_stalled: int
    wards_covered: int
    average_delay_days: Optional[float] = None
    top_categories: list = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/projects", response_model=list[BudgetProjectResponse])
async def list_projects(
    ward_id: Optional[int] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    List all budget projects, optionally filtered by ward, category, or status.
    """
    query = db.query(BudgetProject)
    
    if ward_id:
        query = query.filter(BudgetProject.ward_id == ward_id)
    if category:
        query = query.filter(BudgetProject.category == category)
    if status:
        query = query.filter(BudgetProject.status == status)
    
    projects = query.order_by(BudgetProject.created_at.desc()).all()
    
    response = []
    today = date.today()
    
    for project in projects:
        # Calculate days overdue
        days_overdue = None
        if project.percent_complete < 100 and project.expected_end_date < today:
            days_overdue = (today - project.expected_end_date).days
        
        # Get related complaints for this ward
        related_complaints = db.query(WaterComplaint).filter(
            WaterComplaint.ward_id == project.ward_id,
            WaterComplaint.status.in_(["open", "in_progress"])
        ).limit(5).all()
        
        # Calculate progress since last update (simplified)
        progress_since_last_update = None
        if project.last_updated and project.last_updated.date() != today:
            # Simple mock: random 0-2% progress if updated > 7 days ago
            from random import uniform
            if (today - project.last_updated.date()).days > 7:
                progress_since_last_update = round(uniform(0, 2), 1)
        
        response.append(BudgetProjectResponse(
            id=project.id,
            ward_id=project.ward_id,
            project_name=project.project_name,
            category=project.category,
            allocated_amount=project.allocated_amount,
            spent_amount=project.spent_amount,
            percent_complete=project.percent_complete,
            start_date=project.start_date.isoformat(),
            expected_end_date=project.expected_end_date.isoformat(),
            status=project.status,
            last_updated=project.last_updated.isoformat(),
            created_at=project.created_at.isoformat(),
            gemma_summary=project.gemma_summary,
            gemma_summary_generated_at=project.gemma_summary_generated_at.isoformat() if project.gemma_summary_generated_at else None,
            gemma_anomaly_flag=project.gemma_anomaly_flag,
            gemma_anomaly_explanation=project.gemma_anomaly_explanation,
            gemma_anomaly_generated_at=project.gemma_anomaly_generated_at.isoformat() if project.gemma_anomaly_generated_at else None,
            data_source=project.data_source,
            source_url=project.source_url,
            scraped_at=project.scraped_at.isoformat() if project.scraped_at else None,
            related_complaints=[
                {
                    "id": c.id,
                    "type": c.type,
                    "description": c.description[:100] + "..." if len(c.description) > 100 else c.description,
                    "status": c.status,
                    "created_at": c.created_at.isoformat()
                }
                for c in related_complaints
            ],
            days_overdue=days_overdue,
            progress_since_last_update=progress_since_last_update
        ))
    
    return response


@router.get("/projects/{project_id}", response_model=BudgetProjectResponse)
async def get_project(
    project_id: int,
    db: Session = Depends(get_db),
):
    """
    Get detailed information about a single budget project.
    """
    project = db.query(BudgetProject).filter(BudgetProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Generate/update Gemma summaries if needed
    today = datetime.utcnow()
    if not project.gemma_summary or (today - project.gemma_summary_generated_at).days > 7:
        await budget_gemma_service.generate_project_summary(project, db)
    
    if not project.gemma_anomaly_flag or (today - project.gemma_anomaly_generated_at).days > 7:
        await budget_gemma_service.detect_anomalies(project)
    
    # Calculate days overdue
    today_date = date.today()
    days_overdue = None
    if project.percent_complete < 100 and project.expected_end_date < today_date:
        days_overdue = (today_date - project.expected_end_date).days
    
    # Get related complaints
    related_complaints = db.query(WaterComplaint).filter(
        WaterComplaint.ward_id == project.ward_id,
        WaterComplaint.status.in_(["open", "in_progress"])
    ).limit(10).all()
    
    return BudgetProjectResponse(
        id=project.id,
        ward_id=project.ward_id,
        project_name=project.project_name,
        category=project.category,
        allocated_amount=project.allocated_amount,
        spent_amount=project.spent_amount,
        percent_complete=project.percent_complete,
        start_date=project.start_date.isoformat(),
        expected_end_date=project.expected_end_date.isoformat(),
        status=project.status,
        last_updated=project.last_updated.isoformat(),
        created_at=project.created_at.isoformat(),
        gemma_summary=project.gemma_summary,
        gemma_summary_generated_at=project.gemma_summary_generated_at.isoformat() if project.gemma_summary_generated_at else None,
        gemma_anomaly_flag=project.gemma_anomaly_flag,
        gemma_anomaly_explanation=project.gemma_anomaly_explanation,
        gemma_anomaly_generated_at=project.gemma_anomaly_generated_at.isoformat() if project.gemma_anomaly_generated_at else None,
        data_source=project.data_source,
        source_url=project.source_url,
        scraped_at=project.scraped_at.isoformat() if project.scraped_at else None,
        related_complaints=[
            {
                "id": c.id,
                "type": c.type,
                "description": c.description,
                "status": c.status,
                "created_at": c.created_at.isoformat()
            }
            for c in related_complaints
        ],
        days_overdue=days_overdue,
        progress_since_last_update=None
    )


@router.post("/projects/{project_id}/regenerate-summary", response_model=BudgetProjectResponse)
async def regenerate_summary(
    project_id: int,
    db: Session = Depends(get_db),
):
    """
    Manually trigger Gemma re-summarization for a project.
    """
    project = db.query(BudgetProject).filter(BudgetProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Generate new summaries
    await budget_gemma_service.generate_project_summary(project, db)
    await budget_gemma_service.detect_anomalies(project)
    
    db.commit()
    db.refresh(project)
    
    # Get updated project with related complaints
    related_complaints = db.query(WaterComplaint).filter(
        WaterComplaint.ward_id == project.ward_id,
        WaterComplaint.status.in_(["open", "in_progress"])
    ).limit(10).all()
    
    return BudgetProjectResponse(
        id=project.id,
        ward_id=project.ward_id,
        project_name=project.project_name,
        category=project.category,
        allocated_amount=project.allocated_amount,
        spent_amount=project.spent_amount,
        percent_complete=project.percent_complete,
        start_date=project.start_date.isoformat(),
        expected_end_date=project.expected_end_date.isoformat(),
        status=project.status,
        last_updated=project.last_updated.isoformat(),
        created_at=project.created_at.isoformat(),
        gemma_summary=project.gemma_summary,
        gemma_summary_generated_at=project.gemma_summary_generated_at.isoformat() if project.gemma_summary_generated_at else None,
        gemma_anomaly_flag=project.gemma_anomaly_flag,
        gemma_anomaly_explanation=project.gemma_anomaly_explanation,
        gemma_anomaly_generated_at=project.gemma_anomaly_generated_at.isoformat() if project.gemma_anomaly_generated_at else None,
        data_source=project.data_source,
        source_url=project.source_url,
        scraped_at=project.scraped_at.isoformat() if project.scraped_at else None,
        related_complaints=[
            {
                "id": c.id,
                "type": c.type,
                "description": c.description,
                "status": c.status,
                "created_at": c.created_at.isoformat()
            }
            for c in related_complaints
        ],
        days_overdue=None,
        progress_since_last_update=None
    )


@router.get("/summary", response_model=BudgetSummaryResponse)
async def get_summary(db: Session = Depends(get_db)):
    """
    Get aggregate statistics for all budget projects.
    """
    projects = db.query(BudgetProject).all()
    today = date.today()
    
    if not projects:
        return BudgetSummaryResponse(
            total_projects=0,
            total_allocated=0,
            total_spent=0,
            overall_completion_rate=0,
            projects_delayed=0,
            projects_flagged=0,
            projects_stalled=0,
            wards_covered=0,
            average_delay_days=0,
            top_categories=[]
        )
    
    total_allocated = sum(p.allocated_amount for p in projects)
    total_spent = sum(p.spent_amount for p in projects)
    overall_completion_rate = sum(p.percent_complete for p in projects) / len(projects)
    
    # Count projects by status
    projects_delayed = sum(
        1 for p in projects 
        if p.percent_complete < 100 and p.expected_end_date < today
    )
    projects_flagged = sum(1 for p in projects if p.gemma_anomaly_flag and p.gemma_anomaly_flag != "none")
    projects_stalled = sum(
        1 for p in projects 
        if p.status == "stalled" or (
            p.percent_complete < 100 and 
            (today - p.last_updated.date()).days > 90  # No progress for 90 days
        )
    )
    
    # Calculate wards covered
    wards_covered = len(set(p.ward_id for p in projects))
    
    # Calculate average delay for delayed projects
    delayed_days = [
        (today - p.expected_end_date).days 
        for p in projects 
        if p.percent_complete < 100 and p.expected_end_date < today
    ]
    average_delay_days = sum(delayed_days) / len(delayed_days) if delayed_days else 0
    
    # Top categories
    from collections import Counter
    category_counts = Counter(p.category for p in projects)
    top_categories = [
        {"category": cat, "count": count, "total_allocated": sum(p.allocated_amount for p in projects if p.category == cat)}
        for cat, count in category_counts.most_common(5)
    ]
    
    return BudgetSummaryResponse(
        total_projects=len(projects),
        total_allocated=total_allocated,
        total_spent=total_spent,
        overall_completion_rate=round(overall_completion_rate, 1),
        projects_delayed=projects_delayed,
        projects_flagged=projects_flagged,
        projects_stalled=projects_stalled,
        wards_covered=wards_covered,
        average_delay_days=round(average_delay_days, 1) if delayed_days else None,
        top_categories=top_categories
    )