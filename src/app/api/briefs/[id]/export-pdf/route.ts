import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// pdf-lib needs the Node runtime (Buffer / standard fonts), not edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/briefs/[id]/export-pdf
 * Generate a genuine downloadable binary PDF of a brief (IB-06).
 *
 * Built with pdf-lib (pure JS, no native deps). pdf-lib has no auto-layout,
 * so this implements word-wrapping + a y-cursor that adds pages when content
 * runs off the bottom of the page.
 */

// --- Page geometry (A4, points) -------------------------------------------
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const TOP = PAGE_HEIGHT - 56; // top edge of the content area
const BOTTOM = 56; // bottom edge of the content area
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// --- Palette ---------------------------------------------------------------
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const ACCENT = rgb(0.12, 0.32, 0.55);
const HAIRLINE = rgb(0.82, 0.82, 0.82);

// Smart punctuation / whitespace that WinAnsi cannot encode, mapped to ASCII.
const CHAR_MAP: Record<number, string> = {
  0x2018: "'",
  0x2019: "'",
  0x201a: "'",
  0x201b: "'",
  0x2032: "'",
  0x201c: '"',
  0x201d: '"',
  0x201e: '"',
  0x201f: '"',
  0x2033: '"',
  0x2013: "-",
  0x2014: "-",
  0x2212: "-",
  0x2022: "-",
  0x00b7: "-",
  0x2026: "...",
  0x2192: "->",
  0x00a0: " ",
  0x2007: " ",
  0x202f: " ",
  0x205f: " ",
  0x3000: " ",
  0x200b: "",
  0x200c: "",
  0x200d: "",
  0xfeff: "",
};

/**
 * Reduce arbitrary brief text to characters the Helvetica/WinAnsi standard
 * font can encode. Smart punctuation is mapped to ASCII; anything outside
 * Latin-1's printable range is dropped so drawText() can never throw.
 */
function sanitize(input: string): string {
  let out = "";
  for (const ch of input.replace(/\r\n?/g, "\n")) {
    if (ch === "\n") {
      out += "\n";
      continue;
    }
    const code = ch.codePointAt(0)!;
    if (code in CHAR_MAP) {
      out += CHAR_MAP[code];
      continue;
    }
    if (code >= 0x2000 && code <= 0x200a) {
      out += " "; // en/em/thin spaces
      continue;
    }
    if (code >= 0x20 && code <= 0x7e) {
      out += ch; // printable ASCII
      continue;
    }
    if (code >= 0xa1 && code <= 0xff) {
      out += ch; // Latin-1 (accented letters)
      continue;
    }
    out += " ";
  }
  return out;
}

/** Word-wrap one already-sanitized string to a max width, honouring newlines. */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) {
        out.push(current);
        current = "";
      }
      // A single word longer than the line: hard-break it character by character.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          const next = chunk + ch;
          if (chunk && font.widthOfTextAtSize(next, size) > maxWidth) {
            out.push(chunk);
            chunk = ch;
          } else {
            chunk = next;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
    if (current) out.push(current);
  }
  return out;
}

function slugify(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const brief = await prisma.brief.findUnique({
      where: { id },
      include: { sources: true },
    });

    if (!brief || brief.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (brief.status !== "COMPLETE") {
      return NextResponse.json(
        { error: "Brief not ready for export" },
        { status: 400 },
      );
    }

    // --- Build the PDF -----------------------------------------------------
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = TOP; // top edge of the next line to be drawn

    const newPage = () => {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = TOP;
    };

    // Add a page if drawing `height` would cross the bottom margin.
    const ensureSpace = (height: number) => {
      if (y - height < BOTTOM) newPage();
    };

    // Draw a single (already-wrapped, sanitized) line; advance the cursor.
    const drawLine = (
      text: string,
      x: number,
      size: number,
      f: PDFFont,
      lineHeight: number,
      color = INK,
    ) => {
      ensureSpace(lineHeight);
      page.drawText(text, { x, y: y - size, size, font: f, color });
      y -= lineHeight;
    };

    interface ParaOpts {
      font: PDFFont;
      size: number;
      lineHeight: number;
      indent?: number;
      color?: ReturnType<typeof rgb>;
    }

    const drawParagraph = (text: string, opts: ParaOpts) => {
      const indent = opts.indent ?? 0;
      const lines = wrapText(
        sanitize(text),
        opts.font,
        opts.size,
        CONTENT_WIDTH - indent,
      );
      for (const line of lines) {
        drawLine(
          line,
          MARGIN + indent,
          opts.size,
          opts.font,
          opts.lineHeight,
          opts.color ?? INK,
        );
      }
    };

    const space = (amount: number) => {
      y -= amount;
    };

    const drawRule = (
      color = HAIRLINE,
      thickness = 0.75,
      gapBefore = 4,
      gapAfter = 10,
    ) => {
      space(gapBefore);
      ensureSpace(thickness + gapAfter);
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness,
        color,
      });
      space(gapAfter);
    };

    const drawHeading = (label: string) => {
      ensureSpace(46); // keep the heading attached to following content
      space(8);
      drawLine(sanitize(label).toUpperCase(), MARGIN, 13, fontBold, 18, ACCENT);
      drawRule(HAIRLINE, 0.75, 0, 8);
    };

    // Label (bold) + value (regular) with a hanging indent for wrapped values.
    const drawField = (label: string, value: string) => {
      const size = 10;
      const lineHeight = 14;
      const labelText = sanitize(label);
      const labelWidth = fontBold.widthOfTextAtSize(`${labelText}  `, size);
      const valueX = MARGIN + labelWidth;
      const lines = wrapText(
        sanitize(value),
        font,
        size,
        CONTENT_WIDTH - labelWidth,
      );
      ensureSpace(lineHeight);
      page.drawText(labelText, {
        x: MARGIN,
        y: y - size,
        size,
        font: fontBold,
        color: MUTED,
      });
      if (lines[0]) {
        page.drawText(lines[0], {
          x: valueX,
          y: y - size,
          size,
          font,
          color: INK,
        });
      }
      y -= lineHeight;
      for (let i = 1; i < lines.length; i++) {
        drawLine(lines[i], valueX, size, font, lineHeight, INK);
      }
    };

    const drawBullet = (index: number, text: string) => {
      const size = 11;
      const lineHeight = 15;
      const marker = `${index}.`;
      const gutter = fontBold.widthOfTextAtSize("00.  ", size);
      const textX = MARGIN + gutter;
      const lines = wrapText(
        sanitize(text),
        font,
        size,
        CONTENT_WIDTH - gutter,
      );
      ensureSpace(lineHeight);
      page.drawText(marker, {
        x: MARGIN,
        y: y - size,
        size,
        font: fontBold,
        color: ACCENT,
      });
      if (lines[0]) {
        page.drawText(lines[0], {
          x: textX,
          y: y - size,
          size,
          font,
          color: INK,
        });
      }
      y -= lineHeight;
      for (let i = 1; i < lines.length; i++) {
        drawLine(lines[i], textX, size, font, lineHeight, INK);
      }
      space(3);
    };

    // --- Header ------------------------------------------------------------
    drawLine("INTELLIGENCE BRIEF", MARGIN, 9, fontBold, 13, ACCENT);
    drawParagraph(brief.name, {
      font: fontBold,
      size: 20,
      lineHeight: 25,
      color: INK,
    });
    drawRule(ACCENT, 1.5, 4, 12);

    // --- Metadata ----------------------------------------------------------
    const generated = brief.createdAt.toISOString().split("T")[0];
    drawField("Type:", brief.type);
    drawField("Mode:", brief.mode);
    if (brief.company) drawField("Company:", brief.company);
    if (brief.linkedinUrl) drawField("LinkedIn:", brief.linkedinUrl);
    if (brief.context) drawField("Context:", brief.context);
    drawField("Generated:", generated);
    drawField("Sources:", String(brief.sources.length));

    // --- Executive Summary -------------------------------------------------
    if (brief.summary) {
      drawHeading("Executive Summary");
      drawParagraph(brief.summary, { font, size: 11, lineHeight: 15.5 });
    }

    // --- Talking Points ----------------------------------------------------
    if (brief.talkingPoints.length > 0) {
      drawHeading("Talking Points");
      brief.talkingPoints.forEach((tp, i) => drawBullet(i + 1, tp));
    }

    // --- Risk Signals ------------------------------------------------------
    if (brief.riskSignals.length > 0) {
      drawHeading("Risk Signals");
      brief.riskSignals.forEach((rs, i) => drawBullet(i + 1, rs));
    }

    // --- Strategy ----------------------------------------------------------
    if (brief.strategy) {
      drawHeading("Strategy");
      drawParagraph(brief.strategy, { font, size: 11, lineHeight: 15.5 });
    }

    // --- Sources / Citations ----------------------------------------------
    if (brief.sources.length > 0) {
      drawHeading(`Sources (${brief.sources.length})`);
      brief.sources.forEach((s, i) => {
        drawParagraph(`${i + 1}. [${s.type}] ${s.title}`, {
          font: fontBold,
          size: 10,
          lineHeight: 13.5,
          color: INK,
        });
        if (s.url) {
          drawParagraph(s.url, {
            font,
            size: 9,
            lineHeight: 12,
            indent: 14,
            color: ACCENT,
          });
        }
        if (typeof s.credibilityScore === "number") {
          drawParagraph(`Credibility: ${s.credibilityScore.toFixed(2)}`, {
            font,
            size: 9,
            lineHeight: 12,
            indent: 14,
            color: MUTED,
          });
        }
        space(4);
      });
    }

    // --- Footer + page numbers (drawn once layout is final) ----------------
    const pages = doc.getPages();
    const total = pages.length;
    pages.forEach((p, idx) => {
      p.drawLine({
        start: { x: MARGIN, y: 44 },
        end: { x: PAGE_WIDTH - MARGIN, y: 44 },
        thickness: 0.5,
        color: HAIRLINE,
      });
      p.drawText("Generated by IntelBriefs", {
        x: MARGIN,
        y: 32,
        size: 8,
        font,
        color: MUTED,
      });
      const pageLabel = `Page ${idx + 1} of ${total}`;
      const labelWidth = font.widthOfTextAtSize(pageLabel, 8);
      p.drawText(pageLabel, {
        x: PAGE_WIDTH - MARGIN - labelWidth,
        y: 32,
        size: 8,
        font,
        color: MUTED,
      });
    });

    // --- Document metadata -------------------------------------------------
    doc.setTitle(`Intelligence Brief: ${brief.name}`);
    doc.setSubject("Intelligence Brief");
    doc.setAuthor("IntelBriefs");
    doc.setCreator("IntelBriefs");
    doc.setProducer("IntelBriefs (pdf-lib)");
    doc.setCreationDate(brief.createdAt);
    doc.setModificationDate(new Date());

    const pdfBytes = await doc.save();
    const filename = `${slugify(brief.name, brief.id)}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBytes.length),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
