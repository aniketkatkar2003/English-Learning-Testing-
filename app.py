"""
AI English Speaking Assessment Tool - Backend Server
=====================================================
Provides:
  1. /api/grammar   - Grammar analysis via LanguageTool
  2. /api/score     - Full scoring (Fluency + ALR + Grammar)
  3. /api/feedback  - AI feedback via NVIDIA llama-3.1-nemotron-nano-8b-v1
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import language_tool_python
from openai import OpenAI
import re, math

# ─── App Setup ────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder="frontend", static_url_path="")
CORS(app)

# ─── LanguageTool (lazy init) ─────────────────────────────────────────────────
_tool = None

def get_language_tool():
    global _tool
    if _tool is None:
        print("⏳ Initializing LanguageTool (first request may take a moment)...")
        _tool = language_tool_python.LanguageTool("en-US")
        print("✅ LanguageTool ready!")
    return _tool

# ─── NVIDIA LLM Client ───────────────────────────────────────────────────────
nvidia_client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="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",
)
NVIDIA_MODEL = "nvidia/llama-3.1-nemotron-nano-8b-v1"


# ═══════════════════════════════════════════════════════════════════════════════
#  SCORING HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def normalize(value, low, high):
    """Normalize value into 0‑100 given [low, high] range."""
    if high == low:
        return 50.0
    clamped = max(low, min(high, value))
    return ((clamped - low) / (high - low)) * 100.0


def compute_fluency(word_count, speaking_duration_sec, pause_total_sec):
    """
    Fluency = 0.6 × Normalized WPM + 0.4 × (1 − Pause Ratio)
    WPM normalised between 40–130.
    """
    if speaking_duration_sec <= 0:
        return 0.0
    wpm = (word_count / speaking_duration_sec) * 60.0
    norm_wpm = normalize(wpm, 40, 130)
    total_time = speaking_duration_sec
    pause_ratio = min(pause_total_sec / total_time, 1.0) if total_time > 0 else 0
    fluency = (0.6 * norm_wpm) + (0.4 * (1 - pause_ratio) * 100)
    return round(min(max(fluency, 0), 100), 2)


def compute_alr(runs):
    """
    ALR = average words between pauses (>5000ms silence).
    Normalised between 4‑20 words → 0‑100.
    """
    if not runs or len(runs) == 0:
        return 0.0
    avg = sum(runs) / len(runs)
    return round(normalize(avg, 4, 20), 2)


def compute_grammar(text, word_count):
    """
    Grammar Score via LanguageTool:
      error_density = errors per 100 words
      Grammar = 0.6 × (1 − error_density/10) + 0.4 × error_free_clause_%
    Returns (score, matches_list).
    """
    tool = get_language_tool()
    matches = tool.check(text)

    # Filter to meaningful grammar/spelling errors only
    grammar_matches = [
        m for m in matches
        if m.ruleId not in ("WHITESPACE_RULE", "COMMA_PARENTHESIS_WHITESPACE")
    ]

    error_count = len(grammar_matches)

    if word_count == 0:
        return 0.0, []

    error_density = (error_count / word_count) * 100.0

    # Estimate clause count (split by sentence-ending punctuation or commas)
    clauses = re.split(r'[.!?,;:]', text)
    clauses = [c.strip() for c in clauses if len(c.strip()) > 0]
    total_clauses = max(len(clauses), 1)

    # Determine error-free clauses
    error_positions = set()
    for m in grammar_matches:
        error_positions.add((m.offset, m.offset + m.errorLength))

    error_free = 0
    pos = 0
    for clause in clauses:
        clause_start = text.find(clause, pos)
        clause_end = clause_start + len(clause) if clause_start >= 0 else pos
        has_error = False
        for (es, ee) in error_positions:
            if es < clause_end and ee > clause_start:
                has_error = True
                break
        if not has_error:
            error_free += 1
        pos = clause_end

    error_free_pct = error_free / total_clauses

    raw = (0.6 * (1 - min(error_density / 10, 1))) + (0.4 * error_free_pct)
    score = round(min(max(raw * 100, 0), 100), 2)

    error_details = []
    for m in grammar_matches:
        error_details.append({
            "message": m.message,
            "context": m.context,
            "suggestions": m.replacements[:3] if m.replacements else [],
            "ruleId": m.ruleId,
            "offset": m.offset,
            "length": m.errorLength,
        })

    return score, error_details


# ═══════════════════════════════════════════════════════════════════════════════
#  API ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.route("/api/grammar", methods=["POST"])
def api_grammar():
    """Analyse grammar only."""
    data = request.json or {}
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400

    words = text.split()
    score, errors = compute_grammar(text, len(words))
    return jsonify({"grammar_score": score, "errors": errors, "word_count": len(words)})


@app.route("/api/score", methods=["POST"])
def api_score():
    """
    Full scoring endpoint.
    Expects JSON: {
      text, word_count, speaking_duration, pause_total, runs[]
    }
    """
    data = request.json or {}
    text = data.get("text", "").strip()
    word_count = data.get("word_count", 0)
    speaking_duration = data.get("speaking_duration", 0)
    pause_total = data.get("pause_total", 0)
    runs = data.get("runs", [])

    print(f"📊 /api/score — words={word_count}, duration={speaking_duration:.1f}s, pause={pause_total:.1f}s, runs={runs}")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    if word_count == 0:
        word_count = len(text.split())

    # 1. Fluency
    fluency = compute_fluency(word_count, speaking_duration, pause_total)
    print(f"   Fluency: {fluency}")

    # 2. ALR
    alr = compute_alr(runs)
    print(f"   ALR: {alr}")

    # 3. Grammar
    try:
        grammar, errors = compute_grammar(text, word_count)
    except Exception as e:
        print(f"   ⚠️ Grammar check failed: {e}")
        grammar = 80.0  # default if LanguageTool fails
        errors = []
    print(f"   Grammar: {grammar}")

    # Final Conversation Score
    conversation_score = round(
        (0.4 * fluency) + (0.3 * alr) + (0.3 * grammar), 2
    )
    print(f"   ✅ Conversation Score: {conversation_score}")

    return jsonify({
        "fluency": fluency,
        "alr": alr,
        "grammar": grammar,
        "conversation_score": conversation_score,
        "word_count": word_count,
        "speaking_duration": round(speaking_duration, 2),
        "pause_total": round(pause_total, 2),
        "grammar_errors": errors,
    })


@app.route("/api/feedback", methods=["POST"])
def api_feedback():
    """
    Generate AI feedback using NVIDIA llama-3.1-nemotron-nano-8b-v1.
    Expects JSON: { text, scores: { fluency, alr, grammar, conversation_score } }
    """
    data = request.json or {}
    text = data.get("text", "").strip()
    scores = data.get("scores", {})

    if not text:
        return jsonify({"error": "No text provided"}), 400

    prompt = f"""You are an expert English language coach. A student just finished a speaking practice session. Analyse their performance and give constructive, encouraging feedback.

**Student's Transcript:**
"{text}"

**Scores:**
- Fluency: {scores.get('fluency', 'N/A')}/100
- Average Length of Run (ALR): {scores.get('alr', 'N/A')}/100
- Grammar Accuracy: {scores.get('grammar', 'N/A')}/100
- Overall Conversation Score: {scores.get('conversation_score', 'N/A')}/100

Please provide:
1. **Overall Assessment** – A brief summary of the student's English speaking level.
2. **Strengths** – What the student did well.
3. **Areas for Improvement** – Specific, actionable tips to improve fluency, grammar, and vocabulary.
4. **Corrected Sentences** – If there are grammar mistakes, show the corrected version.
5. **Practice Tip** – One practical exercise they can do to improve.

Keep the tone friendly, motivating, and professional. Use emojis sparingly for encouragement."""

    try:
        completion = nvidia_client.chat.completions.create(
            model=NVIDIA_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert English language coach providing detailed, constructive feedback on speaking practice sessions."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=1024,
        )
        feedback = completion.choices[0].message.content
        return jsonify({"feedback": feedback})
    except Exception as e:
        return jsonify({"error": f"AI feedback failed: {str(e)}"}), 500


# ─── Run ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("🚀 AI English Tool starting on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=True)
