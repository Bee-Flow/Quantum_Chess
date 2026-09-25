# Variant spec: `fourplayer` (Four-player chess)

Category: `boards` (as in `catalog.js`; the placeholder module wrongly says `rules`). Players: 4. UI name: "Four-player
chess". Summary line (already in `catalog.js`): "Four armies on a cross-shaped board; the last king standing wins."

---

## 1. Sources and chosen rule set

**Research note.** WebFetch was blocked by the egress proxy for every rules site: chess.com, support.chess.com,
chess-variants.fandom.com, wikipedia.org, wikibooks.org, houseofstaunton.com, officialgamerules.org and
albertochueca.com. What I used:

- search-engine extracts of the pages below;
- the source code of an open-source chess.com-style engine, cloned from GitHub and read in full for the rules parts;
- prior knowledge.

Every test case in section 7 was run on a prototype built on the real `src/variants/core`:

- `handoff/prototypes/fp/proto.mjs` (the variant);
- `quantum_fp.js` (a copy of `quantum.js` with the two proposed hooks of section 3.4);
- the scripts `t1.mjs` … `t13.mjs`.

| Source | What it gives |
|---|---|
| **4pchess engine**, https://github.com/obryanlouis/4pchess (`board.cc`, `board.h`, `FENs_4PC_balanced.txt`, `ui/public/javascripts/index.mjs`), read in full for setup, pawns, castling and promotion | An engine for chess.com 4-player **Teams**. Its code shows: the 14 × 14 board minus 3 × 3 corners; the start position of every army (it matches the chess.com start FEN, see 2.3); the pawn directions and the double step from the second line; castling on both wings, the king moving two squares and the rook jumping over; Teams promotion on the 11th rank (`kRedPromotionRow = 3`, `kBluePromotionCol = 10`, `kYellowPromotionRow = 10`, `kGreenPromotionCol = 3`); piece values P 50, N 300, B 400, R 500, Q 1000; and board colours with a light square when `(row + col)` is even. En passant (`GetPawnMoves2`): an enemy pawn that has just double-stepped **across the square in front of** a pawn may be taken on the square it skipped. This works until the double-stepper moves again, and it may also capture a piece standing on the skipped square. |
| chess.com, "4 Player Chess" terms page (https://www.chess.com/terms/4-player-chess) and Help Center "4 Player Chess (4PC)" (https://support.chess.com/en/articles/8614233), search extracts | 160 squares ("three extra ranks are added to each side"); Red, Blue, Yellow, Green; Free-for-all and Teams. **FFA:** "pawns promote to a one-point queen on the 8th rank"; points: checkmate +20, capture P 1, N 3, B 5, R 5, Q 9, promoted queen 1. "If a player is checkmated or stalemated then their pieces turn grey … they block attacks", and capturing grey pieces scores nothing. The game ends when three players are out. **Teams:** partners sit opposite; you cannot capture your teammate's pieces; the goal is to "checkmate one member of the opposing team"; pawns promote on the 11th rank, and underpromotion is allowed. |
| chess.com blog "Everything you need to know about Zombies in 4 Player Chess" and the Fandom wiki "4 Player Chess" (https://chess-variants.fandom.com/wiki/4_Player_Chess), search extracts | A player who resigns or times out: the army becomes dead, and the king becomes a "zombie" that keeps moving at random. "Claim win" when two players are left and one leads by more than 20 points. |
| chess.com forum "4PC Variants List", search extract | En passant has been a standard rule of chess.com 4PC since 21 May 2019. |
| quadibloc.com "Four-Player Chess" (http://www.quadibloc.com/chess/ch0503.htm), search extract | The 160-square cross board (a centre of 64 plus four arms of 24). Each army stands in the usual order, turned to face the centre, with the king to the right of the queen. |
| Wikipedia "Four-player chess"; Wikibooks "Four-Player Chess/Notation" (search extracts) | The same board, colours and notation: files a–n, ranks 1–14, Red on ranks 1–2, Yellow on 13–14, Blue on files a–b, Green on files m–n. |

### Chosen rule set

**chess.com 4 Player Chess**, board, armies and moves exactly as chess.com, with **Free-for-all as the default** and
**Teams as an option**. It is adapted to Quantum Chess:

1. **There are no points.** Capture the king to eliminate a player. FFA: the last king standing wins. Teams: the first
   king captured loses for its team, as in chess.com Teams.
2. **An eliminated player's army leaves the board.** chess.com turns it into grey walls instead (see 4.2 for why).
3. **Promotion:** FFA on the 8th rank, Teams on the 11th rank, as chess.com. A free choice of Q, R, B or N in both
   modes; chess.com FFA auto-queens only because of its 1-point queen, which has no meaning without points.
4. **En passant: only the next player**, the move right after the double step, as in chess and in the rest of the
   app. 4pchess (and, it seems, chess.com) allows it until the double-stepper moves again (see 2.5).
5. **Fair-share budget:** 2 per player while four are in the game, 4 with three, 8 with two (see 4.3).
6. **A player who cannot move sits out.** chess.com eliminates a stalemated player and gives 20 points (see 4.8).

Rejected alternatives:

- Chess.com's grey walls, zombie kings and points (see 4.2 and section 8);
- Chaturaji and other historical four-handed games: different pieces, dice, not "chess.com style";
- promotion on the 11th rank in FFA: pawns would meet the opposite army head-on and hardly ever promote.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- A 14 × 14 grid minus the four 3 × 3 corners: **160 squares**. Coordinates `(x, y)`, x = file index 0..13 (`a`..`n`),
  y = rank index 0..13 (ranks `1`..`14`).
- Square `(x, y)` exists **unless** `(x < 3 || x > 10) && (y < 3 || y > 10)`.
  - Missing: a1–c3, l1–n3, a12–c14, l12–n14.
- Names: file letter + rank number: `d1`, `a7`, `n14`, `k11`, …. Ranks 10–14 have two digits (`a10`). The names contain
  none of `-|?@=`.
- Areas:
  - the centre: files d–k × ranks 4–11 (64 squares);
  - Red's arm: d–k × 1–3;
  - Yellow's arm: d–k × 12–14;
  - Blue's arm: a–c × 4–11;
  - Green's arm: l–n × 4–11.
- Movement is ordinary chess geometry on this grid:
  - A slider stops at the board edge **and at a missing corner square**. Example: a bishop on d4 has no move towards c3.
  - A knight may jump "across" a corner when both ends exist: c4-d2 and c4-e3 are legal, but c4-b2 and c4-a3 do not
    exist.

### 2.2 Sides, turn order and directions

| Index | Side | Colour | Home | Forward | Turn |
|---|---|---|---|---|---|
| 0 | Red | red | bottom (ranks 1–2) | +rank (up) | 1st |
| 1 | Blue | blue | left (files a–b) | +file (towards n) | 2nd |
| 2 | Yellow | yellow | top (ranks 13–14) | −rank (down) | 3rd |
| 3 | Green | green | right (files m–n) | −file (towards a) | 4th |

- Play goes **clockwise**: Red, Blue, Yellow, Green, Red, …. Eliminated players are skipped.
- **Orientation.** Blue is Red turned a quarter turn clockwise, Yellow a half turn, Green three quarters. As a vector
  map with y up, one quarter turn is `(a, b) → (b, −a)`:

  | Side | Oriented vector | Forward `(0, 1)` becomes |
  |---|---|---|
  | Red | `(a, b)` | `(0, 1)` |
  | Blue | `(b, −a)` | `(1, 0)` |
  | Yellow | `(−a, −b)` | `(0, −1)` |
  | Green | `(−b, a)` | `(−1, 0)` |

- The same quarter turn maps squares: `(x, y) → (y, 13 − x)`. Applied to a Red square once gives Blue's
  equivalent, twice Yellow's, three times Green's.

### 2.3 Setup (every square)

Each army is `R N B Q K B N R` from its own left, pawns in front. The queen stands to the left of the king, as White's
does in chess. This is exactly the chess.com start position:

```
R-0,0,0,0-1,1,1,1-1,1,1,1-0,0,0,0-0-3,yR,yN,yB,yK,yQ,yB,yN,yR,3/3,yP,...,3/14/bR,bP,10,gP,gR/.../bQ,bP,10,gP,gK/bK,bP,10,gP,gQ/...
```

It is also 4pchess `CreateStandardSetup`.

| Side | Back line | Pawns |
|---|---|---|
| Red | Rd1 Ne1 Bf1 **Qg1 Kh1** Bi1 Nj1 Rk1 | d2 e2 f2 g2 h2 i2 j2 k2 |
| Blue | Ra11 Na10 Ba9 **Qa8 Ka7** Ba6 Na5 Ra4 | b11 b10 b9 b8 b7 b6 b5 b4 |
| Yellow | Rk14 Nj14 Bi14 **Qh14 Kg14** Bf14 Ne14 Rd14 | k13 j13 i13 h13 g13 f13 e13 d13 |
| Green | Rn4 Nn5 Bn6 **Qn7 Kn8** Bn9 Nn10 Rn11 | m4 m5 m6 m7 m8 m9 m10 m11 |

64 pieces, 16 per side. Each side has 20 legal moves at the start (16 pawn moves and 4 knight moves).

### 2.4 Pieces and movement

The six orthodox pieces with the usual descriptors (`orthodoxTypes`):

| Piece | Descriptor |
|---|---|
| King | `leap` over the 8 king steps |
| Queen | `ride` over the rook and bishop directions |
| Rook | `ride` over the rook directions |
| Bishop | `ride` over the bishop directions |
| Knight | `leap` over the 8 knight jumps |
| Pawn | `leap [(0,1)]` oriented, mode move; `leap [(1,1), (−1,1)]` oriented, mode capture |

After orientation, the pawns move like this:

| Side | Moves | Captures | Double step from | Promotes on (FFA) | Promotes on (Teams) |
|---|---|---|---|---|---|
| Red | one rank up | one file left or right, one rank up | rank 2 | **rank 8** | **rank 11** |
| Blue | one file right | one file right, one rank up or down | file b | **file h** | **file k** |
| Yellow | one rank down | one file left or right, one rank down | rank 13 | **rank 7** | **rank 4** |
| Green | one file left | one file left, one rank up or down | file m | **file g** | **file d** |

- "Promotes on" is the pawn's own 8th (FFA) or 11th (Teams) line, counted from its back line.
- In FFA, that is the first line past the middle of the board.
- A pawn always stops on its promotion line: it moves one line at a time, and the double step only goes from line 2
  to line 4.
- Pawns of other armies may wander into any arm after diagonal captures; the rules above still apply.

### 2.5 Special moves

- **Double step:** a pawn on its own second line may move two lines forward if both squares are empty.
- **En passant (chosen: next player only).**
  - After a double step, the square the pawn skipped is the en-passant square **for the next player only**, for one
    move.
  - That player's pawn may capture onto the skipped square, if it could capture diagonally onto it, and removes the
    double-stepped pawn.
  - The skipped square is always empty at that moment, so there is never a double capture.
  - Geometrically, only a perpendicular neighbour can do this: after a Red double step, the capturer is a Blue pawn on
    the file just behind and next to it. Examples:

    | Double step | En passant capture |
    |---|---|
    | Red f2-f4 | Blue e4xf3 |
    | Blue b10-d10 | Yellow d11xc10 |
    | Yellow j13-j11 | Green k11xj12 |
    | Green m5-k5 | Red k4xl5 |

  - Every pair was checked in the prototype, so each army can take en passant and be taken.
  - chess.com and 4pchess keep the right open for every opponent until the double-stepper moves again. We use the
    ordinary chess rule, "only on the very next move", because:
    - the generic `orthodoxAfterMove` bookkeeping already works that way;
    - it rules out 4pchess's case of an en passant capture that takes two pieces;
    - it is the rule players know from chess and the rest of the app.
- **Castling:** both wings, on the side's own back line (a file for Blue and Green). The king moves two squares
  towards the rook, and the rook lands on the square the king crossed. Conditions:
  - neither piece has moved;
  - every square strictly between them is empty.
  - There is no check in Quantum Chess, so castling out of, through or into attack is allowed.

  | Side | O-O (short, 2 squares between) | O-O-O (long, 3 squares between) |
  |---|---|---|
  | Red | Kh1-j1, Rk1-i1 | Kh1-f1, Rd1-g1 |
  | Blue | Ka7-a5, Ra4-a6 | Ka7-a9, Ra11-a8 |
  | Yellow | Kg14-e14, Rd14-f14 | Kg14-i14, Rk14-h14 |
  | Green | Kn8-n10, Rn11-n9 | Kn8-n6, Rn4-n7 |

- **Promotion:** on reaching the promotion line (2.4), the pawn becomes a queen, rook, bishop or knight of its own
  colour, chosen by the player. This applies in both modes.

### 2.6 Winning, drawing, elimination

- **FFA (default).**
  - Capturing a king eliminates that player. At once, **all of the eliminated player's remaining pieces leave the
    board**.
  - The player is skipped from then on.
  - The **last player with a king wins**.
- **Teams (option).**
  - Red + Yellow against Blue + Green; partners sit opposite each other.
  - You cannot capture your partner's pieces. They block you like your own pieces do.
  - The game ends as soon as **any** king is captured, and that king's team loses.
- **A player who has no legal move** sits out that turn, and the turn passes to the next player who can move. If
  nobody can move, the game is drawn.
- **Draws:**
  - 200 moves in a row (all players together) without a capture or a pawn move;
  - the move limit of 1200 moves in total;
  - agreement (pass & play).
  - A drawn game is shared by the players still in it; eliminated players have lost.
- **No check.** As everywhere in Quantum Chess you may leave your king attacked. The danger ring shows the risk.

---

## 3. Engine mapping (contract)

### 3.1 Declaration

| Field | Value |
|---|---|
| `id`, `category` | `'fourplayer'`, `'boards'` |
| `sides` | `[{ id: 'r', name: Red, color: 'red', rotate: 0 }, { id: 'b', name: Blue, color: 'blue', rotate: 270 }, { id: 'y', name: Yellow, color: 'yellow', rotate: 180 }, { id: 'g', name: Green, color: 'green', rotate: 90 }]`. Names are translated at call time. **Note the rotations: Blue 270, Green 90.** With `VariantBoard.vue`'s `rot()`, rotation 270 maps `(x, y) → (y, W − x)`, which moves the left edge (Blue) to the bottom; rotation 90 moves the right edge (Green) to the bottom. This was checked for the kings: with its rotation, each viewer sees its own king at the bottom, just right of its queen. |
| `teams` | `null` (the mode is per game, see 3.3) |
| `enemies` | default `a !== b`. Teams mode is done in `filterMoves` (3.3), because `enemies(a, b)` gets no world and the mode lives in the world. |
| `orient(side, vec)` | turn `vec` clockwise `side` times with `(a, b) → (b, −a)` (2.2) |
| `topology` | `rectTopology(14, 14, { exists, shade, noLabels: true, layout: { labels } })`, with `exists = (f, r) => !((f < 3 \|\| f > 10) && (r < 3 \|\| r > 10))`. Shades and labels: section 6. |
| `types` | `orthodoxTypes(...)` with a new pawn `promote` and new values: `p.promote = { zone: (side, to, from, w) => progress(side, to) === (w.x.teams ? 10 : 7), to: ['q', 'r', 'b', 'n'] }`, where `progress(side, sq)` is `[y, x, 13 − y, 13 − x][side]` of the square (0 = own back line). |
| royal / solid / splittable | royal: `k`; solid: `k`, `p`; splittable: `q`, `r`, `b`, `n` (and promoted pieces) |
| `value` (AI) | K 400 (core default), **Q 1000, R 500, B 450, N 300**, P 100. See the notes below the table. |
| `options` | `[{ id: 'mode', type: 'choice', label: () => t('quantumchess', 'Game mode'), values: [{ id: 'ffa', label: () => t('quantumchess', 'Free for all') }, { id: 'teams', label: () => t('quantumchess', 'Teams: Red and Yellow against Blue and Green') }], default: 'ffa' }]` |
| `maxPly`, `quietPlies` | `1200`, `200` |
| `visibility` | none |

**Why these piece values.** 4pchess uses P 50, N 300, B 400, R 500, Q 1000. chess.com FFA points rate a bishop the same
as a rook (5), because long diagonals on a 14-wide board are strong. The pawn stays at 100: in FFA it promotes on its
8th line, so it is worth more than in 4pchess's Teams engine.

### 3.2 Setup and extra state

- `setup(options)`:
  - place the Red army on `(3..10, 0)` and the pawns on `(3..10, 1)` with `'rnbqkbnr'`;
  - for sides 1–3, turn every Red square 1–3 times with `(x, y) → (y, 13 − x)`.
  - Then set `x = { teams: options.mode === 'teams', ep: -1, epVictim: -1, castle: rights }`.
- `x.teams` (boolean) is the game mode. It is identical in every world and read by `promote.zone`, `filterMoves`,
  `afterMove`, `worldResult` and `evaluate`. Treat `undefined` as FFA, because worlds built by tests may lack it.
- `x.castle` has 8 rights `{ flag: 'K' | 'Q', side, king, rook, kingTo, rookTo }` from the table in 2.5, built by
  turning the Red squares: `king = (7,0)`; K: `rook (10,0)`, `kingTo (9,0)`, `rookTo (8,0)`; Q: `rook (3,0)`,
  `kingTo (5,0)`, `rookTo (6,0)`.

### 3.3 Hooks

- **`extraMoves(w, side)`:**
  - `pawnExtras(V, w, side, (s, sq) => progress(s, sq) === 1)` for the double steps and en passant. `pawnExtras`
    already uses `V.orient`, so it works for all four directions.
  - A local castling generator, because `castlingMoves` in orthodox.js only handles castling along a rank. For each
    right of `side`, the king and a rook of `side` must stand on `c.king` and `c.rook`, and every square strictly
    between them must be empty. It emits `{ key: flag K ? 'O-O' : 'O-O-O', from: c.king, to: c.kingTo, id: king,
    capture: -1, promo: null, drop: null, kind: 'castle', extra: { rook: { id: rook, to: c.rookTo }, kingTo } }`.
    `applyClassical` already moves the rook.
- **`filterMoves(w, side, list)`:** in Teams mode (`w.x.teams`), drop every move with `m.capture >= 0` whose victim is
  a partner (`w.sd[m.capture] % 2 === side % 2`). A slider stops in front of its partner's piece, because
  `pieceMoves` breaks at the first occupied square.
  - The generic `royalDanger` uses `generate`, which is filtered. So a partner never counts as a danger to your king.
- **`afterMove(next, m, prev)`:**
  1. **En passant square:** if `m.kind === 'double'`, `next.x.ep` is the midpoint of `from` and `to` in both
     coordinates, and `epVictim = m.to`. Otherwise both are −1. (`orthodoxAfterMove` assumes a vertical double step,
     so write it locally.)
  2. **Castling rights:** drop every right whose `king` or `rook` square equals `m.from` or `m.to`.
  3. **Elimination (FFA only):** if `m.capture >= 0 && prev.ty[m.capture] === 'k' && !next.x.teams`, then with
     `victim = prev.sd[m.capture]`:
     - `placePiece(next, id, OFF)` for every piece id of `victim` that is still on the board;
     - drop `victim`'s castling rights.
- **`isOut(b, s)`:** `!hasRoyal(V, b, s)`. The generic `nextSide` skips such sides. Elimination is always certain (4.1),
  so reading `worlds[0]` is exact.
- **`worldResult(b)`:**
  - **Teams:** if some side has no king, the result is
    `{ winner: null, winners: loser % 2 === 0 ? [1, 3] : [0, 2], reason: 'king' }`.
  - **FFA:** the core default already does the right thing, but write it out:
    - exactly one side has a king: `{ winner: that side, reason: 'king' }`;
    - otherwise `null`.
- **`reasonText(reason)`:** `'quiet'` → `t('quantumchess', '200 moves in a row without a capture or a pawn move')`.
  Everything else uses the generic text.
- **`evaluate(b, side)`** (computer player):
  - **King exposure:** −1500 if `side`'s king is attacked in `b` (`attacks(V, b, e, kingSq)`) by any side `e` that is
    an enemy (in Teams: `e % 2 !== side % 2`) and still in the game.
    - Why: the generic search only looks at the reply of the *next* player. Players two and three moves later also
      get to capture before you move again, and losing the king loses the whole army.
    - The world weights turn this into "−1500 × probability".
  - **Teams correction:** the generic `worldValue` treats the partner as an enemy (`enemies` is FFA). Add
    `(4 × partner − 2 × (enemy1 + enemy2)) / 3` (material over the pieces on the board, with the type values). The
    total then becomes `own + partner − enemy1 − enemy2`.
  - Optional: cache the per-world term in a `WeakMap` keyed by the world.
- **`options`:** above. No `measured`, `drops` or `hidden` hooks.

### 3.4 Proposed core hooks (needed for fairness)

**1. `budgetLimit(world) -> number`** (default `BUDGET` = 8), used by `quantum.js` wherever it compares with
`BUDGET`: the pass = link fallback in `moveBranches`, `splitBranches` and `mergeBranches`. The limit is read from
`state.worlds[0].b`; the number of players still in the game is certain.

- Export a `budgetLimit(V, state)` helper for the UI pips and the fuzz invariant.
- For `fourplayer`:
  - FFA: 2 with four kings, 4 with three, 8 with two;
  - Teams: always 2.
- Why it is needed: see 4.3. Without it, one pair of players can use up the 64-world cap (demonstrated in `t6.mjs`).
- Prototype: `quantum_fp.js`, about 10 lines.

**2. `passWhenStuck: true`.** In `stateAfter` (not in `light` mode): if the side to move has no legal move, step on
with `nextSide` until a side with a legal move is found. That side is to move, and the history record gets
`skipped: [sides]` so the UI can say "Red cannot move and sits out". If no side can move, the usual `noMoves` result
(a draw) applies.

- Prototype: `quantum_fp.js`, about 15 lines. It must build a **new** state object for each probed side, because
  `table()` caches per state object.
- Without this hook, the core ends the game in a draw. That is acceptable only because it is extremely rare: every
  piece, including the king, must be blocked in every possibility.

**3. `resign(state, side) -> state`** (UI, `useVariantGame.resign`).

- Today the resigning side's `enemies` are declared winners. In Teams that wrongly includes the partner.
- For `fourplayer`:
  - **Teams:** `{ winner: null, winners: other team, reason: 'resign' }`;
  - **FFA with one human:** end the game as today (the other three players are listed as winners);
  - **FFA pass & play with three or more players left:** remove the resigning side's pieces from every world, dedupe
    the worlds, rescale the weights, and pass the turn on (as if its king had been captured). Set the result only if
    one king is left.

Optional, cleaner alternative to `filterMoves` and the evaluate correction: give `enemies` the world as a third
argument (`enemies(a, b, w)`). All its call sites have a world at hand: `pieceMoves`, `pawnExtras`, `worldValue`,
`royalDanger` (`worlds[0]`) and `resign`.

---

## 4. Quantum adaptation

### 4.1 Elimination is always certain

A king is solid, so it stands on the same square in every possibility. Capturing it **lands** on an occupied square,
so the move is always in the measured class and is settled by a roll: Captured, Moved (impossible here) or Missed.
After the roll, every remaining possibility agrees whether the king was captured. So "is Blue still in the game?"
never has two answers, and:

- the turn order is exact. After a rolled attack on Blue's king, **the next player depends on the outcome**: Blue if
  it missed, Yellow if it hit (test Q1);
- the solid roll and the game-end roll are the backstops. They never have to split anything extra here.

This includes converging captures (a merge onto a king), which are rolled whenever the result is uncertain, and
captures by a ghost part (50 % part → 50 % roll).

### 4.2 The eliminated army leaves, ghosts and links included

In every possibility where the king is captured, the whole army goes off the board.

- **Its ghosts simply vanish.** Possibilities that differed only in where those ghosts stood become identical and are
  merged; their chances add up.
- **Links to it dissolve.** Example: a Red rook linked to a Blue knight ("rook on d8 exactly when the knight is on
  f8"). When Blue is out, the rook stays a 50/50 ghost on d8 / i8, but it is no longer linked to anything (test Q2).
  In physics terms, this is tracing out a subsystem.

Why not chess.com's grey walls?

- Dead ghosts could never be measured again: nobody may measure another player's piece. They would block squares
  "maybe" forever.
- They would keep multiplying the possibilities: a dead side with a 50/50 ghost doubles every count. That eats the
  64-possibility cap that the living players share (4.3).
- Grey pieces exist on chess.com for its points system (capturing them scores 0) and for its zombie kings. Neither
  exists here.
- Removal is one sentence for players, and it gives the final board a nice picture: the winner's army alone.

### 4.3 The budget is shared fairly: 2 / 4 / 8

The classic budget of 8 per side assumes two sides, so that 8 × 8 = 64 possibilities. With four sides, 8 each allows
8^4 = 4096 possibilities, but the state is capped at 64 worlds.

- With the unpatched core, Red and Blue can fill the cap with three splits each. Yellow and Green, budget 2 of 8 used,
  are then refused every split (`t6.mjs`: after 6 splits, `e14-d12|f12` is illegal at 64 worlds). That is
  first-come-first-served: unfair, and baffling while the budget pips still show room.

**Decision.** Each player's budget is the largest `n` with `n^players ≤ 64`:

| Players | Budget each | Possibilities at most |
|---|---|---|
| 4 (FFA or Teams) | 2 | 2^4 = 16 |
| 3 (FFA) | 4 | 4^3 = 64 |
| 2 (FFA) | 8 | 8^2 = 64 (classic Quantum Chess) |

- **While four players are in, each may have one 50/50 ghost** (or one ghost plus pieces linked to it).
- When a player is out, the others' budgets rise **at once**. Budgets never shrink, so no position can ever be over its
  limit.
- The usual rules apply:
  - a full budget greys out splits;
  - a move that would be a quantum pass = link is settled by a roll instead ("Roll (budget full)", test B2);
  - measure and merge free budget;
  - opponents can never use up your budget.
- The 4-location limit is unchanged, but with a budget of 2 a piece cannot have more than 2 parts until a player is
  out.
- It also keeps the computer fast: at most 16 worlds × 160 squares while the board is full. Random games ran at about
  3 ms per ply, and the computer (normal and hard) took at most about 0.3 s per move over the first 24–40 plies
  (`t7.mjs`, `t8.mjs`, `t11.mjs`, the last with the evaluate term of 3.3).

### 4.4 Pawns, promotion, en passant, castling

Nothing new, only the generic rules on this board:

- Pawns are solid, so every pawn move is settled at once (a roll if needed).
- A pawn promotes only if it really reaches its promotion line.
- A double step blocked by a ghost is Moved or Missed. The en passant square exists only in the possibilities where
  the double step happened, and the roll has already settled that (test Q5).
- En passant is offered to the next player only when it is possible in some possibility. It is a pawn move, so it is
  settled at once.
- Castling is a king move. As in the other orthodox variants, it is generated in every possibility where its squares
  are empty. Because the king is solid, it is settled by a roll (Moved or Missed) when that holds in only some
  possibilities.
- A castling right is lost by any move from or to the king's or the rook's start square, in that possibility.

### 4.5 Teams and the partner's pieces

- You can never capture your partner's pieces. They block your slides like your own pieces do.
- A move that **lands** on a square where your partner's piece **might** stand is a roll: **Missed** where it stands
  there, Moved (or Captured) elsewhere (test P1).
- A slide that **passes** such a square links your piece to the partner's piece without a roll (test P2), as with any
  other piece.
- Split targets must be certainly empty, so a partner's ghost part also blocks a split.
- A merge onto a square where the partner might be is allowed, but it is rolled (Missed where the partner is). The
  core refuses a merge target only when it might hold **your own** piece.
- You can only measure your own ghosts, not your partner's.
- The danger ring counts only the two enemies.

### 4.6 Game end: first king (Teams), last king (FFA)

- A king capture is always certain after its roll (4.1). The game-end roll is therefore never needed as a separate
  step, but it stays as a safety net.
- **FFA:** capturing the second-to-last king wins, and the winner's army is left alone on the board.
- **Teams:** the first captured king ends the game for both teams.

### 4.7 King danger

The ring shows the chance that **any** enemy player could capture your king with one move right now. With three
enemies, a king can be lost to a player who moves two or three turns after you. Players must watch all three, and the
computer's evaluate term (3.3) does that too.

### 4.8 A player who cannot move

Without check, a player is stuck only if every piece is blocked in every possibility: no ordinary move, no merge and
no measure. This is extremely rare; for example, in Teams your army is walled in by your partner's pawns (test S1).

**Decision:** that player sits out, and the next player who can move is to move. There is no elimination and no
points, which keeps "only a captured king eliminates" true.

- chess.com eliminates a stalemated player (and rewards them with 20 points). Without points, being eliminated would be
  a loss.
- A stuck player's king can still be captured.
- If no player can move, the game is drawn.

### 4.9 Summary for players

"Capture a king and that player is out, together with all their pieces, ghosts included. Each player may keep one
50/50 ghost while all four play; the budget grows as players drop out."

---

## 5. Player-facing rules text (rules card)

- Four armies take turns clockwise: Red, Blue, Yellow, Green. The board is 14 × 14 squares without its four corners.
- Pawns walk towards the opposite side. They promote as soon as they cross the middle of the board (their 8th rank),
  and in Teams on their 11th rank.
- Castling works as usual for every army. Only the next player may capture a pawn en passant.
- Free for all: capture a king and that player is out. Their whole army, ghosts included, leaves the board. The last
  king standing wins.
- Teams: Red and Yellow play against Blue and Green. You cannot capture your partner's pieces, and the first king
  captured loses the game for its team.
- The possibilities are shared fairly: each player's budget is 2 while four players are in the game, 4 with three and
  8 with two.
- A player who cannot move sits out. 200 moves in a row without a capture or a pawn move is a draw.

---

## 6. UI layout

- **Cells.** Square cells, 1 × 1 layout unit. Cell of `(x, y)`: `x = x`, `y = 13 − y`: Red at the bottom, Blue on
  the left, Yellow at the top, Green on the right.
  - The layout is 14 × 14 units. The four 3 × 3 corners are simply not drawn: no cells, and no `areas`, so the page
    background shows through and the cross shape reads at a glance.
- **Shades.** Following the 4pchess UI (a chess.com look): **light when `x + y` is odd**, dark when even. So d1 is
  light and k1 dark.
  - On an even-sized board, a quarter turn swaps the colours. Blue and Green therefore see a light square in their
    right-hand corner, and Red and Yellow a dark one. That is unavoidable, and chess.com has the same property.
  - The queens stand on dark squares for Red and Yellow and on light squares for Blue and Green.
- **Labels** hug the cross:
  - files a–n below the lowest cell of each file: files d–k at `y = 14.32`; files a–c and l–n at `y = 11.32`, under
    rank 4;
  - ranks 1–14 left of the leftmost cell: ranks 4–11 at `x = −0.3`; ranks 1–3 and 12–14 at `x = 2.7`.
- **Pieces.** Only orthodox pieces: the cburnett sprites. `glyphs.js` already draws the white sprite tinted in the side
  colour for the colours `red` (#c62828), `blue` (#1565c0), `yellow` (#f9a825) and `green` (#2e7d32).
  - Sprites are never spun, so every piece stays upright for every viewer.
  - Ghost parts are drawn as usual: faded, with a percentage badge.
- **Rotation.** `rotate` 0 (Red), 270 (Blue), 180 (Yellow), 90 (Green): every player sees its own army at the bottom,
  queen left of king.
  - Playing against the computer, the view is the human's.
  - In pass & play with auto-flip, the view turns a quarter turn per move.
- **Players panel.** Four rows in turn order, each with the colour swatch.
  - An eliminated player is greyed out (the existing `qc-vgame__player--out` class via `isOut`) with the word "out".
  - Budget pips: show **`budgetLimit`** pips (2, 4 or 8), not a fixed 8. Tooltip: "Quantum budget: {used} of {max}".
  - Teams: group the rows as "Red + Yellow" and "Blue + Green", and mark the partner.
- **Move list and notes.** A capture that eliminates should say so, for example "Blue is out". A skipped turn should
  say "Red cannot move and sits out". Both can come from `V.noteText` or from the history record (3.4).
- **New game dialog.**
  - Mode: "Free for all" or "Teams".
  - "You play" offers the four colours; the other three are computers (in Teams, your partner too).
  - Pass & play makes all four human.
  - Nice to have: a Human / Computer choice per seat, for example two humans against two computers in Teams.
- **Size.** 160 cells: on a phone the board is dense. Keep the existing zoom (ctrl + wheel, pinch) enabled.
- **No promotion lines** are drawn. The layout is static per variant, but the promotion line depends on the mode. The
  move preview already offers the promotion choice.

---

## 7. Test cases

- Helper: `stateOf(V, worlds, turn, edit)` with `edit = (b) => { b.x = { teams, ep: -1, epVictim: -1, castle: [] } }`.
- Default kings: `K4 = { h1: '0:k', a7: '1:k', g14: '2:k', n8: '3:k' }` (sides 0–3 = Red, Blue, Yellow, Green).
- "Outcomes" lists `key p`. All results below were produced by the prototype (`handoff/prototypes/fp/t1`–`t13.mjs`), with
  the two proposed hooks where stated.

### Board, setup, moves

**T1. Start.**
- `newGame(V, { mode: 'ffa' })`: 160 squares; the 64 pieces on the squares of 2.3; 8 castling rights; `x.teams` false.
- Each side has 20 ordinary moves (set `turn` to 0..3):
  - Red: `e1-d3 e1-f3 j1-i3 j1-k3`, `d2-d3` … `k2-k3`, `d2-d4` … `k2-k4`;
  - Blue: `a10-c9 a10-c11 a5-c4 a5-c6`, `b4-c4` … `b11-c11`, `b4-d4` … `b11-d11`;
  - Yellow: `j14-i12 j14-k12 e14-d12 e14-f12`, pushes to rank 12 and rank 11;
  - Green: `n5-l4 n5-l6 n10-l9 n10-l11`, pushes to file l and file k.

**T2. Turn order.** From the start: `h2-h4` → Blue to move; `b8-d8` → Yellow; `g13-g11` → Green; `m7-k7` → Red.

**T3. Board shape.**
- `K4` + Red Nd4: the moves from d4 are exactly `d4-e6 d4-f5 d4-c6 d4-b5 d4-e2 d4-f3`. There is no b3 or c2.
- Red Bd4: `e5 f6 g7 h8 i9 j10 k11`, `e3 f2 g1`, `c5 b6 a7` (a7 captures the Blue king), and nothing towards c3.
- Red Nc4: `d6 e5 b6 a5 d2 e3` (the knight jumps across the corner to d2).

**T4. Castling, all eight.** `K4` plus the side's two rooks on their start squares, all 8 rights, the side to move:

| Side | Move | King and rook after |
|---|---|---|
| Red | O-O | Kj1 Ri1 |
| Red | O-O-O | Kf1 Rg1 |
| Blue | O-O | Ka5 Ra6 |
| Blue | O-O-O | Ka9 Ra8 |
| Yellow | O-O | Ke14 Rf14 |
| Yellow | O-O-O | Ki14 Rh14 |
| Green | O-O | Kn10 Rn9 |
| Green | O-O-O | Kn6 Rn7 |

After either castling move, that side's two rights are gone and the other six remain.

**T5. En passant (next player only).**
- `K4` + Red Pf2, Blue Pe4, Green Pg4; Red to move.
  - `f2-f4`: `x.ep = f3`, `epVictim = f4`, Blue to move.
  - Blue's moves from e4: exactly `e4-f3`. Playing it leaves Blue Pf3 and no Red pawn, with `ep` reset.
  - If instead Blue plays `a7-a6` and Yellow `g14-g13`, Green's pawn on g4 has no move (the right has expired, and f4
    blocks it).
- The other pairs, each from `K4` plus the two pawns:
  - Blue Pb10 + Yellow Pd11: Blue `b10-d10`, then Yellow `d11-c10` captures d10.
  - Yellow Pj13 + Green Pk11: Yellow `j13-j11`, then Green `k11-j12` is legal.
  - Green Pm5 + Red Pk4: Green `m5-k5`, then Red `k4-l5` is legal.

**T6. Promotion.**
- FFA: `K4` + Red Pe7, Blue Pg5, Yellow Pj8, Green Ph9, Blue Nf8. The pawn moves of each side:

  | Side | Pawn moves |
  |---|---|
  | Red | `e7-e8=q/r/b/n` and `e7-f8=q/r/b/n` (capture) |
  | Blue | `g5-h5=q/r/b/n` |
  | Yellow | `j8-j7=q/r/b/n` |
  | Green | `h9-g9=q/r/b/n` |

- Teams (`x.teams = true`): `K4` + Red Pe7 and Pe10, Blue Pj10:
  - Red: `e7-e8` is a plain move; `e10-e11=q/r/b/n`;
  - Blue: `j10-k10=q/r/b/n`.

### Winning and elimination

**T7. FFA elimination.**
- `K4` + Red Qd4, Blue Pb8, Nc6, Ra11; Red to move.
- `d4-a7` is `capture 1`.
- After it:
  - Red Kh1 Qa7, Yellow Kg14, Green Kn8. **Every Blue piece is gone.**
  - Yellow is to move (Blue is skipped), and there is no result.

**T8. FFA last king.** Red Kh1, Rh8; Green Kn8, Pm9; Red to move. `h8-n8` gives `{ winner: 0, reason: 'king' }`, and
the board is Red Kh1 Rn8 only.

**T9. Teams.**
- `K4` + Red Qd4, Yellow Nc5, Blue Ne5, Blue Bd7; Teams.
  - Red's queen moves include `d4-e5` and `d4-d7` (captures).
  - They do not include `d4-c5` (the partner) or anything beyond c5.
- `K4` + Red Qd4, Blue Pb8; Teams: `d4-a7` gives `{ winner: null, winners: [0, 2], reason: 'king' }`. The Blue pawn
  stays on the board (no removal in Teams).

**T10. Quiet draw.** Any `K4` position with `quiet: 199`, Red to move: `h1-h2` gives
`{ winner: null, reason: 'quiet' }` with the text "200 moves in a row without a capture or a pawn move".

### Quantum interactions

**Q1. A ghost queen attacks a king; the turn order follows the roll.**
- Four equal worlds, `K4` + Blue Pb8 in each:
  - Red queen on d4 or j4 (a 50/50 ghost), independently of Blue knight on c6 or d8 (a 50/50 ghost).
  - Budgets: Red 2, Blue 2, Yellow 1, Green 1.
- Red `d4-a7` (via c5 and b6): outcomes `miss 0.5`, `capture 0.5`.
  - miss: 2 worlds with Red Qj4 (100 %), Blue king and ghost knight unchanged. **Blue is to move.**
  - capture: 1 world with Red Kh1 Qa7, Yellow Kg14, Green Kn8. **The Blue ghost knight is gone too.** Yellow is to
    move, and all budgets are 1.

**Q2. Elimination dissolves a link.**
- Two equal worlds, Yellow to move:
  - A = `K4` + Red Rd8, Blue Nf8, Yellow Qd10;
  - B = `K4` + Red Ri8, Blue Nf10, Yellow Qd10.
- The Red rook is linked to the Blue knight: it is on d8 exactly when the knight blocks f8. That is what Red `d8-i8`
  produces from Rd8 with the knight 50 % f8 / 50 % f10: `move 1` (pass = link).
- Yellow `d10-a7` is `capture 1`. After it:
  - two worlds, 0.5 each: {Red Ri8, Yellow Qa7} and {Red Rd8, Yellow Qa7};
  - the Red rook is an unlinked 50/50 ghost, Red's budget is 2, and Green is to move.

**Q3. Fair-share budget (hook 1).**
- From the start: Red `e1-d3|f3` (2 worlds, Red budget 2), then `b8-d8`, `g13-g11`, `m7-k7`.
  - Red's split `j1-i3|k3` is **illegal**: budget limit 2 with four players.
  - `j1-k3` is still `move 1`.
- The same Red pieces (Nd3/Nf3 ghost, Nj1) with only three kings (Red, Yellow, Green): `j1-i3|k3` is **legal**
  (limit 4).
- With the unpatched core (limit 8), Red and Blue can split three pieces each, and then Yellow's first split
  `e14-d12|f12` is illegal at 64 worlds (`t6.mjs`). This is the unfairness the hook removes.

**Q4. Budget full: a link becomes a roll.**
- Four equal worlds: `K4` + Red knight d3 or f3 (a ghost), Red Rd8, Blue knight f8 or f10 (a ghost, independent).
- Red `d8-i8` would link the rook to the Blue knight: Red's budget would become 4, over the limit of 2. So it is
  rolled: `miss 0.5`, `move 0.5`.
- Without the Red ghost knight (two worlds), the same move is `move 1` (pass = link).

**Q5. A blocked double step and en passant.**
- Two equal worlds: `K4` + Red Pf2, Blue Pe4, and a Yellow knight on f3 in one world, on h12 in the other.
- Red `f2-f4`: `miss 0.5`, `move 0.5`.
  - miss: the knight is 100 % on f3, the pawn stays on f2, and Blue may play `e4-f3` (an ordinary capture of the
    knight) or `e4-f4`.
  - move: Pf4, `ep = f3`, the knight is 100 % on h12, and Blue's only e4 move is `e4-f3` en passant.

**P1. Teams: landing where the partner might be.**
- Teams; two equal worlds: `K4` + Red Rd8 and a Yellow knight on g8 or g10.
- Red `d8-g8`: `miss 0.5` (the knight was on g8: the rook stays on d8, the knight is 100 % on g8), `move 0.5` (Rg8,
  the knight 100 % on g10).

**P2. Teams: passing the partner links.** Same position: Red `d8-i8` is `move 1`. Afterwards the rook is 50 % i8 (with
the knight on g10) and 50 % d8 (with the knight on g8).

**S1. A stuck player sits out (hook 2).**
- Teams: Red Kd1, Be1, Pd2, Pe2, Pf2; Yellow (partner) Pd3, Pe3, Pf3, Pg3 and Kg14; Blue Ka7; Green Kn8. Green to
  move.
- Red has no legal move: its pawns are blocked by its partner's pawns, which it cannot capture, and its king and
  bishop are boxed in.
- Green `n8-n9`: the next state has Blue to move, `skipped: [0]`, and no result.
- Without the hook, the core would end the game with `{ winner: null, reason: 'noMoves' }`.

**UI1. Rotation.** In `VariantBoard` with `rotation = V.sides[s].rotate`, the cell of that side's king is drawn in the
bottom row, with the queen's cell immediately to its left:

| Side | King | Queen |
|---|---|---|
| Red | h1 | g1 |
| Blue | a7 | a8 |
| Yellow | g14 | h14 |
| Green | n8 | n7 |

**F1. Fuzz.** Random FFA and Teams games (`t12.mjs`: 12 games, 1172 plies, 2.2 s; `t7.mjs`: 12 more). After every
move:

- every side's budget ≤ `budgetLimit` of the state;
- at most 16 worlds while four kings are on the board (8 was the most seen);
- kings and pawns are identical in every world;
- the set of players still in the game is the same in every world;
- no piece of an eliminated side is on the board in any world (FFA);
- no pawn stands on or beyond its promotion line;
- every finished game has exactly one winner (FFA) or one winning team (Teams).

All of these held.

**F2. The known opening trap works** (it checks the orientation of everything):

- 1. Red `h2-h3`, Blue `b8-d8`, Yellow `e14-f12`, Green `m7-l7`.
- Then Red `g1-n8` captures the Green king along g1–n8.
- In Teams, the result is `{ winners: [0, 2], reason: 'king' }`. In FFA, Green is out and Blue is to move.

---

## 8. Open questions

1. **Core hooks (3.4).**
   - `budgetLimit` is needed for a fair game. Without it, the variant works, but whoever splits first can block the
     other players' splits.
   - `passWhenStuck` is rare; the fallback is a draw.
   - `resign` fixes Teams and allows elimination by resignation in pass & play.
   - Optional: `enemies(a, b, w)` would replace the Teams `filterMoves` and evaluate correction.
2. **Points FFA** (chess.com scoring) is left out of v1. If it is wanted later:
   - per-world scores in `w.x.score`, made solid through `solidExtra` (as three-check does), so every scoring capture
     is settled at once;
   - +20 for a king, Q 9, R 5, B 5, N 3, P 1, a promoted queen 1;
   - eliminated players keep their score, and the highest score wins when one king is left;
   - the computer's `evaluate` would then use score differences.

   It is more to explain, and it rewards opportunistic captures over survival. "Last king standing" is the brief's
   own goal and the simplest for the computer.
3. **En passant window.** We use "next player only". chess.com and 4pchess allow it until the double-stepper moves
   again (so Green may take Red's pawn three moves later), including a rare double capture. That can be switched if
   exact chess.com parity matters.
4. **Eliminated army.** We remove it. The alternative is chess.com's grey walls, which cannot move and can be captured
   by anyone; see 4.2 for why not.
5. **FFA promotion choice.** We allow a free choice. chess.com auto-queens, with a queen worth 1 point.
6. **Seats.** A per-seat Human / Computer choice (for example two humans against two computers in Teams) needs a small
   change in the new-game dialog and the game record (`players[i].kind`); the engine does not care.
7. **Teams budget.** We use 2 per player. The alternative is a shared team budget of 8 (as bughouse proposes with
   `budgetSides`, 8 × 8 = 64): more quantum play per team, but a second hook, and partners compete for it.
8. **Board colouring.** We use light when `x + y` is odd (4pchess). The opposite would give Red and Yellow a light
   right-hand corner instead of Blue and Green. It cannot be right for all four.
