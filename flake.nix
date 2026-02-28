{
  description = "Clawup — pre-built NixOS Docker image for local OpenClaw agents";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nix-openclaw.url = "github:openclaw/nix-openclaw";
  };

  outputs = { self, nixpkgs, nix-openclaw }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        overlays = [ nix-openclaw.overlays.default ];
      };
    in
    {
      packages.${system}.docker-image = import ./nix/docker-image.nix {
        inherit pkgs;
      };

      # Convenience alias: `nix build .#docker-image`
      packages.${system}.default = self.packages.${system}.docker-image;
    };

  # Build + load:
  #   nix build .#docker-image
  #   docker load < result
  #   docker images | grep clawup-openclaw
}
