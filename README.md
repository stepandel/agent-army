# Agent Army 🪖

[![npm](https://img.shields.io/npm/v/agent-army)](https://www.npmjs.com/package/agent-army)
[![license](https://img.shields.io/npm/l/agent-army)](./LICENSE)

Deploy a fleet of specialized [OpenClaw](https://openclaw.bot/) AI agents on **AWS** or **Hetzner Cloud** — managed entirely from your terminal.

## What Is This?

Agent Army provisions a team of autonomous AI agents that handle software engineering tasks — product management & research, development, and QA — with persistent memory and role-specific behavior. Agents communicate over a secure Tailscale mesh VPN with no public port exposure.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      AWS VPC / Hetzner Cloud                        │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐             │
│  │  Juno (PM)   │   │ Titus (Eng)  │   │ Scout (QA)   │             │
│  │              │   │              │   │              │             │
│  │  • OpenClaw  │   │  • OpenClaw  │   │  • OpenClaw  │             │
│  │  • Docker    │   │  • Docker    │   │  • Docker    │             │
│  │  • Tailscale │   │  • Tailscale │   │  • Tailscale │             │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘             │
│         └──────────────────┼──────────────────┘                     │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                ┌────────────▼────────────┐
                │   Tailscale Mesh VPN    │
                │   (Encrypted P2P)       │
                └────────────┬────────────┘
                             │
                ┌────────────▼────────────┐
                │     Your Machine        │
                └─────────────────────────┘
```

## Quick Start

Everything is done through the CLI.

### 1. Install

```bash
npm install -g agent-army
```

### 2. Run the Setup Wizard

```bash
agent-army init
```

The wizard walks you through:
- **Prerequisites check** — verifies Pulumi, Node.js, cloud provider CLI, and Tailscale
- **Cloud provider** — AWS or Hetzner Cloud
- **Region & instance type** — with cost estimates shown inline
- **Secrets** — Anthropic API key, Tailscale auth key (with instructions for each)
- **Agent selection** — pick from built-in identities, define custom agents, or mix both
- **Optional integrations** — Slack, Linear, GitHub per agent
- **Review & confirm** — see full config and estimated monthly cost

This generates an `agent-army.yaml` manifest and sets all Pulumi config values automatically.

### 3. Deploy

```bash
agent-army deploy
```

### 4. Validate

Wait 3-5 minutes for cloud-init to complete, then:

```bash
agent-army validate
```

### 5. Access Your Agents

```bash
agent-army ssh juno      # SSH to PM agent
agent-army ssh titus     # SSH to Engineer agent
agent-army ssh scout     # SSH to QA agent
```

## CLI Reference

The CLI is the primary interface for every operation. Run `agent-army --help` for the full list.

| Command | Description |
|---------|-------------|
| `agent-army init` | Interactive setup wizard |
| `agent-army deploy` | Deploy agents (`pulumi up` under the hood) |
| `agent-army deploy -y` | Deploy without confirmation prompt |
| `agent-army status` | Show agent statuses and outputs |
| `agent-army status --json` | Status in JSON format |
| `agent-army ssh <agent>` | SSH to an agent by name, role, or alias |
| `agent-army ssh <agent> '<cmd>'` | Run a command on an agent remotely |
| `agent-army validate` | Health check all agents via Tailscale |
| `agent-army destroy` | Tear down all resources (with confirmation) |
| `agent-army redeploy` | Update agents in-place (`pulumi up --refresh`) |
| `agent-army redeploy -y` | Redeploy without confirmation prompt |
| `agent-army destroy -y` | Tear down without confirmation |
| `agent-army list` | List saved configurations |
| `agent-army config show` | Display current config |
| `agent-army config show --json` | Config in JSON format |
| `agent-army config set <key> <value>` | Update a config value |
| `agent-army config set <key> <value> -a <agent>` | Update a per-agent config value |

Agent resolution is flexible — all of these target the same agent:

```bash
agent-army ssh juno      # by alias
agent-army ssh pm          # by role
agent-army ssh agent-pm    # by resource name
```

## Identity System

Agent Army uses an **identity system** to define agent personas. Identities are self-contained packages that live in external Git repos (or local directories) and include everything an agent needs: personality, skills, model preferences, plugin configuration, and dependencies.

### Built-in Identities

Agent Army ships with three built-in identities:

| Alias | Role | Model | What It Does |
|-------|------|-------|-------------|
| **Juno** | PM | Claude Opus 4.6 | Breaks down tickets, researches requirements, plans & sequences work, tracks progress, unblocks teams |
| **Titus** | Engineer | Claude Opus 4.6 | Picks up tickets, writes code via Claude Code, builds/tests, creates PRs, responds to reviews |
| **Scout** | Tester | Claude Opus 4.6 | Reviews PRs, tests happy/sad/edge cases, files bugs, verifies fixes |

### Identity Structure

Each identity is a directory with an `identity.yaml` manifest and workspace files:

```
my-identity/
├── identity.yaml       # Manifest: model, plugins, deps, skills, template vars
├── SOUL.md             # Personality, role, approach, communication style
├── IDENTITY.md         # Name, role, emoji
├── HEARTBEAT.md        # Periodic tasks and state machine logic
├── TOOLS.md            # Tool reference (Linear, Slack, GitHub, local env)
├── AGENTS.md           # Multi-agent coordination instructions
├── BOOTSTRAP.md        # First-run setup instructions
├── USER.md             # Owner-specific info (templated)
└── skills/             # Bundled skills
    ├── my-skill/
    │   └── SKILL.md
    └── another-skill/
        └── SKILL.md
```

### `identity.yaml`

The identity manifest declares the agent's defaults:

```yaml
name: eng
displayName: Titus
role: eng
emoji: building_construction
description: Lead engineering, coding, shipping
volumeSize: 50

# AI model configuration (per-identity, not global)
model: anthropic/claude-opus-4-6
backupModel: anthropic/claude-sonnet-4-5
codingAgent: claude-code        # or "codex", "amp", etc.

# System dependencies installed on the agent
deps:
  - gh
  - brave-search

# OpenClaw plugins
plugins:
  - openclaw-linear
  - slack

# Per-plugin default configuration
pluginDefaults:
  openclaw-linear:
    stateActions:
      triage: remove
      backlog: add
      started: add
      completed: remove
  slack:
    mode: socket
    dm:
      enabled: true
      policy: open

# Bundled skills (plain = private, "clawhub:" prefix = public)
skills:
  - eng-queue-handler
  - eng-ticket-workflow
  - eng-pr-tester
  - pr-review-resolver

# Template variables used in workspace files
templateVars:
  - OWNER_NAME
  - TIMEZONE
  - WORKING_HOURS
  - USER_NOTES
  - LINEAR_TEAM
  - GITHUB_REPO
```

### Using Custom Identities

Point an agent at any Git repo or local directory during `agent-army init`:

```yaml
# agent-army.yaml
agents:
  - name: agent-pm
    displayName: Juno
    role: pm
    identity: "https://github.com/your-org/army-identities#pm"
    identityVersion: "v1.0.0"   # optional: pin to a tag or commit
    volumeSize: 30
```

Identities are cached locally at `~/.agent-army/identity-cache/` and re-fetched on deploy.

### Workspace Files

| File | Purpose |
|------|---------|
| `SOUL.md` | Personality, role, approach, communication style |
| `IDENTITY.md` | Name, role, emoji |
| `HEARTBEAT.md` | Periodic tasks and state machine logic |
| `TOOLS.md` | Tool reference (Linear, Slack, GitHub, local env) |
| `AGENTS.md` | Multi-agent coordination instructions |
| `BOOTSTRAP.md` | First-run setup instructions |
| `USER.md` | Owner-specific info (uses template variables) |

Template variables are supported in workspace files:

| Variable | Description |
|----------|-------------|
| `{{OWNER_NAME}}` | Agent owner name |
| `{{TIMEZONE}}` | Owner timezone |
| `{{WORKING_HOURS}}` | Working hours for scheduling |
| `{{USER_NOTES}}` | Custom notes for the agent |
| `{{LINEAR_TEAM}}` | Default Linear team ID |
| `{{GITHUB_REPO}}` | Default GitHub repository |

## Registries

Agent Army uses registries to manage installable components. Each registry maps names to install scripts and configuration.

### Coding Agent Registry

Defines how coding agent CLIs are installed and configured on cloud instances. The `codingAgent` field in `identity.yaml` selects which entry to use.

| Agent | CLI | Description |
|-------|-----|-------------|
| `claude-code` | `claude` | Claude Code CLI (default) |

Each entry provides an install script, model configuration script, and OpenClaw `cliBackends` config. New coding agents (Codex, Amp, etc.) can be added by extending the registry.

### Dep Registry

System-level tools installed on agents. Declared via the `deps` field in `identity.yaml`.

| Dep | What It Installs |
|-----|-----------------|
| `gh` | GitHub CLI (with token-based auth) |
| `brave-search` | Brave Search API key (config-only, no binary) |

### Plugin Registry

OpenClaw plugins configured per-agent. Declared via the `plugins` field in `identity.yaml`.

| Plugin | What It Does |
|--------|-------------|
| `openclaw-linear` | Linear issue tracking integration (with webhooks via Tailscale Funnel) |
| `slack` | Slack bot integration (Socket Mode) |

## Cloud Providers

### Provider Comparison

| Feature | AWS | Hetzner Cloud |
|---------|-----|---------------|
| **3x Agents (monthly)** | ~$110-120 | ~$18-22 |
| **Instance Type** | t3.medium (2 vCPU, 4GB) | CX22 (2 vCPU, 4GB) |
| **Storage** | ~$2.40/month per 30GB | Included |
| **Data Transfer** | ~$5-10/month | 20TB included |
| **Regions** | Global (25+) | EU & US (5 locations) |
| **Setup Complexity** | Moderate (VPC, IAM) | Simple (API token) |

Use Hetzner for development and cost savings (~80% cheaper). Use AWS for production or global reach.

### What Gets Provisioned

Each agent gets:
- Cloud instance (EC2 or Hetzner server) with Ubuntu 24.04 LTS
- Docker (for OpenClaw sandbox)
- Node.js v22, OpenClaw CLI, coding agent CLI (from registry), GitHub CLI
- Tailscale VPN (encrypted mesh, no public ports)
- Workspace files and skills injected from its identity
- AI model configured per-identity (with fallback support)
- Plugins and deps installed per-identity

All agents share a single VPC/network for cost optimization.

## Dependencies

You need the following installed on your **local machine** before running `agent-army init`. The init wizard checks for these and will tell you what's missing.

### Required (all providers)

| Dependency | Why | Install |
|------------|-----|---------|
| **Node.js 18+** | Runtime for CLI and Pulumi program | [nodejs.org](https://nodejs.org/) |
| **Pulumi CLI** | Infrastructure provisioning | [pulumi.com/docs/iac/download-install](https://www.pulumi.com/docs/iac/download-install/) |
| **Pulumi Account** | State management and encrypted secrets | [app.pulumi.com/signup](https://app.pulumi.com/signup) |
| **Tailscale** | Secure mesh VPN to reach your agents | [tailscale.com/download](https://tailscale.com/download) |

### Required (provider-specific)

Pick one depending on where you want to deploy:

| Provider | Dependency | Install |
|----------|-----------|---------|
| **AWS** | AWS CLI (configured with credentials) | [aws.amazon.com/cli](https://aws.amazon.com/cli/) — then run `aws configure` |
| **Hetzner** | API token with Read & Write permissions | [console.hetzner.cloud](https://console.hetzner.cloud/) → Project → Security → API Tokens |

### Tailscale Setup

Tailscale requires a few one-time setup steps:

1. [Create an account](https://login.tailscale.com/start)
2. [Enable HTTPS certificates](https://tailscale.com/kb/1153/enabling-https) (required for OpenClaw web UI)
3. [Generate a reusable auth key](https://login.tailscale.com/admin/settings/keys) with tags
4. Note your tailnet DNS name (e.g., `tail12345.ts.net`)

### Installed on agents automatically

These are provisioned on the cloud instances via cloud-init — you do **not** need them locally:

- Docker, Node.js v22, OpenClaw CLI, coding agent CLI (e.g., Claude Code)
- Tailscale (agent-side)
- GitHub CLI, Brave Search, and other deps (per-identity)
- OpenClaw plugins: Linear, Slack (per-identity)

## Required API Keys

| Key | Required | Where to Get |
|-----|----------|--------------|
| **Anthropic Credentials** | Yes | [API Key](https://console.anthropic.com/) or OAuth token (`claude setup-token`) |
| **Tailscale Auth Key** | Yes | [Tailscale Admin](https://login.tailscale.com/admin/settings/keys) (reusable, with tags) |
| **Slack Bot Token** | No | [Slack API](https://api.slack.com/apps) — per agent |
| **Linear API Token** | No | [Linear Settings](https://linear.app/settings/api) — per agent |
| **GitHub Token** | No | [GitHub Settings](https://github.com/settings/tokens) — per agent |

### Claude Code Authentication

Two authentication methods are supported:

| Method | Token Format | Best For |
|--------|-------------|----------|
| **API Key** | `sk-ant-api03-...` | Pay-as-you-go API usage |
| **OAuth Token** | `sk-ant-oat01-...` | Pro/Max subscription (flat rate) |

The system auto-detects which type you provide and sets the correct environment variable.

## Updating & Redeploying

For in-place updates that preserve Tailscale devices and existing infrastructure:

```bash
agent-army redeploy
```

This runs `pulumi up --refresh` to sync cloud state and apply changes. If the stack doesn't exist yet, it falls back to a fresh deploy automatically.

For a clean rebuild (when in-place update can't recover):

```bash
agent-army destroy -y && agent-army deploy -y
```

## Configuration

### Viewing & Modifying Config

View your current configuration without opening the manifest file:

```bash
agent-army config show              # Human-readable summary
agent-army config show --json       # Full JSON output
```

Modify config values with validation (no need to re-run `init`):

```bash
agent-army config set region us-west-2
agent-army config set instanceType t3.large
agent-army config set instanceType cx32 -a titus   # Per-agent override
agent-army config set volumeSize 50 -a scout       # Per-agent volume
```

Run `agent-army redeploy` after changing config to apply.

### `agent-army.yaml`

Generated by `agent-army init`. This manifest drives the entire deployment:

```yaml
stackName: dev
provider: aws
region: us-east-1
instanceType: t3.medium
ownerName: Your Name
timezone: America/New_York
workingHours: 9am-6pm
agents:
  - name: agent-pm
    displayName: Juno
    role: pm
    identity: "https://github.com/your-org/army-identities#pm"
    volumeSize: 30
    plugins:
      - openclaw-linear
      - slack
    deps:
      - gh
      - brave-search
  - name: agent-eng
    displayName: Titus
    role: eng
    identity: "https://github.com/your-org/army-identities#eng"
    volumeSize: 50
```

Model, backup model, and coding agent are configured in the identity (not the manifest). The manifest defines _which_ agents to deploy and _where_.

### Pulumi Config

Secrets are stored encrypted in Pulumi config, set automatically by the init wizard. You can also manage them directly:

```bash
pulumi config set --secret anthropicApiKey sk-ant-xxxxx
pulumi config set --secret tailscaleAuthKey tskey-auth-xxxxx
pulumi config set tailnetDnsName tail12345.ts.net
```

### Pulumi ESC

For more advanced secret management, use [Pulumi ESC](https://www.pulumi.com/docs/esc/). See `esc/agent-army-secrets.yaml.example` for the full template.

## Project Structure

```
agent-army/
├── cli/                    # CLI tool (commands, prompts, config management)
│   ├── bin.ts              # Entry point (Commander.js)
│   ├── commands/           # init, deploy, redeploy, status, ssh, validate, destroy, config, list
│   ├── lib/                # Config, prerequisites, Pulumi ops, UI helpers
│   │   ├── coding-agent-registry.ts  # Coding agent CLI install/config registry
│   │   ├── dep-registry.ts           # System dep install registry (gh, brave-search)
│   │   ├── plugin-registry.ts        # OpenClaw plugin metadata registry
│   │   ├── identity.ts               # Identity loader (Git repos, local paths)
│   │   ├── skills.ts                 # Skill classifier (private vs public/clawhub)
│   │   └── ...
│   └── types.ts            # TypeScript types (ArmyManifest, IdentityManifest, etc.)
├── src/                    # Reusable Pulumi components
│   └── components/
│       ├── openclaw-agent.ts    # AWS EC2 agent component
│       ├── hetzner-agent.ts     # Hetzner Cloud agent component
│       ├── cloud-init.ts        # Cloud-init script generation (registry-driven)
│       └── config-generator.ts  # OpenClaw config builder (model fallbacks, cliBackends)
├── identities/             # Built-in identity stubs (point to external repos)
├── docs/                   # Mintlify documentation site
├── esc/                    # Pulumi ESC secret templates
├── scripts/                # Shell script helpers
├── web/                    # Next.js dashboard (agent-army-web)
├── index.ts                # Main Pulumi stack program
├── shared-vpc.ts           # Shared VPC component (AWS)
└── Pulumi.yaml             # Pulumi project config
```

## Security

- All agent ports bind to `127.0.0.1` — access is via **Tailscale only**
- No public port exposure; Tailscale Serve proxies traffic
- Token-based gateway authentication
- Secrets encrypted via Pulumi config
- SSH available as fallback for debugging

## Troubleshooting

### Agents not appearing in Tailscale

1. Wait 3-5 minutes for cloud-init to complete
2. Check logs: `agent-army ssh pm 'sudo cat /var/log/cloud-init-output.log | tail -100'`
3. Verify your Tailscale auth key is valid and reusable

### OpenClaw gateway not running

```bash
agent-army ssh pm 'openclaw gateway status'
agent-army ssh pm 'journalctl -u openclaw -n 50'
agent-army ssh pm 'openclaw gateway restart'
```

### SSH connection refused

1. Check Tailscale is running locally: `tailscale status`
2. Verify the agent appears in your tailnet
3. Ensure you're using the correct tailnet DNS name

### Pulumi state issues

```bash
pulumi refresh    # Refresh state from actual infrastructure
pulumi cancel     # Force unlock if locked
```

## Development

For contributing to Agent Army itself:

```bash
git clone https://github.com/stepandel/agent-army.git
cd agent-army
pnpm install
pnpm build
pnpm run watch    # Watch mode
```

## License

MIT

## Related

- [OpenClaw Documentation](https://docs.openclaw.ai/)
- [Pulumi AWS Provider](https://www.pulumi.com/registry/packages/aws/)
- [Pulumi Hetzner Provider](https://www.pulumi.com/registry/packages/hcloud/)
- [Pulumi ESC](https://www.pulumi.com/docs/esc/)
- [Tailscale Documentation](https://tailscale.com/kb/)
