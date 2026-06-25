from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

ALLOWED_EMOTIONS = {
    "neutral",
    "cold",
    "cold_soft",
    "gentle",
    "sleepy",
    "thinking",
    "embarrassed",
    "surprised",
    "annoyed",
    "error",
}

ROUTABLE_EMOTIONS = (
    "neutral",
    "cold",
    "cold_soft",
    "gentle",
    "sleepy",
    "thinking",
    "embarrassed",
    "surprised",
    "annoyed",
)

DEFAULT_MIN_SCORE = 2.6

STRONG_SLEEPY_PATTERNS = (
    "好困",
    "困了",
    "困得",
    "想睡",
    "睡吧",
    "睡一会",
    "睡会",
    "补觉",
    "晚安",
    "休息吧",
    "休息一会",
    "别熬",
    "别熬夜",
    "早点睡",
    "先睡",
    "闭眼",
    "躺下",
    "躺着",
    "撑不住",
)

SLEEPY_PATTERNS = (
    "困",
    "睡",
    "晚了",
    "休息",
    "熬夜",
    "熬到",
    "眼睛都睁不开",
    "眼睛都快睁不开",
    "想眯",
    "犯困",
    "午睡",
    "补觉",
)

SLEEPY_ACTION_PATTERNS = (
    "靠过来",
    "靠着",
    "去睡",
    "去休息",
)

COLD_PATTERNS = (
    "随便你",
    "随你",
    "不关我的事",
    "关我什么事",
    "我才懒得管",
    "懒得理你",
    "真麻烦",
    "麻烦",
    "无聊",
    "真闲",
    "少来",
    "别烦我",
    "别闹",
    "都说了",
    "不是说过了吗",
    "你自己看",
    "啧",
    "哼",
)

ANNOYED_PATTERNS = (
    "危险",
    "会闹",
    "真会闹",
    "还真会闹",
    "故意的吧",
    "别得寸进尺",
    "不要得寸进尺",
    "少得意",
    "别太过分",
    "真能折腾",
    "折腾我",
    "闹我",
    "别撩",
    "别撩我",
    "别招我",
    "别惹我",
)

ANNOYED_CONTEXT_PATTERNS = (
    "你",
    "这句话",
    "现在",
    "又",
    "还",
    "危险",
    "闹",
)

COLD_SHORT_PHRASES = {
    "随便",
    "随你",
    "哦",
    "嗯",
    "啧",
    "哼",
}

TSUNDERE_PATTERNS = (
    "才不是担心你",
    "我才不是担心你",
    "谁担心你了",
    "我只是提醒你",
    "别误会",
    "不是关心你",
)

CARE_PATTERNS = (
    "别太晚",
    "注意身体",
    "注意安全",
    "小心一点",
    "照顾好自己",
    "别着凉",
    "记得吃饭",
    "记得喝水",
    "记得带伞",
    "早点睡",
    "早点休息",
    "晚点记得休息",
    "路上小心",
    "别淋雨",
    "别累着",
)

GENTLE_PATTERNS = (
    "没关系",
    "没事",
    "我在",
    "陪你",
    "辛苦了",
    "别担心",
    "慢慢来",
    "不用急",
    "会好的",
    "先缓一缓",
    "先休息",
    "不怪你",
    "抱抱",
    "你已经很努力了",
    "我陪着你",
    "别怕",
)

THINKING_PATTERNS = (
    "我想想",
    "让我想想",
    "想一想",
    "让我看看",
    "先看看",
    "需要确认",
    "不太确定",
    "不确定",
    "说不好",
    "还不能确定",
    "也许",
    "可能",
    "大概",
    "或许",
    "应该是",
    "我得查一下",
    "我先确认",
    "我得想想",
)

THINKING_ACTION_PATTERNS = (
    "看一下",
    "看一眼",
    "查一下",
    "检查一下",
    "排查",
    "确认一下",
    "先确认",
    "我看一下",
    "贴给我",
    "贴过来",
    "发我",
)

TECHNICAL_CONTEXT_PATTERNS = (
    "配置",
    "模型",
    "连接",
    "端口",
    "控制台",
    "重启",
)

TECHNICAL_STRONG_CONTEXT_PATTERNS = (
    "日志",
    "报错",
    "错误栈",
    "provider",
    "websocket",
    "ws://",
    "链路",
)

SURPRISED_PATTERNS = (
    "真的假的",
    "不会吧",
    "怎么会",
    "什么",
    "诶",
    "欸",
    "啊",
    "居然",
    "等等",
    "怎么可能",
)

EMBARRASSED_PATTERNS = (
    "别戳",
    "别看",
    "别碰",
    "别靠太近",
    "靠太近了",
    "离这么近",
    "脸红",
    "笨蛋",
    "干嘛一直看",
    "不要突然",
    "谁、谁",
    "谁说的",
    "胡说什么",
    "夸我",
    "夸这种",
    "挑时候夸",
    "嘴倒是很甜",
    "别这样夸我",
)

EMBARRASSED_CONTEXT_PATTERNS = (
    "你",
    "靠近",
    "戳",
    "看着我",
    "脸",
    "别",
)

INFORMATIONAL_PATTERNS = (
    "今天",
    "现在",
    "已经",
    "目前",
    "风有点",
    "可以这样",
    "一般来说",
    "通常",
    "需要",
)

AFFECTIONATE_PATTERNS = (
    "亲",
    "吻",
    "哄我",
    "夸我",
    "嘴甜",
    "耳尖有点热",
    "脸颊",
    "惯坏",
)

REPEATED_PUNCTUATION_RE = re.compile(r"([!?！？。…,.，])\1+")
WHITESPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class EmotionTestCase:
    text: str
    expected: str


@dataclass(frozen=True)
class RuleMatch:
    emotion: str
    delta: float
    rule: str
    excerpt: str

    def to_dict(self) -> dict[str, object]:
        return {
            "emotion": self.emotion,
            "delta": round(self.delta, 3),
            "rule": self.rule,
            "excerpt": self.excerpt,
        }


def _normalize(text: str) -> str:
    value = str(text or "").strip()
    if not value:
        return ""
    value = value.replace("．．．", "…").replace("...", "…")
    value = value.replace("？", "?").replace("！", "!").replace("，", ",").replace("。", ".")
    value = WHITESPACE_RE.sub(" ", value)
    value = REPEATED_PUNCTUATION_RE.sub(r"\1", value)
    return value.strip().lower()


def _strip_stage_directions(text: str) -> str:
    value = str(text or "")
    if not value:
        return ""

    value = re.sub(r"（[^）]*）", " ", value)
    value = re.sub(r"\([^)]*\)", " ", value)
    value = re.sub(r"【[^】]*】", " ", value)
    value = re.sub(r"\[[^\]]*\]", " ", value)
    return WHITESPACE_RE.sub(" ", value).strip()


def _extract_focus_text(text: str) -> str:
    raw = str(text or "").strip()
    if not raw:
        return ""

    stripped = _strip_stage_directions(raw)
    if not stripped:
        return raw

    first_line = stripped.splitlines()[0].strip()
    if first_line:
        stripped = first_line

    for separator in (" / ", "\n", "——", "—", "：", ":"):
        head = stripped.split(separator, 1)[0].strip()
        if head:
            stripped = head
            break

    return stripped.strip()


def _contains_any(text: str, patterns: Iterable[str]) -> list[str]:
    return [pattern for pattern in patterns if pattern and pattern in text]


def _count_punctuation(text: str, marks: str) -> int:
    return sum(text.count(mark) for mark in marks)


def _is_short(text: str, limit: int = 16) -> bool:
    return len(text) <= limit


def _brief_score_table(scores: dict[str, float]) -> dict[str, float]:
    return {emotion: round(value, 3) for emotion, value in scores.items()}


def explain_emotion(
    text: str,
    source: str | None = None,
    *,
    min_score: float = DEFAULT_MIN_SCORE,
    default_emotion: str = "neutral",
) -> dict[str, object]:
    normalized = _normalize(text)
    focus_text = _extract_focus_text(text)
    focus_normalized = _normalize(focus_text)
    plain_normalized = normalized.strip(".,!?…")
    plain_focus_normalized = focus_normalized.strip(".,!?…")
    selected_default = normalize_default_emotion(default_emotion)
    scores = {emotion: 0.0 for emotion in ROUTABLE_EMOTIONS}
    matches: list[RuleMatch] = []

    def add(emotion: str, delta: float, rule: str, excerpt: str) -> None:
        if emotion not in scores or delta == 0:
            return
        scores[emotion] += delta
        matches.append(RuleMatch(emotion=emotion, delta=delta, rule=rule, excerpt=excerpt))

    if not normalized:
        return {
            "selected": selected_default,
            "score_table": _brief_score_table(scores),
            "matched_rules": [],
            "normalized_text": normalized,
            "threshold": float(min_score),
            "source": source,
        }

    add("neutral", 0.85, "baseline.neutral", normalized[:24])
    if focus_normalized and focus_normalized != normalized:
        add("neutral", 0.15, "baseline.focus_segment", focus_normalized[:24])

    strong_sleep_hits = _contains_any(normalized, STRONG_SLEEPY_PATTERNS)
    sleep_hits = _contains_any(normalized, SLEEPY_PATTERNS)
    sleep_action_hits = _contains_any(normalized, SLEEPY_ACTION_PATTERNS)
    cold_hits = _contains_any(normalized, COLD_PATTERNS)
    annoyed_hits = _contains_any(normalized, ANNOYED_PATTERNS)
    annoyed_focus_hits = _contains_any(focus_normalized, ANNOYED_PATTERNS)
    annoyed_context_hits = _contains_any(normalized, ANNOYED_CONTEXT_PATTERNS)
    cold_short_hit = plain_normalized if plain_normalized in COLD_SHORT_PHRASES else ""
    cold_focus_short_hit = (
        plain_focus_normalized if plain_focus_normalized in COLD_SHORT_PHRASES else ""
    )
    tsundere_hits = _contains_any(normalized, TSUNDERE_PATTERNS)
    care_hits = _contains_any(normalized, CARE_PATTERNS)
    gentle_hits = _contains_any(normalized, GENTLE_PATTERNS)
    thinking_hits = _contains_any(normalized, THINKING_PATTERNS)
    thinking_action_hits = _contains_any(normalized, THINKING_ACTION_PATTERNS)
    technical_context_hits = _contains_any(normalized, TECHNICAL_CONTEXT_PATTERNS)
    technical_strong_context_hits = _contains_any(
        normalized, TECHNICAL_STRONG_CONTEXT_PATTERNS
    )
    surprised_hits = _contains_any(normalized, SURPRISED_PATTERNS)
    embarrassed_hits = _contains_any(normalized, EMBARRASSED_PATTERNS)
    embarrassed_context_hits = _contains_any(normalized, EMBARRASSED_CONTEXT_PATTERNS)
    informational_hits = _contains_any(normalized, INFORMATIONAL_PATTERNS)
    affectionate_hits = _contains_any(normalized, AFFECTIONATE_PATTERNS)

    for hit in strong_sleep_hits:
        add("sleepy", 3.5, "sleepy.strong_keyword", hit)
    for hit in sleep_hits:
        add("sleepy", 2.0, "sleepy.keyword", hit)
    for hit in sleep_action_hits:
        add("sleepy", 1.25, "sleepy.action", hit)

    if "困就" in normalized or "困的话" in normalized:
        add("sleepy", 2.1, "sleepy.offer_rest", "困就/困的话")
    if "晚安" in normalized and _is_short(normalized, 10):
        add("sleepy", 1.6, "sleepy.short_goodnight", "晚安")

    for hit in cold_hits:
        add("cold", 2.65, "cold.keyword", hit)
    if cold_short_hit:
        add("cold", 2.4, "cold.short_phrase", cold_short_hit)
    if normalized.endswith(".") and _is_short(normalized, 8) and cold_short_hit:
        add("cold", 0.6, "cold.curt_period", normalized)
    if cold_focus_short_hit and focus_normalized != normalized:
        add("cold", 0.9, "cold.focus_short_phrase", cold_focus_short_hit)

    for hit in annoyed_hits:
        add("annoyed", 2.6, "annoyed.keyword", hit)
    for hit in annoyed_focus_hits:
        add("annoyed", 1.2, "annoyed.focus_keyword", hit)
    if annoyed_context_hits and annoyed_hits:
        add("annoyed", 0.8, "annoyed.context", annoyed_context_hits[0])
    if "危险" in focus_normalized and any(token in normalized for token in ("你", "这句话", "现在")):
        add("annoyed", 1.2, "annoyed.danger_tease", "危险 + 你/这句话/现在")
    if "会闹" in focus_normalized or "真会闹" in focus_normalized:
        add("annoyed", 1.0, "annoyed.teasing_pushback", "会闹/真会闹")
    if "又来" in focus_normalized and any(
        token in normalized for token in ("别闹", "折腾", "惹我", "得寸进尺", "太过分")
    ):
        add("annoyed", 1.8, "annoyed.repeat_pushback", "又来 + 强拒绝")

    for hit in tsundere_hits:
        add("cold_soft", 3.8, "cold_soft.tsundere", hit)
        add("cold", 0.8, "cold.tsundere_surface", hit)

    for hit in care_hits:
        add("cold_soft", 1.5, "cold_soft.care", hit)
        add("gentle", 0.9, "gentle.care", hit)
        if hit in {"早点睡", "早点休息"}:
            add("sleepy", 1.2, "sleepy.sleep_advice", hit)

    for hit in gentle_hits:
        add("gentle", 2.7, "gentle.keyword", hit)
    if ("我在" in normalized or "陪你" in normalized) and ("别担心" in normalized or "没关系" in normalized):
        add("gentle", 1.8, "gentle.support_combo", "我在/陪你 + 安慰")
    if "陪着你" in normalized or "一直在" in normalized:
        add("gentle", 1.2, "gentle.presence_phrase", "陪着你/一直在")

    for hit in thinking_hits:
        add("thinking", 2.65, "thinking.keyword", hit)
    for hit in thinking_action_hits:
        add("thinking", 1.15, "thinking.action", hit)
    if technical_strong_context_hits and thinking_action_hits:
        add("thinking", 1.9, "thinking.tech_check_combo", technical_strong_context_hits[0])
    elif len(technical_strong_context_hits) >= 2:
        add(
            "thinking",
            1.45,
            "thinking.tech_context_cluster",
            technical_strong_context_hits[0],
        )
    uncertainty_hits = sum(1 for word in ("也许", "可能", "大概", "或许") if word in normalized)
    if uncertainty_hits >= 2:
        add("thinking", 1.5, "thinking.multi_uncertainty", f"count={uncertainty_hits}")
    if any(word in normalized for word in ("确认", "查一下", "先看看")) and _count_punctuation(normalized, "?!") == 0:
        add("thinking", 1.1, "thinking.checking", "确认/查一下/先看看")
    if normalized.startswith("先把") and (
        technical_strong_context_hits or len(technical_context_hits) >= 2
    ) and any(
        token in normalized for token in ("贴给我", "贴过来", "发我", "给我看")
    ):
        add("thinking", 1.5, "thinking.request_context", "先把 + 技术上下文")

    question_count = _count_punctuation(normalized, "?")
    exclaim_count = _count_punctuation(normalized, "!")
    for hit in surprised_hits:
        if hit in {"什么", "啊", "诶", "欸"} and not _is_short(normalized, 10):
            add("surprised", 0.6, "surprised.light_interjection", hit)
        else:
            add("surprised", 1.9, "surprised.keyword", hit)
    if "什么" in normalized and exclaim_count:
        add("surprised", 1.9, "surprised.what_exclaim", "什么 + !")
    if "突然" in normalized and exclaim_count:
        add("surprised", 0.8, "surprised.sudden_exclaim", "突然 + !")
    if question_count and exclaim_count:
        add("surprised", 2.2, "surprised.mixed_punctuation", "?!")
    elif question_count >= 2:
        add("surprised", 1.4, "surprised.double_question", "??")
    elif question_count == 1 and _is_short(normalized, 9):
        add("surprised", 0.8, "surprised.short_question", "?")

    for hit in embarrassed_hits:
        add("embarrassed", 2.8, "embarrassed.keyword", hit)
    if "…" in normalized or "..." in str(text or "") or "……" in str(text or ""):
        add("embarrassed", 0.45, "embarrassed.ellipsis_surface", "…")
        if embarrassed_context_hits:
            add("embarrassed", 0.95, "embarrassed.ellipsis_context", embarrassed_context_hits[0])
    if any(token in normalized for token in ("夸我", "夸这种", "挑时候夸")):
        add("embarrassed", 1.8, "embarrassed.praise_deflection", "夸我/挑时候夸")
    if "别" in normalized and any(token in normalized for token in ("戳", "看", "靠太近", "碰")):
        add("embarrassed", 1.5, "embarrassed.defensive_phrase", "别 + 戳/看/靠近/碰")
    if any(token in normalized for token in ("脸红", "靠太近", "离这么近")):
        add("embarrassed", 1.4, "embarrassed.proximity", "脸红/靠太近")
    if affectionate_hits and any(token in normalized for token in ("又来这一套", "别总", "笨蛋")):
        add("embarrassed", 2.1, "embarrassed.affection_tease", "亲昵 + 口是心非")

    if informational_hits and not any(
        (
            strong_sleep_hits,
            cold_hits,
            tsundere_hits,
            gentle_hits,
            thinking_hits,
            surprised_hits,
            embarrassed_hits,
        )
    ):
        add("neutral", 0.8, "neutral.information", informational_hits[0])

    max_non_neutral_score = max(
        (value for emotion, value in scores.items() if emotion != "neutral"),
        default=0.0,
    )
    if len(normalized) >= 12 and question_count == 0 and exclaim_count == 0 and max_non_neutral_score < 1.3:
        add("neutral", 0.45, "neutral.long_plain_statement", f"len={len(normalized)}")

    if scores["cold"] >= 2.0 and (scores["cold_soft"] >= 1.3 or care_hits):
        add("cold_soft", 3.2, "conflict.cold_plus_care", "cold + care")
        add("cold", -0.65, "conflict.cold_soft_demotion", "cold softened by care")

    if scores["gentle"] >= 3.0:
        add("cold", -0.8, "conflict.gentle_blocks_cold", "gentle strong")
        add("cold_soft", -0.2, "conflict.gentle_blocks_cold_soft", "gentle strong")

    if scores["sleepy"] >= 3.5 and scores["cold_soft"] < 4.2:
        add("thinking", -0.4, "conflict.sleepy_blocks_thinking", "sleepy priority")
        add("surprised", -0.5, "conflict.sleepy_blocks_surprised", "sleepy priority")

    if scores["embarrassed"] >= 2.8:
        add("surprised", -0.5, "conflict.embarrassed_blocks_surprised", "bashful not surprise")

    if scores["thinking"] >= 2.8 and question_count == 0:
        add("surprised", -0.6, "conflict.thinking_blocks_surprised", "uncertainty sentence")

    if scores["annoyed"] >= 2.8:
        add("embarrassed", -0.8, "conflict.annoyed_blocks_embarrassed", "annoyed stronger")
        add("gentle", -0.5, "conflict.annoyed_blocks_gentle", "annoyed stronger")
        add("cold_soft", -0.4, "conflict.annoyed_blocks_cold_soft", "annoyed stronger")

    if scores["embarrassed"] >= 3.4 and "危险" not in focus_normalized:
        add("annoyed", -0.7, "conflict.embarrassed_blocks_annoyed", "bashful stronger")

    if scores["embarrassed"] >= 3.2 and affectionate_hits and "危险" not in focus_normalized:
        add("annoyed", -1.4, "conflict.affection_blocks_annoyed", "affection stronger than pushback")

    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    top_emotion, top_score = ranked[0]

    if top_emotion == "neutral" and top_score < min_score:
        selected = "neutral"
    elif top_score < min_score:
        selected = selected_default if selected_default != "error" else "neutral"
        if selected != "neutral":
            selected = "neutral"
    else:
        selected = top_emotion

    return {
        "selected": selected,
        "score_table": _brief_score_table(scores),
        "matched_rules": [match.to_dict() for match in matches],
        "normalized_text": normalized,
        "threshold": float(min_score),
        "source": source,
    }


def detect_emotion(
    text: str,
    source: str | None = None,
    *,
    min_score: float = DEFAULT_MIN_SCORE,
    default_emotion: str = "neutral",
) -> str:
    explanation = explain_emotion(
        text,
        source=source,
        min_score=min_score,
        default_emotion=default_emotion,
    )
    return str(explanation["selected"])


def normalize_default_emotion(value: str) -> str:
    emotion = str(value or "neutral").strip()
    if emotion in ALLOWED_EMOTIONS:
        return emotion
    return "neutral"


SELF_TEST_CASES = (
    EmotionTestCase("随便你。", "cold"),
    EmotionTestCase("随便你，但别太晚。", "cold_soft"),
    EmotionTestCase("我才不是担心你，早点睡。", "cold_soft"),
    EmotionTestCase("没关系，我在。", "gentle"),
    EmotionTestCase("困就靠过来。", "sleepy"),
    EmotionTestCase("那就别熬。", "sleepy"),
    EmotionTestCase("……别戳。", "embarrassed"),
    EmotionTestCase("你靠太近了。", "embarrassed"),
    EmotionTestCase("真的假的？！", "surprised"),
    EmotionTestCase("我想想，也许还需要确认。", "thinking"),
    EmotionTestCase("……你这句话，听起来很危险。", "annoyed"),
    EmotionTestCase("……你还真会闹。", "annoyed"),
    EmotionTestCase("（我把视线移开）……你倒是会挑时候夸我。", "embarrassed"),
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
