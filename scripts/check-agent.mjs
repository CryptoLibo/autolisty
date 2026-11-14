// Comprobación del agente local en CI: ninguna función puede usar `config` sin recibirlo
// (así falló Automaty el 12/11: «config is not defined» en cada listing).
import fs from "node:fs"

const source = fs.readFileSync(new URL("../local-agent/agent.mjs", import.meta.url), "utf8")
const functions = [...source.matchAll(/^(?:async )?function (\w+)\(([^)]*)\)/gm)]
const problems = []
functions.forEach((match, index) => {
  const end = index + 1 < functions.length ? functions[index + 1].index : source.length
  const body = source.slice(match.index, end).replace(/"[^"\n]*"/g, '""')
  const usesConfig = /\bconfig\./.test(body)
  const hasConfig = /\bconfig\b/.test(match[2]) || /\b(?:const|let) config\b/.test(body)
  if (usesConfig && !hasConfig) problems.push(match[1])
})
if (problems.length) {
  console.error(`agent.mjs: estas funciones usan config sin recibirlo: ${problems.join(", ")}`)
  process.exit(1)
}
console.log(`agent.mjs: ${functions.length} funciones revisadas, sin config suelto.`)
