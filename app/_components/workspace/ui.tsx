"use client"

// Piezas de interfaz de las herramientas manuales.
import React, { useRef } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Copy, FileText, Image as ImageIcon, Upload, X } from "lucide-react"
import type { MediaItem } from "./types"

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function SectionTitle({
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

export function Button({
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

export function Card({
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
      <div
        className={cn(
          "border-b border-white/6 px-6 py-5",
          title
            ? "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            : "flex items-center"
        )}
      >
        {title ? (
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#eeba2b]" />
            <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
          </div>
        ) : null}
        {right ? <div className={cn(title ? "" : "w-full")}>{right}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

export function TextArea({
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

export function FilePicker({
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

export function Dropzone({
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

export function SortableMockupCard({
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

export function OutputBlock({
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


