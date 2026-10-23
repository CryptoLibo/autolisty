# James: plan ejecutable de consolidacion

Fecha 2026-10-23. Basado en `COMPONENT_INVENTORY.md` y `MIGRATION_AUDIT.md`. Este documento no autoriza implementar, desplegar o eliminar nada. Decision propuesta: **Automation evoluciona a motor unico de trabajos; Company conserva la identidad, canales, memoria y capacidades de James hasta migrar cada una**. No crear un tercer orquestador.

## Comparacion de motores

| Capacidad | Company hoy (`repository.ts`, `runner.ts`) | Automation hoy (`repository.ts`, `stateMachine.ts`) | Dueno final propuesto |
| --- | --- | --- | --- |
| Cola y estados | Tarea por mensaje, etapas de IA; `claimStage` y recuperacion que puede marcar revision | Jobs persistentes, cola local, transiciones explicitas, pausa, leases | Automation para trabajos; James Core para mensajes |
| Reintentos/idempotencia | Protecciones por estado, reuse de informe, Kittl con estados propios; fallo requiere revision | `RETRY_WAIT`, `NEEDS_ATTENTION`, reintento, `company_listing_id` unico, `product_code` unico; no todo efecto externo esta reconciliado | Automation, ampliar idempotencia por efecto externo |
| Eventos/progreso | `company_events`, llamadas y artefactos | `automation_job_events`, pasos/archivos y heartbeat PC | Automation para progreso de job; Company conserva historial conversacional y costo |
| Cancelacion | `cancelQueuedTask`, restricciones por etapa | `CANCELED` en maquina, no implica revertir acciones externas | Engine valida punto seguro y compensacion; James comunica |
| Presupuesto | USD/tokens y creditos Alura/Kittl | Ninguno | Servicio de presupuesto Company, consultado por Engine antes de gasto |
| Aprobacion | Kittl por Telegram y revision de concepto | `WAITING_ETSY_REVIEW`, pool de draft; falta grants por accion | Registro estructurado de aprobaciones, verificado por Engine/servicio |
| Reinicio | `recoverInterrupted` y worker drena Kittl/Telegram | SQLite WAL, leases, checkpoints local-agent; etapas comerciales no ejecutadas | Automation con recuperacion verificada; drainer Kittl se integra sin duplicar motor |

Conclusion: Automation es mejor base **pero hoy solo implementa ejecucion hasta `LOCAL_COMPLETE` desde intake manual**. Los estados SEO/draft/Pinterest posteriores existen en enum, no como pipeline autonomo. Mantener Company runner durante la transicion, sin llamar a ambos motores para la misma operacion.

## Responsabilidad unica

- **James Core** (`ceo` estable, no segundo agente): recibe mensajes web/Telegram/futura voz; interpreta intencion; lee memoria; solicita herramientas tipadas; explica resultados. No hace aritmetica ni opera credenciales directamente.
- **Automation/James Engine**: trabajo durable, eventos, idempotencia, reintentos, checkpoints, permisos de ejecucion. Un job puede ser investigacion/diseno/generacion/produccion o una accion comercial, pero se amplia el esquema por pasos pequenos. Nunca obligar a crear un listing para una pregunta de chat.
- **Company DB**: conversaciones, identidad, preferencias/decisiones futuras, Kittl OAuth, uso/costo y referencias a job. No duplica la verdad del estado de produccion.
- **Autolisty services**: Etsy, Pinterest, Kittl, R2, SEO/PDF y contratos de producto. El gateway es una interfaz interna del mismo backend con allowlist, no otro servidor ni llaves replicadas.
- **Automaty**: worker restringido que recibe trabajo desde Automation; no interpreta conversaciones ni recibe credenciales comerciales.

## Workflow definitivo (con puertas explicitas)

1. **A: imagen existente.** Propietario sube arte y especifica producto. Reusar intake de `app/api/automation/jobs/route.ts`, contrato `productContracts.ts`, hash y R2 staging. Hoy exige `sourcePrompt`; definir como registrar procedencia/desconocido sin inventar prompt. No hace falta Kittl.
2. **B: imagen solicitada a James.** James puede reutilizar investigacion, preparar direccion y llamar Kittl via Autolisty con limite de creditos; el propietario revisa PNG por Telegram/web. Solo `APPROVED` habilita traspaso. Hoy Kittl guarda `image_path` local y revision en Company; falta manifest/transferencia segura e idempotente a R2/Automation.
3. **Convergencia.** Crear o localizar `company_listings` y job Automation por `company_listing_id` + `product_code`; unique constraints ya existen. Definir si un bundle comparte job o contiene subjobs antes de implementarlo. Registrar origen, aprobacion, hash y version de procedimiento. Si el PC esta apagado, `QUEUED_LOCAL` permanece.
4. **Produccion.** `local-agent/agent.mjs` -> Autobuildy `--automation-request` -> Photoshop/Upscayl -> archivos/manifest -> R2 presignado -> validacion `outputFiles.ts` -> `LOCAL_COMPLETE`. Probar cada tipo; PNG y bundles requieren contrato propio. Nunca reejecutar un efecto externo sin reconciliar su resultado.
5. **Paquete comercial.** Falta ejecutor post-local real: verificar assets/promesa, SEO sobre archivos reales, PDF/descargas, asignar draft del pool o crear draft bajo permiso especifico, sincronizar Etsy. `app/api/etsy/sync/route.ts` exige cookie/sesion de propietario y draft ID: no invocable directamente por worker; extraer servicio backend autorizado manteniendo ruta actual, o mantener aprobacion web donde corresponda. No asumir una API Etsy para crear/publicar sin probarla.
6. **Publicacion Etsy.** Permiso **distinto** de preparar archivos y crear draft. Revisar estado real en Etsy; no inferir autorizacion de chat ni del estado `WAITING_ETSY_REVIEW`.
7. **Pinterest.** Solo con listing publicado, URL verificada, assets y permiso separado; reusar cliente/ruta, pero no copiar cookie a James. Publicacion organica no implica autorizacion de anuncios.

Estado presente: el propietario probo B hasta aprobacion en Telegram; A tiene codigo de intake y cola, Automaty no verificado aqui; pasos 3-7 no forman hoy una cadena probada. Etsy sync y Pinterest publish existen como operaciones manuales de Autolisty, no como pasos autonomos James.

## Voz y acceso remoto

Primera prueba debe usar el mismo `conversation_id`, la misma autenticacion del propietario y un adaptador audio bajo demanda sobre James Core. Evaluar Realtime frente a STT + LLM + TTS por espanol, interrupciones reales, latencia, privacidad y euros/minuto. Tiempo de inactividad cierra sesion; transcripcion y audio no se guardan por defecto. El modelo propone una llamada tipada, el backend valida permisos antes de ejecutarla. Web movil autenticada es primer acceso remoto; Telegram continua. Cliente Windows futuro consume el mismo backend, con permisos separados para pantalla, mouse, teclado y aplicaciones; no una memoria local paralela.

## Seguridad

Matriz minima: consultar tareas (lectura), investigar/generar Kittl (coste limitado), preparar archivos, crear draft, publicar Etsy, publicar Pinterest, anuncios, finanzas, pantalla/control local. Cada herramienta valida identidad, alcance, objeto, presupuesto y confirmacion requerida en codigo. Consentimiento conversacional no equivale a grant. Para acciones criticas, confirmacion adicional persistida y ligada a objeto/accion. Respuesta de web, documentos, prompts Kittl y pantalla es dato no confiable. Filtrar y minimizar antes de enviar a modelos; no enviar automaticamente finanzas privadas, contrasenas o capturas completas. OAuth/cookies comerciales solo en Autolisty; PC solo token acotado y URLs firmadas.

## Etapas implementables tras aprobacion

1. **Observabilidad de solo lectura.** Comando `get_jobs` desde James que llama `AutomationRepository` bajo identidad propietario y devuelve estados reales sin secretos. Sin alterar `runner.ts` por defecto. Aceptacion: misma respuesta web/Telegram, jobs correctos, cero mutaciones y sin llamada comercial; tests de acceso y DB inaccesible. Rollback: desactivar nuevo comando.
2. **Contrato de job unico.** Modelo de `workflow_kind`, `source_id`/`company_listing_id`, correlacion Company -> Automation e idempotencia; migracion aditiva. Aceptacion: mismo encargo repetido devuelve mismo job, sin doble coste; datos antiguos siguen legibles; backup/restauracion ensayados.
3. **Entrada A.** Conservar UI/manual intake, registrar procedencia y permisos. Aceptacion: PNG valido, rechazo de MIME/tamano, hash y cola; PC apagado no duplica; prueba real de un producto.
4. **Entrada B.** Traspaso de Kittl aprobado al mismo intake sin regenerar; revision rechazada bloquea. Aceptacion: mismo hash/job con reintento; Telegram y web ven el mismo estado; presupuestos intactos.
5. **Produccion real.** Ensayo en Automaty y adaptacion por producto, manifiesto y reanudacion. Aceptacion: apagado/reinicio de PC, lease y checkpoints; ningun mockup/deliverable duplicado.
6. **SEO y draft.** Ejecutores post-local con servicios Autolisty; permisos separados de draft/publicacion. Aceptacion: paquete verificado y draft real revisable; fallo de OAuth/Etsy deja `NEEDS_ATTENTION` sin repetir produccion.
7. **Publicacion y Pinterest.** Grants independientes, Etsy URL verificada, deduplicacion de pins. Aceptacion: ninguna publicacion sin grant y estado; historial auditable; prueba manual controlada.
8. **Finanzas/memoria y voz.** Estructuras propias, pruebas de calculo/correccion y privacidad; voz en piloto bajo demanda. Aceptacion: mismo James en canales, coste medido y revocacion efectiva.
9. **Retirada.** Ejecutar `DECOMMISSION_PLAN.md` solo despues de paridad, backups y aprobacion de propietario. No dejar banderas de transicion permanentes.

Cada etapa requiere tests unitarios de contrato/estado, prueba de integracion sin pagos, una prueba real controlada cuando toque servicios externos, observacion de logs sin secretos y rollback ensayado antes de desplegar la siguiente. Despliegue habitual: commit/push local; propietario ejecuta `./deploy.sh` en VPS. Nunca editar produccion manualmente para esconder una brecha de codigo.
