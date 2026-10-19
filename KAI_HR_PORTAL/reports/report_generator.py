import io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm, inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image, Flowable, CondPageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus.flowables import Flowable

from logging_config.logger import logger
 
 
# ── Debug switch ──────────────────────────────────────────────────────────────
# Set to False in production to silence all verification prints.
DEBUG = False
 
 
def dbg(*args):
    if DEBUG:
        logger.info(*args)

# ── Palette ───────────────────────────────────────────────────────────────────
C_BRAND   = colors.HexColor("#1E3A5F")
C_ACCENT  = colors.HexColor("#2E86AB")
C_SUCCESS = colors.HexColor("#27AE60")
C_WARN    = colors.HexColor("#F39C12")
C_DANGER  = colors.HexColor("#E74C3C")
C_BG      = colors.HexColor("#F4F7FA")
C_BORDER  = colors.HexColor("#D6E4EF")
C_DARK    = colors.HexColor("#1A1A2E")
C_MID     = colors.HexColor("#4A5568")
C_LIGHT   = colors.HexColor("#94A3B8")
C_WHITE   = colors.white

W, H = A4
MARGIN    = 14 * mm
CONTENT_W = W - 2 * MARGIN


# ── Page header ───────────────────────────────────────────────────────────────
def draw_page_header(canvas, doc):
    canvas.saveState()

    canvas.setFont("Helvetica-Bold", 11)
    canvas.setFillColor(C_BRAND)
    canvas.drawString(MARGIN, H - 25, "KAI - KUMARAN AI")

    logo_path = "kumaran-logo.png"  # change path if needed
    logo_width = 75
    logo_height = 22

    try:
        canvas.drawImage(
            logo_path,
            W - logo_width,
            H - 30,
            width=logo_width,
            height=logo_height,
            preserveAspectRatio=True,
            mask='auto'
        )
    except Exception:
        pass

    canvas.setStrokeColor(C_BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, H - 32, W - MARGIN, H - 32)

    canvas.restoreState()


def ps(name, **kw):
    return ParagraphStyle(name, **kw)


# ── Custom Flowables ──────────────────────────────────────────────────────────
class MiniBar(Flowable):
    """Plain 0-100 bar: fill = score / 100 of the track."""

    def __init__(self, score, color, width=110, height=7):
        super().__init__()
        self.score, self.color = score, color
        self.width, self.height = width, height

    def draw(self):
        y = (self.height - 5) / 2.0          # centre the 5pt track in the box
        self.canv.setFillColor(colors.HexColor("#E2ECF5"))
        self.canv.roundRect(0, y, self.width, 5, 2, fill=1, stroke=0)
        self.canv.setFillColor(self.color)
        self.canv.roundRect(0, y, max(self.width * self.score / 100, 5), 5, 2, fill=1, stroke=0)


class WeightBar(Flowable):
    """Breakdown bar drawn on a shared 0-100 scale.

    Full track  = 100 points, identical on every row so rows are comparable.
    Pale block  = this category's weight, i.e. the most it could earn.
    Solid block = points actually earned, clamped inside the pale block.
    """

    def __init__(self, points, weight, color, width=130, height=7):
        super().__init__()
        self.points, self.weight, self.color = points, weight, color
        self.width, self.height = width, height

    def draw(self):
        scale = self.width / 100.0

        self.canv.setFillColor(colors.HexColor("#EDF3F9"))
        self.canv.roundRect(0, 1, self.width, 5, 2, fill=1, stroke=0)

        cap = max(self.weight * scale, 2)
        self.canv.setFillColor(colors.HexColor("#CFE0EF"))
        self.canv.roundRect(0, 1, cap, 5, 2, fill=1, stroke=0)

        earned = max(min(self.points, self.weight) * scale, 1.5)
        self.canv.setFillColor(self.color)
        self.canv.roundRect(0, 1, earned, 5, 2, fill=1, stroke=0)


class Pill(Flowable):
    def __init__(self, text, bg, fg=C_WHITE, w=58, h=13):
        super().__init__()
        self.text, self.bg, self.fg = text, bg, fg
        self.width, self.height = w, h

    def draw(self):
        self.canv.setFillColor(self.bg)
        self.canv.roundRect(0, 0, self.width, self.height, self.height / 2, fill=1, stroke=0)
        self.canv.setFillColor(self.fg)
        self.canv.setFont("Helvetica-Bold", 7)
        self.canv.drawCentredString(self.width / 2, 3, self.text)


class ScoreCircle(Flowable):
    def __init__(self, score, size=52):
        super().__init__()
        self.score, self.size = score, size
        self.width = self.height = size

    def draw(self):
        cx = cy = self.size / 2
        r = self.size / 2 - 4
        if r <= 0:
            return
        self.canv.setStrokeColor(colors.HexColor("#DDE9F5"))
        self.canv.setLineWidth(5)
        self.canv.circle(cx, cy, r, fill=0, stroke=1)
        self.canv.setStrokeColor(score_color(self.score))
        self.canv.setLineWidth(5)
        deg = 3.6 * self.score
        if deg > 0:
            self.canv.arc(cx - r, cy - r, cx + r, cy + r, 90, -deg)
        self.canv.setFillColor(C_WHITE)
        self.canv.setFont("Helvetica-Bold", 14)
        self.canv.drawCentredString(cx, cy - 5, str(self.score))
        self.canv.setFont("Helvetica", 6)
        self.canv.setFillColor(C_LIGHT)
        self.canv.drawCentredString(cx, cy - 14, "/ 100")


# ── Helpers ───────────────────────────────────────────────────────────────────
_EMPTYISH = {"", "—", "-", "unknown", "none", "null", "n/a", "na", "not specified"}


def safe_str(value, fallback="—"):
    """Coerce any value (including None) to a non-empty string."""
    if value is None:
        return fallback
    s = str(value).strip()
    return s if s else fallback


def safe_int(value, fallback=0):
    """Tolerant int: handles None, '', '40', '40%', 40.0, '0.4'."""
    try:
        if value is None:
            return fallback
        if isinstance(value, str):
            value = value.strip().replace('%', '')
            if not value:
                return fallback
        return int(round(float(value)))
    except (TypeError, ValueError):
        return fallback


def safe_float(value, fallback=0.0):
    try:
        return float(value) if value is not None else fallback
    except (TypeError, ValueError):
        return fallback


def safe_list(value):
    """Return value if it's a non-None list, else []."""
    return value if isinstance(value, list) else []


def safe_dict(value):
    """Return value if it's a non-None dict, else {}."""
    return value if isinstance(value, dict) else {}


def is_blank(value):
    return safe_str(value, "").lower() in _EMPTYISH


def score_color(s):
    s = safe_int(s, 0)
    return C_SUCCESS if s >= 75 else (C_WARN if s >= 50 else C_DANGER)


def tier_color(tier):
    t = safe_str(tier, "").lower()
    if "highly" in t:    return C_SUCCESS
    if "recommend" in t: return C_ACCENT
    if "moderate" in t:  return C_WARN
    return C_DANGER


def status_color(s):
    return C_SUCCESS if s == "Met" else (C_WARN if s == "Partial" else C_DANGER)


def cell(text, style):
    """Always produces a valid Paragraph, even for None inputs."""
    return Paragraph(safe_str(text), style)


# ── Field lookup: the blob does not always use the same key names ─────────────
_CANDIDATE_KEYS = ("candidate_name", "candidate", "name", "applicant_name", "full_name")
_COMPANY_KEYS   = ("company_name", "company", "organization", "organisation",
                   "employer", "client", "hiring_company", "job_company", "client_name")
_ROLE_KEYS      = ("job_title", "role", "position", "jd_title", "title")


def deep_find(obj, keys, depth=0):
    """Walk the whole blob for any of `keys`. The company is not always in meta."""
    if depth > 6:
        return None
    if isinstance(obj, dict):
        for k in keys:
            if not is_blank(obj.get(k)):
                return safe_str(obj[k])
        for v in obj.values():
            hit = deep_find(v, keys, depth + 1)
            if hit:
                return hit
    elif isinstance(obj, list):
        for v in obj:
            hit = deep_find(v, keys, depth + 1)
            if hit:
                return hit
    return None


def current_employer(data):
    """The candidate's employer, taken from the proof entries.

    Even when meta.company is null, the company name is present inside
    skill_comparison -> candidate_has -> proof[] as {"type": "work_experience",
    "name": "Xoriant solutions Pvt Ltd", ...}. The first work_experience proof
    is the most recent role the matcher cited.
    """
    for tier in safe_dict(data.get("skill_comparison")).values():
        for bucket in ("matched", "partial", "not_found"):
            for sk in safe_list(safe_dict(tier).get(bucket)):
                ch = safe_dict(safe_dict(sk).get("candidate_has"))
                for pr in safe_list(ch.get("proof")):
                    pr = safe_dict(pr)
                    if pr.get("type") == "work_experience" and not is_blank(pr.get("name")):
                        return safe_str(pr["name"])
    return None


def pick(meta, keys, data=None, fallback="—"):
    """First non-blank value across the meta dict and a few nested holders."""
    holders = [safe_dict(meta)]
    if data is not None:
        holders += [
            safe_dict(safe_dict(meta).get("job")),
            safe_dict(safe_dict(meta).get("jd")),
            safe_dict(data.get("job_description")),
            safe_dict(data.get("jd")),
        ]
    for holder in holders:
        for k in keys:
            v = holder.get(k)
            if not is_blank(v):
                return safe_str(v)
    if data is not None:
        hit = deep_find(data, keys)
        if hit:
            return hit
    return fallback


# ── Weighted scoring: single source of truth ──────────────────────────────────
def _apportion(exact, target):
    """Round float points to ints that sum EXACTLY to `target`.

    Rounding each row on its own lets the column disagree with the total.
    Largest-remainder apportionment hands each spare point to the row that
    earned most of it, so the rows always add up to the number on top.
    """
    floors = [int(p) for p in exact]
    short = target - sum(floors)
    if short <= 0:
        return floors
    order = sorted(range(len(exact)), key=lambda i: exact[i] - floors[i], reverse=True)
    for i in order[:short]:
        floors[i] += 1
    return floors


def weighted_rows(data, debug=False):
    """Returns ([(label, raw_pct, weight, points)], total, weight_total).

    points = raw_pct * weight / 100, rounded to whole numbers that sum
    exactly to `total`. Every value returned is an int.
    """
    breakdown = safe_list(safe_dict(data.get("scorecard")).get("breakdown"))
    base, exact = [], []

    for item in breakdown:
        item = safe_dict(item)
        lbl = safe_str(item.get("label"), "—")
        raw = safe_int(item.get("score"), 0)
        wt  = safe_int(item.get("weight"), 0)
        base.append((lbl, raw, wt))
        exact.append(raw * wt / 100.0)

    # The API rounds ONCE, from unrounded tier scores. This function only ever
    # sees the already-rounded "46%" strings, so re-deriving the total here
    # rounds twice and can land a point low (48 vs 49). Take the API's total as
    # authoritative and apportion the rows to it, so rows and circle agree.
    claimed = safe_int(safe_dict(data.get("scorecard")).get("total_score"), -1)
    total = claimed if claimed >= 0 else int(round(sum(exact)))
    wsum  = sum(wt for _, _, wt in base)
    pts_i = _apportion(exact, total)
    rows  = [(lbl, raw, wt, p) for (lbl, raw, wt), p in zip(base, pts_i)]

    if debug and DEBUG:
        logger.info("─" * 60)
        logger.info(f"{'CATEGORY':<20}{'SCORE':>7}{'WEIGHT':>8}{'POINTS':>10}")
        logger.info("─" * 60)
        for lbl, raw, wt, pts in rows:
            logger.info(f"{lbl:<20}{raw:>6}%{wt:>7}%{pts:>8}")
        logger.info("─" * 60)
        logger.info(f"{'TOTAL':<20}{'':>7}{wsum:>7}%{total:>8}")
        logger.info(f"rows add up to {sum(pts_i)} (must equal {total})")
        logger.info(f"claimed total_score = {safe_dict(data.get('scorecard')).get('total_score')}")
        logger.info(f"rows found = {len(rows)} (expecting 5)")
        if wsum != 100:
            logger.info(f"!! weights sum to {wsum}, not 100 — check the scoring service")
        if any(w == 0 for _, _, w, _ in rows):
            logger.info("!! a weight parsed as 0 — that category contributes nothing")
        logger.info("─" * 60)

    return rows, total, wsum



# ── Which total the report shows ──────────────────────────────────────────────
# "derived" -> the circle shows the sum of the five weighted rows. Everything
#              on the page agrees and no row can exceed its own weight.
# "blob"    -> the circle shows scorecard.total_score as the API returned it.
#              Use only if you accept that the rows will not add up to it.
TOTAL_SOURCE = "derived"


def breakdown_rows(data):
    """[(label, raw, weight, points)] plus the total they add up to.

    points = raw * weight / 100, apportioned to whole numbers. A row can never
    exceed its own weight, and the five points always sum to the returned total.
    """
    rows, derived, _wsum = weighted_rows(data)
    if not rows:
        return [], 0

    claimed = safe_int(safe_dict(data.get("scorecard")).get("total_score"), derived)
    if claimed != derived:
        dbg(f"[BREAKDOWN] scorecard.total_score={claimed} but the five weighted "
            f"rows sum to {derived}. The rows are correct; the total is not.")

    return rows, derived


_TIER_ALIASES = {
    "mandatory":      ("mandatory",),
    "preferred":      ("preferred",),
    "better_to_have": ("better",),
    "experience":     ("experience",),
    "education":      ("education", "cert"),
}


def tier_points(data, key):
    """(raw, weight, points) for a breakdown category, or None if absent."""
    needles = _TIER_ALIASES.get(key, (key.replace("_", " "),))
    for lbl, raw, wt, pts in weighted_rows(data)[0]:
        low = lbl.lower()
        if any(n in low for n in needles):
            return raw, wt, pts
    return None


def tier_mean(tier):
    """Average match_score across every skill listed in a tier, as a percent."""
    marks = []
    for bucket in ("matched", "partial", "not_found"):
        for sk in safe_list(safe_dict(tier).get(bucket)):
            if isinstance(sk, dict):
                marks.append(safe_int(safe_float(sk.get("match_score"), 0.0) * 100))
    return (round(sum(marks) / len(marks)) if marks else 0), len(marks)


def reconcile(data):
    """Print every headline number and the thing that should agree with it."""
    if not DEBUG:
        return
    weighted_rows(data, debug=True)

    logger.info("CROSS-CHECK — each section against the breakdown row it feeds")
    logger.info("─" * 60)

    skill_cmp = safe_dict(data.get("skill_comparison"))
    for key, label in (("mandatory", "Mandatory"),
                       ("preferred", "Preferred"),
                       ("better_to_have", "Better to Have")):
        tier = safe_dict(skill_cmp.get(key))
        if not tier:
            continue
        claimed = safe_int(tier.get("tier_score"), 0)
        mean, n = tier_mean(tier)
        tp = tier_points(data, key)
        bd = tp[0] if tp else None
        notes = []
        if bd is not None and bd != claimed:
            notes.append(f"breakdown says {bd}%")
        if mean != claimed:
            notes.append(f"mean of {n} skills is {mean}%")
        tail = ("  <-- " + "; ".join(notes)) if notes else ""
        logger.info(f"{label:<16} tier_score={claimed:>3}%{tail}")

    for key, section in (("experience", "experience_comparison"),
                         ("education",  "education_comparison")):
        sec = safe_dict(data.get(section))
        if not sec:
            continue
        own = safe_int(sec.get("score"), 0)
        tp = tier_points(data, key)
        bd = tp[0] if tp else None
        tail = f"  <-- breakdown says {bd}%" if (bd is not None and bd != own) else ""
        logger.info(f"{section:<26} score={own:>3}%{tail}")

    meta = safe_dict(data.get("meta"))
    logger.info(f"meta keys available: {sorted(meta.keys())}")
    logger.info("─" * 60)


# ── Shared styles ─────────────────────────────────────────────────────────────
SLABEL  = ps("sl",  fontSize=7, textColor=C_LIGHT, fontName="Helvetica-Bold")
SVAL    = ps("sv",  fontSize=8, textColor=C_DARK,  fontName="Helvetica")
SVAL_B  = ps("svb", fontSize=8, textColor=C_DARK,  fontName="Helvetica-Bold")
SPROOF  = ps("sp",  fontSize=7, textColor=C_MID,   fontName="Helvetica", leftIndent=4)
SIQ     = ps("siq", fontSize=7, textColor=colors.HexColor("#5B6EBF"), fontName="Helvetica-Oblique", leftIndent=4)
SSEC    = ps("ssec",fontSize=8, textColor=C_ACCENT, fontName="Helvetica-Bold", spaceAfter=2, spaceBefore=5)
SCAP    = ps("scap",fontSize=6, textColor=C_LIGHT,  fontName="Helvetica-Oblique", spaceAfter=3)
SFOOTER = ps("sf",  fontSize=6, textColor=C_LIGHT,  fontName="Helvetica", alignment=TA_CENTER)

SKILL_COLS = [104, 212, 40, 88, 72]   # = CONTENT_W: tier bar spans full width
MATCH_H    = 11                        # Match cell and Status pill share one height

BASE_TS = [
    ("TOPPADDING",    (0, 0), (-1, -1), 3),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ("LEFTPADDING",   (0, 0), (-1, -1), 5),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
    ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
]


# ── Header ────────────────────────────────────────────────────────────────────
def build_header(data):
    meta = safe_dict(data.get("meta"))
    sc   = safe_dict(data.get("scorecard"))

    name    = pick(meta, _CANDIDATE_KEYS, data)
    role    = pick(meta, _ROLE_KEYS,      data)
    company = pick(meta, _COMPANY_KEYS,   data)

    if company == "—":
        # meta.company is null when neither the JD nor the matcher filled it;
        # fall back to the employer named in the skill proof entries.
        company = current_employer(data) or "—"
        dbg(f"[META] company from proof entries: {company}")

    # The circle shows scorecard.total_score, the same number the
    # /api/assess/jd-fit-multiple response returns, so the PDF and the API can
    # never disagree. safe_int strips the "%" the scoring service sends.
    # Falls back to the weighted sum of the breakdown only if it is missing.
    _rows, _derived = breakdown_rows(data)
    total = (safe_int(sc.get("total_score"), _derived)
             if TOTAL_SOURCE == "blob" else _derived)

    tier      = safe_str(sc.get("tier"),      "N/A")
    one_liner = safe_str(sc.get("one_liner"), "")

    HWHT  = ps("hwht", fontSize=7,  textColor=colors.HexColor("#7FB3D3"), fontName="Helvetica-Bold")
    HWVAL = ps("hwval",fontSize=8,  textColor=colors.HexColor("#7FB0D6"), fontName="Helvetica")
    HWSUB = ps("hwsub",fontSize=8,  textColor=colors.HexColor("#7FB0D6"), fontName="Helvetica")

    info_data = [
        [cell("CANDIDATE",  HWHT),  cell(name,    HWVAL)],
        [cell("ROLE (JD)",  HWHT),  cell(role,    HWSUB)],
        [cell("COMPANY",    HWHT),  cell(company, HWSUB)],
    ]
    info_t = Table(info_data, colWidths=[56, 190])
    info_t.setStyle(TableStyle([
        ("TOPPADDING",    (0,0),(-1,-1), 2),
        ("BOTTOMPADDING", (0,0),(-1,-1), 2),
        ("LEFTPADDING",   (0,0),(-1,-1), 0),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))

    score_circle = ScoreCircle(total, size=54)
    tier_pill    = Pill(tier, tier_color(tier), w=105, h=14)
    ol_style     = ps("hol", fontSize=7, textColor=colors.HexColor("#A8C8E0"),
                      fontName="Helvetica-Oblique", alignment=TA_CENTER)

    score_right = Table([
        [tier_pill],
        [cell(one_liner, ol_style)],
    ], colWidths=[110])
    score_right.setStyle(TableStyle([
        ("TOPPADDING",    (0,0),(-1,-1), 2),
        ("BOTTOMPADDING", (0,0),(-1,-1), 2),
        ("LEFTPADDING",   (0,0),(-1,-1), 4),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))

    score_block = Table([[score_circle, score_right]], colWidths=[60, 115])
    score_block.setStyle(TableStyle([
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0),(-1,-1), 0),
        ("BOTTOMPADDING", (0,0),(-1,-1), 0),
        ("LEFTPADDING",   (0,0),(-1,-1), 4),
    ]))

    outer = Table([[info_t, score_block]], colWidths=[256, 180])
    outer.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), C_BRAND),
        ("TOPPADDING",    (0,0),(-1,-1), 12),
        ("BOTTOMPADDING", (0,0),(-1,-1), 12),
        ("LEFTPADDING",   (0,0),(0,-1),  14),
        ("RIGHTPADDING",  (-1,0),(-1,-1),14),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("LINEAFTER",     (0,0),(0,-1),  0.5, colors.HexColor("#2E5A8A")),
    ]))
    return outer


# ── Score Breakdown ───────────────────────────────────────────────────────────
def build_breakdown(data):
    """Five rows, each showing the points it contributed to the circle."""
    src, headline = breakdown_rows(data)
    if not src:
        return []

    HDR = ps("bh", fontSize=6, textColor=C_LIGHT, fontName="Helvetica-Bold", alignment=TA_RIGHT)
    rows = [[cell("Category", ps("bh0", fontSize=6, textColor=C_LIGHT, fontName="Helvetica-Bold")),
             "", cell("Score", HDR), cell("Weight", HDR)]]

    for lbl, raw, wt, pts in src:
        col = score_color(raw)
        if wt == 0:
            # The JD lists no skills for this tier, so its weight went to the
            # others. Showing "0% 0%" reads as a zero score, which it is not.
            rows.append([
                cell(lbl, ps("bl0", fontSize=7, textColor=C_LIGHT, fontName="Helvetica-Bold")),
                cell("Not required by this JD \u2014 weight redistributed",
                     ps("bn", fontSize=6, textColor=C_LIGHT, fontName="Helvetica-Oblique")),
                cell("\u2014", ps("bz",  fontSize=7, textColor=C_LIGHT, alignment=TA_RIGHT)),
                cell("\u2014", ps("bz2", fontSize=7, textColor=C_LIGHT, alignment=TA_RIGHT)),
            ])
            continue
        rows.append([
            cell(lbl, ps("bl", fontSize=7, textColor=C_BRAND, fontName="Helvetica-Bold")),
            WeightBar(pts, wt, col, width=140),
            cell(f"{pts}%", ps("bs", fontSize=7, textColor=col,
                 fontName="Helvetica-Bold", alignment=TA_RIGHT)),
            cell(f"{wt}%", ps("bw", fontSize=7, textColor=C_ACCENT,
                 fontName="Helvetica", alignment=TA_RIGHT)),
        ])

    t = Table(rows, colWidths=[118, 162, 40, 42])
    t.setStyle(TableStyle(BASE_TS + [
        ("BACKGROUND",     (0, 0), (-1, 0),  C_BG),
        ("LINEBELOW",      (0, 0), (-1, 0),  0.4, C_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, C_BG]),
        ("TOPPADDING",     (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 4),
    ]))

    return [Paragraph("SCORE BREAKDOWN", SSEC), t]


# ── Skills ────────────────────────────────────────────────────────────────────
def build_skills(data):
    dbg("Enter into build_skills")
    skill_cmp   = safe_dict(data.get("skill_comparison"))
    tier_order  = ["mandatory", "preferred", "better_to_have"]
    tier_labels = {
        "mandatory":     "MANDATORY SKILLS",
        "preferred":     "PREFERRED SKILLS",
        "better_to_have":"BETTER TO HAVE",
    }
    elements = [Paragraph("SKILL COMPARISON", SSEC)]
    running = 0  # cumulative points contributed by the three skill tiers

    for tk in tier_order:
        tier = safe_dict(skill_cmp.get(tk))
        # A tier with no skills still gets its header, as long as the breakdown
        # has a row for it — otherwise "Better to Have" vanishes from the report
        # while still counting for 10% of the score.
        if not tier and not tier_points(data, tk):
            continue

        ts_lbl   = safe_str(tier.get("tier_label"), "—")
        ts_score = safe_int(tier.get("tier_score"), 0)
        tc       = score_color(ts_score)

        tp = tier_points(data, tk)
        if tp:
            _raw, wt, pts = tp
            ts_score = pts          # show the points contributed, matching SCORE BREAKDOWN
            running += pts
            right = f"{ts_lbl}  \u00b7  {ts_score}%"
            dbg(f"[SKILLS] {tk:<15} score={ts_score:>3}%  wt={wt:>3}%  "
                f"pts={pts:>3}  running={running:>3}")
        else:
            right = f"{ts_lbl}  \u00b7  {ts_score}%"
            dbg(f"[SKILLS] {tk:<15} NOT FOUND in breakdown — showing raw {ts_score}%")

        CHL = ps("chl", fontSize=6, textColor=C_LIGHT, fontName="Helvetica-Bold")
        CHC = ps("chc", fontSize=6, textColor=C_LIGHT, fontName="Helvetica-Bold", alignment=TA_CENTER)

        # Tier header, column header and skill rows are ONE table. That way
        # reportlab can split it wherever it likes and simply reprint the two
        # header rows, instead of stranding them and leaving a blank strip.
        col_hdr_row = [
            [cell(tier_labels[tk], ps("th", fontSize=7, textColor=C_WHITE,
                  fontName="Helvetica-Bold")), "", "",
             cell(right, ps("ts", fontSize=7, textColor=C_WHITE,
                  fontName="Helvetica-Bold", alignment=TA_RIGHT)), ""],
            [cell("Skill", CHL), cell("Evidence", CHL), cell("Yrs", CHC),
             cell("Match", CHC), cell("Status", CHC)],
        ]

        rows = list(col_hdr_row)
        for match_type in ["matched", "partial", "not_found"]:
            badge_color = {"matched": C_SUCCESS, "partial": C_WARN, "not_found": C_DANGER}[match_type]

            for sk in safe_list(tier.get(match_type)):
                if not isinstance(sk, dict):
                    continue
                name     = safe_str(sk.get("skill"), "—")
                ch       = safe_dict(sk.get("candidate_has"))
                jd       = safe_dict(sk.get("jd_requires"))
                score    = safe_int(safe_float(sk.get("match_score"), 0.0) * 100)
                proofs   = [p for p in safe_list(ch.get("proof")) if isinstance(p, dict)]
                iq       = sk.get("interview_question") or sk.get("interview_q")
                verified = bool(ch.get("verified") or False)
                yrs_has  = safe_str(ch.get("years"), "—")
                yrs_req  = safe_str(jd.get("years"), "—")
                unv      = safe_str(ch.get("unverified_reason"), "")
                dbg(f"  skill: {name}, match: {score}%, verified: {verified}, "
                    f"yrs_has: {yrs_has}, yrs_req: {yrs_req}, proofs: {len(proofs)}")

                ev_lines = []
                for p in proofs[:2]:
                    p = safe_dict(p)
                    # New shape from verify_and_bucket: {"quote", "section"}.
                    quote = safe_str(p.get("quote"), "")
                    if not is_blank(quote):
                        sect = safe_str(p.get("section"), "").replace("_", " ").title()
                        head = "" if is_blank(sect) else f"<b>{sect}</b> — "
                        ev_lines.append(cell(f"&#8226; {head}{quote}", SPROOF))
                        continue
                    # Legacy shape: {"type", "name", "role", "context"}.
                    ptype = safe_str(p.get("type"), "").replace("_", " ").title()
                    bits  = [b for b in (safe_str(p.get("name"), ""), safe_str(p.get("context"), ""))
                             if not is_blank(b)]
                    if bits or not is_blank(ptype):
                        head = "" if is_blank(ptype) else f"<b>{ptype}</b> — "
                        ev_lines.append(cell(f"&#8226; {head}{' — '.join(bits)}", SPROOF))
                if not proofs and not is_blank(unv):
                    # plain "!" instead of a warning glyph: Helvetica has no
                    # such character and reportlab draws it as a black box.
                    ev_lines.append(cell(f"! {unv}",
                        ps("unv", fontSize=6, textColor=C_WARN,
                           fontName="Helvetica-Oblique", leftIndent=4)))
                if iq:
                    ev_lines.append(cell(f"Q: {safe_str(iq)}", SIQ))

                ev_inner = [[e] for e in ev_lines] if ev_lines else [[cell("—", SPROOF)]]
                ev_cell  = Table(ev_inner, colWidths=[SKILL_COLS[1] - 10])
                ev_cell.setStyle(TableStyle([
                    ("TOPPADDING",    (0,0),(-1,-1), 1),
                    ("BOTTOMPADDING", (0,0),(-1,-1), 1),
                    ("LEFTPADDING",   (0,0),(-1,-1), 0),
                ]))

                # One row, one height, zero padding: the Match cell and the
                # Status pill are both MATCH_H tall and both VALIGN MIDDLE, so
                # they land on the same centre line no matter how tall the row
                # grows when the Evidence column wraps.
                bar_w    = 46
                lbl_w    = SKILL_COLS[3] - 10 - bar_w      # fills the padded cell exactly
                bar      = MiniBar(score, badge_color, width=bar_w, height=MATCH_H)
                v_pill   = Pill("Verified" if verified else "Unverified",
                                C_SUCCESS if verified else C_WARN,
                                w=SKILL_COLS[4] - 10, h=MATCH_H)
                pct_cell = Table([[bar,
                                   cell(f"{score}%", ps("sc%", fontSize=6, textColor=badge_color,
                                        fontName="Helvetica-Bold", alignment=TA_CENTER))]],
                                 colWidths=[bar_w, lbl_w], rowHeights=[MATCH_H])
                pct_cell.setStyle(TableStyle([
                    ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
                    ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
                    ("LEFTPADDING",   (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
                    ("TOPPADDING",    (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]))

                rows.append([
                    cell(f"<b>{name}</b>", ps("skn", fontSize=8, textColor=C_DARK, fontName="Helvetica-Bold")),
                    ev_cell,
                    cell(f"{yrs_has}y<br/>{yrs_req}y req", ps("yr", fontSize=6, textColor=C_MID,
                         fontName="Helvetica", alignment=TA_CENTER)),
                    pct_cell,
                    v_pill,
                ])

        empty_tier = len(rows) == 2
        if empty_tier:
            rows.append([
                cell("No skills listed for this category",
                     ps("nsk", fontSize=7, textColor=C_LIGHT,
                        fontName="Helvetica-Oblique")), "", "", "", ""])

        if len(rows) > 2:
            # repeatRows=0: when a long tier spills onto the next page the
            # coloured tier bar must NOT be redrawn, or it reads as a second
            # section with the same name.
            skill_t = Table(rows, colWidths=SKILL_COLS, repeatRows=0)
            skill_t.setStyle(TableStyle(BASE_TS + [
                ("SPAN",           (0,0),(2,0)),
                ("SPAN",           (3,0),(4,0)),
                ("BACKGROUND",     (0,0),(-1,0),  tc),
                ("LEFTPADDING",    (0,0),(0,0),   7),
                ("RIGHTPADDING",   (3,0),(4,0),   7),
                ("TOPPADDING",     (0,0),(-1,0),  3),
                ("BOTTOMPADDING",  (0,0),(-1,0),  3),
                ("BACKGROUND",     (0,1),(-1,1),  C_BG),
                ("TOPPADDING",     (0,1),(-1,1),  2),
                ("BOTTOMPADDING",  (0,1),(-1,1),  2),
                ("LINEBELOW",      (0,1),(-1,1),  0.4, C_BORDER),
                ("ROWBACKGROUNDS", (0,2),(-1,-1), [C_WHITE, C_BG]),
                ("LINEBELOW",      (0,2),(-1,-1), 0.3, C_BORDER),
                ("TOPPADDING",     (0,2),(-1,-1), 5),
                ("BOTTOMPADDING",  (0,2),(-1,-1), 5),
            ] + ([("SPAN", (0,2), (-1,2))] if empty_tier else [])))
            elements.append(skill_t)

    dbg(f"[SKILLS] three tiers contribute {running} points")
    return elements


# ── Experience / Education / Certs ────────────────────────────────────────────
def build_meta_row(data):
    exp  = safe_dict(data.get("experience_comparison"))
    edu  = safe_dict(data.get("education_comparison"))
    cert = safe_dict(data.get("certification_comparison"))

    elements = [Paragraph("EXPERIENCE  ·  EDUCATION  ·  CERTIFICATIONS", SSEC)]
    rows = []

    MLAB = ps("ml", fontSize=7, textColor=C_BRAND, fontName="Helvetica-Bold")
    MVAL = ps("mv", fontSize=7, textColor=C_DARK,  fontName="Helvetica")
    MNOT = ps("mn", fontSize=6, textColor=C_LIGHT, fontName="Helvetica")

    exp_tp = tier_points(data, "experience")
    edu_tp = tier_points(data, "education")   # the "Education & Certs" row

    if exp:
        ch = safe_dict(exp.get("candidate_has"))
        jd = safe_dict(exp.get("jd_requires"))
        st = safe_str(exp.get("status"), "—")
        raw = safe_int(exp.get("score"), 0)
        leadership = "Yes" if jd.get("leadership") else "No"
        note = f"Required: {safe_str(jd.get('years'), '—')} yrs  |  Leadership: {leadership}"
        if exp_tp:
            note += f"  |  {exp_tp[2]} of {exp_tp[1]} pts"
        dbg(f"[META] experience      {raw}%" + (f"  -> {exp_tp[2]} of {exp_tp[1]} pts" if exp_tp else ""))
        rows.append([
            cell("Experience", MLAB),
            cell(f"{safe_str(ch.get('years'), '—')} yrs", MVAL),
            cell(note, MNOT),
            Pill(st, status_color(st), w=42, h=11),
            cell(f"{raw}%", ps("esc", fontSize=7, textColor=score_color(raw),
                 fontName="Helvetica-Bold", alignment=TA_RIGHT)),
        ])

    if edu:
        st  = safe_str(edu.get("status"), "—")
        raw = safe_int(edu.get("score"), 0)
        note = f"Req: {safe_str(edu.get('jd_requires'), '—')}"
        if edu_tp:
            note += f"  |  {edu_tp[2]} of {edu_tp[1]} pts (shared with certifications)"
        dbg(f"[META] education&certs {raw}%" + (f"  -> {edu_tp[2]} of {edu_tp[1]} pts" if edu_tp else ""))
        rows.append([
            cell("Education", MLAB),
            cell(safe_str(edu.get("candidate_has"), "—"), MVAL),
            cell(note, MNOT),
            Pill(st, status_color(st), w=42, h=11),
            cell(f"{raw}%", ps("edsc", fontSize=7, textColor=score_color(raw),
                 fontName="Helvetica-Bold", alignment=TA_RIGHT)),
        ])

    if cert:
        st  = safe_str(cert.get("status"), "—")
        has = safe_list(cert.get("candidate_has"))
        req = safe_list(cert.get("jd_requires"))
        raw = safe_int(cert.get("score"), 0)
        # Certifications share the Education & Certs weight, already counted on
        # the Education row — never add points here or the total double-counts.
        dbg(f"[META] certifications  {raw}% (weight shared with education, not added)")
        rows.append([
            cell("Certifications", MLAB),
            cell(", ".join(safe_str(c) for c in has) if has else "None listed", MVAL),
            cell(f"Req: {', '.join(safe_str(r) for r in req) if req else 'None'}", MNOT),
            Pill(st, status_color(st), w=42, h=11),
            cell(f"{raw}%", ps("csc", fontSize=7, textColor=score_color(raw),
                 fontName="Helvetica-Bold", alignment=TA_RIGHT)),
        ])

    if rows:
        t = Table(rows, colWidths=[72, 150, 155, 48, 30])
        t.setStyle(TableStyle(BASE_TS + [
            ("ROWBACKGROUNDS", (0,0),(-1,-1), [C_WHITE, C_BG]),
            ("LINEBELOW",      (0,0),(-1,-1), 0.3, C_BORDER),
            ("TOPPADDING",     (0,0),(-1,-1), 5),
            ("BOTTOMPADDING",  (0,0),(-1,-1), 5),
        ]))
        elements.append(t)

    return elements


# ── Flags ─────────────────────────────────────────────────────────────────────
def build_flags(data):
    flags = safe_list(data.get("flags"))
    if not flags:
        return []
    elements = [Paragraph("FLAGS", SSEC)]
    for f in flags:
        f = safe_dict(f)
        sev = safe_str(f.get("severity"), "minor").lower()
        bg  = {"critical": C_DANGER, "moderate": C_WARN, "minor": C_ACCENT}.get(sev, C_ACCENT)
        t = Table([[Pill(sev.upper(), bg, w=52, h=11),
                    cell(f.get("message", ""), SVAL)]], colWidths=[58, 390])
        t.setStyle(TableStyle(BASE_TS))
        elements.append(t)
    return elements


# ── Footer ────────────────────────────────────────────────────────────────────
def build_footer(data):
    gen = safe_str(data.get("generated_at"), "—")
    ver = safe_str(data.get("version"),      "—")
    rid = safe_str(data.get("request_id"),   "—")
    return [
        Spacer(1, 6),
        HRFlowable(width="100%", thickness=0.4, color=C_BORDER),
        Paragraph(f"Generated: {gen}  ·  Version: {ver}  ·  Request ID: {rid}", SFOOTER),
    ]


# ── Entry Point ───────────────────────────────────────────────────────────────
def generate_fitment_pdf(data) -> io.BytesIO:
    if not isinstance(data, dict):
        data = {}

    # One-shot verification: the five weighted contributions, the total they
    # add up to, and every section that should agree with them.
    reconcile(data)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=10*mm, bottomMargin=10*mm,
    )

    story = []
    story.append(build_header(data))
    story.append(Spacer(1, 5))
    story += build_breakdown(data)
    story.append(Spacer(1, 4))
    story += build_skills(data)
    story.append(Spacer(1, 4))
    story += build_meta_row(data)
    story += build_flags(data)
    story += build_footer(data)
    dbg(f"Total story elements: {len(story)}")

    doc.build(story, onFirstPage=draw_page_header)
    buffer.seek(0)
    return buffer
