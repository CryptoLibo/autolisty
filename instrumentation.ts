// Se ejecuta una vez al arrancar el servidor de Next.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NODE_ENV !== "production") return
  const { startPostProductionWorker } = await import("./lib/automation/postProductionWorker")
  startPostProductionWorker()
}
