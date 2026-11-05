import crypto from "node:crypto"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"

const PRODUCT_OUTPUTS = {
  vertical_wall_art: {
    finalFiles: ["2x3.jpg", "3x4.jpg", "4x5.jpg", "11x14.jpg", "5x7ISO.jpg"],
  },
  horizontal_wall_art: {
    finalFiles: ["3x2.jpg", "4x3.jpg", "5x4.jpg", "14x11.jpg", "7x5ISO.jpg"],
  },
  nursery_wall_art: {
    finalFiles: ["2x3.jpg", "3x4.jpg", "4x5.jpg", "11x14.jpg", "5x7ISO.jpg"],
  },
  frame_tv_art: {
    finalFiles: ["FrameTVArt.jpg", "Quick Setup Guide.pdf"],
  },
  png_designs: {
    finalFiles: ["Design.png"],
  },
}

const REQUIRED_LISTING_SLOTS = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"])
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"])
const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".pdf": "application/pdf",
}

function parseArguments() {
  const index = process.argv.indexOf("--config")
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error("Usage: node agent.mjs --config C:\\AutolistyAgent\\config.json")
  }
  return path.resolve(process.argv[index + 1])
}

async function readConfiguration(configPath) {
  const config = JSON.parse(await fsp.readFile(configPath, "utf8"))
  const required = ["serverUrl", "agentId", "agentName", "tokenFile", "autobuildyExecutable", "spoolRoot"]
  for (const key of required) {
    if (!String(config[key] || "").trim()) throw new Error(`Missing agent configuration: ${key}`)
  }
  config.serverUrl = String(config.serverUrl).replace(/\/+$/, "")
  config.pollIntervalSeconds = Math.max(10, Number(config.pollIntervalSeconds) || 30)
  config.heartbeatIntervalSeconds = Math.max(30, Number(config.heartbeatIntervalSeconds) || 60)
  // 0 = no apagar nunca. N = apagar Windows tras N minutos sin trabajo (cola vacía).
  config.shutdownWhenIdleMinutes = Math.max(0, Number(config.shutdownWhenIdleMinutes) || 0)
  config.token = (await fsp.readFile(path.resolve(config.tokenFile), "utf8")).trim()
  if (config.token.length < 32) throw new Error("The machine token is missing or invalid.")
  return config
}

function createLogger(logPath) {
  return async (message, metadata = null) => {
    const suffix = metadata ? ` ${JSON.stringify(metadata)}` : ""
    const line = `${new Date().toISOString()} ${message}${suffix}`
    process.stdout.write(`${line}\n`)
    await fsp.appendFile(logPath, `${line}\r\n`, "utf8").catch(() => {})
  }
}

async function writeJsonAtomic(targetPath, value) {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.${process.pid}.tmp`
  await fsp.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  await fsp.rename(temporaryPath, targetPath)
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath)
    return true
  } catch {
    return false
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256")
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("error", reject)
    stream.on("end", resolve)
  })
  return hash.digest("hex")
}

// Errores de red o del servidor (5xx): se reintenta en el siguiente ciclo sin
// marcar el listing como fallido. El resto son fallos reales de producción.
class TransientApiError extends Error {}

function createApi(config) {
  async function request(endpoint, options = {}) {
    let response
    try {
      response = await fetch(`${config.serverUrl}${endpoint}`, {
      ...options,
      headers: {
        authorization: `Bearer ${config.token}`,
        "x-autolisty-agent-id": config.agentId,
        ...(options.body && typeof options.body === "string" ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(120_000),
    })
    } catch (error) {
      throw new TransientApiError(`Autolisty unreachable: ${error instanceof Error ? error.message : String(error)}`)
    }
    const contentType = response.headers.get("content-type") || ""
    const body = contentType.includes("application/json") ? await response.json() : await response.arrayBuffer()
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body
        ? String(body.error)
        : `Autolisty request failed with HTTP ${response.status}.`
      throw response.status >= 500 ? new TransientApiError(message) : new Error(message)
    }
    return { body, headers: response.headers }
  }

  return {
    heartbeat: () => request("/api/automation/agent/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        name: config.agentName,
        capabilities: { autobuildy: true, photoshop: "2026", upscayl: true },
      }),
    }).then((result) => result.body),
    sync: (cleanedJobIds) => request("/api/automation/agent/sync", {
      method: "POST",
      body: JSON.stringify({
        name: config.agentName,
        capabilities: { autobuildy: true, photoshop: "2026", upscayl: true, localQueue: true },
        cleanedJobIds,
      }),
    }).then((result) => result.body),
    claim: () => request("/api/automation/agent/claim", {
      method: "POST",
      body: JSON.stringify({
        name: config.agentName,
        capabilities: { autobuildy: true, photoshop: "2026", upscayl: true },
      }),
    }).then((result) => result.body),
    status: (jobId, status, message, error = "") => request(
      `/api/automation/agent/jobs/${encodeURIComponent(jobId)}/status`,
      { method: "PATCH", body: JSON.stringify({ status, message, error }) }
    ).then((result) => result.body),
    downloadSource: (jobId) => request(
      `/api/automation/agent/jobs/${encodeURIComponent(jobId)}/source`
    ),
    presign: (jobId, file) => request(
      `/api/automation/agent/jobs/${encodeURIComponent(jobId)}/files/presign`,
      { method: "POST", body: JSON.stringify(file) }
    ).then((result) => result.body),
    confirm: (jobId, slotKey) => request(
      `/api/automation/agent/jobs/${encodeURIComponent(jobId)}/files/confirm`,
      { method: "POST", body: JSON.stringify({ slotKey }) }
    ).then((result) => result.body),
  }
}

async function runProcess(executablePath, args, log) {
  await log("Launching Autobuildy automation mode.")
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    child.stdout.on("data", (chunk) => void log("Autobuildy", { output: String(chunk).trim().slice(0, 1000) }))
    child.stderr.on("data", (chunk) => void log("Autobuildy warning", { output: String(chunk).trim().slice(0, 1000) }))
    child.on("error", reject)
    child.on("close", (code) => code === 0
      ? resolve()
      : reject(new Error(`Autobuildy exited with code ${code}.`)))
  })
}

async function findSlotFile(listingPath, slot) {
  const entries = await fsp.readdir(listingPath, { withFileTypes: true })
  const match = entries.find((entry) => {
    if (!entry.isFile() || path.parse(entry.name).name !== String(slot)) return false
    const extension = path.extname(entry.name).toLowerCase()
    return slot === 2 ? VIDEO_EXTENSIONS.has(extension) : IMAGE_EXTENSIONS.has(extension)
  })
  return match ? match.name : null
}

async function collectAndValidateOutputs(productType, listingPath) {
  const contract = PRODUCT_OUTPUTS[productType]
  if (!contract) throw new Error(`Unsupported local product type: ${productType}`)
  const outputs = []
  const missing = []
  for (const slot of REQUIRED_LISTING_SLOTS) {
    const filename = await findSlotFile(listingPath, slot)
    if (!filename) missing.push(`listing:${slot}`)
    else outputs.push(filename)
  }
  const video = await findSlotFile(listingPath, 2)
  if (video) outputs.push(video)
  for (let index = 1; index <= 3; index += 1) {
    const relativePath = `Pines/pin-${index}.jpg`
    if (!(await pathExists(path.join(listingPath, ...relativePath.split("/"))))) missing.push(`pinterest:${index}`)
    else outputs.push(relativePath)
  }
  for (const filename of contract.finalFiles) {
    const relativePath = `Diseños Finales/${filename}`
    if (!(await pathExists(path.join(listingPath, ...relativePath.split("/"))))) missing.push(`deliverable:${filename}`)
    else outputs.push(relativePath)
  }
  if (missing.length > 0) throw new Error(`Autobuildy output is incomplete. Missing: ${missing.join(", ")}.`)

  const files = []
  for (const relativePath of outputs) {
    const filePath = path.join(listingPath, ...relativePath.split("/"))
    const stat = await fsp.stat(filePath)
    files.push({
      relativePath,
      filePath,
      byteSize: stat.size,
      sha256: await sha256File(filePath),
      contentType: MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    })
  }
  return files
}

async function uploadFile(api, jobId, file, log) {
  const authorization = await api.presign(jobId, {
    relativePath: file.relativePath,
    byteSize: file.byteSize,
    sha256: file.sha256,
    contentType: file.contentType,
  })
  const stream = fs.createReadStream(file.filePath)
  const response = await fetch(authorization.uploadUrl, {
    method: "PUT",
    headers: authorization.headers,
    body: stream,
    duplex: "half",
  })
  if (!response.ok) throw new Error(`R2 upload failed for ${file.relativePath}: HTTP ${response.status}.`)
  await api.confirm(jobId, authorization.slotKey)
  await log("Verified output in R2.", { relativePath: file.relativePath })
}

function assertListingPath(listingPath, productCode) {
  const resolved = path.resolve(listingPath)
  if (!/^LBCreaStudio-[A-Z0-9]{6}$/.test(productCode) || path.basename(resolved) !== productCode) {
    throw new Error(`Autobuildy returned a listing folder that does not match ${productCode}.`)
  }
  return resolved
}

async function processJob(config, api, claimedJob, statePath, log) {
  const job = claimedJob
  const jobRoot = path.join(config.spoolRoot, "jobs", job.productCode)
  const sourceFile = job.files.find((file) => file.slotKey === "source:primary")
  if (!sourceFile?.sha256 || !sourceFile.relativePath) throw new Error("The assigned source metadata is incomplete.")
  const extension = path.extname(sourceFile.relativePath) || ".bin"
  const localSourcePath = path.join(jobRoot, `Source${extension.toLowerCase()}`)
  const requestPath = path.join(jobRoot, "autobuildy-request.json")
  const resultPath = path.join(jobRoot, "autobuildy-result.json")
  await fsp.mkdir(jobRoot, { recursive: true })
  const buildRequired = job.status === "LOCAL_CLAIMED" || job.status === "LOCAL_BUILDING"
  if (buildRequired) {
    await writeJsonAtomic(statePath, { jobId: job.id, productCode: job.productCode, phase: "DOWNLOADING" })
    await ensureSourceDownloaded(config, api, job)

    await api.status(job.id, "LOCAL_BUILDING", "Source verified. Autobuildy production started.")
    await writeJsonAtomic(requestPath, {
      version: 1,
      jobId: job.id,
      productCode: job.productCode,
      productType: job.productType,
      sourcePath: localSourcePath,
      listingNumber: 1,
      resultPath,
    })
    await writeJsonAtomic(statePath, { jobId: job.id, productCode: job.productCode, phase: "BUILDING", requestPath, resultPath })
    await runProcess(config.autobuildyExecutable, ["--automation-request", requestPath], log)
  } else if (!(await pathExists(resultPath))) {
    throw new Error(`Cannot resume ${job.status}: the Autobuildy checkpoint is missing.`)
  }

  const result = JSON.parse(await fsp.readFile(resultPath, "utf8"))
  if (!result.ok || !result.listingPath) throw new Error(result.error || "Autobuildy did not return a completed listing.")
  if (result.jobId !== job.id || result.productCode !== job.productCode || result.productType !== job.productType) {
    throw new Error("Autobuildy checkpoint does not belong to the claimed listing.")
  }
  const listingPath = assertListingPath(result.listingPath, job.productCode)
  await rememberListingFolder(config, job, listingPath)
  if (job.status !== "LOCAL_UPLOADING") {
    await api.status(job.id, "LOCAL_VALIDATING", "Autobuildy finished. Validating listing contract.")
  }
  const files = await collectAndValidateOutputs(job.productType, listingPath)
  await writeJsonAtomic(statePath, { jobId: job.id, productCode: job.productCode, phase: "UPLOADING", listingPath })
  if (job.status !== "LOCAL_UPLOADING") {
    await api.status(job.id, "LOCAL_UPLOADING", `${files.length} validated files are ready for R2.`)
  }
  for (const file of files) await uploadFile(api, job.id, file, log)
  await api.status(job.id, "LOCAL_COMPLETE", "All local outputs were verified in R2.")

  await fsp.rm(jobRoot, { recursive: true, force: true })
  await fsp.rm(statePath, { force: true })
  await log("Local production completed and temporary workspace released.", { productCode: job.productCode })
}

function localSourcePathFor(config, job) {
  const sourceFile = job.files.find((file) => file.slotKey === "source:primary")
  if (!sourceFile?.sha256 || !sourceFile.relativePath) throw new Error("The assigned source metadata is incomplete.")
  const extension = path.extname(sourceFile.relativePath) || ".bin"
  return {
    sourceFile,
    localSourcePath: path.join(config.spoolRoot, "jobs", job.productCode, `Source${extension.toLowerCase()}`),
  }
}

// Descarga (una vez) la fuente de un diseño de la cola local y verifica su SHA-256.
async function ensureSourceDownloaded(config, api, job) {
  const { sourceFile, localSourcePath } = localSourcePathFor(config, job)
  if (await pathExists(localSourcePath) && await sha256File(localSourcePath) === sourceFile.sha256) return localSourcePath
  await fsp.mkdir(path.dirname(localSourcePath), { recursive: true })
  const download = await api.downloadSource(job.id)
  const temporaryPath = `${localSourcePath}.download`
  await fsp.writeFile(temporaryPath, Buffer.from(download.body))
  if (await sha256File(temporaryPath) !== sourceFile.sha256) {
    await fsp.rm(temporaryPath, { force: true })
    throw new Error("Downloaded source checksum does not match Autolisty.")
  }
  await fsp.rename(temporaryPath, localSourcePath)
  return localSourcePath
}

// Carpetas finales de listings ya entregados: se conservan hasta que Autolisty
// confirme que el listing terminó todo el flujo (publicado y pines), y entonces se borran.
function listingsIndexPath(config) {
  return path.join(config.spoolRoot, "state", "listings.json")
}

async function readListingsIndex(config) {
  try {
    return JSON.parse(await fsp.readFile(listingsIndexPath(config), "utf8"))
  } catch {
    return {}
  }
}

async function rememberListingFolder(config, job, listingPath) {
  const index = await readListingsIndex(config)
  index[job.id] = { productCode: job.productCode, listingPath, recordedAt: new Date().toISOString() }
  await writeJsonAtomic(listingsIndexPath(config), index)
}

async function cleanupLocalListing(config, item, log) {
  if (!/^LBCreaStudio-[A-Z0-9]{6}$/.test(item.productCode)) throw new Error(`Invalid product code: ${item.productCode}`)
  const index = await readListingsIndex(config)
  const entry = index[item.id]
  if (entry?.listingPath) {
    const resolved = path.resolve(entry.listingPath)
    // Seguridad: solo se borra una carpeta cuyo nombre es exactamente el código del listing.
    if (path.basename(resolved) !== item.productCode || path.parse(resolved).root === resolved) {
      throw new Error(`Refusing to delete unexpected folder for ${item.productCode}: ${resolved}`)
    }
    await fsp.rm(resolved, { recursive: true, force: true })
  }
  await fsp.rm(path.join(config.spoolRoot, "jobs", item.productCode), { recursive: true, force: true })
  delete index[item.id]
  await writeJsonAtomic(listingsIndexPath(config), index)
  await log("Local listing folder removed.", { productCode: item.productCode, status: item.status })
}

function shutdownWindows(log) {
  return new Promise((resolve) => {
    void log("Queue finished and idle time reached. Shutting down Windows in 60 seconds.")
    const child = spawn("shutdown.exe", ["/s", "/t", "60", "/c", "Automaty: production finished"], { windowsHide: true })
    child.on("close", resolve)
    child.on("error", resolve)
  })
}

async function main() {
  const config = await readConfiguration(parseArguments())
  await fsp.mkdir(path.join(config.spoolRoot, "logs"), { recursive: true })
  await fsp.mkdir(path.join(config.spoolRoot, "state"), { recursive: true })
  await fsp.mkdir(path.join(config.spoolRoot, "jobs"), { recursive: true })
  const log = createLogger(path.join(config.spoolRoot, "logs", "agent.log"))
  const statePath = path.join(config.spoolRoot, "state", "current-job.json")
  const api = createApi(config)
  let pendingCleanupAcks = []
  let idleSince = Date.now()
  let workedThisSession = false

  const heartbeatTimer = setInterval(() => {
    void api.heartbeat().catch((error) => log("Heartbeat failed.", { error: error.message }))
  }, config.heartbeatIntervalSeconds * 1000)

  await log("Autolisty local agent started (local queue mode).", { agentId: config.agentId })
  try {
    while (true) {
      let processed = false
      try {
        // 1) Sincronizar: confirmar limpiezas, recibir la cola local y las limpiezas pendientes.
        const sync = await api.sync(pendingCleanupAcks)
        pendingCleanupAcks = []
        if (sync.newlySynced) await log("New approved designs synced to the local queue.", { count: sync.newlySynced })

        for (const item of sync.cleanup || []) {
          try {
            await cleanupLocalListing(config, item, log)
            pendingCleanupAcks.push(item.id)
          } catch (error) {
            await log("Local cleanup failed.", { productCode: item.productCode, error: error instanceof Error ? error.message : String(error) })
          }
        }

        // 2) Descargar por adelantado las fuentes de toda la cola.
        for (const job of sync.queue || []) {
          if (job.status !== "LOCAL_CLAIMED") continue
          try {
            await ensureSourceDownloaded(config, api, job)
          } catch (error) {
            await log("Source prefetch failed; will retry.", { productCode: job.productCode, error: error instanceof Error ? error.message : String(error) })
          }
        }

        // 3) Producir el siguiente: el que esté en curso siempre continúa; uno nuevo solo con la producción activa.
        const next = (sync.queue || []).find((job) => job.status !== "LOCAL_CLAIMED") ||
          (sync.pipelineMode === "RUNNING" ? (sync.queue || [])[0] : null)
        if (next) {
          processed = true
          workedThisSession = true
          try {
            await processJob(config, api, next, statePath, log)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (error instanceof TransientApiError) {
              await log("Connection problem; the listing will resume from its checkpoint.", { productCode: next.productCode, error: message })
              processed = false
            } else {
              await log("Local production needs attention.", { productCode: next.productCode, error: message })
              await api.status(next.id, "NEEDS_ATTENTION", "Local production stopped safely.", message).catch(() => {})
            }
          }
        }
      } catch (error) {
        await log("Queue sync failed.", { error: error instanceof Error ? error.message : String(error) })
      }

      if (processed) {
        idleSince = Date.now()
        continue
      }
      if (
        config.shutdownWhenIdleMinutes > 0 &&
        workedThisSession &&
        pendingCleanupAcks.length === 0 &&
        Date.now() - idleSince >= config.shutdownWhenIdleMinutes * 60_000
      ) {
        await shutdownWindows(log)
        return
      }
      await sleep(config.pollIntervalSeconds * 1000)
    }
  } finally {
    clearInterval(heartbeatTimer)
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exit(1)
})
