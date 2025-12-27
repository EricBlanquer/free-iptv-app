# Privacy Policy

**Last updated: December 25, 2024**

## Introduction

Free IPTV ("the App") is a media player application for Samsung Smart TVs. This Privacy Policy explains how we handle your information.

## Data Collection

**We do not collect any personal data.**

The App operates entirely on your device and does not transmit any user data to external servers owned or operated by us.

## Data Stored Locally

The App stores the following data locally on your TV:

- **Playlist configurations**: Server URLs, usernames, and passwords you enter to access your IPTV services
- **Watch history**: Tracks which content you have watched for the "Continue Watching" feature
- **Playback progress**: Remembers where you left off in videos
- **Favorites**: Content you mark as favorite
- **Settings**: Your language preference, subtitle settings, and other app preferences

All this data is stored locally using the TV's localStorage and is never transmitted to us.

## Third-Party Services

The App may connect to the following third-party services based on your configuration:

- **Your IPTV provider**: The App connects to playlist servers you configure. We have no control over these services.
- **TMDB (The Movie Database)**: If you provide a TMDB API key, the App fetches movie/TV show metadata.
- **OpenSubtitles / SubDL**: If configured, the App fetches subtitles from these services.

Please review the privacy policies of these third-party services.

## Security Notice

When connecting to IPTV server providers, your credentials (username and password) are transmitted as part of the stream URLs. This is a standard requirement of these protocols and cannot be avoided. These URLs may be visible in server logs or network traffic.

## Remote Configuration Feature

The App offers an optional remote configuration feature using Cloudflare Workers:
- Configuration data is temporarily stored (5 minutes maximum) to facilitate transfer from a web browser to your TV
- Data is automatically deleted after retrieval or expiration
- No logs are kept

## Content Disclaimer

**This App does not provide any content.** Users are solely responsible for the legality of the content sources they configure. The developer assumes no responsibility for how users utilize this application.

## Children's Privacy

This App does not knowingly collect information from children under 13.

## Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be posted at:
https://github.com/ericblanquer/free-iptv-app/blob/master/PRIVACY_POLICY.md

## Contact

For questions about this Privacy Policy, contact:
- Email: eric.blanquer@gmail.com
- GitHub: https://github.com/ericblanquer/free-iptv-app
