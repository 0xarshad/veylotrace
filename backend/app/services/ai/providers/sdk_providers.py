"""Groq, OpenAI and Anthropic adapters use the vendors' official Python SDKs."""

from app.services.ai.providers.base import ChatResult, ProviderAdapter, Runtime, classify, timeout


def _split_system(messages: list[dict]) -> tuple[str, list[dict]]:
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    return system, [m for m in messages if m["role"] != "system"]


class GroqAdapter(ProviderAdapter):
    id, label = "groq", "Groq"
    default_model = "openai/gpt-oss-120b"
    suggested_models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]
    default_params = {"temperature": 0.3, "max_tokens": 1200, "top_p": 1.0}
    param_schema = {"temperature": (0, 2), "max_tokens": (16, 8192), "top_p": (0.01, 1)}

    def make_client(self, rt: Runtime):
        from groq import Groq

        return Groq(api_key=rt.api_key, timeout=timeout(), max_retries=1)

    def list_models(self, rt: Runtime) -> list[str]:
        try:
            return sorted(m.id for m in self.make_client(rt).models.list().data)
        except Exception as exc:  # noqa: BLE001
            raise classify(exc, rt)

    def chat(self, rt: Runtime, messages: list[dict]) -> ChatResult:
        p = {**self.default_params, **self.clean_params(rt.params)}
        try:
            r = self.make_client(rt).chat.completions.create(model=rt.model or self.default_model, messages=messages, **p)
        except Exception as exc:  # noqa: BLE001
            raise classify(exc, rt)
        text = (r.choices[0].message.content or "") if r.choices else ""
        usage = getattr(r, "usage", None)
        return ChatResult(text, getattr(r, "model", rt.model or ""), {"total_tokens": getattr(usage, "total_tokens", None)})


class OpenAIAdapter(ProviderAdapter):
    id, label = "openai", "OpenAI"
    default_model = "gpt-4o-mini"
    suggested_models = ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"]
    default_params = {"temperature": 0.3, "max_tokens": 1200}
    param_schema = {"temperature": (0, 2), "max_tokens": (16, 16384), "top_p": (0.01, 1)}

    def make_client(self, rt: Runtime):
        from openai import OpenAI

        return OpenAI(api_key=rt.api_key, timeout=timeout(), max_retries=1)

    def list_models(self, rt: Runtime) -> list[str]:
        try:
            return sorted(m.id for m in self.make_client(rt).models.list().data if m.id.startswith(("gpt", "o", "chatgpt")))
        except Exception as exc:  # noqa: BLE001
            raise classify(exc, rt)

    def chat(self, rt: Runtime, messages: list[dict]) -> ChatResult:
        p = {**self.default_params, **self.clean_params(rt.params)}
        kwargs = {"model": rt.model or self.default_model, "messages": messages, "max_completion_tokens": p.pop("max_tokens")}
        kwargs.update(p)
        client = self.make_client(rt)
        try:
            try:
                r = client.chat.completions.create(**kwargs)
            except Exception as exc:  # noqa: BLE001
                # Some models (reasoning families) only accept default sampling parameters.
                if getattr(exc, "status_code", None) == 400 and ("temperature" in str(exc) or "top_p" in str(exc)):
                    kwargs.pop("temperature", None)
                    kwargs.pop("top_p", None)
                    r = client.chat.completions.create(**kwargs)
                else:
                    raise
        except Exception as exc:  # noqa: BLE001
            raise classify(exc, rt)
        text = (r.choices[0].message.content or "") if r.choices else ""
        usage = getattr(r, "usage", None)
        return ChatResult(text, getattr(r, "model", rt.model or ""), {"total_tokens": getattr(usage, "total_tokens", None)})


class AnthropicAdapter(ProviderAdapter):
    id, label = "anthropic", "Anthropic"
    default_model = "claude-sonnet-4-5"
    suggested_models = ["claude-sonnet-4-5", "claude-haiku-4-5"]
    default_params = {"temperature": 0.3, "max_tokens": 1200}
    param_schema = {"temperature": (0, 1), "max_tokens": (16, 8192)}

    def make_client(self, rt: Runtime):
        from anthropic import Anthropic

        return Anthropic(api_key=rt.api_key, timeout=timeout(), max_retries=1)

    def list_models(self, rt: Runtime) -> list[str]:
        try:
            return [m.id for m in self.make_client(rt).models.list(limit=100).data]
        except Exception as exc:  # noqa: BLE001
            raise classify(exc, rt)

    def chat(self, rt: Runtime, messages: list[dict]) -> ChatResult:
        p = {**self.default_params, **self.clean_params(rt.params)}
        system, rest = _split_system(messages)
        try:
            r = self.make_client(rt).messages.create(model=rt.model or self.default_model, system=system, messages=rest, **p)
        except Exception as exc:  # noqa: BLE001
            raise classify(exc, rt)
        text = "".join(b.text for b in r.content if getattr(b, "type", "") == "text")
        usage = getattr(r, "usage", None)
        return ChatResult(text, getattr(r, "model", rt.model or ""), {"input_tokens": getattr(usage, "input_tokens", None), "output_tokens": getattr(usage, "output_tokens", None)})


