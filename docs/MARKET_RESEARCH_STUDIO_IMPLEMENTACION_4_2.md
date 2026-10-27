# Market Research Studio - Etapa 4.2

Fecha: 2026-10-27. Alcance exclusivamente local. No se conecto a Alura, no se consumieron creditos, no se desplego al VPS y no se migro la base SQLite original.

## SQLite y respaldo

- Base usada por defecto en desarrollo: `data/autolisty-automation.sqlite`, esquema v3, `integrity_check=ok`, lectura y escritura permitidas. Las siete tablas de usuario existentes tienen cero filas. La base puede usar WAL: su tamano fisico no representa por si solo todos los datos.
- Respaldo consistente creado con la API `better-sqlite3.backup()` en `data/backups/autolisty-automation-stage4-2-2026-10-27.sqlite`. Tamano: 110592 bytes; SHA-256: `4c6b016963a0de58468ab1316dd643f1914fdf0e1b3e869f18ca9ef347ecf796`; esquema v3; `integrity_check=ok`; mismos recuentos que el original.
- Ensayo v3→v9 sobre copia desechable: pasa `integrity_check` y conserva los recuentos de todas las tablas anteriores. Ejecutado con `MARKET_RESEARCH_BACKUP_PATH` en `lib/research/market/migration-rehearsal.test.ts`. La secuencia pendiente es v4, v5, v6, v7, v8 y v9, en `lib/automation/db/migrations.ts`.
- La base original sigue en v3 tras el build y las pruebas. Todas las rutas `/api/research` ahora comprueban el esquema en modo solo lectura antes de abrir la base con migraciones automáticas. **Otras rutas de Automation conservan su comportamiento existente y podrian migrar la base si se usan**; no se modificaron por la restriccion de alcance.
- **Pendiente de autorizacion:** aplicar migraciones v4→v9 al original local. Aunque el ensayo fue correcto y no hay filas de usuario, una migracion del archivo original es una operacion de riesgo que requiere confirmacion expresa.

## Retencion y mantenimiento

- `scripts/research-maintenance.mjs --loop` ejecuta limpieza independiente del trafico web cada cinco minutos, registra cada pasada y sus errores, informa intervalos perdidos y evita solapamientos dentro del mismo proceso. `--once` permite una pasada supervisada.
- La evidencia Alura vence a las 23 horas; una pasada cada cinco minutos da margen frente al limite de 24 horas. El proceso limpio dos veces sobre la copia v9 en ejecuciones independientes (`missedIntervals=null` y luego `0`). Las pruebas con reloj simulado verifican que no borra antes del vencimiento y si despues.
- Los registros tecnicos del diagnostico que contienen plan y saldo tambien caducan a las 23 horas. El contador interno de creditos de prueba es contabilidad propia y permanece para impedir superar el techo acumulado.
- `lib/research/market/aluraBudget.ts` bloquea una llamada Alura si la ultima pasada exitosa **del proceso independiente** tiene mas de diez minutos, si falta el saldo verificable, si se superan 30 creditos de prueba o si el saldo posterior estimado baja de 40. Una limpieza disparada por una visita web no satisface esta condicion.
- El monitor del panel muestra salud y uso del presupuesto. **El proceso no esta instalado ni ejecutandose contra el original v3**, por lo que toda consulta Alura queda bloqueada. Antes de probar realmente se requiere migracion aprobada y ejecucion persistente/supervisada en el PC. El chequeo de salud evita nuevas llamadas cuando falla el mantenimiento, pero no puede garantizar por si solo la limpieza de datos ya adquiridos si el equipo permanece apagado mas de 24 horas; ese riesgo exige una operacion acordada o una politica de no adquisicion en ese entorno.
- La limpieza conserva notas y conclusiones independientes; expira evidencia, cache y copias derivadas sujetas al limite. La [politica oficial de Alura](https://docs.alura.io/legal/api-terms) permite conservar conclusiones propias, pero limita datos Alura locales a 24 horas salvo que se guarden en Alura.

## Conector y diagnostico

- `lib/research/market/alura.ts` autentica con bearer `ALURA_API_KEY` solo del servidor. Implementa keywords, busqueda de productos y productos en tendencia. La consulta de keywords ahora envia `language=en`; las ventas Alura se clasifican como estimadas, no como cifras verificadas por Etsy. `as_of` y periodos se conservan en la evidencia. Respuestas incompletas no generan metricas inventadas.
- La nueva accion local `Check Alura usage (free)` llama **solo cuando el propietario la confirme** a `GET https://api.alura.io/v1/usage`, con `usage:read`. Registra estado HTTP, latencia, plan, saldo, coste de cabecera, limite por minuto y un codigo de error saneado; no guarda la respuesta completa ni la clave. Esta accion no se ejecuto.
- La [documentacion de uso](https://docs.alura.io/guides/usage-and-limits) indica que `/v1/usage` no cuesta creditos y devuelve saldo/costes. Una respuesta exitosa verifica `usage:read`, **no** demuestra que `research:read` este autorizado. Hasta probar una consulta de investigacion, el diagnostico comercial sigue sin marcarse como plenamente operativo.
- Falta comprobar con la cuenta real si el plan y scopes permiten los endpoints. Las pruebas simuladas no lo prueban. El nombre `ALURA_API_KEY` esta presente en `.env.local`; no se imprimio ni copio su valor.

## Endpoints, costes y limites documentados

| Endpoint Alura | Funcion local | Coste maximo estimado de una llamada |
| --- | --- | --- |
| `GET /v1/usage` | Saldo y precios, diagnostico | 0 |
| `GET /v1/research/keywords?q=...&language=en` | Keyword individual, volumen, competencia, tendencia | 1 por keyword devuelta |
| `GET /v1/research/products?q=...&limit=...` | Busqueda de listings, precios y ventas estimadas disponibles | 10 por pagina con resultados |
| `GET /v1/research/products/trending?type=rising&limit=...` | Tendencias generales | 10 por pagina con resultados |

Fuentes: [creditos por operacion](https://docs.alura.io/api-reference/credits-and-limits), [keyword research](https://docs.alura.io/guides/keyword-research), [find products](https://docs.alura.io/guides/find-products), [trending](https://docs.alura.io/features/trending) y [autenticacion/scopes](https://docs.alura.io/authentication). El plan Free documenta 100 creditos API por mes, sin techo diario y 30 solicitudes por minuto; la disponibilidad real puede variar y se comprobara con `/v1/usage`. Errores, respuestas `202` y resultados vacios no se cobran segun la documentacion, pero una llamada completada puede cobrarse incluso si el cliente pierde la respuesta. Por eso no se repite automaticamente una llamada incierta.

## Presupuesto y aprobaciones

- Presupuesto acumulado de esta fase: 30 creditos; reserva minima: 40. Se persisten `spent_credits` y `reserved_credits` en SQLite v9, sin reinicio mensual automatico. La reserva es atomica antes de despachar cada llamada; un resultado incierto mantiene la reserva por prudencia. Si el saldo real es inferior a ~70, la regla `saldo - reservas - coste >= 40` reduce automaticamente el gasto permitido.
- El presupuesto es **techo, no autorizacion**. La investigacion completa permanece bloqueada por `MARKET_RESEARCH_FULL_RUN_ENABLED` (sin activar) y por confirmacion del propietario. La primera prueba de keyword tiene una puerta independiente `MARKET_RESEARCH_TRIAL_ENABLED` (sin activar), exige sesion de propietario, entorno local, esquema v9, mantenimiento sano y confirmacion literal. No existe un camino automatico desde el diagnostico al gasto.
- El coste observado se tomara de `Alura-Credits-Cost`. El precio podria cambiar antes de la prueba; la reserva previa utiliza el coste documentado y la llamada gratuita `/usage` comprueba el saldo. Una diferencia se registrara y bloqueara gastos posteriores si excede el techo.

## Primera prueba real propuesta, no ejecutada

1. Tras aprobar la migracion local y comprobar el mantenimiento, el propietario confirma la consulta gratuita `/v1/usage`; se verifica saldo, plan, scopes de uso y coste de cero creditos. Si el saldo es menor de 41 o falla la salud del mantenimiento, no se hace la prueba facturable.
2. Solicitud unica: `GET https://api.alura.io/v1/research/keywords?q=vintage%20botanical%20wall%20art&language=en`. Objetivo: comprobar autenticacion `research:read`, respuesta real, volumen, competencia y tendencia para **Vintage Botanical Wall Art**. Coste esperado: **0 si pendiente/vacia/error; hasta 1 credito si devuelve la keyword**. Con saldo supuesto de 70, quedarian al menos 69 y una reserva de 40. No se usara `products` ni el planificador en esta prueba.
3. La ruta local preparada es `POST /api/research/market/alura/trial`, protegida y desactivada por defecto. Registra la investigacion, una sola llamada, coste reportado, evidencia y procedencia. Una segunda invocacion devuelve el resultado existente o pide revision; no repite una llamada incierta. No se ha invocado.
4. Tras una autorizacion **distinta**, la investigacion comercial propuesta constaria inicialmente de una lookup de keyword (hasta 1 credito) y una pagina de productos (hasta 10), aproximadamente 11 creditos y dos llamadas comerciales, mas una llamada del planificador a OpenAI si se utiliza el flujo general. Eso permitiria comparar keyword, competencia, listings, precios y estimaciones de ventas. La seleccion de oportunidad y paso a Create Prompts se probarian con la evidencia real. El plan se ajustara al saldo y calidad de la primera respuesta antes de pedir esa segunda autorizacion.

## Pruebas y limites

- 84 pruebas pasan, incluidas migracion/filas, bloqueo del original v3, presupuesto, reserva, credenciales invalidas simuladas, respuestas incompletas, mantenimiento con reloj simulado, deduplicacion, procedencia y flujo previo de Create Prompts.
- TypeScript y ESLint pasan. Build local de produccion pasa.
- No se ha probado acceso real, scopes efectivos, latencia real, calidad comercial de la respuesta, disponibilidad de endpoints en el plan Free ni conversion real a briefs. Todo ello queda pendiente de la primera consulta autorizada.
- No hubo despliegue, cambios en VPS, Kittl, Etsy ni llamadas facturables.

**Estado:** preparacion local lista para revision. **No ejecutar la prueba real ni migrar el original sin confirmacion expresa.**
