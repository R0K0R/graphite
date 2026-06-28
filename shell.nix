{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_22
    electron
    vite
    mpv
    xdg-utils
    xwayland-satellite
  ];

  shellHook = ''
    export NIXOS_OZONE_WL=1
    if [ -z "$DISPLAY" ]; then
      xwayland-satellite :0 &
      export DISPLAY=:0
    fi
    # Electron auto-detects Wayland via WAYLAND_DISPLAY; force x11 so Vulkan works
    _electron_real=$(command -v electron 2>/dev/null)
    if [ -n "$_electron_real" ]; then
      mkdir -p /tmp/graphite-shell
      printf '#!/bin/sh\nexec %s --ozone-platform=x11 "$@"\n' "$_electron_real" > /tmp/graphite-shell/electron
      chmod +x /tmp/graphite-shell/electron
      export ELECTRON=/tmp/graphite-shell/electron
    fi
    unset _electron_real
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath (with pkgs; [
      alsa-lib
      at-spi2-atk
      at-spi2-core
      atk
      cairo
      cups
      dbus
      expat
      fontconfig
      freetype
      gdk-pixbuf
      glib
      gtk3
      libGL
      libuuid
      libxkbcommon
      mesa
      nspr
      nss
      pango
      pipewire
      systemd
      libx11
      libxscrnsaver
      libxcomposite
      libxcursor
      libxdamage
      libxext
      libxfixes
      libxi
      libxrandr
      libxrender
      libxtst
      libxcb
      libxshmfence
      wayland
      libdecor
      vulkan-loader
    ])}
    export VK_ICD_FILENAMES=$(find /run/opengl-driver/share/vulkan/icd.d/ -name "*.json" 2>/dev/null | tr '\n' ':' | sed 's/:$//')
    export XDG_DATA_DIRS=${pkgs.mpv}/share:$XDG_DATA_DIRS
    for mime in video/mp4 video/x-matroska video/webm video/avi video/quicktime video/mpeg video/ogg video/x-msvideo video/x-flv; do
      xdg-mime default mpv.desktop $mime 2>/dev/null || true
    done
    update-desktop-database ~/.local/share/applications/ 2>/dev/null || true
  '';
}
