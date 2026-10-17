# Autolisty Company - flujo de informacion y recuperacion

Estado: propuesta de diseno para revision. No autoriza ejecucion, gasto ni publicacion.

## Principio

El propietario habla libremente con el CEO. La estructura interna organiza el trabajo, pero no limita el formato ni la profundidad de sus respuestas. El sistema conserva hechos, decisiones y resultados; los agentes reciben contexto seleccionado para una tarea, no transcripciones completas.

## Cinco registros distintos

| Registro | Contenido | Escritura | Lectura habitual |
| --- | --- | --- | --- |
| Encargo | Peticion original, alcance interpretado, restricciones, autorizaciones y criterio de termino | Propietario aporta; CEO propone interpretacion; autorizaciones solo del propietario | CEO y responsables del proyecto |
| Estado de ejecucion | Unidad, etapa, responsable, dependencias, intentos, bloqueo y ultimo punto valido | Orquestador y servicios; responsables anotan excepciones | Agente o servicio asignado, CEO por consulta |
| Entregables y evidencias | Hallazgos con fuente y fecha, briefs, prompts, archivos, manifiestos, controles y draft | Area propietaria de cada entregable | Area siguiente y Calidad; CEO bajo demanda |
| Conocimiento vigente | Politicas, procedimientos, preferencias y especificaciones de producto, con alcance, version y autor | Sistemas versiona; autoridad funcional aprueba | Solo las piezas pertinentes para rol y tarea |
| Historial y aprendizaje | Conversaciones, eventos, errores, resoluciones y propuestas de nuevas reglas | Registro automatico y propuestas de agentes | Busqueda puntual, auditoria y aprendizaje |

R2 almacena archivos cuando el flujo lo requiera; no es por si mismo el indice ni la fuente de verdad del estado. Las referencias a archivos llevan identificador, checksum, version y ubicacion. Los secretos no entran en prompts ni en el expediente.

## Identidad y granularidad

- `request_id`: la peticion o conversacion concreta del propietario.
- `project_id`: el encargo operativo aprobado; una consulta puede no crear proyecto.
- `unit_id`: cada listing o entregable independiente dentro del proyecto.
- `artifact_id`: cada resultado inmutable o versionado, ligado a su unidad y etapa.
- `decision_id`: cada decision que altera alcance, autorizacion o criterio.
- `run_id`: cada intento de ejecucion, con resultado y coste.

Ejemplo: pedir diez listings crea un proyecto y diez unidades. La investigacion del nicho puede compartirse, pero cada unidad conserva su diseno, archivos, QA, SEO y draft. Un fallo en la unidad 4 no invalida las unidades 1 a 3.

## Ruta de un encargo conocido

1. **Recepcion.** El CEO entiende el pedido y consulta solo preferencias y politicas relevantes. Una pregunta se responde como pregunta. Si el pedido implica trabajo, registra alcance y autorizaciones existentes. Si una accion sensible no esta autorizada, deja esa puerta cerrada sin bloquear el trabajo preparatorio.
2. **Plan de trabajo.** El orquestador crea unidades y dependencias. El CEO delega objetivos a responsables; no participa en cada paso. Los limites de gasto y reintentos aplicables quedan asociados al proyecto antes de consumir servicios de pago.
3. **Investigacion.** Mercado entrega un paquete breve: nicho, demanda observada, competidores, terminos de busqueda, estacionalidad, fuentes, fechas, incertidumbres y recomendaciones. Evidencia no equivale a afirmar ventas exactas de terceros.
4. **Diseno y creacion.** Producto y Creativo toman solo el pedido, la investigacion pertinente y la especificacion del producto. Entregan concepto, prompts cuando correspondan, imagenes, seleccion final y razon de aceptacion. La generacion y descarga en Kittl quedan trazadas por trabajo y archivo.
5. **Produccion.** Recibe diseno aprobado, especificacion del producto y recursos. Ejecuta capacidades como Autobuildy, Photoshop, PDF y R2 segun el producto. Entrega carpeta o paquete final, manifiesto de archivos y controles tecnicos. No vuelve a investigar el nicho.
6. **Calidad.** Verifica promesas objetivas y defectos relevantes sobre el artefacto real. Devuelve observaciones al area duena sin rehacer etapas correctas. La evaluacion estetica incierta no se convierte automaticamente en bloqueo.
7. **SEO y draft.** Comercial recibe investigacion, diseno y archivos finales, no solo el prompt original. Genera SEO y atributos fieles al producto y crea o actualiza el draft en Etsy. Comprueba que imagenes y archivo digital correspondan a la misma unidad.
8. **Cierre de la fase autorizada.** El estado queda `draft_ready_for_owner_review`. El CEO informa el resultado y las excepciones. Publicar y hacer anuncios son acciones separadas que requieren permisos especificos. Marketing actua conforme al estado real de publicacion y sus permisos.

Para un estudio o consulta, el recorrido termina en el informe o respuesta solicitada; no se ejecutan las etapas 4 a 8 por inercia. Para un producto nuevo, Producto, Sistemas, Finanzas y Calidad definen primero el contrato de fabricacion y aceptacion.

## Paquete de contexto por tarea

El constructor de contexto toma `unit_id`, rol, etapa y versiones vigentes. Incluye: objetivo actual, restricciones, autorizaciones que afectan esa accion, entregables requeridos de etapas anteriores y politica aplicable. Cita referencias a fuentes y archivos en lugar de copiar contenido extenso. El agente puede solicitar una ampliacion puntual, registrada, cuando falte evidencia.

Orden de prioridad: instruccion actual del propietario dentro de su alcance; decisiones aprobadas del proyecto; politicas vigentes; especificacion del producto; evidencias del proyecto; historial buscado puntualmente. Un resumen automatico nunca reemplaza la fuente original al resolver una contradiccion.

No se adjuntan conversaciones completas ni todos los manuales en cada llamada. La recuperacion inicial puede usar claves exactas (producto, nicho, etapa, version, ID). La busqueda semantica se agrega si el volumen y las pruebas muestran que aporta valor.

## Correccion del propietario a mitad del trabajo

Ejemplo: despues de crear tres disenos de diez, el propietario indica que en este proyecto no quiere borde blanco de sticker.

1. El CEO registra literalmente la correccion y confirma su alcance: proyecto, producto o politica general. Si el mensaje ya lo especifica, no pregunta de nuevo.
2. Se crea una decision versionada y se identifica que unidades y artefactos dependen del criterio anterior. No se sobrescriben imagenes ni decisiones historicas.
3. Las unidades no iniciadas reciben el nuevo criterio. Las unidades en curso terminan la operacion atomica actual y se detienen antes de la siguiente etapa afectada.
4. Las unidades terminadas no se rehacen automaticamente. El CEO presenta el impacto concreto si cambiar lo terminado implica coste, retraso o publicacion ya realizada.
5. El responsable creativo decide la correccion dentro de su area; Produccion solo reprocesa los artefactos modificados. Si es una preferencia global nueva, Sistemas versiona la regla tras la aprobacion funcional correspondiente.

La consulta del CEO sobre este cambio se contesta con unidades afectadas, trabajo conservado, coste estimado y decision pendiente; no con una retransmision de todo el chat.

## Fallo de produccion y recuperacion

Ejemplo: Photoshop falla en el mockup 5 de la unidad 4, mientras las unidades 1 a 3 ya tienen drafts.

1. El servicio registra error tecnico, archivo, etapa, intento y log; conserva los artefactos validos. La unidad 4 pasa a `blocked` o `retryable`, no todo el proyecto.
2. Un reintento automatico ocurre solo si el error esta clasificado como transitorio y no puede duplicar una accion externa. Para Etsy, Kittl y R2 se comprueba el estado remoto antes de reintentar; la clave idempotente identifica la unidad y la accion.
3. Si el PSD requiere correccion, Produccion/Sistemas recibe el incidente. El CEO no se activa salvo impacto mayor o decision fuera de autoridad.
4. Tras corregir, el orquestador verifica checksum y versiones, retoma desde el ultimo punto valido y regenera solo los mockups o archivos afectados. No repite investigacion, generacion de Kittl ni los drafts terminados.
5. Calidad revisa la unidad reparada y Comercial continua con su draft. El historial conserva ambos intentos y su coste.

Una operacion no se marca completa solo porque el proceso salio sin error: debe existir un resultado verificable y asociado al `unit_id`. Una llamada externa cuyo resultado es desconocido se reconcilia antes de repetirla.

## Comunicacion y limites

- El trabajo rutinario se expresa como tarea, estado y evento; no como conversacion entre modelos.
- Un especialista consulta a otro con pregunta, `unit_id`, dato faltante y resultado esperado. La respuesta queda en el expediente.
- Un evento informa hechos, como `artifact_ready` o `draft_created`; no convoca a todos los agentes.
- Los responsables resuelven desacuerdos de alcance, calidad o prioridad. El CEO recibe una sintesis si excede la autoridad de los responsables.
- Los limites de iteraciones, reintentos y gasto son configurables por tipo de tarea. Al agotarlos se pausa esa tarea y se escala con evidencia, no se abre otra conversacion circular.
- Las esperas por usuario, Kittl, Photoshop o Etsy no consumen llamadas de modelo repetitivas. El sistema consulta estados con codigo segun necesidad.

## Almacenamiento y visibilidad inicial

Una base de datos transaccional pequena conserva proyectos, unidades, estados, decisiones, versiones, referencias y costes. Los archivos se guardan en el PC trabajador o R2 segun etapa y politica de retencion; la base de datos solo conserva sus referencias y metadatos. Un registro de eventos permite reconstruir que ocurrio y alimentar la oficina visual y notificaciones sin pedir al CEO que narre cada cambio.

La oficina muestra tareas y movimientos derivados de eventos reales. El propietario puede abrir una unidad y ver objetivo, responsable, etapa, entregables, coste, bloqueos y decisiones. La visualizacion no es fuente de verdad ni inicia acciones comerciales sin pasar por autorizacion.

## Pruebas de aceptacion de este diseno

1. Preguntar al CEO por un nicho produce un informe, no un listing ni cargos de generacion.
2. Pedir diez listings comparte investigacion cuando procede y conserva diez identidades independientes.
3. Cambiar un criterio a mitad del lote afecta solo las unidades y etapas pertinentes; el historial permite explicar por que las anteriores difieren.
4. Corregir un PSD y reintentar no regenera Kittl, no duplica archivos en R2 y no crea un segundo draft.
5. Tras reiniciar el PC trabajador o el servidor, cada unidad reanuda desde su ultimo resultado confirmado.
6. Un agente puede justificar sus decisiones con fuente, version de politica y artefacto sin leer toda la historia del proyecto.
7. El coste por unidad incluye intentos fallidos y correcciones; no se oculta en un promedio del lote.

## Decisiones diferibles

No quedan fijados aqui el framework de agentes, el motor de workflows, un almacén vectorial, importes definitivos ni la frecuencia exacta de reintentos. Se elegiran con pruebas y carga real. La semantica del flujo y sus pruebas de aceptacion deben mantenerse aunque cambie la tecnologia.
