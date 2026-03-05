/**
 * AI English Tool — Frontend Logic
 * =================================
 * Web Speech API STT → Pause detection → Scoring → AI Feedback
 */

const API_BASE = "";

// ─── DOM Elements ────────────────────────────────────────────────────────────
const speakBtn = document.getElementById("speakBtn");
const micIcon = document.getElementById("micIcon");
const stopIcon = document.getElementById("stopIcon");
const pulseRing = document.getElementById("pulseRing");
const pulseRing2 = document.getElementById("pulseRing2");
const speakLabel = document.getElementById("speakLabel");
const speakHint = document.getElementById("speakHint");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const timerEl = document.getElementById("timer");
const transcriptSection = document.getElementById("transcriptSection");
const transcriptText = document.getElementById("transcriptText");
const transcriptInterim = document.getElementById("transcriptInterim");
const wordCounter = document.getElementById("wordCounter");
const resultsSection = document.getElementById("resultsSection");
const waveCanvas = document.getElementById("waveCanvas");

// Score elements
const overallScoreValue = document.getElementById("overallScoreValue");
const scoreRingProgress = document.getElementById("scoreRingProgress");
const fluencyBar = document.getElementById("fluencyBar");
const fluencyValue = document.getElementById("fluencyValue");
const alrBar = document.getElementById("alrBar");
const alrValue = document.getElementById("alrValue");
const grammarBar = document.getElementById("grammarBar");
const grammarValue = document.getElementById("grammarValue");
const wpmValue = document.getElementById("wpmValue");
const pauseRatioValue = document.getElementById("pauseRatioValue");
const avgRunValue = document.getElementById("avgRunValue");
const totalRunsValue = document.getElementById("totalRunsValue");
const errorCountValue = document.getElementById("errorCountValue");
const errorDensityValue = document.getElementById("errorDensityValue");
const grammarErrorsCard = document.getElementById("grammarErrorsCard");
const errorsList = document.getElementById("errorsList");
const feedbackLoading = document.getElementById("feedbackLoading");
const feedbackContent = document.getElementById("feedbackContent");
const tryAgainBtn = document.getElementById("tryAgainBtn");

// ─── State ───────────────────────────────────────────────────────────────────
let isRecording = false;
let recognition = null;
let finalTranscript = "";
let interimTranscript = "";
let startTime = 0;
let timerInterval = null;
let silenceTimeout = null;
let isStopping = false;  // guard against double-stop

// Pause & run tracking
let lastSpeechTime = 0;
let silenceAutoStop = 5000;     // ms — auto-stop after 5s silence
let runs = [];                  // word counts between pauses (>5s)
let currentRunWordCount = 0;
let totalPauseTime = 0;
let lastResultTime = 0;
// Track all result timestamps so we can compute pauses accurately
let resultTimestamps = [];

// Audio visualizer
let audioCtx = null;
let analyser = null;
let animFrameId = null;
let mediaStream = null;

// ─── Check browser support ──────────────────────────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  speakLabel.textContent = "Browser not supported";
  speakHint.textContent = "Please use Chrome, Edge, or Safari";
  speakBtn.disabled = true;
  speakBtn.style.opacity = 0.4;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  WAVEFORM VISUALIZER
// ═══════════════════════════════════════════════════════════════════════════════

function initAudioVisualizer(stream) {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(analyser);
  drawWaveform();
}

function drawWaveform() {
  const ctx = waveCanvas.getContext("2d");
  const W = waveCanvas.width;
  const H = waveCanvas.height;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    animFrameId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, W, H);

    const barW = (W / bufferLength) * 2.5;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 255;
      const barH = v * H * 0.85;

      const gradient = ctx.createLinearGradient(0, H, 0, H - barH);
      gradient.addColorStop(0, "rgba(99, 102, 241, 0.6)");
      gradient.addColorStop(1, "rgba(168, 85, 247, 0.9)");
      ctx.fillStyle = gradient;

      const radius = Math.min(barW / 2, 3);
      const bx = x, by = H - barH, bw = barW - 1, bh = barH;
      if (bh > 0) {
        ctx.beginPath();
        ctx.moveTo(bx + radius, by);
        ctx.lineTo(bx + bw - radius, by);
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
        ctx.lineTo(bx + bw, by + bh);
        ctx.lineTo(bx, by + bh);
        ctx.lineTo(bx, by + radius);
        ctx.quadraticCurveTo(bx, by, bx + radius, by);
        ctx.fill();
      }
      x += barW;
    }
  }
  draw();
}

function drawIdleWave() {
  const ctx = waveCanvas.getContext("2d");
  const W = waveCanvas.width;
  const H = waveCanvas.height;
  let t = 0;
  function idle() {
    animFrameId = requestAnimationFrame(idle);
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(99, 102, 241, 0.2)";
    ctx.lineWidth = 2;
    for (let x = 0; x < W; x++) {
      const y = H / 2 + Math.sin(x * 0.02 + t) * 8 + Math.sin(x * 0.01 + t * 0.5) * 4;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    t += 0.03;
  }
  idle();
}

function stopVisualizer() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = null;
  if (audioCtx) { try { audioCtx.close(); } catch (e) { } audioCtx = null; }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
}

// Start idle animation
drawIdleWave();

// ═══════════════════════════════════════════════════════════════════════════════
//  SPEECH RECOGNITION
// ═══════════════════════════════════════════════════════════════════════════════

function startRecording() {
  // Reset state
  finalTranscript = "";
  interimTranscript = "";
  runs = [];
  currentRunWordCount = 0;
  totalPauseTime = 0;
  lastResultTime = 0;
  resultTimestamps = [];
  isStopping = false;
  transcriptText.textContent = "";
  transcriptInterim.textContent = "";
  wordCounter.textContent = "0 words";
  resultsSection.classList.add("hidden");

  // UI updates
  isRecording = true;
  speakBtn.classList.add("recording");
  micIcon.classList.add("hidden");
  stopIcon.classList.remove("hidden");
  speakLabel.textContent = "Listening... Tap to Stop";
  speakHint.textContent = "Speak naturally — 5s silence will auto-stop";
  statusDot.className = "status-dot listening";
  statusText.textContent = "Listening...";
  timerEl.classList.add("active");
  transcriptSection.classList.add("visible");

  // Timer
  startTime = Date.now();
  timerInterval = setInterval(updateTimer, 1000);

  // Stop idle wave, get microphone
  stopVisualizer();
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    mediaStream = stream;
    initAudioVisualizer(stream);
  }).catch((err) => { console.warn("Mic access failed:", err); });

  // Speech Recognition
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  lastSpeechTime = Date.now();

  recognition.onresult = (event) => {
    const now = Date.now();
    let interim = "";
    let newFinal = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        newFinal += t;
      } else {
        interim += t;
      }
    }

    if (newFinal) {
      const words = newFinal.trim().split(/\s+/).filter(w => w.length > 0);
      currentRunWordCount += words.length;
      finalTranscript += newFinal;

      // Record timestamp for this final result
      resultTimestamps.push({ time: now, wordCount: words.length });
      lastResultTime = now;
    }

    interimTranscript = interim;
    transcriptText.textContent = finalTranscript;
    transcriptInterim.textContent = interimTranscript;

    const totalWords = finalTranscript.trim()
      .split(/\s+/).filter(w => w.length > 0).length;
    wordCounter.textContent = totalWords + " words";

    // Reset 5-second silence auto-stop timer
    lastSpeechTime = now;
    clearTimeout(silenceTimeout);
    silenceTimeout = setTimeout(() => {
      console.log("5s silence detected — auto-stopping");
      if (isRecording && !isStopping) stopRecording();
    }, silenceAutoStop);
  };

  recognition.onerror = (e) => {
    console.warn("STT error:", e.error);
    if (e.error !== "no-speech" && e.error !== "aborted") {
      console.error("Recognition error:", e.error);
    }
  };

  recognition.onend = () => {
    // Auto-restart if still recording (Chrome stops recognition after ~60s)
    if (isRecording && !isStopping) {
      try {
        recognition.start();
        console.log("Recognition auto-restarted");
      } catch (e) {
        console.warn("Failed to restart recognition:", e);
      }
    }
  };

  try {
    recognition.start();
    console.log("Recognition started");
  } catch (e) {
    console.error("Failed to start recognition:", e);
  }

  // Initial silence timeout — if user doesn't speak at all for 5s
  silenceTimeout = setTimeout(() => {
    console.log("Initial 5s silence — no speech detected");
    if (isRecording && !isStopping) stopRecording();
  }, silenceAutoStop);
}

function stopRecording() {
  if (!isRecording || isStopping) return;
  isStopping = true;
  isRecording = false;

  console.log("Stopping recording...");
  console.log("Final transcript:", finalTranscript);
  console.log("Result timestamps:", resultTimestamps);

  // ── Compute runs and pauses from timestamps ──
  // A "run" = words spoken between pauses >5000ms
  runs = [];
  totalPauseTime = 0;
  if (resultTimestamps.length > 0) {
    let runWords = resultTimestamps[0].wordCount;
    for (let i = 1; i < resultTimestamps.length; i++) {
      const gap = resultTimestamps[i].time - resultTimestamps[i - 1].time;
      if (gap > 5000) {
        // This gap is a pause >5s — end the current run
        runs.push(runWords);
        totalPauseTime += gap;
        runWords = resultTimestamps[i].wordCount;
      } else {
        runWords += resultTimestamps[i].wordCount;
      }
    }
    // Push the last run
    runs.push(runWords);
  } else if (currentRunWordCount > 0) {
    runs.push(currentRunWordCount);
  }

  console.log("Computed runs:", runs);
  console.log("Total pause time (ms):", totalPauseTime);

  clearTimeout(silenceTimeout);
  clearInterval(timerInterval);

  try { recognition.abort(); } catch (e) { }

  // UI
  speakBtn.classList.remove("recording");
  micIcon.classList.remove("hidden");
  stopIcon.classList.add("hidden");
  speakLabel.textContent = "Processing...";
  statusDot.className = "status-dot processing";
  statusText.textContent = "Analysing your speech...";
  timerEl.classList.remove("active");

  stopVisualizer();
  drawIdleWave();

  // Calculate speaking duration
  const speakingDuration = (Date.now() - startTime) / 1000;
  const text = finalTranscript.trim();

  if (!text || text.length < 2) {
    console.log("No speech detected");
    speakLabel.textContent = "No speech detected. Try again.";
    statusDot.className = "status-dot";
    statusText.textContent = "Ready to listen";
    setTimeout(() => {
      speakLabel.textContent = "Tap to Start Speaking";
      isStopping = false;
    }, 2000);
    return;
  }

  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  const pauseTotalSec = totalPauseTime / 1000;

  console.log("Sending to backend:", {
    text, wordCount, speakingDuration, pauseTotalSec, runs
  });

  // Send to backend for scoring
  processScoring(text, wordCount, speakingDuration, pauseTotalSec, runs);
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");
  timerEl.textContent = `${m}:${s}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SCORING & FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════════

async function processScoring(text, wordCount, speakingDuration, pauseTotal, runsArr) {
  console.log("processScoring called");

  try {
    // 1. Get scores from backend
    const payload = {
      text: text,
      word_count: wordCount,
      speaking_duration: speakingDuration,
      pause_total: pauseTotal,
      runs: runsArr
    };
    console.log("POST /api/score payload:", JSON.stringify(payload));

    const scoreRes = await fetch(`${API_BASE}/api/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log("Score response status:", scoreRes.status);

    if (!scoreRes.ok) {
      const errText = await scoreRes.text();
      console.error("Score API error:", errText);
      speakLabel.textContent = "Scoring failed. Check server.";
      statusDot.className = "status-dot";
      statusText.textContent = "Error";
      isStopping = false;
      return;
    }

    const scores = await scoreRes.json();
    console.log("Scores received:", scores);

    if (scores.error) {
      console.error("Scoring error:", scores.error);
      speakLabel.textContent = "Error: " + scores.error;
      resetUI();
      isStopping = false;
      return;
    }

    // Display scores
    displayScores(scores, wordCount, speakingDuration, pauseTotal);

    // 2. Get AI feedback (async, don't block)
    fetchAIFeedback(text, scores);
  } catch (err) {
    console.error("Scoring request failed:", err);
    speakLabel.textContent = "Server error — is backend running?";
    statusDot.className = "status-dot";
    statusText.textContent = "Connection failed";
    isStopping = false;
  }
}

function displayScores(scores, wordCount, speakingDuration, pauseTotal) {
  console.log("Displaying scores...");
  resultsSection.classList.remove("hidden");
  speakLabel.textContent = "Assessment Complete ✓";
  statusDot.className = "status-dot";
  statusText.textContent = "Results ready";

  // Animate overall score ring
  const overall = Math.round(scores.conversation_score);
  const circumference = 2 * Math.PI * 70; // r=70
  const offset = circumference - (overall / 100) * circumference;

  // Use setTimeout to trigger CSS transition
  setTimeout(() => {
    scoreRingProgress.style.strokeDashoffset = offset;
  }, 100);
  animateNumber(overallScoreValue, 0, overall, 1200);

  // Fluency
  setTimeout(() => {
    fluencyBar.style.width = scores.fluency + "%";
    animateNumber(fluencyValue, 0, Math.round(scores.fluency), 800);
    const wpm = speakingDuration > 0
      ? ((wordCount / speakingDuration) * 60).toFixed(1)
      : "0";
    wpmValue.textContent = wpm;
    const pr = speakingDuration > 0
      ? (pauseTotal / speakingDuration).toFixed(2)
      : "0.00";
    pauseRatioValue.textContent = pr;
  }, 200);

  // ALR
  setTimeout(() => {
    alrBar.style.width = scores.alr + "%";
    animateNumber(alrValue, 0, Math.round(scores.alr), 800);
    const avgRun = runs.length > 0
      ? (runs.reduce((a, b) => a + b, 0) / runs.length).toFixed(1)
      : "—";
    avgRunValue.textContent = avgRun;
    totalRunsValue.textContent = runs.length;
  }, 400);

  // Grammar
  setTimeout(() => {
    grammarBar.style.width = scores.grammar + "%";
    animateNumber(grammarValue, 0, Math.round(scores.grammar), 800);
    const errCount = scores.grammar_errors ? scores.grammar_errors.length : 0;
    errorCountValue.textContent = errCount;
    const density = wordCount > 0
      ? ((errCount / wordCount) * 100).toFixed(1)
      : "0.0";
    errorDensityValue.textContent = density + "/100w";

    // Grammar errors list
    if (errCount > 0) {
      grammarErrorsCard.classList.remove("hidden");
      errorsList.innerHTML = "";
      scores.grammar_errors.forEach(err => {
        const item = document.createElement("div");
        item.className = "error-item";
        const suggestions = err.suggestions && err.suggestions.length > 0
          ? `<div class="error-suggestion">💡 Suggestion: <strong>${err.suggestions.join(", ")}</strong></div>`
          : "";
        item.innerHTML = `<div class="error-message">${err.message}</div>${suggestions}`;
        errorsList.appendChild(item);
      });
    } else {
      grammarErrorsCard.classList.add("hidden");
    }
  }, 600);

  // Smooth scroll to results
  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    isStopping = false;
  }, 800);
}

async function fetchAIFeedback(text, scores) {
  feedbackLoading.classList.remove("hidden");
  feedbackContent.classList.add("hidden");

  try {
    const res = await fetch(`${API_BASE}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        scores: {
          fluency: scores.fluency,
          alr: scores.alr,
          grammar: scores.grammar,
          conversation_score: scores.conversation_score,
        },
      }),
    });
    const data = await res.json();
    console.log("AI feedback received");
    if (data.error) {
      feedbackContent.innerHTML = `<p style="color:var(--accent-danger)">⚠️ ${data.error}</p>`;
    } else {
      feedbackContent.innerHTML = markdownToHTML(data.feedback);
    }
  } catch (err) {
    console.error("Feedback fetch failed:", err);
    feedbackContent.innerHTML = `<p style="color:var(--accent-danger)">⚠️ Failed to get AI feedback. Check server connection.</p>`;
  }

  feedbackLoading.classList.add("hidden");
  feedbackContent.classList.remove("hidden");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function animateNumber(el, from, to, duration) {
  const start = performance.now();
  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function markdownToHTML(md) {
  if (!md) return "";
  let html = md
    .replace(/### (.*)/g, "<h4>$1</h4>")
    .replace(/## (.*)/g, "<h3>$1</h3>")
    .replace(/# (.*)/g, "<h2>$1</h2>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\n- (.*)/g, "\n<li>$1</li>")
    .replace(/\n\d+\. (.*)/g, "\n<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
  return html;
}

function resetUI() {
  speakLabel.textContent = "Tap to Start Speaking";
  speakHint.textContent = "Silence for 5 seconds will auto-stop recording";
  statusDot.className = "status-dot";
  statusText.textContent = "Ready to listen";
  timerEl.textContent = "00:00";
  timerEl.classList.remove("active");
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

speakBtn.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

tryAgainBtn.addEventListener("click", () => {
  resultsSection.classList.add("hidden");
  grammarErrorsCard.classList.add("hidden");
  feedbackLoading.classList.remove("hidden");
  feedbackContent.classList.add("hidden");
  transcriptText.textContent = "";
  transcriptInterim.textContent = "";
  wordCounter.textContent = "0 words";
  scoreRingProgress.style.strokeDashoffset = "440";
  fluencyBar.style.width = "0%";
  alrBar.style.width = "0%";
  grammarBar.style.width = "0%";
  overallScoreValue.textContent = "0";
  fluencyValue.textContent = "0";
  alrValue.textContent = "0";
  grammarValue.textContent = "0";
  isStopping = false;
  resetUI();
});
