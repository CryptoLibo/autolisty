# Market Research Studio: etapa 3

## Operativo en código local

- `Create prompts` comparte la pantalla de Market Research Studio con `Investigate market` y el Prompt Lab anterior (`Analyze references`). Acepta hasta tres referencias PNG/JPEG/WebP/GIF, un brief y una investigación guardada, individualmente o combinados.
- La investigación actual es un **borrador del propietario** (`research_investigations.status = DRAFT`). No existe aún un recopilador de mercado ni validación automática de keywords/tendencias; el proveedor recibe esta distinción explícita.
- Dos modalidades: cuatro variaciones comerciales de un concepto o cuatro conceptos independientes. El producto es contexto opcional; no se crea configuración técnica, imagen, publicación ni trabajo de Automation.
- `LearningRepository.getApplicableRules` recupera reglas activas por contexto con precedencia existente (diseño, nicho, producto, general), límite estimado de tokens, deduplicación y conflictos visibles. La versión de cada regla aplicada queda en `creative_rule_uses`, vinculada a la versión de ejecución. La estimación de tokens es heurística; no corresponde necesariamente a la tokenización exacta facturada.
- `evaluatePrompts` verifica campos obligatorios, términos explícitos, similitud léxica y repetición de sujeto/composición/ángulo. Es una detección económica, no una garantía semántica. Si falla, se pide **una sola reparación dirigida** a los índices afectados y se conservan sin cambios los demás.
- La migración SQLite v6 guarda entradas textuales y hashes de referencias (no los archivos), versiones, cuatro prompts, vínculos de concepto, evaluaciones, intentos, selección, modelo, versión de instrucciones y uso reportado. El coste estimado permanece `null` mientras no exista una tabla de precios verificada; no se inventa un importe.
- El hash de entrada incluye reglas/versiones aplicables, modelo e instrucciones. Una solicitud idéntica reutiliza el resultado sin llamada nueva; `Regenerate` crea otra versión explícita. Si una llamada falla, la versión queda `FAILED` y un nuevo intento puede reanudarse. No se repiten llamadas automáticamente salvo el intento único de reparación.
- Cada prompt queda ligado a `creative_prompts`; las variaciones comparten concepto y los independientes generan conceptos separados. La selección del usuario se persiste. El concepto de una variación puede reutilizarse en una solicitud posterior.
- La ruta heredada `/api/prompt-lab` se conserva sin cambios de comportamiento. La integración de reglas e historial aplica al flujo nuevo `Create prompts`; las llamadas por la ruta heredada todavía no tienen trazabilidad v6.

## Endpoints

- `GET /api/research/creative`: historial; `?runId=`: versiones; `?versionId=`: detalle.
- `POST /api/research/creative`: generación autenticada mediante formulario. Si el usuario la ejecuta con OpenAI configurado, **sí puede consumir tokens**. Las pruebas usan un proveedor simulado.
- `POST /api/research/creative/select`: conserva una propuesta existente, sin llamar a IA.
- `POST /api/research/corrections`: registra y activa una corrección contextual salvo conflicto. Las reglas propuestas o en conflicto no se aplican hasta su resolución.

Todas las rutas requieren propietario. No se expone la clave del proveedor en cliente; las referencias se envían al proveedor desde el servidor y no se guardan en SQLite. Se guarda el texto del brief, por lo que no debe incluir secretos.

## Limitaciones y siguiente etapa

- La evaluación determinista no puede verificar completamente intención comercial, ortografía visual futura, contradicciones semánticas arbitrarias ni originalidad legal. Una evaluación fallida persiste con avisos para revisión humana; no se inicia generación de imágenes automáticamente.
- El proveedor utiliza `gpt-5.4-mini` y registra tokens reportados. El coste no se calcula sin tarifa configurada. No existe todavía un control monetario previo a la llamada para este flujo; no interpretar la caché como límite de gasto.
- Las referencias originales no se guardan; una regeneración con imágenes requiere adjuntarlas de nuevo para que el proveedor las vea. Las versiones anteriores sí pueden consultarse sin ellas.
- Market Research aún no produce evidencia comercial verificada. La siguiente etapa debería incorporar fuentes y procedencia verificables, y después una revisión humana de prompts e imágenes antes de cualquier producción o draft.

## Verificación

Pruebas de `creativeEngine.test.ts` con proveedor simulado: reglas inmediatas y aisladas, ambas modalidades, diversidad, reparación, persistencia, caché, versionado e independencia del producto. Suite total: 54 pruebas. `npx tsc --noEmit`, ESLint dirigido y build de producción pasaron localmente. No se ejecutó ningún proveedor comercial ni despliegue.
