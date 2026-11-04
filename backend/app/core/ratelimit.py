import threading
import time
from collections import defaultdict, deque

from app.core.errors import AppError


class RateLimiter:
    """In-memory sliding-window limiter (single process). Swap for Redis when scaling out."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def hit(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - window:
                q.popleft()
            if len(q) >= limit:
                return False, max(1, int(window - (now - q[0])))
            q.append(now)
            return True, 0

    def check(self, key: str, limit: int, window: int, message: str = "Too many requests. Please slow down.") -> None:
        ok, retry = self.hit(key, limit, window)
        if not ok:
            raise AppError(429, "rate_limited", message, headers={"Retry-After": str(retry)})

    def peek_blocked(self, key: str, limit: int, window: int) -> int:
        now = time.monotonic()
        with self._lock:
            q = self._hits.get(key)
            if not q:
                return 0
            while q and q[0] <= now - window:
                q.popleft()
            if len(q) >= limit:
                return max(1, int(window - (now - q[0])))
            return 0


limiter = RateLimiter()
