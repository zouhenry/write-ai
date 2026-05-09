import sys

if sys.version_info < (3, 10):
    print(f"Error: Python 3.10+ is required (you have {sys.version.split()[0]}). Exiting.")
    sys.exit(1)

import re
import os
import json
import logging
from pathlib import Path
from typing import List, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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
            {"role": "system", "content": "You are a helpful and intelligent AI assistant. Answer the user's questions clearly and concisely."}
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
        preview = ' '.join(words[:100]) + ('...' if len(words) > 100 else '')
        logger.info(f"── Chat ({len(history_msgs)} history msgs) | [USER] {preview}")

        response = models.llm_paraphrase.create_chat_completion(
            messages=messages,
            temperature=0.7,
            top_p=0.95,
            top_k=40,
            max_tokens=4098,
            stop=["<|im_start|>", "<|im_end|>", "<|endoftext|>", "User:", "Assistant:"]
        )

        ai_response = response['choices'][0]['message']['content'].strip()
        usage = response.get('usage', {})
        logger.info(f"── tokens: {usage.get('prompt_tokens', '?')} in / {usage.get('completion_tokens', '?')} out ────────────────")

        return ChatResponse(response=ai_response)

    except Exception as e:
        logger.error(f"Error processing chat request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/restructure", response_model=RestructureResponse)
async def restructure_text(request: RestructureRequest):
    try:
        text = request.text.strip()
        if not text:
            return RestructureResponse(original=text, corrected=text, formal=text, casual=text, concise=text)

        logger.info(f"Restructuring text: '{text}'")

        response_correct = models.llm.create_chat_completion(
            messages=[
                {"role": "system", "content": "You are a grammar correction assistant. Correct the grammar, punctuation, capitalization, and spacing in the text below. Preserve ALL original formatting elements including emojis, lists (bullets/numbering), special characters, and intentional line breaks. Return ONLY the revised text—no explanations or commentary."},
                {"role": "user", "content": text}
            ],
            temperature=0.3,
            top_p=0.95,
            top_k=40,
            max_tokens=len(text) + 256,
            stop=["<|im_start|>", "<|im_end|>", "<|endoftext|>"]
        )
        corrected = clean_corrected_text(response_correct['choices'][0]['message']['content'].strip(), text)
        highlighted_original, highlighted_corrected = highlight_word_differences(text, corrected)

        response_paraphrase = models.llm_paraphrase.create_chat_completion(
            messages=[
                {"role": "system", "content": (
                    "You are a text rewriter. Rewrite the input text in three tones and return ONLY a JSON object "
                    "with exactly these three keys: \"formal\", \"casual\", \"concise\". "
                    "No explanations, no extra keys, no markdown fences — just the JSON object.\n"
                    "Example output: {\"formal\": \"...\", \"casual\": \"...\", \"concise\": \"...\"}"
                )},
                {"role": "user", "content": "paraphrase this" + corrected}
            ],
            temperature=0.5,
            top_p=0.95,
            top_k=40,
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

        logger.info(f"Corrected: '{corrected}'")
        logger.info(f"Paraphrase tones — formal: '{formal}' | casual: '{casual}' | concise: '{concise}'")

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


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "grmr_loaded": models.llm is not None,
        "qwen_loaded": models.llm_paraphrase is not None,
        "grmr_backend": os.getenv("GRMR_API_BASE", "local"),
        "qwen_backend": os.getenv("QWEN_API_BASE", "local"),
    }


def run():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    run()
