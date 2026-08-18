import json
import jwt
import firebase_admin
from firebase_admin import credentials, auth
from fastapi import HTTPException, status
from app.config import settings

# Track initialization status
_firebase_initialized = False

def initialize_firebase() -> None:
    """
    Initializes the Firebase Admin SDK using credential sources from the settings.
    Falls back to mock mode if settings.mock_auth is True and no credentials exist.
    """
    global _firebase_initialized
    if _firebase_initialized:
        return

    # Allow bypassing Firebase Admin init entirely if mock mode is on and no credentials are provided
    if settings.mock_auth and not settings.firebase_credentials_path and not settings.firebase_credentials_json:
        print("[Firebase] Running in mock authentication mode. Skipping Firebase SDK init.")
        _firebase_initialized = True
        return

    try:
        if settings.firebase_credentials_json:
            cred_dict = json.loads(settings.firebase_credentials_json)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            print("[Firebase] Initialized using credentials JSON from configuration.")
        elif settings.firebase_credentials_path:
            cred = credentials.Certificate(settings.firebase_credentials_path)
            firebase_admin.initialize_app(cred)
            print(f"[Firebase] Initialized using credentials path: {settings.firebase_credentials_path}")
        else:
            # Fallback to default application credentials
            try:
                firebase_admin.initialize_app()
                print("[Firebase] Initialized using default application credentials.")
            except Exception as e:
                if settings.mock_auth:
                    print(f"[Firebase] Default credentials initialization failed: {e}. Falling back to mock auth.")
                else:
                    raise e
        _firebase_initialized = True
    except Exception as e:
        print(f"[Firebase] Failed to initialize: {e}")
        if not settings.mock_auth:
            raise e

def verify_firebase_token(token: str) -> dict:
    """
    Validates a Bearer token.
    If mock_auth is enabled, handles mock tokens or decodes local JWTs.
    Otherwise, invokes the Firebase Admin SDK token verification.
    """
    initialize_firebase()

    if settings.mock_auth:
        # Check for specific testing overrides
        if token == "mock-token-student":
            return {"uid": "usr-student-demo", "email": "student@queuecraft.edu", "name": "Demo Student"}
        if token == "mock-token-staff":
            return {"uid": "usr-staff-rudresh", "email": "rudresh@queuecraft.edu", "name": "Rudresh"}
        if token == "mock-token-admin":
            return {"uid": "usr-admin-demo", "email": "admin@queuecraft.edu", "name": "System Admin"}

        # Attempt to decode as local HS256 JWT (signed by prototype auth route)
        try:
            decoded = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
            return {
                "uid": decoded.get("id"),
                "email": decoded.get("email"),
                "name": decoded.get("name"),
                "role": decoded.get("role")
            }
        except Exception:
            pass

    # Real Firebase Admin verification
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired access token: {str(e)}"
        )
