"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { generateListingId } from "@/lib/utils/generateListingId";
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
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Upload,
  X,
  FileText,
  CheckCircle2,
} from "lucide-react";

type ProductType = "frame_tv_art";

type MediaItem = {
  id: string;
  file: File;
  previewUrl: string;
  r2Url?: string;
  altText?: string;
};

type PinterestItem = {
  id: string;
  file: File;
  previewUrl: string;
  r2Url?: string;
  title?: string;
  description?: string;
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

function uid() {
  return crypto.randomUUID();
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
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-[#eeba2b] text-neutral-950 hover:bg-[#f4c84f] shadow-[0_10px_30px_rgba(238,186,43,0.18)]"
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
      <div className="flex items-center justify-between border-b border-white/6 px-6 py-5">
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
        className="aspect-square w-full cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
      </div>

      <div className="space-y-3 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
          Alt text
        </div>
        <div className="flex items-start gap-2">
          <div className="min-h-[88px] flex-1 rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-xs leading-relaxed text-neutral-100 break-words whitespace-normal">
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

export default function Page() {
  const [productType, setProductType] = useState<ProductType>("frame_tv_art");
  const [listingId, setListingId] = useState<string | null>(null);

  const [designFile, setDesignFile] = useState<File | null>(null);
  const [designPreview, setDesignPreview] = useState<string | null>(null);
  const [designR2Url, setDesignR2Url] = useState<string | null>(null);

  const [midjourneyPrompt, setMidjourneyPrompt] = useState("");

  const [mockups, setMockups] = useState<MediaItem[]>([]);
  const [pinterestImages, setPinterestImages] = useState<PinterestItem[]>([]);
  const [pinterestLink, setPinterestLink] = useState("");
  const [pinterestLoading, setPinterestLoading] = useState(false);

  const [deliverables, setDeliverables] = useState<File[]>([]);
  const [instructionsFile, setInstructionsFile] = useState<File | null>(null);

  const [deliveryPdfUrl, setDeliveryPdfUrl] = useState<string | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [etsyAuth, setEtsyAuth] = useState<EtsyAuthStatus | null>(null);
  const [etsyLoading, setEtsyLoading] = useState(true);
  const [etsyMessage, setEtsyMessage] = useState<string | null>(null);
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

    void loadEtsyStatus();
  }, []);

  function ensureListingId() {
    if (listingId) return listingId;
    const id = generateListingId();
    setListingId(id);
    return id;
  }

  async function uploadToR2(file: File, filename: string) {
    const id = ensureListingId();

    const fd = new FormData();
    fd.append("file", file);
    fd.append("listingId", id);
    fd.append("filename", filename);

    const res = await fetch("/api/upload/mockup", {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Upload failed");
    }

    return (await res.json()) as { key: string; url: string };
  }

  async function uploadPinterestToR2(file: File, filename: string) {
    const id = ensureListingId();

    const fd = new FormData();
    fd.append("file", file);
    fd.append("listingId", id);
    fd.append("filename", filename);

    const res = await fetch("/api/upload/pinterest", {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Pinterest upload failed");
    }

    return (await res.json()) as { key: string; url: string };
  }

  async function setDesign(files: File[]) {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return;

    setError(null);
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

  async function addMockups(files: File[]) {
    if (files.length === 0) return;

    setError(null);
    setUploading(true);

    try {
      const items: MediaItem[] = [];
      const startIndex = mockups.length;

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

      setMockups((prev) => [...prev, ...items]);
    } catch (e: any) {
      setError(e?.message || "Failed to upload mockups");
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

  async function addPinterestImages(files: File[]) {
    if (files.length === 0) return;

    setError(null);
    setUploading(true);

    try {
      const startIndex = pinterestImages.length;
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

      setPinterestImages((prev) => [...prev, ...items]);
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

  function resetAll() {
    clearDesign();
    clearMockups();
    clearPinterestImages();
    setListingId(null);
    setMidjourneyPrompt("");
    setPinterestLink("");
    setDeliverables([]);
    setInstructionsFile(null);
    setDeliveryPdfUrl(null);
    setError(null);
    setResult(null);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = mockups.findIndex((m) => m.id === active.id);
    const newIndex = mockups.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    setMockups((items) => arrayMove(items, oldIndex, newIndex));
  }

  async function generateSeo() {
    if (!canGenerate || !designR2Url) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const payload = {
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
    if (!deliverables.length || !instructionsFile) {
      alert("Upload design and instructions first");
      return;
    }

    setDeliveryLoading(true);
    setError(null);
    setDeliveryPdfUrl(null);

    const id = ensureListingId();

    try {
      const designExt = getFileExtension(deliverables[0], "jpg");
      const files = [
        { file: deliverables[0], name: `design.${designExt}` },
        { file: instructionsFile, name: "instructions.pdf" },
      ];

      for (const f of files) {
        const formData = new FormData();
        formData.append("file", f.file);
        formData.append("listingId", id);
        formData.append("filename", f.name);

        const uploadRes = await fetch("/api/upload/deliverable", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const txt = await uploadRes.text();
          throw new Error(txt || "Failed to upload deliverables");
        }
      }

      const res = await fetch("/api/generate/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: id }),
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

  return (
    <main className="min-h-screen bg-[#0b0f14] text-neutral-100">
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
            AI workflow for preparing optimized Etsy listings, organizing mockups,
            and managing digital delivery assets in one place.
          </p>

          {listingId ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-[#eeba2b]/20 bg-[#eeba2b]/10 px-3 py-1 text-xs font-medium text-[#f1cc61]">
              <CheckCircle2 size={14} />
              Listing ID: {listingId}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-6">
            <Card
              title="Product & Inputs"
              accent
              right={
                <Button variant="ghost" onClick={resetAll} disabled={loading || uploading}>
                  Reset
                </Button>
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
                      onChange={(e) => setProductType(e.target.value as ProductType)}
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-[#eeba2b]/50 focus:ring-1 focus:ring-[#eeba2b]/30"
                    >
                      <option value="frame_tv_art">Frame TV Art (Digital)</option>
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
              title="Listing mockups"
              accent
              right={
                <Button
                  variant="secondary"
                  onClick={clearMockups}
                  disabled={mockups.length === 0 || loading || uploading}
                >
                  Clear mockups
                </Button>
              }
            >
              <Dropzone
                title="Mockup images"
                subtitle="Upload and reorder your listing mockups. This section uses the full available width for easier visual review."
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
            </Card>

            <Card
              title="Pinterest"
              accent
              right={
                <Button
                  variant="secondary"
                  onClick={clearPinterestImages}
                  disabled={pinterestImages.length === 0 || uploading || pinterestLoading}
                >
                  Clear pins
                </Button>
              }
            >
              <div className="space-y-5">
                <TextArea
                  label="Destination link"
                  value={pinterestLink}
                  onChange={setPinterestLink}
                  placeholder="Paste the Etsy product link when you have it. You can also leave this empty for now and add it manually later in Pinterest."
                  rows={3}
                />

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
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                />

                <div className="flex justify-end">
                  <Button
                    variant="primary"
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
                </div>
              </div>
            </Card>

            <Card title="Deliverables">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FilePicker
                    label="Final design file"
                    accept="image/png,image/jpeg"
                    selectedName={deliverables[0]?.name || null}
                    icon={<ImageIcon size={18} />}
                    onChange={(file) => {
                      if (!file) return;
                      setDeliverables([file]);
                    }}
                  />

                  <FilePicker
                    label="Instructions PDF"
                    accept="application/pdf"
                    selectedName={instructionsFile?.name || null}
                    icon={<FileText size={18} />}
                    onChange={(file) => {
                      setInstructionsFile(file);
                    }}
                  />
                </div>

                <div className="xl:pb-1">
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
                        Generate Delivery PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {deliveryPdfUrl && (
                <div className="mt-5 rounded-2xl border border-[#eeba2b]/20 bg-[#eeba2b]/10 px-4 py-3 text-sm text-[#f1cc61]">
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
            </Card>

            {uploading ? (
              <div className="rounded-2xl border border-[#eeba2b]/20 bg-[#eeba2b]/10 p-4 text-sm text-[#f1cc61]">
                Uploading images to R2...
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
                  Connect your Etsy account to validate OAuth access and confirm
                  the app can read your shop before we implement draft syncing.
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

        <div className="mt-12 border-t border-white/6 pt-6 text-center text-xs text-neutral-600">
          © 2026 Autolisty
        </div>
      </div>
    </main>
  );
}
