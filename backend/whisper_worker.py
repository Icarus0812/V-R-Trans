import json
import sys
import traceback
from typing import Any, Dict, Optional

# ── tqdm 패치: import 전에 해야 함 ────────────────────────────────────────────
# faster-whisper / transformers 가 내부적으로 tqdm 을 쓰므로
# 다운로드 진행률을 JSON stdout 으로 보내도록 교체한다
import tqdm as _tqdm_module
import tqdm.auto as _tqdm_auto

class _ProgressTqdm(_tqdm_module.tqdm):
    """tqdm 을 상속해서 진행률을 JSON 으로 stdout 에 전송한다."""
    def update(self, n: int = 1) -> bool | None:
        result = super().update(n)
        if self.total and self.total > 0:
            try:
                sys.stdout.write(json.dumps({
                    "type": "download_progress",
                    "desc": str(self.desc or ""),
                    "n": int(self.n),
                    "total": int(self.total),
                    "percent": round((self.n / self.total) * 100, 1)
                }, ensure_ascii=False) + "\n")
                sys.stdout.flush()
            except Exception:
                pass
        return result

# huggingface_hub 는 tqdm.auto 를 사용하므로 둘 다 교체
_tqdm_module.tqdm = _ProgressTqdm  # type: ignore
_tqdm_auto.tqdm = _ProgressTqdm  # type: ignore

# tqdm 전역 교체
_tqdm_module.tqdm = _ProgressTqdm  # type: ignore

# ── 이후에 모델 관련 import ───────────────────────────────────────────────────
from faster_whisper import WhisperModel

# Windows 콘솔/파이프에서 UTF-8 출력 강제
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# ── NLLB 번역 모델 lazy load ──────────────────────────────────────────────────
_translation_model = None
_translation_tokenizer = None
_loaded_translation_model_name: Optional[str] = None

NLLB_LANG_MAP: Dict[str, str] = {
    "ko": "kor_Hang",
    "en": "eng_Latn",
    "ja": "jpn_Jpan",
    "zh": "zho_Hans",
}

WHISPER_TO_NLLB: Dict[str, str] = {
    "ko": "kor_Hang",
    "en": "eng_Latn",
    "ja": "jpn_Jpan",
    "zh": "zho_Hans",
    "fr": "fra_Latn",
    "de": "deu_Latn",
    "es": "spa_Latn",
    "ru": "rus_Cyrl",
}

DEFAULT_TRANSLATION_MODEL = "facebook/nllb-200-distilled-600M"


def send_json(payload: Dict[str, Any]) -> None:
    """한 줄 JSON 으로 stdout 에 응답을 보낸다."""
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def load_translation_model(model_name: str) -> None:
    """NLLB 번역 모델을 처음 사용할 때 한 번만 로드한다."""
    global _translation_model, _translation_tokenizer, _loaded_translation_model_name

    if _loaded_translation_model_name == model_name:
        return

    try:
        from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

        sys.stderr.write(f"[worker] loading translation model: {model_name}\n")
        sys.stderr.flush()

        # 다운로드 시작 알림
        send_json({
            "type": "model_loading",
            "stage": "translation",
            "model": model_name,
            "status": "start"
        })

        _translation_tokenizer = AutoTokenizer.from_pretrained(model_name)
        _translation_model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
        _loaded_translation_model_name = model_name

        # 다운로드 완료 알림
        send_json({
            "type": "model_loading",
            "stage": "translation",
            "model": model_name,
            "status": "done"
        })

        sys.stderr.write(f"[worker] translation model loaded: {model_name}\n")
        sys.stderr.flush()
    except Exception as e:
        sys.stderr.write(f"[worker] translation model load failed: {e}\n")
        sys.stderr.flush()
        _translation_model = None
        _translation_tokenizer = None
        _loaded_translation_model_name = None
        raise


def translate_text(
    text: str,
    src_lang: str,
    tgt_lang: str,
    model_name: str
) -> str:
    """NLLB 모델로 텍스트를 번역한다."""
    if not text.strip():
        return ""

    load_translation_model(model_name)

    if _translation_model is None or _translation_tokenizer is None:
        return ""

    src_nllb = WHISPER_TO_NLLB.get(src_lang, "eng_Latn")
    tgt_nllb = NLLB_LANG_MAP.get(tgt_lang, "kor_Hang")

    if src_nllb == tgt_nllb:
        return text

    tokenizer = _translation_tokenizer
    model = _translation_model

    tokenizer.src_lang = src_nllb
    inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
    target_lang_id = tokenizer.convert_tokens_to_ids(tgt_nllb)
    outputs = model.generate(
        **inputs,
        forced_bos_token_id=target_lang_id,
        max_new_tokens=256,
        num_beams=2
    )

    translated = tokenizer.batch_decode(outputs, skip_special_tokens=True)
    return translated[0].strip() if translated else ""


def main() -> None:
    whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
    current_whisper_model_name = "small"

    send_json({"type": "ready", "model": current_whisper_model_name})

    for raw_line in sys.stdin:
        try:
            line = raw_line.strip()
            if not line:
                continue

            payload = json.loads(line)
            command = payload.get("command")
            request_id = payload.get("id")

            if command == "ping":
                send_json({"id": request_id, "pong": True})
                continue

            if command != "transcribe":
                send_json({"id": request_id, "ok": False, "error": f"Unknown command: {command}"})
                continue

            audio_path = payload.get("audio_path")
            input_language = payload.get("input_language")
            output_language = payload.get("output_language", "ko")
            requested_whisper_model = payload.get("whisper_model", "small")
            translation_model_name = payload.get("translation_model", DEFAULT_TRANSLATION_MODEL)

            if not audio_path:
                send_json({"id": request_id, "ok": False, "error": "audio_path is required"})
                continue

            # Whisper 모델 전환
            if requested_whisper_model != current_whisper_model_name:
                sys.stderr.write(f"[worker] switching whisper model: {current_whisper_model_name} → {requested_whisper_model}\n")
                sys.stderr.flush()

                # Whisper 모델 다운로드 시작 알림
                send_json({
                    "type": "model_loading",
                    "stage": "whisper",
                    "model": requested_whisper_model,
                    "status": "start"
                })

                whisper_model = WhisperModel(requested_whisper_model, device="cpu", compute_type="int8")
                current_whisper_model_name = requested_whisper_model

                send_json({
                    "type": "model_loading",
                    "stage": "whisper",
                    "model": requested_whisper_model,
                    "status": "done"
                })

            # 전사
            transcribe_kwargs: Dict[str, Any] = {"beam_size": 1, "vad_filter": False}
            if input_language:
                transcribe_kwargs["language"] = input_language

            segments, info = whisper_model.transcribe(audio_path, **transcribe_kwargs)

            segment_list = []
            full_text_parts = []

            for segment in segments:
                text = segment.text.strip()
                segment_list.append({"start": segment.start, "end": segment.end, "text": text})
                if text:
                    full_text_parts.append(text)

            full_text = " ".join(full_text_parts).strip()

            # 번역
            detected_language = getattr(info, "language", "en") or "en"
            translated_segments = []
            translated_full_text = ""

            if output_language and output_language != "source" and full_text:
                try:
                    translated_full_text = translate_text(
                        full_text,
                        src_lang=detected_language,
                        tgt_lang=output_language,
                        model_name=translation_model_name
                    )
                    for seg in segment_list:
                        seg_translated = translate_text(
                            seg["text"],
                            src_lang=detected_language,
                            tgt_lang=output_language,
                            model_name=translation_model_name
                        ) if seg["text"] else ""
                        translated_segments.append({
                            "start": seg["start"],
                            "end": seg["end"],
                            "text": seg_translated
                        })
                except Exception as trans_error:
                    sys.stderr.write(f"[worker] translation error: {trans_error}\n")
                    sys.stderr.flush()

            send_json({
                "id": request_id,
                "ok": True,
                "text": full_text,
                "full_text": full_text,
                "segments": segment_list,
                "translated_segments": translated_segments,
                "translated_full_text": translated_full_text,
                "detected_language": detected_language,
                "language_probability": getattr(info, "language_probability", None),
                "whisper_model": current_whisper_model_name,
                "translation_model": translation_model_name
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
