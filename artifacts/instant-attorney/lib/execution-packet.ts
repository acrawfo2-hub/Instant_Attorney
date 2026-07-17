/**
 * Print-and-go execution packet (.docx).
 *
 * For formalities-bound instruments we do NOT mutate the attorney-approved
 * draft. Instead we ship a separate short packet that lists who signs where and
 * blank signature lines labeled by role — so the client can print, take it to
 * a notary / witnesses, and know exactly what to do.
 */

import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import {
  buildExecutionCoverSheet,
  executionModeLabel,
  type InstrumentExecution,
} from "./execution.ts";

export async function buildExecutionPacketDocx(opts: {
  documentTitle: string;
  execution: InstrumentExecution;
}): Promise<Buffer> {
  const cover = buildExecutionCoverSheet(opts);
  const children: Paragraph[] = [];

  for (const line of cover.split("\n")) {
    if (!line) {
      children.push(new Paragraph({ text: "" }));
      continue;
    }
    if (line === line.toUpperCase() && /[A-Z]{4,}/.test(line) && line.length < 80) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 120, after: 120 },
          children: [new TextRun({ text: line, bold: true, size: 26 })],
        })
      );
      continue;
    }
    if (
      line === "Steps" ||
      line === "Signature roles (look for these labeled blocks in the document)" ||
      line === "Why this packet exists"
    ) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          children: [new TextRun({ text: line, bold: true, size: 22 })],
        })
      );
      continue;
    }
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: line, size: 20 })],
      })
    );
  }

  children.push(new Paragraph({ text: "" }));
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: "Signature lines (print and complete)", bold: true, size: 22 })],
    })
  );
  children.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: `Execution type: ${executionModeLabel(opts.execution.mode)}. Sign only on the matching role below — leave other lines blank for the correct person.`,
          size: 18,
          italics: true,
        }),
      ],
    })
  );

  for (const role of opts.execution.signature_roles) {
    children.push(
      new Paragraph({
        spacing: { before: 280, after: 80 },
        children: [new TextRun({ text: role, bold: true, size: 20 })],
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: "Signature: ________________________________", size: 20 })],
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: "Printed name: _____________________________", size: 20 })],
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: "Date: ______________", size: 20 })],
      })
    );
    if (opts.execution.needs_notary && /notary/i.test(role)) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: "Notary seal / commission expires: ____________________",
              size: 20,
            }),
          ],
        })
      );
    }
  }

  if (opts.execution.needs_recording) {
    children.push(new Paragraph({ text: "" }));
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 200 },
        children: [
          new TextRun({
            text: "RECORDING REMINDER: After notarization, record this instrument with the county clerk. An unrecorded deed has no effect.",
            bold: true,
            size: 20,
          }),
        ],
      })
    );
  }

  const doc = new DocxDocument({
    sections: [{ properties: {}, children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
