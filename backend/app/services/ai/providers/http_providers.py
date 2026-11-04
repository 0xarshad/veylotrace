"""Ollama (local REST API) and Hugging Face (Inference Providers router / dedicated endpoints) adapters."""

import httpx

from app.services.ai.providers import base
from app.services.ai.providers.base import ChatResult, ConnectionResult, ProviderAdapter, ProviderError, Runtime, classify, timeout

HF_ROUTER = "https://router.huggingface.co/v1"
HF_WHOAMI = "https://huggingface.co/api/whoami-v2"


def _client(headers: dict | None = None) -> httpx.Client:
    return httpx.Client(timeout=timeout(), headers=headers or {}, transport=base.HTTP_TRANSPORT, follow_redirects=False)


def _raise_for_status(r: httpx.Response, rt: Runtime) -> None:
    if r.status_code >= 400:
        exc = httpx.HTTPStatusError("http error", request=r.request, response=r)
        exc.status_code = r.status_code  # type: ignore[attr-defined]
        detail = ""
        try:
            detail = str(r.json().get("error", ""))[:200]
        except Exception:  # noqa: BLE001
            pass
        err = classify(exc, rt)
        if err.kind == "other" and detail:
            err = ProviderError("other", base.scrub(detail, rt))
        raise err


class OllamaAdapter(ProviderAdapter):
    id, label = "ollama", "Ollama (local)"
    needs_key = False
    cloud = False
    supports_base_url = True
    base_url_hint = "http://localhost:11434"
    default_model = "llama3.2"
    suggested_models = ["llama3.2", "qwen2.5", "mistral"]
    default_params = {"temperature": 0.3, "num_ctx": 8192, "num_predict": 1200}
    param_schema = {"temperature": (0, 2), "num_ctx": (512, 131072), "num_predict": (16, 8192), "top_p": (0.01, 1)}

    def _base(self, rt: Runtime) -> str:
        return base.validate_base_url(rt.base_url or self.base_url_hint, allow_local=True)

    def list_models(self, rt: Runtime) -> list[str]:
        try:
            with _client() as c:
                r = c.get(f"{self._base(rt)}/api/tags")
                _raise_for_status(r, rt)
                return sorted(m["name"] for m in r.json().get("models", []))
        except Exception as exc:  # noqa: BLE001
            raise classify(exc, rt)

    def chat(self, rt: Runtime, messages: list[dict]) -> ChatResult:
        opts = {**self.default_params, **self.clean_params(rt.params)}
        try:
            with _client() as c:
                r = c.post(f"{self._base(rt)}/api/chat", json={"model": rt.model or self.default_model, "messages": messages, "stream": False, "options": opts})
                _raise_for_status(r, rt)
                data = r.json()
        except Exception as exc:  # noqa: BLE001
            raise classify(exc, rt)
        return ChatResult(data.get("message", {}).get("content", ""), data.get("model", rt.model or ""), {"eval_count": data.get("eval_count")})


class HuggingFaceAdapter(ProviderAdapter):
    id, label = "huggingface", "Hugging Face"
    supports_base_url = True
    base_url_hint = "Optional dedicated endpoint URL, e.g. https://xyz.endpoints.huggingface.cloud"
    default_model = "meta-llama/Llama-3.3-70B-Instruct"
    suggested_models = ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct"]
    default_params = {"temperature": 0.3, "max_tokens": 1200}
    param_schema = {"temperature": (0, 2), "max_tokens": (16, 8192), "top_p": (0.01, 1)}

    def _endpoint(self, rt: Runtime) -> str:
        if rt.base_url:
            root = base.validate_base_url(rt.base_url, allow_local=False)
            return root if root.endswith("/v1") else f"{root}/v1"
        return HF_ROUTER

    def _headers(self, rt: Runtime) -> dict:
        return {"Authorization": f"Bearer {rt.api_key}"}

    def list_models(self, rt: Runtime) -> list[str]:
        try:
            with _client(self._headers(rt)) as c:
                if not rt.base_url:
                    w = c.get(HF_WHOAMI)  # validates the token itself
                    _raise_for_status(w, rt)
                r = c.get(f"{self._endpoint(rt)}/models")
                if r.status_code == 404 and rt.base_url:
                    return []  # dedicated endpoints may not expose /models
                _raise_for_status(r, rt)
                return sorted(m["id"] for m in r.json().get("data", []))
        except Exception as exc:  # noqa: BLE001
            raise classify(exc, rt)

    def test(self, rt: Runtime) -> ConnectionResult:
        res = super().test(rt)
        if rt.base_url and res.ok and not res.models:
            return ConnectionResult(True, "Connected to dedicated endpoint.")
        return res

    def chat(self, rt: Runtime, messages: list[dict]) -> ChatResult:
        p = {**self.default_params, **self.clean_params(rt.params)}
        model = rt.model or ("tgi" if rt.base_url else self.default_model)
        try:
            with _client(self._headers(rt)) as c:
                r = c.post(f"{self._endpoint(rt)}/chat/completions", json={"model": model, "messages": messages, "stream": False, **p})
                _raise_for_status(r, rt)
                data = r.json()
        except Exception as exc:  # noqa: BLE001
            raise classify(exc, rt)
        choices = data.get("choices") or [{}]
        return ChatResult(choices[0].get("message", {}).get("content", "") or "", data.get("model", model), data.get("usage", {}))
