#!/usr/bin/env python3
"""Turn the Samsung TV off via its WebSocket remote API (KEY_POWER).

The pairing token is stored next to this script in tv_token.txt. On first run
the TV shows an "Allow this device?" popup that must be accepted within the
timeout; the token is then saved and reused silently afterwards.
"""
import os
import sys

from samsungtvws import SamsungTVWS

TV_HOST = "192.168.1.241"
TV_PORT = 8002
TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tv_token.txt")
CLIENT_NAME = "AlexaBridge"


def power_off():
    tv = SamsungTVWS(
        host=TV_HOST,
        port=TV_PORT,
        token_file=TOKEN_FILE,
        name=CLIENT_NAME,
        timeout=30,
    )
    tv.send_key("KEY_POWER")
    print("KEY_POWER sent", flush=True)


if __name__ == "__main__":
    try:
        power_off()
    except Exception as ex:
        print(f"tvoff error: {ex}", file=sys.stderr, flush=True)
        sys.exit(1)
