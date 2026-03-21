import { describe, expect, it } from "bun:test"
import { formatBytes } from "../src/doctor"

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(500)).toBe("500 B")
    expect(formatBytes(1023)).toBe("1023 B")
  })

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB")
    expect(formatBytes(1536)).toBe("1.5 KB")
    expect(formatBytes(10240)).toBe("10.0 KB")
  })

  it("formats megabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB")
    expect(formatBytes(5.5 * 1024 * 1024)).toBe("5.5 MB")
    expect(formatBytes(100 * 1024 * 1024)).toBe("100.0 MB")
  })
})
