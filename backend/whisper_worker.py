from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from faster_whisper import WhisperModel

MODEL_NAME = "small"
LANGUAGE = "ko"

model = WhisperModel(
    MODEL_NAME,
    device="cpu",
    compute_type="int8",
)

print(json.dumps({"type": "ready", "model": MODEL_NAME}, ensure_ascii=False), flush=True)


def transcribe_file(audio_path: str) -> dict[str, Any]:
    path = Path(audio_path)
    if not path.exists():
      return {
          "ok": False,
          "error": f"file not found: {audio_path}",
      }

    segments, info = model.transcribe(
        str(path),
        language=LANGUAGE,
        vad_filter=True,
        beam_size=5,
    )

    items: list[dict[str, Any]] = []
    parts: list[str] = []

    for segment in segments:
        text = segment.text.strip()
        items.append(
            {
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": text,
            }
        )
        if text:
            parts.append(text)

    return {
        "ok": True,
        "detected_language": info.language,
        "language_probability": float(info.language_probability),
        "segments": items,
        "full_text": " ".join(parts).strip(),
    }


for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue

    try:
        payload = json.loads(line)
        request_id = payload.get("id")
        command = payload.get("command")

        if command == "transcribe":
            audio_path = payload.get("audio_path", "")
            result = transcribe_file(audio_path)
            result["id"] = request_id
            print(json.dumps(result, ensure_ascii=False), flush=True)

        elif command == "ping":
            print(json.dumps({"id": request_id, "ok": True, "pong": True}, ensure_ascii=False), flush=True)

        else:
            print(
                json.dumps(
                    {
                        "id": request_id,
                        "ok": False,
                        "error": f"unknown command: {command}",
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )

    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
