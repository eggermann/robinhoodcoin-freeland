#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_BROWSER_URL = "http://127.0.0.1:18791"
DEFAULT_CONFIG_PATH = Path.home() / ".openclaw" / "openclaw.json"
DEFAULT_STATE_PATH = Path.home() / ".openclaw" / "browser-watchdog-state.json"
DEFAULT_MAX_TABS = 2
DEFAULT_MAX_AGE_SECONDS = 15 * 60
DEFAULT_IDLE_STOP_SECONDS = 5 * 60
BLANK_URLS = {
    "",
    "about:blank",
    "chrome://newtab/",
    "chrome://new-tab-page/",
}


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Enforce a small OpenClaw browser footprint on Raspberry Pi by "
            "closing old tabs, capping total tabs, and stopping idle blank sessions."
        )
    )
    parser.add_argument(
        "--browser-url",
        default=os.environ.get("OPENCLAW_BROWSER_URL", DEFAULT_BROWSER_URL),
        help="OpenClaw browser control URL.",
    )
    parser.add_argument(
        "--config",
        default=os.environ.get("OPENCLAW_CONFIG", str(DEFAULT_CONFIG_PATH)),
        help="Path to openclaw.json.",
    )
    parser.add_argument(
        "--state-file",
        default=os.environ.get(
            "OPENCLAW_BROWSER_WATCHDOG_STATE",
            str(DEFAULT_STATE_PATH),
        ),
        help="Path to the watchdog state file.",
    )
    parser.add_argument(
        "--max-tabs",
        type=int,
        default=env_int("OPENCLAW_BROWSER_MAX_TABS", DEFAULT_MAX_TABS),
        help="Maximum number of tabs to keep open.",
    )
    parser.add_argument(
        "--max-age-seconds",
        type=int,
        default=env_int("OPENCLAW_BROWSER_MAX_AGE_SECONDS", DEFAULT_MAX_AGE_SECONDS),
        help="Close tabs older than this age.",
    )
    parser.add_argument(
        "--idle-stop-seconds",
        type=int,
        default=env_int(
            "OPENCLAW_BROWSER_IDLE_STOP_SECONDS",
            DEFAULT_IDLE_STOP_SECONDS,
        ),
        help="Stop the whole browser when only blank tabs remain for this long.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print intended actions without changing anything.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print a status line even when no action was required.",
    )
    return parser.parse_args()


def load_gateway_token(config_path: Path) -> str:
    with config_path.open("r", encoding="utf-8") as handle:
        cfg = json.load(handle)
    token = (
        cfg.get("gateway", {})
        .get("auth", {})
        .get("token", "")
        .strip()
    )
    if not token:
        raise RuntimeError(f"Missing gateway auth token in {config_path}")
    return token


def load_state(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        return {"seen_at": {}}
    except json.JSONDecodeError:
        return {"seen_at": {}}
    seen_at = data.get("seen_at", {})
    if not isinstance(seen_at, dict):
        seen_at = {}
    cleaned: dict[str, float] = {}
    for key, value in seen_at.items():
        if not isinstance(key, str):
            continue
        try:
            cleaned[key] = float(value)
        except (TypeError, ValueError):
            continue
    return {"seen_at": cleaned}


def save_state(path: Path, seen_at: dict[str, float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "seen_at": seen_at,
        "updated_at": int(time.time()),
    }
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


class BrowserClient:
    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    def request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers=self.headers,
            method=method,
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read()
        if not raw:
            return None
        return json.loads(raw.decode("utf-8"))

    def list_tabs(self) -> dict[str, Any]:
        return self.request("GET", "/tabs")

    def close_tab(self, target_id: str) -> None:
        encoded = urllib.parse.quote(target_id, safe="")
        self.request("DELETE", f"/tabs/{encoded}")

    def stop_browser(self) -> None:
        self.request("POST", "/stop", {})


def is_blank_tab(tab: dict[str, Any]) -> bool:
    url = str(tab.get("url", "")).strip().lower()
    return url in BLANK_URLS


def log(message: str) -> None:
    print(message)


def summarize_tabs(tabs: list[dict[str, Any]]) -> str:
    if not tabs:
        return "0 tabs"
    parts = []
    for tab in tabs:
        title = str(tab.get("title", "")).strip() or str(tab.get("url", "")).strip() or "untitled"
        parts.append(title[:60])
    return f"{len(tabs)} tabs: " + ", ".join(parts)


def main() -> int:
    args = parse_args()
    config_path = Path(args.config).expanduser()
    state_path = Path(args.state_file).expanduser()

    try:
        token = load_gateway_token(config_path)
    except Exception as exc:
        log(f"[error] {exc}")
        return 1

    state = load_state(state_path)
    seen_at: dict[str, float] = state["seen_at"]
    client = BrowserClient(args.browser_url, token)

    try:
        payload = client.list_tabs()
    except urllib.error.URLError as exc:
        if args.verbose:
            log(f"[skip] browser control unavailable: {exc.reason}")
        return 0
    except Exception as exc:
        log(f"[error] failed to query browser tabs: {exc}")
        return 1

    running = bool(payload.get("running"))
    raw_tabs = payload.get("tabs", [])
    tabs = [tab for tab in raw_tabs if isinstance(tab, dict) and tab.get("targetId")]

    if not running:
        if seen_at:
            save_state(state_path, {})
        if args.verbose:
            log("[ok] browser not running")
        return 0

    now = time.time()
    current_ids = {str(tab["targetId"]) for tab in tabs}
    seen_at = {target_id: ts for target_id, ts in seen_at.items() if target_id in current_ids}
    for index, tab in enumerate(tabs):
        target_id = str(tab["targetId"])
        if target_id not in seen_at:
            # OpenClaw lists the newest tabs first. Nudge first-seen timestamps
            # so a first-run overflow trims the oldest tabs at the end.
            seen_at[target_id] = now - (index * 0.001)

    close_reasons: dict[str, str] = {}
    for tab in tabs:
        target_id = str(tab["targetId"])
        age = now - seen_at[target_id]
        if age >= args.max_age_seconds:
            close_reasons[target_id] = f"age>{args.max_age_seconds}s"

    survivors = [tab for tab in tabs if str(tab["targetId"]) not in close_reasons]
    overflow = len(survivors) - args.max_tabs
    if overflow > 0:
        ordered = sorted(
            survivors,
            key=lambda tab: seen_at[str(tab["targetId"])],
        )
        for tab in ordered[:overflow]:
            target_id = str(tab["targetId"])
            close_reasons[target_id] = f"over-limit>{args.max_tabs}"

    if close_reasons:
        ordered_ids = sorted(close_reasons, key=lambda target_id: seen_at.get(target_id, now))
        for target_id in ordered_ids:
            if args.dry_run:
                log(f"[dry-run] close {target_id} ({close_reasons[target_id]})")
                continue
            try:
                client.close_tab(target_id)
                seen_at.pop(target_id, None)
                log(f"[close] {target_id} ({close_reasons[target_id]})")
            except urllib.error.HTTPError as exc:
                if exc.code != 404:
                    log(f"[warn] failed to close {target_id}: HTTP {exc.code}")
            except Exception as exc:
                log(f"[warn] failed to close {target_id}: {exc}")

        if not args.dry_run:
            try:
                payload = client.list_tabs()
                raw_tabs = payload.get("tabs", [])
                tabs = [tab for tab in raw_tabs if isinstance(tab, dict) and tab.get("targetId")]
                current_ids = {str(tab["targetId"]) for tab in tabs}
                seen_at = {
                    target_id: ts
                    for target_id, ts in seen_at.items()
                    if target_id in current_ids
                }
            except Exception as exc:
                log(f"[warn] failed to refresh tabs after close: {exc}")

    if tabs and all(is_blank_tab(tab) for tab in tabs):
        oldest_seen = min(seen_at.get(str(tab["targetId"]), now) for tab in tabs)
        idle_age = now - oldest_seen
        if idle_age >= args.idle_stop_seconds:
            if args.dry_run:
                log(f"[dry-run] stop browser (idle blank tabs for {int(idle_age)}s)")
            else:
                try:
                    client.stop_browser()
                    seen_at = {}
                    tabs = []
                    log(f"[stop] browser idle on blank tabs for {int(idle_age)}s")
                except Exception as exc:
                    log(f"[warn] failed to stop idle browser: {exc}")

    save_state(state_path, seen_at)

    if args.verbose and not close_reasons:
        log(f"[ok] {summarize_tabs(tabs)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
