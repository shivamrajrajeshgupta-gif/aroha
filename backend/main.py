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
from sentence_transformers import SentenceTransformer
import asyncio
import os
import io
import re

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY"
)

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
)
embedding_model = SentenceTransformer(
    "sentence-transformers/all-MiniLM-L6-v2"
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

def clean_document_text(text: str):
    # Normalize line endings
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    # Replace common non-breaking spaces
    text = text.replace("\u00a0", " ")

    # Remove null characters
    text = text.replace("\x00", "")

    # Clean excessive spaces while preserving paragraphs
    text = re.sub(
        r"[ \t]+",
        " ",
        text,
    )

    # Remove excessive blank lines
    text = re.sub(
        r"\n{3,}",
        "\n\n",
        text,
    )

    return text.strip()

def chunk_text(
    text: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 150,
):
    if not text.strip():
        return []

    if chunk_overlap >= chunk_size:
        raise ValueError(
            "Chunk overlap must be smaller than chunk size."
        )

    paragraphs = [
        paragraph.strip()
        for paragraph in text.split("\n\n")
        if paragraph.strip()
    ]

    chunks = []
    current_chunk = ""

    for paragraph in paragraphs:
        if len(paragraph) > chunk_size:
            if current_chunk:
                chunks.append(current_chunk)
                current_chunk = ""

            start = 0

            while start < len(paragraph):
                end = start + chunk_size

                chunk = paragraph[start:end].strip()

                if chunk:
                    chunks.append(chunk)

                start += chunk_size - chunk_overlap

            continue

        proposed_chunk = (
            f"{current_chunk}\n\n{paragraph}"
            if current_chunk
            else paragraph
        )

        if len(proposed_chunk) <= chunk_size:
            current_chunk = proposed_chunk
        else:
            if current_chunk:
                chunks.append(current_chunk)

            current_chunk = paragraph

    if current_chunk:
        chunks.append(current_chunk)

    return chunks

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

def generate_embedding(text: str):
    embedding = embedding_model.encode(
        text,
        normalize_embeddings=True,
    )

    return embedding.tolist()


@app.post("/documents/{document_id}/process")
async def process_document(
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

    # Find the document and verify ownership
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

    # Download the private document
    try:
        file_content = (
            supabase
            .storage
            .from_("documents")
            .download(
                document["storage_path"]
            )
        )
    except Exception as download_error:
        print(
            "Document download failed:",
            download_error,
        )

        raise HTTPException(
            status_code=500,
            detail="Could not download the document.",
        )

    # Extract text
    try:
        extracted_text = extract_document_text(
            file_content,
            document["mime_type"],
        )
    except ValueError as extraction_error:
        raise HTTPException(
            status_code=400,
            detail=str(extraction_error),
        )
    except Exception as extraction_error:
        print(
            "Document extraction failed:",
            extraction_error,
        )

        raise HTTPException(
            status_code=500,
            detail="Could not extract text from the document.",
        )

    # Clean the extracted text
    cleaned_text = clean_document_text(
        extracted_text
    )

    if not cleaned_text:
        raise HTTPException(
            status_code=400,
            detail="The document contains no extractable text.",
        )

    # Split the text into chunks
    chunks = chunk_text(
        cleaned_text,
        chunk_size=1000,
        chunk_overlap=150,
    )

    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="Could not create document chunks.",
        )

    # Remove previous chunks so re-processing
    # the same document does not create duplicates.
    try:
        (
            supabase
            .table("document_chunks")
            .delete()
            .eq("document_id", document["id"])
            .execute()
        )
    except Exception as delete_error:
        print(
            "Could not remove old chunks:",
            delete_error,
        )

        raise HTTPException(
            status_code=500,
            detail="Could not prepare document for processing.",
        )

    # Prepare database rows
    chunk_rows = []

    for index, chunk in enumerate(chunks):
        embedding = generate_embedding(chunk)

        chunk_rows.append(
            {
                "document_id": document["id"],
                "user_id": user.id,
                "chunk_index": index,
                "content": chunk,
                "char_count": len(chunk),
                "embedding": embedding,
            }
        )

    # Store the chunks
    try:
        (
            supabase
            .table("document_chunks")
            .insert(chunk_rows)
            .execute()
        )
    except Exception as insert_error:
        print(
            "Could not store document chunks:",
            insert_error,
        )

        raise HTTPException(
            status_code=500,
            detail="Could not store document chunks.",
        )

    return {
        "document_id": document["id"],
        "filename": document["name"],
        "chunks_created": len(chunks),
        "characters": len(cleaned_text),
        "status": "processed",
    }