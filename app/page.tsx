"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { generateListingId } from "@/lib/utils/generateListingId";
import {
  DeliveryField,
  getProductOption,
  PRODUCT_OPTIONS,
  ProductType,
} from "@/lib/products";
import { DndContext, DragEndEvent, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import {
  Copy,
  Eye,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Upload,
  X,
  FileText,
  CheckCircle2,
  Layers3,
  LayoutDashboard,
  Menu,
} from "lucide-react";

type MediaItem = {
  id: string;
  file: File;
  previewUrl: string;
  r2Url?: string;
  altText?: string;
};

type ListingVideoItem = {
  id: string;
  file: File;
  previewUrl: string;
  r2Url?: string;
};

type PinterestItem = {
  id: string;
  file: File;
  previewUrl: string;
  r2Url?: string;
  title?: string;
  description?: string;
  publishedPinId?: string;
  publishUrl?: string | null;
  publishError?: string | null;
};

type SeoResult = {
  product_name?: string;
  title: string;
  description_keywords_5: string[];
  description_final: string;
  tags_13: string[];
  media: Array<{
    id: string;
    order?: number;
    position: number;
    alt_text: string;
  }>;
};

type EtsyAuthStatus = {
  connected: boolean;
  userId?: string;
  scopes?: string[];
  expiresAt?: number;
  shops?: Array<{
    shop_id?: number;
    shop_name?: string;
  }>;
  shopsError?: string | null;
  error?: string;
};

type PinterestAuthStatus = {
  connected: boolean;
  scopes?: string[];
  expiresAt?: number;
  user?: {
    username?: string;
    account_type?: string;
  };
  boards?: Array<{
    id: string;
    name: string;
    privacy?: string;
  }>;
  error?: string;
};

type EtsySyncResponse = {
  ok?: boolean;
  shopId?: number;
  listingId?: string;
  listingUrl?: string | null;
  uploadedImages?: number;
  uploadedFiles?: number;
  error?: string;
};

type EtsyListingUrlResponse = {
  ok?: boolean;
  listingId?: string;
  state?: string;
  listingUrl?: string | null;
  error?: string;
};

type AppSection = "single" | "batch";

type ScaleImportedFile = {
  id: string;
  file: File;
  relativePath: string;
};

type ScaleJobStatus =
  | "ready"
  | "needs_attention"
  | "uploading"
  | "uploaded"
  | "generating_seo"
  | "seo_complete"
  | "generating_pdf"
  | "pdf_complete"
  | "syncing_etsy"
  | "etsy_complete"
  | "generating_pinterest"
  | "pinterest_complete"
  | "publishing_pinterest"
  | "published"
  | "failed";

type ScaleUploadedMockup = {
  id: string;
  position: number;
  url: string;
  altText?: string;
};

type ScalePinterestPin = {
  id: string;
  position: number;
  url: string;
  title?: string;
  description?: string;
  publishedPinId?: string;
  publishUrl?: string | null;
  publishError?: string | null;
};

type ScaleJob = {
  id: string;
  folderName: string;
  files: ScaleImportedFile[];
  listingId?: string;
  midjourneyPrompt: string;
  counts: {
    design: number;
    mockups: number;
    videos: number;
    deliverables: number;
    pinterest: number;
  };
  issues: string[];
  status: ScaleJobStatus;
  stepLabel?: string;
  errorMessage?: string | null;
  designUrl?: string;
  mockupsUploaded?: ScaleUploadedMockup[];
  uploadedDeliverableFieldIds?: string[];
  seoResult?: SeoResult | null;
  deliveryPdfUrl?: string | null;
  etsyDraftListingId: string;
  etsyResult?: EtsySyncResponse | null;
  pinterestLink: string;
  pinterestPins?: ScalePinterestPin[];
};

function uid() {
  return crypto.randomUUID();
}

function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function getTopFolderName(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  return normalized.split("/")[0] || "";
}

function getNestedPath(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  const [, ...rest] = normalized.split("/");
  return rest.join("/");
}

function normalizeScaleFolderSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

function buildScaleJobs(files: ScaleImportedFile[]): ScaleJob[] {
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
        } else if (rootName === "pines" || rootName === "pins") {
          pinterest += 1;
        }
      }

      const issues: string[] = [];
      if (design === 0) issues.push("Missing Midjourney design");
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

function hasReachedScaleStage(
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

function getFileExtension(file: File, fallback: string) {
  const explicit = file.name.split(".").pop()?.toLowerCase();

  if (explicit) return explicit;

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/jpeg") return "jpg";

  return fallback;
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-neutral-400">{subtitle}</p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "success";
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-[#eeba2b] text-neutral-950 hover:bg-[#f4c84f] shadow-[0_10px_30px_rgba(238,186,43,0.18)]"
      : variant === "success"
        ? "bg-emerald-500 text-neutral-950 hover:bg-emerald-400 shadow-[0_10px_30px_rgba(16,185,129,0.18)]"
      : variant === "secondary"
        ? "border border-[#eeba2b]/20 bg-neutral-900 text-neutral-100 hover:border-[#eeba2b]/40 hover:bg-neutral-800"
        : "bg-transparent text-neutral-300 hover:bg-neutral-900";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, styles)}
    >
      {children}
    </button>
  );
}

function Card({
  title,
  children,
  right,
  accent = false,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-3xl border bg-neutral-950/70 backdrop-blur",
        accent
          ? "border-[#eeba2b]/20 shadow-[0_0_0_1px_rgba(238,186,43,0.06),0_18px_50px_rgba(0,0,0,0.28)]"
          : "border-neutral-800 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
      )}
    >
      <div className="flex flex-col gap-4 border-b border-white/6 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-[#eeba2b]" />
          <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
        </div>
        {right}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 5,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
      />
    </div>
  );
}

function FilePicker({
  label,
  accept,
  onChange,
  selectedName,
  icon,
}: {
  label: string;
  accept: string;
  onChange: (file: File | null) => void;
  selectedName?: string | null;
  icon?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#eeba2b]/20 bg-[#eeba2b]/10 text-[#eeba2b]">
            {icon ?? <FileText size={18} />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-100">
              {selectedName || "No file selected"}
            </div>
            <div className="truncate text-xs text-neutral-500">
              Choose the file you want to attach to this delivery.
            </div>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            onChange(file);
            e.currentTarget.value = "";
          }}
        />

        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          <Upload size={16} />
          Select file
        </Button>
      </div>
    </div>
  );
}

function Dropzone({
  title,
  subtitle,
  onPick,
  accept,
  multiple,
  preview,
  onClear,
}: {
  title: string;
  subtitle: string;
  onPick: (files: File[]) => void | Promise<void>;
  accept: string;
  multiple?: boolean;
  preview?: React.ReactNode;
  onClear?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    await onPick(Array.from(files));
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    await handleFiles(files);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
            {title}
          </div>
          <div className="max-w-xl text-sm text-neutral-500">{subtitle}</div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
          <Button variant="secondary" onClick={() => inputRef.current?.click()}>
            <Upload size={16} />
            Upload
          </Button>
          {onClear ? (
            <Button variant="ghost" onClick={onClear}>
              <X size={16} />
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          void onDrop(e);
        }}
        className="rounded-3xl border border-dashed border-[#eeba2b]/20 bg-neutral-900/30 p-5 transition hover:border-[#eeba2b]/35"
      >
        <div className="flex items-center gap-4 text-neutral-300">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#eeba2b]/20 bg-[#eeba2b]/10 text-[#eeba2b]">
            <ImageIcon size={18} />
          </div>
          <div className="text-sm">
            <span className="font-semibold text-neutral-100">Drag & drop</span>{" "}
            <span className="text-neutral-400">files here, or use Upload.</span>
          </div>
        </div>

        {preview ? <div className="mt-5">{preview}</div> : null}
      </div>
    </div>
  );
}

function SortableMockupCard({
  item,
  index,
  onRemove,
  onCopyAlt,
}: {
  item: MediaItem;
  index: number;
  onRemove: () => void;
  onCopyAlt: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950/80"
    >
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-[#eeba2b]/20 bg-neutral-950/90 px-3 py-1 text-xs font-semibold text-neutral-100">
        Pos {index + 1}
        <span className="font-medium text-[#eeba2b]">drag</span>
      </div>

      <button
        onClick={onRemove}
        className="absolute right-3 top-3 z-10 rounded-full border border-neutral-800 bg-neutral-950/90 p-2 text-neutral-200 hover:bg-neutral-900"
        title="Remove"
      >
        <X size={16} />
      </button>

      <div
        className="aspect-square w-full cursor-grab bg-neutral-950 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <img
          src={item.previewUrl}
          alt=""
          draggable={false}
          className="h-full w-full object-cover bg-neutral-950"
          loading="eager"
          decoding="sync"
        />
      </div>

      <div className="space-y-3 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
          Alt text
        </div>
        <div className="flex items-start gap-2">
          <div className="min-h-[88px] flex-1 rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-xs leading-relaxed text-neutral-100 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {item.altText ? item.altText : <span className="text-neutral-500">No alt text generated yet.</span>}
          </div>
          <Button variant="secondary" disabled={!item.altText} onClick={onCopyAlt}>
            <Copy size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function OutputBlock({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-950/80 p-5">
      <SectionTitle title={title} subtitle={subtitle} right={action} />
      <div className="mt-4">{children}</div>
    </div>
  );
}

function SidebarNavItem({
  title,
  subtitle,
  active,
  onClick,
  icon,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border px-4 py-4 text-left transition-all",
        active
          ? "border-[#eeba2b]/30 bg-[#eeba2b]/10 shadow-[0_12px_30px_rgba(238,186,43,0.08)]"
          : "border-neutral-800 bg-neutral-950/70 hover:border-[#eeba2b]/20 hover:bg-neutral-900/80"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
            active
              ? "border-[#eeba2b]/25 bg-[#eeba2b]/15 text-[#f1cc61]"
              : "border-neutral-800 bg-neutral-900 text-neutral-300"
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 space-y-1">
          <div
            className={cn(
              "text-sm font-semibold",
              active ? "text-neutral-100" : "text-neutral-200"
            )}
          >
            {title}
          </div>
          <div className="text-xs leading-relaxed text-neutral-500">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

export default function Page() {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const scaleInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSection, setActiveSection] = useState<AppSection>("single");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [productType, setProductType] = useState<ProductType>("frame_tv_art");
  const [scaleProductType, setScaleProductType] = useState<ProductType>("frame_tv_art");
  const [listingId, setListingId] = useState<string | null>(null);
  const listingIdRef = useRef<string | null>(null);

  const [designFile, setDesignFile] = useState<File | null>(null);
  const [designPreview, setDesignPreview] = useState<string | null>(null);
  const [designR2Url, setDesignR2Url] = useState<string | null>(null);

  const [midjourneyPrompt, setMidjourneyPrompt] = useState("");

  const [mockups, setMockups] = useState<MediaItem[]>([]);
  const [listingVideo, setListingVideo] = useState<ListingVideoItem | null>(null);
  const [pinterestImages, setPinterestImages] = useState<PinterestItem[]>([]);
  const [pinterestLink, setPinterestLink] = useState("");
  const [pinterestLoading, setPinterestLoading] = useState(false);
  const [pinterestPublishing, setPinterestPublishing] = useState(false);
  const [pinterestAuth, setPinterestAuth] = useState<PinterestAuthStatus | null>(null);
  const [pinterestAuthLoading, setPinterestAuthLoading] = useState(true);
  const [pinterestMessage, setPinterestMessage] = useState<string | null>(null);
  const [selectedPinterestBoardId, setSelectedPinterestBoardId] = useState("");

  const [deliveryFiles, setDeliveryFiles] = useState<Record<string, File | null>>({});
  const [deliveryUploadedFields, setDeliveryUploadedFields] = useState<
    Record<string, boolean>
  >({});

  const [deliveryPdfUrl, setDeliveryPdfUrl] = useState<string | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [scaleJobs, setScaleJobs] = useState<ScaleJob[]>([]);
  const [scaleImporting, setScaleImporting] = useState(false);
  const [scaleUploading, setScaleUploading] = useState(false);
  const [scaleSeoLoading, setScaleSeoLoading] = useState(false);
  const [scalePdfLoading, setScalePdfLoading] = useState(false);
  const [scaleEtsyLoading, setScaleEtsyLoading] = useState(false);
  const [scaleEtsyUrlLoading, setScaleEtsyUrlLoading] = useState(false);
  const [scalePinterestLoading, setScalePinterestLoading] = useState(false);
  const [scalePinterestPublishing, setScalePinterestPublishing] = useState(false);
  const [scaleDeletingAll, setScaleDeletingAll] = useState(false);
  const [scaleDeletingJobIds, setScaleDeletingJobIds] = useState<string[]>([]);
  const [scaleSeoModalJobId, setScaleSeoModalJobId] = useState<string | null>(null);
  const [scaleSeoModalDesignUrl, setScaleSeoModalDesignUrl] = useState<string | null>(null);
  const [scaleSeoModalMockupUrls, setScaleSeoModalMockupUrls] = useState<
    Array<{ id: string; url: string; position: number }>
  >([]);
  const [scaleSeoModalPinUrls, setScaleSeoModalPinUrls] = useState<
    Array<{ id: string; url: string; position: number }>
  >([]);
  const [scaleMessage, setScaleMessage] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [etsyAuth, setEtsyAuth] = useState<EtsyAuthStatus | null>(null);
  const [etsyLoading, setEtsyLoading] = useState(true);
  const [etsySyncing, setEtsySyncing] = useState(false);
  const [etsyUrlLoading, setEtsyUrlLoading] = useState(false);
  const [etsyMessage, setEtsyMessage] = useState<string | null>(null);
  const [etsyDraftListingId, setEtsyDraftListingId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SeoResult | null>(null);

  const canGenerate =
    !!designFile &&
    !!designR2Url &&
    midjourneyPrompt.trim().length > 0 &&
    mockups.every((m) => !!m.r2Url) &&
    !loading &&
    !uploading;

  const mockupIds = useMemo(() => mockups.map((m) => m.id), [mockups]);
  const selectedProduct = useMemo(() => getProductOption(productType), [productType]);
  const activeDeliveryFields = useMemo(
    () => selectedProduct.delivery.fields,
    [selectedProduct]
  );
  const scaleDeliveryFields = useMemo(
    () => getProductOption(scaleProductType).delivery.fields,
    [scaleProductType]
  );
  const scaleHasJobs = scaleJobs.length > 0;
  const scaleImportComplete = scaleHasJobs;
  const scaleUploadComplete =
    scaleHasJobs && scaleJobs.every((job) => hasReachedScaleStage(job.status, "uploaded"));
  const scaleSeoComplete =
    scaleHasJobs && scaleJobs.every((job) => hasReachedScaleStage(job.status, "seo"));
  const scalePdfComplete =
    scaleHasJobs && scaleJobs.every((job) => hasReachedScaleStage(job.status, "pdf"));
  const scaleEtsyComplete =
    scaleHasJobs && scaleJobs.every((job) => hasReachedScaleStage(job.status, "etsy"));
  const scalePinterestComplete =
    scaleHasJobs && scaleJobs.every((job) => hasReachedScaleStage(job.status, "pinterest"));
  const scalePublishedComplete =
    scaleHasJobs && scaleJobs.every((job) => hasReachedScaleStage(job.status, "published"));
  const scaleSeoModalJob =
    scaleJobs.find((job) => job.id === scaleSeoModalJobId) || null;
  const scaleBusy =
    scaleImporting ||
    scaleUploading ||
    scaleSeoLoading ||
    scalePdfLoading ||
    scaleEtsyLoading ||
    scaleEtsyUrlLoading ||
    scalePinterestLoading ||
    scalePinterestPublishing ||
    scaleDeletingAll ||
    scaleDeletingJobIds.length > 0;
  const scaleCanImport = !scaleImportComplete;
  const scaleCanUpload = scaleImportComplete && !scaleUploadComplete;
  const scaleCanGenerateSeo = scaleUploadComplete && !scaleSeoComplete;
  const scaleCanGeneratePdf = scaleSeoComplete && !scalePdfComplete;
  const scaleCanSyncEtsy = scalePdfComplete && !scaleEtsyComplete;
  const scaleHasEtsyLinks =
    scaleHasJobs && scaleJobs.every((job) => !!job.pinterestLink.trim());
  const scaleCanFetchEtsyUrls = scaleEtsyComplete && !scaleHasEtsyLinks;
  const scaleCanGeneratePinterest =
    (scaleEtsyComplete || scalePdfComplete) && scaleHasEtsyLinks && !scalePinterestComplete;
  const scaleHasPublishReadyJobs = scaleJobs.some(
    (job) =>
      (job.status === "pinterest_complete" || job.status === "failed") &&
      !!job.pinterestPins?.some((pin) => pin.title && pin.description)
  );
  const scaleCanPublishPinterest = scaleHasPublishReadyJobs && !scalePublishedComplete;

  useEffect(() => {
    async function loadEtsyStatus() {
      try {
        setEtsyLoading(true);
        const res = await fetch("/api/etsy/status", { cache: "no-store" });
        const data = (await res.json()) as EtsyAuthStatus;
        setEtsyAuth(data);
      } catch {
        setEtsyAuth({ connected: false, error: "Failed to load Etsy status" });
      } finally {
        setEtsyLoading(false);
      }
    }

    async function loadPinterestStatus() {
      try {
        setPinterestAuthLoading(true);
        const res = await fetch("/api/pinterest/status", { cache: "no-store" });
        const data = (await res.json()) as PinterestAuthStatus;
        setPinterestAuth(data);
      } catch {
        setPinterestAuth({
          connected: false,
          error: "Failed to load Pinterest status",
        });
      } finally {
        setPinterestAuthLoading(false);
      }
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("etsy_connected") === "1") {
      setEtsyMessage("Etsy connected successfully.");
      params.delete("etsy_connected");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }

    const authError = params.get("etsy_error");
    if (authError) {
      setEtsyMessage(authError);
      params.delete("etsy_error");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }

    if (params.get("pinterest_connected") === "1") {
      setPinterestMessage("Pinterest connected successfully.");
      params.delete("pinterest_connected");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }

    const pinterestError = params.get("pinterest_error");
    if (pinterestError) {
      setPinterestMessage(pinterestError);
      params.delete("pinterest_error");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }

    void loadEtsyStatus();
    void loadPinterestStatus();
  }, []);

  useEffect(() => {
    if (!scaleSeoModalJob) {
      setScaleSeoModalDesignUrl(null);
      setScaleSeoModalMockupUrls([]);
      setScaleSeoModalPinUrls([]);
      return;
    }

    const { designCandidate, mockupCandidates, pinterestCandidates } = parseScaleJobFiles(scaleSeoModalJob);
    const localUrls: string[] = [];

    if (scaleSeoModalJob.designUrl) {
      setScaleSeoModalDesignUrl(scaleSeoModalJob.designUrl);
    } else if (designCandidate) {
      const nextUrl = URL.createObjectURL(designCandidate);
      localUrls.push(nextUrl);
      setScaleSeoModalDesignUrl(nextUrl);
    } else {
      setScaleSeoModalDesignUrl(null);
    }

    if (scaleSeoModalJob.mockupsUploaded?.length) {
      setScaleSeoModalMockupUrls(
        [...scaleSeoModalJob.mockupsUploaded]
          .sort((a, b) => a.position - b.position)
          .map((item) => ({ id: item.id, url: item.url, position: item.position }))
      );
    } else {
      setScaleSeoModalMockupUrls(
        mockupCandidates.map((file, index) => {
          const nextUrl = URL.createObjectURL(file);
          localUrls.push(nextUrl);
          return { id: `${scaleSeoModalJob.id}-mockup-${index}`, url: nextUrl, position: index + 1 };
        })
      );
    }

    if (scaleSeoModalJob.pinterestPins?.length) {
      setScaleSeoModalPinUrls(
        [...scaleSeoModalJob.pinterestPins]
          .sort((a, b) => a.position - b.position)
          .map((item) => ({ id: item.id, url: item.url, position: item.position }))
      );
    } else {
      setScaleSeoModalPinUrls(
        pinterestCandidates.map((file, index) => {
          const nextUrl = URL.createObjectURL(file);
          localUrls.push(nextUrl);
          return { id: `${scaleSeoModalJob.id}-pin-${index}`, url: nextUrl, position: index + 1 };
        })
      );
    }

    return () => {
      localUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [scaleSeoModalJob]);

  function ensureListingId() {
    if (listingIdRef.current) return listingIdRef.current;
    if (listingId) {
      listingIdRef.current = listingId;
      return listingId;
    }

    const id = generateListingId();
    listingIdRef.current = id;
    setListingId(id);
    return id;
  }

  async function uploadFileToEndpoint(
    file: File,
    filename: string,
    listingId: string,
    endpoint: "/api/upload/mockup" | "/api/upload/pinterest" | "/api/upload/deliverable",
    fallbackMessage: string
  ) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("listingId", listingId);
    fd.append("filename", filename);

    const res = await fetch(endpoint, {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || fallbackMessage);
    }

    return (await res.json()) as { key: string; url: string };
  }

  async function uploadToR2(file: File, filename: string) {
    const id = ensureListingId();
    return uploadFileToEndpoint(file, filename, id, "/api/upload/mockup", "Upload failed");
  }

  async function uploadMockupForListing(file: File, filename: string, listingId: string) {
    return uploadFileToEndpoint(
      file,
      filename,
      listingId,
      "/api/upload/mockup",
      "Upload failed"
    );
  }

  async function uploadPinterestToR2(file: File, filename: string) {
    const id = ensureListingId();
    return uploadFileToEndpoint(
      file,
      filename,
      id,
      "/api/upload/pinterest",
      "Pinterest upload failed"
    );
  }

  async function uploadPinterestForListing(
    file: File,
    filename: string,
    listingId: string
  ) {
    return uploadFileToEndpoint(
      file,
      filename,
      listingId,
      "/api/upload/pinterest",
      "Pinterest upload failed"
    );
  }

  async function setDesign(files: File[]) {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return;

    setError(null);
    setUploadMessage(null);
    setUploading(true);

    try {
      const ext =
        f.name.split(".").pop()?.toLowerCase() ||
        (f.type === "image/png"
          ? "png"
          : f.type === "image/webp"
            ? "webp"
            : "jpg");

      const upload = await uploadToR2(f, `design.${ext}`);

      if (designPreview) URL.revokeObjectURL(designPreview);

      setDesignFile(f);
      setDesignPreview(URL.createObjectURL(f));
      setDesignR2Url(upload.url);
    } catch (e: any) {
      setError(e?.message || "Failed to upload design image");
    } finally {
      setUploading(false);
    }
  }

  async function addMockups(
    files: File[],
    options?: {
      replace?: boolean;
    }
  ) {
    if (files.length === 0) return;

    setError(null);
    setUploadMessage(null);
    setUploading(true);

    try {
      const items: MediaItem[] = [];
      const startIndex = options?.replace ? 0 : mockups.length;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f.type.startsWith("image/")) continue;

        const ext =
          f.name.split(".").pop()?.toLowerCase() ||
          (f.type === "image/png"
            ? "png"
            : f.type === "image/webp"
              ? "webp"
              : "jpg");

        const upload = await uploadToR2(f, `mockup-${startIndex + i + 1}.${ext}`);

        items.push({
          id: uid(),
          file: f,
          previewUrl: URL.createObjectURL(f),
          r2Url: upload.url,
        });
      }

      if (options?.replace) {
        for (const mockup of mockups) URL.revokeObjectURL(mockup.previewUrl);
        setMockups(items);
      } else {
        setMockups((prev) => [...prev, ...items]);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to upload mockups");
    } finally {
      setUploading(false);
    }
  }

  async function setListingVideoFile(file: File | null) {
    if (!file || !file.type.startsWith("video/")) return;

    setError(null);
    setUploadMessage(null);
    setUploading(true);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const upload = await uploadToR2(file, `video.${ext}`);
      const nextVideo: ListingVideoItem = {
        id: uid(),
        file,
        previewUrl: URL.createObjectURL(file),
        r2Url: upload.url,
      };

      setListingVideo((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return nextVideo;
      });
    } catch (e: any) {
      setError(e?.message || "Failed to upload listing video");
    } finally {
      setUploading(false);
    }
  }

  function clearDesign() {
    if (designPreview) URL.revokeObjectURL(designPreview);
    setDesignFile(null);
    setDesignPreview(null);
    setDesignR2Url(null);
  }

  function clearMockups() {
    for (const m of mockups) URL.revokeObjectURL(m.previewUrl);
    setMockups([]);
  }

  function clearListingVideo() {
    setListingVideo((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  function clearListingMedia() {
    clearMockups();
    clearListingVideo();
  }

  async function addPinterestImages(
    files: File[],
    options?: {
      replace?: boolean;
    }
  ) {
    if (files.length === 0) return;

    setError(null);
    setUploadMessage(null);
    setUploading(true);

    try {
      const startIndex = options?.replace ? 0 : pinterestImages.length;
      const items: PinterestItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f.type.startsWith("image/")) continue;

        const ext = getFileExtension(f, "jpg");
        const upload = await uploadPinterestToR2(f, `pin-${startIndex + i + 1}.${ext}`);

        items.push({
          id: uid(),
          file: f,
          previewUrl: URL.createObjectURL(f),
          r2Url: upload.url,
        });
      }

      if (options?.replace) {
        for (const item of pinterestImages) URL.revokeObjectURL(item.previewUrl);
        setPinterestImages(items);
      } else {
        setPinterestImages((prev) => [...prev, ...items]);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to upload Pinterest images");
    } finally {
      setUploading(false);
    }
  }

  function clearPinterestImages() {
    for (const item of pinterestImages) URL.revokeObjectURL(item.previewUrl);
    setPinterestImages([]);
  }

  async function readEntryFiles(
    entry: any,
    parentPath = ""
  ): Promise<ScaleImportedFile[]> {
    if (!entry) return [];

    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        entry.file(resolve, reject);
      });

      return [
        {
          id: uid(),
          file,
          relativePath: normalizeRelativePath(
            parentPath ? `${parentPath}/${file.name}` : file.name
          ),
        },
      ];
    }

    if (!entry.isDirectory) {
      return [];
    }

    const reader = entry.createReader();
    const entries: any[] = [];

    while (true) {
      const batch = await new Promise<any[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (!batch.length) break;
      entries.push(...batch);
    }

    const collected = await Promise.all(
      entries.map((child) =>
        readEntryFiles(
          child,
          normalizeRelativePath(parentPath ? `${parentPath}/${entry.name}` : entry.name)
        )
      )
    );

    return collected.flat();
  }

  async function extractScaleImportedFiles(
    files: File[],
    items?: DataTransferItemList | null
  ): Promise<ScaleImportedFile[]> {
    if (items?.length) {
      const entries = Array.from(items)
        .map((item) => (item as any).webkitGetAsEntry?.())
        .filter(Boolean);

      if (entries.length > 0) {
        const collected = await Promise.all(entries.map((entry) => readEntryFiles(entry)));
        const flattened = collected.flat();
        if (flattened.length > 0) {
          return flattened;
        }
      }
    }

    return files
      .map((file) => {
        const relativePath =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

        return {
          id: uid(),
          file,
          relativePath: normalizeRelativePath(relativePath),
        };
      })
      .filter((item) => item.relativePath.includes("/"));
  }

  async function importScaleListings(
    files: File[],
    items?: DataTransferItemList | null
  ) {
    if (files.length === 0 && !items?.length) return;

    setScaleImporting(true);
    setScaleMessage(null);

    try {
      const importedFiles = await extractScaleImportedFiles(files, items);

      if (importedFiles.length === 0) {
        setScaleJobs([]);
        setScaleMessage(
          "No listing folders were detected. Drop prepared listing folders or choose a parent folder."
        );
        return;
      }

      const jobs = buildScaleJobs(importedFiles);
      setScaleJobs(jobs);

      const readyCount = jobs.filter((job) => job.status === "ready").length;
      const issueCount = jobs.length - readyCount;

      setScaleMessage(
        issueCount > 0
          ? `${jobs.length} listings imported. ${readyCount} ready, ${issueCount} need attention.`
          : `${jobs.length} listings imported and ready for Scale.`
      );
    } catch (e: any) {
      setScaleJobs([]);
      setScaleMessage(e?.message || "Failed to import listing folders into Scale.");
    } finally {
      setScaleImporting(false);
    }
  }

  function resetScale() {
    setScaleJobs([]);
    setScaleMessage(null);
  }

  function setScaleJobPrompt(jobId: string, value: string) {
    updateScaleJob(jobId, (job) => ({
      ...job,
      midjourneyPrompt: value,
    }));
  }

  function setScaleJobDraftListingId(jobId: string, value: string) {
    updateScaleJob(jobId, (job) => ({
      ...job,
      etsyDraftListingId: value,
    }));
  }

  function setScaleJobPinterestLink(jobId: string, value: string) {
    updateScaleJob(jobId, (job) => ({
      ...job,
      pinterestLink: value,
    }));
  }

  function updateScaleJob(
    jobId: string,
    updater: (job: ScaleJob) => ScaleJob
  ) {
    setScaleJobs((prev) => prev.map((job) => (job.id === jobId ? updater(job) : job)));
  }

  function resetScaleJobAfterDelete(job: ScaleJob): ScaleJob {
    return {
      ...job,
      listingId: undefined,
      status: "ready",
      stepLabel: "Ready to upload again",
      errorMessage: null,
      designUrl: undefined,
      mockupsUploaded: undefined,
      uploadedDeliverableFieldIds: [],
      seoResult: null,
      deliveryPdfUrl: null,
      etsyResult: null,
      pinterestPins: undefined,
    };
  }

  async function deleteScaleListingAssets(listingIds: string[]) {
    const response = await fetch("/api/r2/delete-listings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listingIds }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || "Failed to delete R2 assets");
    }

    return data as {
      ok: true;
      results: Array<{ listingId: string; deletedObjectCount: number }>;
    };
  }

  async function clearScaleJobUploads(jobId: string) {
    const targetJob = scaleJobs.find((job) => job.id === jobId);

    if (!targetJob?.listingId) {
      setScaleMessage("This listing does not have uploaded R2 assets yet.");
      return;
    }

    setScaleDeletingJobIds((prev) => [...prev, jobId]);
    setScaleMessage(`Deleting R2 assets for ${targetJob.folderName}...`);

    try {
      await deleteScaleListingAssets([targetJob.listingId]);

      updateScaleJob(jobId, (current) => resetScaleJobAfterDelete(current));
      setScaleMessage(`R2 assets deleted for ${targetJob.folderName}.`);
    } catch (error: any) {
      updateScaleJob(jobId, (current) => ({
        ...current,
        status: "failed",
        stepLabel: "Delete failed",
        errorMessage: error?.message || "Failed to delete R2 assets for this listing.",
      }));
      setScaleMessage(error?.message || "Failed to delete listing assets.");
    } finally {
      setScaleDeletingJobIds((prev) => prev.filter((id) => id !== jobId));
    }
  }

  async function clearScaleSessionUploads() {
    const listingIds = scaleJobs
      .map((job) => job.listingId)
      .filter((value): value is string => !!value);

    if (listingIds.length === 0) {
      setScaleMessage("This Scale session has no uploaded R2 assets to clear.");
      return;
    }

    setScaleDeletingAll(true);
    setScaleMessage(`Deleting R2 assets for ${listingIds.length} Scale jobs...`);

    try {
      await deleteScaleListingAssets(listingIds);

      setScaleJobs((prev) => prev.map((job) => (
        job.listingId ? resetScaleJobAfterDelete(job) : job
      )));
      setScaleMessage(`R2 assets deleted for ${listingIds.length} Scale jobs.`);
    } catch (error: any) {
      setScaleMessage(error?.message || "Failed to delete session uploads.");
    } finally {
      setScaleDeletingAll(false);
    }
  }

  function parseScaleJobFiles(job: ScaleJob) {
    const acceptedItems = job.files.filter((item) => {
      const info = getScaleImportedFileInfo(item);
      if (info.normalizedName.includes("upscayl")) return false;
      if (
        item.file.type === "application/pdf" &&
        !pathHasFolderSegment(info.normalizedPath, "disenos finales")
      ) {
        return false;
      }
      return true;
    });

    const designCandidate =
      acceptedItems.find((item) => {
        const info = getScaleImportedFileInfo(item);
        return (
          item.file.type.startsWith("image/") &&
          info.normalizedName.includes("midjourney")
        );
      })?.file || null;

    const pinterestCandidates = sortNumericFileNames(
      acceptedItems
        .filter((item) => {
          const info = getScaleImportedFileInfo(item);
          return (
            item.file.type.startsWith("image/") &&
            pathHasFolderSegment(info.normalizedPath, "pines", "pins")
          );
        })
        .map((item) => item.file)
    );

    const deliverableCandidates = acceptedItems
      .filter((item) => {
        const info = getScaleImportedFileInfo(item);
        return (
          (item.file.type.startsWith("image/") || item.file.type === "application/pdf") &&
          pathHasFolderSegment(info.normalizedPath, "disenos finales")
        );
      })
      .map((item) => item.file);

    const rootVideoCandidate =
      acceptedItems.find((item) => {
        const info = getScaleImportedFileInfo(item);
        return (
          item.file.type.startsWith("video/") &&
          !pathHasFolderSegment(info.normalizedPath, "pines", "pins") &&
          !pathHasFolderSegment(info.normalizedPath, "disenos finales")
        );
      })?.file || null;

    const mockupCandidates = sortNumericFileNames(
      acceptedItems
        .filter((item) => {
          const info = getScaleImportedFileInfo(item);
          if (!item.file.type.startsWith("image/")) return false;
          if (designCandidate && item.file === designCandidate) return false;
          if (pathHasFolderSegment(info.normalizedPath, "pines", "pins")) return false;
          if (pathHasFolderSegment(info.normalizedPath, "disenos finales")) return false;
          if (info.normalizedName.includes("upscayl")) return false;
          return true;
        })
        .map((item) => item.file)
    );

    return {
      designCandidate,
      pinterestCandidates,
      deliverableCandidates,
      rootVideoCandidate,
      mockupCandidates,
    };
  }

  function buildScaleDeliverables(job: ScaleJob) {
    const { deliverableCandidates } = parseScaleJobFiles(job);
    const scaleFields = scaleDeliveryFields;

    return scaleProductType === "frame_tv_art"
      ? [
          ...deliverableCandidates
            .filter((file) => file.type.startsWith("image/"))
            .map((file) => ({
              file,
              field: scaleFields.find((candidate) => candidate.id === "design")!,
            })),
          ...deliverableCandidates
            .filter((file) => file.type === "application/pdf")
            .map((file) => ({
              file,
              field: scaleFields.find((candidate) => candidate.id === "instructions")!,
            })),
        ]
        : deliverableCandidates
            .map((file) => {
              const field = classifyPrintableDeliverableField(file, scaleFields);
              return field ? { file, field } : null;
            })
          .filter((item): item is { file: File; field: DeliveryField } => !!item)
            .sort(
              (a, b) =>
                scaleFields.findIndex((field) => field.id === a.field.id) -
                scaleFields.findIndex((field) => field.id === b.field.id)
            );
  }

  function getRequiredScaleDeliverableFieldIds() {
    return scaleProductType === "printable_wall_art"
      ? scaleDeliveryFields.map((field) => field.id)
      : ["design"];
  }

  async function runWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>
  ) {
    const queue = [...items];
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        await worker(next);
      }
    });

    await Promise.all(runners);
  }

    async function uploadScaleJob(job: ScaleJob) {
      const listingJobId = job.listingId || generateListingId();
      const {
        designCandidate,
        pinterestCandidates,
        rootVideoCandidate,
        mockupCandidates,
        deliverableCandidates,
      } = parseScaleJobFiles(job);
      const deliverables = buildScaleDeliverables(job);

      const productValidation = validateImportedFolderProduct(
        deliverableCandidates,
        scaleProductType,
        scaleDeliveryFields
      );

      if (!productValidation.ok) {
        throw new Error(
          productValidation.message ||
            "The imported folder does not match the selected product."
        );
      }

      if (deliverableCandidates.length > 0 && deliverables.length === 0) {
        throw new Error(
          "Scale detected delivery files, but could not map them to the selected product."
        );
      }

    if (!designCandidate) {
      throw new Error("Missing Midjourney design");
    }

    updateScaleJob(job.id, (current) => ({
      ...current,
      listingId: listingJobId,
      status: "uploading",
      stepLabel: "Uploading",
      errorMessage: null,
    }));

    const designExt =
      designCandidate.name.split(".").pop()?.toLowerCase() ||
      (designCandidate.type === "image/png"
        ? "png"
        : designCandidate.type === "image/webp"
          ? "webp"
          : "jpg");

    const uploadedDesign = await retryAsync(
      async () => {
        return uploadMockupForListing(designCandidate, `design.${designExt}`, listingJobId);
      },
      {
        label: `${job.folderName}: failed to upload design`,
      }
    );

      const uploadedMockups: ScaleUploadedMockup[] = [];
      const uploadedPins: ScalePinterestPin[] = [];
      const uploadedDeliverableFieldIds: string[] = [];

    for (let index = 0; index < mockupCandidates.length; index++) {
      const file = mockupCandidates[index];
      const ext =
        file.name.split(".").pop()?.toLowerCase() ||
        (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg");

      const upload = await retryAsync(
        async () => {
          return uploadMockupForListing(file, `mockup-${index + 1}.${ext}`, listingJobId);
        },
        {
          label: `${job.folderName}: failed to upload mockup ${index + 1}`,
        }
      );

      uploadedMockups.push({
        id: uid(),
        position: index + 1,
        url: upload.url,
      });
    }

    if (rootVideoCandidate) {
      const ext = rootVideoCandidate.name.split(".").pop()?.toLowerCase() || "mp4";
      await retryAsync(
        async () => {
          await uploadMockupForListing(rootVideoCandidate, `video.${ext}`, listingJobId);
        },
        {
          label: `${job.folderName}: failed to upload video`,
        }
      );
    }

      for (const item of deliverables) {
        await retryAsync(
          async () => {
            await uploadDeliverableForListing(
              item.file,
            getDeliveryFilename(item.field, item.file),
            listingJobId
          );
        },
          {
            label: `${job.folderName}: failed to upload deliverable ${item.field.label}`,
          }
        );
        uploadedDeliverableFieldIds.push(item.field.id);
      }

    for (let index = 0; index < pinterestCandidates.length; index++) {
      const file = pinterestCandidates[index];
      const ext = getFileExtension(file, "jpg");

      const upload = await retryAsync(
        async () => {
          return uploadPinterestForListing(file, `pin-${index + 1}.${ext}`, listingJobId);
        },
        {
          label: `${job.folderName}: failed to upload Pinterest image ${index + 1}`,
        }
      );

      uploadedPins.push({
        id: uid(),
        position: index + 1,
        url: upload.url,
      });
    }

    updateScaleJob(job.id, (current) => ({
      ...current,
      listingId: listingJobId,
      status: "uploaded",
      stepLabel: "Upload complete",
        errorMessage: null,
        designUrl: uploadedDesign.url,
        mockupsUploaded: uploadedMockups,
        uploadedDeliverableFieldIds,
        pinterestPins: uploadedPins,
      }));
    }

  async function uploadScaleJobs() {
    const eligible = scaleJobs.filter(
      (job) => job.status === "ready" || job.status === "failed"
    );

    if (eligible.length === 0) {
      setScaleMessage("No Scale jobs are ready to upload.");
      return;
    }

    setScaleUploading(true);
    setScaleMessage(`Uploading ${eligible.length} listing jobs to R2...`);
    let completedCount = 0;
    let failedCount = 0;

    await runWithConcurrency(eligible, 3, async (job) => {
      try {
        await uploadScaleJob(job);
        completedCount += 1;
      } catch (error: any) {
        failedCount += 1;
        updateScaleJob(job.id, (current) => ({
          ...current,
          listingId: current.listingId || job.listingId,
          status: "failed",
          stepLabel: "Upload failed",
          errorMessage: error?.message || "Scale upload failed",
        }));
      }
    });

    setScaleMessage(
      failedCount > 0
        ? `Upload finished. ${completedCount} complete, ${failedCount} failed.`
        : `Upload finished. ${completedCount} listing jobs complete.`
    );
    setScaleUploading(false);
  }

  async function generateSeoForScaleJob(job: ScaleJob) {
    if (!job.listingId || !job.designUrl || !job.mockupsUploaded?.length) {
      throw new Error("Upload this listing before generating SEO.");
    }

    if (!job.midjourneyPrompt.trim()) {
      throw new Error("Add the Midjourney prompt for this listing first.");
    }

    updateScaleJob(job.id, (current) => ({
      ...current,
      status: "generating_seo",
      stepLabel: "Generating SEO",
      errorMessage: null,
    }));

      const payload = {
        listingId: job.listingId,
        productType: scaleProductType,
        designUrl: job.designUrl,
        midjourneyPrompt: job.midjourneyPrompt,
        mockups: job.mockupsUploaded.map((item) => ({
        id: item.id,
        position: item.position,
        url: item.url,
      })),
    };

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `HTTP ${res.status}`);
    }

    const data: SeoResult = await res.json();
    const altMap = new Map<string, string>();

    for (const item of data.media || []) {
      altMap.set(item.id, item.alt_text);
    }

    updateScaleJob(job.id, (current) => ({
      ...current,
      status: "seo_complete",
      stepLabel: "SEO complete",
      errorMessage: null,
      seoResult: data,
      mockupsUploaded: (current.mockupsUploaded || []).map((item) => ({
        ...item,
        altText: altMap.get(item.id) ?? item.altText,
      })),
    }));
  }

  async function generateScaleSeoJobs() {
    const eligible = scaleJobs.filter(
      (job) =>
        (job.status === "uploaded" || job.status === "failed") &&
        !!job.designUrl &&
        !!job.mockupsUploaded?.length &&
        !!job.midjourneyPrompt.trim()
    );

    if (eligible.length === 0) {
      setScaleMessage("No uploaded Scale jobs are ready for SEO yet.");
      return;
    }

    setScaleSeoLoading(true);
    setScaleMessage(`Generating SEO for ${eligible.length} listing jobs...`);
    let completedCount = 0;
    let failedCount = 0;

    await runWithConcurrency(eligible, 3, async (job) => {
      try {
        await generateSeoForScaleJob(job);
        completedCount += 1;
      } catch (error: any) {
        failedCount += 1;
        updateScaleJob(job.id, (current) => ({
          ...current,
          status: "failed",
          stepLabel: "SEO failed",
          errorMessage: error?.message || "SEO generation failed",
        }));
      }
    });

    setScaleMessage(
      failedCount > 0
        ? `SEO finished. ${completedCount} complete, ${failedCount} failed.`
        : `SEO finished. ${completedCount} listing jobs complete.`
    );
    setScaleSeoLoading(false);
  }

    async function generatePdfForScaleJob(job: ScaleJob) {
      if (!job.listingId) {
        throw new Error("Upload this listing before generating the final PDF.");
      }

      if (!job.seoResult) {
        throw new Error("Generate SEO for this listing before creating the PDF.");
      }

      const requiredDeliverables = getRequiredScaleDeliverableFieldIds();
      const uploadedFieldIds = new Set(job.uploadedDeliverableFieldIds || []);
      const missingDeliverables = requiredDeliverables.filter(
        (fieldId) => !uploadedFieldIds.has(fieldId)
      );

      if (missingDeliverables.length > 0) {
        throw new Error("Upload the required deliverables before generating the final PDF.");
      }

      updateScaleJob(job.id, (current) => ({
        ...current,
        status: "generating_pdf",
      stepLabel: "Generating PDF",
      errorMessage: null,
    }));

      const res = await fetch("/api/generate/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: job.listingId, productType: scaleProductType }),
      });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Failed to generate delivery PDF");
    }

    const data = await res.json();

    updateScaleJob(job.id, (current) => ({
      ...current,
      status: "pdf_complete",
      stepLabel: "PDF complete",
      errorMessage: null,
      deliveryPdfUrl: data.url,
    }));
  }

    async function generateScalePdfJobs() {
      const requiredDeliverables = getRequiredScaleDeliverableFieldIds();
      const eligible = scaleJobs.filter(
        (job) =>
          (job.status === "seo_complete" || job.status === "failed") &&
          !!job.listingId &&
          !!job.seoResult &&
          requiredDeliverables.every((fieldId) =>
            (job.uploadedDeliverableFieldIds || []).includes(fieldId)
          )
      );

    if (eligible.length === 0) {
      setScaleMessage("No Scale jobs are ready to generate the final PDF yet.");
      return;
    }

    setScalePdfLoading(true);
    setScaleMessage(`Generating final PDFs for ${eligible.length} listing jobs...`);
    let completedCount = 0;
    let failedCount = 0;

    await runWithConcurrency(eligible, 3, async (job) => {
      try {
        await generatePdfForScaleJob(job);
        completedCount += 1;
      } catch (error: any) {
        failedCount += 1;
        updateScaleJob(job.id, (current) => ({
          ...current,
          status: "failed",
          stepLabel: "PDF failed",
          errorMessage: error?.message || "PDF generation failed",
        }));
      }
    });

    setScaleMessage(
      failedCount > 0
        ? `PDF finished. ${completedCount} complete, ${failedCount} failed.`
        : `PDF finished. ${completedCount} listing jobs complete.`
    );
    setScalePdfLoading(false);
  }

  async function syncEtsyForScaleJob(job: ScaleJob) {
    if (!job.seoResult || !job.deliveryPdfUrl) {
      throw new Error("Generate SEO and PDF for this listing before syncing Etsy.");
    }

    if (!job.etsyDraftListingId.trim()) {
      throw new Error("Enter the Etsy draft listing ID for this listing first.");
    }

    updateScaleJob(job.id, (current) => ({
      ...current,
      status: "syncing_etsy",
      stepLabel: "Syncing Etsy",
      errorMessage: null,
    }));

    const res = await fetch("/api/etsy/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        draftListingId: job.etsyDraftListingId.trim(),
        title: job.seoResult.title,
        description: job.seoResult.description_final,
        tags: job.seoResult.tags_13,
        mockups: (job.mockupsUploaded || []).map((item) => ({
          url: item.url,
          altText: item.altText,
          rank: item.position,
        })),
        deliveryPdfUrl: job.deliveryPdfUrl,
        deliveryPdfFilename: `${job.listingId || "listing"}.pdf`,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Failed to sync Etsy draft.");
    }

    const data: EtsySyncResponse = await res.json();

    updateScaleJob(job.id, (current) => ({
      ...current,
      status: "etsy_complete",
      stepLabel: "Etsy synced",
      errorMessage: null,
      etsyResult: data,
    }));
  }

  async function syncScaleEtsyJobs() {
    if (!etsyAuth?.connected) {
      setScaleMessage("Connect Etsy before syncing Scale jobs.");
      return;
    }

    const eligible = scaleJobs.filter(
      (job) =>
        (job.status === "pdf_complete" || job.status === "failed") &&
        !!job.seoResult &&
        !!job.deliveryPdfUrl &&
        !!job.etsyDraftListingId.trim()
    );

    if (eligible.length === 0) {
      setScaleMessage("No Scale jobs are ready to sync to Etsy yet.");
      return;
    }

    setScaleEtsyLoading(true);
    setScaleMessage(`Syncing ${eligible.length} listing jobs to Etsy...`);
    let completedCount = 0;
    let failedCount = 0;

    await runWithConcurrency(eligible, 2, async (job) => {
      try {
        await syncEtsyForScaleJob(job);
        completedCount += 1;
      } catch (error: any) {
        failedCount += 1;
        updateScaleJob(job.id, (current) => ({
          ...current,
          status: "failed",
          stepLabel: "Etsy failed",
          errorMessage: error?.message || "Etsy sync failed",
        }));
      }
    });

    setScaleMessage(
      failedCount > 0
        ? `Etsy sync finished. ${completedCount} complete, ${failedCount} failed.`
        : `Etsy sync finished. ${completedCount} listing jobs complete.`
    );
    setScaleEtsyLoading(false);
  }

  async function fetchPublishedEtsyUrlForScaleJob(job: ScaleJob) {
    if (!job.etsyDraftListingId.trim()) {
      throw new Error("Enter the Etsy listing ID for this listing first.");
    }

    const res = await fetch("/api/etsy/listing-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        listingId: job.etsyDraftListingId.trim(),
      }),
    });

    const data = (await res.json()) as EtsyListingUrlResponse;

    if (!res.ok) {
      throw new Error(data.error || "Failed to fetch Etsy listing URL.");
    }

    updateScaleJob(job.id, (current) => ({
      ...current,
      pinterestLink: data.listingUrl || current.pinterestLink,
      stepLabel: data.listingUrl ? "Published Etsy URL loaded" : current.stepLabel,
      errorMessage: null,
    }));
  }

  async function fetchScalePublishedEtsyUrls() {
    const eligible = scaleJobs.filter(
      (job) =>
        (job.status === "etsy_complete" || job.status === "failed") &&
        !!job.etsyDraftListingId.trim()
    );

    if (eligible.length === 0) {
      setScaleMessage("No Scale jobs are ready to fetch a published Etsy URL yet.");
      return;
    }

    setScaleEtsyUrlLoading(true);
    setScaleMessage(`Fetching published Etsy URLs for ${eligible.length} listing jobs...`);

    let completedCount = 0;
    let failedCount = 0;

    await runWithConcurrency(eligible, 3, async (job) => {
      try {
        await fetchPublishedEtsyUrlForScaleJob(job);
        completedCount += 1;
      } catch (error: any) {
        failedCount += 1;
        updateScaleJob(job.id, (current) => ({
          ...current,
          status: "failed",
          stepLabel: "Published Etsy URL failed",
          errorMessage: error?.message || "Failed to fetch Etsy listing URL.",
        }));
      }
    });

    setScaleMessage(
      failedCount > 0
        ? `Etsy URL fetch finished. ${completedCount} complete, ${failedCount} failed.`
        : `Etsy URL fetch finished. ${completedCount} listing jobs complete.`
    );
    setScaleEtsyUrlLoading(false);
  }

  async function generatePinterestForScaleJob(job: ScaleJob) {
    if (!job.seoResult || !job.pinterestPins?.length) {
      throw new Error("Upload and generate SEO before creating Pinterest copy.");
    }

    if (!job.pinterestLink.trim()) {
      throw new Error("Fetch the published Etsy URL before generating Pinterest copy.");
    }

    updateScaleJob(job.id, (current) => ({
      ...current,
      status: "generating_pinterest",
      stepLabel: "Generating Pinterest",
      errorMessage: null,
    }));

    const res = await fetch("/api/generate/pinterest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
        body: JSON.stringify({
          productType: scaleProductType,
          listingTitle: job.seoResult.title,
        listingDescription: job.seoResult.description_final,
        listingKeywords: job.seoResult.description_keywords_5,
        destinationLink: job.pinterestLink,
        pins: job.pinterestPins.map((item) => ({
          id: item.id,
          url: item.url,
        })),
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Failed to generate Pinterest copy");
    }

    const data: {
      pins?: Array<{
        id: string;
        title: string;
        description: string;
      }>;
    } = await res.json();

    const pinMap = new Map((data.pins || []).map((item) => [item.id, item]));

    updateScaleJob(job.id, (current) => ({
      ...current,
      status: "pinterest_complete",
      stepLabel: "Pinterest ready",
      errorMessage: null,
      pinterestPins: (current.pinterestPins || []).map((item) => ({
        ...item,
        title: pinMap.get(item.id)?.title || item.title,
        description: pinMap.get(item.id)?.description || item.description,
      })),
    }));
  }

  async function generateScalePinterestJobs() {
    const eligible = scaleJobs.filter(
      (job) =>
        (job.status === "etsy_complete" ||
          job.status === "pdf_complete" ||
          job.status === "failed") &&
        !!job.seoResult &&
        !!job.pinterestPins?.length &&
        !!job.pinterestLink.trim()
    );

    if (eligible.length === 0) {
      setScaleMessage("No Scale jobs are ready for Pinterest generation yet.");
      return;
    }

    setScalePinterestLoading(true);
    setScaleMessage(`Generating Pinterest copy for ${eligible.length} listing jobs...`);
    let completedCount = 0;
    let failedCount = 0;

    await runWithConcurrency(eligible, 3, async (job) => {
      try {
        await generatePinterestForScaleJob(job);
        completedCount += 1;
      } catch (error: any) {
        failedCount += 1;
        updateScaleJob(job.id, (current) => ({
          ...current,
          status: "failed",
          stepLabel: "Pinterest failed",
          errorMessage: error?.message || "Pinterest generation failed",
        }));
      }
    });

    setScaleMessage(
      failedCount > 0
        ? `Pinterest finished. ${completedCount} complete, ${failedCount} failed.`
        : `Pinterest finished. ${completedCount} listing jobs complete.`
    );
    setScalePinterestLoading(false);
  }

  async function publishPinterestForScaleJob(job: ScaleJob) {
    if (!pinterestAuth?.connected) {
      throw new Error("Connect Pinterest before publishing Scale jobs.");
    }

    if (!selectedPinterestBoardId) {
      throw new Error("Select a Pinterest board before publishing Scale jobs.");
    }

    const readyPins = (job.pinterestPins || []).filter(
      (pin) => pin.url && pin.title && pin.description
    );

    if (readyPins.length === 0) {
      throw new Error("Generate Pinterest copy for this listing before publishing.");
    }

    updateScaleJob(job.id, (current) => ({
      ...current,
      status: "publishing_pinterest",
      stepLabel: "Publishing Pinterest",
      errorMessage: null,
    }));

    const res = await fetch("/api/pinterest/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        boardId: selectedPinterestBoardId,
        destinationLink: job.pinterestLink,
        pins: readyPins.map((pin) => ({
          id: pin.id,
          title: pin.title,
          description: pin.description,
          imageUrl: pin.url,
          altText: undefined,
        })),
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Failed to publish Pinterest pins");
    }

    const data: {
      results?: Array<{
        id: string;
        ok: boolean;
        pinId?: string;
        url?: string | null;
        error?: string;
      }>;
    } = await res.json();

    const resultMap = new Map((data.results || []).map((item) => [item.id, item]));
    const hasFailure = (data.results || []).some((item) => !item.ok);

    if (hasFailure) {
      throw new Error("One or more Pinterest pins failed to publish.");
    }

    updateScaleJob(job.id, (current) => ({
      ...current,
      status: "published",
      stepLabel: "Pinterest published",
      errorMessage: null,
      pinterestPins: (current.pinterestPins || []).map((pin) => ({
        ...pin,
        publishedPinId: resultMap.get(pin.id)?.pinId || pin.publishedPinId,
        publishUrl: resultMap.get(pin.id)?.url ?? pin.publishUrl ?? null,
        publishError: resultMap.get(pin.id)?.error || null,
      })),
    }));
  }

  async function publishScalePinterestJobs() {
    if (!pinterestAuth?.connected) {
      setScaleMessage("Connect Pinterest before publishing Scale jobs.");
      return;
    }

    if (!selectedPinterestBoardId) {
      setScaleMessage("Select a Pinterest board before publishing Scale jobs.");
      return;
    }

    const eligible = scaleJobs.filter(
      (job) =>
        (job.status === "pinterest_complete" || job.status === "failed") &&
        !!job.pinterestPins?.some((pin) => pin.title && pin.description)
    );

    if (eligible.length === 0) {
      setScaleMessage("No Scale jobs are ready to publish on Pinterest yet.");
      return;
    }

    setScalePinterestPublishing(true);
    setScaleMessage(`Publishing Pinterest pins for ${eligible.length} listing jobs...`);
    let completedCount = 0;
    let failedCount = 0;

    await runWithConcurrency(eligible, 2, async (job) => {
      try {
        await publishPinterestForScaleJob(job);
        completedCount += 1;
      } catch (error: any) {
        failedCount += 1;
        updateScaleJob(job.id, (current) => ({
          ...current,
          status: "failed",
          stepLabel: "Pinterest publish failed",
          errorMessage: error?.message || "Pinterest publish failed",
        }));
      }
    });

    setScaleMessage(
      failedCount > 0
        ? `Pinterest publish finished. ${completedCount} complete, ${failedCount} failed.`
        : `Pinterest publish finished. ${completedCount} listing jobs complete.`
    );
    setScalePinterestPublishing(false);
  }

  function resetAll() {
    clearDesign();
    clearListingMedia();
    clearPinterestImages();
    setMidjourneyPrompt("");
    setPinterestLink("");
    setSelectedPinterestBoardId("");
    setDeliveryFiles({});
    setDeliveryUploadedFields({});
    setDeliveryPdfUrl(null);
    setError(null);
    setUploadMessage(null);
    setResult(null);
  }

  function handleProductTypeChange(nextProductType: ProductType) {
    if (nextProductType === productType) return;
    resetAll();
    setProductType(nextProductType);
  }

  function handleScaleProductTypeChange(nextProductType: ProductType) {
    if (nextProductType === scaleProductType) return;
    resetScale();
    setScaleProductType(nextProductType);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = mockups.findIndex((m) => m.id === active.id);
    const newIndex = mockups.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    setMockups((items) => arrayMove(items, oldIndex, newIndex));
  }

  function normalizeFolderPath(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\\/g, "/")
      .toLowerCase();
  }

  function pathHasFolderSegment(path: string, ...segments: string[]) {
    const normalized = normalizeFolderPath(path).replace(/^\/+|\/+$/g, "");

    return segments.some((segment) => {
      const cleaned = normalizeFolderPath(segment).replace(/^\/+|\/+$/g, "");
      return (
        normalized === cleaned ||
        normalized.startsWith(`${cleaned}/`) ||
        normalized.includes(`/${cleaned}/`)
      );
    });
  }

  function getFolderAwareName(file: File) {
    const relativePath = String((file as File & { webkitRelativePath?: string }).webkitRelativePath || "");
    return {
      relativePath,
      normalizedPath: normalizeFolderPath(relativePath || file.name),
      normalizedName: normalizeFolderPath(file.name),
    };
  }

  function getScaleImportedFileInfo(item: ScaleImportedFile) {
    const normalizedPath = normalizeFolderPath(item.relativePath || item.file.name);
    return {
      normalizedPath,
      normalizedName: normalizeFolderPath(item.file.name),
    };
  }

  function sortNumericFileNames(files: File[]) {
    return [...files].sort((a, b) => {
      const aMatch = a.name.match(/^(\d+)/);
      const bMatch = b.name.match(/^(\d+)/);
      const aNum = aMatch ? Number(aMatch[1]) : Number.MAX_SAFE_INTEGER;
      const bNum = bMatch ? Number(bMatch[1]) : Number.MAX_SAFE_INTEGER;
      if (aNum !== bNum) return aNum - bNum;
      return a.name.localeCompare(b.name);
    });
  }

  function sleep(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function retryAsync<T>(
    task: () => Promise<T>,
    options: {
      attempts?: number;
      label: string;
    }
  ) {
    const attempts = options.attempts ?? 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await task();
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await sleep(450 * attempt);
        }
      }
    }

    throw new Error(
      lastError instanceof Error
        ? `${options.label}: ${lastError.message}`
        : `${options.label}: Upload failed`
    );
  }

  async function uploadDeliverableToR2(file: File, filename: string) {
    const id = ensureListingId();
    return uploadFileToEndpoint(
      file,
      filename,
      id,
      "/api/upload/deliverable",
      "Deliverable upload failed"
    );
  }

  async function uploadDeliverableForListing(
    file: File,
    filename: string,
    listingId: string
  ) {
    return uploadFileToEndpoint(
      file,
      filename,
      listingId,
      "/api/upload/deliverable",
      "Deliverable upload failed"
    );
  }

  function classifyPrintableDeliverableField(
    file: File,
    fields: DeliveryField[] = activeDeliveryFields
  ): DeliveryField | null {
    const { normalizedName } = getFolderAwareName(file);

    if (/(^|[^0-9])2[-_x ]?3([^0-9]|$)/.test(normalizedName)) {
      return fields.find((field) => field.id === "ratio_2_3") || null;
    }
    if (/(^|[^0-9])3[-_x ]?4([^0-9]|$)/.test(normalizedName)) {
      return fields.find((field) => field.id === "ratio_3_4") || null;
    }
    if (/(^|[^0-9])4[-_x ]?5([^0-9]|$)/.test(normalizedName)) {
      return fields.find((field) => field.id === "ratio_4_5") || null;
    }
    if (/11[-_x ]?14/.test(normalizedName)) {
      return fields.find((field) => field.id === "ratio_11_14") || null;
    }
    if (/iso/.test(normalizedName)) {
      return fields.find((field) => field.id === "ratio_iso") || null;
    }

    return null;
  }

  function validateImportedFolderProduct(
    deliverableCandidates: File[],
    currentProductType: ProductType,
    printableFields: DeliveryField[] = activeDeliveryFields
  ) {
    if (deliverableCandidates.length === 0) {
      return {
        ok: true,
      };
    }

    const deliverableImages = deliverableCandidates.filter((file) =>
      file.type.startsWith("image/")
    );
    const deliverablePdfs = deliverableCandidates.filter(
      (file) => file.type === "application/pdf"
    );

    const printableMatches = deliverableImages.filter((file) =>
      classifyPrintableDeliverableField(file, printableFields)
    );

    const looksLikePrintable =
      printableMatches.length >= 3 ||
      printableMatches.length === deliverableImages.length && deliverableImages.length > 0;

    const looksLikeFrameTv =
      deliverableImages.length === 1 && printableMatches.length === 0;

    if (currentProductType === "frame_tv_art" && looksLikePrintable) {
      return {
        ok: false,
        message:
          "The selected product is Frame TV Art, but the imported final files look like Printable Wall Art ratios. Switch the product type and try again.",
      };
    }

    if (currentProductType === "printable_wall_art" && looksLikeFrameTv) {
      return {
        ok: false,
        message:
          "The selected product is Printable Wall Art, but the imported final files look like a single Frame TV Art deliverable. Switch the product type and try again.",
      };
    }

    if (
      currentProductType === "printable_wall_art" &&
      deliverableImages.length > 0 &&
      printableMatches.length === 0
    ) {
      return {
        ok: false,
        message:
          "The imported final files do not match the expected Printable Wall Art ratio naming. Use names such as 2x3, 3x4, 4x5, 11x14, and ISO.",
      };
    }

    if (
      currentProductType === "frame_tv_art" &&
      (deliverableImages.length !== 1 || deliverablePdfs.length > 1)
    ) {
      return {
        ok: false,
        message:
          "Frame TV Art imports should include one final design image and optionally one instructions PDF inside Diseños Finales.",
      };
    }

    if (currentProductType === "printable_wall_art" && deliverablePdfs.length > 0) {
      return {
        ok: false,
        message:
          "Printable Wall Art imports should only include image ratio files inside Diseños Finales.",
      };
    }

    if (
      currentProductType === "printable_wall_art" &&
      printableMatches.length > 0 &&
      printableMatches.length < printableFields.length
    ) {
      return {
        ok: false,
        message:
          "The Printable Wall Art folder is missing one or more ratio files. Include 2x3, 3x4, 4x5, 11x14, and ISO before importing.",
      };
    }

    return {
      ok: true,
    };
  }

  async function importListingFolder(files: File[]) {
    if (files.length === 0) return;

    try {
      setUploadMessage(null);

      const acceptedFiles = files.filter((file) => {
        const info = getFolderAwareName(file);
        if (info.normalizedName.includes("upscayl")) return false;
        if (
          file.type === "application/pdf" &&
          !pathHasFolderSegment(info.normalizedPath, "disenos finales")
        ) {
          return false;
        }
        return true;
      });

      const designCandidate = acceptedFiles.find((file) => {
        const info = getFolderAwareName(file);
        return file.type.startsWith("image/") && info.normalizedName.includes("midjourney");
      });

      const pinterestCandidates = sortNumericFileNames(
        acceptedFiles.filter((file) => {
          const info = getFolderAwareName(file);
          return (
            file.type.startsWith("image/") &&
            pathHasFolderSegment(info.normalizedPath, "pines", "pins")
          );
        })
      );

      const deliverableCandidates = acceptedFiles.filter((file) => {
        const info = getFolderAwareName(file);
        return (
          (file.type.startsWith("image/") || file.type === "application/pdf") &&
          pathHasFolderSegment(info.normalizedPath, "disenos finales")
        );
      });

      const productValidation = validateImportedFolderProduct(
        deliverableCandidates,
        productType
      );

      if (!productValidation.ok) {
        setUploadMessage(null);
        setError(productValidation.message || "The imported folder does not match the selected product.");
        return;
      }

      setError(null);
      setUploading(true);

      const rootVideoCandidate =
        acceptedFiles.find((file) => {
          const info = getFolderAwareName(file);
          return (
            file.type.startsWith("video/") &&
            !pathHasFolderSegment(info.normalizedPath, "pines", "pins") &&
            !pathHasFolderSegment(info.normalizedPath, "disenos finales")
          );
        }) || null;

      const mockupCandidates = sortNumericFileNames(
        acceptedFiles.filter((file) => {
          const info = getFolderAwareName(file);
          if (!file.type.startsWith("image/")) return false;
          if (designCandidate && file === designCandidate) return false;
          if (pathHasFolderSegment(info.normalizedPath, "pines", "pins")) return false;
          if (pathHasFolderSegment(info.normalizedPath, "disenos finales")) return false;
          return /^\d+\.(png|jpe?g|webp)$/i.test(file.name);
        })
      );

      const nextDesign = designCandidate
        ? await retryAsync(
            async () => {
              const ext =
                designCandidate.name.split(".").pop()?.toLowerCase() ||
                (designCandidate.type === "image/png"
                  ? "png"
                  : designCandidate.type === "image/webp"
                    ? "webp"
                    : "jpg");

              const upload = await uploadToR2(designCandidate, `design.${ext}`);
              return {
                file: designCandidate,
                previewUrl: URL.createObjectURL(designCandidate),
                r2Url: upload.url,
              };
            },
            {
              label: "Failed to upload the main design image",
            }
          )
        : null;

      const nextMockups: MediaItem[] = [];
      for (let index = 0; index < mockupCandidates.length; index++) {
        const file = mockupCandidates[index];
        const uploadedMockup = await retryAsync(
          async () => {
            const ext =
              file.name.split(".").pop()?.toLowerCase() ||
              (file.type === "image/png"
                ? "png"
                : file.type === "image/webp"
                  ? "webp"
                  : "jpg");
            const upload = await uploadToR2(file, `mockup-${index + 1}.${ext}`);

            return {
              id: uid(),
              file,
              previewUrl: URL.createObjectURL(file),
              r2Url: upload.url,
            };
          },
          {
            label: `Failed to upload mockup ${index + 1}`,
          }
        );

        nextMockups.push(uploadedMockup);
      }

      const nextVideo = rootVideoCandidate
        ? await retryAsync(
            async () => {
              const ext = rootVideoCandidate.name.split(".").pop()?.toLowerCase() || "mp4";
              const upload = await uploadToR2(rootVideoCandidate, `video.${ext}`);

              return {
                id: uid(),
                file: rootVideoCandidate,
                previewUrl: URL.createObjectURL(rootVideoCandidate),
                r2Url: upload.url,
              };
            },
            {
              label: "Failed to upload the listing video",
            }
          )
        : null;

      const nextDeliveryFiles: Record<string, File | null> = {};

      if (deliverableCandidates.length > 0) {
        const orderedDeliverables: Array<{
          file: File;
          field: DeliveryField;
        }> =
          productType === "frame_tv_art"
            ? [
                ...deliverableCandidates
                  .filter((file) => file.type.startsWith("image/"))
                  .slice(0, 1)
                  .map((file) => ({
                    file,
                    field:
                      activeDeliveryFields.find((candidate) => candidate.id === "design")!,
                  })),
                ...deliverableCandidates
                  .filter((file) => file.type === "application/pdf")
                  .slice(0, 1)
                  .map((file) => ({
                    file,
                    field:
                      activeDeliveryFields.find(
                        (candidate) => candidate.id === "instructions"
                      )!,
                  })),
              ].filter((item) => !!item.field)
            : deliverableCandidates
                .map((file) => {
                  const field = classifyPrintableDeliverableField(file);
                  return field ? { file, field } : null;
                })
                .filter(
                  (
                    item
                  ): item is {
                    file: File;
                    field: DeliveryField;
                  } => !!item
                )
                .sort(
                  (a, b) =>
                    activeDeliveryFields.findIndex((field) => field.id === a.field.id) -
                    activeDeliveryFields.findIndex((field) => field.id === b.field.id)
                );

        for (const item of orderedDeliverables) {
          const deliverable = item.file;
          const field = item.field;

          if (!field || !deliverable) continue;

          await retryAsync(
            async () => {
              await uploadDeliverableToR2(deliverable, getDeliveryFilename(field, deliverable));
            },
            {
              label: `Failed to upload deliverable ${field.label}`,
            }
          );

          nextDeliveryFiles[field.id] = deliverable;
        }
      }

      const nextPinterestItems: PinterestItem[] = [];
      for (let index = 0; index < pinterestCandidates.length; index++) {
        const file = pinterestCandidates[index];
        const uploadedPin = await retryAsync(
          async () => {
            const ext = getFileExtension(file, "jpg");
            const upload = await uploadPinterestToR2(file, `pin-${index + 1}.${ext}`);

            return {
              id: uid(),
              file,
              previewUrl: URL.createObjectURL(file),
              r2Url: upload.url,
            };
          },
          {
            label: `Failed to upload Pinterest image ${index + 1}`,
          }
        );

        nextPinterestItems.push(uploadedPin);
      }

      if (designCandidate && nextDesign) {
        if (designPreview) URL.revokeObjectURL(designPreview);
        setDesignFile(nextDesign.file);
        setDesignPreview(nextDesign.previewUrl);
        setDesignR2Url(nextDesign.r2Url);
      }

      if (mockupCandidates.length > 0) {
        for (const mockup of mockups) URL.revokeObjectURL(mockup.previewUrl);
        setMockups(nextMockups);
      }

      if (rootVideoCandidate && nextVideo) {
        setListingVideo((prev) => {
          if (prev) URL.revokeObjectURL(prev.previewUrl);
          return nextVideo;
        });
      }

      if (Object.keys(nextDeliveryFiles).length > 0) {
        setDeliveryFiles((prev) => ({ ...prev, ...nextDeliveryFiles }));
        setDeliveryUploadedFields((prev) => ({
          ...prev,
          ...Object.fromEntries(
            Object.keys(nextDeliveryFiles).map((fieldId) => [fieldId, true])
          ),
        }));
      }

      if (pinterestCandidates.length > 0) {
        for (const item of pinterestImages) URL.revokeObjectURL(item.previewUrl);
        setPinterestImages(nextPinterestItems);
      }

      const importedGroups = [
        designCandidate ? "design" : null,
        mockupCandidates.length > 0 ? `${mockupCandidates.length} mockups` : null,
        rootVideoCandidate ? "video" : null,
        Object.keys(nextDeliveryFiles).length > 0
          ? `${Object.keys(nextDeliveryFiles).length} deliverables`
          : null,
        pinterestCandidates.length > 0 ? `${pinterestCandidates.length} Pinterest images` : null,
      ].filter(Boolean);

      if (importedGroups.length > 0) {
        setUploadMessage(`Folder import completed successfully: ${importedGroups.join(", ")} uploaded to R2.`);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to import listing folder");
    } finally {
      setUploading(false);
    }
  }

  async function generateSeo() {
    if (!canGenerate || !designR2Url) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const id = ensureListingId();
      const payload = {
        listingId: id,
        productType,
        designUrl: designR2Url,
        midjourneyPrompt,
        mockups: mockups
          .filter((m) => !!m.r2Url)
          .map((m, index) => ({
            id: m.id,
            position: index + 1,
            url: m.r2Url!,
          })),
      };

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data: SeoResult = await res.json();

      const altMap = new Map<string, string>();
      for (const it of data.media || []) {
        altMap.set(it.id, it.alt_text);
      }

      setMockups((prev) =>
        prev.map((m) => ({
          ...m,
          altText: altMap.get(m.id) ?? m.altText,
        }))
      );

      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function uploadDeliverables() {
    const missingFields = activeDeliveryFields.filter((field) => !deliveryFiles[field.id]);

    if (missingFields.length > 0) {
      alert("Upload all required delivery files first");
      return;
    }

    setDeliveryLoading(true);
    setError(null);
    setUploadMessage(null);
    setDeliveryPdfUrl(null);

    const id = ensureListingId();

    try {
      const files = activeDeliveryFields.map((field) => {
        const file = deliveryFiles[field.id];

        if (!file) {
          throw new Error(`Missing required file for ${field.label}`);
        }

        return {
          file,
          name: getDeliveryFilename(field, file),
        };
      });

      const uploadedNow: string[] = [];

      for (const [index, f] of files.entries()) {
        const field = activeDeliveryFields[index];
        if (!field) continue;

        if (deliveryUploadedFields[field.id]) {
          continue;
        }

        await retryAsync(
          async () => {
            await uploadDeliverableToR2(f.file, f.name);
          },
          {
            label: `Failed to upload deliverable ${field.label}`,
          }
        );

        uploadedNow.push(field.id);
      }

      if (uploadedNow.length > 0) {
        setDeliveryUploadedFields((prev) => ({
          ...prev,
          ...Object.fromEntries(uploadedNow.map((fieldId) => [fieldId, true])),
        }));
      }

      const res = await fetch("/api/generate/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: id, productType }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to generate delivery PDF");
      }

      const data = await res.json();
      setDeliveryPdfUrl(data.url);
    } catch (e: any) {
      setError(e?.message || "Failed to prepare delivery assets");
    } finally {
      setDeliveryLoading(false);
    }
  }

  async function generatePinterestCopy() {
    if (!result || pinterestImages.length === 0) {
      setError("Generate SEO and upload Pinterest images first");
      return;
    }

    if (!pinterestLink.trim()) {
      setError("Fetch or enter the published Etsy URL before generating Pinterest copy.");
      return;
    }

    setPinterestLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/generate/pinterest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productType,
          listingTitle: result.title,
          listingDescription: result.description_final,
          listingKeywords: result.description_keywords_5,
          destinationLink: pinterestLink,
          pins: pinterestImages
            .filter((item) => !!item.r2Url)
            .map((item) => ({
              id: item.id,
              url: item.r2Url!,
            })),
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to generate Pinterest copy");
      }

      const data = await res.json();
      const pinMap = new Map<string, { title: string; description: string }>();

      for (const item of data.pins || []) {
        pinMap.set(item.id, {
          title: item.title,
          description: item.description,
        });
      }

      setPinterestImages((prev) =>
        prev.map((item) => ({
          ...item,
          title: pinMap.get(item.id)?.title ?? item.title,
          description: pinMap.get(item.id)?.description ?? item.description,
        }))
      );
    } catch (e: any) {
      setError(e?.message || "Failed to generate Pinterest copy");
    } finally {
      setPinterestLoading(false);
    }
  }

  function setDeliveryFile(fieldId: string, file: File | null) {
    setUploadMessage(null);
    setDeliveryFiles((prev) => {
      if (!file) {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      }

      return {
        ...prev,
        [fieldId]: file,
      };
    });

    setDeliveryUploadedFields((prev) => {
      if (!file) {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      }

      return {
        ...prev,
        [fieldId]: false,
      };
    });
  }

  function getDeliveryFilename(field: DeliveryField, file: File) {
    if (field.filenameBase.includes(".")) {
      return field.filenameBase;
    }

    const ext = getFileExtension(file, field.fallbackExtension || "jpg");
    return `${field.filenameBase}.${ext}`;
  }

  async function publishPinterestPins() {
    if (!pinterestAuth?.connected) {
      setError("Connect Pinterest first");
      return;
    }

    if (!selectedPinterestBoardId) {
      setError("Select a Pinterest board first");
      return;
    }

    if (pinterestImages.length === 0) {
      setError("Upload Pinterest images first");
      return;
    }

    const readyPins = pinterestImages.filter(
      (item) => item.r2Url && item.title && item.description
    );

    if (readyPins.length === 0) {
      setError("Generate Pinterest copy before publishing");
      return;
    }

    setPinterestPublishing(true);
    setError(null);

    try {
      const res = await fetch("/api/pinterest/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          boardId: selectedPinterestBoardId,
          destinationLink: pinterestLink,
          pins: readyPins.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            imageUrl: item.r2Url,
          })),
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to publish Pinterest pins");
      }

      const data = await res.json();
      const resultMap = new Map<
        string,
        { ok: boolean; pinId?: string; url?: string | null; error?: string }
      >();

      for (const item of data.results || []) {
        resultMap.set(item.id, item);
      }

      setPinterestImages((prev) =>
        prev.map((item) => {
          const published = resultMap.get(item.id);
          if (!published) return item;

          return {
            ...item,
            publishedPinId: published.pinId ?? item.publishedPinId,
            publishUrl: published.url ?? item.publishUrl ?? null,
            publishError: published.ok ? null : published.error || "Failed to publish",
          };
        })
      );

      setPinterestMessage("Pinterest publish request completed.");
    } catch (e: any) {
      setError(e?.message || "Failed to publish Pinterest pins");
    } finally {
      setPinterestPublishing(false);
    }
  }

  async function disconnectEtsy() {
    setEtsyLoading(true);
    try {
      await fetch("/api/etsy/disconnect", {
        method: "POST",
      });
      setEtsyAuth({ connected: false });
      setEtsyMessage("Etsy disconnected.");
    } catch {
      setEtsyMessage("Failed to disconnect Etsy.");
    } finally {
      setEtsyLoading(false);
    }
  }

  async function disconnectPinterest() {
    setPinterestAuthLoading(true);
    try {
      await fetch("/api/pinterest/disconnect", {
        method: "POST",
      });
      setPinterestAuth({ connected: false });
      setPinterestMessage("Pinterest disconnected.");
    } catch {
      setPinterestMessage("Failed to disconnect Pinterest.");
    } finally {
      setPinterestAuthLoading(false);
    }
  }

  async function syncEtsyDraft() {
    if (!result) {
      setEtsyMessage("Generate SEO before syncing Etsy.");
      return;
    }

    if (!deliveryPdfUrl) {
      setEtsyMessage("Generate the delivery PDF before syncing Etsy.");
      return;
    }

    const draftListingId = etsyDraftListingId.trim();
    if (!draftListingId) {
      setEtsyMessage("Enter the Etsy draft listing ID.");
      return;
    }

    setEtsySyncing(true);
    setEtsyMessage(null);

    try {
      const response = await fetch("/api/etsy/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draftListingId,
          title: result.title,
          description: result.description_final,
          tags: result.tags_13,
          mockups: mockups
            .filter((item): item is MediaItem & { r2Url: string } => !!item.r2Url)
            .map((item, index) => ({
              url: item.r2Url,
              altText: item.altText,
              rank: index + 1,
            })),
          deliveryPdfUrl,
          deliveryPdfFilename: `${listingId || "delivery"}.pdf`,
        }),
      });

      const data = (await response.json()) as EtsySyncResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to sync Etsy draft.");
      }

      setEtsyMessage(
        `Etsy draft ${data.listingId || draftListingId} updated successfully.`
      );
    } catch (syncError: any) {
      setEtsyMessage(syncError?.message || "Failed to sync Etsy draft.");
    } finally {
      setEtsySyncing(false);
    }
  }

  async function fetchPublishedEtsyUrl() {
    const listingId = etsyDraftListingId.trim();
    if (!listingId) {
      setEtsyMessage("Enter the Etsy listing ID first.");
      return;
    }

    setEtsyUrlLoading(true);
    setEtsyMessage(null);

    try {
      const response = await fetch("/api/etsy/listing-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ listingId }),
      });

      const data = (await response.json()) as EtsyListingUrlResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch Etsy listing URL.");
      }

      if (data.listingUrl) {
        setPinterestLink(data.listingUrl);
      }

      setEtsyMessage(`Published Etsy URL loaded for listing ${data.listingId || listingId}.`);
    } catch (syncError: any) {
      setEtsyMessage(syncError?.message || "Failed to fetch Etsy listing URL.");
    } finally {
      setEtsyUrlLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0f14] text-neutral-100">
      <button
        type="button"
        onClick={() => setWorkspaceOpen(true)}
        className="fixed left-5 top-5 z-40 inline-flex items-center gap-3 rounded-2xl border border-[#eeba2b]/20 bg-neutral-950/85 px-4 py-3 text-left shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur transition hover:border-[#eeba2b]/35 hover:bg-neutral-900/90"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#eeba2b]/20 bg-[#eeba2b]/10 text-[#f1cc61]">
          <Menu size={18} />
        </div>
        <div className="hidden sm:block">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f1cc61]">
            Workspace
          </div>
          <div className="text-sm font-medium text-neutral-100">
            {activeSection === "single"
              ? "Listing"
              : "Scale"}
          </div>
        </div>
      </button>

      {workspaceOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close workspace panel"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            onClick={() => setWorkspaceOpen(false)}
          />

          <div className="absolute inset-y-0 left-0 w-full max-w-[340px] border-r border-[#eeba2b]/15 bg-[#0b0f14]/96 p-5 shadow-[0_28px_80px_rgba(0,0,0,0.55)] backdrop-blur">
            <div className="flex h-full flex-col">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#f1cc61]">
                    Workspace
                  </div>
                  <div className="mt-1 text-sm leading-relaxed text-neutral-400">
                    Move through the app without shrinking the production workspace.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkspaceOpen(false)}
                  className="rounded-2xl border border-neutral-800 bg-neutral-950 p-2 text-neutral-300 transition hover:bg-neutral-900"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto pr-1">
                <SidebarNavItem
                  title="Listing"
                  subtitle="The current high-touch workflow for one listing at a time."
                  active={activeSection === "single"}
                  onClick={() => {
                    setActiveSection("single");
                    setWorkspaceOpen(false);
                  }}
                  icon={<LayoutDashboard size={18} />}
                />
                <SidebarNavItem
                  title="Scale"
                  subtitle="Upcoming production view for running many listings in parallel."
                  active={activeSection === "batch"}
                  onClick={() => {
                    setActiveSection("batch");
                    setWorkspaceOpen(false);
                  }}
                  icon={<Layers3 size={18} />}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl px-5 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-3 pb-8 pt-2 text-center">
          <Image
            src="/logo-final.png"
            alt="Autolisty"
            width={320}
            height={70}
            priority
          />
          <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
            Autolisty brings together artwork prep, listing copy, mockups, social
            assets, and delivery files in one organized creative workflow.
          </p>

          {listingId ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-[#eeba2b]/20 bg-[#eeba2b]/10 px-3 py-1 text-xs font-medium text-[#f1cc61]">
              <CheckCircle2 size={14} />
              Listing ID: {listingId}
            </div>
          ) : null}
        </div>

        <div>
          {activeSection === "single" ? (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
              <div className="space-y-6">
            <Card
              title="Product & Inputs"
              accent
              right={
                <div className="flex items-center gap-3">
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    {...({ webkitdirectory: "", directory: "" } as any)}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      void importListingFolder(files);
                      e.currentTarget.value = "";
                    }}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => folderInputRef.current?.click()}
                    disabled={loading || uploading}
                  >
                    Import folder
                  </Button>
                  <Button variant="ghost" onClick={resetAll} disabled={loading || uploading}>
                    Reset
                  </Button>
                </div>
              }
            >
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                      Product type
                    </div>
                    <select
                      value={productType}
                      onChange={(e) => handleProductTypeChange(e.target.value as ProductType)}
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
                    >
                      {PRODUCT_OPTIONS.map((product) => (
                        <option key={product.value} value={product.value}>
                          {product.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <TextArea
                    label="Midjourney prompt"
                    value={midjourneyPrompt}
                    onChange={setMidjourneyPrompt}
                    placeholder="Paste the original Midjourney prompt used to create the artwork."
                    rows={12}
                  />
                </div>

                <div className="space-y-5">
                  <Dropzone
                    title="Design image"
                    subtitle="Upload the main artwork that should be analyzed for the listing."
                    accept="image/png,image/jpeg,image/webp"
                    multiple={false}
                    onPick={setDesign}
                    onClear={designFile ? clearDesign : undefined}
                    preview={
                      <div className="rounded-3xl border border-neutral-800 bg-neutral-950 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                            Preview
                          </div>
                          {designFile ? (
                            <div className="max-w-[140px] truncate text-xs text-neutral-500">
                              {designFile.name}
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-4 flex min-h-[260px] items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/40">
                          {designPreview ? (
                            <img
                              src={designPreview}
                              alt="Design preview"
                              className="max-h-[240px] w-auto rounded-xl border border-neutral-800"
                            />
                          ) : (
                            <div className="text-sm text-neutral-500">
                              No design uploaded
                            </div>
                          )}
                        </div>

                        {designR2Url ? (
                          <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[#f1cc61]">
                            Uploaded successfully
                          </div>
                        ) : null}
                      </div>
                    }
                  />

                </div>
              </div>
            </Card>

            <Card
              title="Listing media"
              accent
              right={
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={clearListingMedia}
                    disabled={
                      (mockups.length === 0 && !listingVideo) || loading || uploading
                    }
                  >
                    Clear media
                  </Button>
                </div>
              }
            >
              <div className="space-y-6">
              <Dropzone
                title="Mockup images"
                subtitle="Upload and reorder your listing mockups. You can also import a full listing folder and the app will classify images, Pinterest assets, deliverables, and an optional video automatically."
                accept="image/png,image/jpeg,image/webp"
                multiple
                onPick={addMockups}
                preview={
                  mockups.length === 0 ? (
                    <div className="mt-3 text-sm text-neutral-500">
                      No mockups uploaded yet.
                    </div>
                  ) : (
                    <div className="mt-5">
                      <DndContext
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext items={mockupIds} strategy={rectSortingStrategy}>
                          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                            {mockups.map((m, idx) => (
                              <SortableMockupCard
                                key={m.id}
                                item={m}
                                index={idx}
                                onRemove={() => {
                                  URL.revokeObjectURL(m.previewUrl);
                                  setMockups((prev) => prev.filter((x) => x.id !== m.id));
                                }}
                                onCopyAlt={() => copyToClipboard(m.altText || "")}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )
                }
              />

              <FilePicker
                label="Listing video (optional)"
                accept="video/mp4,video/quicktime,video/x-msvideo,video/3gpp,video/mpeg"
                selectedName={listingVideo?.file.name || null}
                onChange={(file) => {
                  void setListingVideoFile(file);
                }}
                icon={<FileText size={18} />}
              />

              {listingVideo ? (
                <div className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950/80">
                  <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-neutral-100">
                        Listing video
                      </div>
                      <div className="text-xs text-neutral-500">
                        Stored with the listing media in R2. This does not affect alt
                        text generation.
                      </div>
                    </div>
                    <Button variant="secondary" onClick={clearListingVideo}>
                      <X size={16} />
                      Remove
                    </Button>
                  </div>
                  <div className="space-y-3 p-4">
                    <video
                      src={listingVideo.previewUrl}
                      controls
                      className="max-h-[440px] w-full rounded-2xl border border-neutral-800 bg-black"
                    />
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-300">
                      {listingVideo.file.name}
                    </div>
                  </div>
                </div>
              ) : null}
              </div>
            </Card>

            <Card title="Deliverables">
              <div className="space-y-5">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 text-sm text-neutral-300">
                  {selectedProduct.delivery.summary}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {activeDeliveryFields.map((field) => (
                    <FilePicker
                      key={field.id}
                      label={field.label}
                      accept={field.accept}
                      selectedName={deliveryFiles[field.id]?.name || null}
                      icon={
                        field.accept.includes("pdf") ? (
                          <FileText size={18} />
                        ) : (
                          <ImageIcon size={18} />
                        )
                      }
                      onChange={(file) => {
                        setDeliveryFile(field.id, file);
                      }}
                    />
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    onClick={uploadDeliverables}
                    disabled={deliveryLoading}
                  >
                    {deliveryLoading ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Generating...
                      </>
                    ) : (
                      <>
                        <FileText size={16} />
                        {selectedProduct.delivery.buttonLabel}
                      </>
                    )}
                  </Button>
                </div>

                {deliveryPdfUrl && (
                  <div className="rounded-2xl border border-[#eeba2b]/20 bg-[#eeba2b]/10 px-4 py-3 text-sm text-[#f1cc61]">
                    Delivery ready:
                    <a
                      href={deliveryPdfUrl}
                      target="_blank"
                      className="ml-2 font-semibold underline underline-offset-4"
                    >
                      Open PDF
                    </a>
                  </div>
                )}
              </div>
            </Card>

            <Card
              title="Pinterest"
              accent
              right={
                <div className="flex items-center gap-2">
                  {pinterestAuth?.connected ? (
                    <Button
                      variant="secondary"
                      onClick={() => void disconnectPinterest()}
                      disabled={pinterestAuthLoading}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => {
                        window.location.href = "/api/pinterest/auth/start";
                      }}
                      disabled={pinterestAuthLoading}
                    >
                      Connect Pinterest
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={clearPinterestImages}
                    disabled={pinterestImages.length === 0 || uploading || pinterestLoading}
                  >
                    Clear pins
                  </Button>
                </div>
              }
            >
              <div className="space-y-5">
                {pinterestMessage ? (
                  <div className="rounded-2xl border border-[#eeba2b]/20 bg-[#eeba2b]/10 p-4 text-sm text-[#f1cc61]">
                    {pinterestMessage}
                  </div>
                ) : null}

                {pinterestAuthLoading ? (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 text-sm text-neutral-300">
                    Checking Pinterest connection...
                  </div>
                ) : pinterestAuth?.connected ? (
                  <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                    <div className="text-sm font-medium text-neutral-100">
                      Connected to Pinterest
                    </div>
                    <div className="text-xs text-neutral-400">
                      Username: {pinterestAuth.user?.username || "Unknown"}
                    </div>
                    <div className="text-xs text-neutral-400">
                      Account type: {pinterestAuth.user?.account_type || "Unknown"}
                    </div>
                    <div className="text-xs text-neutral-400">
                      Scopes: {(pinterestAuth.scopes || []).join(", ") || "None"}
                    </div>
                    {pinterestAuth.boards?.length ? (
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                          Pinterest board
                        </div>
                        <select
                          value={selectedPinterestBoardId}
                          onChange={(e) => setSelectedPinterestBoardId(e.target.value)}
                          className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
                        >
                          <option value="">Select a board</option>
                          {pinterestAuth.boards.map((board) => (
                            <option key={board.id} value={board.id}>
                              {board.name}
                              {board.privacy ? ` (${board.privacy})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3 text-xs text-neutral-300">
                        No boards were returned by Pinterest.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 text-sm text-neutral-300">
                    No Pinterest account connected yet.
                  </div>
                )}

                <TextArea
                  label="Destination link"
                  value={pinterestLink}
                  onChange={setPinterestLink}
                  placeholder="Paste the Etsy product link when you have it. You can also leave this empty for now and add it manually later in Pinterest."
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    onClick={fetchPublishedEtsyUrl}
                    disabled={etsyUrlLoading || !etsyDraftListingId.trim()}
                  >
                    {etsyUrlLoading ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Fetching Etsy URL...
                      </>
                    ) : (
                      <>
                        <Upload size={16} />
                        Fetch published Etsy URL
                      </>
                    )}
                  </Button>
                </div>

                <Dropzone
                  title="Pinterest images"
                  subtitle="Upload 2:3 vertical images for Pinterest. These will be stored in R2 with the same listing ID."
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onPick={addPinterestImages}
                  preview={
                    pinterestImages.length === 0 ? (
                      <div className="mt-3 text-sm text-neutral-500">
                        No Pinterest images uploaded yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {pinterestImages.map((item, index) => (
                          <div
                            key={item.id}
                            className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950/80"
                          >
                            <div className="relative">
                              <div className="absolute left-3 top-3 z-10 rounded-full border border-[#eeba2b]/20 bg-neutral-950/90 px-3 py-1 text-xs font-semibold text-neutral-100">
                                Pin {index + 1}
                              </div>
                              <button
                                onClick={() => {
                                  URL.revokeObjectURL(item.previewUrl);
                                  setPinterestImages((prev) =>
                                    prev.filter((pin) => pin.id !== item.id)
                                  );
                                }}
                                className="absolute right-3 top-3 z-10 rounded-full border border-neutral-800 bg-neutral-950/90 p-2 text-neutral-200 hover:bg-neutral-900"
                                title="Remove"
                              >
                                <X size={16} />
                              </button>
                              <img
                                src={item.previewUrl}
                                alt=""
                                className="aspect-[2/3] w-full object-cover"
                              />
                            </div>

                            <div className="space-y-3 p-4">
                              <div>
                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                                  Pin title
                                </div>
                                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-3 text-xs leading-relaxed text-neutral-100">
                                  {item.title || "No title generated yet."}
                                </div>
                              </div>

                              <div>
                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                                  Pin description
                                </div>
                                <div className="min-h-[110px] rounded-2xl border border-neutral-800 bg-neutral-900/70 p-3 text-xs leading-relaxed text-neutral-100 whitespace-pre-wrap">
                                  {item.description || "No description generated yet."}
                                </div>
                              </div>

                              {item.publishedPinId ? (
                                <div className="rounded-2xl border border-[#eeba2b]/20 bg-[#eeba2b]/10 p-3 text-xs text-[#f1cc61]">
                                  Published to Pinterest
                                  {item.publishUrl ? (
                                    <a
                                      href={item.publishUrl}
                                      target="_blank"
                                      className="ml-2 underline underline-offset-4"
                                    >
                                      Open pin
                                    </a>
                                  ) : null}
                                </div>
                              ) : item.publishError ? (
                                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                                  {item.publishError}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                />

                <div className="flex justify-end">
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button
                      variant="secondary"
                      onClick={generatePinterestCopy}
                      disabled={!result || pinterestImages.length === 0 || pinterestLoading}
                    >
                      {pinterestLoading ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          Generate Pinterest Copy
                        </>
                      )}
                    </Button>

                    <Button
                      variant="primary"
                      onClick={publishPinterestPins}
                      disabled={
                        !pinterestAuth?.connected ||
                        !selectedPinterestBoardId ||
                        pinterestImages.length === 0 ||
                        pinterestPublishing
                      }
                    >
                      {pinterestPublishing ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          Publishing...
                        </>
                      ) : (
                        <>
                          <Upload size={16} />
                          Publish Pins
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {uploading ? (
              <div className="rounded-2xl border border-[#eeba2b]/20 bg-[#eeba2b]/10 p-4 text-sm text-[#f1cc61]">
                Uploading listing assets to R2...
              </div>
            ) : null}

            {uploadMessage ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                {uploadMessage}
              </div>
            ) : null}

                {error ? (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                    {error}
                  </div>
                ) : null}
              </div>

              <div className="space-y-6">
            <Card
              title="Etsy Connection"
              accent
              right={
                etsyAuth?.connected ? (
                  <Button
                    variant="secondary"
                    onClick={() => void disconnectEtsy()}
                    disabled={etsyLoading}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => {
                      window.location.href = "/api/etsy/auth/start";
                    }}
                    disabled={etsyLoading}
                  >
                    Connect Etsy
                  </Button>
                )
              }
            >
              <div className="space-y-4 text-sm text-neutral-400">
                <p>
                  Connect your Etsy account and sync a prepared listing into an
                  existing Etsy draft while keeping your template settings in Etsy.
                </p>

                {etsyMessage ? (
                  <div className="rounded-2xl border border-[#eeba2b]/20 bg-[#eeba2b]/10 p-4 text-sm text-[#f1cc61]">
                    {etsyMessage}
                  </div>
                ) : null}

                {etsyLoading ? (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 text-sm text-neutral-300">
                    Checking Etsy connection...
                  </div>
                ) : etsyAuth?.connected ? (
                  <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                    <div className="text-sm font-medium text-neutral-100">
                      Connected to Etsy
                    </div>
                    <div className="text-xs text-neutral-400">
                      User ID: {etsyAuth.userId}
                    </div>
                    <div className="text-xs text-neutral-400">
                      Scopes: {(etsyAuth.scopes || []).join(", ") || "None"}
                    </div>
                    {etsyAuth.shops?.length ? (
                      <div className="space-y-2">
                        {etsyAuth.shops.map((shop) => (
                          <div
                            key={`${shop.shop_id}-${shop.shop_name}`}
                            className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-xs text-neutral-300"
                          >
                            {shop.shop_name || "Unnamed shop"} {shop.shop_id ? `(${shop.shop_id})` : ""}
                          </div>
                        ))}
                      </div>
                    ) : etsyAuth.shopsError ? (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                        {etsyAuth.shopsError}
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-500">
                        Authentication succeeded, but no shops were returned yet.
                      </div>
                    )}

                    <div className="space-y-2 pt-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                        Draft listing ID
                      </div>
                      <input
                        value={etsyDraftListingId}
                        onChange={(e) => setEtsyDraftListingId(e.target.value)}
                        placeholder="Enter the Etsy draft listing ID"
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
                      />
                      <div className="text-xs text-neutral-500">
                        Sync sends title, tags, description, mockup images with alt
                        text, and the final delivery PDF to this draft.
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        variant="primary"
                        onClick={syncEtsyDraft}
                        disabled={
                          etsySyncing ||
                          !result ||
                          !deliveryPdfUrl ||
                          !etsyDraftListingId.trim()
                        }
                      >
                        {etsySyncing ? (
                          <>
                            <Loader2 className="animate-spin" size={16} />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <Upload size={16} />
                            Sync Draft
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 text-sm text-neutral-300">
                    No Etsy account connected yet.
                  </div>
                )}
              </div>
            </Card>

            <Card
              title="Generate"
              accent
              right={
                <Button
                  variant="primary"
                  onClick={generateSeo}
                  disabled={!canGenerate}
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Generating...
                    </>
                  ) : uploading ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Generate SEO
                    </>
                  )}
                </Button>
              }
            >
              <div className="space-y-3 text-sm text-neutral-400">
                <p>
                  Generate listing SEO from the main artwork and its Midjourney
                  prompt. If mockups are uploaded, the app also maps alt text to
                  each image.
                </p>
                <ul className="space-y-2 text-sm text-neutral-500">
                  <li>• prompt-aware Etsy title</li>
                  <li>• stronger description keywords</li>
                  <li>• structured Etsy tags</li>
                  <li>• alt text mapped to each mockup</li>
                </ul>
              </div>
            </Card>

            <Card title="Outputs">
              {!result ? (
                <div className="text-sm text-neutral-500">
                  Generate SEO to preview the final listing content.
                </div>
              ) : (
                <div className="space-y-4">
                  <OutputBlock
                    title="Titles"
                    subtitle="Ready to copy into Etsy"
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => copyToClipboard(result.title)}
                      >
                        <Copy size={16} />
                        Copy title
                      </Button>
                    }
                  >
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                        Title
                      </div>
                    
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 text-sm leading-relaxed text-neutral-100 break-words">
                        {result.title}
                      </div>
                    </div>
                  </OutputBlock>

                  <OutputBlock
                    title="Tags"
                    subtitle="Structured for Etsy"
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => copyToClipboard(result.tags_13.join(", "))}
                      >
                        <Copy size={16} />
                        Copy tags
                      </Button>
                    }
                  >
                    <div className="flex flex-wrap gap-2">
                      {result.tags_13.map((tag, idx) => (
                        <span
                          key={`${tag}-${idx}`}
                          className="rounded-full border border-[#eeba2b]/20 bg-[#eeba2b]/10 px-3 py-1.5 text-xs font-medium text-[#f4d56d]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </OutputBlock>

                  <OutputBlock
                    title="Description"
                    subtitle="Ready-to-use listing copy"
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => copyToClipboard(result.description_final)}
                      >
                        <Copy size={16} />
                        Copy description
                      </Button>
                    }
                  >
                    <div className="space-y-4">
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                          Keywords used
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {result.description_keywords_5.map((keyword, idx) => (
                            <span
                              key={`${keyword}-${idx}`}
                              className="rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1.5 text-xs text-neutral-200"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                          Full description
                        </div>
                        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 text-sm leading-7 text-neutral-100 whitespace-pre-wrap break-words">
                          {result.description_final}
                        </div>
                      </div>
                    </div>
                  </OutputBlock>
                </div>
              )}
            </Card>
              </div>
            </div>
            ) : activeSection === "batch" ? (
              <div className="space-y-6">
                <Card
                title="Scale"
                accent
                right={
                  <div className="w-full lg:min-w-[980px]">
                    <div className="flex flex-col gap-2 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center lg:gap-4">
                      <select
                        value={scaleProductType}
                        onChange={(e) =>
                          handleScaleProductTypeChange(e.target.value as ProductType)
                        }
                        disabled={scaleBusy}
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
                      >
                        {PRODUCT_OPTIONS.map((product) => (
                          <option key={product.value} value={product.value}>
                            {product.label}
                          </option>
                        ))}
                      </select>
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Button
                            variant={
                              scaleImportComplete ? "success" : "primary"
                            }
                            onClick={() => scaleInputRef.current?.click()}
                            disabled={
                              scaleBusy && !scaleImporting
                            }
                          >
                            {scaleImporting ? (
                              <>
                                <Loader2 className="animate-spin" size={16} />
                                  Importing...
                                </>
                              ) : (
                                <>
                                  <Upload size={16} />
                                  Import listings
                                </>
                              )}
                            </Button>
                          <Button
                            variant={
                              scaleUploadComplete
                                ? "success"
                                : scaleCanUpload
                                  ? "primary"
                                  : "secondary"
                            }
                            onClick={() => void uploadScaleJobs()}
                            disabled={
                              !scaleCanUpload ||
                              scaleBusy ||
                              scaleJobs.every(
                                    (job) => job.status !== "ready" && job.status !== "failed"
                                  )
                            }
                            >
                              {scaleUploading ? (
                                <>
                                  <Loader2 className="animate-spin" size={16} />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload size={16} />
                                  Upload
                                </>
                              )}
                            </Button>
                          <Button
                            variant={
                              scaleSeoComplete
                                ? "success"
                                : scaleCanGenerateSeo
                                  ? "primary"
                                  : "secondary"
                            }
                            onClick={() => void generateScaleSeoJobs()}
                            disabled={
                              !scaleCanGenerateSeo ||
                              scaleBusy ||
                              scaleJobs.every(
                                    (job) =>
                                      !(job.status === "uploaded" || job.status === "failed") ||
                                      !job.designUrl ||
                                    !job.mockupsUploaded?.length ||
                                    !job.midjourneyPrompt.trim()
                                )
                              }
                            >
                              {scaleSeoLoading ? (
                                <>
                                  <Loader2 className="animate-spin" size={16} />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Sparkles size={16} />
                                  Generate SEO
                                </>
                              )}
                            </Button>
                          <Button
                            variant={
                              scalePdfComplete
                                ? "success"
                                : scaleCanGeneratePdf
                                  ? "primary"
                                  : "secondary"
                            }
                            onClick={() => void generateScalePdfJobs()}
                            disabled={
                              !scaleCanGeneratePdf ||
                              scaleBusy ||
                              scaleJobs.every(
                                    (job) =>
                                      !(job.status === "seo_complete" || job.status === "failed") ||
                                      !job.listingId ||
                                    !job.seoResult ||
                                    !getRequiredScaleDeliverableFieldIds().every((fieldId) =>
                                      (job.uploadedDeliverableFieldIds || []).includes(fieldId)
                                    )
                                )
                              }
                            >
                              {scalePdfLoading ? (
                                <>
                                  <Loader2 className="animate-spin" size={16} />
                                  Generating PDF...
                                </>
                              ) : (
                                <>
                                  <FileText size={16} />
                                  Generate PDF
                                </>
                              )}
                            </Button>
                          </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
                          <Button
                            variant={
                              scaleEtsyComplete
                                ? "success"
                                : scaleCanSyncEtsy
                                  ? "primary"
                                  : "secondary"
                            }
                            onClick={() => void syncScaleEtsyJobs()}
                            disabled={
                              !scaleCanSyncEtsy ||
                              scaleBusy ||
                              !etsyAuth?.connected ||
                              scaleJobs.every(
                                    (job) =>
                                      !(job.status === "pdf_complete" || job.status === "failed") ||
                                    !job.seoResult ||
                                    !job.deliveryPdfUrl ||
                                    !job.etsyDraftListingId.trim()
                                )
                              }
                            >
                              {scaleEtsyLoading ? (
                                <>
                                  <Loader2 className="animate-spin" size={16} />
                                  Syncing Etsy...
                                </>
                              ) : (
                                <>
                                  <Upload size={16} />
                                  Sync Etsy
                                </>
                              )}
                            </Button>
                          <Button
                            variant={
                              scaleHasEtsyLinks
                                ? "success"
                                : scaleCanFetchEtsyUrls
                                  ? "primary"
                                  : "secondary"
                            }
                            onClick={() => void fetchScalePublishedEtsyUrls()}
                            disabled={
                              !scaleCanFetchEtsyUrls ||
                              scaleBusy ||
                              scaleJobs.every(
                                (job) =>
                                  !(job.status === "etsy_complete" || job.status === "failed") ||
                                  !job.etsyDraftListingId.trim()
                              )
                            }
                          >
                            {scaleEtsyUrlLoading ? (
                              <>
                                <Loader2 className="animate-spin" size={16} />
                                Fetching URLs...
                              </>
                            ) : (
                              <>
                                <Upload size={16} />
                                Fetch Etsy URL
                              </>
                            )}
                          </Button>
                          <Button
                            variant={
                              scalePinterestComplete
                                ? "success"
                                : scaleCanGeneratePinterest
                                  ? "primary"
                                  : "secondary"
                            }
                            onClick={() => void generateScalePinterestJobs()}
                            disabled={
                              !scaleCanGeneratePinterest ||
                              scaleBusy ||
                              scaleJobs.every(
                                    (job) =>
                                      !(
                                        job.status === "etsy_complete" ||
                                        job.status === "pdf_complete" ||
                                        job.status === "failed"
                                      ) ||
                                      !job.seoResult ||
                                      !job.pinterestPins?.length ||
                                      !job.pinterestLink.trim()
                                  )
                                }
                            >
                              {scalePinterestLoading ? (
                                <>
                                  <Loader2 className="animate-spin" size={16} />
                                  Generating Pins...
                                </>
                              ) : (
                                <>
                                  <Sparkles size={16} />
                                  Generate Pinterest
                                </>
                              )}
                            </Button>
                          <Button
                            variant={
                              scalePublishedComplete
                                ? "success"
                                : scaleCanPublishPinterest
                                  ? "primary"
                                  : "secondary"
                            }
                            onClick={() => void publishScalePinterestJobs()}
                            disabled={
                              !scaleCanPublishPinterest ||
                              scaleBusy ||
                              !pinterestAuth?.connected ||
                              !selectedPinterestBoardId ||
                              scaleJobs.every(
                                    (job) =>
                                      !(job.status === "pinterest_complete" || job.status === "failed") ||
                                      !job.pinterestPins?.some(
                                        (pin) => pin.title && pin.description
                                      )
                                  )
                                }
                            >
                              {scalePinterestPublishing ? (
                                <>
                                  <Loader2 className="animate-spin" size={16} />
                                  Publishing...
                                </>
                              ) : (
                                <>
                                  <Upload size={16} />
                                  Publish Pinterest
                                </>
                              )}
                            </Button>
                          <Button
                            variant="ghost"
                            onClick={resetScale}
                            disabled={
                              scaleBusy ||
                              scaleJobs.length === 0
                            }
                          >
                            Reset
                          </Button>
                        </div>
                      </div>
                    </div>
                      <input
                        ref={scaleInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        {...({ webkitdirectory: "", directory: "" } as any)}
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          void importScaleListings(files);
                          e.currentTarget.value = "";
                        }}
                      />
                    </div>
                  }
                  >
                    <div
                        onDragOver={(e) => {
                          e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void importScaleListings(
                          Array.from(e.dataTransfer.files || []),
                          e.dataTransfer.items
                        );
                      }}
                      className="space-y-4 rounded-3xl border border-dashed border-[#eeba2b]/18 bg-neutral-900/20 p-1 transition hover:border-[#eeba2b]/30"
                    >
                      <div className="space-y-4">
                          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="text-sm font-medium text-neutral-100">
                                  Imported listing jobs
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="rounded-2xl border border-[#eeba2b]/20 bg-[#eeba2b]/10 px-4 py-3 text-sm text-[#f1cc61]">
                                  {scaleJobs.length} job{scaleJobs.length === 1 ? "" : "s"}
                                </div>
                                <Button
                                  variant="ghost"
                                  onClick={() => void clearScaleSessionUploads()}
                                  disabled={
                                    scaleBusy ||
                                    !scaleJobs.some((job) => !!job.listingId)
                                  }
                                >
                                  {scaleDeletingAll ? "Clearing session..." : "Clear session uploads"}
                                </Button>
                              </div>
                            </div>
                          </div>

                        {scaleMessage ? (
                          <div className="rounded-2xl border border-[#eeba2b]/20 bg-[#eeba2b]/10 p-4 text-sm text-[#f1cc61]">
                            {scaleMessage}
                          </div>
                        ) : null}

                        {scaleJobs.length === 0 ? (
                          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-500">
                            No listing jobs imported yet.
                          </div>
                        ) : (
                          <div className="space-y-3">
                              {scaleJobs.map((job) => (
                                <div
                                  key={job.id}
                                  className={cn(
                                    "rounded-3xl border border-neutral-800 bg-neutral-950/80 p-5 transition hover:border-neutral-700"
                                  )}
                                >
                                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-2">
                                      <div className="text-sm font-semibold text-neutral-100">
                                        {job.folderName}
                                      </div>
                                    <div className="flex flex-wrap gap-2 text-xs text-neutral-400">
                                      <span className="rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1.5">
                                        Design {job.counts.design}
                                      </span>
                                      <span className="rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1.5">
                                        Media {job.counts.mockups}
                                      </span>
                                      <span className="rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1.5">
                                        Video {job.counts.videos}
                                      </span>
                                      <span className="rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1.5">
                                        Deliverables {job.counts.deliverables}
                                      </span>
                                        <span className="rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1.5">
                                          Pins {job.counts.pinterest}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div
                                        className={cn(
                                          "inline-flex w-fit items-center rounded-full border px-3 py-1.5 text-xs font-semibold",
                                          job.status === "published"
                                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                          : job.status === "generating_pdf" ||
                                                job.status === "generating_seo" ||
                                                job.status === "generating_pinterest" ||
                                                job.status === "publishing_pinterest" ||
                                                job.status === "syncing_etsy" ||
                                                job.status === "uploading"
                                              ? "border-[#eeba2b]/30 bg-[#eeba2b]/10 text-[#f1cc61]"
                                              : job.status === "pinterest_complete"
                                                ? "border-pink-500/30 bg-pink-500/10 text-pink-200"
                                              : job.status === "etsy_complete"
                                                ? "border-lime-500/30 bg-lime-500/10 text-lime-200"
                                              : job.status === "pdf_complete"
                                                ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                                              : job.status === "seo_complete"
                                                ? "border-violet-500/30 bg-violet-500/10 text-violet-200"
                                              : job.status === "uploaded"
                                                ? "border-teal-500/30 bg-teal-500/10 text-teal-200"
                                              : job.status === "ready"
                                                ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
                                                : "border-red-500/30 bg-red-500/10 text-red-200"
                                        )}
                                      >
                                        {job.status === "published"
                                          ? "Complete"
                                          : job.status === "publishing_pinterest"
                                            ? "Publishing Pinterest"
                                          : job.status === "pinterest_complete"
                                            ? "Pinterest ready"
                                          : job.status === "generating_pinterest"
                                            ? "Generating Pinterest"
                                          : job.status === "etsy_complete"
                                            ? "Etsy ready"
                                          : job.status === "syncing_etsy"
                                            ? "Syncing Etsy"
                                          : job.status === "generating_pdf"
                                            ? "Generating PDF"
                                          : job.status === "pdf_complete"
                                            ? "PDF ready"
                                          : job.status === "generating_seo"
                                            ? "Generating SEO"
                                            : job.status === "seo_complete"
                                              ? "SEO ready"
                                            : job.status === "uploading"
                                              ? "Uploading"
                                            : job.status === "uploaded"
                                              ? "Uploaded"
                                            : job.status === "ready"
                                              ? "Ready"
                                              : "Needs attention"}
                                      </div>
                                      <Button
                                        variant="ghost"
                                        onClick={() => setScaleSeoModalJobId(job.id)}
                                      >
                                        <Eye size={16} />
                                        View SEO
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        onClick={() => void clearScaleJobUploads(job.id)}
                                        disabled={
                                          scaleBusy ||
                                          !job.listingId ||
                                          scaleDeletingJobIds.includes(job.id)
                                        }
                                      >
                                        {scaleDeletingJobIds.includes(job.id)
                                          ? "Clearing..."
                                          : "Clear uploads"}
                                      </Button>
                                    </div>
                                  </div>

                                <div className="mt-3 text-xs text-neutral-500">
                                  {job.stepLabel}
                                  {job.listingId ? (
                                    <>
                                      {" "}
                                      <span className="text-neutral-400">•</span>{" "}
                                      Listing ID: <span className="text-neutral-300">{job.listingId}</span>
                                    </>
                                  ) : null}
                                </div>

                                <div className="mt-4 space-y-2">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                                    Midjourney prompt
                                  </div>
                                  <textarea
                                    value={job.midjourneyPrompt}
                                    onChange={(e) => setScaleJobPrompt(job.id, e.target.value)}
                                    placeholder="Paste the Midjourney prompt for this listing"
                                    rows={3}
                                    disabled={
                                      scaleUploading ||
                                      scaleSeoLoading ||
                                      scalePdfLoading ||
                                      scaleEtsyLoading ||
                                      scalePinterestLoading ||
                                      scalePinterestPublishing
                                    }
                                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
                                  />
                                </div>

                                <div className="mt-4 space-y-2">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                                    Etsy draft listing ID
                                  </div>
                                  <input
                                    value={job.etsyDraftListingId}
                                    onChange={(e) =>
                                      setScaleJobDraftListingId(job.id, e.target.value)
                                    }
                                    placeholder="Enter the Etsy draft listing ID"
                                    disabled={
                                      scaleUploading ||
                                      scaleSeoLoading ||
                                      scalePdfLoading ||
                                      scaleEtsyLoading ||
                                      scalePinterestLoading ||
                                      scalePinterestPublishing
                                    }
                                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
                                  />
                                </div>
                                <div className="mt-4 space-y-2">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                                    Pinterest destination link
                                  </div>
                                  <input
                                    value={job.pinterestLink}
                                    onChange={(e) =>
                                      setScaleJobPinterestLink(job.id, e.target.value)
                                    }
                                    placeholder="Paste the Etsy product link when available"
                                    disabled={
                                      scaleUploading ||
                                      scaleSeoLoading ||
                                      scalePdfLoading ||
                                      scaleEtsyLoading ||
                                      scalePinterestLoading ||
                                      scalePinterestPublishing
                                    }
                                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
                                  />
                                </div>

                                {job.errorMessage ? (
                                  <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
                                    {job.errorMessage}
                                  </div>
                                ) : job.issues.length > 0 ? (
                                  <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
                                    {job.issues.join(" • ")}
                                  </div>
                                ) : job.pinterestPins?.some((pin) => pin.title && pin.description) ? (
                                  <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
                                    Pinterest copy ready for this listing.
                                  </div>
                                ) : job.etsyResult?.ok ? (
                                  <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
                                    Etsy draft synced successfully for this listing.
                                  </div>
                                ) : job.deliveryPdfUrl ? (
                                  <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
                                    Final PDF ready for this listing.
                                  </div>
                                ) : job.seoResult ? (
                                  <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
                                    SEO ready: title, tags, description, and alt text were generated for this listing.
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>

        {scaleSeoModalJob ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close SEO review"
              className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
              onClick={() => setScaleSeoModalJobId(null)}
            />
            <div className="absolute inset-x-4 top-6 mx-auto max-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[28px] border border-[#eeba2b]/20 bg-[#0b0f14]/98 shadow-[0_32px_90px_rgba(0,0,0,0.55)] backdrop-blur sm:inset-x-6">
              <div className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#f1cc61]">
                    SEO Review
                  </div>
                  <div className="mt-1 text-lg font-semibold text-neutral-100">
                    {scaleSeoModalJob.folderName}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScaleSeoModalJobId(null)}
                  className="rounded-2xl border border-neutral-800 bg-neutral-950 p-2 text-neutral-300 transition hover:bg-neutral-900"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid max-h-[calc(100vh-8rem)] gap-6 overflow-y-auto p-5 sm:p-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-3xl border border-white/8 bg-neutral-950/70 p-3">
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                      Design
                    </div>
                    <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/60">
                      {scaleSeoModalDesignUrl ? (
                        <img
                          src={scaleSeoModalDesignUrl}
                          alt={`${scaleSeoModalJob.folderName} design`}
                          className="max-h-[340px] w-auto rounded-xl border border-neutral-800 object-contain"
                        />
                      ) : (
                        <div className="px-4 text-center text-sm text-neutral-500">
                          No Midjourney design detected for this listing.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs text-neutral-300">
                    <div className="rounded-2xl border border-white/8 bg-neutral-950/60 p-4">
                      <div className="text-neutral-500">Media</div>
                      <div className="mt-1 text-sm font-semibold text-neutral-100">
                        {scaleSeoModalJob.counts.mockups}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-neutral-950/60 p-4">
                      <div className="text-neutral-500">Pins</div>
                      <div className="mt-1 text-sm font-semibold text-neutral-100">
                        {scaleSeoModalJob.counts.pinterest}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-neutral-950/60 p-4">
                      <div className="text-neutral-500">Deliverables</div>
                      <div className="mt-1 text-sm font-semibold text-neutral-100">
                        {scaleSeoModalJob.counts.deliverables}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-neutral-950/60 p-4">
                      <div className="text-neutral-500">Video</div>
                      <div className="mt-1 text-sm font-semibold text-neutral-100">
                        {scaleSeoModalJob.counts.videos}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-white/8 bg-neutral-950/70 p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                        Title
                      </div>
                      <div className="mt-3 text-sm leading-relaxed text-neutral-100">
                        {scaleSeoModalJob.seoResult?.title || "SEO title not generated yet."}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-white/8 bg-neutral-950/70 p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                        Tags
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(scaleSeoModalJob.seoResult?.tags_13 || []).length ? (
                          scaleSeoModalJob.seoResult?.tags_13.map((tag, idx) => (
                            <span
                              key={`${scaleSeoModalJob.id}-tag-${idx}`}
                              className="rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1.5 text-xs text-neutral-200"
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <div className="text-sm text-neutral-500">Tags not generated yet.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/8 bg-neutral-950/70 p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                      Description
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(scaleSeoModalJob.seoResult?.description_keywords_5 || []).map((keyword, idx) => (
                        <span
                          key={`${scaleSeoModalJob.id}-keyword-${idx}`}
                          className="rounded-full border border-[#eeba2b]/20 bg-[#eeba2b]/10 px-3 py-1.5 text-xs text-[#f1cc61]"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 text-sm leading-relaxed text-neutral-300 whitespace-pre-wrap">
                      {scaleSeoModalJob.seoResult?.description_final || "Description not generated yet."}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/8 bg-neutral-950/70 p-5">
                    <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                      Mockups & alt text
                    </div>
                    {scaleSeoModalMockupUrls.length ? (
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {scaleSeoModalMockupUrls.map((item) => {
                          const altText =
                            scaleSeoModalJob.mockupsUploaded?.find((mockup) => mockup.id === item.id)
                              ?.altText || "Alt text not generated yet.";
                          return (
                            <div
                              key={item.id}
                              className="overflow-hidden rounded-3xl border border-white/8 bg-neutral-900/50 p-3"
                            >
                              <div className="mb-3 flex items-center justify-between text-xs text-neutral-400">
                                <span>Pos {item.position}</span>
                              </div>
                              <img
                                src={item.url}
                                alt={`Mockup ${item.position}`}
                                className="h-44 w-full rounded-2xl border border-neutral-800 object-cover"
                              />
                              <div className="mt-3 text-xs leading-relaxed text-neutral-300">
                                {altText}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-neutral-500">No mockups available for preview.</div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-white/8 bg-neutral-950/70 p-5">
                    <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                      Pinterest
                    </div>
                    {scaleSeoModalPinUrls.length ? (
                      <div className="grid gap-4 lg:grid-cols-3">
                        {scaleSeoModalPinUrls.map((item) => {
                          const pin =
                            scaleSeoModalJob.pinterestPins?.find((candidate) => candidate.id === item.id);
                          return (
                            <div
                              key={item.id}
                              className="overflow-hidden rounded-3xl border border-white/8 bg-neutral-900/50 p-3"
                            >
                              <div className="mb-3 text-xs text-neutral-400">
                                pin-{item.position}
                              </div>
                              <img
                                src={item.url}
                                alt={`Pin ${item.position}`}
                                className="h-56 w-full rounded-2xl border border-neutral-800 object-cover"
                              />
                              <div className="mt-3 space-y-2">
                                <div className="text-sm font-medium text-neutral-100">
                                  {pin?.title || "Pin title not generated yet."}
                                </div>
                                <div className="text-xs leading-relaxed text-neutral-300">
                                  {pin?.description || "Pin description not generated yet."}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-neutral-500">No Pinterest previews available yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <SiteFooter />
      </div>
    </main>
  );
}

