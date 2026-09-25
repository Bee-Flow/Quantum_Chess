# Variant spec: `xiangqi` (Xiangqi, Chinese chess)

Category: `regional` (as in `catalog.js`; the placeholder `src/variants/xiangqi.js` wrongly says `rules`). Players: 2.
UI name: "Xiangqi". Catalog summary (already in `catalog.js`): "Chinese chess with a river, two palaces and the
cannon."

Every expected value in section 7 was computed by a prototype of the declaration in section 3, running on the real
variant core (`handoff/prototypes/xiangqi/`):

- `xiangqi.mjs`: the declaration itself (topology, types, hooks), ready to be copied into `src/variants/xiangqi.js`;
- `perft.mjs`, `perft4.mjs`: the move generator against Fairy-Stockfish (see 7.1);
- `cases.mjs`: tests T1–T10 and Q1–Q9, all passing except the last check of Q8, whose expected danger value changed
  when the core gained change Q7 (converging captures count; 7.3 Q8 gives the new value);
- `repetition.mjs`: a simulation of the proposed core change for perpetual check (3.2), tests R1–R3;
- `fuzz.mjs`: 30 random games of 120 plies with splits, the computer tests and a self-play game;
- `render.mjs`: draws the layout of section 6 to SVG (`handoff/tmp/xiangqi/board.png`).

T11 and R4 (added by the source review, section 8.1) were computed on the same prototype by
`handoff/tmp/rev-rules-xiangqi/r4.mjs` (git-ignored scratch). Q10–Q12 and the soldier flag (added by the engine
review, section 8.2) were computed by `handoff/tmp/critic-xiangqi/checks.mjs`. The perpetual-check rule built in the
variant (3.2 (1)) was checked with R1–R4 by `handoff/tmp/critic-xiangqi/perpetual.mjs` (both git-ignored scratch).

A Fairy-Stockfish binary built from `handoff/ext/Fairy-Stockfish` (`largeboards=yes`) is in
`handoff/tmp/xiangqi/fsf-src/stockfish` (git-ignored).

---

## 1. Sources and chosen rule set

Web access worked for this research. The official rule book was downloaded and read page by page.

| Source | What it gives |
|---|---|
| **World Xiangqi Federation, "World Xiangqi Rules"** (2018 English edition), https://www.wxf-xiangqi.org/images/wxf-rules/2018_World_XiangQi_Rules_English2018.pdf (read; copy in `handoff/tmp/xiangqi/wxf2018.pdf`) | **The chosen classical rule set.** Art. 1.1 board (9 vertical × 10 horizontal lines, 90 intersections, river, palaces with two oblique lines). Art. 1.2 pieces and characters. Figure A the start array, Red at the bottom. Art. 2.1–2.7 the moves. Art. 2.8: "Friendly pieces cannot be captured by each other". Art. 2.9: "The Kings cannot be placed in the same file without any intervening piece". Art. 3.1.A: a player loses when checkmated, **stalemated** ("had no legal moves", 2.11) or after a "suicide" move (4.5: leaving the kings facing or the king capturable). Art. 3.2.A: a draw "if it is impossible for either player to win". Art. 3.2.B draw by repetition (the position "repeated four times" and neither player willing to vary), 3.2.D the natural movecount: "50 moves by both players without capture of any material"; Art. 8 (Movecount) says the same in plies: "If no piece were captured after completing one hundred moves by both players ... the game would be automatically ruled as a draw", with at most ten checks per player counted. Art. 4.1: "Red is to start the game". Art. 7.4: the English letters C H R E A P K. Art. 19.8: a perpetual check is "a player keeps checks on the opponent's King for every move made, causing a threefold repetition of position". Art. 20.1: "Under ALL circumstances, any player who delivers perpetual checks would be dealt with a loss. If both players delivered simultaneous perpetual checks, it would be ruled as a draw." Art. 20.2 and 20.10: draws (perpetual mating threats, alternating check with other moves, perpetual block, offer, exchange). Art. 20.3–20.9: the chase rules (protected pieces, real and fake roots, piece-type exceptions). The PDF is a scanned book; the review re-read it through OCR (section 8.1). |
| Wikipedia, "Xiangqi", https://en.wikipedia.org/wiki/Xiangqi (fetched) | The same moves; the characters per side (帥/帅 將/将, 仕 士, 相 象, 傌 馬, 俥 車, 炮 砲, 兵 卒); "it is a loss for the player who has no legal move"; the flying general: "the general to move crosses the board to capture the enemy general. In practice ... creating this situation ... means moving into check"; piece values after H. T. Lau: soldier 1 (2 after the river), advisor 2, elephant 2, horse 4, cannon 4, chariot 9. |
| Fairy-Stockfish `src/variant.cpp` (`minixiangqi_variant`, `xiangqi_variant_base`, `xiangqi_variant`), `position.h`, `position.cpp`, `apiutil.h`, `piece.cpp`, `types.h` (read; clone in `handoff/ext/`) | The rules as code, used by pychess. Start FEN `rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w`. Palace = files d–f × ranks 1–3 / 8–10; advisor = `F` in the palace; elephant = `nA` (lame alfil) on ranks 1–5 / 6–10; horse = `nN` (lame knight); cannon = `mRcpR`; soldier = `fsW`, sideways only from the enemy half (`soldierPromotionRank = RANK_6`). `flyingGeneral = true` (a move that leaves the generals facing is illegal). `stalemateValue = -VALUE_MATE` (stalemate loses). `perpetualCheckIllegal = true`, `nFoldRule = 3`: at the third repetition the side that checked on every move loses. `chasingRule = AXF_CHASING` only in `xiangqi`; `xiangqi_variant_base` (used by Manchu and Supply chess) has **no chase rule**. `nMoveRule` 50 (default) with `nMoveRuleTypes` = the orthodox pawn only, so only captures reset the counter (`position.cpp`, `do_move`). Insufficient material (`has_insufficient_material` in `apiutil.h`, the API that servers such as pychess call, not the engine's search): pieces that cannot reach the enemy king's region (advisors, elephants) never count as mating material; chariots, horses, cannons and soldiers always do. Values: soldier 200/270, advisor 420/450, elephant 300, horse 520/800, cannon 800/700 (mg/eg). |
| Fairy-Stockfish `tests/perft.sh` | Perft regression positions for xiangqi (start position depth 4 = 3290240, two more FENs). Our generator reproduces all of them (7.1). |
| pychess-variants `static/docs/xiangqi.md` (read in the clone) and https://www.pychess.org/variants/xiangqi (fetched) | The same rules for players, with the Western piece names (King/General, Advisor, Elephant, Horse, Chariot, Cannon, Pawn/Soldier), the AXF chase rules in brief, "the player that perpetually checks loses after three repetitions", WXF notation. pychess plays through Fairy-Stockfish. |
| GNU XBoard/WinBoard "Xiangqi rules", https://www.gnu.org/software/xboard/whats_new/rules/Xiangqi.html (fetched) | "Perpetual checking is forbidden, and the side that checks is ruled to lose on the 3rd repeat"; both sides checking is a draw; stalemate is a loss; kings may not face each other. |
| Chessvariants.com (`/xiangqi.html`) | HTTP 403, not read (still 403 at the review). |
| Lichess | Has no xiangqi. pychess is the lichess-style server for it and uses Fairy-Stockfish. |

**Chosen rule set: the WXF World Xiangqi Rules (2018) for everything on the board, with these adaptations for
Quantum Chess:**

1. **Capture the general instead of check and checkmate**, as in every variant of this app (the brief asks for it).
   Moves that leave your general capturable are allowed; the opponent may then capture it. This keeps every WXF result
   on the board:
   - a checkmated side must move and loses its general;
   - a **stalemated** side (every move exposes its general) must move and loses its general, so stalemate is still a
     loss (WXF 3.1.A.II);
   - the **flying general** rule (WXF 2.9) becomes a capture: a general may capture the enemy general along a file
     with nothing between them. A move that leaves the generals facing is a "suicide" (WXF 4.5): the opponent flies
     and wins. This is also how Wikipedia states the rule;
   - a side with **no move at all** (not even a suicidal one) loses at once (the `noMoves` hook).
2. **Perpetual check loses, chasing is free** (the simplification the brief asks for; **not built now**, see the
   status at the end of this point):
   - if the same position appears for the **third** time and exactly one player gave check with **every** move since
     its first appearance, that player loses (WXF 19.8 and 20.1, Fairy-Stockfish, XBoard, pychess);
   - every other repetition is a draw, including mutual perpetual check (WXF 20.1) and every kind of perpetual chase;
   - WXF 3.2.B rules a draw when "the position on the board was found to have been repeated four times" and neither
     player is willing to vary, and WXF 3.1.C and 3.1.H give the loss only when the player refuses to vary (3.1.C:
     after "a three-fold repetition of prohibitive moves and being warned by the arbiter"). The automatic decision at
     the third occurrence, as in Fairy-Stockfish (`nFoldRule = 3`), pychess and the classic Quantum Chess rules
     (XBoard also decides perpetual check "on the 3rd repeat"), is simpler;
   - the chase rules (WXF 20.3–20.9, the ones that make a perpetual chase lose) are dropped. They need "protected" and
     "real or fake root" judgements and piece-type exceptions that players cannot check at a glance, and that have no
     clear meaning when the chased piece or its protector is a ghost. Fairy-Stockfish's `xiangqi_variant_base` has no
     chase rule either. WXF 20.2 and 20.10 (perpetual mating threats, alternating check with other moves, perpetual
     block, offer and exchange) rule draws, which this rule gives too.
   This rule needs **no core change**: the variant can build it with the hooks `recordInfo` and `stateResult`, which
   the core has now (3.2 (1), checked on the real core). **Status:** the core plan (`handoff/CORE-CHANGES.md`, row 60
   and its section 5 note on this spec) rejects repetition as a core rule and asks this spec for the fallback. So
   until the lead accepts the variant-level rule (open question 1), the implementer builds the **fallback**: no
   repetition rule, and a perpetual check ends only as a draw by the 50-move rule or the move limit. That is a known
   deviation from WXF 20.1, where perpetual check loses; the rules card says so (section 5, sentence 8). Everything
   about repetition below (3.2 (1), R1–R4, the `perpetualCheck` and `repetition` reasons) applies only if the lead
   accepts 3.2 (1).
3. **Draws:**
   - the shared quiet rule: 50 moves by each side without a capture (`quietPlies` 100; WXF 3.2.D "50 moves by both
     players", Art. 8 "one hundred moves by both players", i.e. 100 plies). Only a capture resets the counter: the
     soldier **must** get `resetsQuiet: false` (the type flag of core change Q8, 3.2 (2)); without it the core's
     default (`solid && !royal`) would reset the count on every soldier move, which WXF does not do (test T11).
     WXF Art. 8 also says that at most ten checks by a player count toward this total. That detail is dropped (a check
     is often only a chance here). Fairy-Stockfish applies it only in `xiangqi` together with the AXF chase rule, not
     in `xiangqi_variant_base`;
   - the move limit (`maxPly` 600);
   - **no piece left that can cross the river**: neither side has a chariot, horse, cannon or soldier. Advisors and
     elephants never leave their own half and the generals never leave their palaces, so nobody can ever capture
     anything again (WXF 3.2.A "impossible for either player to win"; Fairy-Stockfish counts the same pieces as
     insufficient material). Exception: if the generals face each other on an open file at that moment, the game goes
     on, because the player to move captures the other general;
   - repetition (point 2; only with 3.2 (1)).

Where the sources differ:

- **Characters.** The WXF text (Art. 1.2) prints the simplified set (帅 车 马 炮 仕 相 兵 / 将 车 马 砲 士 象 卒)
  and says both simplified and traditional characters may be used; its start diagram (Figure A) uses traditional
  characters with 車 and 馬 for both sides. We use the traditional set that is **different for every piece of the two
  sides** (the brief's choice; Wikipedia lists it and notes that some traditional sets use 車 and 馬 for both
  colours): 帥 仕 相 傌 俥 炮 兵 for Red and 將 士 象 馬 車 砲 卒 for Black.
- **Square names.** The WXF numbers files 1–9 from each player's right. We use the coordinate names of Fairy-Stockfish
  and pychess's move codes: files `a`–`i` from Red's left, ranks `1`–`10` from Red's side (`e1` is Red's general,
  `e10` Black's).

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- The pieces stand on the **intersections** ("points") of 9 vertical and 10 horizontal lines. All 90 points exist.
- **Coordinates** `[file, rank]`, 0-based: file 0–8 = `a`–`i` from Red's left, rank 0–9 = `1`–`10` from Red's side.
  `a1 = [0, 0]`, `e1 = [4, 0]`, `i10 = [8, 9]`. Square name = file letter + rank number (`a10`, `e5`).
- Red (side 0) sits at the bottom and moves "up" (+rank). Black (side 1) sits at the top.
- **River**: between ranks 5 and 6. Red's half is ranks 1–5, Black's half ranks 6–10. A piece has **crossed the
  river** when it stands on the enemy half.
- **Palaces**: files d–f × ranks 1–3 (Red: d1 e1 f1 d2 e2 f2 d3 e3 f3) and files d–f × ranks 8–10 (Black), each drawn
  with the diagonals d1–f3, f1–d3 and d8–f10, f8–d10.
- Points some pieces can ever reach (useful for test positions; other placements are unreachable):
  - advisors: Red d1 f1 e2 d3 f3; Black d10 f10 e9 d8 f8;
  - elephants: Red c1 g1 a3 e3 i3 c5 g5; Black c10 g10 a8 e8 i8 c6 g6;
  - generals: the 9 points of their palace;
  - soldiers: never behind their start rank (Red ranks 4–10, Black 1–7). On their own half they stand only on the
    files a, c, e, g, i (they cannot step sideways before crossing); across the river every point is reachable.

### 2.2 Pieces and movement

Vectors are `[dfile, drank]` for Red; "oriented" vectors are mirrored for Black (`drank` negated, the default
`orient`). Letters are the WXF abbreviations; they are also the type ids (section 3).

| Piece (WXF) | Red / Black | Descriptor | Rule |
|---|---|---|---|
| General K | 帥 / 將 | `leap [[1,0],[-1,0],[0,1],[0,-1]]`, `region: own palace` | One point orthogonally, never out of the palace. **Flying general** (extra move): if the enemy general stands on the same file with no piece between them, the general captures it (2.4). |
| Advisor A | 仕 / 士 | `leap [[1,1],[1,-1],[-1,1],[-1,-1]]`, `region: own palace` | One point diagonally, along the palace diagonals (the only 5 points it can reach). |
| Elephant E | 相 / 象 | `leap [[2,2],[2,-2],[-2,2],[-2,-2]]`, `via v → [v/2]`, `region: own half` | Exactly two points diagonally. Blocked by any piece on the point in between ("the elephant's eye"). Never crosses the river. |
| Horse H | 傌 / 馬 | `leap` the 8 knight jumps, `via [±1,±2] → [0,±1]`, `[±2,±1] → [±1,0]` | One point orthogonally, then one diagonally outwards. Blocked by any piece on that first point ("hobbling the horse's leg"). Two horses can attack each other asymmetrically. |
| Chariot R | 俥 / 車 | `ride [[1,0],[-1,0],[0,1],[0,-1]]` | Any distance orthogonally, like a rook. |
| Cannon C | 炮 / 砲 | `ride` orthogonal with `mode: 'move'` + `hop` orthogonal | Moves like a chariot without capturing. Captures only by jumping over **exactly one** piece of either colour (the "screen" or "cannon mount") to the first piece behind it, which must be an enemy. |
| Soldier P | 兵 / 卒 | `leap [[0,1]]` oriented + `leap [[1,0],[-1,0]]` with `when: crossed the river` | One point forward; after crossing the river also one point sideways. Never backwards. No promotion: on the last rank it only moves sideways. |

- Every piece captures the way it moves, except the cannon. A piece never captures its own side (WXF 2.8).
- WXF 2.8 says that every piece except the general may be captured, because a general is checkmated, never taken.
  Here the general can be captured, and capturing it wins (section 1, 2.5).

### 2.3 Setup (every point)

The WXF array (Figure A), Fairy-Stockfish FEN `rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w`:

| Side | Rank | Pieces |
|---|---|---|
| Red | 1 | Ra1 Hb1 Ec1 Ad1 Ke1 Af1 Eg1 Hh1 Ri1 |
| Red | 3 | Cb3 Ch3 |
| Red | 4 | Pa4 Pc4 Pe4 Pg4 Pi4 |
| Black | 7 | pa7 pc7 pe7 pg7 pi7 |
| Black | 8 | cb8 ch8 |
| Black | 10 | ra10 hb10 ec10 ad10 ke10 af10 eg10 hh10 ri10 |

Red moves first (WXF 4.1). There is no extra state (no castling, no en passant, no counters): `x = {}`.

FEN letters map to our type ids as `r→r, n→h, b→e, a→a, k→k, c→c, p→p` (upper case = Red).

### 2.4 Special moves

- **Flying general.** If both generals stand on one file with no piece between them, the side to move may play
  `general-from-to` onto the enemy general and capture it (for example `d1-d10`). In the WXF rules the move that
  creates this position is forbidden (2.9) and loses at once as a "suicide" (4.5), so the flying capture is never
  played. With capture-the-general the move that creates it is legal but loses: the opponent flies next.
- There is no castling, no double step, no en passant, no drop and no promotion.

### 2.5 End of the game (as adapted, section 1)

- **Win**: capture the enemy general (reason `general`), including by the flying general.
- **Loss**: the side to move has no move at all (reason `noMoves`, the opponent wins).
- **Loss**: perpetual check at the third repetition (reason `perpetualCheck`; only with 3.2 (1), not in the fallback).
- **Draw**:
  - no chariot, horse, cannon or soldier on the board, unless the generals face each other on an open file (reason
    `noAttackers`);
  - a third repetition without perpetual check (reason `repetition`; only with 3.2 (1));
  - 50 moves by each side (100 plies) without a capture (`quiet`; soldier moves do not reset the count, 3.2 (2)),
    and the move limit (`moveLimit`).
- In the fallback (built now, without 3.2 (1)) there is no repetition rule: a perpetual check or any other
  repetition ends only through `quiet` or `moveLimit`.
- Turn order: Red, Black, Red, ...

---

## 3. Engine mapping for the core as built

The prototype `handoff/prototypes/xiangqi/xiangqi.mjs` is the complete declaration and can be copied (it needs the
SPDX header, JSDoc and lint fixes). It predates core change Q8, so three things differ from this section: add
`resetsQuiet: false` to `p`, add the `quiet` case to `reasonText`, and in the fallback leave out its
`perpetualCheck` text; its `rules` is empty (use section 5). Sketch:

```js
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const glyph = (red, black) => ({ text: (side) => (side === 0 ? red : black), shape: 'xiangqi' })

const spec = {
	id: 'xiangqi',
	category: 'regional',
	sides: [
		{ id: 'r', name: () => t('quantumchess', 'Red'), color: 'red' },
		{ id: 'b', name: () => t('quantumchess', 'Black'), color: 'black' },
	],
	topology,                                          // makeTopology, point cells (section 6)
	types: {
		k: { moves: [{ leap: ORTHO, region: (side, to) => inPalace(side, to) }], royal: true, value: 0, glyph: glyph('帥', '將') },
		a: { moves: [{ leap: DIAG, region: (side, to) => inPalace(side, to) }], value: 200, glyph: glyph('仕', '士') },
		e: { moves: [{ leap: DIAG.map(([f, r]) => [2 * f, 2 * r]), via: (v) => [[v[0] / 2, v[1] / 2]],
			region: (side, to) => ownHalf(side, to) }], value: 200, glyph: glyph('相', '象') },
		h: { moves: [{ leap: KNIGHT_JUMPS,
			via: (v) => (Math.abs(v[0]) === 2 ? [[Math.sign(v[0]), 0]] : [[0, Math.sign(v[1])]]) }],
			value: 400, glyph: glyph('傌', '馬') },
		r: { moves: [{ ride: ORTHO }], value: 900, glyph: glyph('俥', '車') },
		c: { moves: [{ ride: ORTHO, mode: 'move' }, { hop: ORTHO }], value: 450, glyph: glyph('炮', '砲') },
		p: { moves: [{ leap: [[0, 1]], oriented: true },
			{ leap: [[1, 0], [-1, 0]], when: (side, from) => !ownHalf(side, from) }],
			solid: true, resetsQuiet: false, value: 100, glyph: glyph('兵', '卒') },   // resetsQuiet: 3.2 (2)
	},
	setup: () => startWorld(),                         // 2.3, x = {}
	extraMoves(w, side) { ... },                       // the flying general, below
	worldResult(w) { ... },                            // below
	noMoves: (state) => ({ winner: 1 - state.turn, reason: 'noMoves' }),
	reasonText(reason) { ... },                        // general, noAttackers, quiet (+ perpetualCheck, repetition: 3.2 (1))
	evaluate(w, side) { ... },                         // +100 per soldier across the river, below
	rules: () => [...],                                // section 5
}
export default defineVariant(spec)
```

(Every type also gets `name: () => t('quantumchess', 'General' | 'Advisor' | 'Elephant' | 'Horse' | 'Chariot' |
'Cannon' | 'Soldier')`.)

| Field | Value |
|---|---|
| `sides` | Red (side 0, `color: 'red'`, bottom, moves first), Black (side 1, `color: 'black'`, rotated 180° by default) |
| `teams`, `enemies`, `orient` | none / default / default (side 1 negates the rank) |
| `topology` | `makeTopology` over `[f, r]`, f 0–8, r 0–9, names `a1`…`i10`, point cells (section 6) |
| royal | `k` |
| solid | `k` (royal), `p` |
| `resetsQuiet` | `p: { ..., resetsQuiet: false }` (type flag of core change Q8, 3.2 (2)): only captures reset the quiet counter. Required: the default would reset it on soldier moves (T11) |
| splittable | `a`, `e`, `h`, `r`, `c` (the default `!solid`) |
| values (centipawns) | soldier 100 (+100 across the river through `evaluate`), advisor 200, elephant 200, horse 400, cannon 450, chariot 900, general 0. These are Lau's values from Wikipedia ×100; the cannon gets 450 instead of 400 so the computer prefers it in the opening, where it is stronger (Fairy-Stockfish also rates the cannon above the horse in the middlegame). The general's value never matters: both generals are on the board in every running world. |
| `options` | none |
| `extraMoves` | the flying general (below) |
| `filterMoves`, `afterMove`, `onCapture`, `measured` | none (default capture: off the board) |
| `worldResult` | below |
| `noMoves` | the side to move loses: `{ winner: 1 - state.turn, reason: 'noMoves' }`. The generic text "no legal move" reads "Black wins (no legal move)". |
| `reasonText` | `general` → "a general was captured"; `noAttackers` → "no piece left that can cross the river"; `quiet` → "50 moves by each side without a capture" (the generic text says "without a capture or a pawn move", which is wrong here); only with 3.2 (1): `perpetualCheck` → "perpetual check" and `repetition` → "the same position for the third time" (the generic `reasonText` has no `repetition` case and would show the raw code); return null otherwise |
| `evaluate(w, side)` | +100 for every own soldier on the enemy half, −100 for every enemy one (Lau: a soldier is worth 2 after the river) |
| `maxPly`, `quietPlies` | defaults 600 and 100 |

**Flying general** (`extraMoves`): from the side's general, walk forward along its file (`[0, 1]` for Red,
`[0, −1]` for Black; the enemy palace is always ahead). At the first occupied point: if it holds the enemy general,
`pushMove(V, w, out, general, from, to, enemyGeneral, 'fly')`; stop in any case. The key is an ordinary move key
(`e2-e9`); no ordinary general move can have that key (the palaces are at least five ranks apart). The move kind
`fly` is not a certain kind (`isCertain` is false), so the flying general rolls like any general move. `generate`
includes extra moves, so `royalDanger` (the danger ring), the computer and the fuzz test see the flying general. (The
general never merges: only splittable pieces do.) `attacks()`/`givesCheck()` in world.js do **not**
(descriptor moves only): code that needs "is the general attacked" must use `generate`.

**`worldResult(w)`**:

```js
worldResult(w) {
	const alive = [false, false]
	let attackers = false                               // a chariot, horse, cannon or soldier of either side
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sq[id] < 0) continue
		if (w.ty[id] === 'k') alive[w.sd[id]] = true
		else if ('rhcp'.includes(w.ty[id])) attackers = true
	}
	if (!alive[0] || !alive[1]) {
		return alive[0] === alive[1] ? { winner: null, reason: 'general' } : { winner: alive[0] ? 0 : 1, reason: 'general' }
	}
	if (!attackers && !facing(w)) return { winner: null, reason: 'noAttackers' }
	return null
}
```

`facing(w)`: both generals on one file and every point between them empty. (Both generals missing cannot happen;
the branch is only a safety net.)

### 3.1 Why no other hook is needed

- The cannon (`hop`), the lame leapers (`via`), the palace and the river (`region`, `when`) are core descriptors.
  `linesOf` caches the lines per type, side and point; the region and `when` functions depend only on those.
- The soldier's sideways step depends only on its own point, so it is a `when` condition, not an extra move.
- The move generator was checked against Fairy-Stockfish with a "general may not be capturable" filter (7.1). It
  matches in every tested position, including the depth-4 regression positions.

### 3.2 Core changes needed (none) and the repetition rule

**(1) Repetition and perpetual check, built in the variant (no core change).** The variant core has no repetition
rule, and `handoff/CORE-CHANGES.md` (row 60) rejects one. Xiangqi does not need it: the rule can be built with two
hooks that exist now. `recordInfo(prev, code, branch, next)` (core change Q9) returns JSON that the core stores as
`info` on the new history record; undo replays the game through `applyOutcome`, which calls it again.
`stateResult(state)` is called by `stateAfter` after every move that `worldResult` did not end, also in the
computer's search. Exact semantics (checked on the real core by `handoff/tmp/critic-xiangqi/perpetual.mjs`: R1–R4 pass):

- *Position hash* of a state: a 53-bit string hash (for example cyrb53 in base 36) of the side to move plus every
  world's `worldKey(b)` with its weight, in the core's sorted order. "Same position" therefore means the same pieces
  with the same chances, as in the classic rules (docs/rules.md 6). A hash keeps each record small (about 40 bytes);
  the core plan rejected full keys because of their size.
- `recordInfo` returns `{ rep: { p: next.ply, h: hash(next), c } }` with `c = 1` when
  `royalDanger(V, next, next.turn) > 0` (the move **gave check**, with any chance) and 0 otherwise. The record of the
  first move of a game (`prev.history.length === 0`) also gets `h0: hash(prev)`, so the start position counts as an
  occurrence.
- `stateResult(next)` returns null unless `next.quiet >= 8` (a third occurrence needs two returns of at least 4 plies
  each). The window is the plies `from = next.ply - next.quiet` up to `next.ply`: only captures reset the counter
  (2), and no position can repeat across a capture. The *known positions* come from every history record with
  `info.rep`: the position `h` at ply `p` (made by the record's `side`, with its flag `c`), and for the first record
  also the position `h0` at ply `p - 1`. Only plies with `from <= ply < next.ply` count, so the current move's own
  record never counts, whatever order the core calls the two hooks in. With fewer than two known positions whose ply
  differs from `next.ply` by an even number (the same side to move), return null without hashing. Otherwise hash
  `next`; with fewer than two known positions of that hash, return null.
- Else the new position occurs for the **third** time. The *cycle* is every known move with a ply after the earlier
  of the last two occurrences, plus the current move (side `1 - next.turn`, flag `c` computed now from
  `royalDanger(V, next, next.turn)`). For each side, `perpetual[s]` = the side made at least one move in the cycle and every one of them
  has `c = 1`. If exactly one side is perpetual, that side loses (`{ winner: other, reason: 'perpetualCheck' }`);
  otherwise it is a draw (`{ winner: null, reason: 'repetition' }`).
- In the computer's search (`light` mode) the searched plies get no history record. At a reply node the computer's
  own searched move is therefore missing from the cycle and is left out; a missing ply never hides an occurrence,
  because its side to move differs. On R1's line after 6 plies, `a10-a9` followed by `d9-d10` in light mode gives
  `{ winner: 1, reason: 'perpetualCheck' }` at the reply node.
- The result does not wait when the player to move could capture the enemy general for certain: the core's other
  draws do not wait either (`CORE-CHANGES.md` row 72).
- Known limitation: `worldKey` contains piece ids, so two pieces of one type that swapped places do not count as the
  same position. This is rare, and a canonical relabelling across the worlds is not worth its cost.
- `reasonText` needs `perpetualCheck` and `repetition` (section 3 table).
- Cost: one `royalDanger` per real move in `recordInfo`, and a hash only when the filter passes. 30 random games
  (2,969 plies) took 124 ms; a 40-ply self-play game at level normal took 459 ms (442 ms without the hooks).
- **Status:** `CORE-CHANGES.md` row 60 and its section 5 note ask this spec for the fallback ("sentence 7 of its
  rules card takes the fallback"), because a core rule was the only way considered. The variant-level rule removes
  that reason, but building it is the lead's decision (open question 1). The repetition rule would decide a **loss**
  here (WXF 20.1), not only a draw, so the deviation is larger than in other variants. **Until the lead accepts
  3.2 (1), the implementer builds the fallback below.**
- **Fallback (to build now):** no repetition rule, no `recordInfo` or `stateResult`, no `perpetualCheck` or
  `repetition` reason. A perpetual check is then a draw after 50 moves by each side without a capture (`quiet`) or at
  the move limit: a known deviation from WXF 20.1. The rules card uses sentences 7 and 8 of section 5, and tests
  R1–R4 are left out.

**(2) The quiet counter counts captures only (core change Q8, now in the core).** WXF 3.2.D and Art. 8 count "50
moves by both players without capture of any material". By default the core resets the counter on moves of solid
non-royal pieces, which are the soldiers here. `handoff/CORE-CHANGES.md` item Q8 (DO) adds the type flag
`resetsQuiet` (default `solid && !royal`); it is already in `src/variants/core/variant.js` (`V.quietTypes`). Xiangqi
sets `resetsQuiet: false` on `p`, so only a capture resets the counter. This is a rules requirement on its own (WXF),
not only a helper for (1): test T11 (7.2) checks it.
- Fairy-Stockfish does the same: its `nMoveRuleTypes` default is the orthodox pawn only, and the xiangqi soldier is a
  different piece type, so a soldier move never resets `rule50`.
- With (1) this is required, not optional: a soldier on the enemy half steps sideways back and forth, so a soldier
  can give perpetual check with reversible moves. If each soldier move reset the counter, the repetition window of
  (1) would be empty and such a perpetual check would never be punished (R4, 7.4).
- There is no fallback to build any more: Q8 is in the core. (Only on a core without Q8 would soldier moves reset
  the counter; the `quiet` text would then have to say "without a capture or a soldier move".)

No core change is needed. The layout (point cells, lines, areas), the `xiangqi` disc glyph, the lame leapers, the
cannon, regions, the `resetsQuiet` flag and the hooks of (1) already exist.

---

## 4. Quantum adaptation

The shared quantum rules apply unchanged: split, merge, measure, land = roll, pass = link, the solid roll, the
game-end roll, budget 8 and at most 4 squares per piece. Everything below follows from the per-world move generation
of the core; the decisions are written out so that players and tests can rely on them.

**X-1. Solid and splittable pieces.**
- **Generals and soldiers are solid**, like kings and pawns in Quantum Chess. They never split, and all their moves
  are settled at once, with a roll if needed.
  - The general is royal.
  - The soldier plays the pawn's role: a probe that moves one point and is never a ghost. Its sideways moves depend
    on which side of the river it stands, and a solid soldier stands there for certain.
- **Advisors, elephants, horses, chariots and cannons can split and merge.**
  - This is the orthodox rule "every piece except the king and the pawns".
  - A split only uses quiet moves of the piece, so it respects the regions: an advisor splits to two palace points,
    an elephant to two points on its own half.
  - Rejected alternative: solid advisors and elephants. They would make the rule longer to explain, and ghost
    defenders are a real defensive resource: a ghost advisor blocks a horse leg in half of the possibilities.

**X-2. Lame leapers (horse leg, elephant eye).** The blocking point counts as a point the piece *passes*.
- A ghost on it blocks only in the possibilities where it is really there.
- If the target is empty for certain, nothing is rolled: the piece moves where the leg is free and stays where it is
  blocked, and it is **linked** to the blocker (pass = link, Q4).
- If the target might be occupied, the move is rolled (land = roll). With a ghost on the leg and a ghost on the target
  there are three results: Missed where the leg is blocked, Moved or Captured where it is free (Q12).
- A split whose leg is blocked in some possibilities sends that half nowhere: it stays home (Q4, Q7).

**X-3. The cannon.** The screen and the target are found **in each possibility separately**.
- A ghost screen gives the cannon its capture only in the possibilities where the screen stands there (Q1).
- Two pieces in between (in some possibility) also mean no capture there.
- A cannon capture lands on a point that holds a piece, so the move is measured (land = roll): it is rolled whenever
  the possibilities disagree, and certain when it captures in every possibility (T1 `b3-b10`). The results are
  Captured / Moved / Missed:
  - **Moved**: no screen and an empty target, so the cannon simply slides there;
  - **Missed**: the cannon is not really on its point; or no screen and an occupied target; or a screen and then
    no enemy piece on the target (it is empty, holds an own piece, or a second piece stands in between).
- A quiet cannon move past a ghost is pass = link, like a chariot's (Q1).
- One piece can never be both screen and target: a ghost 50% b6 / 50% b9 cannot be captured by a cannon on b3 in
  either possibility, so `b3-b9` is not offered (Q2).
- Your own ghost can be the screen.
- Converging capture: two cannon parts may merge onto an enemy piece. Each part captures in the possibilities where
  it has a screen. The move is rolled unless it captures in every possibility (Q11). The danger ring counts it.

**X-4. The flying general.**
- It is a general move, so it is always settled at once (solid mover). It captures in the possibilities where the file
  is open and misses where something stands between the generals (Q3).
- A ghost standing between the generals is only a partial shield: with a 50% blocker, the enemy flies with a 50%
  chance.
- The danger ring counts the flying general (Q3, T8).
- Moving the last certain blocker off the file is allowed but shows 100% danger (T8), just as walking into check
  does in Quantum Chess.

**X-5. Soldiers.** A soldier step onto a point where a piece might be is rolled (Moved / Captured / Missed, Q5).
Soldiers make good probes.

**X-6. Palace and river** are properties of points, so they are the same in every possibility. A ghost part of an
advisor or elephant is always on a legal point for it.

**X-7. Winning, losing and drawing.**
- The general is solid, so its capture is always decided by the move's own roll (or is certain).
- **"No piece left that can cross the river"** can differ between possibilities: for example, the last chariot is a
  ghost and was captured in some of them. Then the game-end roll decides between "Draw" and "The game goes on" (Q9).
- **The facing exception** can differ too. A ghost between the generals (with no attacker left, only an advisor or an
  elephant can stand there) blocks the file in some possibilities only. When the last attacker goes, the
  game-end roll decides between the draw and a game in which the generals face each other for certain, and the
  player to move then flies and wins (Q10).
- **No move at all** means no ordinary move in any possibility, no merge and no measure. A side with a ghost can
  always measure, so only fully solid positions can end this way (T9).
- **Stalemate as the WXF defines it** (every move exposes the general) needs no rule: the player must move and loses
  the general.
- **Perpetual check** (only with 3.2 (1)): a position repeats only if every possibility and every chance repeats. "Gave check"
  means the move left the enemy general in danger with **any** chance above 0% (the ring shows a percentage). A
  50% ghost check still forces a defence, so it counts as a check.

**X-8. Budget.** Unchanged: at most 8 arrangements of your own pieces. Links from horse legs, elephant eyes and cannon
screens count like any other link.

**Summary for players.** Generals and soldiers are always solid; every other piece can split. A ghost blocks a horse,
an elephant or a sliding piece only where it really is. A cannon captures only in the possibilities where it has
exactly one screen. A general may fly to capture the enemy general along an open file, and a ghost on that file is
only a partial shield.

---

## 5. Player-facing rules text (for `rules()`)

Each line is one `t('quantumchess', '…')` string (8 lines as built, see below; the ones about the moves are needed
because players may not know xiangqi):

1. Pieces stand on the points where the lines cross. Red moves first. The river divides the board, and each side has a
   palace: the 3 × 3 points marked with two diagonal lines.
2. The general 帥/將 steps one point straight and never leaves its palace. Advisors 仕/士 step one point diagonally
   along the palace's diagonal lines.
3. Elephants 相/象 move exactly two points diagonally and never cross the river. Horses 傌/馬 move one point straight,
   then one diagonally outwards. Both are blocked by a piece on the point they pass, and a ghost blocks them only
   where it really is.
4. Chariots 俥/車 move like rooks. Cannons 炮/砲 move like rooks too, but capture only by jumping over exactly one
   piece of either colour. A ghost works as that screen only in the possibilities where it is really there.
5. Soldiers 兵/卒 step one point forward, and also sideways once they have crossed the river. They never move back and
   never promote. Generals and soldiers are always solid; every other piece can split.
6. Capture the enemy general to win. If the two generals stand on one file with nothing between them, the player to
   move may fly along the file and capture the other general. A ghost between them shields only where it really is.
7. If you have no move at all, you lose. It is a draw when no chariot, horse, cannon or soldier is left and the
   generals do not face each other, or after 50 moves by each side without a capture.
8. Unlike standard xiangqi, there is no repetition rule: perpetual check does not lose.

Sentences 7 and 8 are the fallback that is built now (no repetition rule, 3.2 (1)). Only if the lead accepts
3.2 (1), sentence 8 is dropped and sentence 7 becomes: "If you have no move at all, you lose. If a position appears
for the third time, the player whose every move since its first appearance left the enemy general in danger loses;
otherwise it is a draw. It is also a draw when no chariot, horse, cannon or soldier is left and the generals do not
face each other, or after 50 moves by each side without a capture." ("In danger" is what the danger ring shows: any
chance above 0 %, open question 2.)

The shared rules card (`sharedRules()` in `src/variantplay/texts.js`) is shown next to these sentences. Its split and
solid sentences name kings and pawns "and the pieces the variant names", which sentence 5 does; its castling and
en passant sentence does not apply to xiangqi (harmless: the card takes no variant argument).

---

## 6. UI layout

Drawn with the existing generic board (`VariantBoard.vue`: areas, lines, `point` cells, `xiangqi` discs). A rendering
of the prototype layout is in `handoff/tmp/xiangqi/board.png` (`render.mjs`).

**Cells.** One `point` cell per intersection: `cell([f, r]) = { x: f + 0.5, y: 9.5 − r, w: 1, h: 1, shape: 'point',
shade: 'light' }` (x, y = the centre). Layout `width 9`, `height 10`. Red (side 0) is at the bottom, and Black's view
is turned 180° (the default `rotate`).
- Use the shade `light` (or any shade without a CSS rule). A shade such as `wood` or `dark` has a CSS rule with two
  classes that beats `.qc-vboard__shape--point`, so it would paint a filled disc on every point.
- The marks (selected, target dot or ring, last move, part, danger) already have point styles or fill the point's
  transparent circle, which is fine.

**Areas** (drawn first):
- `{ x: 0, y: 0, w: 9, h: 10, shade: 'wood' }`: the wooden board;
- `{ x: 0.5, y: 4.5, w: 8, h: 1, shade: 'river' }`: the river band (light blue `#cfe3ea`) between the rank-5 and rank-6
  lines.

**Lines** (colour `#5d4222`, the existing `.qc-vboard__line`), with `X(f) = f + 0.5` and `Y(r) = 9.5 − r`:
- 10 rank lines: `X(0)…X(8)` at `Y(r)`, r = 0…9;
- the files a and i: full length, `Y(0)…Y(9)`;
- the files b–h: two pieces, `Y(0)…Y(4)` and `Y(5)…Y(9)` (they do not cross the river);
- the palace diagonals: `(X(3),Y(0))–(X(5),Y(2))`, `(X(5),Y(0))–(X(3),Y(2))`, `(X(3),Y(7))–(X(5),Y(9))`,
  `(X(5),Y(7))–(X(3),Y(9))`.
- Optional: the small corner marks of printed boards at b3 h3 a4 c4 e4 g4 i4 and b8 h8 a7 c7 e7 g7 i7. Each is an
  L-shaped pair of segments 0.15 long, 0.07 from the point, in each quadrant that lies on the board.

**Labels.**
- Files `a`–`i` under the board at `(X(f), 10.2)`, ranks `1`–`10` left of it at `(−0.2, Y(r))`. These are the names
  used in the move codes.
- Leave out the traditional river inscription (`楚 河` / `漢 界`) with the layout API as built. Labels are drawn after
  the cells, so above the pieces, in the page's muted text colour (`--color-text-maxcontrast`, font size 0.32): at
  `y = 5` the text would overlap the discs on ranks 5 and 6 by about 0.04 (a disc has radius 0.378, its edge is 0.122
  from the middle of the river), and it has little contrast on the light blue river in the dark theme. It is
  decoration only; it could come back with a label style that draws under the cells.
- No zoom: 9 × 10 is below the zoom threshold.

**Pieces.** Glyph `{ text: (side) => …, shape: 'xiangqi' }`: the existing round cream disc (`#f6e7c8`) with a double
ring. Red's ink is `#b71c1c` (the side colour `red`) and Black's is `#1b1b1b`. One character per piece, font size 0.5
of the disc:

| Type | Red | Black | English name (screen reader) |
|---|---|---|---|
| `k` | 帥 | 將 | General |
| `a` | 仕 | 士 | Advisor |
| `e` | 相 | 象 | Elephant |
| `h` | 傌 | 馬 | Horse |
| `r` | 俥 | 車 | Chariot |
| `c` | 炮 | 砲 | Cannon |
| `p` | 兵 | 卒 | Soldier |

- **Accessibility.** The two sides differ by **character** as well as by ink colour, so colour is never the only clue.
  Every piece type has a different character. The accessible cell label is the point and the English type name,
  "e1: General" (`cellLabel` in `VariantBoard.vue`, from `types[].name`). It does not name the side, in this and every
  other variant, and the board has no tooltip. Naming the side ("e1: Red General") would be a small generic UI change
  in `cellLabel`, not a core change and not needed for this variant (8.2).
- **Fonts.** The characters are in every common CJK font. 傌 (U+508C) and 俥 (U+4FE5) are rarer, but they are in the
  Noto CJK, Microsoft JhengHei/YaHei and PingFang fonts. The shared `.qc-vpiece__text` rule (`VariantPiece.vue`,
  shared with shogi) already has a stack: `'Noto Serif CJK JP', 'Noto Serif SC', 'Hiragino Mincho ProN', 'Songti SC',
  serif`. Browsers fall back per character, so a character missing from those fonts comes from any installed CJK
  font. Adding `"Noto Serif CJK TC", "Microsoft JhengHei", "PingFang TC"` before `serif` is optional (a shared UI
  file, not this variant's module).
- Ghost parts are faded with their percentage badge as usual. There is room for it: a disc has radius 0.38 on a
  1-unit grid.

---

## 7. Test cases

Notation:
- Pieces are written `Kd1 He5` for Red and `kf10 hd7` for Black, with the type letters K A E H R C P.
  In `stateOf` placements this is `{ d1: '0:k', e5: '0:h', f10: '1:k', d7: '1:h' }`.
- Worlds are listed with their relative weight. `x = {}`. Red is to move unless stated.
- In a case with several worlds the pieces are listed **in the same order in every world**. `worldFrom` numbers the
  pieces in placement order, so this gives each piece the same id in every world (a ghost is one id in several
  places). Keep that order in the placements.
- The shared helper `stateOf(V, worlds, turn, edit)` (`tests/js/variants/helpers.js`) writes the orthodox
  `x = { ep: -1, epVictim: -1, castle: [] }` into every world of a 2D board unless an `edit` is given, and it runs
  `edit` on every world. Xiangqi never reads `x`, so every value below holds either way (checked for Q1, Q4, Q7, Q9);
  pass `() => {}` to keep `x = {}`.
- "Outcomes" lists `key p` in the core's order, and **R** marks a rolled branch.
- "Moves of X" lists the targets of the ordinary moves from that point, sorted by name.
- Every expected value below was produced by the prototype on the real core (`cases.mjs`, `repetition.mjs`,
  `fuzz.mjs`; T11 and R4: `handoff/tmp/rev-rules-xiangqi/r4.mjs`). Re-run by the source review on the core of
  2026-09-25 17:30: all pass except the old Q8 danger value, corrected below (core change Q7). Re-run by the engine
  review (8.2) on the core of the same day: `cases.mjs` (all pass but the old Q8 value, which `cases.mjs` still
  holds), `perft.mjs` (all 7 positions equal to Fairy-Stockfish), `fuzz.mjs` (pass); T11 with the real soldier
  flag, Q10–Q12 and the helper notes above: `handoff/tmp/critic-xiangqi/checks.mjs` and `xcheck.mjs`.

### 7.1 Move generation against Fairy-Stockfish (`perft.mjs`, `perft4.mjs`)

The core generator, with the filter "after the move the opponent cannot capture your general (flying included)",
equals Fairy-Stockfish's legal-move perft in every position (every first move's count compared):

| Position (FEN) | Depth | Nodes |
|---|---|---|
| start | 1 / 2 / 3 / 4 | 44 / 1920 / 79666 / 3290240 |
| `1rbaka2R/5r3/6n2/2p1p1p2/4P1bP1/PpC3Bc1/1nPR2P2/2N2AN2/1c2K1p2/2BAC4 w` | 3 / 4 | 100326 / 4485547 |
| `4kcP1N/8n/3rb4/9/9/9/9/3p1A3/4K4/5CB2 w` | 3 / 4 | 3707 / 92741 |
| `3k5/9/9/9/9/9/9/9/9/4K4 w` (flying general) | 3 | 6 |
| `4k4/4a4/9/9/9/9/9/9/4A4/3K5 b` | 3 | 89 |
| `3akab2/9/4b4/9/2p1c1p2/9/9/4C4/4A4/3AK4 w` (cannons, soldiers) | 3 | 179 |
| `4k4/9/9/9/9/9/9/9/2p1p1p2/3K5 w` (classical stalemate of Red) | 1 | 0 |

The depth-4 counts are the published regression values in Fairy-Stockfish `tests/perft.sh`. The implementer's test
can keep depth 1–3 of the start position (44, 1920, 79666): with the filter above this takes about 0.5 s.

### 7.2 Classical rules

**T1. Start position.**
- 44 ordinary moves. The moves of each piece:
  - b1 horse: `a3 c3`;
  - c1 elephant: `a3 e3`;
  - d1 advisor: `e2`;
  - e1 general: `e2`;
  - e4 soldier: `e5`;
  - a1 chariot: `a2 a3`;
  - b3 cannon: `a3 b10 b2 b4 b5 b6 b7 c3 d3 e3 f3 g3`.
- `b3-b10`: `capture 1.0`, over the screen b8. `b3-b8` is illegal: there is no screen.
- Budgets 1 / 1.

**T2. Hobbling the horse.**
- Red Kd1 He5 Pd6; Black kf10 hd7.
  - Moves of e5: `c4 c6 d3 d7 f3 f7 g4 g6`. `e5-d7`: `capture 1.0`.
  - With Black to move, the moves of d7 are `b6 b8 c9 e9 f6 f8`. The leg d6 blocks both c5 and e5, so `d7-e5` is
    illegal. Only one horse can capture the other.
- Red Kd1 He5 Cd5; Black kf10 pe6: the moves of e5 are `d3 f3 g4 g6` (legs e6 and d5 blocked).

**T3. Elephant: eye and river.**
- Red Kd1 Ec5; Black kf10: the moves of c5 are `a3 e3`. a7 and e7 are across the river.
- Red Kd1 Ec5; Black kf10 pd4 ra3: the moves of c5 are `a3` only (eye d4). `c5-a3`: `capture 1.0`.
- Red Kd1 Ee3; Black kf10: the moves of e3 are `c1 c5 g1 g5`.

**T4. Cannon: exactly one screen.**
- Start position, `h3-e3`, `h10-g8`.
- `e3-e7`: `capture 1.0`, over Red's own soldier e4.
- `e3-e10` is illegal (two screens). `e3-e5` is illegal (a cannon cannot pass e4 without capturing).

**T5. Soldiers.**
- Red Kd1 Pe4 Pa6 Pi10; Black kf10 pe5.
  - e4 (own half): `e5` only;
  - a6 (crossed): `a7 b6`;
  - i10 (last rank): `h10`.
- Black to move, same position: the moves of e5 are `d5 e4 f5`.

**T6. Palace.** Red Kd3 Ae2; Black kf10.
- The moves of d3 are `d2 e3`.
- The moves of e2 are `d1 f1 f3`: d3 is taken by the general.

**T7. The flying general.**
- Red Kd1 Ra1; Black kd10 ri10: `d1-d10`: `capture 1.0`, result `{ winner: 0, reason: 'general' }`.
- With a black cannon on d5, `d1-d10` is illegal.

**T8. Opening the file is suicide.** Red Kd1 Rd5 Ra1; Black kd10 ri10.
- `royalDanger(Red) = 0`.
- Play `d5-h5`: this is legal. After it, `royalDanger(Red) = 1`.
- Black `d10-d1`: `capture 1.0`, result `{ winner: 1, reason: 'general' }`.

**T9. No move at all loses.** Black to move. Red Ke1 Ad1 Af1 Ce2; Black kd10 pd2 pf2 pe4.
- Black plays `e4-e3`. Red now has no ordinary move, no merge and no measure, so the result is
  `{ winner: 1, reason: 'noMoves' }`.
- Control: with the black soldier on e5 instead, `e5-e4` leaves the result null, because Red still has `e2-e3`.

**T10. No piece left that can cross the river.**
- Red Kf2 Ad1; Black kd9 pe2.
  - `f2-e2`: `capture 1.0`.
  - Result `{ winner: null, reason: 'noAttackers' }`.
- The same with the black general on e9 instead of d9.
  - After `f2-e2` the generals face each other on the open e-file, so the result is null.
  - Black's `e9-e2`: `capture 1.0`.

**T11. Soldier moves do not reset the 50-move count** (WXF 3.2.D, Art. 8; needs `resetsQuiet: false` on `p`).
Red Kf1 Ra9 Pe9; Black kd10; `quiet` 0.
- Line `e9-d9 d10-e10 d9-e9 e10-d10 e9-d9 d10-e10 d9-e9 e10-d10`: every move is legal and nothing is captured.
  - After `e9-d9` Black's moves are `d10-d9 d10-e10`; after `e9-d9 d10-e10 d9-e9` they are `e10-d10 e10-e9 e10-f10`.
- After ply 8: `quiet = 8`, result null. With the core default (a soldier move resets the count) it would be 1.

### 7.3 Quantum interactions

**Q1. A ghost screen for the cannon (land = roll), and pass = link.** Two worlds, ½ each:
- {Kd1 Cb3; kf10 hb6 rb9}
- {Kd1 Cb3; kf10 hd6 rb9}

Moves:
- `b3-b9`: `miss 0.5 R | capture 0.5 R`.
  - Captured: {Kd1 Cb9 kf10 hb6}.
  - Missed: {Kd1 Cb3 kf10 hd6 rb9}.
- `b3-b8`: `move 1.0`, not rolled. The cannon becomes `b3 0.5, b8 0.5`, linked to the horse, and Red's budget is 2.
- `b3-b6`: `miss 0.5 R | move 0.5 R`. The target might hold the horse.

**Q2. A ghost is never its own screen.** Two worlds, ½ each:
- {Kd1 Cb3; kf10 hb6}
- {Kd1 Cb3; kf10 hb9}

Moves:
- `b3-b9` is illegal: it misses in both worlds.
- `b3-b6`: `miss 0.5 R | move 0.5 R`.

**Q3. The flying general across a ghost blocker.** Black to move. Two worlds, ½ each:
- {Kd1 Rd5 Ra1; kd10 ri10}
- {Kd1 Rh5 Ra1; kd10 ri10}

Results:
- `royalDanger(Red) = 0.5`.
- `d10-d1`: `miss 0.5 R | capture 0.5 R`.
  - Captured: result `{ winner: 1, reason: 'general' }`.
  - Missed: {Kd1 Rd5 Ra1 kd10 ri10}. The chariot is now 100% on d5.

**Q4. A ghost on the horse's leg.** Two worlds, ½ each:
- {Kd1 He5; kf10 re6}
- {Kd1 He5; kf10 ra6}

Moves:
- `e5-d7`: `move 1.0`, not rolled. The horse becomes `e5 0.5, d7 0.5`, linked to the chariot.
- Split `e5-d7|f7`: both halves stay home where e6 is blocked. The horse becomes `e5 0.5, d7 0.25, f7 0.25`, and
  Red's budget is 3.

**Q5. Soldiers are solid.** Two worlds, ½ each:
- {Kd1 Pe6 Pe5; kf10 hd6}
- {Kd1 Pe6 Pe5; kf10 hd8}

Moves:
- `e6-d6`: `move 0.5 R | capture 0.5 R`.
- `e5-d5` is illegal: e5 has not crossed the river.
- `splitsFrom(e6)` is empty.

**Q6. The advisor splits inside the palace.** Red Ke1 Ae2; Black kf10 ra10.
- `splitsFrom(e2)` = `e2-d1|d3, e2-d1|f1, e2-d1|f3, e2-d3|f3, e2-f1|d3, e2-f1|f3`. The target order in a code
  follows the point index.
- `splitsFrom(e1)` (general) is empty.

**Q7. An elephant split with a ghost on one eye.** Two worlds, ½ each:
- {Kd1 Ee3; kf10 hd4}
- {Kd1 Ee3; kf10 hi6}

Results:
- `e3-c5|g5` gives the elephant `e3 0.25, c5 0.25, g5 0.5`, and Red's budget is 3. The half that goes through the
  blocked eye stays home.
- No split of e3 has a target across the river.

**Q8. Converging capture of the general: preparation beats dice.** Two worlds, ½ each:
- {Kd1 Ra9; ke9}
- {Kd1 Re5; ke9}

Results:
- `a9|e5-e9`: `capture 1.0`, not rolled. Result `{ winner: 0, reason: 'general' }`.
- A single part, `a9-e9`: `miss 0.5 R | capture 0.5 R`.
- `royalDanger(Black) = 1`: the danger ring counts converging captures (merges) since core change Q7
  (`handoff/CORE-CHANGES.md` item 27b; generic, not specific to xiangqi). On the core before Q7 it was 0.5.

**Q9. The game-end roll on "no piece left that can cross the river".** Two worlds, ½ each:
- {Ke2 Ad1; kd9 he3 ra8}
- {Ke2 Ad1; kd9 re3}. Here the black horse is off the board: it was captured in this world earlier.
- To build it with the shared helper (one `edit` for every world), write the second world as {Ke2 Ad1; kd9 hg8 re3}
  and pass `edit = (b) => { const id = b.board[g8]; if (id >= 0) placePiece(b, id, OFF) }` (g8 = the index of `g8`):
  only that world has a piece on g8, and the horse keeps its id.

Results:
- `e2-e3`: `capture 0.5 R [end:null] | capture 0.5 R [end:{"winner":null,"reason":"noAttackers"}]`.
- The second branch ends the game as a draw. In the first, the game goes on with the chariot on a8.

**Q10. The facing exception with a ghost blocker.** Two worlds, ½ each (the red advisor is a ghost e2 / f3):
- {Kd1 Ae2; ke10 pe1}
- {Kd1 Af3; ke10 pe1}

Results:
- Before the move `royalDanger(Red) = 1` (the soldier `e1-d1`).
- `d1-e1` (the general takes the last attacker):
  `capture 0.5 R [end:{"winner":null,"reason":"noAttackers"}] | capture 0.5 R [end:null]`.
  - First branch: {Ke1 Ae2 ke10}, result `{ winner: null, reason: 'noAttackers' }` (the advisor blocks the file).
  - Second branch: {Ke1 Af3 ke10}, result null, Black to move, `royalDanger(Red) = 1`. Black's `e10-e1`:
    `capture 1.0`, result `{ winner: 1, reason: 'general' }`.

**Q11. Converging capture with cannons: each part needs its own screen.**
- (a) Two worlds, ½ each: {Kd1 Pe5 Ce3; ke8 ad8} and {Kd1 Pe5 Ca8; ke8 ad8}. The screens are the red soldier e5 (for
  the part on e3) and the black advisor d8 (for the part on a8).
  - The merges of the cannon are `e3|a8-a3` and `e3|a8-e8` (a merge code lists the lower point index first).
  - `e3|a8-e8`: `capture 1.0`, not rolled. Result `{ winner: 0, reason: 'general' }`.
  - A single part, `e3-e8`: `miss 0.5 R | capture 0.5 R`.
  - `royalDanger(Black) = 1`.
- (b) Four worlds, ¼ each: the soldier is gone and a black horse ghost e6 / g6 is the e-file screen:
  {Kd1 Ce3; ke8 ad8 he6}, {Kd1 Ce3; ke8 ad8 hg6}, {Kd1 Ca8; ke8 ad8 he6}, {Kd1 Ca8; ke8 ad8 hg6}.
  - Budgets 2 / 2.
  - `e3|a8-e8`: `miss 0.25 R | capture 0.75 R`. Missed: {Kd1 Ce3 ke8 ad8 hg6} (the part on e3 had no screen).
  - `e3-e8`: `miss 0.75 R | capture 0.25 R`; `a8-e8`: `miss 0.5 R | capture 0.5 R`.
  - `royalDanger(Black) = 0.75`.

**Q12. A ghost on the horse's leg and a ghost on the target.** Four worlds, ¼ each (the black chariot is a ghost
e6 / a6, the black horse a ghost d7 / b8):
- {Kd1 He5; kf10 re6 hd7}, {Kd1 He5; kf10 re6 hb8}, {Kd1 He5; kf10 ra6 hd7}, {Kd1 He5; kf10 ra6 hb8}

Results:
- `e5-d7`: `miss 0.5 R | move 0.25 R | capture 0.25 R`. Moved: {Kd1 Hd7 kf10 ra6 hb8}. Missed keeps the two worlds
  with the chariot on e6.
- `e5-f7` (same leg e6, target empty for certain): `move 1.0`, not rolled. The horse becomes `e5 0.5, f7 0.5`
  (pass = link).

### 7.4 Repetition (only with 3.2 (1), not built in the fallback)

Simulated as a core rule in `repetition.mjs` and, R4, `r4.mjs`; checked with the variant-level hooks of 3.2 (1) on
the real core in `handoff/tmp/critic-xiangqi/perpetual.mjs` (R1–R4 pass; results are null on every earlier ply).

**R1. Perpetual check loses.** Red Kf1 Ra9; Black kd10.
- Line: `a9-a10 d10-d9 a10-a9 d9-d10 a9-a10 d10-d9 a10-a9 d9-d10`. Every Red move gives check:
  `royalDanger(Black) = 1` after `a9-a10`.
- After ply 8 the start position appears for the third time. Result `{ winner: 1, reason: 'perpetualCheck' }`.

**R2. Plain repetition draws.** Red Kf1 Ra1; Black kd10 ri10.
- Line: `f1-f2 d10-d9 f2-f1 d9-d10`, twice.
- After ply 8: `{ winner: null, reason: 'repetition' }`.

**R3. Checking on only some moves draws.** Red Kf1 Ra9; Black kd10 ri8.
- Line: `a9-a10 d10-d9 a10-b10 i8-i7 b10-a10 i7-i8 a10-a9 d9-d10 a9-a10 d10-d9`.
- The position after ply 2 appears for the third time after ply 10. Red's `a10-b10` in between was not a check, so
  the result is `{ winner: null, reason: 'repetition' }`.

**R4. Perpetual check by a soldier** (needs 3.2 (1) and (2)). The position and line of T11.
- Every Red move gives check (`royalDanger(Black) = 1` after each), no Black move does.
- After ply 8 the start position appears for the third time, and all 8 plies are inside the window (`quiet = 8`), so
  the result is `{ winner: 1, reason: 'perpetualCheck' }`.
- With soldier moves resetting the count, `quiet` is 1 after ply 8, the window holds one earlier position only, and
  the repetition is never seen.

### 7.5 Robustness and the computer (`fuzz.mjs`)

- **Fuzz.** 30 random games of 120 plies, every third move a random split, ran in 1.2 s. The largest state had 64
  worlds. Throughout: no error; both budgets ≤ 8; solid pieces equal in every world; both generals present in every
  world of a running game; no legal move after a result. 5 games ended with a captured general.
- **Computer.**
  - Red Kd1 Ra1; Black kf10 ra7 hi10: `chooseMove` at level normal plays `a1-a7`, the free chariot.
  - Red Kd1 Ra1; Black kd10 ra7: at level easy it plays `d1-d10`, the flying general.
  - A 40-ply self-play game at level normal took 0.4 s.

---

## Open questions

1. **The perpetual-check rule, 3.2 (1), built in the variant.** Without it, perpetual check is only a draw after 50
   moves by each side, the largest deviation from WXF in this spec. It needs **no core change**: `recordInfo` and
   `stateResult` exist, and the rule passes R1–R4 on the real core at a small cost. `handoff/CORE-CHANGES.md` row 60
   rejected a core rule (record size), which a 53-bit hash avoids; its section 5 note asks this spec for the
   fallback. Recommendation: accept 3.2 (1) for xiangqi (then drop sentence 8 of section 5, use the alternative
   sentence 7, add R1–R4 and the two reason texts). Until the lead decides, the fallback is built. The same two hooks
   would give shogi's sennichite or a threefold-repetition draw to any variant without a core change.
2. **Which chance counts as "check"** for perpetual check? This spec says any chance above 0%. "100% (the red ring)"
   would let 50%-ghost perpetual checks go unpunished.
3. **Classic "king cannot escape".** The variant core does not implement the classic rule that you lose at once when
   every move leaves your king to be captured for certain. If it is added generically, xiangqi needs no change: it
   would end checkmates and WXF stalemates one move earlier. Status: rejected for now (`CORE-CHANGES.md` row 72).
   A side effect of its absence: a checkmate or stalemate given by the 100th quiet ply ends as the `quiet` draw
   before the general can be taken (the core checks `quiet` before `noMoves`), whereas Fairy-Stockfish lets a
   checkmate on that ply win. This is rare and is accepted as part of the same deviation.
4. **Letters instead of characters.** Players who cannot read the characters might want Western letters (K A E H R C
   P, like pychess's "internationalised" set). A glyph only knows its side, not a user setting, so this needs a small
   UI change: for example an optional `glyph.alt` letter, chosen by a board preference. Status: later
   (`CORE-CHANGES.md` row 69). The letters are WXF Art. 7.4's: C H R E A P K.
5. **Move notation.** The move list uses coordinate codes (`h3-e3`). Xiangqi players read WXF notation (`C2=5`, WXF
   Art. 7.4). The UI hook `codeText(code)` exists now (U17) but sees only the code, and WXF needs the position before
   the move. `recordInfo(prev, ...)` sees that position, so a WXF text could be stored in `info` and shown by
   `infoText`, as an extra line under the move. Not needed for play. Status: later (`CORE-CHANGES.md` row 69).
6. **Core change 3.2 (2).** Resolved: soldier moves do not reset the 50-move counter (WXF 3.2.D and Art. 8,
   Fairy-Stockfish). The flag is in the core; `p` sets `resetsQuiet: false` and T11 checks it. It is not harmless
   to leave out: with the default, the count would differ from WXF in every game with soldier moves.

---

## 8. Review notes

### 8.1 Source review

Adversarial review 1 (lens: rules fidelity), 2026-09-25. Every classical rule was checked against the WXF rule book
(the PDF is a scanned book: its pages were rendered and read through OCR, the diagrams by eye; scratch in
`handoff/tmp/rev-rules-xiangqi/`, git-ignored), Wikipedia, pychess and the Fairy-Stockfish source in `handoff/ext/`.
Chessvariants.com still answers HTTP 403; the XBoard page answered 429/403, so its perpetual-check sentences were
confirmed through a search-engine extract only.

**Changes**

| # | Where | Change | Why | Source |
|---|---|---|---|---|
| 1 | 1 (WXF row), 1 point 2 | Art. 20.2 and 20.10 are now listed as draw rules, the chase rules as 20.3–20.9 (was "20.2–20.10" in the table and "20.2–20.9" in the text) | 20.2 (perpetual mating threat, alternating check and chase or idle) and 20.10 (block, offer, exchange) rule draws, not losses; only 20.3–20.9 make a chase lose | WXF 2018, Art. 20, https://www.wxf-xiangqi.org/images/wxf-rules/2018_World_XiangQi_Rules_English2018.pdf (PDF pages 46–47) |
| 2 | 1 point 2 | "3.1.C / 20.1 punish perpetual check only after an arbiter's warning" became 3.1.C and 3.1.H | 20.1 says "Under ALL circumstances" a perpetual checker loses; the warning comes from 3.1.C ("after a three-fold repetition of prohibitive moves and being warned by the arbiter") and 3.1.H ("has to change his moves or be penalized with a loss") | WXF 2018, Art. 3.1.C, 3.1.H, 20.1 (PDF pages 14–15, 46) |
| 3 | 1 (WXF row), 1 point 3, 2.5 | Added Art. 3.2.A's wording, the fourfold detail of 3.2.B, Art. 8 ("one hundred moves by both players", i.e. 100 plies, at most ten checks counted) and Art. 7.4's letters | The spec cited 3.2.D only; Art. 8 confirms that `quietPlies` 100 is the WXF count and that only captures reset it | WXF 2018, Art. 3.2, 7.4, 8 (PDF pages 15–16, 23–25) |
| 4 | 1 point 3, 2.5, 3 (table), 3.2 (2), open question 6 | `resetsQuiet: false` on the soldier is now required, not optional; the "core without Q8" fallback texts are marked obsolete | WXF counts only captures; so does Fairy-Stockfish (`nMoveRuleTypes` = orthodox pawn only, `do_move` resets `rule50` only on captures, drops, promotions and those types). The core default (`solid && !royal`) would reset on soldier moves. Q8 is already in `src/variants/core/variant.js` (`V.quietTypes`) | WXF 2018 Art. 3.2.D, 8; Fairy-Stockfish `src/variant.h` (`nMoveRuleTypes`, `nMoveRule`), `src/position.cpp` (`do_move`), https://github.com/fairy-stockfish/Fairy-Stockfish |
| 5 | 1 point 2, 3.2 (1), 2.5, 5, open question 1 | The repetition rule is now plainly "not built": the implementer builds the fallback; sentence 7 of the rules card is the fallback, and a new sentence 8 tells players that perpetual check does not lose here. The repetition wording is kept as the alternative if 3.2 (1) is accepted later | `handoff/CORE-CHANGES.md` row 60 rejects repetition and names xiangqi's hook; the old text made the repetition sentence the default. Players who know WXF 20.1 expect perpetual check to lose, so the deviation belongs on the card | WXF 2018 Art. 19.8, 20.1; `handoff/CORE-CHANGES.md` row 60 |
| 6 | 5, sentence 7 | The draw sentence now names the facing-generals exception and the 50-move rule | 2.5 and `worldResult` keep the game going when the generals face each other; the shared rules card does not mention the 50-move rule | spec 2.5; `src/variantplay/texts.js` (`sharedRules`) |
| 7 | 5, sentences 1 and 2 | "the nine points marked with a cross" became "the 3 × 3 points marked with two diagonal lines"; advisors move "along the palace's diagonal lines" | "Cross" could be read as the small corner marks of printed boards; WXF 1.1 defines the palace by its two oblique lines, and 2.2 has the advisor move "along the diagonal lines in the palace" | WXF 2018 Art. 1.1, 2.2 (PDF pages 9, 12) |
| 8 | 1 (Characters) | Added that WXF's Figure A uses 車 and 馬 for both sides, and replaced "the most common set" (unsupported) by Wikipedia's note that some traditional sets use 車/馬 for both colours | Accuracy of the source statement; the chosen character set is unchanged | WXF 2018 Art. 1.2 and Figure A (PDF pages 10–11); https://en.wikipedia.org/wiki/Xiangqi (Pieces) |
| 9 | 1 (Fairy-Stockfish row) | Insufficient material is Fairy-Stockfish's API function `has_insufficient_material` (`apiutil.h`), used by servers, not a rule of its engine; chariots, horses, cannons and soldiers always count as mating material | Precision: the engine itself never adjudicates insufficient material in xiangqi | Fairy-Stockfish `src/apiutil.h` |
| 10 | 7.2 T11 (new) | Test: the soldier perpetual-check line gives `quiet = 8` (1 with the core default) | Pins change 4 on the core as built | Prototype + `handoff/tmp/rev-rules-xiangqi/r4.mjs`; `t11.mjs` there runs it on a copy of the declaration with the real `resetsQuiet: false` flag (`quiet` 8) |
| 11 | 7.4 R4 (new) | Test R4 (perpetual check by a soldier) written out | 3.2 referred to R4 but 7.4 had only R1–R3 | same script |
| 12 | 7.3 Q8 | `royalDanger(Black)` 0.5 → 1 | The core now has change Q7 (the danger ring counts converging captures); `cases.mjs` fails its old value on the current core. Not a classical rule, but the test would fail as written | `src/variants/core/quantum.js` (`royalDanger`, `mergeDanger`); `handoff/CORE-CHANGES.md` item 27b |
| 13 | Open questions 1, 3, 4, 5, 6 | Status lines from the core plan; open question 3 notes that the `quiet` draw is checked before `noMoves`, so a mate on the 100th quiet ply is a draw here (Fairy-Stockfish lets that checkmate win, `is_optional_game_end`) | Unambiguous status for the implementer; a small deviation made explicit | `handoff/CORE-CHANGES.md` rows 60, 69, 72; `src/variants/core/quantum.js` (`stateAfter`); Fairy-Stockfish `src/position.cpp` |

**Checked and found correct (no change)**

- Board, river and palaces (WXF 1.1), 90 points, square names; start array against WXF Figure A and the
  Fairy-Stockfish FEN (`xiangqi_variant_base`, `startFen`).
- Every piece's movement against WXF 2.1–2.7 and Fairy-Stockfish's definitions (`piece.cpp`: cannon `mRcpR`, soldier
  `fsW` with `soldierPromotionRank = RANK_6`, horse `nN`; `variant.cpp`: advisor `FERS` and general limited to the
  palace, elephant limited to ranks 1–5 / 6–10). The reachable points of advisors and elephants in 2.1 equal
  Fairy-Stockfish's Supply-chess regions (`supply_variant`). No promotion, no castling, no double step, no drop.
- Flying general (WXF 2.9, 4.5 "suicide"; Fairy-Stockfish `flyingGeneral = true`; Wikipedia), stalemate is a loss
  (WXF 2.11, 3.1.A.II; `stalemateValue = -VALUE_MATE`; Wikipedia; pychess), Red moves first (WXF 4.1), perpetual check
  loses at the third repetition in Fairy-Stockfish (`perpetualCheckIllegal`, `nFoldRule = 3`, `is_optional_game_end`
  checks every move since the first of the three occurrences, as 3.2 (1) does) and pychess ("the player that
  perpetually checks loses after three repetitions", https://www.pychess.org/variants/xiangqi), mutual perpetual
  check is a draw (WXF 20.1).
- The "no piece left that can cross the river" draw: WXF 3.2.A. With only generals, advisors and elephants no capture
  other than the flying general is possible (none of them can enter the enemy palace or half), and the general always
  has an empty neighbouring point in its palace (its own two advisors cannot fill all of them, and elephants never
  stand on them), so a side is never left without a move. Fairy-Stockfish's `has_insufficient_material` treats the
  same material as a draw.
- Lau's values on Wikipedia: soldier 1/2, advisor 2, elephant 2, horse 4, cannon 4, chariot 9 (the spec's 450 for the
  cannon is a stated choice); Fairy-Stockfish's values (`types.h`).
- WXF letters K A E H R C P (Art. 7.4) and notation example `C2=5` (Art. 7.4).
- Re-run on the current core: `perft.mjs` (all 7 positions at depth 3 equal to the Fairy-Stockfish binary; start
  position 44 / 1920 / 79666), depth 4 of `4kcP1N/8n/3rb4/9/9/9/9/3p1A3/4K4/5CB2 w` = 92741 (Fairy-Stockfish
  `tests/perft.sh`), `cases.mjs` (T1–T10 and Q1–Q9 pass except the old Q8 danger value), `repetition.mjs` (R1–R3 pass),
  `fuzz.mjs` (pass; 30 games, 5 captured generals). T1–T10 and R1–R3 were also worked through by hand.

### 8.2 Engine review

Adversarial review 2 (lens: engine and quantum consistency), 2026-09-25. Read against the core as built
(`src/variants/core/quantum.js`, `world.js`, `variant.js`, `ai.js`, `topology.js`), the UI that draws and words it
(`src/variantplay/texts.js`, `glyphs.js`, `components/VariantBoard.vue`, `components/VariantPiece.vue`), the test
helper `tests/js/variants/helpers.js`, docs/rules.md, `handoff/IMPLEMENTING.md` and `handoff/CORE-CHANGES.md`. Every
test of section 7 was re-run on the current core; the new ones were computed there. Scratch (git-ignored):
`handoff/tmp/critic-xiangqi/checks.mjs` (T11 with the real soldier flag, Q10–Q12, Q9 through one `edit`, T9, a
certain cannon capture), `xcheck.mjs` (Q1, Q4, Q7, Q9 with the helper's orthodox `x`), `perpetual.mjs` (3.2 (1) built
in the variant: R1–R4, the light-mode reply node, cost), `ai-baseline.mjs`.

**Changes**

| # | Where | Change | Why |
|---|---|---|---|
| 1 | Header, 1 point 2, 3.2 (1), 5, 7.4, open question 1 | The perpetual-check rule is rewritten as a rule **built in the variant** with the existing hooks `recordInfo` (core change Q9) and `stateResult`: a 53-bit position hash per history record, the capture-only window, the cycle and the check flags, the computer's light-mode search, the cost. The fallback stays the build until the lead accepts it; open question 1 recommends it | The spec said the rule "needs a small core change". It does not: `recordInfo` stores JSON on each record and is recomputed on replay, and `stateResult(next)` runs after every move, also in the search. R1–R4 pass on the real core (`perpetual.mjs`), the light-mode reply node gives `perpetualCheck`, and a 40-ply self-play game took 459 ms instead of 442 ms. `CORE-CHANGES.md` row 60 rejected a *core* rule because full keys are large (about 20 KB per ply); a hash avoids that. The old proposal also let the repetition draw "wait like the other draws", but the core's draws never wait (row 72). The build decision is left to the lead because the plan's section 5 note asks this spec for the fallback |
| 2 | 3 (intro) | The prototype is not a complete copy: it lacks `resetsQuiet: false` on `p` and the `quiet` reason text, and it has the `perpetualCheck` text | The spec said the prototype "is the complete declaration and can be copied". A verbatim copy fails T11 (`quiet` 1 instead of 8) and shows "without a capture or a pawn move" |
| 3 | 3 (table, sketch) | `repetition` reason text added next to `perpetualCheck` (only with 3.2 (1)) | The generic `reasonText` in `texts.js` has no `repetition` case (`default: return reason`), so the raw code would be shown |
| 4 | 3 (flying general) | "merges" removed from what sees the flying general; stated that the kind `fly` is not certain and why its key never collides | Only splittable pieces merge. `isCertain` is true only for the kinds `castle` and `ep` (or the `certain` field), so the fly rolls as a general move, as X-4 says |
| 5 | 4 X-3 | "A cannon capture ... is always a roll" became: measured (land = roll), rolled when the possibilities disagree, certain when it captures in all of them; the Missed list now names the ghost cannon, an own piece and a second piece in between | T1's `b3-b10` is `capture 1.0`, not rolled (`linkOrRoll` does not roll a single result); the old Missed list left cases out |
| 6 | 4 X-2, X-3, X-7 | Pointers to Q10–Q12; X-7 gets the facing exception with a ghost blocker | With no attacker left, a ghost advisor or elephant between the generals makes `facing` true in some worlds only, so `worldResult` differs and the game-end roll decides between the draw and a lost general (Q10). The spec did not say so |
| 7 | 5, sentence 6 | Added "A ghost between them shields only where it really is." | The partial shield is the one quantum trap of the flying general (X-4, Q3, T8); sentences 3 and 4 say the same for the leg, the eye and the screen |
| 8 | 5, alternative sentence 7 | Keeps "and the generals do not face each other" (the fallback sentence had it, the alternative had lost it); "gave check" became "left the enemy general in danger"; a note on the shared rules card | Consistency with 2.5 and `worldResult`; in this core a check is `royalDanger > 0`, which is what the danger ring shows, and the card never defines "check" |
| 9 | 6, labels | The river inscription is now "leave out" instead of optional | `VariantBoard.vue` draws labels after the cells, above the pieces, in `--color-text-maxcontrast` at font size 0.32: the text overlaps the discs on ranks 5 and 6 by about 0.04 and has little contrast on the river in the dark theme |
| 10 | 6, accessibility | The cell label is "e1: General" (no side) and there is no tooltip | `cellLabel` uses `typeName` only; the spec promised "e1: Red General" |
| 11 | 6, fonts | The shared stack of `.qc-vpiece__text` exists already; adding TC fonts is optional | `VariantPiece.vue` has `'Noto Serif CJK JP', 'Noto Serif SC', 'Hiragino Mincho ProN', 'Songti SC', serif`; browsers fall back per character |
| 12 | 7, notation; Q9 | Pieces in the same order in every world; the shared helper's orthodox `x` and its one `edit` for every world; how to build Q9 with it | `worldFrom` numbers pieces in placement order, so a different order gives a ghost two ids. `helpers.js` writes `{ ep, epVictim, castle }` into 2D worlds when no `edit` is given and runs `edit` on every world, so Q9's "horse off in world 2 only" could not be built as written. Checked: the values do not change (`xcheck.mjs`) |
| 13 | 7.3 Q10 (new) | The facing exception with a ghost blocker: `d1-e1` rolls draw against "game goes on", then `e10-e1` wins | The riskiest untested interaction of the `noAttackers` draw with the game-end roll |
| 14 | 7.3 Q11 (new) | Converging captures with cannons: certain with a screen for each part (danger 1), rolled with a ghost screen (`miss 0.25 R \| capture 0.75 R`, danger 0.75) | X-3's converging-capture rule and the danger ring through `hop` (core change Q7) had no test |
| 15 | 7.3 Q12 (new) | A horse with a ghost on its leg and a ghost on its target: `miss 0.5 R \| move 0.25 R \| capture 0.25 R`; the same leg towards a certainly empty point links | X-2's "if the target might be occupied, the move is rolled" had no test; Q4 covers only the link |
| 16 | 7 (provenance) | Re-run results of this review | `cases.mjs` still holds the old Q8 value (the spec's value 1 is right), `perft.mjs` equals Fairy-Stockfish on all 7 positions, `fuzz.mjs` passes |

**Checked and found consistent (no change)**

- The mapping of section 3 works with the core as built: `hop`, `via`, `region`, `when` (`linesOf` caches per type,
  side and point), `extraMoves` inside `generate` (so `royalDanger`, the computer and the fuzz test see the flying
  general), `worldResult`, `noMoves` (called with the new state, whose `turn` is the stuck side), `reasonText`,
  `evaluate`, `resetsQuiet` (read into `V.quietTypes` by `defineVariant`). `stateAfter` checks `worldResult`, then
  `stateResult`, `quiet`, `maxPly`, then `noMoves`; open question 3 describes the one consequence.
- Section 4 against `quantum.js`: `isMeasured` (a solid mover or a target that may hold another piece measures; a part
  joining its own other part does not), `linkOrRoll` (pass = link, budget fallback), `splitBranches` (quiet targets
  only, the blocked half stays home, at most 4 points), `mergeBranches` (rolled when the target may hold an enemy),
  `settle` (solid roll, then the game-end roll grouped by `worldResult`), `royalDanger` with `mergeDanger`. Every
  capture of the general lands on its point, so it is measured, and a merge onto it is rolled; the capture of a
  general is therefore always the move's own roll (X-7). Consistent with docs/rules.md 2–7 apart from the documented
  deviations: no "king cannot escape", no waiting draws, no move at all loses, only captures reset the count, no
  repetition in the fallback.
- Budget and world bound: `fuzz.mjs` reaches 64 worlds with both budgets at most 8, solid pieces equal in every world
  and both generals in every running world.
- Layout: the padding of 0.7 holds the labels at −0.2 and 10.2; the zoom threshold is `width × height > 200`; the
  shades `wood` and `river` and the point cell styles exist in `VariantBoard.vue`; `glyphOf` gives the cream disc and
  the ink `#b71c1c` for the side colour `red`.
- The rules card sentences 1–5, 7 and 8 match sections 2 and 4, and fit next to the shared card.
- T1–T11 and Q1–Q9 re-run on the current core: all pass (Q8 with the value 1).

**Core changes needed**

None. The fallback needs none, and 3.2 (1) built in the variant needs none either.

UI notes (not core, optional): naming the side in `cellLabel` (generic, every variant); TC fonts in the shared
`.qc-vpiece__text` stack; a label style drawn under the cells, if the river inscription is wanted.
