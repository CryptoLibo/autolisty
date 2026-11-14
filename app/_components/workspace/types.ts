// Tipos de las herramientas manuales (Prompt Lab, Image Lab, Listing, Escala).
import type { ProductType } from "@/lib/products"

export type MediaItem = {
  id: string;
  file: File;
  previewUrl: string;
  r2Url?: string;
  altText?: string;
};

export type ListingVideoItem = {
  id: string;
  file: File;
  previewUrl: string;
  r2Url?: string;
};

export type PinterestItem = {
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

export type SeoResult = {
  product_name?: string;
  title: string;
  description_keywords_5: string[];
  description_final: string;
  tags_13: string[];
  etsy_attributes?: Array<{
    propertyId: number;
    displayName: string;
    valueIds: number[];
    values: string[];
    scaleId: number | null;
  }>;
  media: Array<{
    id: string;
    order?: number;
    position: number;
    alt_text: string;
  }>;
};

export type EtsyAuthStatus = {
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

export type PinterestAuthStatus = {
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

export const SCALE_CONNECTION_REQUIRED_MESSAGE =
  "Connect both Etsy and Pinterest before importing listings into Scale.";

export type EtsySyncResponse = {
  ok?: boolean;
  shopId?: number;
  listingId?: string;
  listingUrl?: string | null;
  updatedAttributes?: number;
  uploadedImages?: number;
  uploadedFiles?: number;
  error?: string;
};

export type EtsyListingUrlResponse = {
  ok?: boolean;
  listingId?: string;
  state?: string;
  listingUrl?: string | null;
  error?: string;
};

export type EtsyAttributeInspectionProperty = {
  propertyId: number | null;
  displayName: string;
  supportsAttributes: boolean;
  supportsVariations: boolean;
  isRequired: boolean;
  isMultivalued: boolean;
  maxValuesAllowed: number | null;
  possibleValues: Array<{
    valueId: number | null;
    name: string;
    scaleId: number | null;
  }>;
  selected: {
    valueIds: number[];
    values: string[];
    scaleId: number | null;
    scaleName: string;
  } | null;
  targetStatus: "tracked" | "available" | "ignored";
};

export type EtsyAttributeInspectionResponse = {
  ok?: boolean;
  shopId?: number;
  listingId?: string;
  listing?: {
    title: string;
    state: string;
    taxonomyId: number;
    url: string;
  };
  trackedProperties?: EtsyAttributeInspectionProperty[];
  properties?: EtsyAttributeInspectionProperty[];
  error?: string;
};


export type PromptLabResult = {
  summary: string;
  globalIntent: string;
  buyerAppeal: string;
  roomFit: string;
  emotionalPromise: string;
  renderingMode: string;
  subjectMechanics: string;
  variationLogic: string;
  visualDna: {
    composition: string;
    formLanguage: string;
    palette: string;
    texture: string;
    mood: string;
    variationStrategy: string;
  };
  subjectIdentity: string;
  stylingSignals: string;
  visualContrastLogic: string;
  commercialHook: string;
  variationBoundaries: string;
  styleBrief: string;
  promptPrinciples: string[];
  pngStrategy?: {
    primaryNiche: string;
    targetBuyer: string;
    trendSynthesis: string;
    sharedSignals: string[];
    textStrategy: string;
    productionStrategy: string;
    originalityGuardrails: string[];
    compatibleNicheExpansions: string[];
  };
  referenceFindings?: Array<{
    referenceIndex: number;
    mainSubject: string;
    visibleText: string;
    messageMechanism: string;
    composition: string;
    styleAndFinish: string;
    commercialSignal: string;
    avoidCopying: string;
  }>;
  promptDetails?: Array<{
    role: string;
    prompt: string;
    variationStrategy: string;
    seoSignals: string[];
    keptFromReference: string[];
    changedFromReference: string[];
  }>;
  prompts: string[];
  midjourneyBlock: string;
};

export type ImageLabSize = "1024x1536" | "1536x1024" | "1024x1024";
export type ImageLabQuality = "medium" | "low" | "high";

export type ImageLabDraftImage = {
  id: string;
  prompt: string;
  imageDataUrl: string;
  model: string;
  quality: ImageLabQuality;
  size: ImageLabSize;
  source?: "prompt_lab" | "manual" | "edit";
  editInstruction?: string;
  parentImageLabId?: string;
  approvedItemId?: string;
};

export type ImageLabLibraryItem = {
  id: string;
  productType: ProductType;
  prompt: string;
  source: "prompt_lab" | "manual" | "edit";
  model: string;
  quality: ImageLabQuality;
  size: ImageLabSize;
  status: "approved" | "used";
  createdAt: string;
  updatedAt: string;
  notes: string;
  editInstruction?: string;
  parentImageLabId?: string;
  imageKey: string;
  metadataKey: string;
  imageUrl: string;
};


export type ScaleImportedFile = {
  id: string;
  file: File;
  relativePath: string;
};

export type ScaleJobStatus =
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
  | "failed"
  | "skipped";

export type ScaleFailedStage =
  | "upload"
  | "seo"
  | "pdf"
  | "etsy"
  | "etsy_url"
  | "pinterest"
  | "publish";

export type ScaleUploadedMockup = {
  id: string;
  position: number;
  url: string;
  altText?: string;
};

export type ScalePinterestPin = {
  id: string;
  position: number;
  url: string;
  title?: string;
  description?: string;
  publishedPinId?: string;
  publishUrl?: string | null;
  publishError?: string | null;
};

export type ScaleJob = {
  id: string;
  folderName: string;
  files: ScaleImportedFile[];
  listingId?: string;
  midjourneyPrompt: string;
  imageLabId?: string;
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
  failedStage?: ScaleFailedStage | null;
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

