"use client";

import React, { useMemo, useRef, useState } from "react";
import { generateListingId } from "@/lib/utils/generateListingId";

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
  id: string;
  file: File;
  previewUrl: string;
  r2Url?: string;
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

/* ---------- MAIN COMPONENT ---------- */

export default function Page() {

  const [productType, setProductType] = useState<ProductType>("frame_tv_art");

  const [listingId, setListingId] = useState<string | null>(null);

  const [designFile, setDesignFile] = useState<File | null>(null);
  const [designPreview, setDesignPreview] = useState<string | null>(null);
  const [designR2Url, setDesignR2Url] = useState<string | null>(null);

  const [primaryKeywords, setPrimaryKeywords] = useState("");
  const [secondaryKeywords, setSecondaryKeywords] = useState("");
  const [contextInfo, setContextInfo] = useState("");

  const [competitorsOpen, setCompetitorsOpen] = useState(false);
  const [competitorTitles, setCompetitorTitles] = useState("");
  const [competitorTags, setCompetitorTags] = useState("");

  const [mockups, setMockups] = useState<MediaItem[]>([]);

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

  /* ---------- LISTING ID ---------- */

  function ensureListingId() {
    if (!listingId) {
      const id = generateListingId();
      setListingId(id);
      return id;
    }
    return listingId;
  }

  /* ---------- UPLOAD TO R2 ---------- */

  async function uploadToR2(file: File, filename: string) {

    const id = ensureListingId();

    const formData = new FormData();
    formData.append("file", file);
    formData.append("listingId", id!);
    formData.append("filename", filename);

    const res = await fetch("/api/upload/mockup", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error("Upload failed");

    return await res.json();
  }

  /* ---------- DESIGN IMAGE ---------- */

  async function setDesign(files: File[]) {

    const f = files[0];
    if (!f) return;

    if (designPreview) URL.revokeObjectURL(designPreview);

    const upload = await uploadToR2(f, "design.png");

    setDesignFile(f);
    setDesignPreview(URL.createObjectURL(f));
    setDesignR2Url(upload.url);
  }

  /* ---------- MOCKUPS ---------- */

  async function addMockups(files: File[]) {

    const newItems: MediaItem[] = [];

    for (let i = 0; i < files.length; i++) {

      const f = files[i];
      if (!f.type.startsWith("image/")) continue;

      const filename = `mockup-${mockups.length + i + 1}.jpg`;

      const upload = await uploadToR2(f, filename);

      newItems.push({
        id: uid(),
        file: f,
        previewUrl: URL.createObjectURL(f),
        r2Url: upload.url,
      });
    }

    setMockups((prev) => [...prev, ...newItems]);
  }

  /* ---------- CLEAR ---------- */

  function clearDesign() {
    if (designPreview) URL.revokeObjectURL(designPreview);
    setDesignFile(null);
    setDesignPreview(null);
  }

  function clearMockups() {
    for (const m of mockups) URL.revokeObjectURL(m.previewUrl);
    setMockups([]);
  }

  /* ---------- DRAG ---------- */

  function handleDragEnd(e: DragEndEvent) {

    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = mockups.findIndex((m) => m.id === active.id);
    const newIndex = mockups.findIndex((m) => m.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    setMockups((items) => arrayMove(items, oldIndex, newIndex));
  }

  /* ---------- GENERATE SEO ---------- */

  async function generateSeo() {

  if (!canGenerate || !designR2Url) return;

  setLoading(true);
  setError(null);
  setResult(null);

  try {

    const payload = {

      productType,

      designUrl: designR2Url,

      primaryKeywords,
      secondaryKeywords,
      contextInfo,

      competitorTitles,
      competitorTags,

      mockups: mockups.map((m, index) => ({
        id: m.id,
        position: index + 1,
        url: m.r2Url
      }))

    };

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
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

  /* ---------- UI ---------- */

  return (
    <main className="min-h-screen bg-[#0b0f14] text-neutral-100">

      <div className="mx-auto max-w-6xl px-6 py-10">

        <h1 className="text-2xl font-bold">Autolisty</h1>

        <div className="mt-6 space-y-4">

          <input
            type="file"
            accept="image/*"
            onChange={(e) => setDesign(Array.from(e.target.files || []))}
          />

          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => addMockups(Array.from(e.target.files || []))}
          />

          <button
            onClick={generateSeo}
            disabled={!canGenerate}
            className="bg-white text-black px-4 py-2 rounded"
          >
            Generate SEO
          </button>

        </div>

      </div>

    </main>
  );
}