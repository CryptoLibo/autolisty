# Autolisty Company - estado de implementacion (20 octubre 2026)

## Resultado verificable

Company no esta lista para operar de extremo a extremo. El circuito conversacional de James, investigacion, planificacion de producto y conceptos visuales existe en el repositorio. La cadena desde una imagen creada en Kittl hasta un draft Etsy, Pinterest y seguimiento comercial no esta conectada ni probada. Ninguna publicacion real ni consulta de pago se ejecuto durante esta revision.

## Cambios de esta revision local

- Investigador: adaptador de solo lectura para el endpoint oficial de Alura `GET /v1/research/products`. Devuelve fecha, estimaciones y encabezados de creditos; la clave permanece en el backend. Sigue desactivado por defecto y requiere `ALURA_API_KEY`, `COMPANY_RESEARCH_PROVIDER=alura`, `COMPANY_ALURA_RESEARCH_ENABLED=1`, `COMPANY_ALURA_MAX_CREDITS_PER_RESEARCH>=10` y `COMPANY_ALURA_CREDIT_CAP` positivo.
- Creditos Alura: reserva atomica y persistente antes de cada solicitud; registro de cargo informado por el proveedor. Si la respuesta falla, la reserva queda comprometida como cargo incierto y no se reintenta automaticamente. El tope local no garantiza la facturacion externa.
- Identidad comercial: cada listing Company nuevo recibe un codigo `LBCreaStudio-XXXXXX`; puede agrupar varias unidades de diseno. Automation acepta ese codigo sin reemplazarlo y usa el ID del listing Company como clave de idempotencia. Los trabajos manuales conservan su asignacion anterior.
- Supervision: `/company/operations` y `/api/company/operations` muestran proyectos, unidades, listings, presupuesto piloto, cola Automation, origen manual/Company, disponibilidad de proveedores y los 16 puestos. Solo cuatro puestos tienen agentes ejecutables; los demas se muestran pendientes o bloqueados.
- Se conservo la independencia de `image-lab/`; no se agregaron acciones que publiquen Etsy o Pinterest.

## Reutilizacion auditada

| Componente | Existe | Estado Company |
| --- | --- | --- |
| James, investigador, producto, diseno, memoria SQLite, Telegram, coste de modelos | Si | Circuito parcial operativo; no es una cadena de listings |
| Worker Automaty, leases, checkpoints y carga directa presignada a R2 | Codigo presente | No verificado en el PC secundario ni vinculado a Company |
| Autobuildy, Upscayl, Photoshop, seleccion de mockups | Flujos externos existentes | No hay contrato programatico Company probado para todos los productos |
| R2 `deliverables/`, `delivery-pdf/`, `mockups/`, `pinterest/` | Si | Automation prepara varias rutas; no hay paquete Company completo |
| Etsy drafts, archivos, atributos, URLs y Pinterest | APIs existentes en Autolisty | No orquestadas desde Company; publicar no autorizado |
| Alura | Adaptador backend implementado | Sin clave local ni consulta real; creditos externos no comprobados |
| Kittl MCP/OAuth | Acceso descrito por Kittl | Sin conexion autenticada del backend ni generacion/descarga probada |
| Calidad, SEO, marketing, finanzas, sistemas y responsables | Puestos catalogados | No son agentes activos ni tienen circuito operativo |

## Identificador y compatibilidad

El usuario confirmo que el codigo corresponde al listing/paquete, no a cada diseno. `lib/utils/generateListingId.ts` conserva `LBCreaStudio-[A-Z0-9]{6}`. El flujo manual lo crea antes de subir archivos; Automation sigue generandolo para trabajos manuales. Company ya lo reserva al crear un listing y Automation puede aceptar ese valor con una clave de idempotencia. Los prefijos R2 existentes usan el codigo del paquete. La unicidad esta protegida dentro de cada base SQLite; no hay todavia un registro global que cubra simultaneamente codigos historicos generados por el navegador y las dos bases. No se migraron ni cambiaron codigos existentes.

## Pruebas realizadas

- 58 tests pasan, 2 pruebas live se omiten por no activar llamadas externas.
- TypeScript y ESLint de los modulos modificados pasan.
- La pagina `/company/operations` respondio HTTP 200 en el servidor local; se inspecciono visualmente despues de reiniciar el proceso para aplicar las migraciones SQLite. La lista de Company muestra cero listings reales, no datos simulados.
- Los tests Alura usan un `fetch` simulado: prueban URL, clave solo backend, metadatos de creditos y rechazo de respuestas sin medicion. No prueban el servicio real.
- No se hizo prueba integral con Kittl, Automaty, R2, Etsy o Pinterest. Tampoco se hizo deploy ni commit.

## Bloqueos para operar

1. Conectar una sesion Kittl MCP/OAuth utilizable por el backend y probar generacion, exportacion y coste sin asumir endpoints privados.
2. Configurar Alura y autorizar un cupo de creditos para una consulta real; la investigacion web existente sigue como proveedor alternativo.
3. Tener acceso al PC Automaty para validar rutas de Autobuildy, Photoshop, productos y reanudacion tras fallos.
4. Construir los contratos de handoff Company -> produccion -> calidad -> SEO -> draft, con permisos persistentes y tests de integracion. No activar publicacion definitiva sin autorizacion explicita.
5. Verificar en un entorno de ensayo las credenciales Etsy/Pinterest/R2 y la facturacion real frente a las estimaciones.
6. Centralizar o reconciliar codigos historicos del flujo manual antes de prometer unicidad global entre sus tres emisores.

El servidor local de desarrollo se dejo disponible en `http://127.0.0.1:3001/company/operations`; la disponibilidad depende de que permanezca abierta esta sesion. `allowedDevOrigins` autoriza 127.0.0.1 solo para recursos de desarrollo; el bypass de autenticacion local tambien exige `NODE_ENV=development` y `COMPANY_LOCAL_DEV_ACCESS=1`.
