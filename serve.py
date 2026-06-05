#!/usr/bin/env python3
import http.server
import socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
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

with socketserver.TCPServer(("", 8080), NoCacheHandler) as httpd:
    httpd.serve_forever()
