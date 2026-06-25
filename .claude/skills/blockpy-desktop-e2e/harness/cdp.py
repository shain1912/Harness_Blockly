#!/usr/bin/env python3
"""Tiny Chrome DevTools Protocol client — drives an Electron/Chromium app from Python.

No Playwright, no node driver: just `requests` (find the page target over HTTP) and
`websocket-client` (talk CDP over a websocket). Everything we need to "select an element
and inspect it" is done by evaluating small JS snippets in the page (Runtime.evaluate),
plus Page.captureScreenshot for real screenshots.

The target app must have been launched with --remote-debugging-port=<port> (Electron
forwards that switch to Chromium). See run_e2e.py.
"""
import base64
import json
import time
from pathlib import Path

try:
    import requests
    from websocket import create_connection  # pip install websocket-client
except Exception as e:  # pragma: no cover
    raise SystemExit(
        "Missing deps: %s\n  pip install requests websocket-client\n" % e)


class CDPError(RuntimeError):
    pass


class CDP:
    """One websocket to one page target. Synchronous request/response."""

    def __init__(self, port=9222, page_url_prefix=None, connect_timeout=40):
        self.port = port
        self._id = 0
        self.ws = None
        self._connect(page_url_prefix, connect_timeout)

    # ── connection ──────────────────────────────────────────────────────────────
    def _list_targets(self):
        r = requests.get(f"http://127.0.0.1:{self.port}/json", timeout=5)
        return r.json()

    def _connect(self, prefix, timeout):
        deadline = time.time() + timeout
        ws_url = None
        last_err = None
        while time.time() < deadline:
            try:
                targets = self._list_targets()
                pages = [t for t in targets
                         if t.get("type") == "page" and t.get("webSocketDebuggerUrl")]
                if prefix:
                    matched = [t for t in pages if (t.get("url") or "").startswith(prefix)]
                    pages = matched or pages
                if pages:
                    ws_url = pages[0]["webSocketDebuggerUrl"]
                    break
            except Exception as e:  # endpoint not up yet
                last_err = e
            time.sleep(0.5)
        if not ws_url:
            raise CDPError(f"No CDP page target on port {self.port} "
                           f"within {timeout}s (last error: {last_err})")
        self.ws = create_connection(ws_url, timeout=60)
        self.send("Runtime.enable")
        self.send("Page.enable")

    # ── raw command ─────────────────────────────────────────────────────────────
    def send(self, method, **params):
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        # Read until our matching response arrives; ignore interleaved events.
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise CDPError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    # ── high-level helpers ────────────────────────────────────────────────────────
    def evaluate(self, expression, await_promise=False):
        """Run JS in the page, return its (JSON-able) value. Raises on JS exception."""
        r = self.send("Runtime.evaluate",
                      expression=expression, returnByValue=True,
                      awaitPromise=await_promise, allowUnsafeEvalBlocklisting=False)
        if r.get("exceptionDetails"):
            det = r["exceptionDetails"]
            txt = det.get("exception", {}).get("description") or json.dumps(det)
            raise CDPError("JS exception: " + str(txt)[:400])
        return r.get("result", {}).get("value")

    def wait_for(self, js_predicate, timeout=20, interval=0.4, desc=""):
        """Poll a JS boolean expression until true or timeout. Returns True/False."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.evaluate(f"!!({js_predicate})"):
                    return True
            except CDPError:
                pass
            time.sleep(interval)
        return False

    def screenshot(self, path):
        r = self.send("Page.captureScreenshot", format="png", captureBeyondViewport=False)
        Path(path).write_bytes(base64.b64decode(r["data"]))
        return path

    def device_pixel_ratio(self):
        try:
            return float(self.evaluate("window.devicePixelRatio") or 1)
        except Exception:
            return 1.0

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass
