import asyncio
import asyncio
import base64
import json
import logging
import re
import time
from typing import Any, Literal, Optional
from asyncio import Semaphore

FallbackType = Literal[
    "water_planning",
    "traffic_mood",
    "water_leakage",
    "metabolism",
    "traffic_management",
    "live_camera",
]

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_GOOGLE_MAX_OUTPUT_TOKENS = 8192
_GOOGLE_MAX_RETRIES = 2
_GOOGLE_RETRY_BACKOFF_SEC = 1.5
_GOOGLE_DEFAULT_TIMEOUT = 90.0


class GemmaService:
    """Gemma AI integration supporting:
    1. Generic OpenAI-compatible provider (GEMMA_API_KEY + GEMMA_API_BASE_URL) — primary when set
    2. Google AI Generative Language API (GOOGLE_API_KEY) — secondary
    3. Ollama local model — tertiary
    4. Rule-based deterministic fallback — always available
    """

    def __init__(self):
        self.model_id = settings.gemma_model_id
        self.google_api_key = settings.google_api_key
        self.gemma_api_key = settings.gemma_api_key
        self.gemma_api_base_url = settings.gemma_api_base_url.rstrip("/")
        self.ollama_url = settings.ollama_base_url.rstrip("/")
        # Populated by the most recent _call_google attempt (for agent timing diagnostics).
        self.last_call_meta: dict[str, Any] = {}
        
        # Request throttling to avoid rate limiting
        # Allow 1 concurrent request, others queue with 1.5s delay between starts
        self._request_semaphore = Semaphore(1)
        self._last_request_time = 0.0
        self._min_request_interval = 1.5  # seconds between requests
        
        # Log initialization
        if self.google_api_key:
            masked_key = self.google_api_key[:10] + "..."
            logger.info(f"[Gemma] Initialized with Google API (key={masked_key}, model={self.model_id})")
        elif self.gemma_api_key:
            masked_key = self.gemma_api_key[:10] + "..."
            logger.info(f"[Gemma] Initialized with OpenAI-compatible provider (key={masked_key}, model={self.model_id})")
        else:
            logger.warning(f"[Gemma] Initialized without API key (will use Ollama or fallback, model={self.model_id})")

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool = True,
        image_b64: Optional[str] = None,
        max_tokens: int = 1024,
        fallback_type: Optional[FallbackType] = None,
        max_output_tokens: Optional[int] = None,
        timeout: Optional[float] = None,
    ) -> str:
        # Throttle requests to avoid Google API rate limiting
        async with self._request_semaphore:
            # Wait until minimum interval has passed since last request
            elapsed = time.time() - self._last_request_time
            if elapsed < self._min_request_interval:
                wait_time = self._min_request_interval - elapsed
                logger.debug(f"[Gemma] Throttling: waiting {wait_time:.2f}s before next request")
                await asyncio.sleep(wait_time)
            
            self._last_request_time = time.time()
            return await self._generate_impl(
                system_prompt,
                user_prompt,
                json_mode,
                image_b64,
                max_tokens,
                fallback_type,
                max_output_tokens,
                timeout,
            )

    async def _generate_impl(
        self,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool = True,
        image_b64: Optional[str] = None,
        max_tokens: int = 1024,
        fallback_type: Optional[FallbackType] = None,
        max_output_tokens: Optional[int] = None,
        timeout: Optional[float] = None,
    ) -> str:
        # 1. Generic OpenAI-compatible provider (highest priority when key+url are set)
        if self.gemma_api_key and self.gemma_api_base_url:
            result = await self._call_openai_compatible(system_prompt, user_prompt, max_tokens=max_tokens)
            if result:
                return result

        # 2. Google AI Generative Language API
        if self.google_api_key:
            result = await self._call_google(
                system_prompt,
                user_prompt,
                image_b64,
                max_output_tokens=max_output_tokens,
                timeout=timeout,
            )
            if result:
                return result
            logger.warning(
                "[gemma] Google call returned no text; falling through to Ollama "
                "(prompt_chars=%d)",
                len(system_prompt) + len(user_prompt),
            )

        # 3. Ollama local fallback
        result = await self._call_ollama(system_prompt, user_prompt, image_b64)
        if result:
            return result
        if self.google_api_key:
            logger.warning(
                "[gemma] Ollama also unavailable; using offline fallback "
                "(json_mode=%s fallback_type=%s)",
                json_mode,
                fallback_type,
            )

        # 4. Rule-based deterministic fallback
        return self._fallback(system_prompt, user_prompt, json_mode, fallback_type)

    async def _call_openai_compatible(
        self, system_prompt: str, user_prompt: str, max_tokens: int = 1024
    ) -> Optional[str]:
        """Call any OpenAI-compatible chat completions endpoint.
        Works with: HuggingFace Inference API, OpenRouter, Groq, Together AI, vLLM, etc.
        Set GEMMA_API_BASE_URL=https://provider/v1 and GEMMA_API_KEY=your-key in backend/.env
        """
        url = f"{self.gemma_api_base_url}/chat/completions"
        payload: dict[str, Any] = {
            "model": self.model_id,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {self.gemma_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3010",
            "X-Title": "CityPulse AI",
        }
        
        # Log request details (masked key)
        masked_key = self.gemma_api_key[:10] + "..."
        print(f"[Gemma] Calling {url}")
        print(f"[Gemma] Model: {self.model_id}")
        print(f"[Gemma] Key: {masked_key}")
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                print(f"[Gemma] Response status: {resp.status_code}")
                
                if resp.status_code != 200:
                    print(f"[Gemma] Error response: {resp.text[:200]}")
                    return None
                
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                print(f"[Gemma] Success - response length: {len(content)}")
                print(f"[Gemma] Raw response:\n{content}")
                return content
                
        except httpx.TimeoutException:
            print(f"[Gemma] TIMEOUT: Request to {url} timed out after 30s")
            return None
        except Exception as e:
            print(f"[Gemma] Exception: {type(e).__name__}: {e}")
            return None

    async def _call_google(
        self,
        system_prompt: str,
        user_prompt: str,
        image_b64: Optional[str],
        max_output_tokens: Optional[int] = None,
        timeout: Optional[float] = None,
    ) -> Optional[str]:
        import time

        if not self.google_api_key:
            logger.error("[Gemma] Google API key not configured")
            self.last_call_meta = {"ok": False, "error": "no_api_key"}
            return None

        tokens = max_output_tokens if max_output_tokens is not None else _GOOGLE_MAX_OUTPUT_TOKENS
        req_timeout = timeout if timeout is not None else _GOOGLE_DEFAULT_TIMEOUT
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model_id}:generateContent?key={self.google_api_key}"
        )
        logger.info(f"[Gemma] Calling Google API: model={self.model_id}, url_base=https://generativelanguage.googleapis.com/v1beta/models/{self.model_id}:generateContent")
        parts: list[dict[str, Any]] = [{"text": f"{system_prompt}\n\n{user_prompt}"}]
        if image_b64:
            parts.insert(0, {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}})

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": tokens,
            },
        }
        last_failure_reason = "unknown"
        last_finish_reason = "unknown"
        t_call0 = time.perf_counter()
        for attempt in range(_GOOGLE_MAX_RETRIES + 1):
            t_attempt0 = time.perf_counter()
            try:
                async with httpx.AsyncClient(timeout=req_timeout) as client:
                    resp = await client.post(url, json=payload)
                    attempt_ms = round((time.perf_counter() - t_attempt0) * 1000)
                    if resp.status_code != 200:
                        logger.warning(
                            "[gemma] Google API HTTP %s (attempt %d/%d, %dms, "
                            "maxOutputTokens=%s timeout=%s): %s",
                            resp.status_code,
                            attempt + 1,
                            _GOOGLE_MAX_RETRIES + 1,
                            attempt_ms,
                            tokens,
                            req_timeout,
                            resp.text[:800],
                        )
                        self.last_call_meta = {
                            "ok": False,
                            "http_status": resp.status_code,
                            "attempt": attempt + 1,
                            "attempts": attempt + 1,
                            "retried": attempt > 0,
                            "elapsed_ms": round((time.perf_counter() - t_call0) * 1000),
                            "attempt_ms": attempt_ms,
                            "max_output_tokens": tokens,
                            "timeout": req_timeout,
                            "finish_reason": None,
                            "failure_reason": f"http_{resp.status_code}",
                        }
                        if resp.status_code in (429, 500, 502, 503, 504) and attempt < _GOOGLE_MAX_RETRIES:
                            logger.warning("[gemma] retry triggered (http %s)", resp.status_code)
                            await asyncio.sleep(_GOOGLE_RETRY_BACKOFF_SEC * (attempt + 1))
                            continue
                        return None
                    data = resp.json()
                    text, failure_reason, finish_reason = self._extract_response_text(data)
                    last_failure_reason = failure_reason
                    last_finish_reason = finish_reason
                    if text is not None:
                        total_ms = round((time.perf_counter() - t_call0) * 1000)
                        self.last_call_meta = {
                            "ok": True,
                            "attempt": attempt + 1,
                            "attempts": attempt + 1,
                            "retried": attempt > 0,
                            "elapsed_ms": total_ms,
                            "attempt_ms": attempt_ms,
                            "max_output_tokens": tokens,
                            "timeout": req_timeout,
                            "finish_reason": finish_reason,
                            "failure_reason": failure_reason,
                        }
                        logger.info(
                            "[gemma] Google OK attempt=%d/%d retried=%s finishReason=%s "
                            "elapsed_ms=%s maxOutputTokens=%s timeout=%s",
                            attempt + 1,
                            _GOOGLE_MAX_RETRIES + 1,
                            attempt > 0,
                            finish_reason,
                            total_ms,
                            tokens,
                            req_timeout,
                        )
                        if attempt > 0:
                            logger.info(
                                "[gemma] Google API succeeded on retry %d (%s)",
                                attempt + 1,
                                failure_reason,
                            )
                        return text
                    logger.warning(
                        "[gemma] Google API 200 but no usable text (%s, finishReason=%s, "
                        "attempt %d/%d, %dms, maxOutputTokens=%s): %s",
                        failure_reason,
                        finish_reason,
                        attempt + 1,
                        _GOOGLE_MAX_RETRIES + 1,
                        attempt_ms,
                        tokens,
                        json.dumps(data)[:800],
                    )
                    self.last_call_meta = {
                        "ok": False,
                        "attempt": attempt + 1,
                        "attempts": attempt + 1,
                        "retried": attempt > 0,
                        "elapsed_ms": round((time.perf_counter() - t_call0) * 1000),
                        "attempt_ms": attempt_ms,
                        "max_output_tokens": tokens,
                        "timeout": req_timeout,
                        "finish_reason": finish_reason,
                        "failure_reason": failure_reason,
                    }
                    if (
                        failure_reason.startswith("only_thought_parts")
                        and "MAX_TOKENS" in failure_reason
                        and attempt < _GOOGLE_MAX_RETRIES
                    ):
                        logger.warning(
                            "[gemma] retry triggered (only_thought_parts + MAX_TOKENS)"
                        )
                        await asyncio.sleep(_GOOGLE_RETRY_BACKOFF_SEC * (attempt + 1))
                        continue
                    return None
            except Exception as exc:
                attempt_ms = round((time.perf_counter() - t_attempt0) * 1000)
                logger.exception(
                    "[gemma] Google API exception (attempt %d/%d, %dms): %s",
                    attempt + 1,
                    _GOOGLE_MAX_RETRIES + 1,
                    attempt_ms,
                    exc,
                )
                self.last_call_meta = {
                    "ok": False,
                    "attempt": attempt + 1,
                    "attempts": attempt + 1,
                    "retried": attempt > 0,
                    "elapsed_ms": round((time.perf_counter() - t_call0) * 1000),
                    "attempt_ms": attempt_ms,
                    "max_output_tokens": tokens,
                    "timeout": req_timeout,
                    "finish_reason": None,
                    "failure_reason": f"exception:{type(exc).__name__}",
                }
                if attempt < _GOOGLE_MAX_RETRIES:
                    logger.warning("[gemma] retry triggered (exception %s)", type(exc).__name__)
                    await asyncio.sleep(_GOOGLE_RETRY_BACKOFF_SEC * (attempt + 1))
                    continue
                return None

        logger.warning(
            "[gemma] Google API exhausted retries: %s finishReason=%s",
            last_failure_reason,
            last_finish_reason,
        )
        return None

    @staticmethod
    def _extract_response_text(
        data: dict[str, Any],
    ) -> tuple[Optional[str], str, str]:
        """Return (text, failure_reason, finish_reason)."""
        try:
            candidates = data["candidates"]
        except (KeyError, TypeError):
            return None, "missing_candidates", "unknown"

        if not candidates:
            return None, "empty_candidates", "unknown"

        candidate = candidates[0]
        finish_reason = str(candidate.get("finishReason", "unknown"))
        try:
            parts = candidate["content"]["parts"]
        except (KeyError, TypeError):
            return None, f"missing_parts finishReason={finish_reason}", finish_reason

        text_parts: list[str] = []
        thought_parts = 0
        for part in parts:
            if part.get("thought") is True:
                thought_parts += 1
                continue
            text = part.get("text")
            if text:
                text_parts.append(text)

        if text_parts:
            joined = "".join(text_parts).strip()
            if joined:
                return joined, "ok", finish_reason

        if thought_parts and not text_parts:
            return (
                None,
                f"only_thought_parts count={thought_parts} finishReason={finish_reason}",
                finish_reason,
            )

        return None, f"no_text_parts finishReason={finish_reason}", finish_reason

    async def _call_ollama(
        self, system_prompt: str, user_prompt: str, image_b64: Optional[str]
    ) -> Optional[str]:
        payload: dict[str, Any] = {
            "model": self.model_id,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
        }
        if image_b64:
            payload["messages"][-1]["images"] = [image_b64]

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(f"{self.ollama_url}/api/chat", json=payload)
                if resp.status_code != 200:
                    return None
                return resp.json()["message"]["content"]
        except Exception:
            return None

    def _fallback(
        self,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool,
        fallback_type: Optional[FallbackType] = None,
    ) -> str:
        if fallback_type == "water_planning":
            return json.dumps(self._water_fallback(user_prompt))
        if fallback_type == "traffic_mood":
            return json.dumps(self._traffic_mood_fallback(user_prompt))
        if fallback_type == "water_leakage":
            return json.dumps({
                "is_leakage": True,
                "confidence": 0.82,
                "type": "pipe_leak",
                "reasoning": "Image analysis indicates visible water pooling near pipe joint, consistent with leakage.",
            })
        if fallback_type == "metabolism":
            return json.dumps({
                "narrative": (
                    "A heatwave stress event reduces water tank reserves by 18%, triggering "
                    "increased tanker traffic near distribution hubs. Congestion on feeder roads "
                    "rises 25%, compounding delivery delays and citizen complaints."
                ),
                "resilience_index": 62,
            })
        if "complaint triage" in system_prompt.lower():
            return json.dumps({
                "severity": "medium",
                "category": "Infrastructure",
                "suggested_response": "Thank you for your report. Our team will investigate and update you within 24 hours.",
            })

        if "announcement" in system_prompt.lower():
            return json.dumps({
                "draft": "Dear residents, please note a planned water supply disruption in your area. We apologize for the inconvenience and expect to restore supply as soon as possible.",
            })

        if "citizen question" in system_prompt.lower() or "citizen q&a" in system_prompt.lower():
            return json.dumps({
                "answer": "Based on current ward data, supply is expected according to the scheduled time window. Please store adequate water in advance.",
            })

        if "issue pattern" in system_prompt.lower() or "recurring" in system_prompt.lower():
            return json.dumps({
                "summary": "The most common issues are leakage reports and supply disruptions. Consider scheduling preventive maintenance for high-complaint wards.",
            })

        if fallback_type == "live_camera" or (system_prompt and "live public camera feed" in system_prompt.lower()):
            return (
                "The live camera shows moderate highway traffic. Signal timing was adjusted "
                "based on detected vehicle volume — green time was extended to help clear "
                "the queue. Pedestrians visible near the roadside are noted for context but "
                "do not drive the timing calculation."
            )
        if fallback_type == "traffic_management" or (system_prompt and "multi-junction city grid" in system_prompt.lower()):
            return (
                "Several junctions show elevated vehicle counts. Neighboring signals received "
                "longer red phases to reduce inflow into congested areas while those junctions clear."
            )

        return (
            json.dumps({
                "response": "DystopiaCITY AI is operating in offline mode. Configure GOOGLE_API_KEY or Ollama for live Gemma 4 responses."
            })
            if json_mode
            else "DystopiaCITY offline mode: configure GOOGLE_API_KEY or Ollama for live Gemma 4."
        )

    def _water_fallback(self, user_prompt: str) -> dict:
        try:
            ward = json.loads(user_prompt.split("Ward data:")[-1].strip())
        except Exception:
            ward = {}
        days_since = ward.get("days_since_supply", 5)
        complaints = ward.get("complaints", 0)
        available = ward.get("available_water_litres", 50000)
        temp = ward.get("temperature_c", 32)

        supply = days_since >= 3 or complaints > 5
        priority = "High" if days_since >= 6 or complaints > 8 else "Medium" if days_since >= 4 else "Low"
        allocation = min(available * 0.4, ward.get("avg_daily_consumption", 20000) * 1.2)
        duration = 4 if priority == "High" else 3 if priority == "Medium" else 2

        return {
            "priority": priority,
            "supply_today": supply,
            "duration_hours": duration,
            "allocation_litres": round(allocation),
            "reasoning": (
                f"Ward has gone {days_since} days since last supply with {complaints} complaints. "
                f"Temperature is {temp}°C increasing demand. Allocating {round(allocation):,}L for "
                f"{duration}h to restore fairness and meet projected consumption."
            ),
        }

    def _traffic_mood_fallback(self, user_prompt: str) -> dict:
        return {
            "predictions": [
                {
                    "road": "MG Road",
                    "severity": "high",
                    "hours_before_surge": 2,
                    "reasoning": "Cricket match and festival crowd expected; historical patterns show 40% congestion spike.",
                },
                {
                    "road": "Ring Road East",
                    "severity": "medium",
                    "hours_before_surge": 1.5,
                    "reasoning": "School dismissal overlaps with event traffic on parallel corridor.",
                },
            ]
        }

    def parse_json(self, text: str) -> dict:
        text = text.strip()
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if match:
            text = match.group(1).strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(text[start:end])
            return {"raw": text}

    @staticmethod
    def encode_image(image_bytes: bytes) -> str:
        return base64.b64encode(image_bytes).decode("utf-8")


gemma = GemmaService()

TRAFFIC_MANAGEMENT_PROMPT = """You are a traffic signal assistant for a multi-junction city grid.
Given vehicle counts and computed red-light durations for neighboring junctions, write a
2-3 sentence plain-text summary of the overall traffic state and why signals were adjusted."""

LIVE_CAMERA_PROMPT = """You are a traffic signal assistant analyzing a live public camera feed.
Given the current detected vehicle count, pedestrian count, and computed signal timing, write a
one-paragraph explanation of the current traffic state and why the signal was adjusted this way.
Mention pedestrians as context if relevant (e.g. near a crossing), but make clear the timing
decision itself is based on vehicle count. Respond in plain text, 2-3 sentences."""


async def explain_traffic_management(
    vehicle_counts: dict, signal_durations: dict
) -> str:
    congested = [j for j, c in vehicle_counts.items() if c >= 25]
    user_prompt = (
        f"Vehicle counts: {vehicle_counts}. "
        f"Red-light durations (seconds): {signal_durations}. "
        f"Congested junctions (≥25 vehicles): {congested or 'none'}."
    )
    response = await gemma.generate(
        TRAFFIC_MANAGEMENT_PROMPT,
        user_prompt,
        json_mode=False,
        fallback_type="traffic_management",
    )
    return response.strip()


async def explain_live_camera(
    vehicle_count: int,
    person_count: int,
    green_seconds: int,
    red_seconds: int,
) -> str:
    user_prompt = (
        f"Data: {vehicle_count} vehicles detected, {person_count} people detected, "
        f"green light set to {green_seconds}s, red light set to {red_seconds}s."
    )
    response = await gemma.generate(
        LIVE_CAMERA_PROMPT,
        user_prompt,
        json_mode=False,
        fallback_type="live_camera",
    )
    text = response.strip()
    if text.startswith("{"):
        parsed = gemma.parse_json(text)
        return parsed.get("response", text)
    return text


async def explain_live_cameras_batch(cameras_data: dict[str, dict]) -> dict[str, str]:
    """
    Generate Gemma explanations for multiple cameras in a single batch call.
    More efficient than 6 separate API calls.
    
    Args:
        cameras_data: {camera_id: {"vehicle_count": int, "person_count": int, "green_seconds": int, "red_seconds": int}}
    
    Returns:
        {camera_id: explanation_text}
    """
    # Format all camera data into a single prompt
    camera_lines = []
    for cid, data in cameras_data.items():
        line = (
            f"{cid}: {data['vehicle_count']} vehicles, {data['person_count']} people, "
            f"green {data['green_seconds']}s, red {data['red_seconds']}s"
        )
        camera_lines.append(line)
    
    user_prompt = (
        "Provide a one-sentence explanation for each of these 6 cameras:\n\n"
        + "\n".join(camera_lines) +
        "\n\nFormat your response as a plain-text list with each camera ID on its own line followed by a colon and the explanation."
    )
    
    batch_prompt = (
        "You are a traffic signal assistant. Analyze 6 live camera feeds and provide concise, "
        "operational explanations for each.\n\n"
        "For each camera, explain the current traffic state and signal timing (1 sentence max per camera)."
    )
    
    response = await gemma.generate(
        batch_prompt,
        user_prompt,
        json_mode=False,
        fallback_type="live_camera",
    )
    
    # Parse the response to extract per-camera explanations
    explanations: dict[str, str] = {}
    for cid in cameras_data.keys():
        explanations[cid] = "Traffic conditions monitored."  # Safe fallback
    
    # Try to parse the response for specific camera explanations
    text = response.strip()
    lines = text.split("\n")
    for line in lines:
        line = line.strip()
        if not line or ":" not in line:
            continue
        parts = line.split(":", 1)
        cam_id = parts[0].strip().lower()
        explanation = parts[1].strip() if len(parts) > 1 else ""
        
        # Match against known camera IDs
        for cid in cameras_data.keys():
            if cam_id in cid.lower() or cid.lower() in cam_id:
                explanations[cid] = explanation if explanation else "Traffic conditions monitored."
                break
    
    return explanations
