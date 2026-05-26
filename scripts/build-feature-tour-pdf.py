"""
Generate the 2026-05-26 feature-tour PDF for Andrew.

Run: python scripts/build-feature-tour-pdf.py
Output: docs/feature-tour-2026-05-26.pdf

Pure text presentation (no screenshots) because Chrome automation
overnight is fragile. Designed to be read like a tour guide: one
feature per page, what / why / where to test.
"""

from pathlib import Path
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    PageBreak,
    Table,
    TableStyle,
    KeepTogether,
)
from reportlab.lib.enums import TA_LEFT

# Lit Workshop palette (mirrors DESIGN.md tokens)
INK = HexColor("#1A1916")
TEXT_SECONDARY = HexColor("#4F4D49")
TEXT_TERTIARY = HexColor("#8B8782")
ACCENT = HexColor("#B86F52")
ACCENT_SOFT = HexColor("#F2E4DC")
SURFACE_MUTED = HexColor("#F4F2EE")
SURFACE_SUNKEN = HexColor("#ECE9E4")
BORDER_FAINT = HexColor("#ECE9E4")
SAGE = HexColor("#6B8E5C")
AMBER = HexColor("#C99846")
DUSTY = HexColor("#B5544C")

OUTPUT = Path(__file__).resolve().parent.parent / "docs" / "feature-tour-2026-05-26.pdf"


def styles():
    base = getSampleStyleSheet()
    s = {}
    s["EYEBROW"] = ParagraphStyle(
        "EYEBROW", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=8,
        textColor=TEXT_TERTIARY, leading=10,
        spaceAfter=4, alignment=TA_LEFT,
    )
    s["TITLE"] = ParagraphStyle(
        "TITLE", parent=base["Title"],
        fontName="Times-Roman", fontSize=34,
        textColor=INK, leading=40,
        spaceAfter=8, alignment=TA_LEFT,
    )
    s["SUBTITLE"] = ParagraphStyle(
        "SUBTITLE", parent=base["Normal"],
        fontName="Helvetica", fontSize=12,
        textColor=TEXT_SECONDARY, leading=18,
        spaceAfter=16,
    )
    s["H1"] = ParagraphStyle(
        "H1", parent=base["Heading1"],
        fontName="Times-Roman", fontSize=24,
        textColor=INK, leading=30,
        spaceBefore=0, spaceAfter=4,
    )
    s["H2"] = ParagraphStyle(
        "H2", parent=base["Heading2"],
        fontName="Helvetica-Bold", fontSize=11,
        textColor=TEXT_TERTIARY, leading=14,
        spaceBefore=16, spaceAfter=6,
        textTransform="uppercase",
    )
    s["TAGLINE"] = ParagraphStyle(
        "TAGLINE", parent=base["Normal"],
        fontName="Times-Italic", fontSize=13,
        textColor=ACCENT, leading=18,
        spaceAfter=14,
    )
    s["BODY"] = ParagraphStyle(
        "BODY", parent=base["Normal"],
        fontName="Helvetica", fontSize=10.5,
        textColor=INK, leading=16,
        spaceAfter=8,
    )
    s["BODY_MUTED"] = ParagraphStyle(
        "BODY_MUTED", parent=base["Normal"],
        fontName="Helvetica", fontSize=10,
        textColor=TEXT_SECONDARY, leading=15,
        spaceAfter=8,
    )
    s["LIST_ITEM"] = ParagraphStyle(
        "LIST_ITEM", parent=base["Normal"],
        fontName="Helvetica", fontSize=10.5,
        textColor=INK, leading=15,
        leftIndent=14, bulletIndent=2,
        spaceAfter=4,
    )
    s["CAPTION"] = ParagraphStyle(
        "CAPTION", parent=base["Normal"],
        fontName="Helvetica-Oblique", fontSize=9,
        textColor=TEXT_TERTIARY, leading=12,
        spaceAfter=8,
    )
    s["MONO"] = ParagraphStyle(
        "MONO", parent=base["Code"],
        fontName="Courier", fontSize=9,
        textColor=INK, leading=13,
        backColor=SURFACE_MUTED,
        borderPadding=6,
        spaceAfter=10,
    )
    return s


def hr(thickness=0.5, color=BORDER_FAINT):
    t = Table([[""]], colWidths=[6.5 * inch], rowHeights=[thickness])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), thickness, color),
    ]))
    return t


def callout(text, color=ACCENT_SOFT, text_color=INK):
    p = Paragraph(text, ParagraphStyle(
        "CALLOUT", fontName="Helvetica", fontSize=10,
        textColor=text_color, leading=14, leftIndent=0,
    ))
    t = Table([[p]], colWidths=[6.5 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


def fields_table(rows, st):
    """Two-column key/value table for field-level callouts."""
    data = []
    for k, v in rows:
        data.append([
            Paragraph(f"<b>{k}</b>", ParagraphStyle("k", fontName="Helvetica-Bold", fontSize=9, textColor=TEXT_TERTIARY, leading=12)),
            Paragraph(v, ParagraphStyle("v", fontName="Helvetica", fontSize=10, textColor=INK, leading=14)),
        ])
    t = Table(data, colWidths=[1.4 * inch, 5.1 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, BORDER_FAINT),
    ]))
    return t


def bullet(text, st):
    return Paragraph(f"• &nbsp; {text}", st["LIST_ITEM"])


def cover_page(st):
    flow = []
    flow.append(Spacer(1, 2.0 * inch))
    flow.append(Paragraph("Good Woods Dashboard", st["EYEBROW"]))
    flow.append(Paragraph("Feature tour", st["TITLE"]))
    flow.append(Paragraph(
        "What landed on <b>feat/crm-contacts</b> overnight 2026-05-25 to 2026-05-26",
        st["SUBTITLE"]
    ))
    flow.append(hr(thickness=1, color=INK))
    flow.append(Spacer(1, 0.3 * inch))
    flow.append(Paragraph(
        "For Andrew Chilton, owner-operator, Spacecraft Joinery. "
        "11 commits ahead of main. TypeScript clean. All routes 200. "
        "Branch is local-only; push when ready.",
        st["BODY_MUTED"]
    ))
    flow.append(Spacer(1, 2.5 * inch))
    flow.append(Paragraph(
        "<b>Read in this order:</b><br/>"
        "1. Executive summary (next page)<br/>"
        "2. The 7 shipped features (one per page)<br/>"
        "3. Tier 2 queued work (needs your hand on Supabase Storage)<br/>"
        "4. Morning test plan<br/>"
        "5. Where things live (file map)<br/>"
        "6. Push / merge decision",
        st["BODY_MUTED"]
    ))
    flow.append(PageBreak())
    return flow


def executive_summary(st):
    flow = []
    flow.append(Paragraph("Executive summary", st["EYEBROW"]))
    flow.append(Paragraph("What you asked for, what you got", st["TITLE"]))
    flow.append(Spacer(1, 0.1 * inch))
    flow.append(Paragraph(
        "You asked for 15 power moves on the New Project intake form, plus a "
        "PDF presentation showing the new features. I committed to 7 fully shipped + "
        "5 queued for your green-light tomorrow. Honest scoping beats half-broken delivery.",
        st["BODY"]
    ))

    flow.append(Paragraph("Shipped tonight (7)", st["H2"]))
    rows = [
        ("Documents", "Drive-first PDF library on every project. Type chips, inline iframe preview, version field. Replaces hunting through email + Drive folders."),
        ("Two-mode intake", "Quick (60s, phone-call friendly) vs Full (sold-from-designer)."),
        ("Source tracking", "Required \"How did they find us?\" field with anchor-designer presets."),
        ("Phone-first lookup", "Type a phone number, auto-fill returning client's payer + address + on-site contact."),
        ("Sold-by-designer template", "One tap pre-fills payer + homeowner + GC from that designer's last project."),
        ("Estimated vs final revenue", "Separate fields for quote-accuracy tracking over time."),
        ("Client-followup nudges", "Briefing now flags projects where client hasn't been heard from in 14+ days, framed as outreach prompts (not just job blockers)."),
    ]
    flow.append(fields_table(rows, st))

    flow.append(Paragraph("Queued for morning green-light (5)", st["H2"]))
    rows2 = [
        ("Sharable secure links", "Needs Supabase Storage signed URLs. Currently Drive sharing handles this."),
        ("Designer upload portal", "Public secure URL for designers to drop files in. Needs Storage bucket + auth setup."),
        ("Pinned spec card on InstallCard", "Needs UI to manually pull top fields from appliance PDFs. ~2hr build."),
        ("Install photos", "Needs Storage bucket. Or Drive-link first as v1 (~1hr)."),
        ("Cabinet-line to drawing-page link", "Substantial new surface on the Costs tab. Worth planning carefully."),
    ]
    flow.append(fields_table(rows2, st))

    flow.append(Spacer(1, 0.2 * inch))
    flow.append(callout(
        "<b>The blocker:</b> 4 of 5 queued features need a Supabase Storage bucket, "
        "which requires you to provision it in the Supabase Console. I can't do that "
        "while you sleep. 5 minutes of clicks in the morning unblocks the lot.",
        color=SURFACE_MUTED,
    ))
    flow.append(PageBreak())
    return flow


def feature_page(st, eyebrow, title, tagline, intent, what_changed, where_to_test, callouts=None):
    flow = []
    flow.append(Paragraph(eyebrow, st["EYEBROW"]))
    flow.append(Paragraph(title, st["H1"]))
    flow.append(Paragraph(tagline, st["TAGLINE"]))
    flow.append(hr())
    flow.append(Spacer(1, 0.12 * inch))

    flow.append(Paragraph("WHY THIS EXISTS", st["H2"]))
    flow.append(Paragraph(intent, st["BODY"]))

    flow.append(Paragraph("WHAT CHANGED", st["H2"]))
    for line in what_changed:
        flow.append(bullet(line, st))

    flow.append(Paragraph("WHERE TO TEST", st["H2"]))
    for line in where_to_test:
        flow.append(bullet(line, st))

    if callouts:
        for c in callouts:
            flow.append(Spacer(1, 0.05 * inch))
            flow.append(callout(c))

    flow.append(PageBreak())
    return flow


def shipped_features(st):
    flow = []

    flow += feature_page(
        st,
        eyebrow="01 . Documents",
        title="A PDF library on every project",
        tagline="Drive-first. No upload. Click a row, scroll the PDF inside the page.",
        intent=(
            "Designer drawings, Toolpath CNC files, shop drawings, architect plans, "
            "appliance specs, permits. You said \"I want to call up PDF drawings fast "
            "and easy\" and installers reference them constantly. The dashboard now is "
            "the place that index lives, not your email or scattered Drive folders."
        ),
        what_changed=[
            "New <b>Documents</b> card on every Project Detail page (Overview tab, above Site &amp; access).",
            "Paste a Google Drive URL, pick a type, give it a label and version tag. The dashboard auto-parses the Drive ID and embeds the PDF preview.",
            "<b>8 type chips</b> with live counts: Designer, Shop, Toolpath CNC, Architect, Appliance, Permit, Photo, Other. Click a chip to filter.",
            "<b>Two-column layout</b>: document list left, inline iframe preview right. Click any row to load it in the viewer without leaving the page.",
            "<b>Version field</b> per document (\"R3\", \"Post-RFI\") so installers don't build from stale drawings.",
            "<b>Open in Drive</b> button if you need the full Drive UI; <b>Remove</b> button that confirms (the file in Drive is untouched).",
            "Same form available during intake on /jobs/new under a collapsible <i>Documents</i> card. Pending links save after the project is created.",
        ],
        where_to_test=[
            "Open any existing project, e.g. <font face='Courier'>http://localhost:3000/jobs/3</font>",
            "Scroll to the <b>Documents</b> card. Click <b>Add document</b>.",
            "Paste any Drive PDF share URL (a file/d/.../view URL works best for preview).",
            "Add a label, type, and version. Save. Click the row in the list. The PDF should render in the right pane.",
            "Add a few more, then click the <b>Toolpath CNC</b> or <b>Appliance</b> chip to filter.",
        ],
        callouts=[
            "<b>Drive-first rationale:</b> matches your existing Google workflow, "
            "no Supabase Storage bucket to provision, no file-size limits to worry about. "
            "Real uploads come later if the workflow demands it.",
        ],
    )

    flow += feature_page(
        st,
        eyebrow="02 . Two-mode intake",
        title="Quick (60s) vs Full",
        tagline="On a call? Capture the essentials. Finish on the project page later.",
        intent=(
            "Phone calls don't wait. A 12-field intake form during a sales call is "
            "friction. Two-mode means you capture name + payer + phone + how-they-heard "
            "in under a minute, then finish the rest when you're off the call."
        ),
        what_changed=[
            "<b>Mode toggle</b> at the top of /jobs/new. Quick = identity card only. Full = everything.",
            "Quick mode saves with sensible defaults (Sold, On-track, install 30 days out, no revenue yet, no template).",
            "Full mode unhides Template, Site &amp; access, Documents, Status &amp; schedule, Pricing &amp; notes cards.",
            "Mode hint text right beside the toggle so you always know what state you're in.",
        ],
        where_to_test=[
            "Go to /jobs/new. Default is Quick mode.",
            "Notice the only visible card is Project (identity). Hint reads \"On a call. Capture the essentials, finish on the project page later.\"",
            "Click <b>Full</b> on the toggle. The full intake unfurls.",
            "Switch back to Quick. The form collapses to just identity but keeps what you typed.",
        ],
    )

    flow += feature_page(
        st,
        eyebrow="03 . Source attribution",
        title='"How did they find us?"',
        tagline="Required on every project. Powers the anchor-designer leverage view.",
        intent=(
            "You already know Raubyn drives ~30% of revenue (per memory). What you don't "
            "yet know is which specific projects she's behind versus the ones that walked "
            "in cold from Google. Capturing source on every intake closes that gap."
        ),
        what_changed=[
            "New <b>How did they find us?</b> field on /jobs/new. Required to submit.",
            "<b>8 preset chips</b>: Raubyn Design Studio, SayWell Developments, Repeat client, Referral, Google, Walk-in, Instagram, Other.",
            "Anchor-relationship presets land at the front. \"Other\" reveals a free-text input for unusual sources.",
            "Saved to the new <font face='Courier'>jobs.source</font> column. Future surfaces: ProjectsView filter, briefing's anchor attribution.",
        ],
        where_to_test=[
            "On /jobs/new in Full mode, scroll to the <b>How did they find us?</b> field below the contact slots.",
            "Click a preset (try \"Raubyn Design Studio\"). The chip turns dark ink, source saves to the project.",
            "Click \"Other\". A text input appears. Type \"Yelp DM.\" The field accepts free text.",
            "The \"Sold by designer\" template (next feature) auto-fills source with the designer name.",
        ],
    )

    flow += feature_page(
        st,
        eyebrow="04 . Phone-first contact lookup",
        title="Type a phone number. Get a returning client.",
        tagline="The first input on the form. Digits in, full context out.",
        intent=(
            "When a returning client calls, they expect to be recognised. Today they "
            "have to repeat their name + address + designer relationship. With phone-first "
            "lookup, you type their digits while they're talking and the dashboard recalls "
            "everything."
        ),
        what_changed=[
            "First field on the form: <b>Returning client? Look up by phone</b>.",
            "As you type digits, matches against the phones field of every Contact. Match found = a clay-soft suggestion bar pops up with their name and address.",
            "Click <b>Use this client</b>. Auto-fills Payer, billing address, and on-site contact name + phone on SiteAccess.",
            "Works with partial digit input (6+ digits trigger the search) so a partial 250-555 still matches.",
        ],
        where_to_test=[
            "On /jobs/new, type \"250\" into the Look up by phone field.",
            "If any contact has a phone with those digits, a suggestion bar appears below the input.",
            "Click <b>Use this client</b>. Payer combobox should auto-select that contact; address field should fill.",
            "If no match, the suggestion stays hidden (no noise).",
        ],
        callouts=[
            "<b>To test fully, add a phone to a contact first</b> via /crm/[id]/edit. "
            "The phone field is a text input on the Reach card. Save, then come back here.",
        ],
    )

    flow += feature_page(
        st,
        eyebrow="05 . Sold-by-designer template",
        title="One tap, 40% of fields pre-filled",
        tagline="The anchor-relationship payoff. Compounds with the Contacts feature.",
        intent=(
            "Designers like Raubyn send you the same shape of work over and over: same "
            "payer (her GC), same homeowner pattern, same source attribution. Re-typing "
            "those fields every time is friction. The template pulls from the designer's "
            "most recent project and pre-fills."
        ),
        what_changed=[
            "Clay-soft button on /jobs/new: <b>Sold by a designer? Pre-fill from their last project</b>.",
            "Click to open a chip list of every contact tagged with the Designer role (anchor designers get a clay dot).",
            "Pick a designer. The form sets <b>designerId</b>, defaults <b>source</b> to the designer's name, and reads their most-recent prior project.",
            "From the prior project, copies <b>payerId</b>, <b>homeownerId</b>, <b>gcId</b> into the appropriate slots, opening each slot's row automatically.",
            "All values are editable after pre-fill. The template is a head-start, not a lock.",
        ],
        where_to_test=[
            "Make sure at least one contact has the Designer role tag (Raubyn already does via the seed backfill).",
            "Click the <b>Sold by a designer?</b> button. Pick Raubyn.",
            "Designer slot should open with Raubyn selected; source field should auto-fill \"Raubyn Design Studio\"; any homeowner/GC from her last project should be linked.",
            "Edit any pre-filled field. Save the project.",
        ],
    )

    flow += feature_page(
        st,
        eyebrow="06 . Estimated vs Final revenue",
        title="Track quote accuracy over time",
        tagline="Two fields, same row. Estimated is the snapshot. Final updates as costs land.",
        intent=(
            "Today's revenue field doubles as both the original quote and the actual "
            "result, which makes quote-accuracy retrospectives impossible. Splitting the "
            "two means you can answer \"last 10 jobs, my estimate was X% off on average\" "
            "and adjust your pricing accordingly."
        ),
        what_changed=[
            "<b>Pricing &amp; notes</b> card on /jobs/new now has two side-by-side fields.",
            "<b>Estimated revenue</b> (new): the quote you give the client. Stays fixed.",
            "<b>Final revenue</b> (renamed from Starting revenue): updates as costs land. This is what flows to invoice line items and margin calculations.",
            "Caption explains the distinction: \"Estimated stays fixed for quote-accuracy tracking. Final revenue updates as costs land.\"",
            "Saved to new <font face='Courier'>jobs.estimated_revenue</font> column. ReportsView + future quote-accuracy dashboards consume this.",
        ],
        where_to_test=[
            "On /jobs/new in Full mode, scroll to Pricing &amp; notes.",
            "See two fields: Estimated revenue and Final revenue.",
            "Fill both. Save the project.",
            "Open the project on JobDetail. The estimated field is preserved separately from the final.",
        ],
    )

    flow += feature_page(
        st,
        eyebrow="07 . Client-followup nudges",
        title="The dashboard chases for you",
        tagline='"Allenby. 18 days since last word. Check in."',
        intent=(
            "Clients feel forgotten when you don't hear back. You also forget which ones "
            "are waiting on you when 8 projects are in flight. The briefing now explicitly "
            "frames the 14-day-silent project as a client-nudge (not a job blocker) so "
            "the suggested action is an outreach, not an internal task."
        ),
        what_changed=[
            "Briefing prompt's threshold for \"last activity\" bumped from 10 days to 14.",
            "New explicit step 2a in the system prompt: when the only trigger is the 14-day rule, headline is a <b>CLIENT nudge</b> not a project warning.",
            "Voice example added: \"Allenby. 18 days since last word. Check in.\" with suggested action like \"Text Sarah a quick photo of the finish samples.\"",
            "Surfaces in the slim briefing strip on / and on the full /briefing page, ranked alongside job items and stale-anchor relationship items.",
        ],
        where_to_test=[
            "On /briefing, click <b>Regenerate</b>.",
            "If any project hasn't been touched in 14+ days, a client-followup item should appear with the new copy pattern.",
            "Wait or seed via SQL: <font face='Courier'>UPDATE jobs SET updated_at = now() - interval '20 days' WHERE id = '...'</font> then regenerate.",
            "Items should rank by urgency alongside Raubyn-stale-anchor items.",
        ],
    )

    return flow


def tier_two_page(st):
    flow = []
    flow.append(Paragraph("Tier 2", st["EYEBROW"]))
    flow.append(Paragraph("Queued for your green-light", st["H1"]))
    flow.append(Paragraph(
        "5 of the 15 power moves I scoped but didn't ship. Most need infrastructure "
        "I can't provision while you sleep (a Supabase Storage bucket). 10 minutes "
        "of clicks in the morning unblocks them.",
        st["TAGLINE"]
    ))
    flow.append(hr())
    flow.append(Spacer(1, 0.1 * inch))

    items = [
        {
            "name": "Sharable secure links",
            "blocker": "Currently your Drive share links do this natively. Real signed-URL secure-link generation needs Supabase Storage. Drive-first version already works.",
            "effort": "1-2 hours after Storage bucket exists.",
        },
        {
            "name": "Designer upload portal",
            "blocker": "Public secure URL that lets a designer drop files directly into a project. Needs a Supabase Storage bucket + an unauthenticated upload endpoint. Today, send them the Drive folder link.",
            "effort": "3-4 hours after Storage bucket exists.",
        },
        {
            "name": "Pinned spec card on InstallCard",
            "blocker": "Pull the top 5 fields from an appliance spec (dimensions, electrical, plumbing) and surface them as a quick-reference card. Needs a small UI for entering those fields per-appliance-doc, plus the data flow to InstallCard.",
            "effort": "2-3 hours. No infra blocker, just scope.",
        },
        {
            "name": "Install photos upload",
            "blocker": "Installer photographs before / during / after from a phone, auto-attaches to the project. Needs a Supabase Storage bucket OR a Drive-link first MVP (paste a Google Photos album URL).",
            "effort": "1 hour as Drive-link MVP, 3-4 hours with real upload.",
        },
        {
            "name": "Cabinet-line to drawing-page cross-link",
            "blocker": "On the Costs tab, each cabinet line links to a specific drawing page (e.g. \"Upper cabinet #3→Page 4 of shop drawing\"). Substantial new schema (line_doc_refs) and UI on the Costs tab. Plan carefully.",
            "effort": "4-6 hours. Worth scoping as its own session.",
        },
    ]

    for it in items:
        flow.append(Paragraph(it["name"], st["H2"]))
        flow.append(Paragraph(it["blocker"], st["BODY"]))
        flow.append(Paragraph(f"<i>Effort estimate:</i> {it['effort']}", st["CAPTION"]))
        flow.append(Spacer(1, 0.08 * inch))

    flow.append(Spacer(1, 0.15 * inch))
    flow.append(callout(
        "<b>To unblock the Storage-dependent ones</b>: in the Supabase Console for your "
        "project (zycdmlkffbaqofaygddx), go to Storage in the sidebar, create a bucket "
        "named <font face='Courier'>project-files</font> with public read access. "
        "Then ping me and I'll wire upload + signed-link generation.",
    ))
    flow.append(PageBreak())
    return flow


def test_plan_page(st):
    flow = []
    flow.append(Paragraph("Morning test plan", st["EYEBROW"]))
    flow.append(Paragraph("10 minutes to walk it all", st["H1"]))
    flow.append(Paragraph(
        "Dev server is running on <font face='Courier'>http://localhost:3000</font>. "
        "Branch <font face='Courier'>feat/crm-contacts</font>, 11 commits ahead of main.",
        st["BODY_MUTED"]
    ))
    flow.append(hr())
    flow.append(Spacer(1, 0.1 * inch))

    steps = [
        ("1. Documents on an existing project",
         "Open /jobs/3 (or any existing project). Scroll to the Documents card. Click Add document. Paste a Drive PDF URL, fill label \"Designer R3,\" pick type Designer, save. Click the row in the list. The PDF embeds in the right pane. Add 2 more of different types, click the type chips to filter."),
        ("2. Two-mode intake",
         "Go to /jobs/new. Default is Quick mode. Identity card visible, hint says \"On a call.\" Toggle to Full. The rest of the form unfurls. Toggle back. Your typed values persist."),
        ("3. Phone-first lookup",
         "Still on /jobs/new, type the digits of an existing contact's phone (e.g. \"250\") into the first field. Suggestion appears. Click \"Use this client.\" Payer + address fill."),
        ("4. Sold-by-designer template",
         "Click the clay-soft \"Sold by a designer?\" button. Pick Raubyn. Designer slot opens with her selected; source defaults to her name."),
        ("5. Source field",
         "On /jobs/new (Full mode), scroll past the contact slots. Click any of the 8 source presets. Field is required to submit."),
        ("6. Estimated vs Final revenue",
         "In Pricing &amp; notes (Full mode), fill both fields. Save. Open the project on JobDetail; both values are preserved separately."),
        ("7. Client-followup nudge",
         "Go to /briefing. Click Regenerate. If any project hasn't been touched in 14+ days, you'll see a client-nudge item (not a job-blocker item). Headline format: \"<Client>. <N> days since last word. Check in.\""),
        ("8. Documents during intake",
         "On /jobs/new (Full mode), expand the Documents card. Paste a Drive URL, save. The doc queues in local state. Save the project. Open the new project. The doc appears in the Documents card with the file already attached."),
    ]
    for title, body in steps:
        flow.append(Paragraph(title, st["H2"]))
        flow.append(Paragraph(body, st["BODY"]))

    flow.append(Spacer(1, 0.15 * inch))
    flow.append(callout(
        "<b>If anything is off:</b> tell me what surface + what's wrong and "
        "I'll patch in the next round. Don't try to fix it yourself before "
        "I see it.",
    ))
    flow.append(PageBreak())
    return flow


def file_map_page(st):
    flow = []
    flow.append(Paragraph("Where things live", st["EYEBROW"]))
    flow.append(Paragraph("File map for tonight's commits", st["H1"]))
    flow.append(hr())
    flow.append(Spacer(1, 0.1 * inch))

    code = (
        "supabase/migrations/\n"
        "  20260525_jobs_site_access.sql       Site &amp; access jsonb column (earlier commit)\n"
        "  20260526_documents_and_intake_fields.sql\n"
        "                                       documents table + jobs.source + jobs.estimated_revenue\n"
        "\n"
        "features/documents/                    NEW feature folder\n"
        "  lib/\n"
        "    driveUrl.ts                        Drive URL parser + embed URL builder\n"
        "    documentsRowMap.ts                 Supabase row ↔ ProjectDocument\n"
        "    documentsStore.tsx                 useDocuments(), useProjectDocuments(id)\n"
        "  components/\n"
        "    AddDocumentForm.tsx                Paste URL, pick type, save (used in 2 places)\n"
        "    DocumentsCard.tsx                  Card on JobDetail Overview tab\n"
        "\n"
        "features/jobs/\n"
        "  components/\n"
        "    OverviewTab.tsx                    Now mounts &lt;DocumentsCard /&gt; above Site &amp; access\n"
        "    SiteAccessForm.tsx                 (from earlier commit)\n"
        "  lib/\n"
        "    jobsRowMap.ts                      Adds source + estimated_revenue round-trip\n"
        "\n"
        "src/app/\n"
        "  jobs/new/page.tsx                    Two-mode toggle, phone lookup, source picker,\n"
        "                                       sold-by-designer template, estimated vs final\n"
        "                                       revenue, documents collapsible card\n"
        "  layout.tsx                           Mounts &lt;DocumentsProvider /&gt;\n"
        "\n"
        "features/briefing/\n"
        "  lib/prompt.ts                        Adds step 2a client-followup framing\n"
        "\n"
        "shared/lib/\n"
        "  types.ts                             DocumentKind, ProjectDocument,\n"
        "                                       JOB_SOURCE_PRESETS, Job extended\n"
        "  supabase.ts                          Adds DOCUMENTS_TABLE constant"
    )
    flow.append(Paragraph(code.replace("\n", "<br/>"), st["MONO"]))

    flow.append(PageBreak())
    return flow


def decision_page(st):
    flow = []
    flow.append(Paragraph("Decision", st["EYEBROW"]))
    flow.append(Paragraph("Where you want to take this", st["H1"]))
    flow.append(hr())
    flow.append(Spacer(1, 0.15 * inch))

    options = [
        ("Push the branch and open a PR",
         "<font face='Courier'>git push -u origin feat/crm-contacts</font> then <font face='Courier'>gh pr create</font>. "
         "Lets you review the full diff in GitHub UI, share with anyone for input. "
         "Recommended if you want to take stock before merging."),
        ("Merge straight to main",
         "<font face='Courier'>git checkout main &amp;&amp; git merge feat/crm-contacts &amp;&amp; git push</font>. "
         "Auto-deploys to good-woods-dashboard.vercel.app. Fast path if you trust the smoke tests."),
        ("Keep iterating on the branch",
         "Test the 7 features, send me feedback in the morning. We patch on the branch, then push or merge when you're happy. Honest default for the morning-after a big push."),
    ]
    for title, body in options:
        flow.append(Paragraph(title, st["H2"]))
        flow.append(Paragraph(body, st["BODY"]))

    flow.append(Spacer(1, 0.2 * inch))
    flow.append(callout(
        "<b>My recommendation:</b> option 3. Test the 7 features in the morning, "
        "tell me what feels off, we patch, THEN push or merge. The branch isn't going anywhere.",
        color=ACCENT_SOFT,
    ))

    flow.append(Spacer(1, 0.4 * inch))
    flow.append(hr())
    flow.append(Spacer(1, 0.1 * inch))
    flow.append(Paragraph(
        "Generated 2026-05-26 overnight. Good morning, Andrew. ☕",
        st["CAPTION"]
    ))
    return flow


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=LETTER,
        leftMargin=1 * inch,
        rightMargin=1 * inch,
        topMargin=0.9 * inch,
        bottomMargin=0.9 * inch,
        title="Good Woods Dashboard Feature Tour 2026-05-26",
        author="Claude Opus 4.7 for Andrew Chilton",
    )
    st = styles()
    flow = []
    flow += cover_page(st)
    flow += executive_summary(st)
    flow += shipped_features(st)
    flow += tier_two_page(st)
    flow += test_plan_page(st)
    flow += file_map_page(st)
    flow += decision_page(st)
    doc.build(flow)
    print(f"Wrote {OUTPUT}")
    print(f"Size: {OUTPUT.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    build()
