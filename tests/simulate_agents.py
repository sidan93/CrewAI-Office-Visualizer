#!/usr/bin/env python3
"""Simulate office activity for multiple agents.

Environment variables:
  Required:
    BASE_URL
  Optional:
    WORKSPACE_TOKEN
    WORKSPACE_ID (or PROJECT_ID as alias)
    WORKSPACE_NAME="Simulator Workspace"  # used when workspace is auto-created
    AGENTS_COUNT=10
    RUN_STEPS=0                  # 0 means infinite
    TICK_SECONDS_MIN=1.0
    TICK_SECONDS_MAX=4.0
    SEED                          # deterministic simulation when provided
    REQUEST_TIMEOUT_SEC=5
    RETRY_COUNT=2
    TASK_CHANGE_PROBABILITY=0.35
    MEETING_PROBABILITY=0.2
    IDLE_PROBABILITY=0.2
    TASK_POOL="Task A,Task B,Task C"
"""

from __future__ import annotations

import json
import os
import random
import signal
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlencode, urlparse, urlunparse

ALLOWED_ACTIONS = ("REGISTERED", "WORKING", "MEETING", "IDLE")
DEFAULT_TASK_POOL = [
    "Review backlog",
    "Prepare architecture proposal",
    "Implement API endpoint",
    "Write tests for workflow",
    "Investigate production alert",
    "Refactor office panel",
    "Update project documentation",
    "Optimize DB query",
]


@dataclass
class Config:
    base_url: str
    workspace_id: str
    workspace_token: str
    agents_count: int
    run_steps: int
    tick_seconds_min: float
    tick_seconds_max: float
    seed: int | None
    request_timeout_sec: float
    retry_count: int
    task_change_probability: float
    meeting_probability: float
    idle_probability: float
    task_pool: list[str]


@dataclass
class AgentState:
    name: str
    current_action: str
    current_task: str
    task_started_at_ts: float


STOP_REQUESTED = False


def _env_str(key: str, default: str | None = None) -> str:
    value = os.getenv(key, default)
    if value is None or value == "":
        raise ValueError(f"{key} is required")
    return value


def _env_int(key: str, default: int) -> int:
    raw = os.getenv(key, str(default))
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{key} must be integer, got: {raw}") from exc


def _env_float(key: str, default: float) -> float:
    raw = os.getenv(key, str(default))
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"{key} must be float, got: {raw}") from exc


def _parse_task_pool() -> list[str]:
    raw = os.getenv("TASK_POOL", "")
    if not raw.strip():
        return DEFAULT_TASK_POOL[:]
    tasks = [part.strip() for part in raw.split(",")]
    tasks = [task for task in tasks if task]
    if not tasks:
        raise ValueError("TASK_POOL was provided but no non-empty tasks found")
    return tasks


def _http_post_json(url: str, payload: dict, timeout_sec: float) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout_sec) as response:
        raw = response.read().decode("utf-8", errors="replace")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Expected JSON from {url}, got: {raw}") from exc


def create_workspace(base_url: str, timeout_sec: float) -> tuple[str, str]:
    name = os.getenv("WORKSPACE_NAME", "Simulator Workspace")
    data = _http_post_json(f"{base_url}/workspaces", {"name": name}, timeout_sec)
    workspace_id = str(data.get("workspace_id", "")).strip()
    workspace_token = str(data.get("token", "")).strip()
    if not workspace_id or not workspace_token:
        raise ValueError("Workspace creation response does not contain workspace_id/token")
    return workspace_id, workspace_token


def build_ui_link(base_url: str, workspace_id: str, workspace_token: str) -> str:
    parsed = urlparse(base_url.rstrip("/"))
    scheme = parsed.scheme or "http"
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port
    ui_port = 17300 if port == 18765 else port
    netloc = host if ui_port is None else f"{host}:{ui_port}"
    query = urlencode({"token": workspace_token})
    return urlunparse((scheme, netloc, f"/w/{workspace_id}", "", query, ""))


def load_config() -> Config:
    base_url = _env_str("BASE_URL", "http://127.0.0.1:18765").rstrip("/")
    request_timeout_sec = _env_float("REQUEST_TIMEOUT_SEC", 5.0)
    workspace_id = os.getenv("WORKSPACE_ID", "").strip() or os.getenv("PROJECT_ID", "").strip()
    workspace_token = os.getenv("WORKSPACE_TOKEN", "").strip()

    if not workspace_id or not workspace_token:
        workspace_id, workspace_token = create_workspace(base_url, request_timeout_sec)
        print(f"[info] created workspace: {workspace_id}")
        print(f"[info] workspace token: {workspace_token}")
        print(f"[info] open UI: {build_ui_link(base_url, workspace_id, workspace_token)}")

    config = Config(
        base_url=base_url,
        workspace_id=workspace_id,
        workspace_token=workspace_token,
        agents_count=_env_int("AGENTS_COUNT", 10),
        run_steps=_env_int("RUN_STEPS", 0),
        tick_seconds_min=_env_float("TICK_SECONDS_MIN", 1.0),
        tick_seconds_max=_env_float("TICK_SECONDS_MAX", 4.0),
        seed=int(os.getenv("SEED")) if os.getenv("SEED") else None,
        request_timeout_sec=request_timeout_sec,
        retry_count=_env_int("RETRY_COUNT", 2),
        task_change_probability=_env_float("TASK_CHANGE_PROBABILITY", 0.35),
        meeting_probability=_env_float("MEETING_PROBABILITY", 0.2),
        idle_probability=_env_float("IDLE_PROBABILITY", 0.2),
        task_pool=_parse_task_pool(),
    )
    validate_config(config)
    return config


def validate_config(config: Config) -> None:
    if config.agents_count < 1:
        raise ValueError("AGENTS_COUNT must be >= 1")
    if config.run_steps < 0:
        raise ValueError("RUN_STEPS must be >= 0")
    if config.tick_seconds_min <= 0 or config.tick_seconds_max <= 0:
        raise ValueError("TICK_SECONDS_MIN and TICK_SECONDS_MAX must be > 0")
    if config.tick_seconds_min > config.tick_seconds_max:
        raise ValueError("TICK_SECONDS_MIN cannot be greater than TICK_SECONDS_MAX")
    if config.request_timeout_sec <= 0:
        raise ValueError("REQUEST_TIMEOUT_SEC must be > 0")
    if config.retry_count < 0:
        raise ValueError("RETRY_COUNT must be >= 0")

    for key, value in (
        ("TASK_CHANGE_PROBABILITY", config.task_change_probability),
        ("MEETING_PROBABILITY", config.meeting_probability),
        ("IDLE_PROBABILITY", config.idle_probability),
    ):
        if value < 0.0 or value > 1.0:
            raise ValueError(f"{key} must be in [0, 1]")
    if config.meeting_probability + config.idle_probability > 1.0:
        raise ValueError("MEETING_PROBABILITY + IDLE_PROBABILITY must be <= 1")


def setup_signal_handlers() -> None:
    def _stop_handler(_signum: int, _frame: object) -> None:
        global STOP_REQUESTED
        STOP_REQUESTED = True
        print("\n[info] Stop requested, finishing current step...")

    signal.signal(signal.SIGINT, _stop_handler)
    signal.signal(signal.SIGTERM, _stop_handler)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def make_event_message(agent: AgentState) -> str:
    started = datetime.fromtimestamp(agent.task_started_at_ts, tz=timezone.utc).strftime("%H:%M:%S")
    if agent.current_action == "WORKING":
        return f"Working on '{agent.current_task}' since {started} UTC"
    if agent.current_action == "MEETING":
        return f"In meeting about '{agent.current_task}' since {started} UTC"
    return f"On break, last task: '{agent.current_task}'"


def choose_action(cfg: Config) -> str:
    roll = random.random()
    if roll < cfg.meeting_probability:
        return "MEETING"
    if roll < (cfg.meeting_probability + cfg.idle_probability):
        return "IDLE"
    return "WORKING"


def maybe_change_task(agent: AgentState, cfg: Config) -> None:
    if random.random() < cfg.task_change_probability:
        old_task = agent.current_task
        new_task = random.choice(cfg.task_pool)
        if len(cfg.task_pool) > 1:
            while new_task == old_task:
                new_task = random.choice(cfg.task_pool)
        agent.current_task = new_task
        agent.task_started_at_ts = time.time()


def post_event(cfg: Config, agent: str, action: str, message: str) -> bool:
    if action not in ALLOWED_ACTIONS:
        raise ValueError(f"Invalid action: {action}")

    endpoint = f"{cfg.base_url}/w/{cfg.workspace_id}/event"
    payload = {"agent": agent, "action": action, "message": message}
    body = json.dumps(payload).encode("utf-8")

    attempts = cfg.retry_count + 1
    for attempt in range(1, attempts + 1):
        req = urllib.request.Request(
            endpoint,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {cfg.workspace_token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=cfg.request_timeout_sec) as response:
                raw = response.read().decode("utf-8", errors="replace")
                accepted = '"status":"accepted"' in raw.replace(" ", "")
                status_text = "ok" if accepted else "warn"
                print(
                    f"[{now_iso()}] [{status_text}] {agent} -> {action} "
                    f"(http={response.status}, attempt={attempt}/{attempts})"
                )
                if accepted:
                    return True
        except urllib.error.HTTPError as exc:
            try:
                details = exc.read().decode("utf-8", errors="replace")
            except Exception:
                details = "<no-body>"
            print(
                f"[{now_iso()}] [error] {agent} -> {action} "
                f"(http={exc.code}, attempt={attempt}/{attempts}) {details}"
            )
        except urllib.error.URLError as exc:
            print(
                f"[{now_iso()}] [error] {agent} -> {action} "
                f"(network, attempt={attempt}/{attempts}) {exc}"
            )

        if attempt < attempts:
            time.sleep(0.3 * attempt)
    return False


def create_agents(cfg: Config) -> list[AgentState]:
    return [
        AgentState(
            name=f"agent-{idx:02d}",
            current_action="REGISTERED",
            current_task=random.choice(cfg.task_pool),
            task_started_at_ts=time.time(),
        )
        for idx in range(1, cfg.agents_count + 1)
    ]


def register_agents(cfg: Config, agents: list[AgentState]) -> None:
    for agent in agents:
        message = f"Registered in workspace {cfg.workspace_id}"
        post_event(cfg, agent.name, "REGISTERED", message)


def run_simulation(cfg: Config) -> int:
    if cfg.seed is not None:
        random.seed(cfg.seed)

    agents = create_agents(cfg)
    register_agents(cfg, agents)

    step = 0
    failed_events = 0
    max_steps = cfg.run_steps
    print(
        f"[info] started: agents={cfg.agents_count}, run_steps={cfg.run_steps}, "
        f"workspace_id={cfg.workspace_id}"
    )
    print(f"[info] watch UI: {build_ui_link(cfg.base_url, cfg.workspace_id, cfg.workspace_token)}")
    while not STOP_REQUESTED:
        if max_steps > 0 and step >= max_steps:
            break

        step += 1
        batch_size = random.randint(1, len(agents))
        selected = random.sample(agents, k=batch_size)
        for agent in selected:
            maybe_change_task(agent, cfg)
            agent.current_action = choose_action(cfg)
            message = make_event_message(agent)
            ok = post_event(cfg, agent.name, agent.current_action, message)
            if not ok:
                failed_events += 1

        sleep_for = random.uniform(cfg.tick_seconds_min, cfg.tick_seconds_max)
        time.sleep(sleep_for)

    print(f"[info] finished: steps={step}, failed_events={failed_events}")
    return 1 if failed_events > 0 else 0


def main() -> int:
    try:
        cfg = load_config()
    except ValueError as exc:
        print(f"[fatal] invalid configuration: {exc}", file=sys.stderr)
        return 2

    setup_signal_handlers()
    return run_simulation(cfg)


if __name__ == "__main__":
    raise SystemExit(main())
