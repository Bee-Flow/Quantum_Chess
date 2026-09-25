# Variant spec: `bughouse` (Bughouse)

Category: `rules`. Players: 4 (two teams of two). UI name: "Bughouse". Summary line (already in `catalog.js`): "Two
boards, two teams: what you capture, your partner may drop."

Bughouse is crazyhouse on two boards. Read `crazyhouse.md` first: the drop rules, the promoted piece types and the
quantum treatment of hands and drops are the same, and this file only repeats what bughouse needs.

---

## 1. Sources and chosen rule set

Research note: the original research could read only raw.githubusercontent.com. The rules review (section 8.1)
re-checked every rule against the live pages and rule books listed below. Lichess has no bughouse. The test cases in
section 7 were run on a prototype built on the real `src/variants/core`, with the team budget of 4.4 patched into a
copy of `quantum.js` (`handoff/prototypes/zh/bug.mjs`, `quantum_team.js`, `tbug.mjs`, `tbug2.mjs`, `tbug3.mjs`,
`fuzz.mjs`, `ai.mjs`). The engine review (section 8.2) added B14–B23. Its second pass ran B1–B23 and F1 on the
working-tree core of 2026-09-25, which implements the `handoff/CORE-CHANGES.md` items this spec needs, with a
prototype that follows section 3 exactly and patches nothing (`handoff/tmp/critic-bughouse/real/`).

| Source | What it gives |
|---|---|
| Wikipedia "Bughouse chess", section Rules (read in full, https://en.wikipedia.org/wiki/Bughouse_chess; it follows the USCF, FICS, ICC and Berlin tournament rules) | "Partners sit next to each other and one player per team has black pieces, while the other has white pieces." "A player capturing a piece immediately passes that piece to their partner", who may drop it instead of moving, "on any vacant square, including squares where the piece delivers check or checkmate; however, pawns may not be dropped on the first or last rank." "All promoted pawns convert back to pawns when captured." "A pawn placed on the second rank ... may move two squares on its first move, and ... be captured en passant." "A rook placed on its typical starting square (a1, h1, a8, h8) may take part in castling." "The match ends when the game on either board ends." "The match can be drawn by agreement or when two players on opposite teams run out of time or are checkmated simultaneously." Threefold repetition on one board is a draw on FICS and chess.com. Two-player play: "It can also be played with just one clock by playing the boards in a specific order (White A, White B, Black B, Black A) and pressing the clock after each move" (von Zimmermann 2006, p. 108). |
| pychess-variants `static/docs/bughouse.md` (read in full; a shortened copy of the Wikipedia rules, without the castling sentence) and `server/bug/game_bug.py` | The same rules. In the pychess code a board ends only when the player to move has no legal move **even with every piece type in hand**, and that player then loses; a player without a move otherwise waits. Draws: by team agreement, and a ply limit. |
| Fairy-Stockfish `src/variant.cpp`, `bughouse_variant()` (read) | Bughouse = crazyhouse with `twoBoards = true`, `capturesToHand = false` (captures go to the partner, not to oneself), and `stalemateValue = -VALUE_MATE` (a stalemated player loses). Castling rights are never restored by a drop (as in crazyhouse). |
| chess.com Help Center "What is Bughouse?" (read, https://support.chess.com/en/articles/8615092-what-is-bughouse) and chess.com Terms "Bughouse" (read, https://www.chess.com/terms/bughouse-chess) | Captured pieces go to the partner's "piece bank". "Pawns may not be dropped on the 1st or 8th ranks." "A pawn that is placed on the 2nd rank may move two squares on its first move." "Promoted pawns that are captured are returned to the piece bank as pawns" ("counterfeits"); for example, Black captures a promoted knight and the partner "will receive a white pawn". "A bughouse game is over when a game on either board ends in checkmate, resignation, or timeout." "The game can also end if the players agree to a draw." |
| CSC "Comprehensive Rules of Bughouse", November 2014 (read, https://www.chesscincinnati.com/wp-content/uploads/CSC-Comprehensive-Bughouse-Rules.pdf) | Over-the-board tournament rules. "For each team, the player with the white pieces sits on the left side and the teammate playing black sits on the right." "Pawns cannot be placed on the first or eighth rank. Drop-promoting is illegal, but pawns can be dropped on the 7th rank." A pawn placed on the 2nd rank may advance two squares and can then be taken en passant; "A pawn placed on the 4th rank is not deemed to have moved two squares ... and is therefore not subject to en passant capture." "A rook placed on a home square ... is deemed to have moved for the purposes of castling and therefore may not be castled with its king." A king left in check may be captured, which "ends the game immediately". "A team is deemed to have resigned if at least one player thereof resigns." Draws: games ending at the same time with different winners, both flags, threefold repetition on one board, agreement of all four players. |
| WBN "Laws of Bughouse chess", version 1.00 (read, https://www.chessfed.gr/old_site/wccc2007/files/bughouse_chess_complete_rules.pdf) | Castling is illegal "with dropped rook" (5.8). "A dropped piece is considered not to have moved. So the pawn dropped on the second rank can make a double step" (5.11). Simultaneous endings with different winners are a draw (1.10). BPGN names the seats WhiteA, BlackA, WhiteB, BlackB. |
| USCF "2006 Bughouse Rules" (read, archived at https://web.archive.org/web/20250108185321/http://www.uschess.org/tournaments/2006/2006bughouse.pdf) and FICS `help bughouse` (read, https://www.freechess.org/Help/HelpFiles/bughouse.html) | Pawns may not be placed on the first or last rank; pieces may be placed to give check or mate; "A promoted pawn, which has been captured, reverts to a pawn". Win by mate, resignation, flag, or by taking the king after an illegal move. A mated player whose check could be blocked by a drop may wait for a piece. Draw by agreement between the teams (FICS: accepted on both boards). |
| pion.ch "Bughouse complete ruleset" (read, http://www.pion.ch/Bug/ruleseng.html) | "The player is not considered to be stalemated" (art. 8). A captured promoted pawn "returns to a simple pawn in the partner's stock" (art. 9). Both games ended with different winners: the match is a draw (art. 13). |
| scalachess `Crazyhouse.scala` (read) | The crazyhouse drop rules. They are identical to the bughouse drop rules above (see `crazyhouse.md`). |

**Chosen rule set: the common online and tournament bughouse rules (Wikipedia, chess.com, FICS, pychess, CSC), with the
crazyhouse drop rules of lichess, made turn-based.** The sources agree on the drop and pass rules. The decisions where
they differ, or where turn-based play forces a choice:

- **Turn-based play.** Real bughouse is simultaneous and played on the clock. Here the four seats move in a fixed
  order (2.3): White A, White B, Black B, Black A. This is the order von Zimmermann gives for playing bughouse with a
  single clock or by correspondence (Wikipedia, "Two-player and six-player variations"). Time, "stalling" and sitting
  and waiting for a piece do not exist.
- **Check and checkmate:** as in every variant of this app, there is no check. **Capturing a king ends the whole
  game.** The team of that king loses. Over-the-board bughouse knows this too: a king left in check may be taken,
  which ends the game at once (CSC section 8, USCF rule 15). Classic Quantum Chess's "your king cannot escape" loss
  and its "draws wait while a king can be taken for certain" (docs/rules.md 5 and 6) do not exist in the variants
  (CORE-CHANGES item 72).
- **Castling with a dropped rook:** not allowed, as in `crazyhouse.md`. This is the rule of the CSC tournament rules
  (a rook placed on a home square "is deemed to have moved for the purposes of castling") and of the WBN Laws (5.8),
  and it is how Fairy-Stockfish, pychess and lichess crazyhouse behave: a drop never restores a castling right.
  Wikipedia's rules section allows it instead ("A rook placed on its typical starting square (a1, h1, a8, h8) may take
  part in castling"). Keeping one rule for both drop variants is simpler.
- **Pawn drops:** never on rank 1 or rank 8 (all sources). A pawn may be dropped on rank 7 (White) or rank 2 (Black)
  and promote on its next move (CSC, Wikipedia). A pawn dropped on its own second rank may make the two-square step;
  a pawn dropped on any other rank may not, and a drop never creates an en passant chance (CSC, WBN 5.11).
- **No legal move:** the over-the-board rules say the player is "not considered to be stalemated" and waits for a
  piece (pion.ch art. 8; pychess ends a board only when no move exists even with every piece type in hand).
  Fairy-Stockfish counts a stalemate as a loss. The turn-based form of waiting is to pass the turn. The core can do
  that with CORE-CHANGES Q10 `passWhenStuck`, but the lead has not chosen it for bughouse (8.2, open questions). Until
  then a seat with no legal move ends the game as a **draw**, the app's generic `noMoves`. Without check, a seat has
  no move only if every piece is walled in, it has no ghost to measure and its hand is empty, which practically never
  happens.
- **Draws:** the sources do know draws, although they are rare: agreement (CSC: all four players; FICS: accepted on
  both boards), both games ending at the same moment with different winners, both flags down, and threefold repetition
  on one board (FICS, chess.com, CSC). A blog line "There are no draws in Bughouse" on chess.com is not a rule. In
  turn-based play two games can never end at the same moment and there are no clocks, and the variant core has no
  repetition rule. The app keeps its technical limits instead, scaled to four seats: the quiet rule (`quietPlies` 200 =
  50 moves per seat without a capture, a pawn move or a drop, on either board) and the move limit (`maxPly` 1200 = 300
  moves per seat), plus `noMoves` above and agreement.

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
`(side + 1) % 4`, and no seat is ever out). This is the published one-clock order of bughouse (von Zimmermann 2006,
p. 108, quoted by Wikipedia).

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
  Black B receives a black knight. En passant captures pass the pawn on like any capture.
- A captured **promoted** piece is passed on as a **pawn** of the same colour. For example, Black A captures a white
  promoted knight and White B receives a white pawn. A king is never passed on: capturing it ends the game.
- A seat may drop only from **its own** hand, and only onto **empty squares of its own board**. Pawns may not be
  dropped on rank 1 or rank 8, for either colour. A pawn may be dropped on the square before promotion (rank 7 for
  White seats, rank 2 for Black seats) and promote on its next move. Drops never capture. They may attack the king.
- A dropped piece counts as not having moved, with one exception (2.7: a dropped rook never castles). So a pawn dropped
  on its own second rank (rank 2 for White seats, rank 7 for Black seats) may make the two-square step, and can then
  be taken en passant. A pawn dropped on any other rank moves one square at a time, and the drop itself never creates
  an en passant chance (a pawn dropped on its fourth rank next to an enemy pawn cannot be taken en passant).
- Drop codes: `<type>@<square>`, e.g. `n@B:f3`, `p@A:d6`.

### 2.7 Special moves per board

- **En passant is per board.** A double step on board A may be answered en passant only by the next move **on board
  A** (the opponent's reply there), even though two moves on board B happen in between. The next turn on board A
  clears it, whatever it is: a move, a drop, a split, a merge or a measure, including the possibilities where that
  move missed (4.5). The world keeps `x.ep = [epA, epB]` and `x.epVictim = [victimA, victimB]`.
- **Castling:** as in chess, per seat on its own board (`O-O` / `O-O-O`; the codes need no board letter, because
  only the seat to move can castle and each seat plays on one board). There are no check conditions. Every square
  between the king and the rook, and the squares the king and the rook land on, must be empty. A right is lost for good
  when the king or that rook moves or the rook is captured. A dropped rook never castles: a rook dropped on its home
  square (a1/h1 for the White seats, a8/h8 for the Black seats) does not restore the lost right (CSC, WBN; see
  section 1).
- **Promotion:** as in crazyhouse (`A:e7-A:e8=q` → `+q`).

### 2.8 End of the game

- **Win:** capturing **any** king ends the whole game at once, on both boards. The team whose king was captured
  loses; the result is `{ winner: null, winners: [the two seats of the other team, ascending], reason: 'king' }`.
  Resignation by one seat loses for the team, as in the CSC rules (the UI already declares every enemy of the
  resigning seat a winner).
- **Draw:** a seat to move without any legal move (move, drop, split, merge or measure); the quiet rule (200 plies
  without a capture, a pawn move or a drop, on either board); the move limit (1200 plies); agreement. The other
  over-the-board draws cannot occur: the two games never end at the same moment, there are no clocks, and there is no
  repetition rule (section 1).

---

## 3. Engine mapping (contract)

| Field | Value |
|---|---|
| `id`, `category` | `'bughouse'`, `'rules'` |
| `sides` | `[{ id: 'aw', name: White A, color: 'white', rotate: 0 }, { id: 'bw', name: White B, color: 'white', rotate: 180 }, { id: 'bb', name: Black B, color: 'black', rotate: 0 }, { id: 'ab', name: Black A, color: 'black', rotate: 180 }]` |
| `teams` | `[[0, 2], [1, 3]]` |
| `enemies(a, b)` | `a % 2 !== b % 2` |
| `orient(side, v)` | mirror coordinate 1 when `side >= 2` |
| `topology` | `makeTopology` with the coordinates, names and cells of 2.2 and 6, `layout.zoomable: true` |
| `types` | `orthodoxTypes({ lastRank: (side, sq) => rank(sq) === (side >= 2 ? 0 : 7) })` plus `+q`, `+r`, `+b`, `+n`; values as in crazyhouse |
| royal / solid / splittable | `k` royal. `k` and `p` solid. The rest splittable. |
| `drops` | `true` |
| `setup` | 2.5, `x = { ep: [-1, -1], epVictim: [-1, -1], castle: [8 rights] }` |
| `extraMoves` | double steps and en passant of the seat's board, castling, drops onto the seat's board (below) |
| `onCapture` | to the partner's hand, demoting promoted types; a king goes `OFF` |
| `afterMove` | for the board of `m.to` only: set `ep`/`epVictim` after a double step, else clear them; castling rights; promoted type |
| `applyMiss(b, action, side)` | CORE-CHANGES Q1: clears `ep[bd]` and `epVictim[bd]` of `bd = boardOf(side)` only (a copy, `{ ...b, x: { ...b.x, ep, epVictim } }`); returns `b` itself when they are already −1. Never the other board's (B22). Not `clearEnPassant` of W4, which handles a single `x.ep` |
| `unifyWorlds` | CORE-CHANGES Q3: `(bs) => unifyCastling(bs)` of W5 (a right survives only if every world still has it) |
| `budgetRule(b, side)` | CORE-CHANGES Q6: `{ sides: [side, (side + 2) % 4], limit: 8 }` |
| `solidExtra` | the hand contents (guard, as in crazyhouse) |
| `worldResult` | 2.8 |
| `noMoves` | the default (draw, `reason: 'noMoves'`); `passWhenStuck` not set (open question in 8.2) |
| `quietPlies`, `maxPly` | 200, 1200 |
| `reasonText(reason)` | `'quiet'` → "50 moves by each player without a capture, a pawn move or a drop" (the generic text omits drops, and the limit is per player); `null` for every other reason |
| `evaluate` | team material (below) |
| `handOrder` | `['p', 'n', 'b', 'r', 'q']` (CORE-CHANGES U16, as crazyhouse) |
| `layoutOf(state)` | marks the board of the seat to move and follows it when zoomed; the focus is keyed by the seat to move (section 6; CORE-CHANGES item 56, U2) |
| `replySide(s, me)` | CORE-CHANGES U3: `3 − me`, the opponent on the same board (B23) |
| `options`, `visibility` | none |

**Castling rights** (the same shape as `castlingRights` returns, so W5's `unifyCastling` can compare them). Each right
is `{ side, flag, king, rook, kingTo, rookTo }`, with 8 rights in total:

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

**`core/orthodox.js` on three coordinates.** Before CORE-CHANGES W3, `castlingRights`, `between` and
`orthodoxAfterMove` built squares with `topo.at([f, r])`, which is −1 on this topology: no castling, `kingTo = −1`
and never an en passant square. W3 (in the working tree) generalises them. Bughouse then uses:

- castling: `castlingMoves(spec, w, side)` as it is, with the 8 rights of the table above (`castlingRights` still
  builds rights for two sides only, and would give White B the flags `k`/`q`). Its moves have kind `castle`, so Q2
  makes them certain-only;
- `pawnExtras` with a shallow view world `{ ...w, x: { ep: w.x.ep[bd], epVictim: w.x.epVictim[bd] } }` for the
  seat's board `bd`. Its en passant moves have kind `ep`, so they are certain-only too;
- a local `afterMove`, because `orthodoxAfterMove` keeps a single `x.ep`. It sets or clears `ep[bd]` of the board of
  `m.to` only, filters the castling rights as `orthodoxAfterMove` does, and turns a promotion into `+q`/`+r`/`+b`/`+n`.

Drops (like crazyhouse, restricted to the seat's board: squares `64 × bd … 64 × bd + 63`) and the per-board
bookkeeping. `boardOf(side)` is 0 for seats 0 and 3 and 1 for seats 1 and 2; `boardOfSq(sq)` and `rank(sq)` are
coordinates 2 and 1 of the square; `at(f, r, bd)` is `topology.at([f, r, bd])`; `kingOnBoard(b, s)` says whether seat
`s` has a king with `b.sq[id] >= 0`. This is the code the second engine review ran
(`handoff/tmp/critic-bughouse/real/bug.mjs`):

```js
extraMoves(w, side) {
	const bd = boardOf(side)
	const view = { ...w, x: { ep: w.x.ep[bd], epVictim: w.x.epVictim[bd] } }
	const out = [
		...pawnExtras(spec, view, side, (s, sq) => rank(sq) === (s >= 2 ? 6 : 1)),
		...castlingMoves(spec, w, side),
	]
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
afterMove(next, m) {                                           // next.x is a deep copy (cloneWorld)
	const bd = boardOfSq(m.to)                                   // a drop or castling also lands on the seat's board
	if (m.kind === 'double') {
		const [f, r1] = topology.coords[m.from]
		next.x.ep[bd] = at(f, (r1 + topology.coords[m.to][1]) / 2, bd)
		next.x.epVictim[bd] = m.to
	} else {
		next.x.ep[bd] = -1
		next.x.epVictim[bd] = -1
	}
	next.x.castle = next.x.castle.filter((c) => !(m.from === c.king || m.from === c.rook || m.to === c.rook
		|| m.to === c.king))
	if (m.promo) next.ty[m.id] = '+' + m.promo                  // the core already set 'q'; mark it as promoted
},
applyMiss(b, action, side) {                                   // an idle world of this seat's turn
	const bd = boardOf(side)
	if (b.x.ep[bd] === -1 && b.x.epVictim[bd] === -1) return b
	const ep = b.x.ep.slice()
	const epVictim = b.x.epVictim.slice()
	ep[bd] = -1
	epVictim[bd] = -1
	return { ...b, x: { ...b.x, ep, epVictim } }
},
unifyWorlds: (bs) => unifyCastling(bs),
budgetRule: (b, side) => ({ sides: [side, (side + 2) % 4], limit: 8 }),
worldResult(b) {
	for (let s = 0; s < 4; s++) {
		if (!kingOnBoard(b, s)) return { winner: null, winners: [(s + 1) % 4, (s + 3) % 4].sort(), reason: 'king' }
	}
	return null
},
replySide: (s, me) => 3 - me,
```

**Core changes this spec relies on.** Each one is an item of `handoff/CORE-CHANGES.md`, and each is in the working
tree of 2026-09-25. The second engine review ran every section 7 case on that core, with the semantics below
(section 8.2).

1. **Team budget: Q6 `budgetRule` and U5.** Before Q6, `projection(b, side)` kept only the pieces with
   `b.sd[id] === side`, and no variant hook could change that. With `budgetRule` as above, the budget used is the
   number of distinct arrangements of both partners' pieces (board and hand, keyed with their side) over the worlds.
   It applies to the pass = link fallback, merges and the split check. `budgetInfo(V, state, side)` gives
   `{ used, limit, sides }` for the pips (U5), so both partners show the team's number. `budget(state, side)` keeps
   its per-side meaning, so tests read the team budget from `budgetInfo(...).used`. Checked by B7 and B15 (without
   Q6, B15 is a plain link: `move` 100%).
2. **Idle worlds: Q1 `applyMiss(b, action, side, info)`.** Wherever the action did not take effect (the `miss` worlds
   of a move or merge, the worlds of a split where the piece is not on `f` or where its half stays home, every world
   of a measure), `afterMove` does not run. Without the hook, the en passant square survives there and can be used on
   a later turn: in B14, after a measure by each seat of board A, `A:e4-A:d3` was still a **certain** capture, and
   random play left a stale square after 164 of 4082 plies. The variant cannot see a miss, so it needs the hook. It
   must clear only the mover's board, `boardOf(side)`, which is why Q1 passes `side`: clearing both boards would kill
   board A's right on board B's idle turns (B22).
3. **Certain castling and en passant: Q2, and Q3 with W5** (the lead's decisions D1, D2).
   - A castling or en passant key is legal only when every possibility generates it as a certain move. It is then
     never rolled.
   - `unifyWorlds: unifyCastling` drops a right in every possibility as soon as the king or that rook is not 100% home.
   - D2 says "the ply right after the double step". In bughouse that is the next turn **on that board**: the two plies
     of the other board in between do not count. The per-board `afterMove` and `applyMiss` above implement exactly
     that, and nothing in the generic core clears `x.ep` by itself.
   - Checked by B14, B20, B21 and B22, and by F1's invariant that `x.ep` and `x.castle` are the same in every world.
4. **The quiet counter: Q8.** Only a capture, or a pawn move or drop that really happened, resets it (B9).
5. **The computer's reply search: U3 `replySide`.** By default `ai.js` `replyValue` answers with the side to move
   next. After White A moves, that is White B on the **other** board, so the computer never sees the threat of Black
   A, who moves three plies later on its own board, and it leaves pieces hanging. With `replySide: (s, me) => 3 - me`
   it searches the replies of the opponent on the same board (B23).
6. **W3** (castling and en passant helpers on three coordinates), **U2** (focus key), **U7** (drop texts, the shared
   castling sentence), **U13** (promoted marker), **U16** (`handOrder`), **U17** (drop codes `P@B:d2`).
7. **Optional: Q10 `passWhenStuck`**, if the lead prefers "the seat passes" to a draw (section 1, "No legal move").

The prototype `handoff/tmp/critic-bughouse/real/bug.mjs` implements this section on the working-tree core without any
patch. `cases.mjs` (B1–B21) and `extra.mjs` (B22, B23) assert every row of section 7: 86 assertions, all pass.
`fuzz.mjs` runs F1: 70 games, 10,703 plies, 2,109 splits, 797 merges, 416 measures and 883 drops, with no violation.
The games reached at most 64 worlds and a team budget of 8.

`evaluate(w, side)`: the default `worldValue` counts own material + 0.5 × partner − the average of the two enemies,
with hand pieces at 0.8. Bughouse should use **team material**, own + partner − both enemies, with hands at full
value. So `evaluate` returns the difference:

- for board pieces: partner +0.5 v, each enemy −0.5 v;
- for hand pieces: own +0.2 v, partner +0.6 v, each enemy −0.6 v;
- plus the crazyhouse king-proximity term on the seat's own board: +12 for each own non-king piece within king
  distance 2 of the enemy king there, −12 for each enemy piece within distance 2 of the own king.

Performance (prototype on the working-tree core, 128 squares): the F1 run of 10,703 plies takes 20 s in total, with
up to 64 worlds. `chooseMove` takes 8 ms (easy), 28 ms (normal) and 60 ms (hard) at B2's end (seat 2 with a pawn in
hand, 62 legal moves). With five piece types in each hand on board A (226 legal moves) it takes 11, 174 and 633 ms,
within the levels' time limits.

---

## 4. Quantum adaptation

Everything in `crazyhouse.md` section 4 applies:

- hands are always certain (one occupant per square), with `solidExtra` as a guard;
- drops are measured: **Dropped** or **Missed** when a ghost might stand on the square, and a missed drop is a probe;
- the dropped id is the lowest of its type in the hand;
- there are no split drops;
- promoted ghosts go to the hand as a pawn in the *Captured* branch.

The one exception is castling. `crazyhouse.md` 4.4 still rolls it; here it follows the lead's decision D1 (4.5), as
CORE-CHANGES section 5 asks for crazyhouse too.

In addition:

### 4.1 A capture roll decides what the partner receives

A capture onto a square where a ghost might stand is rolled on the capturer's board. In the *Captured* branch the
piece is certainly in the partner's hand. In the *Moved*/*Missed* branch it is certainly not. The partner therefore
always knows exactly what it can drop. A promoted ghost reaches the partner as a pawn in the *Captured* branch only
(B18). The fuzz runs found no state with differing hands (piece ids included) and no square with two different
pieces over the possibilities: none in 1489 random plies of the research prototype, none in 10,703 plies on the
working-tree core (F1).

### 4.2 The two boards stay independent

No move, roll or link ever connects a piece on A with a piece on B:

- movement never crosses boards;
- hands are certain;
- a roll only conditions on the board where it happens.

So the possibilities are always "the possibilities of A × the possibilities of B", and a roll on one board never
changes the odds on the other (test B8). This is exact up to the integer rounding of the weights (a few parts in
2^24 when odds such as 1/3 occur). The possibilities panel can therefore list the two boards separately.

The only link between the boards is a rule, not the odds: the team budget (4.4). Your partner's ghosts on the other
board can make your move a budget-full roll (B15). A capture also moves a piece to the other board's hand, but only
in a branch where it is certain, so it adds no odds.

### 4.3 The game-end roll

A king is solid, so capturing it is certain or rolled (*Captured*/*Missed*) like any capture. When a king is captured,
the whole game ends in every possibility. The generic game-end roll covers any other case.

- A ghost part that attacks a king lands on an occupied square, so it is rolled: *Captured* ends the game, *Missed*
  finds the ghost on its other square and the game goes on (B16).
- A converging capture (a merge onto the king) is certain when every part's path is clear. It ends the game without
  a roll. One part alone is a roll (B17).
- A captured king goes `OFF`, never into a hand.

### 4.4 The budget belongs to the team

**Decision: each team has one budget of 8.** It counts the distinct arrangements of the pieces of **both partners, on
both boards and in both hands**. This keeps the classic guarantees:

- the whole game never has more than 8 × 8 = **64 possibilities** (the core's `MAX_WORLDS`), so the world limit can
  never block a split that the budget allows. The number of possibilities is at most Team 1's budget × Team 2's
  budget, because the castling rights and the en passant squares are the same in every possibility (CORE-CHANGES
  Q1–Q3; F1 checks both). Before Q1–Q3 there was one rare exception: possibilities that differed only in a castling
  right or an en passant square, which no budget counts. The split's `MAX_WORLDS` check keeps 64 a hard limit in any
  case;
- **the other team can never use up your budget**: only your team's own moves raise it (B7: the other team's split
  leaves yours at 8). The other team's moves can only lower it, by capturing your pieces or by a roll.

The team budget is used wherever the core uses the budget: splits, merges and the pass = link fallback. A slide that
would link your piece to a ghost is rolled instead (the budget-full roll of docs/rules.md 7.1) when your **team** is
full, even if you alone are not (B15). The variant UI shows it like any roll, with its odds.

A budget per seat would allow 8 per seat and up to 8⁴ possibilities. Splits would then run into the shared 64-world
limit, and one team could block the other's splits by filling it. That is the capacity-denial problem that D5 of
`engine-rules.md` rules out.

With the board independence (4.2), the team's count is the product of its two seats' counts. For example, a 50/50
ghost on each board gives 2 × 2 = 4. So partners share the budget, and planning it together is part of the team game.

### 4.5 Turn order and rolls

The seat to move rolls only for its own board. The order of 2.3 gives each board ordinary alternating play, so the
shared rules of every roll (pawn and king moves, drops, land = roll, pass = link) apply per board without change. In
detail:

- **En passant is only possible on the next turn of that board, and it is certain.** It is legal only when every
  possibility allows it (CORE-CHANGES Q2, decision D2), and then it is never rolled. Any turn of the seat that may
  take it ends the chance: a move, drop, split, merge or measure. That includes the possibilities where the move
  missed, through the per-board `applyMiss` (Q1; B14). The two turns on the other board in between never end it,
  even where they missed or measured (B22). Without Q1 the square survived in the missed possibilities and could be
  used on a later turn.
- **Castling never rolls** (Q2 and W5, decision D1, as in `rules.md` 5). It is legal only when every possibility
  allows it: king and rook are solid on their squares and every square they cross or land on is certainly empty. A
  right is lost in every possibility as soon as the king or that rook is not 100% on its square: after a slide that
  happened in some possibilities only, it is gone even where the rook stayed (B21). A ghost on a square the king or
  rook must cross makes `O-O` illegal (B20). The core before Q2 rolled it instead (*Moved*/*Missed*), and
  `crazyhouse.md` 4.4 still describes that.
- **Measure** is the seat's turn on its own board.
- **Quiet counter** (200 plies): only a capture, or a pawn move or drop that really happened, resets it (CORE-CHANGES
  Q8; B9: a Missed drop adds 1). The core before Q8 also reset it after a Missed pawn move or drop.

---

## 5. Player-facing rules text (rules card)

1. Two teams play on two boards: White A and Black B against White B and Black A.
2. The seats move in turn: White A, White B, Black B, Black A. Each board alternates White and Black.
3. What you capture goes to your partner, who may drop it on an empty square of their own board instead of moving.
   Pawns are never dropped on the first or last rank.
4. A captured promoted piece (marked +) is passed on as a pawn.
5. Capturing a king on either board ends the whole game: that king's team loses.
6. Your team shares one budget of 8, not 8 per player: your partner's ghosts count too.
7. A drop onto a square where a ghost might stand is a roll. If the square is taken, the piece stays in your hand.
8. A pawn dropped on your second rank may move two squares. A dropped rook never castles. En passant is only possible
   on the next turn of that board.

Checked against the rules and the core: item 6 overrides the shared sentence "Each side has a budget of 8 possible
arrangements of its pieces" of `texts.js`, which the rules screen shows next to this card. The shared sentences also
gain "castling and en passant are only possible when they are possible in every possibility, and they are never rolled"
(CORE-CHANGES U7), so the card does not repeat it. Item 8's en passant sentence needs the per-board `applyMiss`
(CORE-CHANGES Q1, B14, B22).

---

## 6. UI layout

- **Cells** (rect, 1 × 1, `x` and `y` of the top-left corner, y growing downwards, `GAP = 0.8`):
  - board A: `x = f`, `y = 7 − r` (White A at the bottom, file a on the left);
  - board B, turned half a turn: `x = 8 + GAP + (7 − f)`, `y = r` (Black B at the bottom, file h on the left).

  So **the partners of Team 1 sit side by side at the bottom**, as in over-the-board bughouse: White A bottom-left,
  Black B bottom-right (the CSC rules seat each team's White player on the left and its Black player on the right,
  with the boards turned in opposite directions; the Wikipedia diagram draws board B turned half a turn too). Each
  board keeps a light square in its bottom-right corner seen from the player at the bottom (A:h1 and B:a8).
  Shade: `(f + r) % 2 === 0` → `dark` on both boards (a1 is dark).
- **Layout:** `width 16.8`, `height 8`, `zoomable: true`, `boards: [{ x: 0, y: 0, w: 8, h: 8, label: 'A' }, { x: 8.8,
  y: 0, w: 8, h: 8, label: 'B' }]` (the frame and the label above each board are drawn by `VariantBoard`).
  `zoomable` is needed: `VariantBoard` offers zoom only when `width × height > 200` (here 134.4) or the layout sets it.
  Labels:
  - board A: files a–h below (`x = f + 0.5`, `y = 8.32`) and ranks 1–8 on the left (`x = −0.3`, `y = 7.5 − r`);
  - board B: files below in the order h…a (`x = 8.8 + (7 − f) + 0.5`, `y = 8.32`) and ranks on the right
    (`x = 17.1`, `y = r + 0.5`, rank 1 at the top).

  `PAD = 0.7` covers both label columns.
- **Rotation:** `rotate: 0` for seats 0 and 2 (Team 1) and `180` for seats 1 and 3. Turning the whole drawing half a
  turn puts Team 2's partners side by side at the bottom: White B bottom-left, Black A bottom-right. With auto-flip,
  the view turns on every ply, because the teams alternate.
- **Pieces:** cburnett sprites in white and black (two seats share each colour, the board tells them apart). Promoted
  pieces carry the red "+" marker of `crazyhouse.md` section 6 (CORE-CHANGES U13).
- **Active board:** mark the board whose seat is to move. The layout API can already do this, with no UI change:
  `layoutOf(state)` returns `{ ...topology, layout: ACTIVE[state.turn] }`, where `ACTIVE[0]` … `ACTIVE[3]` are four
  layouts built once, one per seat. Each equals the static layout plus:
  - `areas: [{ x: bx − 0.12, y: −0.12, w: 8.24, h: 8.24, shade: 'wood' }]`, a plate behind the seat's board (`bx` = 0
    for seats 0 and 3, 8.8 for seats 1 and 2). Areas are drawn under the cells, so only a thin rim shows. It stays
    clear of the labels at x = −0.3 and 17.1, and at y = 8.32;
  - `focus: { x: bx + 4, y: 4, key: 'seat' + s }` for seat `s`. When a player has zoomed in, the view then follows the
    board to move. At zoom 1 nothing changes, because `focus` without `zoom` keeps the current zoom.

  The key must name the **seat**, not only the board. `VariantBoard` keeps the zoomed centre in turned coordinates
  and recomputes it only when the focus key changes (U2), not when the rotation changes. With auto-flip the rotation
  changes on every ply, while the active board stays the same for two plies (B, B, then A, A). A key per board, or
  no key (U2 then compares `x`, `y` and `zoom`), would leave a zoomed view on the wrong board at every second ply:
  for example Black B moves on board B, but the view shows board A. With the seat in the key, the view recentres
  with the current rotation on every ply.

  This is CORE-CHANGES item 56 (variant level). The plan suggests a halo of 0.3; 0.12 keeps the rim clear of the
  rank and file labels. Show "White B to move" in the status line.
- **Hands:** the existing hands panel, one row per seat in seat order (White A, White B, Black B, Black A), pieces in
  the order of `handOrder` (U16). Only the seat to move can click its hand. Drop previews and wording come from
  CORE-CHANGES U7 ("Dropped" / "Missed: the square was taken"). Sorting the rows by team with a caption ("Team 1:
  White A + Black B") would be a small UI addition that is not in the plan: optional.
- **Move list:** the codes already name the board (`A:e2-A:e4`); U17 shows drops as `N@B:f3`. One column per board,
  or a seat prefix ("White B: N@B:f3"), is optional UI polish that is not in the plan.
- **Result:** `resultText` already gives "White A & Black B win (a king was captured)" for
  `{ winner: null, winners: [0, 2], reason: 'king' }`, joining `winners` with " & ". The quiet draw reads "Draw (50
  moves by each player without a capture, a pawn move or a drop)" through the variant's `reasonText` (section 3). To
  name the board, the variant could return its own reasons `kingA`/`kingB` with `reasonText` ("a king was captured on
  board A"). The game-end note of a roll uses the same text.
- **Narrow screens:** the 16.8 × 8 drawing is wide. With `zoomable: true` and the `focus` above, the existing zoom can
  stay on the active board. A stacked layout for phones is rejected for v1 (CORE-CHANGES item 59).
- **Budget pips:** CORE-CHANGES U5 draws them from `budgetInfo` (Q6), so both partners show the team's number (1 to
  8 of 8).

---

## 7. Test cases

Notation as in `crazyhouse.md`. `K` stands for the four kings on their start squares: `{ 'A:e1': '0:k', 'A:e8': '3:k',
'B:e1': '1:k', 'B:e8': '2:k' }`. `x = { ep: [-1, -1], epVictim: [-1, -1], castle: [] }` unless stated otherwise.
Worlds are called w1, w2, … (not A/B, which are the boards) and have equal weight unless a weight is given. Outcome
keys in the core's display order: `miss`, `move`, `capture`; "outcome n" of a Measure counts from 0 in square order.
A "team budget" is `budgetInfo(V, state, seat).used` (CORE-CHANGES Q6). A state built for a test has `quiet` 0 and
`ply` 0 unless the row says otherwise. The expected results are those of the core with the `handoff/CORE-CHANGES.md`
items of section 3 (Q1, Q2, Q3 with W5, Q6, Q8, U3), which are in the working tree of 2026-09-25. Where the core
before those items differed, the row says so ("before Qn"). The research prototype produced B1–B13, and the rules
review re-ran them with assertions (section 8.1). The engine review added B14–B23. Its second pass asserted every row,
B1–B23 and F1, on the working-tree core, with a prototype that follows section 3 and patches nothing
(`handoff/tmp/critic-bughouse/real/`: `cases.mjs`, `extra.mjs`, `fuzz.mjs`; section 8.2).

| # | Position and moves | Expected |
|---|---|---|
| B1 turn order | Start position. `A:e2-A:e4`, `B:d2-B:d4`, `B:e7-B:e5`, `A:d7-A:d5`. | The movers are seats 0, 1, 2, 3 in that order. Then it is seat 0's turn again (ply 4). `A:e4-A:d5` is legal for seat 0, and seat 0 has no move code containing `B:`. |
| B2 capture to partner | Continue B1 with `A:e4-A:d5` (seat 0 takes a pawn), then `B:d4-B:e5` (seat 1 takes a pawn). | After the first capture, the black pawn is in the hand of seat **2** (Black B); the hands of seats 0, 1 and 3 are empty. After the second, seat **3** (Black A, the partner of White B) holds the captured **black** pawn from board B. Seat 2, now to move, may play `p@B:d2` and `p@B:e3`, but not `p@B:e1` or `p@B:e8` (occupied here; the rank 1 and 8 ban on empty squares is tested in B4) or any `p@A:…`. |
| B3 promoted piece passed as a pawn | `K` + A:b7 White pawn (seat 0) + A:a8 Black rook (seat 3). `A:b7-A:b8=q`, `B:e1-B:d1`, `B:e8-B:d8`, `A:a8-A:b8`. | After the promotion, A:b8 holds a `+q` of seat 0. `A:a8-A:b8` is a certain capture, and seat **1** (White B, partner of seat 3) receives a **pawn** of its own colour. No hand holds a queen. |
| B4 dropped pawn on the 7th rank; en passant across boards | `K` + B:e5 pawn (seat 1), A:a2 pawn (seat 0), A:h7 pawn (seat 3); hand of seat 2 = one pawn; seat 2 to move. `p@B:d7`, `A:h7-A:h6`, `A:a2-A:a3`, `B:e1-B:f1`, `B:d7-B:d5`, `A:h6-A:h5`, `A:a3-A:a4`, `B:e5-B:d6`. | Before the drop, seat 2 has exactly 47 pawn-drop codes: the empty squares of board B on ranks 2–7 (48 squares minus B:e5). `p@B:a1` and `p@B:h8` (empty, but rank 1 and 8) are illegal, `p@B:a2` and `p@B:h7` are legal, and there is no `p@A:…`. `B:d7-B:d5` is legal (a dropped black pawn on its second rank). Afterwards `ep = [-1, B:d6]`. It is still `[-1, B:d6]` after the two board-A moves. `B:e5-B:d6` (en passant) is legal for seat 1, and the captured black pawn goes to seat **3**. |
| B5 en passant expires with the next move on its board | `K` + A:d2 pawn (seat 0), A:e4 pawn (seat 3), B:a2 pawn (seat 1), B:a7 pawn (seat 2). `A:d2-A:d4`, `B:a2-B:a3`, `B:a7-B:a6`, then seat 3 plays `A:e8-A:f8`, followed by `A:e1-A:f1`, `B:a3-B:a4`, `B:a6-B:a5`. | Before seat 3's move, `A:e4-A:d3` is legal. After seat 3 declines it, it is no longer legal on seat 3's next turn. |
| B6 a king capture ends the whole game | `K` + B:e7 White queen (seat 1) + A:d1 White queen (seat 0); seat 1 to move. `B:e7-B:e8`. | A certain capture. Result: `{ winner: null, winners: [1, 3], reason: 'king' }`. No legal moves remain for anyone, although board A is untouched. |
| B7 team budget (quantum) | `K` + A:b1 and A:g1 knights (seat 0), B:b8 knight (seat 2), B:b1 knight (seat 1). `A:b1-A:a3\|A:c3`, `B:e1-B:d1`, `B:b8-B:a6\|B:c6`, `A:e8-A:d8`, `A:g1-A:f3\|A:h3`, `B:b1-B:a3\|B:c3`. | After the first four moves, Team 1's budget is 4 (seat 0 and seat 2 both show 4), Team 2's is 1, and there are 4 worlds. Seat 0 may still split A:g1. After that split, Team 1's budget is 8 (8 worlds). Seat 1 (Team 2) may still split B:b1, which gives 16 worlds and a Team 2 budget of 2 (seats 1 and 3 both show 2), while Team 1's budget stays 8: the other team's split never raises it. Seat 2 (Team 1) now has **no** legal split of its B:a6/B:c6 knight (team budget full), but can measure it (`?B:a6`: 50% B:a6 / 50% B:c6). |
| B8 capturing a ghost; the boards are independent (quantum) | 4 worlds, all with `K` + A:c3 bishop (seat 0): the black knight of seat 3 is on A:a5 or A:d4, and the white knight of seat 1 is on B:c3 or B:e4, in all 4 combinations. `A:c3-A:a5`. | Rolled: `move` 50%, `capture` 50%. **Move:** the black knight is 100% on A:d4, and no hand holds anything. **Capture:** seat 2's hand holds a black knight, certainly. In both branches the knight on board B is still 50% B:c3 / 50% B:e4. |
| B9 drop probe; a missed drop is quiet (quantum; CORE-CHANGES Q8) | w1 (weight 3): `K` + B:d4 knight (seat 1); w2 (weight 1): `K` + B:f5 knight (seat 1). Seat 2's hand = one pawn in both; seat 2 to move; `quiet` 5. `p@B:d4`. | `miss` 75% (the knight is found on B:d4 and is 100% there, the pawn stays in hand, `quiet` 6), `move` 25% (`quiet` 0). Before Q8 both branches reset `quiet` to 0. |
| B10 castling per board | Start position. `A:g1-A:f3`, `B:g1-B:f3`, `B:g8-B:f6`, `A:g8-A:f6`, `A:e2-A:e3`, `B:e2-B:e3`, `B:e7-B:e6`, `A:e7-A:e6`, `A:f1-A:e2`, `B:f1-B:e2`, `B:f8-B:e7`, `A:f8-A:e7`, then `O-O` (seat 0), `B:e1-B:f1` (seat 1), `O-O` (seat 2), `A:e8-A:f8` (seat 3), `A:d2-A:d3` (seat 0). | Seat 0's `O-O` puts its king on A:g1 and its rook on A:f1. Seat 2's `O-O` is certain and puts its king on B:g8 and its rook on B:f8. On seat 1's next turn, `O-O` is not legal, because its king moved. |
| B11 start | Start position. | Seat 0 has 20 move codes in `legalMoves(V, state)` (the orthodox 16 pawn and 4 knight moves; splits are not part of that list). There are 64 pieces and 1 world, and every budget is 1. |
| B12 a dropped rook does not castle | `K` + A:h8 Black rook (seat 3), `x.castle = [{ flag: 'k', side: 3, king: A:e8, rook: A:h8, kingTo: A:g8, rookTo: A:f8 }]`, hand of seat 3 = one rook; seat 3 to move. `A:h8-A:h5`, `A:e1-A:d1`, `B:e1-B:d1`, `B:e8-B:d8`, `r@A:h8`, `A:d1-A:e1`, `B:d1-B:e1`, `B:d8-B:e8`. | `O-O` is legal for seat 3 at the start. At the end, a rook of seat 3 stands on A:h8, the king on A:e8 and A:f8 and A:g8 are empty, but `O-O` is **not** legal (the right was lost when the rook left A:h8). |
| B13 no en passant after a drop | `K` + A:e4 Black pawn (seat 3); hand of seat 0 = one pawn; seat 0 to move. `p@A:d4`, `B:e1-B:d1`, `B:e8-B:d8`. | After the drop `ep = [-1, -1]`. On seat 3's turn `A:e4-A:d3` is **not** legal (the pawn was dropped on rank 4, not moved two squares); `A:e4-A:e3` is legal. |
| B14 en passant ends with the eligible seat's turn, also where no move was applied (quantum; CORE-CHANGES Q1, Q2) | 4 worlds, all with `K` + A:d2 pawn (seat 0) + A:e4 pawn (seat 3). Seat 0's knight is on A:a3 or A:c3 and seat 3's knight on A:a6 or A:c6, in all 4 combinations; seat 0 to move. `A:d2-A:d4`, `B:e1-B:d1`, `B:e8-B:d8`, then either (a) `?A:a6` (outcome 0, A:a6), `?A:a3` (outcome 0, A:a3), `B:d1-B:e1`, `B:d8-B:e8`; or (b) `A:a6-A:b4`, `?A:a3` (outcome 0), `B:d1-B:e1`, `B:d8-B:e8`. | Before seat 3's first turn: `ep = [A:d3, -1]` and `A:e4-A:d3` is legal. (a) After `?A:a6`, `ep = [-1, -1]` in every world; on seat 3's next turn `A:e4-A:d3` is **not** legal. (b) `A:a6-A:b4` is not rolled (`move` 100%). It leaves 4 worlds, all with `ep = [-1, -1]`; on seat 3's next turn `A:e4-A:d3` is **not** legal. Before Q1 and Q2 both failed: in (a) the square stayed A:d3 and `A:e4-A:d3` was a certain capture; in (b) 2 of the 4 worlds kept A:d3, and `A:e4-A:d3` was `miss` 50% / `capture` 50%. With Q2 but without the per-board `applyMiss`, `A:e4-A:d3` is illegal in (b) but still a certain capture in (a). |
| B15 the pass = link fallback uses the team budget (quantum; CORE-CHANGES Q6) | 16 worlds, all with `K` + A:h1 rook (seat 0), in all combinations of: seat 0's knight on A:a3 or A:c3; seat 0's bishop on A:d3 or A:f3; seat 2's knight on B:a6 or B:c6; seat 3's knight on A:h4 or A:f4. Seat 0 to move. `A:h1-A:h8`. | Before: Team 1's budget is 8 (seat 0's own pieces alone: 4) and Team 2's is 2. The slide would link the rook to the black knight, so it is rolled for the full team budget: `miss` 50% (rook 100% on A:h1, black knight 100% on A:h4) / `move` 50% (rook 100% on A:h8, black knight 100% on A:f4, 8 worlds, Team 1 still 8, Team 2 1). With a per-seat budget (before Q6, or without `budgetRule`) it is a plain link instead: one branch, `move` 100%, not rolled. |
| B16 a ghost captures a king (quantum) | w1: `K` + A:d6 knight (seat 0); w2: `K` + A:a3 knight (seat 0). Seat 0 to move. `A:d6-A:e8`. | `miss` 50% / `capture` 50%. Capture: result `{ winner: null, winners: [0, 2], reason: 'king' }`, and no hand holds anything (the king went `OFF`). Miss: no result, the knight is 100% on A:a3, and seat 1 is to move. |
| B17 converging capture of a king (quantum) | w1: `K` + B:e5 queen (seat 1); w2: `K` + B:h5 queen (seat 1). Seat 1 to move. | `B:e5\|B:h5-B:e8` is legal and certain: `capture` 100%, not rolled. Result `{ winner: null, winners: [1, 3], reason: 'king' }`. `B:h5-B:e8` alone is `miss` 50% / `capture` 50%. |
| B18 a promoted ghost is passed on as a pawn (quantum) | w1: `K` + B:a1 bishop (seat 1) + B:c3 `+n` (seat 2); w2: the same with the `+n` on B:f3. Seat 1 to move. `B:a1-B:c3`. | `move` 50% / `capture` 50%. Capture: 1 world, and the only piece in any hand is a pawn of seat 3 (Black A, the partner of seat 1). Move: all hands empty, `+n` 100% on B:f3. |
| B19 a drop onto a square where one's own ghost might stand (quantum) | w1: `K` + B:c6 knight (seat 2); w2: `K` + B:a6 knight (seat 2). Seat 2's hand = one pawn in both; seat 2 to move. `p@B:c6`. | `miss` 50% (the pawn stays in the hand, the knight is 100% on B:c6) / `move` 50% (the pawn is on B:c6, the knight 100% on B:a6). |
| B20 castling past a ghost is illegal (quantum; D1, Q2) | w1: `K` + A:h1 rook (seat 0) + A:f1 knight (seat 3); w2: the same with the knight on A:f3. `x.castle = [{ flag: 'K', side: 0, king: A:e1, rook: A:h1, kingTo: A:g1, rookTo: A:f1 }]`; seat 0 to move. `O-O`. Second position: the same with the knight on A:c6 (w1) or A:f3 (w2). | `O-O` is not legal (`branches` null, not in `legalMoves`). In the second position, where no ghost can stand on A:f1 or A:g1, `O-O` is certain: `move` 100%, not rolled. Before Q2 the first `O-O` was rolled: `miss` 50% / `move` 50%. |
| B21 a partial rook slide loses the right in every possibility (quantum; D1, W5) | w1: `K` + A:h1 rook (seat 0) + A:h3 knight (seat 3); w2: the same with the knight on A:a6. `x.castle` as in B20; seat 0 to move. `A:h1-A:h5`, `B:e1-B:d1`, `B:e8-B:d8`, `?A:h3` (outcome 0, A:h3). | `A:h1-A:h5` is one unrolled branch (`move`, a link: the rook reaches A:h5 only where the knight is on A:a6). Right after it, no world has seat 0's right. After the measure, the rook is 100% on A:h1 and the knight 100% on A:h3, but `O-O` is **not** legal. Before Q3 and W5 the right survived in w1, and `O-O` was then a certain `move`. |
| B22 idle turns on the other board keep the en passant right (quantum; CORE-CHANGES Q1, per-board `applyMiss`) | 4 worlds, all with `K` + A:d2 pawn (seat 0) + A:e4 pawn (seat 3). Seat 1's knight is on B:a3 or B:c3 and seat 2's knight on B:a6 or B:c6, in all 4 combinations; seat 0 to move. `A:d2-A:d4`, `?B:a3` (seat 1, outcome 0, B:a3), `B:a6-B:b4` (seat 2). | After the double step `ep = [A:d3, -1]`. After the measure (every world idle for seat 1) it is still `[A:d3, -1]`. `B:a6-B:b4` is one unrolled branch (`move` 100%, a link: the worlds with the knight on B:c6 are idle for seat 2), and it leaves 2 worlds, both with `ep = [A:d3, -1]`. Then `A:e4-A:d3` is legal for seat 3 and certain: `capture` 100%, not rolled; the white pawn goes to seat 1's hand, and `ep` is `[-1, -1]` afterwards. An `applyMiss` that clears both boards fails this case: the measure already leaves `ep = [-1, -1]`, and `A:e4-A:d3` is illegal. |
| B23 the computer answers with the opponent on the same board (CORE-CHANGES U3) | `K` + A:d1 White queen (seat 0) + A:d8 Black rook and A:d5 Black pawn (seat 3); seat 0 to move. `chooseMove(V, state, { level, rng: () => 0.5 })`. | Normal and hard do **not** play `A:d1-A:d5` (the rook would take the queen; both play `A:e1-A:f1`). Without `replySide` (the default reply side is seat 1 on board B), normal and hard play `A:d1-A:d5`. Easy looks at no reply and plays `A:d1-A:d5` in both cases. |
| F1 fuzz invariants | Random games (the fuzz spec, 4 seats). | After every move: the hands (id, side, type) are identical in all worlds; no square holds two different pieces over the worlds; each team budget is ≤ 8, both partners show the same `budgetInfo`, and there are ≤ 64 worlds and at most Team 1's budget × Team 2's budget worlds; no pawn stands on rank 1 or 8 of either board; every piece on the board stands on its owner's board; the pieces on the boards, plus those in hands, plus captured kings, number 64; in every world, `ep[bd]` is −1 unless the last turn on board `bd` was a double step with outcome `move`; `x.ep`, `x.epVictim` and `x.castle` are identical in all worlds (CORE-CHANGES IT8). On the working-tree core, 70 games (10,703 plies, 2,109 splits, 797 merges, 416 measures, 883 drops) broke none. Before Q1–Q3, 164 of 4082 random plies left a stale en passant square and 39 had `x.ep` or `x.castle` differ between worlds. |

---

## 8. Review notes

### 8.1 Source review

Reviewer 1 (lens: rules fidelity). Every classical rule was checked against the live sources below, and the section 7
cases were re-run on the current `src/variants/core` with a copy of the prototype whose paths point at this
repository (scratch copy: `handoff/tmp/rev1-bughouse/proto/`, `verify.mjs` asserts B1–B7 and B9–B13, `tbug2.mjs`
prints B8, `fuzzb.mjs` runs F1). All assertions pass; the fuzz run gave 2246 plies, at most 64 worlds and no
violation.

Confirmed without change: two boards, four seats, partners on opposite colours; the orthodox setup on both boards;
captured pieces go at once to the partner in the partner's colour; drops on any empty square of the own board, drops
may give check; no pawn drops on rank 1 or 8; captured promoted pieces return as pawns; the second-rank double step of
dropped pawns; en passant per board; the whole game ends when one board ends; seat names as in BPGN (WhiteA, BlackA,
WhiteB, BlackB); promotion to queen, rook, bishop or knight (the WBN Laws allow only queen or knight; the other sources
follow standard chess).

Changes:

1. **Section 1, sources table and research note.** Replaced the search-extract rows with rows for the pages
   actually read, with URLs. Two statements were wrong:
   - the Wikipedia draw rule is "by agreement or when two players on opposite teams run out of time or are checkmated
     simultaneously", not "both teams lose on the same board moment";
   - "There are no draws in Bughouse" comes from a chess.com user blog
     (https://www.chess.com/blog/ChessOfficial2016/bughouse-chess-rules-and-basics), not from the Help Center. The
     chess.com Terms page allows draws by agreement, and Wikipedia says FICS and chess.com apply threefold repetition.
   Sources: https://en.wikipedia.org/wiki/Bughouse_chess, https://support.chess.com/en/articles/8615092-what-is-bughouse,
   https://www.chess.com/terms/bughouse-chess.
2. **Section 1, turn order; 2.3.** Added that the chosen order White A, White B, Black B, Black A is the published
   one-clock and correspondence order of bughouse (von Zimmermann 2006, p. 108, quoted by Wikipedia, "Two-player and
   six-player variations"). Source: https://en.wikipedia.org/wiki/Bughouse_chess.
3. **Section 1, castling with a dropped rook; 2.7.** The rule (not allowed) is kept, but the sources were misstated.
   Wikipedia's rules section **allows** it ("A rook placed on its typical starting square (a1, h1, a8, h8) may take
   part in castling"). The rule is now backed by the CSC tournament rules (a rook placed on a home square "is deemed
   to have moved for the purposes of castling and therefore may not be castled with its king"), the WBN Laws 5.8
   (castling is illegal "with dropped rook") and Fairy-Stockfish (`position.cpp` only ever removes castling rights, so
   a drop never restores one; pychess uses it). 2.7 now spells out the empty-square condition and the home squares.
   Sources: https://www.chesscincinnati.com/wp-content/uploads/CSC-Comprehensive-Bughouse-Rules.pdf,
   https://www.chessfed.gr/old_site/wccc2007/files/bughouse_chess_complete_rules.pdf,
   `handoff/ext/Fairy-Stockfish/src/position.cpp`.
4. **Section 1, new bullet "Pawn drops"; 2.6.** Made explicit what the sources say and the spec only implied: pawns
   may be dropped on the square before promotion and promote next move; a dropped piece counts as unmoved (so the
   double step), except for castling; a pawn dropped on its fourth rank cannot be taken en passant. En passant
   captures pass the pawn on like any capture. Added the chess.com example of a captured promoted piece (the partner
   receives a pawn of the captured piece's colour). Sources: CSC section 4, WBN 5.11,
   https://www.chess.com/terms/bughouse-chess.
5. **Section 1, "No legal move".** The rule (draw) is kept, but the attribution was wrong: neither Wikipedia nor
   the chess.com Help Center says the player waits. The pion.ch ruleset says the player "is not considered to be
   stalemated" (art. 8), and pychess ends a board only when no move exists even with every piece type in hand
   (`server/bug/game_bug.py`, `check_checkmate_on_board_and_update_status`), and then scores it as a loss. "Waiting is
   impossible" was replaced by the real reason: the turn-based form of waiting is passing, which the core cannot do,
   because a `noMoves` result always ends the game. If the core team adds a pass result for `noMoves`, "the seat
   passes" would be the more faithful rule. Sources: http://www.pion.ch/Bug/ruleseng.html,
   `handoff/ext/pychess-variants/server/bug/game_bug.py`.
6. **Section 1, "Draws"; 2.8.** Listed the draws the sources do know (agreement, simultaneous endings, both flags,
   threefold repetition) and why none but agreement applies here. The quiet rule and the move limit are app limits,
   not bughouse rules, and are labelled as such. Sources: CSC section 13, WBN 1.10 and 7.10, USCF rule 16,
   https://www.freechess.org/Help/HelpFiles/bughouse.html, https://web.archive.org/web/20250108185321/http://www.uschess.org/tournaments/2006/2006bughouse.pdf.
7. **Section 1, check; 2.8.** Noted that king capture has an over-the-board precedent (a king left in check may be
   taken, which ends the game: CSC section 8, USCF rule 15.a.4) and that one resigning player resigns for the team
   (CSC section 13).
8. **Section 5.** Added rule 8 (a pawn dropped on the own second rank may still move two squares; a rook dropped in its
   corner cannot castle). Players who know the Wikipedia rules would otherwise expect the dropped rook to castle.
9. **Section 6.** Added the source for the seating (CSC: White on the left, Black on the right of each team; the
   Wikipedia diagram turns board B half a turn) and checked the square colours: A:h1 and B:a8 are light, in the
   bottom-right corner of each drawn board.
10. **Section 7.** B2: `p@B:e1` and `p@B:e8` are illegal because those squares are occupied, so B2 does not test the rank
    ban; B4 now tests it on empty squares (47 pawn-drop codes, `p@B:a1`/`p@B:h8` illegal, `p@B:a2`/`p@B:h7` legal,
    verified). B11: "20 legal moves" now says what is counted (the 20 codes of `legalMoves` without splits). New B12
    (a rook dropped on its home square does not castle) and B13 (no en passant after a pawn drop on the fourth rank),
    both verified. B6: the prototype returns `winners: [3, 1]`; the sorted form `[1, 3]` of the section 3 sketch was
    verified.

### 8.2 Engine review

Reviewer 2 (lens: engine and quantum consistency). Two passes: the first against a simulation of the
`handoff/CORE-CHANGES.md` plan, the second against the working-tree core that implements it. The open questions and
the list "Core changes needed" at the end are the current ones and replace those of the first pass.

#### First pass (simulated plan)

The spec was read against:

- `src/variants/core/`: `quantum.js`, `world.js`, `orthodox.js`, `orthodoxVariant.js`, `variant.js`, `topology.js`,
  `ai.js`;
- the UI: `VariantBoard.vue`, `VariantPiece.vue`, `useVariantGame.js`, `texts.js`;
- `docs/rules.md`, `docs/variants.md`, and `handoff/CORE-CHANGES.md` (it appeared during the review; the spec was then
  aligned with its plan and with the lead's binding decisions D1–D3).

In this first pass, "the current core" means the core before the CORE-CHANGES items. Reviewer 1's B1–B13 and F1 pass
on the current core. Every row of section 7 was run on the current core and on a simulation of the planned core.
Scratch files are in `handoff/tmp/critic-bughouse/`:

- `quantum_team.js`: the prototype's core copy with the team budget, plus the Q1 `applyMiss` call sites and, behind
  `CURRENT.plan`, Q2's certain-only keys and Q3's `unifyWorlds`;
- `plan.mjs` / `with_plan.mjs <script>`: switch on the planned core, with bughouse's per-board `applyMiss` and the W5
  castling intersection;
- `engine.mjs`: B15–B21 and the B7 addition, with the expected result of either core;
- `q1fix.mjs`: B14; `q2only.mjs`: B14 with Q2 but without `applyMiss`;
- `fuzz2.mjs`: F1 with the new invariants (40 games, about 4080 plies, 785 splits, 174 measures, at most 64 worlds);
- `ortho_ep.mjs`: the same en passant gap in two-player orthodox chess;
- `ai_smoke.mjs`: `chooseMove` at all three levels (8, 48 and 110 ms, 62 legal moves).

Confirmed without change:

- Seats, teams, `enemies`, `orient` and the turn order fit the hooks. The default `nextSide` is used, and `isOut` is
  not needed.
- `worldResult` with sorted `winners` matches the resignation result of `useVariantGame.js` (every enemy of the
  resigning seat) and `isWinner` in `ai.js`.
- Drops are measured (`isMeasured`). The lowest hand id is the same in every world, because one occupant per square
  keeps hands identical: 0 differing hands in about 4080 plies.
- A capture roll gives the partner a certain piece.
- The team budget keeps the game at 64 worlds or fewer (the most observed was exactly 64).
- Split, merge and measure codes parse correctly with `:` in square names.
- The `evaluate` difference terms give exactly own + partner − both enemies, with hands at full value.
- Every label lies inside `PAD`. Rotating by 180 puts Team 2's partners at the bottom. Sprites are never spun, so
  both colours stand upright for every seat.

Changes:

1. **Section 3, table.** Added `applyMiss`, `unifyWorlds`, `budgetRule` (the plan's name for the team budget,
   replacing `budgetSides`), `layoutOf` and `replySide`, each with its CORE-CHANGES item. `afterMove` only touches the
   board of `m.to`. `topology` gets `zoomable`.
2. **Section 3, `core/orthodox.js`.** Stated what exactly fails on the current core: no castling, `kingTo = −1`, never
   an en passant square. After W3, `castlingMoves` and `pawnExtras` (with the per-board view) work as they are.
   `afterMove` stays local, because `orthodoxAfterMove` keeps a single `x.ep`.
3. **Section 3, the core changes.** Replaced the proposals with the planned items: Q6 and U5 (team budget), Q1
   (idle worlds), Q2 and Q3 with W5 (certain castling and en passant), Q8 (quiet counter), U3 (`replySide`), and
   optional Q10. The prototype's module-level `CURRENT.V` cannot go into the core. Q6's `budgetRule` and `budgetInfo`
   solve that without changing `budget(state, side)`.
4. **Stale en passant (the plan's D2, Q1 and W4; the hexagonal spec had found it too).** Affects 2.7, 4.5, rules card
   item 8, B14 and F1.
   - En passant stays available in every world where no classical move was applied (a miss, the stay-home half of a
     split, a measure), because `afterMove` only runs where the move was applied.
   - On the current core, after a measure by each seat of board A, `A:e4-A:d3` is still a certain capture.
   - In random play, 164 of 4082 plies left a stale square; on the simulated planned core, none did. Two-player
     orthodox chess has the same gap.
   - Bughouse needs the per-board `applyMiss` (clear `ep[boardOf(side)]`). D2's "the ply right after the double step"
     reads, in bughouse, as the next turn on that board.
5. **4.1–4.3.** The promoted-ghost case points to B18. Board independence is exact up to weight rounding, and the
   team budget is the one rule that couples the boards. Decided the quantum king captures: a ghost attacking a king
   is rolled (B16); a converging capture of a king is certain (B17); a captured king goes `OFF`.
6. **4.4.** The 64-world guarantee has a rare exception on the current core (worlds differing only in castling rights
   or the en passant square), which disappears with Q1–Q3. The split's `MAX_WORLDS` check keeps 64 hard. The team
   budget also drives the pass = link fallback (B15), and that is the case that tells a team budget from a per-seat
   one.
7. **Section 4 intro and 4.5.** "The classic rules apply without change" was not exact.
   - Castling now follows D1: it never rolls, it is legal only when possible in every possibility, and a right is lost
     everywhere as soon as king or rook is not 100% home (B20, B21). The current core and `crazyhouse.md` 4.4 roll it.
   - En passant is certain (D2).
   - Measure is the seat's turn on its board.
   - The quiet counter follows Q8.
8. **Section 5.** Items are now one or two short sentences.
   - Item 7 says a missed drop keeps the piece in the hand.
   - "as in Crazyhouse" is removed, because the card must stand alone.
   - Item 6 says "not 8 per player", because the shared sentence next to the card says "Each side has a budget of
     8".
   - Castling and en passant certainty are left to the shared sentence of U7.
9. **Section 6.**
   - Added `zoomable: true`. `VariantBoard` offers zoom only above an area of 200, and 16.8 × 8 = 134.4, so the
     "existing zoom" the spec relied on was not available for this board.
   - The active board is marked with `layoutOf`, `areas` and `focus` (item 56), with a 0.12 rim that keeps the
     labels clear.
   - The result sentence now matches `resultText`.
   - The pips come from U5, the marker from U13 and the drop texts from U7.
   - Team-sorted hand rows and per-board move columns are marked as optional polish outside the plan.
   - The stacked phone layout is rejected (item 59).
10. **Section 7.**
    - Worlds are named w1/w2 (A/B are the boards). The outcome order, the measure outcome index and "team budget =
      `budgetInfo(...).used`" are stated, and expectations are those of the planned core, with current-core
      differences noted.
    - B7 also checks that Team 1's budget stays 8 after Team 2's split.
    - New cases: B14 (stale en passant), B15 (team-budget fallback), B16 (a ghost captures a king), B17 (converging
      king capture), B18 (a promoted ghost passed on as a pawn), B19 (a drop onto an own ghost), B20 (castling past a
      ghost is illegal) and B21 (a partial rook slide loses the right).
    - F1 gains the en passant invariant and IT8's "`x.ep` and `x.castle` identical in all worlds".

#### Second pass (working-tree core)

By the time of the second pass (2026-09-25, about 17:30), the working tree held every `handoff/CORE-CHANGES.md` item
this spec needs: Q1, Q2, Q3, Q6, Q8, Q10, W3, W5, U2, U3, U5, U7, U13, U16 and U17 (read in the code, and exercised by
the cases below). The spec was re-read against that code: `quantum.js` (`idleApply`, `linkOrRoll`, `splitBranches`,
`measureBranches`, `budgetRuleOf`/`arrangements`, `stateAfter`, `sitOut`), `variant.js`, `orthodox.js` (`between`,
`castlingMoves`, `pawnExtras`, `unifyCastling`), `ai.js` (`replyValue`), `VariantBoard.vue` (zoom and focus),
`panel.js` and `texts.js`. Scratch files are in `handoff/tmp/critic-bughouse/real/`:

- `bug.mjs`: the variant exactly as section 3 and 6 describe it, on the unpatched core (`budgetRule`, per-board
  `applyMiss`, `unifyCastling`, `castlingMoves`, `pawnExtras` with the per-board view, `replySide`, `layoutOf`);
- `cases.mjs`: B1–B21 with assertions (75, all pass); `extra.mjs`: B22 and B23 (11, all pass), each also run
  against a deliberately wrong variant to show that it discriminates;
- `fuzz.mjs`: F1 with the new invariants (70 games, 10,703 plies, no violation; at most 64 worlds, team budget 8);
- `wrongmiss.mjs`, `nomiss.mjs`: B1–B21 with an `applyMiss` that clears both boards, and without `applyMiss`;
- `perf.mjs`, `perf2.mjs`: `chooseMove` timings (section 3);
- `focus.spec.js` with `vitest.focus.config.mjs`: mounts the real `VariantBoard` under auto-flip and zoom.

Confirmed without change: every expectation of B1–B21 holds on the working-tree core as written (including B14's
en passant expiry, B15's team fallback, B20's illegal castling and B21's lost right, which failed before Q1–Q3 and
Q6); hands stay identical and no square holds two different pieces over the worlds; the number of worlds never
exceeded Team 1's budget × Team 2's budget, so 64 holds without the old castling / en passant exception; Q10's
`sitOut` would pass a stuck seat's worlds through `applyMiss` with `type: 'pass'`, so the per-board hook needs no
change if the lead turns it on; the resignation result now comes from `panel.js` `resignResult` (every enemy of the
loser, ascending), which matches `worldResult`'s `winners`.

Changes:

1. **Section 6, active board (a real defect).** The first pass keyed the focus by the board (two layouts).
   `VariantBoard` keeps the zoomed centre in turned coordinates and recomputes it only when the focus key changes
   (U2), not when the rotation changes. With auto-flip the rotation changes on every ply, but the active board only
   every second ply. Mounting the real component (`focus.spec.js`, zoom about 2.4) showed board A while Black B was
   to move on board B, and board B while White A was to move. The focus is now keyed by the seat (`key: 'seat' + s`,
   four layouts), so it recentres with the current rotation on every ply. The same test passes with it. Section 3's
   `layoutOf` row says so.
2. **New B22 (per-board `applyMiss`).** Nothing tested that the idle turns of the **other** board keep an en passant
   right: B4 has only ordinary moves in between, and B14 tests only the expiry. A natural slip is to reuse W4's
   `clearEnPassant` pattern and clear both boards. It passes all 75 assertions of B1–B21 (`wrongmiss.mjs`), but it
   kills board A's right on board B's measure or missed move. B22 catches it. Without any `applyMiss`, B14 fails as
   its row says (`nomiss.mjs`). Section 3's `applyMiss` row and item 2, 4.5 and the rules-card note point to B22.
3. **New B23 (`replySide`).** The spec relied on U3 but no case checked it. B23 shows the difference: with
   `replySide` the normal and hard levels keep the queen, and with the default reply side they lose it.
4. **B9 and 4.5: the quiet counter (Q8).** B9 now starts from `quiet` 5 and checks that the Missed drop gives 6 and
   the Dropped branch 0 (before Q8 both gave 0).
5. **Section 3.** The sketch now has the per-board `afterMove` and `applyMiss`, `unifyWorlds`, `budgetRule` and
   `replySide` as run, and `castlingMoves` instead of an undefined `castling`. New rows: `reasonText` (the generic
   quiet text omits drops and says nothing about four players) and `handOrder` (U16). The paragraph on
   `core/orthodox.js`, the list of core changes and the performance line describe the working-tree core instead of
   the old core and the simulation. The proximity term of `evaluate` is spelt out.
6. **Sections 1, 4 and 7: "the current core".** The current core now has Q1–Q3, Q6 and Q8. Every "on the current
   core" note (B14, B15, B20, B21, F1, 4.4, 4.5) now says "before Qn", and the section 7 intro says which core the
   expectations assume. Section 1 "No legal move" said the core cannot pass; Q10 now can, so it says that the lead has
   not chosen it. Section 1 "Check and checkmate" now names the classic "king cannot escape" loss and the waiting
   draws of docs/rules.md 5 and 6 as absent (CORE-CHANGES item 72).
7. **4.4.** "Roll (budget full)" is the wording of docs/rules.md 7.1; the variant UI has no such label and shows the
   roll with its odds. The 64-world guarantee is stated as "worlds ≤ Team 1's budget × Team 2's budget", which F1
   now checks. The other team's moves can only lower a budget, never raise it.
8. **F1.** New invariants: no square holds two different pieces over the worlds, partners show the same
   `budgetInfo`, worlds ≤ the product of the team budgets, `x.epVictim` identical too.
9. **Section 6.** Hands follow `handOrder`, drop codes show as `N@B:f3` (U17), the quiet draw text, and pips show 1
   to 8 (a budget is never 0).

Open questions for the lead (nothing changed):

- **No legal move.** Q10 `passWhenStuck` (in the working tree) makes "the seat passes" possible, which reviewer 1
  called the more faithful rule (8.1 item 5). Bughouse would set `passWhenStuck: true`. The other seats keep their
  order. The skipped turn passes every world through `applyMiss` with `type: 'pass'` and the stuck seat, so bughouse's
  hook clears the en passant square of that seat's board at the skipped turn. That is the board's next turn, so D2
  holds, and the stuck seat could not have taken en passant anyway, since that would have been a legal move. (The
  first pass said "with the next move on that board"; this is the exact behaviour.) The move list shows "{side}
  cannot move and sits out" (U9). The spec keeps the draw until the lead decides.
- **Named result.** Optional reason codes `kingA` / `kingB` would name the board in the result text (section 6).
- **Follow the board to move.** With the focus of section 6, a zoomed view recentres on every ply, also in a game
  against the computer, where the three computer seats move in quick succession. If the lead prefers the view to
  stay on the human's board in such games, `layoutOf` cannot tell (it does not know the viewer): that would need the
  deferred viewer-aware `layoutOf` (CORE-CHANGES item 48).

**Core changes needed:** none beyond `handoff/CORE-CHANGES.md`. The items bughouse relies on are all in the working
tree and were verified there, with these exact semantics; they must land as built:

1. **Q6 `budgetRule(b, side)` with `budgetInfo` and U5.** Bughouse: `{ sides: [side, (side + 2) % 4], limit: 8 }`.
   The budget used is the number of distinct keys `sq + ':' + sd + ty` over both partners' pieces (board and hand),
   and it drives the pass = link fallback, merges and the split check (B7, B15). Both partners' pips show it.
2. **Q1 `applyMiss(b, action, side, info)`** on every idle world (the `miss` worlds of a move or merge, split children
   that did not move, every world of a measure, every world of a Q10 pass), with `side` = the seat whose turn it was,
   before the solid and game-end rolls and before the budget-fallback check. Bughouse clears `ep[boardOf(side)]` and
   `epVictim[boardOf(side)]` only (B14, B22).
3. **Q2** (a castling or en passant key is legal only when every world generates it as a certain move; then one
   unrolled branch) and **Q3 `unifyWorlds`** with **W5 `unifyCastling`** (B20, B21).
4. **Q8** (a Missed drop or pawn move adds 1 to `quiet`; B9), **U3 `replySide(s, me)`** (B23), **W3** (`between`,
   `castlingMoves` and `pawnExtras` on three coordinates), **U2** (the focus key), **U7**, **U13**, **U16**, **U17**.
5. Optional: **Q10 `passWhenStuck`** (open question above).
6. Optional, generic UI, not needed by bughouse with the per-seat key: `VariantBoard` could also recentre on the focus
   when `rotation` changes, so a manual Flip of a zoomed board keeps the focus in view (`watch(() =>
   [focusKey(topo.value.layout.focus), props.rotation], ...)`).
