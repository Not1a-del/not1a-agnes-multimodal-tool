#!/usr/bin/env python3
from __future__ import annotations

import json
import mimetypes
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urljoin, urlparse


ROOT = Path(__file__).resolve().parent
PORT = 8765


class Handler(BaseHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.startswith("/api/proxy?"):
            self.send_error(405, "Use POST for proxy requests")
            return
        self.serve_static()

    def do_POST(self) -> None:
        if self.path == "/api/proxy":
            self.proxy_request()
            return
        self.send_error(404)

    def serve_static(self) -> None:
        target = self.path.split("?", 1)[0].lstrip("/") or "index.html"
        path = (ROOT / target).resolve()
        if ROOT not in path.parents and path != ROOT:
            self.send_error(403)
            return
        if not path.exists() or path.is_dir():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if content_type.startswith(("text/", "application/javascript")):
            content_type = f"{content_type}; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(path.read_bytes())

    def proxy_request(self) -> None:
        try:
            body = self.read_json()
            base_url = str(body.get("baseUrl", "")).rstrip("/") + "/"
            endpoint = str(body.get("endpoint", "")).lstrip("/")
            api_key = str(body.get("apiKey", ""))
            method = str(body.get("method", "POST")).upper()
            payload = body.get("payload")
            self.validate_target(base_url)
        except ValueError as exc:
            self.write_json({"error": str(exc)}, status=400)
            return

        data = None if method == "GET" or payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            urljoin(base_url, endpoint),
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                response_body = response.read()
                status = response.status
                content_type = response.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as exc:
            response_body = exc.read()
            status = exc.code
            content_type = exc.headers.get("Content-Type", "application/json")
        except urllib.error.URLError as exc:
            self.write_json({"error": f"Network error: {exc}"}, status=502)
            return

        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(response_body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw or "{}")

    def write_json(self, data: dict, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    @staticmethod
    def validate_target(base_url: str) -> None:
        parsed = urlparse(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Base URL must be a complete http or https URL")


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Not1a Agnes Web Tool: http://127.0.0.1:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
