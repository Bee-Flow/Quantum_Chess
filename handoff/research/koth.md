# Variant spec: `koth` (King of the Hill)

Category: `rules`. UI name: "King of the Hill". Summary line (already in `catalog.js`): "Bring your king to one of
the four centre squares to win."

---

## 1. Sources and chosen rule set

Research note: the original research session could not open web pages and worked from search-engine extracts. The
source review (section 8.1) later fetched the pages below and read the scalachess and Fairy-Stockfish source; the
quotations in this table are now verbatim. Every test case in section 7 was run on a prototype built on the real
`src/variants/core` (`handoff/prototypes/c960/proto.mjs`, `tkoth.mjs`; K4's second position and K12 were added and
run in the source review), and the classical cases were cross-checked with python-chess's `KingOfTheHillBoard`. The
engine review (section 8.2) re-ran K1-K12 on a prototype written exactly from section 3
(`handoff/tmp/critic-koth/proto.mjs`, `tests.mjs`) and added K13-K18 (`extra.mjs`, `check2.mjs`, `k18.mjs`). Its
second pass ran K1-K21 as assertions on the core in the working tree, with the planned core changes of
`handoff/CORE-CHANGES.md` already in it (`proto2.mjs`, `run2.mjs`, `extra2.mjs`, `k18b.mjs`, `fuzz2.mjs`), and added
K19-K21.

| Source | What it gives |
|---|---|
| lichess.org, https://lichess.org/variant/kingOfTheHill ("Bring your King to the center to win the game.") | The lichess rules, verbatim: "All the Laws of FIDE chess apply. In particular, a move is legal if and only if it would have been legal in FIDE chess. If you make a legal move that moves your King to one of the center squares (d4, d5, e4, e5) you win." Clarifications: "The winning move has to be legal, e.g. you can not move into check. Checkmating your opponent is another legal way to win." |
| scalachess (the lichess rules engine), `core/src/main/scala/variant/KingOfTheHill.scala`, https://github.com/lichess-org/scalachess | Standard start position and standard move legality. `specialEnd`: the king of the side that just moved stands on `Bitboard.center` = `0x1818000000` (d4, e4, d5, e5). Insufficient material is never declared (`isInsufficientMaterial`, `opponentHasInsufficientMaterial` and `playerHasInsufficientMaterial` are all `false`). `Position.status` checks checkmate, then the variant end (hill), then stalemate, then the automatic draws (50-move rule at 100 half-moves, fivefold repetition). |
| Fairy-Stockfish, `src/variant.cpp` `kingofthehill_variant()` | Chess with `flagPiece = KING`, flag region d4/e4/d5/e5 for both sides, `flagMove = false` (reaching the region wins at once; no extra move is granted to the opponent). |
| pychess.org, https://www.pychess.org/variants/kingofthehill | The same text as lichess ("If you legally move your King to one of the center squares (d4, d5, e4, e5) you win"). |
| chess.com, https://www.chess.com/terms/king-of-the-hill and https://support.chess.com/en/articles/8594498-what-is-king-of-the-hill-koth | The same four squares and the immediate win; "Games can still end in the traditional ways of checkmate, stalemate, and time-out." |
| Wikibooks, https://en.wikibooks.org/wiki/Chess_Variants/King_of_the_Hill | The same rules: "The move that places their king on the hill must be legal, so a king cannot move into check to get to the hill." |
| lichess user study "King of the hill rules" (by Papai506), https://lichess.org/study/i5qz9rbK/nwrsOrrK | A community study, not an official rules page: "you can win by bringing your king to any of the Blue marked squares [d4, e4, d5, e5], or checkmating." |
| chessvariants.com, "King of the Mountain" (https://www.chessvariants.com/rules/kingofthehill) | A *different* game (two to four players, a single centre square, armies chosen by the players). Not used. |

**Chosen rule set: lichess King of the Hill.** The hill is d4, e4, d5, e5, and the win is immediate when a legal king
move lands on it. The sources agree.

The only real question is how "the winning move has to be legal (you cannot move into check)" survives in Quantum
Chess, where there is no check. Section 4.1 decides it, and explains why the plain "no check at all" reading breaks
the variant.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- Ordinary 8 × 8 board. Files `a`-`h` (x = 0..7), ranks `1`-`8` (y = 0..7), names `a1` … `h8`. All 64 squares exist.
- Square index `y * 8 + x` (`rectTopology(8, 8)`).
- **The hill**: d4 (x 3, y 3, index 27), e4 (4, 3, index 28), d5 (3, 4, index 35), e5 (4, 4, index 36).
- **The ring**: the 12 squares next to the hill: c3 d3 e3 f3, c4 f4, c5 f5, c6 d6 e6 f6.

### 2.2 Pieces and movement

Ordinary chess pieces, unchanged (`orthodoxTypes`):

| Piece | Descriptor |
|---|---|
| King | `leap` (±1, 0), (0, ±1), (±1, ±1) |
| Queen | `ride` over the 8 king vectors |
| Rook | `ride` (±1, 0), (0, ±1) |
| Bishop | `ride` (±1, ±1) |
| Knight | `leap` (±1, ±2), (±2, ±1) |
| Pawn | `leap [(0,1)]` oriented, move only; `leap [(±1,1)]` oriented, capture only; plus the double step from rank 2/7 and en passant |

### 2.3 Setup

The ordinary chess start position:

- White: Ra1 Nb1 Bc1 Qd1 Ke1 Bf1 Ng1 Rh1, pawns a2-h2.
- Black: ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8, pawns a7-h7.

Both sides may castle both ways.

### 2.4 Special moves and promotion

As in chess (FIDE):

- **Castling**: king e1 to g1 with rook h1 to f1, or king e1 to c1 with rook a1 to d1; Black the same on rank 8 (e8 to
  g8 / c8, rook h8 to f8 / a8 to d8). FIDE conditions: neither piece has moved, the squares between them are empty,
  and the king is not in check and does not cross or land on an attacked square. Castling never reaches the hill.
- **Double step** of a pawn from its start rank (rank 2 for White, rank 7 for Black) over an empty square.
- **En passant**: right after an enemy pawn's double step, a pawn standing next to it may capture it as if it had moved
  one square, on that move only.
- **Promotion** on the last rank is compulsory, to a queen, rook, bishop or knight of the mover's choice.

### 2.5 Win, draw and turn order (classical, lichess)

- **Hill win.** A side wins **immediately** when its king makes a legal move onto d4, e4, d5 or e5. This includes a
  king capture onto one of these squares. Only a king move gets there (castling ends on the c or g file), so only the
  side that just moved can win this way (scalachess `specialEnd`).
- **Legality of the winning move.** Only the king moves, so "legal" means exactly: in the position **after** the move,
  no enemy piece attacks the hill square. As in FIDE chess, a pinned enemy piece still attacks, the enemy king
  attacks the squares next to it, and a rook, bishop or queen line that ran through the king's old square now reaches
  the square behind it (a king cannot step back along the line of a checking slider).
- Checkmate wins. Stalemate is a draw. White moves first.
- Other draws on lichess: the 50-move rule ends the game automatically after 100 half-moves without a capture or a pawn
  move; threefold repetition can be claimed; fivefold repetition ends the game automatically.
- **Order of the checks** (scalachess `Position.status`): checkmate, then the hill, then stalemate, then the automatic
  draws. A king move onto the hill therefore wins even if it leaves the opponent without a legal move or completes
  the 50-move count.
- Lichess **never** declares a draw for insufficient material in this variant (a lone king can still win by reaching
  the hill).

---

## 3. Engine mapping (contract)

Start from `orthodoxSpec()` and extend **the object it returns, in place**: `const spec = orthodoxSpec()`, set or
`Object.assign` the fields below on `spec`, then `export default defineVariant(spec)`. Do not spread it
(`{ ...orthodoxSpec(), ... }`): its `extraMoves` and `afterMove` call `pawnExtras(spec, …)` and
`orthodoxAfterMove(spec, …)` with the original object, which `defineVariant` then never completes, so the first move
generation throws `V.orient is not a function` (checked on the core). Extending in place also keeps the orthodox hooks
that `orthodoxSpec()` now has (`handoff/CORE-CHANGES.md` W4 and W5, in the working tree): `applyMiss` (en passant
expiry) and `unifyWorlds` (castling rights). KOTH needs both, unchanged. In the hooks below, `V` is that same object
(`spec`), which `defineVariant` completes in place.

| Field | Value |
|---|---|
| `id`, `category` | `'koth'`, `'rules'` |
| `sides` | `whiteBlack()`. No teams, default `enemies`. |
| `topology` | 8 × 8 with the hill shaded and outlined (section 6): `const spec = orthodoxSpec({ boardOpts: { shade, layout: { outlines } } })` (CORE-CHANGES W7 and U15, both in the working tree; checked: the four hill cells get their shades and `spec.topology.layout.outlines` holds the four segments). On a core without W7, assigning `rectTopology(8, 8, { shade, layout: { outlines } })` to `spec.topology` works too: the square indexing is identical, so the orthodox closures (`board.lastRank`, `board.rankOf`, which read the old topology object) stay correct. |
| `types` | orthodox. royal: `k`; solid: `k`, `p`; splittable: `q`, `r`, `b`, `n`. |
| values | orthodox `VALUES` (K 400, Q 900, R 500, B 330, N 320, P 100). |
| `setup` | `standardSetup(spec, 'rnbqkbnr')` (the orthodox default). |
| `extraMoves`, `afterMove`, `applyMiss`, `unifyWorlds` | orthodox, unchanged (double step, en passant, castling; the en passant square, cleared in idle worlds; castling rights, kept only while every world has them). |
| `filterMoves(w, side, list)` | **The hill-entry rule.** Drop a move `m` when all four hold: it is a king move (`w.ty[m.id] === 'k'`); it is not castling (`m.kind !== 'castle'`); `m.to` is a hill square; and after the move the square is attacked by the enemy (`attacks(V, applyClassical(V, w, m), 1 - side, m.to)`). Test the three cheap conditions first. This costs at most 2 extra `applyClassical` calls per world and side (a king next to the hill reaches one or two hill squares), and only when the king is next to the hill. Keep every other move, including non-king moves onto the hill. |
| `worldResult(w, mover)` | 1. If a side has no king on the board: `{ winner: other side, reason: 'king' }`. 2. Else, if a king stands on a hill square: `{ winner: that king's side, reason: 'hill' }`. 3. Else `null`. |
| `reasonText(reason)` | `'hill'`: `t('quantumchess', 'a king reached the hill')`; anything else: null. |
| `evaluate(w, side)` | Hill pull for the computer player: `bonus(own king) - bonus(enemy king)`, where `d` is the Chebyshev distance from the king to the nearest hill square and the bonus is 110 for d = 1, 45 for d = 2, 15 for d = 3, and 0 otherwise. (d = 0 cannot occur in an ongoing game; `worldResult` has ended it.) This term only steers; it cannot see a one-move hill threat, because `evaluate` gets one world and not the side to move. The search sees the threat instead: `ai.js` counts a reply that may end the game as forcing (`mightForce`, CORE-CHANGES U14, in the working tree), so the Normal level looks at the enemy's hill step (test K18). |
| `visibility`, `options` | none. |
| `rules()` | section 5. |

Notes:

- "Attacked" uses `world.attacks` with its default options: every enemy piece's capture lines, including the enemy
  **king** (so a king can never step onto a hill square next to the enemy king, test K7; never pass the
  `{ royal: false }` option of CORE-CHANGES W6 here), pawns' diagonal captures, and sliders blocked by any
  piece in that world. A slider's line reaches the hill square even though the moving king now stands on it. Pins do
  not matter: as in FIDE chess, a pinned piece still attacks (test K16). En passant and castling are not descriptor
  moves and never count as attacks; neither can capture a king, so this also matches FIDE.
- The test runs on the world **after** the king move. This matters:
  - A king that steps back along an enemy slider's line, away from it, is attacked on the new square even though its
    own body shielded that square before the move (test K4, second position; quantum: K15).
  - A capture removes the captured piece's own guard, but every other enemy guard of that square still counts
    (test K3), including a slider that defended the captured piece along a line through that square. With ghosts,
    a capture can therefore be Missed in one possibility and win in another (K14, K20).
- `filterMoves` works per world, so it is automatically quantum (section 4).
- Use `attacks`, never "does some move in the enemy's `generate` capture on `m.to`". The enemy's `generate` runs the
  enemy's own hill filter, which generates your moves again, and so on. Checked on the core: in the K7 position that
  version overflows the stack (`RangeError`). `attacks` reads only the descriptors and never recurses.

---

## 4. Quantum adaptation

### 4.1 The one place where attacks matter

Quantum Chess has no check: you may move your king into danger, and the opponent may capture it. Taken literally,
"win immediately when the king reaches the hill" plus "no check" **breaks the variant**. The king only needs to
survive one enemy move on a ring square next to an empty hill square; the next move wins, attacked or not. A capture
onto the hill also wins, so an enemy piece on the hill does not block it.

Example: 1.e4 e5 2.Ke2. White now threatens 3.Kd3 or 3.Ke3, then 4.Kd4.

- Black cannot attack both d3 and e3 with one move (Bc5 and Qg5 reach e3 only, nothing reaches d3; checked on the
  core over all 29 Black replies).
- Putting a piece on d4 does not help either, because 4.Kxd4 wins.
- So White wins by force in four moves.

Lichess prevents this only through "you cannot move into check".

**Decision: the king may not step onto a hill square that an enemy piece attacks after the move.** This is the only
check-like rule in the variant. Everywhere else the king may walk into danger as usual.

- In a classical position (one world) it allows exactly the king moves onto the hill that lichess allows (section
  2.5: only the destination's safety after the move counts).
- It keeps "win immediately".
- It is one sentence for players.

Rejected alternative, for the record: "the king must *survive* one enemy reply on the hill" (pure capture-the-king).

- Why it was considered: it needs no attack rule, and in classical positions it gives the same results one ply later.
- Why it was rejected:
  - It contradicts the brief's "win immediately".
  - It needs a special case when the opponent has no legal move.
  - It makes a king step onto a *maybe*-attacked hill square decide the whole game.
- It remains a possible later option (see open questions).

### 4.2 How it works with superposition

The rule is applied **per world**, inside the classical move generator (`filterMoves`).

- **Attacker a ghost.** In a world where the hill square is attacked (for example, the ghost attacker really stands
  on its attacking square), the king move does not exist, so it **misses** there. Elsewhere it is played and wins.
  A ghost attacks in each world from the square it stands on in that world. A ghost that attacks the hill square
  from **each** of its squares therefore attacks it in every world: the step is illegal, although each part is only
  50 % (test K19).
- **Settled by a roll, never linked.** The king is solid, so its moves are always measured (land = roll). When every
  world gives the same result there is nothing to roll (K1). Otherwise one roll decides:
  - **Moved / Captured**: the king stands on the hill and you win at once. The chance is the total weight of the
    worlds where the square is not attacked (and the king could step there). Both can occur in one move, next to
    Missed (test K20).
  - **Missed**: the king stays where it was. The turn is used. Only the possibilities in which the step was
    impossible remain. This settles a 50/50 ghost (K5, K10); a ghost that is spread over more squares, some of them
    attacking, stays a ghost over those squares (K17), and so does a ghost that did not matter (K20). As after any
    Missed move, the kept worlds pass through the orthodox `applyMiss` (an en passant right expires) and the quiet
    count goes up by one.
- **A ghost sitting on the hill square** (a piece that may be there):
  - an enemy ghost there gives "Captured" or "Moved", and both win (test K6), unless in that possibility another
    enemy piece attacks the square after the capture. In particular, an enemy ghost that is either on the hill
    square or on a square that guards it gives "Captured" (win) or "Missed" (test K14);
  - your own ghost there gives "Missed" in the worlds where it is really there (target friendly, test K13).
- **A blocker ghost.** A ghost that may block an enemy slider's line to the hill square works in the same way: the
  square counts as attacked only in the worlds where the line is open (test K10). The same holds when the line runs
  through the king's own square (test K15).
- **Illegal everywhere.** If the step is impossible in **every** world (the square is attacked after the move, or your
  own piece stands on it), the move is illegal and not offered (test K14, second position). The rules card says why;
  there is no per-square hint in v1 (section 6).
- **Budget and world bound.** A king move is always settled by a roll, never by pass = link, so a hill step only ever
  removes possibilities. It cannot raise either side's budget or the number of worlds (in K20 Black's budget falls
  from 4 to 2 on Missed).

### 4.3 Game-end roll and solid roll

- `worldResult` reads only where the two kings are (on the board or not, on the hill or not). Kings are solid, so
  after the solid roll every world of an outcome has the kings on the same squares, and therefore the same result.
  The **game-end roll never fires in this variant**: the move's own roll (Moved / Captured / Missed) already decided
  every hill win and every king capture.
- The game-end roll stays in the core as the generic safety net; `worldResult` needs nothing extra for it.
  (docs/variants.md shared rule 6 names "a king that might have reached the hill" as an example; for players that is
  harmless, because a roll does decide it, but it is the king move's own roll.)
- Invariant: in an ongoing game, no world has a king on the hill.
- Checked on the prototype with 400 random games (first pass: 29,130 plies with splits, 173 hill wins, 182 king
  captures, `fuzz.mjs`; second pass on the working tree, with merges and measurements too: 29,417 plies, 178 hill
  wins, 172 king captures, 155 rolled hill steps of which 71 Missed, `fuzz2.mjs`): the invariant always held, a hill
  result always held in every world, the filter matched the definition in every world, the castling rights were the
  same in every world, and no outcome ever carried an `end:` note.

### 4.4 Everything else

- Castling, en passant, promotion, split, merge, measure and the budget are unchanged from the other orthodox Quantum
  Chess variants. As there is no check, castling only needs the squares the king and rook cross or land on to be
  empty (`castlingMoves`); the FIDE "not out of, through or into check" condition of section 2.4 does not apply.
  Castling and en passant are certain moves (CORE-CHANGES D1/D2, Q2, in the working tree): legal only when possible
  in every world, never rolled. Neither is a king step onto the hill, so this changes nothing specific to KOTH.
- Capturing the enemy king still wins.
- **Draws**: the generic ones (50 moves by each side without a capture or a pawn move that really happened, the move
  limit, no legal move). KOTH keeps the default `resetsQuiet`, so a king move adds one to the count, hill step or not,
  unless it captures: a capture by the king resets it like any capture (checked: `a1-b2` capturing a knight gives
  `quiet` 0). A Missed pawn move no longer resets it (CORE-CHANGES Q8, in the working tree, as docs/rules.md section
  6 says). The core has no repetition rule, so lichess's threefold and fivefold repetition draws are not reproduced
  (CORE-CHANGES item 60: rejected). Do **not** add a "bare kings" draw: two lone kings still race for the hill
  (CORE-CHANGES item 40 says the same; docs/rules.md section 6 has that draw for classic Quantum Chess only).
- **Classic rules the variants core does not have** (CORE-CHANGES item 72, a documented deviation of every variant):
  there is no "your king cannot escape" loss, and the draws do not wait while the side to move can capture the enemy
  king for certain (docs/rules.md sections 5 and 6). A side whose king is lost for certain plays on and may still
  win with a hill step.
- **Order**: the core sets the result from `worldResult` before it tests the quiet-move draw, the move limit and "no
  legal move", so a hill win beats all three, as in lichess (section 2.5). Checked on the core: `d3-d4` played with
  `quiet = 99` gives `{ winner: 0, reason: 'hill' }` (and `d3-c3` the quiet draw); with `ply = 599` it gives the hill
  win (and `d3-c3` the move limit).

---

## 5. Player-facing rules text (rules card)

- Move your king onto one of the four centre squares (d4, e4, d5, e5) and you win at once.
- Your king may not step onto a centre square that an enemy piece would attack once your king stands there. This is
  the only place where attacks limit your king.
- Capturing an enemy piece on a centre square with your king also wins, if no other enemy piece attacks that square
  afterwards.
- If a ghost means a centre square would be attacked in only some possibilities, a king step onto it is a roll:
  either your king arrives and you win, or the move is Missed and your king stays where it was.
- Capturing the enemy king also wins. Castling, en passant and promotion are unchanged.

---

## 6. UI layout

- **Board.** Ordinary 8 × 8 board, square cells, labels a-h and 1-8, White at the bottom. Pieces use the cburnett
  sprites; there are no new pieces.
- **Hill shading.** Use the existing CSS shades `hill` and `hilldark` on the four hill cells, through the `shade`
  option of `rectTopology` (passed as `orthodoxSpec({ boardOpts: { shade, layout: { outlines } } })`, section 3). The
  light/dark pattern stays visible. Without colour, the hill is recognisable through the outline (below) and through
  the square names on the rules card.

  ```js
  const isHill = (f, r) => (f === 3 || f === 4) && (r === 3 || r === 4)
  shade: (f, r) => (isHill(f, r) ? ((f + r) % 2 === 0 ? 'hilldark' : 'hill') : ((f + r) % 2 === 0 ? 'dark' : 'light'))
  ```

  - d4 and e5 get `hilldark`; e4 and d5 get `hill`.
- **Hill outline.** In layout units (x right, y down, cell = 1), the hill spans x 3..5 and y 3..5: four segments,
  passed as `layout.outlines`:

  ```js
  const outlines = [
  	{ x1: 3, y1: 3, x2: 5, y2: 3 },
  	{ x1: 5, y1: 3, x2: 5, y2: 5 },
  	{ x1: 5, y1: 5, x2: 3, y2: 5 },
  	{ x1: 3, y1: 5, x2: 3, y2: 3 },
  ]
  ```

  - Use `layout.outlines`, never `layout.lines`. `VariantBoard.vue` paints the lines *before* the cells (they are
    meant for the point cells of xiangqi, which have a transparent fill), so the opaque square cells would hide them.
    The outlines (CORE-CHANGES U15, in the working tree) are drawn *after* the cells and before the labels, turned
    with the board, with the class `qc-vboard__outline` (a near-black stroke of 0.05, black 0.07 in the high-contrast
    theme, no pointer events). The stroke lies on the cell border, 0.5 from the cell centre, and glyphs and
    percentage badges stay within 0.47 of it, so the outline at most touches the edge of a piece in the
    high-contrast theme (half the stroke, 0.035, reaches 0.465).
  - The outline also keeps the hill visible while a hill cell carries a mark that replaces its `hill` / `hilldark`
    fill (selected, ghost part, last move, king danger).
- **Blocked hill step.** No hint in v1: CORE-CHANGES.md item 54 rejects the hint hook ("only one variant; the rules
  card explains the hill rule"). The step is simply not offered, and the rules card explains why. For the record,
  in case it is revisited:
  - The board has no per-square tooltips. The feedback channel would be the notice line under the board, which
    `useVariantGame.click` today leaves empty when a selected piece is sent to a square it cannot reach.
  - Hook: an optional `V.moveHint(state, from, to) -> string | null`. `click` in move mode calls it when a piece is
    selected and the clicked square is not one of its targets; a non-null text is shown as the notice.
  - KOTH returns
    `t('quantumchess', 'An enemy piece would attack your king on this square, so it cannot step onto the hill.')`
    when all of these hold: the side to move's king stands on `from`; `to` is a hill square one king step away;
    `from-to` is not a legal move; and in at least one world `to` does not hold a piece of the side to move.
    Otherwise it returns null.
- **Status line.** On a win, show `resultText` with the reason "a king reached the hill".

---

## 7. Test cases

Worlds are `worldFrom` placements with `x = { ep: -1, epVictim: -1, castle: [] }` (what `stateOf` in
`tests/js/variants/helpers.js` builds). White moves unless stated otherwise. "Result" is `state.result` after the
move. A piece that is "50 % on b6 and 50 % on a5" means one world per square, with those weights, and everything else
the same in every world; two independent 50/50 ghosts mean four worlds of 25 % each. **Write the pieces in the same
order in every world's placement**: `worldFrom` numbers the pieces in placement order, and a ghost is one piece only
when it has the same id in every world (for example `{ d3: '0:k', b6: '1:b', h8: '1:k' }` and
`{ d3: '0:k', a5: '1:b', h8: '1:k' }`). Lists of legal moves are sets; compare them sorted. Outcomes are listed in the
core's order (`miss`, `move`, `capture`), which is also the index for `applyOutcome`. All outcomes were produced by
the prototype on the real core. For the one-world cases K1-K4, K7, K8, K12 and K16, the set of legal king moves
**onto the hill** and the hill win also agree with python-chess's lichess-compatible `KingOfTheHillBoard` (moves off
the hill differ on purpose, because lichess forbids every move into check).

**K1. Free hill.** White Kd3, Black kh8. `d3-d4` has one outcome, `move` p = 1. Result: `{ winner: 0, reason: 'hill' }`.

**K2. Attacked by a pawn.**
- White Ke3; Black pd5, kh8.
- The legal king moves are exactly e3-f3, e3-d3, e3-e2, e3-f4, e3-f2, e3-d4, e3-d2.
- **`e3-e4` is illegal**: the d5 pawn captures towards e4 and c4.
- `e3-d4` is legal and wins.

**K3. Capture onto the hill.**
- White Kd3; Black nd4, kh8. `d3-d4` has one outcome, `capture` p = 1. Result: White wins, reason `hill`.
- Add a Black pawn on e5 (it guards d4): `d3-d4` is **illegal**. The legal moves are d3-e3, d3-c3, d3-d2, d3-e4,
  d3-e2, d3-c4, d3-c2. Note that `d3-e4` is legal: after the move, the e5 pawn attacks d4 and f4, not e4.

**K4. Line through the king's own square.**
- White Kd3; Black rd8, kh8. The king is attacked on d3 already, which is allowed.
- `d3-d4` is **illegal**: after the move, the rook still attacks d4 along the file.
- `d3-e4` and `d3-c4` are legal.
- Second position (stepping back along the line): White Kd6; Black rd8, kh8. Before the move the king's own body
  shields d5 from the rook; after `d6-d5` the rook attacks d5, so **`d6-d5` is illegal** (FIDE: a king cannot step
  back along the line of a checking slider). The legal king moves are exactly d6-e6, d6-c6, d6-d7, d6-e7, d6-e5,
  d6-c7, d6-c5, and `d6-e5` wins (`{ winner: 0, reason: 'hill' }`). A `filterMoves` that tested the world before the
  move would wrongly allow `d6-d5`.

**K5. Quantum: ghost attacker.**
- White Kd3, Black kh8, and a Black bishop that is 50 % on b6 (it attacks d4 through c5) and 50 % on a5 (it does not
  attack d4).
- `d3-d4` has two outcomes: `miss` p = 0.5 and `move` p = 0.5.
  - Missed: no result; the king stays on d3 and the bishop is 100 % on b6.
  - Moved: result White wins, reason `hill`; the bishop is 100 % on a5.

**K6. Quantum: enemy ghost on the hill square.**
- White Kd3, Black kh8, and a Black knight that is 50 % on d4 and 50 % on a8 (from a8 it does not attack d4).
- `d3-d4` has two outcomes: `move` p = 0.5 and `capture` p = 0.5. Both end with White winning, reason `hill`.

**K7. The enemy king guards the hill.**
- White Kf4, Black kf6.
- `f4-e5` is **illegal**: the Black king attacks e5.
- `f4-e4` is legal and wins.
- `f4-g5` is legal (off the hill, walking into danger is allowed). In FIDE chess, and so on lichess, it would be
  illegal because the kings would stand side by side; this is the deliberate Quantum Chess difference (no check).

**K8. Black wins on the hill.** Black to move; White Ka1, Black ke6. `e6-d5` gives `move` p = 1. Result:
`{ winner: 1, reason: 'hill' }`.

**K9. Capture the king still wins.** White Ka1, Qd1; Black kd8. `d1-d8` gives result `{ winner: 0, reason: 'king' }`.

**K10. Quantum: ghost blocker.**
- White Kc3; Black rd8, kh8, and a Black knight that is 50 % on d6 (it blocks the d-file) and 50 % on b8.
- `c3-d4` has two outcomes: `miss` p = 0.5 and `move` p = 0.5.
  - Missed: the knight was on b8, so the rook attacks d4; the king stays on c3 and the knight is 100 % on b8.
  - Moved: result White wins, reason `hill`; the knight is 100 % on d6.

**K11. Start.** `newGame(V)` has 20 legal ordinary moves (`legalMoves` without splits: 16 pawn moves and 4 knight
moves, as in chess) and no result.

**K12. The forced line is refuted.** From the start: 1.e4 e5 2.Ke2 Nc6 3.Kd3 Nf6 (codes `e2-e4`, `e7-e5`, `e1-e2`,
`b8-c6`, `e2-d3`, `g8-f6`), no result.
- `d3-d4` is **illegal**: the e5 pawn and the c6 knight attack d4.
- The king's moves are exactly d3-e3, d3-c3, d3-e2, d3-c4 (c2, d2 and e4 hold White pawns). These are also exactly
  the lichess-legal king moves in this position (python-chess `KingOfTheHillBoard`).

**K13. Quantum: own ghost on the hill square.**
- White Kd3, Black kh8, and a White knight that is 50 % on d4 and 50 % on b3.
- `d3-d4` has two outcomes: `miss` p = 0.5 and `move` p = 0.5.
  - Missed: the knight was on d4 (target friendly). No result; the king stays on d3 and the knight is 100 % on d4.
  - Moved: result `{ winner: 0, reason: 'hill' }`; the knight is 100 % on b3.

**K14. Quantum: an enemy ghost that is either on the hill square or guarding it.**
- White Kd3, Black kh8, and a Black knight that is 50 % on d4 and 50 % on c6 (from c6 it attacks d4).
- `d3-d4` has two outcomes: `miss` p = 0.5 and `capture` p = 0.5.
  - Missed: the knight was on c6. No result; the king stays on d3 and the knight is 100 % on c6.
  - Captured: result `{ winner: 0, reason: 'hill' }`; the knight is gone.
- Second position (impossible in every world): add a Black pawn on e5, which guards d4 in both worlds.
  - **`d3-d4` is illegal**: it is not in `legalMoves`, and `outcomes` returns null.
  - The king's moves are exactly d3-e3, d3-c3, d3-d2, d3-e4, d3-e2, d3-c4, d3-c2.
  - `d3-e4` has one outcome, `move` p = 1, and wins.

**K15. Quantum: line through the king's own square.**
- White Kd6, Black kh8, and a Black rook that is 50 % on d8 and 50 % on a8.
- `d6-d5` has two outcomes: `miss` p = 0.5 and `move` p = 0.5.
  - Missed: the rook was on d8 (after the step it attacks d5 through d6). The king stays on d6 and the rook is 100 %
    on d8.
  - Moved: result `{ winner: 0, reason: 'hill' }`; the rook is 100 % on a8.
- A `filterMoves` that tested the world before the move would wrongly give one outcome, `move` p = 1.

**K16. A pinned piece still guards.**
- White Kd3, Rh6; Black ka6, nc6. The knight is pinned to its king along rank 6.
- **`d3-d4` is illegal**: the c6 knight attacks d4.
- The king's moves are exactly d3-e3, d3-c3, d3-d2, d3-e4, d3-e2, d3-c4, d3-c2, and `d3-e4` wins
  (`{ winner: 0, reason: 'hill' }`).
- python-chess `KingOfTheHillBoard` gives the same seven king moves and the same win.

**K17. Quantum: a ghost over three squares.**
- White Kd3, Black kh8, and a Black bishop that is 50 % on b6, 25 % on a7 and 25 % on a5. From b6 and from a7 it
  attacks d4 through c5; from a5 it does not.
- `d3-d4` has two outcomes: `miss` p = 0.75 and `move` p = 0.25.
  - Missed: no result, Black to move, and the king stays on d3. The bishop is **still a ghost**, 2/3 on b6 and 1/3 on
    a7 (`pieceLocations` p ≈ 0.6667 and 0.3333; world weights 11184811 and 5592405 of T): only the a5 possibility is
    gone.
  - Moved: result `{ winner: 0, reason: 'hill' }`; the bishop is 100 % on a5.

**K18. The computer player sees a one-move hill threat.** This case needs `mightForce` in `ai.js` (CORE-CHANGES U14,
in the working tree).
- Black to move, played by the computer at level Normal. White Kc3; Black rh1, kh8. White threatens `c3-d4`.
- Of Black's 94 legal moves (`legalMoves(V, s, { splits: true })`), exactly three leave `c3-d4` illegal, because d4 is
  then attacked in every world: `h1-d1`, `h1-h4` and the split `h1-d1|h4`.
- Expected: for every n from 1 to 20, `code = await chooseMove(V, s, { level: 'normal', rng: seededRng(n) })`
  (`seededRng` from `src/engine/index.js`), played with `applyOutcome(V, s, code, 0)`, leaves `c3-d4` out of White's
  `legalMoves`. Assert only that, not which defence is chosen: the choice depends on how many random numbers the
  search draws.
- Measured on the working tree: 20 of 20 (`h1-d1` 13 times, `h1-h4` 7 times), about 1.4 ms per call. The Hard level
  also passes 20 of 20; the Easy level (no reply search) passes 3 of 20 and is not tested. Before U14 the Normal
  level passed 1 of 20: it mostly played `h8-g7`, because the `evaluate` term rewards the king's step towards the
  centre.

**K19. Quantum: a ghost that attacks the hill square from both of its squares.**
- White Kd3, Black kh8, and a Black bishop that is 50 % on b6 and 50 % on f6. From b6 it attacks d4 through c5, from
  f6 through e5.
- **`d3-d4` is illegal** (not in `legalMoves`, `outcomes` null), although each part of the bishop is only 50 %: d4
  is attacked in every world.
- The king's moves are exactly d3-e3, d3-c3, d3-d2, d3-e4, d3-e2, d3-c4, d3-c2. `d3-e4` (attacked from neither
  square) has one outcome, `move` p = 1, and wins.
- A filter that combined per-piece chances instead of testing each world would wrongly offer `d3-d4` as a roll.

**K20. Quantum: Missed, Moved and Captured in one hill step.**
- White Kd3, Black kh8, a Black knight 50 % on d4 and 50 % on a8, and a Black bishop 50 % on b6 and 50 % on a5,
  independent: four worlds of 25 % each, `{ d3: '0:k', d4: '1:n', b6: '1:b', h8: '1:k' }`,
  `{ d3: '0:k', d4: '1:n', a5: '1:b', h8: '1:k' }`, `{ d3: '0:k', a8: '1:n', b6: '1:b', h8: '1:k' }` and
  `{ d3: '0:k', a8: '1:n', a5: '1:b', h8: '1:k' }`. Black's budget is 4.
- `d3-d4` has three outcomes: `miss` p = 0.5, `move` p = 0.25 and `capture` p = 0.25.
  - Missed (the bishop was on b6 and guards d4, whether or not the king would have captured the knight): no result,
    Black to move, the king stays on d3. The bishop is 100 % on b6 and the knight is **still 50 % on d4 and 50 % on
    a8** (two worlds of weight T/2). Black's budget falls to 2.
  - Moved (knight a8, bishop a5): result `{ winner: 0, reason: 'hill' }`; one world, knight on a8.
  - Captured (knight d4, bishop a5): result `{ winner: 0, reason: 'hill' }`; one world, the knight is gone.

**K21. Board and declaration.**
- The cells of d4 and e5 have shade `hilldark`, e4 and d5 `hill`, c3 `dark` and c4 `light`.
- `V.topology.layout.outlines` is exactly the four segments of section 6; the 16 labels are unchanged.
- `V.applyMiss` and `V.unifyWorlds` are functions (kept from `orthodoxSpec()`), and `newGame(V)` has four castling
  rights in `x.castle`.
- `V.reasonText('hill')` is the hill text, `V.reasonText('king')` is null, and `V.rules()` has five entries.

---

## 8. Review notes

Open questions (from the original research):

1. **Hill-entry rule.** Chosen: "the king may not step onto an attacked hill square" (lichess-faithful, immediate
   win, per-world roll). The alternative, "the king must survive one enemy reply on the hill", is pure
   capture-the-king. It is more dramatic in quantum positions, because a maybe-attacked hill square becomes a
   game-deciding gamble instead of a wasted move. Pick one before implementing; the tests K2-K5, K7, K10, K12,
   K14-K17, K19 and K20 assume the chosen rule (K18 too: without the rule there is no defence to a king next to a free
   hill square).
2. **Board options.** `orthodoxSpec` should accept board options (shade and layout lines for the hill), instead of
   the module swapping `topology` afterwards. (Engine review: done as CORE-CHANGES W7, and the outline as U15
   `layout.outlines`; both are in the working tree, and section 3 uses them.)
3. **UI hint** for a hill step that is refused because the square is attacked in every world (a small hint hook).
   (Engine review: CORE-CHANGES item 54 rejects it for v1; the rules card explains the rule. Section 6 keeps the
   exact semantics in case it is revisited.)

### 8.1 Source review

Reviewer lens: fidelity to the classical rules. The pages were fetched directly this time, and the lichess rules
engine and Fairy-Stockfish were read in `handoff/ext/`. Scripts: `handoff/tmp/koth-rules/` (`tkoth.mjs` and
`textra.mjs` on the real core; `pycheck.py` with python-chess 1.11.2 `chess.variant.KingOfTheHillBoard`).

Checked and correct as written (no change):

- The hill is d4, e4, d5, e5, with indices 27, 28, 35, 36. The scalachess `Bitboard.center` is `0x1818000000`, which
  sets bits 27, 28, 35 and 36. The Fairy-Stockfish flag region is `(Rank4BB | Rank5BB) & (FileDBB | FileEBB)`.
- The standard start position, the piece moves and the promotion pieces. scalachess uses `Board.standard` and
  `Standard.validMoves`.
- The win is immediate, including a king capture onto the hill. Fairy-Stockfish has `flagMove = false`, and in
  scalachess `specialEnd` is checked right after the move.
- The shading in section 6: d4 and e5 are dark squares in chess, as `(f + r) % 2 === 0` gives. The outline
  coordinates match the `rectTopology` cells (`y = 7 - rank index`).
- The expected results of K1-K3 and K5-K11 (tkoth.mjs on the current core).
- The 4.1 claim that nothing attacks d3 and only 2...Bc5 and 2...Qg5 attack e3. Checked on the core over all 29
  Black replies after 1.e4 e5 2.Ke2.

Changes:

1. **Section 1, lichess citation.**
   - The quoted rules come from the lichess variant page itself, not from "a search extract and a lichess study".
     They are now quoted verbatim, including "a move is legal if and only if it would have been legal in FIDE chess".
   - The study https://lichess.org/study/i5qz9rbK/nwrsOrrK is a community study by user Papai506, not an official
     rules page. It is now listed separately as such.
   - Sources: https://lichess.org/variant/kingOfTheHill and the study page.
2. **Section 1, new sources.** Added scalachess `KingOfTheHill.scala` and `Position.scala`, Fairy-Stockfish
   `kingofthehill_variant()`, and https://www.pychess.org/variants/kingofthehill.
   - The chess.com help-centre link is now the full URL:
     https://support.chess.com/en/articles/8594498-what-is-king-of-the-hill-koth. It gives "checkmate, stalemate,
     and time-out".
   - Added the Wikibooks URL and its quote: https://en.wikibooks.org/wiki/Chess_Variants/King_of_the_Hill.
   - Corrected the description of chessvariants.com "King of the Mountain". It is a two-to-four-player game with one
     centre square and armies chosen by the players. That comes from the site's search listing, because the page
     itself returns 403 to automated clients. "Older" could not be verified and was dropped.
3. **Section 2.4, special moves.** Spelled out Black's castling squares and the FIDE castling conditions (no check out
   of, through or into). Also stated the double-step ranks, the one-move window for en passant and that promotion is
   compulsory, so that 4.4 can say exactly which FIDE condition Quantum Chess drops.
   - Source: https://lichess.org/variant/kingOfTheHill ("All the Laws of FIDE chess apply").
4. **Section 2.5, what the winning move's legality means.** It is now defined exactly: the destination must be safe
   in the position after the move. Pinned pieces still attack, the enemy king attacks the squares next to it, and a
   slider line through the king's old square counts (x-ray).
   - Added that only the side that just moved can win on the hill.
   - Source: scalachess `Variant.kingSafety` (tests `m.afterWithoutHistory`) and `KingOfTheHill.specialEnd` (checks
     `position.kingOf(!position.color)`): https://github.com/lichess-org/scalachess.
5. **Section 2.5, draws and order.**
   - The 50-move rule ends the game automatically at 100 half-moves. Threefold repetition is only a claim, and
     fivefold repetition ends the game automatically. The old text said just "threefold repetition and the 50-move
     rule are draws".
   - The hill win comes before stalemate and before the automatic draws, because `Position.status` checks
     checkmate, then the variant end, then stalemate, then `autoDraw`.
   - Insufficient material is **never** declared. The old wording, "while a king can still walk to the hill",
     implied a condition that does not exist: scalachess sets all three insufficient-material hooks to `false`.
   - Sources: scalachess `Position.scala` and `Variant.scala` (`fiftyMoves`: `halfMoveClock >= 100`;
     `autoDraw`); https://lichess.org/faq (threefold repetition is claimed).
6. **Section 3, notes.**
   - The old reason why pins do not matter ("there are none in capture-the-king") was replaced by the FIDE reason:
     a pinned piece still gives check.
   - Added that en passant and castling never count as attacks, which also matches FIDE.
   - The x-ray note pointed at K4, but K4's rook stands in front of the king, so K4 never tested it. It now points
     to K4's new second position (change 10).
7. **Section 4.1.** The claim "exactly the lichess results" was narrowed to "exactly the king moves onto the hill that
   lichess allows". Moves off the hill differ on purpose, because Quantum Chess has no check. The attack claim
   about 2...Bc5 and 2...Qg5 is now marked as checked on the core.
8. **Section 4.4.**
   - Castling in Quantum Chess drops the FIDE check conditions. `castlingMoves` only needs empty squares.
   - The core has no repetition rule, so lichess's threefold and fivefold repetition draws are not reproduced.
   - The hill win takes precedence over the quiet-move draw, the move limit and "no legal move", as in lichess.
     Checked on the core: `d3-d4` with `quiet = 99` gives the hill win.
9. **Section 5, rules card.**
   - "that an enemy piece attacks" became "that an enemy piece would attack once your king stands there", so that
     the x-ray case is unambiguous to players.
   - "Castling, en passant and promotion work as in chess" became "... are unchanged". Castling through an attacked
     square is allowed in Quantum Chess, so "as in chess" was inaccurate.
10. **Section 7.**
    - Added K4's second position: White Kd6; Black rd8, kh8. `d6-d5` is illegal and `d6-e5` wins. The legal list was
      run on the core and on python-chess, and it tests the "after the move" requirement.
    - K7: noted that `f4-g5` is illegal under FIDE rules but legal in the quantum game.
    - K11: gave the 20 moves' make-up and noted that `legalMoves` leaves out splits.
    - K12: gave the move codes, and ran it on the core (it was not in `tkoth.mjs`). It gives d3-e3, d3-c3, d3-e2,
      d3-c4, which are also the python-chess KOTH legal moves.
    - K1 and K7: Black pieces are now written in lower case, like the other cases.
    - Added the python-chess cross-check sentence to the section intro.

### 8.2 Engine review

Reviewer lens: engine and quantum consistency. Two passes, each with a prototype written exactly from section 3 and
run on the real `src/variants/core`; the scripts are in `handoff/tmp/critic-koth/`. The first pass ran on the core
before the `handoff/CORE-CHANGES.md` packages. The second ran on the working tree of 2026-09-25 (about 17:30), with
those packages in it and the core's own tests passing (`core*.spec.js`, 122 tests).

#### First pass (core before CORE-CHANGES)

Scripts:

- `proto.mjs` is the prototype, and `tests.mjs` runs K1-K12.
- `extra.mjs` and `check2.mjs` run K13-K17 and the engine checks; `check3.mjs` lists the defending moves of K18.
- `ai.mjs` and `k18.mjs` run the computer player. `ai_patched.mjs` is a scratch copy of `ai.js` with the proposed
  change.
- `gen.mjs` runs a `generate`-based filter, `quiet.mjs` the quiet counter, and `fuzz.mjs` 400 random games.
- K16 was cross-checked with python-chess (`handoff/tmp/koth-rules/venv`).

Checked and correct as written (no change):

- K1-K12: every legal list, outcome key, probability and result matches the current core exactly.
- `filterMoves`, `worldResult`, `reasonText` and `evaluate` can be built with the hooks as they are.
  - `world.attacks` has exactly the semantics the rule needs: a guarded square counts, the moving king does not block
    a line to its own square, and pawn pushes (`mode: 'move'`) never attack.
  - The fuzz run found no world in which the filter and the definition in section 3 disagree.
- Section 4.2 needs no quantum code in the variant. The king is solid, so its moves are always measured. The roll
  groups the worlds into miss, move and capture, so the win's chance is the weight of the worlds in which the filtered
  move exists.
- Section 4.4, the order of results: a hill win beats the quiet-move draw, the move limit and "no legal move"
  (`quiet = 99` check re-run).
- Consistency with `docs/rules.md` and `docs/variants.md`.
  - Kings are always solid, and "every move of a solid piece is settled at once by a roll".
  - The hill rule is the only new cause of "Missed", and the rules card states it.
  - Shared rule 6 of `docs/variants.md` cites "a king that might have reached the hill" as a case for the game-end
    roll. For players that is harmless, because a roll does decide it, but in fact it is the king move's own roll
    (section 4.3).
- Section 6: the shading code, the shade names (they exist in `VariantBoard.vue`) and the outline coordinates.
- The planned `handoff/CORE-CHANGES.md` items should leave every K1-K18 expectation as it is. This was reasoned from
  the plan, because nothing was merged yet during this review.
  - No case depends on en passant, castling or the quiet count; K11 and K12 carry castling rights and en passant
    squares but test only other moves. So Q1/W4 (`applyMiss` on the idle worlds of a Missed hill step), D1/D2 and
    Q8 do not affect them.
  - No case has a follow-up roll, so Q4 does not either.

Changes:

1. **Section 3, how to build the module.** Extend the object that `orthodoxSpec()` returns in place, never spread
   it. A spread copy is what `defineVariant` completes, while the orthodox hooks keep the original object, so move
   generation throws `V.orient is not a function`. Checked on the core.
2. **Section 3, `topology`.**
   - On the core as built, `orthodoxSpec()` takes no board options. Replacing `spec.topology` works: the closures read
     the old topology object, whose indexing is identical. Double steps, castling and promotion were checked after
     the swap.
   - CORE-CHANGES W7 (planned) adds `orthodoxSpec({ boardOpts })`; the row now names both ways.
   - Section 3 now also says that extending in place keeps the planned orthodox hooks `applyMiss` and `unifyWorlds`
     (W4, W5), and that `attacks` must keep its default options, not W6's `{ royal: false }`.
3. **Section 3, `filterMoves`.**
   - The enemy is now written `1 - side`.
   - The cost is at most 2 `applyClassical` calls per world and side, not 4, because a king next to the hill touches
     one or two hill squares.
   - Stated that non-king moves onto the hill are kept.
4. **Section 3, `evaluate`.** Added its limit. It sees one world and not the side to move, so it cannot tell a hill
   threat that wins next move from one that can still be parried. Measured on the current core (test K18): the Normal
   computer lets the threat through in 19 of 20 runs. The fix belongs in the search (core change 1 below).
5. **Section 3, notes.**
   - "Two kings can never meet on the hill's edge" was wrong: kings may stand side by side on ring squares (K7,
     `f4-g5`). It now says that a king can never step onto a hill square next to the enemy king.
   - Added that a slider's line reaches the hill square through the moving king.
   - Pointed the pin, x-ray and capture notes at their tests (K16, K15, K3).
   - New note: use `attacks`, never the enemy's `generate`. A `generate`-based filter recurses through the enemy's
     own hill filter and overflows the stack in the K7 position (checked).
6. **Section 4.2.**
   - "Missed … settles the ghost" is only true for a 50/50 ghost. Missed keeps every possibility in which the step was
     impossible, so a ghost spread over several attacking squares stays a ghost (new K17).
   - An enemy ghost on the hill square does not always win. If its other square guards the hill, the outcomes are
     Captured or Missed (new K14).
   - Tests for your own ghost on the square (K13) and for the quantum x-ray (K15).
   - "Illegal everywhere" now also counts your own piece on the square (K14, second position).
   - New bullet: a hill step never raises a budget or the number of worlds, because king moves only roll.
7. **Section 4.3.** The old example, "a king capture and a hill win could both arise from one roll", cannot happen.
   The section now says why the game-end roll never fires in this variant. 400 random games on the prototype
   (29,130 plies, 173 hill wins, 182 king captures) confirmed it: no `end:` note, and the invariant always held.
8. **Section 4.4.**
   - A king move never resets the quiet count.
   - The core as built resets the count on a pawn move that is Missed (`quiet.mjs`), unlike `docs/rules.md`
     section 6; CORE-CHANGES Q8 fixes that for every variant.
   - Castling and en passant become certain-only (CORE-CHANGES D1, D2); neither is a king step onto the hill, so
     nothing changes for KOTH.
9. **Section 5, fourth bullet.**
   - Each `rules()` entry is shown on its own, so the bullet now names the centre square.
   - "(a ghost)" became "if a ghost means …".
   - It now uses the outcome label "Missed" that the move preview shows.
10. **Section 6.**
    - The hill outline cannot be drawn with `layout.lines`. `VariantBoard.vue` paints the lines before the cells, and
      the opaque square cells hide them. This needs a `layout.outlines` UI change; until then the shading alone marks
      the hill. CORE-CHANGES W7 assumes the outline comes from `layout` lines, so W7 alone will not show it.
    - Blocked hill step: CORE-CHANGES item 54 rejects the hint hook, so v1 has no hint and the rules card explains
      the rule. Section 6 records the exact semantics (`V.moveHint`, shown in the notice line; the board has no
      per-square tooltips) in case it is revisited. The text says "would attack", because of the x-ray case and to
      match the rules card.
11. **Section 7.**
    - The intro now defines the ghost notation and the outcome order.
    - Added K13-K18. They cover the riskiest rules that no case tested:
      - an own ghost on the square (K13);
      - a ghost that is either on the square or guarding it, and a step impossible in every world (K14);
      - the "after the move" test in quantum form (K15);
      - pins (K16, python-chess agrees);
      - a Missed step that leaves the attacker a ghost (K17);
      - the computer player facing a one-move hill threat (K18).
12. **Section 8, open questions.** The test list of question 1 now includes the new cases, and questions 2 and 3 now
    point to their answers in CORE-CHANGES.md (W7 planned, item 54 rejected).

This pass asked for two changes outside the variant module: forcing replies that include game-ending moves in
`ai.js`, and `layout.outlines` in `VariantBoard.vue`. CORE-CHANGES adopted them as U14 and U15 (items 63 and 64);
both are in the working tree now (second pass).

#### Second pass (working tree with the CORE-CHANGES packages)

Scripts:

- `proto2.mjs` is the prototype, built with `orthodoxSpec({ boardOpts: { shade, layout: { outlines } } })`;
  `lib2.mjs` has the helpers.
- `run2.mjs` runs K1-K21 as 65 assertions (output `out-run2.txt`: all pass); `k17w.mjs` prints the exact weights of
  K17 and K20.
- `extra2.mjs` runs the engine checks (`out-extra2.txt`), `k18b.mjs` the computer player at every level
  (`out-k18b.txt`), and `fuzz2.mjs` 400 random games with splits, merges and measurements (`out-fuzz2.txt`).

Checked and correct as written (no change):

- K1-K17 and the rules part of K18 give exactly the stated legal lists, outcome keys, probabilities, kept worlds and
  results on the working tree, as the first pass predicted from the plan. No case depends on en passant, castling,
  the quiet count or a settling roll.
- The mapping of section 3 needs no hook that the core lacks.
  - `generate` calls `filterMoves(w, side, list)` once per world and side and caches the result; `attacks` with its
    default options is the right test (W6's `{ royal: false }` exists now and must stay unused).
  - A variant `worldResult` replaces the core's default king-capture rule completely, so it must test for a missing
    king itself; section 3 does.
  - `mightForce` (U14) reads `worldResult` on the first world of each outcome, which is exact here (section 4.3).
- The generic quantum behaviour matches section 4 and docs/rules.md: a king move is measured (docs/rules.md 3.1,
  "it is a pawn move or a king move"), so it rolls when the worlds disagree and never links; castling and en passant
  are certain-only (Q2) and never reach the hill; a Missed hill step passes the kept worlds through the orthodox
  `applyMiss` (checked: the en passant square is cleared, `quiet` goes up by one); castling rights stay identical in
  every world (W5, checked over the fuzz run); the budget and the world bound hold.
- The only check-like rule is the hill-entry rule, as docs/rules.md 5 ("There is no check") and docs/variants.md
  rule 8 need; the rules card states it.
- Performance: the filter made 23,459 extra `applyClassical` calls in 29,417 plies (fewer than one per ply); the 400
  games ran in about 4 s.
- The rules card (section 5) matches the engine in every case K1-K21 and does not repeat or contradict the shared
  rules (`sharedRules()` in `src/variantplay/texts.js`).

Changes:

1. **Section 1.** The research note names the second pass and its scripts.
2. **Section 3, intro.** `applyMiss` and `unifyWorlds` are now in `orthodoxSpec()` (W4, W5), not only planned; and
   `V` in the hooks is `spec` itself, completed in place.
3. **Section 3, `topology`.** W7 and U15 are in the working tree, so `orthodoxSpec({ boardOpts: { shade, layout: {
   outlines } } })` is now the way; replacing `spec.topology` stays as the fallback for a core without W7. Checked: the
   hill cells get their shades and the layout holds the four segments.
4. **Section 3, orthodox hooks row.** `applyMiss` and `unifyWorlds` joined `extraMoves` and `afterMove` in one row
   ("orthodox, unchanged"), with what each does.
5. **Section 3, `evaluate`.** The Normal level now sees a one-move hill threat through U14 (`mightForce`), which is
   in `ai.js`; the row said it needed a future change.
6. **Section 3, notes.** "A slider standing behind the captured piece" was unclear; it now says "a slider that
   defended the captured piece along a line through that square", and points to the quantum cases K14 and K20.
7. **Section 4.2.**
   - A ghost attacks in each world from its square in that world, so a ghost that attacks the hill square from each
     of its squares makes the step illegal, although each part is only 50 % (new K19). This is the case in which a
     player is most likely to expect a roll, and in which an implementation that combined per-piece chances would go
     wrong.
   - "Always settled by a roll" was not exact: when every world gives the same result there is nothing to roll (K1
     is `rolled: false`). It now reads "settled by a roll, never linked".
   - Moved, Captured and Missed can all come from one hill step (new K20); a ghost that did not matter stays a ghost
     on Missed (K20's knight); the Missed worlds pass through `applyMiss` and the quiet count goes up.
8. **Section 4.3.** The reason why the game-end roll never fires is now complete and short: `worldResult` reads only
   the kings' squares, kings are solid, and the solid roll makes them equal in every world of an outcome. The old
   text argued about king captures and hill wins separately. The docs/variants.md remark moved here, and the second
   fuzz run was added.
9. **Section 4.4.**
   - "A king move, hill step or not, never resets the count" was wrong for a king capture: every capture resets it
     (checked: `a1-b2` capturing a knight gives `quiet` 0).
   - Q8 (a Missed pawn move no longer resets the count) and Q2 (certain castling and en passant) are in the working
     tree; the text no longer describes the old core.
   - Added the documented deviation of CORE-CHANGES item 72: no "your king cannot escape" loss and no waiting draws.
     Every spec must list it; this one did not.
   - The order check now also covers the move limit (`ply = 599`: `d3-d4` wins, `d3-c3` is the move-limit draw).
10. **Section 5, fourth bullet.** "is attacked" became "would be attacked", the wording of the second bullet, so
    that both say the square is judged with the king on it (K4, K15).
11. **Section 6.** The outline is drawn now (U15): the segments are given as code, the "until then leave it out"
    advice and the old description of the missing UI change were replaced by what `VariantBoard.vue` does, and a
    note says why the outline matters (selection, ghost-part, last-move and danger marks replace the hill fill).
12. **Section 7.**
    - Intro: a ghost is one piece only if it is written at the same place in every world's placement, because
      `worldFrom` numbers the pieces in placement order; written in another order, the "ghost" becomes two pieces
      and K17's `pieceLocations`, the budgets and the outcomes of K20 change. Also: move lists are sets, and
      `stateOf` builds these worlds.
    - K17: the exact weights (2/3, 1/3) instead of "about 67 %".
    - K18: rewritten for the working tree (U14 in): 20 of 20 at Normal (`h1-d1` 13, `h1-h4` 7). The first pass saw
      12 and 8 with its patched copy; the search now draws its random numbers differently (U4's split ranking), so
      the test must assert only that `c3-d4` is illegal. Easy passes 3 of 20 and is not tested. The exact calls
      (`await`, `seededRng`, `applyOutcome`) are given.
    - New K19 (ghost attacking from both squares: illegal), K20 (three outcomes in one hill step, a ghost that stays
      a ghost, the budget falling) and K21 (board shades, outline data, the kept orthodox hooks, `reasonText`).
13. **Section 8, open questions.** Question 1 lists K19 and K20 among the cases that assume the chosen rule;
    question 2 says W7 and U15 are done.

Core changes needed: **none** beyond what is in the working tree. KOTH relies on these CORE-CHANGES items, all in
the working tree and covered by the core's own tests; the lead must keep them when merging:

1. **U14** (`ai.js`, `mightForce`): a reply is forcing when one of its outcomes captures or has a non-null
   `worldResult`. Needed by K18 (the Normal level defends a one-move hill threat 20 of 20 times, 1 of 20 without
   it). A variant hook cannot do it: `evaluate(w, side)` sees one world and not the side to move.
2. **U15** (`VariantBoard.vue`, `layout.outlines` drawn after the cells, turned with the board). Needed for the
   hill outline only; without it the shading alone marks the hill.
3. **W7** (`orthodoxSpec({ boardOpts })`). Convenience only; section 3 gives the fallback.
4. **W4 / W5 / Q1 / Q3** (`applyMiss`, `unifyWorlds` in `orthodoxSpec()`), **Q2** (certain castling and en
   passant) and **Q8** (the quiet counter): generic; KOTH needs nothing specific from them.

Not needed for v1: the `V.moveHint` hook for a refused hill step (CORE-CHANGES item 54, rejected). Its exact
semantics are in section 6 in case it is revisited.
