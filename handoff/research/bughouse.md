# Variant spec: `bughouse` (Bughouse)

Category: `rules`. Players: 4 (two teams of two). UI name: "Bughouse". Summary line (already in `catalog.js`): "Two
boards, two teams: what you capture, your partner may drop."

Bughouse is crazyhouse on two boards. Read `crazyhouse.md` first: the drop rules, the promoted piece types and the
quantum treatment of hands and drops are the same, and this file only repeats what bughouse needs.

---

## 1. Sources and chosen rule set

Research note: WebFetch and curl were blocked by the network proxy for chess.com, wikipedia.org, pychess.org,
chessvariants.com and the CSC rules PDF. Only raw.githubusercontent.com could be read. Lichess has no bughouse. The
test cases in section 7 were run on a prototype built on the real `src/variants/core`, with the team budget of 4.4
patched into a copy of `quantum.js` (`handoff/prototypes/zh/bug.mjs`, `quantum_team.js`, `tbug.mjs`, `tbug2.mjs`,
`tbug3.mjs`, `fuzz.mjs`, `ai.mjs`).

| Source | What it gives |
|---|---|
| pychess-variants `static/docs/bughouse.md` (read in full; a shortened copy of Wikipedia "Bughouse chess", CC BY-SA) | Two boards, four players in teams of two. "One player per team has black pieces, while the other has white pieces." "A player capturing a piece immediately passes that piece to their partner", who may drop it instead of moving, "on any vacant square, including squares where the piece delivers check or checkmate; however, pawns may not be dropped on the first or last rank." "All promoted pawns convert back to pawns when captured." "A pawn placed on the second rank may move two squares on its first move, and ... be captured en passant." "The match ends when the game on either board ends." |
| Fairy-Stockfish `src/variant.cpp`, `bughouse_variant()` (read) | Bughouse = crazyhouse with `twoBoards = true`, `capturesToHand = false` (captures go to the partner, not to oneself), and `stalemateValue = -VALUE_MATE` (a stalemated player loses). |
| chess.com Help Center "What is Bughouse?", chess.com "Bughouse chess rules and basics", chess.com terms (search extracts) | Captured pieces go to the partner's "piece bank". Promoted pawns return to the bank as pawns ("counterfeits"). The game is over when a game on either board ends by checkmate, resignation or timeout. "There are no draws in Bughouse." |
| Wikipedia "Bughouse chess", pion.ch "Bughouse complete ruleset", UCR chess club (search extracts) | Partners sit next to each other. A player without a legal move is not stalemated: they wait for a piece. A match can be drawn by agreement, or when both teams lose on the same board moment (timeouts). |
| scalachess `Crazyhouse.scala` (read) | The crazyhouse drop rules. They are identical to the bughouse drop rules above (see `crazyhouse.md`). |

**Chosen rule set: the common online bughouse rules (chess.com / Wikipedia / pychess), with the crazyhouse drop rules
of lichess, made turn-based.** The sources agree on the drop and pass rules. The decisions where they differ, or where
turn-based play forces a choice:

- **Turn-based play.** Real bughouse is simultaneous and played on the clock. Here the four seats move in a fixed
  order (2.3). Time, "stalling" and sitting and waiting for a piece do not exist.
- **Check and checkmate:** as in every variant of this app, there is no check. **Capturing a king ends the whole
  game.** The team of that king loses.
- **Castling with a dropped rook:** not allowed (as in `crazyhouse.md`, lichess and pychess). Some club rule sets allow
  it. Keeping one rule for both drop variants is simpler.
- **No legal move:** Wikipedia and chess.com say the player simply waits, and Fairy-Stockfish counts it as a loss.
  Waiting is impossible in a turn-based game, so a seat with no legal move ends the game as a **draw**. This is the
  app's generic `noMoves`. Without check, a seat has no move only if every piece is walled in and its hand is empty,
  which practically never happens.
- **Draws:** bughouse "has no draws". The app still needs its technical limits: the quiet rule and the move limit,
  scaled to four seats (`quietPlies` 200 = 50 moves per seat without a capture, a pawn move or a drop; `maxPly` 1200 =
  300 moves per seat), plus `noMoves` above and agreement.

---

## 2. Classical rules (complete)

### 2.1 Seats, teams and boards

| Seat (side index) | Id | Name | Board | Colour | Team |
|---|---|---|---|---|---|
| 0 | `aw` | White A | A | White | Team 1 |
| 1 | `bw` | White B | B | White | Team 2 |
| 2 | `bb` | Black B | B | Black | Team 1 |
| 3 | `ab` | Black A | A | Black | Team 2 |

- Team 1 = seats 0 and 2 (White A + Black B). Team 2 = seats 1 and 3 (White B + Black A). `teams: [[0, 2], [1, 3]]`.
- Partners play **opposite colours on different boards**: `partner(s) = (s + 2) % 4`. The opponent on the same board
  is `3 − s`.
- Board of a seat: seats 0 and 3 play on A, seats 1 and 2 on B. Colour: seats 0 and 1 are White, seats 2 and 3 Black.
- Enemies: seats of different teams (`s % 2` differs). Pieces of the other board can never interact with yours
  anyway: the boards are separate.

### 2.2 Boards and topology

- Two 8 × 8 boards, **A** and **B**. Coordinates are `[file 0–7, rank 0–7, board 0 (A) or 1 (B)]`. All 128 squares
  exist. The ordinary 2D movement vectors are padded with 0 for the board coordinate (`makeTopology.step` does this),
  so no piece can ever leave its board.
- Square names are `A:e4` and `B:e4` (board letter, colon, file, rank). The colon is allowed; `-`, `|`, `?`, `@`,
  `=` and spaces are not.
- On each board, White starts on ranks 1–2 and moves up (+rank). Black starts on ranks 7–8 and moves down. So
  `orient(side, v)` mirrors the rank for the **Black seats (2, 3)**, not for "every side but 0" as the default does.

### 2.3 Turn order (turn-based bughouse)

**White A → White B → Black B → Black A → White A → …** (seat 0, 1, 2, 3, repeating; `nextSide` is the default
`(side + 1) % 4`, and no seat is ever out).

- Each board alternates White and Black. Board A moves at plies 0 (W), 3 (B), 4 (W), 7 (B), … and board B at plies
  1 (W), 2 (B), 5 (W), 6 (B), ….
- **The teams alternate on every ply:** Team 1, Team 2, Team 1, Team 2. So two people can play pass & play, each
  controlling both seats of a team, and the auto-flip view always faces the team to move.
- **Every capture reaches the partner exactly two plies later**, with exactly one enemy move in between, for all
  four seats. For example, White A captures at ply 0, and Black B (the partner) moves at ply 2.

Alternatives considered and rejected:

| Order | Team pattern | Delay until the partner can drop |
|---|---|---|
| **A-W, B-W, B-B, A-B (chosen)** | 1 2 1 2 | always 2 plies |
| A-W, A-B, B-W, B-B ("board by board") | 1 2 2 1 | Black's captures: 1 ply; White's captures: 3 plies |
| A-W, B-W, A-B, B-B ("whites, then blacks") | 1 2 2 1 | 1 or 3 plies, depending on the seat |

Team 1 has the very first move (White A). Team 2 answers with White B, which is the usual first-move edge of White,
spread over the two boards.

### 2.4 Pieces and movement

These are the orthodox pieces and the promoted types of `crazyhouse.md` 2.2: `k`, `q`, `r`, `b`, `n`, `p`, `+q`, `+r`,
`+b` and `+n`, with the same descriptors. The pawn's `oriented` vectors point towards rank 8 for the White seats and
towards rank 1 for the Black seats. Pawns promote on rank 8 (White seats) or rank 1 (Black seats), to `q`, `r`, `b` or
`n`, which then become `+q`, `+r`, `+b` or `+n`.

### 2.5 Setup (every square)

Both boards start in the orthodox start position:

- **Board A**, White A (seat 0): A:a1 R, A:b1 N, A:c1 B, A:d1 Q, A:e1 K, A:f1 B, A:g1 N, A:h1 R, pawns A:a2–A:h2.
  Black A (seat 3): A:a8 R, A:b8 N, A:c8 B, A:d8 Q, A:e8 K, A:f8 B, A:g8 N, A:h8 R, pawns A:a7–A:h7.
- **Board B**, White B (seat 1): B:a1 R, B:b1 N, B:c1 B, B:d1 Q, B:e1 K, B:f1 B, B:g1 N, B:h1 R, pawns B:a2–B:h2.
  Black B (seat 2): B:a8 R, B:b8 N, B:c8 B, B:d8 Q, B:e8 K, B:f8 B, B:g8 N, B:h8 R, pawns B:a7–B:h7.
- All four hands are empty. Each seat has both castling rights on its own board. There is no en passant square on
  either board. White A moves first.

### 2.6 Captures, hands and drops

- A captured piece goes into the hand of the capturer's **partner** (`next.sd[victim] = partner(capturer)`).
  Its colour stays the same, because the partner plays that colour. For example, White A captures a black knight and
  Black B receives a black knight.
- A captured **promoted** piece is passed on as a **pawn**. A king is never passed on: capturing it ends the game.
- A seat may drop only from **its own** hand, and only onto **empty squares of its own board**. Pawns may not be
  dropped on rank 1 or rank 8. Drops never capture. They may attack the king.
- A pawn dropped on its own second rank (rank 2 for White seats, rank 7 for Black seats) may make the two-square
  step, and can then be taken en passant.
- Drop codes: `<type>@<square>`, e.g. `n@B:f3`, `p@A:d6`.

### 2.7 Special moves per board

- **En passant is per board.** A double step on board A may be answered en passant only by the next move **on board
  A** (the opponent's reply there), even though two moves on board B happen in between. The next move on board A
  clears it, whatever it is. The world keeps `x.ep = [epA, epB]` and `x.epVictim = [victimA, victimB]`.
- **Castling:** as in chess, per seat on its own board (`O-O` / `O-O-O`; the codes need no board letter, because
  only the seat to move can castle and each seat plays on one board). There are no check conditions. A right is lost
  when the king or that rook moves or the rook is captured. A dropped rook never castles.
- **Promotion:** as in crazyhouse (`A:e7-A:e8=q` → `+q`).

### 2.8 End of the game

- **Win:** capturing **any** king ends the whole game at once, on both boards. The team whose king was captured
  loses; the result is `{ winner: null, winners: [the two seats of the other team, ascending], reason: 'king' }`.
  Resignation by one seat loses for the team (the UI already declares every enemy of the resigning seat a winner).
- **Draw:** a seat to move without any legal move; the quiet rule (200 plies without a capture, a pawn move or a
  drop, on either board); the move limit (1200 plies); agreement.

---

## 3. Engine mapping (contract)

| Field | Value |
|---|---|
| `id`, `category` | `'bughouse'`, `'rules'` |
| `sides` | `[{ id: 'aw', name: White A, color: 'white', rotate: 0 }, { id: 'bw', name: White B, color: 'white', rotate: 180 }, { id: 'bb', name: Black B, color: 'black', rotate: 0 }, { id: 'ab', name: Black A, color: 'black', rotate: 180 }]` |
| `teams` | `[[0, 2], [1, 3]]` |
| `enemies(a, b)` | `a % 2 !== b % 2` |
| `orient(side, v)` | mirror coordinate 1 when `side >= 2` |
| `topology` | `makeTopology` with the coordinates, names and cells of 2.2 and 6 |
| `types` | `orthodoxTypes({ lastRank: (side, sq) => rank(sq) === (side >= 2 ? 0 : 7) })` plus `+q`, `+r`, `+b`, `+n`; values as in crazyhouse |
| royal / solid / splittable | `k` royal. `k` and `p` solid. The rest splittable. |
| `drops` | `true` |
| `setup` | 2.5, `x = { ep: [-1, -1], epVictim: [-1, -1], castle: [8 rights] }` |
| `extraMoves` | double steps and en passant of the seat's board, castling, drops onto the seat's board (below) |
| `onCapture` | to the partner's hand, demoting promoted types; a king goes `OFF` |
| `afterMove` | per-board ep, castling rights, promoted type |
| `solidExtra` | the hand contents (guard, as in crazyhouse) |
| `worldResult` | 2.8 |
| `noMoves` | the default (draw, `reason: 'noMoves'`) |
| `quietPlies`, `maxPly` | 200, 1200 |
| `evaluate` | team material (below) |
| `options`, `visibility` | none |

**Castling rights** (per world, the same shape as `castlingRights` returns). Each right is
`{ side, flag, king, rook, kingTo, rookTo }`, with 8 rights in total:

| Seat | King | Rook | King to | Rook to | Flag |
|---|---|---|---|---|---|
| 0 | A:e1 | A:h1 | A:g1 | A:f1 | `K` |
| 0 | A:e1 | A:a1 | A:c1 | A:d1 | `Q` |
| 3 | A:e8 | A:h8 | A:g8 | A:f8 | `k` |
| 3 | A:e8 | A:a8 | A:c8 | A:d8 | `q` |
| 1 | B:e1 | B:h1 | B:g1 | B:f1 | `K` |
| 1 | B:e1 | B:a1 | B:c1 | B:d1 | `Q` |
| 2 | B:e8 | B:h8 | B:g8 | B:f8 | `k` |
| 2 | B:e8 | B:a8 | B:c8 | B:d8 | `q` |

**`core/orthodox.js` assumes two coordinates.** `castlingRights`, `between` and `orthodoxAfterMove` build squares with
`topo.at([f, r])`, which is −1 on this three-coordinate topology, and `orthodoxAfterMove`/`pawnExtras` use a single
`x.ep`. The implementer can either:

1. generalise the helpers to keep the extra coordinates (`at([f, r, ...coords[sq].slice(2)])`), a backward-compatible
   change; or
2. write the three small helpers in `bughouse.js`, as the prototype does:
   - castling checks that every square from `min(king, rook, kingTo, rookTo)` to `max(...)` on that rank and board is
     empty, apart from the king and the rook themselves;
   - `pawnExtras` is called with a shallow view world `{ ...w, x: { ep: w.x.ep[bd], epVictim: w.x.epVictim[bd] } }`
     for the seat's board `bd`;
   - `afterMove` sets or clears `ep[bd]` of the board of `m.to` only.

Drops (like crazyhouse, restricted to the seat's board: squares `64 × bd … 64 × bd + 63`):

```js
extraMoves(w, side) {
	const bd = boardOf(side)                                     // 0 for seats 0 and 3, 1 for seats 1 and 2
	const view = { ...w, x: { ep: w.x.ep[bd], epVictim: w.x.epVictim[bd] } }
	const out = [...pawnExtras(spec, view, side, (s, sq) => rank(sq) === (s >= 2 ? 6 : 1)), ...castling(w, side)]
	for (const [type, ids] of handOf(w, side)) {
		for (let sq = 64 * bd; sq < 64 * bd + 64; sq++) {
			if (w.board[sq] !== -1 || (type === 'p' && (rank(sq) === 0 || rank(sq) === 7))) continue
			out.push({ key: dropKey(spec, type, sq), from: -1, to: sq, id: ids[0], capture: -1,
				promo: null, drop: type, kind: 'drop' })
		}
	}
	return out
},
onCapture(next, victim, m) {
	const t = next.ty[victim]
	if (spec.types[t].royal) { placePiece(next, victim, OFF); return }
	placePiece(next, victim, HAND)
	next.sd[victim] = (next.sd[m.id] + 2) % 4                     // the capturer's partner
	next.ty[victim] = PROMOTED[t] ? 'p' : t
},
worldResult(b) {
	for (let s = 0; s < 4; s++) {
		if (!kingOnBoard(b, s)) return { winner: null, winners: [(s + 1) % 4, (s + 3) % 4].sort(), reason: 'king' }
	}
	return null
},
```

**Required core change: a team budget.** `quantum.js` counts the budget per side (`projection(b, side)`). Bughouse
needs it per team (4.4). Proposed hook: `V.budgetSides(side) -> side[]`, default `[side]`, for bughouse
`[side, (side + 2) % 4]`. `projection` would then include the pieces of every side in that list. The change is a few
lines, and the prototype `quantum_team.js` shows it. The UI's budget pips should then show the team's number for both
partners.

**Optional core change: the computer's reply search.** `ai.js` `replyValue` answers with the side to move next. After
White A moves, that is White B on the **other** board, so the computer never sees the threat of Black A, who moves
three plies later on its own board, and it leaves pieces hanging on its own board. Proposed hook:
`V.replySide(state, me)`, which returns the side whose reply to search. For bughouse it is `3 − me`, the opponent on the
same board. The search would evaluate that side's moves in `{ ...s, turn: V.replySide(s, me) }`.

`evaluate(w, side)`: the default `worldValue` counts own material + 0.5 × partner − the average of the two enemies,
with hand pieces at 0.8. Bughouse should use **team material**, own + partner − both enemies, with hands at full
value. So `evaluate` returns the difference:

- for board pieces: partner +0.5 v, each enemy −0.5 v;
- for hand pieces: own +0.2 v, partner +0.6 v, each enemy −0.6 v;
- plus the crazyhouse king-proximity term (±12 per piece within distance 2 of the enemy king on the same board).

Performance (prototype, 128 squares): 20 random games of 80 plies take 3.3 s in total, with at most 24 worlds.
`chooseMove` takes 10 ms (easy), 104 ms (normal) and 281 ms (hard) from an early position with a pawn in hand
(62 legal moves).

---

## 4. Quantum adaptation

Everything in `crazyhouse.md` section 4 applies:

- hands are always certain (one occupant per square), with `solidExtra` as a guard;
- drops are measured: **Dropped** or **Missed** when a ghost might stand on the square, and a missed drop is a probe;
- the dropped id is the lowest of its type in the hand;
- there are no split drops;
- promoted ghosts go to the hand as a pawn in the *Captured* branch.

In addition:

### 4.1 A capture roll decides what the partner receives

A capture onto a square where a ghost might stand is rolled on the capturer's board. In the *Captured* branch the
piece is certainly in the partner's hand. In the *Moved*/*Missed* branch it is certainly not. The partner therefore
always knows exactly what it can drop. The prototype fuzz test found no state with differing hands in 1489 random
plies.

### 4.2 The two boards stay independent

No move, roll or link ever connects a piece on A with a piece on B:

- movement never crosses boards;
- hands are certain;
- a roll only conditions on the board where it happens.

So the possibilities are always "the possibilities of A × the possibilities of B", and a roll on one board never
changes the odds on the other (test B8). The possibilities panel can therefore list the two boards separately.

### 4.3 The game-end roll

A king is solid, so capturing it is certain or rolled (*Captured*/*Missed*) like any capture. When a king is captured,
the whole game ends in every possibility. The generic game-end roll covers any other case.

### 4.4 The budget belongs to the team

**Decision: each team has one budget of 8.** It counts the distinct arrangements of the pieces of **both partners, on
both boards and in both hands**. This keeps the classic guarantees:

- the whole game never has more than 8 × 8 = **64 possibilities** (the core's `MAX_WORLDS`), so the world limit can
  never block a split that the budget allows;
- **the other team can never use up your budget**: only your team's own moves raise it.

A budget per seat would allow 8 per seat and up to 8⁴ possibilities. Splits would then run into the shared 64-world
limit, and one team could block the other's splits by filling it. That is the capacity-denial problem that D5 of
`engine-rules.md` rules out.

With the board independence (4.2), the team's count is the product of its two seats' counts. For example, a 50/50
ghost on each board gives 2 × 2 = 4. So partners share the budget, and planning it together is part of the team game.

### 4.5 Turn order and rolls

The seat to move rolls only for its own board. The order of 2.3 gives each board ordinary alternating play, so the
classic rules of every roll (pawn and king moves, land = roll, en passant only on the next move of that board) apply
per board without change.

---

## 5. Player-facing rules text (rules card)

1. Four players in two teams play on two boards. White A and Black B play against White B and Black A. Partners play
   opposite colours on different boards.
2. The seats move in turn: White A, White B, Black B, Black A. The teams alternate, and each board alternates White and
   Black.
3. What you capture goes to your partner's hand. Your partner may drop it on an empty square of their board instead of
   moving (pawns not on the first or last rank).
4. A captured promoted piece (marked with a small +) is passed on as a pawn.
5. The whole game ends as soon as a king is captured on either board, and that king's team loses.
6. Your team shares one budget of 8 for its ghosts on both boards.
7. Dropping onto a square where a ghost might stand is a roll, as in Crazyhouse. En passant is only possible on the next
   move of that board.

---

## 6. UI layout

- **Cells** (rect, 1 × 1, `x` and `y` of the top-left corner, y growing downwards, `GAP = 0.8`):
  - board A: `x = f`, `y = 7 − r` (White A at the bottom, file a on the left);
  - board B, turned half a turn: `x = 8 + GAP + (7 − f)`, `y = r` (Black B at the bottom, file h on the left).

  So **the partners of Team 1 sit side by side at the bottom**, as in over-the-board bughouse: White A bottom-left,
  Black B bottom-right. Shade: `(f + r) % 2 === 0` → `dark` on both boards (a1 is dark).
- **Layout:** `width 16.8`, `height 8`, `boards: [{ x: 0, y: 0, w: 8, h: 8, label: 'A' }, { x: 8.8, y: 0, w: 8, h: 8,
  label: 'B' }]` (the frame and the label above each board are drawn by `VariantBoard`). Labels:
  - board A: files a–h below (`x = f + 0.5`, `y = 8.32`) and ranks 1–8 on the left (`x = −0.3`, `y = 7.5 − r`);
  - board B: files below in the order h…a (`x = 8.8 + (7 − f) + 0.5`, `y = 8.32`) and ranks on the right
    (`x = 17.1`, `y = r + 0.5`, rank 1 at the top).

  `PAD = 0.7` covers both label columns.
- **Rotation:** `rotate: 0` for seats 0 and 2 (Team 1) and `180` for seats 1 and 3. Turning the whole drawing half a
  turn puts Team 2's partners side by side at the bottom: White B bottom-left, Black A bottom-right. With auto-flip,
  the view turns on every ply, because the teams alternate.
- **Pieces:** cburnett sprites in white and black (two seats share each colour, the board tells them apart). Promoted
  pieces carry the red "+" marker of `crazyhouse.md` section 6.
- **Active board:** highlight the frame of the board whose seat is to move. This is a proposed small addition: a
  `boards[i].active` flag, or a CSS class chosen from `V.boardOfSide`. Show "White B to move" in the status line.
- **Hands:** the existing hands panel, one row per seat. Order them to match the board: Team 1's rows (White A, Black
  B) and then Team 2's rows (White B, Black A), with a team caption: "Team 1: White A + Black B" and "Team 2: White B +
  Black A". Only the seat to move can click its hand. Drop previews and wording as in crazyhouse ("Dropped" /
  "Missed: the square was taken").
- **Move list:** one column per board, or a single list that prefixes the seat ("White B: N@B:f3").
- **Result:** "White A & Black B win: the king of Black A was captured" (texts.js already joins `winners` with " & ").
- **Narrow screens:** the 16.8 × 8 drawing is wide. The existing zoom can focus on the active board. An open question
  is whether phones should get a stacked layout instead.
- **Budget pips:** show the team budget (0–8) once per team, or identically for both partners.

---

## 7. Test cases

Notation as in `crazyhouse.md`. `K` stands for the four kings on their start squares: `{ 'A:e1': '0:k', 'A:e8': '3:k',
'B:e1': '1:k', 'B:e8': '2:k' }`. `x = { ep: [-1, -1], epVictim: [-1, -1], castle: [] }` unless stated otherwise. Worlds
"A / B" have equal weight. All results were produced by the prototype, with the team budget patched in.

| # | Position and moves | Expected |
|---|---|---|
| B1 turn order | Start position. `A:e2-A:e4`, `B:d2-B:d4`, `B:e7-B:e5`, `A:d7-A:d5`. | The movers are seats 0, 1, 2, 3 in that order. Then it is seat 0's turn again (ply 4). `A:e4-A:d5` is legal for seat 0, and seat 0 has no move code containing `B:`. |
| B2 capture to partner | Continue B1 with `A:e4-A:d5` (seat 0 takes a pawn), then `B:d4-B:e5` (seat 1 takes a pawn). | After the first capture, the black pawn is in the hand of seat **2** (Black B); the hands of seats 0, 1 and 3 are empty. After the second, seat **3** (Black A, the partner of White B) holds the captured **black** pawn from board B. Seat 2, now to move, may play `p@B:d2` and `p@B:e3`, but not `p@B:e1`, `p@B:e8` or any `p@A:…`. |
| B3 promoted piece passed as a pawn | `K` + A:b7 White pawn (seat 0) + A:a8 Black rook (seat 3). `A:b7-A:b8=q`, `B:e1-B:d1`, `B:e8-B:d8`, `A:a8-A:b8`. | After the promotion, A:b8 holds a `+q` of seat 0. `A:a8-A:b8` is a certain capture, and seat **1** (White B, partner of seat 3) receives a **pawn** of its own colour. No hand holds a queen. |
| B4 dropped pawn on the 7th rank; en passant across boards | `K` + B:e5 pawn (seat 1), A:a2 pawn (seat 0), A:h7 pawn (seat 3); hand of seat 2 = one pawn; seat 2 to move. `p@B:d7`, `A:h7-A:h6`, `A:a2-A:a3`, `B:e1-B:f1`, `B:d7-B:d5`, `A:h6-A:h5`, `A:a3-A:a4`, `B:e5-B:d6`. | `B:d7-B:d5` is legal (a dropped black pawn on its second rank). Afterwards `ep = [-1, B:d6]`. It is still `[-1, B:d6]` after the two board-A moves. `B:e5-B:d6` (en passant) is legal for seat 1, and the captured black pawn goes to seat **3**. |
| B5 en passant expires with the next move on its board | `K` + A:d2 pawn (seat 0), A:e4 pawn (seat 3), B:a2 pawn (seat 1), B:a7 pawn (seat 2). `A:d2-A:d4`, `B:a2-B:a3`, `B:a7-B:a6`, then seat 3 plays `A:e8-A:f8`, followed by `A:e1-A:f1`, `B:a3-B:a4`, `B:a6-B:a5`. | Before seat 3's move, `A:e4-A:d3` is legal. After seat 3 declines it, it is no longer legal on seat 3's next turn. |
| B6 a king capture ends the whole game | `K` + B:e7 White queen (seat 1) + A:d1 White queen (seat 0); seat 1 to move. `B:e7-B:e8`. | A certain capture. Result: `{ winner: null, winners: [1, 3], reason: 'king' }`. No legal moves remain for anyone, although board A is untouched. |
| B7 team budget (quantum) | `K` + A:b1 and A:g1 knights (seat 0), B:b8 knight (seat 2), B:b1 knight (seat 1). `A:b1-A:a3\|A:c3`, `B:e1-B:d1`, `B:b8-B:a6\|B:c6`, `A:e8-A:d8`, `A:g1-A:f3\|A:h3`, `B:b1-B:a3\|B:c3`. | After the first four moves, Team 1's budget is 4 (seat 0 and seat 2 both show 4), Team 2's is 1, and there are 4 worlds. Seat 0 may still split A:g1. After that split, Team 1's budget is 8 (8 worlds). Seat 1 (Team 2) may still split B:b1, which gives 16 worlds and a Team 2 budget of 2. Seat 2 (Team 1) now has **no** legal split of its B:a6/B:c6 knight (team budget full), but can measure it (`?B:a6`: 50% B:a6 / 50% B:c6). |
| B8 capturing a ghost; the boards are independent (quantum) | 4 worlds, all with `K` + A:c3 bishop (seat 0): the black knight of seat 3 is on A:a5 or A:d4, and the white knight of seat 1 is on B:c3 or B:e4, in all 4 combinations. `A:c3-A:a5`. | Rolled: `move` 50%, `capture` 50%. **Move:** the black knight is 100% on A:d4, and no hand holds anything. **Capture:** seat 2's hand holds a black knight, certainly. In both branches the knight on board B is still 50% B:c3 / 50% B:e4. |
| B9 drop probe (quantum) | World A (weight 3): `K` + B:d4 knight (seat 1); world B (weight 1): `K` + B:f5 knight (seat 1). Seat 2's hand = one pawn; seat 2 to move. `p@B:d4`. | `miss` 75% (the knight is found on B:d4, and the pawn stays in hand), `move` 25%. |
| B10 castling per board | Start position. `A:g1-A:f3`, `B:g1-B:f3`, `B:g8-B:f6`, `A:g8-A:f6`, `A:e2-A:e3`, `B:e2-B:e3`, `B:e7-B:e6`, `A:e7-A:e6`, `A:f1-A:e2`, `B:f1-B:e2`, `B:f8-B:e7`, `A:f8-A:e7`, then `O-O` (seat 0), `B:e1-B:f1` (seat 1), `O-O` (seat 2), `A:e8-A:f8` (seat 3), `A:d2-A:d3` (seat 0). | Seat 0's `O-O` puts its king on A:g1 and its rook on A:f1. Seat 2's `O-O` is certain and puts its king on B:g8 and its rook on B:f8. On seat 1's next turn, `O-O` is not legal, because its king moved. |
| B11 start | Start position. | Seat 0 has 20 legal moves. There are 64 pieces and 1 world, and every budget is 1. |
| F1 fuzz invariants | Random games (the fuzz spec, 4 seats). | After every move: the hands (id, side, type) are identical in all worlds; each team budget is ≤ 8 and there are ≤ 64 worlds; no pawn stands on rank 1 or 8 of either board; every piece on the board stands on its owner's board; the pieces on the boards, plus those in hands, plus captured kings, number 64. |
