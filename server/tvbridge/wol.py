#!/usr/bin/env python3
"""Send a burst of Wake-on-LAN magic packets to the Samsung TV.

The LAN source IP and broadcast address are auto-detected from the route to the
TV, so the magic packets are always emitted on the LAN interface and never leak
onto a VPN default route.
"""
import socket
import sys
import time

TV_MAC = "d4:9d:c0:5d:d9:c9"
TV_IP = "192.168.1.241"
BURST_COUNT = 10
BURST_INTERVAL_SEC = 0.25


def detect_lan(target_ip):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((target_ip, 9))
        lan_ip = s.getsockname()[0]
    finally:
        s.close()
    broadcast = ".".join(lan_ip.split(".")[:3] + ["255"])
    return lan_ip, broadcast


def send_magic_packet(mac, lan_ip, broadcast):
    mac_bytes = bytes.fromhex(mac.replace(":", "").replace("-", ""))
    packet = b"\xff" * 6 + mac_bytes * 16
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.bind((lan_ip, 0))
        for i in range(BURST_COUNT):
            for port in (9, 7):
                s.sendto(packet, (broadcast, port))
            if i < BURST_COUNT - 1:
                time.sleep(BURST_INTERVAL_SEC)
    print(f"WoL burst ({BURST_COUNT}x) sent to {mac} via {broadcast} (bound {lan_ip})", flush=True)


if __name__ == "__main__":
    detected_ip, detected_broadcast = detect_lan(TV_IP)
    send_magic_packet(TV_MAC, detected_ip, detected_broadcast)
    sys.exit(0)
