# FAFO

**F\*ck around, find out.**

This repo is where I find out what I can do with AI. Each folder is one experiment. Some turn out useful, some turn out weird, and all of them stay open so you can poke at them too.

## Projects

| Project | What it is |
| --- | --- |
| [Clippy for Claude](clippy-for-claude/) | Clippy, out of retirement and living above the prompt in Claude Code. He shows your usage limits, reacts to what your session is doing, and writes you a catch-up note when you come back. |

## Installing a project

Projects that are Claude Code plugins install straight from this repo. In a Claude Code terminal session, run:

```
/plugin install clippy --marketplace keerthivasan082/FAFO
```

Answer `y` to add the FAFO marketplace, then pick a scope. Each project's README covers the rest.

## Layout

```
FAFO/
├── .claude-plugin/
│   └── marketplace.json    lists the plugins in this repo
└── clippy-for-claude/      one folder per experiment, each with its own README
```

A new experiment gets its own folder. If it's a Claude Code plugin, it also gets an entry in `.claude-plugin/marketplace.json`.

## Open for experiments

Found a bug, got an idea, or want to take something in a stranger direction? Open an issue or a pull request.
