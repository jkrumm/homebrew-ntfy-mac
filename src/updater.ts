import { homedir } from "os"
import { spawnSync } from "child_process"
import { loadState, saveState } from "./dedup"
import type { AppState } from "./types"

const STATE_DIR = `${homedir()}/.local/share/ntfy-mac`
const LAUNCHD_LABEL = "com.jkrumm.ntfy-mac"

export type InstallMethod = "brew" | "curl" | "dev"

// Accept optional path for testability — defaults to the running binary
export function detectInstallMethod(execPath = process.execPath): InstallMethod {
  // Homebrew-managed binaries live under .../Cellar/ntfy-mac/...
  if (execPath.includes("/Cellar/ntfy-mac")) return "brew"
  // A real ntfy-mac binary ends with the binary name; any other executable
  // (bun, node, etc.) is a dev/test runtime and should not trigger auto-update
  if (execPath.endsWith("/ntfy-mac") || execPath === "ntfy-mac") return "curl"
  return "dev"
}

export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number)
  const [la, lb, lc] = parse(latest)
  const [ca, cb, cc] = parse(current)
  if (la !== ca) return la > ca
  if (lb !== cb) return lb > cb
  return lc > cc
}

async function downloadAndReplace(latestVersion: string): Promise<void> {
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  const url = `https://github.com/jkrumm/ntfy-mac/releases/download/${latestVersion}/ntfy-mac-${arch}`

  const res = await fetch(url, { headers: { "User-Agent": "ntfy-mac" } })
  if (!res.ok) throw new Error(`Failed to download update (${res.status})`)

  await Bun.$`mkdir -p ${STATE_DIR}`.quiet()
  const tmpPath = `${STATE_DIR}/ntfy-mac.tmp`
  await Bun.write(tmpPath, await res.arrayBuffer())
  await Bun.$`chmod +x ${tmpPath}`.quiet()

  // Atomic replace — safe even on the running binary (old inode stays in memory).
  // Use process.execPath so we always replace wherever this binary actually lives,
  // regardless of install path.
  await Bun.$`mv ${tmpPath} ${process.execPath}`.quiet()
}

// Called from the daemon's update check — exits so launchd restarts with new binary
export async function performAutoUpdate(latestVersion: string): Promise<void> {
  await downloadAndReplace(latestVersion)
  // Re-read state immediately before writing to avoid clobbering concurrent listener writes
  await saveState({ ...(await loadState()), pendingUpdateNotification: latestVersion })
  process.exit(0)
}

// Called from `ntfy-mac update` (manual invocation) — also restarts the background daemon
export async function runManualUpdate(latestVersion: string): Promise<void> {
  await downloadAndReplace(latestVersion)
  // Re-read state immediately before writing to avoid clobbering concurrent listener writes
  await saveState({ ...(await loadState()), pendingUpdateNotification: latestVersion })

  // Restart the background daemon synchronously with a load fallback in case the
  // LaunchAgent is currently unloaded (e.g. fresh install, manually unloaded)
  const uid = process.getuid?.() ?? 501
  const plistPath = `${homedir()}/Library/LaunchAgents/${LAUNCHD_LABEL}.plist`
  const kick = spawnSync("launchctl", ["kickstart", "-k", `gui/${uid}/${LAUNCHD_LABEL}`], {
    stdio: "ignore",
  })
  if (kick.status !== 0) {
    spawnSync("launchctl", ["load", "-w", plistPath], { stdio: "ignore" })
  }
  process.exit(0)
}

// Returns version string if a pending notification exists, then clears it.
// Accepts optional load/save injections so tests can use a temp state file.
export async function takePendingUpdateNotification(
  load: () => Promise<AppState> = loadState,
  save: (s: AppState) => Promise<void> = saveState,
): Promise<string | null> {
  const state = await load()
  if (!state.pendingUpdateNotification) return null
  const version = state.pendingUpdateNotification
  // Re-read before clearing to avoid overwriting concurrent daemon writes
  await save({ ...(await load()), pendingUpdateNotification: null })
  return version
}
