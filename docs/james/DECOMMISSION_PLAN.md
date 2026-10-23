# James: retirada reversible de Company/Automation antiguos

**No ejecutar ahora.** Este orden se activa solo tras aprobacion del propietario, restauracion de backup ensayada y paridad funcional. `ELIMINAR` significa retirar codigo obsoleto, nunca borrar datos de auditoria, costes, consentimiento o conversaciones. La evidencia de no uso combina busqueda de imports/rutas, recuento de tareas abiertas, telemetria de rutas y pruebas de flujo; un `rg` vacio por si solo no basta.

## Prerrequisitos generales

1. Inventariar VPS real: `deploy.sh`, PM2, `.env` **solo nombres**, rutas de las dos SQLite, almacenamiento de PNG Kittl, tarea Windows y version Autobuildy. No copiar secretos al documento.
2. Backup consistente de ambas SQLite con WAL, archivos Kittl y configuracion cifrada; exportar esquema, conteos, checksums y probar restauracion aislada. Guardar historial Company y Automation. Verificar R2 por manifiesto; no borrar fuentes antes de confirmar destino.
3. Capturar jobs/tareas activos, drafts, Kittl pendientes, respuestas Telegram por entregar y operaciones inciertas. No retirar un consumidor hasta drenar o mapear cada identificador a estado nuevo.
4. Congelar contrato externo versionado durante corte, con ventana de observacion y rollback a commit/PM2 previos; migraciones solo aditivas mientras rollback sea necesario.

## Orden de retirada

| Orden y candidato | Dependencias previas | Regresion y evidencia de no uso | Respaldo / reversion |
| --- | --- | --- | --- |
| 1. UI duplicada `app/company/workspace.tsx` y su CSS | `app/company/page.tsx` monta la oficina; verificar ausencia de import/enlace al chat alternativo | Capturas web/movil y chat; `rg` de imports y telemetria de navegacion | Git revert del cambio; mantener `/company`. **No retirar `design-review.tsx` aqui:** la oficina activa lo importa |
| 2. Mundo multiagente `app/company/office/{company-world,habblaud-world,agent-portrait}.tsx`, `vendor/habblaud/`, roles visuales | Nueva UI James aceptada por propietario, accesible en `/company`; estado/progreso visible | Visual de chat, tareas, resultados y Telegram; imports/rutas sin referencias; validacion de licencia de vendor | Revert UI/assets por Git; conservar snapshots de captura y datos de agentes |
| 3. Consultas `SPECIALIST` y `CEO_SYNTHESIZE` redundante en `runner.ts`, prompts de puestos consultivos | Herramientas/procedimientos tipados cubren la misma funcion; ningun task en esas etapas | Repetir casos historicos, costos, resumen fiel, fallos; recuento 0 de tareas abiertas por etapa y de nuevos eventos | Bandera temporal con fallback solo durante observacion; rollback al runner antiguo. Conservar instrucciones versionadas y resultados historicos |
| 4. Etapas `RESEARCH`, `PRODUCT_PLAN`, `VISUAL_DESIGN`, `KITTL_SELECT` del runner | Engine unico maneja job/coste/espera, Kittl y Alura se llaman por servicios conservados; Kittl pendientes drenados | Repetir investigacion sin nuevo cobro, prompt, credito Kittl, aprobacion Telegram/web, rechazo/revision, reinicio; cero tasks activas | Snapshot de DB/PNG y rollback de codigo; no repetir generacion ya facturada |
| 5. Rutas antiguas `/api/company/tasks/[id]/*`, `design-review.tsx` y campos de control de etapas | Ningun cliente/worker llama URLs viejas; UI nueva cubre revision; APIs nuevas y compatibilidad de IDs probadas | Logs de acceso durante ventana, `rg` clientes, tests API y revision web; cero tareas en etapas viejas | Mantener alias temporal antes de retiro; revert rutas/UI si clientes antiguos aparecen |
| 6. Worker `scripts/company-kittl-worker.mjs`, `company-worker-deploy.mjs` y drains viejos | Engine ejecuta sondeo Kittl/Telegram duradero y PM2 usa nueva configuracion; pendientes 0 | PM2 nuevo online, callbacks/no doble foto, Telegram error en tiempo, simulacion reinicio; logs del viejo sin actividad | No parar viejo antes de cortar lease; volver a PM2 anterior si nuevo falla. Conservar `company-telegram-setup.mjs` mientras sirva |
| 7. `app/company/operations/*` y rutas/office/catalogo antiguos | Panel James unico con estados Company/Automation, billing y Kittl; enlaces redirigidos | Comparar contadores, incidentes, costes, permisos, accesibilidad; logs sin acceso viejo | Redireccion y revert UI; no borrar reportes |
| 8. Esquema/code Company de orquestacion, tablas/indices sin uso | Retencion legal/operativa definida, historial exportado, restauracion probada, rollback de app ya cerrado | SQL de conteos/referencias, integridad FK, informes accesibles, auditoria costos | Preferir archivado de tablas/DB de solo lectura; migracion destructiva solo con autorizacion **separada**. Nunca eliminar mensajes, aprobaciones, gastos o eventos por limpieza cosmetica |
| 9. Estados/flags/paquetes/scripts residuales | Rutas y consumidores retirados, `rg` imports, `npm ls`, PM2/tarea Windows sin proceso viejo | Suite completa, build, endpoints y despliegue, sin codigo muerto ni flags permanentes | Git revert/version anterior; conservar export de configuracion sin secretos |

## Limites importantes

- **No retirar `lib/automation/` ni su agente Windows**: son candidatos a James Engine. Renombrar despues, si aporta claridad, sin cambiar contrato de red y sin crear un segundo motor.
- **No retirar Etsy, Pinterest, R2, Kittl, Alura, OAuth ni SEO** por pertenecer a un flujo antiguo: son servicios reutilizables de Autolisty.
- **No borrar `company_agents`, instrucciones, mensajes, informes, eventos, llamadas/costes ni `company_kittl_generations`** por el simple hecho de dejar de crear agentes. Definir retencion/archivo e integridad historica antes de cualquier `DROP`.
- `app/company/office/page.tsx` redirige `/company/office` a `/company`; puede conservarse indefinidamente como compatibilidad barata.
- Tras cada corte, observar errores y nuevos jobs en produccion antes de pasar al siguiente. Si falla una regresion, detener retiro, restaurar codigo compatible y reconciliar efectos externos (Kittl/Etsy/Pinterest) antes de reintentar.
