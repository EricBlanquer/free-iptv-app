# Stream Proxy Server

IPTV stream proxy with TTS (Text-to-Speech) and Freebox download support.

## Requirements

- Python 3.10+
- Linux server (tested on Debian 12)

## Installation

### 1. Install Python dependencies

```bash
pip3 install edge-tts websocket-client aiohttp
```

### 2. Deploy the proxy script

```bash
cp stream-proxy.py /home/youruser/stream-proxy.py
```

### 3. Configure the systemd service

Create `/etc/systemd/system/stream-proxy.service`:

```ini
[Unit]
Description=IPTV Stream Proxy
After=network.target

[Service]
ExecStart=/usr/bin/python3 -u /home/youruser/stream-proxy.py
Restart=always
User=youruser
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable stream-proxy
sudo systemctl start stream-proxy
```

### 4. Verify

```bash
# Check service status
systemctl status stream-proxy

# Test the API
curl http://localhost:8889/status

# View logs
journalctl -u stream-proxy -f
```

The proxy listens on port **8889**.

## Optional: Azure Speech Services (TTS)

By default, TTS uses Microsoft Edge-TTS (free, no key required). For higher quality voices, configure Azure Speech Services:

Create `~/.azure_speech`:

```json
{
  "key": "your-azure-speech-key",
  "region": "francecentral"
}
```

Get a key at: https://portal.azure.com > Speech Services

## Optional: Freebox Downloads

For downloading VOD content to a Freebox NAS via WebSocket upload:

### Freebox API pairing

The app handles pairing automatically on first download. The Freebox app token is sent by the TV with each download request.

### DNS resolution (important for VPN setups)

If the server uses a VPN, `mafreebox.freebox.fr` may resolve to the public IP instead of the local Freebox. Fix by adding to `/etc/hosts`:

```
192.168.1.254 mafreebox.freebox.fr
```

Replace `192.168.1.254` with your Freebox's local IP.

### Download destination

Files are uploaded to `/USB4/Telechargerments/` on the Freebox. Change the path in `stream-proxy.py` in the `_freebox_ws_upload` function if needed.

## Configuration in the app

In the TV app settings, set:

- **Proxy URL**: `http://<server-ip>:8889`
- **Stream proxy**: Enable to route streams through the proxy
- **TTS**: Works automatically when proxy is configured

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Server status (uptime, threads, CPU, downloads) |
| `/?url=...` | GET | Proxy a stream URL |
| `/?url=...&transcode=mp4` | GET | Transcode live stream to MP4 |
| `/tts?text=...&lang=fr` | GET | Generate TTS audio |
| `/voices?lang=fr` | GET | List available TTS voices |
| `/download?url=...&filename=...` | GET | Start a VM download + Freebox upload |
| `/downloads` | GET | List active downloads |
| `/download/cancel?id=...` | GET | Cancel a download |

## Troubleshooting

### High CPU / CLOSE-WAIT connections

The proxy includes socket timeouts (300s) and `close_connection = True` to prevent connection leaks. If CPU is still high:

```bash
# Check connections
ss -tnp | grep python3 | awk '{print $1}' | sort | uniq -c

# Restart
sudo systemctl restart stream-proxy
```

### Downloads not uploading to Freebox

1. Check Freebox is reachable: `curl -s http://mafreebox.freebox.fr/api/v4/login/`
2. If empty reply or timeout, add the `/etc/hosts` entry (see above)
3. Check logs: `journalctl -u stream-proxy | grep -i 'freebox\|upload\|error'`

### TTS not working

1. Check edge-tts is installed: `pip3 show edge-tts`
2. Test manually: `edge-tts --text "hello" --write-media /tmp/test.mp3`
3. Check logs: `journalctl -u stream-proxy | grep -i tts`
