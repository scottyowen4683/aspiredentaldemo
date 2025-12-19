from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, Request, Body
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Any, Dict, List, Tuple
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
# IMPORTANT: Mongo must NEVER be a hard dependency for this service to boot.
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

    try:
        if mongo_db is not None:
            await mongo_db.contact_submissions.insert_one(contact_obj.model_dump())
    except Exception:
        logging.exception("Mongo insert failed (debug).")

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
# Vapi helpers (extract toolCallId + arguments)
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


def _extract_toolcall_and_args(raw: Any) -> Tuple[Optional[str], Dict[str, Any]]:
    """
    Supports common Vapi shapes:
    - {"toolCalls":[{"id":"...", "function":{"arguments":"{...}"}}]}
    - {"toolCallId":"...", "arguments":{...}}
    - nested wrappers
    Returns (toolCallId, args_dict)
    """
    raw = _try_json_loads(raw)

    if isinstance(raw, dict):
        # direct toolCallId patterns
        tool_call_id = raw.get("toolCallId") or raw.get("tool_call_id")

        # If direct args
        if any(k in raw for k in ("to", "subject", "request_type", "resident_name", "resident_phone", "address", "details")):
            return tool_call_id, raw

        # toolCalls list
        tc = raw.get("toolCalls") or raw.get("tool_calls") or raw.get("toolCallList")
        if isinstance(tc, list) and len(tc) > 0:
            first = tc[0]
            if isinstance(first, dict):
                tool_call_id = tool_call_id or first.get("id") or first.get("toolCallId")
                fn = first.get("function") if isinstance(first.get("function"), dict) else None
                if fn and "arguments" in fn:
                    args = _try_json_loads(fn.get("arguments"))
                    if isinstance(args, dict):
                        return tool_call_id, args

                # Sometimes args are directly under the tool call
                if "arguments" in first:
                    args = _try_json_loads(first.get("arguments"))
                    if isinstance(args, dict):
                        return tool_call_id, args

        # function wrapper
        if "function" in raw and isinstance(raw["function"], dict):
            fn = raw["function"]
            tool_call_id = tool_call_id or raw.get("id")
            if "arguments" in fn:
                args = _try_json_loads(fn.get("arguments"))
                if isinstance(args, dict):
                    return tool_call_id, args

        # recurse all values
        for v in raw.values():
            tid, args = _extract_toolcall_and_args(v)
            if args:
                return tid or tool_call_id, args

    if isinstance(raw, list):
        for item in raw:
            tid, args = _extract_toolcall_and_args(item)
            if args:
                return tid, args

    return None, {}


def _vapi_success(tool_call_id: Optional[str], msg: str):
    # Vapi requires "results" array.
    return JSONResponse(
        {"results": [{"toolCallId": tool_call_id or "unknown", "result": msg}]}
    )


def _vapi_error(tool_call_id: Optional[str], msg: str):
    # Also return 200 with results so Vapi gets a result (prevents "no result returned")
    return JSONResponse(
        {"results": [{"toolCallId": tool_call_id or "unknown", "error": msg}]}
    )


# -----------------------------
# Vapi debug echo (so Swagger shows a body box)
# -----------------------------
@api_router.post("/vapi/debug/echo")
async def vapi_debug_echo(payload: Dict[str, Any] = Body(default_factory=dict)):
    tool_call_id, extracted = _extract_toolcall_and_args(payload)
    return {"raw": payload, "toolCallId": tool_call_id, "extracted_args": extracted}


# -----------------------------
# Vapi tool endpoint (CORRECT VAPI RESPONSE FORMAT)
# -----------------------------
@api_router.post("/vapi/send-structured-email")
async def vapi_send_structured_email(request: Request):
    try:
        raw = await request.json()
    except Exception:
        # Must return Vapi-shaped result, not a bare 400, or Vapi will say "no result"
        return _vapi_error(None, "Invalid JSON body")

    tool_call_id, payload = _extract_toolcall_and_args(raw)

    required = ["subject", "request_type", "resident_name", "resident_phone", "address", "details"]
    missing = [k for k in required if not payload.get(k)]
    if missing:
        return _vapi_error(tool_call_id, f"Missing required fields: {', '.join(missing)}")

    # Optional / defaults
    payload.setdefault("to", os.environ.get("RECIPIENT_EMAIL"))
    payload.setdefault("urgency", "Normal")
    payload.setdefault("preferred_contact_method", None)
    payload.setdefault("resident_email", None)
    payload.setdefault("extra_metadata", {})

    # -----------------------------
    # ONLY CHANGE: static demo reference (instead of long UUID-based one)
    # -----------------------------
    reference_id = "YRC-123"
    payload["reference_id"] = reference_id

    try:
        send_council_request_email(payload)
    except EmailDeliveryError as e:
        logging.exception("EmailDeliveryError in Vapi endpoint")
        return _vapi_error(tool_call_id, f"Email delivery failed: {str(e)}")
    except Exception:
        logging.exception("Unexpected error sending Vapi structured email")
        return _vapi_error(tool_call_id, "Internal server error while sending email")

    # IMPORTANT: single-line string is safest for Vapi
    return _vapi_success(tool_call_id, f"Request lodged successfully. Reference: {reference_id}")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
