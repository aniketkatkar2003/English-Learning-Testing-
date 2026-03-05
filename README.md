# 🎙️ AI English Speaking Assessment Tool

An AI-powered English speaking assessment tool that evaluates your fluency, grammar, and overall conversation skills in real-time using browser-native Speech-to-Text and provides personalized coaching feedback.

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.1-000000?logo=flask)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

- 🎤 **Real-time Speech Recognition** — Browser-native Web Speech API (no external STT service needed)
- 📊 **Multi-metric Scoring** — Fluency Rate, Average Length of Run (ALR), Grammar Accuracy
- ✍️ **Grammar Analysis** — Powered by LanguageTool with error highlighting & suggestions
- 🤖 **AI Coach Feedback** — Personalized tips via NVIDIA `llama-3.1-nemotron-nano-8b-v1`
- 🎚️ **Live Waveform Visualizer** — Real-time audio frequency bars while speaking
- ⏱️ **Auto-stop Detection** — Automatically stops after 5 seconds of silence
- 🌙 **Premium Dark UI** — Glassmorphism design with smooth animations

---

## 📐 Scoring System

### 1️⃣ Fluency Rate (0–100)

```
WPM = Total Words / Speaking Duration (minutes)
Pause Ratio = Total Pause Time / Total Speaking Time

Fluency = (0.6 × Normalized WPM) + (0.4 × (1 - Pause Ratio) × 100)
```

- **Normalized WPM range:** 40–130 words/min → mapped to 0–100

### 2️⃣ Average Length of Run — ALR (0–100)

```
ALR = Average words spoken between pauses (>5000ms silence)
ALR Score = Normalized(ALR between 4–20 words) × 100
```

### 3️⃣ Grammar Accuracy (0–100)

```
Error Density = Errors per 100 words
Error-Free Clause % = Clauses without errors / Total clauses

Grammar = (0.6 × (1 - Error Density / 10)) + (0.4 × Error-Free Clause %)
Scaled to 0–100
```

### 🔹 Final Conversation Score

```
Conversation Score = (0.4 × Fluency) + (0.3 × ALR) + (0.3 × Grammar)
```

---

## 🛠️ Tech Stack

| Component         | Technology                                      |
| ----------------- | ----------------------------------------------- |
| **Frontend**      | HTML, CSS, Vanilla JavaScript                   |
| **STT Engine**    | Web Speech API (Browser Native)                 |
| **Backend**       | Python Flask                                    |
| **Grammar Check** | LanguageTool (requires Java 17+)                |
| **AI Feedback**   | NVIDIA API — `llama-3.1-nemotron-nano-8b-v1`    |
| **Design**        | Dark Glassmorphism, Inter + JetBrains Mono fonts|

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.10+**
- **Java 17+** (required by LanguageTool)
- **Chrome / Edge / Safari** (Web Speech API support)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/aniketkatkar2003/English-Learning-Testing-.git
cd English-Learning-Testing-

# 2. Create a virtual environment
python3 -m venv venv
source venv/bin/activate        # macOS/Linux
# venv\Scripts\activate          # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Install Java (if not already installed)
# macOS:
brew install openjdk@17
export PATH="/usr/local/opt/openjdk@17/bin:$PATH"

# Ubuntu/Debian:
# sudo apt install openjdk-17-jdk

# 5. Run the server
python app.py
```

### Open in Browser

Navigate to **http://localhost:5001** — click the mic button and start speaking!

---

## 📁 Project Structure

```
AI English Tool/
├── app.py                  # Flask backend — scoring + grammar + AI feedback
├── requirements.txt        # Python dependencies
├── .gitignore
├── README.md
└── frontend/
    ├── index.html          # Main page structure
    ├── style.css           # Dark glassmorphism design system
    └── script.js           # Web Speech API + scoring + visualizer
```

---

## 🔌 API Endpoints

| Method | Endpoint         | Description                        |
| ------ | ---------------- | ---------------------------------- |
| GET    | `/`              | Serves the frontend                |
| POST   | `/api/score`     | Full scoring (Fluency + ALR + Grammar) |
| POST   | `/api/grammar`   | Grammar-only analysis              |
| POST   | `/api/feedback`  | AI coaching feedback via NVIDIA LLM|

### Example — `/api/score`

**Request:**
```json
{
  "text": "Hello my name is John and I study English every day",
  "word_count": 11,
  "speaking_duration": 8.5,
  "pause_total": 1.2,
  "runs": [11]
}
```

**Response:**
```json
{
  "fluency": 72.35,
  "alr": 43.75,
  "grammar": 100.0,
  "conversation_score": 72.07,
  "word_count": 11,
  "speaking_duration": 8.5,
  "pause_total": 1.2,
  "grammar_errors": []
}
```

---

## 📝 How It Works

1. **Tap the mic button** to start speaking
2. **Web Speech API** transcribes your speech in real-time
3. **5 seconds of silence** automatically stops the recording
4. **Backend scores** your fluency, ALR, and grammar
5. **AI Coach** provides personalized feedback and improvement tips

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
