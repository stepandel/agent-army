/**
 * LocalDockerOpenClaw Agent - Reusable Pulumi ComponentResource
 * Provisions a single OpenClaw agent in a local Docker container (for testing)
 */

import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";
import type { BaseOpenClawAgentArgs } from "./types";
import { generateKeyPairAndToken, buildCloudInitUserData, buildNixEntrypoint } from "./shared";

/**
 * Arguments for creating a Local Docker OpenClaw Agent
 */
export interface LocalDockerOpenClawAgentArgs extends BaseOpenClawAgentArgs {
  /**
   * Docker image to use (default: ubuntu:24.04)
   */
  image?: string;

  /**
   * Host port to map the gateway to (required)
   * Each agent needs a unique port.
   */
  gatewayPort: pulumi.Input<number>;

  /** Additional labels to apply to the container */
  labels?: Record<string, string>;

  /**
   * Use pre-built NixOS image instead of ubuntu:24.04.
   * Requires: `nix build .#docker-image && docker load < result`
   */
  useNixImage?: boolean;

  /**
   * Name of the Nix-built Docker image (default: "clawup-openclaw:latest").
   * Only used when useNixImage is true.
   */
  nixImageName?: string;
}

/**
 * LocalDockerOpenClaw Agent ComponentResource
 *
 * Provisions an OpenClaw agent in a local Docker container:
 * - Uses same cloud-init script as cloud providers
 * - Skips Docker-in-Docker and Tailscale
 * - Maps gateway port to host for direct access
 * - Runs daemon in foreground to keep container alive
 *
 * @example
 * ```typescript
 * const agent = new LocalDockerOpenClawAgent("my-agent", {
 *   providerApiKeys: { anthropic: config.requireSecret("anthropicApiKey") },
 *   tailscaleAuthKey: pulumi.secret("not-used"),
 *   tailnetDnsName: "localhost",
 *   gatewayPort: 18789,
 * });
 *
 * export const url = agent.gatewayUrl;
 * ```
 */
export class LocalDockerOpenClawAgent extends pulumi.ComponentResource {
  /** Always "127.0.0.1" for local Docker */
  public readonly publicIp: pulumi.Output<string>;
  /** Gateway URL (http://localhost:<port>/?token=...) */
  public readonly tailscaleUrl: pulumi.Output<string>;
  /** Gateway authentication token */
  public readonly gatewayToken: pulumi.Output<string>;
  /** SSH private key (Ed25519) — not used for local but kept for interface compat */
  public readonly sshPrivateKey: pulumi.Output<string>;
  /** SSH public key */
  public readonly sshPublicKey: pulumi.Output<string>;
  /** Docker container ID */
  public readonly containerId: pulumi.Output<string>;
  /** Docker container name */
  public readonly containerName: pulumi.Output<string>;

  constructor(
    name: string,
    args: LocalDockerOpenClawAgentArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("clawup:local:LocalDockerOpenClawAgent", name, {}, opts);

    const defaultResourceOptions: pulumi.ResourceOptions = { parent: this };

    const baseLabels = args.labels ?? {};

    // Generate SSH key pair + gateway token (reuse shared helper)
    const { sshKey, gatewayTokenValue } = generateKeyPairAndToken(name, defaultResourceOptions);

    // Resolve the gateway port
    const hostPort = pulumi.output(args.gatewayPort);
    const containerGatewayPort = 18789;

    const containerLabels = Object.entries({
      ...baseLabels,
      "clawup.project": "clawup",
      "clawup.stack": pulumi.getStack(),
      "clawup.agent": name,
    }).map(([label, value]) => ({ label, value }));

    let container: docker.Container;

    if (args.useNixImage) {
      // Nix path: use pre-loaded image + minimal entrypoint
      const nixImage = args.nixImageName ?? "clawup-openclaw:latest";
      const entrypoint = buildNixEntrypoint(name, args, gatewayTokenValue);

      // No docker.RemoteImage needed — image is loaded locally via `docker load`
      container = new docker.Container(
        `${name}-container`,
        {
          name: `clawup-${pulumi.getStack()}-${name}`,
          image: nixImage,
          entrypoints: ["/bin/bash", "-c"],
          command: ["echo $ENTRYPOINT_SCRIPT | base64 -d | bash"],
          envs: [
            entrypoint.apply((s) => {
              const encoded = Buffer.from(s).toString("base64");
              return `ENTRYPOINT_SCRIPT=${encoded}`;
            }),
          ],
          ports: [
            {
              internal: containerGatewayPort,
              external: hostPort,
            },
          ],
          labels: containerLabels,
          mustRun: true,
        },
        defaultResourceOptions,
      );
    } else {
      // Legacy path: ubuntu:24.04 + full cloud-init
      const image = args.image ?? "ubuntu:24.04";

      const userData = buildCloudInitUserData(name, args, gatewayTokenValue, {
        skipDocker: true,
        skipTailscale: true,
        foregroundMode: true,
        createUbuntuUser: true,
        compress: false,
      });

      const remoteImage = new docker.RemoteImage(
        `${name}-image`,
        { name: image },
        defaultResourceOptions,
      );

      container = new docker.Container(
        `${name}-container`,
        {
          name: `clawup-${pulumi.getStack()}-${name}`,
          image: remoteImage.imageId,
          entrypoints: ["/bin/bash", "-c"],
          command: ["echo $CLOUDINIT_SCRIPT | base64 -d | bash"],
          envs: [
            userData.apply((script) => {
              const encoded = Buffer.from(script).toString("base64");
              return `CLOUDINIT_SCRIPT=${encoded}`;
            }),
          ],
          ports: [
            {
              internal: containerGatewayPort,
              external: hostPort,
            },
          ],
          labels: containerLabels,
          mustRun: true,
        },
        defaultResourceOptions,
      );
    }

    // Set outputs
    this.publicIp = pulumi.output("127.0.0.1");
    this.containerId = container.id;
    this.containerName = container.name;
    this.sshPrivateKey = pulumi.secret(sshKey.privateKeyOpenssh);
    this.sshPublicKey = sshKey.publicKeyOpenssh;
    this.gatewayToken = pulumi.secret(gatewayTokenValue);

    // Gateway URL on localhost (no Tailscale)
    this.tailscaleUrl = pulumi.secret(
      pulumi.interpolate`http://localhost:${hostPort}/?token=${gatewayTokenValue}`
    );

    // Register outputs
    this.registerOutputs({
      publicIp: this.publicIp,
      tailscaleUrl: this.tailscaleUrl,
      gatewayToken: this.gatewayToken,
      sshPrivateKey: this.sshPrivateKey,
      sshPublicKey: this.sshPublicKey,
      containerId: this.containerId,
      containerName: this.containerName,
    });
  }
}
