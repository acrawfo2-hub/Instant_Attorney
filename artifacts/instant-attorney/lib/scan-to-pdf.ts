/**
 * Client-side phone-photo → multi-page PDF conversion.
 *
 * Conversion runs in the browser (no AI tokens). Upload + optional AI analysis
 * still go through the existing attachment pipeline and usage meter.
 */

import { PDFDocument } from "pdf-lib";

/** US Letter in PDF points (72 dpi). */
export const LETTER_WIDTH_PT = 612;
export const LETTER_HEIGHT_PT = 792;

export const DEFAULT_MAX_EDGE_PX = 2200;
export const DEFAULT_JPEG_QUALITY = 0.88;
export const DEFAULT_PAGE_MARGIN_PT = 24;
export const MAX_SCAN_PAGES = 30;

export type RotationDeg = 0 | 90 | 180 | 270;

export interface PreparedScanPage {
  /** JPEG bytes ready for pdf-lib embedJpg */
  jpegBytes: Uint8Array;
  width: number;
  height: number;
}

export interface ScanToPdfOptions {
  /** Longest edge after downscale (keeps PDFs readable but meter-friendly). */
  maxEdgePx?: number;
  jpegQuality?: number;
  /** Margin around each image on the Letter page. */
  marginPt?: number;
  /** Mild document contrast boost via canvas filter. */
  enhance?: boolean;
}

/** Scale so the longer edge is at most maxEdge; never upscale. */
export function scaleToMaxEdge(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    throw new Error("Image dimensions must be positive");
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Fit an image into a page box, preserving aspect ratio. */
export function fitInsideBox(
  imgWidth: number,
  imgHeight: number,
  boxWidth: number,
  boxHeight: number
): { width: number; height: number; x: number; y: number } {
  if (imgWidth <= 0 || imgHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    throw new Error("Dimensions must be positive");
  }
  const scale = Math.min(boxWidth / imgWidth, boxHeight / imgHeight);
  const width = imgWidth * scale;
  const height = imgHeight * scale;
  return {
    width,
    height,
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
  };
}

/** Normalize arbitrary degrees to 0 | 90 | 180 | 270. */
export function normalizeRotation(degrees: number): RotationDeg {
  const n = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
  if (n === 90 || n === 180 || n === 270) return n;
  return 0;
}

/** Strip path junk and force a .pdf extension. */
export function sanitizeScanFileName(name: string): string {
  const base = (name || "scan")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const withoutExt = base.replace(/\.pdf$/i, "").trim() || "scan";
  return `${withoutExt}.pdf`;
}

/** Swap width/height when rotation is 90 or 270. */
export function dimensionsAfterRotation(
  width: number,
  height: number,
  rotation: RotationDeg
): { width: number; height: number } {
  if (rotation === 90 || rotation === 270) {
    return { width: height, height: width };
  }
  return { width, height };
}

/**
 * Build a multi-page US Letter PDF from prepared JPEG pages.
 * Pure enough to unit-test with synthetic JPEG bytes.
 */
export async function buildPdfFromJpegPages(
  pages: PreparedScanPage[],
  options: Pick<ScanToPdfOptions, "marginPt"> = {}
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error("At least one page is required");
  }
  if (pages.length > MAX_SCAN_PAGES) {
    throw new Error(`Maximum of ${MAX_SCAN_PAGES} pages per scan`);
  }

  const margin = options.marginPt ?? DEFAULT_PAGE_MARGIN_PT;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle("Phone scan");
  pdfDoc.setProducer("Instant Attorney Scan");
  pdfDoc.setCreator("Instant Attorney");

  const contentW = LETTER_WIDTH_PT - margin * 2;
  const contentH = LETTER_HEIGHT_PT - margin * 2;

  for (const page of pages) {
    const image = await pdfDoc.embedJpg(page.jpegBytes);
    const pdfPage = pdfDoc.addPage([LETTER_WIDTH_PT, LETTER_HEIGHT_PT]);
    const fitted = fitInsideBox(page.width, page.height, contentW, contentH);
    pdfPage.drawImage(image, {
      x: margin + fitted.x,
      y: margin + fitted.y,
      width: fitted.width,
      height: fitted.height,
    });
  }

  return pdfDoc.save();
}

function canvasToJpegBytes(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode JPEG"));
          return;
        }
        const buf = await blob.arrayBuffer();
        resolve(new Uint8Array(buf));
      },
      "image/jpeg",
      quality
    );
  });
}

/**
 * Decode a phone photo, apply EXIF orientation, optional enhance, rotate,
 * downscale, and export JPEG bytes suitable for PDF embedding.
 */
export async function prepareScanPage(
  source: Blob,
  rotation: RotationDeg = 0,
  options: ScanToPdfOptions = {}
): Promise<PreparedScanPage> {
  const maxEdge = options.maxEdgePx ?? DEFAULT_MAX_EDGE_PX;
  const quality = options.jpegQuality ?? DEFAULT_JPEG_QUALITY;
  const enhance = options.enhance !== false;
  const rot = normalizeRotation(rotation);

  // Prefer EXIF-aware decode when available (phone photos).
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source, {
      imageOrientation: "from-image",
    } as ImageBitmapOptions);
  } catch {
    bitmap = await createImageBitmap(source);
  }

  try {
    const scaled = scaleToMaxEdge(bitmap.width, bitmap.height, maxEdge);
    const oriented = dimensionsAfterRotation(scaled.width, scaled.height, rot);

    const canvas = document.createElement("canvas");
    canvas.width = oriented.width;
    canvas.height = oriented.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (enhance) {
      // Mild boost helps phone photos of paper under mixed lighting.
      ctx.filter = "contrast(1.12) brightness(1.04) saturate(0.92)";
    }

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(
      bitmap,
      -scaled.width / 2,
      -scaled.height / 2,
      scaled.width,
      scaled.height
    );
    ctx.filter = "none";

    const jpegBytes = await canvasToJpegBytes(canvas, quality);
    return {
      jpegBytes,
      width: oriented.width,
      height: oriented.height,
    };
  } finally {
    bitmap.close();
  }
}

export interface ScanPageInput {
  /** Original image blob from camera/gallery */
  blob: Blob;
  rotation?: RotationDeg;
}

/**
 * Convert one or more phone photos into a downloadable PDF File.
 * Safe to call only in the browser (uses canvas).
 */
export async function imagesToPdfFile(
  pages: ScanPageInput[],
  fileName: string,
  options: ScanToPdfOptions = {}
): Promise<File> {
  if (typeof document === "undefined") {
    throw new Error("PDF conversion requires a browser environment");
  }
  if (pages.length === 0) {
    throw new Error("Add at least one photo");
  }
  if (pages.length > MAX_SCAN_PAGES) {
    throw new Error(`Maximum of ${MAX_SCAN_PAGES} pages per scan`);
  }

  const prepared: PreparedScanPage[] = [];
  for (const page of pages) {
    prepared.push(
      await prepareScanPage(page.blob, normalizeRotation(page.rotation ?? 0), options)
    );
  }

  const pdfBytes = await buildPdfFromJpegPages(prepared, options);
  // Copy into a fresh ArrayBuffer-backed view for BlobPart typing.
  const copy = new Uint8Array(pdfBytes.byteLength);
  copy.set(pdfBytes);
  const name = sanitizeScanFileName(fileName);
  return new File([copy], name, { type: "application/pdf" });
}
