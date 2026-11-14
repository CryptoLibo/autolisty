import { sectionFromPath, sectionFromQuery, type AppSection } from "@/lib/sections"
import { normalizeProductType, type ProductType } from "@/lib/products"

export const STORAGE_KEYS = {
  activeSection: "autolisty.activeSection",
  promptLabProductType: "autolisty.promptLabProductType",
  listingProductType: "autolisty.listingProductType",
  scaleProductType: "autolisty.scaleProductType",
  imageLabProductType: "autolisty.imageLabProductType",
} as const;

export const ICON_REV = "20260404";

export function readStoredActiveSection(): AppSection {
  if (typeof window === "undefined") return "prompt";
  // La ruta manda (/automation…); después ?section= de avisos antiguos; si no, la última sección usada.
  return (
    sectionFromPath(window.location.pathname) ||
    sectionFromQuery(new URLSearchParams(window.location.search).get("section")) ||
    sectionFromQuery(window.localStorage.getItem(STORAGE_KEYS.activeSection)) ||
    "prompt"
  );
}

export function readStoredProductType(
  key:
    | (typeof STORAGE_KEYS)["promptLabProductType"]
    | (typeof STORAGE_KEYS)["listingProductType"]
    | (typeof STORAGE_KEYS)["scaleProductType"]
    | (typeof STORAGE_KEYS)["imageLabProductType"]
): ProductType {
  if (typeof window === "undefined") return "frame_tv_art";
  const value = window.localStorage.getItem(key);
  return normalizeProductType(value);
}

