// All gameplay tunables live here. Units: world units (the play column is
// `view.width` units wide, whatever the screen size), seconds, radians.

export const CONFIG = {
  sim: {
    hz: 120, // fixed physics rate
    maxFrameTime: 0.25, // clamp for long frames (tab switch, GC hitch)
  },

  view: {
    width: 540, // logical width of the play column in world units
    maxAspect: 0.5, // max width/height of the column (desktop/landscape gets a centred portrait column)
    maxDpr: 2.5, // cap devicePixelRatio to keep fill-rate sane on 3x phones
    cameraLead: 0.66, // where the current planet sits vertically (0 = top, 1 = bottom)
    cameraFollowOrbit: 3.5, // camera smoothing while orbiting (higher = snappier)
    cameraFollowFly: 1.1, // camera smoothing while flying (low = comet can outrun the camera)
  },

  comet: {
    radius: 6,
    baseSpeed: 270, // units/s at run start
    speedPerCapture: 6, // added on every capture
    maxSpeed: 500, // speed cap
    radiusSettle: 9, // how fast a fresh capture eases into the ideal orbit radius
    trailLength: 28, // trail points (sampled at sim rate)
    maxFlightTime: 4.5, // seconds of free flight before "lost in space" (long skip-shots are allowed)
    boundsMargin: 40, // how far off-screen the comet may go before dying
  },

  planet: {
    orbitFactor: 1.7, // orbitR = radius * orbitFactor + orbitPadding
    orbitPadding: 14,
    captureFactor: 2.0, // captureR = orbitR * captureFactor
  },

  snap: {
    // A capture is PERFECT when the comet's line of flight passes the planet
    // centre within orbitR * (1 ± perfectTolerance). This is THE difficulty knob.
    perfectTolerance: 0.25,
    basePoints: 10,
    perfectBonus: 10, // added to base on a perfect, before the multiplier
    maxCombo: 9,
  },

  feel: {
    hitPausePerfect: 0.07, // seconds of freeze on a perfect snap
    hitPauseDeath: 0.12,
    shakePerfect: 0.45, // trauma added (0..1)
    shakeCapture: 0.12,
    shakeDeath: 0.9,
    shakeMaxPx: 16, // CSS px at trauma 1
    shakeDecay: 1.8, // trauma lost per second
    flashPerfect: 0.3,
    flashDeath: 0.55,
    particlesPerfect: 36,
    particlesCapture: 14,
    particlesDeath: 70,
    restartGuard: 0.35, // ignore taps this long after dying (prevents accidental restarts)
  },

  world: {
    firstPlanetRadius: 36,
    // [min, max] ranges, interpolated from Easy to Hard by difficulty (0..1)
    radiusEasy: [28, 44],
    radiusHard: [15, 28],
    gapEasy: [30, 80], // free-flight distance between orbit ring and next capture ring
    gapHard: [100, 180],
    maxShiftEasy: 0.45, // max horizontal offset to next planet, fraction of view width
    maxShiftHard: 0.85,
    sideMargin: 18,
    movingStart: 0.2, // difficulty at which planets begin to drift side to side
    movingChanceMax: 0.5,
    moveAmp: [30, 100],
    moveFreq: [0.5, 1.1], // rad/s
    blackHoleScore: 120, // black holes appear from this score
    blackHoleChance: [0.25, 0.55],
    blackHoleRadius: [14, 22],
    blackHoleOffset: [80, 150], // sideways distance from the flight line
    difficultyMaxScore: 700, // score at which difficulty reaches 1
    spawnAhead: 0.8, // generate planets this many view-heights above the top of the screen
    cullBelow: 150,
  },

  audio: {
    masterVolume: 0.5,
  },
} as const;
