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

# --- DB setup ---
mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
db_name = os.environ.get("DB_NAME", "app_db")
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

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


# --- Health/info ---
@api_router.get("/")
async def root():
    return {"message": "Aspire Executive Solutions API"}


# --- Normal async route (emails sent in background) ---
@api_router.post("/contact", response_model=ContactResponse)
async def create_contact_submission(
    input: ContactSubmissionCreate, background_tasks: BackgroundTasks
):
    try:
        contact_obj = ContactSubmission(**input.dict())
        await db.contact_submissions.insert_one(contact_obj.dict())

        # send email in background
        background_tasks.add_task(
            send_contact_notification,
            contact_obj.name,
            contact_obj.email,
            contact_obj.phone or "",
            contact_obj.message,
        )

        return ContactResponse(
            status="success",
            message="Thank you for contacting us. We'll get back to you within 24 hours.",
            id=contact_obj.id,
        )

    except EmailDeliveryError as e:
        logging.error(f"Email delivery failed (background): {str(e)}")
        # still return success to avoid UX leak; submission was stored
        return ContactResponse(
            status="success",
            message="Thank you for contacting us. We'll get back to you within 24 hours.",
            id=contact_obj.id,
        )
    except Exception as e:
        logging.exception("Error processing contact submission")
        raise HTTPException(
            status_code=500, detail="An error occurred processing your request"
        )


# --- DEBUG: show env seen by the running app ---
@api_router.get("/debug/env")
def debug_env():
    def mask(v: Optional[str]):
        if not v:
            return None
    #     return v[:4] + "..." + v[-4:] if len(v) > 8 else v
        return v[:4] + "..." + v[-4:] if len(v) > 8 else v

    return {
        "BREVO_API_KEY_set": bool(os.getenv("BREVO_API_KEY")),
        "BREVO_PASSWORD_set": bool(os.getenv("BREVO_PASSWORD")),
        "SENDER_EMAIL": os.getenv("SENDER_EMAIL"),
        "RECIPIENT_EMAIL": os.getenv("RECIPIENT_EMAIL"),
        "BREVO_API_KEY_preview": mask(
            os.getenv("BREVO_API_KEY") or os.getenv("BREVO_PASSWORD")
        ),
    }


# --- DEBUG: send email synchronously so errors surface in the response ---
@api_router.post("/contact/debug", response_model=ContactResponse)
async def create_contact_submission_debug(input: ContactSubmissionCreate):
    try:
        contact_obj = ContactSubmission(**input.dict())
        await db.contact_submissions.insert_one(contact_obj.dict())

        # send synchronously (no BackgroundTasks) so we SEE Brevo errors
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
        # bubble up so you see it in the response body
        raise HTTPException(
            status_code=502, detail=f"Email delivery failed: {str(e)}"
        )
    except Exception as e:
        logging.exception("Debug route failed")
        raise HTTPException(status_code=500, detail=str(e))


# --- NEW: Vapi structured email endpoint ---
@api_router.post("/vapi/send-structured-email")
async def vapi_send_structured_email(request: Request):
    """
    Webhook endpoint for the Vapi custom tool `send_structured_email`.
    Vapi will POST a JSON body here with the fields defined in the tool schema.
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
        raise HTTPException(
            status_code=502, detail=f"Email delivery failed: {str(e)}"
        )
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
