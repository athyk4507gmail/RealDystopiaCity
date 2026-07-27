from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    module: str = "global"


@router.post("/")
async def send_message(data: ChatRequest, db: Session = Depends(get_db)):
    return await chat.chat(data.message, data.module, db)
