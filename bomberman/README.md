# Bomb Blitz

A modern, browser-based remake of the classic 80s Bomberman. Pure HTML5
canvas + vanilla JavaScript. No build step, no dependencies, no install.

Plays on **PC** (keyboard) and **mobile/tablet** (on-screen D-pad +
buttons).

## Play it

Just open `index.html` in any modern browser. That's it.

```bash
# from anywhere
xdg-open ./index.html      # linux
open ./index.html          # macOS
start index.html           # windows
```

If you'd rather serve it (some browsers restrict `localStorage` on the
`file://` protocol), any static server works:

```bash
python3 -m http.server 8000
# then go to http://localhost:8000/
```

## Controls

| Action            | Keyboard                | Touch          |
| ----------------- | ----------------------- | -------------- |
| Move              | `WASD` / arrow keys     | D-pad          |
| Place bomb        | `Space`                 | BOMB button    |
| Remote-detonate*  | `Shift`                 | DET. button    |
| Pause             | `P`                     | II button      |
| Mute              | `M`                     | (toggle in UI) |
| Restart stage     | `R`                     | -              |

*Only when you've collected the Remote power-up.*

## Power-ups

Classic four (the originals you remember):

* **Fire Up (F)** &mdash; bigger / longer-reaching explosions
* **Bomb Up (B)** &mdash; carry one more bomb at a time
* **Speed Up (S)** &mdash; move faster
* **Wall Pass (G)** &mdash; phase through bricks for 5 seconds

New ones to keep things fresh:

* **Shield (D)** &mdash; absorbs one hit
* **Kick (K)** &mdash; push bombs across the floor
* **Remote (R)** &mdash; detonate your bombs manually with `Shift`
* **Time Warp (T)** &mdash; slows monsters for 6 seconds
* **Mega Bomb (M)** &mdash; explosions also fire diagonally
* **Extra Life (+)** &mdash; one more chance

## Monsters

| Type    | Behaviour                                | Score |
| ------- | ---------------------------------------- | ----: |
| Walker  | Slow, drifts at random                   |   100 |
| Liner   | Walks straight lines, then turns         |   200 |
| Runner  | Fast, restless                           |   400 |
| Chaser  | Hunts you on sight                       |   800 |
| Phaser  | **Walks through bricks**                 |  2000 |
| Smart   | Pathfinds through corridors              |  4000 |
| Boss    | Big, takes 3-7 hits, summons minions     |  5000+ |

Score values follow the classic arcade ladder.

## Stages (100 of them)

* **Regular** stages: kill every monster, find the **exit door** hidden
  under a brick, then walk onto it to clear the stage.
* **Bonus** stages (every 3rd): 30 seconds, open arena, no power-ups,
  bomb as many monsters as you can. Kills are worth double.
* **Boss** stages (every 5th): a big enemy that takes multiple hits and
  spawns minions. Five distinct boss types cycle through (Brute,
  Swarm Mother, Phantom, Titan, Overlord).
* From **stage 50** onward, **reinforced bricks** start showing up &mdash;
  they take two hits to break.
* Each stage adds at least one more monster than the previous, until
  the map cap of 20 enemies. Enemy speeds also scale up to 1.6x.
* **Bombing the door or an exposed power-up spawns extra monsters** as
  a penalty &mdash; the same rule from the original.

## Scoring & lives

* Combo multiplier on consecutive kills (chain &gt;= 2 = x1.5,
  &gt;= 3 = x2, &gt;= 5 = x3).
* Stage-clear bonus: time remaining &times; 50, lives &times; 1000,
  and a 2000-point "no-death" bonus.
* **Extra life every 25,000 points.**
* Three high-score categories saved to your device:
  * Best **points**
  * Most **monsters killed** in a single run
  * Highest **stage** reached

## File layout

```
bomberman/
  index.html    # the page
  style.css     # all styles
  game.js       # the entire game engine (~1500 lines)
  README.md     # you are here
```

## Moving this to its own repo

The folder is fully self-contained. To publish it as its own project:

```bash
# from inside bomberman/
git init
git add .
git commit -m "Initial commit: Bomb Blitz"
git branch -M main
git remote add origin https://github.com/<your-user>/<repo>.git
git push -u origin main
```

Then in repo Settings → Pages, set the source to `main` / `(root)`
and you'll have a live URL within a minute.

## License

MIT. Have fun.
