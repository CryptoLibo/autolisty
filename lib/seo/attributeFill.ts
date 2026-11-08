// Mínimos de Room y Subject tras la respuesta de la IA (sin dependencias: testeable).

type Option = { name: string }

export const ROOM_MINIMUM = 4
const NURSERY_ROOMS = ["Nursery", "Kids", "Bedroom", "Game room"]
const GENERAL_ROOMS = ["Living room", "Bedroom", "Office", "Entryway", "Kitchen & dining"]
// Salas que no tienen sentido para arte infantil.
const NOT_FOR_NURSERY = new Set(["dorm", "office", "laundry", "kitchen & dining"])

const norm = (value: string) => value.trim().toLowerCase()

/** Room: al menos 4 salas (o el máximo que permita Etsy), completando con las más coherentes del producto. */
export function fillRoomOptions<T extends Option>(selected: T[], options: T[], maxValues: number, productType: string): T[] {
  const nursery = productType === "nursery_wall_art"
  const kept = nursery ? selected.filter((option) => !NOT_FOR_NURSERY.has(norm(option.name))) : [...selected]
  const target = Math.min(ROOM_MINIMUM, maxValues, options.length)
  const priority = nursery ? NURSERY_ROOMS : GENERAL_ROOMS
  const result = kept.slice(0, maxValues)
  for (const name of priority) {
    if (result.length >= target) break
    const option = options.find((candidate) => norm(candidate.name) === norm(name))
    if (option && !result.some((item) => norm(item.name) === norm(name))) result.push(option)
  }
  return result
}

/**
 * Subject: mínimo 2. La IA decide si hay un 3º coherente; aquí solo se completa
 * hasta 2 si devolvió menos (con las opciones mejor puntuadas), nunca se rellena el 3º.
 */
export function subjectTargetCount(selectedCount: number, maxValues: number, optionCount: number) {
  const maximum = Math.min(3, maxValues, optionCount)
  return Math.min(maximum, Math.max(2, selectedCount))
}
