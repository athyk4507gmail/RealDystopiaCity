"""Civic Agent API — function-calling Gemma over real backend tools."""

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.agent_loop import run_agent

router = APIRouter(prefix="/api/agent", tags=["agent"])


class HistoryMessage(BaseModel):
    role: str
    content: str


class AgentChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: Optional[list[HistoryMessage]] = None
    role: Optional[str] = None


def _public_result(result: dict) -> dict:
    return {
        "answer": result["answer"],
        "trace": result["trace"],
        "steps_used": result["steps_used"],
        "truncated": result.get("truncated", False),
        "timing": result.get("timing"),
        "suggested_department": result.get("suggested_department"),
    }


@router.post("/chat")
async def agent_chat(data: AgentChatRequest, db: Session = Depends(get_db)):
    history = [{"role": h.role, "content": h.content} for h in (data.history or [])]
    result = await run_agent(db, data.message.strip(), history=history, role=data.role)
    return _public_result(result)


@router.post("/chat/stream")
async def agent_chat_stream(data: AgentChatRequest, db: Session = Depends(get_db)):
    """SSE stream: progress events then a final `done` event with the full result."""
    history = [{"role": h.role, "content": h.content} for h in (data.history or [])]
    queue: asyncio.Queue = asyncio.Queue()

    async def on_progress(payload: dict) -> None:
        await queue.put({"type": "progress", **payload})

    async def runner() -> None:
        try:
            result = await run_agent(
                db,
                data.message.strip(),
                history=history,
                progress=on_progress,
                role=data.role,
            )
            await queue.put({"type": "done", **_public_result(result)})
        except Exception as exc:
            await queue.put({"type": "error", "message": str(exc)})

    async def event_gen():
        task = asyncio.create_task(runner())
        try:
            while True:
                item = await queue.get()
                yield f"data: {json.dumps(item, default=str)}\n\n"
                if item.get("type") in ("done", "error"):
                    break
        finally:
            await task

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
