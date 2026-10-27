# Market Research Studio: estructura y aprendizaje inmediato

Fecha: 25-10-2026. Implementacion local, no desplegada. Continuacion de `MARKET_RESEARCH_STUDIO_IMPLEMENTACION_1.md`.

## Implementado

- Migracion SQLite v5 aditiva en `lib/automation/db/migrations.ts`. `creative_concepts` enlaza investigacion y oportunidad. `creative_prompts.concept_id` y `creative_designs.concept_id` preservan linaje. `creative_generation_jobs` conserva diseno, concepto, prompt/revision, config tecnica, estado e idempotency key. `creative_production_links` prepara el enlace 1:1 con `automation_jobs`, sin ejecutarlo. El draft Etsy sigue siendo dato de Automation, no una publicacion nueva.
- `CreativeRepository` crea/consulta oportunidades y conceptos, versiona prompts sin sobreescribir, crea proyectos/disenos/configuraciones y registros de generacion PENDING. Comprueba que investigacion, proyecto, concepto y prompt correspondan; reintentos con misma clave y contenido devuelven el mismo ID, claves reutilizadas con otro contenido se rechazan. Todavia no hay UI ni endpoints publicos de conceptos/generacion; es un servicio interno probado.
- `LearningRepository` guarda texto original, instruccion estructurada, ambito, clave, prioridad, estado, version y snapshot historico. Cuatro ambitos: general, producto, nicho y diseno/concepto. Un ambito omitido queda PROPOSED; ambito explicito se activa al guardar salvo conflicto del mismo ambito/clave. Cambios usan version esperada. Regla desactivada no vuelve a la siguiente consulta.
- Consulta selectiva `getApplicableRules(context,{maxMemoryTokens,runId})`: producto, nicho, concepto/diseno; resuelve nicho desde concepto si existe. Precedencia diseno > nicho > producto > general y prioridad dentro del mismo nivel. Dedupe por conflict key y texto. Devuelve conflictos entre especifica y general para revision. Limita a 200 candidatas indexadas y usa presupuesto **conservador de bytes UTF-8**, no conteo exacto facturado de tokens. Con `runId`, persiste IDs/versiones utilizadas en `creative_rule_uses`.
- Ninguna regla se inyecta aun en el Prompt Lab actual; la interfaz interna esta preparada para un motor creativo futuro. No hay Kittl ni generacion de imagenes.

## API autenticada de propietario

- `GET/POST /api/research/corrections`: listar y registrar texto. POST acepta `text`, `scope?`, `scopeKey?`, `instruction?`, `conflictKey?`, `priority?`, `activate?`. Sin `scope` explicito queda PROPOSED. `needsConfirmation` indica que no esta activa. No hay llamada IA.
- `GET/PATCH /api/research/corrections/[id]`: historial y edicion/activacion/desactivacion con `expectedVersion`. Un conflicto con regla activa del mismo ambito impide activacion automatica y devuelve `CONFLICT`.
- `POST /api/research/corrections/applicable`: previsualizacion de instrucciones relevantes, presupuesto y contradicciones; no registra un uso de generacion. El futuro motor llamara al servicio con `runId` para registrar uso real.

## Pruebas

`npm test`: 10 suites, 46 pruebas pasadas. Incluyen aplicacion inmediata, aislamiento Vertical Wall Art, reglas generales, contradiccion, desactivacion, alcance ambiguo, multiples conceptos/productos, versiones de prompt, presupuesto y auditoria, migracion v4->v5 con datos conservados, dedupe y reintento de generacion. `npx tsc --noEmit` y ESLint focalizado correctos. `npm run build` correcto; no despliegue. No se usaron APIs pagas ni base de produccion.

## Limitaciones y siguientes pasos

- La interpretacion actual es determinista: usa el texto como instruccion y una clave de conflicto proporcionada o derivada por normalizacion simple. No detecta toda contradiccion semantica. Una interpretacion propuesta por IA sigue pendiente y debera ser opt-in, con coste visible y confirmacion humana antes de activarse.
- No existe UI para revisar reglas ni API de CRUD creativo; solo API de correcciones. No se enlaza aun una imagen aprobada a `creative_generation_jobs`/Automation. La columna legado `creative_learning_rules` de v4 queda sin uso y no se borra.
- El presupuesto de memoria en bytes es deliberadamente mas restrictivo que un presupuesto de tokens real; no representa consumo facturado. La consulta esta acotada a 200 candidatas prioritarias. Si crece mucho la memoria, evaluar paginacion por prioridad y tests de rendimiento.
- Antes de desplegar: respaldo SQLite (WAL incluido), plan de reversion de esquema y verificacion de que el build sirve la misma version. No se ejecuto migracion sobre VPS.
- Proxima etapa recomendada: UI de revision de reglas y CRUD creativo, luego integrar `getApplicableRules` al nuevo motor creativo con registro de uso real; no modificar el Prompt Lab visual sin pruebas de regresion.
