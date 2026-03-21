import { describe, expect, it } from "bun:test"
import { discoverSounds } from "../src/config-cli"

describe("discoverSounds", () => {
  it("finds macOS system sounds", () => {
    const sounds = discoverSounds()
    // These are always present on macOS
    expect(sounds).toContain("Basso")
    expect(sounds).toContain("Ping")
    expect(sounds).toContain("Pop")
    expect(sounds).toContain("Sosumi")
    expect(sounds).toContain("Glass")
  })

  it("returns sorted array", () => {
    const sounds = discoverSounds()
    const sorted = [...sounds].sort()
    expect(sounds).toEqual(sorted)
  })

  it("returns unique entries", () => {
    const sounds = discoverSounds()
    expect(new Set(sounds).size).toBe(sounds.length)
  })

  it("strips file extension from names", () => {
    const sounds = discoverSounds()
    for (const s of sounds) {
      expect(s).not.toContain(".")
    }
  })
})
