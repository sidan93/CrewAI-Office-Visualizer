import time
from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class IdleRoamConfig:
    idle_after_s: float = 45.0
    check_interval_s: float = 5.0
    roam_cooldown_s: float = 35.0


@dataclass(frozen=True)
class IdleRoamEmission:
    agent: str
    sequence: int


class IdleRoamTracker:
    def __init__(self) -> None:
        self._idle_since: dict[str, float] = {}
        self._last_idle_roam: dict[str, float] = {}
        self._idle_roam_seq: dict[str, int] = {}

    def observe_event(self, agent: str, action: str) -> None:
        now = time.monotonic()
        if action == "IDLE":
            self._idle_since.setdefault(agent, now)
            return
        self._idle_since.pop(agent, None)

    def collect(
        self,
        actions_by_agent: Mapping[str, str],
        config: IdleRoamConfig,
    ) -> list[IdleRoamEmission]:
        now = time.monotonic()
        emissions: list[IdleRoamEmission] = []

        for agent, action in actions_by_agent.items():
            if action != "IDLE":
                continue
            idle_since = self._idle_since.get(agent)
            if idle_since is None or now - idle_since < config.idle_after_s:
                continue
            last_roam = self._last_idle_roam.get(agent, 0.0)
            if now - last_roam < config.roam_cooldown_s:
                continue

            seq = self._idle_roam_seq.get(agent, 0) + 1
            self._idle_roam_seq[agent] = seq
            self._last_idle_roam[agent] = now
            emissions.append(IdleRoamEmission(agent=agent, sequence=seq))
        return emissions


def build_idle_roam_message(sequence: int) -> str:
    return f"auto-idle-roam:{sequence}"
