# Dashboard Fase 5: Pinterest Analytics

## Alcance implementado

- La pestaña Pinterest consulta exclusivamente el cache SQLite mediante `GET /api/dashboard/pinterest`. El propietario inicia la actualizacion manual con `POST /api/dashboard/pinterest/sync`.
- El servicio `lib/dashboard/pinterest-analytics.ts` consulta `GET /user_account`, `GET /user_account/analytics` para 7, 30 y 90 dias, `GET /user_account/analytics/top_pins` para el periodo seleccionado y `GET /pins` para metadatos de pines propios. No publica ni modifica pines.
- Las cifras de cuenta son organicas: impresiones, guardados, clics en pin, clics salientes e interacciones. La tasa mostrada es interacciones divididas por impresiones cuando ambos valores existen y las impresiones son positivas. Los valores ausentes no se sustituyen por cero.
- La serie diaria conserva las fechas y estados devueltos por Pinterest; el grafico no inventa dias faltantes. Los totales se muestran solo si corresponden exactamente a la ventana UTC solicitada.
- El ranking contiene como maximo 50 pines recientes devueltos por Pinterest. No equivale a todos los pines ni permite estadisticas completas por tablero. La lista de pines propios puede quedar parcial si supera cuatro paginas de 250 elementos; el estado lo indica.
- Los vinculos Etsy se derivan solo de URLs HTTPS de `etsy.com/listing/<id>` verificadas o de pines publicados por Autolisty con ese destino. No se infieren por titulo. Las sumas por listing usan exclusivamente pines del top disponible y no atribuyen ventas.
- Al publicar, el ID de pin y sus metadatos se guardan en SQLite. Una falla de registro posterior a una publicacion exitosa se comunica como advertencia, sin inducir un segundo envio.

## Permisos y limites

- La conexion OAuth existente ya solicita `user_accounts:read` y `pins:read`, ademas de los permisos de publicacion previos. No se agrega un segundo OAuth. Si la concesion actual no incluye esos scopes, el propietario debe usar **Reautorizar** en Pinterest. El callback no reemplaza una conexion con una concesion de menor alcance.
- Las rutas exigen la sesion del propietario. Los tokens permanecen en cookie HTTP-only del servidor; no se devuelven en las respuestas ni en los errores de sincronizacion.
- Una sincronizacion por cuenta a la vez y un intervalo minimo de diez minutos reducen duplicados. Los errores y limites de Pinterest conservan el ultimo cache valido. No hay llamadas de analitica al abrir el Dashboard.
- Pinterest limita la ventana consultable de analitica organica a 90 dias y el endpoint de top a 50 pines. Los snapshots de Autolisty se conservan desde la primera sincronizacion, pero no crean retrospectivamente datos anteriores a lo que Pinterest permita consultar. Las metricas de anuncios y audiencia no se muestran porque este flujo no las verifica. Tampoco se presenta analitica por tablero sin cobertura completa.
- Las respuestas reales pueden variar segun tipo de cuenta, aprobacion de la aplicacion y permisos concedidos. Las pruebas usan respuestas simuladas; la primera sincronizacion del propietario en produccion sera la validacion de la cuenta real.

## Migracion y despliegue

1. Antes de `./deploy.sh`, respaldar la base SQLite definida por `AUTOMATION_DB_PATH` en el VPS, incluyendo cualquier archivo WAL/SHM mediante el procedimiento de respaldo SQLite vigente, y verificar la copia. No usar `company.sqlite` como sustituto.
2. Desplegar el commit publicado con el procedimiento habitual. La migracion de Automation de v13 a v14 crea tablas independientes de cache y registros de pines. Se ejecuta al abrir la base, sin tocar las tablas financieras, Etsy, Scale o trabajos.
3. Verificar que el proceso principal arranca y que Listing, Scale y Automation siguen accesibles. Entrar como propietario en Dashboard > Pinterest; revisar estado de conexion y usar **Sincronizar** una sola vez. Si faltan scopes, usar **Reautorizar** y volver a sincronizar.
4. Comprobar que aparecen fecha de sincronizacion y datos reales o un error explicito. Un resultado vacio puede ser legitimo para cuentas sin actividad o cuentas sin acceso a analitica; no repetir hasta aclarar el motivo.

No se requieren variables de entorno nuevas. Para revertir el codigo, volver al commit anterior con el procedimiento habitual y conservar la base v14: las tablas nuevas son aditivas y no requieren borrado. Si fuese necesario restaurar datos, usar el respaldo verificado anterior al despliegue con Autolisty detenido; no sobrescribir la base activa mientras haya conexiones abiertas.

## Fuentes oficiales

- [Organic reporting](https://developers.pinterest.com/docs/analytics-and-reports/organic-reporting/)
- [User Account API](https://github.com/pinterest/pinterest-python-generated-api-client/blob/main/docs/UserAccountApi.md)
- [List Pins](https://developers.pinterest.com/docs/api/v5/pins-list/)
- [OAuth scopes](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/)
- [Rate limits](https://developers.pinterest.com/docs/reference/rate-limits/)
