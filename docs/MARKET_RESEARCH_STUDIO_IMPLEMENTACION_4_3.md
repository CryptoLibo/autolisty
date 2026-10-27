# Market Research Studio - Etapa 4.3 (local)

## Alcance y estado

Implementacion local. No se contacto Alura ni se hizo deploy, instalacion en Ubuntu o cambio en la base del VPS. El diagnostico gratuito `GET /v1/usage` sigue pendiente de autorizacion expresa, al igual que la primera consulta de keyword y cualquier investigacion comercial. Kittl queda fuera.

## Archivos

- `lib/research/market/providerPolicies.mjs` y `.d.mts`: catalogo de reglas verificadas o pendientes.
- `lib/research/market/repository.ts`: vencimiento y cache por proveedor; conocimiento propio y procedencia.
- `lib/research/market/engine.ts`: bloqueo antes de una llamada comercial si la politica de almacenamiento esta pendiente.
- `lib/automation/db/migrations.ts`: migracion incremental v10, tablas `research_knowledge` y `research_knowledge_provenance`.
- `scripts/research-retention.mjs` y `scripts/research-retention-alura.mjs`: limpieza general por politica y redaccion particular de Alura; log de ejecucion/errores existente.
- `scripts/research-maintenance.mjs`: exige esquema v10; no migra.
- `deploy/systemd/autolisty-research-maintenance.service.example`: plantilla supervisada, no instalada.
- Pruebas: `providerPolicies.test.ts`, `migrate-local-4-3.test.ts`, `engine.test.ts`, `learning.test.ts`.

## Politicas

| Proveedor | Estado | Persistencia y vencimiento operativo | Fuente |
| --- | --- | --- | --- |
| Alura | verificada | Evidencia 23 h (margen antes del maximo contractual de 24 h); cache 1 h; diagnosticos y datos de respuesta se eliminan | [Alura API Terms](https://docs.alura.io/legal/api-terms) |
| Etsy | frescura verificada | Contenido de listings maximo 6 h para evitar mostrar datos desactualizados; cache 1 h. **No se afirma** que 6 h sea un plazo contractual universal de borrado | [Etsy API Terms](https://www.etsy.com/legal/api/) |
| EverBee | pendiente | Sin plazo inventado; bloqueada la persistencia y, por ello, la llamada comercial desde este flujo | [Terms](https://www.everbee.io/legal/terms-of-service) |
| Google Trends | pendiente | Sin plazo inventado, sin conector operativo | [Trends API](https://developers.google.com/search/apis/trends) |
| Web | pendiente | Sin proveedor ni licencia definidos; bloqueado | Pendiente |
| Marketplace Insights | datos del propietario | Sin plazo de proveedor; cache operativa 1 h | Datos propios |

La politica de Etsy es conservadora por frescura; debe precisarse por tipo de contenido antes de ampliar su conector. Las restricciones de acceso y rate limits siguen siendo independientes de estas reglas. Los conectores pendientes no consumen llamadas desde el motor porque el bloqueo sucede antes del despacho.

## Evidencia y conocimiento

`research_evidence`, `research_query_cache`, resultados de ejecucion, snapshots de Create Prompts y oportunidades automaticas siguen siendo datos sujetos a reglas del proveedor. La limpieza usa el plazo de cada origen y conserva las otras fuentes. Las oportunidades multifuente se vencen al primer plazo restrictivo; su titulo y rationale se redactan al vencer. Las conclusiones de sistema en `research_knowledge` tambien vencen al primero de sus origenes. La tabla de procedencia registra investigacion, proveedor, fuente y fecha sin copiar la metrica.

Solo el propietario puede marcar expresamente un texto como conocimiento original propio; esa marca no se infiere de un resumen. La retencion sin vencimiento se permite solo si **todos** sus origenes lo autorizan. Etsy/EverBee no se consideran autorizados para ello. La confirmacion del propietario es una declaracion de autoria, no una verificacion automatica de que el texto no copie datos del proveedor. No se agrego UI para crear estas notas en esta etapa; la API de repositorio ya esta preparada.

## SQLite local

Ruta confirmada: `C:\Users\libar\Desktop\autolisty\data\autolisty-automation.sqlite`. Respaldo: `data/backups/autolisty-automation-stage4-2-2026-10-27.sqlite`, SHA-256 `4c6b016963a0de58468ab1316dd643f1914fdf0e1b3e869f18ca9ef347ecf796`. Antes de migrar, original y respaldo: v3, `integrity_check=ok`, siete tablas con cero filas cada una. Ensayo en copia v3->v10: 2 pruebas pasan. Migracion autorizada aplicada **solo** al original local mediante prueba con ruta y hash fijados: v10, `integrity_check=ok`, recuentos anteriores sin cambios. El respaldo sigue v3 y no se modifico.

## Futuro Ubuntu

El worker actual acepta `--loop`, ejecuta una pasada cada cinco minutos, registra resultados/errores y detecta intervalos perdidos. La unidad systemd de ejemplo usa `Restart=always` y journal. Antes de instalarla en Hetzner hay que confirmar usuario, ruta de Node, ruta absoluta persistente de SQLite, permisos y procedimiento de respaldo/migracion v10; el archivo es una plantilla, no una instruccion para instalarla ahora. El PC de desarrollo no tiene servicio permanente.

Una pasada local `--once` posterior a la migracion termino `COMPLETED`, sin borrar filas ni recuperar trabajos; la base permanece v10 e integra. Esto no instala ni inicia un worker persistente.

## Verificacion

- Suite: 85 pruebas pasan, 3 omitidas por condiciones de entorno/operacion deliberadamente desactivadas.
- TypeScript `tsc --noEmit`: pasa.
- Lint de los archivos cambiados: pasa. `npm run lint` global sigue fallando por 98 errores preexistentes en archivos no relacionados, incluidos Listing y scripts JSX.
- Build de produccion `npm run build`: pasa, con rutas Research, Listing, Scale y Automation compiladas. El primer intento dentro del sandbox fallo con `EPERM` al crear directorios ya existentes en `.next`; repetido fuera del sandbox paso.
- No se realizaron pruebas comerciales reales ni se consumieron creditos.

## Limites y siguiente autorizacion

El alcance del contenido Etsy frente a su regla de frescura debe revisarse por endpoint. La politica de EverBee sigue pendiente de confirmar antes de habilitar persistencia. `addKnowledge` es un control de modelo de datos, no una deteccion de plagio ni una interfaz de revision. El flujo completo Market Research no esta autorizado ni desplegado. El diagnostico `GET /v1/usage` esta implementado como accion local explicita sin coste documentado; **no se ejecuto**. Se requiere autorizacion separada para ejecutarlo, para cualquier keyword facturable y para cualquier despliegue.
