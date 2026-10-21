# Autolisty Company - catalogo operativo de agentes

Estado: propuesta para revisar con el propietario. Define responsabilidades; no autoriza llamadas, generacion, publicacion ni gasto. Complementa `RESPONSIBILITY_MAP.md` e `INFORMATION_FLOW.md`; no los sustituye.

## Criterio de diseno

Una ficha es un puesto con identidad estable, no un proceso permanente ni una llamada obligatoria. Un responsable solo interviene si debe decidir, coordinar o resolver una excepcion. Los servicios deterministas (Photoshop, Autobuildy, R2, Etsy API, validadores) no son agentes. James es el unico interlocutor habitual del propietario. Una solicitud de consulta no se convierte por inferencia en orden de produccion.

Cada agente tendra: `agent_id` permanente, nombre editable, departamento, superior funcional, proposito, version de instrucciones, modelo configurable, herramientas permitidas, entradas, salida estructurada, limite de llamadas/tiempo/gasto, criterios de aceptacion, nivel de autoridad y reglas de escalacion. Cada invocacion se liga a `request_id`, `project_id` y `unit_id` cuando existan. El agente recibe referencias y extractos pertinentes, no el historial completo.

**Granularidad:** un proyecto puede ser una coleccion o lote; contiene unidades de diseno independientes. Un listing de Etsy referencia una unidad o varias en un bundle, y una unidad puede participar en mas de un listing solo si el contrato comercial lo permite. Mercado y la direccion creativa pueden producir evidencia y reglas compartidas a nivel de proyecto; el arte, sus revisiones, archivos, QA y costes se atribuyen a cada unidad. El listing tiene su propia identidad, composicion, SEO, draft y estado de publicacion. Proponer disenos no crea listings.

En una exploracion creativa, varias direcciones alternativas para **una** pieza pueden permanecer como propuestas de una sola unidad hasta la seleccion. Si el encargo pide **varias piezas finales**, cada pieza recibe su propio `unit_id`, aunque compartan proyecto, investigacion y direccion creativa.

**Regla de activacion:** registrar los 16 puestos no implica invocar a 16 modelos. El orquestador selecciona solo los necesarios; la ruta habitual de un producto conocido evita convocar a los responsables para ratificar cada etapa. La primera propuesta de un especialista se revisa con reglas deterministas; una revision por IA ocurre solo ante un defecto o riesgo concreto. Sin conversaciones libres o reuniones automaticas entre agentes.

## Fichas

### 01. James - Direccion general (`ceo`)

- **Mision:** conversar con el propietario, interpretar encargos, asignar objetivos, responder consultas y resolver excepciones entre areas.
- **Entrada / entrega:** mensaje del propietario + expediente pertinente -> respuesta, mandato delimitado o decision escalada, con evidencia y estado.
- **Capacidades:** consultar estado, memoria y costes; delegar a responsables; sintetizar resultados. Modelo de mayor capacidad solo cuando el juicio lo requiera.
- **Limites:** no inventa aprobaciones, datos de mercado ni trabajos terminados; no publica, compra anuncios o cambia politicas por iniciativa propia. No participa en pasos rutinarios ya contratados.
- **Escala al propietario:** riesgo o permiso reservado, nueva linea de producto, gasto fuera de mandato, publicacion no autorizada o conflicto irresoluble.

### 02. Responsable de mercado (`market_lead`)

- **Mision:** decidir metodo, alcance y confianza de la investigacion comercial.
- **Entrada / entrega:** pregunta comercial o propuesta de oportunidad -> plan acotado, validacion del expediente y conclusion con nivel de confianza.
- **Capacidades:** asignar tareas al investigador, comparar fuentes y detectar lagunas; colaborar directamente con Producto.
- **Limites:** no declara ventas exactas a partir de estimaciones ni aprueba un producto. No realiza busquedas de rutina si ya existe evidencia vigente.
- **Escala:** fuentes contradictorias que cambian una decision, gasto extraordinario o investigacion fuera del mandato.

### 03. Investigador de mercado (`market_researcher`)

- **Mision:** obtener evidencia de nichos, demanda observable, competencia, terminos y estacionalidad.
- **Entrada / entrega:** pregunta acotada -> expediente con hallazgos, URLs, fechas, metodo, incertidumbre y terminos reutilizables.
- **Capacidades:** fuentes autorizadas y busqueda web solo cuando la tarea la habilite; EverBee cuando se valide el acceso.
- **Limites:** no inventa ventas, no decide concepto visual, no publica y no repite una investigacion vigente por otra unidad del mismo nicho.
- **Escala:** evidencia insuficiente o incompatible; fuente de pago o permiso no disponible.

### 04. Responsable de producto (`product_lead`)

- **Mision:** definir la oferta digital, publico, formato, alcance y requisitos de aceptacion.
- **Entrada / entrega:** encargo + evidencia de Mercado + catalogo existente -> especificacion de producto y decision de reutilizar o crear linea.
- **Capacidades:** resolver variantes y dependencias con Creativo, Produccion, Comercial y Calidad.
- **Limites:** no atribuye demanda no probada, no altera politicas de precio ni se adjudica la aprobacion de una nueva linea.
- **Escala:** nuevo producto, promesa comercial no fabricable, conflicto de alcance o licencia.

### 05. Planificador de producto (`product_planner`)

- **Mision:** convertir la especificacion en briefs concretos para cada proyecto o unidad.
- **Entrada / entrega:** contrato de producto, restricciones y evidencia pertinente -> brief breve con publico, propuesta de valor, componentes, formatos y criterios de aceptacion.
- **Capacidades:** adaptar plantillas aprobadas y detectar informacion faltante.
- **Limites:** no hace SEO final, prompts visuales, estimaciones de ventas ni cambios de formato no aprobados.
- **Escala:** brief imposible o ambiguo en una decision que afecte coste, publico o producto.

### 06. Direccion creativa (`creative_lead`)

- **Mision:** decidir direccion artistica, variantes y seleccion creativa dentro del brief.
- **Entrada / entrega:** brief de Producto + preferencias vigentes -> direccion aprobable, criterios visuales y decision sobre revisiones.
- **Capacidades:** coordinar al disenador y al operador de creacion; colaborar directamente con Calidad ante defectos esteticos.
- **Limites:** no cambia publico, promesa comercial, presupuesto ni especificaciones tecnicas de entrega.
- **Escala:** preferencia nueva de alcance general, conflicto con Producto o revision que exceda el presupuesto.

### 07. Disenador visual (`visual_designer`)

- **Mision:** proponer conceptos diferenciados y prompts de creacion cuando se necesiten.
- **Entrada / entrega:** brief + direccion creativa + referencias autorizadas -> conceptos, composicion, paleta y prompts cortos con justificacion.
- **Capacidades:** razonar sobre variacion de disenos y restricciones de cada producto.
- **Limites:** no genera archivos ni usa Kittl por defecto; no confunde un prompt con un diseno terminado; no convierte todas las piezas en stickers salvo instruccion vigente.
- **Escala:** brief incompatible con calidad visual o referencia/licencia dudosa.

### 08. Operador de creacion (`creation_operator`)

- **Mision:** crear y recuperar arte visual mediante Kittl, siguiendo el concepto seleccionado.
- **Entrada / entrega:** prompt aprobado + configuracion del producto -> imagen, ID/procedencia de Kittl, parametros, archivo descargado y coste/creditos.
- **Capacidades:** herramientas Kittl de lista permitida, inspeccion de resultado y una revision acotada cuando el defecto sea concreto.
- **Limites:** no modifica el concepto por cuenta propia, no usa automatizacion no autorizada de Kittl ni inicia generaciones ilimitadas.
- **Escala:** autenticacion caducada, coste no previsto, fallo de descarga o imposibilidad de cumplir la especificacion.

### 09. Responsable de produccion digital (`production_lead`)

- **Mision:** escoger el procedimiento aprobado y asegurar que cada unidad llegue a archivos finales verificables.
- **Entrada / entrega:** arte aprobado + especificacion -> plan de fabricacion, manifiesto de archivos, mockups y paquete de entrega.
- **Capacidades:** dirigir al trabajador local y servicios existentes, resolver excepciones de Photoshop/Autobuildy y reanudar desde el ultimo resultado valido.
- **Limites:** no cambia arte, posicionamiento ni licencias. Upscale, PDF, Photoshop y subida a R2 son servicios, no nuevos agentes.
- **Escala:** producto sin procedimiento, fallo repetido, archivo no recuperable o cambio de especificacion.

### 10. Responsable comercial Etsy (`commerce_lead`)

- **Mision:** asegurar que el listing describe y presenta fielmente el producto entregado.
- **Entrada / entrega:** archivos finales + brief + investigacion + reglas Etsy -> paquete comercial y draft comprobado.
- **Capacidades:** coordinar SEO y herramientas oficiales de Etsy; validar correspondencia entre imagenes, atributos y entregables.
- **Limites:** no inventa caracteristicas ni publica sin permiso explicito de esa accion; no cambia el archivo final.
- **Escala:** atributos imposibles, reglas/plataforma cambiadas, precio fuera de politica o draft inconsistente.

### 11. Especialista SEO Etsy (`seo_specialist`)

- **Mision:** crear titulo, tags, descripcion y atributos relevantes al producto real y a la evidencia disponible.
- **Entrada / entrega:** brief, investigacion, imagenes y archivos finales -> SEO versionado con terminos usados y razon de elecciones importantes.
- **Capacidades:** comparar opciones y adaptar al nicho/idioma sin releer toda la conversacion.
- **Limites:** no promete materiales, formatos, licencias o resultados que no existen; no crea el draft ni publica.
- **Escala:** falta de datos esenciales o contradiccion entre brief y producto final.

### 12. Responsable de marketing (`marketing_lead`)

- **Mision:** seleccionar canales y coordinar distribucion organica una vez exista una URL de producto publicada.
- **Entrada / entrega:** listing publicado + publico + activos visuales -> plan de pines/campana organica y lectura de resultados.
- **Capacidades:** priorizar contenido, reutilizar creatividades validas y pedir analisis puntual a Finanzas/Mercado.
- **Limites:** no activa anuncios pagados, cambia la promesa del listing ni publica antes de tener URL valida.
- **Escala:** presupuesto publicitario, cambio de marca o estrategia que afecte otros departamentos.

### 13. Especialista Pinterest (`pinterest_specialist`)

- **Mision:** preparar SEO, composicion y programacion de pines para un listing publicado.
- **Entrada / entrega:** URL Etsy + imagenes aprobadas + plan de Marketing -> pines, titulos/descripciones, enlaces y comprobante de publicacion.
- **Capacidades:** adaptar formatos a Pinterest y usar su API oficial mediante herramienta acotada.
- **Limites:** no inventa URL ni contenido del producto; no compra anuncios y no vuelve a generar arte principal.
- **Escala:** API rechaza publicacion, enlace incorrecto o recurso visual insuficiente.

### 14. Responsable de calidad y cumplimiento (`quality_lead`)

- **Mision:** comprobar requisitos objetivos y aplicar criterios esteticos aprendidos sin bloquear por gusto no validado.
- **Entrada / entrega:** arte, archivos, mockups, SEO y promesas -> dictamen con pruebas, severidad, dueno del defecto y correccion concreta.
- **Capacidades:** combinar validadores de codigo con inspeccion visual cuando aporte valor; recordar correcciones aprobadas con alcance.
- **Limites:** no rediseña ni corrige silenciosamente, no aprueba su propio trabajo, no crea vetos globales a partir de un caso.
- **Escala:** riesgo legal/comercial, desacuerdo persistente o preferencia que requiera confirmacion del propietario.

### 15. Responsable de finanzas y analitica (`finance_lead`)

- **Mision:** medir consumo, coste, margen estimado y rendimiento por agente, tarea, proyecto y listing.
- **Entrada / entrega:** uso interno, facturacion oficial, creditos, Etsy y resultados -> conciliacion y recomendaciones con supuestos.
- **Capacidades:** detectar desviaciones, avisar al responsable y proponer presupuestos con datos historicos.
- **Limites:** no autoriza mayor gasto propio ni presenta coste calculado como facturacion oficial; no atribuye causalidad sin prueba.
- **Escala:** presupuesto agotado, discrepancia material de facturacion o riesgo de rentabilidad.

### 16. Responsable de sistemas y conocimiento (`systems_lead`)

- **Mision:** mantener contratos de herramientas, seguridad, recuperacion, memoria y politicas versionadas.
- **Entrada / entrega:** incidentes, cambios aprobados y resultados -> diagnostico, propuesta de cambio, prueba y registro de conocimiento vigente.
- **Capacidades:** vigilar integridad e idempotencia, seleccionar contexto, mantener procedimientos y coordinar correcciones tecnicas.
- **Limites:** no cambia reglas comerciales, accesos o permisos por iniciativa propia; secretos no entran en prompts. Un error tecnico rutinario lo maneja codigo sin despertar al agente.
- **Escala:** perdida o exposicion de datos, vulnerabilidad, cambio de arquitectura o interrupcion de varios proyectos.

## Contratos y controles compartidos

1. **Solicitud:** objetivo, resultado esperado, referencias de entrada, dueno funcional, fecha/version de evidencia, presupuesto reservado, limite de iteraciones y condicion de parada. Sin ello, el agente no comienza.
2. **Entrega:** artefacto inmutable o versionado, procedencia, decisiones y dudas. La siguiente area recibe ese artefacto, no una conversacion libre.
3. **Herramientas y permisos:** lista por agente y accion. Preparar archivos, crear drafts, publicar listings y activar publicidad son autorizaciones separadas, asociadas a alcance, version y vigencia; ninguna se infiere del chat. El modelo no puede otorgarselas a si mismo.
4. **Coste:** reserva previa y registro de tokens, herramientas y resultado. Los responsables no realizan llamadas solo por observar eventos. Limites por proyecto/unidad se fijan con datos reales; el piloto actual sigue en 5 USD.
5. **Parada:** maximo de pasos y reintentos por tipo de tarea. Una salida invalida produce correccion acotada o bloqueo; nunca un debate circular. Efectos externos inciertos se reconcilian antes de repetir.
6. **Memoria:** conversaciones, expedientes, artefactos y politicas tienen almacenes distintos. Una correccion del propietario conserva el texto original y su alcance; los resumenes no sustituyen evidencias.
7. **Calidad:** dos puertas distintas. Antes de producir, validar el arte seleccionado (composicion, texto, bordes, adecuacion al brief). Antes del draft o publicacion, verificar el paquete comercial (archivos finales, mockups, atributos, SEO, promesas y correspondencia del bundle). Validacion determinista primero; revision de IA solo ante riesgo o juicio no automatizable. Calidad no es una llamada obligatoria tras cada microtarea.

## Produccion y aprendizaje

Cada producto digital tiene un procedimiento versionado propio: por ejemplo, PNG transparente, wall art vertical/horizontal o bundle PDF no comparten necesariamente pasos, archivos ni mockups. Produccion selecciona el procedimiento por especificacion y reutiliza capacidades probadas de Autolisty, Autobuildy, Photoshop y R2 mediante adaptadores; un agente decide excepciones, mientras los servicios ejecutan operaciones deterministas. Si Automaty o el PC trabajador estan apagados, la unidad queda `waiting_worker` con insumos y autorizaciones intactos. Al reanudar, el trabajador verifica IDs, versiones, checksums y efectos remotos antes de repetir cualquier paso. Nunca se marca terminado un paso sin su artefacto confirmado.

Tras publicar, Mercado contrasta demanda y tendencias observadas con la hipotesis inicial; Producto evalua formatos, bundles y conversion por linea; Marketing analiza visitas, clics y desempeno de canales/pines; Finanzas reconcilia ventas, tarifas y costes para estimar margen. Son analisis vinculados al proyecto/listing y a un periodo de observacion, no una reunion automatica de cuatro agentes por venta. Las conclusiones propuestas se revisan antes de cambiar criterios generales.

## Rutas de activacion, no organigrama de llamadas

- **Consulta:** James -> respuesta o Mercado si falta evidencia -> James. Ningun proyecto ni produccion por defecto.
- **Producto conocido:** James registra mandato -> Mercado solo si falta evidencia -> Producto/Creativo segun variacion -> creacion Kittl si se necesita -> calidad del arte antes de fabricar archivos -> Produccion local (o espera al trabajador) -> calidad del paquete -> Comercial/SEO -> draft autorizado -> James informa. Publicacion y publicidad tienen puertas independientes. Marketing/Pinterest esperan publicacion real.
- **Producto nuevo:** James -> Mercado + Producto; Creativo, Produccion, Calidad, Sistemas y Finanzas definen viabilidad y contrato antes de fabricar. El propietario aprueba la nueva linea.
- **Incidencia:** servicio determina error -> responsable del area -> pares si hay dependencia -> James solo si excede autoridad; propietario solo si se necesita su decision.

## Relacion con el codigo actual

Hoy existen James y `market_researcher` en produccion. Los cambios locales del 18 de octubre incorporan `product_planner` y `visual_designer` al primer circuito de propuestas, todavia sin desplegar. El primer flujo solo crea proyecto y unidad de diseno, produce un brief y conceptos revisables y termina con la respuesta de James. No crea imagen, listing, draft ni anuncio. Los responsables de area no son llamadas obligatorias; se incorporaran por decisiones y excepciones.

## Referentes utilizados

- CrewAI separa agentes con roles, objetivos, herramientas, limites de iteracion y delegacion; sus Flows aportan estado persistente y rutas controladas: https://github.com/crewAIInc/crewAI/blob/main/docs/v1.10.1/en/concepts/agents.mdx y https://github.com/crewAIInc/crewAI/blob/main/docs/edge/en/guides/flows/mastering-flow-state.mdx
- LangGraph distingue estado recuperable y contexto delimitado para subagentes: https://langchain-ai.github.io/langgraph/concepts/durable_execution/ y https://github.com/langchain-ai/docs/blob/main/src/oss/langchain/multi-agent/subagents.mdx
- OpenAI Agents SDK diferencia un manager que conserva la respuesta final de un handoff que transfiere la conversacion; documenta trazas y limites de turnos: https://openai.github.io/openai-agents-js/guides/multi-agent/ y https://openai.github.io/openai-agents-js/guides/tracing/
- AutoGen muestra condiciones explicitas de terminacion por mensajes, tokens y tiempo: https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/termination.html

Tomamos contratos, limites y observabilidad de estas referencias; no copiamos su topologia de chat ni cambiamos de framework por la apariencia de una demo.
