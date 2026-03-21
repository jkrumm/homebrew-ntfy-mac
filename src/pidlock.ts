import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs"
import { homedir } from "os"
import { dirname } from "path"

const PID_FILE = `${homedir()}/.local/share/ntfy-mac/ntfy-mac.pid`

/** Check if a process with the given PID is actually running. */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 = check existence, doesn't kill
    return true
  } catch {
    return false
  }
}

/**
 * Acquire a PID lock. Returns true if the lock was acquired.
 * If another instance is running, returns false.
 * Cleans up stale PID files automatically.
 */
export function acquirePidLock(): boolean {
  if (existsSync(PID_FILE)) {
    try {
      const existingPid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10)
      if (!isNaN(existingPid) && isProcessRunning(existingPid)) {
        return false // another instance is running
      }
    } catch {
      // PID file unreadable — treat as stale
    }
  }

  mkdirSync(dirname(PID_FILE), { recursive: true })
  writeFileSync(PID_FILE, String(process.pid) + "\n")
  return true
}

/** Release the PID lock on shutdown. */
export function releasePidLock(): void {
  try {
    // Only remove if it's our PID (avoid race)
    const content = readFileSync(PID_FILE, "utf-8").trim()
    if (parseInt(content, 10) === process.pid) {
      unlinkSync(PID_FILE)
    }
  } catch {
    // File already gone or unreadable
  }
}
