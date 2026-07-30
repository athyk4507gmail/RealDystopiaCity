from fastapi import APIRouter
from pydantic import BaseModel

from app.services.gemma import gemma

router = APIRouter(prefix="/api/gemma", tags=["gemma"])


class GemmaRequest(BaseModel):
    message: str
    system_prompt: str = "You are CityPulse AI, a helpful assistant."


class GemmaResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=GemmaResponse)
async def gemma_chat(data: GemmaRequest):
    """
    Generate a response using Gemma LLM.
    
    - **message**: User prompt
    - **system_prompt**: Optional system context (default: generic CityPulse AI)
    
    Returns:
    - **reply**: Generated response from Gemma
    
    Errors:
    - 500: If API key is not configured or LLM call fails
    """
    try:
        response = await gemma.generate(
            system_prompt=data.system_prompt,
            user_prompt=data.message,
            json_mode=False,
        )
        return GemmaResponse(reply=response)
    except Exception as e:
        error_msg = str(e) if str(e) else "Gemma API error"
        # Never expose raw API key or internal details
        if "GEMMA_API_KEY" in error_msg or "Authorization" in error_msg:
            error_msg = "Gemma API authentication failed. Check your GEMMA_API_KEY in backend/.env"
        return GemmaResponse(reply=f"Error: {error_msg}")
