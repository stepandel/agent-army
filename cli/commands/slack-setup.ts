/**
 * agent-army slack-setup — Create a Slack app for an OpenClaw agent via App Manifests
 *
 * Automates Slack app creation using the App Manifest API.
 * Reduces per-agent Slack onboarding from ~10 minutes to ~30 seconds.
 *
 * Prerequisites:
 *   1. Go to https://api.slack.com/apps
 *   2. Click "Your App Configuration Tokens" → "Generate Token"
 *   3. Select your workspace and generate — copy the token (starts with xoxe-)
 *   Note: Config tokens expire every 12 hours. Regenerate if needed.
 *
 * Usage:
 *   agent-army slack-setup --config-token xoxe-... --agent-name "My Agent"
 */

import { exitWithError } from "../lib/ui";

const SLACK_API = "https://slack.com/api";

/** OpenClaw agent Slack app manifest template */
function buildManifest(agentName: string): object {
  return {
    display_information: {
      name: agentName,
      description: `OpenClaw AI agent: ${agentName}`,
      background_color: "#1a1a2e",
    },
    features: {
      app_home: {
        home_tab_enabled: false,
        messages_tab_enabled: true,
        messages_tab_read_only_enabled: false,
      },
      bot_user: {
        display_name: agentName,
        always_online: true,
      },
    },
    oauth_config: {
      scopes: {
        bot: [
          "app_mentions:read",
          "channels:history",
          "channels:read",
          "channels:join",
          "chat:write",
          "groups:history",
          "groups:read",
          "im:history",
          "im:read",
          "im:write",
          "mpim:history",
          "mpim:read",
          "reactions:read",
          "reactions:write",
          "users:read",
          "pins:read",
          "pins:write",
          "files:read",
          "files:write",
        ],
      },
    },
    settings: {
      event_subscriptions: {
        bot_events: [
          "app_mention",
          "message.channels",
          "message.groups",
          "message.im",
          "message.mpim",
          "reaction_added",
          "reaction_removed",
          "member_joined_channel",
          "member_left_channel",
          "channel_rename",
          "pin_added",
          "pin_removed",
        ],
      },
      interactivity: {
        is_enabled: false,
      },
      org_deploy_enabled: false,
      socket_mode_enabled: true,
      token_rotation_enabled: false,
    },
  };
}

async function slackApi(
  endpoint: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${SLACK_API}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    exitWithError(
      `Network error calling Slack API (${endpoint}): ${err instanceof Error ? err.message : String(err)}\n` +
      "   Check your internet connection and try again.",
    );
  }

  if (!res.ok) {
    exitWithError(`Slack API HTTP ${res.status}: ${res.statusText}`);
  }

  try {
    return await res.json() as { ok: boolean; error?: string; [key: string]: unknown };
  } catch {
    exitWithError(`Slack API returned invalid JSON from ${endpoint}. Try again later.`);
  }
}

export interface SlackSetupOptions {
  configToken: string;
  agentName: string;
}

export async function slackSetupCommand(opts: SlackSetupOptions): Promise<void> {
  const { configToken, agentName } = opts;

  console.log(`\n🔧 Setting up Slack app for agent: ${agentName}\n`);

  const manifest = buildManifest(agentName);

  // Step 1: Validate manifest
  console.log("  Validating manifest...");
  const validateResult = await slackApi("apps.manifest.validate", configToken, {
    manifest,
  });

  if (!validateResult.ok) {
    const errors = validateResult.errors as Array<{ message: string; pointer: string }> | undefined;
    console.error("\n❌ Manifest validation failed:");
    if (errors?.length) {
      for (const err of errors) {
        console.error(`   • ${err.pointer}: ${err.message}`);
      }
    } else {
      console.error(`   ${validateResult.error ?? "Unknown error"}`);
    }
    exitWithError("Manifest validation failed. See errors above.");
  }
  console.log("  ✓ Manifest valid");

  // Step 2: Create app
  console.log("  Creating Slack app...");
  const createResult = await slackApi("apps.manifest.create", configToken, {
    manifest,
  });

  if (!createResult.ok) {
    const error = createResult.error ?? "Unknown error";
    if (error === "invalid_auth" || error === "token_expired") {
      exitWithError(
        "Config token is invalid or expired.\n" +
        "   Regenerate at: https://api.slack.com/apps → Your App Configuration Tokens → Generate Token",
      );
    } else {
      exitWithError(`App creation failed: ${error}`);
    }
  }

  const appId = (createResult as { app_id?: string }).app_id
    ?? ((createResult.credentials as { app_id?: string })?.app_id)
    ?? "unknown";

  console.log(`  ✓ App created! App ID: ${appId}`);

  const credentials = createResult.credentials as {
    client_id?: string;
    client_secret?: string;
  } | undefined;

  console.log("\n📋 Next Steps:\n");
  console.log(`  1. Install the app to your workspace:`);
  console.log(`     https://api.slack.com/apps/${appId}/install-on-team\n`);
  console.log(`  2. Copy the Bot Token (xoxb-...) from:`);
  console.log(`     https://api.slack.com/apps/${appId}/oauth\n`);
  console.log(`  3. Create an App-Level Token (xapp-...) with connections:write scope:`);
  console.log(`     https://api.slack.com/apps/${appId}/general`);
  console.log(`     → Scroll to "App-Level Tokens" → Generate Token\n`);
  console.log(`  4. Configure OpenClaw with the tokens:`);
  console.log(`     openclaw channels add --channel slack \\`);
  console.log(`       --bot-token xoxb-... \\`);
  console.log(`       --app-token xapp-...`);

  if (credentials?.client_id) {
    console.log(`\n  Client ID: ${credentials.client_id}`);
  }

  console.log(`\n✅ Slack app "${agentName}" is ready for installation!\n`);
}
