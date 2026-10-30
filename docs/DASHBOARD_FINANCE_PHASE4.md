# Dashboard Fase 4: control financiero

## Fuentes y alcance

- `dashboard_etsy_receipts` y `dashboard_etsy_transactions` siguen mostrando **importe de pedidos**, no cobros ni beneficio. No se suman a las cifras financieras.
- El estado mensual CSV de Etsy aporta movimientos de la cuenta de pagos. Se acepta solo el formato observado de nueve columnas: `Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net,Tax Details`. La muestra verificada fue `etsy_statement_2026_10.csv`; no se incorpora al repositorio ni se guardan `Title`/`Info`/detalles fiscales en claro. Los tipos observados son `Sale`, `Fee`, `Marketing`, `Tax`, `VAT`, `Payment`, `Deposit`. `Refund` y `Adjustment` se admiten estructuralmente, pero requieren más muestras reales antes de confiar en su cobertura.
- Los gastos externos se registran manualmente. La periodicidad es informativa; no se generan cargos recurrentes.
- `Payment` y `Deposit` quedan pendientes de clasificación, sin contarlos como venta. `Sale` se muestra como movimiento de venta en la cuenta, separado de recibos de pedidos. `Fee`, `Marketing`, `Tax` y `VAT` se muestran como deducciones. No se deduce que todas las filas de `Marketing` sean exclusivamente Etsy Ads.
- No hay integración automática de movimientos de pagos/ledger ni de analítica de Etsy Ads/Pinterest Ads en esta fase. La API de pagos requiere consulta y contraste adicional de identificadores y tipos de ledger antes de usarla para resultados; la integración no se simula.

## Cálculo y límites

Los importes se guardan en unidades menores enteras (EUR, USD y GBP, dos decimales), sin conversión ni mezcla entre monedas. Para cada moneda y período, el **resultado parcial de movimientos conocidos** es `Sale + Fee + Marketing + Tax/VAT + Refund - gastos manuales no conciliados`. Las deducciones del CSV tienen signo negativo. Ni depósitos ni pagos sin clasificar entran en la fórmula. El resultado no es beneficio neto, saldo bancario ni resultado operativo completo; la cobertura de ingresos, reembolsos, gastos de producción y período importado no está certificada. Los filtros de categoría/proveedor limitan el listado, no la cifra global.

Una conciliación manual explícita vincula un gasto con un movimiento CSV negativo del mismo día, moneda e importe exacto. El gasto manual vinculado deja de descontarse, pero el movimiento CSV se conserva. No se hace matching automático por importe similar. La reversión de una importación con conciliaciones se bloquea; una fila compartida con otra importación activa permanece. La identidad de cada fila se calcula con SHA-256 de sus campos canónicos y número de ocurrencia dentro del archivo; el hash del archivo evita reimportar la misma exportación.

La vista previa no escribe en SQLite. La confirmación rechaza **todo** el archivo si alguna fila es inválida; muestra números de línea y motivos. Límite: 2 MB y 5000 movimientos. La lista de pantalla está limitada a 500 filas, pero los totales y gráficos se agregan desde todas las filas del período. No se permiten fórmulas ejecutables: los campos textuales del CSV no se interpretan ni se exponen en la UI.

## Datos, migración y despliegue

La migración automática v13 añade `finance_expenses`, `finance_expense_events`, `finance_csv_imports`, `finance_csv_rows`, `finance_csv_import_rows` y `finance_reconciliations`, además de tablas reservadas para una futura lectura verificada del ledger de Etsy. No cambia ni elimina tablas existentes. Antes de desplegar, respaldar y verificar `/var/lib/autolisty/automation.sqlite` con el procedimiento habitual; no restaurar una base local sobre producción. `AUTOMATION_DB_PATH` debe seguir apuntando a la misma base persistente en PM2. No se requieren nuevas variables de entorno ni permisos OAuth para el CSV y los gastos. El deploy usual ejecuta la migración al abrir la base con la nueva versión. Reversión del código: volver al commit anterior **con la base v13 conservada**; para revertir la base se requiere restaurar el respaldo anterior al despliegue y se perderían los registros financieros nuevos.

Las rutas `/api/dashboard/finance` y subordinadas usan la autenticación del propietario. No realizan mutaciones en Etsy ni llamadas facturables. CSV y gastos no se sincronizan automáticamente. Un CSV oficial distinto debe validarse con una muestra antes de habilitarlo.

## Fuentes oficiales consultadas

- Etsy Open API, [Payments tutorial](https://developers.etsy.com/documentation/tutorials/payments/): pagos, ledger, recibos y alcance `transactions_r`.
- Etsy Help, [Monthly statement y depósitos](https://help.etsy.com/hc/en-gb/articles/360016389113-How-to-Calculate-Your-Etsy-Payments-Deposit-Amount): exportación CSV y diferencia entre depósito y movimientos.
- Etsy Help, [Payment account](https://help.etsy.com/hc/en-us/articles/115015747228-How-to-Manage-Your-Payment-Account): ventas, tarifas, impuestos, publicidad y ajustes en la cuenta.
