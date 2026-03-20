import { describe, expect, it, afterEach } from "bun:test"
import { tmpdir } from "os"
import { join } from "path"
import { detectInstallMethod, isNewerVersion, takePendingUpdateNotification } from "../src/updater"
import type { AppState } from "../src/types"

// ─── detectInstallMethod ───────────────────────────────────────────────────────

describe("detectInstallMethod", () => {
  it("returns 'brew' for an Apple Silicon Homebrew path", () => {
    expect(detectInstallMethod("/opt/homebrew/Cellar/ntfy-mac/1.0.0/bin/ntfy-mac")).toBe("brew")
  })

  it("returns 'brew' for an Intel Homebrew path", () => {
    expect(detectInstallMethod("/usr/local/Cellar/ntfy-mac/1.0.0/bin/ntfy-mac")).toBe("brew")
  })

  it("returns 'curl' for ~/.local/bin install", () => {
    expect(detectInstallMethod("/home/user/.local/bin/ntfy-mac")).toBe("curl")
  })

  it("returns 'curl' for /usr/local/bin install", () => {
    expect(detectInstallMethod("/usr/local/bin/ntfy-mac")).toBe("curl")
  })

  it("returns 'dev' for bun runtime path", () => {
    expect(detectInstallMethod("/opt/homebrew/Cellar/bun/1.2.0/bin/bun")).toBe("dev")
  })

  it("returns 'dev' when Cellar appears in path but not for ntfy-mac", () => {
    expect(detectInstallMethod("/opt/homebrew/Cellar/node/20.0.0/bin/node")).toBe("dev")
  })

  it("returns 'dev' for bare bun path", () => {
    expect(detectInstallMethod("/Users/user/.bun/bin/bun")).toBe("dev")
  })
})

// ─── isNewerVersion ────────────────────────────────────────────────────────────

describe("isNewerVersion", () => {
  it("detects newer major", () => expect(isNewerVersion("2.0.0", "1.0.0")).toBe(true))
  it("detects same major, newer minor", () => expect(isNewerVersion("1.1.0", "1.0.0")).toBe(true))
  it("detects same major+minor, newer patch", () =>
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true))

  it("returns false when equal", () => expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false))
  it("returns false when latest < current (major)", () =>
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(false))
  it("returns false when latest < current (minor)", () =>
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(false))
  it("returns false when latest < current (patch)", () =>
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(false))

  it("strips leading v prefix from latest", () =>
    expect(isNewerVersion("v1.1.0", "1.0.0")).toBe(true))
  it("strips leading v prefix from current", () =>
    expect(isNewerVersion("1.1.0", "v1.0.0")).toBe(true))
  it("strips v from both", () => expect(isNewerVersion("v2.0.0", "v1.9.9")).toBe(true))

  it("handles multi-digit version segments", () =>
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(true))
  it("does not do lexicographic comparison (9 < 10)", () =>
    expect(isNewerVersion("1.9.0", "1.10.0")).toBe(false))
})

// ─── takePendingUpdateNotification ────────────────────────────────────────────
//
// Uses temp-file-backed load/save injections so the real
// ~/.local/share/ntfy-mac/state.json is never read or written.

const TEST_STATE_FILE = join(tmpdir(), `ntfy-mac-test-${process.pid}.json`)
const DEFAULT_STATE: AppState = { seen: {}, lastMessageId: null, lastUpdateCheck: null }

async function tmpLoad(): Promise<AppState> {
  try {
    return JSON.parse(await Bun.file(TEST_STATE_FILE).text()) as AppState
  } catch {
    return { ...DEFAULT_STATE }
  }
}

async function tmpSave(state: AppState): Promise<void> {
  await Bun.write(TEST_STATE_FILE, JSON.stringify(state))
}

describe("takePendingUpdateNotification", () => {
  afterEach(async () => {
    await Bun.$`rm -f ${TEST_STATE_FILE}`.quiet()
  })

  it("returns null when no pending notification", async () => {
    await tmpSave({ ...DEFAULT_STATE, pendingUpdateNotification: null })
    const result = await takePendingUpdateNotification(tmpLoad, tmpSave)
    expect(result).toBeNull()
  })

  it("returns the version when a pending notification is set", async () => {
    await tmpSave({ ...DEFAULT_STATE, pendingUpdateNotification: "v1.2.3" })
    const result = await takePendingUpdateNotification(tmpLoad, tmpSave)
    expect(result).toBe("v1.2.3")
  })

  it("clears the pending notification after returning it", async () => {
    await tmpSave({ ...DEFAULT_STATE, pendingUpdateNotification: "v1.2.3" })
    await takePendingUpdateNotification(tmpLoad, tmpSave)
    const second = await takePendingUpdateNotification(tmpLoad, tmpSave)
    expect(second).toBeNull()
  })

  it("does not disturb other state fields", async () => {
    await tmpSave({
      ...DEFAULT_STATE,
      lastMessageId: "msg-sentinel",
      pendingUpdateNotification: "v9.9.9",
    })
    await takePendingUpdateNotification(tmpLoad, tmpSave)
    const after = await tmpLoad()
    expect(after.lastMessageId).toBe("msg-sentinel")
    expect(after.pendingUpdateNotification).toBeNull()
  })

  it("returns null and writes nothing when state file is absent", async () => {
    // No tmpSave call — file doesn't exist
    const result = await takePendingUpdateNotification(tmpLoad, tmpSave)
    expect(result).toBeNull()
  })
})
