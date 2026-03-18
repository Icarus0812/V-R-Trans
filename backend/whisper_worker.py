import json
import sys
import traceback
from typing import Any, Dict

from faster_whisper import WhisperModel

# Windows 콘솔/파이프에서 UTF-8 출력 강제
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


def send_json(payload: Dict[str, Any]) -> None:
    """
    한 줄 JSON으로 stdout에 응답을 보낸다.
    ensure_ascii=False 로 한글이 깨지지 않게 한다.
    """
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    """
    faster-whisper 모델 로드 후,
    stdin으로 들어오는 JSON 명령을 처리한다.
    """
    model = WhisperModel("small", device="cpu", compute_type="int8")

    # worker 준비 완료 알림
    send_json({
        "type": "ready",
        "model": "small"
    })

    for raw_line in sys.stdin:
      try:
        line = raw_line.strip()
        if not line:
            continue

        payload = json.loads(line)

        command = payload.get("command")
        request_id = payload.get("id")

        if command == "ping":
            send_json({
                "id": request_id,
                "pong": True
            })
            continue

        if command != "transcribe":
            send_json({
                "id": request_id,
                "ok": False,
                "error": f"Unknown command: {command}"
            })
            continue

        audio_path = payload.get("audio_path")
        input_language = payload.get("input_language")

        if not audio_path:
            send_json({
                "id": request_id,
                "ok": False,
                "error": "audio_path is required"
            })
            continue

        # auto 또는 빈 값이면 자동 감지
        transcribe_kwargs: Dict[str, Any] = {
            "beam_size": 1,
            "vad_filter": False
        }

        if input_language:
            transcribe_kwargs["language"] = input_language

        segments, info = model.transcribe(audio_path, **transcribe_kwargs)

        segment_list = []
        full_text_parts = []

        for segment in segments:
            text = segment.text.strip()

            segment_list.append({
                "start": segment.start,
                "end": segment.end,
                "text": text
            })

            if text:
                full_text_parts.append(text)

        full_text = " ".join(full_text_parts).strip()

        send_json({
            "id": request_id,
            "ok": True,
            "text": full_text,
            "full_text": full_text,
            "segments": segment_list,
            "detected_language": getattr(info, "language", None),
            "language_probability": getattr(info, "language_probability", None)
        })

      except Exception as error:
        send_json({
            "id": payload.get("id") if "payload" in locals() and isinstance(payload, dict) else None,
            "ok": False,
            "error": str(error)
        })

        traceback.print_exc(file=sys.stderr)


if __name__ == "__main__":
    main()