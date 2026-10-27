# Market Research Studio: etapa 4

## Matriz verificada (25-10-2026)

| Fuente | Contrato oficial revisado | Capacidad implementada | Acceso y límites | Estado sin configuración |
| --- | --- | --- | --- | --- |
| [EverBee Research API](https://research-open-api.everbee.com/docs/) | `GET /api/v1/keywords/{keyword}`, `GET /api/v1/keywords`, `GET /api/v1/listings`, `GET /api/v1/shops`; [guía](https://research-open-api.everbee.com/docs/research-open-api-guide.html) | Sugerencias de keyword relacionadas con volumen, competencia y score; primera página, hasta 20 resultados | Cabeceras `client_id` y `client_secret`, instalación aprobada, plan de pago; guía: 10 QPS y 50.000 QPD, cabeceras de cuota y 429. Coste comercial por llamada no publicado en guía; se contabilizan solicitudes, no créditos inventados. | `NOT_AUTHORIZED` hasta credenciales y confirmación explícita de instalación |
| [Alura API](https://docs.alura.io/) | `GET /v1/research/keywords`, `GET /v1/research/products`, `GET /v1/research/products/trending`; [keywords](https://docs.alura.io/guides/keyword-research), [productos](https://docs.alura.io/guides/find-products), [tendencias](https://docs.alura.io/features/trending), [uso](https://docs.alura.io/guides/usage-and-limits), [términos](https://docs.alura.io/legal/api-terms) | Keyword exacta, primera página de productos y una página de tendencias (máx. 25), normalizados con estimados separados de observados. Existe documentación de shops, history, reviews y saved lists, pero esos caminos no están integrados todavía. | Bearer `ALURA_API_KEY`; Free incluye 100 créditos/mes y 30 solicitudes/minuto según documentación. Keyword: 1 crédito por item devuelto; productos y tendencias: 10 por página con resultados. Se lee `Alura-Credits-Cost` para consumo informado. Datos Alura retenidos hasta 23 h, caché 1 h; términos oficiales imponen máximo 24 h salvo guardado en Alura. No se hace extracción masiva. | `NOT_AUTHORIZED` sin clave, `DISABLED` con interruptor apagado |
| [Etsy Open API v3](https://developers.etsy.com/documentation/reference/) | `GET /v3/application/listings/active` con `keywords`, `limit`, `offset`; [URL](https://developers.etsy.com/documentation/essentials/urlsyntax/) | Listings activos públicos y número de favoritos observado. **No se infieren ventas por listing.** | `x-api-key` existente, limit 1-100 (aquí máximo 25). Cuota de la aplicación no comprobada con cuenta real. | `NOT_AUTHORIZED` sin clave o `DISABLED` |
| [Google Trends API alpha](https://developers.google.com/search/apis/trends) | Acceso mediante solicitud a alpha; sin contrato disponible para esta cuenta | Ninguna llamada | No usar endpoints no documentados ni interpretar interés Google como búsquedas Etsy | `UNAVAILABLE` |
| Búsqueda web | No hay proveedor contratado/configurado | Ninguna llamada | No scraping ni navegación masiva; requiere proveedor autorizado y contrato | `UNAVAILABLE` |
| Marketplace Insights | Importación manual del propietario | Valor numérico, unidad, periodo, URL HTTPS y advertencia obligatoria | Se etiqueta **aportado por el propietario, no verificado**; no consume créditos | `AVAILABLE` solo para importación manual |

## Arquitectura y comportamiento

- `lib/research/market/contracts.ts` define conectores de capacidades heterogéneas y métricas con fuente, ID, captura, periodo, unidad, naturaleza e incertidumbre.
- `AluraConnector`, `EverBeeConnector` y `EtsyMarketConnector` solo usan hosts y rutas fijas, filtros acotados, credenciales de servidor y timeout de 12 s. Se reintenta 429 **como máximo una vez** si `Retry-After` no supera dos segundos. Errores externos no se devuelven literalmente al cliente.
- El planificador `openAiMarketPlanner` interpreta la petición en una llamada de lenguaje con JSON estricto, hasta tres términos y seis consultas propuestas. Las capacidades se cruzan con el catálogo realmente disponible; el modelo no construye URLs ni ejecuta herramientas arbitrarias. Si no hay conector, no llama al modelo.
- `executeMarketResearch` impone por defecto cuatro consultas, 20 créditos Alura estimados, dos solicitudes EverBee, dos Etsy y 45 s. No convierte métricas incompatibles en un score compuesto. Señala discrepancias cuando coinciden sujeto, métrica, unidad y periodo. Si se pidieron ventas/crecimiento/competencia y la respuesta no los cubre, marca `INSUFFICIENT`.
- SQLite v7 conserva ejecución, plan, consultas, cobertura, consumo y oportunidades. La evidencia cruda de Alura caduca a las 23 h y se elimina al consultar/usar el repositorio; las conclusiones propias pueden permanecer. El caché por consulta y proveedor dura 1 h. Una petición idéntica dentro de la ventana reutiliza el resultado sin llamadas; `Run fresh research` crea una ejecución nueva explícita.
- El estudio muestra estado de conectores, ejecuciones, cobertura, oportunidades y métricas con procedencia. Se pueden seleccionar varias oportunidades. La transferencia a `Create prompts` es manual y solo está habilitada con evidencia vigente; el motor creativo recibe un resumen de hasta 20 métricas, no respuestas completas de API, y conserva el `opportunityId`.
- `POST /api/research/market/manual` permite incorporar Marketplace Insights sin conectar cuentas. `GET/POST /api/research/market` consulta o ejecuta; `POST /api/research/market/select` guarda selección. Todas requieren propietario.

## Activación y bloqueo

No se ejecutó ninguna llamada real. `MARKET_RESEARCH_LIVE_ENABLED` está **apagado por defecto**; ponerlo en `true` es una decisión explícita para una prueba controlada. También se requiere `OPENAI_API_KEY` para el planificador. Las claves se configuran solo en el servidor, nunca en la UI ni en Git:

```text
ALURA_API_KEY=...
EVERBEE_CLIENT_ID=...
EVERBEE_CLIENT_SECRET=...
EVERBEE_INSTALLATION_APPROVED=true
ETSY_API_KEY=... (ya usada por Autolisty)
ETSY_SHARED_SECRET=... (ya usado por Autolisty)
MARKET_RESEARCH_LIVE_ENABLED=true
MARKET_RESEARCH_MAX_AI_TOKENS=2500
```

La presencia de clave no demuestra que la cuenta esté autorizada ni que el proveedor funcione: no se comprobó ningún acceso real. No activar EverBee sin confirmar instalación y suscripción. No habilitar el interruptor general en producción hasta acordar el presupuesto y revisar la UI con datos simulados.

## Límites pendientes

- El planificador usa tokens de OpenAI si el propietario ejecuta una investigación con el interruptor encendido. Antes de llamar aplica un presupuesto heurístico de 2.500 tokens (configurable) y limita la salida a 400 tokens; registra uso reportado. La estimación de entrada no es un límite exacto ni un tope monetario y no hay precio verificado. **No activar la ejecución real todavía sin aceptar explícitamente ese riesgo de gasto de IA.**
- No hay verificación de cuenta real ni de respuestas de producción. EverBee y Etsy pueden devolver 401/403; entonces la investigación queda parcial o insuficiente.
- No hay conectores para Alura shops/trending/history, web ni Trends alpha. Tampoco hay inferencia de productos compatibles ni análisis comercial de lenguaje posterior a la captura; las oportunidades actuales son agrupaciones deterministas de sujetos con evidencia, no recomendaciones de rentabilidad.
- La purga de Alura ocurre en acceso al repositorio, no mientras el servidor está apagado. Antes de activar Alura en producción hay que programar una limpieza independiente para garantizar el límite de 24 h aun sin tráfico.
- Una ejecución `RUNNING` interrumpida por caída de proceso no tiene reconciliación automática. `Run fresh research` permite continuar con una nueva ejecución, pero requiere cerrar/reconciliar estados huérfanos antes de uso continuo.
- La ruta heredada de Prompt Lab, Listing, Scale, Automation y Kittl no se modificaron.

## Verificación local

Pruebas automatizadas con conectores y planificador simulados: investigación abierta, cobertura insuficiente, dos fuentes, discrepancias, fallo parcial, límites, reutilización, nueva ejecución, selección múltiple, caducidad y normalización de Alura/EverBee/Etsy. No se usaron claves ni cuentas reales y no hubo llamadas facturables.

### Ejemplo ilustrativo, enteramente simulado

Solicitud: `Compara botanical print con sus alternativas`. El planificador simulado propone una consulta de productos a Alura y una consulta a EverBee. Los adaptadores simulados devuelven, para el mismo sujeto y periodo, `24` y `31` ventas mensuales **estimadas** respectivamente. El motor conserva ambos valores con proveedor y periodo, marca la discrepancia y crea una oportunidad `botanical print` enlazada a ambas evidencias. No calcula promedio, ventas verificadas ni proyección de rentabilidad. Los números de este ejemplo no proceden de las cuentas del propietario ni de los proveedores.
