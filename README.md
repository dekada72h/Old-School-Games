# Old School Games

A retro-arcade revival in your browser. Hand-built remakes of the
classics — no install, no ads, no trackers.

**Live site:** https://dekada72h.github.io/Old-School-Games/

## What's in here

| Game           | Status   | Inspired by      | Path                |
| -------------- | -------- | ---------------- | ------------------- |
| Bomb Blitz     | Live     | Bomberman        | `/bomberman/`       |
| Slither        | Live     | Snake            | `/slither/`         |
| Block Drop     | Live     | Tetris           | `/block-drop/`      |
| Pellet Chase   | Live     | Pac-Man          | `/pellet-chase/`    |
| Star Defender  | Live     | Space Invaders   | `/star-defender/`   |
| Brick Smash    | Live     | Breakout/Arkanoid| `/brick-smash/`     |
| Volley         | Live     | Pong             | `/volley/`          |
| Vector Storm   | Live     | Asteroids        | `/vector-storm/`    |
| Lane Hopper    | Live     | Frogger          | `/lane-hopper/`     |
| Sky Shield     | Live     | Missile Command  | `/sky-shield/`      |
| Cube Hop       | Live     | Q*bert           | `/cube-hop/`        |
| Bug Crawl      | Live     | Centipede        | `/bug-crawl/`       |
| Wing Squad     | Live     | Galaga           | `/wing-squad/`      |
| Barrel Up      | Live     | Donkey Kong      | `/barrel-up/`       |
| Pipe Jumper    | Live     | Super Mario Bros.| `/pipe-jumper/`     |
| Code Strike    | Live     | Contra           | `/code-strike/`     |

Each game is fully self-contained — pure HTML5 canvas and vanilla JS.
No build step, no framework, no megabytes.

## Stack

* **HTML5 + Tailwind CSS** (CDN, no build) for the landing page
* **Inter / Press Start 2P / Orbitron** from Google Fonts
* **Vanilla JavaScript** — star field, 3D card tilt, Konami code,
  Web Audio blips, all written by hand

The whole site is static and deploys directly to GitHub Pages.

## Local preview

```bash
# from this directory
python3 -m http.server 8000
# open http://localhost:8000/
```

(`file://` works too, but some browsers throttle audio / localStorage
on it — a tiny static server is friendlier.)

## Adding a new game

1. Create a folder at the repo root, e.g. `tetris/`.
2. Drop `index.html` + assets in there. Keep it self-contained.
3. Add the game card to `index.html` (`#arcade` section) and flip the
   badge from `SOON` to `LIVE`.

That's it — GitHub Pages picks up the new folder on push.

## Suggesting a game

Open an [issue](https://github.com/dekada72h/Old-School-Games/issues/new)
with the name and a link to a reference. PRs welcome.

## License

MIT. Fork it, mod it, host your own arcade.
