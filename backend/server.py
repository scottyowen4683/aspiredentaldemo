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
# MongoDB (CONTACT FORM ONLY; OPTIONAL)
# --------------------------------------------------------------------------------------
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "app_db")

mongo_client: Optional[AsyncIOMotorClient] = None
mongo_db = None


async def init_mongo():
    global mongo_client, mongo_db
    if not MONGO_URL:
        logging.info("Mongo not configured. Contact storage disabled.")
        return
    try:
        mongo_client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
        await mongo_client.admin.command("ping")
        mongo_db = mongo_client[DB_NAME]
        logging.info("Mongo connected.")
    except Exception as e:
        logging.warning(f"Mongo unavailable: {e}")
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
async def on_startup():
    logging.basicConfig(level=logging.INFO)
    await init_mongo()


@app.on_event("shutdown")
async def shutdown_db_client():
    global mongo_client
    if mongo_client:
        mongo_client.close()
        mongo_client = None


@api_router.get("/")
async def root():
    return {"message": "Aspire Executive Solutions API"}


# -----------------------------
# Contact form
# -----------------------------
@api_router.post("/contact", response_model=ContactResponse)
async def create_contact_submission(input: ContactSubmissionCreate, background_tasks: BackgroundTasks):
    contact_obj = ContactSubmission(**input.model_dump())

    if mongo_db:
        try:
            await mongo_db.contact_submissions.insert_one(contact_obj.model_dump())
        except Exception:
            logging.exception("Mongo insert failed.")

    def _safe_send():
        try:
            send_contact_notification(
                contact_obj.name,
                contact_obj.email,
                contact_obj.phone or "",
                (f"Organisation: {contact_obj.org}\n\n" if contact_obj.org else "") + contact_obj.message,
            )
        except Exception:
            logging.exception("Contact email send failed.")

    background_tasks.add_task(_safe_send)

    return ContactResponse(
        status="success",
        message="Thank you for contacting us.",
        id=contact_obj.id,
    )


# -----------------------------
# Vapi helpers
# -----------------------------
def _try_json_loads(val: Any) -> Any:
    if isinstance(val, str):
        s = val.strip()
        if (s.startswith("{") and s.endswith("}")) or (s.startswith("[") and s.endswith("]")):
            try:
                return json.loads(s)
            except Exception:
                return val
    return val


def _deep_find_arguments(obj: Any) -> Optional[Dict[str, Any]]:
    obj = _try_json_loads(obj)

    if isinstance(obj, dict):
        if all(k in obj for k in ("to", "subject", "request_type", "resident_name", "resident_phone", "address", "details")):
            return obj

        if "arguments" in obj:
            args = _try_json_loads(obj.get("arguments"))
            if isinstance(args, dict):
                return args

        for key in ("toolCalls", "toolCallList", "tool_calls"):
            tc = obj.get(key)
            if isinstance(tc, list):
                for item in tc:
                    found = _deep_find_arguments(item)
                    if found:
                        return found

        if "function" in obj:
            return _deep_find_arguments(obj["function"])

        for v in obj.values():
            found = _deep_find_arguments(v)
            if found:
                return found

    if isinstance(obj, list):
        for item in obj:
            found = _deep_find_arguments(item)
            if found:
                return found

    return None


def _vapi_success(tool_call_id: str, message: str):
    return JSONResponse(
        {
            "results": [
                {
                    "toolCallId": tool_call_id,
                    "result": message,
                }
            ]
        }
    )


def _vapi_error(tool_call_id: str, message: str):
    return JSONResponse(
        {
            "results": [
                {
                    "toolCallId": tool_call_id,
                    "error": message,
                }
            ]
        }
    )


# -----------------------------
# Vapi structured email tool
# -----------------------------
@api_router.post("/vapi/send-structured-email")
async def vapi_send_structured_email(request: Request):
    raw = await request.json()
    payload = _deep_find_arguments(raw)

    tool_call_id = None
    for k in ("toolCalls", "toolCallList"):
        if isinstance(raw.get(k), list) and raw[k]:
            tool_call_id = raw[k][0].get("id")
            break

    if not payload:
        return _vapi_error(tool_call_id, "Unable to extract request details.")

    required = ["to", "subject", "request_type", "resident_name", "resident_phone", "address", "details"]
    missing = [k for k in required if not payload.get(k)]
    if missing:
        return _vapi_error(tool_call_id, f"Missing required fields: {', '.join(missing)}")

    payload.setdefault("urgency", "Normal")
    payload.setdefault("preferred_contact_method", None)
    payload.setdefault("resident_email", None)
    payload.setdefault("extra_metadata", {})

    # ✅ STATIC DEMO REFERENCE (ONLY CHANGE IN THIS FILE)
    payload["reference_id"] = "YRC-123"

    try:
        send_council_request_email(payload)
    except Exception:
        logging.exception("Email failed")
        return _vapi_error(tool_call_id, "There was a problem lodging your request.")

    return _vapi_success(
        tool_call_id,
        "All done. Your request has been logged. Reference YRC one two three."
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
