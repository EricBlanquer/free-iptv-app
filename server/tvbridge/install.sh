#!/usr/bin/env bash
#
# Install / reinstall the Alexa -> Samsung TV bridge on the VM.
#   - "Alexa, allume la télé"  -> Wake-on-LAN burst      (wol.py)
#   - "Alexa, éteins la télé"  -> KEY_POWER via WebSocket (tvoff.py)
#   - exposed to Alexa as a WeMo plug via fauxmo (native discovery, no skill)
#
# Idempotent: safe to re-run. Run it ON the VM as the service user (needs sudo).
#   git clone <repo> && cd free-iptv-app/server/tvbridge && ./install.sh
#
set -euo pipefail

TV_IP="192.168.1.241"
DEVICE_NAME="Télé"
DEVICE_PORT=12340

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/tvbridge"
SERVICE="/etc/systemd/system/tvbridge.service"
RUN_USER="$(id -un)"

echo "==> Detecting LAN route toward the TV ($TV_IP)"
LAN_IFACE="$(ip route get "$TV_IP" | grep -oP 'dev \K\S+')"
LAN_IP="$(ip route get "$TV_IP" | grep -oP 'src \K\S+')"
if [ -z "$LAN_IFACE" ] || [ -z "$LAN_IP" ]; then
  echo "!! Could not detect the LAN interface/IP toward $TV_IP. Is the TV on the LAN?" >&2
  exit 1
fi
echo "    interface=$LAN_IFACE  ip=$LAN_IP"

echo "==> Deploying scripts to $DEST"
mkdir -p "$DEST"
cp "$SRC/wol.py" "$SRC/tvoff.py" "$DEST/"

echo "==> Python venv + dependencies"
if [ ! -x "$DEST/venv/bin/python" ]; then
  python3 -m venv "$DEST/venv"
fi
"$DEST/venv/bin/pip" install --quiet --upgrade pip
"$DEST/venv/bin/pip" install --quiet -r "$SRC/requirements.txt"

echo "==> Generating fauxmo.json"
cat > "$DEST/fauxmo.json" <<JSON
{
  "FAUXMO": {
    "ip_address": "$LAN_IP"
  },
  "PLUGINS": {
    "CommandLinePlugin": {
      "DEVICES": [
        {
          "name": "$DEVICE_NAME",
          "port": $DEVICE_PORT,
          "on_cmd": "$DEST/venv/bin/python $DEST/wol.py",
          "off_cmd": "$DEST/venv/bin/python $DEST/tvoff.py",
          "use_fake_state": true,
          "initial_state": "off"
        }
      ]
    }
  }
}
JSON

echo "==> Installing systemd service ($SERVICE)"
# ExecStartPre (root via '+') forces SSDP multicast onto the LAN, otherwise the
# VPN default route swallows Alexa discovery.
sudo tee "$SERVICE" >/dev/null <<UNIT
[Unit]
Description=Fauxmo TV bridge (Alexa -> Wake-on-LAN on / KEY_POWER off)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$DEST
ExecStartPre=+/usr/bin/ip route replace 224.0.0.0/4 dev $LAN_IFACE
ExecStart=$DEST/venv/bin/fauxmo -c $DEST/fauxmo.json
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable tvbridge.service >/dev/null 2>&1 || true
sudo systemctl restart tvbridge.service
sleep 2

echo "==> Service status: $(systemctl is-active tvbridge.service)"

if [ ! -s "$DEST/tv_token.txt" ]; then
  echo
  echo "!! No TV pairing token ($DEST/tv_token.txt)."
  echo "   Option A (no popup): restore your saved token:"
  echo "       echo <TOKEN> > $DEST/tv_token.txt"
  echo "   Option B: say 'Alexa, éteins la télé' once and ACCEPT the popup on the TV."
fi

echo
echo "Done. In Alexa: say 'Alexa, découvre mes appareils' (device: $DEVICE_NAME)."
