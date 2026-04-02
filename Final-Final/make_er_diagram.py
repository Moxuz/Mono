"""
make_er_diagram.py
Generates two files in Final-Final/picture/:
  1. TAS-ER-Diagram.drawio   — editable draw.io file (open at diagrams.net)
  2. TAS-ER-Diagram.png      — rendered PNG image (via matplotlib)

ER covers all 7 MongoDB models of the TAS authentication system.
"""

import os
import math
import textwrap
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import matplotlib.patheffects as pe

OUT_DIR = Path(__file__).parent / "picture"
OUT_DIR.mkdir(exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# 1.  DATA  ─  entities and relationships
# ─────────────────────────────────────────────────────────────────────────────

ENTITIES = {
    "User": {
        "color": "#1F4E79",
        "color_light": "#D6E4F7",
        "fields": [
            ("PK", "_id",                   "ObjectId"),
            ("",   "username",              "String  required"),
            ("",   "email",                 "String  unique"),
            ("",   "password",              "String  (hashed, hidden)"),
            ("",   "googleId / githubId",   "String  (OAuth)"),
            ("",   "role",                  "user | admin | moderator"),
            ("",   "isActive",              "Boolean  default: true"),
            ("",   "failedLoginAttempts",   "Number  lockout after 5"),
            ("",   "lockUntil",             "Date    15 min lock"),
            ("",   "emailVerified",         "Boolean"),
            ("",   "preferences",           "{ theme, language, notifications }"),
            ("",   "pdpaConsent",           "{ essential, analytics, cookie, IP }"),
            ("",   "lastLogin",             "Date"),
        ],
    },
    "Session": {  # noqa: E501
        "color": "#375623",
        "color_light": "#E2EFDA",
        "fields": [
            ("PK", "_id",                 "ObjectId"),
            ("FK", "userId",              "→ User"),
            ("",   "sessionToken",        "String  unique"),
            ("",   "refreshToken",        "String  hidden"),
            ("",   "refreshTokenHash",    "String  hidden"),
            ("",   "refreshTokenFamily",  "String  (rotation family)"),
            ("",   "deviceInfo",          "{ browser, os, device }"),
            ("",   "ipAddress",           "String"),
            ("",   "isActive",            "Boolean"),
            ("",   "lastActiveAt",        "Date"),
            ("TTL", "createdAt (TTL)",     "90 days auto-expire"),
            ("",   "revokedAt",           "Date"),
            ("",   "revokeReason",        "enum 6 reasons"),
        ],
    },
    "SecurityAudit": {
        "color": "#7B2C2C",
        "color_light": "#FADADD",
        "fields": [
            ("PK", "_id",       "ObjectId"),
            ("FK", "userId",    "→ User  (optional)"),
            ("",   "action",    "enum 16 event types"),
            ("",   "status",    "success | failure | pending"),
            ("",   "ipAddress", "String"),
            ("",   "userAgent", "String"),
            ("",   "metadata",  "Mixed  {}"),
            ("TTL", "expiresAt (TTL)", "90 days auto-expire"),
        ],
    },
    "TokenBlacklist": {
        "color": "#7B2C2C",
        "color_light": "#FADADD",
        "fields": [
            ("PK", "_id",       "ObjectId"),
            ("FK", "userId",    "→ User  (optional)"),
            ("",   "token",     "String  unique"),
            ("",   "tokenType", "access | refresh | auth_code"),
            ("FK", "clientId",  "→ Client  (optional)"),
            ("",   "reason",    "enum 4 reasons"),
            ("",   "revokedAt", "Date"),
            ("TTL", "expiresAt (TTL)", "auto-expire at JWT exp"),
        ],
    },
    "Client": {
        "color": "#4A235A",
        "color_light": "#F5E8FF",
        "fields": [
            ("PK", "_id",             "ObjectId"),
            ("FK", "owner",           "→ User"),
            ("",   "client_id",       "String  unique"),
            ("",   "client_secret",   "String  hashed, hidden"),
            ("",   "client_name",     "String"),
            ("",   "redirect_uris",   "[String]  required"),
            ("",   "grant_types",     "[authorization_code, refresh_token]"),
            ("",   "scope",           "openid profile email"),
            ("",   "application_type","web | native | spa"),
            ("",   "isActive",        "Boolean"),
            ("",   "totalRequests",   "Number  (stats)"),
        ],
    },
    "Consent": {
        "color": "#4A4A00",
        "color_light": "#FFFBD6",
        "fields": [
            ("PK", "_id",      "ObjectId"),
            ("FK", "userId",   "→ User"),
            ("FK", "clientId", "→ Client.client_id"),
            ("",   "scope",    "String"),
            ("TTL", "expiresAt (TTL)", "30 days auto-expire"),
        ],
    },
    "AuthorizationCode": {
        "color": "#1A4A4A",
        "color_light": "#D6F7F7",
        "fields": [
            ("PK", "_id",                    "ObjectId"),
            ("FK", "userId",                 "→ User"),
            ("FK", "clientId",               "→ Client.client_id"),
            ("",   "code",                   "String  unique"),
            ("",   "redirectUri",            "String"),
            ("",   "scope",                  "String"),
            ("",   "used",                   "Boolean  (single-use)"),
            ("",   "code_challenge",         "String  (PKCE S256)"),
            ("",   "code_challenge_method",  "S256 only"),
            ("TTL", "expiresAt (TTL)",        "5 minutes auto-expire"),
        ],
    },
}

# (from_entity, to_entity, label, from_cardinality, to_cardinality)
RELATIONS = [
    ("User", "Session",           "1 : N",  "1",  "N"),
    ("User", "SecurityAudit",     "1 : N",  "1",  "N"),
    ("User", "TokenBlacklist",    "1 : N",  "1",  "N"),
    ("User", "Client",            "1 : N",  "1",  "N"),
    ("User", "Consent",           "1 : N",  "1",  "N"),
    ("User", "AuthorizationCode", "1 : N",  "1",  "N"),
    ("Client", "Consent",         "1 : N",  "1",  "N"),
    ("Client", "AuthorizationCode","1 : N", "1",  "N"),
    ("Client", "TokenBlacklist",  "1 : N",  "1",  "N"),
]

# ─────────────────────────────────────────────────────────────────────────────
# 2.  LAYOUT  – entity centre positions  (canvas units)
# ─────────────────────────────────────────────────────────────────────────────
#
#   AuthorizationCode ──── User ──── Client
#                           |          |
#              Session ─────┤    Consent
#                           |
#            SecurityAudit   TokenBlacklist
#

POSITIONS = {
    "User":              (0.50, 0.50),
    "Session":           (0.06, 0.30),
    "SecurityAudit":     (0.06, 0.70),
    "TokenBlacklist":    (0.50, 0.88),
    "Client":            (0.94, 0.30),
    "Consent":           (0.94, 0.70),
    "AuthorizationCode": (0.50, 0.10),
}

# ─────────────────────────────────────────────────────────────────────────────
# 3.  PNG  (matplotlib)
# ─────────────────────────────────────────────────────────────────────────────

CANVAS_W   = 28
CANVAS_H   = 20
BOX_W      = 4.8    # width of entity box
ROW_H      = 0.32   # height per field row
HDR_H      = 0.55   # header height
TITLE_FONT = 9
FIELD_FONT = 7.5
REL_FONT   = 7


def draw_entity(ax, name: str, cx: float, cy: float, data: dict):
    """Draw one entity box centred at (cx, cy) in data coordinates."""
    fields    = data["fields"]
    hdr_color = data["color"]
    bg_color  = data["color_light"]
    n_rows    = len(fields)
    box_h     = HDR_H + n_rows * ROW_H + 0.1

    x0 = cx - BOX_W / 2
    y0 = cy - box_h / 2

    # Shadow
    shadow = FancyBboxPatch((x0 + 0.06, y0 - 0.06), BOX_W, box_h,
                             boxstyle="round,pad=0.05",
                             linewidth=0, facecolor="#AAAAAA", alpha=0.35,
                             zorder=1)
    ax.add_patch(shadow)

    # Background
    body = FancyBboxPatch((x0, y0), BOX_W, box_h,
                           boxstyle="round,pad=0.05",
                           linewidth=1.2, edgecolor=hdr_color,
                           facecolor=bg_color, zorder=2)
    ax.add_patch(body)

    # Header
    hdr_rect = FancyBboxPatch((x0, y0 + box_h - HDR_H), BOX_W, HDR_H,
                               boxstyle="round,pad=0.05",
                               linewidth=0, facecolor=hdr_color, zorder=3)
    ax.add_patch(hdr_rect)
    ax.text(cx, y0 + box_h - HDR_H / 2, name,
            ha="center", va="center",
            fontsize=TITLE_FONT, fontweight="bold", color="white", zorder=4)

    # Field rows
    for i, (tag, fname, ftype) in enumerate(fields):
        fy = y0 + box_h - HDR_H - (i + 0.5) * ROW_H - 0.05

        # Divider line
        ax.plot([x0 + 0.08, x0 + BOX_W - 0.08],
                [fy + ROW_H / 2, fy + ROW_H / 2],
                color="#CCCCCC", linewidth=0.4, zorder=3)

        # Tag badge (PK / FK / ⏱)
        tag_color = ("#E8C000" if tag == "PK" else
                     "#5B9BD5" if tag == "FK" else
                     "#E05C00" if "⏱" in tag else None)
        if tag_color:
            ax.text(x0 + 0.18, fy, tag,
                    ha="center", va="center",
                    fontsize=6, fontweight="bold", color=tag_color, zorder=4)

        # Field name
        ax.text(x0 + 0.36, fy, fname,
                ha="left", va="center",
                fontsize=FIELD_FONT, fontweight="bold" if tag in ("PK","FK") else "normal",
                color="#1A1A2E", zorder=4)

        # Type
        ax.text(x0 + BOX_W - 0.08, fy, ftype,
                ha="right", va="center",
                fontsize=FIELD_FONT - 0.5, color="#555577",
                style="italic", zorder=4)

    return (x0, y0, x0 + BOX_W, y0 + box_h)   # bounding box


def edge_point(cx, cy, box_w, box_h, tx, ty):
    """Return the point on the edge of the box towards (tx, ty)."""
    dx, dy = tx - cx, ty - cy
    if abs(dx) < 1e-9 and abs(dy) < 1e-9:
        return cx, cy
    angle = math.atan2(dy, dx)
    hw, hh = box_w / 2, box_h / 2
    # Which wall does the line hit?
    if abs(dx) * hh > abs(dy) * hw:
        # left / right wall
        sx = math.copysign(hw, dx)
        sy = sx * math.tan(angle)
    else:
        # top / bottom wall
        sy = math.copysign(hh, dy)
        sx = sy / math.tan(angle) if abs(math.tan(angle)) > 1e-9 else 0
    return cx + sx, cy + sy


def draw_diagram_png():
    fig, ax = plt.subplots(figsize=(CANVAS_W, CANVAS_H), dpi=150)
    ax.set_xlim(0, CANVAS_W)
    ax.set_ylim(0, CANVAS_H)
    ax.axis("off")
    fig.patch.set_facecolor("#F8FAFF")
    ax.set_facecolor("#F8FAFF")

    # Grid background (subtle)
    for gx in range(0, CANVAS_W + 1, 2):
        ax.axvline(gx, color="#E8EEF7", linewidth=0.3, zorder=0)
    for gy in range(0, CANVAS_H + 1, 2):
        ax.axhline(gy, color="#E8EEF7", linewidth=0.3, zorder=0)

    # Convert relative positions to data coords
    def pos(name):
        rx, ry = POSITIONS[name]
        return rx * CANVAS_W, ry * CANVAS_H

    # Track bounding boxes
    boxes = {}

    # Draw entities
    for name, data in ENTITIES.items():
        cx, cy = pos(name)
        n_rows = len(data["fields"])
        bh = HDR_H + n_rows * ROW_H + 0.1
        bb = draw_entity(ax, name, cx, cy, data)
        boxes[name] = (cx, cy, BOX_W, bh)

    # Draw relationships
    for (src, dst, label, card_s, card_d) in RELATIONS:
        cx_s, cy_s, bw_s, bh_s = boxes[src]
        cx_d, cy_d, bw_d, bh_d = boxes[dst]

        px_s, py_s = edge_point(cx_s, cy_s, bw_s, bh_s, cx_d, cy_d)
        px_d, py_d = edge_point(cx_d, cy_d, bw_d, bh_d, cx_s, cy_s)

        # Line
        ax.annotate("",
                     xy=(px_d, py_d), xytext=(px_s, py_s),
                     arrowprops=dict(arrowstyle="-|>",
                                     color="#2E4D7B",
                                     lw=1.4,
                                     connectionstyle="arc3,rad=0.06"),
                     zorder=5)

        # Mid-point label
        mx = (px_s + px_d) / 2
        my = (py_s + py_d) / 2
        ax.text(mx, my + 0.18, label,
                ha="center", va="bottom",
                fontsize=REL_FONT, color="#2E4D7B", fontweight="bold",
                bbox=dict(boxstyle="round,pad=0.15", facecolor="white",
                           edgecolor="#2E4D7B", alpha=0.9, linewidth=0.8),
                zorder=6)

    # Title & legend
    ax.text(CANVAS_W / 2, CANVAS_H - 0.4,
            "TAS Authentication System — Entity Relationship Diagram",
            ha="center", va="top",
            fontsize=15, fontweight="bold", color="#1F4E79",
            zorder=7)
    ax.text(CANVAS_W / 2, CANVAS_H - 0.9,
            "MongoDB / Mongoose  ·  7 Collections  ·  All 1:N relationships pivot on User._id",
            ha="center", va="top",
            fontsize=9, color="#555577", style="italic", zorder=7)

    # Legend
    legend_items = [
        mpatches.Patch(facecolor="#E8C000",   label="PK — Primary Key"),
        mpatches.Patch(facecolor="#5B9BD5",   label="FK — Foreign Key (ref)"),
        mpatches.Patch(facecolor="#E05C00",   label="TTL   auto-expire index"),
        mpatches.Patch(facecolor="#F8FAFF",   edgecolor="#2E4D7B", linewidth=1,
                        label="1:N  relationship"),
    ]
    ax.legend(handles=legend_items,
               loc="lower left", fontsize=8,
               framealpha=0.95, edgecolor="#AAAAAA",
               title="Legend", title_fontsize=8)

    plt.tight_layout(pad=0.4)
    out_png = OUT_DIR / "TAS-ER-Diagram.png"
    plt.savefig(str(out_png), dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close()
    print(f"PNG saved: {out_png}  ({out_png.stat().st_size // 1024} KB)")


# ─────────────────────────────────────────────────────────────────────────────
# 4.  DRAW.IO XML
# ─────────────────────────────────────────────────────────────────────────────

def make_drawio():
    """Generate a draw.io XML file with full ERD using entity tables."""

    # Layout in draw.io pixels (roughly 1 unit ≈ 1px at 100%)
    DW, DH = 1800, 1300
    ENT_W   = 310
    ROW_PX  = 26
    HDR_PX  = 34

    def ent_h(name):
        return HDR_PX + len(ENTITIES[name]["fields"]) * ROW_PX + 6

    # Centre positions (in draw.io px)
    def dpos(name):
        rx, ry = POSITIONS[name]
        return int(rx * DW), int(ry * DH)

    cells = []
    cell_id = [10]

    def nid():
        cell_id[0] += 1
        return str(cell_id[0])

    entity_cell_ids = {}   # entity name → container cell id
    entity_geom    = {}    # entity name → (x, y, w, h)

    for name, data in ENTITIES.items():
        cx, cy = dpos(name)
        eh = ent_h(name)
        x0 = cx - ENT_W // 2
        y0 = cy - eh // 2
        cid = nid()
        entity_cell_ids[name] = cid
        entity_geom[name] = (x0, y0, ENT_W, eh)

        hdr_hex = data["color"].lstrip("#")
        bg_hex  = data["color_light"].lstrip("#")
        # Table container
        cells.append(
            f'<mxCell id="{cid}" value="{name}" '
            f'style="shape=table;startSize={HDR_PX};container=1;collapsible=0;'
            f'childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;'
            f'align=center;resizeLast=1;fontSize=13;fontColor=#ffffff;'
            f'fillColor=#{hdr_hex};strokeColor=#{hdr_hex};" '
            f'vertex="1" parent="1">'
            f'<mxGeometry x="{x0}" y="{y0}" width="{ENT_W}" height="{eh}" as="geometry"/>'
            f'</mxCell>'
        )

        for i, (tag, fname, ftype) in enumerate(data["fields"]):
            row_id   = nid()
            col1_id  = nid()
            col2_id  = nid()
            col3_id  = nid()
            row_y    = HDR_PX + i * ROW_PX

            # Tag colours
            if tag == "PK":
                tag_style = "fontStyle=1;fontColor=#B8860B;"
            elif tag == "FK":
                tag_style = "fontStyle=1;fontColor=#1565C0;"
            elif "⏱" in tag:
                tag_style = "fontStyle=1;fontColor=#C75000;"
            else:
                tag_style = "fontColor=#666666;"

            row_fill = "F9FBFF" if i % 2 == 0 else bg_hex

            cells.append(
                f'<mxCell id="{row_id}" value="" '
                f'style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;'
                f'swimlaneBody=0;fillColor=#{row_fill};collapsible=0;dropTarget=0;'
                f'points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontSize=11;'
                f'top=0;left=0;right=0;bottom=0;" '
                f'vertex="1" parent="{cid}">'
                f'<mxGeometry y="{row_y}" width="{ENT_W}" height="{ROW_PX}" as="geometry"/>'
                f'</mxCell>'
            )
            # Col 1: tag
            cells.append(
                f'<mxCell id="{col1_id}" value="{tag}" '
                f'style="shape=partialRectangle;connectable=0;fillColor=none;'
                f'top=0;left=0;bottom=0;right=0;{tag_style}overflow=hidden;" '
                f'vertex="1" connectable="0" parent="{row_id}">'
                f'<mxGeometry width="32" height="{ROW_PX}" as="geometry">'
                f'<mxRectangle width="32" height="{ROW_PX}" as="alternateBounds"/>'
                f'</mxGeometry></mxCell>'
            )
            # Col 2: field name
            fname_esc = fname.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            fname_style = "fontStyle=1;" if tag in ("PK", "FK") else ""
            cells.append(
                f'<mxCell id="{col2_id}" value="{fname_esc}" '
                f'style="shape=partialRectangle;connectable=0;fillColor=none;'
                f'top=0;left=0;bottom=0;right=0;{fname_style}overflow=hidden;" '
                f'vertex="1" connectable="0" parent="{row_id}">'
                f'<mxGeometry x="32" width="130" height="{ROW_PX}" as="geometry">'
                f'<mxRectangle width="130" height="{ROW_PX}" as="alternateBounds"/>'
                f'</mxGeometry></mxCell>'
            )
            # Col 3: type
            ftype_esc = ftype.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            cells.append(
                f'<mxCell id="{col3_id}" value="{ftype_esc}" '
                f'style="shape=partialRectangle;connectable=0;fillColor=none;'
                f'top=0;left=0;bottom=0;right=0;fontStyle=2;fontColor=#777799;'
                f'fontSize=10;overflow=hidden;" '
                f'vertex="1" connectable="0" parent="{row_id}">'
                f'<mxGeometry x="162" width="{ENT_W - 162}" height="{ROW_PX}" as="geometry">'
                f'<mxRectangle width="{ENT_W - 162}" height="{ROW_PX}" as="alternateBounds"/>'
                f'</mxGeometry></mxCell>'
            )

    # Edges
    for (src, dst, label, card_s, card_d) in RELATIONS:
        eid = nid()
        src_id = entity_cell_ids[src]
        dst_id = entity_cell_ids[dst]
        cells.append(
            f'<mxCell id="{eid}" value="{label}" '
            f'style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;'
            f'jettySize=auto;exitX=0.5;exitY=0.5;exitDx=0;exitDy=0;'
            f'entryX=0.5;entryY=0.5;entryDx=0;entryDy=0;'
            f'endArrow=ERmanyToOne;startArrow=ERmandOne;'
            f'strokeColor=#2E4D7B;fontColor=#2E4D7B;fontStyle=1;fontSize=11;" '
            f'edge="1" source="{src_id}" target="{dst_id}" parent="1">'
            f'<mxGeometry relative="1" as="geometry"/>'
            f'</mxCell>'
        )

    cells_xml = "\n        ".join(cells)
    xml = f"""<mxfile host="app.diagrams.net" modified="2026-03-29" agent="Claude Sonnet 4.6" version="21.0.0">
  <diagram id="TAS-ERD" name="TAS ER Diagram">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1"
                  tooltips="1" connect="1" arrows="1" fold="1" page="1"
                  pageScale="1" pageWidth="1900" pageHeight="1400"
                  math="0" shadow="1">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="TAS Authentication System — Entity Relationship Diagram"
                style="text;html=1;strokeColor=none;fillColor=none;align=center;
                       verticalAlign=middle;whiteSpace=wrap;rounded=0;
                       fontSize=18;fontStyle=1;fontColor=#1F4E79;" vertex="1" parent="1">
          <mxGeometry x="450" y="20" width="900" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="3" value="MongoDB / Mongoose  ·  7 Collections  ·  All relationships pivot on User._id"
                style="text;html=1;strokeColor=none;fillColor=none;align=center;
                       verticalAlign=middle;whiteSpace=wrap;rounded=0;
                       fontSize=11;fontStyle=2;fontColor=#555577;" vertex="1" parent="1">
          <mxGeometry x="450" y="58" width="900" height="24" as="geometry"/>
        </mxCell>
        {cells_xml}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"""

    out_drawio = OUT_DIR / "TAS-ER-Diagram.drawio"
    out_drawio.write_text(xml, encoding="utf-8")
    print(f"draw.io saved: {out_drawio}  ({out_drawio.stat().st_size // 1024} KB)")


# ─────────────────────────────────────────────────────────────────────────────
# 5.  RUN
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Generating ER Diagram...")
    draw_diagram_png()
    make_drawio()
    print("\nDone. Files in Final-Final/picture/:")
    for f in sorted(OUT_DIR.iterdir()):
        print(f"  {f.name}  ({f.stat().st_size // 1024} KB)")
