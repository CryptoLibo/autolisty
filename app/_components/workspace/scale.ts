// Agrupar archivos importados en trabajos de Escala.
import type { ProductType } from "@/lib/products"
import type { ScaleImportedFile, ScaleJob, ScaleJobStatus } from "./types"

export function uid() {
  return crypto.randomUUID();
}

export function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function getTopFolderName(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  return normalized.split("/")[0] || "";
}

export function getNestedPath(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  const [, ...rest] = normalized.split("/");
  return rest.join("/");
}

export function normalizeScaleFolderSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

export function buildScaleJobs(files: ScaleImportedFile[], productType: ProductType): ScaleJob[] {
  const grouped = new Map<string, ScaleImportedFile[]>();

  for (const item of files) {
    const folderName = getTopFolderName(item.relativePath);
    if (!folderName) continue;
    const current = grouped.get(folderName) || [];
    current.push(item);
    grouped.set(folderName, current);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map(([folderName, group]) => {
      let design = 0;
      let mockups = 0;
      let videos = 0;
      let deliverables = 0;
      let pinterest = 0;

      for (const item of group) {
        const nestedPath = getNestedPath(item.relativePath);
        const segments = normalizeRelativePath(nestedPath).split("/").filter(Boolean);
        const rootName = normalizeScaleFolderSegment(segments[0] || "");

        if (segments.length === 1) {
          if (/^midjourney\./i.test(rootName) && item.file.type.startsWith("image/")) {
            design += 1;
          } else if (item.file.type.startsWith("video/")) {
            videos += 1;
          } else if (
            item.file.type.startsWith("image/") &&
            !/^upscayl\./i.test(rootName)
          ) {
            mockups += 1;
          }
        } else if (rootName === "disenos finales") {
          deliverables += 1;
          if (
            productType === "png_designs" &&
            item.file.type === "image/png" &&
            /^design\.png$/i.test(segments[segments.length - 1] || "")
          ) {
            design += 1;
          }
        } else if (rootName === "pines" || rootName === "pins") {
          pinterest += 1;
        }
      }

      const issues: string[] = [];
      if (design === 0) {
        issues.push(productType === "png_designs" ? "Missing final Design.png" : "Missing Midjourney design");
      }
      if (mockups === 0) issues.push("Missing listing media");
      if (deliverables === 0) issues.push("Missing delivery files");
      if (pinterest === 0) issues.push("Missing Pinterest images");

      return {
        id: uid(),
        folderName,
        files: group,
        counts: {
          design,
          mockups,
          videos,
          deliverables,
          pinterest,
        },
        issues,
        status: issues.length === 0 ? "ready" : "needs_attention",
        stepLabel: issues.length === 0 ? "Ready" : "Needs attention",
        errorMessage: null,
        failedStage: null,
        midjourneyPrompt: "",
        designUrl: undefined,
        mockupsUploaded: [],
        uploadedDeliverableFieldIds: [],
        seoResult: null,
        deliveryPdfUrl: null,
        etsyDraftListingId: "",
        etsyResult: null,
        pinterestLink: "",
        pinterestPins: [],
      };
    });
}

export function hasReachedScaleStage(
  status: ScaleJobStatus,
  stage: "uploaded" | "seo" | "pdf" | "etsy" | "pinterest" | "published"
) {
  const stageOrder: Record<ScaleJobStatus, number> = {
    ready: 0,
    needs_attention: 0,
    uploading: 1,
    uploaded: 2,
    generating_seo: 3,
    seo_complete: 4,
    generating_pdf: 5,
    pdf_complete: 6,
    syncing_etsy: 7,
    etsy_complete: 8,
    generating_pinterest: 9,
    pinterest_complete: 10,
    publishing_pinterest: 11,
    published: 12,
    failed: 0,
    skipped: 0,
  };

  const target: Record<typeof stage, number> = {
    uploaded: 2,
    seo: 4,
    pdf: 6,
    etsy: 8,
    pinterest: 10,
    published: 12,
  };

  return stageOrder[status] >= target[stage];
}

export function getFileExtension(file: File, fallback: string) {
  const explicit = file.name.split(".").pop()?.toLowerCase();

  if (explicit) return explicit;

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/jpeg") return "jpg";

  return fallback;
}

export async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

