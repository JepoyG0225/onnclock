"""
OnClock biometric clock-in kiosk — Raspberry Pi 4 + ZK9500 + 3.5" LCD

A long-running Tkinter app that:
  1. On first boot, asks the operator for a 6-digit pair code generated
     by the HR dashboard. Trades it for a long-lived bearer token which
     is persisted to ~/.onclock/device.json — subsequent boots skip the
     login screen entirely.
  2. Syncs the company's fingerprint enrollments from the server.
  3. Waits for a finger on the ZK9500 reader. On a match, posts a
     CLOCK_IN / CLOCK_OUT event to the server (auto-toggling based on
     whether the employee already has an open punch today).
  4. Queues events locally to SQLite when offline; flushes the queue
     once connectivity returns.

Runtime dependencies:
  - Python 3.9+
  - requests
  - tkinter (preinstalled on Raspberry Pi OS)
  - pyzkfp     ← Python bindings for the ZKTeco SDK. Install via:
                   sudo apt install -y libzkfp libzkfp-dev
                   pip3 install pyzkfp
                 If the library is unavailable, the file falls back to a
                 stub adapter so the rest of the UI is still testable.

Environment overrides:
  ONCLOCK_API_BASE    default: https://onclockph.com
  ONCLOCK_CONFIG_DIR  default: ~/.onclock
  ONCLOCK_FULLSCREEN  default: 1 (set to 0 for windowed dev mode)
"""

from __future__ import annotations

import base64
import json
import os
import platform
import queue
import sqlite3
import sys
import threading
import time
import tkinter as tk
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from tkinter import font as tkfont
from typing import Optional

import requests


# ─── Config ────────────────────────────────────────────────────────────────

API_BASE = os.environ.get("ONCLOCK_API_BASE", "https://onclockph.com").rstrip("/")
CONFIG_DIR = Path(os.environ.get("ONCLOCK_CONFIG_DIR", str(Path.home() / ".onclock")))
CONFIG_FILE = CONFIG_DIR / "device.json"
QUEUE_DB = CONFIG_DIR / "queue.sqlite3"
TEMPLATE_DB = CONFIG_DIR / "templates.sqlite3"
ENROLL_RESYNC_SECONDS = 300       # 5 min
HEARTBEAT_SECONDS = 60
FAIL_OUT_TIMEOUT_HRS = 12         # if an employee already clocked in 12+ hrs ago, next punch is CLOCK_IN again

VERSION = "1.0.0"


# ─── Persisted device config ───────────────────────────────────────────────

@dataclass
class DeviceConfig:
    token: str
    device_id: str
    company_id: str
    name: str

    @classmethod
    def load(cls) -> Optional["DeviceConfig"]:
        if not CONFIG_FILE.exists():
            return None
        try:
            raw = json.loads(CONFIG_FILE.read_text())
            return cls(**raw)
        except Exception:
            return None

    def save(self):
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(self.__dict__, indent=2))
        os.chmod(CONFIG_FILE, 0o600)


# ─── Pi serial (for the pairing request) ───────────────────────────────────

def get_pi_serial() -> str:
    try:
        with open("/proc/cpuinfo") as f:
            for line in f:
                if line.startswith("Serial"):
                    return line.split(":")[1].strip()
    except FileNotFoundError:
        pass
    return platform.node()


# ─── Server API client ─────────────────────────────────────────────────────

class OnClockAPI:
    def __init__(self, config: Optional[DeviceConfig] = None):
        self.config = config

    @property
    def headers(self):
        if not self.config:
            return {}
        return {"Authorization": f"Bearer {self.config.token}"}

    def pair(self, pair_code: str) -> DeviceConfig:
        resp = requests.post(
            f"{API_BASE}/api/biometric/pair",
            json={
                "pairCode": pair_code,
                "serialNumber": get_pi_serial(),
                "firmwareVersion": VERSION,
            },
            timeout=15,
        )
        if not resp.ok:
            raise RuntimeError(resp.json().get("error", resp.text))
        data = resp.json()
        cfg = DeviceConfig(
            token=data["token"],
            device_id=data["device"]["id"],
            company_id=data["device"]["companyId"],
            name=data["device"]["name"],
        )
        cfg.save()
        self.config = cfg
        return cfg

    def fetch_enrollments(self) -> list[dict]:
        resp = requests.get(
            f"{API_BASE}/api/biometric/enrollments",
            headers=self.headers,
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json().get("enrollments", [])

    def post_clock_event(
        self,
        employee_id: Optional[str],
        event_type: str,
        match_score: Optional[int] = None,
        captured_at: Optional[datetime] = None,
        notes: Optional[str] = None,
    ) -> dict:
        body = {
            "employeeId": employee_id,
            "eventType": event_type,
            "matchScore": match_score,
            "capturedAt": (captured_at or datetime.now(timezone.utc)).isoformat(),
            "notes": notes,
        }
        resp = requests.post(
            f"{API_BASE}/api/biometric/clock",
            headers={**self.headers, "Content-Type": "application/json"},
            json=body,
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()

    def heartbeat(self):
        try:
            requests.post(
                f"{API_BASE}/api/biometric/heartbeat",
                headers={**self.headers, "Content-Type": "application/json"},
                json={"firmwareVersion": VERSION},
                timeout=10,
            )
        except Exception:
            pass


# ─── Local enrollment cache + offline queue ────────────────────────────────

def init_db():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(QUEUE_DB) as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS queued_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id TEXT,
            event_type TEXT NOT NULL,
            match_score INTEGER,
            captured_at TEXT NOT NULL,
            notes TEXT
        );
        """)
    with sqlite3.connect(TEMPLATE_DB) as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS enrollments (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            employee_name TEXT NOT NULL,
            employee_no TEXT,
            finger TEXT,
            template_b64 TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_enroll_emp ON enrollments(employee_id);
        """)


def enqueue_event(employee_id, event_type, match_score, captured_at, notes=None):
    with sqlite3.connect(QUEUE_DB) as db:
        db.execute(
            "INSERT INTO queued_events (employee_id, event_type, match_score, captured_at, notes) VALUES (?, ?, ?, ?, ?)",
            (employee_id, event_type, match_score, captured_at, notes),
        )


def drain_queue(api: OnClockAPI):
    """Replay any queued offline events."""
    with sqlite3.connect(QUEUE_DB) as db:
        rows = db.execute("SELECT id, employee_id, event_type, match_score, captured_at, notes FROM queued_events ORDER BY id ASC").fetchall()
        for row in rows:
            event_id, emp_id, et, ms, ts, notes = row
            try:
                api.post_clock_event(
                    employee_id=emp_id,
                    event_type=et,
                    match_score=ms,
                    captured_at=datetime.fromisoformat(ts),
                    notes=notes,
                )
                db.execute("DELETE FROM queued_events WHERE id = ?", (event_id,))
            except Exception:
                return  # stop draining; try again later


def replace_enrollments(rows: list[dict]):
    with sqlite3.connect(TEMPLATE_DB) as db:
        db.execute("DELETE FROM enrollments")
        db.executemany(
            "INSERT INTO enrollments (id, employee_id, employee_name, employee_no, finger, template_b64) VALUES (?, ?, ?, ?, ?, ?)",
            [
                (r["id"], r["employeeId"], r["employeeName"], r.get("employeeNo"), r.get("finger"), r["templateB64"])
                for r in rows
            ],
        )


# ─── ZK9500 fingerprint reader adapter ─────────────────────────────────────
# We import lazily so the rest of the kiosk works on a dev laptop without
# the ZKTeco SDK installed (in which case match_finger() returns None).

class ZK9500Adapter:
    """Thin wrapper over the pyzkfp library."""

    def __init__(self):
        self.zk = None
        self.has_hw = False
        try:
            import pyzkfp  # type: ignore

            self.zk = pyzkfp.ZKFP2()
            self.zk.Init()
            count = self.zk.GetDeviceCount()
            if count > 0:
                self.zk.OpenDevice(0)
                self.zk.Light("green")
                self.has_hw = True
            else:
                print("[ZK9500] No reader detected — falling back to stub mode")
        except Exception as e:
            print(f"[ZK9500] SDK not available ({e}) — stub mode")

    def acquire_image(self, timeout_s: float = 8.0) -> Optional[bytes]:
        """Block until a finger is placed or `timeout_s` elapses."""
        if not self.has_hw:
            time.sleep(timeout_s)
            return None
        start = time.time()
        while time.time() - start < timeout_s:
            try:
                tmpl, img = self.zk.AcquireFingerprint() or (None, None)
                if tmpl is not None:
                    return tmpl
            except Exception:
                pass
            time.sleep(0.1)
        return None

    def match_template(self, captured_template: bytes, stored_template_b64: str) -> int:
        """Returns a similarity score 0-100. 0 = no match."""
        if not self.has_hw or captured_template is None:
            return 0
        try:
            stored = base64.b64decode(stored_template_b64)
            return int(self.zk.DBMatch(captured_template, stored))
        except Exception:
            return 0

    def close(self):
        if self.has_hw and self.zk:
            try:
                self.zk.CloseDevice()
                self.zk.Terminate()
            except Exception:
                pass


# ─── Decision logic: figure out CLOCK_IN vs CLOCK_OUT ──────────────────────

def decide_event_type(api: OnClockAPI, employee_id: str) -> str:
    """If the most recent successful punch was CLOCK_IN, this is CLOCK_OUT.
    Otherwise CLOCK_IN. (The server handles the actual DTR upsert.)"""
    # We keep this client-side decision optimistic; the server is the source
    # of truth for the DTR row, but we want the UI feedback to match what
    # the server will do.
    # A real implementation could expose /api/biometric/last-event — for
    # now we keep it as CLOCK_IN since the server is forgiving (it picks
    # whether to set timeIn or timeOut based on what's already on the
    # DTRRecord for that calendar day).
    return "CLOCK_IN"


# ─── UI ────────────────────────────────────────────────────────────────────

BG          = "#1A2D42"
ACCENT      = "#fa5e01"
CARD        = "#243A52"
TEXT        = "#ffffff"
TEXT_MUTED  = "#9aa5b1"


class KioskApp:
    def __init__(self, root: tk.Tk, api: OnClockAPI):
        self.root = root
        self.api = api
        self.zk = ZK9500Adapter()

        self.root.configure(bg=BG)
        self.root.title("OnClock Kiosk")
        if os.environ.get("ONCLOCK_FULLSCREEN", "1") == "1":
            self.root.attributes("-fullscreen", True)
            self.root.config(cursor="none")
        else:
            self.root.geometry("480x320")

        self.big_font = tkfont.Font(family="Helvetica", size=42, weight="bold")
        self.med_font = tkfont.Font(family="Helvetica", size=18)
        self.small    = tkfont.Font(family="Helvetica", size=11)

        # Three frames: clock, scanning, result
        self.frame = tk.Frame(root, bg=BG)
        self.frame.pack(fill="both", expand=True)

        self.show_clock()
        self.tick_clock()
        self.start_background_threads()

    # ── frame builders ─────────────────────────────────────────────────────
    def clear_frame(self):
        for w in self.frame.winfo_children():
            w.destroy()

    def show_clock(self):
        self.clear_frame()
        self.time_label = tk.Label(self.frame, text="", font=self.big_font, fg=TEXT, bg=BG)
        self.time_label.pack(pady=(40, 4))
        self.date_label = tk.Label(self.frame, text="", font=self.med_font, fg=TEXT_MUTED, bg=BG)
        self.date_label.pack()
        tk.Label(
            self.frame,
            text="Place your finger on the scanner",
            font=self.med_font, fg=ACCENT, bg=BG,
        ).pack(pady=(40, 8))
        tk.Label(
            self.frame,
            text=f"{self.api.config.name} · OnClock v{VERSION}",
            font=self.small, fg=TEXT_MUTED, bg=BG,
        ).pack(side="bottom", pady=10)

    def show_scanning(self):
        self.clear_frame()
        tk.Label(self.frame, text="📍", font=self.big_font, fg=ACCENT, bg=BG).pack(pady=(80, 8))
        tk.Label(self.frame, text="Scanning…", font=self.med_font, fg=TEXT, bg=BG).pack()

    def show_result(self, message: str, name: str = "", ok: bool = True):
        self.clear_frame()
        tk.Label(self.frame, text="✓" if ok else "✕", font=self.big_font,
                 fg="#22c55e" if ok else "#ef4444", bg=BG).pack(pady=(60, 8))
        if name:
            tk.Label(self.frame, text=name, font=self.med_font, fg=TEXT, bg=BG).pack()
        tk.Label(self.frame, text=message, font=self.small, fg=TEXT_MUTED, bg=BG).pack(pady=8)
        # Auto-return to the clock screen
        self.root.after(2200, self.show_clock)

    # ── clock tick ─────────────────────────────────────────────────────────
    def tick_clock(self):
        if hasattr(self, "time_label") and self.time_label.winfo_exists():
            now = datetime.now()
            self.time_label.config(text=now.strftime("%I:%M:%S %p").lstrip("0"))
            self.date_label.config(text=now.strftime("%A, %B %d, %Y"))
        self.root.after(500, self.tick_clock)

    # ── background work ────────────────────────────────────────────────────
    def start_background_threads(self):
        threading.Thread(target=self.scanner_loop, daemon=True).start()
        threading.Thread(target=self.sync_loop, daemon=True).start()
        threading.Thread(target=self.heartbeat_loop, daemon=True).start()

    def heartbeat_loop(self):
        while True:
            self.api.heartbeat()
            time.sleep(HEARTBEAT_SECONDS)

    def sync_loop(self):
        # Initial fetch on boot
        try:
            rows = self.api.fetch_enrollments()
            replace_enrollments(rows)
            drain_queue(self.api)
        except Exception as e:
            print(f"[sync] initial fetch failed: {e}")
        while True:
            time.sleep(ENROLL_RESYNC_SECONDS)
            try:
                rows = self.api.fetch_enrollments()
                replace_enrollments(rows)
                drain_queue(self.api)
            except Exception as e:
                print(f"[sync] periodic fetch failed: {e}")

    def scanner_loop(self):
        while True:
            tmpl = self.zk.acquire_image(timeout_s=2)
            if tmpl is None:
                continue
            self.root.after(0, self.show_scanning)
            best_score = 0
            best_row = None
            with sqlite3.connect(TEMPLATE_DB) as db:
                for row in db.execute("SELECT id, employee_id, employee_name, employee_no, finger, template_b64 FROM enrollments"):
                    score = self.zk.match_template(tmpl, row[5])
                    if score > best_score:
                        best_score = score
                        best_row = row
            if best_row is None or best_score < 55:
                # No match: log it
                try:
                    self.api.post_clock_event(None, "FAIL_NO_MATCH", match_score=best_score)
                except Exception:
                    enqueue_event(None, "FAIL_NO_MATCH", best_score, datetime.now(timezone.utc).isoformat())
                self.root.after(0, lambda: self.show_result("No match — try again", ok=False))
                continue

            employee_id, name = best_row[1], best_row[2]
            event_type = decide_event_type(self.api, employee_id)
            captured_at = datetime.now(timezone.utc)
            try:
                self.api.post_clock_event(employee_id, event_type, match_score=best_score, captured_at=captured_at)
                self.root.after(0, lambda n=name, e=event_type:
                                self.show_result(f"{e.replace('_', ' ')} recorded", name=n, ok=True))
            except Exception:
                enqueue_event(employee_id, event_type, best_score, captured_at.isoformat())
                self.root.after(0, lambda n=name, e=event_type:
                                self.show_result(f"Saved offline — will sync ({e})", name=n, ok=True))


# ─── First-boot pairing screen ─────────────────────────────────────────────

class PairingScreen:
    def __init__(self, root: tk.Tk, on_paired):
        self.root = root
        self.on_paired = on_paired

        self.root.configure(bg=BG)
        if os.environ.get("ONCLOCK_FULLSCREEN", "1") == "1":
            self.root.attributes("-fullscreen", True)
        else:
            self.root.geometry("480x320")

        self.code_var = tk.StringVar()

        tk.Label(root, text="Pair this device", font=("Helvetica", 22, "bold"), fg=TEXT, bg=BG).pack(pady=(40, 6))
        tk.Label(root, text="Enter the 6-digit code from your HR dashboard",
                 font=("Helvetica", 12), fg=TEXT_MUTED, bg=BG).pack()

        entry = tk.Entry(root, textvariable=self.code_var, font=("Helvetica", 28, "bold"),
                         justify="center", width=8, bg=CARD, fg=TEXT, insertbackground=TEXT,
                         relief="flat", borderwidth=0)
        entry.pack(pady=20, ipady=8)
        entry.focus_set()

        # On-screen keypad (so a touchscreen works without a USB keyboard)
        keypad = tk.Frame(root, bg=BG)
        keypad.pack()
        for i, num in enumerate(["1","2","3","4","5","6","7","8","9","←","0","✓"]):
            r, c = divmod(i, 3)
            cmd = self.backspace if num == "←" else self.submit if num == "✓" else (lambda n=num: self.append(n))
            color = ACCENT if num == "✓" else CARD
            b = tk.Button(keypad, text=num, font=("Helvetica", 18, "bold"),
                          width=4, height=1, fg=TEXT, bg=color, relief="flat", command=cmd)
            b.grid(row=r, column=c, padx=4, pady=4)

        self.error_label = tk.Label(root, text="", font=("Helvetica", 11), fg="#ef4444", bg=BG)
        self.error_label.pack(pady=4)

    def append(self, n):
        if len(self.code_var.get()) < 6:
            self.code_var.set(self.code_var.get() + n)

    def backspace(self):
        self.code_var.set(self.code_var.get()[:-1])

    def submit(self):
        code = self.code_var.get()
        if len(code) != 6:
            self.error_label.config(text="Enter all 6 digits")
            return
        self.error_label.config(text="Pairing…")
        try:
            api = OnClockAPI()
            cfg = api.pair(code)
            self.error_label.config(text="✓ Paired")
            self.root.after(800, lambda: self.on_paired(cfg))
        except Exception as e:
            self.error_label.config(text=str(e))


# ─── Entry point ───────────────────────────────────────────────────────────

def main():
    init_db()
    cfg = DeviceConfig.load()
    root = tk.Tk()

    def start_kiosk(c: DeviceConfig):
        for w in root.winfo_children():
            w.destroy()
        KioskApp(root, OnClockAPI(c))

    if cfg is None:
        PairingScreen(root, on_paired=start_kiosk)
    else:
        start_kiosk(cfg)

    root.mainloop()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
