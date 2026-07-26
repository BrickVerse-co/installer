#!/bin/bash

set -e

INSTALL_DIR="/opt/BrickVerse"

echo "Installing BrickVerse..."

sudo mkdir -p "$INSTALL_DIR"

sudo cp -r ./* "$INSTALL_DIR"

sudo chmod +x "$INSTALL_DIR/linux.x86_64"

mkdir -p ~/.local/share/applications

cat > ~/.local/share/applications/brickverse.desktop <<EOF
[Desktop Entry]
Type=Application
Name=BrickVerse
Exec=$INSTALL_DIR/linux.x86_64
Path=$INSTALL_DIR
Icon=$INSTALL_DIR/icon.png
Terminal=false
Categories=Game;
EOF

chmod +x ~/.local/share/applications/brickverse.desktop

cp ~/.local/share/applications/brickverse.desktop ~/Desktop/ 2>/dev/null || true

chmod +x ~/Desktop/brickverse.desktop 2>/dev/null || true

echo
echo "BrickVerse installed."