# Market Research Studio: implementacion 1

Fecha: 25-10-2026. Este documento es permanente y debe actualizarse en cada etapa. No hay despliegue ni llamadas comerciales.

## Confirmado y operativo

- Autolisty muestra **Market Research Studio** en la navegacion principal. Dos entradas: Investigate market y Analyze references.
- Analyze references reutiliza íntegro el Prompt Lab visual actual (mismo `POST /api/prompt-lab`, dos llamadas OpenAI al pulsar Analyze). No se ejecutaron llamadas durante esta etapa.
- Investigate market permite crear/listar investigaciones **DRAFT** con titulo, tema, modo abierto/dirigido e interes de producto no restrictivo. No consulta Etsy, Alura, EverBee, web ni IA. Las tarjetas no simulan resultados.
- `GET/POST /api/research/investigations` exige autenticacion de propietario y usa la SQLite existente de Automation. Migracion v4 **aditiva**: no borra tablas, datos ni columnas previas.
- Contrato estructural: prompt creativo versionado separado de `creative_generation_configs` por producto; tablas de vinculacion N:M prompt/producto, proyecto, coleccion, piezas, imagenes generadas y reviews por pieza. No hay generacion real ni workflows de bundles.
- Image Lab, Listing, Scale, Automation y sus rutas comerciales no se modificaron.

## Esquema nuevo

`research_investigations`, `research_sources`, `research_evidence`, `research_opportunities`, `research_briefs`, `creative_prompts`, `creative_projects`, `creative_collections`, `creative_designs`, `creative_prompt_products`, `creative_generation_configs`, `creative_generated_images`, `creative_reviews`, `creative_learning_rules`. Solo las investigaciones tienen CRUD parcial operativo (crear/listar). Las demas tablas son preparacion de contrato, no funcionalidad disponible.

## Kittl MCP: evidencia y pendientes

No hay herramienta Kittl expuesta en esta sesion ni conector Kittl activo en el checkout. Sin endpoint autenticado no se pueden inspeccionar esquemas reales. **No se verifico directamente**: aspect ratio separado, seleccion de modelo, batch, paralelismo, formatos por prompt, IDs de generacion, recuperacion de imagenes, limites/errores. No se atribuyen capacidades de su web al MCP. Para comprobarlo sin creditos: conectar el servidor MCP oficial en un cliente autorizado, autenticar cuenta, listar herramientas y esquemas (sin invocar generacion), guardar nombres/versiones/schemas; preguntar al proveedor por cuotas si no aparecen en schema. Una lista de herramientas no prueba ejecucion simultanea ni persistencia: eso requeriria pruebas autorizadas posteriores.

## Pruebas de esta etapa

- `npm test`: 9 suites, 33 pruebas pasadas (incluye migracion aditiva, borradores y asociaciones prompt/producto/piezas).
- `npx tsc --noEmit`: correcto.
- ESLint focalizado en archivos nuevos y migracion: correcto. `app/page.tsx` conserva errores de lint preexistentes; no se refactorizo por estar fuera de alcance.
- `npm run build`: primer intento bloqueado por `EPERM` al crear `.next` dentro del sandbox; segundo intento local con permisos adecuados: compilacion, TypeScript, 34 paginas y postbuild correctos. No fue despliegue.
- Servidor de desarrollo local iniciado en `http://localhost:3001`; la experiencia visual no se verifico con una sesion autenticada de navegador.

## Pendientes y decisiones

- Seleccionar primera fuente Market Research y presupuesto; implementar adaptadores, cache y evidencia antes de mostrar oportunidades reales.
- CRUD de briefs/versiones, prompts, proyectos y aprobaciones; UI de bundles y reutilizacion de diseños.
- Modelo de aprendizaje: reglas quedan como propuestas hasta autorizacion explicita del propietario; ninguna se aplica automaticamente.
- Conectar resultados aprobados a Image Lab/Kittl solo despues de verificar proveedor y permisos.
- Confirmar si investigaciones manuales deben poder editarse/archivarse; esta etapa solo crea y lista.
- Migracion v4 se aplicara al abrir la DB con la nueva version; respaldar SQLite antes de cualquier deploy futuro. Una vez migrada, el codigo anterior que exige version exacta puede necesitar rollback de DB desde backup: no desplegar sin plan de respaldo.
