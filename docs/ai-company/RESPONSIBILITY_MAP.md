# Autolisty Company - mapa de responsabilidades

Estado: propuesta para revision del propietario. No autoriza implementacion, gasto, publicacion ni cambios en produccion.

## Proposito y limites

Autolisty Company es una empresa de agentes que investiga, desarrolla, produce, comercializa y mejora productos digitales. El sitio Autolisty actual es una fuente de experiencia y capacidades reutilizables, no el procedimiento obligatorio de los agentes. Company podra vivir en un apartado del sitio o en un subdominio, con un nucleo operativo propio.

El propietario conversa solo con el CEO. Puede pedirle explicaciones, hacer preguntas, solicitar investigaciones o encargar acciones. Los especialistas pueden colaborar directamente para resolver dependencias concretas. Los responsables gobiernan sus departamentos y representan a sus equipos ante otras areas. El CEO interviene en decisiones transversales relevantes y excepciones; consulta al propietario solo cuando excede su autoridad.

Este mapa define puestos funcionales, no cantidad fija de llamadas a modelos ni de procesos activos. La plantilla y los modelos se fijaran tras definir procedimientos y medir calidad y coste. Un agente inactivo no necesita inferencia. Las herramientas deterministas no son agentes.

## Cadena de autoridad

1. Propietario: fija objetivos, apetito de riesgo y permisos de publicacion o gasto externo. Los presupuestos operativos definitivos se fijaran con costes observados.
2. CEO: atiende consultas del propietario, explica decisiones y estados con evidencia, traduce encargos en proyectos cuando corresponde, asigna responsables, resuelve conflictos mayores dentro de su mandato y presenta resultados o decisiones reservadas al propietario.
3. Responsable de departamento: acepta objetivos, asigna tareas, controla el consumo y la calidad de su area, resuelve incidencias y acuerda dependencias con sus pares. La facultad de reasignar presupuesto queda pendiente de datos reales.
4. Especialista: ejecuta una tarea delimitada, consulta el expediente, colabora directamente y entrega un resultado verificable. No modifica el alcance ni las politicas de otra area.
5. Servicio o herramienta: realiza operaciones acotadas y auditables, como validar dimensiones, procesar archivos, consultar una API o subir a R2. No decide estrategia.

El responsable de un proyecto no sustituye a los responsables funcionales: coordina hitos y dependencias; cada area conserva la aprobacion de su entregable.

## Modalidades de solicitud al CEO

| Modalidad | Ejemplo | Respuesta esperada | Efecto permitido |
| --- | --- | --- | --- |
| Consulta o explicacion | "Por que se rechazo este diseno?" | Respuesta directa basada en el expediente, con incertidumbre si faltan datos | Lectura; ninguna tarea de produccion |
| Investigacion acotada | "Quiero entender el nicho de profesores de primaria" | Informe con fuentes, fecha, hechos, estimaciones y conclusion | Delegar investigacion dentro de alcance y gasto autorizado; no fabricar producto |
| Asesoria o debate | "Crees que debemos entrar en esta categoria?" | Opciones, argumentos, riesgos y recomendacion | Analisis; ninguna accion comercial implicita |
| Encargo operativo | "Crea diez listings de vertical wall art" | Proyecto, alcance, responsables, hitos y resultado | Ejecutar solo pasos cubiertos por permisos y limite de gasto |
| Auditoria o estado | "Que hizo la empresa esta semana y cuanto gasto?" | Resumen trazable desde tareas, eventos y costes | Lectura y sintesis; sin alterar el trabajo |

El CEO clasifica la intencion antes de delegar. Si la pregunta tiene respuesta vigente en el expediente, contesta sin convocar departamentos. Si necesita conocimiento nuevo, encarga una investigacion delimitada. Una consulta no se interpreta como permiso para disenar, comprar, publicar, cambiar precios o iniciar anuncios. Si una peticion es ambigua respecto a un efecto externo o gasto, el CEO aclara ese punto antes de ejecutarlo. La empresa debe poder responder preguntas fuera de los procedimientos de producto, dentro de sus conocimientos, herramientas y permisos; cuando no sepa algo, investiga o reconoce la limitacion.

## Departamentos

| Area | Responsable | Decide | Entrega | No decide |
| --- | --- | --- | --- | --- |
| Direccion | CEO | Prioridad y asignacion entre proyectos autorizados; resolucion de excepciones interdepartamentales dentro de presupuesto y politica | Mandato de proyecto, decisiones ejecutivas, informe al propietario | Nuevos permisos propios, gasto no autorizado, cambios de politicas reservadas |
| Inteligencia de mercado | Responsable de mercado | Metodos y fuentes de investigacion; confianza de hallazgos | Expediente de nicho, demanda, competidores, keywords, estacionalidad y oportunidades con fuentes | Aprobar producto, afirmar como reales ventas estimadas de terceros |
| Producto y catalogo | Responsable de producto | Propuesta de valor, publico, composicion, formatos y especificacion de una linea o producto | Brief de producto y requisitos de aceptacion | Declarar demanda sin Mercado, aprobar riesgos financieros o legales, imponer ejecucion tecnica |
| Estudio creativo | Direccion creativa | Concepto visual, direccion artistica, variantes y criterios esteticos dentro del brief | Conceptos, prompts de produccion si se usan, disenos y justificacion de seleccion | Cambiar publico objetivo, promesa comercial o presupuesto |
| Produccion digital | Responsable de produccion | Metodo de fabricacion, mockups, especificaciones de entrega y secuencia de trabajo local | Originales aprobados para fabricar, archivos finales, mockups, paquete de entrega, manifiesto de integridad | Cambiar concepto, posicionamiento o licencia comercial |
| Comercial Etsy | Responsable comercial | Estructura de listing, SEO y atributos basados en producto real; propuesta comercial dentro de politica | SEO, precio propuesto junto a Finanzas, imagenes ordenadas y draft verificable | Inventar caracteristicas, publicar sin permiso, alterar archivos aprobados |
| Marketing | Responsable de marketing | Plan organico, Pinterest, calendario y propuestas de promocion | Pines, copys, enlaces, calendario y resultados de distribucion | Gastar en anuncios o cambiar promesas de producto sin autorizacion |
| Calidad y cumplimiento | Responsable de calidad | Verificacion objetiva de archivos y promesas; evaluacion visual graduada con criterios en aprendizaje | Dictamen trazable, defectos con responsable y criterio de correccion | Redisenar producto, imponer gustos no validados o corregir silenciosamente trabajo de otras areas |
| Finanzas y analitica | Responsable financiero/analitico | Metodo de medicion, imputacion de costes y recomendaciones economicas; propuesta de presupuestos cuando exista historial | Consumo y coste real, rentabilidad estimada, KPIs y recomendaciones | Autorizar gasto adicional propio, tratar correlacion como causalidad |
| Sistemas y conocimiento | Responsable de sistemas/conocimiento | Integridad operativa, contratos de herramientas, recuperacion, seguridad tecnica y propuesta de cambio de procedimientos | Servicios fiables, incidentes resueltos, registro de decisiones y politicas versionadas | Cambiar reglas comerciales o permitir acceso a datos por iniciativa propia |

Los puestos de especialista se crean donde exista trabajo diferenciado y medible. Los responsables anteriores pueden tener especialistas a cargo; no se necesita un agente directivo adicional para ratificar cada tarea. La separacion de Finanzas/Analitica o Sistemas/Conocimiento se revisara cuando el volumen lo justifique. Atencion al cliente queda como area candidata: primero se verificaran permisos, fuentes de datos y alcance deseado.

## Contrato comun de trabajo

Toda solicitud entre agentes o departamentos debe tener `project_id`, solicitante, responsable, objetivo, insumos referenciados, entregable esperado, limite de gasto/iteraciones, fecha o condicion de revision y estado. El expediente del proyecto conserva la version aprobada de briefs, disenos, archivos, SEO, decisiones, costes, fuentes y resultados.

Antes de consultar a otro agente, el solicitante busca el dato en el expediente. Si existe y es vigente, se usa sin llamada a un modelo. Si falta, el especialista pregunta directamente al propietario funcional del dato. Una colaboracion directa no transfiere autoridad ni crea un proyecto nuevo.

Los responsables participan cuando una solicitud cambia el alcance, las prioridades, el presupuesto o un criterio aprobado; cuando dos especialistas no resuelven una discrepancia relevante; o cuando el trabajo afecta a varias areas. El CEO recibe un resumen de opciones y evidencias solo si los responsables no pueden resolverlo dentro de sus mandatos.

## Escalacion y aprobaciones

| Evento | Primera respuesta | Escala cuando |
| --- | --- | --- |
| Error tecnico recuperable | Servicio con reintento acotado; Sistemas si persiste | Afecta seguridad, datos, presupuesto o bloquea varios proyectos |
| Defecto de diseno o archivo | Especialista y responsable del area duena | La correccion cambia el brief, el coste autorizado o la promesa comercial |
| Dependencia informativa entre areas | Especialistas directamente | La respuesta exige una decision nueva o hay desacuerdo persistente |
| Conflicto entre areas | Responsables pares | No hay acuerdo dentro de politica, presupuesto y objetivo aprobados |
| Cambio de prioridad entre proyectos | CEO | Cambia un compromiso reservado al propietario |
| Nueva linea de producto, politica general, gasto adicional o riesgo comercial relevante | CEO prepara recomendacion | Siempre requiere decision del propietario salvo delegacion expresa y delimitada |
| Publicacion, cambio de precio o anuncios | Servicio ejecutor comprueba autorizacion especifica | Falta, caduca o contradice la autorizacion |

La aprobacion registra accion, alcance, presupuesto, version del artefacto y vigencia. Aprobar un proyecto no concede permiso ilimitado para acciones futuras. Las puertas de aprobacion concretas se cerraran con el propietario al definir los procedimientos.

### Politica provisional de Calidad

Calidad distingue tres niveles. **Fallo objetivo bloqueante:** el archivo falta, no abre, incumple el formato prometido, contiene un fondo cuando se vende como transparente, o el draft promete mas piezas de las que entrega. Se bloquea esa unidad y se devuelve al area duena con evidencia. **Defecto corregible:** un mockup se ve mal, un texto tiene un error o un borde presenta residuos visibles; se pide correccion concreta, sin rehacer trabajo valido. **Juicio estetico aun no consolidado:** una composicion parece menos atractiva o no coincide del todo con preferencias inferidas; se registra y se consulta al responsable creativo. No se convierte en veto automatico.

Al comienzo, Calidad aprende los gustos del propietario a partir de revisiones y resultados. Una preferencia solo se convierte en criterio general cuando se valida su alcance; se puede revertir. Se mediran tanto defectos que Calidad dejo pasar como rechazos que el propietario considero injustificados. El objetivo no es bloquear mucho ni aprobar todo, sino mejorar la precision.

### Presupuesto y observacion inicial

No se fijan importes promedio ni facultades de reasignacion sin datos. Finanzas registra llamadas, tokens, creditos de Kittl, herramientas y coste por proyecto y resultado aceptado. Hasta contar con historial, cada encargo de pago tiene una autorizacion y limite provisional explicitamente definidos antes de ejecutar; al alcanzarlo, se detiene el gasto adicional y se eleva una propuesta. Esto evita gasto ilimitado sin presentar un promedio inventado. La politica de reasignacion se decide despues de observar proyectos reales.

### Comunicacion proactiva del CEO

El CEO escribe al propietario cuando se publica un producto, se completa un proyecto o existe un problema que requiere su intervencion. Pueden ser varios mensajes si contienen novedades utiles; no existe una cuota artificial de mensajes. Las notificaciones rutinarias se forman a partir de eventos y plantillas sin invocar un modelo. El CEO usa inferencia solo cuando debe explicar, sintetizar o recomendar una decision. Telegram no sustituye el expediente detallado del proyecto.

## Dos rutas de proyecto

**Produccion conocida:** un producto con especificacion y proceso aprobados puede fabricarse por lotes. Se comparte investigacion y brief comun; cada unidad conserva identidad, archivos, QA, SEO y resultado propios. Solo se activan departamentos necesarios. Un error en una unidad reanuda desde su ultimo punto valido.

**Producto nuevo:** Mercado y Producto proponen la oportunidad y su viabilidad; Creativo y Produccion definen concepto, archivos, mockups y experiencia del comprador; Sistemas determina capacidades faltantes; Finanzas estima coste y Calidad fija pruebas. No se usa un flujo existente por analogia sin verificar compatibilidad. La nueva linea requiere aprobacion del propietario antes de produccion comercial sostenida.

En ambas rutas, Finanzas, Calidad y Marketing pueden intervenir temprano cuando su criterio cambie la decision; no son fases obligatoriamente finales.

## Politica inicial de eficiencia

- Medir coste por resultado aceptado, no solo por llamada. Registrar uso por proyecto, agente, modelo, herramienta y fase.
- Usar modelos por capacidad requerida; reservar el de mayor capacidad para CEO y problemas excepcionales. La asignacion nominal se fijara con evaluaciones representativas.
- Activar agentes por tarea o evento, no mantener conversaciones de fondo para simular actividad.
- Compartir datos estructurados y referencias a artefactos; no retransmitir historiales completos.
- Validar con codigo lo determinista: archivos, dimensiones, limites, duplicados, estados y permisos.
- Acotar revisiones, debates y reintentos por tarea. Ante el limite, escalar un resumen con alternativas.
- La espera por el propietario, una API o Automaty no genera nuevas llamadas periodicas sin motivo.
- Un aprendizaje propuesto conserva fuente, caso, resultado y alcance. Sistemas versiona la regla; el responsable de negocio y, si aplica, el CEO o propietario aprueban su promocion.

## Relacion con la oficina visual

La oficina muestra el estado empresarial; no lo decide. `task_started`, `tool_running`, `dependency_requested`, `meeting_opened`, `approval_needed`, `blocked` y `completed` son ejemplos de eventos verificables. Una reunion laboral representa una decision o colaboracion registrada. Actividades de descanso o ambiente son simulacion local y no generan consumo de IA ni modifican tareas. Pizarras, mesas y agentes abren expedientes y metricas con fuente y fecha.

Todo cambio visual seguira un patron: el backend publica estados y eventos estables; la escena los interpreta; las acciones del usuario pasan por la misma capa de autorizacion que las vistas convencionales. Nunca se inferira una accion comercial a partir de una animacion.

## Separacion del repositorio

Este documento vive temporalmente en `docs/ai-company/` para revisarlo junto al codigo y conocimiento actuales. La opcion preferida para construir Company es un repositorio nuevo con limites claros: `company-core` (estado, autoridad y eventos), `agents` (perfiles y procedimientos versionados), `capabilities` (adaptadores de Kittl, Etsy, Pinterest, R2 y trabajadores locales), `office` (vista isometrica), y `infra` (despliegue y observabilidad). Los nombres son conceptuales, no estructura aprobada.

El repositorio nuevo no tiene que copiar Autolisty ni depender de sus pantallas. Las capacidades existentes se extraeran o expondran mediante contratos probados. La decision entre apartado del sitio y subdominio no debe alterar identidad, permisos ni modelo de datos de Company. Antes de crear el repositorio, definir limites de propiedad del codigo y despliegue para evitar duplicar secretos o estados.

## Puntos para revisar con el propietario

1. Que acciones de publicacion y gasto puede autorizar por proyecto frente a por producto.
2. Definir con resultados reales el equilibrio entre falsos rechazos y defectos que Calidad dejo pasar, por categoria de producto.
3. Decidir despues de medir costes reales los importes de presupuesto y las facultades de reasignacion de cada responsable.
