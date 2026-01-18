from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import os
import json
import re
import io

import httpx
import PyPDF2
from docx import Document
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


@dataclass
class Chunk:
    text: str
    document_name: str
    course_name: str
    chunk_index: int


class RAGService:
    def __init__(self, store_path: Optional[str] = None):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        default_store = os.path.join(base_dir, "data", "rag_store.json")
        self.store_path = store_path or default_store
        os.makedirs(os.path.dirname(self.store_path), exist_ok=True)
        self._store: Dict[str, List[Chunk]] = {}
        self._vectorizers: Dict[str, TfidfVectorizer] = {}
        self._matrices: Dict[str, object] = {}
        self._load()

    def _load(self) -> None:
        if not os.path.exists(self.store_path):
            return
        try:
            with open(self.store_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            for user_id, chunks in raw.items():
                self._store[user_id] = [
                    Chunk(
                        text=c["text"],
                        document_name=c["document_name"],
                        course_name=c["course_name"],
                        chunk_index=int(c["chunk_index"]),
                    )
                    for c in chunks
                ]
        except Exception:
            self._store = {}

    def _persist(self) -> None:
        raw: Dict[str, List[dict]] = {}
        for user_id, chunks in self._store.items():
            raw[user_id] = [
                {
                    "text": c.text,
                    "document_name": c.document_name,
                    "course_name": c.course_name,
                    "chunk_index": c.chunk_index,
                }
                for c in chunks
            ]
        with open(self.store_path, "w", encoding="utf-8") as f:
            json.dump(raw, f)

    def _normalize_text(self, text: str) -> str:
        text = text.replace("\u0000", " ")
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def _chunk_text(self, text: str, chunk_size: int = 1200, overlap: int = 200) -> List[str]:
        text = self._normalize_text(text)
        if not text:
            return []
        chunks: List[str] = []
        i = 0
        while i < len(text):
            end = min(i + chunk_size, len(text))
            chunk = text[i:end]
            chunks.append(chunk)
            if end == len(text):
                break
            i = max(0, end - overlap)
        return chunks

    async def _download_pdf(self, pdf_url: str) -> bytes:
        async with httpx.AsyncClient(follow_redirects=True, timeout=45.0) as client:
            resp = await client.get(pdf_url)
            resp.raise_for_status()
            return resp.content

    def _extract_text_from_pdf_bytes(self, pdf_bytes: bytes) -> str:
        reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
        parts: List[str] = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                parts.append("")
        return "\n".join(parts)

    def _extract_text_from_docx_bytes(self, docx_bytes: bytes) -> str:
        """Extract text from Word document bytes"""
        try:
            doc = Document(io.BytesIO(docx_bytes))
            return "\n".join([para.text for para in doc.paragraphs])
        except Exception as e:
            return f"Error extracting Word document: {str(e)}"

    def _rebuild_index(self, user_id: str) -> None:
        chunks = self._store.get(user_id, [])
        if not chunks:
            self._vectorizers.pop(user_id, None)
            self._matrices.pop(user_id, None)
            return
        vectorizer = TfidfVectorizer(stop_words="english", max_features=5000)
        matrix = vectorizer.fit_transform([c.text for c in chunks])
        self._vectorizers[user_id] = vectorizer
        self._matrices[user_id] = matrix

    async def index_pdf_from_url(
        self,
        pdf_url: str,
        user_id: str,
        course_name: str,
        document_name: str,
    ) -> dict:
        pdf_bytes = await self._download_pdf(pdf_url)
        text = self._extract_text_from_pdf_bytes(pdf_bytes)
        return await self.index_document(
            text_content=text,
            user_id=user_id,
            course_name=course_name,
            document_name=document_name,
        )

    async def index_pdf_bytes(
        self,
        pdf_bytes: bytes,
        user_id: str,
        course_name: str,
        document_name: str,
    ) -> dict:
        text = self._extract_text_from_pdf_bytes(pdf_bytes)
        return await self.index_document(
            text_content=text,
            user_id=user_id,
            course_name=course_name,
            document_name=document_name,
        )

    async def index_docx_bytes(
        self,
        docx_bytes: bytes,
        user_id: str,
        course_name: str,
        document_name: str,
    ) -> dict:
        text = self._extract_text_from_docx_bytes(docx_bytes)
        return await self.index_document(
            text_content=text,
            user_id=user_id,
            course_name=course_name,
            document_name=document_name,
        )

    async def index_file_bytes(
        self,
        file_bytes: bytes,
        file_name: str,
        user_id: str,
        course_name: str,
        document_name: str,
    ) -> dict:
        """Index file bytes - auto-detects PDF or Word based on filename"""
        lower_name = file_name.lower()
        if lower_name.endswith('.pdf'):
            return await self.index_pdf_bytes(file_bytes, user_id, course_name, document_name)
        elif lower_name.endswith('.docx') or lower_name.endswith('.doc'):
            return await self.index_docx_bytes(file_bytes, user_id, course_name, document_name)
        else:
            return {"success": False, "chunks_indexed": 0, "error": f"Unsupported file type: {file_name}"}

    async def index_document(
        self,
        text_content: str,
        user_id: str,
        course_name: str,
        document_name: str,
    ) -> dict:
        new_chunks = self._chunk_text(text_content)
        if not new_chunks:
            return {"success": False, "chunks_indexed": 0, "error": "No text extracted"}

        existing = self._store.get(user_id, [])
        existing = [
            c
            for c in existing
            if not (c.document_name == document_name and c.course_name == course_name)
        ]

        chunks: List[Chunk] = []
        for idx, chunk_text in enumerate(new_chunks):
            chunks.append(
                Chunk(
                    text=chunk_text,
                    document_name=document_name,
                    course_name=course_name,
                    chunk_index=idx,
                )
            )

        self._store[user_id] = existing + chunks
        self._persist()
        self._rebuild_index(user_id)
        return {"success": True, "chunks_indexed": len(chunks)}

    async def get_user_documents(self, user_id: str) -> List[dict]:
        chunks = self._store.get(user_id, [])
        stats: Dict[Tuple[str, str], int] = {}
        for c in chunks:
            key = (c.document_name, c.course_name)
            stats[key] = stats.get(key, 0) + 1
        return [
            {
                "document_name": doc,
                "course_name": course,
                "chunk_count": count,
            }
            for (doc, course), count in sorted(stats.items(), key=lambda x: (x[0][1], x[0][0]))
        ]

    async def delete_document(self, user_id: str, document_name: str, course_name: Optional[str] = None) -> bool:
        chunks = self._store.get(user_id, [])
        if course_name:
            new_chunks = [c for c in chunks if not (c.document_name == document_name and c.course_name == course_name)]
        else:
            new_chunks = [c for c in chunks if c.document_name != document_name]
        if len(new_chunks) == len(chunks):
            return False
        self._store[user_id] = new_chunks
        self._persist()
        self._rebuild_index(user_id)
        return True

    async def clear_user_data(self, user_id: str) -> int:
        count = len(self._store.get(user_id, []))
        self._store[user_id] = []
        self._persist()
        self._rebuild_index(user_id)
        return count

    async def retrieve(
        self,
        user_id: str,
        query: str,
        top_k: int = 5,
        course_filter: Optional[str] = None,
    ) -> List[Chunk]:
        chunks = self._store.get(user_id, [])
        if not chunks:
            return []

        if course_filter:
            filtered = [c for c in chunks if c.course_name.lower() == course_filter.lower()]
        else:
            filtered = chunks

        if not filtered:
            return []

        if user_id not in self._vectorizers or user_id not in self._matrices:
            self._rebuild_index(user_id)

        vectorizer = self._vectorizers.get(user_id)
        matrix = self._matrices.get(user_id)
        if vectorizer is None or matrix is None:
            return []

        q_vec = vectorizer.transform([query])
        sims = cosine_similarity(q_vec, matrix).flatten()
        ranked = sorted(range(len(chunks)), key=lambda i: float(sims[i]), reverse=True)

        results: List[Chunk] = []
        for idx in ranked:
            c = chunks[idx]
            if course_filter and c.course_name.lower() != course_filter.lower():
                continue
            if float(sims[idx]) <= 0:
                continue
            results.append(c)
            if len(results) >= top_k:
                break
        return results


_rag_service_instance = None

def get_rag_service() -> RAGService:
    global _rag_service_instance
    if _rag_service_instance is None:
        _rag_service_instance = RAGService()
    return _rag_service_instance
