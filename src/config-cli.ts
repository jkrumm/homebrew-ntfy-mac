import { readdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { loadStoredConfig, updateStoredConfig } from "./config"
import { PRIORITY_CONFIG } from "./notify"

// ─── Sound discovery ─────────────────────────────────────────────────────────

const SYSTEM_SOUNDS_DIR = "/System/Library/Sounds"
const USER_SOUNDS_DIR = join(homedir(), "Library", "Sounds")

export function discoverSounds(): string[] {
  const sounds: string[] = []
  for (const dir of [SYSTEM_SOUNDS_DIR, USER_SOUNDS_DIR]) {
    try {
      for (const file of readdirSync(dir)) {
        if (file.endsWith(".aiff") || file.endsWith(".wav") || file.endsWith(".caf")) {
          sounds.push(file.replace(/\.(aiff|wav|caf)$/, ""))
        }
      }
    } catch {
      // Directory doesn't exist or unreadable
    }
  }
  return [...new Set(sounds)].sort()
}

// ─── Config show ─────────────────────────────────────────────────────────────

function priorityLabel(p: number): string {
  const labels: Record<number, string> = {
    5: "urgent",
    4: "high",
    3: "default",
    2: "low",
    1: "min",
  }
  return labels[p] ?? String(p)
}

async function showSoundsConfig(): Promise<void> {
  const stored = await loadStoredConfig()
  const userSounds = (stored.sounds ?? {}) as Record<string, string | null>

  console.log("Notification sounds\n")
  console.log("  Priority      Sound         Source")
  console.log("  ────────────  ────────────  ──────")

  for (let p = 5; p >= 1; p--) {
    const userSound = userSounds[String(p)]
    const defaultSound = PRIORITY_CONFIG[p]?.sound ?? null
    const effective = userSound !== undefined ? userSound : defaultSound
    const source = userSound !== undefined ? "custom" : "default"
    const soundDisplay = effective ?? "(silent)"
    const label = `${p} (${priorityLabel(p)})`
    console.log(`  ${label.padEnd(14)}${soundDisplay.padEnd(14)}${source}`)
  }

  console.log("")
  console.log("Change with: ntfy-mac config sounds set <priority> <sound>")
  console.log("Reset all:   ntfy-mac config sounds reset")
  console.log("List sounds: ntfy-mac config sounds list")
  console.log('Test:        ntfy-mac notify -m "test" -p <priority>')
}

// ─── Config sounds subcommands ───────────────────────────────────────────────

async function handleSoundsCommand(args: string[]): Promise<void> {
  const sub = args[0]

  if (!sub || sub === "show") {
    await showSoundsConfig()
    return
  }

  if (sub === "list") {
    const sounds = discoverSounds()
    console.log("Available notification sounds:\n")
    for (const s of sounds) console.log(`  ${s}`)
    console.log(`\n  (silent)  — no sound`)
    console.log(`\nFound ${sounds.length} sounds.`)
    console.log("Custom sounds can be added to ~/Library/Sounds/ (AIFF/WAV/CAF, max 30s).")
    return
  }

  if (sub === "set") {
    const priority = parseInt(args[1], 10)
    const sound = args[2]

    if (!args[1] || !sound) {
      console.error("Usage: ntfy-mac config sounds set <priority 1-5> <sound|silent>")
      console.error("Example: ntfy-mac config sounds set 5 Glass")
      console.error("Example: ntfy-mac config sounds set 2 silent")
      process.exit(1)
    }
    if (isNaN(priority) || priority < 1 || priority > 5) {
      console.error("Priority must be 1-5.")
      process.exit(1)
    }

    const soundValue = sound === "silent" ? null : sound

    // Validate sound exists
    if (soundValue !== null) {
      const available = discoverSounds()
      if (!available.includes(soundValue)) {
        console.error(`Unknown sound: ${soundValue}`)
        console.error(`Run 'ntfy-mac config sounds list' to see available sounds.`)
        process.exit(1)
      }
    }

    const stored = await loadStoredConfig()
    const existing = (stored.sounds ?? {}) as Record<string, string | null>
    existing[String(priority)] = soundValue
    await updateStoredConfig({ sounds: existing })

    const display = soundValue ?? "(silent)"
    console.log(`Priority ${priority} (${priorityLabel(priority)}) → ${display}`)
    console.log('Test it: ntfy-mac notify -m "test" -p ' + priority)
    return
  }

  if (sub === "reset") {
    await updateStoredConfig({ sounds: undefined })
    console.log("Sound configuration reset to defaults.")
    await showSoundsConfig()
    return
  }

  console.error(`Unknown sounds subcommand: ${sub}`)
  console.error("Available: show, list, set, reset")
  process.exit(1)
}

// ─── Config entry point ──────────────────────────────────────────────────────

export async function handleConfigCommand(args: string[]): Promise<void> {
  const sub = args[0]

  if (!sub) {
    console.log(`ntfy-mac config

Manage ntfy-mac configuration.

Subcommands:
  ntfy-mac config sounds              Show sound configuration
  ntfy-mac config sounds list         List available system sounds
  ntfy-mac config sounds set <p> <s>  Set sound for priority (1-5)
  ntfy-mac config sounds reset        Reset sounds to defaults

Test changes with: ntfy-mac notify -m "test" -p <priority>
`)
    return
  }

  if (sub === "sounds") {
    await handleSoundsCommand(args.slice(1))
    return
  }

  console.error(`Unknown config subcommand: ${sub}`)
  console.error("Available: sounds")
  process.exit(1)
}
