# Autolisty Company: estado integral y auditoria franca

**Fecha:** 21 de octubre de 2026. **Alcance:** codigo local de `autolisty`, pruebas locales y hechos de produccion confirmados previamente por el propietario. Este documento sirve para una revision externa; no es una declaracion de que la empresa este terminada.

## 1. Resumen ejecutivo

Se ha construido una base real, no una simulacion de respuestas prefijadas: James conversa mediante OpenAI, puede delegar investigacion y diseno, conserva conversaciones y tareas en SQLite, y la web y Telegram pueden compartir una conversacion. Hay control local de presupuesto, registro de tokens/costes y una oficina visual. Sin embargo, **Company aun no produce autonomamente un listing terminado**. No genera ni descarga arte en Kittl dentro del circuito, no entrega trabajos Company verificados a Autobuildy/Automaty, no cierra calidad y SEO sobre archivos reales, no crea el draft Etsy ni publica Pinterest desde ese circuito. Once puestos adicionales pueden recibir una consulta acotada del CEO en el codigo local, pero eso no les da herramientas operativas ni constituye once departamentos autonomos.

La revision actual contiene numerosos cambios **sin commit** desde el ultimo commit local `554218b` (17 de octubre). No deben confundirse con lo que corre en `autolisty.com`. Telegram + Company web compartiendo chat si fueron probados por el propietario en el servidor antes de esta tanda local; la nueva oficina y los consultores no estan verificados en produccion. No se ha hecho push, deploy ni llamada de pago para esta auditoria.

## 2. Alcance y criterios de estado

- **Implementado:** existe codigo ejecutable, esquema o interfaz. No implica prueba real del servicio externo.
- **Probado local:** tests automatizados o ejecucion local; un test con `fetch` simulado no verifica una cuenta real.
- **Probado en produccion:** comportamiento que el propietario confirmo expresamente en `autolisty.com`.
- **Pendiente:** falta codigo, integracion, credenciales, maquina o ensayo de extremo a extremo.

El repositorio actual combina Autolisty historico, Company, Automation/Automaty y recursos visuales. La existencia de APIs previas de Autolisty no significa que Company las invoque. Tampoco se debe equiparar el movimiento de un personaje en pantalla con una tarea empresarial real.

## 3. Decisiones aprobadas que orientan el desarrollo

1. El propietario habla principalmente con James, CEO. James debe conversar, responder preguntas, recordar y delegar con criterio, sin consultar cada microdecision.
2. Catalogo de 16 puestos, activacion selectiva: un producto no debe provocar 16 llamadas por defecto. Especialistas y responsables tienen limites y escalamiento; las conversaciones no conceden permisos de produccion o publicacion.
3. Distinguir proyecto/coleccion, unidad de diseno y listing. Un listing puede contener varias unidades. El identificador comercial `LBCreaStudio-XXXXXX` corresponde al listing/paquete, no a cada diseno.
4. Primero evaluar arte; despues verificar paquete comercial, y solo entonces crear draft. Publicar y activar publicidad requieren permisos separados y explicitos. Inicialmente el propietario revisa el draft.
5. Reutilizar investigacion entre unidades/listings pertinentes; evitar bucles y gasto inutil. Presupuesto piloto interno de USD 5, no garantia de facturacion externa. Meta futura de USD 0,35-0,40 de automatizacion por listing mas USD 0,20 Etsy: **aun no implementada como presupuesto por listing**.
6. Kittl es prioritario para creacion. Preferir creditos diarios incluidos (200); se menciono tolerar hasta 400 por dia segun resultados. Esa politica **no esta todavia aplicada por codigo**. Prompts visuales de Kittl en ingles, concretos, con texto, tipografia, composicion y colores cuando proceda.
7. El PC Automaty procesara archivos; VPS CX23 alojara web/backend; R2 almacenara entregables; las rutas definitivas del PC viejo se decidiran al migrar. La actividad debe poder pausarse y reanudarse sin duplicar trabajos.
8. La oficina debe ser visual, animada, con identidad de Autolisty alrededor y referencias estilisticas a Habblaud, pero debe reflejar la actividad real y organizar agentes por departamento.

## 4. Arquitectura actual

| Parte | Que existe | Limite actual |
| --- | --- | --- |
| Web/backend | Next.js en Autolisty, autenticacion existente, rutas privadas Company, OpenAI SDK oficial | Cambios recientes solo locales; no hay despliegue de la nueva oficina/cadena consultiva |
| Datos Company | SQLite separado, migraciones para agentes, instrucciones versionadas, conversaciones, mensajes, tareas, proyectos, unidades, listings, artefactos, eventos, llamadas, creditos externos, facturacion oficial, Telegram e integraciones | Es una base del servidor que la usa; no llama a la base de este PC. Hay que respaldarla y migrarla con cuidado |
| James | Modelo configurable (`gpt-5.4` por defecto), historial, decision/delegacion y sintesis | Puede equivocarse al decidir; no orquesta aun el producto final |
| Investigador | Modelo independiente (`gpt-5.4-mini` por defecto), Web Search con fuentes; reutilizacion de informes recientes | Alura es una alternativa preparada, no validada con cuenta real; las fuentes y vigencia requieren revision |
| Producto y creativo | Planificador produce brief; disenador entrega hasta tres conceptos y prompts; playbook y ejemplos aprobados | Son propuestas textuales, no arte final. No hay feedback visual cerrado con Kittl |
| Otros 11 puestos | Identidad, instrucciones, procedimiento, modelo configurable y consulta acotada a traves del CEO | Consulta analitica, sin ejecucion de herramientas externas ni flujo departamental persistente completo |
| Operador creativo | Rol y herramientas Kittl declarados; OAuth/MCP y descubrimiento de herramientas preparados | No genera/descarga una imagen real dentro de la tarea; marcado bloqueado |
| Automation/Automaty | API/cola, lease, checkpoint, worker Windows, descarga verificada por SHA-256, Autobuildy no visual, carga R2 presignada | No validado en el PC viejo ni enlazado de punta a punta desde Company |
| Oficina | `/company` carga escena nueva; ruta `/company/office` auxiliar; panel de chat/equipo/operaciones y personajes animados | Calidad visual y circulacion pendientes de prueba visual concluyente; actividad de muchos personajes es representacion, no trabajo real |

El CX23 informado por el propietario tiene 2 vCPU, 4 GB RAM y 40 GB de disco local. El diseño actual reserva el procesamiento pesado a Automaty; no se ha hecho prueba de carga 24/7 ni dimensionamiento final con Company completo. El despliegue habitual es cambio local, commit/push Git y deploy manual en VPS. Secretos quedan en `.env` del servidor y no deben ir a Git.

## 5. Registro honesto de los 16 puestos

| Puesto / departamento | Estado en codigo local | Trabajo efectivamente disponible |
| --- | --- | --- |
| James / Direccion | Activo | Conversacion, decision, delegacion y sintesis |
| Responsable de mercado | Consultivo | Dictamen acotado solicitado por James, no operacion comercial continua |
| Investigador de mercado | Activo | Informe con Web Search y fuentes, o ruta Alura condicionada |
| Responsable de producto | Consultivo | Analisis de alcance/viabilidad, no aprobacion automatica de nueva linea |
| Planificador de producto | Activo | Brief a partir del encargo e investigacion disponible |
| Direccion creativa | Consultiva | Criterio creativo bajo consulta, no dirige produccion real |
| Disenador visual | Activo | Direcciones y prompts de Kittl en ingles, no imagen terminada |
| Operador de creacion | Bloqueado | Identidad definida; generacion/descarga Kittl no conectada |
| Responsable de produccion | Consultivo | Analisis de proceso/excepcion, no controla Automaty |
| Responsable comercial Etsy | Consultivo | Analisis de paquete/draft, no crea ni publica |
| Especialista SEO | Consultivo | Puede opinar bajo consulta; no hay handoff obligatorio de SEO a draft |
| Responsable de marketing | Consultivo | Analisis, sin campanas o medicion operativa |
| Especialista Pinterest | Consultivo | Analisis, sin publicacion Company integrada |
| Responsable de calidad | Consultivo | Criterios/diagnostico; no son dos gates ejecutados en el pipeline |
| Responsable de finanzas | Consultivo | Analisis, no conciliacion integral automatica por listing/ingresos |
| Responsable de sistemas | Consultivo | Analisis de incidencias, no autogestion 24/7 |

Cada rol tiene instrucciones y `AGENT_PROCEDURES` (entrada, salida, politica, escalamiento). Los agentes conservan un ID estable y nombre configurable en datos. Aun falta asignar nombres propios al resto de la plantilla. Una ficha y un prompt no equivalen a conocimiento validado: competencia real de cada especialista, errores, calidad y aprendizaje deberan evaluarse con tareas y resultados.

## 6. Flujo que si se puede ejecutar y flujo deseado

**Actual:** mensaje web o Telegram -> tarea y decision de James -> (opcional) informe del investigador, o brief de Producto y conceptos de Diseno, o consulta unica a un especialista -> sintesis de James -> respuesta y registro. Se conserva contexto, artefactos, fuentes cuando existen, llamadas y costes calculados. La investigacion reciente puede reutilizarse si la consulta coincide y conserva vigencia. Un especialista consultivo no busca ni opera herramientas por su cuenta. La ruta de Web Search exige una busqueda y fuente para aceptar un informe nuevo; no se ejecuta por cada pregunta simple.

**Deseado pero no implementado:** mandato -> investigacion y direccion por coleccion -> unidades creativas -> imagen Kittl y exportacion -> evaluacion del arte -> Automaty/Autobuildy/Photoshop/Upscayl segun producto -> mockups y paquete final -> evaluacion comercial -> SEO desde archivos reales -> subir R2/archivos Etsy -> draft revisable -> publicacion con autorizacion explicita -> Pinterest con URL publicada -> metricas reales -> aprendizaje y costes por listing. Falta un contrato de handoff claro, estados idempotentes, recuperacion y pruebas de cada etapa. No se debe describir la cadena como funcional hoy.

Los bundles requieren tratamiento especial. Automocky tiene una opcion de bundle, pero Company no dispone aun de un flujo probado para crear mockups propios por cantidad/estilo ni de una decision cerrada entre componerlos con Kittl o convertirlos en PSD con smart objects. Para PNG sigue abierta la calidad de remocion de fondos. Esos problemas afectan cualquier promesa de produccion automatica de todos los productos.

## 7. Integraciones y dependencias

- **OpenAI:** llamadas reales por agente mediante SDK, usage devuelto por respuesta y coste calculado separado de coste oficial. La Admin API de Usage/Costs fue consultada anteriormente desde backend; importes oficiales pueden ser cero por programa gratuito, con desfase temporal y agregacion distinta a la contabilidad por tarea. El control de USD 5 reserva antes de llamar, pero no garantiza la factura externa. La cuota diaria gratuita se observa; no se debe tratar como credito ilimitado ni permanente.
- **Telegram:** bot del CEO, webhook, chat autorizado y enlace a una conversacion web; el propietario confirmo respuestas en ambos medios y mensajes visibles en navegador al actualizar. Es la misma identidad/memoria, no otro James. Configuracion de webhook/env y despliegue deben conservarse; no publicar tokens.
- **Alura:** adaptador `GET /v1/research/products`, habilitacion explicita, reserva de creditos, fecha y medicion informada por proveedor. Sin credenciales ni ensayo real en esta auditoria. No afirmar ventas como hechos solo por estimaciones. EverBee no integrado.
- **Kittl:** cliente MCP Streamable HTTP a `https://mcp.kittl.com/mcp`, inicio/callback OAuth, estado cifrado y listado de herramientas. No hay evidencia de autenticacion completada, herramienta de generacion invocada, exportacion descargada, calidad o cargo medido. La opcion Custom de Kittl muestra que un cliente MCP puede conectarse, pero no prueba esta implementacion.
- **Autobuildy/Automocky:** herramientas externas en este PC y procedimientos existentes. Company no ha validado cada producto/bundle mediante contrato maquina-a-maquina; hay que auditar versiones, interfaz no visual, Photoshop 2026, Upscayl y mockups al migrar al PC viejo.
- **Automaty y R2:** worker y endpoints de Automation existen, con permisos/URL presignada y codigo de listing preservado. Faltan instalacion, credenciales especificas del worker, rutas definitivas, prueba de encendido/apagado y trabajo Company completo en maquina antigua.
- **Etsy/Pinterest:** Autolisty historico ya usa APIs, R2, PDF y flujo de listings, pero Company aun no enlaza sus artefactos con drafts ni pines. Publicar Etsy y publicidad no estan autorizados por una charla. Se deben separar permisos para preparar archivos, crear draft, publicar y anunciar.
- **Identificadores:** asignacion local por listing y proteccion en la base Company; no hay registro global comprobado entre codigos historicos del navegador, Company y Automation. Unicidad universal no debe darse por resuelta.

## 8. Datos, memoria y control

La persistencia abarca agentes, versiones de instrucciones, conversaciones, tareas por etapa, informes, artefactos, eventos y coste por llamada. Hay proyecto, unidad de diseno, listing y relacion listing-unidades. La identidad interna de James puede sobrevivir a cambio de nombre. La misma DB permite que Telegram y web lean el mismo hilo vinculado. La persistencia tras reinicio y la recuperacion de trabajos de Company han sido probadas parcialmente; no existe todavia una simulacion completa de fallo durante cada handoff a produccion y publicacion.

La contabilidad distingue estimacion de modelo/herramienta, tokens observados, creditos Alura, facturacion oficial agregada y reserva del piloto. Faltan atribucion confiable de **factura oficial** por agente/proyecto/listing, gastos externos integrales (Kittl, Etsy, R2, Photoshop, publicidad), ventas/visitas reales y margenes. Una diferencia entre dashboard OpenAI e importe interno no es por si sola un bug: cuota gratuita, agrupacion por proyecto/dia, latencia, tarifas y llamadas de herramienta alteran la comparacion.

La seguridad reutiliza login de GitHub en produccion, verificacion de origen para acciones web, chat Telegram autorizado, secreto de webhook, credenciales backend y agente de PC con token limitado sin claves R2/Etsy/Pinterest. Esto necesita auditoria de despliegue y backups; no equivale a certificacion de seguridad. El acceso local de desarrollo evita OAuth solo si se habilita explicitamente y `NODE_ENV=development`; no debe habilitarse en produccion.

## 9. Oficina visual: avance y problemas sin maquillar

La pagina oficial local `/company` apunta a la oficina y `/company/office` existe como ruta auxiliar, no como una segunda empresa. Se conserva chat, conversaciones, vinculo Telegram, agentes, actividad, costes y entrada a Operaciones. La escena usa recursos seleccionados y codigo inspirado en Habblaud bajo su licencia MIT; **no integra el repositorio completo**. Tiene diez espacios departamentales y cinco areas comunes, mobiliario, personajes y movimiento de espera/recorrido con puertas. Los cuatro agentes principales pueden reflejar etapas; el resto aparece en la plantilla y una consulta puede destacar a su especialista.

El propietario detecto repeticion de sprites, salas vacias, objetos colocados sin criterio, alfombra desproporcionada y personajes cruzando paredes o saliendo por lugares inadecuados. Se editaron distribucion, objetos, puertas y recorridos, pero **no hay validacion visual final convincente despues de la ultima revision** ni prueba de navegacion/superposicion en varios tamanos. No afirmar que estos defectos esten corregidos sin nuevas capturas o inspeccion automatizada. El movimiento de los personajes es una animacion de interfaz; solo los estados conectados a tareas representan actividad real. Falta lenguaje de diseno mas rico y consistente, composicion por departamento, colisiones/puertas fiables, legibilidad a zoom y evidencia de que la oficina responde bien bajo carga. El resultado actual no alcanza aun la calidad que el propietario espera.

## 10. Verificacion de esta auditoria

- `npm test` con `TEMP` y `TMP` apuntando a `.tmp-test` del proyecto: **59 tests pasan; 2 pruebas live se omiten**. Sin llamadas de pago. Un intento inicial usando el temporal aislado de Windows fallo antes de ejecutar tests por `EPERM` en un `rename`; no era un fallo logico de los tests. Cambiar solo el temporal de la ejecucion permitio pasar.
- `npx tsc --noEmit`: sin errores.
- No se hizo build de produccion, ensayo de rendimiento, captura visual de esta version, prueba Kittl/Alura real, procesamiento en Automaty, draft Etsy ni publicacion. No se llamo a modelos ni a Web Search durante esta auditoria.
- Hay modificaciones locales y archivos nuevos sin commit (incluyendo catalogo, oficina, operaciones, Kittl, Alura, procedimientos, Automation y pruebas). El ultimo commit local es `554218b`, fechado el 17 de octubre. Antes de deploy se debe revisar diff, separar archivos temporales (`.tmp-test/`) y verificar el estado del remoto. No se debe subir `.env`, tokens ni datos SQLite operativos al repositorio.

## 11. Lo positivo y lo negativo

**Fortalezas:** circuito de IA real y persistente; un CEO unico accesible por dos canales; presupuesto preventivo; registros individuales y modelos configurables; proyecto/unidad/listing separados; reutilizacion de investigacion; permisos de publicacion no inferidos; Automation pensada para reanudacion; base existente de APIs/archivos reutilizable; 59 tests locales actuales.

**Debilidades:** distancia grande entre fichas de 16 agentes y negocio autonomo; Kittl aun no produce un archivo Company; once especialistas solo contestan consultas; calidad y SEO sin gates operativos; Company no entrega drafts; no hay medicion completa de retorno; bundles y fondos PNG sin procedimiento validado; oficina con defectos visuales abiertos; integraciones externas sin pruebas reales; cambios locales sin deploy; pruebas live omitidas. La promesa de funcionamiento continuo 24/7 no esta demostrada.

## 12. Incognitas y dependencias reales

| Tema | Que no se sabe / que falta | Dependencia |
| --- | --- | --- |
| Kittl | Herramientas exactas disponibles en la sesion propia, autenticacion duradera, parametros de generacion/exportacion, coste en creditos, calidad de salida | Autenticacion del propietario y ensayo controlado del MCP |
| Productos digitales | Contrato de entrada/salida para cada familia, limites de PSD/mockups/bundles y fondos PNG | Auditoria de Autobuildy y Automocky en versiones actuales; archivos de muestra |
| Automaty | Rutas, permisos Windows, Photoshop interactivo, horarios, recuperacion de apagado, capacidad | Preparacion y ensayo en el PC viejo |
| Etsy/Pinterest | Handoff de archivos/SEO real, IDs de drafts, publicacion posterior con permisos y URL para pins | Prueba de APIs existentes con entorno y datos validos |
| Coste comercial | Gasto real por listing, creditos Kittl, tiempo de PC, gastos de terceros, cuota gratuita, atribucion de ingresos | Volumen de pruebas y entidades de listing completadas |
| Criterio de calidad | Umbrales y gustos aplicables sin bloquear todo ni aprobarlo todo | Resultados visuales reales y feedback del propietario |
| Oficina | Comportamiento correcto del mapa, diversidad y fidelidad visual, vinculo actividad real/animacion | Capturas y pruebas interactivas en desktop/movil |
| Produccion | Estado exacto del remoto/VPS frente al arbol local actual | Revision de diff, commit, push y deploy controlados |

## 13. Secuencia recomendada para avanzar sin otra fase larga de papel

1. **Cerrar un circuito creativo real:** autenticar Kittl en entorno controlado, listar herramientas permitidas, generar/exportar una imagen de un concepto aprobado, registrar creditos y revisar calidad. Fallo recuperable, sin intentos ilimitados. Esto convierte al operador de creacion en algo mas que una ficha.
2. **Un producto digital concreto de extremo a extremo:** definir su contrato de archivos/mockups y gate de arte, conectar Company con el worker, verificar salida R2, SEO sobre manifiesto real y draft Etsy. No intentar todas las familias ni bundles simultaneamente.
3. **Validar en el PC Automaty y ante fallos:** instalacion, rutas configurables, horas utiles, parada tras producto, reanudacion e idempotencia. Despues ampliar productos y bundles.
4. **Medir y mejorar:** registrar por listing tiempo, tokens, coste estimado/oficial, creditos externos, incidencias y correcciones. Con resultados, dar trabajo real a Calidad, SEO, Marketing y Finanzas; no forzar llamadas innecesarias.
5. **Pulir la oficina con evidencia:** corregir composicion y movimiento con capturas/ensayos, mostrar estados de tareas reales y distinguir claramente agentes activos, consultivos y bloqueados.

Estas prioridades no exigen un organigrama nuevo. Si ChatGPT revisa esta auditoria, las preguntas utiles son: que eslabon tecnico impide primero un archivo Kittl real; que contrato minimo de un producto permite llegar a draft sin comprometer seguridad; que pruebas de fallo harian creible la reanudacion; y que parte del mapa visual debe corregirse para que represente la empresa en vez de adornarla.
