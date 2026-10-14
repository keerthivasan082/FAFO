# Clippy for Claude

My first AI assistant was a paperclip. This is him again, living in the band above the prompt in Claude Code, with a better sense of when to talk.

## What he does

- **Usage limits on hover.** Hover over him to see your 5-hour and weekly limits, when they reset, and how full the chat's context is.
- **Limit warnings.** A balloon when a limit crosses 75% and again at 90%, and a desktop notification at 95%. Each window warns once per step.
- **Long-chat nudge.** When the context passes 80% and 90%, he suggests `/compact` or a fresh chat.
- **Moods.** He looks busy while Claude works, waves when a session starts, cheers when a turn finishes, dozes after 2 minutes of quiet, and charges when your Mac is plugged in. Click him to wake him up.
- **Test watcher.** If tests, a type check, lint or a build fail, he says so once. When they pass again, he cheers.
- **Sitrep.** A catch-up card: what's in progress, what just happened, what's waiting on you, and what's next. It opens on its own when you come back after 30 minutes away, or when you start a new chat in the same folder.

## Manners

He gets one unprompted comment every 10 minutes, and it disappears after 8 seconds. Nothing pops up while he's muted, snoozed, hidden or behind the sitrep card.

## Controls

In the band:

- **sitrep** opens the catch-up card (pin it, or close it)
- **⋯** opens snooze 1h, mute tips and hide Clippy

Commands, for terminal sessions:

| Command | What it does |
| --- | --- |
| `/sitrep` | Writes a fresh catch-up note and pins the card |
| `/clippy hide` / `show` | Hide him, or bring him back |
| `/clippy snooze` / `wake` | Quiet for an hour, or right now |
| `/clippy mute` / `unmute` | Turn his tips off or on |

The desktop app doesn't list plugin commands, which is why the band has buttons for the same things.

## Install

In a Claude Code terminal session:

```
/plugin install clippy --marketplace keerthivasan082/FAFO
```

Answer `y` to add the FAFO marketplace, then pick a scope. Installed at the user scope, he also shows up in sessions the Claude desktop app starts.

## What he reads, and what it costs

- **Your session.** Usage and context numbers from Claude Code, and which Bash commands ran (to spot tests, type checks, lint and builds).
- **Git.** `git status` and the last three commits in the current folder, for the sitrep.
- **Battery.** `pmset -g batt` on macOS, for the charging face. Elsewhere he never charges.
- **Model calls, only for the sitrep.** When the prompt cache is still warm, he asks over the current chat, which mostly reads the cache. Otherwise he sends a trimmed transcript to the cheapest model your organization allows. If no model is allowed, the card falls back to what git says. Notes are kept locally, per folder.

## Develop

```
claude plugin validate clippy-for-claude
claude plugin test clippy-for-claude
```

To run your working copy instead of the installed one, start Claude Code with `--plugin-dir clippy-for-claude`, or name the folder in `CLAUDE_CODE_PLUGIN_DIRS`.

| Path | What's in it |
| --- | --- |
| `hooks/register.tsx` | Hooks, state, the band and the sitrep card |
| `hooks/sprite.ts` | Clippy's SVG, poses and balloons |
| `hooks/coach.ts` | Limit warnings, long-chat nudge, test watcher |
| `hooks/sitrep.ts` | Sitrep prompts, parsing and the git-only fallback |
| `types/index.d.ts` | The plugin's state contract |
| `tests/` | Tests for the pet, the coach and the sitrep |

---

Clippy is a Microsoft character. This is an unofficial fan project, not affiliated with or endorsed by Microsoft.
