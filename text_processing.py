import re
import difflib
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


def split_into_sentences(text: str) -> List[Dict]:
    """Split text into sentences using enhanced regex that handles abbreviations."""
    sentences: List[Dict] = []

    if not text.strip():
        return sentences

    abbreviations = {
        'etc', 'eg', 'e.g', 'ie', 'i.e', 'vs', 'viz', 'cf', 'ca', 'approx',
        'no', 'vol', 'fig', 'p', 'pp', 'ch', 'sec', 'ex', 'al', 'et', 'seq',
        'etc.', 'e.g.', 'i.e.', 'vs.', 'viz.', 'cf.', 'ca.', 'approx.',
        'no.', 'vol.', 'fig.', 'p.', 'pp.', 'ch.', 'sec.', 'ex.', 'et al.', 'seq.',
        'mr', 'mrs', 'ms', 'dr', 'prof', 'rev', 'sr', 'jr', 'st'
    }

    pattern = r'''
        (?<=[.!?])            # After sentence-ending punctuation
        (?!\w)                # Not followed by word character (handles decimals, abbreviations)
        (?<!\d\.\d)           # Not preceded by digit.dot.digit (handles decimals)
        (?<!\s[A-Za-z]\.)     # Not preceded by single letter dot (handles initials)
        \s+                   # Followed by whitespace
        (?=[A-Z"'])           # Then a capital letter or quote (start of new sentence)
        |                     # OR
        (?<=[.!?])\s*$        # Sentence ending at end of string
    '''

    last_end = 0
    potential_splits = list(re.finditer(pattern, text, re.VERBOSE | re.IGNORECASE))

    for i, match in enumerate(potential_splits):
        split_pos = match.start()
        sentence_text = text[last_end:split_pos + 1].strip()

        if not sentence_text:
            last_end = split_pos + 1
            continue

        is_true_boundary = True

        prev_words = sentence_text.lower().split()
        if prev_words:
            last_word = prev_words[-1].strip('.,!?;:"\'')
            if last_word in abbreviations:
                is_true_boundary = False
            elif re.match(r'^[A-Za-z]\.$', last_word):
                is_true_boundary = False
            elif re.search(r'\d\.\d', sentence_text[-10:]):
                is_true_boundary = False

        if split_pos + 2 < len(text):
            next_chars = text[split_pos + 1:split_pos + 3]
            if next_chars and next_chars[0].islower() or next_chars[0].isdigit():
                is_true_boundary = False

        if not is_true_boundary:
            continue

        start_no_ws = last_end
        while start_no_ws < split_pos + 1 and text[start_no_ws].isspace():
            start_no_ws += 1

        span_end = split_pos
        while span_end < len(text) and text[span_end].isspace():
            span_end += 1
        if span_end == split_pos:
            span_end = split_pos + 1

        sentences.append({
            'text': sentence_text,
            'start': start_no_ws,
            'end': split_pos,
            'span_end': span_end,
            'gap_before_start': last_end
        })

        last_end = span_end

    if last_end < len(text):
        remaining = text[last_end:].strip()
        if remaining:
            start_no_ws = last_end
            while start_no_ws < len(text) and text[start_no_ws].isspace():
                start_no_ws += 1
            sentences.append({
                'text': remaining,
                'start': start_no_ws,
                'end': len(text),
                'span_end': len(text),
                'gap_before_start': last_end
            })

    if not sentences:
        content = text.strip()
        if content:
            start_no_ws = 0
            while start_no_ws < len(text) and text[start_no_ws].isspace():
                start_no_ws += 1
            sentences.append({
                'text': content,
                'start': start_no_ws,
                'end': len(text),
                'span_end': len(text),
                'gap_before_start': 0
            })

    return sentences


def clean_corrected_text(corrected: str, original: str) -> str:
    """Clean the corrected text to remove common model artifacts."""
    if not corrected:
        return original

    corrected = re.sub(r'<\|.*?\|>', '', corrected).strip()

    instruction_prefixes = [
        "correct the grammar and spelling of this sentence:",
        "here is the corrected sentence:",
        "corrected sentence:",
        "the corrected version is:",
        "grammar correction:",
        "corrected:",
        "here is the formal version:",
        "here is the formal version of the text:",
        "here's the formal version:",
        "here's the formal version of the text:",
        "here is the casual version:",
        "here is the casual version of the text:",
        "here's the casual version:",
        "here's the casual version of the text:",
        "here is the concise version:",
        "here is the concise version of the text:",
        "here's the concise version:",
        "here's the concise version of the text:",
        "here is the rewritten text:",
        "here's the rewritten text:",
        "rewritten text:",
        "formal version:",
        "casual version:",
        "concise version:",
    ]

    for prefix in instruction_prefixes:
        if corrected.lower().startswith(prefix):
            corrected = corrected[len(prefix):].strip()
            corrected = re.sub(r'^[:]\s*', '', corrected)

    words = corrected.split()
    if len(words) > 10:
        for i in range(len(words) - 5):
            segment = ' '.join(words[i:i+5])
            if segment in ' '.join(words[i+5:]):
                corrected = ' '.join(words[:i+5])
                break

    if original and original[0].isupper() and corrected and corrected[0].islower():
        corrected = corrected[0].upper() + corrected[1:]

    for _ in range(3):
        old_corrected = corrected
        corrected = re.sub(r'([.!?])(["\'])\s*\.', r'\1\2', corrected)
        corrected = re.sub(r'([.!?])(["\'])\s*\1', r'\1\2', corrected)
        if corrected == old_corrected:
            break

    if original and original[-1] in '.!?' and corrected and corrected[-1] not in '.!?':
        corrected += original[-1]

    return corrected.strip()


def is_only_quote_change(original: str, corrected: str) -> bool:
    """Return True if the only differences between original and corrected are quote characters."""
    if original == corrected:
        return False

    normalized_original = original.replace('‘', "'").replace('’', "'").replace('“', '"').replace('”', '"')
    normalized_corrected = corrected.replace('‘', "'").replace('’', "'").replace('“', '"').replace('”', '"')

    if normalized_original == normalized_corrected:
        return True

    if (original.strip().replace('‘', "'").replace('’', "'") ==
            corrected.strip().replace('‘', "'").replace('’', "'")):
        return True

    return False


def highlight_word_differences(original: str, corrected: str) -> tuple:
    """Compare sentences word-by-word and return HTML-highlighted versions.

    Returns: (highlighted_original, highlighted_corrected)
    """
    def tokenize(text: str) -> List[str]:
        tokens = []
        current = ""
        for char in text:
            if char.isspace():
                if current:
                    tokens.append(current)
                    current = ""
                tokens.append(char)
            elif char in '.,!?;:\'"()[]{}':
                if current:
                    tokens.append(current)
                    current = ""
                tokens.append(char)
            else:
                current += char
        if current:
            tokens.append(current)
        return tokens

    original_tokens = tokenize(original)
    corrected_tokens = tokenize(corrected)

    matcher = difflib.SequenceMatcher(None, original_tokens, corrected_tokens)

    highlighted_original = []
    highlighted_corrected = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            highlighted_original.extend(original_tokens[i1:i2])
            highlighted_corrected.extend(corrected_tokens[j1:j2])
        elif tag == 'replace':
            for token in original_tokens[i1:i2]:
                if token.strip():
                    highlighted_original.append(f'<span class="error-word">{token}</span>')
                else:
                    highlighted_original.append(token)
            for token in corrected_tokens[j1:j2]:
                if token.strip():
                    highlighted_corrected.append(f'<span class="corrected-word">{token}</span>')
                else:
                    highlighted_corrected.append(token)
        elif tag == 'delete':
            for token in original_tokens[i1:i2]:
                if token.strip():
                    highlighted_original.append(f'<span class="error-word">{token}</span>')
                else:
                    highlighted_original.append(token)
        elif tag == 'insert':
            for token in corrected_tokens[j1:j2]:
                if token.strip():
                    highlighted_corrected.append(f'<span class="corrected-word">{token}</span>')
                else:
                    highlighted_corrected.append(token)

    return ''.join(highlighted_original), ''.join(highlighted_corrected)


def reconstruct_text_from_sentences(original_text: str, sentence_data: List[Dict], corrected_sentences: List[str]) -> str:
    """Reconstruct text from corrected sentences while preserving original spacing."""
    if len(sentence_data) != len(corrected_sentences):
        return original_text

    result_parts: List[str] = []
    last_span_end = 0

    for i, (sent_data, corrected) in enumerate(zip(sentence_data, corrected_sentences)):
        start = sent_data['start']
        end = sent_data['end']
        span_end = sent_data.get('span_end', end)
        gap_before_start = sent_data.get('gap_before_start', last_span_end)

        if gap_before_start > last_span_end:
            result_parts.append(original_text[last_span_end:gap_before_start])
        elif start > last_span_end:
            result_parts.append(original_text[last_span_end:start])

        result_parts.append(corrected)

        if span_end > end:
            result_parts.append(original_text[end:span_end])
        elif i < len(sentence_data) - 1:
            if end < len(original_text):
                whitespace_end = end
                while whitespace_end < len(original_text) and original_text[whitespace_end].isspace():
                    whitespace_end += 1

                if whitespace_end > end:
                    result_parts.append(original_text[end:whitespace_end])
                elif corrected and corrected[-1] in '.!?' and whitespace_end < len(original_text):
                    next_char = original_text[whitespace_end] if whitespace_end < len(original_text) else ''
                    if next_char and next_char.isalpha() and next_char.isupper():
                        result_parts.append(' ')

        last_span_end = span_end

    if last_span_end < len(original_text):
        result_parts.append(original_text[last_span_end:])

    return ''.join(result_parts)


def correct_sentence(sentence: str, llm) -> str:
    """Correct a single sentence using the GRMR model."""
    if not sentence.strip() or len(sentence.strip()) < 2:
        return sentence

    try:
        clean_sentence = sentence.strip()

        messages = [
            {"role": "system", "content": "You are a grammar correction assistant. Correct the grammar, punctuation, capitalization, and spacing in the text below. Preserve ALL original formatting elements including emojis, lists (bullets/numbering), special characters, and intentional line breaks. Return ONLY the revised text—no explanations or commentary."},
            {"role": "user", "content": clean_sentence}
        ]

        response = llm.create_chat_completion(
            messages=messages,
            temperature=0.3,
            top_p=0.95,
            top_k=40,
            min_p=0.01,
            frequency_penalty=0.0,
            presence_penalty=0.0,
            max_tokens=len(clean_sentence) + 30,
            stop=["<|im_start|>", "<|im_end|>", "<|endoftext|>", "User:", "Assistant:"]
        )

        corrected = response['choices'][0]['message']['content'].strip()
        corrected = clean_corrected_text(corrected, clean_sentence)

        if is_only_quote_change(clean_sentence, corrected):
            logger.info(f"Skipping correction - only quote changes detected: '{clean_sentence}' -> '{corrected}'")
            return clean_sentence

        if len(corrected) > len(clean_sentence) * 2:
            logger.warning(f"Correction rejected — excessive length. Original: '{clean_sentence}', Corrected: '{corrected}'")
            return clean_sentence

        if not corrected or corrected == clean_sentence:
            return clean_sentence

        return corrected

    except Exception as e:
        logger.error(f"Error correcting sentence '{sentence}': {e}")
        return sentence


def apply_suggestions_bulk(text: str, suggestions) -> str:
    """Apply multiple suggestions safely in reverse order to avoid index drift.

    Overlapping suggestions are resolved by keeping the rightmost replacement.
    """
    if not suggestions:
        return text

    sorted_suggestions = sorted(suggestions, key=lambda s: s.start_index, reverse=True)
    applied_intervals: List[tuple] = []
    result_text = text

    for s in sorted_suggestions:
        start, end = s.start_index, s.end_index
        if start is None or end is None or start < 0 or end < 0 or start > end:
            continue

        candidate_span = None
        if end <= len(result_text) and result_text[start:end] == s.original:
            candidate_span = (start, end)
        else:
            occurrences = [m.span() for m in re.finditer(re.escape(s.original), result_text)]
            if occurrences:
                candidate_span = min(occurrences, key=lambda sp: abs(sp[0] - start))

        if candidate_span is None:
            continue

        c_start, c_end = candidate_span

        overlaps = any(not (c_end <= a_start or c_start >= a_end) for a_start, a_end in applied_intervals)
        if overlaps:
            continue

        result_text = result_text[:c_start] + s.corrected + result_text[c_end:]
        applied_intervals.append((c_start, c_end))

    return result_text
