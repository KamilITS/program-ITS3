#!/usr/bin/env python3
"""
Backend API Testing for Magazyn ITS Kielce
Tests all backend endpoints with proper authentication and data setup
"""

import requests
import json
import os
import subprocess
from datetime import datetime, timezone
import uuid

# Get backend URL from frontend .env
BACKEND_URL = "https://inventory-plus-101.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

# Test data
TEST_USER_ID = "user_test123"
TEST_SESSION_TOKEN = "test_session_token_123"
TEST_DEVICE_ID = "dev_test123"

class BackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {TEST_SESSION_TOKEN}'
        })
        self.test_results = []
        
    def log_result(self, test_name, success, message="", response=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            'test': test_name,
            'status': status,
            'message': message,
            'response_code': response.status_code if response else None
        }
        self.test_results.append(result)
        print(f"{status}: {test_name} - {message}")
        if response and not success:
            print(f"   Response: {response.text[:200]}")
    
    def setup_test_data(self):
        """Setup test data in MongoDB"""
        print("🔧 Setting up test data in MongoDB...")
        
        # Create test user and session
        user_setup = f"""
        mongosh --eval "
        use('test_database');
        var userId = '{TEST_USER_ID}';
        var sessionToken = '{TEST_SESSION_TOKEN}';
        db.users.deleteMany({{'user_id': userId}});
        db.user_sessions.deleteMany({{'user_id': userId}});
        db.users.insertOne({{
          user_id: userId,
          email: 'test@example.com',
          name: 'Test Admin',
          role: 'admin',
          created_at: new Date()
        }});
        db.user_sessions.insertOne({{
          user_id: userId,
          session_token: sessionToken,
          expires_at: new Date(Date.now() + 7*24*60*60*1000),
          created_at: new Date()
        }});
        print('Created test user with session token: ' + sessionToken);
        "
        """
        
        # Create test device
        device_setup = f"""
        mongosh --eval "
        use('test_database');
        db.devices.deleteMany({{'device_id': '{TEST_DEVICE_ID}'}});
        db.devices.insertOne({{
          device_id: '{TEST_DEVICE_ID}',
          nazwa: 'Router testowy',
          numer_seryjny: 'SN123456',
          kod_kreskowy: '1234567890',
          kod_qr: 'QR123456',
          status: 'dostepny',
          created_at: new Date()
        }});
        print('Created test device');
        "
        """
        
        try:
            subprocess.run(user_setup, shell=True, check=True, capture_output=True)
            subprocess.run(device_setup, shell=True, check=True, capture_output=True)
            print("✅ Test data setup completed")
            return True
        except subprocess.CalledProcessError as e:
            print(f"❌ Failed to setup test data: {e}")
            return False
    
    def test_health_endpoints(self):
        """Test health check endpoints"""
        print("\n🏥 Testing Health Check Endpoints...")
        
        # Test root endpoint
        try:
            response = requests.get(f"{API_BASE}/")
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "status" in data:
                    self.log_result("GET /api/", True, "Root endpoint working", response)
                else:
                    self.log_result("GET /api/", False, "Invalid response format", response)
            else:
                self.log_result("GET /api/", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/", False, f"Request failed: {str(e)}")
        
        # Test health endpoint
        try:
            response = requests.get(f"{API_BASE}/health")
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "ok":
                    self.log_result("GET /api/health", True, "Health check working", response)
                else:
                    self.log_result("GET /api/health", False, "Invalid health status", response)
            else:
                self.log_result("GET /api/health", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/health", False, f"Request failed: {str(e)}")
    
    def test_device_management(self):
        """Test device management endpoints"""
        print("\n📱 Testing Device Management Endpoints...")
        
        # Test get devices
        try:
            response = self.session.get(f"{API_BASE}/devices")
            if response.status_code == 200:
                devices = response.json()
                if isinstance(devices, list):
                    self.log_result("GET /api/devices", True, f"Retrieved {len(devices)} devices", response)
                else:
                    self.log_result("GET /api/devices", False, "Response is not a list", response)
            else:
                self.log_result("GET /api/devices", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/devices", False, f"Request failed: {str(e)}")
        
        # Test scan device by code
        try:
            response = self.session.get(f"{API_BASE}/devices/scan/1234567890")
            if response.status_code == 200:
                device = response.json()
                if device.get("device_id") == TEST_DEVICE_ID:
                    self.log_result("GET /api/devices/scan/{code}", True, "Device found by barcode", response)
                else:
                    self.log_result("GET /api/devices/scan/{code}", False, "Wrong device returned", response)
            else:
                self.log_result("GET /api/devices/scan/{code}", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/devices/scan/{code}", False, f"Request failed: {str(e)}")
        
        # Test scan by QR code
        try:
            response = self.session.get(f"{API_BASE}/devices/scan/QR123456")
            if response.status_code == 200:
                device = response.json()
                if device.get("device_id") == TEST_DEVICE_ID:
                    self.log_result("GET /api/devices/scan/{qr_code}", True, "Device found by QR code", response)
                else:
                    self.log_result("GET /api/devices/scan/{qr_code}", False, "Wrong device returned", response)
            else:
                self.log_result("GET /api/devices/scan/{qr_code}", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/devices/scan/{qr_code}", False, f"Request failed: {str(e)}")
        
        # Test scan by serial number
        try:
            response = self.session.get(f"{API_BASE}/devices/scan/SN123456")
            if response.status_code == 200:
                device = response.json()
                if device.get("device_id") == TEST_DEVICE_ID:
                    self.log_result("GET /api/devices/scan/{serial}", True, "Device found by serial number", response)
                else:
                    self.log_result("GET /api/devices/scan/{serial}", False, "Wrong device returned", response)
            else:
                self.log_result("GET /api/devices/scan/{serial}", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/devices/scan/{serial}", False, f"Request failed: {str(e)}")
        
        # Test get single device
        try:
            response = self.session.get(f"{API_BASE}/devices/{TEST_DEVICE_ID}")
            if response.status_code == 200:
                device = response.json()
                if device.get("device_id") == TEST_DEVICE_ID:
                    self.log_result("GET /api/devices/{id}", True, "Single device retrieved", response)
                else:
                    self.log_result("GET /api/devices/{id}", False, "Wrong device returned", response)
            else:
                self.log_result("GET /api/devices/{id}", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/devices/{id}", False, f"Request failed: {str(e)}")
    
    def test_installation_recording(self):
        """Test installation recording endpoints"""
        print("\n🔧 Testing Installation Recording Endpoints...")
        
        # Test create installation
        installation_data = {
            "device_id": TEST_DEVICE_ID,
            "adres": "ul. Testowa 123, Kielce",
            "latitude": 50.8661,
            "longitude": 20.6286,
            "rodzaj_zlecenia": "instalacja"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/installations", json=installation_data)
            if response.status_code == 200:
                installation = response.json()
                if installation.get("device_id") == TEST_DEVICE_ID:
                    self.log_result("POST /api/installations", True, "Installation recorded successfully", response)
                    # Store installation ID for later tests
                    self.test_installation_id = installation.get("installation_id")
                else:
                    self.log_result("POST /api/installations", False, "Invalid installation data", response)
            else:
                self.log_result("POST /api/installations", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("POST /api/installations", False, f"Request failed: {str(e)}")
        
        # Test get installations
        try:
            response = self.session.get(f"{API_BASE}/installations")
            if response.status_code == 200:
                installations = response.json()
                if isinstance(installations, list):
                    self.log_result("GET /api/installations", True, f"Retrieved {len(installations)} installations", response)
                else:
                    self.log_result("GET /api/installations", False, "Response is not a list", response)
            else:
                self.log_result("GET /api/installations", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/installations", False, f"Request failed: {str(e)}")
        
        # Test installation statistics
        try:
            response = self.session.get(f"{API_BASE}/installations/stats")
            if response.status_code == 200:
                stats = response.json()
                if "total" in stats and "by_type" in stats:
                    self.log_result("GET /api/installations/stats", True, f"Stats retrieved - Total: {stats['total']}", response)
                else:
                    self.log_result("GET /api/installations/stats", False, "Invalid stats format", response)
            else:
                self.log_result("GET /api/installations/stats", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/installations/stats", False, f"Request failed: {str(e)}")
    
    def test_chat_messages(self):
        """Test chat message endpoints"""
        print("\n💬 Testing Chat Message Endpoints...")
        
        # Test send message
        message_data = {
            "content": "Test message from backend testing",
            "attachment": None,
            "attachment_type": None
        }
        
        try:
            response = self.session.post(f"{API_BASE}/messages", json=message_data)
            if response.status_code == 200:
                message = response.json()
                if message.get("content") == message_data["content"]:
                    self.log_result("POST /api/messages", True, "Message sent successfully", response)
                else:
                    self.log_result("POST /api/messages", False, "Invalid message data", response)
            else:
                self.log_result("POST /api/messages", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("POST /api/messages", False, f"Request failed: {str(e)}")
        
        # Test get messages
        try:
            response = self.session.get(f"{API_BASE}/messages")
            if response.status_code == 200:
                messages = response.json()
                if isinstance(messages, list):
                    self.log_result("GET /api/messages", True, f"Retrieved {len(messages)} messages", response)
                else:
                    self.log_result("GET /api/messages", False, "Response is not a list", response)
            else:
                self.log_result("GET /api/messages", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/messages", False, f"Request failed: {str(e)}")
    
    def test_tasks_management(self):
        """Test task management endpoints"""
        print("\n📋 Testing Task Management Endpoints...")
        
        # Test create task
        task_data = {
            "title": "Test Task",
            "description": "This is a test task created during backend testing",
            "assigned_to": TEST_USER_ID,
            "due_date": datetime.now(timezone.utc).isoformat(),
            "priority": "wysokie"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/tasks", json=task_data)
            if response.status_code == 200:
                task = response.json()
                if task.get("title") == task_data["title"]:
                    self.log_result("POST /api/tasks", True, "Task created successfully", response)
                    self.test_task_id = task.get("task_id")
                else:
                    self.log_result("POST /api/tasks", False, "Invalid task data", response)
            else:
                self.log_result("POST /api/tasks", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("POST /api/tasks", False, f"Request failed: {str(e)}")
        
        # Test get tasks
        try:
            response = self.session.get(f"{API_BASE}/tasks")
            if response.status_code == 200:
                tasks = response.json()
                if isinstance(tasks, list):
                    self.log_result("GET /api/tasks", True, f"Retrieved {len(tasks)} tasks", response)
                else:
                    self.log_result("GET /api/tasks", False, "Response is not a list", response)
            else:
                self.log_result("GET /api/tasks", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/tasks", False, f"Request failed: {str(e)}")
        
        # Test update task (if we have a task ID)
        if hasattr(self, 'test_task_id'):
            update_data = {"status": "w_trakcie"}
            try:
                response = self.session.put(f"{API_BASE}/tasks/{self.test_task_id}", json=update_data)
                if response.status_code == 200:
                    self.log_result("PUT /api/tasks/{id}", True, "Task updated successfully", response)
                else:
                    self.log_result("PUT /api/tasks/{id}", False, f"Status code: {response.status_code}", response)
            except Exception as e:
                self.log_result("PUT /api/tasks/{id}", False, f"Request failed: {str(e)}")
            
            # Test delete task
            try:
                response = self.session.delete(f"{API_BASE}/tasks/{self.test_task_id}")
                if response.status_code == 200:
                    self.log_result("DELETE /api/tasks/{id}", True, "Task deleted successfully", response)
                else:
                    self.log_result("DELETE /api/tasks/{id}", False, f"Status code: {response.status_code}", response)
            except Exception as e:
                self.log_result("DELETE /api/tasks/{id}", False, f"Request failed: {str(e)}")
    
    def test_user_management(self):
        """Test user management endpoints"""
        print("\n👥 Testing User Management Endpoints...")
        
        # Test get current user
        try:
            response = self.session.get(f"{API_BASE}/auth/me")
            if response.status_code == 200:
                user = response.json()
                if user.get("user_id") == TEST_USER_ID:
                    self.log_result("GET /api/auth/me", True, "Current user retrieved", response)
                else:
                    self.log_result("GET /api/auth/me", False, "Wrong user returned", response)
            else:
                self.log_result("GET /api/auth/me", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/auth/me", False, f"Request failed: {str(e)}")
        
        # Test get all users (admin only)
        try:
            response = self.session.get(f"{API_BASE}/users")
            if response.status_code == 200:
                users = response.json()
                if isinstance(users, list):
                    self.log_result("GET /api/users", True, f"Retrieved {len(users)} users", response)
                else:
                    self.log_result("GET /api/users", False, "Response is not a list", response)
            else:
                self.log_result("GET /api/users", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/users", False, f"Request failed: {str(e)}")
        
        # Test get workers
        try:
            response = self.session.get(f"{API_BASE}/workers")
            if response.status_code == 200:
                workers = response.json()
                if isinstance(workers, list):
                    self.log_result("GET /api/workers", True, f"Retrieved {len(workers)} workers", response)
                else:
                    self.log_result("GET /api/workers", False, "Response is not a list", response)
            else:
                self.log_result("GET /api/workers", False, f"Status code: {response.status_code}", response)
        except Exception as e:
            self.log_result("GET /api/workers", False, f"Request failed: {str(e)}")
    
    def test_authentication_required(self):
        """Test that endpoints require authentication"""
        print("\n🔐 Testing Authentication Requirements...")
        
        # Create session without auth headers
        no_auth_session = requests.Session()
        no_auth_session.headers.update({'Content-Type': 'application/json'})
        
        # Test endpoints that should require auth
        auth_required_endpoints = [
            ("GET", "/devices"),
            ("GET", "/installations"),
            ("POST", "/messages"),
            ("GET", "/tasks"),
            ("GET", "/users")
        ]
        
        for method, endpoint in auth_required_endpoints:
            try:
                if method == "GET":
                    response = no_auth_session.get(f"{API_BASE}{endpoint}")
                elif method == "POST":
                    response = no_auth_session.post(f"{API_BASE}{endpoint}", json={})
                
                if response.status_code == 401:
                    self.log_result(f"Auth Required: {method} {endpoint}", True, "Correctly requires authentication", response)
                else:
                    self.log_result(f"Auth Required: {method} {endpoint}", False, f"Should return 401, got {response.status_code}", response)
            except Exception as e:
                self.log_result(f"Auth Required: {method} {endpoint}", False, f"Request failed: {str(e)}")
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Backend API Tests for Magazyn ITS Kielce")
        print(f"Backend URL: {BACKEND_URL}")
        print(f"API Base: {API_BASE}")
        
        # Setup test data
        if not self.setup_test_data():
            print("❌ Failed to setup test data. Aborting tests.")
            return False
        
        # Run all test suites
        self.test_health_endpoints()
        self.test_device_management()
        self.test_installation_recording()
        self.test_chat_messages()
        self.test_tasks_management()
        self.test_user_management()
        self.test_authentication_required()
        
        # Print summary
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        
        passed = sum(1 for result in self.test_results if "✅ PASS" in result['status'])
        failed = sum(1 for result in self.test_results if "❌ FAIL" in result['status'])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if "❌ FAIL" in result['status']:
                    print(f"  - {result['test']}: {result['message']}")
        
        return failed == 0

if __name__ == "__main__":
    tester = BackendTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)