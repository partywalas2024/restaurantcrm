import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

const BRAND = "B4451F";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND}` } };

export function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Restaurant CRM";
  wb.created = new Date();
  return wb;
}

export type ColumnDef = {
  header: string;
  key: string;
  width?: number;
  currency?: boolean;
  number?: boolean;
};

/** Adds a standard data-table sheet: bold white-on-brand header row, frozen, currency formatting. */
export function addTableSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: ColumnDef[],
  rows: Record<string, unknown>[]
) {
  const sheet = wb.addWorksheet(name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = HEADER_FILL;
  headerRow.alignment = { vertical: "middle" };

  rows.forEach((r) => sheet.addRow(r));

  columns.forEach((c, i) => {
    const col = sheet.getColumn(i + 1);
    if (c.currency) col.numFmt = "#,##0.00";
    else if (c.number) col.numFmt = "#,##0.##";
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
}

/** Adds a free-form key/value or title sheet (for summaries, insights, statement headers). */
export function addSummarySheet(wb: ExcelJS.Workbook, name: string, title: string) {
  const sheet = wb.addWorksheet(name.slice(0, 31));
  sheet.getColumn(1).width = 32;
  sheet.getColumn(2).width = 28;
  const titleRow = sheet.addRow([title]);
  titleRow.font = { bold: true, size: 14, color: { argb: `FF${BRAND}` } };
  sheet.addRow([]);
  return sheet;
}

export async function workbookResponse(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function slugFilename(name: string, suffix: string) {
  return `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${suffix}.xlsx`;
}
