"""Export the project's explanation source as a readable submission PDF.

Requires reportlab. Run from the project root with Python.
"""
from pathlib import Path
from html import escape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

root = Path(__file__).resolve().parents[1]
output = root / "output" / "pdf" / "QueueFlow-Project-Explanation.pdf"
output.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleQ", fontName="Helvetica-Bold", fontSize=25, leading=31, textColor=colors.HexColor("#154c40"), spaceAfter=15))
styles.add(ParagraphStyle(name="HeadingQ", fontName="Helvetica-Bold", fontSize=13, leading=18, textColor=colors.HexColor("#176c57"), spaceBefore=20, spaceAfter=9, keepWithNext=True))
styles.add(ParagraphStyle(name="BodyQ", fontName="Helvetica", fontSize=10, leading=15, textColor=colors.HexColor("#425859"), spaceAfter=10))
styles.add(ParagraphStyle(name="CellQ", fontName="Helvetica", fontSize=8.3, leading=12, textColor=colors.HexColor("#425859")))
styles.add(ParagraphStyle(name="HeadCellQ", fontName="Helvetica-Bold", fontSize=9, leading=13, textColor=colors.white))

def clean(text):
    return escape(text.replace("`", "").replace("**", "").replace("->", "to").replace("\u2019", "'").replace("\u2013", "-").replace("\u2014", "-"))

story = [Paragraph("QUEUEFLOW / PROJECT DOCUMENTATION", styles["BodyQ"])]
lines = (root / "docs" / "PROJECT_EXPLANATION.md").read_text(encoding="utf-8").splitlines()
paragraph = []
table_rows = []

def flush_paragraph():
    if paragraph:
        story.append(Paragraph(clean(" ".join(paragraph)), styles["BodyQ"]))
        paragraph.clear()

def flush_table():
    if not table_rows:
        return
    cells = [[Paragraph(clean(c), styles["HeadCellQ"] if i == 0 else styles["CellQ"]) for c in row] for i, row in enumerate(table_rows)]
    table = Table(cells, colWidths=[206, 277], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1c6d59")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f0f6f3"), colors.white]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -1), .4, colors.HexColor("#dce7e1")),
    ]))
    story.extend([table, Spacer(1, 8)])
    table_rows.clear()

for line in lines:
    if line.startswith("|"):
        flush_paragraph()
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not all(c.replace("-", "").replace(":", "").strip() == "" for c in cells):
            table_rows.append(cells)
        continue
    flush_table()
    if line.startswith("# "):
        flush_paragraph()
        story.append(Paragraph(clean(line[2:]), styles["TitleQ"]))
        story.append(Paragraph("Digital Queue &amp; Appointment Management System<br/>Implementation structure and operating workflow", styles["BodyQ"]))
    elif line.startswith("## "):
        flush_paragraph()
        story.append(Paragraph(clean(line[3:]), styles["HeadingQ"]))
    elif not line.strip():
        flush_paragraph()
    else:
        paragraph.append(line.strip())
flush_paragraph()
flush_table()

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d5e5dd"))
    canvas.line(56, 43, A4[0] - 56, 43)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#7b978c"))
    canvas.drawString(56, 30, "QueueFlow | Next.js + PostgreSQL | Project Explanation")
    canvas.drawRightString(A4[0] - 56, 30, f"Page {doc.page}")
    canvas.restoreState()

doc = SimpleDocTemplate(str(output), pagesize=A4, rightMargin=56, leftMargin=56, topMargin=46, bottomMargin=60, title="QueueFlow - Project Explanation", author="QueueFlow Project")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(f"Created {output}")
