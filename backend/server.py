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

# --------------------------------------------------------------------------------------
# MongoDB (OPTIONAL – CONTACT FORM ONLY)
# --------------------------------------------------------------------------------------
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "app_db")

mongo_client: Optional[AsyncIOMotorClient] = None
mongo_db = None


async def init_mongo():
    global mongo_client, mongo_db
    if not MONGO_URL:
        logging.info("Mongo not configured. Skipping DB.")
        return
    try:
        mongo_client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
        await mongo_client.admin.command("ping")
        mongo_db = mongo_client[DB_NAME]
    except Exception:
        mongo_client = None
        mongo_db = None


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


@app.on_event("startup")
async def startup():
    logging.basicConfig(level=logging.INFO)
    await init_mongo()


# -----------------------------
# Root
# -----------------------------
@api_router.get("/")
async def root():
    return {"message": "Aspire Executive Solutions API"}


# -----------------------------
# Website contact form
# -----------------------------
@api_router.post("/contact", response_model=ContactResponse)
async def contact(input: ContactSubmissionCreate, background_tasks: BackgroundTasks):
    obj = ContactSubmission(**input.model_dump())

    if mongo_db:
        try:
            await mongo_db.contact_submissions.insert_one(obj.model_dump())
        except Exception:
            logging.exception("Mongo insert failed")

    background_tasks.add_task(
        send_contact_notification,
        obj.name,
        obj.email,
        obj.phone or "",
        (f"Organisation: {obj.org}\n\n" if obj.org else "") + obj.message,
    )

    return ContactResponse(
        status="success",
        message="Thank you for contacting us.",
        id=obj.id,
    )


# -----------------------------
# Helpers – Vapi payload unwrap
# -----------------------------
def _try_json(val):
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return val
    return val


def _deep_find_arguments(obj) -> Optional[Dict[str, Any]]:
    obj = _try_json(obj)

    if isinstance(obj, dict):
        if {"subject", "request_type", "resident_name", "resident_phone", "address", "details"} <= obj.keys():
            return obj

        if "arguments" in obj:
            args = _try_json(obj["arguments"])
            if isinstance(args, dict):
                return args

        for k in ("toolCalls", "toolCallList", "tool_calls"):
            if k in obj and isinstance(obj[k], list):
                for i in obj[k]:
                    found = _deep_find_arguments(i)
                    if found:
                        return found

        if "function" in obj:
            return _deep_find_arguments(obj["function"])

        for v in obj.values():
            found = _deep_find_arguments(v)
            if found:
                return found

    if isinstance(obj, list):
        for i in obj:
            found = _deep_find_arguments(i)
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
        "extracted": _deep_find_arguments(payload),
    }


# -----------------------------
# Vapi email tool (FIXED)
# -----------------------------
@api_router.post("/vapi/send-structured-email")
async def vapi_send_structured_email(request: Request):
    try:
        raw = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    payload = _deep_find_arguments(raw) or {}

    REQUIRED = [
        "subject",
        "request_type",
        "resident_name",
        "resident_phone",
        "address",
        "details",
    ]

    missing = [k for k in REQUIRED if not payload.get(k)]
    if missing:
        logging.warning(f"Missing fields: {missing} payload={payload}")
        raise HTTPException(status_code=400, detail=f"Missing fields: {missing}")

    # FORCE EMAIL DESTINATION SERVER-SIDE
    payload["to"] = os.environ.get("RECIPIENT_EMAIL")
    if not payload["to"]:
        raise HTTPException(status_code=500, detail="Recipient email not configured")

    payload.setdefault("urgency", "Normal")
    payload.setdefault("resident_email", None)
    payload.setdefault("preferred_contact_method", None)
    payload.setdefault("extra_metadata", {})

    reference_id = f"REQ-{uuid.uuid4().hex[:8].upper()}"
    payload["reference_id"] = reference_id

    try:
        send_council_request_email(payload)
    except EmailDeliveryError as e:
        logging.exception("Email delivery failed")
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        logging.exception("Unexpected email error")
        raise HTTPException(status_code=500, detail="Internal error")

    return JSONResponse(
        {
            "success": True,
            "reference_id": reference_id,
        }
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
