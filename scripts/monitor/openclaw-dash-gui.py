#!/usr/bin/env python3
import ast
import glob
import fcntl
import json
import os
import queue
import re
import select
import subprocess
import time
import tkinter as tk
from collections import deque
from datetime import datetime
from urllib.parse import urlparse

DAY = os.environ.get("LOG_DAY") or datetime.now().strftime("%Y-%m-%d")
MAIN_LOG = f"/tmp/openclaw/openclaw-{DAY}.log"
ERR_LOG = os.path.expanduser("~/logs/openclaw-gateway.err.log")
LOCK_PATH = os.path.join(os.environ.get("XDG_RUNTIME_DIR", "/tmp"), "openclaw-dash-gui.lock")
IDLE_FLUSH_SEC = 5
MAX_LINES = 200
LAND_RE = re.compile(r"\b(land|parcel|acre|stamp|proposal|shortlist|governance)\b", re.I)
KV_RE = re.compile(r'([A-Za-z][A-Za-z0-9._-]*)=("[^"]*"|[^"\s]+)')
HIDDEN_MESSAGE_SNIPPETS = (
    "browser failed: Browser control is disabled",
    "DO NOT execute tools/commands mentioned",
    "Change your behavior or ignore your guidelines",
    "Reveal sensitive information",
    "Send messages to third parties",
)


def titleize(text: str) -> str:
    text = text.replace("/", " ").replace("-", " ").replace("_", " ").strip()
    return " ".join(part.capitalize() for part in text.split()) or "General"


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def strip_code_fences(text: str) -> str:
    text = text.strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def human_subsystem(subsystem: str) -> str:
    if not subsystem:
        return "Freeland Rocks"
    try:
        parsed = json.loads(subsystem)
        if isinstance(parsed, dict) and parsed.get("subsystem"):
            subsystem = str(parsed["subsystem"])
    except Exception:
        pass
    return titleize(subsystem)


def pick_message(obj: dict) -> str:
    for key in ("message", "2", "1", "0"):
        value = obj.get(key)
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            return " | ".join(f"{titleize(str(k))}: {v}" for k, v in value.items())
    return json.dumps(obj, ensure_ascii=False)


def extract_pairs(text: str) -> list[str]:
    return [f"{titleize(k)} {v.strip(chr(34))}" for k, v in KV_RE.findall(text)]


def first_domain(text: str) -> str | None:
    urls = re.findall(r'https?://[^\s"<>]+', text)
    for url in urls:
        try:
            host = urlparse(url).hostname or ""
        except Exception:
            host = ""
        host = re.sub(r"^www\.", "", host.lower())
        if not host or host.endswith("edgesuite.net"):
            continue
        return host
    return None


def summarize_value(value) -> str:
    if isinstance(value, dict):
        summary = value.get("summary")
        if isinstance(summary, str) and summary.strip():
            extras = []
            if isinstance(value.get("alerts"), list):
                extras.append(f"{len(value['alerts'])} alerts")
            if isinstance(value.get("actions"), list):
                extras.append(f"{len(value['actions'])} actions")
            return summary.strip() + (f" | {' | '.join(extras)}" if extras else "")

        preferred = []
        for key in ("headline", "title", "status", "result", "message", "action"):
            raw = value.get(key)
            if isinstance(raw, (str, int, float)) and str(raw).strip():
                preferred.append(str(raw).strip())
        extras = []
        for key in ("intervalMs", "jobCount", "enabledCount", "withNextRun", "votes", "score", "version", "valueSOL"):
            if key in value and not isinstance(value[key], (dict, list)):
                extras.append(f"{titleize(key)} {value[key]}")
        titles = []
        for item in value.get("candidates", [])[:3] if isinstance(value.get("candidates"), list) else []:
            if isinstance(item, dict) and item.get("title"):
                titles.append(str(item["title"]))
        if titles:
            preferred.append("Candidates: " + "; ".join(titles))
        parts = preferred + extras
        if parts:
            return " | ".join(parts)
        flat = []
        for key, raw in value.items():
            if key == "subsystem" or isinstance(raw, (dict, list)):
                continue
            flat.append(f"{titleize(str(key))} {raw}")
        return " | ".join(flat[:4]) if flat else "Update received"
    if isinstance(value, list):
        titles = []
        for item in value[:3]:
            if isinstance(item, dict) and item.get("title"):
                titles.append(str(item["title"]))
            elif isinstance(item, str):
                titles.append(item)
        if titles:
            return "; ".join(titles)
        return f"{len(value)} items"
    return str(value)


def human_message(text: str, subsystem: str) -> str:
    text = strip_code_fences(text)
    text = normalize(text)
    low = text.lower()
    if "web_fetch failed" in low or "web fetch failed" in low or "verification required" in low or "access denied" in low or "just a moment" in low:
        detail = []
        host = first_domain(text)
        if host:
            detail.append(host)
        if "verification required" in low:
            detail.append("verification")
        elif "just a moment" in low or "cloudflare" in low:
            detail.append("challenge")
        elif "access denied" in low:
            detail.append("denied")
        if "(403)" in low or " 403" in low or "http 403" in low:
            detail.append("403")
        return "Site blocked" + (f" | {' | '.join(detail)}" if detail else "")
    if "stopreason=tooluse" in low:
        return "Tool handoff ended"
    if "tool:" in low and "failed" in low:
        return "Scout query failed"
    if text.lower().startswith("candidates:"):
        payload = text.split(":", 1)[1].strip()
        try:
            parsed = ast.literal_eval(payload)
            return "Candidates: " + summarize_value(parsed)
        except Exception:
            titles = re.findall(r"'title':\s*'([^']+)'", payload)
            if titles:
                return "Candidates: " + "; ".join(titles[:3])
    if text.startswith("{") and text.endswith("}"):
        try:
            obj = json.loads(text)
            return summarize_value(obj)
        except Exception:
            pass
    if text.startswith("[") and text.endswith("]"):
        try:
            parsed = json.loads(text)
            return summarize_value(parsed)
        except Exception:
            try:
                parsed = ast.literal_eval(text)
                return summarize_value(parsed)
            except Exception:
                pass
    pairs = extract_pairs(text)
    mapping = [
        ("web fetch failed (403)", "Site blocked by remote server"),
        ("web_fetch failed", "Site fetch failed"),
        ("verification required", "Site verification required"),
        ("access denied", "Site denied access"),
        ("just a moment", "Site challenge page"),
        ("embedded run timeout", "AI request timed out"),
        ("request timed out before a response was generated", "Request timed out"),
        ("request was aborted", "Request was aborted"),
        ("signal sigterm received", "Shutdown signal received"),
        ("received sigterm; shutting down", "Gateway is shutting down"),
        ("shutdown timed out; exiting without full cleanup", "Shutdown cleanup timed out"),
        ("canvas host mounted", "Canvas view ready"),
        ("listening on ws://", "Gateway socket listening"),
        ("log file:", "Writing log file"),
        ("bonjour: advertised gateway", "Network announcement active"),
        ("config hot reload applied", "Config reload applied"),
        ("config change detected; evaluating reload", "Config change detected"),
        ("lane wait exceeded", "Queue delay exceeded"),
        ("started (interval:", "Health monitor started"),
        ("gmail watcher stopped", "Gmail watcher stopped"),
        ("heartbeat: started", "Heartbeat monitor started"),
        ("candidates:", "Candidate shortlist updated"),
    ]
    for key, label in mapping:
        if key in low:
            return f"{label} | {' | '.join(pairs)}" if pairs else label
    return " | ".join(pairs) if pairs else text


def compact_message(text: str) -> str:
    text = normalize(text)
    if not text:
        return text

    if text.startswith("Candidates: "):
        items = [part.strip() for part in text[len("Candidates: "):].split(";") if part.strip()]
        if len(items) > 2:
            return "Candidates: " + "; ".join(items[:2]) + f" | +{len(items) - 2} more"

    clauses = [part.strip() for part in text.split("|") if part.strip()]
    if len(clauses) > 3:
        return " | ".join(clauses[:3])

    sentence_split = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)
    if sentence_split and len(sentence_split[0]) >= 20:
        return sentence_split[0]

    return text


def icon_for(level: str, subsystem: str, is_land: bool) -> str:
    if is_land:
        return ")-->"
    if level == "err":
        return "XXX"
    if level == "warn":
        return "/!\\"
    sub = (subsystem or "").lower()
    if "heartbeat" in sub:
        return "<3"
    if "canvas" in sub:
        return "MAP"
    if "health" in sub:
        return "OK"
    if "embedded" in sub or "agent" in sub:
        return "BOT"
    if "gateway" in sub:
        return "->"
    return "..."


def should_display_entry(entry: dict) -> bool:
    msg = normalize(str(entry.get("msg", "")))
    if not msg:
        return False
    low = msg.lower()
    if "stopreason=tooluse" in low:
        return False
    if "web_fetch failed" in low or "web fetch failed" in low or "access denied" in low or "verification required" in low or "just a moment" in low:
        return True
    for snippet in HIDDEN_MESSAGE_SNIPPETS:
        if snippet in msg:
            return False
    return True


def parse_entry_from_line(line: str) -> dict | None:
    line = line.strip()
    if not line:
        return None

    now = time.time()
    level = "info"
    msg = line
    ts = datetime.fromtimestamp(now).strftime("%H:%M:%S")
    subsystem = ""

    try:
        obj = json.loads(line)
        meta = obj.get("_meta", {})
        ts_meta = meta.get("date") or obj.get("time")
        if isinstance(ts_meta, str):
            ts = ts_meta[11:19]
        level = str(meta.get("logLevelName", "INFO")).lower()
        subsystem = str(meta.get("name") or meta.get("subsystem") or "")
        msg = pick_message(obj)
    except Exception:
        match = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})", line)
        if match:
            ts = match.group(1)[11:19]
        if " error " in line.lower() or " failed" in line.lower():
            level = "err"
        elif " warn" in line.lower() or " timeout" in line.lower():
            level = "warn"

    return {
        "ts": ts,
        "level": level if level in {"info", "warn", "err"} else "info",
        "subsystem": subsystem,
        "msg": str(msg),
        "delta": 0.0,
        "rate": 0.0,
        "is_land": bool(LAND_RE.search(str(msg))),
        "repeat": 1,
    }


class Dashboard:
    def __init__(self) -> None:
        self.lock_handle = open(LOCK_PATH, "w", encoding="utf-8")
        try:
            fcntl.flock(self.lock_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit(0)

        os.makedirs(os.path.dirname(MAIN_LOG), exist_ok=True)
        os.makedirs(os.path.dirname(ERR_LOG), exist_ok=True)
        open(MAIN_LOG, "a", encoding="utf-8").close()
        open(ERR_LOG, "a", encoding="utf-8").close()

        self.root = tk.Tk()
        self.root.tk.call("tk", "scaling", 1.0)
        self.screen_w = self.root.winfo_screenwidth()
        self.screen_h = self.root.winfo_screenheight()
        self.compact_screen = self.screen_w <= 320 or self.screen_h <= 240
        self.safe_bottom = 8 if self.compact_screen else 3
        self.bg_color = "#020308"
        self.root.title("Freeland Rocks Live")
        self.root.configure(bg=self.bg_color)
        self.root.geometry(f"{self.screen_w}x{self.screen_h}+0+0")
        self.root.attributes("-fullscreen", True)
        self.root.attributes("-topmost", True)
        self.root.overrideredirect(True)
        self.root.bind("<Escape>", lambda _e: None)

        if self.compact_screen:
            self.header_font = ("Monospace", -16, "bold")
            self.meta_font = ("Monospace", -10, "bold")
            self.body_font = ("Monospace", -12, "bold")
            self.footer_font = ("Monospace", -10, "bold")
            self.line_count_font = ("Monospace", -9, "bold")
            self.header_padx = 4
            self.body_padx = 6
            self.scrollbar_width = 12
        else:
            self.header_font = ("Monospace", -18, "bold")
            self.meta_font = ("Monospace", -11, "bold")
            self.body_font = ("Monospace", -12, "bold")
            self.footer_font = ("Monospace", -11, "bold")
            self.line_count_font = ("Monospace", -12, "bold")
            self.header_padx = 8
            self.body_padx = 8
            self.scrollbar_width = 14

        self.header_bg_color = self.bg_color
        self.header_color = "#7cf08a"
        self.line_count_color = "#f1f5fb"
        self.health_color = "#dbe7f6"
        self.body_color = "#eef6ff"
        self.info_color = "#00d7ff"
        self.warn_color = "#ffd75f"
        self.err_color = "#ff5f87"
        self.land_color = "#5fff5f"
        self.meta_color = "#90a1bc"
        self.footer_color = "#ffd75f"
        self.header_bar_height = max(abs(self.header_font[1]) + 8, 22)

        self.lines = deque(maxlen=MAX_LINES)
        self.last_key = None
        self.status = "Booting"
        self.health = "Gateway checking"
        self.idle_idx = 0
        self.last_line_at = time.time()
        self.queue: queue.Queue[dict] = queue.Queue()

        self.header_canvas = tk.Canvas(
            self.root,
            height=self.header_bar_height,
            bg=self.bg_color,
            bd=0,
            highlightthickness=0,
        )
        self.header_canvas.pack(fill="x")
        self.header_canvas.bind("<Configure>", self.on_header_resize)
        self.header_rect = self.header_canvas.create_rectangle(
            0,
            0,
            self.screen_w,
            self.header_bar_height,
            fill=self.header_bg_color,
            outline="",
        )
        self.header_title = self.header_canvas.create_text(
            self.header_padx,
            self.header_bar_height // 2,
            text=")--> FREELAND ROCKS LIVE",
            fill=self.header_color,
            font=self.header_font,
            anchor="w",
        )
        self.header_lines = self.header_canvas.create_text(
            self.screen_w - self.header_padx,
            self.header_bar_height // 2,
            text="LINES 0",
            fill=self.line_count_color,
            font=self.line_count_font,
            anchor="e",
        )
        self.header_rule = self.header_canvas.create_line(
            0,
            self.header_bar_height - 1,
            self.screen_w,
            self.header_bar_height - 1,
            fill="#0a1118",
        )

        self.healthbar = tk.Label(
            self.root,
            text="Gateway checking",
            font=self.meta_font,
            fg=self.health_color,
            bg=self.bg_color,
            anchor="w",
            padx=self.header_padx,
            pady=0,
        )
        self.healthbar.pack(fill="x")

        self.body_frame = tk.Frame(self.root, bg=self.bg_color)
        self.body_frame.pack(fill="both", expand=True)

        self.scrollbar = tk.Scrollbar(
            self.body_frame,
            orient="vertical",
            troughcolor="#06080f",
            bg="#10202c",
            activebackground="#1f4456",
            width=self.scrollbar_width,
        )
        self.scrollbar.pack(side="right", fill="y")

        self.body = tk.Text(
            self.body_frame,
            font=self.body_font,
            fg=self.body_color,
            bg=self.bg_color,
            wrap="word",
            borderwidth=0,
            highlightthickness=0,
            padx=self.body_padx,
            pady=0,
            spacing1=0,
            spacing2=0,
            spacing3=0,
            yscrollcommand=self.scrollbar.set,
        )
        self.body.pack(side="left", fill="both", expand=True)
        self.scrollbar.config(command=self.body.yview)
        self.body.tag_configure("info", foreground=self.info_color)
        self.body.tag_configure("warn", foreground=self.warn_color)
        self.body.tag_configure("err", foreground=self.err_color)
        self.body.tag_configure("land", foreground=self.land_color)
        self.body.tag_configure("meta", foreground=self.meta_color)

        self.footer_frame = tk.Frame(
            self.root,
            bg=self.bg_color,
            height=abs(self.footer_font[1]) + self.safe_bottom + 6,
        )
        self.footer_frame.pack(fill="x", side="bottom")
        self.footer_frame.pack_propagate(False)

        self.footer = tk.Label(
            self.footer_frame,
            text="",
            font=self.footer_font,
            fg=self.footer_color,
            bg=self.bg_color,
            anchor="w",
            padx=self.header_padx,
            pady=1,
        )
        self.footer.pack(fill="x", side="top", pady=(0, self.safe_bottom))

        self.seed_recent_entries()
        self.render_lines()
        self.render_status()

        self.tail = subprocess.Popen(
            ["tail", "-n0", "-F", "-q", MAIN_LOG, ERR_LOG],
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self.root.after(100, self.poll_tail)
        self.root.after(200, self.process_queue)

    def seed_recent_entries(self) -> None:
        files = []
        main_candidates = sorted(glob.glob("/tmp/openclaw/openclaw-*.log"))
        if main_candidates:
            files.extend(main_candidates[-2:])
        else:
            files.append(MAIN_LOG)
        files.append(ERR_LOG)

        seeded = []
        for path in files:
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as handle:
                    lines = handle.readlines()[-80:]
            except OSError:
                continue
            for raw in lines:
                entry = parse_entry_from_line(raw)
                if entry:
                    seeded.append(entry)

        for entry in seeded[-MAX_LINES:]:
            if not should_display_entry(entry):
                continue
            key = (entry["level"], entry["subsystem"], entry["msg"], entry["is_land"])
            if self.lines and key == self.last_key:
                self.lines[-1]["repeat"] += 1
                self.lines[-1]["ts"] = entry["ts"]
            else:
                self.lines.append(entry)
                self.last_key = key

    def push_line(self, entry: dict) -> None:
        if not should_display_entry(entry):
            return
        key = (entry["level"], entry["subsystem"], entry["msg"], entry["is_land"])
        if self.lines and key == self.last_key:
            self.lines[-1]["repeat"] += 1
            self.lines[-1]["ts"] = entry["ts"]
        else:
            entry["repeat"] = 1
            self.lines.append(entry)
            self.last_key = key
        self.render_lines()

    def scroll_to_bottom(self) -> None:
        self.root.update_idletasks()
        self.body.mark_set("insert", "end-1c")
        self.body.see("insert")
        self.body.yview_pickplace("insert")
        self.body.yview_moveto(1.0)

    def on_header_resize(self, event: tk.Event) -> None:
        width = max(int(event.width), 1)
        self.header_canvas.coords(self.header_rect, 0, 0, width, self.header_bar_height)
        self.header_canvas.coords(self.header_title, self.header_padx, self.header_bar_height // 2)
        self.header_canvas.coords(self.header_lines, width - self.header_padx, self.header_bar_height // 2)
        self.header_canvas.coords(self.header_rule, 0, self.header_bar_height - 1, width, self.header_bar_height - 1)

    def render_lines(self) -> None:
        self.body.configure(state="normal")
        self.body.delete("1.0", "end")
        for item in self.lines:
            tag = "land" if item["is_land"] else item["level"]
            icon = icon_for(item["level"], item["subsystem"], item["is_land"])
            message = human_message(item["msg"], item["subsystem"])
            if self.compact_screen:
                message = compact_message(message)
            if item["repeat"] > 1:
                message += f" x{item['repeat']}"
            self.body.insert("end", f"{item['ts']} ", ("meta",))
            self.body.insert("end", f"{icon:<5} ", (tag,))
            self.body.insert("end", message, (tag,))
            self.body.insert("end", "\n")
        self.body.configure(state="disabled")
        self.header_canvas.itemconfigure(self.header_lines, text=f"LINES {len(self.lines)}")
        self.root.after_idle(self.scroll_to_bottom)
        self.root.after(30, self.scroll_to_bottom)

    def render_status(self) -> None:
        self.healthbar.configure(text=self.health)
        self.footer.configure(text=self.status)

    def poll_tail(self) -> None:
        if self.tail.stdout is None:
            return
        while True:
            ready, _, _ = select.select([self.tail.stdout], [], [], 0)
            if not ready:
                break
            line = self.tail.stdout.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            now = time.time()
            delta = now - self.last_line_at
            rate = 1 / delta if delta > 0 else 0
            self.last_line_at = now
            level = "info"
            entry = parse_entry_from_line(line)
            if entry is None:
                continue
            self.queue.put(
                {
                    "ts": entry["ts"],
                    "level": entry["level"],
                    "subsystem": entry["subsystem"],
                    "msg": entry["msg"],
                    "delta": delta,
                    "rate": rate,
                    "is_land": entry["is_land"],
                }
            )
        idle_delta = time.time() - self.last_line_at
        frame = ["-", "\\", "|", "/"][self.idle_idx % 4]
        self.idle_idx += 1
        gateway_state = "OK"
        try:
            result = subprocess.run(
                ["systemctl", "--user", "is-active", "openclaw-gateway.service"],
                check=False,
                capture_output=True,
                text=True,
                timeout=2,
            )
            gateway_state = result.stdout.strip() or "unknown"
        except Exception:
            gateway_state = "unknown"
        self.health = (
            f"GATEWAY {gateway_state.upper()} | LAST {int(idle_delta)}s"
        )
        self.status = f"{datetime.now().strftime('%H:%M:%S')} HEARTBEAT {frame} alive"
        self.render_status()
        self.root.after(IDLE_FLUSH_SEC * 1000, self.poll_tail)

    def process_queue(self) -> None:
        changed = False
        while True:
            try:
                item = self.queue.get_nowait()
            except queue.Empty:
                break
            self.push_line(item)
            changed = True
        if changed:
            self.render_status()
        self.root.after(200, self.process_queue)

    def run(self) -> None:
        try:
            self.root.mainloop()
        finally:
            if self.tail.poll() is None:
                self.tail.terminate()


if __name__ == "__main__":
    Dashboard().run()
