# Irritation 🎲

A 3D online marble race for 2–6 players. Roll, race your four marbles around the board, and bump your friends back to base. It plays by the classic marble-race rules (1 or 6 to get out, 6 rolls again, shortcut pads, a center hole you leave with a 1), plus the family house rule:

**🚀 Jump Start** — a new marble comes out **2 spaces ahead** of the classic start, on the corner of your lane, so it heads straight up toward the middle. Roll a 6 to get out, roll a 5 next, and you're on a shortcut pad. It's on by default; the host can switch it off in the lobby.

## Run it on your computer

```
npm install
npm start
```

Then open http://localhost:3000. Share the room code or the invite link.

## Put it online (GitHub + Render, same as the other games)

1. Make a **new** GitHub repo and upload everything in this folder. Keep the `public` folder as a folder (with `vendor` inside it).
2. On Render: **New → Web Service** → pick the repo.
3. Build command: `npm install` · Start command: `npm start` · Instance type: Free.
4. Open the Render link, tap **Create a Room**, and send the invite link.

> Free Render services go to sleep when nobody is playing. The first visit after that takes about 50 seconds to wake up.

## What's in the game

- **3D board** you can spin (drag), zoom (pinch or scroll) and flip to a flat top-down view (🎥)
- **Custom dice** for every player: dice color, dot color, 14 prints (camo, cheetah, zebra, tiger, cow, flames, galaxy, tie-dye…), and your own **SVG / PNG / JPG decal**
- Rolling dice, hopping marbles, and big pop-ups: IRRITATED!, REVENGE!, SHORTCUT!, HOME SAFE!
- Seats around the table with photos or emoji, a glowing ring on whoever's turn it is, and a big **YOUR TURN!** alert with a chime, phone buzz and flashing tab
- Chat with speech bubbles over players, quick taunts, and emoji reactions
- Chill music and sound effects made in the browser (🎵 and ⚙️)
- Room codes and invite links, bots to fill seats, **Practice vs Bots**, and **Pass & Play** on one device
- Refresh or lose Wi-Fi and you drop right back into your seat; a bot covers for anyone who disconnects
- End-of-game awards: Biggest Bully, Punching Bag, Lucky Roller, Shortcut Champ, Sweet Revenge
- Host settings: Jump Start on/off and an optional turn timer

## Files

| File | What it does |
| --- | --- |
| `server.js` | Online rooms (Express + Socket.io) |
| `public/core.js` | All the rules, the bots and the turn flow (shared by the server and the browser) |
| `public/board3d.js` | The 3D board, marbles, dice and animations |
| `public/dice.js` | Dice prints, colors and decals |
| `public/client.js` | Screens, buttons, chat, pop-ups |
| `public/audio.js` | Music and sound effects |
| `public/vendor/three.min.js` | The 3D library (Three.js, MIT license) |

## Checking the rules

```
node test/rules.test.js   # rule checks (Jump Start, shortcuts, home, bumping)
node test/sim.js          # bot-only games
```

Irritation has its own name and artwork; the gameplay follows the traditional marble race rules.
