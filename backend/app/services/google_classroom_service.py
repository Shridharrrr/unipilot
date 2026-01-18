from datetime import datetime
from typing import Any, Dict, List, Optional

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload
import io


class GoogleClassroomService:
    SCOPES = [
        "https://www.googleapis.com/auth/classroom.courses.readonly",
        "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
    ]

    def __init__(self, client_id: str, client_secret: str, redirect_uri: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri

    def get_authorization_url(self, state: str) -> str:
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [self.redirect_uri],
                }
            },
            scopes=self.SCOPES,
            redirect_uri=self.redirect_uri,
        )

        authorization_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            state=state,
            prompt="consent",
        )

        return authorization_url

    def exchange_code_for_tokens(self, code: str) -> Dict[str, Any]:
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [self.redirect_uri],
                }
            },
            scopes=self.SCOPES,
            redirect_uri=self.redirect_uri,
        )

        flow.fetch_token(code=code)
        credentials = flow.credentials

        return {
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_expiry": credentials.expiry.isoformat() if credentials.expiry else None,
            "scopes": credentials.scopes,
        }

    def _credentials_from_tokens(self, tokens: Dict[str, Any]) -> Credentials:
        expiry = None
        token_expiry = tokens.get("token_expiry")
        if token_expiry:
            try:
                expiry = datetime.fromisoformat(token_expiry.replace("Z", "+00:00"))
            except Exception:
                expiry = None

        return Credentials(
            token=tokens.get("access_token"),
            refresh_token=tokens.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=self.client_id,
            client_secret=self.client_secret,
            scopes=self.SCOPES,
            expiry=expiry,
        )

    def get_classroom_service(self, tokens: Dict[str, Any]):
        creds = self._credentials_from_tokens(tokens)
        return build("classroom", "v1", credentials=creds)

    def get_drive_service(self, tokens: Dict[str, Any]):
        creds = self._credentials_from_tokens(tokens)
        return build("drive", "v3", credentials=creds)

    def list_courses(self, classroom_service, page_size: int = 100) -> List[Dict[str, Any]]:
        courses: List[Dict[str, Any]] = []
        page_token = None
        while True:
            resp = (
                classroom_service.courses()
                .list(pageSize=page_size, courseStates=["ACTIVE"], pageToken=page_token)
                .execute()
            )
            courses.extend(resp.get("courses", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        return courses

    def get_course(self, classroom_service, course_id: str) -> Dict[str, Any]:
        return classroom_service.courses().get(id=course_id).execute()

    def list_coursework_materials(self, classroom_service, course_id: str, page_size: int = 100) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        page_token = None
        while True:
            resp = (
                classroom_service.courses()
                .courseWorkMaterials()
                .list(courseId=course_id, pageSize=page_size, pageToken=page_token)
                .execute()
            )
            items.extend(resp.get("courseWorkMaterial", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        return items

    def get_drive_file_metadata(self, drive_service, file_id: str) -> Dict[str, Any]:
        return drive_service.files().get(fileId=file_id, fields="id,name,mimeType").execute()

    def download_drive_file(self, drive_service, file_id: str) -> bytes:
        request = drive_service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)

        done = False
        while not done:
            _, done = downloader.next_chunk()

        return fh.getvalue()

    @staticmethod
    def is_supported_file(name: Optional[str], mime_type: Optional[str]) -> bool:
        """Check if the file is a supported document type (PDF or Word)"""
        supported_mimes = {
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
            "application/msword",  # .doc
        }
        if mime_type in supported_mimes:
            return True
        if name:
            lower_name = name.lower()
            if lower_name.endswith(('.pdf', '.docx', '.doc')):
                return True
        return False

    @staticmethod
    def is_pdf_file(name: Optional[str], mime_type: Optional[str]) -> bool:
        """Check if the file is a PDF (kept for backward compatibility)"""
        if mime_type == "application/pdf":
            return True
        if name and name.lower().endswith(".pdf"):
            return True
        return False

    @staticmethod
    def extract_drive_file_ids(materials_item: Dict[str, Any]) -> List[Dict[str, str]]:
        results: List[Dict[str, str]] = []
        materials = materials_item.get("materials") or []
        for m in materials:
            drive_file = m.get("driveFile")
            if not drive_file:
                continue
            drive_file_obj = drive_file.get("driveFile") or {}
            file_id = drive_file_obj.get("id")
            title = drive_file_obj.get("title")
            if file_id:
                results.append({"id": file_id, "title": title or file_id})
        return results

    @staticmethod
    def safe_google_error(e: Exception) -> str:
        if isinstance(e, HttpError):
            try:
                return str(e)
            except Exception:
                return "Google API error"
        return str(e)
