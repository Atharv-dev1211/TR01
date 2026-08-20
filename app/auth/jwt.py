import jwt
from fastapi import HTTPException, status
from app.config import settings

def verify_jwt_token(token: str) -> dict:
    """
    Validates a Bearer token using local HS256 JWT decoding.
    Supports mock tokens for the test suites.
    """
    # Check for testing overrides
    if token == "mock-token-student":
        return {"uid": "usr-student-demo", "email": "student@queuecraft.edu", "name": "Demo Student", "role": "STUDENT"}
    if token == "mock-token-staff":
        return {"uid": "usr-staff-rudresh", "email": "rudresh@queuecraft.edu", "name": "Rudresh", "role": "STAFF"}
    if token == "mock-token-admin":
        return {"uid": "usr-admin-demo", "email": "admin@queuecraft.edu", "name": "System Admin", "role": "ADMIN"}

    # Attempt to decode as local HS256 JWT
    try:
        decoded = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return {
            "uid": decoded.get("id"),
            "email": decoded.get("email"),
            "name": decoded.get("name"),
            "role": decoded.get("role")
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired access token: {str(e)}"
        )
