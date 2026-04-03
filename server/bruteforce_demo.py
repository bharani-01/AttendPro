#!/usr/bin/env python3
"""
Brute-force protection demo for the Attendance App auth API.

What this demonstrates:
1) Per-account lockout after repeated failed logins.
2) IP-based throttling after too many failed attempts.

Usage examples:
  python bruteforce_demo.py --email demo@college.com --good-password secret123
  python bruteforce_demo.py --base-url http://localhost:5001 --email faculty@college.com
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Tuple

try:
    import tkinter as tk
    from tkinter import ttk, messagebox
except Exception:
    tk = None
    ttk = None
    messagebox = None


def post_json(url: str, payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any], float]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            elapsed_ms = (time.perf_counter() - start) * 1000
            body_bytes = resp.read()
            body = {}
            if body_bytes:
                try:
                    body = json.loads(body_bytes.decode("utf-8"))
                except Exception:
                    body = {"raw": body_bytes.decode("utf-8", errors="replace")}
            return resp.status, body, elapsed_ms
    except urllib.error.HTTPError as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        body_bytes = e.read() if hasattr(e, "read") else b""
        body = {}
        if body_bytes:
            try:
                body = json.loads(body_bytes.decode("utf-8"))
            except Exception:
                body = {"raw": body_bytes.decode("utf-8", errors="replace")}
        return e.code, body, elapsed_ms


def request_json(url: str, method: str, payload: Dict[str, Any] | None = None) -> Tuple[int, Dict[str, Any], float]:
    method = method.upper().strip()
    data = None
    headers = {"Content-Type": "application/json"}

    if payload is not None and method in {"POST", "PUT", "PATCH", "DELETE"}:
        data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            elapsed_ms = (time.perf_counter() - start) * 1000
            body_bytes = resp.read()
            body: Dict[str, Any] = {}
            if body_bytes:
                try:
                    body = json.loads(body_bytes.decode("utf-8"))
                except Exception:
                    body = {"raw": body_bytes.decode("utf-8", errors="replace")}
            return resp.status, body, elapsed_ms
    except urllib.error.HTTPError as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        body_bytes = e.read() if hasattr(e, "read") else b""
        body: Dict[str, Any] = {}
        if body_bytes:
            try:
                body = json.loads(body_bytes.decode("utf-8"))
            except Exception:
                body = {"raw": body_bytes.decode("utf-8", errors="replace")}
        return e.code, body, elapsed_ms
    except urllib.error.URLError as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return 0, {"error": f"Network error: {e.reason}"}, elapsed_ms


def short_body(body: Dict[str, Any]) -> str:
    if not body:
        return "[no-body]"
    if "error" in body:
        return f"error={body['error']}"
    if "message" in body:
        return f"message={body['message']}"
    text = json.dumps(body)
    return text if len(text) <= 140 else text[:140] + "..."


def print_attempt(title: str, idx: int, status: int, body: Dict[str, Any], elapsed_ms: float) -> None:
    print("-" * 70)
    print(f"{title} Attempt #{idx}")
    print(f"Status     : {status}")
    print(f"Time Taken : {elapsed_ms:.2f} ms")
    print(f"Response   : {short_body(body)}")


def launch_tkinter_route_tester() -> None:
    if tk is None or ttk is None:
        print("Tkinter is not available in this Python installation.")
        return

    app = tk.Tk()
    app.title("Attendance API Route Tester")
    app.geometry("860x620")

    main = ttk.Frame(app, padding=12)
    main.pack(fill="both", expand=True)

    ttk.Label(main, text="Base URL").grid(row=0, column=0, sticky="w")
    base_url_var = tk.StringVar(value="http://localhost:5001")
    base_entry = ttk.Entry(main, textvariable=base_url_var, width=50)
    base_entry.grid(row=0, column=1, columnspan=3, sticky="ew", padx=(8, 0), pady=4)

    ttk.Label(main, text="Route").grid(row=1, column=0, sticky="w")
    route_var = tk.StringVar(value="/api/auth/login")
    route_combo = ttk.Combobox(
        main,
        textvariable=route_var,
        values=[
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/forgot-password",
            "/api/auth/reset-password",
            "/api/attendance",
            "/api/qr/checkin/<sessionId>",
        ],
        width=47,
    )
    route_combo.grid(row=1, column=1, columnspan=2, sticky="ew", padx=(8, 0), pady=4)

    ttk.Label(main, text="Method").grid(row=1, column=3, sticky="e", padx=(8, 0))
    method_var = tk.StringVar(value="POST")
    method_combo = ttk.Combobox(main, textvariable=method_var, values=["GET", "POST", "PUT", "PATCH", "DELETE"], width=8)
    method_combo.grid(row=1, column=4, sticky="w", padx=(8, 0), pady=4)

    ttk.Label(main, text="Repeat").grid(row=2, column=0, sticky="w")
    repeat_count_var = tk.StringVar(value="1")
    repeat_count_entry = ttk.Entry(main, textvariable=repeat_count_var, width=8)
    repeat_count_entry.grid(row=2, column=1, sticky="w", padx=(8, 0), pady=4)

    ttk.Label(main, text="Delay (ms)").grid(row=2, column=2, sticky="e")
    repeat_delay_var = tk.StringVar(value="0")
    repeat_delay_entry = ttk.Entry(main, textvariable=repeat_delay_var, width=10)
    repeat_delay_entry.grid(row=2, column=3, sticky="w", padx=(8, 0), pady=4)

    ttk.Label(main, text="Required Inputs (JSON Body)").grid(row=3, column=0, columnspan=5, sticky="w", pady=(10, 4))
    payload_text = tk.Text(main, height=10, wrap="word")
    payload_text.grid(row=4, column=0, columnspan=5, sticky="nsew")
    payload_text.insert(
        "1.0",
        json.dumps({"email": "demo@college.com", "password": "secret123"}, indent=2),
    )

    ttk.Label(main, text="Result").grid(row=5, column=0, columnspan=5, sticky="w", pady=(10, 4))
    result_text = tk.Text(main, height=16, wrap="word")
    result_text.grid(row=6, column=0, columnspan=5, sticky="nsew")

    def set_result(message: str) -> None:
        result_text.delete("1.0", tk.END)
        result_text.insert("1.0", message)

    def append_result(message: str) -> None:
        result_text.insert(tk.END, message)
        result_text.see(tk.END)

    def send_request() -> None:
        base_url = base_url_var.get().strip().rstrip("/")
        route = route_var.get().strip()
        method = method_var.get().strip().upper()

        if not base_url or not route:
            messagebox.showerror("Missing data", "Base URL and Route are required.")
            return

        if not route.startswith("/"):
            route = "/" + route

        try:
            repeat_count = int(repeat_count_var.get().strip())
            repeat_delay_ms = int(repeat_delay_var.get().strip())
            if repeat_count <= 0:
                raise ValueError("Repeat count must be greater than 0")
            if repeat_delay_ms < 0:
                raise ValueError("Delay cannot be negative")
        except ValueError as err:
            messagebox.showerror("Invalid repeat settings", str(err))
            return

        raw_payload = payload_text.get("1.0", tk.END).strip()
        payload = None
        if raw_payload:
            try:
                payload = json.loads(raw_payload)
            except json.JSONDecodeError as err:
                messagebox.showerror("Invalid JSON", f"Payload JSON is invalid:\n{err}")
                return

        url = base_url + route
        set_result("")
        for attempt in range(1, repeat_count + 1):
            status, body, elapsed_ms = request_json(url, method, payload)
            pretty_body = json.dumps(body, indent=2, ensure_ascii=True)
            result = (
                "_____________________________________________________\n"
                f"Attempt       : {attempt}/{repeat_count}\n"
                f"Route(Method) : {route} ({method})\n"
                f"URL           : {url}\n"
                f"Time Taken    : {elapsed_ms:.2f} ms\n"
                f"Status        : {status}\n"
                f"Response      :\n{pretty_body}\n"
                "_____________________________________________________\n"
            )
            append_result(result)
            app.update_idletasks()

            if attempt < repeat_count and repeat_delay_ms > 0:
                time.sleep(repeat_delay_ms / 1000)

    btn_frame = ttk.Frame(main)
    btn_frame.grid(row=7, column=0, columnspan=5, sticky="ew", pady=(10, 0))
    ttk.Button(btn_frame, text="Send Request(s)", command=send_request).pack(side="left")
    ttk.Button(btn_frame, text="Clear Result", command=lambda: set_result("")).pack(side="left", padx=(8, 0))
    ttk.Button(btn_frame, text="Quit", command=app.destroy).pack(side="right")

    main.columnconfigure(1, weight=1)
    main.columnconfigure(2, weight=1)
    main.columnconfigure(3, weight=0)
    main.columnconfigure(4, weight=0)
    main.rowconfigure(4, weight=1)
    main.rowconfigure(6, weight=1)

    app.mainloop()


def main() -> None:
    parser = argparse.ArgumentParser(description="Brute-force protection demo")
    parser.add_argument("--base-url", default="http://localhost:5001", help="API server base URL")
    parser.add_argument("--email", default="", help="Existing user email for lockout test")
    parser.add_argument("--bad-password", default="wrong-password-123", help="Wrong password for failure attempts")
    parser.add_argument("--good-password", default="", help="Correct password (optional) to verify lock behavior")
    parser.add_argument("--account-attempts", type=int, default=6, help="Wrong-password attempts for account lockout demo")
    parser.add_argument("--ip-attempts", type=int, default=40, help="Attempts for IP throttling demo")
    parser.add_argument("--skip-ip-test", action="store_true", help="Skip IP throttling test")
    parser.add_argument("--gui", action="store_true", help="Launch Tkinter route tester UI")
    args = parser.parse_args()

    if args.gui:
        launch_tkinter_route_tester()
        return

    if not args.email:
        parser.error("--email is required unless --gui is used")

    login_url = args.base_url.rstrip("/") + "/api/auth/login"

    print("\n=== Brute Force Demo: Account Lockout ===")
    print(f"Target endpoint: {login_url}")
    print(f"Testing user    : {args.email}")

    for i in range(1, args.account_attempts + 1):
        status, body, elapsed_ms = post_json(
            login_url,
            {"email": args.email, "password": args.bad_password},
        )
        print_attempt("Account Lockout", i, status, body, elapsed_ms)

    if args.good_password:
        print("\n=== Verify Lock With Correct Password ===")
        status, body, elapsed_ms = post_json(
            login_url,
            {"email": args.email, "password": args.good_password},
        )
        print_attempt("Correct Password During Lock", 1, status, body, elapsed_ms)

    if not args.skip_ip_test:
        print("\n=== Brute Force Demo: IP Throttling ===")
        # Use non-existent emails to avoid affecting real accounts further.
        blocked = False
        for i in range(1, args.ip_attempts + 1):
            fake_email = f"nonexistent_{i}@example.invalid"
            status, body, elapsed_ms = post_json(
                login_url,
                {"email": fake_email, "password": args.bad_password},
            )
            print_attempt("IP Throttle", i, status, body, elapsed_ms)
            if status == 429:
                blocked = True
                print("\nIP throttling confirmed: received 429 Too Many Requests.")
                break

        if not blocked:
            print("\nIP throttling was not triggered in this run.")
            print("Increase --ip-attempts or ensure previous failed-attempt window is active.")

    print("\nDemo complete.")


if __name__ == "__main__":
    main()
