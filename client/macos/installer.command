#!/bin/bash

APP="BrickVerse.app"
DEST="/Applications/$APP"

echo "Installing BrickVerse..."

rm -rf "$DEST"

cp -R "$APP" "/Applications/"

echo "Installed to /Applications"

read -p "Launch now? (y/n): " ans

if [[ "$ans" == "y" ]]; then
    open "$DEST"
fi