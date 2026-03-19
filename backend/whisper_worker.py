import json
import os
import re
import sys
import traceback
from typing import Optional

# --------------------------------------------------
# 입출력 인코딩 고정
# --------------------------------------------------
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")

from faster_whisper import WhisperModel
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

# --------------------------------------------------
# 환경변수 파서
# --------------------------------------------------
def parse_bool_env(name: str, default: bool) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def parse_int_env(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except Exception:
        return default


def parse_optional_int_env(name: str) -> Optional[int]:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except Exception:
        return None


def parse_float_env(name: str, default: float) -> float:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except Exception:
        return default


def parse_temperature_env(
    name: str,
    default: tuple[float, ...],
) -> tuple[float, ...]:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default

    values = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            values.append(float(part))
        except Exception:
            continue

    return tuple(values) if values else default


# --------------------------------------------------
# Whisper 설정
# --------------------------------------------------
# 요청에서 whisper_model이 안 오면 이 기본값 사용
DEFAULT_WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

# UI에서 선택 가능하게 열어둘 모델 목록
# 필요하면 여기 더 추가하면 된다.
ALLOWED_WHISPER_MODELS = {
    "tiny",
    "base",
    "small",
    "medium",
    "large-v1",
    "large-v2",
    "large-v3",
    "distil-large-v3",
}

# Whisper 디코딩 튜닝
WHISPER_BEAM_SIZE = parse_int_env("WHISPER_BEAM_SIZE", 7)
WHISPER_BEST_OF = parse_int_env("WHISPER_BEST_OF", 7)
WHISPER_PATIENCE = parse_float_env("WHISPER_PATIENCE", 1.2)
WHISPER_TEMPERATURE = parse_temperature_env(
    "WHISPER_TEMPERATURE",
    (0.0, 0.2, 0.4, 0.6),
)
WHISPER_LOG_PROB_THRESHOLD = parse_float_env("WHISPER_LOG_PROB_THRESHOLD", -1.0)
WHISPER_NO_SPEECH_THRESHOLD = parse_float_env("WHISPER_NO_SPEECH_THRESHOLD", 0.45)
WHISPER_COMPRESSION_RATIO_THRESHOLD = parse_float_env(
    "WHISPER_COMPRESSION_RATIO_THRESHOLD",
    2.4,
)
WHISPER_CONDITION_ON_PREVIOUS_TEXT = parse_bool_env(
    "WHISPER_CONDITION_ON_PREVIOUS_TEXT",
    True,
)
WHISPER_CHUNK_LENGTH = parse_optional_int_env("WHISPER_CHUNK_LENGTH")
WHISPER_VAD_MIN_SILENCE_MS = parse_int_env("WHISPER_VAD_MIN_SILENCE_MS", 300)

# --------------------------------------------------
# 영어 -> 한국어 번역 모델 설정
# --------------------------------------------------
DEFAULT_EN_KO_MODEL_NAME = "facebook/nllb-200-distilled-600M"
INVALID_EN_KO_MODEL_NAMES = {
    "Helsinki-NLP/opus-mt-en-ko",
}

NLLB_SRC_LANG = "eng_Latn"
NLLB_TGT_LANG = "kor_Hang"

NLLB_MAX_INPUT_LENGTH = parse_int_env("NLLB_MAX_INPUT_LENGTH", 256)
NLLB_MAX_NEW_TOKENS = parse_int_env("NLLB_MAX_NEW_TOKENS", 256)
NLLB_NUM_BEAMS = parse_int_env("NLLB_NUM_BEAMS", 5)
NLLB_BATCH_SIZE = parse_int_env("NLLB_BATCH_SIZE", 8)
TRANSLATION_CHUNK_MAX_CHARS = parse_int_env("TRANSLATION_CHUNK_MAX_CHARS", 280)


def resolve_en_ko_model_name() -> str:
    raw_name = (os.environ.get("EN_KO_TRANSLATION_MODEL") or "").strip()

    if not raw_name:
        return DEFAULT_EN_KO_MODEL_NAME

    if raw_name in INVALID_EN_KO_MODEL_NAMES:
        print(
            f"[translator] invalid old model name detected: {raw_name} -> {DEFAULT_EN_KO_MODEL_NAME}",
            file=sys.stderr,
        )
        return DEFAULT_EN_KO_MODEL_NAME

    return raw_name


def resolve_whisper_model_name(requested_model_name: Optional[str]) -> str:
    """
    요청으로 whisper_model이 오면 그 값을 우선 사용하고,
    없으면 환경변수 기본값을 사용한다.
    """
    raw_name = (requested_model_name or "").strip()
    if not raw_name:
        raw_name = (DEFAULT_WHISPER_MODEL_NAME or "").strip()

    if not raw_name:
        raw_name = "small"

    # 허용 목록에 없는 값이면 기본값으로 되돌린다.
    if raw_name not in ALLOWED_WHISPER_MODELS:
        print(
            f"[worker] unsupported whisper model requested: {raw_name} -> fallback={DEFAULT_WHISPER_MODEL_NAME}",
            file=sys.stderr,
        )
        fallback_name = (DEFAULT_WHISPER_MODEL_NAME or "small").strip()
        if fallback_name not in ALLOWED_WHISPER_MODELS:
            fallback_name = "small"
        return fallback_name

    return raw_name


EN_KO_MODEL_NAME = resolve_en_ko_model_name()

# --------------------------------------------------
# 모델 캐시
# --------------------------------------------------
# Whisper는 모델별로 캐시해 두고 요청마다 꺼내쓴다.
whisper_model_cache: dict[str, WhisperModel] = {}

en_ko_tokenizer = None
en_ko_model = None


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def normalize_language(value: Optional[str]) -> Optional[str]:
    if value in (None, "", "auto"):
        return None

    normalized = str(value).strip().lower()

    aliases = {
        "kr": "ko",
        "korean": "ko",
        "jp": "ja",
        "japanese": "ja",
        "cn": "zh",
        "chinese": "zh",
        "english": "en",
    }

    return aliases.get(normalized, normalized)


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def join_segment_texts(segments: list[dict]) -> str:
    parts = []
    for seg in segments:
        seg_text = normalize_text(seg.get("text", ""))
        if seg_text:
            parts.append(seg_text)
    return " ".join(parts).strip()


def get_whisper_model(requested_model_name: Optional[str]) -> tuple[str, WhisperModel]:
    """
    요청 모델명을 받아 실제 사용할 Whisper 모델을 반환한다.
    모델은 최초 1회만 로드하고 이후 캐시 재사용한다.
    """
    resolved_model_name = resolve_whisper_model_name(requested_model_name)

    cached_model = whisper_model_cache.get(resolved_model_name)
    if cached_model is not None:
        return resolved_model_name, cached_model

    print(
        (
            "[worker] loading whisper model | "
            f"name={resolved_model_name} | "
            f"device={WHISPER_DEVICE} | "
            f"compute_type={WHISPER_COMPUTE_TYPE}"
        ),
        file=sys.stderr,
    )

    model = WhisperModel(
        resolved_model_name,
        device=WHISPER_DEVICE,
        compute_type=WHISPER_COMPUTE_TYPE,
    )

    whisper_model_cache[resolved_model_name] = model

    print(
        f"[worker] whisper model loaded | name={resolved_model_name}",
        file=sys.stderr,
    )

    return resolved_model_name, model


def get_en_ko_translator():
    global en_ko_tokenizer, en_ko_model

    if en_ko_tokenizer is None or en_ko_model is None:
        print(
            f"[translator] loading NLLB model: {EN_KO_MODEL_NAME} | src={NLLB_SRC_LANG} | tgt={NLLB_TGT_LANG}",
            file=sys.stderr,
        )

        try:
            en_ko_tokenizer = AutoTokenizer.from_pretrained(
                EN_KO_MODEL_NAME,
                src_lang=NLLB_SRC_LANG,
            )
            en_ko_model = AutoModelForSeq2SeqLM.from_pretrained(EN_KO_MODEL_NAME)
            en_ko_model.eval()

            print(
                f"[translator] NLLB model loaded: {EN_KO_MODEL_NAME}",
                file=sys.stderr,
            )
        except Exception as e:
            print(
                f"[translator] failed to load NLLB model: {EN_KO_MODEL_NAME}",
                file=sys.stderr,
            )
            raise RuntimeError(
                "영어->한국어 번역 모델 로딩 실패. "
                f"model={EN_KO_MODEL_NAME!r}"
            ) from e

    return en_ko_tokenizer, en_ko_model


def split_text_for_translation(text: str) -> list[str]:
    text = normalize_text(text)
    if not text:
        return []

    sentence_candidates = re.split(r"(?<=[\.\!\?\n])\s+", text)
    sentence_candidates = [normalize_text(x) for x in sentence_candidates if normalize_text(x)]

    if not sentence_candidates:
        sentence_candidates = [text]

    chunks: list[str] = []
    current = ""

    def flush_current():
        nonlocal current
        current = normalize_text(current)
        if current:
            chunks.append(current)
        current = ""

    for sentence in sentence_candidates:
        if len(sentence) > TRANSLATION_CHUNK_MAX_CHARS:
            flush_current()

            words = sentence.split()
            temp = ""
            for word in words:
                candidate = f"{temp} {word}".strip()
                if len(candidate) <= TRANSLATION_CHUNK_MAX_CHARS:
                    temp = candidate
                else:
                    if temp:
                        chunks.append(temp)
                    temp = word
            if temp:
                chunks.append(temp)
            continue

        candidate = f"{current} {sentence}".strip()
        if len(candidate) <= TRANSLATION_CHUNK_MAX_CHARS:
            current = candidate
        else:
            flush_current()
            current = sentence

    flush_current()
    return chunks


def translate_batch_texts_to_korean(texts: list[str]) -> list[str]:
    if not texts:
        return []

    tokenizer, model = get_en_ko_translator()

    results: list[str] = []
    forced_bos_token_id = tokenizer.convert_tokens_to_ids(NLLB_TGT_LANG)

    for start_idx in range(0, len(texts), NLLB_BATCH_SIZE):
        batch = texts[start_idx : start_idx + NLLB_BATCH_SIZE]

        inputs = tokenizer(
            batch,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=NLLB_MAX_INPUT_LENGTH,
        )

        # CPU면 대부분 그대로지만, 다른 device 대비 안전하게 맞춘다.
        if hasattr(model, "device"):
            inputs = {k: v.to(model.device) for k, v in inputs.items()}

        translated_tokens = model.generate(
            **inputs,
            forced_bos_token_id=forced_bos_token_id,
            max_new_tokens=NLLB_MAX_NEW_TOKENS,
            num_beams=NLLB_NUM_BEAMS,
            early_stopping=True,
        )

        decoded = tokenizer.batch_decode(translated_tokens, skip_special_tokens=True)
        decoded = [normalize_text(x) for x in decoded]
        results.extend(decoded)

    return results


def translate_english_to_korean(text: str) -> str:
    if not normalize_text(text):
        return ""

    chunks = split_text_for_translation(text)
    translated_chunks = translate_batch_texts_to_korean(chunks)
    return normalize_text(" ".join(translated_chunks))


def translate_english_segments_to_korean(segments: list[dict]) -> tuple[str, list[dict]]:
    if not segments:
        return "", []

    all_chunk_texts: list[str] = []
    segment_chunk_ranges: list[tuple[int, int]] = []

    for seg in segments:
        seg_text = normalize_text(seg.get("text", ""))
        chunks = split_text_for_translation(seg_text)

        start_index = len(all_chunk_texts)
        all_chunk_texts.extend(chunks)
        end_index = len(all_chunk_texts)

        segment_chunk_ranges.append((start_index, end_index))

    translated_chunk_texts = translate_batch_texts_to_korean(all_chunk_texts)

    translated_segments: list[dict] = []

    for seg, (start_index, end_index) in zip(segments, segment_chunk_ranges):
        if start_index == end_index:
            translated_text = ""
        else:
            translated_text = normalize_text(
                " ".join(translated_chunk_texts[start_index:end_index])
            )

        translated_segments.append(
            {
                "start": float(seg.get("start", 0.0)),
                "end": float(seg.get("end", 0.0)),
                "text": translated_text,
            }
        )

    full_text = join_segment_texts(translated_segments)
    return full_text, translated_segments


def run_whisper(
    audio_path: str,
    input_language: Optional[str],
    task: str,
    whisper_model_name: Optional[str],
) -> dict:
    resolved_model_name, whisper_model = get_whisper_model(whisper_model_name)

    transcribe_kwargs = {
        "language": input_language,
        "task": task,
        "beam_size": WHISPER_BEAM_SIZE,
        "best_of": WHISPER_BEST_OF,
        "patience": WHISPER_PATIENCE,
        "temperature": WHISPER_TEMPERATURE,
        "vad_filter": True,
        "vad_parameters": {
            "min_silence_duration_ms": WHISPER_VAD_MIN_SILENCE_MS,
        },
        "condition_on_previous_text": WHISPER_CONDITION_ON_PREVIOUS_TEXT,
        "compression_ratio_threshold": WHISPER_COMPRESSION_RATIO_THRESHOLD,
        "log_prob_threshold": WHISPER_LOG_PROB_THRESHOLD,
        "no_speech_threshold": WHISPER_NO_SPEECH_THRESHOLD,
    }

    if WHISPER_CHUNK_LENGTH is not None:
        transcribe_kwargs["chunk_length"] = WHISPER_CHUNK_LENGTH

    segments, info = whisper_model.transcribe(audio_path, **transcribe_kwargs)

    text_parts = []
    segment_list = []

    for seg in segments:
        seg_text = normalize_text(seg.text or "")
        if not seg_text:
            continue

        text_parts.append(seg_text)
        segment_list.append(
            {
                "start": float(seg.start),
                "end": float(seg.end),
                "text": seg_text,
            }
        )

    return {
        "text": " ".join(text_parts).strip(),
        "segments": segment_list,
        "detected_language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "whisper_model": resolved_model_name,
    }


def transcribe_audio(
    audio_path: str,
    input_language: Optional[str],
    whisper_model_name: Optional[str],
) -> dict:
    return run_whisper(audio_path, input_language, task="transcribe", whisper_model_name=whisper_model_name)


def translate_audio_to_english(
    audio_path: str,
    input_language: Optional[str],
    whisper_model_name: Optional[str],
) -> dict:
    return run_whisper(audio_path, input_language, task="translate", whisper_model_name=whisper_model_name)


def build_korean_output(
    audio_path: str,
    source_text: str,
    source_segments: list[dict],
    detected_language: Optional[str],
    input_language: Optional[str],
    whisper_model_name: Optional[str],
) -> tuple[str, str, list[dict]]:
    source_text = normalize_text(source_text)

    if not source_text:
        return "", "", []

    normalized_detected_language = normalize_language(detected_language)
    normalized_input_language = normalize_language(input_language)

    is_korean = normalized_detected_language == "ko" or normalized_input_language == "ko"
    is_english = normalized_detected_language == "en" or normalized_input_language == "en"

    if is_korean:
        return source_text, "", source_segments

    if is_english:
        english_segments = source_segments
        english_text = source_text
    else:
        english_result = translate_audio_to_english(
            audio_path,
            input_language,
            whisper_model_name,
        )
        english_segments = english_result["segments"]
        english_text = normalize_text(english_result["text"])

    if not english_text:
        return source_text, "", []

    korean_text, translated_segments = translate_english_segments_to_korean(english_segments)

    if not korean_text:
        return source_text, english_text, []

    return korean_text, english_text, translated_segments


def main() -> None:
    emit(
        {
            "type": "ready",
            "ok": True,
            "default_whisper_model": DEFAULT_WHISPER_MODEL_NAME,
            "available_whisper_models": sorted(ALLOWED_WHISPER_MODELS),
            "translation_model": EN_KO_MODEL_NAME,
        }
    )

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        req_id = None

        try:
            req = json.loads(line)
            req_id = req.get("id")
            command = req.get("command")

            if command == "ping":
                emit(
                    {
                        "id": req_id,
                        "ok": True,
                        "pong": True,
                    }
                )
                continue

            if command != "transcribe":
                emit(
                    {
                        "id": req_id,
                        "ok": False,
                        "error": f"Unsupported command: {command}",
                    }
                )
                continue

            # --------------------------------------------------
            # 요청값 읽기
            # --------------------------------------------------
            audio_path = req["audio_path"]
            input_language = normalize_language(req.get("input_language"))
            output_language = req.get("output_language", "source")
            requested_whisper_model = req.get("whisper_model")
            resolved_whisper_model = resolve_whisper_model_name(requested_whisper_model)

            print(
                (
                    "[worker] transcribe request | "
                    f"input_language={input_language} | "
                    f"output_language={output_language} | "
                    f"requested_whisper_model={requested_whisper_model} | "
                    f"resolved_whisper_model={resolved_whisper_model} | "
                    f"beam={WHISPER_BEAM_SIZE} | "
                    f"best_of={WHISPER_BEST_OF} | "
                    f"patience={WHISPER_PATIENCE}"
                ),
                file=sys.stderr,
            )

            # --------------------------------------------------
            # 1) 원문 전사
            # --------------------------------------------------
            base_result = transcribe_audio(
                audio_path,
                input_language,
                resolved_whisper_model,
            )

            source_text = base_result["text"]
            source_segments = base_result["segments"]
            detected_language = base_result["detected_language"]
            language_probability = base_result["language_probability"]

            final_text = source_text
            english_pivot_text = ""
            translated_segments = []

            # --------------------------------------------------
            # 2) 한국어 출력 요청이면 한국어로 변환
            # --------------------------------------------------
            if output_language == "ko":
                final_text, english_pivot_text, translated_segments = build_korean_output(
                    audio_path=audio_path,
                    source_text=source_text,
                    source_segments=source_segments,
                    detected_language=detected_language,
                    input_language=input_language,
                    whisper_model_name=resolved_whisper_model,
                )

            emit(
                {
                    "id": req_id,
                    "ok": True,
                    "text": final_text,
                    "full_text": source_text,
                    "english_pivot_text": english_pivot_text,
                    "segments": source_segments,
                    "translated_segments": translated_segments,
                    "detected_language": detected_language,
                    "language_probability": language_probability,
                    "whisper_model": resolved_whisper_model,
                    "available_whisper_models": sorted(ALLOWED_WHISPER_MODELS),
                    "translation_model": EN_KO_MODEL_NAME,
                }
            )

        except Exception as exc:
            emit(
                {
                    "id": req_id,
                    "ok": False,
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                }
            )


if __name__ == "__main__":
    main()