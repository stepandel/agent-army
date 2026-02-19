# Creating Identities

This guide covers everything you need to build a custom identity for Agent Army.

## Identity Structure

An identity is a self-contained directory with an `identity.yaml` manifest and workspace files:

```
my-identity/
├── identity.yaml       # Manifest (required)
├── SOUL.md             # Personality, approach, boundaries
├── IDENTITY.md         # Name, role, emoji
├── HEARTBEAT.md        # Periodic tasks
├── TOOLS.md            # Tool reference for the agent
├── AGENTS.md           # Operational instructions
├── BOOTSTRAP.md        # First-run setup checks
├── USER.md             # Owner info (templated)
└── skills/             # Bundled skills
    └── my-skill/
        └── SKILL.md
```

Identities can live in a Git repo, a subdirectory of a monorepo, or a local directory on disk.

## `identity.yaml` Reference

The manifest declares the agent's configuration defaults.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Machine-readable identifier (e.g., `eng`, `researcher`) |
| `displayName` | string | Human-readable name shown in UI and logs (e.g., `Atlas`) |
| `role` | string | Functional role (e.g., `pm`, `eng`, `tester`, `researcher`) |
| `emoji` | string | GitHub shortcode without colons (e.g., `telescope`, `clipboard`) |
| `description` | string | One-line summary of what the agent does |
| `volumeSize` | number | Disk size in GB for the agent's cloud instance |
| `skills` | string[] | List of bundled skill directory names |
| `templateVars` | string[] | Template variables used in workspace files |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `model` | string | AI model identifier (e.g., `anthropic/claude-opus-4-6`) |
| `backupModel` | string | Fallback model if primary is unavailable |
| `codingAgent` | string | Coding agent CLI to install (e.g., `claude-code`) |
| `instanceType` | string | Cloud instance type override |
| `deps` | string[] | System dependencies to install (from dep registry) |
| `plugins` | string[] | OpenClaw plugins to configure (from plugin registry) |
| `pluginDefaults` | object | Per-plugin default configuration |

### Example

```yaml
name: researcher
displayName: Atlas
role: researcher
emoji: telescope
description: Deep research, source analysis, report generation
volumeSize: 20
model: anthropic/claude-sonnet-4-5
codingAgent: claude-code

deps:
  - brave-search

plugins:
  - slack

pluginDefaults:
  slack:
    mode: socket
    dm:
      enabled: true
      policy: open

skills:
  - research-report

templateVars:
  - OWNER_NAME
  - TIMEZONE
  - WORKING_HOURS
  - USER_NOTES
```

## Workspace Files

Workspace files are injected into `~/.openclaw/workspace/` on the agent's cloud instance. They define the agent's personality, behavior, and operational context.

### SOUL.md — Personality

The agent's core personality file. Define:
- **Core truths** — fundamental principles that guide behavior
- **Superpowers** — what this agent excels at
- **Boundaries** — what the agent should avoid or defer on
- **Vibe** — one-line personality summary
- **Continuity** — remind the agent that these files are its memory

This is the most important file — it shapes how the agent thinks and communicates.

### IDENTITY.md — Name Card

Short file with the agent's name, role, emoji, and a one-line role description. Keep it to 5-10 lines. Supports template variables (e.g., `Report to {{OWNER_NAME}}`).

### HEARTBEAT.md — Periodic Tasks

A checklist the agent runs on each heartbeat cycle. Use this for:
- Checking for pending work
- Running maintenance tasks
- Updating memory files

Always include a bootstrap check at the top:
```markdown
- [ ] If `BOOTSTRAP.md` exists in workspace, follow it first.
```

End with a `HEARTBEAT_OK` return when nothing needs attention.

### TOOLS.md — Tool Reference

A cheat sheet for the tools available to the agent. Document:
- Communication tools (Slack, email)
- Research tools (Brave Search, web)
- Development tools (GitHub CLI, coding agents)
- Any integration-specific workflows

### AGENTS.md — Operational Instructions

Shared instructions for multi-agent coordination. Covers:
- Session startup sequence (which files to read, in what order)
- Memory management (daily files, long-term memory)
- Safety rules (what's free to do vs. requires permission)
- Heartbeat behavior
- Group chat etiquette

### BOOTSTRAP.md — First-Run Setup

Integration checks that run once when the agent is first deployed. Verify each tool and plugin works, then:
1. Log results
2. Send a welcome message
3. Delete this file

If any check fails, the file stays and the agent reports the failure.

### USER.md — Owner Info

Templated file with the agent owner's details. Standard fields:

```markdown
- **Name:** {{OWNER_NAME}}
- Timezone: {{TIMEZONE}}
- Working hours: {{WORKING_HOURS}}
- Notes: {{USER_NOTES}}
```

## Skills

Skills are reusable workflows bundled with an identity. Each skill lives in `skills/<skill-name>/SKILL.md`.

### SKILL.md Format

Every skill file has YAML frontmatter followed by markdown instructions:

```markdown
---
name: research-report
description: Conduct deep research and produce a structured report
metadata: {"openclaw":{"emoji":":telescope:"}}
---

# Research Report

Step-by-step workflow instructions here...
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill identifier |
| `description` | Yes | One-line summary |
| `metadata` | No | JSON string with OpenClaw metadata |
| `user-invocable` | No | Whether users can trigger this skill directly (default: `true`) |

### Metadata Options

```yaml
metadata: {"openclaw":{"emoji":":clipboard:", "requires":{"bins":["claude","git"]}}}
```

- `emoji` — Skill icon in OpenClaw UI
- `requires.bins` — Binary dependencies that must be available

### Private vs Public Skills

- **Private skills** — listed by name in `skills` array, bundled in the identity directory
- **Public skills** — prefixed with `clawhub:` (e.g., `clawhub:my-org/my-skill`), fetched from the ClawHub registry

```yaml
skills:
  - my-private-skill          # Loaded from skills/my-private-skill/SKILL.md
  - clawhub:org/public-skill  # Fetched from ClawHub
```

## Template Variables

Workspace files support `{{VARIABLE}}` substitution. Variables are populated from values collected during `agent-army init`.

### How It Works

1. Declare variables in `templateVars` in `identity.yaml`
2. Use `{{VARIABLE_NAME}}` in any workspace file
3. During deployment, the init wizard prompts for values
4. Values are substituted before files are injected into the agent

### Standard Variables

| Variable | Description |
|----------|-------------|
| `OWNER_NAME` | Name of the agent's owner |
| `TIMEZONE` | Owner's timezone (e.g., `America/New_York`) |
| `WORKING_HOURS` | Working hours (e.g., `9am-6pm`) |
| `USER_NOTES` | Free-form notes for the agent |

### Custom Variables

You can define any variable name. If your identity uses Linear and GitHub integrations:

```yaml
templateVars:
  - OWNER_NAME
  - TIMEZONE
  - WORKING_HOURS
  - USER_NOTES
  - LINEAR_TEAM      # Custom: default Linear team ID
  - GITHUB_REPO      # Custom: default GitHub repository
```

Then reference them in workspace files: `Check open issues in {{LINEAR_TEAM}}`.

## Registries

Agent Army uses registries for installable components. When building an identity, you select from these registries.

### Coding Agent Registry

The `codingAgent` field in `identity.yaml` selects which coding CLI to install.

| Agent | CLI | Description |
|-------|-----|-------------|
| `claude-code` | `claude` | Claude Code CLI (default) |

New coding agents can be added to the registry as they become available.

### Dep Registry

System-level tools installed on agents via the `deps` field.

| Dep | What It Installs |
|-----|-----------------|
| `gh` | GitHub CLI (with token-based auth) |
| `brave-search` | Brave Search API key (config-only) |

### Plugin Registry

OpenClaw plugins configured per-agent via the `plugins` field.

| Plugin | What It Does |
|--------|-------------|
| `openclaw-linear` | Linear issue tracking integration |
| `slack` | Slack bot integration (Socket Mode) |

### Plugin Defaults

Use `pluginDefaults` to set per-plugin configuration that ships with the identity:

```yaml
pluginDefaults:
  slack:
    mode: socket
    dm:
      enabled: true
      policy: open
  openclaw-linear:
    stateActions:
      backlog: add
      started: add
      completed: remove
```

These defaults can be overridden per-deployment via plugin config files at `~/.agent-army/configs/<stack>/plugins/<plugin>.yaml`.

## Using Your Identity

### Local Directory

Point to a local identity during `agent-army init`, or reference it in the manifest:

```yaml
agents:
  - name: agent-researcher
    displayName: Atlas
    role: researcher
    identity: "./path/to/my-identity"
    volumeSize: 20
```

### Git Repository

Host your identity in a Git repo. Use `#subfolder` syntax for monorepos:

```yaml
agents:
  - name: agent-researcher
    displayName: Atlas
    role: researcher
    identity: "https://github.com/your-org/your-identities#researcher"
    identityVersion: "v1.0.0"   # Optional: pin to tag or commit
    volumeSize: 20
```

### Monorepo Layout

Multiple identities can share a single repo:

```
my-identities/
├── researcher/
│   ├── identity.yaml
│   ├── SOUL.md
│   └── ...
├── analyst/
│   ├── identity.yaml
│   ├── SOUL.md
│   └── ...
└── writer/
    ├── identity.yaml
    ├── SOUL.md
    └── ...
```

Reference each with `https://github.com/org/my-identities#researcher`, `#analyst`, etc.

## Tips

- **Start with the example.** Copy `examples/identity/` from the Agent Army repo and modify it.
- **Keep SOUL.md focused.** 30-50 lines is plenty. Agents work better with clear, concise personality guidance.
- **Test locally first.** Use a local path identity during development, switch to Git URL for production.
- **One skill per workflow.** Each skill should handle one complete workflow. If a skill is doing too much, split it.
- **Use `user-invocable: false`** for skills that are triggered by the system (queue handlers, routers) rather than by users.
