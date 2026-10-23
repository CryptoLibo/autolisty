# James: inventario de Company y Automation

Auditoria de codigo local, 2026-10-23. `V` = uso directo visible en rutas/UI/codigo; `T` = tests locales; `P` = prueba de produccion comunicada por el propietario; `NV` = no verificado en sistema externo. Destinos son **futuros**, no acciones de esta fase: CONSERVAR, ADAPTAR, FUSIONAR, ELIMINAR. Un estado NV no significa que el componente sea inutil. Las dependencias se expresan como entrada -> componente -> salida. Ningun valor secreto fue leido.

## Company: nucleo, datos y procesos

| Ubicacion exacta | Funcion; dependencias entrantes -> salientes | Uso/estado | Destino y momento seguro |
| --- | --- | --- | --- |
| `lib/company/db.ts`, `repository.ts` | Rutas/runner/Telegram -> SQLite `COMPANY_DB_PATH`, mensajes, tareas, proyectos, artefactos, costes y eventos. `repository.ts` contiene tambien flujo de etapas. | V,T,P (chat); migracion completa NV | ADAPTAR: conservar datos e identidad; separar conversacion de workflow solo tras mapa de tareas y backup/restauracion. |
| `lib/company/agents.ts`, `roles.ts`, `procedures.ts` | DB/runner/oficina -> 16 IDs, modelos, instrucciones, permisos declarados, procedimientos. | V,T; puestos consultivos no equivalen a operadores | FUSIONAR conocimiento util en procedimientos de James; retirar delegacion/puestos solo tras paridad y autorizacion. Preservar versiones historicas. |
| `lib/company/runner.ts` | `/tasks/[id]/run`, Telegram -> OpenAI, Alura, Kittl, repo Company. Motor actual de etapas y delegacion. | V,T,P parcial hasta Kittl | ADAPTAR durante paridad; ELIMINAR la rama multiagente al migrar tareas activas, pruebas y rollback. No eliminar James. |
| `lib/company/budget.ts`, `quota.ts`, `official-billing.ts` | runner/ruta billing -> reservas USD, token local y Usage/Costs oficial OpenAI. | V,T; factura real depende cuenta | CONSERVAR/ADAPTAR para gastos de IA por herramienta; no confundir con libro contable. |
| `lib/company/alura.ts`, `design-playbook.ts`, `design-quality.ts` | runner -> Alura, direcciones visuales, checks de prompt. | V,T; calidad comercial NV | ADAPTAR como capacidades especializadas invocables por James/Engine, no llamadas obligatorias. |
| `lib/company/kittl.ts`, `kittl-generation.ts`, `worker-auth.ts` | OAuth/rutas/worker/Telegram -> MCP Kittl, generacion, archivo local y aprobacion. | V,T,P imagen en Telegram | CONSERVAR/ADAPTAR: Autolisty custodia OAuth y creditos; enlazar aprobacion al job unico antes de retirar etapas Company. |
| `lib/company/telegram.ts` | webhook/drain -> conversacion Company, botones Kittl, API Telegram. | V,T,P | CONSERVAR: canal del mismo James; adaptar notificaciones a eventos del Engine. |
| `scripts/company-kittl-worker.mjs`, `company-worker-deploy.mjs`, `company-telegram-setup.mjs` | PM2/postbuild/env -> drain Telegram/Kittl y setup webhook. | V; PM2 de produccion no inspeccionado | ADAPTAR worker a nuevas tareas antes de retirar endpoints; setup webhook CONSERVAR mientras Telegram siga. |

## Company: superficies HTTP y visuales

| Ubicacion exacta | Funcion; dependencias entrantes -> salientes | Uso/estado | Destino y momento seguro |
| --- | --- | --- | --- |
| `app/company/page.tsx`, `app/company/office/workspace.tsx`, `workspace.module.css` | Navegador -> `/api/company/office`, conversaciones, tareas. `/company` monta la oficina. | V,P interfaz web | ADAPTAR a vista James de chat/tareas; no retirar hasta que reemplazo mantenga chat y resultados. |
| `app/company/office/page.tsx` | URL historica -> redireccion a `/company`. | V | CONSERVAR redireccion mientras haya enlaces/bookmarks; ELIMINAR solo tras medir ausencia de uso o mantener compatibilidad barata. |
| `app/company/office/company-world.tsx`, `habblaud-world.tsx`, `agent-portrait.tsx`, `vendor/habblaud/` | Oficina -> render pixel art y roles. | V; test visual automatizado NV | ADAPTAR o ELIMINAR mundo multiagente tras aprobar experiencia James y comprobar referencias; vendor/licencia solo retirables cuando no queden imports. |
| `app/company/operations/page.tsx`, `workspace.module.css`, `app/api/company/operations/route.ts` | UI -> resumen Company+Automation, proveedores, incidencias. | V; datos en vivo dependen DB | FUSIONAR en panel unico de trabajos; retirar pantalla/ruta antigua tras paridad y redireccion. |
| `app/company/workspace.tsx`, `workspace.module.css` | Chat alternativo; importa `design-review.tsx`. | `page.tsx` usa oficina, no este workspace; no se encontro import de este workspace en la app | ELIMINAR solo tras confirmar ausencia de clientes/enlaces y paridad UI; no confundir con revision activa. |
| `app/company/design-review.tsx` | Oficina activa (`office/workspace.tsx`) -> `/api/company/tasks/[id]/design-review`. | V; sigue importado por la oficina | ADAPTAR/CONSERVAR hasta migrar el flujo de aprobacion/revision. |
| `app/api/company/conversations/route.ts`, `conversations/[id]/route.ts`, `telegram/link/route.ts` | Web autenticada -> CompanyRepository, misma conversacion Telegram. | V,T,P chat compartido | CONSERVAR contrato durante Core y Mobile; adaptar backend sin romper URLs. |
| `app/api/company/telegram/webhook/route.ts`, `drain/route.ts` | Telegram/worker -> auth de chat/secreto y entrega. | V,T,P | CONSERVAR; drenar jobs antiguos antes de cambiar worker. |
| `app/api/company/tasks/[id]/run/route.ts`, `cancel/route.ts`, `design-review/route.ts`, `kittl-generation/route.ts` | UI/worker -> runner, cancelacion, revision, generacion. | V,T parcial | ADAPTAR rutas a Engine con compatibilidad de IDs; ELIMINAR las viejas tras cero tareas pendientes y pruebas. |
| `app/api/company/kittl/{start,callback,status,tools,models,diagnostics,drain}/route.ts` | UI/OAuth/worker -> Kittl MCP. | V,T parcial,P generacion; diagnosticos externos NV | CONSERVAR servicio; ADAPTAR rutas de diagnostico a minimo privilegio; retirar ninguna hasta revalidar OAuth/callback y sondeo. |
| `app/api/company/agents/[id]/route.ts`, `office/route.ts`, `billing/sync/route.ts` | UI autenticada -> perfil/visualizacion/billing. Billing usa `OPENAI_ADMIN_KEY` backend. | V,T parcial | ADAPTAR identidad unica; retirar oficina/catalogo solo tras UI James. CONSERVAR billing separado de finanzas personales. |

## Automation: motor, trabajador, superficie

| Ubicacion exacta | Funcion; dependencias entrantes -> salientes | Uso/estado | Destino y momento seguro |
| --- | --- | --- | --- |
| `lib/automation/db/database.ts`, `db/migrations.ts` | Rutas/repo -> SQLite `AUTOMATION_DB_PATH`, `user_version` 1-3. | V,T; datos VPS NV | CONSERVAR y extender con migraciones aditivas; backup/restauracion antes de alterar esquema. |
| `lib/automation/repository.ts`, `types.ts`, `stateMachine.ts` | Rutas/PC -> jobs, estados, leases, eventos, archivos, retries, pausa, drafts. | V,T; pipeline completo NV | ADAPTAR como **unico motor de trabajos**. Estados posteriores a `LOCAL_COMPLETE` estan modelados, no ejecutados automaticamente. |
| `lib/automation/productContracts.ts`, `outputFiles.ts` | Intake/worker -> formatos por producto, slots, manifiesto verificado. | V,T; algunos productos/bundles no cubiertos | CONSERVAR/ADAPTAR tras prueba real por tipo; no prometer bundle por analogia. |
| `app/api/automation/jobs/route.ts`, `jobs/[jobId]/{source,retry}/route.ts`, `pipeline/route.ts`, `drafts/route.ts`, `health/route.ts` | UI propietario -> intake R2, cola, pausa/retry, pool de draft y salud. | V,T parcial; intake real NV | ADAPTAR a James con permisos; conservar API hasta migrar UI y tareas. `jobs POST` hoy crea job sin `companyListingId`. |
| `app/api/automation/agent/{claim,heartbeat}/route.ts`, `agent/jobs/[jobId]/{source,status}/route.ts`, `agent/jobs/[jobId]/files/{presign,confirm}/route.ts` | PC con token SHA-256 -> claim/lease, descarga, estados, R2 presignado y verificacion. | V,T parcial; Automaty NV | CONSERVAR: es contrato de maquina; no sustituir por mouse/teclado. Cambiar solo con compatibilidad de version de agente. |
| `app/_components/AutomationWorkspace.tsx`, `app/page.tsx` | UI actual -> rutas Automation. | V; UI produccion NV | ADAPTAR/FUSIONAR en panel James tras paridad; mantener intake manual para diseno existente. |
| `local-agent/agent.mjs`, `config.example.json`, `run-agent.ps1`, `install-task.ps1`, `uninstall-task.ps1`, `README.md` | Programador Windows -> HTTPS Autolisty, Autobuildy `--automation-request`, Photoshop/Upscayl, R2. | V codigo y contrato; PC real NV | CONSERVAR/ADAPTAR. Solo retirar instalador/servicio antiguo despues de instalar reemplazo, confirmar reinicio y trabajos en cola. |

## Servicios y configuracion compartidos

| Ubicacion exacta | Funcion / evidencia | Destino y momento seguro |
| --- | --- | --- |
| `auth.ts`, `proxy.ts`, `lib/auth/{owner,request-origin,local-dev,automationAgent}.ts` | GitHub ID, origen, excepcion local solo desarrollo, token restringido PC. V,T. | CONSERVAR; endurecer gateway antes de herramientas nuevas. |
| `lib/etsy/{auth,client,listings,attributes}.ts`, `app/api/etsy/{auth,disconnect,status,sync,attributes,listing-url}/` | OAuth y sincronizacion de draft existente desde sesion web; V, pruebas integrales NV. | CONSERVAR en Autolisty; adaptar a servicio interno con permiso explicito, nunca copiar token a James. |
| `lib/pinterest/{auth,client}.ts`, `app/api/pinterest/{auth,disconnect,status,publish}/` | OAuth y publicar pins mediante sesion web; V, prueba James NV. | CONSERVAR; invocar solo tras Etsy publicado y autorizacion separada. |
| `lib/r2/{client,automationSources,automationOutputs,uploadMockup,uploadDeliverable,uploadDeliveryPdf,generateDeliveryPdf,uploadPinterestImage,deleteListingAssets}.ts` y rutas upload/R2 | Assets, URLs firmadas, PDF, limpieza; V,T parcial. | CONSERVAR; usar servicio Autolisty con manifest/sha, no duplicar clientes en James. |
| `app/api/{generate,generate/delivery,generate/pinterest,prompt-lab,image-lab/*}/`, `lib/openai/generateSeo.ts`, `templates/`, `seo_knowledge/`, `product_configs/` | SEO, prompts, arte, entregables y configuracion por producto. V UI, prueba de flujo James NV. | ADAPTAR servicios reutilizables; no reescribir endpoints gigantes ni declararlos muertos. |
| `package.json`, `package-lock.json` | Next/React, OpenAI SDK, MCP SDK, better-sqlite3, R2 SDK, pdf-lib, tests. V. | CONSERVAR dependencias necesarias; retirar solo tras analisis de imports del codigo ya eliminado. |
| `PROJECT_CONTEXT.md`, `docs/AUTOMATION_FOUNDATION.md`, `docs/ai-company/*`, `docs/GITHUB_AUTH_SETUP.md`, `local-agent/README.md` | Contexto y contratos; algunos estados historicos estan desactualizados. | ADAPTAR al resultado final; no usar texto viejo como prueba de produccion actual. |
| Variables de entorno (nombres, sin valores) | `COMPANY_DB_PATH`, `AUTOMATION_DB_PATH`, `OPENAI_API_KEY`, `OPENAI_ADMIN_KEY`, `COMPANY_OPENAI_PROJECT_ID`, `COMPANY_*_MODEL`, `COMPANY_PILOT_BUDGET_USD`, `COMPANY_RESEARCH_PROVIDER`, `COMPANY_ALURA_*`, `ALURA_API_KEY`, `COMPANY_KITTL_*`, `COMPANY_PUBLIC_URL`, `TELEGRAM_*`, `AUTH_*`, `AUTOLISTY_GITHUB_USER_ID`, `AUTOMATION_AGENT_TOKEN_SHA256`, `ETSY_*`, `PINTEREST_*`, `R2_*`. | CONSERVAR durante transicion; eliminar nombres solo despues de quitar consumidores, backup de configuracion y deploy validado. |

## Pruebas y limites de verificacion

- `lib/automation/{repository,stateMachine,productContracts,outputFiles}.test.ts` y `lib/auth/automationAgent.test.ts`: estados, datos, contratos, autenticacion local. No sustituyen una prueba Photoshop/Automaty.
- `lib/company/{company,company.image-flow,telegram,kittl-generation,alura,design-quality,official-billing}.test.ts`: chat, runner simulado, deduplicacion, Kittl/Telegram y facturacion simulados. `company.live.test.ts` y `company.design.live.test.ts` son opt-in y no se ejecutaron.
- Base local al auditar: `npm test` = 74 pruebas pasan, 2 suites omitidas. No se hicieron llamadas de modelos ni servicios pagos.
- La persona propietaria confirmo anteriormente chat web/Telegram compartido e imagen Kittl entregada y aprobada en Telegram; esto **no** verifica la cadena de produccion, draft ni API Etsy/Pinterest.
- No se inspeccionaron VPS, valores `.env*`, proceso PM2 real, backups externos, carpetas externas Autobuildy/Automocky ni el PC Automaty. Verificar antes de retirar componentes dependientes.
