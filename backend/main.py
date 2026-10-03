from fastapi import FastAPI
from pydantic import BaseModel
import asyncio

app = FastAPI(
    title="AROHA API",
    description="Backend API for the AROHA personal AI workspace.",
    version="0.1.0",
)


class ChatRequest(BaseModel):
    message: str


@app.get("/")
async def root():
    return {
        "name": "AROHA",
        "status": "online",
        "message": "AROHA API is running.",
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy"
    }


@app.post("/chat")
async def chat(request: ChatRequest):
    await asyncio.sleep(1.2)

    return {
        "message": (
            f"I received your message: \"{request.message}\". "
            "I'm currently running in local development mode. "
            "Once the AI provider is connected, I'll be able to "
            "give you a real AI-generated response."
        )
    }