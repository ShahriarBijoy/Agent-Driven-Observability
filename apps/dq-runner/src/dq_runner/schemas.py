"""Pydantic mirror of the gateway's ChatResponse contract (packages/contracts).

Python cannot run the Zod schema directly, so the schema DQ check validates
stored responses against this hand-mirrored model. Keep it in sync with
packages/contracts/src/gateway.ts.
"""

from __future__ import annotations

from pydantic import BaseModel


class Usage(BaseModel):
    promptTokens: int
    completionTokens: int


class RetrievedRef(BaseModel):
    chunkId: str
    docId: str
    score: float
    snippet: str


class ChatResponse(BaseModel):
    completion: str
    model: str
    usage: Usage
    retrieved: list[RetrievedRef]
    cached: bool
