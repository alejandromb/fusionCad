#!/usr/bin/env bash
# Install a launchd job that runs the fusionCad DB backup script every hour.
# macOS only. For Linux, use cron instead.
#
# Usage:
#   ./scripts/install-backup-cron.sh         # install
#   ./scripts/install-backup-cron.sh remove  # uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_SCRIPT="$PROJECT_ROOT/scripts/backup-db.sh"
LAUNCH_AGENT_DIR="$HOME/Library/LaunchAgents"
PLIST_NAME="com.fusionlogik.fusioncad.dbbackup"
PLIST_PATH="$LAUNCH_AGENT_DIR/${PLIST_NAME}.plist"

if [ "${1:-}" = "remove" ]; then
  echo "Removing fusionCad backup launchd job..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "Removed."
  exit 0
fi

mkdir -p "$LAUNCH_AGENT_DIR"

# Generate the plist
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${BACKUP_SCRIPT}</string>
    </array>

    <key>StartInterval</key>
    <integer>3600</integer>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${PROJECT_ROOT}/backups/backup-cron.log</string>

    <key>StandardErrorPath</key>
    <string>${PROJECT_ROOT}/backups/backup-cron.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
EOF

# Load the agent
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "Installed fusionCad backup job."
echo "  Plist:   $PLIST_PATH"
echo "  Schedule: every 60 minutes (also runs immediately)"
echo "  Logs:    $PROJECT_ROOT/backups/backup-cron.log"
echo ""
echo "To check status:    launchctl list | grep $PLIST_NAME"
echo "To uninstall:       ./scripts/install-backup-cron.sh remove"
