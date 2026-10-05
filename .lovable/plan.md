# Movie and show captions

## Goal
Add real, synchronized subtitles to the Movies player for films, shows, and anime, with controls that remain usable during fullscreen playback on phones and computers.

## What will change
- Add an authenticated caption lookup and relay to find subtitle tracks for the current title, season, and episode without exposing the viewer to another domain.
- Show available subtitle languages in the player, remember the viewer’s chosen language, and clearly handle titles with no matching tracks.
- Add caption appearance controls for text size, top or bottom placement, and background on or off; remember those choices.
- Render caption controls and captions inside BirchBlock’s player surface so they stay present in BirchBlock fullscreen on mobile and desktop.
- Keep provider-native captions as a fallback when a streaming source cannot report playback timing to BirchBlock.
- Verify movie, episode, anime, preference persistence, and fullscreen layouts, then check the current build and focused tests.

## Technical details
- Extend the existing authenticated Movies relay for caption discovery and subtitle-file delivery, with strict host and input validation.
- Parse common WebVTT/SRT caption formats in-browser and synchronize cues from player time messages where the selected source exposes them.
- Mark servers by caption/time capability and prioritize capable servers instead of pretending unsupported cross-origin players can be fully controlled.
- Use the existing design controls and semantic colors; no new account or paid caption key will be required unless research proves every suitable caption catalog requires one.
