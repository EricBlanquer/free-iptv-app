# Free IPTV - App UI Description

## Overview

Free IPTV is a media player application for Samsung Smart TVs that allows users to stream their personal IPTV content using M3U playlists or server provider credentials.

**Important**: This application does not provide any content. Users must configure their own IPTV sources.

---

## Test Credentials

To test the application, you will need either:
- A valid M3U playlist URL, OR
- Server provider credentials (host URL, username, password)

**Note**: Test credentials should be provided separately in the Seller Office submission.

---

## Navigation

The application is fully controlled using the Samsung TV remote:

| Button | Action |
|--------|--------|
| Arrow keys | Navigate between items |
| Enter/OK | Select item / Confirm action |
| Back | Go back / Exit menu |
| Play/Pause | Toggle playback |
| Rewind/Forward | Seek in video |
| Color buttons | Quick actions (when displayed) |

---

## Screens and Features

### 1. Home Screen

The main menu displays available sections:
- **Live TV** - Live television channels
- **VOD** - Movies and videos on demand
- **Series** - TV series with seasons and episodes
- **Settings** - Application configuration

Custom sections may appear based on playlist content (Sports, Entertainment, etc.).

### 2. Browse Screen (Live TV / VOD / Series)

- **Left sidebar**: Category list with item counts
- **Right area**: Content grid or list
- **Top bar**: View mode toggle (grid/list), sort and filter options

**Features**:
- "Continue" category: Resume partially watched content
- "Favorites" category: Quick access to bookmarked items
- Search: Filter by title or year
- Sort: Alphabetical, by rating, or by date
- Filters: Hide SD content, hide hearing impaired tracks

### 3. Details Screen (VOD / Series)

Displays content information:
- Title, year, duration
- Poster image and backdrop
- Synopsis/description
- Rating (if available via TMDB)
- Cast information with actor filmography
- For series: Season/episode selector

**Actions**:
- Play button: Start playback
- Favorite button: Add/remove from favorites

### 4. Player Screen

Full-screen video playback with overlay controls:

**Visible when overlay is shown** (press any key):
- Progress bar with current time / total duration
- Playback state indicator
- Audio track selector
- Subtitle selector
- Player type indicator (AVPlay/HTML5)

**Controls**:
- Play/Pause: Toggle playback
- Left/Right arrows: Seek backward/forward
- Up/Down arrows: Change audio track
- Enter: Show/hide overlay

### 5. Settings Screen

Configuration options organized in sections:

**Playlists**:
- Add/edit/remove playlist sources
- Support for M3U URLs and server providers

**Display**:
- Interface language (11 languages available)
- Default view mode (grid/list)
- Hide SD content option
- Hide hearing impaired option

**Playback**:
- Preferred player (AVPlay/HTML5)
- Dialogue boost (audio enhancement)
- Minimum progress time for "Continue" feature
- Watch history limit

**API Keys** (optional):
- TMDB API key for metadata
- OpenSubtitles credentials for external subtitles
- SubDL API key for alternative subtitles

**Remote Configuration**:
- QR code for configuring playlists from phone/computer
- Import/export configuration via code

**About**:
- Version information
- Privacy policy link
- Clear data options

---

## User Flows

### Flow 1: First-time Setup

1. User launches app
2. Home screen shows "Settings" option
3. User navigates to Settings > Manage Playlists
4. User adds a playlist (M3U URL or server credentials)
5. App loads playlist content
6. User returns to Home and can access Live TV, VOD, Series

### Flow 2: Watch a Movie

1. User selects "VOD" from Home
2. User browses categories or uses search
3. User selects a movie
4. Details screen shows movie information
5. User presses Play
6. Movie plays in full-screen

### Flow 3: Continue Watching

1. User starts watching a movie, stops partway
2. Progress is automatically saved
3. User returns later, opens "VOD"
4. "Continue" category shows the movie with progress bar
5. User selects to resume from saved position

### Flow 4: Series Navigation

1. User selects "Series" from Home
2. User selects a TV series
3. Details screen shows series info with season selector
4. User selects a season, then an episode
5. Episode plays, progress is tracked
6. On completion, next episode indicator appears

---

## Error Handling

- Network errors: Displayed with error message and retry option
- Stream unavailable: Error message with stream details
- Invalid playlist: Error message prompting user to check configuration
- No content: Empty state message with suggestion to add playlist

---

## Accessibility

- Full remote control navigation (no touch required)
- High contrast text and icons
- Configurable interface language
- Option to hide hearing impaired audio tracks
- Clear visual feedback for focused elements

---

## Technical Requirements

- Samsung Tizen TV (version 5.0 or higher)
- Internet connection
- Valid IPTV source (M3U playlist or server provider credentials)

---

## Contact

Developer: Eric Blanquer
Email: eric.blanquer@gmail.com
