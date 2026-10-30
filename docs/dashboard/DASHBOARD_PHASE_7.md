# Dashboard Fase 7: Resumen de inteligencia comercial

## Funcionamiento

`GET /api/dashboard/intelligence?period=7d|30d|90d` exige la sesion del propietario. `lib/dashboard/intelligence.ts` calcula el Resumen exclusivamente sobre la SQLite de Automation y los caches de Etsy/Pinterest. Abrir Resumen no llama a proveedores, no publica ni modifica datos. La interfaz consulta el endpoint agregado al abrir Resumen; las otras pestanas consultan sus propios endpoints solo al abrirse.

El Resumen contiene una lectura ejecutiva, comparacion de pedidos pagados e importes cuando ambos periodos son completos y de la misma moneda, prioridades, productos con ventas verificadas, activos sin ventas solo con cobertura completa, oportunidades y cobertura de fuentes. Cada recomendacion muestra fuente, periodo, limite y accion de navegacion. No ejecuta acciones comerciales. El detalle permanece en las pestanas especializadas.

## Reglas verificables

Los umbrales ajustables estan en `INTELLIGENCE_RULES`:

- Una fuente Etsy/Pinterest con mas de 36 horas desde la ultima sincronizacion se considera desactualizada. Un fallo de sincronizacion se muestra como error y no fundamenta una nueva conclusion comercial.
- Caida de pedidos: periodo anterior con al menos 3 pedidos pagados, reduccion absoluta de 2 o mas y relativa de al menos 40 %. Si el anterior es cero, no se calcula porcentaje.
- Listing vencido: alerta operativa, con historial de unidades vendidas solo si pedidos y catalogo tienen cobertura completa. No se duplica como oportunidad.
- Producto con actividad destacada: al menos 2 unidades en el periodo actual y mas que en el anterior. No se predicen ventas futuras.
- Pinterest: al menos 5 clics salientes en pines vinculados por ID de listing, exclusivamente dentro del top disponible. No son visitas Etsy ni ventas atribuidas.
- Caida de impresiones Pinterest: solo en 7 o 30 dias, con todos los dias disponibles para ambos intervalos, al menos 20 impresiones previas y reduccion del 40 % o mas. No se compara 90 dias porque la API no garantiza 180 dias historicos.
- Deducciones financieras importadas: si hay una importacion activa, una sola moneda y al menos 10 unidades monetarias previas, se destaca un aumento de al menos 10 y 50 %. Son movimientos registrados, no gasto total ni beneficio neto.
- Gastos activos sin conciliacion e importaciones con filas rechazadas generan alertas de revision, no resultados financieros concluyentes.

La cobertura de Etsy pedidos requiere autorizacion, historial suficiente para ambos intervalos, detalle completo y sincronizacion reciente. Los importes se comparan solo con importes completos de una misma moneda. Finanzas y Shop Stats permanecen parciales aunque tengan registros: pueden faltar movimientos o fuentes. Automation utiliza el estado local de trabajos creados en el periodo seleccionado. Un fallo de una fuente no bloquea las demas secciones.

## Limites

No se calcula beneficio neto, rentabilidad por listing, conversion por fuente ni ventas atribuidas a Pinterest. Los listings activos sin ventas no son clasificados como malos productos. La ausencia de datos no es una alerta de bajo rendimiento. El ranking de productos se limita a los registros mas relevantes devueltos por la consulta agregada; el catalogo y Ventas contienen el detalle.

## Despliegue y reversión

No hay migraciones ni nuevas variables. Publicar el commit en GitHub, respaldar `AUTOMATION_DB_PATH` segun el procedimiento habitual y ejecutar `./deploy.sh` en Hetzner. Verificar login del propietario, Resumen en 7/30/90 dias, navegacion hacia cada pestana y ausencia de consultas externas al abrirlo. Para revertir, desplegar el commit anterior; los datos persistidos no cambian por esta fase.
