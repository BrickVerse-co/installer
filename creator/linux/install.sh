#!/usr/bin/env bash
set -euo pipefail

APP_NAME="BrickVerse Creator"
APP_ID="gg.brickverse.creator"
INSTALL_DIR="/opt/brickverse-creator"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

find_executable() {
    local candidate
    for candidate in \
        "creator.x86_64" \
        "brickverse-creator.x86_64" \
        "BrickVerseCreator.x86_64" \
        "linux.x86_64"; do
        if [[ -f "$SCRIPT_DIR/$candidate" ]]; then
            printf '%s' "$candidate"
            return 0
        fi
    done
    return 1
}

EXE_NAME="$(find_executable || true)"
if [[ -z "$EXE_NAME" ]]; then
    echo "ERROR: No BrickVerse Creator Linux executable was found."
    echo "Place install.sh inside the exported Creator folder."
    exit 1
fi

echo "Installing $APP_NAME to $INSTALL_DIR..."
sudo mkdir -p "$INSTALL_DIR"
sudo cp -a "$SCRIPT_DIR/." "$INSTALL_DIR/"
sudo rm -f \
    "$INSTALL_DIR/install.sh" \
    "$INSTALL_DIR/install.command" \
    "$INSTALL_DIR/installer.bat" \
    "$INSTALL_DIR/README.txt"
sudo chmod +x "$INSTALL_DIR/$EXE_NAME"

ICON_PATH=""
for icon in icon.png creator.png brickverse-creator.png; do
    if [[ -f "$INSTALL_DIR/$icon" ]]; then
        ICON_PATH="$INSTALL_DIR/$icon"
        break
    fi
done

if [[ -z "$ICON_PATH" ]]; then
    ICON_PATH="$INSTALL_DIR/$EXE_NAME"
fi

DESKTOP_FILE="[Desktop Entry]
Type=Application
Version=1.0
Name=$APP_NAME
Comment=Create and edit BrickVerse worlds
Exec=$INSTALL_DIR/$EXE_NAME
Path=$INSTALL_DIR
Icon=$ICON_PATH
Terminal=false
Categories=Development;Game;
StartupNotify=true"

mkdir -p "$HOME/.local/share/applications"
printf '%s\n' "$DESKTOP_FILE" > "$HOME/.local/share/applications/$APP_ID.desktop"
chmod +x "$HOME/.local/share/applications/$APP_ID.desktop"

DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || printf '%s/Desktop' "$HOME")"
if [[ -d "$DESKTOP_DIR" ]]; then
    cp "$HOME/.local/share/applications/$APP_ID.desktop" "$DESKTOP_DIR/BrickVerse Creator.desktop"
    chmod +x "$DESKTOP_DIR/BrickVerse Creator.desktop"
fi

echo
echo "$APP_NAME was installed successfully."

read -r -p "Launch BrickVerse Creator now? [Y/n]: " answer
if [[ ! "$answer" =~ ^[Nn]$ ]]; then
    nohup "$INSTALL_DIR/$EXE_NAME" >/dev/null 2>&1 &
fi
