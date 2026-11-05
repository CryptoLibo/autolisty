# Acceso con passkey

Autolisty se abre solo con los passkeys del propietario: Face ID en el iPhone, huella o PIN (Windows Hello) en el PC. No hay contraseñas ni login de GitHub. La sesión dura 30 días por dispositivo.

## Variables del servidor (`.env.local`)

- `AUTH_SECRET`: firma de la sesión (ya existe; mínimo 32 caracteres).
- `AUTOLISTY_SETUP_CODE_SHA256`: huella del **código de configuración**, que permite registrar un dispositivo sin sesión (el primero, o recuperar el acceso si los pierdes todos).
- `AUTOLISTY_PUBLIC_URL` (opcional): `https://autolisty.com` por defecto. Debe coincidir con la dirección con la que abres la app.

## Crear el código de configuración

En el servidor:

```bash
cd ~/autolisty
CODE=$(openssl rand -hex 16)
sed -i '/^AUTOLISTY_SETUP_CODE_SHA256=/d' .env.local
echo "AUTOLISTY_SETUP_CODE_SHA256=$(printf %s "$CODE" | sha256sum | cut -d' ' -f1)" >> .env.local
echo "CÓDIGO DE CONFIGURACIÓN: $CODE"
```

Guarda el código en un lugar seguro (gestor de contraseñas). Quien lo tenga puede registrar un dispositivo nuevo; si sospechas que se filtró, repite el comando para cambiarlo.

## Registrar dispositivos

1. **Primer dispositivo:** abre autolisty.com → *Set up this device with a setup code* → pega el código → *Create passkey on this device* → confirma con Face ID / huella / PIN. Quedas dentro.
2. **Otros dispositivos:** con la sesión iniciada en ellos (o con el código), menú lateral → *Add passkey on this device*.
3. En iPhone, los passkeys se sincronizan por iCloud con tus otros dispositivos Apple.

Gestión: `GET /api/auth/passkey` lista los dispositivos; `DELETE /api/auth/passkey` con `{ "id": ... }` elimina uno (nunca el último).
