# Autolisty

Aplicación privada de producción de LBCreaStudio para preparar, publicar y medir listings digitales de Etsy y su contenido de Pinterest. Corre en un servidor Hetzner en `autolisty.com` y es el centro del ecosistema:

| Pieza | Repositorio | Dónde corre | Función |
|---|---|---|---|
| Autolisty | `CryptoLibo/autolisty` | Hetzner | Cola de producción, SEO, PDF de entrega, Etsy, Pinterest, dashboard |
| Agente local | `autolisty/local-agent` | Automaty (Windows) | Recoge trabajos de la cola y lanza Autobuildy |
| Autobuildy | `CryptoLibo/autobuildy` | Automaty / PC de trabajo | Upscale, mockups, archivos finales y carpeta del listing |
| Automocky | `CryptoLibo/automocky` | Photoshop en Automaty | Mockups y recortes finales a 300 DPI |

La arquitectura completa, el flujo de un diseño de principio a fin y el plan de trabajo están en [`docs/ECOSISTEMA.md`](docs/ECOSISTEMA.md). El contexto técnico de la app está en [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md).

## Desarrollo

```bash
npm ci
npm run dev     # servidor local
npm test        # pruebas (vitest)
npm run lint
npm run build
```

Las variables de entorno viven en `.env.local` (local) y en el entorno del servidor; nunca se suben a Git. Los nombres de las variables están en `PROJECT_CONTEXT.md`.

## Despliegue

1. Los cambios llegan a `main` mediante pull request.
2. En el servidor Hetzner: `./deploy.sh` (hace pull de GitHub, compila y reinicia con PM2).
3. Verificar `/api/automation/health` con la sesión del propietario.
