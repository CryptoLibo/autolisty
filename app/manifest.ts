import type { MetadataRoute } from "next"

// Permite instalar Autolisty en el iPhone (Safari > Compartir > Añadir a pantalla de inicio)
// y en Android/escritorio como app independiente.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Autolisty",
    short_name: "Autolisty",
    description: "LBCreaStudio production: approvals, queue and listings.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/app-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
