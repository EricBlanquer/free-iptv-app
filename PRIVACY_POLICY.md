# Privacy Policy

**Last updated: April 8, 2026**

## Introduction

Free IPTV ("the App") is a media player application for Samsung Smart TVs and Android TV. This Privacy Policy explains how we handle your information and complies with the EU General Data Protection Regulation (GDPR).

## Data Collection

The App is designed to minimize data collection. The only data transmitted to servers we operate is related to the trial / licensing system:

- **Device identifier**: a randomly-generated ID unique to your installation. It does not contain any account, name, email, or hardware serial number.
- **Install date**: the date the App was first launched, used to compute the trial period.
- **License code** (if any): the code you entered to unlock the App.
- **IP address**: automatically logged when your device contacts the licensing server, used for fraud prevention and approximate geolocation.
- **Approximate location and ISP**: derived from the IP address (city / region / country / Internet provider) using the third-party service ip-api.com. No GPS or precise location data is collected.
- **Last seen timestamp**: the date of the last contact with the licensing server.

**Legal basis (GDPR Art. 6):** legitimate interest in preventing license fraud and operating the trial system. No advertising, no profiling, no resale of data to any third party.

**Retention:** unlicensed devices that have not contacted the server for 12 months are automatically deleted. Licensed devices are retained for the duration of the license.

**Your rights (GDPR Art. 15-22):** you can request access, correction or deletion of your data, or object to its processing, by emailing eric.blanquer@gmail.com with your device ID. Deletion requests are honored within 30 days.

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
