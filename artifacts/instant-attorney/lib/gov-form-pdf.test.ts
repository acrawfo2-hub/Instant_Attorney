import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";
import { detectPdfTemplate, autoMapPdfFields, fillAcroForm } from "./gov-form-pdf.ts";
import type { GovFormField } from "./government-forms.ts";

async function buildFlatPdf(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([300, 200]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText("Petition for Divorce", { x: 20, y: 150, size: 14, font });
  return pdfDoc.save();
}

async function buildAcroformPdf(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([400, 300]);
  const form = pdfDoc.getForm();

  const nameField = form.createTextField("Topmost.Page1.applicant_name_1");
  nameField.acroField.dict.set(PDFName.of("TU"), PDFString.of("Full legal name of Petitioner"));
  nameField.addToPage(page, { x: 50, y: 240, width: 200, height: 20 });

  const dobField = form.createTextField("Topmost.Page1.dob_field");
  dobField.acroField.dict.set(PDFName.of("TU"), PDFString.of("Petitioner date of birth"));
  dobField.addToPage(page, { x: 50, y: 210, width: 200, height: 20 });

  const kidsField = form.createCheckBox("Topmost.Page1.has_children_chk");
  kidsField.acroField.dict.set(PDFName.of("TU"), PDFString.of("Are there children of the marriage?"));
  kidsField.addToPage(page, { x: 50, y: 180, width: 20, height: 20 });

  const countyDropdown = form.createDropdown("Topmost.Page1.county_dd");
  countyDropdown.acroField.dict.set(PDFName.of("TU"), PDFString.of("County of filing"));
  countyDropdown.addOptions(["Williamson", "Travis", "Bell"]);
  countyDropdown.addToPage(page, { x: 50, y: 150, width: 200, height: 20 });

  return pdfDoc.save();
}

test("detectPdfTemplate reports 'flat' for a PDF with no form fields", async () => {
  const bytes = await buildFlatPdf();
  const result = await detectPdfTemplate(bytes);
  assert.equal(result.mode, "flat");
  assert.deepEqual(result.fields, []);
});

test("detectPdfTemplate reports 'acroform' and reads field names + tooltips", async () => {
  const bytes = await buildAcroformPdf();
  const result = await detectPdfTemplate(bytes);
  assert.equal(result.mode, "acroform");
  assert.equal(result.fields.length, 4);

  const name = result.fields.find((f) => f.name === "Topmost.Page1.applicant_name_1");
  assert.equal(name?.type, "text");
  assert.equal(name?.label, "Full legal name of Petitioner");

  const kids = result.fields.find((f) => f.name === "Topmost.Page1.has_children_chk");
  assert.equal(kids?.type, "checkbox");

  const county = result.fields.find((f) => f.name === "Topmost.Page1.county_dd");
  assert.equal(county?.type, "dropdown");
  assert.deepEqual(county?.options, ["Williamson", "Travis", "Bell"]);
});

test("autoMapPdfFields matches by label overlap and type compatibility", async () => {
  const bytes = await buildAcroformPdf();
  const { fields: pdfFields } = await detectPdfTemplate(bytes);

  const formFields: GovFormField[] = [
    { name: "petitioner_full_name", label: "Petitioner's full legal name", type: "string" },
    { name: "petitioner_dob", label: "Petitioner's date of birth", type: "date" },
    { name: "has_children", label: "Do you have children of this marriage?", type: "boolean" },
    { name: "filing_county", label: "County of filing", type: "enum", options: ["Williamson", "Travis", "Bell"] },
    { name: "unrelated_thing", label: "Something with no match on this form", type: "string" },
  ];

  const result = autoMapPdfFields(formFields, pdfFields);

  assert.equal(result.map.petitioner_full_name, "Topmost.Page1.applicant_name_1");
  assert.equal(result.map.petitioner_dob, "Topmost.Page1.dob_field");
  assert.equal(result.map.has_children, "Topmost.Page1.has_children_chk");
  assert.equal(result.map.filing_county, "Topmost.Page1.county_dd");
  assert.ok(result.unmapped.includes("unrelated_thing"));
  assert.ok(!("unrelated_thing" in result.map));

  // No two form fields should ever be mapped to the same PDF field.
  const usedPdfFields = Object.values(result.map);
  assert.equal(usedPdfFields.length, new Set(usedPdfFields).size);
});

test("autoMapPdfFields never maps a field below the confidence threshold", () => {
  const formFields: GovFormField[] = [{ name: "ssn", label: "Social Security Number", type: "ssn" }];
  const pdfFields = [{ name: "field_1", type: "text" as const, label: "Court cause identifier" }];
  const result = autoMapPdfFields(formFields, pdfFields);
  assert.deepEqual(result.map, {});
  assert.deepEqual(result.unmapped, ["ssn"]);
});

test("fillAcroForm stamps values into real fields and flattens the result", async () => {
  const template = await buildAcroformPdf();
  const fieldMap: Record<string, string> = {
    petitioner_full_name: "Topmost.Page1.applicant_name_1",
    petitioner_dob: "Topmost.Page1.dob_field",
    has_children: "Topmost.Page1.has_children_chk",
    filing_county: "Topmost.Page1.county_dd",
  };
  const answers = {
    petitioner_full_name: "Jane Doe",
    petitioner_dob: "1990-05-01",
    has_children: true,
    filing_county: "Williamson",
  };

  const result = await fillAcroForm(template, fieldMap, answers);
  assert.equal(result.filledFieldCount, 4);
  assert.deepEqual(result.skippedFields, []);

  // A flattened PDF has no remaining interactive form fields.
  const reloaded = await PDFDocument.load(result.buffer);
  assert.equal(reloaded.getForm().getFields().length, 0);
});

test("fillAcroForm skips unknown PDF fields and unmatched dropdown values", async () => {
  const template = await buildAcroformPdf();
  const fieldMap: Record<string, string> = {
    petitioner_full_name: "Topmost.Page1.applicant_name_1",
    nonexistent: "Topmost.Page1.does_not_exist",
    filing_county: "Topmost.Page1.county_dd",
  };
  const answers = {
    petitioner_full_name: "Jane Doe",
    nonexistent: "whatever",
    filing_county: "Not A Real County",
  };

  const result = await fillAcroForm(template, fieldMap, answers);
  assert.equal(result.filledFieldCount, 1);
  assert.deepEqual(result.skippedFields.sort(), ["Topmost.Page1.county_dd", "Topmost.Page1.does_not_exist"].sort());
});

test("fillAcroForm skips answers that are empty/undefined without erroring", async () => {
  const template = await buildAcroformPdf();
  const fieldMap: Record<string, string> = { petitioner_full_name: "Topmost.Page1.applicant_name_1" };
  const result = await fillAcroForm(template, fieldMap, { petitioner_full_name: "" });
  assert.equal(result.filledFieldCount, 0);
  assert.deepEqual(result.skippedFields, []);
});
