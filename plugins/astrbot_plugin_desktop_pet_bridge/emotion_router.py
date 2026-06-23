from __future__ import annotations

from dataclasses import dataclass

ALLOWED_EMOTIONS = {
    "neutral",
    "cold",
    "cold_soft",
    "gentle",
    "sleepy",
    "thinking",
    "embarrassed",
    "surprised",
    "error",
}

SLEEPY_KEYWORDS = (
    "困",
    "睡",
    "晚了",
    "休息",
    "熬夜",
    "早些睡",
    "sleepy",
)

EMBARRASSED_KEYWORDS = (
    "笨蛋",
    "别看",
    "别戳",
    "干什么",
    "你很无聊吗",
    "不要随便",
    "咳",
)

COLD_KEYWORDS = (
    "无聊",
    "随便你",
    "不关我的事",
    "真闲",
    "麻烦",
    "哼",
    "不是说过了吗",
)

COLD_SOFT_KEYWORDS = (
    "早点休息",
    "别太晚",
    "小心一点",
    "注意身体",
    "我只是提醒你",
)

SURPRISED_KEYWORDS = (
    "诶",
    "真的假的",
)

THINKING_KEYWORDS = (
    "我想想",
    "让我看看",
    "也许",
    "可能",
    "大概",
    "需要确认",
    "不确定",
)

GENTLE_KEYWORDS = (
    "没关系",
    "辛苦了",
    "还好",
    "可以",
    "谢谢",
    "陪你",
    "我在",
)

COLD_SHORT_PHRASES = {
    "随你",
    "随便",
    "哦",
    "嗯",
    "哼",
    "麻烦",
}

SURPRISED_SHORT_PHRASES = {
    "什么",
    "什么？",
    "什么!",
    "什么！",
    "诶",
    "诶？",
    "诶！",
}


def _normalize(text: str) -> str:
    return " ".join(str(text or "").strip().split())


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _is_short(text: str, limit: int = 18) -> bool:
    return len(text) <= limit


def _looks_like_embarrassed(text: str) -> bool:
    if _contains_any(text, EMBARRASSED_KEYWORDS):
        return True
    if "……" in text and _is_short(text, 20):
        return True
    return "别" in text and ("看" in text or "戳" in text)


def _looks_like_cold(text: str) -> bool:
    if _contains_any(text, COLD_KEYWORDS):
        return True
    return _normalize(text) in COLD_SHORT_PHRASES


def _looks_like_surprised(text: str) -> bool:
    normalized = _normalize(text)
    if normalized in SURPRISED_SHORT_PHRASES:
        return True
    if _contains_any(text, SURPRISED_KEYWORDS):
        return _is_short(text, 18)
    strong_punctuation = text.count("！") + text.count("!") + text.count("？") + text.count("?")
    if strong_punctuation == 0:
        return False
    if len(text) > 14:
        return False
    if text.count("？") + text.count("?") == 1 and not any(mark in text for mark in ("！", "!", "真的假的")):
        return False
    return True


def _looks_like_thinking(text: str) -> bool:
    if "我想想" in text or "让我看看" in text or "需要确认" in text or "不确定" in text:
        return True
    uncertain_hits = sum(1 for keyword in ("也许", "可能", "大概") if keyword in text)
    if uncertain_hits == 0:
        return False
    if uncertain_hits >= 2:
        return True
    return _is_short(text, 24)


def detect_emotion(text: str, source: str | None = None) -> str:
    normalized = _normalize(text)
    if not normalized:
        return "neutral"

    lowered = normalized.lower()

    if _contains_any(normalized, SLEEPY_KEYWORDS) or _contains_any(lowered, SLEEPY_KEYWORDS):
        return "sleepy"

    if _looks_like_embarrassed(normalized):
        return "embarrassed"

    if _looks_like_cold(normalized):
        return "cold"

    if _contains_any(normalized, COLD_SOFT_KEYWORDS):
        return "cold_soft"

    if _looks_like_surprised(normalized):
        return "surprised"

    if _looks_like_thinking(normalized):
        return "thinking"

    if _contains_any(normalized, GENTLE_KEYWORDS):
        return "gentle"

    return "neutral"


def normalize_default_emotion(value: str) -> str:
    emotion = str(value or "neutral").strip()
    if emotion in ALLOWED_EMOTIONS:
        return emotion
    return "neutral"


@dataclass(frozen=True)
class EmotionTestCase:
    text: str
    expected: str


SELF_TEST_CASES = (
    EmotionTestCase("随便你。", "cold"),
    EmotionTestCase("别太晚，注意身体。", "cold_soft"),
    EmotionTestCase("太晚了，早点休息。", "sleepy"),
    EmotionTestCase("……别戳。", "embarrassed"),
    EmotionTestCase("真的假的？！", "surprised"),
    EmotionTestCase("我想想，也许还需要确认。", "thinking"),
    EmotionTestCase("没关系，我在。", "gentle"),
    EmotionTestCase("今天风有点大。", "neutral"),
)


def run_self_test() -> list[tuple[str, str, str]]:
    failures: list[tuple[str, str, str]] = []
    for case in SELF_TEST_CASES:
        actual = detect_emotion(case.text)
        if actual != case.expected:
            failures.append((case.text, case.expected, actual))
    return failures


if __name__ == "__main__":
    failures = run_self_test()
    if failures:
        for text, expected, actual in failures:
            print(f"FAIL expected={expected} actual={actual} text={text}")
        raise SystemExit(1)
    print("emotion_router self-test passed")
