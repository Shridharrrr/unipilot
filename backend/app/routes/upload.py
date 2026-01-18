"""File upload endpoint for PDF and Word document uploads"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.routes.auth import get_current_user
from app.services.rag_service import get_rag_service

router = APIRouter(prefix="/chat", tags=["chat"])

rag_service = get_rag_service()

# Supported file extensions
SUPPORTED_EXTENSIONS = {'.pdf', '.docx', '.doc'}


def _get_user_id(user: dict) -> str:
    return user.get("id") or user.get("uid") or "unknown"


def _is_supported_file(filename: str) -> bool:
    """Check if the file extension is supported"""
    lower_name = filename.lower()
    return any(lower_name.endswith(ext) for ext in SUPPORTED_EXTENSIONS)


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    course_name: str = Form(...),
    document_name: str = Form(None),
    user: dict = Depends(get_current_user),
):
    """
    Upload a PDF or Word file directly and index it for RAG.
    
    Args:
        file: PDF or Word file to upload (.pdf, .docx, .doc)
        course_name: Name of the course this document belongs to
        document_name: Optional custom name for the document (defaults to filename)
        user: Current authenticated user
        
    Returns:
        Success status, chunks indexed, and document details
    """
    user_id = _get_user_id(user)
    
    # Validate file type
    if not _is_supported_file(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF and Word files (.pdf, .docx, .doc) are supported"
        )
    
    # Validate file size (50MB limit)
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > 50:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size ({file_size_mb:.1f}MB) exceeds 50MB limit"
        )
    
    try:
        # Use provided document name or fall back to filename
        doc_name = document_name or file.filename
        
        # Index the file bytes (auto-detects type based on extension)
        result = await rag_service.index_file_bytes(
            file_bytes=content,
            file_name=file.filename,
            user_id=user_id,
            course_name=course_name,
            document_name=doc_name,
        )
        
        if not result.get('success'):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get('error', 'Failed to index document')
            )
        
        return {
            "success": True,
            "chunks_indexed": result.get('chunks_indexed', 0),
            "document_name": doc_name,
            "course_name": course_name,
            "file_size_mb": round(file_size_mb, 2),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process document: {str(e)}"
        )
