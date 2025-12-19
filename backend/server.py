from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, Request, Body
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Any, Dict
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path
import os, uuid, logging, json
from datetime import datetime

from emails import (
    send_contact_notification,
    EmailDeliveryError,
    send_council_request_email,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# -----------------------------
# Mongo (OPTIONAL)
# -----------------------------
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "app_db")

mongo_client: Optional[AsyncIOMotorClient] = None
mongo_db = None


async def init_mongo():
    global mongo_client, mongo_db
    if not MONGO_URL:
        logging.info("Mongo disabled.")
        return
    try:
        mongo_client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
        await mongo_client.admin.command("ping")
        mongo_db = mongo_client[DB_NAME]
        logging.info("Mongo connected.")
    except Exception:
        logging.warning("Mongo unavailable. Continuing without DB.")
        mongo_client = None
        mongo_db = None


# -----------------------------
# App
# -----------------------------
app = FastAPI()
api_router = APIRouter(prefix="/api")


# -----------------------------
# Models
# -----------------------------
class ContactSubmission(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    phone: Optional[str] = None
    org: Optional[str] = None
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    status: str = "new"


class ContactSubmissionCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    org: Optional[str] = None
    message: str


class ContactResponse(BaseModel):
    status: str
    message: str
    id: str


# -----------------------------
# Startup / Shutdown
# -----------------------------
@app.on_event("startup")
async def on_startup():
    logging.basicConfig(level=logging.INFO)
    await init_mongo()


@app.on_event("shutdown")
async def shutdown():
    if mongo_client:
        mongo_client.close()


# -----------------------------
# Health
# -----------------------------
@api_router.get("/")
async def root():
    return {"message": "Aspire Executive Solutions API"}


# -----------------------------
# Contact form
# -----------------------------
@api_router.post("/contact", response_model=ContactResponse)
async def create_contact_submission(
    input: ContactSubmissionCreate,
    background_tasks: BackgroundTasks,
):
    contact = ContactSubmission(**input.model_dump())

    try:
        if mongo_db:
            await mongo_db.contact_submissions.insert_one(contact.model_dump())
    except Exception:
        logging.exception("Mongo insert failed")

    background_tasks.add_task(
        send_contact_notification,
        contact.name,
        contact.email,
        contact.phone or "",
        (f"Organisation: {contact.org}\n\n" if contact.org else "") + contact.message,
    )

    return ContactResponse(
        status="success",
        message="Thank you for contacting us. We'll get back to you shortly.",
        id=contact.id,
    )


# -----------------------------
# Env debug
# -----------------------------
@api_router.get("/debug/env")
def debug_env():
    return {
        "BREVO_API_KEY_set": bool(os.getenv("BREVO_API_KEY")),
        "SENDER_EMAIL": os.getenv("SENDER_EMAIL"),
        "RECIPIENT_EMAIL": os.getenv("RECIPIENT_EMAIL"),
        "MONGO_URL_set": bool(os.getenv("MONGO_URL")),
    }


# -----------------------------
# Vapi payload helpers
# -----------------------------
def _try_json(val: Any):
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return val
    return val


def _find_args(obj: Any) -> Optional[Dict[str, Any]]:
    obj = _try_json(obj)

    if isinstance(obj, dict):
        if {"subject", "request_type", "resident_name", "resident_phone", "address", "details"} <= obj.keys():
            return obj

        for k in ("arguments", "message", "function"):
            if k in obj:
                found = _find_args(obj[k])
                if found:
                    return found

        for k in ("toolCalls", "tool_calls"):
            if k in obj and isinstance(obj[k], list):
                for item in obj[k]:
                    found = _find_args(item)
                    if found:
                        return found

        for v in obj.values():
            found = _find_args(v)
            if found:
                return found

    if isinstance(obj, list):
        for item in obj:
            found = _find_args(item)
            if found:
                return found

    return None


# -----------------------------
# Vapi debug echo
# -----------------------------
@api_router.post("/vapi/debug/echo")
async def vapi_debug_echo(payload: Dict[str, Any] = Body(default_factory=dict)):
    return {
        "raw": payload,
        "extracted_args": _find_args(payload),
    }


# -----------------------------
# Vapi tool endpoint (FIXED)
# -----------------------------
@api_router.post("/vapi/send-structured-email")
async def vapi_send_structured_email(request: Request):
    try:
        raw = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    payload = _find_args(raw)
    if not payload:
        raise HTTPException(status_code=400, detail="No structured payload found")

    required = ["subject", "request_type", "resident_name", "resident_phone", "address", "details"]
    missing = [k for k in required if not payload.get(k)]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing fields: {', '.join(missing)}")

    payload.setdefault("urgency", "Normal")
    payload.setdefault("resident_email", None)
    payload.setdefault("preferred_contact_method", None)
    payload.setdefault("extra_metadata", {})

    reference_id = f"REQ-{uuid.uuid4().hex[:8].upper()}"
    payload["reference_id"] = reference_id

    try:
        send_council_request_email(payload)
    except EmailDeliveryError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        logging.exception("Unexpected email error")
        raise HTTPException(status_code=500, detail="Internal email error")

    return JSONResponse(
        {
            "success": True,
            "reference_id": reference_id,
            "message": "Request lodged successfully.",
        }
    )


# -----------------------------
# Wiring
# -----------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)
