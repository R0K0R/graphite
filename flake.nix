{
  description = "Graphite (Flutter dev + Android/Waydroid helpers)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config = {
          allowUnfree = true;
          android_sdk.accept_license = true;
        };
      };
      inherit (pkgs) lib;

      androidComposition = pkgs.androidenv.composeAndroidPackages {
        platformVersions = [
          "34"
          "35"
          "36"
          "37"
        ];
        buildToolsVersions = [
          "34.0.0"
          "35.0.0"
        ];
        includeNDK = true;
        includeCmake = true;
        cmakeVersions = [ "3.22.1" ];
        includeEmulator = false;
        includeSystemImages = false;
      };

      androidHome = "${androidComposition.androidsdk}/libexec/android-sdk";
      bundledNdk = builtins.head (
        builtins.attrNames (
          builtins.readDir "${androidHome}/ndk"
        )
      );

      graphiteAndroidEnv = pkgs.buildFHSEnv {
        name = "graphite-android-env";
        targetPkgs =
          ps: with ps; [
            bashInteractive
            zlib
            stdenv.cc.cc
            ncurses5
            coreutils
            gnused
            gnugrep
            findutils
            which
            gitMinimal
          ];
        multiPkgs = ps: [ ps.zlib ];
        profile = ''
          export JAVA_HOME="${pkgs.jdk17}"
          export ANDROID_HOME="${androidHome}"
          export ANDROID_SDK_ROOT="$ANDROID_HOME"
          export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/${bundledNdk}"
          export PATH="$JAVA_HOME/bin:${pkgs.flutter}/bin:${pkgs.android-tools}/bin:$PATH"
        '';
        runScript = "${lib.getExe pkgs.bash}";
      };

      buildDebugApk = pkgs.writeShellApplication {
        name = "graphite-build-debug-apk";
        runtimeInputs = [
          graphiteAndroidEnv
          pkgs.flutter
          pkgs.jdk17
          pkgs.android-tools
        ];
        text =
          ''
            set -euo pipefail
            if [ ! -w . ] || [ ! -f pubspec.yaml ]; then
              echo "Run from a writable Graphite checkout (directory with pubspec.yaml), e.g. cd .../graphite && nix run .#default" >&2
              exit 1
            fi
            GRAPHITE_SRC="$PWD"
            export GRAPHITE_SRC
            APK="''${GRAPHITE_SRC}/build/app/outputs/flutter-apk/app-debug.apk"

            '${graphiteAndroidEnv}/bin/graphite-android-env' \
              -c "cd \"''${GRAPHITE_SRC}\" && flutter pub get && flutter build apk --debug"

            echo "Built: ''${APK}"
          '';
      };

      waydroidInstall = pkgs.writeShellApplication {
        name = "graphite-waydroid-install";
        runtimeInputs = [ ];
        text =
          ''
            set -euo pipefail
            command -v waydroid >/dev/null || { echo "Install / enable Waydroid on NixOS first." >&2; exit 1; }
            APK="''${1:-''${PWD}/build/app/outputs/flutter-apk/app-debug.apk}"
            waydroid app install "''${APK}"
            waydroid app launch ksa.hs.kr.graphite
            echo "Installed and launched Graphite in Waydroid."
          '';
      };

    in
    {
      packages.${system} = {
        default = buildDebugApk;
        install-waydroid = waydroidInstall;
      };

      apps.${system} = {
        default = {
          type = "app";
          program = lib.getExe buildDebugApk;
        };
        install-waydroid = {
          type = "app";
          program = lib.getExe waydroidInstall;
        };
      };

      devShells.${system}.default = pkgs.mkShell {
        packages = [
          pkgs.flutter
          pkgs.android-tools
          pkgs.jdk17
        ];
        shellHook = ''
          export JAVA_HOME="${pkgs.jdk17}"
          export ANDROID_HOME="${androidHome}"
          export ANDROID_SDK_ROOT="$ANDROID_HOME"
          export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/${bundledNdk}"
          export GRAPHITE_ANDROID_FHS="${graphiteAndroidEnv}"
          echo "${graphiteAndroidEnv}/bin/graphite-android-env -c 'cd \"$PWD\" && flutter pub get && flutter build apk --debug'"
          echo "Then run from this repo: nix run .#install-waydroid"
        '';
      };

    };

}
