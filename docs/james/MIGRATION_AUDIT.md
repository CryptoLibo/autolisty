# James: auditoria de migracion (fase 0)

Fecha: 2026-10-23. Alcance: codigo del checkout local de Autolisty. Esta auditoria no modifica el comportamiento ni comprueba el estado real del VPS, cuentas externas o PC Automaty. Los documentos historicos de `docs/ai-company/` describen estados de fechas anteriores; prevalece el codigo actual y la prueba reciente del propietario de imagen Kittl entregada y aprobada por Telegram.

## Resumen ejecutivo

James ya existe como identidad estable `ceo` y comparte conversacion SQLite entre web y Telegram. Hoy decide entre respuesta directa, investigacion, plan de producto, diseno, generacion Kittl y consulta a especialistas mediante `lib/company/runner.ts`. Esto es una orquestacion multiagente real, no un James Core con herramientas generales. El flujo probado por el propietario llega a imagen Kittl y aprobacion en Telegram; no llega desde Company a produccion local, paquete comercial o draft Etsy. Autolisty tiene servicios y una cola de Automation para esas etapas, pero la union Company -> Automation -> Etsy no esta terminada ni validada de punta a punta.

La recomendacion es conservar James y sus datos, sustituir gradualmente las delegaciones rutinarias por comandos tipados y workflows deterministas, y dejar Autolisty como dueno de sus credenciales y operaciones comerciales. No crear una segunda identidad James ni copiar credenciales a Desktop/Mobile. No desactivar nada hasta tener paridad y posibilidad de revertir.

## Arquitectura actual verificada

| Area | Evidencia en codigo | Estado / limite |
| --- | --- | --- |
| Web y autenticacion | `app/page.tsx`, `app/company/page.tsx`, `app/company/office/`, `auth.ts`, `proxy.ts`, `lib/auth/owner.ts` | Next.js con acceso de propietario por GitHub ID y comprobacion de origen para POST web. Hay excepcion local de desarrollo controlada por `lib/auth/local-dev.ts`. La oficina visual no es motor de ejecucion. |
| Identidad y catalogo | `lib/company/agents.ts`, `roles.ts`, `db.ts`, `procedures.ts` | 16 identidades versionadas. James es `ceo`; cinco puestos activos en `roles.ts`, el resto consultivos. El nombre visible puede cambiar sin cambiar el ID. Algunas herramientas declaradas para consultivos son contexto/estado, no prueba de ejecucion de negocios. |
| Orquestacion | `lib/company/runner.ts` | Etapas `CEO_DECIDE`, `RESEARCH`, `PRODUCT_PLAN`, `VISUAL_DESIGN`, `KITTL_SELECT`, `SPECIALIST`, `CEO_SYNTHESIZE`. Las etapas llaman modelos OpenAI via `paidResponse`; se registran llamada, reserva y resultado. No hay workflow Company hasta draft. |
| Conversaciones y memoria | `lib/company/db.ts`, `repository.ts`, `app/api/company/conversations/`, `lib/company/telegram.ts` | SQLite persistente con mensajes, tareas, informes, artefactos, eventos y vinculo Telegram. El contexto del modelo toma solo mensajes/informes/artefactos recientes; no hay todavia memoria estructurada de preferencias, decisiones, finanzas personales ni resumidos de largo plazo. |
| Investigacion y diseno | `lib/company/alura.ts`, `runner.ts`, `design-quality.ts`, `design-playbook.ts`, `repository.ts` | Alura o busqueda web segun configuracion; reutilizacion de informes recientes; brief, prompt y validacion determinista. No equivale a garantia de tendencia o calidad visual. |
| Kittl | `lib/company/kittl.ts`, `kittl-generation.ts`, `scripts/company-kittl-worker.mjs`, rutas `app/api/company/kittl/` | MCP remoto OAuth con estado cifrado en DB; catalogo, balance, generacion, sondeo y entrega a Telegram. Imagen y botones de aprobar/cambios fueron probados por el propietario. Aprobacion no autoriza Etsy ni produccion automaticamente. |
| Telegram | `app/api/company/telegram/`, `lib/company/telegram.ts`, `company_telegram_chats` | Webhook secreto, chat privado permitido, deduplicacion de updates y misma conversacion que web al vincularla. Worker PM2 drena respuestas y generaciones. No es una segunda instancia de James. |
| Costes | `lib/company/budget.ts`, `quota.ts`, `official-billing.ts`, `repository.ts` | Limite piloto de 5 USD calculados/reservados, contadores locales de tokens, creditos Alura/Kittl y sincronizacion de Usage/Costs oficiales con `OPENAI_ADMIN_KEY` solo backend. Estimacion interna no es factura; no hay libro de ingresos/gastos personales. |
| Automation | `lib/automation/`, `app/api/automation/`, `local-agent/` | Segunda SQLite con jobs, pasos, archivos, eventos, agentes, leases, estados, reintentos y pool de drafts. PC Windows hace polling HTTPS, descarga con SHA-256, ejecuta Autobuildy `--automation-request`, valida y sube via URL R2 firmada. Codigo presente, no verificado aqui en Automaty. |
| Integraciones comerciales | `lib/etsy/`, `lib/pinterest/`, `lib/r2/`, `app/api/etsy/`, `app/api/pinterest/`, `app/api/generate/`, `app/api/generate/delivery/`, `app/api/image-lab/` | OAuth/cookies y endpoints Autolisty para SEO, assets, PDF, sincronizacion de draft existente y pins. Su existencia no demuestra que Company los invoque ni que el flujo automatizado completo este cerrado. |
| Despliegue | `PROJECT_CONTEXT.md`, `package.json`, `scripts/company-worker-deploy.mjs` | GitHub -> `./deploy.sh` manual en VPS -> build y PM2. `deploy.sh` vive solo en el servidor; no fue inspeccionado. `postbuild` asegura worker Kittl si PM2 esta disponible. Estado actual del VPS no inspeccionado. |

### Datos y dependencias

- `COMPANY_DB_PATH`: SQLite de Company; en produccion debe ser ruta absoluta. `lib/company/db.ts` usa WAL, `busy_timeout`, claves foraneas y `synchronous=FULL`. Contiene chat, tareas, costos, integracion Kittl cifrada y enlace Telegram. No es la base del PC local cuando se usa web de produccion.
- `AUTOMATION_DB_PATH`: SQLite separada para cola y produccion; tambien exige ruta absoluta en produccion (`lib/automation/db/database.ts`). No hay PostgreSQL en `package.json` ni en la capa de persistencia inspeccionada. Introducirlo ahora seria una migracion adicional injustificada.
- R2 guarda binarios comerciales; los esquemas SQLite guardan referencias, estado y trazabilidad. Credenciales de Etsy/Pinterest se gestionan desde Autolisty mediante OAuth/cookies; Kittl usa OAuth MCP y estado cifrado, no una API key en James.
- `local-agent/agent.mjs` depende del ejecutable Autobuildy y este de Photoshop/Upscayl en Windows. Las carpetas externas Autobuildy/Automocky y la configuracion del PC Automaty no forman parte de este checkout; sus contratos/versiones deben verificarse por separado antes de prometer produccion.
- El servidor depende de `.env.local` para el worker Kittl (`scripts/company-worker-deploy.mjs`). `PROJECT_CONTEXT.md` indica secretos fuera de Git. La ruta real de `.env.local`, politicas de respaldo del VPS, PM2 actual y `deploy.sh` requieren inspeccion operativa con el propietario; no constan como codigo reproducible en el repo.

## Componentes reutilizables y candidatos a desactivacion

Reutilizar sin reescribir: identidad/conversaciones/eventos de James; autentificacion de propietario; Telegram; presupuestos; OAuth MCP Kittl; Alura/informes; cola Automation y su maquina de estados; agente Windows/Autobuildy; clientes Etsy/Pinterest; R2; generacion SEO/PDF; UI existente. En el futuro, exponerlos a James mediante una capa de herramientas tipadas en el backend que compruebe permisos, presupuesto, idempotencia y aprobacion antes de llamar al servicio propietario.

Candidatos **solo tras paridad y autorizacion**: `SPECIALIST` como llamada consultiva generica para tareas mecanicas, `CEO_SYNTHESIZE` cuando solo reformula un resultado estructurado, aprobaciones/model calls de responsables por microtarea, y representacion visual de 16 puestos como si todos ejecutasen trabajos. Los prompts, procedimientos versionados y memoria historica se conservan. No borrar tablas, agentes ni tareas actuales; desactivar por bandera reversible en entorno de prueba tras drenar o migrar trabajos.

## Brechas y riesgos de migracion

1. **Continuidad de tareas:** `company_tasks` y `automation_jobs` usan estados y bases distintas. Falta correlacion durable entre encargo James y job Automation. Un traspaso ingenuo puede duplicar generacion, gasto o draft. Primer adaptador debe crear/consultar por clave idempotente y conservar ambos IDs.
2. **Acceso comercial:** Etsy sync trabaja sobre `draftListingId` y token de cookie del propietario (`app/api/etsy/sync/route.ts`); Pinterest publish tambien usa cookie (`app/api/pinterest/publish/route.ts`). Un worker sin navegador no puede simplemente llamar esas rutas. Diseñar un servicio interno autorizado o una aprobacion web, sin copiar tokens a James/PC.
3. **Permisos:** texto conversacional no es autorizacion para crear draft, publicar, comprar anuncios, acceder pantalla o mover dinero. La confirmacion debe quedar como registro estructurado por operacion, objeto, usuario, caducidad y estado; controles en codigo, no solo prompt.
4. **Seguridad de datos:** el contexto actual serializa mensajes e informes hacia OpenAI (`runner.ts`). Finanzas privadas, pantallas y documentos requieren clasificacion/minimizacion antes de cualquier nuevo tool. Web, PDF, Kittl y pantalla son datos no confiables; nunca instrucciones de propietario.
5. **Memoria y finanzas:** no hay esquema especifico de preferencias/procedimientos/decisiones ni libro contable editable con historial. `company_calls` es telemetria de coste IA, no contabilidad de negocio. No usar respuestas del modelo para sumar importes.
6. **Backups y recuperacion:** no se encontro rutina ejecutable de backup/restauracion para ambas SQLite, WAL, estado cifrado Kittl, assets locales o R2. Documentos hablan de persistencia pero no acreditan restauracion probada. Confirmar estrategia y prueba de restauracion antes de migracion de datos.
7. **Autobuildy/Automocky:** contrato `--automation-request` y checkpoints descritos en `local-agent/README.md`; no se verifico ejecutable real, Photoshop interactivo ni bundle/mockups en Automaty. La cola puede existir sin que el PC procese un producto completo.
8. **Disponibilidad:** dos procesos PM2 previstos (web y `autolisty-kittl`), mas tarea programada Windows. Un `postbuild` fallido o worker detenido puede dejar chats/imagenes sin entrega. Verificar despliegue/rollback y monitor de estados antes de cambiar engine.
9. **Voz/Desktop/Mobile:** no existen cliente de audio ni app Windows en este repo. Voz implica costes propios; el beneficio de tokens de texto no acredita audio gratis. Lectura de pantalla y control del equipo amplian mucho el riesgo. No incorporarlos antes de asegurar Core y permisos.

## Arquitectura objetivo propuesta

`Web / Telegram / futuro Desktop / futuro Mobile -> James Core (identidad ceo, conversacion unica, memoria estructurada, interprete) -> Tool gateway con permisos y aprobaciones -> James Engine (jobs, estados, eventos, reintentos, idempotencia) -> servicios existentes de Autolisty / Automation / Autobuildy`. La persistencia inicial puede seguir en SQLite del servidor, con esquemas separados y adaptadores; no hay necesidad demostrada de PostgreSQL. El dispositivo Windows conserva solo token de agente y trabajo local, nunca secretos comerciales. Una sesion de voz se abre bajo demanda y se cierra por inactividad.

James Core elige **intenciones y herramientas**, no escribe instrucciones libres a otros modelos para cada paso. Tareas repetibles pasan al Engine; la IA queda para interpretar lenguaje, analizar evidencia o elaborar contenido cuando aporta valor. Autolisty mantiene operaciones Etsy, Pinterest, Kittl y R2. El gateway devuelve resultados tipados y evidencia; James comunica el estado sin inventar resultados.

### Bibliotecas externas: decision diferida

- Primero adaptar el SDK OpenAI, MCP SDK, Next/React y `better-sqlite3` ya instalados; no incorporar orquestador nuevo en Fase 1.
- Para escritorio, evaluar [Tauri 2 + React](https://v2.tauri.app/start/create-project/) cuando Core ya exponga API segura. Tauri soporta React y app Windows, pero requiere evaluar instalacion, firma, autoactualizacion y permisos locales. No es una decision tomada.
- Para voz, comparar un prototipo [LiveKit Agents](https://docs.livekit.io/agents/start/voice-ai/) y [OpenAI Realtime](https://platform.openai.com/docs/api-reference/realtime-client-events/session?lang=node.js) con STT + LLM + TTS medidos en espanol, latencia, interrupcion y coste. No asumir que [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) sirve igual en todos los navegadores. No instalar ninguno en Fase 0.
- No recomendar un repositorio de control visual de Photoshop: el agente Autobuildy existente debe probarse primero.

## Etapas propuestas y pruebas de preservacion

0. **Auditoria (esta etapa):** inventario y brechas; ninguna migracion, deploy o llamada de pago. Revisar con el propietario esta propuesta.
1. **Core de solo lectura:** primer cambio seguro/reversible: agregar una herramienta backend tipada `get_automation_status` que lea `AutomationRepository` y entregue a James tareas reales, sin credenciales nuevas ni efectos laterales. Exponerla solo a `ceo` autenticado, con limite de salida y prueba de permisos, resultado y error. Activarla con bandera desactivada por defecto; mantener el runner actual como fallback. Probar misma conversacion web/Telegram, presupuesto y ausencia de llamadas comerciales.
2. **Finanzas:** tablas estructuradas de movimientos y auditoria; idempotencia, moneda, importes decimales, proyecto y correccion. Probar alta por lenguaje natural con confirmacion, consulta mensual calculada por SQL, edicion y log. Separar del coste de modelos.
3. **Voz:** medir opciones y costes en prueba aislada. Probar espanol, interrupcion, herramientas, sesion cerrada tras inactividad y que audio privado no se registre accidentalmente.
4. **Workflows Autolisty:** conectar un producto concreto con IDs Company/Automation, arte aprobado, manifest/checksum, worker, R2, SEO sobre archivos reales y draft bajo permiso distinto de publicacion. Ensayar corte/reinicio, reintento sin duplicacion, Kittl no repetido, fallo Etsy y rollback.
5. **Desktop:** cliente Windows del mismo James, control local con allowlist y confirmaciones; probar revocacion, pantalla sin secretos y que no pueda ejecutar acciones por texto de una pagina.
6. **Autobuildy y Mobile:** verificar Automaty real y su ciclo de encendido/apagado; interfaz movil web autenticada sobre los mismos IDs. Telegram permanece; no hay segunda memoria. Probar continuidad entre dispositivos, aprobaciones y revocacion.

Antes de desactivar multiagente: captura de pruebas de conversacion, informe reutilizado, presupuesto, generacion/aprobacion Kittl, estados de error/Telegram, historial y acceso propietario; comparacion del mismo conjunto con bandera nueva encendida/apagada. No migrar trabajos activos a ciegas. Para produccion, respaldo/restauracion verificados de ambas bases y procedimiento de rollback de codigo/PM2.

## Lo que no se pudo verificar en Fase 0

No se inspeccionaron `.env*` ni valores secretos, VPS, `deploy.sh` real, PM2 en vivo, backups externos, cuentas Etsy/Pinterest/Kittl, PC Automaty, carpetas externas Autobuildy/Automocky, latencia/credito de voz, ni API real en produccion. Las pruebas unitarias solo verifican codigo local y no prueban esos sistemas. Obtener esa evidencia antes de decisiones irreversibles; no concluir que tales componentes no existen fuera del repositorio.
