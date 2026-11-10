import { describe, expect, it } from "vitest"
import { assertPngDesignReady, readPngInfo } from "./designIntake"

function pngHeader(width: number, height: number, colorType: number, extraChunk?: string) {
  const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
  const chunk = (type: string, data: number[]) => [...u32(data.length), ...type.split("").map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0]
  bytes.push(...chunk("IHDR", [...u32(width), ...u32(height), 8, colorType, 0, 0, 0]))
  if (extraChunk) bytes.push(...chunk(extraChunk, [0]))
  bytes.push(...chunk("IDAT", [0]))
  return new Uint8Array(bytes)
}

describe("PNG design intake", () => {
  it("lee tamaño y transparencia de la cabecera", () => {
    expect(readPngInfo(pngHeader(2048, 2048, 6))).toEqual({ width: 2048, height: 2048, hasAlpha: true })
    expect(readPngInfo(pngHeader(4096, 4096, 2))?.hasAlpha).toBe(false)
    expect(readPngInfo(pngHeader(4096, 4096, 3, "tRNS"))?.hasAlpha).toBe(true)
  })

  it("rechaza al enviar un PNG de 2048 px (el fallo de C7JGPU)", () => {
    expect(() => assertPngDesignReady("png_designs", pngHeader(2048, 2048, 6))).toThrow(/2048 x 2048 px.*kittl-upscale-image/)
  })

  it("rechaza sin transparencia y acepta 4096 RGBA", () => {
    expect(() => assertPngDesignReady("png_designs", pngHeader(4096, 4096, 2))).toThrow(/no transparency/)
    expect(() => assertPngDesignReady("png_designs", pngHeader(4096, 4096, 6))).not.toThrow()
  })

  it("no afecta a otros productos", () => {
    expect(() => assertPngDesignReady("frame_tv_art", pngHeader(2048, 1152, 2))).not.toThrow()
  })
})
