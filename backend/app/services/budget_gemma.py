import asyncio
import json
from datetime import datetime, date
from typing import Optional
import httpx

from sqlalchemy.orm import Session
from app.config import settings
from app.models import BudgetProject, WaterComplaint


class BudgetGemmaService:
    """Gemma integration for budget project analysis and summarization."""
    
    def __init__(self):
        self.gemma_api_key = settings.gemma_api_key
        self.gemma_api_base_url = settings.gemma_api_base_url.rstrip("/")
        self.model_id = settings.gemma_model_id
    
    async def generate_project_summary(self, project: BudgetProject, db: Session) -> str:
        """
        Generate a plain-language summary for a budget project.
        Returns the summary string and updates the project in the database.
        """
        if not self.gemma_api_key or not self.gemma_api_base_url:
            # Fallback to rule-based summary
            summary = self._fallback_summary(project)
            project.gemma_summary = summary
            project.gemma_summary_generated_at = datetime.utcnow()
            return summary
        
        # Build prompt for plain-language summary
        today = date.today()
        days_overdue = None
        if project.percent_complete < 100 and project.expected_end_date < today:
            days_overdue = (today - project.expected_end_date).days
        
        # Get related complaints for context
        related_complaints = db.query(WaterComplaint).filter(
            WaterComplaint.ward_id == project.ward_id,
            WaterComplaint.status.in_(["open", "in_progress"])
        ).limit(5).all()
        
        # Format amount in crores if large
        allocated_cr = project.allocated_amount / 10000000  # Convert to crores
        allocated_str = f"₹{allocated_cr:.1f}Cr" if allocated_cr >= 1 else f"₹{project.allocated_amount:,}"
        
        system_prompt = """You are CityPulse AI, a civic transparency assistant. 
        Generate a 1-2 sentence plain-language summary of this municipal budget project. 
        Focus on: allocated amount, current completion %, timeline status, and any notable issues.
        Be factual, concise, and helpful for citizens understanding public spending."""
        
        user_prompt = f"""Budget Project: {project.project_name}
        Ward: {project.ward_id}
        Category: {project.category}
        Allocated: {allocated_str}
        Spent: ₹{project.spent_amount:,}
        Completion: {project.percent_complete}%
        Started: {project.start_date}
        Expected end: {project.expected_end_date}
        Status: {project.status}
        {'Days overdue: ' + str(days_overdue) if days_overdue else 'On schedule'}
        
        Recent related complaints in this ward: {len(related_complaints)} open/in-progress complaints
        
        Generate a plain-language summary (1-2 sentences):"""
        
        summary = await self._call_gemma(system_prompt, user_prompt)
        if summary:
            project.gemma_summary = summary
            project.gemma_summary_generated_at = datetime.utcnow()
        
        return summary or self._fallback_summary(project)
    
    async def detect_anomalies(self, project: BudgetProject) -> tuple[str, str]:
        """
        Detect and explain anomalies in a budget project.
        Returns (flag, explanation) tuple.
        """
        if not self.gemma_api_key or not self.gemma_api_base_url:
            # Fallback to rule-based anomaly detection
            flag, explanation = self._fallback_anomaly_detection(project)
            project.gemma_anomaly_flag = flag
            project.gemma_anomaly_explanation = explanation
            project.gemma_anomaly_generated_at = datetime.utcnow()
            return flag, explanation
        
        today = date.today()
        
        system_prompt = """You are CityPulse AI, a civic transparency assistant analyzing municipal budget projects for anomalies.
        Analyze this project data and flag if it shows any of these patterns:
        1. STALLED: % complete hasn't changed in a long time (check last_updated)
        2. DELAYED: Current date > expected_end_date and % complete < 100
        3. INCONSISTENT: Spent amount is high (>70% of budget) but % complete is low (<30%) — this suggests overspending without progress
        4. OVER_BUDGET: Spent amount > allocated amount
        
        Return ONLY a JSON object with these fields:
        {
            "flag": "none" | "delayed" | "stalled" | "inconsistent" | "over_budget",
            "explanation": "Brief 1-2 sentence explanation in plain language for citizens"
        }"""
        
        user_prompt = f"""Project: {project.project_name} (Ward {project.ward_id})
        Allocated: ₹{project.allocated_amount:,}
        Spent: ₹{project.spent_amount:,}
        Spent % of budget: {round((project.spent_amount / project.allocated_amount) * 100, 1)}%
        Completion: {project.percent_complete}%
        Started: {project.start_date}
        Expected end: {project.expected_end_date}
        Today's date: {today}
        Last updated: {project.last_updated.date()}
        Status: {project.status}
        
        Analyze for anomalies:"""
        
        result = await self._call_gemma(system_prompt, user_prompt, json_mode=True)
        
        if result:
            try:
                data = json.loads(result)
                flag = data.get("flag", "none")
                explanation = data.get("explanation", "")
                
                # Also run rule-based detection as backup
                rule_flag, rule_explanation = self._fallback_anomaly_detection(project)
                
                # Use Gemma's flag if it found something, otherwise use rule-based
                if flag != "none":
                    project.gemma_anomaly_flag = flag
                    project.gemma_anomaly_explanation = explanation
                else:
                    project.gemma_anomaly_flag = rule_flag
                    project.gemma_anomaly_explanation = rule_explanation
                
                project.gemma_anomaly_generated_at = datetime.utcnow()
                return project.gemma_anomaly_flag, project.gemma_anomaly_explanation
                
            except json.JSONDecodeError:
                pass
        
        # Fallback if Gemma call fails
        flag, explanation = self._fallback_anomaly_detection(project)
        project.gemma_anomaly_flag = flag
        project.gemma_anomaly_explanation = explanation
        project.gemma_anomaly_generated_at = datetime.utcnow()
        return flag, explanation
    
    async def generate_promise_vs_reality(self, project: BudgetProject, db: Session) -> str:
        """
        Generate a promise vs reality narrative by cross-referencing project timeline with complaints.
        """
        # Get complaints related to this project type in the same ward
        category_keywords = {
            "road_repair": ["pothole", "road", "repair", "asphalt", "resurfacing"],
            "water_pipeline": ["water", "pipe", "leak", "supply", "pressure"],
            "streetlight": ["light", "streetlight", "dark", "illumination"],
            "drainage": ["drain", "waterlogging", "flood", "sewage"],
            "park_maintenance": ["park", "garden", "maintenance", "clean"]
        }
        
        keywords = category_keywords.get(project.category, [])
        
        complaints_query = db.query(WaterComplaint).filter(
            WaterComplaint.ward_id == project.ward_id,
            WaterComplaint.status.in_(["open", "in_progress"])
        )
        
        # Filter by keywords if available
        if keywords:
            import sqlalchemy as sa
            conditions = [WaterComplaint.description.ilike(f"%{kw}%") for kw in keywords]
            complaints_query = complaints_query.filter(sa.or_(*conditions))
        
        complaints = complaints_query.limit(10).all()
        
        if not self.gemma_api_key or not self.gemma_api_base_url:
            # Fallback narrative
            return self._fallback_promise_vs_reality(project, complaints)
        
        system_prompt = """You are CityPulse AI, a civic transparency assistant.
        Generate a "Promise vs Reality" narrative comparing official project promises with citizen-reported issues.
        Focus on: what was promised (timeline, outcomes) vs what citizens are actually experiencing (complaints).
        Be factual and highlight any gaps between official progress and ground reality."""
        
        user_prompt = f"""Project Promise:
        Name: {project.project_name}
        Ward: {project.ward_id}
        Category: {project.category}
        Promised completion: {project.expected_end_date}
        Current completion: {project.percent_complete}%
        Current status: {project.status}
        
        Citizen Reality (recent complaints):
        {len(complaints)} related complaints in this ward:
        {chr(10).join(f'- {c.type}: {c.description[:100]}...' for c in complaints[:3])}
        
        Generate a brief "Promise vs Reality" narrative (2-3 sentences):"""
        
        narrative = await self._call_gemma(system_prompt, user_prompt)
        return narrative or self._fallback_promise_vs_reality(project, complaints)
    
    async def _call_gemma(self, system_prompt: str, user_prompt: str, json_mode: bool = False) -> Optional[str]:
        """Call Gemma API with proper timeout and error handling."""
        url = f"{self.gemma_api_base_url}/chat/completions"
        
        payload = {
            "model": self.model_id,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 1024,
        }
        
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        
        headers = {
            "Authorization": f"Bearer {self.gemma_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3010",
            "X-Title": "CityPulse AI - Budget Watch",
        }
        
        # Log request (masked key)
        masked_key = self.gemma_api_key[:10] + "..."
        print(f"[BudgetGemma] Calling {url}")
        print(f"[BudgetGemma] Model: {self.model_id}")
        print(f"[BudgetGemma] Key: {masked_key}")
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                print(f"[BudgetGemma] Response status: {resp.status_code}")
                
                if resp.status_code != 200:
                    print(f"[BudgetGemma] Error response: {resp.text[:200]}")
                    return None
                
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                print(f"[BudgetGemma] Success - response length: {len(content)}")
                return content
                
        except httpx.TimeoutException:
            print(f"[BudgetGemma] TIMEOUT: Request to {url} timed out after 30s")
            return None
        except Exception as e:
            print(f"[BudgetGemma] Exception: {type(e).__name__}: {e}")
            return None
    
    def _fallback_summary(self, project: BudgetProject) -> str:
        """Rule-based fallback for project summary."""
        today = date.today()
        allocated_cr = project.allocated_amount / 10000000
        
        if allocated_cr >= 1:
            amount_str = f"₹{allocated_cr:.1f}Cr"
        else:
            amount_str = f"₹{int(project.allocated_amount):,}"
        
        if project.percent_complete < 100 and project.expected_end_date < today:
            days_overdue = (today - project.expected_end_date).days
            return f"{amount_str} allocated to Ward {project.ward_id} {project.category.replace('_', ' ')} project, marked {project.percent_complete}% complete, {days_overdue} days overdue."
        elif project.percent_complete == 100:
            return f"{amount_str} {project.category.replace('_', ' ')} project in Ward {project.ward_id} completed on schedule."
        else:
            return f"{amount_str} allocated to Ward {project.ward_id} {project.category.replace('_', ' ')} project, {project.percent_complete}% complete, on track for completion."
    
    def _fallback_anomaly_detection(self, project: BudgetProject) -> tuple[str, str]:
        """Rule-based anomaly detection."""
        today = date.today()
        
        # Check for over budget
        if project.spent_amount > project.allocated_amount:
            overspent = project.spent_amount - project.allocated_amount
            return "over_budget", f"Project has overspent by ₹{overspent:,.0f} beyond allocated budget."
        
        # Check for delay
        if project.percent_complete < 100 and project.expected_end_date < today:
            days_overdue = (today - project.expected_end_date).days
            return "delayed", f"Project is {days_overdue} days overdue with only {project.percent_complete}% complete."
        
        # Check for inconsistency (high spend, low progress)
        spend_ratio = (project.spent_amount / project.allocated_amount) * 100
        if spend_ratio > 70 and project.percent_complete < 30:
            return "inconsistent", f"₹{project.spent_amount:,.0f} spent ({(spend_ratio):.1f}% of budget) but only {project.percent_complete}% complete — suggests overspending without progress."
        
        # Check for stalled (no recent updates)
        days_since_update = (today - project.last_updated.date()).days
        if days_since_update > 90 and project.percent_complete < 100:
            return "stalled", f"No updates for {days_since_update} days while project is {project.percent_complete}% complete — may be stalled."
        
        return "none", ""
    
    def _fallback_promise_vs_reality(self, project: BudgetProject, complaints: list) -> str:
        """Rule-based promise vs reality narrative."""
        today = date.today()
        
        if project.percent_complete < 100 and project.expected_end_date < today:
            days_overdue = (today - project.expected_end_date).days
            base = f"Promised completion by {project.expected_end_date}, but {days_overdue} days overdue with only {project.percent_complete}% complete."
        else:
            base = f"Promised completion by {project.expected_end_date}, currently {project.percent_complete}% complete."
        
        if complaints:
            complaint_types = ", ".join(set(c.type for c in complaints[:3]))
            return f"{base} Reality: {len(complaints)} open complaints about {complaint_types} in this ward."
        else:
            return f"{base} No recent complaints reported in this ward."