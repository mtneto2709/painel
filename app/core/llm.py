"""Wrapper fino sobre o SDK da Anthropic com as duas otimizações de custo
mais importantes do serviço: roteamento por modelo (tiering) e prompt
caching.

Uso típico:

    llm = ClaudeClient()
    result = llm.complete(
        tier="fast",
        system=[cacheable_block(SYSTEM_PROMPT)],
        messages=[{"role": "user", "content": "..."}],
        max_tokens=200,
    )
    # result.text, result.usage (para gravar em LLMUsageLog via core/costs.py)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import anthropic

from app.config import get_settings
from app.core.costs import estimate_cost_usd

Tier = Literal["fast", "primary"]


def cacheable_block(text: str) -> dict[str, Any]:
    """Marca um bloco de texto para prompt caching (Anthropic `cache_control`).

    Só vale a pena para blocos com ~1024+ tokens (system prompt, perfil do
    paciente, diretrizes recuperadas). Blocos pequenos/dinâmicos (a última
    fala do paciente, por exemplo) não devem ser cacheados.
    """
    return {"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}


@dataclass(frozen=True)
class LLMUsage:
    model: str
    input_tokens: int
    output_tokens: int
    cache_write_tokens: int
    cache_read_tokens: int

    @property
    def estimated_cost_usd(self) -> float:
        return estimate_cost_usd(
            self.model,
            self.input_tokens,
            self.output_tokens,
            self.cache_write_tokens,
            self.cache_read_tokens,
        )


@dataclass(frozen=True)
class LLMResult:
    text: str
    usage: LLMUsage
    stop_reason: str | None


class DailyBudgetExceeded(RuntimeError):
    pass


class ClaudeClient:
    """Cliente único para as duas situações do agente.

    `tier="fast"` -> Haiku (roteamento, triagem, extração, classificação).
    `tier="primary"` -> Sonnet (síntese clínica, raciocínio diagnóstico).
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._settings = settings
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self._model_by_tier: dict[Tier, str] = {
            "fast": settings.llm_model_fast,
            "primary": settings.llm_model_primary,
        }

    def model_for(self, tier: Tier) -> str:
        return self._model_by_tier[tier]

    def complete(
        self,
        *,
        tier: Tier,
        messages: list[dict[str, Any]],
        system: str | list[dict[str, Any]] | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> LLMResult:
        model = self.model_for(tier)
        response = self._client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system or anthropic.NOT_GIVEN,
            messages=messages,
        )
        usage = LLMUsage(
            model=model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            cache_write_tokens=getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
            cache_read_tokens=getattr(response.usage, "cache_read_input_tokens", 0) or 0,
        )
        text = "".join(block.text for block in response.content if block.type == "text")
        return LLMResult(text=text, usage=usage, stop_reason=response.stop_reason)

    def stream(
        self,
        *,
        tier: Tier,
        messages: list[dict[str, Any]],
        system: str | list[dict[str, Any]] | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ):
        """Streaming para a Situação 2 (sugestões incrementais em tempo real).

        Gera eventos de texto conforme chegam; o usage final (para
        auditoria de custo) vem no evento `message_stop`, tratado pelo
        chamador via `stream.get_final_message()`.
        """
        model = self.model_for(tier)
        with self._client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system or anthropic.NOT_GIVEN,
            messages=messages,
        ) as stream:
            yield from stream.text_stream
            final = stream.get_final_message()
            usage = LLMUsage(
                model=model,
                input_tokens=final.usage.input_tokens,
                output_tokens=final.usage.output_tokens,
                cache_write_tokens=getattr(final.usage, "cache_creation_input_tokens", 0) or 0,
                cache_read_tokens=getattr(final.usage, "cache_read_input_tokens", 0) or 0,
            )
            self.last_stream_usage = usage
