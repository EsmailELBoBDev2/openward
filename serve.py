#!/usr/bin/env python3
"""Local dev server for OpenWard.

Binds to LOOPBACK ONLY (127.0.0.1) by default, so the app is reachable from this
machine and is NOT exposed on the LAN. OpenWard is a single-user, all-local app;
there is no reason for the dev server to listen on every interface.

Override (use with care — this puts the dev server on your network):
    HOST=0.0.0.0 PORT=8080 python3 serve.py
"""
import http.server
import os
import re
import socketserver
import urllib.parse

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))

# Allowlist of servable paths — same policy as server/server.js STATIC_ALLOW.
# Without it this server happily served the WHOLE repo root: .git/, server/data/
# (openward.sqlite with PHI, audit.key), tests, tools. Allowlist, not denylist,
# so nothing leaks by default.
ALLOW = re.compile(r"^$|^(?:index\.html|favicon\.ico)$|^(?:js|css|vendor)/[\w./-]+$")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def _allowed(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        rel = urllib.parse.unquote(path).lstrip("/")
        return bool(ALLOW.fullmatch(rel)) and ".." not in rel

    def do_GET(self):
        if not self._allowed():
            self.send_error(403, "forbidden")
            return
        super().do_GET()

    def do_HEAD(self):
        if not self._allowed():
            self.send_error(403, "forbidden")
            return
        super().do_HEAD()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        # Security headers (dev server). frame-ancestors / HSTS belong on the real
        # static host in production; these cover clickjacking + MIME-sniffing here.
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()

    def log_message(self, format, *args):
        pass  # suppress logs


with socketserver.TCPServer((HOST, PORT), NoCacheHandler) as httpd:
    where = "all interfaces" if HOST in ("", "0.0.0.0") else HOST
    print(f"OpenWard dev server on http://{HOST or '127.0.0.1'}:{PORT}  (bound to {where})")
    if HOST in ("", "0.0.0.0"):
        print("WARNING: bound to all interfaces — the app is reachable from your LAN.")
    httpd.serve_forever()
