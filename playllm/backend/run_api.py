from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import unquote

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "server-data"
USERS_DIR = DATA_DIR / "users"
GRAPHS_DIR = DATA_DIR / "graphs"
HOST = os.environ.get("PLAYLLM_HOST", "127.0.0.1")
PORT = int(os.environ.get("PLAYLLM_PORT", "3001"))

_graph_list_cache: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
_CACHE_TTL = 2.0


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_storage() -> None:
    USERS_DIR.mkdir(parents=True, exist_ok=True)
    GRAPHS_DIR.mkdir(parents=True, exist_ok=True)


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
    tmp_path.replace(file_path)


def ensure_user_profile(user_id: str) -> None:
    normalized_user_id = sanitize_id(user_id)
    file_path = user_file_path(normalized_user_id)
    if file_path.exists():
        return
    profile = {
        "id": normalized_user_id,
        "displayName": normalized_user_id,
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


def list_users() -> list[Dict[str, Any]]:
    users = []
    for file_path in USERS_DIR.glob("*.json"):
        profile = json.loads(file_path.read_text("utf-8"))
        graphs = list_user_graphs(profile["id"])
        users.append(
            {
                "id": profile["id"],
                "displayName": profile.get("displayName", profile["id"]),
                "graphCount": len(graphs),
                "updatedAt": profile.get("updatedAt", now_iso()),
            }
        )
    return sorted(users, key=lambda item: item["id"])


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

    def _send_json(self, status: int, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        self.wfile.write(body)

    def _route(self) -> None:
        path = unquote(self.path.split("?", 1)[0])

        if self.command == "GET" and path == "/api/users":
            self._send_json(200, list_users())
            return

        graph_list_match = re.fullmatch(r"/api/users/([^/]+)/graphs", path)
        if graph_list_match and self.command == "GET":
            self._send_json(200, list_user_graphs(graph_list_match.group(1)))
            return
        if graph_list_match and self.command == "POST":
            body = self._read_json()
            self._send_json(201, write_graph_record(graph_list_match.group(1), body.get("name", ""), body.get("document")))
            return

        graph_record_match = re.fullmatch(r"/api/users/([^/]+)/graphs/([^/]+)", path)
        if graph_record_match and self.command == "GET":
            self._send_json(200, load_graph_record(graph_record_match.group(1), graph_record_match.group(2)))
            return
        if graph_record_match and self.command == "PUT":
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
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn

    app = FastAPI(title="PlayLLM API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/users")
    def api_list_users() -> list[Dict[str, Any]]:
        return list_users()

    @app.get("/api/users/{user_id}/graphs")
    def api_list_graphs(user_id: str) -> list[Dict[str, Any]]:
        return list_user_graphs(user_id)

    @app.post("/api/users/{user_id}/graphs")
    def api_create_graph(user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        try:
            return write_graph_record(user_id, payload.get("name", ""), payload.get("document"))
        except Exception as error:  # noqa: BLE001
            status, body = make_error_payload(error)
            raise HTTPException(status_code=int(status), detail=body["error"]) from error

    @app.get("/api/users/{user_id}/graphs/{graph_id}")
    def api_get_graph(user_id: str, graph_id: str) -> Dict[str, Any]:
        try:
            return load_graph_record(user_id, graph_id)
        except Exception as error:  # noqa: BLE001
            status, body = make_error_payload(error)
            raise HTTPException(status_code=int(status), detail=body["error"]) from error

    @app.put("/api/users/{user_id}/graphs/{graph_id}")
    def api_update_graph(user_id: str, graph_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        try:
            return update_graph_record(user_id, graph_id, payload.get("name", ""), payload.get("document"))
        except Exception as error:  # noqa: BLE001
            status, body = make_error_payload(error)
            raise HTTPException(status_code=int(status), detail=body["error"]) from error

    @app.delete("/api/users/{user_id}/graphs/{graph_id}")
    def api_delete_graph(user_id: str, graph_id: str) -> Dict[str, bool]:
        try:
            delete_graph_record(user_id, graph_id)
            return {"ok": True}
        except Exception as error:  # noqa: BLE001
            status, body = make_error_payload(error)
            raise HTTPException(status_code=int(status), detail=body["error"]) from error

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
