import type { AgentId } from "./agents"

export type AgentProcedure = {
  input: string
  output: string
  policy: string
  escalate: string
}

export const AGENT_PROCEDURES: Record<AgentId, AgentProcedure> = {
  ceo: {
    input: "Solicitud del propietario y expediente pertinente.",
    output: "Respuesta, mandato delimitado o decisión escalada.",
    policy: "Delegar solo cuando falta juicio especializado; ninguna conversación concede permisos de producción o publicación.",
    escalate: "Permiso reservado, gasto fuera de límite, nueva línea o conflicto sin resolución.",
  },
  market_lead: {
    input: "Pregunta comercial, evidencias existentes y fecha de vigencia.",
    output: "Dictamen de confianza y alcance de investigación adicional.",
    policy: "Reutilizar evidencia vigente; no convertir estimaciones de ventas en hechos.",
    escalate: "Fuentes contradictorias o consulta de pago no autorizada.",
  },
  market_researcher: {
    input: "Pregunta acotada y proveedor de investigación autorizado.",
    output: "Informe fechado con fuentes, hallazgos, límites y términos reutilizables.",
    policy: "Citar fuentes verificables; Web Search no se activa para producción repetitiva por defecto.",
    escalate: "Evidencia insuficiente o fuente de pago inaccesible.",
  },
  product_lead: {
    input: "Encargo, catálogo existente y evidencia comercial pertinente.",
    output: "Especificación de oferta, formato, alcance y criterios de aceptación.",
    policy: "No aprobar una nueva línea, precio o promesa comercial sin mandato.",
    escalate: "Producto nuevo, promesa no fabricable o cambio de licencia.",
  },
  product_planner: {
    input: "Especificación y restricciones de una unidad de diseño.",
    output: "Brief breve con público, componentes, formatos y supuestos.",
    policy: "No escribir prompts visuales ni SEO final.",
    escalate: "Ambigüedad que cambie coste, público o formato.",
  },
  creative_lead: {
    input: "Brief y preferencias creativas vigentes.",
    output: "Dirección artística o revisión concreta de una propuesta.",
    policy: "No cambiar oferta, público ni presupuesto; limitar revisiones.",
    escalate: "Cambio de preferencia general o conflicto con Producto.",
  },
  visual_designer: {
    input: "Brief, dirección creativa y referencias autorizadas.",
    output: "Conceptos distintos y prompts completos en inglés para Kittl.",
    policy: "No confundir prompt con diseño terminado ni imponer un borde sticker universal.",
    escalate: "Texto, composición o referencia incompatibles con el brief.",
  },
  creation_operator: {
    input: "Prompt aprobado y configuración del producto.",
    output: "Arte descargado, procedencia Kittl, parámetros y créditos registrados.",
    policy: "No generar sin OAuth, presupuesto y lista de herramientas Kittl comprobada; máximo de revisiones acotado.",
    escalate: "Autenticación, coste, descarga o calidad incierta.",
  },
  production_lead: {
    input: "Arte aprobado, producto y procedimiento versionado.",
    output: "Plan de fabricación y manifiesto verificable de archivos finales.",
    policy: "Reanudar por checkpoints; no duplicar trabajos cuando Automaty vuelva en línea.",
    escalate: "Producto sin procedimiento o fallo local repetido.",
  },
  commerce_lead: {
    input: "Paquete final, SEO y permisos comerciales explícitos.",
    output: "Draft Etsy comprobado o incidencia comercial concreta.",
    policy: "Crear draft, publicar y activar publicidad son permisos distintos.",
    escalate: "Desajuste entre archivos, atributos, mockups o promesa.",
  },
  seo_specialist: {
    input: "Manifiesto real, público y evidencia comercial fechada.",
    output: "Título, etiquetas, descripción y contenido SEO de Pinterest consistentes.",
    policy: "Solo SEO redacta SEO; no inventar materiales, formatos ni beneficios.",
    escalate: "Información insuficiente para una promesa verificable.",
  },
  marketing_lead: {
    input: "Listing publicado, URL verificada y activos aprobados.",
    output: "Plan orgánico y lectura de visitas, clics y resultados con fechas.",
    policy: "No activar anuncios pagados ni cambiar la promesa comercial.",
    escalate: "Gasto publicitario o cambio de estrategia de marca.",
  },
  pinterest_specialist: {
    input: "URL Etsy publicada, imágenes aprobadas y SEO recibido.",
    output: "Pines preparados y comprobante de publicación cuando esté autorizado.",
    policy: "No regenerar SEO ni publicar antes de verificar la URL.",
    escalate: "API rechazada, enlace incorrecto o imagen insuficiente.",
  },
  quality_lead: {
    input: "Arte antes de producción o paquete comercial antes del draft.",
    output: "Dictamen con evidencia, severidad, dueño y corrección acotada.",
    policy: "Validaciones deterministas primero; no bloquear por gusto no confirmado ni aprobar su propia corrección.",
    escalate: "Riesgo legal o comercial, desacuerdo persistente o preferencia nueva.",
  },
  finance_lead: {
    input: "Uso interno, facturación oficial, créditos y resultados disponibles.",
    output: "Conciliación de coste y desviaciones con supuestos explícitos.",
    policy: "Separar coste calculado de facturado; no elevar límites de gasto.",
    escalate: "Presupuesto agotado o discrepancia material.",
  },
  systems_lead: {
    input: "Incidente, contrato afectado y registros acotados sin secretos.",
    output: "Diagnóstico, corrección propuesta, prueba y reversión.",
    policy: "No cambiar permisos o reglas comerciales sin aprobación; no exponer secretos a modelos.",
    escalate: "Pérdida o exposición de datos, interrupción sistémica o cambio de arquitectura.",
  },
}

export const CONSULTABLE_AGENT_IDS = [
  "market_lead", "product_lead", "creative_lead", "production_lead", "commerce_lead",
  "seo_specialist", "marketing_lead", "pinterest_specialist", "quality_lead", "finance_lead", "systems_lead",
] as const satisfies readonly AgentId[]

export type ConsultableAgentId = (typeof CONSULTABLE_AGENT_IDS)[number]

export function isConsultableAgent(value: string): value is ConsultableAgentId {
  return (CONSULTABLE_AGENT_IDS as readonly string[]).includes(value)
}
