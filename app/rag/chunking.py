"""Divisão de documentos longos em chunks para embedding/recuperação.

Chunking simples por parágrafo com sobreposição, suficiente para textos de
diretrizes clínicas (bem estruturados em seções). Se a qualidade de
recuperação exigir, evoluir para chunking consciente de estrutura (por
seção/heading) nos ingestores específicos.
"""

from __future__ import annotations


def chunk_text(text: str, max_chars: int = 1500, overlap_chars: int = 200) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        if len(current) + len(paragraph) + 2 <= max_chars:
            current = f"{current}\n\n{paragraph}" if current else paragraph
            continue
        if current:
            chunks.append(current)
        if len(paragraph) <= max_chars:
            current = paragraph
        else:
            for i in range(0, len(paragraph), max_chars - overlap_chars):
                chunks.append(paragraph[i : i + max_chars])
            current = ""

    if current:
        chunks.append(current)

    return chunks
