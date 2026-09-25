# Variant spec: `shogi` (Shogi, Japanese chess)

Category: `regional` (as in `catalog.js`; the placeholder `src/variants/shogi.js` still says `rules`). Players: 2.
UI name: "Shogi". Catalog summary (already in `catalog.js`): "Japanese chess: captured pieces join your army and
promote in the enemy camp."

Every expected value in section 7 was produced by a prototype of the hooks below, run on the real variant core
(`handoff/prototypes/shogi/`: `shogi.mjs` is the variant, `tests.mjs` the section 7 cases, 74 checks, all pass on the
committed core; on the working-tree core it stops at Q1's committed-core step, the merge that Q13 now refuses). The
classical move generator was also checked against Fairy-Stockfish, built from `handoff/ext/Fairy-Stockfish`
(`perft.mjs`, `fscheck.mjs`, section 7.3). 120 random games (16,477 plies, 2,623 splits, 901 drops) broke no
invariant (`fuzz.mjs`). The source review (8.1) changed three cases (S5 (e), S7, Q6) and re-ran them on the same
prototype with `handoff/tmp/rev1-shogi/verify.mjs` (21 checks, all pass). The engine review (8.2) re-ran every case
on its own implementation of section 3, on the committed core, on the working-tree core (with the core plan's Q8,
Q13 and Q14, which landed during the review) and on an emulation with the Q13 correction of 3.2
(`handoff/tmp/critic-shogi/review.mjs`, 186 checks, all pass), and added Q9–Q12. A second source pass (8.1) added
S5 (g), the promoted big pieces of S7 and S11 (`handoff/tmp/rev1-shogi-2/check.mjs`, 19 checks with Fairy-Stockfish
counts, all pass) and re-ran `review.mjs` on the current working-tree core (186 checks, all pass). A second engine
pass (8.2) re-ran all of that, ran the rows added since on its own implementation of section 3, added S12, Q15, Q16
and the Measure outcomes of Q1 (`handoff/tmp/critic-shogi/pass2/check2.mjs`, 78 checks on four cores, all pass), and
tried the exact Q13 correction of 3.2 on a copy of the current `quantum.js` (`pass2/quantum_fix.js`: 224 review
checks, the 145 core tests and 840 random games pass).

---

## 1. Sources and chosen rule set

Web access worked for this research. Every page below was fetched on 2026-09-25, and the two engine sources were read
in full.

| Source | What it gives |
|---|---|
| Wikipedia, "Shogi", https://en.wikipedia.org/wiki/Shogi | The complete rules. Promotion zone = "the furthest one-third of the board". A piece may promote "if part of the piece's path lies within the promotion zone (that is, if the piece moves into, out of, or wholly within the zone; but not if it is dropped into the zone)". Pawns and lances on the last rank and knights on the last two ranks must promote. Drops: no pawn, lance or knight where it could never move; *nifu* ("a pawn may not be dropped onto a file containing another unpromoted pawn of the same player"); *uchifuzume* ("a pawn may not be dropped to give an immediate checkmate"). Sennichite: the same position (board, hands, side to move) four times is a draw; perpetual check loses. Impasse: 24-point rule and 27-point declaration rule. King names 王将 (used by the higher-ranked player or the champion) / 玉将 (the other player) and the one-kanji abbreviations 王/玉 飛 角 金 銀 桂 香 歩, 龍 馬 全 圭 杏 と. |
| lishogi rules engine, scalashogi (github.com/WandererXII/scalashogi, cloned 2026-09-25): `variant/Standard.scala`, `variant/Variant.scala`, `Situation.scala`, `Impasse.scala` | **The chosen rule set, as code.** Start SFEN `lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1`. `canPromote`: the piece has a promoted form and the origin **or** the destination is in the zone. `forcePromote`: pawn, lance or knight on the last rank, knight on the second last rank. `dropFilter`: no drop where promotion would be forced, no second unpromoted pawn on a file, no pawn drop that attacks the king when the opponent then has no legal move. Captured pieces go to the hand unpromoted. `status`: no legal move is a loss whether in check or not ("Mate" and "Stalemate" both lose); impasse; fourfold repetition is a draw unless one side gave check every time (perpetual check: that side loses); two bare kings with empty hands is a draw. `Impasse.scala`: at the start of the side to move's turn, not in check, king in the zone, **more than 10 own pieces in the zone including the king**, points (zone pieces + hand, rook/bishop/dragon/horse 5, other pieces 1, king 0) at least **28 for Sente, 27 for Gote**: the side to move wins at once. Hand order `Rook, Bishop, Gold, Silver, Knight, Lance, Pawn`. |
| lishogi, "Impasse", https://lishogi.org/explanation/impasse | The same 27-point rule in prose: "you don't need to manually declare the impasse. If you meet all the requirements at the beginning of your turn (before making a move) you will automatically win the game." lishogi used the "try rule" before July 2021. |
| Japan Shogi Association, 将棋対局規則 (enacted 2024-06-07, revised 2024-10-01 and 2025-01-01), https://www.shogi.or.jp/match/taikyoku_rules/ | Professional rules. Art. 8: 千日手 = the same board, both hands and side to move occurring **4 times**; replayed with colours swapped; "連続王手の千日手は反則である" (perpetual check is a foul, which loses: the side that gave check with every move of the cycle). Art. 9: the 24-point count (big pieces 5, small 1, king 0; both players 24 or more: no result, replay); the declaration rule 入玉宣言法 (usable before move 500) has lishogi's four conditions (king in the enemy camp, **10 pieces besides the king** there, king not in check, points = own pieces in the camp + own hand) but needs **31** points to win (24–30: replay); "手数が500手に達した場合は持将棋とする" (when the move count reaches **500 moves**, i.e. 500 plies since 手 counts each player's move, the game is an impasse, i.e. no result). Art. 10 lists 二歩, 行き所のなき駒 (a piece that can never move), 打ち歩詰め ("dropping a pawn from hand to give a check that cannot be answered") and 王手放置 (leaving the king in check) as fouls that lose at once. |
| Fairy-Stockfish `src/variant.cpp` (`minishogi_variant_base`, `shogi_variant`), `src/position.h` (`checkmate_value`), `tests/perft.sh` | The same board, pieces (Betza: silver `FfW`, gold `WfF`, knight `fN`, lance `fR`, pawn `fW`, horse `BW`, dragon `RF`), zone, `dropNoDoubled = pawn`, `immobilityIllegal`, `nFoldRule = 4`, `perpetualCheckIllegal`, `stalemateValue = -VALUE_MATE` (no legal move loses), `nMoveRule = 0` (no 50-move rule). **Pawn-drop mate is generated as a legal move** and scored as a loss for the dropper (`shogiPawnDropMateIllegal`). `perft.sh`: shogi start position perft 4 = 719,731. |
| pychess-variants `static/docs/shogi.md` (in `handoff/ext`) | The same rules in prose, Hodges notation (`P*5e` for a drop, `+` / `=` for promotion taken / declined), "In kanji piece sets, the king with a dot, 玉將 gyokushō, is the black player, while the king without, 王將 ōshō, is the white player" (black = sente, white = gote), promoted pieces drawn in red. Tanigawa and Satō piece values. |
| Wikipedia, "Shogi strategy", https://en.wikipedia.org/wiki/Shogi_strategy | Piece value tables: Grimbergen, YSS 7.0 (with separate, higher values for pieces in hand), Tanigawa, Satō and **Kaufman** (P 1, L 4, N 5, S 7, G 8, B 11, R 13; +P 10, +L 9, +N 9, +S 8, horse 15, dragon 17). |

**Chosen rule set: lishogi Standard (scalashogi), with capture-the-king and three simplifications.** lishogi is the
largest free online implementation, its rules engine is readable, and it resolves impasse with an automatic rule
(no declaration, no agreement), which suits a program. The sources agree on every rule of movement, promotion and
drops. They differ only on the end of the game:

1. **Capture the king instead of check and checkmate** (every variant of this app). A shogi checkmate becomes a king
   capture on the next move. Check-dependent legality (you may not leave your king in check) is dropped, as in
   crazyhouse. *Uchifuzume* keeps its meaning, rewritten in capture-the-king terms (2.6).
2. **Impasse:** the lishogi 27-point rule (Sente 28, Gote 27, automatic at the start of the turn). The JSA
   professional rules (31 points, or a 24-point count by agreement) need a declaration or an agreement; the 27-point
   rule is the amateur standard that lishogi and computer shogi use.
3. **Sennichite (repetition) and perpetual check are not implemented.** The variant core has no repetition rule and
   no "check", and the core plan rejects a repetition draw (`handoff/CORE-CHANGES.md` item 60). Instead: the
   generic quiet rule (100 plies without a capture, a drop or a pawn move is a draw) and a move limit of
   **500 plies**, taken from JSA art. 9 ("when the move count reaches 500 the game is an impasse", i.e. no result).
   The quiet rule is an app rule standing in for sennichite: no shogi source has a 50-move rule (Fairy-Stockfish
   `nMoveRule = 0`, none in scalashogi or the JSA rules), so a long quiet phase that real shogi would play on is drawn
   here. Every repetition cycle without captures, drops and pawn moves is drawn by the quiet rule; a cycle with
   captures or drops ends at ply 500.

"No legal move loses" is kept (lishogi, Fairy-Stockfish, and the JSA fouls). The insufficient-material draw of
lishogi (two bare kings, empty hands) is not added: it cannot arise in shogi, because the 38 other pieces never leave
the game (they are always on the board or in a hand, 2.3).

Two rules of classic Quantum Chess do not exist in the variants core (`handoff/CORE-CHANGES.md` item 72, a documented
deviation of every variant): "your king cannot escape" (docs/rules.md 5: a side whose every move leaves its king to be
captured for certain loses at once) and "the draws wait while the king can be taken for certain" (docs/rules.md 6).
Here a mated king is simply captured on the next move, and the quiet rule and the move limit end the game even when a
king capture is available.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- 9 × 9 board, all 81 squares exist. Squares are named as in USI and Western (Hodges) notation: **file digit 1–9,
  then rank letter a–i**, for example `7g`, `5e`, `1a`.
  - Files are numbered **from right to left** as Sente sees the board: file 1 is Sente's right edge, file 9 the left.
  - Rank `a` is Gote's back rank (top of the board for Sente), rank `i` is Sente's back rank (bottom).
- Engine coordinates `[f, r]` (2D, `rectTopology(9, 9)`): **f = 9 − file** (0 = file 9 on the left, 8 = file 1 on
  the right), **r = 8 − (rank letter index)** (0 = rank i at the bottom, 8 = rank a at the top). Square index
  `r × 9 + f`: 9i = 0, 1i = 8, 5e = 40, 9a = 72, 1a = 80. Examples: 5i = [4, 0], 8h = [1, 1], 2h = [7, 1], 5a = [4, 8].
- **Sente** (先手, "Black", moves first) is side 0, at the bottom, moving up (+r). **Gote** (後手, "White") is side 1,
  at the top, moving down. The default `orient` (negate coordinate 1 for side 1) is correct: every shogi move set is
  left-right symmetric, so mirroring equals the 180° turn of a real board.
- **Promotion zone:** the three farthest ranks. Sente: ranks a, b, c (r = 6, 7, 8). Gote: ranks g, h, i (r = 0, 1, 2).
- Each side has a **hand** (komadai): captured pieces waiting to be dropped. In the world they are pieces with
  `sq = HAND (-2)`.

### 2.2 Pieces and movement

Vectors are `[df, dr]`, written for Sente (forward = `[0, 1]`); `oriented` vectors are mirrored for Gote. Every
piece captures the way it moves (mode `both`), including the pawn.

| Type id | Piece (kanji, Japanese) | Descriptors | Betza |
|---|---|---|---|
| `k` | King (玉 gyokushō for Sente, 王 ōshō for Gote: the pychess convention; over the board 王 goes to the higher-ranked player, whatever side) | `{ leap: KING_STEPS }` | K |
| `r` | Rook (飛, hisha) | `{ ride: ROOK_DIRS }` | R |
| `b` | Bishop (角, kakugyō) | `{ ride: BISHOP_DIRS }` | B |
| `g` | Gold general (金, kinshō) | `{ leap: GOLD, oriented: true }`, GOLD = `[[0,1],[1,1],[-1,1],[1,0],[-1,0],[0,-1]]` | WfF |
| `s` | Silver general (銀, ginshō) | `{ leap: SILVER, oriented: true }`, SILVER = `[[0,1],[1,1],[-1,1],[1,-1],[-1,-1]]` | FfW |
| `n` | Knight (桂, keima) | `{ leap: [[1,2],[-1,2]], oriented: true }` (jumps, never blocked) | ffN (XBetza `fN`, as Fairy-Stockfish writes it) |
| `l` | Lance (香, kyōsha) | `{ ride: [[0,1]], oriented: true }` | fR |
| `p` | Pawn (歩, fuhyō) | `{ leap: [[0,1]], oriented: true }` (moves **and captures** straight ahead) | fW |
| `+r` | Dragon, promoted rook (龍, ryūō) | `{ ride: ROOK_DIRS }`, `{ leap: BISHOP_DIRS }` | RF |
| `+b` | Horse, promoted bishop (馬, ryūma) | `{ ride: BISHOP_DIRS }`, `{ leap: ROOK_DIRS }` | BW |
| `+s` | Promoted silver (全, narigin) | as gold | WfF |
| `+n` | Promoted knight (圭, narikei) | as gold | WfF |
| `+l` | Promoted lance (杏, narikyō) | as gold | WfF |
| `+p` | Tokin, promoted pawn (と, tokin) | as gold | WfF |

`KING_STEPS`, `ROOK_DIRS` and `BISHOP_DIRS` are the constants of `core/orthodox.js`. No region restrictions, no hops,
no lame leapers. The king and the gold have no promoted form; promoted pieces never turn back while on the board.

### 2.3 Setup (every square)

```
  9   8   7   6   5   4   3   2   1
+---+---+---+---+---+---+---+---+---+
| l | n | s | g | k | g | s | n | l |  a     Gote (side 1), lower case
|   | r |   |   |   |   |   | b |   |  b
| p | p | p | p | p | p | p | p | p |  c
|   |   |   |   |   |   |   |   |   |  d
|   |   |   |   |   |   |   |   |   |  e
|   |   |   |   |   |   |   |   |   |  f
| P | P | P | P | P | P | P | P | P |  g
|   | B |   |   |   |   |   | R |   |  h
| L | N | S | G | K | G | S | N | L |  i     Sente (side 0), upper case
+---+---+---+---+---+---+---+---+---+
```

- **Sente:** L 9i, N 8i, S 7i, G 6i, K 5i, G 4i, S 3i, N 2i, L 1i; B 8h, R 2h; P 9g 8g 7g 6g 5g 4g 3g 2g 1g.
- **Gote:** L 9a, N 8a, S 7a, G 6a, K 5a, G 4a, S 3a, N 2a, L 1a; R 8b, B 2b; P 9c 8c 7c 6c 5c 4c 3c 2c 1c.
- The position is point-symmetric: each player has the rook on their own right and the bishop on their own left
  (seen from Sente, both Sente's bishop and Gote's rook are on file 8). Hands empty.
  Sente moves first. SFEN `lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1`.
- 20 pieces per side, 40 in total. The total never changes: pieces only move between the board and the hands (a
  captured king ends the game).

### 2.4 Promotion

- A piece that has a promoted form (`p`, `l`, `n`, `s`, `b`, `r`) **may** promote at the end of a move whose **from
  square or target square** lies in its promotion zone: moving into, within or out of the zone. The choice is part of
  the move: `7c-7b` (stay) or `7c-7b=+s` (promote).
- **Compulsory:** a pawn or lance moving to the last rank, and a knight moving to either of the last two ranks, must
  promote (they could never move again otherwise). Only the `=+x` move exists there.
- A dropped piece is always unpromoted, even inside the zone. It may promote on a later move (that move starts in the
  zone).
- Promotion is permanent until the piece is captured. The king and the golds never promote.

### 2.5 Captures, hands and drops

- A captured piece **changes sides** and goes into the capturer's hand, **unpromoted** (`+r` → `r`, `+b` → `b`,
  `+s` → `s`, `+n` → `n`, `+l` → `l`, `+p` → `p`). A king never goes into a hand: capturing it ends the game.
- Instead of moving, a player may **drop** one piece from their hand onto **any empty square**, unpromoted. A drop
  never captures. A drop may attack the enemy king and may even leave it no escape; the one exception is a pawn drop
  that does both (uchifuzume, 2.6). A pawn drop that attacks the king but leaves it an escape is legal, and so is one
  that leaves the enemy without a safe move but does not attack the king (S11).
- **Drop restrictions** (all three from every source):
  1. **No piece where it could never move:** no pawn or lance on the last rank, no knight on the last two ranks
     (Sente: pawn/lance not on rank a, knight not on ranks a–b; Gote: pawn/lance not on rank i, knight not on h–i).
  2. **Nifu (two pawns):** no pawn drop on a file that already holds an **unpromoted** pawn of the same player. A
     tokin does not count.
  3. **Uchifuzume (pawn-drop mate):** see 2.6.
- Move code of a drop: `<type>@<square>` from `dropKey`, type in lower case: `p@5e`, `n@3c`, `r@2b`. The move list
  may print it as Hodges notation (`P*5e`).

### 2.6 Uchifuzume in capture-the-king terms

A pawn drop by side A on square q is **illegal** when all of these hold:

1. the pawn attacks the enemy king: B's king stands on the square directly in front of q (from A's side);
2. after the drop, **every board move of B** leaves B's king capturable by A. A board move of B that captures A's
   king is an escape (it wins). B's drops are not tried: a drop can neither capture the pawn nor block an adjacent
   attack, so it never escapes.

This is the classical definition (lishogi `dropFilterPawnCheckmate`, JSA "a check that cannot be answered") with
"legal reply" read as "reply after which the king survives". Pins count: a defender that could capture the pawn but
would expose its own king does not help (test S5). Moving a pawn to give "mate" is allowed, and so are drops of every
other piece. A pawn drop that does not attack the king is never uchifuzume, even when every enemy move then lets the
king be taken (lishogi checks `a.piece.eyes(d, kingPos)` first and scores the resulting stalemate as a loss; test
S11).

### 2.7 Win, draw, turn order

- **Turn order:** Sente, Gote, alternating.
- **Win:** capture the enemy king (lishogi: checkmate); **impasse** (below); the opponent has **no legal move at all**
  (lishogi and Fairy-Stockfish: stalemate loses); resignation. Since a move may leave the own king attacked, "no legal
  move" here means no move at all, which only a blocked-in position gives (S8). A classical checkmate or stalemate
  (every move leaves the king attacked) is not "no legal move": the player must make one of those moves, and the king
  is captured on the next move, so the same player wins one move later (S11).
- **Impasse (27-point rule):** at the start of a player's turn (that is, right after the opponent's move), the player
  to move wins if **all** hold:
  1. their king is in their promotion zone;
  2. at least **10 other own pieces** are in the promotion zone;
  3. their points are at least **28 (Sente)** or **27 (Gote)**. Points: every own piece in the promotion zone and
     every piece in the own hand; rook, bishop, dragon and horse count 5, every other piece 1, the king 0;
  4. their king is not attacked (not "in check").

  These are the conditions of lishogi's `Impasse.scala` ("more than 10 own pieces in the zone including the king" =
  the king plus at least 10 others) and of the JSA declaration rule, which needs 31 points and a declaration. Here,
  as on lishogi, the win is automatic: nobody declares. lishogi tests "no legal move" before the impasse; here the
  impasse (`worldResult`) comes first. The two orders differ only in a constructed position where the side that meets
  all four conditions has no legal move at all. Promoted rooks and bishops count 5 like unpromoted ones (S7).
- **Draw:** 100 plies in a row without a capture, a drop or a pawn move (`quietPlies` 100, the core's quiet counter,
  which resets on captures, drops and moves of a solid non-royal piece, i.e. an unpromoted pawn; with core change Q8
  of `handoff/CORE-CHANGES.md` only when the move really happens); **500 plies** played (`maxPly` 500).
  Agreement, where the UI offers it. The quiet rule is not a shogi rule (section 1, item 3); the 500-ply limit is the
  JSA one.
- Not implemented (1): fourfold repetition, perpetual check, the 24-point and 31-point professional impasse rules,
  handicap games, clocks.

---

## 3. Engine mapping (contract)

| Field | Value |
|---|---|
| `id`, `category` | `'shogi'`, `'regional'` |
| `sides` | `[{ id: 'b', name: () => t('quantumchess', 'Sente'), color: 'black' }, { id: 'w', name: () => t('quantumchess', 'Gote'), color: 'white' }]`. The ids follow SFEN (`b` = Sente to move). Sente is side 0 (bottom); default `rotate` (0 / 180). |
| `teams`, `enemies`, `orient` | none, defaults |
| `topology` | `rectTopology(9, 9, { name: (f, r) => String(9 - f) + 'abcdefghi'[8 - r], shade: () => 'wood', noLabels: true, layout: { labels } })`, labels in section 6 |
| `types` | the 14 types of 2.2, values below; `promote` on `p`, `l`, `n`, `s`, `b`, `r` |
| royal | `k` |
| solid | `k`, `p` (unpromoted pawns). Promoted pawns (`+p`) are **not** solid. |
| splittable | every other type: `r`, `b`, `g`, `s`, `n`, `l` and all six promoted types (the default `!solid`) |
| `drops` | `true` |
| `setup` | the start position of 2.3, `x = {}` (no per-world extra state) |
| `extraMoves` | the drops (below) |
| `filterMoves`, `afterMove` | none (promotion is done by the core) |
| `onCapture` | victim to the capturer's hand, unpromoted; a king goes `OFF` |
| `solidExtra` | the hand contents, as a guard (as crazyhouse) |
| `worldResult` | king capture, then the impasse test for the side to move (below) |
| `noMoves` | `{ winner: 1 - state.turn, reason: 'noMoves' }` (the side without a move loses) |
| `reasonText` | `impasse` → "impasse by the 27-point rule"; `quiet` → "50 moves without a capture, a drop or a pawn move". The UI puts the reason in parentheses ("Sente wins ({reason})"), so the text has none of its own |
| `evaluate` | hand pieces at 1.1 × value, pieces near the enemy king (below) |
| `quietPlies`, `maxPly` | 100 (default), **500** |
| `options`, `visibility` | none |
| `measured`, `applyMiss`, `unifyWorlds`, `budgetRule`, `compulsoryCapture`, `passWhenStuck` | none. Shogi keeps no per-ply bookkeeping in `x` (no en passant, no castling), so the planned Q1 / Q3 hooks have nothing to do; drops have `kind: 'drop'` and are not `certain` (Q2), so a drop is rolled per possibility (4.4). |
| `handOrder` (core plan U16) | `['r', 'b', 'g', 's', 'n', 'l', 'p']` (lishogi's order) |
| `codeText` (core plan U17, optional) | may print a drop as Hodges `P*5e`; without it U17 shows `P@5e`. Board moves keep the key (`7c-7b=+s`). |

**Promotion descriptor.** The core's `pushMove` already supports everything shogi needs (`fromZone` is implemented
in `world.js` but not yet listed in IMPLEMENTING.md):

```js
const inZone = (side, sq) => (side === 0 ? rankOf(sq) >= 6 : rankOf(sq) <= 2)
const farRanks = (side, sq, n) => (side === 0 ? rankOf(sq) >= 9 - n : rankOf(sq) <= n - 1)
const promote = (to, forcedRanks = 0) => ({
	zone: (side, sq) => inZone(side, sq),     // pushMove calls zone(side, to, from, w)
	fromZone: true,                          // a move that starts in the zone may promote too
	to: [to],                                // one choice: the code is e.g. 7c-7b=+s
	optional: true,                          // the plain code 7c-7b is offered as well ...
	forced: forcedRanks ? (side, sq) => farRanks(side, sq, forcedRanks) : undefined,  // ... except here
})
// p: promote('+p', 1), l: promote('+l', 1), n: promote('+n', 2), s: promote('+s'), b: promote('+b'), r: promote('+r')
```

**Drops, captures, result** (verified in the prototype; `pawnDropMate` is 2.6):

```js
extraMoves(w, side) {
	const out = []
	const hand = handOf(w, side)                     // type -> ids, ascending
	let pawnFiles = null
	for (const [type, ids] of hand) {
		for (let sq = 0; sq < 81; sq++) {
			if (w.board[sq] !== -1) continue
			if ((type === 'p' || type === 'l') && farRanks(side, sq, 1)) continue
			if (type === 'n' && farRanks(side, sq, 2)) continue
			if (type === 'p') {
				pawnFiles ??= filesWithOwnUnpromotedPawn(w, side)
				if (pawnFiles.has(fileOf(sq)) || pawnDropMate(w, side, sq, ids[0])) continue
			}
			out.push({ key: dropKey(V, type, sq), from: -1, to: sq, id: ids[0], capture: -1, promo: null,
				drop: type, kind: 'drop' })
		}
	}
	return out
},
onCapture(next, victim, m) {
	const t = next.ty[victim]
	if (V.types[t].royal) { placePiece(next, victim, OFF); return }
	placePiece(next, victim, HAND)
	next.sd[victim] = next.sd[m.id]                  // the capturer's side
	next.ty[victim] = t[0] === '+' ? t.slice(1) : t  // unpromoted
},
worldResult(w, mover) {
	// a custom worldResult replaces the core's default king test, so it is repeated here
	const alive = [false, false]
	for (let id = 0; id < w.sq.length; id++) if (w.sq[id] >= 0 && V.types[w.ty[id]].royal) alive[w.sd[id]] = true
	if (!alive[0] || !alive[1]) return { winner: alive[0] ? 0 : alive[1] ? 1 : null, reason: 'king' }
	// otherwise the side about to move may have reached the impasse
	const next = 1 - mover
	return impasse(w, next) ? { winner: next, reason: 'impasse' } : null
},
```

`pawnDropMate(w, side, sq, id)`: return false unless the square in front of `sq` (`orient(side, [0, 1])`) holds the
enemy king. Otherwise clone the world, place the pawn, and list the enemy's board moves with `pieceMoves` (king
first, since its moves are the usual escapes). For each reply: if it captures a royal piece, return false; else apply
it on a scratch copy (remove the captured piece, move the piece) and return false as soon as
`attacks(V, copy, side, kingSquareAfter)` is false. Return true when no reply escapes. It runs for at most one square
per world and only when a pawn is in hand and that square is empty and free of *nifu*. The implementation may use
make/unmake on one scratch world instead of a clone per reply.

`impasse(w, side)`: count, over the pieces of `side` on squares in its zone, the king (must be there), the other
pieces (at least 10) and their points, add the points of the pieces in its hand (hands hold only unpromoted types,
so `r` and `b` are the 5-point ones), compare with 28 / 27, then require `!attacks(V, w, 1 - side, kingSquare)`.

The core calls `worldResult(w, mover)` with `mover` = the side that has just played (`state.turn`), after every
move, split, merge and Measure: in every world of each outcome (the game-end roll, `settle`) and then on the first
world of the chosen outcome (`stateAfter`). So the impasse is always tested for the side about to move, as lishogi
does at the start of the turn, and before "no legal move" (2.7).

### 3.1 Piece values (centipawns, for the computer)

Kaufman's values (Wikipedia, "Shogi strategy") × 100. The king's value does not matter (both sides always have one
while the game runs); 0.

| `p` | `l` | `n` | `s` | `g` | `b` | `r` | `+p` | `+l` | `+n` | `+s` | `+b` | `+r` | `k` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 400 | 500 | 700 | 800 | 1100 | 1300 | 1000 | 900 | 900 | 800 | 1500 | 1700 | 0 |

`ai.js` counts a piece in hand at 0.8 × value. In shogi a piece in hand is worth *more* than on the board (YSS 7.0:
about 1.1–1.25 ×), so `evaluate(w, side)` adds **+0.3 × value** for every own piece in hand and **−0.3 × value** for
every enemy piece in hand (net 1.1 ×), plus **+15** for every own non-king piece within king distance 2 of the enemy
king and **−15** for every enemy piece within distance 2 of the own king. Tried in the prototype: `chooseMove` from the
start takes 5 / 8 / 22 ms (easy / normal / hard); from a middlegame with pieces in both hands (78 moves) 4 / 84 /
315 ms. An 80-ply self-play (normal against easy) develops, splits, drops and promotes without errors.

### 3.2 Core changes

Everything above runs on the committed core (commit e0369f5). The rules of section 4 need one core rule, "a piece
never has two faces on one square". The core plan took it up as Q13 and Q14 (`handoff/CORE-CHANGES.md`); both were
in the working tree during the engine review (8.2), and Q13 still has one gap. Change 2 is optional and rejected.

1. **Required: a piece never has two faces on one square (Q13 and Q14; Q13 needs one correction).** Promotion
   happens per possibility (4.2), so one piece can be promoted in some possibilities and not in others. If two such
   parts come together, the piece stands on one square with two faces (for example 50% promoted silver, 50% silver;
   test Q1). Measure cannot settle it, because Measure only settles *where* a piece is. Such a piece can arise in
   three ways, and the rule must close all three:
   - (a) a merge of two parts with different faces (Q1). Q13 closes it.
   - (b) a merge of two parts with the same face onto a **third part** that has the other face (Q9). Q13 checks only
     `f1` and `f2` (plan text and working tree: `facesOf(state, X, [f1, f2])` in `perWorldMerge`,
     `facesOf(state, X, [f, other])` in `mergeCandidates`) and lets this through: **the correction below is needed.**
     Still open in the working tree at the second engine pass.
   - (c) a **join** (Q14: a part moves onto another part of the same piece without a landing roll) where the moving
     part promotes and the part on the target does not, or the other way round (Q10). Q14 in the working tree
     compares the occupant with the type the mover has *after* the move (`m.promo || b.ty[m.id]` in `moverOf`), which
     closes it. The plan's text ("the same type as the mover") should say "after the move": compared with the type
     before the move, `6d-5c=+s` onto an unpromoted part on 5c would join and leave two faces (Q10).

   Exact semantics (checked on the working-tree core and on the review's emulation
   `handoff/tmp/critic-shogi/quantum_q13q14.js`, switches `q13: 'withT'`, `q14type: 'after'`):

   ```js
   function facesOf(state, X, squares) {         // the types X has where it stands on one of the squares
   	const out = new Set()
   	for (const { b } of state.worlds) if (squares.includes(b.sq[X])) out.add(b.ty[X])
   	return out
   }
   // Q13 (correction: add the target t), in the working-tree functions that hold the check today:
   //   perWorldMerge (used by mergeBranches and mergeDanger), with the splittable check:
   //     if (... || facesOf(state, X, [f1, f2, t]).size > 1) return null
   //   mergeCandidates (used by mergesFrom and mergeDanger), in the loop over the common targets t:
   //     if (friendlyMaybe(state, t, X) || facesOf(state, X, [f, other, t]).size > 1) continue
   // Q14 (as in the working tree): an occupant of the target that is `self` is "not another piece" only when its
   //   type equals the type the mover has after the move (m.promo || the mover's type); otherwise a landing roll.
   ```

   Merges never promote, so checking `t` before the merge is exact. With the correction no path is left: in 800
   random games on the emulated corrected core no ply had two faces on one square, while in 480 games on the
   working-tree core one piece got two faces, through (b), and on the committed core the check fired 153 times
   (counted per ply) in 320 games (7.3 F2). The exact two-line correction above, applied to a copy of the current
   working-tree `quantum.js` (second engine pass, `handoff/tmp/critic-shogi/pass2/quantum_fix.js`): the 145 tests of
   the core test files still pass, every row of section 7 gives the corrected-core result, and 840 random games had no
   two-faced piece, against one (made by a merge onto a third part) in 240 games with the same seeds on the unpatched
   working tree (7.3 F4). No other variant is affected: in every other variant a piece's type changes only by a solid
   pawn's promotion, which is certain, so its parts always share one type (the plan names the multiverse's `r0` / `r`
   rook, where the refusal is harmless).

   **Fallback while Q13 lacks the correction:** the two-faced piece can still arise through (b), rarely. It stays
   legal: it is drawn as two half-size tokens on one square with their chances (the board shows up to two
   occupants), counts as two arrangements in the budget, is never settled by Measure (Measure settles squares, not
   faces; with no other part it is not even offered), and turns back into an ordinary ghost as soon as it makes a
   move only one face can make (Q1, committed core), or is captured (the hand gets the unpromoted piece either way).
   Nothing breaks: the fuzz invariants hold with it.

   **Alternative without any core change** (open question 1): `measured: (m) => m.promo !== null`. Every promoting
   move of a part that might not be there (or might be blocked) is then a roll, like a landing, so a piece always has
   one type in every possibility and Q13 / Q14 never matter. 160 random games on the committed core with this hook:
   no piece ever had two types.
2. **Optional: a generic repetition draw** (the real sennichite). The state would keep a count of position keys
   (side to move + the sorted list of `worldKey` and weight of every world), cleared whenever the quiet counter
   resets; `V.repetitions = 4` makes the fourth occurrence a draw (`reason: 'repetition'`). Perpetual check stays out
   (there is no certain "check" in the quantum game). **Rejected** by the core plan (`handoff/CORE-CHANGES.md` item
   60, "each spec lists it as a known deviation"), so the fallback applies: the quiet rule and `maxPly` 500 (2.7).

UI items (no rule depends on them): `handOrder` for the hands panel is the core plan's U16 (in the working tree,
`src/variantplay/panel.js`; the committed UI sorts type ids alphabetically). Full Hodges notation in the move list
(`P-7f`, `Bx2b+`, `S-4c=`) needs the position and is rejected for now (plan item 69); the variant's `codeText(code)`
(U17) can still print drops as `P*5e`. One UI text needs a change (8.2, core change 3): the drop outcome text
"Missed: the square was taken" (U7, `outcomeText` in `src/variantplay/texts.js`) is wrong for a pawn drop that misses
because it would be mate in that possibility (4.4, Q3, Q15): the square was empty. Optional: the shared rules card
(`sharedRules()` in `texts.js`) always shows the sentence on castling and en passant, which shogi does not have; it
could leave it out for a variant that has neither (a declaration flag would do); as it stands it is irrelevant here,
not wrong.

---

## 4. Quantum adaptation

The shared rules apply unchanged: split, merge, measure, land = roll, pass = link, the solid roll, the game-end roll,
budget 8 per side, at most 4 squares per split. The shogi decisions:

### 4.1 Which pieces are solid

- **King and (unpromoted) pawn are solid**, as in every variant of the app ("kings and pawns are always solid"). For
  shogi this has two more reasons:
  - **nifu is always certain.** The solid roll keeps every pawn on the same square in every possibility, so the files
    that hold an own pawn are the same everywhere, and a pawn drop is either allowed in every possibility or in none
    (apart from the square being taken by a ghost, and uchifuzume, 4.4). With splittable pawns a pawn drop would be
    allowed in some possibilities and not others for a reason players cannot see.
  - pawns stay the cheap, certain probes that find ghosts, as in the other variants.
- **Everything else splits**, including golds, silvers, knights, lances and every promoted piece (a tokin is a
  gold-mover, not a pawn). A knight has exactly two targets, so "split to both" is its natural quantum move; a knight
  jumps, so it never links. A lance slides, so a lance passing a ghost links to it (pass = link).
- **A pawn that promotes stops being solid**: the tokin can split from its next move on. The promotion move itself is
  a pawn move, so it is settled at once (a roll when it might be blocked or might capture).

### 4.2 Promotion happens per possibility

- The promotion choice is part of the move code (`4d-4c=+s` or `4d-4c`), the same in every possibility.
- A ghost part promotes only in the possibilities where it really makes the move. Nothing is rolled for the
  promotion: the other parts keep their face (test Q1: silver 50% on 4d and 50% on 6d plays `4d-4c=+s`, and is then
  50% promoted silver on 4c, 50% silver on 6d). Each part is drawn with its own face.
- Compulsory promotion works the same way: a ghost lance part that moves to the last rank becomes a promoted lance
  there; its other part is still a lance (Q8).
- So does a slide that a ghost blocks in some possibilities (pass = link): the slider promotes where it arrives and
  keeps its face where it stayed, linked to the blocker (Q16: `2h-2c=+r` past a 50% silver leaves a 50% dragon on 2c
  and a 50% rook on 2h, no roll).
- **Splits and merges never promote** (the core uses only non-promoting moves for them). So a split can never reach a
  square where promotion is compulsory (a Sente knight on rank c or d cannot split at all; Q7).
- **One face per square.** A piece may show different faces on different squares (a promoted part and an unpromoted
  part), and Measure settles it as usual. It never shows two faces on one square (3.2, change 1):
  - a **merge** is not allowed when the piece has more than one face over the two parts and the target (it is not
    offered; Q1, Q9). Measure first, or merge only parts with the same face;
  - **moving a part onto another part** of the same piece joins it without a roll (core Q14) only when the part on
    the target has the face the mover has after the move; otherwise it is a landing roll, as it was in the committed
    core for every such move (tests Q8, Q10).

### 4.3 Captures and hands are always certain

- A capture lands on a square where a piece is or might be, so it is in the measured class: a roll decides
  *Captured* against *Moved* or *Missed*. After it, the captured piece is in the hand in every remaining possibility
  or in none. By the one-occupant-per-square invariant (every landing on a square where *another* piece might stand
  is rolled, a join lands only on the mover's own part, splits need certainly empty targets, drops are always
  measured), a capture takes the same piece in every possibility where it captures, and the hand gets the same
  unpromoted type even when the captured part was promoted in one possibility and not in another.
- So **both hands are identical in all possibilities**, piece ids included. Checked after every ply of the random
  games. Hands never count towards the budget.
- A **pawn captures straight ahead**, so a pawn push onto a square where an enemy ghost might stand is a roll between
  *Captured* and *Moved*, never *Missed* (unlike chess pawns). It is *Missed* only when an own piece might stand there
  (Q4).

### 4.4 Drops

- A drop is always in the measured class (`isMeasured` already treats drops so).
  - Onto a **certainly empty** square: certain.
  - Onto a square where a ghost part (enemy or own) might stand: a roll, **Dropped** (the square was empty: the piece
    is placed, and the ghost is known not to be there) or **Missed** (the square was taken: the piece stays in the
    hand, the turn is used, the ghost is found). A drop is a cheap probe (Q2).
- The dropped piece is the lowest id of that type in the hand, the same piece in every possibility (4.3). No drop onto
  two squares at once; a dropped piece may split from its next turn on.
- **Last-rank rule and nifu** depend only on the square and on the solid pawns, so they are the same in every
  possibility (4.1).
- **Uchifuzume is decided per possibility.** In a possibility where the pawn drop would be a pawn-drop mate (2.6), the
  drop is not allowed, so it *misses* there, like any move that cannot be played in that possibility. If that is true
  in every possibility, the drop is not offered. If only in some, the drop is a roll: *Missed* (the pawn stays in the
  hand, and you know the king really had no escape) or *Dropped* (Q3). The test is classical and per possibility: the
  ghosts of both sides count where they stand in that possibility, the attacker's (Q3) as well as the defender's
  (Q12). When the square might be taken in some possibilities and the drop would be mate in others, both kinds of
  possibility make up the one *Missed* outcome (Q15); so the text of a missed drop must not say why it missed (8.2,
  core change 3). Rejected alternatives: forbidding the drop if it is mate in *any* possibility (needs a cross-world
  legality hook in the core and hides a legal drop), and Fairy-Stockfish's "the drop is legal but loses" (a game-end
  roll that could lose the game on a pawn drop: harsh and hard to explain).
- Drops never raise the budget and never fall back to a roll for the budget (a drop is measured before the budget
  is looked at). The quiet counter resets on every drop attempt in the committed core, and only on a drop that
  really happened with core Q8 (working tree; test Q2).

### 4.5 Game end

- **King capture:** the king is solid, so a king capture is certain or rolled (*Captured* / *Missed*), as in classic
  Quantum Chess. The king-danger ring counts board captures and, with core Q7 (in the working tree: `mergeDanger`),
  converging captures; it builds the merges with the same functions as the merge rule, so a merge that Q13 refuses
  never counts. A piece in hand never adds to it, since a drop cannot capture. There is no "your king cannot escape"
  loss (section 1).
- **Impasse per possibility:** the 27-point test runs in every possibility after every move (for the player about to
  move). A ghost can make the difference: a ghost part inside the zone counts only where it stands there; a ghost
  attacker that might hit the king blocks the impasse only where it stands. If the test differs between
  possibilities, the **game-end roll** decides whether the game is over (Q6: a ghost in the zone; Q11: a ghost
  attacker). Hands are certain, so their points never cause the roll. The **solid roll** never fires in shogi: kings
  and pawns move only by rolled or certain moves, and hands are identical in every possibility (4.3).
- **No legal move:** the player to move loses. This needs no ghosts (a player with a ghost can always measure it); in
  practice it only happens in constructed positions (S8); a classical stalemate is not one (2.7, S11).
- **Quiet rule and move limit:** as 2.7. The committed core resets the quiet counter on every capture and on every
  pawn move or drop, even one that missed; with core change Q8 (`handoff/CORE-CHANGES.md`, in the working tree) only
  a capture, or a pawn move or drop that really happened in the chosen outcome, resets it, and a missed attempt adds
  1 (test Q2). A measurement, split or merge never resets it (a merge that captures does). Only an unpromoted pawn
  is a pawn here: a tokin's move that captures nothing adds 1, a pawn move that promotes resets (the type before the
  move counts; S12).

### 4.6 Summary for players (a few sentences)

Promotion, drops and captures work as in shogi, and each happens only where the move really happens: a ghost can be
promoted in one possibility and not in another, but two parts with different faces cannot merge. Dropping onto a
square where a ghost might stand is a roll. A pawn drop that gives mate (it attacks the enemy king and leaves it no
escape) is forbidden; if that is so only in some possibilities, the drop is a roll and misses in those. Hands are
always certain.

---

## 5. Player-facing rules text (`rules()`)

1. Sente moves first, and every piece captures the way it moves.
2. Captured pieces join your hand unpromoted; instead of moving you may drop one, unpromoted, onto any empty square (a
   roll if a ghost might stand there).
3. You may not drop a pawn on a file that has one of your unpromoted pawns, nor a pawn, lance or knight where it could
   never move.
4. You may not drop a pawn that attacks the enemy king and leaves it no escape; if that is so in only some
   possibilities, the drop misses in those.
5. Any piece but the king and the golds may promote (red kanji) when it moves into, within or out of the enemy camp
   (the three ranks farthest from you); a ghost promotes only where it really moves, and parts with different faces
   cannot merge.
6. A pawn or lance reaching the last rank, or a knight reaching the last two ranks, must promote.
7. Capture the enemy king to win, or begin your turn with your king and at least ten other pieces in the enemy camp,
   your king not attacked, and at least 28 points as Sente or 27 as Gote, counting your pieces in the enemy camp and
   in your hand (rooks and bishops, promoted or not, 5; other pieces 1; the king 0).
8. A player who cannot make any move loses. 50 moves each without a capture, a drop or a pawn move that really happens,
   or 500 moves in total (both players' moves counted), is a draw; there is no separate repetition rule.

---

## 6. UI layout

- **Board:** `rectTopology(9, 9)` with every cell `shape: 'rect'`, **shade `wood`** (the existing wooden fill
  `#eecb8c` with the dark `#7a5a2a` cell border, which draws the grid). No checkering, no special zone shading: a real
  shogi board marks the zones only with four dots.
- **Labels** (`noLabels: true` plus own labels; y grows downwards, Sente at the bottom):
  - file numbers across the **top**: `{ x: f + 0.5, y: -0.32, text: String(9 - f) }` for f = 0..8 (9 on the left, 1
    on the right, as on every shogi diagram);
  - rank letters down the **right** edge: `{ x: 9.3, y: k + 0.5, text: 'abcdefghi'[k] }` for k = 0..8 (a at the top);
  - the four **star points** (hoshi) that mark the zones, at the grid intersections (3, 3), (6, 3), (3, 6), (6, 6):
    labels with text `•` (U+2022). They are drawn after the cells, so they sit on the grid lines. (A dedicated
    `dots` layout element would be nicer; labels need no UI change.)
  - The labels turn with the board when Gote views it (the board already rotates labels), so Gote sees the file
    numbers at the bottom and the ranks on the left, as on a turned real board.
- **Pieces:** every type uses `glyph: { text, shape: 'shogi' }`, the existing wooden pentagon (`#f2d7a1`, brown
  outline) that points at the opponent: Sente's point up, Gote's are turned 180° (the existing `spin`). Ownership is
  shown only by direction, as in real shogi.
  - Unpromoted (black ink `#1b1b1b`): king `(side) => (side === 0 ? '玉' : '王')` (Sente 玉 with the dot, Gote 王,
    the pychess convention; over the board the higher-ranked player takes 王, which has no fixed side), rook 飛,
    bishop 角, gold 金, silver 銀, knight 桂, lance 香, pawn 歩.
  - Promoted (`promoted: true`, red ink `#b71c1c`): dragon 龍, horse 馬, promoted silver 全, promoted knight 圭,
    promoted lance 杏, tokin と.
  - One character each, so the existing font size (0.5 × size) and the CJK serif stack of `VariantPiece.vue` apply.
  - Type names for tooltips and screen readers: "King", "Rook", "Bishop", "Gold general", "Silver general",
    "Knight", "Lance", "Pawn", "Dragon (promoted rook)", "Horse (promoted bishop)", "Promoted silver", "Promoted
    knight", "Promoted lance", "Tokin (promoted pawn)".
- **Ghost parts** as everywhere: faded with the percentage badge; each part shows its own face (a promoted part in
  red, an unpromoted one in black). A two-faced piece (only while the core lacks 3.2 change 1) shows two half-size
  tokens on its square: `VariantBoard.vue` draws up to two occupants per square, because `squareView` keys by piece,
  type and side.
- **Hands:** `drops: true` shows the existing hands panel ("In hand: Sente", "In hand: Gote") with a count per type.
  The panel draws every glyph unturned, so Gote's hand pieces point up too; passing `spin` (the side's `rotate`) to
  `VariantPiece` there would make them point down as on the board (a one-line UI change, optional). Order R, B, G, S,
  N, L, P (lishogi) via `handOrder` (U16). The counts are exact: hands are identical in every possibility.
  Choosing a hand piece marks the legal drop squares as targets (`VariantBoard.vue` has no per-square Certain / Roll
  badge); a drop that can miss opens the existing "This move is settled by a roll" box with the odds. Squares
  forbidden by *nifu*, the last-rank rule or *uchifuzume* in every possibility are not marked.
- **Promotion:** the existing choice box already offers "Do not promote" next to the promoted type; it shows the
  promoted glyph in red. When promotion is compulsory only the promoted move exists, so no box is needed. (The box
  draws its tokens unturned, like the hands panel.)
- **Outcome words for drops** (U7): "Dropped" instead of "Moved". U7's miss text "Missed: the square was taken" is
  wrong for shogi, where a pawn drop also misses on an empty square because it would be mate there (Q3), and one
  *Missed* outcome can hold both reasons (Q15); the drop miss text must be neutral, for example "Missed: the piece
  stays in hand" (8.2, core change 3). Still "Missed: the square was taken" in the working tree.
- **Move list:** drops show as `P@5e` with U17; an optional `codeText` may print `P*5e` (section 3).
- **Side markers:** Sente black, Gote white (`color`), the shogi convention (☗ / ☖).

---

## 7. Test cases

All results below were produced by the prototype on the real core (`handoff/prototypes/shogi/tests.mjs`, 74 checks,
all pass on the committed core; output in `handoff/tmp/shogi/tests-out.txt`; on the working-tree core the script
stops at Q1's committed-core merge, which Q13 refuses as Q1 expects). S5 (e), S7 and Q6 were changed by the source
review (8.1) and re-run with `handoff/tmp/rev1-shogi/verify.mjs`; `tests.mjs` still has the old versions (S5 (e) with
the rook on 5b, `9i-9h` and `1a-1b` in S7 and Q6), which give the same results. S5 (g), the S7 dragon / horse rows
and S11 were added by the second source pass and run with `handoff/tmp/rev1-shogi-2/check.mjs`. Placements are
written `side:type` per square as in `worldFrom` (`'5i': '0:k'`; side 0 = Sente, 1 = Gote); "hand" lists
`[side, type]` pieces added with `HAND`; `x = {}`. Two possibilities written "A / B" have equal weight. Outcome lists
are in the core's order (miss, move, capture); the outcomes of a Measure are listed by square index (`9i` = 0 ...
`1a` = 80; Q1, Q16). There are no test rows named Q13 and Q14, so that a test name never reads as the core plan's
Q13 / Q14.

Rules that make the multi-world rows exact (the engine review's `handoff/tmp/critic-shogi/review.mjs` builds them
so):

- `worldFrom` numbers the pieces in placement order and the hand pieces after them, so every possibility of a row
  lists its pieces **in the same order** (the piece that moves between "A" and "B" keeps its place in the list, as in
  `{ ...zone, '4c': '0:s' }` / `{ ...zone, '4d': '0:s' }`); otherwise "the same piece" gets different ids.
- The test helper `stateOf` of `tests/js/variants/helpers.js` has no hand argument: add hand pieces in its `edit`
  callback with `addPiece(b, type, side, HAND)` (the hand pieces then come after the board pieces, as with
  `worldFrom`'s hand argument). Without `edit` it sets `x` to the orthodox shape (`{ ep: -1, epVictim: -1, castle:
  [] }`), which shogi ignores; with `edit` `x` stays the fresh `{}` it passes to `worldFrom`.
- A row that sets `quiet` or `ply` (S9b, S12) builds the state as usual and then sets that field.
- When a settling roll (game-end) splits an outcome, its parts follow the order of the possibilities in the state
  (Q6, Q11).
- Three cores are named: the **committed core** (commit e0369f5, without the plan's Q8, Q13, Q14), the
  **working-tree core** (with Q8, Q13 and Q14 as they were in the working tree during the engine review) and the
  **corrected core** (the working tree plus the Q13 correction of 3.2, change 1). A row that names none holds on all
  three. `review.mjs` runs every row on all three (186 checks). The second engine pass added a fourth run, the
  exact correction on a copy of the current working-tree `quantum.js` (`handoff/tmp/critic-shogi/pass2/`:
  `review_fix.mjs`, 224 checks), and runs the rows added later (S5 (g), (g'), the S7 dragon / horse rows, S11, S12,
  Q15, Q16 and Q1's Measure outcomes) on its own implementation of section 3 and on all four cores (`check2.mjs`,
  78 checks). All pass.

### 7.1 Classical rules

| # | Position (SFEN where classical) and moves | Expected |
|---|---|---|
| S1 | Start position (2.3). | K on 5i, B on 8h, R on 2h; Gote R on 8b, B on 2b; Gote rank a from file 9 to 1 = `lnsgkgsnl`. Sente has **30** ordinary moves and **23** splits. |
| S2 | Sente K 5i, S 4d, S 6c; Gote K 9a (`k8/9/3S5/5S3/9/9/9/9/4K4 b - 1`). Then `6c-5d=+s`, Gote `9a-9b`. | Silver 4d (entering the zone): exactly `4d-3c`, `4d-3c=+s`, `4d-3e`, `4d-4c`, `4d-4c=+s`, `4d-5c`, `4d-5c=+s`, `4d-5e`. Silver 6c (in the zone): all 10 codes `6c-5b`, `6c-6b`, `6c-7b`, `6c-5d`, `6c-7d`, each also with `=+s` (moving *out* of the zone may promote). After `6c-5d=+s` the piece on 5d is `+s` and moves as a gold: `5d-4c`, `5d-5c`, `5d-6c`, `5d-5e`, `5d-6d` (4d holds the other silver). |
| S3 | Sente K 5i, P 3b, N 7d, N 6e, L 1d; Gote K 9a (`k8/6P2/9/2N5L/3N5/9/9/9/4K4 b - 1`). Also Gote K 5a, P 7f; Sente K 9i, Gote to move (`4k4/9/9/9/9/2p6/9/9/K8 w - 1`). | Pawn 3b: only `3b-3a=+p`. Knight 7d: only `7d-6b=+n`, `7d-8b=+n`. Knight 6e: `6e-5c`, `6e-5c=+n`, `6e-7c`, `6e-7c=+n`. Lance 1d: `1d-1a=+l`, `1d-1b`, `1d-1b=+l`, `1d-1c`, `1d-1c=+l`. Gote pawn 7f: `7f-7g`, `7f-7g=+p`. |
| S4 | Sente K 5i, P 5g, +P 4d; Gote K 1a; Sente hand P, L, N (`8k/9/9/5+P3/9/9/4P4/9/4K4 b NLP 1`). Also Gote K 5a, Sente K 5i, Gote hand P, N, Gote to move. | Sente pawn drops **63**, lance drops **69**, knight drops **60**. `p@5e` illegal (nifu); `p@4e` legal (only a tokin on file 4); `p@3a`, `l@3a`, `n@3b` illegal; `p@3b`, `l@3b`, `n@3c` legal. Gote: `p@3i`, `n@3h` illegal, `p@3h`, `n@3g` legal. |
| S5 | Sente K 5i, G 2c; Gote K 1a, N 2a; Sente hand P, G (`7nk/9/7G1/9/9/9/9/9/4K4 b GP 1`). Variants: (b) no gold, hand P; (c) Gote S 2a instead of the knight; (d) as (c) plus Sente R 9a (`R6sk/9/7G1/9/9/9/9/9/4K4 b P 1`); (e) base with hand P only, plus Gote R 5c (`7nk/9/4r2G1/9/9/9/9/9/4K4 b P 1`; Sente is in check and ignores it, which capture-the-king allows); (e') as (e) with the Sente king on 4i instead of 5i; (f) Sente K 5i, G 2c, P 1c; Gote K 1a, N 2a, empty hands; (g) the base turned for Gote, Gote to move: Gote K 5a, G 8g, hand G, P; Sente K 9i, N 8i (`4k4/9/9/9/9/9/1g7/9/KN7 w gp 1`), and (g') the same without the gold on 8g, Gote hand P. Hands: base P and G, (b)–(e') P, (f) none. | Base: `p@1b` **illegal** (pawn-drop mate: 1b is defended by the gold, 2b is covered, 2a is taken), `g@1b` legal. (b) `p@1b` legal (the king takes it). (c) legal (the silver takes it). (d) **illegal** (the silver is pinned by the rook on rank a). (e) legal: after the drop no Gote piece but the king reaches 1b (the only Gote move to 1b is `1a-1b`, into the gold's attack), but `5c-5i` captures the Sente king, which counts as an escape. (e') **illegal** (the rook no longer reaches the king). (f) the pawn *move* `1c-1b` and `1c-1b=+p` are legal. (g) `p@9h` **illegal**, `g@9h` legal (Fairy-Stockfish: 158 moves at depth 1 against 157, the extra one is `P*9h`). (g') `p@9h` legal (the king takes it). |
| S6 | Sente K 5i, +R 2b; Gote K 5a, S 3a; Gote to move (`4k1s2/7+R1/9/9/9/9/9/9/4K4 w - 1`). `3a-2b`. Also Sente K 5i, P 5e; Gote K 9a, +P 5d: `5e-5d`. | Gote's hand holds one **rook** (unpromoted); `r@5e` is among Gote's moves; `quiet` = 0. The pawn captures straight ahead: Sente P on 5d, Sente's hand holds a **pawn** (the demoted tokin). |
| S7 | Gote to move. Sente K 5c; R 9a, B 8a, G 7a, G 6a, S 4a, S 3a, +P 6b, +P 4b, +P 3b, +P 2b; hand R, B. Gote K 9i (`RBGG1SS2/3+P1+P+P+P1/4K4/9/9/9/9/9/k8 w RB 1`). The Sente rook on 9a gives check; Gote answers `9i-8i` (classically legal: Gote's legal moves are `9i-8h` and `9i-8i`). | Result `{ winner: 0, reason: 'impasse' }` (10 pieces in the zone, 18 + 10 = 28 points). Same with hand R + 4 P instead of R, B (27 points): no result. Same with the 4b tokin on 4e instead (9 pieces in the zone): no result. Base plus a Gote gold on 5d (attacks the king): no result. Base with a dragon (`+R`) on 9a instead of the rook, or a horse (`+B`) on 8a instead of the bishop: the same win (promoted big pieces count 5; Gote's legal moves are still `9i-8h`, `9i-8i`). The mirror image for Gote (27 points: `8K/9/9/9/9/9/4k4/1+p+p+p1+p3/2ss1ggbr b r4p 1`; Sente K 1a is in check from the rook on 1i and plays `1a-2a`): `{ winner: 1, reason: 'impasse' }`. |
| S8 | Gote to move. Sente K 1a, G 9a, S 8a, G 7a, S 6a, G 5a, S 4a, G 3a, S 2a, P on 1b–9b; Gote K 5i (`GSGSGSGSK/PPPPPPPPP/9/9/9/9/9/9/4k4 w - 1`, constructed). `5i-5h`. | Sente has no legal move: `{ winner: 1, reason: 'noMoves' }`. |
| S9 | Sente K 5i, R 1i, hand P; Gote K 5a, R 9a. `1i-1h`, `9a-9b`, `p@5e`, then rook moves `9b-9a`, `1h-1i`, `9a-9b`, `1i-1h`, ... | `quiet` = 1 after `1i-1h`, 0 after the drop; the game ends `{ winner: null, reason: 'quiet' }` with `quiet` = 100. |
| S9b | Sente K 5i, R 1i; Gote K 5a; `ply` = 499. `1i-1h`. | `{ winner: null, reason: 'moveLimit' }` (`maxPly` 500). |
| S10 | Sente K 5i, P 5c; Gote K 5a, G 4a (`4kg3/9/4P4/9/9/9/9/9/4K4 b - 1`). `5c-5b` (check), `4a-4b` (Gote ignores the check: allowed, there is no check rule), `5b-5a=+p`. | `{ winner: 0, reason: 'king' }`. |
| S11 | Sente K 5i, S 2c, hand P; Gote K 1a (`8k/9/7S1/9/9/9/9/9/4K4 b P 1`). `p@2b`, then each Gote reply. | `p@2b` is legal: the pawn attacks 2a, not the king, so it is not uchifuzume although every Gote move then lets the king be taken (lishogi and Fairy-Stockfish: legal, and Gote is stalemated and loses; FS perft 1 = 85 before, 0 after, as the prototype). After `p@2b` there is **no** result: Gote's moves are exactly `1a-1b`, `1a-2a`, `1a-2b`, and Sente then takes the king (`2c-1b`, `2b-2a=+p`, `2c-2b` respectively; the silver may also promote): `{ winner: 0, reason: 'king' }`. `p@1b` is legal too (check, the king escapes to 2a). |
| S12 (a tokin is not a pawn) | Sente K 5i, +P 5d, P 3g; Gote K 5a; `quiet` = 5. Also Sente K 5i, P 5c; Gote K 9a; `quiet` = 5. | The tokin splits like a gold: 15 splits from 5d (every pair of its 6 targets); the pawn on 3g has none. `5d-5c`: `quiet` = 6 (a tokin move is not a pawn move). `3g-3f`: `quiet` = 0. Second position: `5c-5b=+p`: `quiet` = 0 (the type before the move counts). Same on every core. |

### 7.2 Quantum interactions

| # | Position and moves | Expected |
|---|---|---|
| Q1 (promotion per possibility, faces) | Sente K 5i, S 5e; Gote K 5a. `5e-4d\|6d`, `5a-5b`, `4d-4c=+s`, `5b-5a`, then the merge `6d\|4c-5c`. Control: from the same start `5e-4d\|6d`, `5a-5b`, then `6d\|4d-5c`. | `4d-4c=+s` has one outcome, `move` p = 1 (not rolled): 4c holds Sente `+s` 50%, 6d Sente `s` 50%, Sente budget 2. **Working-tree and corrected core (Q13):** the merge `6d\|4c-5c` is not in `legalMoves` and `branches` is null; Measure `?6d` is offered (the code names the part on the lowest square index); its outcomes (on every core, played instead of the merge) are `6d` 0.5 (the silver `s` 100% on 6d) and `4c` 0.5 (`+s` 100% on 4c), budget 1 after either. Control: `6d\|4d-5c` has one outcome `move` p = 1. **Committed core:** the merge is offered; afterwards 5c holds the same piece as `+s` 50% and `s` 50%, budget 2, no Measure offered; after `5a-5b`, `5c-4d` (only the silver face can) has one outcome `move` p = 1: `+s` 50% on 5c, `s` 50% on 4d. |
| Q2 (drop probe) | A: Sente K 5i; Gote K 5a, B 5e / B: the Gote bishop on 3c instead. Sente hand G in both. `g@5e`. | `miss` 0.5, `move` 0.5. Miss: the bishop is 100% on 5e, the gold still in hand. Move: the gold on 5e, the bishop 100% on 3c, the hand empty. Quiet counter (the state had 0): committed core 0 after either outcome; with core Q8 (working tree) 1 after `miss` and 0 after `move`. |
| Q3 (uchifuzume in some possibilities) | A: Sente K 5i, G 2c; Gote K 1a, N 2a / B: the Sente gold on 3d instead. Sente hand P in both. `p@1b`. Also in play: Sente K 5i, G 2d, hand P; Gote K 1a, N 2a, P 9c; `2d-2c\|3d`, `9c-9d`, `p@1b`. | `miss` 0.5 (possibility A: pawn-drop mate), `move` 0.5. Miss: the pawn is still in hand and the gold is 100% on 2c. Move: the pawn is on 1b and the gold 100% on 3d. In play: the same `miss` 0.5 / `move` 0.5. |
| Q4 (pawn push onto a ghost) | A: Sente K 5i, P 5e; Gote K 5a, S 5d / B: the Gote silver on 4c instead. `5e-5d`. | `move` 0.5, `capture` 0.5 (no `miss`). Capture: the Sente pawn is 100% on 5d and Sente's hand holds a silver. |
| Q5 (capturing a promoted ghost part) | Gote to move. A: Sente K 5i, +R 2b; Gote K 5a, S 3a / B: the dragon on 2d instead. `3a-2b`. | `move` 0.5, `capture` 0.5. Capture: one possibility left, Gote's hand holds one `r` (certain). |
| Q6 (impasse game-end roll) | Gote to move. The S7 position without the silver on 4a, plus a Sente silver on 4c in A and on 4d in B (outside the zone); Sente hand R, B. `9i-8i`. | Two outcomes of 0.5: note `end:{"winner":0,"reason":"impasse"}` (the silver was in the zone: Sente wins) and note `end:null` (the game goes on, the silver is on 4d). |
| Q7 (splits never promote) | Sente K 5i, N 6e, N 3d, L 1e; Gote K 5a. | Knight 6e: exactly one split, `6e-7c\|5c`; afterwards both parts are unpromoted knights, 50% each. Knight 3d: **no** split (both targets force promotion). Lance 1e: `1e-1d\|1c`, `1e-1d\|1b`, `1e-1c\|1b` (never 1a). |
| Q8 (forced promotion of a ghost part) | Sente K 5i, L 1e; Gote K 5a. `1e-1d\|1c`, `5a-5b`, `1c-1a=+l`, `5b-5c`, then `1d-1a=+l`. | Codes from 1c: `1c-1a=+l`, `1c-1b`, `1c-1b=+l` (no `1c-1a`). `1c-1a=+l`: one outcome `move` p = 1, not rolled: `+l` 50% on 1a, `l` 50% on 1d. `1d-1a=+l` then moves onto its own promoted part, and the mover is `+l` after the move. **Working-tree and corrected core (Q14):** a join, one outcome `move` p = 1, not rolled: the lance is `+l` 100% on 1a, budget 1. **Committed core**, and a Q14 that compared the type before the move (`l`): a landing roll, `miss` 0.5, `move` 0.5. |
| Q9 (merge onto a third part with the other face) | Three possibilities, weight 1/3 each: Sente K 5i, Gote K 5a, and the Sente silver on 4d (`s`) / on 6d (`s`) / on 5c (`+s`). Sente to move: the merge `6d\|4d-5c`. | **Corrected core (Q13 checks `f1`, `f2` and `t`):** not in `legalMoves`, `branches` null; the only merge of the 4d and 6d parts is `6d\|4d-5e`. **Committed and working-tree core (Q13 checks only `f1`, `f2`):** legal, one outcome `move` p = 1, then 5c holds `s` 2/3 and `+s` 1/3 (two faces). |
| Q10 (join and faces) | A: Sente K 5i, S 5c; Gote K 5a / B: the silver on 6d instead. Sente to move. Also A': the piece on 5c is `+s` instead. | A / B: `6d-5c`: **working-tree and corrected core** one outcome `move` p = 1, the silver 100% on 5c (`s`); committed core `miss` 0.5, `move` 0.5. `6d-5c=+s`: `miss` 0.5, `move` 0.5 on every core (a Q14 that compared the type before the move would join it: `move` p = 1 and two faces on 5c). A' / B: `6d-5c`: `miss` 0.5, `move` 0.5 on every core; `6d-5c=+s`: **working-tree and corrected core** one outcome `move` p = 1 (`+s` 100% on 5c), committed core `miss` 0.5, `move` 0.5. |
| Q11 (impasse blocked by a ghost attacker) | Gote to move. The S7 position (Sente hand R, B) plus a Gote bishop on 8f in A (it attacks the Sente king on 5c along 7e, 6d) and on 8g in B (it does not). `9i-8i`. | Two outcomes of 0.5, in this order: `move` with note `end:null` (A: the king is attacked, no impasse) and `move` with note `end:{"winner":0,"reason":"impasse"}` (B). |
| Q12 (uchifuzume decided by a defender ghost) | A: Sente K 5i, G 2c; Gote K 1a, N 2a, R 7b / B: the Gote rook on 7e instead. Sente hand P. `p@1b`. | `miss` 0.5 (B: pawn-drop mate), `move` 0.5 (A: the rook can take the pawn along rank b). Move: the pawn on 1b, the rook 100% on 7b, and Gote's `7b-1b` has one outcome `capture` p = 1. Miss: the pawn still in hand, the rook 100% on 7e. |
| Q15 (one *Missed* outcome, two reasons) | Three possibilities, weight 1/3 each, Sente hand P in all. A: Sente K 5i, G 2c; Gote K 1a, N 2a, S 1b / B: the Gote silver on 4b instead / C: the silver on 4b and the Sente gold on 3d instead of 2c. Budgets 2 and 2. `p@1b`. | Per possibility: A the square is taken, B the drop would be a pawn-drop mate (1b is empty there), C it is legal (the king takes the pawn). Outcomes `miss` 2/3 (A and B), `move` 1/3 (C). Miss: the pawn still in hand, the gold 100% on 2c, the silver 50% on 1b and 50% on 4b (two possibilities left). Move: the pawn on 1b, the gold 100% on 3d, the silver 100% on 4b, Sente's hand empty. Same on every core. |
| Q16 (promotion in a link) | A: Sente K 5i, R 2h; Gote K 5a, S 2e / B: the Gote silver on 7e instead. `2h-2c=+r`, `5a-4a`, then `?2h`. | Codes to 2c: `2h-2c`, `2h-2c=+r`. `2h-2c=+r` and `2h-2c`: one outcome `move` p = 1 each (pass = link, not rolled); `2h-2e`: `move` 0.5, `capture` 0.5. After `2h-2c=+r`: 2c holds `+r` 50%, 2h `r` 50%, Sente budget 2. `?2h`: `2h` 0.5, `2c` 0.5; in `2h` the rook is `r` 100% on 2h and the silver 100% on 2e (they were linked). Same on every core. |

### 7.3 Move generator and invariants

Fairy-Stockfish was built from `handoff/ext/Fairy-Stockfish/src` in `handoff/tmp/shogi/fsrc` (`make -j build
ARCH=x86-64-modern largeboards=yes`); `fscheck.mjs` expects the binary there.

| # | Check | Result |
|---|---|---|
| P1 | Legal perft (pseudo-legal generation + "own king not capturable" filter, `perft.mjs`) from the start. | 30 / 900 / 25,470 / 719,731 at depths 1–4 (Fairy-Stockfish `perft.sh`: 719,731 at depth 4). |
| P2 | The "matsuri" position `l6nl/5+P1gk/2np1S3/p1p4Pp/3P2Sp1/1PPb2P1P/P5GS1/R8/LN4bKL w RGgsn5p 1` (many drops and promotions). | 207 / 28,684 / 4,809,015, identical with Fairy-Stockfish. |
| P3 | Depth 1 and 2 against Fairy-Stockfish for the S2–S10 positions and a middlegame with both hands (`fscheck.mjs`). | Identical everywhere except the two positions with a pawn-drop mate (S5 base and S5 d): there Fairy-Stockfish has exactly **one more** move at depth 1, the pawn-drop mate, which it generates as legal and scores as a loss; depth 2 is identical. The source reviews found the same for S5 (e') (78 against 77) and S5 (g) (158 against 157); S7 with the dragon and S11 are identical. |
| F1 | 120 random games of up to 150 plies with splits, merges, measures, drops and captures (`fuzz.mjs`): 16,477 plies, 2,623 splits, 417 merges, 461 measurements, 901 drops (49 missed), 1,386 captures, 386 promotions, up to 64 possibilities. | After every ply: weights sum to T; budget ≤ 8; at most 64 possibilities; solid pieces identical in every possibility; **both hands identical (ids, sides, types) in every possibility**; no promoted type in a hand; no unpromoted pawn or lance on its last rank, no knight on its last two ranks; no two unpromoted pawns of one side on a file; always 40 pieces; a finished game has no legal move. A two-faced piece (Q1) existed for 19 plies in one batch. About 0.06 s per game. |
| F2 | Engine review (`handoff/tmp/critic-shogi/fuzz.mjs`, 24 parallel workers, section 3 implemented from this spec): 3,040 random games of up to 150 plies, biased to promotions and quantum moves, on the committed core, the working-tree core, emulations of the plan's and the corrected Q13 / Q14, and the `measured` alternative: 386,333 plies, 67,241 splits, 17,901 merges, 21,559 measurements, 20,989 drops (687 missed), 20,114 promotions, 36,606 captures, up to 64 possibilities. | The F1 invariants, plus: at every ply, the pawn drop in front of the enemy king (when a pawn is in hand) is checked against an independent pawn-drop-mate test (every enemy reply from `generate`, **drops included**, applied with `applyClassical`): no mismatch in 126,740 checks (929 pawn-drop mates). The solid roll never fired (checked over all outcomes of every move played, 140,904 plies). Two faces on one square (counted per ply): 0 in 800 games with the corrected Q13 / Q14; 10 in 480 games on the working-tree core (one piece, created by a merge onto a third part, gap (b) of 3.2, and counted on each ply it lasted); 11 in 480 games with Q13 on `f1`, `f2` and a Q14 that compares the type before the move; 153 in 320 games on the committed core. With `measured: (m) => m.promo !== null` no piece ever had two types. |
| F3 | Engine review (`uchi.mjs`, 16 workers): 279,397 random positions around the enemy king, each side dropping. | `pawnDropMate` of section 3 agrees with the independent test in every position (3,262 pawn-drop mates). No enemy drop ever escaped (2.6); in 6,421 positions the only escape was capturing the dropper's king (S5 (e)). |
| F4 | Second engine pass (`handoff/tmp/critic-shogi/pass2/fuzz2.mjs`: F2's script and invariants; 24 workers; seeds 1–240 and 1001–1600): 240 games on the working-tree core and 840 on `pass2/quantum_fix.js` (the working-tree `quantum.js` with the exact Q13 correction of 3.2): 139,392 plies, 24,235 splits, 6,460 merges, 7,616 drops, 7,245 promotions, up to 64 possibilities. | Every F1 / F2 invariant holds; the pawn-drop-mate cross-check agrees in 44,672 checks (304 mates); the solid roll never fired. Two faces on one square: never with the correction; on the unpatched working tree one piece in one batch of 20 games (seeds 201–220), made by a merge onto a third part (`fuzz_why.mjs`), gap (b) of 3.2. With the correction the 145 tests of the core test files (`core*.spec.js`, `fuzz.spec.js`) still pass (`pass2/vitest.fix.config.mjs`). |

---

## 8. Review notes

Open questions (from the research, updated by the source review):

1. **Merges of a promoted and an unpromoted part** (3.2, change 1): decided by the core plan (Q13, Q14; both in the
   working tree); Q13 still needs the third-part correction (8.2). Alternative for the lead: make every uncertain
   promotion a roll (`measured: (m) => m.promo !== null`), which needs no core rule at all and keeps "one piece, one
   face" everywhere, at the price of a roll when a ghost promotes (the promotion then settles the ghost, as a
   landing does). The spec keeps per-possibility promotion, which the lead has accepted.
2. **Repetition:** resolved by the core plan: no repetition draw (`handoff/CORE-CHANGES.md` item 60), so the quiet
   rule plus the 500-ply limit stand, as a documented deviation. Perpetual check cannot be made a loss without a
   notion of certain check.
3. **Uchifuzume as a per-possibility miss** (4.4): the alternative "illegal if mate in any possibility" needs a
   cross-world legality hook in the core.
4. **Impasse rule:** lishogi's automatic 27-point rule, or the JSA professional 31-point declaration? The conditions
   are the same, only the threshold differs (2.7). The 24-point count by agreement cannot be automated.
5. **Kanji only?** Many new players cannot read the kanji. An international glyph set (letters such as K, R, B, G, S,
   N, L, P with a red "+" for promoted pieces, or pychess's pictograms) would need a display setting that `glyphOf`
   can read; the rules do not depend on it.
6. **Handicap games** (駒落ち, Gote moves first) are left out; they would be a `choice` option that removes pieces in
   `setup` and changes the side to move, which the core cannot do yet (the first mover is always side 0).
7. **Side names:** "Sente" / "Gote" (lishogi) or "Black" / "White" (pychess, Western books)? The spec uses Sente and
   Gote.

### 8.1 Source review

Reviewer 1 (lens: rules fidelity), 2026-09-25. Every classical rule was checked against the web pages and engine
sources below (fetched or read on that day), and the section 7 cases that depend on classical rules were re-run:
`prototypes/shogi/tests.mjs` (74 checks pass), `prototypes/shogi/fscheck.mjs` (identical to Fairy-Stockfish except
the known +1 in the two pawn-drop-mate positions), and the review's own scripts `handoff/tmp/rev1-shogi/verify.mjs`
(21 checks pass) and `handoff/tmp/rev1-shogi/fs.mjs` (Fairy-Stockfish perft on the changed positions).

Sources: Wikipedia "Shogi" (https://en.wikipedia.org/wiki/Shogi) and "Shogi strategy"
(https://en.wikipedia.org/wiki/Shogi_strategy); lishogi "Impasse" (https://lishogi.org/explanation/impasse); JSA
将棋対局規則 (https://www.shogi.or.jp/match/taikyoku_rules/); scalashogi (https://github.com/WandererXII/scalashogi,
commit 9a1c2c3, `src/main/scala/variant/Variant.scala`, `variant/Standard.scala`, `Impasse.scala`); Fairy-Stockfish
(https://github.com/fairy-stockfish/Fairy-Stockfish, commit 9f778da, `src/variant.cpp`, `src/piece.cpp`,
`src/position.h`, `tests/perft.sh`); pychess-variants (https://github.com/gbtami/pychess-variants, commit 315ea67,
`static/docs/shogi.md`).

**Changes**

1. **Test S5 (e) did not test its claim.** With the Gote rook on 5b, the rook can also take the dropped pawn along
   rank b (`5b-1b`), an ordinary escape, so the case passed without the "capturing the dropper's king is an escape"
   clause of 2.6. The rook is now on 5c (`7nk/9/4r2G1/9/9/9/9/9/4K4 b P 1`): the only Gote move to 1b is `1a-1b`
   (into the gold), and `5c-5i` takes the Sente king, so `p@1b` is legal. New control (e'), the Sente king on 4i:
   `p@1b` is illegal; Fairy-Stockfish has exactly one move more at depth 1 there (78 against 77: the drop mate), as in
   the other drop-mate positions. Source: scalashogi `dropFilterPawnCheckmate` (the pawn must attack the king and the
   opponent must have no legal reply).
2. **Test S7 (and Q6) played a classically illegal move.** In the S7 position the Sente rook on 9a checks the Gote
   king on 9i along the open file 9, and `9i-9h` stays on that file (leaving the king in check, 王手放置, a foul in
   JSA art. 10). The move is now `9i-8i`; Gote's legal moves are `9i-8h` and `9i-8i` (prototype and Fairy-Stockfish
   perft 2/386). The mirror position was given without a SFEN and played `1a-1b`, also staying in check from the rook
   on 1i: now `8K/9/9/9/9/9/4k4/1+p+p+p1+p3/2ss1ggbr b r4p 1` with `1a-2a`. Q6 uses `9i-8i` too. All expected
   results are unchanged (re-run in `verify.mjs`). Source: https://www.shogi.or.jp/match/taikyoku_rules/ (art. 10).
3. **Test S8 prose contradicted its SFEN.** The prose had the silvers and golds on swapped files (S 9a ... G 2a);
   the SFEN `GSGSGSGSK` and the prototype have G 9a, S 8a, ..., S 2a. The prose now follows the SFEN (the result is
   the same either way).
4. **Test S10:** added its SFEN (the one `fscheck.mjs` uses) and said that Gote ignores the check, which is allowed
   because this app has no check rule.
5. **Rules text (section 5) and 4.6:**
   - 4 and 4.6: the forbidden pawn drop must *attack* the king ("dropped to give an immediate checkmate"); a pawn drop
     that takes the king's last free square without giving check is legal. Sources: Wikipedia "Shogi" (Drops);
     scalashogi `a.piece.eyes(d, kingPos)`.
   - 7: the impasse points count only the pieces in the enemy camp plus the hand ("the pieces that are in your
     promotion zone and also all the pieces you have in hand"), rooks and bishops *promoted or not* count 5, the king
     0, and both numbers are minimums ("at least ten", "at least 28"). The old text ("rook and bishop 5, other pieces
     1, hand included") left out the promoted big pieces and read as if every piece on the board counted. Sources:
     lishogi "Impasse"; scalashogi `Impasse.scala` (`impasseValueOf`, `enteredRoles.sizeIs > 10` with the king).
   - 2: a dropped piece is unpromoted even in the enemy camp (Wikipedia: promotion is possible "but not if it is
     dropped into the zone").
   - 5: "the enemy's last three ranks" became "the enemy camp (the three ranks farthest from you)", the wording of
     Wikipedia ("the furthest one-third of the board") and of rule 7.
   - 8: "500 moves in total" now says both players' moves are counted (JSA 手数 counts each player's move; the core's
     `maxPly` counts plies), and that there is no separate repetition rule.
6. **Sources table, JSA row:** added the 2024-10-01 revision, the declaration rule's conditions (the same as
   lishogi's, 31 points instead of 28 / 27), the outcome of the 24-point count, that 500 手 are 500 plies, and the
   fouls 行き所のなき駒 and 王手放置. Source: https://www.shogi.or.jp/match/taikyoku_rules/.
7. **Sources table, pychess row:** the quotation now matches `static/docs/shogi.md` word for word (it says "black
   player" / "white player"; "(sente)" / "(gote)" were not in the source).
8. **King kanji (2.2, 6, Wikipedia row):** Wikipedia gives 王将 to the higher-ranked player or the champion and 玉将
   to the other; "Sente 玉, Gote 王" is the pychess convention, not a rule and not a general diagram convention. The
   choice is kept; the wording says where it comes from.
9. **Draw rules (1 item 3, 2.7, 3.2 change 2, 4.5, open question 2):** the quiet rule is now marked as an app rule
   that no shogi source has (Fairy-Stockfish `nMoveRule = 0`; nothing in scalashogi or the JSA rules). The optional
   repetition draw is marked as rejected by the core plan (`handoff/CORE-CHANGES.md` item 60). The quiet-counter
   wording follows the planned core change Q8 (only a pawn move or drop that really happened resets it).
10. **Impasse (2.7):** added that the conditions are those of lishogi's `Impasse.scala` and of the JSA declaration
    rule (threshold 31), and that lishogi tests "no legal move" before the impasse while this spec tests the impasse
    first; the orders differ only in a constructed position.
11. **Knight (2.2):** Betza `ffN` noted as XBetza `fN`, the string in Fairy-Stockfish `piece.cpp`.

**Checked and unchanged:** square names and orientation (USI / Hodges: file digit from Sente's right, rank letter
from Gote's side; Wikipedia, pychess); every setup square and the start SFEN (scalashogi `Standard.scala`); every
movement (Fairy-Stockfish `piece.cpp`: silver `FfW`, gold `WfF`, knight `fN`, lance `fR`, pawn `fW`, horse `BW`,
dragon = rook + ferz); promotion from, within or into the zone and forced promotion on the last rank(s) (scalashogi
`canPromote`, `forcePromote`; Wikipedia); the three drop restrictions (scalashogi `dropFilter`; Wikipedia); captured
pieces go to the hand unpromoted (`unpromoteRoleForHand`); no legal move loses whether in check or not (scalashogi
`status` / `winner`; Fairy-Stockfish `stalemateValue = -VALUE_MATE`); the 27-point impasse (lishogi page and
`Impasse.scala`: 10 other pieces, 28 / 27, 5 / 1 / 0, not in check, start of the turn); fourfold repetition and
perpetual check (JSA art. 8, Wikipedia); the 500-move rule (JSA art. 9); Fairy-Stockfish generating the drop mate
as a legal move (`position.h` `checkmate_value`); perft 719,731 at depth 4 (`tests/perft.sh`); Kaufman's values and
the YSS 7.0 hand factors of 1.12 to 1.25 (Wikipedia "Shogi strategy"). The classical positions S2–S8 were checked for
"side to move in check": only S7 (and its mirror) was, see change 2.

**Second pass** (reviewer 1 again, lens: rules fidelity, 2026-09-25, after the engine review 8.2). Every classical rule
of sections 1, 2, 5 and 7 was read again against the sources, fetched again that day: Wikipedia "Shogi"
(https://en.wikipedia.org/wiki/Shogi: promotion zone and path rule, compulsory promotion, the three drop restrictions
word for word, sennichite, 王将 for the "higher ranked player or reigning champion", the one-kanji abbreviations,
handicap: White moves first), Wikipedia "Shogi strategy" (https://en.wikipedia.org/wiki/Shogi_strategy: Kaufman and
YSS 7.0 tables), lishogi "Impasse" (https://lishogi.org/explanation/impasse: the seven conditions, the switch from
the try rule in July 2021), the JSA 将棋対局規則 (https://www.shogi.or.jp/match/taikyoku_rules/: dates 2024-06-07 /
2024-10-01 / 2025-01-01; art. 8 fourfold repetition and 連続王手; art. 9 the 24-point rule, the declaration rule
"玉を除いて10枚以上", 31 points, "手数が500手に達した場合は持将棋とする"; art. 10 the fouls), scalashogi
(https://github.com/WandererXII/scalashogi, commit 9a1c2c3, local clone `handoff/tmp/shogi/scalashogi`: `Standard.scala`
setup, `handRoles`, `promotionRanks`; `Variant.scala` `forcePromote`, `canPromote`, `dropFilterDoublePawn`,
`dropFilterPawnCheckmate`, `isInsufficientMaterial`, `status`, `winner`; `Impasse.scala`), Fairy-Stockfish
(https://github.com/fairy-stockfish/Fairy-Stockfish, commit 9f778da: `variant.cpp` `minishogi_variant_base` /
`shogi_variant`, `piece.cpp` Betza strings, `types.h` `DRAGON = BERS`, `position.h` `checkmate_value`) and
pychess-variants `static/docs/shogi.md` (https://github.com/gbtami/pychess-variants). Re-run: `fscheck.mjs` (unchanged:
identical to Fairy-Stockfish but for the known +1 in the drop-mate positions), `rev1-shogi/verify.mjs` (21 pass),
`critic-shogi/review.mjs` on the current working-tree core (186 pass), `tests.mjs` on a copy of the committed core
(74 pass; `handoff/tmp/rev1-shogi-2/committed/`), and the new `handoff/tmp/rev1-shogi-2/check.mjs` (19 pass, with
Fairy-Stockfish move counts). No rule of movement, setup, promotion, drops or impasse was wrong; the changes make the
text exact and close three test gaps.

1. **"No legal move" in capture-the-king terms (2.7, 4.5, new test S11).** Moves that leave the own king attacked are
   legal here, so a classical stalemate (every move exposes the king) is not "no legal move": the player must move
   into capture and the king is taken on the next move. The winner is the same as in lishogi (`winner`: Mate and
   Stalemate lose) and Fairy-Stockfish (`stalemateValue = -VALUE_MATE`), one move later. Only a blocked-in position
   (S8) is "no legal move". S11 shows it with a pawn drop, and also that such a drop is not uchifuzume. Source:
   scalashogi `status` / `winner`; Fairy-Stockfish perft 85 before and 0 after `P*2b`.
2. **Uchifuzume needs the pawn to attack the king (2.5, 2.6, S11).** 2.5 read as if every attacking drop but one
   were fine and did not say that a non-checking pawn drop that leaves no safe move is legal. lishogi tests
   `a.piece.eyes(d, kingPos)` before the "no legal reply" test; Wikipedia: "a pawn *may* be dropped to give an
   immediate check as long as it does not also result in checkmate". Sources: scalashogi `dropFilterPawnCheckmate`;
   https://en.wikipedia.org/wiki/Shogi (Drops).
3. **Gote's uchifuzume was untested (S5 (g), (g')).** Every drop-mate case was a Sente drop, so the Gote direction of
   "the square in front of `q`" (`orient(1, [0, 1])`) was never exercised. S5 (g) is the base turned for Gote:
   `p@9h` illegal, `g@9h` legal; Fairy-Stockfish has 158 moves against the prototype's 157, the extra one `P*9h`
   (Fairy-Stockfish generates the drop mate and scores it as a loss, `position.h` `checkmate_value`). Control (g'):
   without the gold the drop is legal.
4. **Promoted big pieces in the impasse count (S7, 2.7).** "Rooks and bishops, promoted or not, 5" was stated but not
   tested; S7 now also runs with a dragon on 9a and with a horse on 8a (same win). Source: scalashogi `Impasse.scala`
   `impasseValueOf` (`Bishop | Rook | Horse | Dragon => 5`); https://lishogi.org/explanation/impasse ("Rooks and
   bishops, promoted or not, count for 5 points each").
5. **Insufficient material (section 1).** The spec said lishogi's bare-kings draw "is covered by the quiet rule"; in
   fact it can never arise in shogi, since the 38 non-king pieces never leave the game (board or hand). Source:
   scalashogi `isInsufficientMaterial` (`hands.isEmpty && board.pieces.sizeIs <= 2`).
6. **Rules card (section 5).** Rule 5 said "A piece ... may promote"; the king and the golds never promote (Wikipedia:
   "A king or a gold general does not promote"; scalashogi `promote` returns `None` for them). Now "Any piece but
   the king and the golds". Rule 8 "A player with no legal move loses" became "A player who cannot make any move
   loses", so that players do not read it as the classical stalemate (change 1).
7. **Setup wording (2.3).** "Sente's bishop is on its left, Gote's rook is on Sente's left" became "each player has
   the rook on their own right and the bishop on their own left" (scalashogi `Standard.scala`: Sente B 8h, R 2h; Gote
   R 8b, B 2b).
8. **Test status (header, 7 intro).** `tests.mjs` passes its 74 checks only on the committed core: on the working-tree
   core it stops at Q1's committed-core merge `6d|4c-5c`, which Q13 now refuses (as Q1 expects there). The working-tree
   expectations are covered by `critic-shogi/review.mjs` (186 pass).

**Checked and unchanged in the second pass:** every square name, coordinate example and setup square; every
movement (Wikipedia prose and Fairy-Stockfish Betza); the promotion descriptor against `canPromote` / `forcePromote`;
the drop restrictions against `dropFilter` (nifu counts only an unpromoted pawn of the same side, since
`dropFilterDoublePawn` compares the whole piece); captured pieces unpromoted to the hand (`unpromote`); the impasse
conditions, 28 / 27, the king not in check, lishogi's order "no legal move" before impasse; the hand order R B G S N L
P (`handRoles`); the JSA row (dates, articles 8–10, 500 手 = 500 plies); the pychess quotation (`shogi.md` line 34:
"the king with a dot, 玉將 gyokushō, is the black player"); the Hodges notation (`P*5e`, `+` / `=`; pychess
`shogi.md`); Kaufman's values and the YSS 7.0 hand values (pawn 1.15, lance 4.80, ..., rook 12.70); ☗ / ☖ for Sente /
Gote; the classical rows S1–S10 (S1: 30 moves and 23 splits recounted by hand) and the classical parts of Q3, Q6, Q7,
Q11 and Q12 (reasoned square by square and run).

### 8.2 Engine review

Reviewer 2 of 2 (lens: engine and quantum consistency), 2026-09-25. Read against `handoff/IMPLEMENTING.md`,
`handoff/CONTRACT.md`, `handoff/CORE-CHANGES.md`, `docs/rules.md`, the core (`src/variants/core/quantum.js`,
`world.js`, `orthodox.js`, `variant.js`, `ai.js`) and the variant UI (`VariantBoard.vue`, `VariantPiece.vue`,
`glyphs.js`, `texts.js`, `panel.js`, `VariantGameView.vue`). The core and UI packages of the core plan landed in the
working tree **during** this review (Q8, Q13, Q14, U7, U16, U17 among others), so the spec now names three cores
(section 7 intro): committed (e0369f5), working tree, and corrected (working tree plus the Q13 correction below).

What was run (git-ignored scratch in `handoff/tmp/critic-shogi/`):

- `shogi.js`: the variant written from section 3 alone (not from the prototype), with the spec's promotion
  descriptor, drops, `pawnDropMate`, `impasse`, `onCapture`, `solidExtra`, `worldResult`, `noMoves`, `reasonText`.
- `quantum_q13q14.js`: the committed `quantum.js` with switches that emulate Q13 (none / on `f1`, `f2` / on `f1`,
  `f2`, `t`) and Q14 (off / type before the move / type after the move).
- `review.mjs`: every row of section 7 on the working-tree core, and the quantum rows also on the emulated
  committed, working-tree and corrected cores: 186 checks, all pass (`review-out.txt`).
- `fuzz.mjs` (and `fuzz_why.mjs`, which records the move that first creates a two-faced piece): 3,040 random games
  in up to 24 parallel workers (7.3 F2). `uchi.mjs`: 279,397 random positions for the pawn-drop-mate test (F3).
- The prototype's `tests.mjs` (74) and reviewer 1's `verify.mjs` (21) still pass; `ai.mjs` on the working-tree
  `ai.js`: 5 / 8 / 20 ms from the start and 4 / 84 / 233 ms in the middlegame (easy / normal / hard), and an 80-ply
  self-play ends without errors.

Verdict: the engine mapping is implementable with the hooks as built; nothing needs `generate` or `apply`. Every
quantum interaction of section 4 is decided and behaves as written on the real core: land = roll for every drop
(`isMeasured` treats drops first, so the budget fallback never applies to them), pass = link for lances (knights
jump and never link), the solid roll (never fires in shogi, checked), the game-end roll for the impasse (Q6, Q11),
the budget (hand pieces are in `projection` but identical in every world, so they never count), and the bound of 64
possibilities. One core correction and one UI text are needed (below).

**Changes**

1. **Header, 7 intro:** the engine-review re-run, and the three cores each expectation belongs to.
2. **Section 1:** the variants core has neither the classic "your king cannot escape" loss nor "draws wait while
   the king can be taken" (docs/rules.md 5, 6; core plan item 72 asks every spec to list it). A mated king is taken
   on the next move, and the quiet rule and the move limit end a game even when a king capture is available.
3. **Section 3 table:** added the plan's new hooks and why shogi needs none (no per-ply bookkeeping in `x`, drops are
   not `certain`), `handOrder` (U16) and the optional `codeText` (U17).
4. **Section 3, `worldResult`:** the sketch said "...default king test...". A custom `worldResult` replaces the
   core's default, so an implementation that leaves it out never ends the game on a king capture. The test is now
   written out. Added when the core calls it: with `mover = state.turn`, after every move, split, merge and Measure,
   per world in `settle` and on the first world in `stateAfter`, so the impasse is always tested for the side about
   to move and before "no legal move".
5. **3.2, change 1** was "optional, recommended"; the core plan made it Q13 and Q14, so it is now "required", and the
   review found two gaps, both proved on the core:
   - (b) Q13 checks the faces only on `f1` and `f2`; a merge of two unpromoted parts onto a **third part** that is
     promoted still gives two faces (new test Q9). In 480 random games on the working-tree core, the only two-faced
     piece came from exactly this move (`fuzz_why.mjs`).
   - (c) the plan's Q14 text says a join needs "the same type as the mover"; read as the type before the move,
     `6d-5c=+s` onto an unpromoted part joins and leaves two faces (new test Q10). The working tree compares the type
     after the move (`m.promo || b.ty[m.id]` in `moverOf`), which is right; the plan's text should say so.

   The exact semantics, the fallback (the two-faced piece stays legal and harmless) and a no-core-change alternative
   (`measured: (m) => m.promo !== null`, fuzzed: no piece ever had two types) are now in 3.2.
6. **3.2, UI items, and section 6:**
   - `VariantBoard.vue` has no per-square "Certain / Roll" badge: drop squares are marked as targets, and a drop that
     can miss opens the roll box. The old text promised the badge.
   - U7's drop miss text "Missed: the square was taken" is false for a pawn drop that misses because it would be mate
     in that possibility (Q3, Q12): core change 3.
   - U16 and U17 are named, the two-faced display is explained (`squareView` keys by piece, type and side; the board
     draws two occupants), and the promotion box, like the hands panel, draws its tokens unturned.
7. **4.2:** new bullet "one face per square": the merge refusal (Q13) and the join rule (Q14). Test Q8 now shows a
   join.
8. **4.3:** the one-occupant argument now names joins (Q14 lands only on the mover's own part) and drops.
9. **4.4:** the defender's ghosts count in the uchifuzume test (new test Q12). One *Missed* outcome can mix "square
   taken" and "would be mate" possibilities, so its text must not give a reason. A drop never falls back to a roll for
   the budget. The quiet counter is described per core.
10. **4.5:** the danger ring (board captures, converging captures with Q7), no "cannot escape" loss, the solid roll
    never fires (0 times over 140,904 plies, all outcomes checked), Q11 for an impasse blocked by a ghost attacker,
    the quiet rule per core (a capturing merge resets it).
11. **4.6, section 5 rule 5:** players meet the merge refusal ("Why can't I merge?"), so the card says "parts with
    different faces cannot merge". **Rule 8:** "that really happens" (core Q8, docs/rules.md 6: missed attempts do
    not reset the count).
12. **Section 7:**
    - intro: pieces in the same placement order in every possibility (`worldFrom` numbers them in order); the
      `stateOf` test helper has no hand argument and sets the orthodox `x` without `edit`; parts of a settling roll
      follow the order of the possibilities.
    - Q1: the main expectation is now Q13 (merge not offered, `branches` null, Measure `?6d`, the code of the part on
      the lowest square index, not `?4c`), plus a same-face control merge; the committed-core behaviour is kept.
    - Q2: the quiet counter after `miss` / `move` per core (0 / 0 committed, 1 / 0 with Q8).
    - Q8: the last step is a join on the working tree (`move` p = 1, `+l` 100% on 1a, budget 1).
    - New rows Q9 (merge onto a third part), Q10 (joins and faces), Q11 (impasse blocked by a ghost attacker: the
      game-end roll through condition 4) and Q12 (uchifuzume decided by a defender ghost).
    - 7.3: F2 (the review's fuzz with the independent pawn-drop-mate check, drops included) and F3.
13. **Open question 1:** now points to Q13 / Q14 and names the `measured` alternative for the lead.

**Checked and unchanged:** the promotion descriptor (`pushMove` handles `fromZone`, `optional`, `forced`), splits
and merges never promote (`quietTargets` and `mergesFrom` skip `promo`), a Sente knight on rank c or d cannot split
(Q7); `onCapture` (the victim keeps its id, changes side, loses its promotion; hands identical by id in every world,
checked on every ply); `pawnDropMate` (F3: 279,397 positions, no mismatch; "drops never escape" held in every one);
`impasse` and its game-end roll (Q6, Q11); `noMoves` runs after `worldResult`, `quiet` and `maxPly`; the default
`orient`; S1–S10 on the committed and the working-tree core; the rules card against sections 2 and 4; the layout
(labels at y −0.32 and x 9.3 lie inside the board's 0.7 padding and turn with the board for Gote; star points are
drawn after the cells; wood shade; the pentagon and its kanji turn with `spin`).

**Second pass** (reviewer 2 again, lens: engine and quantum consistency, 2026-09-25, after the second source pass).
Read again against the current working tree: `quantum.js` (the Q13 check sits in `perWorldMerge` and
`mergeCandidates`, which Q7's `mergeDanger` also calls; the first pass named `mergeBranches` and `mergesFrom`),
`world.js`, `variant.js`, `ai.js`, `texts.js`, `panel.js`, `glyphs.js`, `VariantBoard.vue`, `VariantPiece.vue`,
`VariantGameView.vue`, `handoff/CORE-CHANGES.md` (unchanged since the first pass: Q13 still names only `f1` and `f2`,
Q14 still says "the same type as the mover") and docs/rules.md. Scratch in `handoff/tmp/critic-shogi/pass2/`.

What was run:

- `review.mjs` on the current working tree (186 pass) and `rev1-shogi-2/check.mjs` (19 pass).
- `check2.mjs`: the second source pass's rows (S5 (g), (g'), the S7 dragon / horse rows, S11) on the review's own
  `shogi.js` instead of the prototype, including S5 (g)'s 157 moves and the classical legality of Gote's king moves
  in S7; and the new rows on four cores (committed emulated, working tree, corrected emulated, `quantum_fix.js`).
  78 pass.
- `quantum_fix.js`: the working-tree `quantum.js` with exactly the two changed conditions of core change 1 below.
  `review_fix.mjs` runs every row of `review.mjs` on it as a fourth core (224 pass); the 145 tests of `core*.spec.js`
  and `fuzz.spec.js` pass with `quantum.js` redirected to it (`vitest.fix.config.mjs`), as they do unpatched; the
  proposed core regression test `q13t.spec.js` fails on the working tree (`d4|f4-e4` is listed) and passes with the
  correction; `fuzz2.mjs` gives 7.3 F4.

Verdict: the engine mapping and every quantum decision of section 4 still hold on the current core. The three core
items below are still needed; none had landed (checked: `facesOf(state, X, [f1, f2])` and `[f, other]` in
`quantum.js`, the plan's Q14 wording, "Missed: the square was taken" in `texts.js`).

Changes of the second pass:

1. **Header, 7 intro:** the runs above, and the fourth core.
2. **Section 3, `reasonText`:** "impasse (27-point rule)" became "impasse by the 27-point rule". `resultText` already
   puts the reason in parentheses (`'{side} wins ({reason})'`), so the old text printed "Sente wins (impasse (27-point
   rule))", and the game-end note "The game ends: Sente wins (impasse (27-point rule))".
3. **3.2, change 1:** names the working-tree functions that hold the Q13 check (`perWorldMerge`, `mergeCandidates`;
   `mergeDanger` calls both, so the danger ring follows the correction without its own change) instead of
   `mergeBranches` / `mergesFrom`; says that gap (b) is still open; adds the evidence for the exact patch. The
   fallback's "cannot be measured" became "is never settled by Measure": when the piece has another part elsewhere,
   Measure is offered, but it settles only squares, and the two faces stay.
4. **3.2 UI items, section 6:** Q15 is the case behind core change 3, and the U7 text is still unchanged in the
   working tree. The shared rules card's castling and en passant sentence is irrelevant for shogi (optional change).
5. **4.2:** new bullet: a slide that a ghost blocks in some possibilities promotes only where it arrives (Q16).
   Promotion per possibility was tested only for a ghost part that is absent (Q1, Q8), not on the link path of
   `linkOrRoll`, where the idle worlds keep the old face on the from square.
6. **4.4:** Q15 cited for the mixed *Missed* outcome; a broken line joined.
7. **4.5:** Q7 is in the working tree, and a merge that Q13 refuses never counts in the danger ring. The quiet rule's
   "pawn" is an unpromoted pawn: a tokin's move adds 1, a promoting pawn move resets (S12). The default
   `resetsQuiet` (solid and not royal) gives exactly this, so the variant declares nothing.
8. **Section 7:**
   - intro: a Measure's outcomes are listed by square index; no rows named Q13 / Q14 (the plan's items); rows that
     set `quiet` or `ply`; with the helper's `edit`, `x` already is `{}` (the old text asked to set it); the fourth
     core.
   - Q1: the outcomes of `?6d` (each leaves one face, budget 1). 4.2 offers Measure as the way out of a refused
     merge; the row only said it was offered.
   - New S12: a tokin splits like a gold and does not reset the quiet counter; a promoting pawn move does.
   - New Q15: one *Missed* outcome made of a taken square and a pawn-drop mate on an empty square. It is the case
     behind core change 3 and had no row.
   - New Q16: promotion in a link.
   - 7.3 F4.

**Checked and unchanged in the second pass:** the engine mapping against the hooks as built (`pushMove` with
`fromZone`, `optional`, `forced`; `extraMoves`; `onCapture` with the capturer's `m.id`; `solidExtra`; `worldResult(b,
mover)` with `mover = state.turn`, called in `settle` and in `stateAfter` before `quiet`, `maxPly` and `noMoves`;
`defineVariant`'s `quietTypes` = {`p`}; `handOrder` through `sortHand` (U16); `codeText` (U17)); land = roll (drops
first in `isMeasured`), pass = link (`linkOrRoll` with the budget fallback), the join (`moverOf` compares the type
after the move), the solid roll (never fired in 139,392 more plies), the game-end roll (Q6, Q11), the budget (hands
are in `projection` but identical, so they never add an arrangement), the bound of 64 possibilities (reached, never
passed); `pawnDropMate` (44,672 more cross-checks); the one-occupant argument of 4.3 (a move that is not rolled lands
only on an empty square or on its own part, a rolled one keeps the worlds of one result, splits need certainly empty
squares, so no square ever holds two different pieces over the possibilities, and a capture takes the same piece in
all of them); the rules card (8 sentences; rule 5's "parts with different faces cannot merge" covers the corrected
Q13 too, since the part on the target is one of the parts that come together); the layout (`PAD` 0.7 and `rot` for
the 180° view, labels drawn last, star points clear of tokens, badges and target rings, at most two occupants per
square at 0.62 size, `spin` on the pentagon and its kanji, the hands panel and the promotion box unturned).

**Core changes needed** (status at the second pass: none has landed)

1. **Q13, include the target (correction; `quantum.js`).** A merge is refused when the moving piece X has more than
   one type over the worlds where it stands on `f1`, `f2` **or the target `t`**. In the working-tree code: in
   `perWorldMerge` (used by `mergeBranches` and `mergeDanger`), `facesOf(state, X, [f1, f2])` becomes
   `facesOf(state, X, [f1, f2, t])` (return null); in `mergeCandidates` (used by `mergesFrom` and `mergeDanger`),
   the loop over the common targets skips `t` also when `facesOf(state, X, [f, other, t]).size > 1`. Merges never
   promote, so this is exactly "X has one type on `t` after the merge". Tests: on the core test variant of
   `core-quantum.spec.js` (types `s` and `+s` with `KING_STEPS`), three worlds `d4` `s` / `f4` `s` / `e4` `+s`: the
   merges of `d4` and `f4` in `mergesFrom(d4)` are exactly `d4|f4-e3` and `d4|f4-e5`, `branches(d4|f4-e4)` is null
   (`handoff/tmp/critic-shogi/pass2/q13t.spec.js`); and shogi Q9. No other variant is affected.
2. **Q14, wording and a test (plan text only; the working tree is right).** `handoff/CORE-CHANGES.md` Q14 should say
   that the occupant must have the type the mover has **after** the move (`m.promo`, else its type), as `moverOf`
   does, and add shogi Q10 as a regression test: A / B silver on 5c (`s`) / 6d (`s`): `6d-5c` one unrolled `move`,
   `6d-5c=+s` rolled (`miss` 0.5, `move` 0.5); with `+s` on 5c: `6d-5c` rolled, `6d-5c=+s` one unrolled `move`.
3. **U7, a drop's miss text must not give a reason (`src/variantplay/texts.js`, `outcomeText`).** For a drop code,
   `miss` should read "Missed: the piece stays in hand" (or plain "Missed") instead of "Missed: the square was
   taken". In shogi a pawn drop also misses on a certainly empty square, in the possibilities where it would be a
   pawn-drop mate (Q3, Q12), and one *Missed* outcome can mix both reasons (Q15); the variant cannot override the
   text (the `outcomeText` hook was rejected, plan item 29). The neutral text is also right for crazyhouse and
   bughouse, where a drop misses only on a taken square.
