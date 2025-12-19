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
# IMPORTANT: do NOT default to localhost. If MONGO_URL is not set, Mongo is disabled.
# --------------------------------------------------------------------------------------
MONGO_URL = os.environ.get("MONGO_URL")  # leave unset to disable Mongo entirely
DB_NAME = os.environ.get("DB_NAME", "app_db")

mongo_client: Optional[AsyncIOMotorClient] = None
mongo_db = None  # only used for contact form persistence


async def init_mongo():
    global mongo_client, mongo_db

    if not MONGO_URL:
        logging.info("Mongo not configured (MONGO_URL not set). Contact storage disabled.")
        mongo_client = None
        mongo_db = None
        return

    try:
        mongo_client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
        await mongo_client.admin.command("ping")
        mongo_db = mongo_client[DB_NAME]
        logging.info("Mongo connected (contact form storage enabled).")
    except Exception as e:
        logging.warning(f"Mongo unavailable; continuing without it. Error: {repr(e)}")
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
    try:
        if mongo_client is not None:
            mongo_client.close()
            mongo_client = None
    except Exception:
        pass


@api_router.get("/")
async def root():
    return {"message": "Aspire Executive Solutions API"}


# -----------------------------
# Contact form
# -----------------------------
@api_router.post("/contact", response_model=ContactResponse)
async def create_contact_submission(input: ContactSubmissionCreate, background_tasks: BackgroundTasks):
    contact_obj = ContactSubmission(**input.model_dump())

    # 1) Best-effort DB persistence (Mongo optional)
    try:
        if mongo_db is not None:
            await mongo_db.contact_submissions.insert_one(contact_obj.model_dump())
        else:
            logging.info("Mongo disabled/unavailable; skipping DB insert.")
    except Exception:
        logging.exception("Mongo insert failed; continuing without DB persistence.")

    # 2) Best-effort email (never break UX)
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
        message="Thank you for contacting us. We'll get back to you within 24 hours.",
        id=contact_obj.id,
    )


@api_router.get("/debug/env")
def debug_env():
    def mask(v: Optional[str]):
        if not v:
            return None
        return v[:4] + "..." + v[-4:] if len(v) > 8 else v

    return {
        "BREVO_API_KEY_set": bool(os.getenv("BREVO_API_KEY")),
        "SENDER_EMAIL": os.getenv("SENDER_EMAIL"),
        "RECIPIENT_EMAIL": os.getenv("RECIPIENT_EMAIL"),
        "BREVO_API_KEY_preview": mask(os.getenv("BREVO_API_KEY")),
        "MONGO_URL_set": bool(os.getenv("MONGO_URL")),
        "DB_NAME": os.getenv("DB_NAME", "app_db"),
    }


@api_router.post("/contact/debug", response_model=ContactResponse)
async def create_contact_submission_debug(input: ContactSubmissionCreate):
    contact_obj = ContactSubmission(**input.model_dump())

    # DB optional
    try:
        if mongo_db is not None:
            await mongo_db.contact_submissions.insert_one(contact_obj.model_dump())
    except Exception:
        logging.exception("Mongo insert failed (debug).")

    # Email sync so you can see errors
    try:
        send_contact_notification(
            contact_obj.name,
            contact_obj.email,
            contact_obj.phone or "",
            (f"Organisation: {contact_obj.org}\n\n" if contact_obj.org else "") + contact_obj.message,
        )
        return ContactResponse(status="success", message="Email sent (debug).", id=contact_obj.id)
    except EmailDeliveryError as e:
        raise HTTPException(status_code=502, detail=f"Email delivery failed: {str(e)}")
    except Exception as e:
        logging.exception("Debug route failed")
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------------
# Vapi payload unwrapping helpers
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
    """
    Walk a nested structure and try to locate tool-call arguments in common Vapi shapes.
    Returns a dict of arguments if found.
    """
    obj = _try_json_loads(obj)

    if isinstance(obj, dict):
        # Direct args (already the correct shape)
        if any(k in obj for k in ("to", "subject", "request_type", "resident_name", "resident_phone", "address", "details")):
            return obj

        # Common wrapper: {"arguments": "...json..."} or {"arguments": {...}}
        if "arguments" in obj:
            args = _try_json_loads(obj.get("arguments"))
            if isinstance(args, dict):
                return args

        # Common wrapper: {"message": {...}}
        if "message" in obj:
            found = _deep_find_arguments(obj.get("message"))
            if found:
                return found

        # Vapi wrappers
        for key in ("toolCalls", "toolCallList", "tool_calls"):
            tc = obj.get(key)
            if isinstance(tc, list):
                for item in tc:
                    found = _deep_find_arguments(item)
                    if found:
                        return found

        # Wrapper: {"function": {"arguments": ...}}
        if "function" in obj and isinstance(obj["function"], dict):
            found = _deep_find_arguments(obj["function"])
            if found:
                return found

        # Otherwise search all values
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


# -----------------------------
# Vapi debug echo
# IMPORTANT: define Body() so Swagger shows a request body box.
# -----------------------------
@api_router.post("/vapi/debug/echo")
async def vapi_debug_echo(payload: Dict[str, Any] = Body(default_factory=dict)):
    extracted = _deep_find_arguments(payload)
    return {"raw": payload, "extracted_args": extracted}


# -----------------------------
# Vapi tool endpoint
# CRITICAL: return 200 + {} so Vapi treats tool call as success.
# -----------------------------
@api_router.post("/vapi/send-structured-email")
async def vapi_send_structured_email(request: Request):
    try:
        raw = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    payload = _deep_find_arguments(raw) or {}

    required = ["to", "subject", "request_type", "resident_name", "resident_phone", "address", "details"]
    missing = [k for k in required if not payload.get(k)]
    if missing:
        logging.warning(f"Vapi missing fields={missing} extracted={payload}")
        raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}")

    # Optional defaults
    payload.setdefault("urgency", "Normal")
    payload.setdefault("preferred_contact_method", None)
    payload.setdefault("resident_email", None)
    payload.setdefault("extra_metadata", {})

    reference_id = f"REQ-{uuid.uuid4().hex[:10].upper()}"
    payload["reference_id"] = reference_id

    try:
        # Send the email; if Brevo errors, emails.py raises EmailDeliveryError
        send_council_request_email(payload)
    except EmailDeliveryError as e:
        logging.exception("EmailDeliveryError in Vapi endpoint")
        raise HTTPException(status_code=502, detail=f"Email delivery failed: {str(e)}")
    except Exception:
        logging.exception("Unexpected error sending Vapi structured email")
        raise HTTPException(status_code=500, detail="Internal server error while sending email")

    # IMPORTANT: empty JSON response avoids Vapi thinking it's a failure
    return JSONResponse({})


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
