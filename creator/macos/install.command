#!/bin/bash
set -euo pipefail

APP_NAME="BrickVerse Creator"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESTINATION="/Applications/${APP_NAME}.app"

SOURCE_APP=""
for candidate in \
    "${APP_NAME}.app" \
    "BrickVerseCreator.app" \
    "Creator.app"; do
    if [[ -d "$SCRIPT_DIR/$candidate" ]]; then
        SOURCE_APP="$SCRIPT_DIR/$candidate"
        break
    fi
done

if [[ -z "$SOURCE_APP" ]]; then
    echo "ERROR: BrickVerse Creator.app was not found beside this installer."
    echo "Place install.command beside the exported macOS .app bundle."
    read -r -p "Press Return to close..."
    exit 1
fi

echo "Installing $APP_NAME..."

osascript -e 'do shell script "rm -rf " & quoted form of "/Applications/BrickVerse Creator.app" & " && cp -R " & quoted form of "'"$SOURCE_APP"'" & " " & quoted form of "/Applications/BrickVerse Creator.app" with administrator privileges'

# Remove quarantine from locally distributed development builds when possible.
xattr -dr com.apple.quarantine "$DESTINATION" 2>/dev/null || true

DESKTOP_PATH="$HOME/Desktop/${APP_NAME}.app"
rm -f "$DESKTOP_PATH" 2>/dev/null || true
ln -s "$DESTINATION" "$DESKTOP_PATH" 2>/dev/null || true

echo
echo "$APP_NAME was installed to /Applications."
read -r -p "Launch BrickVerse Creator now? [Y/n]: " answer
if [[ ! "$answer" =~ ^[Nn]$ ]]; then
    open "$DESTINATION"
fi
