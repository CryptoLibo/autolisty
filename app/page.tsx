"use client";

import React, { useMemo, useRef, useState } from "react";
import { DndContext, DragEndEvent, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  Copy,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

type ProductType = "frame_tv_art";

type MediaItem = {
  id: string; // stable ID for binding
  file: File;
  previewUrl: string;
  altText?: string;
};

type SeoResult = {
  product_name?: string;

  title_short_14_words: string;
  title_long_135_140_chars: string;

  description_keywords_5: string[];
  description_final: string;

  tags_13: string[];

  media: Array<{
    id: string;
    order: number;
    position: number;
    alt_text: string;
  }>;
};

function uid() {
  return crypto.randomUUID();
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
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-white text-neutral-950 hover:bg-neutral-200 disabled:bg-neutral-800 disabled:text-neutral-400"
      : variant === "secondary"
        ? "bg-neutral-800 text-neutral-100 hover:bg-neutral-700 disabled:opacity-60"
        : "bg-transparent text-neutral-200 hover:bg-neutral-800/60 disabled:opacity-50";
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
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
        <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
        {right}
      </div>
      <div className="p-5">{children}</div>
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
      <div className="text-xs font-semibold text-neutral-300">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-neutral-600"
      />
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-neutral-300">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-neutral-600"
      />
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
  onPick: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  preview?: React.ReactNode;
  onClear?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    onPick(Array.from(files));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    handleFiles(files);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-neutral-300">{title}</div>
          <div className="text-xs text-neutral-500">{subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button variant="secondary" onClick={() => inputRef.current?.click()}>
            <Upload size={16} /> Upload
          </Button>
          {onClear ? (
            <Button variant="ghost" onClick={onClear}>
              <X size={16} /> Clear
            </Button>
          ) : null}
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={onDrop}
        className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4"
      >
        <div className="flex items-center gap-3 text-neutral-300">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950">
            <ImageIcon size={18} />
          </div>
          <div className="text-sm">
            <span className="font-semibold text-neutral-100">
              Drag & drop
            </span>{" "}
            <span className="text-neutral-400">files here, or use Upload.</span>
          </div>
        </div>

        {preview ? <div className="mt-4">{preview}</div> : null}
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
      className="group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950"
    >
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/90 px-3 py-1 text-xs font-semibold text-neutral-100">
        Pos {index + 1}
        <span className="text-neutral-500 font-medium">drag</span>
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
      </div>

      <div className="space-y-2 p-3">
        <div className="text-[11px] font-semibold text-neutral-300">Alt text</div>
        <div className="flex items-start gap-2">
          <div className="min-h-[44px] flex-1 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-100">
            {item.altText ? (
              item.altText
            ) : (
              <span className="text-neutral-500">—</span>
            )}
          </div>
          <Button variant="secondary" disabled={!item.altText} onClick={onCopyAlt}>
            <Copy size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [productType, setProductType] = useState<ProductType>("frame_tv_art");

  // Design
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [designPreview, setDesignPreview] = useState<string | null>(null);

  // Keywords
  const [primaryKeywords, setPrimaryKeywords] = useState("");
  const [secondaryKeywords, setSecondaryKeywords] = useState("");
  const [contextInfo, setContextInfo] = useState("");

  // Optional competitor (accordion)
  const [competitorsOpen, setCompetitorsOpen] = useState(false);
  const [competitorTitles, setCompetitorTitles] = useState("");
  const [competitorTags, setCompetitorTags] = useState("");

  // Mockups
  const [mockups, setMockups] = useState<MediaItem[]>([]);

  // Result
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SeoResult | null>(null);

  const canGenerate =
    !!designFile &&
    mockups.length > 0 &&
    primaryKeywords.trim().length > 0 &&
    secondaryKeywords.trim().length > 0 &&
    !loading;

  const mockupIds = useMemo(() => mockups.map((m) => m.id), [mockups]);

  function setDesign(files: File[]) {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return;

    if (designPreview) URL.revokeObjectURL(designPreview);

    setDesignFile(f);
    setDesignPreview(URL.createObjectURL(f));
  }

  function addMockups(files: File[]) {
    const items: MediaItem[] = [];
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      items.push({
        id: uid(),
        file: f,
        previewUrl: URL.createObjectURL(f),
      });
    }
    setMockups((prev) => [...prev, ...items]);
  }

  function clearDesign() {
    if (designPreview) URL.revokeObjectURL(designPreview);
    setDesignFile(null);
    setDesignPreview(null);
  }

  function clearMockups() {
    for (const m of mockups) URL.revokeObjectURL(m.previewUrl);
    setMockups([]);
  }

  function resetAll() {
    clearDesign();
    clearMockups();
    setPrimaryKeywords("");
    setSecondaryKeywords("");
    setContextInfo("");
    setCompetitorTitles("");
    setCompetitorTags("");
    setCompetitorsOpen(false);
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
    if (!canGenerate || !designFile) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("productType", productType);

      fd.append("designImage", designFile);
      fd.append("primaryKeywords", primaryKeywords);
      fd.append("secondaryKeywords", secondaryKeywords);
      fd.append("contextInfo", contextInfo);

      // Only meaningful if user fills something
      fd.append("competitorTitles", competitorTitles);
      fd.append("competitorTags", competitorTags);

      // Manifest binds UI order -> stable IDs -> correct mapping in response
      const manifest = mockups.map((m, i) => ({
        id: m.id,
        order: i,
        originalName: m.file.name,
        mime: m.file.type,
      }));
      fd.append("listingManifest", JSON.stringify(manifest));

      // Upload mockup files, named with their stable ID for matching
      for (const m of mockups) {
        fd.append("listingImages", new File([m.file], m.id, { type: m.file.type }));
      }

      const res = await fetch("/api/generate", { method: "POST", body: fd });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data: SeoResult = await res.json();

      // Apply per-image alt text binding
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

  return (
    <main className="min-h-screen bg-[#0b0f14] text-neutral-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 text-sm text-neutral-400">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950">
              <Sparkles size={16} />
            </span>
            Autolisty • Listing SEO Generator
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-50">
            Generate Etsy SEO from your design + mockups
          </h1>
          <p className="text-sm text-neutral-400">
            Product config comes from JSON. Images are bound by ID to guarantee
            alt text is placed under the correct mockup.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
          {/* Left column */}
          <div className="space-y-6">
            <Card
              title="1) Product & Inputs"
              right={
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={resetAll} disabled={loading}>
                    Reset
                  </Button>
                </div>
              }
            >
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-neutral-300">
                      Product type
                    </div>
                    <select
                      value={productType}
                      onChange={(e) => setProductType(e.target.value as ProductType)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    >
                      <option value="frame_tv_art">Frame TV Art (Digital)</option>
                      {/* Future: add phone_case, poster, etc */}
                    </select>
                  </div>

                  <Input
                    label="Primary keywords (priority)"
                    value={primaryKeywords}
                    onChange={setPrimaryKeywords}
                    placeholder='e.g. "golden daisies landscape, wild daisies, daisy meadow art"'
                  />
                  <Input
                    label="Secondary keywords (support)"
                    value={secondaryKeywords}
                    onChange={setSecondaryKeywords}
                    placeholder='e.g. "neutral farmhouse decor, oil painting style, rustic wall art"'
                  />
                  <Input
                    label="Context (optional)"
                    value={contextInfo}
                    onChange={setContextInfo}
                    placeholder='e.g. "Warm neutral palette, vintage botanical look, living room mockups."'
                  />
                </div>

                <div className="space-y-5">
                  <Dropzone
                    title="Design image"
                    subtitle="Drag & drop your design, or upload."
                    accept="image/png,image/jpeg,image/webp"
                    multiple={false}
                    onPick={(files) => setDesign(files)}
                    onClear={designFile ? clearDesign : undefined}
                    preview={
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-neutral-300">
                            Preview
                          </div>
                          {designFile ? (
                            <div className="text-xs text-neutral-500">
                              {designFile.name}
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 flex min-h-[220px] items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/40">
                          {designPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={designPreview}
                              alt="Design preview"
                              className="max-h-[210px] w-auto rounded-lg border border-neutral-800"
                            />
                          ) : (
                            <div className="text-sm text-neutral-500">
                              No design uploaded
                            </div>
                          )}
                        </div>
                      </div>
                    }
                  />

                  {/* Optional competitor accordion */}
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60">
                    <button
                      onClick={() => setCompetitorsOpen((v) => !v)}
                      className="flex w-full items-center justify-between px-5 py-4"
                    >
                      <div className="text-sm font-semibold text-neutral-100">
                        Competitor research (optional)
                      </div>
                      <ChevronDown
                        size={18}
                        className={cn(
                          "text-neutral-400 transition",
                          competitorsOpen && "rotate-180"
                        )}
                      />
                    </button>

                    {competitorsOpen ? (
                      <div className="border-t border-neutral-800 px-5 py-5">
                        <div className="text-xs text-neutral-500">
                          Only used if you fill these fields.
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-4">
                          <TextArea
                            label="Competitor titles"
                            value={competitorTitles}
                            onChange={setCompetitorTitles}
                            placeholder="Paste competitor titles (optional)"
                            rows={4}
                          />
                          <TextArea
                            label="Competitor tags"
                            value={competitorTags}
                            onChange={setCompetitorTags}
                            placeholder="Paste competitor tags (optional)"
                            rows={4}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>

            <Card
              title="2) Listing mockups"
              right={
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={clearMockups}
                    disabled={mockups.length === 0 || loading}
                  >
                    Clear mockups
                  </Button>
                </div>
              }
            >
              <Dropzone
                title="Mockup images"
                subtitle="Drag & drop multiple images. Then reorder by dragging."
                accept="image/png,image/jpeg,image/webp"
                multiple
                onPick={addMockups}
                preview={
                  mockups.length === 0 ? (
                    <div className="mt-3 text-sm text-neutral-500">
                      No mockups uploaded yet.
                    </div>
                  ) : (
                    <div className="mt-4">
                      <DndContext
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext items={mockupIds} strategy={rectSortingStrategy}>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

            {error ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <Card
              title="Generate"
              right={
                <Button
                  variant="primary"
                  onClick={generateSeo}
                  disabled={!canGenerate}
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={16} /> Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> Generate SEO
                    </>
                  )}
                </Button>
              }
            >
              <div className="text-sm text-neutral-400">
                Uses your product JSON config + design + mockups to generate:
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-neutral-500">
                  <li>Short title (≤14 words)</li>
                  <li>Long title (135–140 chars)</li>
                  <li>13 tags (≤20 chars each)</li>
                  <li>Description filled from template (KEYWORD_1..5)</li>
                  <li>Alt text per mockup image (150–250 chars)</li>
                </ul>
              </div>
            </Card>

            <Card title="Outputs">
              {!result ? (
                <div className="text-sm text-neutral-500">
                  Run “Generate SEO” to see outputs.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Titles */}
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-3">
                    <SectionTitle
                      title="Titles"
                      subtitle="Copy/paste into Etsy"
                      right={
                        <Button
                          variant="secondary"
                          onClick={() =>
                            copyToClipboard(
                              `${result.title_short_14_words}\n\n${result.title_long_135_140_chars}`
                            )
                          }
                        >
                          <Copy size={16} /> Copy both
                        </Button>
                      }
                    />
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-neutral-300">
                        Short title (≤14 words)
                      </div>
                      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-sm text-neutral-100">
                        {result.title_short_14_words}
                      </div>
                      <div className="text-xs font-semibold text-neutral-300">
                        Long title (135–140 chars)
                      </div>
                      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-sm text-neutral-100">
                        {result.title_long_135_140_chars}
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-3">
                    <SectionTitle
                      title="Tags"
                      subtitle="13 tags, max 20 chars each"
                      right={
                        <Button
                          variant="secondary"
                          onClick={() => copyToClipboard(result.tags_13.join(", "))}
                        >
                          <Copy size={16} /> Copy tags
                        </Button>
                      }
                    />
                    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-sm text-neutral-100">
                      {result.tags_13.join(", ")}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-3">
                    <SectionTitle
                      title="Description"
                      subtitle="Generated from template + 5 keywords"
                      right={
                        <Button
                          variant="secondary"
                          onClick={() => copyToClipboard(result.description_final)}
                        >
                          <Copy size={16} /> Copy description
                        </Button>
                      }
                    />
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-neutral-300">
                        Keywords used (5)
                      </div>
                      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-sm text-neutral-100">
                        {result.description_keywords_5.join(", ")}
                      </div>

                      <div className="text-xs font-semibold text-neutral-300">
                        Full description
                      </div>
                      <pre className="whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-sm text-neutral-100">
                        {result.description_final}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>

        <div className="mt-10 text-xs text-neutral-600">
          Autolisty local • JSON-driven SEO generation • Prepared for future Etsy integration.
        </div>
      </div>
    </main>
  );
}