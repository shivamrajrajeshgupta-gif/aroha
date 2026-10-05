from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Header,
    HTTPException,
)
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client
from pypdf import PdfReader
from docx import Document
import asyncio
import os
import io

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY"
)

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
)

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
@app.post("/documents/extract-text")
async def extract_text(file: UploadFile = File(...)):
    if file.content_type != "text/plain":
        return {
            "error": "For now, only TXT files are supported."
        }

    file_content = await file.read()

    text = file_content.decode(
        "utf-8",
        errors="replace"
    )

    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "text": text,
        "characters": len(text),
    }

def get_bearer_token(
    authorization: str | None
):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Missing authorization token.",
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization format.",
        )

    return authorization.split(
        " ",
        1
    )[1]

def extract_document_text(
    file_content: bytes,
    mime_type: str | None,
):
    if mime_type == "text/plain":
        return file_content.decode(
            "utf-8",
            errors="replace",
        )

    if mime_type == "application/pdf":
        pdf_file = io.BytesIO(file_content)
        reader = PdfReader(pdf_file)

        pages = []

        for page in reader.pages:
            page_text = page.extract_text() or ""
            pages.append(page_text)

        return "\n\n".join(pages)

    if mime_type == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ):
        docx_file = io.BytesIO(file_content)
        document = Document(docx_file)

        paragraphs = []

        for paragraph in document.paragraphs:
            if paragraph.text.strip():
                paragraphs.append(
                    paragraph.text
                )

        return "\n\n".join(paragraphs)

    raise ValueError(
        "Unsupported document type."
    )

@app.post("/documents/{document_id}/extract")
async def extract_stored_document(
    document_id: str,
    authorization: str | None = Header(default=None),
):
    access_token = get_bearer_token(
        authorization
    )

    # Verify the logged-in user
    try:
        user_response = supabase.auth.get_user(
            access_token
        )
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token.",
        )

    user = user_response.user

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Could not identify the user.",
        )

    # Find the document belonging to this user
    document_response = (
        supabase
        .table("documents")
        .select(
            "id,name,storage_path,mime_type,user_id"
        )
        .eq("id", document_id)
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )

    if not document_response.data:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    document = document_response.data[0]

    # Download the file from private Storage
    try:
        file_content = (
            supabase
            .storage
            .from_("documents")
            .download(
                document["storage_path"]
            )
        )
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Could not download the document.",
        )

    # TXT extraction for now
    try:
        text = extract_document_text(
            file_content,
            document["mime_type"],
        )
    except ValueError as extraction_error:
        return {
            "filename": document["name"],
            "error": str(extraction_error),
        }
    except Exception as extraction_error:
        print(
            "Document extraction failed:",
            extraction_error,
        )

        raise HTTPException(
            status_code=500,
            detail="Could not extract text from the document.",
        )

    return {
         "id": document["id"],
        "filename": document["name"],
        "content_type": document["mime_type"],
        "text": text,
        "characters": len(text),
    }