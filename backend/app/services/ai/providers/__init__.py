from app.services.ai.providers.base import ProviderAdapter
from app.services.ai.providers.http_providers import HuggingFaceAdapter, OllamaAdapter
from app.services.ai.providers.sdk_providers import AnthropicAdapter, GroqAdapter, OpenAIAdapter
from app.core.config import get_settings

# Add a new provider by writing an adapter and registering it here — nothing else changes.
_ADAPTERS: dict[str, ProviderAdapter] = {a.id: a for a in (GroqAdapter(), OpenAIAdapter(), AnthropicAdapter(), OllamaAdapter(), HuggingFaceAdapter())}


def get_adapter(provider: str) -> ProviderAdapter:
    return _ADAPTERS[provider]


def provider_ids() -> list[str]:
    return list(_ADAPTERS)


def catalog() -> list[dict]:
    groq_key_available = bool(get_settings().groq_api_key)
    return [
        {
            "id": a.id, "label": a.label, "needs_key": a.needs_key, "cloud": a.cloud, "supports_base_url": a.supports_base_url,
            "env_key_available": groq_key_available if a.id == "groq" else False,
            "base_url_hint": a.base_url_hint, "default_model": a.default_model, "suggested_models": a.suggested_models,
            "default_params": a.default_params, "param_schema": {k: list(v) for k, v in a.param_schema.items()},
        }
        for a in _ADAPTERS.values()
    ]
