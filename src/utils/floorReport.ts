import type { jsPDF } from 'jspdf';
import type { Bundle } from '../types';
import { PLANT_TIME_ZONE } from '../yardRules';

const LEFT = 14;
const RIGHT = 196;
const ROW_HEIGHT = 6;
const LAST_ROW_Y = 278;

const COLUMNS: { label: string; x: number; value: (b: Bundle) => string }[] = [
  { label: 'Tag ID', x: 14, value: b => b.tagId },
  { label: 'Job ID', x: 40, value: b => b.jobId },
  { label: 'Mark', x: 68, value: b => b.mark },
  { label: 'Grade', x: 90, value: b => b.grade },
  { label: 'Bar Size', x: 110, value: b => `#${b.barSize}` },
  { label: 'Status', x: 130, value: b => b.status },
  { label: 'Location', x: 156, value: b => b.location }
];

/** `text` cut to fit `maxWidth` mm at the current font, ending in an ellipsis when cut. */
function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function drawTableHeader(doc: jsPDF, y: number) {
  doc.setFont('helvetica', 'bold');
  for (const c of COLUMNS) doc.text(c.label, c.x, y);
  doc.line(LEFT, y + 2, RIGHT, y + 2);
  doc.setFont('helvetica', 'normal');
}

/**
 * Draws the fabrication floor manifest onto `doc` (A4 portrait, mm): one row per bundle,
 * continuing onto new pages with the column headings repeated, and "Page n of m" on each.
 * Takes the document so jsPDF itself stays lazily loaded.
 */
export function buildFloorReport(doc: jsPDF, bundles: Bundle[], now: Date = new Date()): jsPDF {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SIMCOTE MANUFACTURING - FABRICATION FLOOR MANIFEST', LEFT, 20);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const generated = now.toLocaleString('en-US', { timeZone: PLANT_TIME_ZONE, timeZoneName: 'short' });
  doc.text(`Generated: ${generated}`, LEFT, 28);
  doc.text(`Active Station: Sizing Shears & CNC Benders  |  ${bundles.length} bundles`, LEFT, 34);

  let y = 46;
  drawTableHeader(doc, y);
  y += 8;

  for (const b of bundles) {
    if (y > LAST_ROW_Y) {
      doc.addPage();
      y = 20;
      drawTableHeader(doc, y);
      y += 8;
    }
    COLUMNS.forEach((c, i) => {
      const nextX = COLUMNS[i + 1]?.x ?? RIGHT;
      doc.text(fitText(doc, c.value(b), nextX - c.x - 2), c.x, y);
    });
    y += ROW_HEIGHT;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Page ${i} of ${pages}`, RIGHT, 287, { align: 'right' });
  }
  return doc;
}

/** The manifest's download name, dated in plant time, e.g. Fabrication_Manifest_2026-09-27.pdf */
export function floorReportFileName(now: Date = new Date()): string {
  const day = now.toLocaleDateString('en-CA', { timeZone: PLANT_TIME_ZONE });
  return `Fabrication_Manifest_${day}.pdf`;
}
