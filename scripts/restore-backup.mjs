// Descifra una copia de Autolisty descargada de R2 (backups/…sqlite.gz.enc).
// Uso (en el servidor, con BACKUP_PASSPHRASE en el entorno):
//   BACKUP_PASSPHRASE='...' node scripts/restore-backup.mjs automation-2026-11-12.sqlite.gz.enc restored.sqlite
import crypto from "node:crypto"
import fs from "node:fs"
import zlib from "node:zlib"

const [input, output] = process.argv.slice(2)
const passphrase = process.env.BACKUP_PASSPHRASE || ""
if (!input || !output || !passphrase) {
  console.error("Uso: BACKUP_PASSPHRASE=... node scripts/restore-backup.mjs <archivo.enc> <salida.sqlite>")
  process.exit(1)
}
const file = fs.readFileSync(input)
if (file.subarray(0, 5).toString() !== "ALBK1") throw new Error("No es una copia de Autolisty.")
let offset = 5
const salt = file.subarray(offset, (offset += 16))
const iv = file.subarray(offset, (offset += 12))
const tag = file.subarray(offset, (offset += 16))
const decipher = crypto.createDecipheriv("aes-256-gcm", crypto.scryptSync(passphrase, salt, 32), iv)
decipher.setAuthTag(tag)
fs.writeFileSync(output, zlib.gunzipSync(Buffer.concat([decipher.update(file.subarray(offset)), decipher.final()])))
console.log(`Restaurado en ${output}`)
