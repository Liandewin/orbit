Upgrade the visual design and UI of my mobile arcade game **Orbit Snap**. Four screenshots of the current build are attached (375×812, iPhone-size portrait):

1. `1-title.jpg` is the title screen.
2. `2-gameplay.jpg` shows normal play, with the comet in flight.
3. `3-perfect-snap.jpg` is the moment of a "PERFECT" capture (full-screen colour flash, ring burst, floating text).
4. `4-game-over.jpg` is the game-over screen.

## The game
You play a glowing comet that is always either orbiting a planet or flying in a straight line between planets. There is one input: tap anywhere to let go of the orbit on the tangent. Fly into another planet's capture zone and the comet snaps into orbit around it. If the flight line passes right at the planet's orbit radius, you get a **PERFECT** snap: the combo multiplier goes up (x2 to x9), the screen shakes, there is a short freeze and a flash. A sloppy capture resets the combo. You die if you drift off-screen, get lost in space or touch a black hole, and one tap restarts instantly. The camera scrolls upward forever. A "Daily run" toggle switches to a fixed seed based on today's date.

The mood should be **neon arcade on near-black space**: fast, juicy and readable in a split second.

## What feels weak right now
- **Planets read as muddy blobs.** The large, faint, filled capture zones overlap each other and blur together, especially in the upper half of the screen.
- **The HUD fights the world.** The score sits on top of planets and glows, and the `x9` combo badge is small and gets lost.
- **Generic type.** Everything uses the system font, and the title has no real logo treatment.
- **The perfect-snap flash tints the whole screen green,** which looks washed out rather than punchy.
- **The game-over screen floats loosely over the playfield.** Text overlaps planets and the black hole, the hierarchy is flat ("DRIFTED AWAY", score, NEW BEST, stats), and "TAP TO RETRY" has no visual weight.
- **The Daily run toggle is a plain grey pill** that doesn't read as a toggle and doesn't belong to the neon style.
- **Black holes are hard to tell apart from planets** at a glance, which is dangerous because they kill you.

## What I need
Mockups at 375×812 for each of these:
1. **Title screen:** a logo treatment for "ORBIT SNAP", the best score, a "tap to start" prompt, a one-line how-to-play hint and the Daily run toggle (on and off states). The live game world keeps animating behind it.
2. **In-game HUD:** score, combo multiplier (x1–x9, getting more intense as it climbs), and a small "DAILY · YYYY-MM-DD" tag when in daily mode. It must stay out of the way of the playfield and work with an iPhone notch / safe area.
3. **Perfect-snap feedback:** a "PERFECT x5" callout, a "+120" points pop-up, and a better flash or burst than a full-screen tint. Also show what a sloppy capture looks like (+10, plus a "combo lost" note).
4. **Game-over screen:** the cause of death, the final score, NEW BEST or BEST n, perfect stats (e.g. "10/11 perfect"), TAP TO RETRY and the Daily toggle. Restart must stay a single tap anywhere, with no extra buttons or menus in the way.
5. **World object styles:** planet (normal, current orbit and drifting variants), orbit ring, capture zone, comet with trail (the trail colour changes with the combo), and black hole. Each must be instantly readable.

Also give me a **compact style guide**:
- Colour palette as hex values: background, planet colours, combo colour ramp x1 to x9, danger colour, and UI text colours.
- Font choices from Google Fonts, with sizes and weights for each text role.
- Glow and opacity values.

## Hard constraints (it's an HTML5 Canvas 2D game, not a DOM app)
- **Everything is drawn with Canvas 2D:** circles, arcs, lines, gradients, text, additive blending, and pre-rendered radial-gradient glow sprites. No SVG filters, CSS effects, images or 3D. Describe effects in terms I can reproduce that way.
- **Keep heavy blur to a minimum.** It has to run at 60 fps on mid-range phones. Several dozen glowing objects and particles are on screen at once.
- **Portrait only.** The play column is a fixed logical width (540 units) and scales to the phone width. On desktop it sits centred with dark side bars.
- **Readability beats decoration.** The player has to judge the release angle toward the next planet's orbit ring in a fraction of a second, so the orbit rings of upcoming planets must stay the clearest thing on screen.
- **Keep the current layout logic and one-tap flow.** I'm after a visual upgrade, not new screens or new mechanics.
