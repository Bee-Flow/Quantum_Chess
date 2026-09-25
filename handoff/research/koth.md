# Variant spec: `koth` (King of the Hill)

Category: `rules`. UI name: "King of the Hill". Summary line (already in `catalog.js`): "Bring your king to one of
the four centre squares to win."

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the network proxy for every rules site in this session (lichess.org,
wikipedia.org). The rules below come from search-engine extracts of the pages listed, plus prior knowledge. Every test
case in section 7 was run on a prototype built on the real `src/variants/core` (`handoff/prototypes/c960/proto.mjs`,
`tkoth.mjs`).

| Source | What it gives |
|---|---|
| lichess.org, https://lichess.org/variant/kingOfTheHill ("Bring your King to the center to win the game.") | The lichess rules. The search extract (and the lichess study "King of the hill rules", https://lichess.org/study/i5qz9rbK/nwrsOrrK) says: "If you make a legal move that moves your King to one of the center squares (d4, d5, e4, e5) you win. The winning move has to be legal, e.g. you can not move into check. Checkmating your opponent is another legal way to win." All other FIDE laws apply. |
| chess.com, https://www.chess.com/terms/king-of-the-hill and https://support.chess.com/en/articles/8594498 | The same four squares, the same immediate win, checkmate, stalemate and time-out as usual. |
| Wikibooks, "Chess Variants/King of the Hill" | The same rules. |
| chessvariants.com, "King of the Mountain" (https://www.chessvariants.com/rules/kingofthehill) | A *different*, older game (one centre square, multi-player). Not used. |

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

As in chess: castling (king e1 to g1 or c1, rook h1 to f1 or a1 to d1; the same for Black), double step, en passant,
promotion to Q, R, B or N on the last rank. Castling never reaches the hill.

### 2.5 Win, draw and turn order (classical, lichess)

- **Hill win.** A side wins **immediately** when its king makes a legal move onto d4, e4, d5 or e5. This includes a
  king capture onto one of these squares. The move must be legal, so the king cannot step onto a hill square that an
  enemy piece attacks (after the move).
- Checkmate wins. Stalemate, threefold repetition and the 50-move rule are draws. White moves first.
- Lichess does **not** declare a draw for insufficient material while a king can still walk to the hill. A lone king
  can win.

---

## 3. Engine mapping (contract)

Start from `orthodoxSpec()`.

| Field | Value |
|---|---|
| `id`, `category` | `'koth'`, `'rules'` |
| `sides` | `whiteBlack()`. No teams, default `enemies`. |
| `topology` | 8 × 8 `rectTopology` with the hill shaded (section 6). The square indexing is identical to `orthodoxSpec`'s board, so its closures (`lastRank`, pawn ranks) stay valid. It is cleaner to let `orthodoxSpec` accept board options, e.g. `orthodoxSpec({ boardOpts: { shade, layout } })`. |
| `types` | orthodox. royal: `k`; solid: `k`, `p`; splittable: `q`, `r`, `b`, `n`. |
| values | orthodox `VALUES` (K 400, Q 900, R 500, B 330, N 320, P 100). |
| `setup` | `standardSetup(spec, 'rnbqkbnr')` (the orthodox default). |
| `extraMoves`, `afterMove` | orthodox (double step, en passant, castling; ep square and castling rights). |
| `filterMoves(w, side, list)` | **The hill-entry rule.** Drop a move `m` when all four hold: it is a king move (`w.ty[m.id] === 'k'`); it is not castling (`m.kind !== 'castle'`); `m.to` is a hill square; and after the move the square is attacked by the enemy (`attacks(V, applyClassical(V, w, m), enemy, m.to)`). This costs at most 4 extra `applyClassical` calls per world, and only when the king is next to the hill. |
| `worldResult(w, mover)` | 1. If a side has no king on the board: `{ winner: other side, reason: 'king' }`. 2. Else, if a king stands on a hill square: `{ winner: that king's side, reason: 'hill' }`. 3. Else `null`. |
| `reasonText(reason)` | `'hill'`: `t('quantumchess', 'a king reached the hill')`; anything else: null. |
| `evaluate(w, side)` | Hill pull for the computer player: `bonus(own king) - bonus(enemy king)`, where `d` is the Chebyshev distance from the king to the nearest hill square and the bonus is 110 for d = 1, 45 for d = 2, 15 for d = 3, and 0 otherwise. (d = 0 cannot occur in an ongoing game; `worldResult` has ended it.) |
| `visibility`, `options` | none. |
| `rules()` | section 5. |

Notes:

- "Attacked" uses `world.attacks`: every enemy piece's capture lines, including the enemy **king** (so two kings can
  never meet on the hill's edge), pawns' diagonal captures, and sliders blocked by any piece in that world. Pins do
  not matter (there are none in capture-the-king).
- The test runs on the world **after** the king move. This matters:
  - A king that slides along a rook's line stays attacked (test K4).
  - A capture removes the captured piece's own guard, but not the guard of pieces behind it (test K3).
- `filterMoves` works per world, so it is automatically quantum (section 4).

---

## 4. Quantum adaptation

### 4.1 The one place where attacks matter

Quantum Chess has no check: you may move your king into danger, and the opponent may capture it. Taken literally,
"win immediately when the king reaches the hill" plus "no check" **breaks the variant**. The king only needs to
survive one enemy move on a ring square next to an empty hill square; the next move wins, attacked or not. A capture
onto the hill also wins, so an enemy piece on the hill does not block it.

Example: 1.e4 e5 2.Ke2. White now threatens 3.Kd3 or 3.Ke3, then 4.Kd4.

- Black cannot attack both d3 and e3 with one move (Bc5 and Qg5 reach e3 only, nothing reaches d3).
- Putting a piece on d4 does not help either, because 4.Kxd4 wins.
- So White wins by force in four moves.

Lichess prevents this only through "you cannot move into check".

**Decision: the king may not step onto a hill square that an enemy piece attacks after the move.** This is the only
check-like rule in the variant. Everywhere else the king may walk into danger as usual.

- In a classical position (one world) this gives exactly the lichess results.
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
- **Always settled by a roll.** The king is solid, so its moves are always measured. One roll decides:
  - **Moved / Captured**: the king stands on the hill and you win at once. The chance is the total weight of the
    worlds where the square is not attacked (and the king could step there).
  - **Missed**: the king stays where it was. Everyone now knows the square was attacked, which settles the ghost.
    The turn is used.
- **A ghost sitting on the hill square** (enemy piece that may be there):
  - an enemy ghost there gives "Captured" or "Moved", and both win (test K6);
  - your own ghost there gives "Missed" in the worlds where it is really there (target friendly).
- **A blocker ghost.** A ghost that may block an enemy slider's line to the hill square works in the same way: the
  square counts as attacked only in the worlds where the line is open (test K10).
- **Illegal everywhere.** If the square is attacked in **every** world, the move is illegal and not offered. The UI
  hint says why (section 6).

### 4.3 Game-end roll and solid roll

- The king is solid, so after the solid roll it stands on the same square in every world. "King on the hill" is
  therefore all-or-nothing within each branch, and the **game-end roll never has to decide a hill win**: the king
  move's own roll already did.
- The game-end roll is still generic, for capture-the-king combined with other rolls. For example, if a king capture
  and a hill win could both arise from one roll, each world's `worldResult` separates them.
- Invariant: in an ongoing game, no world has a king on the hill.

### 4.4 Everything else

- Castling, en passant, promotion, split, merge, measure and the budget are unchanged.
- Capturing the enemy king still wins.
- **Draws**: the generic ones (50 moves by each side without a capture or a pawn move, the move limit, no legal move).
  Do **not** add a "bare kings" draw: two lone kings still race for the hill.

---

## 5. Player-facing rules text (rules card)

- Move your king onto one of the four centre squares (d4, e4, d5, e5) and you win at once.
- Your king may not step onto a centre square that an enemy piece attacks. This is the only place where attacks limit
  your king.
- Capturing an enemy piece on a centre square with your king also wins, if no other enemy piece attacks that square
  afterwards.
- If the centre square is attacked in only some possibilities (a ghost), the game rolls: either your king arrives and
  you win, or it misses and stays where it was.
- Capturing the enemy king also wins. Castling, en passant and promotion work as in chess.

---

## 6. UI layout

- **Board.** Ordinary 8 × 8 board, square cells, labels a-h and 1-8, White at the bottom. Pieces use the cburnett
  sprites; there are no new pieces.
- **Hill shading.** Use the existing CSS shades `hill` and `hilldark` on the four hill cells. The pattern stays
  visible, and the hill is recognisable without colour, through the outline.

  ```js
  const isHill = (f, r) => (f === 3 || f === 4) && (r === 3 || r === 4)
  shade: (f, r) => (isHill(f, r) ? ((f + r) % 2 === 0 ? 'hilldark' : 'hill') : ((f + r) % 2 === 0 ? 'dark' : 'light'))
  ```

  - d4 and e5 get `hilldark`; e4 and d5 get `hill`.
- **Hill outline.** In layout units (x right, y down, cell = 1), the hill spans x 3..5 and y 3..5. Draw it with four
  `layout.lines`: (3,3)-(5,3), (5,3)-(5,5), (5,5)-(3,5), (3,5)-(3,3).
- **Blocked hill step.** When the selected king is next to a hill square and the step is not offered, the square's
  tooltip should read "An enemy piece attacks this square: your king cannot step onto the hill here." This needs a
  small hint hook; the fallback is the rules card.
- **Status line.** On a win, show `resultText` with the reason "a king reached the hill".

---

## 7. Test cases

Worlds are `worldFrom` placements with `x = { ep: -1, epVictim: -1, castle: [] }`. White moves unless stated
otherwise. "Result" is `state.result` after the move. All outcomes were produced by the prototype on the real core.

**K1. Free hill.** White Kd3, Black Kh8. `d3-d4` has one outcome, `move` p = 1. Result: `{ winner: 0, reason: 'hill' }`.

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
- White Kf4, Black Kf6.
- `f4-e5` is **illegal**: the Black king attacks e5.
- `f4-e4` is legal and wins.
- `f4-g5` is legal (off the hill, walking into danger is allowed).

**K8. Black wins on the hill.** Black to move; White Ka1, Black ke6. `e6-d5` gives `move` p = 1. Result:
`{ winner: 1, reason: 'hill' }`.

**K9. Capture the king still wins.** White Ka1, Qd1; Black kd8. `d1-d8` gives result `{ winner: 0, reason: 'king' }`.

**K10. Quantum: ghost blocker.**
- White Kc3; Black rd8, kh8, and a Black knight that is 50 % on d6 (it blocks the d-file) and 50 % on b8.
- `c3-d4` has two outcomes: `miss` p = 0.5 and `move` p = 0.5.
  - Missed: the knight was on b8, so the rook attacks d4; the king stays on c3 and the knight is 100 % on b8.
  - Moved: result White wins, reason `hill`; the knight is 100 % on d6.

**K11. Start.** `newGame(V)` has 20 legal ordinary moves and no result.

**K12. The forced line is refuted.** From the start: 1.e4 e5 2.Ke2 Nc6 3.Kd3 Nf6.
- `d3-d4` is **illegal**: the e5 pawn and the c6 knight attack d4.
- The king's moves are exactly d3-e3, d3-c3, d3-e2, d3-c4.

---

## 8. Open questions

1. **Hill-entry rule.** Chosen: "the king may not step onto an attacked hill square" (lichess-faithful, immediate
   win, per-world roll). The alternative, "the king must survive one enemy reply on the hill", is pure
   capture-the-king. It is more dramatic in quantum positions, because a maybe-attacked hill square becomes a
   game-deciding gamble instead of a wasted move. Pick one before implementing; the tests K2-K5, K7, K10 and K12
   assume the chosen rule.
2. **Board options.** `orthodoxSpec` should accept board options (shade and layout lines for the hill), instead of
   the module swapping `topology` afterwards.
3. **UI hint** for a hill step that is refused because the square is attacked in every world (a small hint hook).
