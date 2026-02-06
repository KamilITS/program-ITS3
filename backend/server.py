from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Response
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import openpyxl
from io import BytesIO
import base64
import hashlib
import secrets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'magazyn_db')]

# Create the main app
app = FastAPI(title="Magazyn ITS Kielce API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    """Hash password with SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()

def generate_token() -> str:
    """Generate a secure random token"""
    return secrets.token_urlsafe(32)

# ==================== MODELS ====================

class LoginRequest(BaseModel):
    email: str
    password: str

class CreateUserRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str = "pracownik"

class ChangePasswordRequest(BaseModel):
    current_password: Optional[str] = None  # Required for self-change
    new_password: str

class Device(BaseModel):
    device_id: str = Field(default_factory=lambda: f"dev_{uuid.uuid4().hex[:12]}")
    nazwa: str
    numer_seryjny: str
    kod_kreskowy: Optional[str] = None
    kod_qr: Optional[str] = None
    przypisany_do: Optional[str] = None
    status: str = "dostepny"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DeviceInstallation(BaseModel):
    installation_id: str = Field(default_factory=lambda: f"inst_{uuid.uuid4().hex[:12]}")
    device_id: str
    user_id: str
    nazwa_urzadzenia: str
    data_instalacji: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    adres: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    rodzaj_zlecenia: str

class Message(BaseModel):
    message_id: str = Field(default_factory=lambda: f"msg_{uuid.uuid4().hex[:12]}")
    sender_id: str
    sender_name: str
    content: Optional[str] = None
    attachment: Optional[str] = None
    attachment_type: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Task(BaseModel):
    task_id: str = Field(default_factory=lambda: f"task_{uuid.uuid4().hex[:12]}")
    title: str
    description: Optional[str] = None
    assigned_to: str
    assigned_by: str
    due_date: datetime
    status: str = "oczekujace"
    priority: str = "normalne"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ==================== AUTH HELPERS ====================

async def get_session_token(request: Request) -> Optional[str]:
    """Extract session token from cookies or Authorization header"""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    return session_token

async def get_current_user(request: Request) -> Optional[dict]:
    """Get current user from session"""
    session_token = await get_session_token(request)
    if not session_token:
        return None
    
    session = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    if not session:
        return None
    
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        return None
    
    user_doc = await db.users.find_one(
        {"user_id": session["user_id"]},
        {"_id": 0, "password_hash": 0}
    )
    return user_doc

async def require_user(request: Request) -> dict:
    """Require authenticated user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Nie zalogowany")
    return user

async def require_admin(request: Request) -> dict:
    """Require admin user"""
    user = await require_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Brak uprawnień administratora")
    return user

# ==================== STARTUP - CREATE ADMIN ====================

@app.on_event("startup")
async def create_default_admin():
    """Create default admin account if not exists"""
    admin_email = "kamil@magazyn.its.kielce.pl"
    existing = await db.users.find_one({"email": admin_email})
    
    if not existing:
        admin_user = {
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": admin_email,
            "name": "Kamil",
            "password_hash": hash_password("kamil678@"),
            "role": "admin",
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(admin_user)
        logger.info(f"Created default admin account: {admin_email}")

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/login")
async def login(data: LoginRequest, response: Response):
    """Login with email and password"""
    user = await db.users.find_one(
        {"email": data.email.lower()},
        {"_id": 0}
    )
    
    if not user:
        raise HTTPException(status_code=401, detail="Nieprawidłowy email lub hasło")
    
    password_hash = hash_password(data.password)
    if user.get("password_hash") != password_hash:
        raise HTTPException(status_code=401, detail="Nieprawidłowy email lub hasło")
    
    # Delete old sessions
    await db.user_sessions.delete_many({"user_id": user["user_id"]})
    
    # Create new session
    session_token = generate_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    })
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "session_token": session_token
    }

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(require_user)):
    """Get current user"""
    return user

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = await get_session_token(request)
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Wylogowano pomyślnie"}

@api_router.post("/auth/change-password")
async def change_own_password(request: Request, user: dict = Depends(require_user)):
    """Change own password"""
    body = await request.json()
    current_password = body.get("current_password")
    new_password = body.get("new_password")
    
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Wymagane aktualne i nowe hasło")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Hasło musi mieć minimum 6 znaków")
    
    # Verify current password
    user_doc = await db.users.find_one({"user_id": user["user_id"]})
    if user_doc.get("password_hash") != hash_password(current_password):
        raise HTTPException(status_code=401, detail="Nieprawidłowe aktualne hasło")
    
    # Update password
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": hash_password(new_password)}}
    )
    
    return {"message": "Hasło zostało zmienione"}

# ==================== USER MANAGEMENT (ADMIN) ====================

@api_router.get("/users")
async def get_users(admin: dict = Depends(require_admin)):
    """Get all users (admin only)"""
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api_router.post("/users")
async def create_user(data: CreateUserRequest, admin: dict = Depends(require_admin)):
    """Create new user (admin only)"""
    # Check if email already exists
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email jest już zarejestrowany")
    
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Hasło musi mieć minimum 6 znaków")
    
    if data.role not in ["admin", "pracownik"]:
        raise HTTPException(status_code=400, detail="Nieprawidłowa rola")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    
    user_doc = {
        "user_id": user_id,
        "email": data.email.lower(),
        "name": data.name,
        "password_hash": hash_password(data.password),
        "role": data.role,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.users.insert_one(user_doc)
    
    return {
        "user_id": user_id,
        "email": data.email.lower(),
        "name": data.name,
        "role": data.role,
        "message": "Użytkownik został utworzony"
    }

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Update user role (admin only)"""
    body = await request.json()
    new_role = body.get("role")
    
    if new_role not in ["admin", "pracownik"]:
        raise HTTPException(status_code=400, detail="Nieprawidłowa rola")
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"role": new_role}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")
    
    return {"message": "Rola zaktualizowana"}

@api_router.put("/users/{user_id}/password")
async def reset_user_password(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Reset user password (admin only)"""
    body = await request.json()
    new_password = body.get("new_password")
    
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Hasło musi mieć minimum 6 znaków")
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"password_hash": hash_password(new_password)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")
    
    # Invalidate user sessions
    await db.user_sessions.delete_many({"user_id": user_id})
    
    return {"message": "Hasło zostało zresetowane"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    """Delete user (admin only)"""
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Nie możesz usunąć własnego konta")
    
    result = await db.users.delete_one({"user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")
    
    # Delete user sessions
    await db.user_sessions.delete_many({"user_id": user_id})
    
    return {"message": "Użytkownik został usunięty"}

@api_router.get("/workers")
async def get_workers(user: dict = Depends(require_user)):
    """Get all workers (pracownik role)"""
    workers = await db.users.find({"role": "pracownik"}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return workers

# ==================== DEVICE MANAGEMENT ====================

@api_router.post("/devices/import")
async def import_devices(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    """Import devices from XLSX file"""
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Tylko pliki XLSX są obsługiwane")
    
    content = await file.read()
    wb = openpyxl.load_workbook(BytesIO(content))
    ws = wb.active
    
    devices_imported = 0
    errors = []
    
    for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row or not row[0]:
            continue
        
        try:
            device = {
                "device_id": f"dev_{uuid.uuid4().hex[:12]}",
                "nazwa": str(row[0]) if row[0] else "",
                "numer_seryjny": str(row[1]) if len(row) > 1 and row[1] else "",
                "kod_kreskowy": str(row[2]) if len(row) > 2 and row[2] else None,
                "kod_qr": str(row[3]) if len(row) > 3 and row[3] else None,
                "przypisany_do": None,
                "status": "dostepny",
                "created_at": datetime.now(timezone.utc)
            }
            
            existing = await db.devices.find_one({"numer_seryjny": device["numer_seryjny"]})
            if not existing:
                await db.devices.insert_one(device)
                devices_imported += 1
            else:
                errors.append(f"Wiersz {row_num}: Urządzenie o numerze seryjnym {device['numer_seryjny']} już istnieje")
        except Exception as e:
            errors.append(f"Wiersz {row_num}: {str(e)}")
    
    return {
        "imported": devices_imported,
        "errors": errors
    }

@api_router.get("/devices")
async def get_devices(
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    user: dict = Depends(require_user)
):
    """Get all devices"""
    query = {}
    if status:
        query["status"] = status
    if assigned_to:
        query["przypisany_do"] = assigned_to
    
    devices = await db.devices.find(query, {"_id": 0}).to_list(1000)
    return devices

@api_router.get("/devices/{device_id}")
async def get_device(device_id: str, user: dict = Depends(require_user)):
    """Get single device"""
    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Nie znaleziono urządzenia")
    return device

@api_router.post("/devices/{device_id}/assign")
async def assign_device(device_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Assign device to worker"""
    body = await request.json()
    worker_id = body.get("worker_id")
    
    if not worker_id:
        raise HTTPException(status_code=400, detail="Wymagane worker_id")
    
    result = await db.devices.update_one(
        {"device_id": device_id},
        {"$set": {"przypisany_do": worker_id, "status": "przypisany"}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Nie znaleziono urządzenia")
    
    return {"message": "Urządzenie przypisane"}

@api_router.get("/devices/scan/{code}")
async def scan_device(code: str, user: dict = Depends(require_user)):
    """Find device by barcode, QR code, or serial number (exact or partial match)"""
    # Clean the code - remove whitespace and special characters
    clean_code = code.strip().replace('\r', '').replace('\n', '')
    
    # First try exact match
    device = await db.devices.find_one(
        {"$or": [
            {"kod_kreskowy": clean_code}, 
            {"kod_qr": clean_code}, 
            {"numer_seryjny": clean_code}
        ]},
        {"_id": 0}
    )
    
    if device:
        return device
    
    # Try case-insensitive match
    device = await db.devices.find_one(
        {"$or": [
            {"kod_kreskowy": {"$regex": f"^{clean_code}$", "$options": "i"}}, 
            {"kod_qr": {"$regex": f"^{clean_code}$", "$options": "i"}}, 
            {"numer_seryjny": {"$regex": f"^{clean_code}$", "$options": "i"}}
        ]},
        {"_id": 0}
    )
    
    if device:
        return device
    
    # Try partial match on serial number (contains)
    device = await db.devices.find_one(
        {"numer_seryjny": {"$regex": clean_code, "$options": "i"}},
        {"_id": 0}
    )
    
    if device:
        return device
    
    # Try if code contains the serial number
    all_devices = await db.devices.find({}, {"_id": 0}).to_list(1000)
    for dev in all_devices:
        if dev.get("numer_seryjny") and dev["numer_seryjny"].upper() in clean_code.upper():
            return dev
        if dev.get("kod_kreskowy") and dev["kod_kreskowy"].upper() in clean_code.upper():
            return dev
        if dev.get("kod_qr") and dev["kod_qr"].upper() in clean_code.upper():
            return dev
    
    raise HTTPException(status_code=404, detail="Nie znaleziono urządzenia")

# ==================== INSTALLATIONS ====================

@api_router.post("/installations")
async def create_installation(request: Request, user: dict = Depends(require_user)):
    """Record device installation"""
    body = await request.json()
    
    device_id = body.get("device_id")
    if not device_id:
        raise HTTPException(status_code=400, detail="Wymagane device_id")
    
    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Nie znaleziono urządzenia")
    
    installation = {
        "installation_id": f"inst_{uuid.uuid4().hex[:12]}",
        "device_id": device_id,
        "user_id": user["user_id"],
        "nazwa_urzadzenia": device["nazwa"],
        "data_instalacji": datetime.now(timezone.utc),
        "adres": body.get("adres"),
        "latitude": body.get("latitude"),
        "longitude": body.get("longitude"),
        "rodzaj_zlecenia": body.get("rodzaj_zlecenia", "instalacja")
    }
    
    await db.installations.insert_one(installation)
    
    await db.devices.update_one(
        {"device_id": device_id},
        {"$set": {"status": "zainstalowany"}}
    )
    
    installation.pop("_id", None)
    return installation

@api_router.get("/installations")
async def get_installations(
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    rodzaj_zlecenia: Optional[str] = None,
    current_user: dict = Depends(require_user)
):
    """Get installations with filters"""
    query = {}
    
    if user_id:
        query["user_id"] = user_id
    elif current_user.get("role") != "admin":
        query["user_id"] = current_user["user_id"]
    
    if rodzaj_zlecenia:
        query["rodzaj_zlecenia"] = rodzaj_zlecenia
    
    if date_from:
        query["data_instalacji"] = {"$gte": datetime.fromisoformat(date_from)}
    if date_to:
        if "data_instalacji" in query:
            query["data_instalacji"]["$lte"] = datetime.fromisoformat(date_to)
        else:
            query["data_instalacji"] = {"$lte": datetime.fromisoformat(date_to)}
    
    installations = await db.installations.find(query, {"_id": 0}).to_list(1000)
    return installations

@api_router.get("/installations/stats")
async def get_installation_stats(user: dict = Depends(require_user)):
    """Get installation statistics"""
    pipeline = [
        {"$group": {
            "_id": "$rodzaj_zlecenia",
            "count": {"$sum": 1}
        }}
    ]
    
    stats_by_type = await db.installations.aggregate(pipeline).to_list(100)
    
    pipeline_users = [
        {"$group": {
            "_id": "$user_id",
            "count": {"$sum": 1}
        }}
    ]
    stats_by_user = await db.installations.aggregate(pipeline_users).to_list(100)
    
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    pipeline_daily = [
        {"$match": {"data_instalacji": {"$gte": week_ago}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$data_instalacji"}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    stats_daily = await db.installations.aggregate(pipeline_daily).to_list(100)
    
    total = await db.installations.count_documents({})
    
    return {
        "total": total,
        "by_type": {item["_id"]: item["count"] for item in stats_by_type if item["_id"]},
        "by_user": {item["_id"]: item["count"] for item in stats_by_user if item["_id"]},
        "daily": stats_daily
    }

# ==================== MESSAGES / CHAT ====================

@api_router.post("/messages")
async def send_message(request: Request, user: dict = Depends(require_user)):
    """Send a message"""
    body = await request.json()
    
    message = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "sender_id": user["user_id"],
        "sender_name": user["name"],
        "content": body.get("content"),
        "attachment": body.get("attachment"),
        "attachment_type": body.get("attachment_type"),
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.messages.insert_one(message)
    message.pop("_id", None)
    return message

@api_router.get("/messages")
async def get_messages(
    limit: int = 50,
    before: Optional[str] = None,
    user: dict = Depends(require_user)
):
    """Get messages"""
    query = {}
    if before:
        query["created_at"] = {"$lt": datetime.fromisoformat(before)}
    
    messages = await db.messages.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return list(reversed(messages))

# ==================== TASKS / PLANNER ====================

@api_router.post("/tasks")
async def create_task(request: Request, admin: dict = Depends(require_admin)):
    """Create a task (admin only)"""
    body = await request.json()
    
    task = {
        "task_id": f"task_{uuid.uuid4().hex[:12]}",
        "title": body.get("title"),
        "description": body.get("description"),
        "assigned_to": body.get("assigned_to"),
        "assigned_by": admin["user_id"],
        "due_date": datetime.fromisoformat(body.get("due_date")) if body.get("due_date") else datetime.now(timezone.utc),
        "status": "oczekujace",
        "priority": body.get("priority", "normalne"),
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.tasks.insert_one(task)
    task.pop("_id", None)
    return task

@api_router.get("/tasks")
async def get_tasks(
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    user: dict = Depends(require_user)
):
    """Get tasks"""
    query = {}
    
    if status:
        query["status"] = status
    
    if user.get("role") != "admin":
        query["assigned_to"] = user["user_id"]
    elif assigned_to:
        query["assigned_to"] = assigned_to
    
    tasks = await db.tasks.find(query, {"_id": 0}).sort("due_date", 1).to_list(1000)
    return tasks

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, request: Request, user: dict = Depends(require_user)):
    """Update task status"""
    body = await request.json()
    
    update_data = {}
    if "status" in body:
        update_data["status"] = body["status"]
    if "title" in body and user.get("role") == "admin":
        update_data["title"] = body["title"]
    if "description" in body and user.get("role") == "admin":
        update_data["description"] = body["description"]
    if "due_date" in body and user.get("role") == "admin":
        update_data["due_date"] = datetime.fromisoformat(body["due_date"])
    if "priority" in body and user.get("role") == "admin":
        update_data["priority"] = body["priority"]
    
    result = await db.tasks.update_one(
        {"task_id": task_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Nie znaleziono zadania")
    
    return {"message": "Zadanie zaktualizowane"}

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, admin: dict = Depends(require_admin)):
    """Delete task (admin only)"""
    result = await db.tasks.delete_one({"task_id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nie znaleziono zadania")
    return {"message": "Zadanie usunięte"}

# ==================== DAILY REPORT ====================

@api_router.get("/report/daily")
async def get_daily_report(user: dict = Depends(require_user)):
    """Get daily installations report"""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)
    
    installations = await db.installations.find(
        {"data_instalacji": {"$gte": today, "$lt": tomorrow}},
        {"_id": 0}
    ).to_list(1000)
    
    by_user = {}
    for inst in installations:
        uid = inst["user_id"]
        if uid not in by_user:
            by_user[uid] = []
        by_user[uid].append(inst)
    
    report = []
    for uid, insts in by_user.items():
        user_doc = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
        report.append({
            "user_id": uid,
            "user_name": user_doc["name"] if user_doc else "Nieznany",
            "count": len(insts),
            "installations": insts
        })
    
    return {
        "date": today.isoformat(),
        "total": len(installations),
        "by_user": report
    }

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "Magazyn ITS Kielce API", "status": "ok"}

@api_router.get("/health")
async def health():
    return {"status": "ok"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
