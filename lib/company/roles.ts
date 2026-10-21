export const COMPANY_ROLES = [
  { id: "ceo", name: "James", department: "Dirección", status: "active" },
  { id: "market_lead", name: "Responsable de mercado", department: "Mercado", status: "consultative" },
  { id: "market_researcher", name: "Investigador de mercado", department: "Mercado", status: "active" },
  { id: "product_lead", name: "Responsable de producto", department: "Producto", status: "consultative" },
  { id: "product_planner", name: "Planificador de producto", department: "Producto", status: "active" },
  { id: "creative_lead", name: "Dirección creativa", department: "Creativo", status: "consultative" },
  { id: "visual_designer", name: "Diseñador visual", department: "Creativo", status: "active" },
  { id: "creation_operator", name: "Operador de creación", department: "Creativo", status: "blocked" },
  { id: "production_lead", name: "Responsable de producción", department: "Producción", status: "consultative" },
  { id: "commerce_lead", name: "Responsable comercial Etsy", department: "Comercial", status: "consultative" },
  { id: "seo_specialist", name: "Especialista SEO", department: "Comercial", status: "consultative" },
  { id: "marketing_lead", name: "Responsable de marketing", department: "Marketing", status: "consultative" },
  { id: "pinterest_specialist", name: "Especialista Pinterest", department: "Marketing", status: "consultative" },
  { id: "quality_lead", name: "Responsable de calidad", department: "Calidad", status: "consultative" },
  { id: "finance_lead", name: "Responsable de finanzas", department: "Finanzas", status: "consultative" },
  { id: "systems_lead", name: "Responsable de sistemas", department: "Sistemas", status: "consultative" },
] as const

export type CompanyRoleStatus = (typeof COMPANY_ROLES)[number]["status"]
