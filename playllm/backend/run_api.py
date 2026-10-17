from __future__ import annotations

import json
import base64
import hashlib
import hmac
import os
import re
import secrets
import shutil
import threading
import time
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import unquote

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("PLAYLLM_DATA_DIR", ROOT_DIR / "server-data")).resolve()
USERS_DIR = DATA_DIR / "users"
GRAPHS_DIR = DATA_DIR / "graphs"
LEGACY_ARCHIVE_DIR = DATA_DIR / "legacy-archive"
HOST = os.environ.get("PLAYLLM_HOST", "127.0.0.1")
PORT = int(os.environ.get("PLAYLLM_PORT", "3001"))
PUBLIC_USER_ID = os.environ.get("PLAYLLM_PUBLIC_USER", "public")
SESSION_COOKIE = "playllm_session"
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
PASSWORD_ITERATIONS = 600_000

_graph_list_cache: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
_CACHE_TTL = 2.0
_sessions: Dict[str, tuple[str, float]] = {}
_login_attempts: Dict[str, List[float]] = {}
_auth_lock = threading.Lock()


class ApiError(Exception):
    def __init__(self, status: int, message: str, code: str = "request_failed") -> None:
        super().__init__(message)
        self.status = status
        self.code = code


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_storage() -> None:
    USERS_DIR.mkdir(parents=True, exist_ok=True)
    GRAPHS_DIR.mkdir(parents=True, exist_ok=True)
    public_id = sanitize_id(PUBLIC_USER_ID)
    file_path = user_file_path(public_id)
    profile = load_json_if_exists(file_path) or {
        "id": public_id,
        "displayName": "Public",
        "updatedAt": now_iso(),
    }
    changed = not profile.get("isPublic") or "passwordHash" in profile
    if changed:
        profile["isPublic"] = True
        profile.pop("passwordHash", None)
        profile["updatedAt"] = now_iso()
        write_json_atomic(file_path, profile)


def sanitize_id(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9_-]+", "-", str(value).strip().lower()).strip("-")
    if not normalized:
        raise ValueError("A non-empty user or graph id is required")
    return normalized


def user_file_path(user_id: str) -> Path:
    return USERS_DIR / f"{sanitize_id(user_id)}.json"


def user_graph_dir(user_id: str) -> Path:
    return GRAPHS_DIR / sanitize_id(user_id)


def graph_file_path(user_id: str, graph_id: str) -> Path:
    return user_graph_dir(user_id) / f"{sanitize_id(graph_id)}.json"


def load_json_if_exists(file_path: Path) -> Optional[Dict[str, Any]]:
    if not file_path.exists():
        return None
    return json.loads(file_path.read_text("utf-8"))


def write_json_atomic(file_path: Path, payload: Dict[str, Any], *, compact: bool = True) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        content = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    else:
        content = json.dumps(payload, ensure_ascii=False, indent=2)
    tmp_path = file_path.with_suffix(file_path.suffix + ".tmp")
    tmp_path.write_text(content, encoding="utf-8")
    tmp_path.chmod(0o600)
    tmp_path.replace(file_path)


def ensure_user_profile(user_id: str) -> None:
    normalized_user_id = sanitize_id(user_id)
    file_path = user_file_path(normalized_user_id)
    if file_path.exists():
        return
    profile = {
        "id": normalized_user_id,
        "displayName": normalized_user_id,
        "isPublic": normalized_user_id == sanitize_id(PUBLIC_USER_ID),
        "updatedAt": now_iso(),
    }
    write_json_atomic(file_path, profile, compact=True)


def build_graph_summary(record: Dict[str, Any]) -> Dict[str, Any]:
    document = record.get("document", {})
    graph = document.get("graph", {})
    return {
        "id": record["id"],
        "name": record["name"],
        "userId": record["userId"],
        "updatedAt": record["updatedAt"],
        "nodeCount": len(graph.get("nodes", [])),
        "edgeCount": len(graph.get("edges", [])),
    }


def validate_document(document: Dict[str, Any]) -> None:
    if not isinstance(document, dict):
        raise ValueError("Document is required")
    if document.get("format") != "playllm-canvas":
        raise ValueError("Document format must be playllm-canvas")
    if document.get("version") not in (1, 2):
        raise ValueError("Unsupported document version")


def invalidate_graph_list_cache(user_id: str) -> None:
    _graph_list_cache.pop(sanitize_id(user_id), None)


def public_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    user_id = profile["id"]
    return {
        "id": user_id,
        "displayName": profile.get("displayName", user_id),
        "graphCount": len(list_user_graphs(user_id)),
        "updatedAt": profile.get("updatedAt", now_iso()),
        "isPublic": user_id == sanitize_id(PUBLIC_USER_ID),
        "passwordConfigured": bool(profile.get("passwordHash")),
    }


def load_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    return load_json_if_exists(user_file_path(user_id))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PASSWORD_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_text, digest_text = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_text.encode("ascii"))
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def validate_password(password: str) -> None:
    if not isinstance(password, str):
        raise ApiError(400, "Password is required", "weak_password")
    if len(password) < 8:
        raise ApiError(400, "Password must contain at least 8 characters", "weak_password")
    if len(password) > 128:
        raise ApiError(400, "Password must not exceed 128 characters", "weak_password")


def archive_legacy_workspace(user_id: str) -> None:
    normalized_id = sanitize_id(user_id)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    archive_root = LEGACY_ARCHIVE_DIR / f"{normalized_id}-{stamp}"
    archived_users_dir = archive_root / "users"
    archived_graphs_dir = archive_root / "graphs"
    archived_users_dir.mkdir(parents=True, exist_ok=False)

    profile_path = user_file_path(normalized_id)
    if profile_path.exists():
        shutil.copy2(profile_path, archived_users_dir / profile_path.name)

    graph_dir = user_graph_dir(normalized_id)
    if graph_dir.exists():
        archived_graphs_dir.mkdir(parents=True, exist_ok=True)
        graph_dir.replace(archived_graphs_dir / normalized_id)
        invalidate_graph_list_cache(normalized_id)


def register_user(user_id: str, password: str, display_name: str = "") -> Dict[str, Any]:
    normalized_id = sanitize_id(user_id)
    if normalized_id == sanitize_id(PUBLIC_USER_ID):
        raise ApiError(409, "The public account cannot be registered", "public_account")
    validate_password(password)
    file_path = user_file_path(normalized_id)
    existing = load_json_if_exists(file_path)
    if existing and existing.get("passwordHash"):
        raise ApiError(409, "This user ID is already registered", "user_exists")
    if existing:
        archive_legacy_workspace(normalized_id)

    normalized_display_name = str(display_name or "").strip()
    if len(normalized_display_name) > 80:
        raise ApiError(400, "Display name must not exceed 80 characters", "invalid_display_name")
    profile = {"id": normalized_id}
    profile.update({
        "displayName": normalized_display_name or normalized_id,
        "passwordHash": hash_password(password),
        "isPublic": False,
        "updatedAt": now_iso(),
    })
    write_json_atomic(file_path, profile)
    return public_profile(profile)


def check_login_rate_limit(key: str) -> None:
    now = time.time()
    with _auth_lock:
        attempts = [stamp for stamp in _login_attempts.get(key, []) if now - stamp < 60]
        _login_attempts[key] = attempts
        if len(attempts) >= 5:
            raise ApiError(429, "Too many sign-in attempts. Try again in one minute.", "rate_limited")


def record_login_failure(key: str) -> None:
    with _auth_lock:
        _login_attempts.setdefault(key, []).append(time.time())


def authenticate_user(user_id: str, password: str, client_key: str) -> Dict[str, Any]:
    normalized_id = sanitize_id(user_id)
    rate_key = f"{client_key}:{normalized_id}"
    check_login_rate_limit(rate_key)
    profile = load_user_profile(normalized_id)
    if not profile:
        record_login_failure(rate_key)
        raise ApiError(401, "Invalid user ID or password", "invalid_credentials")
    if normalized_id == sanitize_id(PUBLIC_USER_ID):
        return profile
    encoded = profile.get("passwordHash")
    if not encoded:
        raise ApiError(409, "This account belongs to an earlier installation. Create a new account to start with a blank workspace.", "legacy_account")
    if not verify_password(password, encoded):
        record_login_failure(rate_key)
        raise ApiError(401, "Invalid user ID or password", "invalid_credentials")
    with _auth_lock:
        _login_attempts.pop(rate_key, None)
    return profile


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    with _auth_lock:
        _sessions[token] = (sanitize_id(user_id), time.time() + SESSION_TTL_SECONDS)
    return token


def delete_session(token: Optional[str]) -> None:
    if not token:
        return
    with _auth_lock:
        _sessions.pop(token, None)


def session_user(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    with _auth_lock:
        session = _sessions.get(token)
        if not session:
            return None
        user_id, expires_at = session
        if expires_at <= time.time():
            _sessions.pop(token, None)
            return None
        return user_id


def require_user(token: Optional[str], requested_user_id: Optional[str] = None) -> str:
    user_id = session_user(token)
    if not user_id:
        raise ApiError(401, "Sign in is required", "authentication_required")
    if requested_user_id is not None and user_id != sanitize_id(requested_user_id):
        raise ApiError(403, "You do not have access to this workspace", "forbidden")
    return user_id


def list_user_graphs(user_id: str) -> list[Dict[str, Any]]:
    cache_key = sanitize_id(user_id)
    now = time.monotonic()
    if cache_key in _graph_list_cache:
        ts, cached = _graph_list_cache[cache_key]
        if now - ts < _CACHE_TTL:
            return cached

    graph_dir = user_graph_dir(user_id)
    if not graph_dir.exists():
        result: List[Dict[str, Any]] = []
        _graph_list_cache[cache_key] = (now, result)
        return result

    records = [json.loads(file_path.read_text("utf-8")) for file_path in graph_dir.glob("*.json")]
    records.sort(key=lambda item: item.get("updatedAt", ""), reverse=True)
    result = [build_graph_summary(record) for record in records]
    _graph_list_cache[cache_key] = (now, result)
    return result


def write_graph_record(user_id: str, name: str, document: Dict[str, Any]) -> Dict[str, Any]:
    normalized_user_id = sanitize_id(user_id)
    normalized_name = str(name or "").strip()
    if not normalized_name:
        raise ValueError("Graph name is required")

    validate_document(document)
    ensure_user_profile(normalized_user_id)

    graph_id = f"{sanitize_id(normalized_name)}-{int(datetime.now().timestamp() * 1000):x}"
    record = {
        "id": graph_id,
        "name": normalized_name,
        "userId": normalized_user_id,
        "updatedAt": now_iso(),
        "document": document,
    }
    write_json_atomic(graph_file_path(normalized_user_id, graph_id), record, compact=True)
    invalidate_graph_list_cache(user_id)
    return build_graph_summary(record)


def update_graph_record(user_id: str, graph_id: str, name: str, document: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    normalized_user_id = sanitize_id(user_id)
    normalized_graph_id = sanitize_id(graph_id)
    normalized_name = str(name or "").strip()
    if not normalized_name:
        raise ValueError("Graph name is required")

    file_path = graph_file_path(normalized_user_id, normalized_graph_id)
    if not file_path.exists():
        raise FileNotFoundError("Graph record not found")

    if document is not None:
        validate_document(document)
    else:
        existing = load_json_if_exists(file_path)
        if not existing:
            raise FileNotFoundError("Graph record not found")
        document = existing["document"]

    record = {
        "id": normalized_graph_id,
        "name": normalized_name,
        "userId": normalized_user_id,
        "updatedAt": now_iso(),
        "document": document,
    }
    write_json_atomic(file_path, record, compact=True)
    invalidate_graph_list_cache(user_id)
    return build_graph_summary(record)


def load_graph_record(user_id: str, graph_id: str) -> Dict[str, Any]:
    record = load_json_if_exists(graph_file_path(user_id, graph_id))
    if not record:
        raise FileNotFoundError("Graph record not found")
    return record


def delete_graph_record(user_id: str, graph_id: str) -> None:
    file_path = graph_file_path(user_id, graph_id)
    if not file_path.exists():
        raise FileNotFoundError("Graph record not found")
    file_path.unlink()
    invalidate_graph_list_cache(user_id)


def make_error_payload(error: Exception) -> tuple[int, Dict[str, str]]:
    if isinstance(error, ApiError):
        return error.status, {"error": str(error), "code": error.code}
    if isinstance(error, FileNotFoundError):
        return HTTPStatus.NOT_FOUND, {"error": str(error)}
    if isinstance(error, ValueError):
        return HTTPStatus.BAD_REQUEST, {"error": str(error)}
    return HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error) or "Unknown server error"}


class ApiHandler(BaseHTTPRequestHandler):
    server_version = "PlayLLMApi/1.0"
    protocol_version = "HTTP/1.1"

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            return json.loads(raw or "{}")
        except json.JSONDecodeError as exc:
            raise ValueError("Invalid JSON body") from exc

    def _session_token(self) -> Optional[str]:
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else None

    def _session_cookie(self, token: str, *, clear: bool = False) -> str:
        parts = [f"{SESSION_COOKIE}={token}", "Path=/", "HttpOnly", "SameSite=Strict"]
        if clear:
            parts.extend(["Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT"])
        else:
            parts.append(f"Max-Age={SESSION_TTL_SECONDS}")
        if self.headers.get("X-Forwarded-Proto") == "https":
            parts.append("Secure")
        return "; ".join(parts)

    def _send_json(self, status: int, payload: Any, *, cookie: Optional[str] = None) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "keep-alive")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def _route(self) -> None:
        path = unquote(self.path.split("?", 1)[0])
        token = self._session_token()

        if path == "/api/auth/session" and self.command == "GET":
            user_id = require_user(token)
            profile = load_user_profile(user_id)
            if not profile:
                raise ApiError(401, "Session user no longer exists", "authentication_required")
            self._send_json(200, public_profile(profile))
            return

        if path == "/api/auth/login" and self.command == "POST":
            body = self._read_json()
            profile = authenticate_user(body.get("userId", ""), body.get("password", ""), self.client_address[0])
            next_token = create_session(profile["id"])
            self._send_json(200, public_profile(profile), cookie=self._session_cookie(next_token))
            return

        if path == "/api/auth/register" and self.command == "POST":
            body = self._read_json()
            profile_payload = register_user(body.get("userId", ""), body.get("password", ""), body.get("displayName", ""))
            next_token = create_session(profile_payload["id"])
            self._send_json(201, profile_payload, cookie=self._session_cookie(next_token))
            return

        if path == "/api/auth/public" and self.command == "POST":
            profile = load_user_profile(PUBLIC_USER_ID)
            if not profile:
                raise ApiError(500, "Public account is unavailable")
            next_token = create_session(profile["id"])
            self._send_json(200, public_profile(profile), cookie=self._session_cookie(next_token))
            return

        if path == "/api/auth/logout" and self.command == "POST":
            delete_session(token)
            self._send_json(200, {"ok": True}, cookie=self._session_cookie("", clear=True))
            return

        if self.command == "GET" and path == "/api/users":
            user_id = require_user(token)
            profile = load_user_profile(user_id)
            self._send_json(200, [public_profile(profile)] if profile else [])
            return

        graph_list_match = re.fullmatch(r"/api/users/([^/]+)/graphs", path)
        if graph_list_match and self.command == "GET":
            require_user(token, graph_list_match.group(1))
            self._send_json(200, list_user_graphs(graph_list_match.group(1)))
            return
        if graph_list_match and self.command == "POST":
            require_user(token, graph_list_match.group(1))
            body = self._read_json()
            self._send_json(201, write_graph_record(graph_list_match.group(1), body.get("name", ""), body.get("document")))
            return

        graph_record_match = re.fullmatch(r"/api/users/([^/]+)/graphs/([^/]+)", path)
        if graph_record_match and self.command == "GET":
            require_user(token, graph_record_match.group(1))
            self._send_json(200, load_graph_record(graph_record_match.group(1), graph_record_match.group(2)))
            return
        if graph_record_match and self.command == "PUT":
            require_user(token, graph_record_match.group(1))
            body = self._read_json()
            self._send_json(
                200,
                update_graph_record(
                    graph_record_match.group(1),
                    graph_record_match.group(2),
                    body.get("name", ""),
                    body.get("document"),
                ),
            )
            return
        if graph_record_match and self.command == "DELETE":
            require_user(token, graph_record_match.group(1))
            delete_graph_record(graph_record_match.group(1), graph_record_match.group(2))
            self._send_json(200, {"ok": True})
            return

        self._send_json(404, {"error": "Not found"})

    def do_GET(self) -> None:  # noqa: N802
        try:
            self._route()
        except Exception as error:  # noqa: BLE001
            status, payload = make_error_payload(error)
            self._send_json(int(status), payload)

    def do_POST(self) -> None:  # noqa: N802
        self.do_GET()

    def do_PUT(self) -> None:  # noqa: N802
        self.do_GET()

    def do_DELETE(self) -> None:  # noqa: N802
        self.do_GET()

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return


def run_builtin_server() -> None:
    ensure_storage()
    try:
        server = ThreadingHTTPServer((HOST, PORT), ApiHandler)
    except OSError as error:
        if error.errno in {48, 98}:
            print(f"Port {PORT} is already in use. Try: PORT=3210 npm run api")
            raise SystemExit(1) from error
        print(f"Unable to bind http://{HOST}:{PORT}: {error}")
        raise SystemExit(1) from error

    print(f"PlayLLM API listening on http://{HOST}:{PORT} (builtin mode)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def run_fastapi_server() -> None:
    from fastapi import FastAPI, HTTPException, Request, Response
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn

    # With postponed annotations, FastAPI resolves these names from module globals.
    globals()["Request"] = Request
    globals()["Response"] = Response

    app = FastAPI(title="PlayLLM API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:3000", "http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def api_error(error: Exception) -> HTTPException:
        status, body = make_error_payload(error)
        return HTTPException(status_code=int(status), detail=body)

    def set_session_cookie(response: Response, token: str, request: Request) -> None:
        response.set_cookie(
            SESSION_COOKIE,
            token,
            max_age=SESSION_TTL_SECONDS,
            httponly=True,
            samesite="strict",
            secure=request.url.scheme == "https",
            path="/",
        )

    @app.get("/api/auth/session")
    def api_session(request: Request) -> Dict[str, Any]:
        try:
            user_id = require_user(request.cookies.get(SESSION_COOKIE))
            profile = load_user_profile(user_id)
            if not profile:
                raise ApiError(401, "Session user no longer exists", "authentication_required")
            return public_profile(profile)
        except Exception as error:  # noqa: BLE001
            raise api_error(error) from error

    @app.post("/api/auth/login")
    def api_login(payload: Dict[str, Any], request: Request, response: Response) -> Dict[str, Any]:
        try:
            client_key = request.client.host if request.client else "unknown"
            profile = authenticate_user(payload.get("userId", ""), payload.get("password", ""), client_key)
            set_session_cookie(response, create_session(profile["id"]), request)
            return public_profile(profile)
        except Exception as error:  # noqa: BLE001
            raise api_error(error) from error

    @app.post("/api/auth/register", status_code=201)
    def api_register(payload: Dict[str, Any], request: Request, response: Response) -> Dict[str, Any]:
        try:
            profile = register_user(payload.get("userId", ""), payload.get("password", ""), payload.get("displayName", ""))
            set_session_cookie(response, create_session(profile["id"]), request)
            return profile
        except Exception as error:  # noqa: BLE001
            raise api_error(error) from error

    @app.post("/api/auth/public")
    def api_public(request: Request, response: Response) -> Dict[str, Any]:
        profile = load_user_profile(PUBLIC_USER_ID)
        if not profile:
            raise HTTPException(status_code=500, detail={"error": "Public account is unavailable"})
        set_session_cookie(response, create_session(profile["id"]), request)
        return public_profile(profile)

    @app.post("/api/auth/logout")
    def api_logout(request: Request, response: Response) -> Dict[str, bool]:
        delete_session(request.cookies.get(SESSION_COOKIE))
        response.delete_cookie(SESSION_COOKIE, path="/", samesite="strict")
        return {"ok": True}

    @app.get("/api/users")
    def api_list_users(request: Request) -> list[Dict[str, Any]]:
        try:
            user_id = require_user(request.cookies.get(SESSION_COOKIE))
            profile = load_user_profile(user_id)
            return [public_profile(profile)] if profile else []
        except Exception as error:  # noqa: BLE001
            raise api_error(error) from error

    @app.get("/api/users/{user_id}/graphs")
    def api_list_graphs(user_id: str, request: Request) -> list[Dict[str, Any]]:
        try:
            require_user(request.cookies.get(SESSION_COOKIE), user_id)
            return list_user_graphs(user_id)
        except Exception as error:  # noqa: BLE001
            raise api_error(error) from error

    @app.post("/api/users/{user_id}/graphs")
    def api_create_graph(user_id: str, payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
        try:
            require_user(request.cookies.get(SESSION_COOKIE), user_id)
            return write_graph_record(user_id, payload.get("name", ""), payload.get("document"))
        except Exception as error:  # noqa: BLE001
            raise api_error(error) from error

    @app.get("/api/users/{user_id}/graphs/{graph_id}")
    def api_get_graph(user_id: str, graph_id: str, request: Request) -> Dict[str, Any]:
        try:
            require_user(request.cookies.get(SESSION_COOKIE), user_id)
            return load_graph_record(user_id, graph_id)
        except Exception as error:  # noqa: BLE001
            raise api_error(error) from error

    @app.put("/api/users/{user_id}/graphs/{graph_id}")
    def api_update_graph(user_id: str, graph_id: str, payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
        try:
            require_user(request.cookies.get(SESSION_COOKIE), user_id)
            return update_graph_record(user_id, graph_id, payload.get("name", ""), payload.get("document"))
        except Exception as error:  # noqa: BLE001
            raise api_error(error) from error

    @app.delete("/api/users/{user_id}/graphs/{graph_id}")
    def api_delete_graph(user_id: str, graph_id: str, request: Request) -> Dict[str, bool]:
        try:
            require_user(request.cookies.get(SESSION_COOKIE), user_id)
            delete_graph_record(user_id, graph_id)
            return {"ok": True}
        except Exception as error:  # noqa: BLE001
            raise api_error(error) from error

    print(f"PlayLLM API listening on http://{HOST}:{PORT} (fastapi mode)")
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")


if __name__ == "__main__":
    ensure_storage()
    try:
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401

        run_fastapi_server()
    except ModuleNotFoundError:
        print("FastAPI not installed, falling back to builtin Python server.")
        print("Install optional dependencies with: pip3 install -r backend/requirements.txt")
        run_builtin_server()
