/**
 * Shared plugin registry — metadata used by both index.ts (Pulumi) and the CLI.
 */

export interface PluginRegistryEntry {
  /** Secret env var mappings: { configKey: envVarName } */
  secretEnvVars: Record<string, string>;
  /** Whether to run `openclaw plugins install` during cloud-init */
  installable: boolean;
  /** Whether this plugin needs Tailscale Funnel (public HTTPS for webhooks) */
  needsFunnel?: boolean;
  /**
   * Default config values for this plugin. Merged as lowest-priority defaults
   * (identity defaults and manifest inline config override these).
   *
   * Values can use $ENV_VAR syntax to reference runtime environment variables.
   * e.g., { "$AGENT_NAME": "default" } → {os.environ.get("AGENT_NAME", ""): "default"}
   */
  defaultConfig?: Record<string, unknown>;
}

export const PLUGIN_REGISTRY: Record<string, PluginRegistryEntry> = {
  "openclaw-linear": {
    secretEnvVars: {
      apiKey: "LINEAR_API_KEY",
      webhookSecret: "LINEAR_WEBHOOK_SECRET",
    },
    installable: true,
    needsFunnel: true,
    defaultConfig: {
      agentMapping: { "$AGENT_NAME": "default" },
    },
  },
  slack: {
    secretEnvVars: {
      botToken: "SLACK_BOT_TOKEN",
      appToken: "SLACK_APP_TOKEN",
    },
    installable: false,
  },
};
