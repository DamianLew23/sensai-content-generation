#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
ARTICLE_HUMANIZATION — File-Based Edition (Lekcja)
====================================================
Version: 3.3-file

Uproszczona wersja pipeline'u humanizacyjnego do nauki i testów.
Wejście: plik tekstowy z artykułem HTML (zaczyna się od <h1>)
Wyjście: plik tekstowy z artykułem zhumanizowanym (zaczyna się od <h1>)

Zachowane:
- 20 reguł anty-AI (Tier 1-3: 15 reguł bazowych + Tier 4: 5 sygnałów detektorów)
- Ochrona numerów [[NUM_X]]
- Ochrona źródeł [[SRC_X]]
- Readability retry
- Metryki i walidacje (warn-only)

Sygnały detektorów jako osobne reguły 16-20 (Tier 4):
- 16. pronominal_frequency (zaimki osobowe)
- 17. verb_tense_consistency (mieszanie czasów)
- 18. proper_noun_density (nazwy własne)
- 19. passive_voice_saturation (strona bierna)
- 20. rhetorical_question_ratio (pytania retoryczne)


"""

import os
import re
import json
import time
import logging
import argparse
import statistics
from typing import Dict, Tuple, List, Optional

from bs4 import BeautifulSoup

# ====== FILE CONFIG ======
INPUT_FILE = os.getenv("HUM_INPUT_FILE", "output_intermediate.html")
OUTPUT_FILE = os.getenv("HUM_OUTPUT_FILE", "article_humanized.html")

# ====== MODEL CONFIG ======
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-5.2")
TEMPERATURE = float(os.getenv("TEMP", "0.5"))
MAX_OUTPUT_TOKENS = int(os.getenv("MAX_OUTPUT_TOKENS", "16000"))

# Numbers - tolerance (WARN-only)
MAX_NUMBER_DRIFT = int(os.getenv("HUM_NUMBERS_DRIFT", "2"))

# Length hints (WARN-only)
ENABLE_LENGTH_GUARD = os.getenv("HUM_LEN_GUARD", "1") == "1"
MAX_LEN_GROWTH = float(os.getenv("HUM_MAX_LEN_GROWTH", "0.20"))
MIN_LEN_RATIO = float(os.getenv("HUM_MIN_LEN_RATIO", "0.80"))

# Readability (non-blocking)
READABILITY_ENFORCE = os.getenv("HUM_READABILITY_ENFORCE", "1") == "1"
READABILITY_RETRY = int(os.getenv("HUM_READABILITY_RETRY", "1"))
ASL_MIN = int(os.getenv("HUM_ASL_MIN", "12"))
ASL_MAX = int(os.getenv("HUM_ASL_MAX", "20"))
SENTENCE_HARD_CAP = int(os.getenv("HUM_SENTENCE_HARD_CAP", "24"))

# Bold/strong limits
BOLD_SHARE_MAX = float(os.getenv("HUM_BOLD_SHARE_MAX", "0.08"))
STRONG_WORDS_PER_BLOCK = int(os.getenv("HUM_STRONG_WORDS_PER_BLOCK", "500"))
MIN_STRONG_PER_BLOCK = int(os.getenv("HUM_MIN_STRONG_PER_BLOCK", "1"))
MAX_STRONG_PER_BLOCK = int(os.getenv("HUM_MAX_STRONG_PER_BLOCK", "4"))

# Humanization style
HUMANIZATION_LEVEL = os.getenv("HUM_LEVEL", "balanced")

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")


# ====== LLM BACKEND ======
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None
try:
    import anthropic
except ImportError:
    anthropic = None

openai_client = None
claude_client = None

if OpenAI and os.getenv("OPENAI_API_KEY"):
    openai_client = OpenAI()
    logging.info("OpenAI client initialized")

if anthropic and os.getenv("ANTHROPIC_API_KEY"):
    claude_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    logging.info("Anthropic client initialized")


def _get_backend_for_model(model: str) -> str:
    """Określ backend (openai/anthropic) na podstawie nazwy modelu."""
    if model.lower().startswith("gpt"):
        return "openai"
    elif model.lower().startswith("claude"):
        return "anthropic"
    raise ValueError(f"Nieznany backend dla modelu: {model}")


def call_llm(prompt: str, model: str = None) -> str:
    """Wywołaj LLM z promptem. Obsługuje OpenAI i Anthropic."""
    model = model or MODEL_NAME
    backend = _get_backend_for_model(model)

    if backend == "openai":
        if not openai_client:
            raise RuntimeError(f"OpenAI client nie zainicjalizowany (brak OPENAI_API_KEY?)")
        token_param = "max_completion_tokens" if model.lower().startswith("gpt-5") else "max_tokens"
        resp = openai_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=TEMPERATURE,
            **{token_param: MAX_OUTPUT_TOKENS},
        )
        return (resp.choices[0].message.content or "").strip()
    else:
        if not claude_client:
            raise RuntimeError(f"Anthropic client nie zainicjalizowany (brak ANTHROPIC_API_KEY?)")
        resp = claude_client.messages.create(
            model=model,
            max_tokens=MAX_OUTPUT_TOKENS,
            temperature=TEMPERATURE,
            messages=[{"role": "user", "content": prompt}],
        )
        out = ""
        if hasattr(resp, "content") and resp.content:
            for block in resp.content:
                if getattr(block, "type", None) == "text":
                    out += block.text or ""
        return (out or "").strip()


# ====== REGEX PATTERNS ======
NUMERIC_REGEX = r'(?:\d{1,3}(?:[ .,\u00A0]\d{3})+|\d+)(?:[.,]\d+)?%?|\b\d{4}\b|(?:\$|EUR|GBP)\s?\d+(?:[.,]\d+)?'

SOURCE_CITATION_RE = re.compile(
    r'\((?:Source|Zrodlo|Źródło):\s*(?:[^()]*|\([^()]*\))*\)',
    re.IGNORECASE
)


# ====== SOURCE CITATION PROTECTION ======
def protect_sources(text: str) -> Tuple[str, Dict[str, str]]:
    """Zamień cytowania źródeł na markery [[SRC_sX]] chroniące je przed modyfikacją LLM."""
    mapping: Dict[str, str] = {}
    idx = 0

    def _replace(m):
        nonlocal idx
        marker = f"[[SRC_s{idx}]]"
        mapping[marker] = m.group(0)
        idx += 1
        return marker

    result = SOURCE_CITATION_RE.sub(_replace, text)
    return result, mapping


def restore_sources(text: str, mapping: Dict[str, str]) -> str:
    """Przywróć oryginalne cytowania źródeł z markerów [[SRC_sX]]."""
    for marker, original in mapping.items():
        text = text.replace(marker, original)
    return text


# ====== NUMBERS PROTECTION ======
def protect_numbers(text: str) -> Tuple[str, Dict[str, str]]:
    """Zamień wartości liczbowe na markery [[NUM_X]] chroniące je przed modyfikacją LLM.

    Uwaga: najpierw ukrywa markery [[SRC_sX]] żeby regex numeryczny ich nie złapał,
    potem je przywraca.
    """
    # Tymczasowo ukryj markery źródeł
    src_holders: Dict[str, str] = {}
    hidden = text
    _letters = "abcdefghijklmnopqrstuvwxyz"
    for m in re.finditer(r'\[\[SRC_s\d+\]\]', text):
        idx_letter = _letters[len(src_holders) % 26]
        placeholder = f'__SRCHOLD_{idx_letter}__'
        src_holders[placeholder] = m.group(0)
    for placeholder, original in src_holders.items():
        hidden = hidden.replace(original, placeholder, 1)

    # Zamień liczby na markery
    mapping: Dict[str, str] = {}
    out: List[str] = []
    last = 0
    idx = 0
    for m in re.finditer(NUMERIC_REGEX, hidden):
        out.append(hidden[last:m.start()])
        marker = f"[[NUM_{idx}]]"
        mapping[marker] = m.group(0)
        out.append(marker)
        last = m.end()
        idx += 1
    out.append(hidden[last:])
    result = "".join(out)

    # Przywróć markery źródeł
    for placeholder, original in src_holders.items():
        result = result.replace(placeholder, original)

    return result, mapping


def restore_numbers(text: str, mapping: Dict[str, str]) -> str:
    """Przywróć oryginalne wartości liczbowe z markerów [[NUM_X]]."""
    for marker, value in mapping.items():
        text = text.replace(marker, value)
    return text


# ====== TEXT UTILS ======
def extract_numeric_tokens(text: str) -> List[str]:
    return re.findall(NUMERIC_REGEX, text)


def anchor_count(html: str) -> int:
    return len(re.findall(r'<a\b[^>]*>', html, flags=re.IGNORECASE))


def li_count(html: str) -> int:
    return len(re.findall(r'<li\b[^>]*>', html, flags=re.IGNORECASE))


def strip_html_tags(html: str) -> str:
    return re.sub(r'<[^>]+>', ' ', html).strip()


# ====== READABILITY METRICS ======
def _sentences(txt: str) -> List[str]:
    s = re.split(r'(?<=[.!?])\s+', txt)
    return [x.strip() for x in s if x.strip()]


def _tokens(txt: str) -> List[str]:
    return [t for t in re.findall(r'\b[\w\-]+\b', txt, flags=re.UNICODE) if t]


def readability_metrics(html: str) -> Dict:
    """Oblicz metryki czytelności z HTML."""
    visible = strip_html_tags(html)
    sents = _sentences(visible)
    words = _tokens(visible)
    W = len(words)
    S = max(1, len(sents))
    long_sentences = sum(1 for s in sents if len(_tokens(s)) > SENTENCE_HARD_CAP)

    strong_spans = re.findall(r'<strong\b[^>]*>(.*?)</strong>', html, flags=re.IGNORECASE | re.DOTALL)
    bold_tokens = 0
    for span in strong_spans:
        bold_tokens += len(_tokens(re.sub(r'<[^>]+>', ' ', span)))
    bold_share = (bold_tokens / W) if W else 0.0

    return {
        "words_total": W,
        "sentences_total": S,
        "avg_sentence_length": round((W / S), 2) if S else 0.0,
        "long_sentences_gt_cap": long_sentences,
        "strong_spans": len(strong_spans),
        "bold_token_count": bold_tokens,
        "bold_share": round(bold_share, 4),
    }


# ====== HUMANIZATION PROMPT (20 reguł anty-AI) ======
def create_humanization_prompt(
    article_html: str,
    h1_title: str,
    keyword: str,
    lang: str,
    protected: bool = True,
    sources_protected: bool = False,
) -> str:
    """Główny prompt humanizacyjny v3.3 z 20 regułami (15 bazowych + 5 sygnałów detektorów)."""
    lang_names = {'pl': 'Polish', 'en': 'English', 'de': 'German', 'cz': 'Czech'}
    language = lang_names.get((lang or 'pl').lower(), 'Polish')

    number_note = ""
    if protected:
        number_note = "### NUMBER SAFETY\nKeep all [[NUM_X]] markers (e.g., [[NUM_0]]) exactly as-is and in-place."

    source_note = ""
    if sources_protected:
        source_note = """### SOURCE CITATION SAFETY
Keep all [[SRC_X]] markers (e.g., [[SRC_0]], [[SRC_1]]) exactly as-is and in-place.
These markers represent source citations - they MUST remain at the end of their paragraph.
Do NOT remove, edit, move, or reformat [[SRC_X]] markers."""

    return f"""You are an expert copy editor. Rewrite this {language} article so it reads like an experienced human author wrote it.
Return ONLY the final HTML (no code fences, no explanations), in {language}.

### OBJECTIVE
Rewrite the text with authentic human voice — varied rhythm, natural word choices, concrete details. Apply ALL rules below SIMULTANEOUSLY in one holistic pass. Write like a skilled human author, not like a machine applying filters.

### PROTECTION RULES
- Preserve HTML tag types (<h1>-<h4>, <p>, <ul>/<ol>, <li>, <strong>, <i>, <table>).
- **HEADING LEVELS ARE LOCKED.** Every <h2> in input MUST remain <h2> in output. Every <h3> in input MUST remain <h3>. NEVER change <h3> to <h2> or any other level. Copy the exact heading tag from the source.
- You MAY merge multiple short <p> blocks into fewer, longer <p> blocks for better readability. Aim for 3-6 sentences per paragraph.
- Output MUST start with the existing <h1>.
- Keep numbers, dates, percentages exactly as input.
{number_note}
{source_note}
- Keep sources as plain text in parentheses. Do NOT add links (<a>) or URLs.
- Same overall length (+/-10%).
- Do NOT invent examples, names, places, or details that are not in the source text. Rewrite what exists — do not add new content.

---

## TIER 1: CRITICAL SIGNALS (statistical analysis of 100 HUMAN vs AI text pairs)

### 1. BANNED AI VOCABULARY (AI texts use these 2.7x more)
NEVER use these words — replace with plain alternatives or remove entirely:
additionally, furthermore, moreover, hence, thus, delve, testament, landscape,
tapestry, vibrant, showcasing, underscores, fostering, garner, intricate,
enduring, enhance, interplay, utilize, commence, facilitate, paradigm,
transformative, groundbreaking, unprecedented, pivotal, multifaceted,
nuanced, comprehensive, robust, leverage, synergy, holistic, streamline,
spearhead, notably, crucially, importantly, significantly, remarkably,
interestingly, essentially, fundamentally, highlights, illustrates,
exemplifies, demonstrates, showcases, revolutionized, trajectory.
**Max 0 of these words in entire output.**

### 2. BANNED SIGNPOST TRANSITIONS (AI uses 1.6x more)
NEVER start sentences with: However, Moreover, Furthermore, Additionally,
Consequently, Nevertheless, Therefore, Thus.
USE instead: But, And, So, Still, Yet. Or just start the sentence directly.
**Max 1 signpost per 500 words. Prefer zero.**

### 3. SENTENCE RHYTHM (human texts have 40%+ higher length variance)
This is the strongest human signal. Mix sentence lengths aggressively:
- Short punches: 4-8 words. Use these often. They break AI monotony.
- Medium flow: 12-18 words for standard information.
- Long complex: 22-30 words with subclauses, dashes, or parentheticals.
- NEVER write 3+ consecutive sentences of similar length.
- Aim for coefficient of variation > 0.45 in sentence lengths.

### 4. OPENER RULE (AI starts abstract, humans start concrete)
- NEVER open a paragraph with "The evolution/development/transformation/role/impact of..."
- START paragraphs with: a specific date, a name, a number, a short blunt statement, or a question.
- First sentence of the article must hook with a concrete detail, not a general framing.

### 5. CLOSER RULE (AI wraps up with summary patterns)
- NEVER end with "This combination of...", "This evolution...", "This approach..."
- End with a concrete fact, a forward-looking specific detail, or a short punchy statement.
- The last paragraph should NOT summarize what was already said.

---

## TIER 2: STRUCTURAL PATTERNS

### 6. PARENTHETICAL ASIDES (humans use 2x more)
- Insert 3-6 short asides per 500 words using dashes or parentheses.
- Examples: "Aspirin - still the most common painkiller worldwide - was first..." or "The team (led by a 26-year-old chemist) filed..."
- Asides must add a CONCRETE fact, not a vague observation.
- Keep asides 5-15 words. They break predictable sentence flow.

### 7. CONCRETE OVER ABSTRACT
- Replace abstract nouns with specific examples: "various factors" -> name the actual factors.
- Replace "It is widely accepted" -> state the fact directly or cite a specific source.
- Use physical, tangible words when possible: "bottle", "lab", "dose" not "paradigm", "framework", "approach".

### 8. ACTIVE VOICE, SIMPLE VERBS
- "serves as", "acts as", "functions as" -> "is"
- "features", "boasts", "encompasses" -> "has", "includes"
- "utilize" -> "use", "commence" -> "start", "facilitate" -> "help"
- "It was determined that" -> "We found" or state directly.

### 9. ELIMINATE FILLER PHRASES
- "In order to" -> "To"
- "Due to the fact that" -> "Because"
- "It is important to note that" -> just state the fact
- "At this point in time" -> "Now"
- "With regard to" -> "About" or "On"

### 10. SENTENCE STARTER DIVERSITY
- NEVER start 2+ consecutive sentences with the same word or the same verb form (e.g. "Ustal... Ustal...", "Check... Check...", "Try... Try...").
- This includes imperative verbs: if one sentence starts with a command, the next must start differently.
- Vary: start with a verb, a date, a name, a short clause, "But", a prepositional phrase.
- Avoid starting more than 2 sentences per paragraph with "The" / "To" / "Ten".

---

## TIER 3: VOICE & TONE

### 11. NATURAL PUNCTUATION
- Use dashes (not em-dashes) for interjections and asides: "word - aside - word"
- Use colons to introduce specifics: "One thing stood out: the dosage was wrong."
- Use semicolons to connect related thoughts; they signal a human writer.
- Limit to 2-3 dashes, 1-2 colons, 1 semicolon per 500 words.

### 12. INFORMATION DENSITY VARIATION
- Not every sentence must carry maximum information.
- Allow bridge sentences and short reactions: "That changed everything." or "It worked."
- Mix dense factual sentences with sparse transitional ones.

### 13. REMOVE PROMOTIONAL INFLATION
- "Revolutionary", "groundbreaking", "game-changer" -> factual descriptions.
- "Cutting-edge", "world-class", "stunning" -> neutral specifics.
- State what happened without dramatization. Let facts carry weight.

### 14. NO CHATBOT ARTIFACTS
- Never: "I hope this helps", "Let me know", "Feel free to", "Don't hesitate"
- Never: "In this article, we will explore", "Let's dive into"
- Never address the reader about article structure.

### 15. CONSISTENT REGISTER
- Pick formal OR approachable at the start and maintain it throughout.
- Never mix "one should consider" with "yeah, that's cool" in the same text.
- Register shifts are a strong AI detection signal.

---

## TIER 4: AI DETECTOR SIGNALS (analysis of 20 AI-detection classifiers)

### 16. PERSONAL PRONOUNS (detector signal: pronominal_frequency)
- AI writes impersonally: "the system enables", "supplementation is recommended".
- Humans use pronouns: we, you, your, our. Low pronoun frequency = AI signal.
- Weave in personal perspective where context allows: "your doctor", "we know", "you can expect".
- Not in every sentence — but not zero in the whole text either.

### 17. TENSE MIXING (detector signal: verb_tense_consistency)
- AI is hyper-consistent in tense — entire text in one tense. Humans naturally jump.
- Mix tenses within paragraphs: historical fact (past) -> current state (present) -> forecast (future).
- Tense shifts add grammatical variety on top of length variety.

### 18. PROPER NOUN DENSITY (detector signal: proper_noun_density)
- AI generalizes: "experts say", "researchers found", "studies show". Humans name specifics.
- Preserve ALL proper nouns from the source. Where possible, add concrete names: institutions, cities, researchers, journals.
- "Researchers found" -> "A team at Johns Hopkins found"; "studies show" -> "a 2023 JAMA meta-analysis showed".

### 19. PASSIVE VOICE LIMIT (detector signal: passive_voice_saturation)
- AI saturates text with passive constructions ("was implemented", "has been demonstrated").
- Use active voice by default. **Max 1 passive sentence per 3 sentences.**
- "was approved by FDA" -> "FDA approved"; "was conducted" -> "researchers tested".

### 20. RHETORICAL QUESTIONS (detector signal: rhetorical_question_ratio)
- AI almost never asks questions — it is wired to deliver answers. Humans naturally ask.
- Insert 1-2 rhetorical questions per 500 words. Use them to open paragraphs, provoke thought, or pivot the narrative.
- Do NOT answer them immediately — let the question hang for a sentence or two.

---

## LANGUAGE QUALITY (critical — rewriting must not introduce errors)

### Meaning Preservation
- After rewriting a sentence, verify the subject-verb-object order is correct. Do NOT invert who does what to whom.
- BAD: "Chronic stressors help defuse short work blocks" (inverted — blocks defuse stressors, not the other way around).
- If the original says "A causes B", the rewrite MUST say "A causes B", not "B causes A".

### Complete Thoughts
- Every sentence must be a complete, self-contained thought. Do NOT create fragments that need the previous sentence to make sense.
- BAD: "Sleep of 7-9 hours lowers cortisol by 20-30%. That's compared to 5 hours." (fragment — "That's compared to 5 hours" is incomplete).
- GOOD: "Sleep of 7-9 hours lowers cortisol by 20-30% compared to just 5 hours of sleep."

### Natural Language
- Do NOT invent metaphors or colloquialisms that don't exist in the target language. If a phrase sounds odd, use a plain description instead.
- Do NOT add filler sentences that restate the obvious or add no information ("This happens even when long sessions sound ambitious").
- Every sentence must earn its place — if removing it changes nothing, remove it.

### Grammar and Inflection
- Verify noun-number agreement, case endings, and verb conjugation in the target language.
- Pay special attention to numbers + nouns: "1 minuta" not "1 minut", "2 lata" not "2 lat" in Polish.

### Important: No Repetition in Adjacent Sentences
- Do NOT repeat the same word, phrase, verb, or predicate in consecutive sentences. Scan every pair of adjacent sentences before outputting.
- This includes predicates split across sentences: "X jest ważna. Jest też ważna Y" — the predicate "jest ważna" repeats. Merge or rephrase.
- BAD: "Consultation is important for X. It is also important for Y." → GOOD: "Consultation is important for X. For Y, seek medical advice as well."
- BAD: "Unikaj badań w trakcie infekcji. Unikaj ich też po treningu." → GOOD: "Unikaj badań w trakcie infekcji. Po ciężkim treningu również lepiej poczekać."

### Paragraph Structure (critical — avoid "list of facts" feel)
- A paragraph (<p>) should contain 3-6 sentences that develop ONE coherent thought. Do NOT put every sentence in its own <p> tag.
- Merge related short sentences into flowing paragraphs. Sentences that share a topic belong together.
- BAD (choppy, each sentence isolated):
  <p>Stałe godziny snu pomagają stabilizować rytm dobowy.</p>
  <p>Wspiera to też wieczorna rutyna bez bodźców.</p>
  <p>Chodzi m.in. o telefon i ciężkie rozmowy.</p>
- GOOD (one flowing paragraph):
  <p>Stałe godziny snu pomagają stabilizować rytm dobowy. Wspiera to też wieczorna rutyna bez bodźców — chodzi m.in. o telefon i ciężkie rozmowy tuż przed snem. Organizm potrzebuje wyraźnego sygnału, że dzień się skończył.</p>
- The article should read like a magazine feature, not like a bulleted briefing. Sentences connect, build on each other, and flow into the next.
- Use transition words WITHIN paragraphs (natural ones: "dlatego", "z kolei", "ale", "bo") to connect sentences instead of putting each thought in a separate <p>.

---

## READABILITY

### Sentence Dynamics:
- **Hard cap:** Split any sentence over {SENTENCE_HARD_CAP} words.
- **Average:** {ASL_MIN}-{ASL_MAX} words per sentence.
- **Rhythm:** Alternate long and short. Never 3 same-length sentences in a row.

### Visual Emphasis:
- Bold key terms with <strong>: {MIN_STRONG_PER_BLOCK}-{MAX_STRONG_PER_BLOCK} per ~{STRONG_WORDS_PER_BLOCK} words.
- Never bold entire sentences or headings. Keep bolded phrases to 2-5 words.

---

## OUTPUT
Return ONLY the complete HTML article starting with <h1>.

### ARTICLE METADATA
- Title (h1): {h1_title}
- Central keyword: {keyword}

### SOURCE ARTICLE (HTML)
{article_html}
"""


# ====== ANALYSIS ======
def analyze_humanization(original: str, humanized_text: str) -> Dict:
    """Porównaj metryki input vs output — czy burstiness wzrosło?"""
    metrics = {"model": MODEL_NAME, "level": HUMANIZATION_LEVEL, "phase": "humanization_v3.3_file"}

    def split_sentences(t: str):
        return [s for s in re.split(r'[.!?]+', re.sub(r'<[^>]+>', '', t)) if s.strip()]

    o_sent = split_sentences(original)
    h_sent = split_sentences(humanized_text)
    o_len = [len(s.split()) for s in o_sent]
    h_len = [len(s.split()) for s in h_sent]

    if o_len and h_len:
        metrics["sentence_variance"] = {
            "original": round(statistics.variance(o_len) if len(o_len) > 1 else 0.0, 2),
            "humanized": round(statistics.variance(h_len) if len(h_len) > 1 else 0.0, 2),
        }
        metrics["sentence_length_range"] = {
            "min": min(h_len) if h_len else 0,
            "max": max(h_len) if h_len else 0,
            "avg": round(sum(h_len) / len(h_len), 1) if h_len else 0,
        }

    metrics["readability"] = readability_metrics(humanized_text)
    return metrics


# ====== MAIN HUMANIZATION FUNCTION ======
def humanize_article(
    article_html: str,
    h1_title: str = "",
    keyword: str = "",
    lang: str = "pl",
) -> Tuple[str, Dict]:
    """Humanizuj artykuł HTML z 20 regułami anty-AI.

    Returns:
        Tuple[str, Dict]: (zhumanizowany HTML, metryki)
    """
    print(f"\n{'='*60}")
    print(f"HUMANIZATION v3.3-file")
    print(f"  Model: {MODEL_NAME} | Język: {lang}")
    print(f"  Input: {len(article_html)} znaków")
    print(f"{'='*60}")

    # --- OCHRONA: źródła → markery [[SRC_X]] ---
    src_protected, source_mapping = protect_sources(article_html)
    if source_mapping:
        print(f"  Chronione źródła: {len(source_mapping)}")

    # --- OCHRONA: liczby → markery [[NUM_X]] ---
    protected_html, number_mapping = protect_numbers(src_protected)
    print(f"  Chronione liczby: {len(number_mapping)}")

    # --- FAZA 1: Humanizacja (20 reguł) ---
    print(f"\n  FAZA 1: Humanizacja (20 reguł anty-AI)")
    prompt = create_humanization_prompt(
        article_html=protected_html,
        h1_title=h1_title,
        keyword=keyword,
        lang=lang,
        protected=True,
        sources_protected=bool(source_mapping),
    )

    humanized = call_llm(prompt)
    if not humanized:
        print("  UWAGA: Pusty output modelu — używam inputu")
        humanized = article_html

    # --- PRZYWRACANIE: markery → oryginalne wartości ---
    humanized = restore_numbers(humanized, number_mapping)
    humanized = restore_sources(humanized, source_mapping)
    print(f"  Faza 1 zakończona ({len(humanized)} znaków)")

    # --- Walidacja: <h1> na początku ---
    if not re.search(r'^\s*<h1\b[^>]*>', humanized, re.IGNORECASE):
        safe_h1 = (h1_title or "").strip() or "Artykuł"
        humanized = f"<h1>{safe_h1}</h1>\n" + humanized
        print("  Dodano brakujący <h1>")

    # --- FAZA 2: Readability retry (opcjonalny) ---
    if READABILITY_ENFORCE:
        rb = readability_metrics(humanized)
        need_retry = (
            rb["avg_sentence_length"] > ASL_MAX
            or rb["long_sentences_gt_cap"] > 0
            or rb["strong_spans"] < max(1, MIN_STRONG_PER_BLOCK)
        )
        if need_retry and READABILITY_RETRY:
            print(f"\n  FAZA 2: Readability retry")
            print(f"    ASL={rb['avg_sentence_length']:.1f} (max {ASL_MAX}), "
                  f"długie zdania={rb['long_sentences_gt_cap']}, "
                  f"boldy={rb['strong_spans']}")

            retry_src_protected, retry_source_map = protect_sources(humanized)
            retry_input, retry_map = protect_numbers(retry_src_protected)

            source_retry_note = ""
            if retry_source_map:
                source_retry_note = "\n- Keep [[SRC_X]] markers as-is. These are source citations - do not remove or edit them."

            fix_prompt = f"""
Re-edit the HTML below to improve readability while preserving all facts.
Rules:
- Split any sentence longer than {SENTENCE_HARD_CAP} words into 2-3 shorter ones.
- Keep average sentence length around {ASL_MIN}-{ASL_MAX} words; prefer active voice.
- Add subtle emphasis using <strong> to key phrases: {MIN_STRONG_PER_BLOCK}-{MAX_STRONG_PER_BLOCK} per ~{STRONG_WORDS_PER_BLOCK} words.
- Keep lists/table rows intact. Do not add links. Keep [[NUM_X]] markers as-is.{source_retry_note}
Return ONLY corrected HTML.

HTML:
{retry_input}
"""
            retry = call_llm(fix_prompt)
            if retry:
                retry = restore_numbers(retry, retry_map)
                retry = restore_sources(retry, retry_source_map)
                if anchor_count(article_html) == 0 and anchor_count(retry) == 0:
                    humanized = retry
                    print("    Retry zaakceptowany")
                else:
                    print("    Retry odrzucony (dodał linki <a>)")
            else:
                print("    Retry zwrócił pusty output")
        elif need_retry:
            print(f"\n  FAZA 2: Pominięta (READABILITY_RETRY=0)")
        else:
            print(f"\n  FAZA 2: Pominięta (metryki OK)")

    # --- Em-dash cleanup ---
    em_dash_count = humanized.count("\u2014")
    if em_dash_count > 0:
        humanized = re.sub(r'\s*\u2014\s*', ' - ', humanized)
        print(f"  Zamieniono {em_dash_count} em-dashes na krótkie myślniki")

    # --- WALIDACJE (warn-only) ---
    warnings: List[str] = []
    in_len = len(article_html)
    out_len = len(humanized)
    ratio = out_len / max(1, in_len)
    print(f"\n  Output: {out_len} znaków (delta {((ratio - 1) * 100):+.1f}%)")

    if ENABLE_LENGTH_GUARD and (ratio < MIN_LEN_RATIO or ratio > (1 + MAX_LEN_GROWTH)):
        warnings.append(f"length_ratio:{ratio:.2f}")

    missing_nums = set(extract_numeric_tokens(article_html)) - set(extract_numeric_tokens(humanized))
    if missing_nums:
        warnings.append(f"numeric_tokens_missing:{sorted(list(missing_nums))[:5]}")

    if anchor_count(article_html) == 0 and anchor_count(humanized) > 0:
        warnings.append("anchors_added")

    if li_count(humanized) < li_count(article_html):
        warnings.append("list_shortened")

    if source_mapping:
        final_source_count = len(SOURCE_CITATION_RE.findall(humanized))
        if final_source_count < len(source_mapping):
            warnings.append(f"sources_lost:{len(source_mapping)}_to_{final_source_count}")
            print(f"  UWAGA: Źródła: {len(source_mapping)} → {final_source_count}")
        else:
            print(f"  Źródła zachowane: {final_source_count}/{len(source_mapping)}")

    # Language probe (PL)
    if (lang or "").lower().startswith("pl"):
        probe = re.sub(r'<[^>]+>', '', humanized[:1000])
        en_hits = sum(probe.lower().count(w) for w in [" the ", " and ", " this ", " that ", " however "])
        if en_hits > 8:
            warnings.append("language_mismatch_probe")

    if warnings:
        print(f"  Ostrzeżenia: {warnings}")

    # --- METRYKI ---
    metrics = analyze_humanization(article_html, humanized)
    metrics["length"] = {"input": in_len, "output": out_len, "ratio": round(ratio, 3)}
    metrics["numbers_protected"] = len(number_mapping)
    metrics["warnings"] = warnings
    metrics["sources"] = {
        "input_count": len(source_mapping),
        "output_count": len(SOURCE_CITATION_RE.findall(humanized)),
        "all_preserved": len(SOURCE_CITATION_RE.findall(humanized)) >= len(source_mapping),
    }

    return humanized, metrics


# ====== EXTRACT H1 AND KEYWORD FROM HTML ======
def extract_h1_from_html(html: str) -> str:
    """Wyciągnij tekst z pierwszego <h1> w HTML."""
    m = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.IGNORECASE | re.DOTALL)
    if m:
        return re.sub(r'<[^>]+>', '', m.group(1)).strip()
    return ""


# ====== CLI ======
def _running_in_notebook() -> bool:
    """Wykryj czy skrypt działa w Jupyter/Colab (argparse nie działa tam poprawnie)."""
    try:
        from IPython import get_ipython
        shell = get_ipython()
        if shell is not None and shell.__class__.__name__ in ("ZMQInteractiveShell", "Shell"):
            return True
    except (ImportError, NameError):
        pass
    return False


def main():
    global MODEL_NAME, READABILITY_RETRY

    # --- W Colab/Jupyter: pomiń argparse, użyj domyślnych wartości z configu ---
    if _running_in_notebook():
        class Args:
            input = INPUT_FILE
            output = OUTPUT_FILE
            model = None
            lang = "pl"
            metrics = None
            no_retry = False
        args = Args()
        print(f"[Notebook mode] Używam domyślnych: input={INPUT_FILE}, output={OUTPUT_FILE}")
    else:
        parser = argparse.ArgumentParser(
            description="ARTICLE_HUMANIZATION v3.3-file — Humanizacja artykułu z pliku do pliku",
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog="""
Przykłady:
  python article_humanization_file.py
  python article_humanization_file.py custom_input.html custom_output.html
  python article_humanization_file.py --model claude-sonnet-4-5-20250929
            """,
        )
        parser.add_argument("input", nargs="?", default=INPUT_FILE, help=f"Plik wejściowy z artykułem HTML (domyślnie: {INPUT_FILE})")
        parser.add_argument("output", nargs="?", default=OUTPUT_FILE, help=f"Plik wyjściowy dla zhumanizowanego artykułu (domyślnie: {OUTPUT_FILE})")
        parser.add_argument("--model", default=None, help=f"Model LLM (domyślnie: {MODEL_NAME})")
        parser.add_argument("--lang", default="pl", help="Język artykułu: pl, en, de, cz (domyślnie: pl)")
        parser.add_argument("--metrics", default=None, help="Opcjonalny plik na metryki JSON")
        parser.add_argument("--no-retry", action="store_true", help="Wyłącz readability retry")
        args = parser.parse_args()

    # Override globali
    if args.model:
        MODEL_NAME = args.model
    if args.no_retry:
        READABILITY_RETRY = 0

    # Sprawdź backend
    backend = _get_backend_for_model(MODEL_NAME)
    if backend == "openai" and not openai_client:
        print(f"BŁĄD: Model {MODEL_NAME} wymaga OPENAI_API_KEY")
        return 1
    if backend == "anthropic" and not claude_client:
        print(f"BŁĄD: Model {MODEL_NAME} wymaga ANTHROPIC_API_KEY")
        return 1

    # Wczytaj input
    if not os.path.isfile(args.input):
        print(f"BŁĄD: Plik nie istnieje: {args.input}")
        return 1

    with open(args.input, "r", encoding="utf-8") as f:
        article_html = f.read().strip()

    if not article_html:
        print("BŁĄD: Plik wejściowy jest pusty")
        return 1

    print(f"Wczytano: {args.input} ({len(article_html)} znaków)")

    # H1 i keyword — zawsze z pliku
    h1_title = extract_h1_from_html(article_html)
    keyword = h1_title
    print(f"H1: {h1_title}")

    # Humanizuj
    humanized, metrics = humanize_article(
        article_html=article_html,
        h1_title=h1_title,
        keyword=keyword,
        lang=args.lang,
    )

    # Zapisz output
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(humanized)
    print(f"\nZapisano: {args.output} ({len(humanized)} znaków)")

    # Zapisz metryki (opcjonalnie)
    metrics_path = args.metrics
    if not metrics_path:
        base, _ = os.path.splitext(args.output)
        metrics_path = f"{base}_metrics.json"

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    print(f"Metryki: {metrics_path}")

    # Podsumowanie
    print(f"\n{'='*60}")
    print(f"GOTOWE")
    print(f"  Input:  {metrics['length']['input']} znaków")
    print(f"  Output: {metrics['length']['output']} znaków ({(metrics['length']['ratio']-1)*100:+.1f}%)")
    if metrics.get("sentence_variance"):
        sv = metrics["sentence_variance"]
        print(f"  Wariancja zdań: {sv['original']} → {sv['humanized']}")
    if metrics.get("readability"):
        rb = metrics["readability"]
        print(f"  ASL: {rb['avg_sentence_length']} | Boldy: {rb['strong_spans']} | Bold share: {rb['bold_share']}")
    if metrics.get("warnings"):
        print(f"  Ostrzeżenia: {metrics['warnings']}")
    print(f"{'='*60}")

    return 0


if __name__ == "__main__":
    if _running_in_notebook():
        main()
    else:
        exit(main())
