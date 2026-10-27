# Market Research Studio - Etapa 4.1

Fecha: 2026-10-25. Alcance: repositorio local exclusivamente. No se accedio al VPS, no se hizo deploy ni se consumieron cuentas, creditos o APIs reales. La base local preexistente estaba en esquema v3 al inspeccionarla; **no se migro esa base**. La migracion v8 fue verificada solo por tests con SQLite temporal/en memoria.

## Cambios

- `lib/automation/db/migrations.ts`: esquema v8 para leases de investigacion, recuperacion, cancelacion, bitacora por llamada externa y registro de mantenimiento.
- `lib/research/market/repository.ts` y `engine.ts`: reserva atomica antes del planificador, plan persistido, registro PREPARED/IN_FLIGHT/COMPLETED/UNKNOWN, persistencia transaccional de resultado y evidencia, bloqueo de reenvio cuando el resultado de una llamada externa es incierto. Cancelacion cooperativa entre consultas y conservacion de resultados parciales. Un trabajo con plan ya guardado y llamadas no enviadas puede reanudarse cuando se vuelva a solicitar; una llamada incierta requiere revision, nunca reintento automatico.
- `scripts/research-retention.mjs` y `scripts/research-maintenance.mjs`: limpieza independiente del trafico web, bitacora de resultados/errores y deteccion de leases vencidos. `npm run research:maintenance` ejecuta un bucle horario; `node scripts/research-maintenance.mjs --once` realiza una pasada. **No se ha instalado, iniciado ni programado** este proceso en el servidor. Requiere esquema v8 y nunca ejecuta migraciones.
- `app/api/research/market/cancel/route.ts`: cancelacion autenticada para el propietario. `app/api/research/market/route.ts`: recuperacion de leases vencidos y diagnostico de configuracion en lectura.
- `lib/research/market/diagnostics.ts`: estados NOT_CONFIGURED, NOT_AUTHORIZED, AVAILABLE, DEGRADED y UNAVAILABLE. La mera presencia de credenciales no produce AVAILABLE. No se hacen sondas reales automaticamente.
- `app/_components/MarketResearchWorkspace.tsx`: estados de recuperacion, cancelacion, diagnosticos visibles y confirmacion antes de una investigacion forzada que pueda gastar creditos.
- `lib/research/creativeEngine.ts`: vencimiento de la evidencia que pasa a Create Prompts para poder limpiar copias persistentes.

## Retencion Alura

Los registros Alura se marcan con vencimiento a las 23 horas, dejando margen al ciclo horario. La limpieza borra evidencia y fuentes, enlaces a oportunidades y llamadas, cache, copias de evidencia en entradas creativas, discrepancias de cobertura, creditos reportados y texto de oportunidades derivado de Alura. Mantiene la investigacion, seleccion y notas independientes no procedentes de la respuesta del proveedor. La limpieza tambien se ejecuta al leer investigacion/cache si la ultima pasada tiene mas de cinco minutos. Si el proceso horario no esta activo y nadie consulta la aplicacion, **no hay garantia de limpieza por tiempo**; activarlo y monitorizarlo sera obligatorio antes de permitir consultas Alura reales. El ciclo de 23 horas mas el intervalo horario puede rozar 24 horas; para una garantia estricta hacen falta monitorizacion externa y una frecuencia menor. No se deben activar llamadas reales hasta resolver ese requisito operacional.

La [politica oficial de Alura](https://docs.alura.io/legal/api-terms) limita el almacenamiento de ciertos datos obtenidos por API a 24 horas y distingue las conclusiones propias del usuario. No se asume que todos los datos propios deban borrarse. La ruta de [uso y limites](https://docs.alura.io/guides/usage-and-limits) documenta una consulta de uso sin coste, pero **no se ejecuto** contra la cuenta.

## Recuperacion y costes

La deduplicacion es por investigacion y hash de solicitud. La llamada a IA y cada llamada comercial quedan registradas antes de despacharse. Si el proceso cae despues del despacho pero antes de guardar la respuesta, el resultado se marca UNKNOWN/NEEDS_REVIEW. Reenviar automaticamente podria duplicar cargos y esta prohibido. Si la llamada estaba PREPARED, se puede continuar de forma segura. Los resultados COMPLETED se reutilizan. `force` exige confirmacion en UI y crea una corrida nueva explicitamente.

La deteccion de interrupciones es automatica en lectura y en mantenimiento. La continuacion de un trabajo READY necesita volver a solicitarse; **no hay worker de reanudacion autonoma**. La cancelacion es cooperativa: no puede detener una peticion HTTP ya enviada. El limite de creditos es preventivo y basado en estimaciones del conector; no es una cuota contractual sincronizada con el proveedor.

## Auditoria de integraciones

| Fuente | Codigo local | Estado real verificado | Limite |
| --- | --- | --- | --- |
| Alura | `lib/research/market/alura.ts`: keywords, products, trending; normalizacion de estimaciones y coste reportado | No. Credencial local detectada, sin llamada real ni autorizacion de uso en esta etapa | La disponibilidad y coste real de cada consulta siguen pendientes. No confundir ventas estimadas con ventas verificadas. |
| EverBee | `lib/research/market/everbee.ts`: keywords, `client_id`/`client_secret`, puerta de instalacion aprobada | No. Sin instalacion aprobada comprobada | Solo keywords implementado. La [guia oficial](https://research-open-api.everbee.com/docs/research-open-api-guide.html) condiciona acceso y cuotas; sus datos analiticos son estimaciones. |
| Etsy | `lib/research/market/etsy.ts`: listings activos y favoritos publicos | No. Sin consulta real en esta etapa | No expone ventas de competidores por listing. Respetar [cuotas oficiales](https://developers.etsy.com/documentation/essentials/rate-limits/); permisos y acceso real pendientes de prueba. |
| Google Trends | Sin conector operativo | No configurado | La [API oficial](https://developers.google.com/search/apis/trends) tiene acceso limitado; sin accesos no se simulan datos. |
| Web | Sin proveedor autorizado | No configurado | Se conserva como capacidad complementaria futura, nunca fuente obligatoria. |
| Marketplace Insights | Entrada manual | Funcional en tests locales | Evidencia aportada por propietario, no verificada por API. |

El diagnostico mostrado usa configuracion y ultimo resultado guardado. AVAILABLE requiere una llamada exitosa previamente autorizada; NO se prueba conexion en vivo en GET. Errores de red antes de guardar respuesta se muestran como DEGRADED cuando existe un fallo registrado. Esto no sustituye una prueba real, y un resultado exitoso antiguo no garantiza disponibilidad actual.

## Verificaciones

- Suite local: 75 pruebas, 12 archivos, todas pasan. Incluye interrupciones, no repeticion de llamadas, cancelacion, limpieza y diagnostico con proveedores simulados.
- `npx tsc --noEmit`: pasa.
- ESLint sobre los archivos de esta etapa: pasa.
- `npm run build`: pasa fuera del sandbox; el primer intento en sandbox tuvo EPERM al crear `.next/types`, sin error de compilacion.
- No se hizo una prueba de audio, Kittl, Etsy o consultas comerciales; fuera del alcance.

## Configuracion y siguiente decision

`MARKET_RESEARCH_LIVE_ENABLED` debe permanecer desactivado hasta aprobar las pruebas reales. Alura requiere `ALURA_API_KEY`; EverBee requiere `EVERBEE_CLIENT_ID`, `EVERBEE_CLIENT_SECRET` y confirmacion explicita `EVERBEE_INSTALLATION_APPROVED`; Etsy requiere las credenciales ya utilizadas por Autolisty. Las claves no se muestran ni se copian a los diagnosticos. `AUTOMATION_DB_PATH` debe apuntar a la base correcta para el mantenimiento.

Antes de probar con cuentas reales: decidir una frecuencia de limpieza menor de una hora, supervisor/alerta del proceso de mantenimiento, respaldo de la base, migracion local de ensayo y autorizacion explicita de cada llamada diagnostica. No hay preparacion suficiente para **activar Alura real en produccion** mientras la limpieza independiente no este instalada y monitorizada. El sistema si esta listo para pruebas simuladas y revision funcional local.
