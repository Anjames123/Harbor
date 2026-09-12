import os
import json
from urllib.request import Request, urlopen
from datetime import UTC, datetime, timedelta
from uuid import uuid4

REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106"


def _storage_location(object_name: str) -> tuple[str, str]:
    private_dir = os.environ.get("PRIVATE_OBJECT_DIR", "").strip().rstrip("/")
    if not private_dir.startswith("/"):
        raise RuntimeError("Object storage is not configured")
    parts = f"{private_dir}/{object_name}".strip("/").split("/", 1)
    if len(parts) != 2:
        raise RuntimeError("Object storage path is invalid")
    return parts[0], parts[1]


def _sign_object_url(object_name: str, method: str) -> str:
    bucket_name, object_name = _storage_location(object_name)
    expires_at = (datetime.now(UTC) + timedelta(minutes=15)).isoformat()
    request = Request(
        f"{REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url",
        method="POST",
        headers={"Content-Type": "application/json"},
        data=json.dumps(
            {
                "bucket_name": bucket_name,
                "object_name": object_name,
                "method": method,
                "expires_at": expires_at,
            }
        ).encode(),
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
    except Exception as exc:
        raise RuntimeError("Object storage signing is unavailable") from exc
    signed_url = payload.get("signed_url")
    if not signed_url:
        raise RuntimeError("Object storage did not return a signed URL")
    return signed_url


def create_upload_url(content_type: str) -> tuple[str, str]:
    del content_type
    object_name = f"uploads/{uuid4()}"
    return _sign_object_url(object_name, "PUT"), f"/objects/{object_name}"


def create_download_url(object_path: str) -> str:
    if not object_path.startswith("/objects/"):
        raise ValueError("Invalid object path")
    return _sign_object_url(object_path.removeprefix("/objects/"), "GET")