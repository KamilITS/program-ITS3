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
from datetime import datetime, timezone
import httpx
import openpyxl
from io import BytesIO
import base64

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

# ==================== MODELS ====================

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "pracownik"  # admin lub pracownik
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Device(BaseModel):
    device_id: str = Field(default_factory=lambda: f"dev_{uuid.uuid4().hex[:12]}")
    nazwa: str
    numer_seryjny: str
    kod_kreskowy: Optional[str] = None
    kod_qr: Optional[str] = None
    przypisany_do: Optional[str] = None  # user_id pracownika
    status: str = "dostepny"  # dostepny, przypisany, zainstalowany
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DeviceInstallation(BaseModel):
    installation_id: str = Field(default_factory=lambda: f"inst_{uuid.uuid4().hex[:12]}")
    device_id: str
    user_id: str  # kto zainstalował
    nazwa_urzadzenia: str
    data_instalacji: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    adres: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    rodzaj_zlecenia: str  # instalacja, wymiana, awaria, uszkodzony

class Message(BaseModel):
    message_id: str = Field(default_factory=lambda: f"msg_{uuid.uuid4().hex[:12]}")
    sender_id: str
    sender_name: str
    content: Optional[str] = None
    attachment: Optional[str] = None  # base64 image
    attachment_type: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Task(BaseModel):
    task_id: str = Field(default_factory=lambda: f"task_{uuid.uuid4().hex[:12]}")
    title: str
    description: Optional[str] = None
    assigned_to: str  # user_id
    assigned_by: str  # user_id (admin)
    due_date: datetime
    status: str = "oczekujace"  # oczekujace, w_trakcie, zakonczone
    priority: str = "normalne"  # niskie, normalne, wysokie, pilne
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

async def get_current_user(request: Request) -> Optional[User]:
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
    
    # Check expiry with timezone handling
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        return None
    
    user_doc = await db.users.find_one(
        {"user_id": session["user_id"]},
        {"_id": 0}
    )
    if user_doc:
        return User(**user_doc)
    return None

async def require_user(request: Request) -> User:
    """Require authenticated user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Nie zalogowany")
    return user

async def require_admin(request: Request) -> User:
    """Require admin user"""
    user = await require_user(request)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Brak uprawnień administratora")
    return user

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange session_id for session data"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="Brak session_id")
    
    # Exchange with Emergent Auth
    async with httpx.AsyncClient() as client_http:
        auth_response = await client_http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
    
    if auth_response.status_code != 200:
        raise HTTPException(status_code=401, detail="Nieprawidłowa sesja")
    
    user_data = auth_response.json()
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    
    # Check if user exists
    existing_user = await db.users.find_one(
        {"email": user_data["email"]},
        {"_id": 0}
    )
    
    if existing_user:
        user_id = existing_user["user_id"]
        role = existing_user.get("role", "pracownik")
    else:
        # Create new user - first user is admin
        users_count = await db.users.count_documents({})
        role = "admin" if users_count == 0 else "pracownik"
        
        new_user = {
            "user_id": user_id,
            "email": user_data["email"],
            "name": user_data["name"],
            "picture": user_data.get("picture"),
            "role": role,
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(new_user)
    
    # Create session
    session_token = user_data["session_token"]
    expires_at = datetime.now(timezone.utc).replace(day=datetime.now().day + 7)
    
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Set cookie
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
        "user_id": user_id,
        "email": user_data["email"],
        "name": user_data["name"],
        "picture": user_data.get("picture"),
        "role": role,
        "session_token": session_token
    }

@api_router.get("/auth/me")
async def get_me(user: User = Depends(require_user)):
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

# ==================== USER MANAGEMENT ====================

@api_router.get("/users")
async def get_users(admin: User = Depends(require_admin)):
    """Get all users (admin only)"""
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    return users

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, request: Request, admin: User = Depends(require_admin)):
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

@api_router.get("/workers")
async def get_workers(user: User = Depends(require_user)):
    """Get all workers (pracownik role)"""
    workers = await db.users.find({"role": "pracownik"}, {"_id": 0}).to_list(1000)
    return workers

# ==================== DEVICE MANAGEMENT ====================

@api_router.post("/devices/import")
async def import_devices(file: UploadFile = File(...), admin: User = Depends(require_admin)):
    """Import devices from XLSX file"""
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Tylko pliki XLSX są obsługiwane")
    
    content = await file.read()
    wb = openpyxl.load_workbook(BytesIO(content))
    ws = wb.active
    
    devices_imported = 0
    errors = []
    
    # Assuming headers in first row: nazwa, numer_seryjny, kod_kreskowy, kod_qr
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
            
            # Check if device with same serial number exists
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
    user: User = Depends(require_user)
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
async def get_device(device_id: str, user: User = Depends(require_user)):
    """Get single device"""
    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Nie znaleziono urządzenia")
    return device

@api_router.post("/devices/{device_id}/assign")
async def assign_device(device_id: str, request: Request, admin: User = Depends(require_admin)):
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
async def scan_device(code: str, user: User = Depends(require_user)):
    """Find device by barcode or QR code"""
    device = await db.devices.find_one(
        {"$or": [{"kod_kreskowy": code}, {"kod_qr": code}, {"numer_seryjny": code}]},
        {"_id": 0}
    )
    if not device:
        raise HTTPException(status_code=404, detail="Nie znaleziono urządzenia")
    return device

# ==================== INSTALLATIONS ====================

@api_router.post("/installations")
async def create_installation(request: Request, user: User = Depends(require_user)):
    """Record device installation"""
    body = await request.json()
    
    device_id = body.get("device_id")
    if not device_id:
        raise HTTPException(status_code=400, detail="Wymagane device_id")
    
    # Verify device exists and is assigned to user
    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Nie znaleziono urządzenia")
    
    installation = {
        "installation_id": f"inst_{uuid.uuid4().hex[:12]}",
        "device_id": device_id,
        "user_id": user.user_id,
        "nazwa_urzadzenia": device["nazwa"],
        "data_instalacji": datetime.now(timezone.utc),
        "adres": body.get("adres"),
        "latitude": body.get("latitude"),
        "longitude": body.get("longitude"),
        "rodzaj_zlecenia": body.get("rodzaj_zlecenia", "instalacja")
    }
    
    result = await db.installations.insert_one(installation)
    
    # Update device status
    await db.devices.update_one(
        {"device_id": device_id},
        {"$set": {"status": "zainstalowany"}}
    )
    
    # Return the installation without _id
    return {k: v for k, v in installation.items() if k != "_id"}

@api_router.get("/installations")
async def get_installations(
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    rodzaj_zlecenia: Optional[str] = None,
    current_user: User = Depends(require_user)
):
    """Get installations with filters"""
    query = {}
    
    if user_id:
        query["user_id"] = user_id
    elif current_user.role != "admin":
        query["user_id"] = current_user.user_id
    
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
async def get_installation_stats(user: User = Depends(require_user)):
    """Get installation statistics"""
    pipeline = [
        {"$group": {
            "_id": "$rodzaj_zlecenia",
            "count": {"$sum": 1}
        }}
    ]
    
    stats_by_type = await db.installations.aggregate(pipeline).to_list(100)
    
    # Stats by user
    pipeline_users = [
        {"$group": {
            "_id": "$user_id",
            "count": {"$sum": 1}
        }}
    ]
    stats_by_user = await db.installations.aggregate(pipeline_users).to_list(100)
    
    # Daily stats (last 7 days)
    from datetime import timedelta
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
        "by_type": {item["_id"]: item["count"] for item in stats_by_type},
        "by_user": {item["_id"]: item["count"] for item in stats_by_user},
        "daily": stats_daily
    }

# ==================== MESSAGES / CHAT ====================

@api_router.post("/messages")
async def send_message(request: Request, user: User = Depends(require_user)):
    """Send a message"""
    body = await request.json()
    
    message = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "sender_id": user.user_id,
        "sender_name": user.name,
        "content": body.get("content"),
        "attachment": body.get("attachment"),
        "attachment_type": body.get("attachment_type"),
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.messages.insert_one(message)
    return {k: v for k, v in message.items() if k != "_id"}

@api_router.get("/messages")
async def get_messages(
    limit: int = 50,
    before: Optional[str] = None,
    user: User = Depends(require_user)
):
    """Get messages"""
    query = {}
    if before:
        query["created_at"] = {"$lt": datetime.fromisoformat(before)}
    
    messages = await db.messages.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return list(reversed(messages))

# ==================== TASKS / PLANNER ====================

@api_router.post("/tasks")
async def create_task(request: Request, admin: User = Depends(require_admin)):
    """Create a task (admin only)"""
    body = await request.json()
    
    task = {
        "task_id": f"task_{uuid.uuid4().hex[:12]}",
        "title": body.get("title"),
        "description": body.get("description"),
        "assigned_to": body.get("assigned_to"),
        "assigned_by": admin.user_id,
        "due_date": datetime.fromisoformat(body.get("due_date")) if body.get("due_date") else datetime.now(timezone.utc),
        "status": "oczekujace",
        "priority": body.get("priority", "normalne"),
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.tasks.insert_one(task)
    return {k: v for k, v in task.items() if k != "_id"}

@api_router.get("/tasks")
async def get_tasks(
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    user: User = Depends(require_user)
):
    """Get tasks"""
    query = {}
    
    if status:
        query["status"] = status
    
    if user.role != "admin":
        query["assigned_to"] = user.user_id
    elif assigned_to:
        query["assigned_to"] = assigned_to
    
    tasks = await db.tasks.find(query, {"_id": 0}).sort("due_date", 1).to_list(1000)
    return tasks

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, request: Request, user: User = Depends(require_user)):
    """Update task status"""
    body = await request.json()
    
    update_data = {}
    if "status" in body:
        update_data["status"] = body["status"]
    if "title" in body and user.role == "admin":
        update_data["title"] = body["title"]
    if "description" in body and user.role == "admin":
        update_data["description"] = body["description"]
    if "due_date" in body and user.role == "admin":
        update_data["due_date"] = datetime.fromisoformat(body["due_date"])
    if "priority" in body and user.role == "admin":
        update_data["priority"] = body["priority"]
    
    result = await db.tasks.update_one(
        {"task_id": task_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Nie znaleziono zadania")
    
    return {"message": "Zadanie zaktualizowane"}

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, admin: User = Depends(require_admin)):
    """Delete task (admin only)"""
    result = await db.tasks.delete_one({"task_id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nie znaleziono zadania")
    return {"message": "Zadanie usunięte"}

# ==================== DAILY REPORT ====================

@api_router.get("/report/daily")
async def get_daily_report(user: User = Depends(require_user)):
    """Get daily installations report"""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today.replace(day=today.day + 1)
    
    installations = await db.installations.find(
        {"data_instalacji": {"$gte": today, "$lt": tomorrow}},
        {"_id": 0}
    ).to_list(1000)
    
    # Group by user
    by_user = {}
    for inst in installations:
        uid = inst["user_id"]
        if uid not in by_user:
            by_user[uid] = []
        by_user[uid].append(inst)
    
    # Get user names
    report = []
    for uid, insts in by_user.items():
        user_doc = await db.users.find_one({"user_id": uid}, {"_id": 0})
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
