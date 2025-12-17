from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path
import os, uuid, logging
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
# - Mongo must NEVER be a hard dependency for the service to boot.
# - Vapi tool endpoints depend on this service being up, so Mongo outages/pauses
#   must not break calls or structured emails.
# --------------------------------------------------------------------------------------
MONGO_URL = os.environ.get("MONGO_URL")  # leave unset to disable Mongo entirely
DB_NAME = os.environ.get("DB_NAME", "app_db")

mongo_client: Optional[AsyncIOMotorClient] = None
mongo_db = None  # only used for contact form persistence


async def init_mongo():
    global mongo_client, mongo_db

    if not MONGO_URL:
        logging.info("Mongo not configured (MONGO_URL not set). Contact form submissions will not be stored.")
        mongo_client = None
        mongo_db = None
        return

    try:
        mongo_client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
        # Force a real connection attempt so we can fail fast but NOT crash the app
        await mongo_client.admin.command("ping")
        mongo_db = mongo_client[DB_NAME]
        logging.info("Mongo connected (contact form storage enabled).")
    except Exception as e:
        logging.warning(f"Mongo unavailable; continuing without it. Contact form storage disabled. Error: {repr(e)}")
        mongo_client = None
        mongo_db = None


# --- App / Router ---
app = FastAPI()
api_router = APIRouter(prefix="/api")


# --- Models ---
class ContactSubmission(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    phone: Optional[str] = None
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    status: str = "new"


class ContactSubmissionCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    message: str


class ContactResponse(BaseModel):
    status: str
    message: str
    id: str


# --- Startup / Shutdown ---
@app.on_event("startup")
async def on_startup():
    # logging.basicConfig is already called below, but harmless if duplicated.
    # Keep it here so startup logs are consistent even if file structure changes.
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


# --- Health/info ---
@api_router.get("/")
async def root():
    return {"message": "Aspire Executive Solutions API"}


# --- Normal async route (emails sent in background) ---
@api_router.post("/contact", response_model=ContactResponse)
async def create_contact_submission(
    input: ContactSubmissionCreate, background_tasks: BackgroundTasks
):
    contact_obj = ContactSubmission(**input.dict())

    # 1) Best-effort DB persistence (Mongo optional)
    try:
        if mongo_db is not None:
            await mongo_db.contact_submissions.insert_one(contact_obj.dict())
        else:
            logging.info("Mongo not available; skipping contact_submissions DB insert.")
    except Exception:
        logging.exception("Mongo insert failed; continuing without DB persistence for contact submission.")

    # 2) Always attempt to send the notification email in the background
    try:
        background_tasks.add_task(
            send_contact_notification,
            contact_obj.name,
            contact_obj.email,
            contact_obj.phone or "",
            contact_obj.message,
        )
    except Exception:
        logging.exception("Failed to queue contact notification background task.")

    # 3) Always return success (avoid UX leak / keep site smooth)
    return ContactResponse(
        status="success",
        message="Thank you for contacting us. We'll get back to you within 24 hours.",
        id=contact_obj.id,
    )


# --- DEBUG: show env seen by the running app ---
@api_router.get("/debug/env")
def debug_env():
    def mask(v: Optional[str]):
        if not v:
            return None
        return v[:4] + "..." + v[-4:] if len(v) > 8 else v

    return {
        "BREVO_API_KEY_set": bool(os.getenv("BREVO_API_KEY")),
        "BREVO_PASSWORD_set": bool(os.getenv("BREVO_PASSWORD")),
        "SENDER_EMAIL": os.getenv("SENDER_EMAIL"),
        "RECIPIENT_EMAIL": os.getenv("RECIPIENT_EMAIL"),
        "BREVO_API_KEY_preview": mask(
            os.getenv("BREVO_API_KEY") or os.getenv("BREVO_PASSWORD")
        ),
        # Helpful for sanity-checking whether Mongo is wired
        "MONGO_URL_set": bool(os.getenv("MONGO_URL")),
        "DB_NAME": os.getenv("DB_NAME", "app_db"),
    }


# --- DEBUG: send email synchronously so errors surface in the response ---
@api_router.post("/contact/debug", response_model=ContactResponse)
async def create_contact_submission_debug(input: ContactSubmissionCreate):
    contact_obj = ContactSubmission(**input.dict())

    # Best-effort DB persistence (Mongo optional)
    try:
        if mongo_db is not None:
            await mongo_db.contact_submissions.insert_one(contact_obj.dict())
        else:
            logging.info("Mongo not available; skipping contact_submissions DB insert (debug).")
    except Exception:
        logging.exception("Mongo insert failed (debug); continuing without DB persistence.")

    # Send synchronously so you SEE Brevo errors
    try:
        send_contact_notification(
            contact_obj.name,
            contact_obj.email,
            contact_obj.phone or "",
            contact_obj.message,
        )
        return ContactResponse(
            status="success",
            message="Email sent (debug route).",
            id=contact_obj.id,
        )
    except EmailDeliveryError as e:
        raise HTTPException(status_code=502, detail=f"Email delivery failed: {str(e)}")
    except Exception as e:
        logging.exception("Debug route failed")
        raise HTTPException(status_code=500, detail=str(e))


# --- Vapi structured email endpoint ---
@api_router.post("/vapi/send-structured-email")
async def vapi_send_structured_email(request: Request):
    """
    Webhook endpoint for the Vapi custom tool `send_structured_email`.
    Vapi will POST a JSON body here with the fields defined in the tool schema.
    NOTE: This endpoint must remain independent of Mongo.
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    required = [
        "subject",
        "request_type",
        "resident_name",
        "resident_phone",
        "address",
        "details",
    ]
    missing = [k for k in required if not payload.get(k)]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing)}",
        )

    try:
        send_council_request_email(payload)
    except EmailDeliveryError as e:
        raise HTTPException(status_code=502, detail=f"Email delivery failed: {str(e)}")
    except Exception as e:
        logging.exception("Error processing Vapi structured email")
        raise HTTPException(status_code=500, detail="Internal server error")

    return JSONResponse({"success": True})


# --- Wire router / CORS / logging ---
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
