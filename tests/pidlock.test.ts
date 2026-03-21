import { afterEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// Test the core logic directly since the actual module uses a fixed path.
// We replicate the logic here for testability.

const TEST_DIR = join(tmpdir(), "ntfy-mac-pidlock-test")
const TEST_PID_FILE = join(TEST_DIR, "ntfy-mac.pid")

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function acquirePidLock(pidFile: string): boolean {
  if (existsSync(pidFile)) {
    try {
      const existingPid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10)
      if (!isNaN(existingPid) && isProcessRunning(existingPid)) {
        return false
      }
    } catch {
      // stale
    }
  }
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(pidFile, String(process.pid) + "\n")
  return true
}

function releasePidLock(pidFile: string): void {
  try {
    const content = readFileSync(pidFile, "utf-8").trim()
    if (parseInt(content, 10) === process.pid) {
      unlinkSync(pidFile)
    }
  } catch {
    // already gone
  }
}

afterEach(() => {
  try {
    unlinkSync(TEST_PID_FILE)
  } catch {
    // ignore
  }
})

describe("PID lock", () => {
  it("acquires lock when no PID file exists", () => {
    expect(acquirePidLock(TEST_PID_FILE)).toBe(true)
    expect(existsSync(TEST_PID_FILE)).toBe(true)
  })

  it("writes current PID to lock file", () => {
    acquirePidLock(TEST_PID_FILE)
    const content = readFileSync(TEST_PID_FILE, "utf-8").trim()
    expect(parseInt(content, 10)).toBe(process.pid)
  })

  it("refuses lock when same process already holds it", () => {
    acquirePidLock(TEST_PID_FILE)
    // Same process PID is running, so second acquire should fail
    expect(acquirePidLock(TEST_PID_FILE)).toBe(false)
  })

  it("acquires lock over stale PID file (dead process)", () => {
    mkdirSync(TEST_DIR, { recursive: true })
    // PID 99999999 almost certainly doesn't exist
    writeFileSync(TEST_PID_FILE, "99999999\n")
    expect(acquirePidLock(TEST_PID_FILE)).toBe(true)
  })

  it("acquires lock when PID file contains garbage", () => {
    mkdirSync(TEST_DIR, { recursive: true })
    writeFileSync(TEST_PID_FILE, "not-a-number\n")
    expect(acquirePidLock(TEST_PID_FILE)).toBe(true)
  })

  it("release removes file when PID matches", () => {
    acquirePidLock(TEST_PID_FILE)
    expect(existsSync(TEST_PID_FILE)).toBe(true)
    releasePidLock(TEST_PID_FILE)
    expect(existsSync(TEST_PID_FILE)).toBe(false)
  })

  it("release does not remove file when PID does not match", () => {
    mkdirSync(TEST_DIR, { recursive: true })
    writeFileSync(TEST_PID_FILE, "12345\n")
    releasePidLock(TEST_PID_FILE) // our PID != 12345
    expect(existsSync(TEST_PID_FILE)).toBe(true)
  })
})
