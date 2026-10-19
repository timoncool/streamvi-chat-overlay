<div align="center">

<img src="assets/icon.png" width="80" alt="StreamVi Chat Overlay"/>

# StreamVi Chat Overlay

**A transparent, click-through chat window for StreamVi widgets on Windows. Chat sits on top of any game, the mouse goes straight to the game, and nothing else changes.**

[![License](https://img.shields.io/github/license/timoncool/streamvi-chat-overlay?style=flat-square)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-44-47848F?style=flat-square)

**English** · [Русский](README.ru.md)

<img src="docs/preview.png" width="420" alt="StreamVi chat overlay preview"/>

</div>

> **Unofficial project.** This is a personal tool, not affiliated with, endorsed by, or sponsored by StreamVi. It does not bundle any StreamVi code, logo or accounts — it simply opens the chat widget URL that you configure yourself. StreamVi and its trademarks belong to their respective owners.

## What it is

StreamVi gives you a chat widget for OBS and a dock panel for reading chat. Neither is comfortable when the game is fullscreen: the dock takes screen space, and OBS is in the way.

This app puts **the same widget that goes on air** into a frameless, transparent, always-on-top window. When the overlay is locked, Windows routes every mouse click through it into the game; when it is unlocked, you can move it, resize it and change settings. Think of it as [Transparent Twitch Chat Overlay](https://github.com/baffler/Transparent-Twitch-Chat-Overlay), but for a StreamVi widget and without a browser dock.

## Features

- **Any StreamVi widget URL** — the on-air `mode=widget` variant (no input box, transparent background) or any other preset.
- **Real click-through** — the overlay never takes focus and never eats a click while locked.
- **Move and resize** — a drag bar and a corner grip in edit mode; the window remembers its position and size.
- **Hotkeys that work from the game** — lock, hide, reload, zoom, demo, clear chat.
- **Old messages auto-cleanup** — messages disappear after N minutes (Settings → «Очистка старых сообщений»), plus `Ctrl+Alt+C` to clear the chat now.
- **Display settings** — time, platform icons, nicknames, message theme, alignment, animation, spacing.
- **Colors** — text, nickname, per-message plate (with alpha) and chat background (with alpha).
- **Scale** — 80–250 %, from the hotkeys, the edit bar or the settings window.
- **Custom notification sound** — pick any local audio file, or use the widget's built-in sound.
- **Viewer counter** — a second overlay with the StreamVi viewer-count widget, with its own URL, position and size.
- **Excluded from OBS** — `WDA_EXCLUDEFROMCAPTURE` keeps the overlay out of display capture by default.
- **Demo mode** — a built-in chat simulator with real platform icons and long messages, so you can tune the look without going live.
- **Portable config** — everything lives in `config.json` next to the app; no telemetry, no cloud.

## Hotkeys

| Action | Keys |
|---|---|
| Lock / unlock (clicks go to the game) | `Ctrl+Alt+L` |
| Show / hide | `Ctrl+Alt+H` |
| Reload chat | `Ctrl+Alt+R` |
| Clear chat now | `Ctrl+Alt+C` |
| Reset position and size | `Ctrl+Alt+0` |
| Zoom in / out | `Ctrl+Alt+=` / `Ctrl+Alt+-` |
| Demo chat (simulation) | `Ctrl+Alt+D` |
| Viewer counter | `Ctrl+Alt+V` |
| Settings | `Ctrl+Alt+S` |

## Install

**Download the installer** from [Releases](https://github.com/timoncool/streamvi-chat-overlay/releases/latest) — `StreamVi Chat Overlay Setup x.y.z.exe`, or the portable single `.exe`. No Node.js needed.

From source (Windows 10/11, [Node.js](https://nodejs.org/) 20+):

```bash
git clone https://github.com/timoncool/streamvi-chat-overlay.git
cd streamvi-chat-overlay
npm install
```

Start with `start.cmd` (or `start.vbs` for no console window). On first run the settings window opens — paste your StreamVi chat URL into **«Ссылка на чат StreamVi»** and press Save.

Build a portable folder with:

```bash
npm run pack
```

The result is `dist/StreamViOverlay-win32-x64/`.

## How to use in a game

1. Set the game to **Borderless / Windowed**. Exclusive fullscreen cannot show overlays — that is a Windows limitation, not the app's.
2. `Ctrl+Alt+L` unlocks the overlay: a purple bar appears with **Настройки**, **Закрепить**, **Демо**, **A-**, **A+**. Drag the bar to move, drag the bottom-right corner to resize.
3. `Ctrl+Alt+L` again locks it: the bar disappears, the mouse goes to the game, the chat stays on top.
4. `Ctrl+Alt+D` switches to the demo chat; press it again to return to the real widget.

## OBS

The overlay is hidden from screen capture by default (`Настройки → Не показывать оверлей в захвате экрана`). That covers OBS Display Capture, Discord and screen recorders. With **Game Capture** the overlay is not captured either way. Turn the option off if you want viewers to see the chat window itself.

## Notes

- The chat URL contains your personal StreamVi token. It is stored only in `config.json` on your machine and is never sent anywhere by this app.
- `config.json` is created next to `package.json` in dev, and in `%APPDATA%\streamvi-chat-overlay\` for the installed build. It is git-ignored.
- If the widget is offline, StreamVi shows its placeholder ("Чтобы чат заработал, запусти трансляцию…"). That is the widget's own state, not an overlay bug.
- HDR may make transparent windows look washed out; disable HDR for the game if the overlay looks wrong.

## License

MIT — see [LICENSE](LICENSE).
