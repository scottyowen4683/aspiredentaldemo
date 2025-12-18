from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, Request
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


# --------------------------------------------------------------------------------------
# CONTACT FORM
# --------------------------------------------------------------------------------------
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


# --------------------------------------------------------------------------------------
# VAPI STRUCTURED EMAIL - HARDENED PARSER
# --------------------------------------------------------------------------------------
def _looks_like_placeholder_email(v: str) -> bool:
    if not v:
        return True
    v = v.strip().lower()
    return (
        "your_test_email" in v
        or "example.com" in v
        or "yourdomain.com" in v
        or v == "none"
        or v == "null"
    )


def _extract_vapi_arguments(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Accepts either:
      A) direct payload: { subject, request_type, resident_name, ... }
      B) Vapi wrapper:  { toolCalls:[{ function:{ arguments:{...} OR arguments:"{...json...}" } }], ... }
      C) alternative wrapper variants with toolCallList/toolWithToolCallList etc.

    Returns the clean arguments dict if found, else returns the original payload.
    """
    # If it's already the clean shape, just return it.
    if isinstance(payload, dict) and payload.get("subject") and payload.get("request_type"):
        return payload

    # Common locations Vapi may send:
    candidates = []

    # Vapi: toolCalls
    tc = payload.get("toolCalls")
    if isinstance(tc, list) and tc:
        candidates.append(tc)

    # Vapi: toolCallList
    tcl = payload.get("toolCallList")
    if isinstance(tcl, list) and tcl:
        candidates.append(tcl)

    # Some wrappers: message.toolCalls
    msg = payload.get("message")
    if isinstance(msg, dict):
        msg_tc = msg.get("toolCalls")
        if isinstance(msg_tc, list) and msg_tc:
            candidates.append(msg_tc)

    # Walk candidates and return first valid arguments
    for toolcalls in candidates:
        for item in toolcalls:
            fn = (item or {}).get("function") or {}
            args = fn.get("arguments")

            # args might be dict already
            if isinstance(args, dict):
                return args

            # args might be JSON string
            if isinstance(args, str) and args.strip():
                try:
                    parsed = json.loads(args)
                    if isinstance(parsed, dict):
                        return parsed
                except Exception:
                    # Not JSON; ignore
                    pass

    # Fall back to original payload (so we can log it if needed)
    return payload


@api_router.post("/vapi/send-structured-email")
async def vapi_send_structured_email(request: Request):
    try:
        raw_payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Extract clean arguments from Vapi wrapper (or return raw if already clean)
    payload = _extract_vapi_arguments(raw_payload)

    # Required fields (keep aligned with what you actually need)
    required = ["subject", "request_type", "resident_name", "resident_phone", "address", "details"]
    missing = [k for k in required if not payload.get(k)]

    # If missing, log the raw payload to help debugging (but don’t email garbage)
    if missing:
        logging.warning(f"Vapi payload missing required fields: {missing}")
        logging.info(f"Vapi raw payload received: {json.dumps(raw_payload)[:4000]}")
        raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}")

    # Fix "to" field: use it only if it looks real; otherwise fall back to RECIPIENT_EMAIL
    to_value = payload.get("to")
    if not to_value or _looks_like_placeholder_email(str(to_value)):
        payload["to"] = os.getenv("RECIPIENT_EMAIL")

    # Final sanity: if still no "to", fail cleanly
    if not payload.get("to"):
        raise HTTPException(status_code=500, detail="RECIPIENT_EMAIL is not configured on the server.")

    try:
        # This function should build the final email body from the structured fields.
        send_council_request_email(payload)
    except EmailDeliveryError as e:
        raise HTTPException(status_code=502, detail=f"Email delivery failed: {str(e)}")
    except Exception:
        logging.exception("Error processing Vapi structured email")
        raise HTTPException(status_code=500, detail="Internal server error")

    return JSONResponse({"success": True})


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
