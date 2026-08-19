"""Tabela de preços e cálculo de custo estimado por chamada ao LLM.

Os valores abaixo são uma referência de USD por milhão de tokens e DEVEM ser
revisados periodicamente (a Anthropic pode alterar preços). Mantê-los aqui,
centralizados, é o que permite que `llm_usage_log` (app/db/models.py) tenha
custo estimado por chamada sem espalhar números mágicos pelo código.

Cache read é a alavanca mais importante de economia em produção: custa uma
fração do input token normal (ver ARCHITECTURE.md §5).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelPricing:
    input_per_mtok: float
    cache_write_per_mtok: float
    cache_read_per_mtok: float
    output_per_mtok: float


# USD por 1_000_000 de tokens. Ajustar conforme tabela oficial vigente:
# https://docs.claude.com/en/docs/about-claude/pricing
PRICING: dict[str, ModelPricing] = {
    "claude-sonnet-5": ModelPricing(
        input_per_mtok=3.00,
        cache_write_per_mtok=3.75,
        cache_read_per_mtok=0.30,
        output_per_mtok=15.00,
    ),
    "claude-haiku-4-5-20251001": ModelPricing(
        input_per_mtok=0.80,
        cache_write_per_mtok=1.00,
        cache_read_per_mtok=0.08,
        output_per_mtok=4.00,
    ),
}


def estimate_cost_usd(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_write_tokens: int = 0,
    cache_read_tokens: int = 0,
) -> float:
    pricing = PRICING.get(model)
    if pricing is None:
        return 0.0
    return (
        input_tokens * pricing.input_per_mtok
        + cache_write_tokens * pricing.cache_write_per_mtok
        + cache_read_tokens * pricing.cache_read_per_mtok
        + output_tokens * pricing.output_per_mtok
    ) / 1_000_000
