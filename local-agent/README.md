# Agente local de Automaty

Corre solo en Automaty (Windows). Se comunica con Autolisty únicamente por HTTPS saliente, con un token de máquina; nunca recibe credenciales de R2, Etsy, Pinterest ni de la base de datos.

## Qué hace

1. **Sincroniza** (`POST /api/automation/agent/sync`) al arrancar y cada `pollIntervalSeconds`: recibe todos los diseños aprobados como cola local, confirma las carpetas que ya borró y recibe las que debe borrar.
2. **Descarga por adelantado** las fuentes de la cola y verifica su SHA-256.
3. **Produce** en orden con `Autobuildy --automation-request`: el listing en curso siempre continúa; uno nuevo solo empieza con la producción activa.
4. **Valida y sube** cada archivo a R2 con URLs firmadas de 15 minutos y marca `LOCAL_COMPLETE`.
5. **Limpia** la carpeta del listing cuando Autolisty indica que terminó todo el flujo (o se canceló). Solo borra una carpeta cuyo nombre es exactamente el código `LBCreaStudio-XXXXXX`.
6. Errores de red o 5xx: reintenta en el siguiente ciclo desde el checkpoint. Fallos de producción: `NEEDS_ATTENTION`.
7. Opcional: apaga Windows tras `shutdownWhenIdleMinutes` sin trabajo.

## Archivos (bajo `spoolRoot`, por defecto `C:\Automaty\agent`)

- `config.json`: configuración (ver `config.example.json`).
- `secrets/agent-token.txt`: token de máquina.
- `jobs/<código>/`: fuente descargada, petición y resultado de Autobuildy.
- `state/current-job.json`, `state/listings.json`: checkpoint y carpetas finales pendientes de limpieza.
- `logs/agent.log`: log sin secretos.

Instalación y actualización: `docs/AUTOMATY_INSTALACION.md`.
