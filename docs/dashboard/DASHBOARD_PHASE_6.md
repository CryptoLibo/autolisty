# Dashboard Fase 6: Pinterest, trafico y publicidad

## Diagnostico Pinterest

La Fase 5 enviaba `created_in_last_n_days=90` a Top Pins. La coleccion oficial de Pinterest documenta `30` como valor admitido. Es una causa verificable de un posible HTTP 400; sin la respuesta historica del VPS no podemos afirmar que fuese la unica causa de `pinterest_rejected`.

La sincronizacion ahora conserva cada periodo de cuenta que responda correctamente, aunque Top Pins o List Pins fallen. El estado es parcial cuando falta alguna etapa. El diagnostico persistido incluye solo etapa, HTTP, categoria interna y codigo numerico del proveedor. Nunca guarda el cuerpo completo de error, token ni credenciales. La ruta es exclusiva del propietario. Un error en la primera consulta de cuenta se devuelve en la respuesta segura del POST.

Tras desplegar, sincronizar una vez y anotar etapa, HTTP y codigo del proveedor mostrados en Dashboard > Pinterest si falla. HTTP 401 indica reconexion; HTTP 403 puede deberse a scope, tipo de cuenta o acceso de la aplicacion a Analytics; HTTP 400 requiere revisar parametros de la etapa. Reautorizar no corrige una restriccion de la aplicacion. No compartir cookies ni tokens para diagnosticar.

## Trafico Etsy

No se ha verificado un endpoint de Etsy Open API v3 ni una exportacion CSV oficial de Shop Stats que incluya visitas, vistas y desglose de fuentes. Etsy si muestra esas cifras en Shop Manager > Stats. Por ello la pestaña Trafico permite registrar manualmente una observacion para el intervalo exacto 7, 30 o 90 dias en UTC, con procedencia `etsy_shop_stats_manual` y fecha de captura. Una observacion del dia anterior no se presenta como actual. No se copian pedidos ni clics de Pinterest en esta pestaña. No hay scraping ni conversion calculada con denominadores incompatibles.

Para registrar cifras, seleccionar en Etsy Stats el mismo intervalo y zona UTC que muestra Autolisty. Introducir visitas y, solo si Etsy las ofrece para ese intervalo, vistas y fuentes. Si Etsy no desglosa Pinterest individualmente, dejar el campo vacio. Las cifras transcritas por el propietario no son una sincronizacion automatica ni se han contrastado contra Etsy API.

## Publicidad

La pestaña Publicidad agrega los cargos `Marketing` activos de los extractos Etsy como gasto sin canal asignado y los gastos manuales `etsy_ads` / `pinterest_ads` no conciliados de Finanzas. Un gasto manual conciliado con un movimiento CSV se excluye para evitar duplicacion. No se suman monedas distintas. No hay acceso actual a metricas de campañas Etsy Ads o Pinterest Ads; no se muestran impresiones, CPC, CTR, ingresos atribuidos ni ROAS ficticios. Pinterest Ads requiere cuenta empresarial, cuenta publicitaria y permisos adicionales antes de implementar lectura de campañas.

## Despliegue

La migracion SQLite v15 agrega diagnostico a Pinterest; v16 crea observaciones de Shop Stats. Ambas son aditivas. Respaldar la base indicada por `AUTOMATION_DB_PATH` antes de ejecutar `./deploy.sh`. No se requieren variables nuevas ni se publican pines. Verificar Dashboard > Pinterest, Trafico, Publicidad y Finanzas. La primera sincronizacion real de Pinterest sigue pendiente de la cuenta de produccion. Si falla, conservar la base para el diagnostico; no restaurar una copia antigua sobre una base abierta.

## Fuentes

- [Pinterest User Account API](https://github.com/pinterest/pinterest-python-generated-api-client/blob/main/docs/UserAccountApi.md)
- [Pinterest REST API, coleccion oficial](https://www.postman.com/pinterest/pinterest-collections/documentation/egt1crl/pinterest-rest-api-latest)
- [Etsy Open API v3](https://developer.etsy.com/documentation/reference)
- [Etsy Shop Stats](https://help.etsy.com/hc/en-us/articles/115015774268-How-to-Use-Etsy-Stats-for-Your-Shop)
- [Pinterest Ads overview](https://developers.pinterest.com/docs/work-with-ads/ads-overview/)
