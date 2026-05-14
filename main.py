import sys

if sys.version_info < (3, 10):
    print(f"Error: Python 3.10+ is required (you have {sys.version.split()[0]}). Exiting.")
    sys.exit(1)

import re
import os
import json
import time
import logging
from pathlib import Path
from typing import List, Dict

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

import models
from text_processing import (
    split_into_sentences,
    clean_corrected_text,
    correct_sentence,
    is_only_quote_change,
    highlight_word_differences,
    reconstruct_text_from_sentences,
    apply_suggestions_bulk,
)

STATIC_DIR = Path(__file__).parent / "writeai" / "static"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="WriteAI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ── Pydantic models ──────────────────────────────────────────────────────────

class CorrectionRequest(BaseModel):
    text: str

class Suggestion(BaseModel):
    original: str
    corrected: str
    sentence: str
    start_index: int
    end_index: int
    original_highlighted: str = ""
    corrected_highlighted: str = ""

class CorrectionResponse(BaseModel):
    suggestions: List[Suggestion]
    corrected_text: str

class ApplySuggestionRequest(BaseModel):
    original_text: str
    suggestion_index: int
    suggestions: List[Suggestion]

class ApplySuggestionsRequest(BaseModel):
    original_text: str
    suggestions: List[Suggestion]

class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = []

class ChatResponse(BaseModel):
    response: str

class RestructureRequest(BaseModel):
    text: str

class RestructureResponse(BaseModel):
    original: str
    corrected: str
    formal: str
    casual: str
    concise: str
    corrected_highlighted_original: str = ""
    corrected_highlighted_corrected: str = ""

class PromptGenRequest(BaseModel):
    raw_input: str
    use_case: str
    history: List[Dict[str, str]] = []
    phase: str = "interrogation"

class PromptGenResponse(BaseModel):
    phase: str
    message: str

SYSTEM_PROMPTS: Dict[str, str] = {
    "coding": (
        "You are a prompt engineering assistant specializing in software development tasks.\n\n"
        "Your job is to gather information from the user to craft a high-quality coding prompt "
        "using the Chain-of-Thought framework.\n\n"
        "Required fields before you can generate:\n"
        "1. Programming language and framework/stack\n"
        "2. Specific goal or task (must be unambiguous)\n"
        "3. Constraints (performance requirements, forbidden libraries, style rules, etc.) — ask if none are mentioned\n"
        "4. Developer experience level (beginner / intermediate / expert)\n\n"
        "Rules:\n"
        "- Review the conversation history. Identify the FIRST required field not yet answered.\n"
        "- Ask exactly one short, specific question about that field.\n"
        "- Do not ask about fields already answered.\n"
        "- Once all four fields are present, generate the final prompt.\n"
        "- ALWAYS respond with valid JSON only — no prose outside the JSON object.\n"
        "- Use this exact format: {\"phase\": \"interrogation\", \"message\": \"...\"} or {\"phase\": \"generation\", \"message\": \"...\"}\n"
        "- In generation phase, structure the prompt as: Role → Task → Context → Step-by-step reasoning instructions → Output format."
    ),
    "remix_architect": (
        "You are a prompt engineering assistant specializing in Remix and React architecture.\n\n"
        "Your job is to gather information from the user to craft a high-quality architectural "
        "guidance prompt using the Chain-of-Thought framework.\n\n"
        "Required fields before you can generate:\n"
        "1. Remix version or React Router v7 (they are different — confirm which)\n"
        "2. Specific problem area (routing, loaders, actions, data fetching, form handling, error boundaries, etc.)\n"
        "3. Existing stack context (other libraries, SSR vs. SPA, deployment target)\n"
        "4. Developer experience level with Remix/React Router\n\n"
        "Rules:\n"
        "- Review the conversation history. Identify the FIRST required field not yet answered.\n"
        "- Ask exactly one short, specific question about that field.\n"
        "- Flag if the request mixes unrelated concerns and ask the user to pick one focus.\n"
        "- Do not ask about fields already answered.\n"
        "- Once all four fields are present, generate the final prompt.\n"
        "- ALWAYS respond with valid JSON only — no prose outside the JSON object.\n"
        "- Use this exact format: {\"phase\": \"interrogation\", \"message\": \"...\"} or {\"phase\": \"generation\", \"message\": \"...\"}\n"
        "- In generation phase, structure the prompt as: Role → Architecture constraint → Task → Reasoning chain → Expected output."
    ),
    "creative_writing": (
        "You are a prompt engineering assistant specializing in creative writing.\n\n"
        "Your job is to gather information from the user to craft a high-quality creative writing "
        "prompt using the CO-STAR framework (Context, Objective, Style, Tone, Audience, Response format).\n\n"
        "Required fields before you can generate:\n"
        "1. Genre (fantasy, literary fiction, thriller, poetry, etc.)\n"
        "2. Tone (dark, humorous, romantic, suspenseful, etc.)\n"
        "3. Target audience (age group, reading level, or context)\n"
        "4. Length and format (short story, flash fiction, poem, scene, etc.)\n"
        "5. Constraints (first-person POV, no profanity, specific setting, etc.) — ask if none are mentioned\n\n"
        "Rules:\n"
        "- Review the conversation history. Identify the FIRST required field not yet answered.\n"
        "- Ask exactly one short, specific question about that field.\n"
        "- Flag if tone and audience conflict (e.g., dark horror + children) and ask the user to resolve it.\n"
        "- Do not ask about fields already answered.\n"
        "- Once all five fields are present, generate the final prompt.\n"
        "- ALWAYS respond with valid JSON only — no prose outside the JSON object.\n"
        "- Use this exact format: {\"phase\": \"interrogation\", \"message\": \"...\"} or {\"phase\": \"generation\", \"message\": \"...\"}\n"
        "- In generation phase, structure the prompt using CO-STAR: Context → Objective → Style → Tone → Audience → Response format."
    ),
    "data_analysis": (
        "You are a prompt engineering assistant specializing in data analysis tasks.\n\n"
        "Your job is to gather information from the user to craft a high-quality data analysis "
        "prompt using the CO-STAR framework.\n\n"
        "Required fields before you can generate:\n"
        "1. Data type and source (CSV, database, API, spreadsheet, etc.)\n"
        "2. Specific analysis goal — the exact question to answer (flag vague goals like 'analyze my data')\n"
        "3. Desired output format (summary table, visualization, narrative report, code, etc.)\n"
        "4. Tool or language to use (Python/pandas, SQL, Excel, R, etc.)\n\n"
        "Rules:\n"
        "- Review the conversation history. Identify the FIRST required field not yet answered.\n"
        "- Ask exactly one short, specific question about that field.\n"
        "- If the goal is underspecified, ask the user to state the specific question their analysis should answer.\n"
        "- Do not ask about fields already answered.\n"
        "- Once all four fields are present, generate the final prompt.\n"
        "- ALWAYS respond with valid JSON only — no prose outside the JSON object.\n"
        "- Use this exact format: {\"phase\": \"interrogation\", \"message\": \"...\"} or {\"phase\": \"generation\", \"message\": \"...\"}\n"
        "- In generation phase, structure the prompt using CO-STAR with heavy emphasis on Objective and Response format."
    ),
    "summarization": (
        "You are a prompt engineering assistant specializing in summarization tasks.\n\n"
        "Your job is to gather information from the user to craft a high-quality summarization "
        "prompt using the CO-STAR framework.\n\n"
        "Required fields before you can generate:\n"
        "1. Source type (article, meeting notes, research paper, email thread, transcript, etc.)\n"
        "2. Desired output length (one sentence, one paragraph, bullet points, one page, etc.)\n"
        "3. Target audience (executive, developer, general reader, etc.)\n"
        "4. Emphasis — what matters most (key decisions, action items, main arguments, statistics, etc.)\n\n"
        "Rules:\n"
        "- Review the conversation history. Identify the FIRST required field not yet answered.\n"
        "- Ask exactly one short, specific question about that field.\n"
        "- If no audience is specified, always ask — a summary for an executive differs from one for a developer.\n"
        "- Do not ask about fields already answered.\n"
        "- Once all four fields are present, generate the final prompt.\n"
        "- ALWAYS respond with valid JSON only — no prose outside the JSON object.\n"
        "- Use this exact format: {\"phase\": \"interrogation\", \"message\": \"...\"} or {\"phase\": \"generation\", \"message\": \"...\"}\n"
        "- In generation phase, structure the prompt using CO-STAR with Context and Audience as the primary sections."
    ),
    "general": (
        "You are an expert UX Designer and Prompt Engineer.\n\n"
        "Your job is to gather information from the user and craft a high-quality, structured prompt "
        "using the CO-STAR framework (Context, Objective, Style, Tone, Audience, Response format).\n\n"
        "Required fields before you can generate:\n"
        "1. Goal or task — what the user wants the AI to do\n"
        "2. Target AI system or context (ChatGPT, Claude, a coding assistant, a writing tool, etc.)\n"
        "3. Tone or style preference (professional, friendly, concise, detailed, etc.)\n"
        "4. Desired output format (paragraph, bullet list, step-by-step, code, etc.)\n\n"
        "Rules:\n"
        "- Review the conversation history. Identify the FIRST required field not yet answered.\n"
        "- Ask exactly one short, specific question about that field.\n"
        "- Do not ask about fields already answered.\n"
        "- Once all four fields are present, generate the final prompt.\n"
        "- ALWAYS respond with valid JSON only — no prose outside the JSON object.\n"
        "- Use this exact format: {\"phase\": \"interrogation\", \"message\": \"...\"} or {\"phase\": \"generation\", \"message\": \"...\"}\n"
        "- In generation phase, structure the prompt using CO-STAR: Context → Objective → Style → Tone → Audience → Response format."
    ),
}


# ── Startup ──────────────────────────────────────────────────────────────────

def _hyperlink(url: str) -> str:
    return f"\033]8;;{url}\033\\{url}\033]8;;\033\\"

@app.on_event("startup")
async def startup_event():
    url = "http://localhost:8000"
    print("\n" + "="*60)
    print("WriteAI")
    print("="*60)
    print(f"Server starting on {_hyperlink(url)}")
    print("="*60 + "\n")
    models.initialize_model()


@app.on_event("shutdown")
async def shutdown_event():
    if models.llm is not None and hasattr(models.llm, "close"):
        models.llm.close()
    models.llm = None


# ── Static routes ─────────────────────────────────────────────────────────────

@app.get("/")
async def read_index():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/sw.js")
async def service_worker():
    return FileResponse(
        STATIC_DIR / "sw.js",
        media_type="application/javascript",
        headers={"Service-Worker-Allowed": "/"}
    )

@app.get("/manifest.json")
async def manifest():
    return FileResponse(STATIC_DIR / "manifest.json", media_type="application/manifest+json")


# ── API routes ────────────────────────────────────────────────────────────────

@app.post("/correct", response_model=CorrectionResponse)
async def correct_text(request: CorrectionRequest):
    try:
        text = request.text.strip()
        if not text:
            return CorrectionResponse(suggestions=[], corrected_text="")

        sentence_data = split_into_sentences(text)
        suggestions = []
        corrected_sentences = []

        logger.info(f"Processing {len(sentence_data)} sentences")

        for i, sent_data in enumerate(sentence_data):
            sentence = sent_data['text']
            logger.info(f"Sentence {i+1}: '{sentence}'")

            if len(sentence) < 2:
                corrected_sentences.append(sentence)
                continue

            corrected = correct_sentence(sentence, models.llm)
            logger.info(f"Corrected {i+1}: '{corrected}'")

            for _ in range(3):
                old_corrected = corrected
                corrected = re.sub(r'([.!?])(["\'])\s*\.', r'\1\2', corrected)
                corrected = re.sub(r'([.!?])(["\'])\s*\1', r'\1\2', corrected)
                if corrected == old_corrected:
                    break

            corrected_sentences.append(corrected)

            if (corrected.lower().strip() != sentence.lower().strip() and
                corrected.strip() != sentence.strip() and
                len(corrected) <= len(sentence) * 1.5 and
                    not is_only_quote_change(sentence, corrected)):

                clean_corrected = corrected
                for _ in range(3):
                    old_clean = clean_corrected
                    clean_corrected = re.sub(r'([.!?])(["\'])\s*\.', r'\1\2', clean_corrected)
                    clean_corrected = re.sub(r'([.!?])(["\'])\s*\1', r'\1\2', clean_corrected)
                    if clean_corrected == old_clean:
                        break

                highlighted_original, highlighted_corrected = highlight_word_differences(sentence, clean_corrected)

                suggestions.append(Suggestion(
                    original=sentence,
                    corrected=clean_corrected,
                    sentence=f"Sentence {i+1}",
                    start_index=sent_data['start'],
                    end_index=sent_data['end'],
                    original_highlighted=highlighted_original,
                    corrected_highlighted=highlighted_corrected
                ))

        corrected_text = reconstruct_text_from_sentences(text, sentence_data, corrected_sentences)

        for _ in range(3):
            old_text = corrected_text
            corrected_text = re.sub(r'([.!?])(["\'])\s*\.', r'\1\2', corrected_text)
            corrected_text = re.sub(r'([.!?])(["\'])\s*\1', r'\1\2', corrected_text)
            if corrected_text == old_text:
                break

        logger.info(f"Original: '{text}'")
        logger.info(f"Corrected: '{corrected_text}'")

        return CorrectionResponse(suggestions=suggestions, corrected_text=corrected_text)

    except Exception as e:
        logger.error(f"Error processing correction request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/apply-suggestion")
async def apply_suggestion(request: ApplySuggestionRequest):
    try:
        text = request.original_text
        suggestion_index = request.suggestion_index
        suggestions = request.suggestions

        if suggestion_index < 0 or suggestion_index >= len(suggestions):
            raise HTTPException(status_code=400, detail="Invalid suggestion index")

        suggestion = suggestions[suggestion_index]
        start, end = suggestion.start_index, suggestion.end_index

        if 0 <= start <= end <= len(text) and text[start:end] == suggestion.original:
            applied_text = text[:start] + suggestion.corrected + text[end:]
        else:
            occurrences = [m.span() for m in re.finditer(re.escape(suggestion.original), text)]
            if occurrences:
                target_span = min(occurrences, key=lambda sp: abs(sp[0] - start))
                t_start, t_end = target_span
                applied_text = text[:t_start] + suggestion.corrected + text[t_end:]
            else:
                applied_text = text

        return {"corrected_text": applied_text}

    except Exception as e:
        logger.error(f"Error applying suggestion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/apply-suggestions")
async def apply_suggestions_endpoint(request: ApplySuggestionsRequest):
    try:
        corrected = apply_suggestions_bulk(request.original_text, request.suggestions)
        return {"corrected_text": corrected}
    except Exception as e:
        logger.error(f"Error applying suggestions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat", response_model=ChatResponse)
async def chat_with_llm(request: ChatRequest):
    try:
        message = request.message.strip()
        if not message:
            return ChatResponse(response="Please provide a message.")

        messages = [
            {"role": "system", "content": "You are a helpful and intelligent AI assistant. Be concise: give short, direct answers by default. Only provide detailed explanations if the user explicitly asks for more detail, a full explanation, or a step-by-step breakdown."}
        ]

        for msg in request.history:
            if msg['role'] == 'system':
                continue
            role = 'assistant' if msg['role'] in ('ai', 'assistant') else 'user'
            messages.append({"role": role, "content": msg['content']})

        if not messages or messages[-1]['role'] == 'assistant':
            messages.append({"role": "user", "content": message})
        elif messages[-1]['role'] == 'user' and messages[-1]['content'] != message:
            messages.append({"role": "user", "content": message})

        history_msgs = messages[:-1]
        words = message.split()
        preview = ' '.join(words[:10]) + ('...' if len(words) > 10 else '')
        logger.info(f"── Chat ({len(history_msgs)} history msgs) | [USER] {preview}")

        t0 = time.time()
        response = models.llm.create_chat_completion(
            messages=messages,
            temperature=0.7,
            top_p=0.95,
            top_k=65,
            max_tokens=4098,
            stop=["<|im_start|>", "<|im_end|>", "<|endoftext|>", "User:", "Assistant:"]
        )

        ai_response = response['choices'][0]['message']['content'].strip()
        usage = response.get('usage', {})
        logger.info(f"── tokens: {usage.get('prompt_tokens', '?')} in / {usage.get('completion_tokens', '?')} out ──── {time.time() - t0:.1f}s")

        return ChatResponse(response=ai_response)

    except Exception as e:
        logger.error(f"Error processing chat request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest, http_request: Request):
    message = request.message.strip()
    if not message:
        return StreamingResponse(iter([]), media_type="text/event-stream")

    messages = [
        {"role": "system", "content": "You are a helpful and intelligent AI assistant. Be concise: give short, direct answers by default. Only provide detailed explanations if the user explicitly asks for more detail, a full explanation, or a step-by-step breakdown."}
    ]
    for msg in request.history:
        if msg['role'] == 'system':
            continue
        role = 'assistant' if msg['role'] in ('ai', 'assistant') else 'user'
        messages.append({"role": role, "content": msg['content']})
    if not messages or messages[-1]['role'] == 'assistant':
        messages.append({"role": "user", "content": message})
    elif messages[-1]['role'] == 'user' and messages[-1]['content'] != message:
        messages.append({"role": "user", "content": message})

    words = message.split()
    preview = ' '.join(words[:10]) + ('...' if len(words) > 10 else '')
    logger.info(f"── Chat/stream ({len(messages) - 1} history msgs) | [USER] {preview}")

    kwargs = dict(temperature=0.7, top_p=0.95, top_k=65, max_tokens=4098,
                  stop=["<|im_start|>", "<|im_end|>", "<|endoftext|>", "User:", "Assistant:"])

    async def generate():
        try:
            if hasattr(models.llm, 'create_chat_completion_stream'):
                # Remote model: parse upstream SSE and re-emit normalised tokens
                async for line in models.llm.create_chat_completion_stream(messages, **kwargs):
                    if await http_request.is_disconnected():
                        break
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:]
                    if payload.strip() == "[DONE]":
                        yield "data: [DONE]\n\n"
                        break
                    try:
                        chunk = json.loads(payload)
                        token = chunk['choices'][0].get('delta', {}).get('content', '')
                        if token:
                            yield f"data: {json.dumps({'token': token})}\n\n"
                    except (KeyError, json.JSONDecodeError):
                        pass
            else:
                # Local llama-cpp-python
                import asyncio
                loop = asyncio.get_event_loop()
                stream = await loop.run_in_executor(
                    None,
                    lambda: models.llm.create_chat_completion(messages, stream=True, **kwargs),
                )
                for chunk in stream:
                    if await http_request.is_disconnected():
                        break
                    token = chunk['choices'][0].get('delta', {}).get('content', '')
                    if token:
                        yield f"data: {json.dumps({'token': token})}\n\n"
                yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/restructure", response_model=RestructureResponse)
async def restructure_text(request: RestructureRequest):
    try:
        text = request.text.strip()
        if not text:
            return RestructureResponse(original=text, corrected=text, formal=text, casual=text, concise=text)

        words = text.split()
        preview = ' '.join(words[:10]) + ('...' if len(words) > 10 else '')
        logger.info(f"── Restructure | {preview}")
        t0 = time.time()
        response_correct = models.llm.create_chat_completion(
            messages=[
                {"role": "system", "content": "You are a grammar correction assistant. Correct the grammar, punctuation, capitalization, and spacing in the text below. Preserve ALL original formatting elements including emojis, lists (bullets/numbering), special characters, and intentional line breaks. Return ONLY the revised text—no explanations or commentary."},
                {"role": "user", "content": text}
            ],
            temperature=0.3,
            top_p=0.95,
            top_k=65,
            max_tokens=len(text) + 256,
            stop=["<|im_start|>", "<|im_end|>", "<|endoftext|>"]
        )
        corrected = clean_corrected_text(response_correct['choices'][0]['message']['content'].strip(), text)
        highlighted_original, highlighted_corrected = highlight_word_differences(text, corrected)

        response_paraphrase = models.llm.create_chat_completion(
            messages=[
                {"role": "system", "content": (
                    "You are a text rewriter. Rewrite the input text in three tones and return ONLY a JSON object "
                    "with exactly these three keys: \"formal\", \"casual\", \"concise\". "
                    "No explanations, no extra keys, no markdown fences — just the JSON object.\n"
                    "Example output: {\"formal\": \"...\", \"casual\": \"...\", \"concise\": \"...\"}"
                )},
                {"role": "user", "content": corrected}
            ],
            temperature=0.5,
            top_p=0.95,
            top_k=65,
            max_tokens=len(corrected) * 4 + 64,
            stop=["<|im_start|>", "<|im_end|>", "<|endoftext|>"]
        )
        raw = response_paraphrase['choices'][0]['message']['content'].strip()

        formal = casual = concise = corrected
        try:
            clean_raw = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw, flags=re.DOTALL).strip()
            tones = json.loads(clean_raw)
            formal  = tones.get("formal",  corrected).strip() or corrected
            casual  = tones.get("casual",  corrected).strip() or corrected
            concise = tones.get("concise", corrected).strip() or corrected
        except (json.JSONDecodeError, AttributeError):
            logger.warning(f"Paraphrase JSON parse failed, falling back. Raw: '{raw}'")

        logger.info(f"── Restructure done in {time.time() - t0:.1f}s")
        return RestructureResponse(
            original=text,
            corrected=corrected,
            formal=formal,
            casual=casual,
            concise=concise,
            corrected_highlighted_original=highlighted_original,
            corrected_highlighted_corrected=highlighted_corrected
        )

    except Exception as e:
        logger.error(f"Error restructuring text: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/prompt-gen", response_model=PromptGenResponse)
async def prompt_gen(request: PromptGenRequest):
    raw_input = request.raw_input.strip()
    if not raw_input:
        raise HTTPException(status_code=400, detail="Please enter a prompt idea")

    use_case = request.use_case.strip().lower()
    if use_case not in SYSTEM_PROMPTS:
        raise HTTPException(status_code=400, detail=f"Unknown use case: {use_case!r}")

    if models.llm is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    system_prompt = SYSTEM_PROMPTS[use_case]

    messages = [{"role": "system", "content": system_prompt}]
    messages.append({"role": "user", "content": f"Raw prompt idea: {raw_input}"})
    for msg in request.history:
        role = "assistant" if msg.get("role") in ("assistant", "ai") else "user"
        messages.append({"role": role, "content": msg["content"]})

    def _call_llm():
        return models.llm.create_chat_completion(
            messages=messages,
            temperature=0.3,
            top_p=0.95,
            top_k=65,
            max_tokens=1024,
            stop=["<|im_start|>", "<|im_end|>", "<|endoftext|>"],
        )

    raw_content = ""
    try:
        response = _call_llm()
        raw_content = response["choices"][0]["message"]["content"].strip()
        clean = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw_content, flags=re.DOTALL).strip()
        parsed = json.loads(clean)
        phase = parsed.get("phase", "interrogation")
        message = parsed.get("message", "")
        if not message:
            raise ValueError("empty message")
        return PromptGenResponse(phase=phase, message=message)
    except (json.JSONDecodeError, ValueError, KeyError, IndexError, TypeError):
        # Retry once with an explicit reminder
        try:
            messages.append({
                "role": "user",
                "content": "Remember: respond ONLY with a JSON object. Example: {\"phase\": \"interrogation\", \"message\": \"Your question here\"}"
            })
            response = _call_llm()
            raw_content = response["choices"][0]["message"]["content"].strip()
            clean = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw_content, flags=re.DOTALL).strip()
            parsed = json.loads(clean)
            return PromptGenResponse(
                phase=parsed.get("phase", "interrogation"),
                message=parsed["message"],
            )
        except Exception:
            logger.warning(f"PromptGen JSON parse failed twice. Raw: {raw_content!r}")
            return PromptGenResponse(
                phase="interrogation",
                message="Sorry, I had trouble processing that. Could you rephrase your last answer?",
            )


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "model_loaded": models.llm is not None,
        "backend": os.getenv("LLM_API_BASE", "local"),
    }


def run():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    run()
