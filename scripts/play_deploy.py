#!/usr/bin/env python3
"""Deploy an AAB to a Google Play track via the Play Developer API.

Setup (one-time, already done):
  - GCP project freeiptv-publisher-0630 (owner iptv.blanquer@gmail.com)
  - androidpublisher API enabled
  - service account play-publisher@freeiptv-publisher-0630.iam.gserviceaccount.com
  - JSON key at ~/.config/play-publisher/key.json (chmod 600)
  - service account granted "Deploy to test tracks" on Free IPTV in Play Console

Usage:
  play_deploy.py --check                       # validate API access, list tracks
  play_deploy.py --aab <file> [--track alpha] [--notes-fr "..."] [--rollout 1.0]

Run with the venv python:
  ~/.config/play-publisher/venv/bin/python scripts/play_deploy.py ...
"""

import argparse
import os
import sys

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

PACKAGE = "fr.blanquer.freeiptv"
KEY_FILE = os.path.expanduser("~/.config/play-publisher/key.json")
SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]


def service():
    creds = service_account.Credentials.from_service_account_file(KEY_FILE, scopes=SCOPES)
    return build("androidpublisher", "v3", credentials=creds, cache_discovery=False)


def check():
    svc = service()
    edit = svc.edits().insert(packageName=PACKAGE, body={}).execute()
    edit_id = edit["id"]
    tracks = svc.edits().tracks().list(packageName=PACKAGE, editId=edit_id).execute()
    print("API access OK. Tracks:")
    for t in tracks.get("tracks", []):
        releases = t.get("releases", [])
        versions = [v for r in releases for v in r.get("versionCodes", [])]
        print(f"  - {t['track']}: releases={len(releases)} versionCodes={versions}")
    svc.edits().delete(packageName=PACKAGE, editId=edit_id).execute()


def deploy(aab, track, notes_fr, rollout):
    svc = service()
    edit_id = svc.edits().insert(packageName=PACKAGE, body={}).execute()["id"]

    media = MediaFileUpload(aab, mimetype="application/octet-stream", resumable=True)
    bundle = svc.edits().bundles().upload(
        packageName=PACKAGE, editId=edit_id, media_body=media
    ).execute()
    version_code = bundle["versionCode"]
    print(f"Uploaded versionCode={version_code}")

    release = {
        "name": f"{version_code}",
        "versionCodes": [str(version_code)],
        "status": "completed",
    }
    if rollout is not None and rollout < 1.0:
        release["status"] = "inProgress"
        release["userFraction"] = rollout
    if notes_fr:
        release["releaseNotes"] = [{"language": "fr-FR", "text": notes_fr}]

    svc.edits().tracks().update(
        packageName=PACKAGE, editId=edit_id, track=track,
        body={"track": track, "releases": [release]},
    ).execute()
    print(f"Assigned versionCode={version_code} to track '{track}'")

    svc.edits().commit(packageName=PACKAGE, editId=edit_id).execute()
    print(f"Committed. {version_code} is now live on '{track}' (pending Google review).")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--check", action="store_true")
    p.add_argument("--aab")
    p.add_argument("--track", default="alpha")
    p.add_argument("--notes-fr", default="")
    p.add_argument("--rollout", type=float, default=1.0)
    a = p.parse_args()

    if a.check:
        check()
        return
    if not a.aab:
        print("error: --aab required (or use --check)", file=sys.stderr)
        sys.exit(2)
    if not os.path.isfile(a.aab):
        print(f"error: AAB not found: {a.aab}", file=sys.stderr)
        sys.exit(2)
    deploy(a.aab, a.track, a.notes_fr, a.rollout)


if __name__ == "__main__":
    main()
