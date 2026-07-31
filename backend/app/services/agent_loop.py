"""
Civic Agent loop — Gemma function-calling over real backend tools.

Every factual claim in the final answer must come from an executed tool result.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Awaitable, Callable, Optional

from sqlalchemy.orm import Session

from app.services.agent_tools import (
    TOOL_REGISTRY,
    execute_tool,
    list_tools_for_prompt,
    rebuild_civic_knowledge_index,
)
from app.services.gemma import gemma

logger = logging.getLogger(__name__)

MAX_STEPS = 5

# Agent-loop budgets (separate from Health Watch / Metabolism narrative calls).
# Defaults keep legacy 8192/90 until diagnosis confirms; set DIAG_USE_LEGACY_BUDGETS=False
# path via the constants below after baseline measurement.
AGENT_DECISION_MAX_TOKENS = 1024
AGENT_DECISION_TIMEOUT_SEC = 30.0
AGENT_FINAL_MAX_TOKENS = 2048
AGENT_FINAL_TIMEOUT_SEC = 45.0

# Flip to True only for before-fix baseline runs that must use narrative budgets.
USE_LEGACY_NARRATIVE_BUDGETS = False

AGENT_SYSTEM_PROMPT = """You are the DystopiaCITY Civic Agent — a municipal function-calling agent.

You MUST respond with ONLY a single JSON object (no markdown fences, no prose outside JSON) in one of these forms:

1) Call a tool:
{"action":"call_tool","tool":"<tool_name>","params":{...},"reasoning":"<why this tool>"}

2) Give a final answer (only after you have the facts from tool results in this turn):
{"action":"final_answer","text":"<answer citing tool results>"}

Rules (non-negotiable):
- NEVER state a specific fact, number, ward status, risk score, complaint id, traffic level, or historical claim unless it appears in a tool result in this conversation.
- If you need information, call a tool. Do not invent wards, scores, or events.
- If a tool returns ward_not_found / area_not_found / error, report that honestly in final_answer — do not invent data.
- When using search_civic_knowledge matches, explicitly cite the source label (e.g. "Based on Complaint #12..." or "Based on Metabolism historical record: Aug 2022 flood...").
- Prefer the minimum number of tool calls needed. You have at most 5 steps.
- Keep reasoning fields short (one sentence). Do not write long chain-of-thought outside the JSON.
- Available tools:
"""


LlmFn = Callable[..., Awaitable[str]]
ProgressFn = Callable[[dict[str, Any]], Awaitable[None] | None]


def _parse_agent_json(raw: str) -> dict[str, Any] | None:
    text = (raw or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    parsed = gemma.parse_json(text)
    return parsed if isinstance(parsed, dict) and "action" in parsed else None


def _force_final_from_trace(trace: list[dict[str, Any]]) -> str:
    if not trace:
        return (
            "I reached my step limit before gathering enough tool data, and I have no "
            "tool results to cite. Please rephrase your question."
        )
    parts = [
        "I reached the 5-step tool limit before completing a full answer. "
        "Here is what real tool calls returned so far (not complete):"
    ]
    for step in trace:
        parts.append(
            f"- Tool `{step['tool']}` params={json.dumps(step['params'])} → "
            f"{json.dumps(step['result'])[:500]}"
        )
    return "\n".join(parts)


def _budget_for(kind: str) -> tuple[int, float]:
    """Return (max_output_tokens, timeout_sec) for an agent LLM call."""
    if USE_LEGACY_NARRATIVE_BUDGETS:
        return 8192, 90.0
    if kind == "final":
        return AGENT_FINAL_MAX_TOKENS, AGENT_FINAL_TIMEOUT_SEC
    return AGENT_DECISION_MAX_TOKENS, AGENT_DECISION_TIMEOUT_SEC


async def _default_llm(system: str, user: str, *, kind: str = "decision") -> str:
    tokens, timeout = _budget_for(kind)
    return await gemma.generate(
        system,
        user,
        json_mode=True,
        max_output_tokens=tokens,
        timeout=timeout,
    )


async def _emit(progress: Optional[ProgressFn], payload: dict[str, Any]) -> None:
    if not progress:
        return
    maybe = progress(payload)
    if hasattr(maybe, "__await__"):
        await maybe  # type: ignore[misc]


async def run_agent(
    db: Session,
    message: str,
    history: Optional[list[dict[str, str]]] = None,
    llm: Optional[LlmFn] = None,
    progress: Optional[ProgressFn] = None,
    role: Optional[str] = None,
) -> dict[str, Any]:
    """
    Run the civic agent loop.

    Returns answer, tool trace, steps_used, truncated, and timing diagnostics.
    """
    t_total0 = time.perf_counter()

    # Check for department-restricted queries when the user does not have the corresponding role
    msg_lower = message.lower()
    
    # 1. Traffic Department check
    traffic_keywords = [
        "adjust signal", "adjusting signal", "signal timing", "change light",
        "override signal", "camera feed", "raw camera", "live camera", "dystopia view",
        "junction x", "cross-traffic optimization", "signal duration"
    ]
    needs_traffic = any(k in msg_lower for k in traffic_keywords)
    if needs_traffic and role != "traffic":
        return {
            "answer": "That needs Traffic Department access — want me to take you to that panel?",
            "trace": [],
            "steps_used": 0,
            "truncated": False,
            "suggested_department": "traffic",
            "timing": {"total_ms": 0, "steps": []}
        }
        
    # 2. Operations Department check
    operations_keywords = [
        "stress test", "metabolism stress", "stress-test", "run a stress",
        "resilience index", "resilience score", "risk zone", "black spot",
        "trust score", "route recommendation", "bus route"
    ]
    needs_operations = any(k in msg_lower for k in operations_keywords)
    if needs_operations and role != "operations":
        return {
            "answer": "That needs City Operations access — want me to take you to that panel?",
            "trace": [],
            "steps_used": 0,
            "truncated": False,
            "suggested_department": "operations",
            "timing": {"total_ms": 0, "steps": []}
        }

    rebuild_civic_knowledge_index(db)
    llm_fn = llm or _default_llm
    system = AGENT_SYSTEM_PROMPT + list_tools_for_prompt()

    messages: list[dict[str, str]] = []
    for h in history or []:
        msg_role = h.get("role", "user")
        content = h.get("content", "")
        if msg_role in ("user", "assistant") and content:
            messages.append({"role": msg_role, "content": content})
    messages.append({"role": "user", "content": message})

    trace: list[dict[str, Any]] = []
    step_timings: list[dict[str, Any]] = []
    truncated = False

    tokens0, timeout0 = _budget_for("decision")
    logger.info(
        "[agent] start message=%r budgets legacy=%s decision_tokens=%s decision_timeout=%s",
        message[:120],
        USE_LEGACY_NARRATIVE_BUDGETS,
        tokens0,
        timeout0,
    )

    for step in range(1, MAX_STEPS + 1):
        await _emit(
            progress,
            {
                "phase": "llm",
                "step": step,
                "max_steps": MAX_STEPS,
                "label": f"Step {step}/{MAX_STEPS}: deciding next action…",
            },
        )
        conversation = _format_conversation(messages)
        # After tools have returned, allow the larger final budget (synthesis or more tools).
        call_kind = "final" if trace else "decision"
        t_llm0 = time.perf_counter()
        try:
            raw = await llm_fn(system, conversation, kind=call_kind)
        except TypeError:
            # Scripted/test LLMs may not accept kind=
            raw = await llm_fn(system, conversation)  # type: ignore[call-arg]
        llm_ms = round((time.perf_counter() - t_llm0) * 1000)
        google_meta = dict(getattr(gemma, "last_call_meta", {}) or {})
        parsed = _parse_agent_json(raw)

        timing_row: dict[str, Any] = {
            "step": step,
            "phase": "decision",
            "llm_ms": llm_ms,
            "tool": None,
            "tool_ms": None,
            "action": None,
            "google": google_meta,
        }

        logger.info(
            "[agent] step=%s llm_decision_ms=%s finishReason=%s retried=%s "
            "maxOutputTokens=%s timeout=%s ok=%s failure=%s",
            step,
            llm_ms,
            google_meta.get("finish_reason"),
            google_meta.get("retried"),
            google_meta.get("max_output_tokens"),
            google_meta.get("timeout"),
            google_meta.get("ok"),
            google_meta.get("failure_reason"),
        )

        if not parsed or "action" not in parsed:
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "ERROR: Your previous response was not valid agent JSON. "
                        'Respond ONLY with {"action":"call_tool",...} or '
                        '{"action":"final_answer","text":"..."}.'
                    ),
                }
            )
            t_llm0 = time.perf_counter()
            try:
                raw = await llm_fn(system, _format_conversation(messages), kind="decision")
            except TypeError:
                raw = await llm_fn(system, _format_conversation(messages))  # type: ignore[call-arg]
            llm_ms_retry = round((time.perf_counter() - t_llm0) * 1000)
            google_meta = dict(getattr(gemma, "last_call_meta", {}) or {})
            parsed = _parse_agent_json(raw)
            timing_row["llm_ms"] = llm_ms + llm_ms_retry
            timing_row["google"] = google_meta
            timing_row["parse_reprompt"] = True
            logger.info(
                "[agent] step=%s parse_reprompt llm_ms=%s finishReason=%s retried=%s",
                step,
                llm_ms_retry,
                google_meta.get("finish_reason"),
                google_meta.get("retried"),
            )
            if not parsed or "action" not in parsed:
                timing_row["action"] = "parse_failed"
                step_timings.append(timing_row)
                answer = (
                    "I could not produce a valid tool-calling response. "
                    "No unverified facts will be stated."
                )
                if trace:
                    answer = _force_final_from_trace(trace)
                total_ms = round((time.perf_counter() - t_total0) * 1000)
                logger.info("[agent] done steps=%s total_ms=%s truncated=True parse_failed", step, total_ms)
                return {
                    "answer": answer,
                    "trace": trace,
                    "steps_used": step,
                    "truncated": True,
                    "raw_last": raw[:500] if raw else "",
                    "timing": {"total_ms": total_ms, "steps": step_timings},
                }

        action = parsed.get("action")
        timing_row["action"] = action

        if action == "final_answer":
            # If this step already produced final_answer after tools, the LLM call above
            # was the synthesis call — mark it as final for timing clarity when tools exist.
            if trace:
                timing_row["phase"] = "final"
            text = str(parsed.get("text") or "").strip()
            if not text:
                text = _force_final_from_trace(trace)
            step_timings.append(timing_row)
            total_ms = round((time.perf_counter() - t_total0) * 1000)
            logger.info(
                "[agent] done steps_used=%s tool_calls=%s total_ms=%s timing=%s",
                step,
                len(trace),
                total_ms,
                json.dumps(step_timings),
            )
            return {
                "answer": text,
                "trace": trace,
                "steps_used": step,
                "truncated": False,
                "timing": {"total_ms": total_ms, "steps": step_timings},
            }

        if action != "call_tool":
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f'ERROR: Unknown action "{action}". '
                        'Use "call_tool" or "final_answer" only.'
                    ),
                }
            )
            step_timings.append(timing_row)
            continue

        tool_name = parsed.get("tool")
        params = parsed.get("params") or {}
        reasoning = str(parsed.get("reasoning") or "")

        if not isinstance(tool_name, str) or tool_name not in TOOL_REGISTRY:
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f'ERROR: Tool "{tool_name}" is not registered. '
                        f"Available: {list(TOOL_REGISTRY.keys())}. Try again."
                    ),
                }
            )
            step_timings.append(timing_row)
            continue

        if not isinstance(params, dict):
            messages.append(
                {
                    "role": "user",
                    "content": "ERROR: params must be a JSON object. Try again.",
                }
            )
            step_timings.append(timing_row)
            continue

        label = f"Step {step}/{MAX_STEPS}: running {tool_name}…"
        await _emit(
            progress,
            {
                "phase": "tool",
                "step": step,
                "max_steps": MAX_STEPS,
                "tool": tool_name,
                "params": params,
                "label": label,
            },
        )

        logger.info("[agent] step=%s tool=%s params=%s", step, tool_name, params)
        meta_before_tool = dict(getattr(gemma, "last_call_meta", {}) or {})
        t_tool0 = time.perf_counter()
        result = await execute_tool(db, tool_name, params)
        tool_ms = round((time.perf_counter() - t_tool0) * 1000)
        timing_row["tool"] = tool_name
        timing_row["tool_ms"] = tool_ms
        # Only attribute nested Gemma if the tool itself invoked Google (meta changed).
        nested_meta = dict(getattr(gemma, "last_call_meta", {}) or {})
        if nested_meta and nested_meta != meta_before_tool:
            timing_row["nested_gemma_after_tool"] = nested_meta
        logger.info(
            "[agent] step=%s tool=%s ok=%s tool_ms=%s nested_finishReason=%s nested_ms=%s",
            step,
            tool_name,
            result.get("ok"),
            tool_ms,
            (timing_row.get("nested_gemma_after_tool") or {}).get("finish_reason"),
            (timing_row.get("nested_gemma_after_tool") or {}).get("elapsed_ms"),
        )

        step_record = {
            "step": step,
            "tool": tool_name,
            "params": params,
            "result": result,
            "reasoning": reasoning,
            "llm_ms": timing_row["llm_ms"],
            "tool_ms": tool_ms,
        }
        trace.append(step_record)
        step_timings.append(timing_row)

        messages.append(
            {
                "role": "assistant",
                "content": json.dumps(
                    {
                        "action": "call_tool",
                        "tool": tool_name,
                        "params": params,
                        "reasoning": reasoning,
                    }
                ),
            }
        )
        messages.append(
            {
                "role": "user",
                "content": (
                    f"TOOL_RESULT for {tool_name}:\n"
                    f"{json.dumps(result, default=str)}\n\n"
                    "Continue: call another tool if needed, or respond with "
                    '{"action":"final_answer","text":"..."} using ONLY facts from tool results. '
                    "Cite source labels for any search_civic_knowledge facts."
                ),
            }
        )

        if step == MAX_STEPS:
            truncated = True
            answer = _force_final_from_trace(trace)
            await _emit(
                progress,
                {
                    "phase": "llm",
                    "step": step,
                    "max_steps": MAX_STEPS,
                    "label": f"Step {step}/{MAX_STEPS}: composing final answer…",
                },
            )
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "STEP LIMIT REACHED. You MUST now respond with "
                        '{"action":"final_answer","text":"..."} using only tool results gathered, '
                        "and explicitly say the answer may be incomplete due to the step limit."
                    ),
                }
            )
            t_llm0 = time.perf_counter()
            try:
                raw_final = await llm_fn(
                    system, _format_conversation(messages), kind="final"
                )
            except TypeError:
                raw_final = await llm_fn(system, _format_conversation(messages))  # type: ignore[call-arg]
            final_ms = round((time.perf_counter() - t_llm0) * 1000)
            google_meta = dict(getattr(gemma, "last_call_meta", {}) or {})
            step_timings.append(
                {
                    "step": step,
                    "phase": "final_forced",
                    "llm_ms": final_ms,
                    "tool": None,
                    "tool_ms": None,
                    "action": "final_answer",
                    "google": google_meta,
                }
            )
            parsed_final = _parse_agent_json(raw_final)
            if parsed_final and parsed_final.get("action") == "final_answer":
                text = str(parsed_final.get("text") or "").strip()
                if text:
                    answer = text
            total_ms = round((time.perf_counter() - t_total0) * 1000)
            logger.info(
                "[agent] done steps_used=%s tool_calls=%s total_ms=%s truncated=True timing=%s",
                step,
                len(trace),
                total_ms,
                json.dumps(step_timings),
            )
            return {
                "answer": answer,
                "trace": trace,
                "steps_used": step,
                "truncated": truncated,
                "timing": {"total_ms": total_ms, "steps": step_timings},
            }

    total_ms = round((time.perf_counter() - t_total0) * 1000)
    return {
        "answer": _force_final_from_trace(trace),
        "trace": trace,
        "steps_used": MAX_STEPS,
        "truncated": True,
        "timing": {"total_ms": total_ms, "steps": step_timings},
    }


def _format_conversation(messages: list[dict[str, str]]) -> str:
    parts = []
    for m in messages:
        parts.append(f"{m['role'].upper()}: {m['content']}")
    parts.append(
        "ASSISTANT: (respond with a single JSON object — call_tool or final_answer)"
    )
    return "\n\n".join(parts)
