"""Provider abstraction. Each provider has its own adapter (request/response formats differ) behind one interface."""

import ipaddress
import re
import socket
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings

# Tests inject an httpx transport here so no network is used.
HTTP_TRANSPORT: httpx.BaseTransport | None = None


class ProviderError(Exception):
    """Sanitised provider failure. `kind` is one of: auth, rate_limit, network, timeout, model, config, server, other."""

    def __init__(self, kind: str, message: str, retry_after: int | None = None):
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.retry_after = retry_after


@dataclass
class Runtime:
    provider: str
    api_key: str | None
    base_url: str | None
    model: str | None
    params: dict = field(default_factory=dict)


@dataclass
class ChatResult:
    text: str
    model: str
    usage: dict = field(default_factory=dict)


@dataclass
class ConnectionResult:
    ok: bool
    message: str
    models: list[str] = field(default_factory=list)


def timeout() -> float:
    return float(get_settings().ai_request_timeout_seconds)


def scrub(text: str, rt: Runtime) -> str:
    """Remove credentials from provider-originated text before it is stored or shown."""
    out = str(text)
    if rt.api_key:
        out = out.replace(rt.api_key, "[redacted]")
    out = re.sub(r"(sk-|gsk_|hf_|sk-ant-)[A-Za-z0-9_\-]{8,}", "[redacted]", out)
    return out[:500]


def classify(exc: Exception, rt: Runtime) -> ProviderError:
    if isinstance(exc, ProviderError):
        return exc
    status = getattr(exc, "status_code", None)
    name = type(exc).__name__
    msg = scrub(getattr(exc, "message", None) or str(exc), rt)
    retry = None
    headers = getattr(getattr(exc, "response", None), "headers", None)
    if headers is not None:
        ra = headers.get("retry-after")
        if ra and str(ra).isdigit():
            retry = int(ra)
    if isinstance(exc, (httpx.TimeoutException,)) or "Timeout" in name:
        return ProviderError("timeout", "The provider did not respond in time.")
    if isinstance(exc, (httpx.ConnectError, httpx.NetworkError)) or "Connection" in name:
        return ProviderError("network", "Could not connect to the provider.")
    if status in (401, 403):
        return ProviderError("auth", "The provider rejected the credentials.")
    if status == 404:
        return ProviderError("model", "Model or endpoint not found. Check the selected model.")
    if status == 429:
        return ProviderError("rate_limit", "Provider rate limit or quota reached. Try again later.", retry)
    if status and status >= 500:
        return ProviderError("server", "The provider reported a server error.")
    return ProviderError("other", msg or "Provider request failed.")


class ProviderAdapter(ABC):
    id: str
    label: str
    needs_key: bool = True
    cloud: bool = True
    default_model: str = ""
    suggested_models: list[str] = []
    default_params: dict = {}
    param_schema: dict = {}  # name -> (min, max)
    supports_base_url: bool = False
    base_url_hint: str = ""

    @abstractmethod
    def list_models(self, rt: Runtime) -> list[str]: ...

    @abstractmethod
    def chat(self, rt: Runtime, messages: list[dict]) -> ChatResult: ...

    def test(self, rt: Runtime) -> ConnectionResult:
        """Validates credentials and reachability without sending any personal data."""
        try:
            models = self.list_models(rt)
        except Exception as exc:  # noqa: BLE001
            err = classify(exc, rt)
            return ConnectionResult(False, err.message)
        note = ""
        if rt.model and models and rt.model not in models:
            note = f" Note: model '{rt.model}' was not found in the provider's model list."
        return ConnectionResult(True, f"Connected. {len(models)} model(s) available.{note}", models)

    def clean_params(self, params: dict) -> dict:
        out = {}
        for k, (lo, hi) in self.param_schema.items():
            if k in params and params[k] is not None:
                v = float(params[k])
                out[k] = int(min(max(v, lo), hi)) if k in ("max_tokens", "num_ctx", "num_predict") else min(max(v, lo), hi)
        return out


# ---------------- URL safety (SSRF) ----------------
def is_local_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not (ip.is_loopback or ip.is_private or ip.is_link_local):
            return False
    return True


def validate_base_url(url: str, *, allow_local: bool) -> str:
    p = urlparse(url.strip())
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ProviderError("config", "URL must start with http:// or https://")
    if p.username or p.password:
        raise ProviderError("config", "Credentials must not be embedded in the URL.")
    if not allow_local and p.scheme != "https":
        raise ProviderError("config", "Cloud endpoints must use https.")
    try:
        infos = socket.getaddrinfo(p.hostname, None)
    except socket.gaierror:
        raise ProviderError("config", "Host could not be resolved.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_link_local or ip.is_multicast or ip.is_unspecified or ip.is_reserved:
            raise ProviderError("config", "This address is not allowed.")  # blocks cloud metadata endpoints etc.
        if not allow_local and (ip.is_loopback or ip.is_private):
            raise ProviderError("config", "Private network addresses are not allowed for cloud endpoints.")
    return url.strip().rstrip("/")
