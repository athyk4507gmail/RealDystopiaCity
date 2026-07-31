import asyncio
from app.services.gemma import GemmaService

async def test():
    gemma = GemmaService()
    response = await gemma.generate(
        system_prompt="You are a helpful assistant.",
        user_prompt="Reply with exactly: CONNECTION OK"
    )
    print("RAW RESPONSE:", response)

asyncio.run(test())
