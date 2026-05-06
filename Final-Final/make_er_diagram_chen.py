"""
Chen-notation ER Diagram for TAS MongoDB Models
Outputs:
  Final-Final/picture/TAS-ER-Diagram-Chen.png
  Final-Final/picture/TAS-ER-Diagram-Chen.drawio
"""
import os, math, textwrap, xml.etree.ElementTree as ET
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, Ellipse, FancyArrowPatch
from matplotlib.lines import Line2D

# ── layout (x, y in data coords) ──────────────────────────────────────────────
ENTITIES = {
    "USER":               ( 0,  0),
    "SESSION":            ( 4,  2),
    "SECURITY_AUDIT":     ( 4, -2),
    "TOKEN_BLACKLIST":    ( 0, -4),
    "CLIENT":             (-4,  0),
    "CONSENT":            (-7,  2.5),
    "AUTHORIZATION_CODE": (-7, -2.5),
}

# (entity_a, relationship_label, entity_b, card_a, card_b)
RELATIONSHIPS = [
    ("USER",   "has",       "SESSION",            "1", "N"),
    ("USER",   "audits",    "SECURITY_AUDIT",      "1", "N"),
    ("USER",   "blacklists","TOKEN_BLACKLIST",      "1", "N"),
    ("USER",   "owns",      "CLIENT",              "1", "N"),
    ("USER",   "consents",  "CONSENT",             "1", "N"),
    ("USER",   "initiates", "AUTHORIZATION_CODE",  "1", "N"),
    ("CLIENT", "grants",    "CONSENT",             "1", "N"),
    ("CLIENT", "issues",    "AUTHORIZATION_CODE",  "1", "N"),
    ("CLIENT", "revokes",   "TOKEN_BLACKLIST",      "1", "N"),
]

# key attributes per entity  (name, is_pk, is_fk)
ATTRIBUTES = {
    "USER": [
        ("_id", True, False),
        ("username", False, False),
        ("email", False, False),
        ("password (bcrypt)", False, False),
        ("googleId / githubId", False, False),
        ("avatar", False, False),
        ("role", False, False),
        ("isActive", False, False),
        ("failedLoginAttempts", False, False),
        ("lockUntil", False, False),
        ("lastLogin", False, False),
        ("passwordResetToken", False, False),
        ("passwordResetExpires", False, False),
        ("pdpaConsent", False, False),
        ("preferences", False, False),
    ],
    "SESSION": [
        ("_id", True, False),
        ("userId", False, True),
        ("accessTokenHash (SHA256 lookup)", False, False),
        ("refreshTokenHash (SHA256)", False, False),
        ("refreshTokenFamily", False, False),
        ("isActive", False, False),
        ("ipAddress", False, False),
        ("userAgent", False, False),
        ("deviceInfo", False, False),
        ("lastActiveAt", False, False),
        ("createdAt", False, False),
        ("revokedAt", False, False),
        ("revokeReason", False, False),
        ("expiresAt (TTL)", False, False),
    ],
    "CLIENT": [
        ("_id", True, False),
        ("client_id", False, False),
        ("client_secret (bcrypt)", False, False),
        ("client_name", False, False),
        ("description", False, False),
        ("logo_uri", False, False),
        ("application_type", False, False),
        ("owner", False, True),
        ("redirect_uris", False, False),
        ("grant_types", False, False),
        ("response_types", False, False),
        ("scope", False, False),
        ("contact_email", False, False),
        ("isActive", False, False),
        ("totalRequests", False, False),
        ("lastUsed", False, False),
    ],
    "CONSENT": [
        ("_id", True, False),
        ("userId", False, True),
        ("clientId", False, True),
        ("scope", False, False),
        ("grantedAt", False, False),
        ("expiresAt (TTL 30d/7d)", False, False),
    ],
    "AUTHORIZATION_CODE": [
        ("_id", True, False),
        ("userId", False, True),
        ("clientId", False, True),
        ("code", False, False),
        ("redirectUri", False, False),
        ("scope", False, False),
        ("codeChallenge", False, False),
        ("codeChallengeMethod (S256)", False, False),
        ("usedAt (null=unused)", False, False),
        ("createdAt", False, False),
        ("expiresAt (TTL 2min)", False, False),
    ],
    "TOKEN_BLACKLIST": [
        ("_id", True, False),
        ("token (SHA256 hash)", False, False),
        ("tokenType", False, False),
        ("userId", False, True),
        ("clientId (nullable)", False, True),
        ("reason", False, False),
        ("createdAt", False, False),
        ("expiresAt (TTL)", False, False),
    ],
    "SECURITY_AUDIT": [
        ("_id", True, False),
        ("userId (nullable)", False, True),
        ("email (nullable)", False, False),
        ("action (25 types)", False, False),
        ("status", False, False),
        ("ipAddress", False, False),
        ("userAgent", False, False),
        ("metadata", False, False),
        ("createdAt", False, False),
        ("expiresAt (TTL 90d)", False, False),
    ],
}

# attribute fan directions (angle_start_deg, spread_deg) per entity
ATTR_FANS = {
    "USER":               (60,  240),
    "SESSION":            (20,  240),
    "SECURITY_AUDIT":     (-20, 230),
    "TOKEN_BLACKLIST":    (-60, 210),
    "CLIENT":             (120, 270),
    "CONSENT":            (150, 180),
    "AUTHORIZATION_CODE": (200, 230),
}

ATTR_DIST = 1.55   # distance from entity centre to attribute oval centre

# ── helpers ───────────────────────────────────────────────────────────────────
def midpoint(p1, p2, frac=0.5):
    return (p1[0]+frac*(p2[0]-p1[0]), p1[1]+frac*(p2[1]-p1[1]))

def draw_entity(ax, name, cx, cy, w=1.6, h=0.55):
    rect = FancyBboxPatch((cx-w/2, cy-h/2), w, h,
                          boxstyle="square,pad=0.04",
                          linewidth=1.8, edgecolor="#1a3a6b",
                          facecolor="#cce0ff", zorder=4)
    ax.add_patch(rect)
    ax.text(cx, cy, name, ha="center", va="center",
            fontsize=7.5, fontweight="bold", color="#0d1f3c", zorder=5)

def draw_diamond(ax, cx, cy, label, w=1.3, h=0.6):
    dx, dy = w/2, h/2
    xs = [cx, cx+dx, cx, cx-dx, cx]
    ys = [cy+dy, cy, cy-dy, cy, cy+dy]
    ax.fill(xs, ys, color="#fff4b2", zorder=3)
    ax.plot(xs, ys, color="#8a6a00", linewidth=1.4, zorder=3)
    ax.text(cx, cy, label, ha="center", va="center",
            fontsize=6.5, color="#3d2e00", zorder=5)

def draw_attribute(ax, cx, cy, label, is_pk=False, is_fk=False):
    ew, eh = 1.1, 0.42
    ell = Ellipse((cx, cy), ew, eh,
                  linewidth=2.0 if is_pk else 1.2,
                  edgecolor="#444", facecolor="white", zorder=4)
    ax.add_patch(ell)
    color = "#880000" if is_fk else "#111111"
    # fontStyle: bold for PK (visually distinct), italic for FK
    fw = "bold" if is_pk else "normal"
    fs = "italic" if is_fk else "normal"
    ax.text(cx, cy, label, ha="center", va="center",
            fontsize=5.8, color=color,
            fontweight=fw, fontstyle=fs, zorder=5)

def draw_line(ax, x1, y1, x2, y2, color="#333", lw=1.1, zorder=2):
    ax.plot([x1, x2], [y1, y2], color=color, linewidth=lw, zorder=zorder)

def card_label_pos(entity_pos, diamond_pos, offset=0.28):
    dx = diamond_pos[0] - entity_pos[0]
    dy = diamond_pos[1] - entity_pos[1]
    dist = math.hypot(dx, dy)
    if dist == 0:
        return entity_pos
    return (entity_pos[0] + dx/dist*offset, entity_pos[1] + dy/dist*offset)

# ── draw PNG ───────────────────────────────────────────────────────────────────
def make_png(out_path):
    fig, ax = plt.subplots(figsize=(20, 14))
    ax.set_xlim(-9.5, 6.5)
    ax.set_ylim(-6.5, 5.5)
    ax.set_aspect("equal")
    ax.axis("off")
    fig.patch.set_facecolor("#f8f8f8")

    # -- attribute ovals + lines to entity
    for ename, attrs in ATTRIBUTES.items():
        ex, ey = ENTITIES[ename]
        a_start, a_spread = ATTR_FANS[ename]
        n = len(attrs)
        for i, (alabel, is_pk, is_fk) in enumerate(attrs):
            angle_deg = a_start + (a_spread/(n-1))*i if n > 1 else a_start
            angle_rad = math.radians(angle_deg)
            ax_pos = ex + ATTR_DIST * math.cos(angle_rad)
            ay_pos = ey + ATTR_DIST * math.sin(angle_rad)
            draw_line(ax, ex, ey, ax_pos, ay_pos, color="#999", lw=0.9)
            draw_attribute(ax, ax_pos, ay_pos, alabel, is_pk=is_pk, is_fk=is_fk)

    # -- relationship diamonds + lines + cardinality
    for ea, rel, eb, ca, cb in RELATIONSHIPS:
        pa = ENTITIES[ea]
        pb = ENTITIES[eb]
        dm = midpoint(pa, pb)

        # line entity_a → diamond
        draw_line(ax, pa[0], pa[1], dm[0], dm[1])
        # line diamond → entity_b
        draw_line(ax, dm[0], dm[1], pb[0], pb[1])

        draw_diamond(ax, dm[0], dm[1], rel)

        # cardinality labels
        cp_a = card_label_pos(pa, dm, offset=0.55)
        cp_b = card_label_pos(pb, dm, offset=0.55)
        ax.text(cp_a[0], cp_a[1], ca, ha="center", va="center",
                fontsize=8, fontweight="bold", color="#aa0000", zorder=6)
        ax.text(cp_b[0], cp_b[1], cb, ha="center", va="center",
                fontsize=8, fontweight="bold", color="#aa0000", zorder=6)

    # -- entity rectangles (drawn last so on top)
    for ename, (ex, ey) in ENTITIES.items():
        draw_entity(ax, ename, ex, ey)

    # -- legend
    legend_items = [
        mpatches.Patch(facecolor="#cce0ff", edgecolor="#1a3a6b", label="Entity"),
        mpatches.Patch(facecolor="#fff4b2", edgecolor="#8a6a00", label="Relationship"),
        mpatches.Patch(facecolor="white",   edgecolor="#444",    label="Attribute"),
    ]
    ax.legend(handles=legend_items, loc="lower right", fontsize=8, framealpha=0.9)

    ax.set_title("TAS — Entity Relationship Diagram (Chen Notation)\n"
                 "* clientId is String (not ObjectId)  |  ? = optional FK",
                 fontsize=11, fontweight="bold", pad=10)

    fig.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"PNG saved: {out_path}")

# ── draw.io XML ────────────────────────────────────────────────────────────────
# We map data coords → pixel coords (scale 80px per unit)
SCALE = 80
OFFSET_X = 960
OFFSET_Y = 560

def dc(x, y):
    """Data coords → draw.io pixel coords (y-flip)"""
    return OFFSET_X + x * SCALE, OFFSET_Y - y * SCALE

_id_counter = [10]
def nid():
    _id_counter[0] += 1
    return str(_id_counter[0])

def make_drawio(out_path):
    root = ET.Element("mxGraphModel",
                      dx="1422", dy="762", grid="1", gridSize="10",
                      guides="1", tooltips="1", connect="1", arrows="1",
                      fold="1", page="1", pageScale="1",
                      pageWidth="1654", pageHeight="1169",
                      math="0", shadow="0")
    parent = ET.SubElement(ET.SubElement(root, "root"), "mxCell", id="0")
    layer = ET.SubElement(root.find("root"), "mxCell", id="1", parent="0")

    def add_cell(cell_id, value, style, x, y, w, h, parent_id="1", vertex="1"):
        c = ET.SubElement(root.find("root"), "mxCell",
                          id=cell_id, value=value, style=style,
                          vertex=vertex, parent=parent_id)
        ET.SubElement(c, "mxGeometry", x=str(int(x)), y=str(int(y)),
                      width=str(int(w)), height=str(int(h)), **{"as": "geometry"})
        return c

    def add_edge(cell_id, value, src, tgt, parent_id="1"):
        c = ET.SubElement(root.find("root"), "mxCell",
                          id=cell_id, value=value,
                          style="endArrow=none;html=1;exitX=0.5;exitY=0.5;exitDx=0;exitDy=0;entryX=0.5;entryY=0.5;entryDx=0;entryDy=0;",
                          edge="1", source=src, target=tgt, parent=parent_id)
        ET.SubElement(c, "mxGeometry", relative="1", **{"as": "geometry"})
        return c

    ENTITY_STYLE = ("rounded=0;whiteSpace=wrap;html=1;"
                    "fillColor=#dae8fc;strokeColor=#6c8ebf;"
                    "fontStyle=1;fontSize=11;")
    DIAMOND_STYLE = ("rhombus;whiteSpace=wrap;html=1;"
                     "fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10;")
    ATTR_STYLE = ("ellipse;whiteSpace=wrap;html=1;"
                  "fillColor=#ffffff;strokeColor=#666666;fontSize=9;")
    ATTR_PK_STYLE = ("ellipse;whiteSpace=wrap;html=1;"
                     "fillColor=#ffffff;strokeColor=#666666;fontSize=9;"
                     "fontStyle=4;")  # 4 = underline
    ATTR_FK_STYLE = ("ellipse;whiteSpace=wrap;html=1;"
                     "fillColor=#fff0f0;strokeColor=#cc0000;fontSize=9;"
                     "fontStyle=2;")  # 2 = italic

    EW, EH = 160, 50
    DW, DH = 120, 60
    AW, AH = 100, 36

    entity_cell_ids = {}

    # entities
    for ename, (ex, ey) in ENTITIES.items():
        px, py = dc(ex, ey)
        cid = nid()
        entity_cell_ids[ename] = cid
        add_cell(cid, ename, ENTITY_STYLE, px-EW/2, py-EH/2, EW, EH)

    # attributes
    attr_cell_ids = {}
    for ename, attrs in ATTRIBUTES.items():
        ex, ey = ENTITIES[ename]
        a_start, a_spread = ATTR_FANS[ename]
        n = len(attrs)
        ecid = entity_cell_ids[ename]
        for i, (alabel, is_pk, is_fk) in enumerate(attrs):
            angle_deg = a_start + (a_spread/(n-1))*i if n > 1 else a_start
            angle_rad = math.radians(angle_deg)
            ax_ = ex + ATTR_DIST * math.cos(angle_rad)
            ay_ = ey + ATTR_DIST * math.sin(angle_rad)
            px, py = dc(ax_, ay_)
            cid = nid()
            style = ATTR_PK_STYLE if is_pk else (ATTR_FK_STYLE if is_fk else ATTR_STYLE)
            add_cell(cid, alabel, style, px-AW/2, py-AH/2, AW, AH)
            # edge attr→entity
            add_edge(nid(), "", cid, ecid)

    # relationships
    rel_cell_ids = {}
    for ea, rel, eb, ca, cb in RELATIONSHIPS:
        pa = ENTITIES[ea]
        pb = ENTITIES[eb]
        mx_, my_ = midpoint(pa, pb)
        px, py = dc(mx_, my_)
        rcid = nid()
        add_cell(rcid, rel, DIAMOND_STYLE, px-DW/2, py-DH/2, DW, DH)
        # edges entity→diamond with cardinality labels
        e1 = add_edge(nid(), ca, entity_cell_ids[ea], rcid)
        e2 = add_edge(nid(), cb, entity_cell_ids[eb], rcid)

    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    with open(out_path, "wb") as f:
        tree.write(f, encoding="utf-8", xml_declaration=True)
    print(f"draw.io saved: {out_path}")

# ── main ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    pic_dir = os.path.join(os.path.dirname(__file__), "picture")
    os.makedirs(pic_dir, exist_ok=True)
    make_png(os.path.join(pic_dir, "er.png"))
    make_drawio(os.path.join(pic_dir, "TAS-ER-Diagram-Chen.drawio"))
    print("Done.")
