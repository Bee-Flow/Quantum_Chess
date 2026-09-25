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

(The rules review of 2026-09-25 fetched the chess.com pages, Wikipedia and the FIDE Laws and corrected this section
where needed; see 8.1.)

Every test case in section 7 was run on a prototype built on the real `src/variants/core`:

- `handoff/prototypes/fp/proto.mjs` (the variant);
- `quantum_fp.js` (a copy of `quantum.js` with the two proposed hooks of section 3.4);
- the scripts `t1.mjs` … `t13.mjs`.

(The engine review re-ran every case, and the cases it added, first on a copy of the core with the planned items of
`handoff/CORE-CHANGES.md`, then, in its second pass, on the core as implemented in the working tree; see 8.2.)

| Source | What it gives |
|---|---|
| **4pchess engine**, https://github.com/obryanlouis/4pchess (`board.cc`, `board.h`, `FENs_4PC_balanced.txt`, `ui/public/javascripts/index.mjs`), read in full for setup, pawns, castling and promotion | An engine for chess.com 4-player **Teams**. Its code shows: the 14 × 14 board minus 3 × 3 corners; the start position of every army (it matches the chess.com start FEN, see 2.3); the pawn directions and the double step from the second line; castling on both wings, the king moving two squares and the rook jumping over; Teams promotion on the 11th rank (`kRedPromotionRow = 3`, `kBluePromotionCol = 10`, `kYellowPromotionRow = 10`, `kGreenPromotionCol = 3`); piece values P 50, N 300, B 400, R 500, Q 1000; and board colours with a light square when `(row + col)` is even (row 0 = rank 14, so light when file + rank index is odd). En passant (`GetPawnMoves2`): an enemy pawn that has just double-stepped **onto the square in front of** a pawn may be taken on the square it skipped, which is diagonally in front of the capturer. This works until the double-stepper's owner moves again (one record per colour; chess.com's FEN, as parsed by 4pchess, also stores one en passant entry per colour), and it may also capture a piece standing on the skipped square. |
| chess.com, "4 Player Chess" terms page (https://www.chess.com/terms/4-player-chess) and Help Center "4 Player Chess (4PC)" (https://support.chess.com/en/articles/8614233-4-player-chess-4pc), fetched | "The board has 160 squares because three extra ranks are added to each side"; Red, Blue, Yellow, Green, "The game always starts with Red and follows in a clockwise order"; Free-for-all and Teams. **FFA:** "Pawns promote on your 8th rank"; "A pawn is automatically promoted to a queen. If captured, that queen only yields one point"; points: checkmate +20, stalemating oneself +20, capture P 1, N 3, B 5, R 5, Q 9, promoted queen 1. "When a player is checkmated or stalemated, all of their pieces become inactive and are grayed out", and "Capturing those pieces does not provide any points". "The game ends when three players are eliminated." Draws: "threefold repetition, insufficient material, or the 50-move rule" (+10 to every active player; the count of the 50-move rule for four players is not defined). **Teams:** "Your teammate is the player directly across from you on the board. You cannot capture your teammate's pieces."; "The goal of the game is to checkmate one member of the opposing team"; "Pawns promote on the 11th rank. For standard Teams matches, underpromotion is also possible"; "Stalemate results in a draw." Neither page describes castling or en passant. |
| chess.com blog "Everything you need to know about Zombies in 4 Player Chess" and the Fandom wiki "4 Player Chess" (https://chess-variants.fandom.com/wiki/4_Player_Chess), search extracts | A player who resigns or times out: the army becomes dead, and the king becomes a "zombie" that keeps moving at random. "Claim win" when two players are left and one leads by more than 20 points. |
| chess.com forum "4PC Variants List", search extract | En passant has been a standard rule of chess.com 4PC since 21 May 2019. |
| quadibloc.com "Four-Player Chess" (http://www.quadibloc.com/chess/ch0503.htm), search extract | The 160-square cross board (a centre of 64 plus four arms of 24). Each army stands in the usual order, turned to face the centre, with the king to the right of the queen. |
| Wikipedia "Four-player chess" (https://en.wikipedia.org/wiki/Four-player_chess, fetched); Wikibooks "Four-Player Chess/Notation" | The same board, colours and notation: files a–n, ranks 1–14, Red on ranks 1–2, Yellow on 13–14, Blue on files a–b, Green on files m–n. Wikipedia: "Play starts with red, and turns are clockwise"; FFA pawns promote "on the eighth rank, which is at the middle of the board", Teams "on the eleventh rank". |
| FIDE Laws of Chess (https://handbook.fide.com/chapter/E012023), fetched | En passant, article 3.7.3.1: "A pawn occupying a square on the same rank as and on an adjacent file to an opponent's pawn which has just advanced two squares in one move from its original square may capture this opponent's pawn as though the latter had been moved only one square." 3.7.3.2: only on the move following the advance. |

### Chosen rule set

**chess.com 4 Player Chess**, board, armies and moves exactly as chess.com, with **Free-for-all as the default** and
**Teams as an option**. It is adapted to Quantum Chess:

1. **There are no points.** Capture the king to eliminate a player. FFA: the last king standing wins. Teams: the first
   king captured loses for its team, as in chess.com Teams.
2. **An eliminated player's army leaves the board.** chess.com turns it into grey walls instead (see 4.2 for why).
3. **Promotion:** FFA on the 8th rank, Teams on the 11th rank, as chess.com. A free choice of Q, R, B or N in both
   modes; chess.com FFA auto-queens only because of its 1-point queen, which has no meaning without points.
4. **En passant: only the next player**, the move right after the double step, as in chess and in the rest of the
   app, and only with a pawn standing next to the double-stepped pawn (FIDE 3.7.3.1). 4pchess (and, judging by its
   FEN, chess.com) allows it until the double-stepper's owner moves again (see 2.5).
5. **Fair-share budget:** 2 per player while four are in the game, 4 with three, 8 with two (see 4.3).
6. **A player who cannot move:** in FFA, that player sits out (chess.com FFA eliminates a stalemated player and gives
   it 20 points, see 4.8); in Teams, the game is drawn, exactly as chess.com Teams ("Stalemate results in a draw").
7. **Draws:** 200 plies without a capture or a pawn move, the move limit, and (FFA) two lone kings. chess.com's
   threefold repetition is not used, because the variants core has no repetition rule (as in the other variants).

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
does in chess. This is the chess.com start position, in the 4PC FEN format that 4pchess parses (`ParseBoardFromFEN`;
fields: side to move, eliminated players, kingside and queenside castling rights per colour, points, half-move clock,
then the rows from rank 14 down to rank 1, `x` = a missing corner square):

```
R-0,0,0,0-1,1,1,1-1,1,1,1-0,0,0,0-0-x,x,x,yR,yN,yB,yK,yQ,yB,yN,yR,x,x,x/x,x,x,yP,yP,yP,yP,yP,yP,yP,yP,x,x,x/
x,x,x,8,x,x,x/bR,bP,10,gP,gR/bN,bP,10,gP,gN/bB,bP,10,gP,gB/bQ,bP,10,gP,gK/bK,bP,10,gP,gQ/bB,bP,10,gP,gB/
bN,bP,10,gP,gN/bR,bP,10,gP,gR/x,x,x,8,x,x,x/x,x,x,rP,rP,rP,rP,rP,rP,rP,rP,x,x,x/x,x,x,rR,rN,rB,rQ,rK,rB,rN,rR,x,x,x
```

(One string, wrapped here.) It is also 4pchess `CreateStandardSetup`, and it matches the table below square by square.

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
- Any pawn move that reaches the promotion line promotes, **including an en passant capture**. This can happen here,
  unlike in chess: after Red h2-h4, a Blue pawn on g4 takes en passant on h3, which is on Blue's FFA promotion file h
  (the key is `g4-h3=q` and so on).
- Pawns of other armies may wander into any arm after diagonal captures; the rules above still apply.

### 2.5 Special moves

- **Double step:** a pawn on its own second line may move two lines forward if both squares are empty.
- **En passant (chosen: next player only).**
  - After a double step, the square the pawn skipped is the en-passant square **for the next player only**, for one
    move. "The next player" is the next player in turn order who is still in the game. Any turn of that player ends
    the right: a move (also one that misses), a split, a merge, a Measure, and also a turn it sits out because it
    cannot move (FFA, 2.6; the core treats a skipped turn as an idle turn, CORE-CHANGES Q10). The last case hardly
    ever matters: the player after a skipped neighbour sits opposite, and its pawns can never stand next to the
    double-stepped pawn (see below). Only if that opposite player is out or sits out too could the other neighbour
    have used the right, and then it may not.
  - That player may capture en passant with a pawn that stands **next to the double-stepped pawn** (a rook step
    away) and can capture diagonally forward onto the skipped square. The pawn moves to the skipped square and
    removes the double-stepped pawn. This is FIDE 3.7.3.1 read from the double-stepper's side: the capturer is "on
    the same rank as and on an adjacent file to" the pawn that advanced, and takes it "as though [it] had been moved
    only one square".
  - The skipped square is always empty at that moment, so there is never a double capture.
  - Geometrically:
    - While the next player is a neighbouring army (always, unless a player is out or sits out), the
      double-stepped pawn stands **directly in front of** the capturer. After a Red double step, the capturer is a
      Blue pawn on the file just behind it (Blue e4 after f2-f4), exactly as in 4pchess.
    - When the two players in between are out or sit out (FFA), the next player is the **other** neighbour. The
      capturer then stands beside the pawn on the far side: after Red j2-j4, with Blue and Yellow out, a Green pawn
      on k4 takes on j3.
    - The rule would also allow the picture from chess (after Red f2-f4, a Yellow pawn on e4 or g4 takes on f3,
      when Blue is out). **It never arises in a game:** an opposite army's pawn cannot stand on the double-stepper's
      fourth line, because in FFA it promotes on the middle line first (Yellow pawns never go below rank 8) and in
      Teams nobody is eliminated. The rule needs no special case for it; the engine test with that hand-built
      position only checks that the filter is purely geometric.
    - A pawn that could reach the skipped square diagonally but is **not** next to the double-stepped pawn may not
      take en passant. Example: after Red f2-f4, a Blue pawn on e2 may not play e2xf3.
    - An en passant capture that lands on the capturer's promotion line promotes (2.4).
  - Examples:

    | Double step | En passant capture |
    |---|---|
    | Red f2-f4 | Blue e4xf3 |
    | Blue b10-d10 | Yellow d11xc10 |
    | Yellow j13-j11 | Green k11xj12 |
    | Green m5-k5 | Red k4xl5 |

  - Every pair was checked in the prototype, so each army can take en passant and be taken.
  - 4pchess keeps the right open for every opponent until the double-stepper's owner moves again, and chess.com
    seems to do the same (its FEN keeps one en passant entry per colour; its help pages do not describe en passant,
    which has been a standard 4PC rule since 21 May 2019). We use the ordinary chess rule, "only on the very next
    move", because:
    - the generic `orthodoxAfterMove` bookkeeping already works that way;
    - it rules out 4pchess's case of an en passant capture that takes two pieces;
    - it is the rule players know from chess and the rest of the app.
- **Castling:** both wings, on the side's own back line (a file for Blue and Green). The king moves two squares
  towards the rook, and the rook lands on the square the king crossed. Conditions:
  - neither piece has moved;
  - every square strictly between them is empty.
  - In Quantum Chess both conditions must hold in **every** possibility, and castling never rolls (docs/rules.md 5;
    see 4.4).
  - 4pchess forbids castling while the king or the square it crosses is attacked (chess.com's pages do not describe
    castling). There is no check in Quantum Chess, so castling out of, through or into attack is allowed, as in the
    other orthodox variants.

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
- **A player who has no legal move** (no move, merge or measure in any possibility):
  - **FFA:** sits out that turn, and the turn passes to the next player who can move. If nobody can move, the game
    is drawn.
  - **Teams:** the game is drawn at once, as in chess.com Teams ("Stalemate results in a draw").
  - As on chess.com, this is checked only when that player is to move.
- **Draws:**
  - 200 plies in a row (all players together; 50 moves each while four play) without a capture or a pawn move.
    chess.com names a 50-move rule but does not define its count for four players. As in docs/rules.md 6, only a
    capture or pawn move that really happened resets the count; a missed pawn move or a failed capture does not;
  - the move limit of 1200 plies in total;
  - **FFA, two lone kings:** only two players are left, the board holds nothing but their two kings (in every
    possibility), and the kings are not next to each other. Neither king can ever be forced to step next to the
    other (checked for every pair of squares of this board), so nothing can happen any more. This is the
    "insufficient material" draw of chess.com and the "bare kings" draw of classic Quantum Chess. With three or
    more lone kings, or in Teams, two kings can still trap a third, so the game goes on;
  - agreement (pass & play).
  - There is no repetition draw (chess.com has threefold repetition; the variants core has no repetition rule).
  - A drawn game is shared by the players still in it; eliminated players have lost.
- **No check.** As everywhere in Quantum Chess you may leave your king attacked. The king danger line shows the risk
  (4.7).

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
| `topology` | `rectTopology(14, 14, { exists, noLabels: true, layout: { labels } })`, with `exists = (f, r) => !((f < 3 \|\| f > 10) && (r < 3 \|\| r > 10))`. No `shade` option: the default shading is the one of section 6. Labels: section 6. |
| `types` | `orthodoxTypes({ lastRank: () => false })`, then new values and a new pawn `promote`: `p.promote = { zone: (side, to, from, w) => progress(side, to) === (w.x.teams ? 10 : 7), to: ['q', 'r', 'b', 'n'] }`, where `progress(side, sq)` is `[y, x, 13 − y, 13 − x][side]` of the square (0 = own back line). |
| royal / solid / splittable | royal: `k`; solid: `k`, `p`; splittable: `q`, `r`, `b`, `n` (and promoted pieces) |
| `value` (AI) | K 400 (the `orthodoxTypes` value; `normaliseType`'s default would be 100), **Q 1000, R 500, B 450, N 300**, P 100. See the notes below the table. |
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
  - **En passant promotion.** `pawnExtras` pushes its en passant moves without promotion (in 8 × 8 chess they never
    reach the last rank). Here they can (2.4), so re-emit every move with `kind === 'ep'` through
    `pushMove(V, w, out, m.id, m.from, m.to, m.capture, 'ep')`, which expands it into `=q/r/b/n` on the promotion
    line and keeps the kind `ep`. Without this, `g4-h3` after Red h2-h4 leaves an unpromoted Blue pawn on its
    promotion file for good (checked on the core as built: `pawnExtras` still pushes `ep` moves without promotion;
    test T5). Not needed once the core does it (8.2, core changes).
  - Castling: `castlingMoves(V, w, side)` from orthodox.js (W3, in the core: it works along any straight line, so
    also along Blue's and Green's files). For each right of `side`, the king and a rook of `side` must stand on
    `c.king` and `c.rook`, and every square the king and the rook cross or land on must be empty; with the rights of
    3.2 that is exactly "every square strictly between them". It emits `{ key: 'O-O' | 'O-O-O' (flag K | Q), from:
    c.king, to: c.kingTo, id: king, capture: -1, promo: null, drop: null, kind: 'castle', extra: { rook: { id: rook,
    to: c.rookTo }, kingTo } }`, and `applyClassical` moves the rook. All eight castlings of T4 pass with it.
  - Keep the kinds `ep` and `castle`: the core's certain-move rule (`isCertain`, CORE-CHANGES Q2) recognises them by
    kind.
- **`filterMoves(w, side, list)`:**
  - **En passant geometry (both modes):** drop every move with `m.kind === 'ep'` whose `from` is not a rook step away
    from `w.x.epVictim` (`|dx| + |dy| !== 1`). `pawnExtras` offers en passant to every pawn that can capture
    diagonally onto the skipped square, which on this board includes a perpendicular pawn diagonally behind it (Blue
    e2 after Red f2-f4); 2.5 allows only the pawn next to the double-stepper.
  - **Teams** (`w.x.teams`): drop every move with `m.capture >= 0` whose victim is a partner
    (`w.sd[m.capture] % 2 === side % 2`). A slider stops in front of its partner's piece, because `pieceMoves`
    breaks at the first occupied square.
  - The generic `royalDanger` uses `generate`, which is filtered. So a partner never counts as a danger to your king.
- **`afterMove(next, m, prev)`:**
  1. `orthodoxAfterMove(V, next, m)` (W3, in the core). It does two things:
     - **en passant square:** after `m.kind === 'double'`, `next.x.ep` is the midpoint of `from` and `to` in every
       coordinate (so also for Blue's and Green's horizontal double steps) and `epVictim = m.to`; after any other
       move both are −1;
     - **castling rights:** it drops every right whose `king` or `rook` square equals `m.from` or `m.to`.
  2. **Elimination (FFA only):** if `m.capture >= 0 && prev.ty[m.capture] === 'k' && !next.x.teams`, then with
     `victim = prev.sd[m.capture]`:
     - `placePiece(next, id, OFF)` for every piece id of `victim` that is still on the board;
     - drop `victim`'s castling rights (step 1 already drops the rights of that king's square; this keeps `x` small
       and identical in every world either way).
- **`applyMiss: (b) => clearEnPassant(b)`** (CORE-CHANGES Q1 + W4): in every world where the played action did not
  take effect (a missed or linked move, an idle split child, a Measure, and a skipped turn, action type `pass`), the
  en passant right ends too. So `x.ep` is the same in every world, and the right lasts exactly one turn of the next
  player (2.5, D2).
- **`unifyWorlds: (bs) => unifyCastling(bs)`** (CORE-CHANGES Q3 + W5): a castling right survives only if every world
  of the new state still has it, which is docs/rules.md 5 "lost as soon as the king or that rook is not 100 % on its
  starting square". The rights have exactly the `{ flag, side, king, rook, kingTo, rookTo }` shape `unifyCastling`
  compares.
- **`isOut(b, s)`:** `!hasRoyal(V, b, s)`. The generic `nextSide` skips such sides. Elimination is always certain (4.1),
  so reading `worlds[0]` is exact.
- **`budgetRule(b, side)`** (CORE-CHANGES Q6): Teams `{ limit: 2 }`; FFA `{ limit: [8, 8, 8, 4, 2][kings] }`, where
  `kings` is the number of sides with a king in `b` (4 → 2, 3 → 4, 2 → 8; see 4.3). The core evaluates it on
  `state.worlds[0].b`, which is exact because the players in the game are certain.
- **`passWhenStuck: (state) => !state.worlds[0].b.x.teams`** (CORE-CHANGES Q10, function form): a stuck player sits
  out in FFA, and the core's default `noMoves` draw applies in Teams (2.6). Not `passWhenStuck: true`: a flag also
  applies in Teams, where S1 would then give Blue to move instead of the draw (checked).
- **`recordInfo(prev, code, branch, next)`** (CORE-CHANGES Q9), FFA only (in Teams the result says it): the sides
  with a king in `prev.worlds[0].b` and none in `next.worlds[0].b`, as `{ out: [sides] }`, or null.
  **`infoText(record, viewer) -> string[] | null`** (U9) turns `record.info.out` into one line per side,
  `t('quantumchess', '{side} is out', { side: sideName(V, s) })` ("Blue is out"), and returns null without it. The
  line for a skipped turn comes from the generic `record.skipped` (Q10, U9: "Red cannot move and sits out").
- **`sideInfo(state, side, viewer)`** (U6, the short text in a player row): FFA, a side that is out:
  `{ text: t('quantumchess', 'out') }`; Teams: `{ text: t('quantumchess', 'with {partner}', { partner: sideName(V,
  (side + 2) % 4) }) }`; otherwise null. See 6.
- **`resignResult(state, loser)`** (CORE-CHANGES U12): Teams `{ winner: null, winners: the other team, reason:
  'resign' }`; FFA: the other players **still in the game** (`!isOut`) win together, or `{ winner, reason: 'resign' }`
  when only one is left. The core default would also list players who were already eliminated as winners.
- **`worldResult(b)`:**
  - **Teams:** if some side has no king, the result is
    `{ winner: null, winners: loser % 2 === 0 ? [1, 3] : [0, 2], reason: 'king' }`.
  - **FFA:**
    - exactly one side has a king: `{ winner: that side, reason: 'king' }`;
    - exactly two sides have a king, no other piece is on the board, and the two kings are not a king step apart:
      `{ winner: null, reason: 'bareKings' }` (2.6);
    - otherwise `null`.
- **`reasonText(reason)`:** `'quiet'` → `t('quantumchess', '200 moves in a row without a capture or a pawn move')`
  (the generic text says "50 moves"); null for everything else. `'bareKings'` uses the generic text of CORE-CHANGES
  U7, "only the two kings are left", which is exact here and keeps the lower-case style of the result sentence
  ("Draw (only the two kings are left)"). Teams `'noMoves'` is the generic "no legal move" draw.
- **`evaluate(b, side)`** (computer player):
  - **King exposure:** −1500 if `side`'s king is attacked in `b` (`attacks(V, b, e, kingSq)`) by any side `e` that is
    an enemy (in Teams: `e % 2 !== side % 2`) and still in the game.
    - Why: the generic search only looks at the reply of the *next* player. Players two and three moves later also
      get to capture before you move again, and losing the king loses the whole army.
    - The world weights turn this into "−1500 × probability".
  - **Material corrections.** `ai.js` `worldValue` is `own − (sum of the material of every other side) / 3`: it
    divides by the number of enemy sides, eliminated ones (0 material) and, in Teams, the partner included. With
    `mat[s]` the material of side `s` over its pieces on the board (type values of 3.1):
    - **Teams:** add `(4 × partner − 2 × (enemy1 + enemy2)) / 3`. The total becomes
      `own + partner − enemy1 − enemy2`.
    - **FFA:** add `E / 3 − E / k`, where `E` is the material of the other sides and `k` the number of other sides
      still in the game (the term is 0 while all four play, since `k = 3`; add 0 when `k = 0`, which only happens in
      a finished game). The total becomes `own − E / k`, the average over the enemies still in the game. Without it,
      with two players left a captured enemy queen counts +333 and a lost own queen −1000 (checked with
      `evaluateState`), so the computer undervalues every capture in the endgame.
    - Both formulas assume the divisor 3 of today's `worldValue`. If the core changes it to "enemies still in the
      game" (8.2, core changes), drop the FFA term; the Teams term stays (all four are in while Teams runs).
  - Optional: cache the per-world term in a `WeakMap` keyed by the world.
- **`options`:** above. No `measured`, `drops` or `hidden` hooks.

### 3.4 Core hooks this spec relies on

The research proposed three hooks here (`budgetLimit(world)`, `passWhenStuck(state)`, `resign(state, side)`) and an
optional `enemies(a, b, w)`. The core plan (`handoff/CORE-CHANGES.md`) serves them as follows, and at the time of the
engine review's second pass every item in this table was implemented in the working tree (not yet committed) and
checked with the section 7 case named in the last column; 3.3 uses these names.

| Research proposal | Core item | Use in this variant (test) |
|---|---|---|
| `budgetLimit(world)` | Q6 `budgetRule(b, side) -> { sides?, limit? }`, export `budgetInfo(V, state, side)` | `{ limit }` only (per-player budgets); `budgetInfo` feeds the pips (U5) and the fuzz invariant (Q1, Q3, Q4, Q11, F1) |
| `passWhenStuck(state)` | Q10 `passWhenStuck` (`true` or a function of the new state; a skipped turn is an idle turn) | the function form (S1, S2, S3) |
| `resign(state, side)` | U12 `resignResult(state, loser)` (result only) | 3.3; elimination by resignation in FFA pass & play is rejected by the plan, so resigning ends the game (R1) |
| `enemies(a, b, w)` | rejected | Teams stays in `filterMoves` and the `evaluate` correction (T9, P1-P4) |
| (not proposed) | Q1 `applyMiss`, W4 `clearEnPassant` | en passant expiry (Q10, S3) |
| (not proposed) | Q2 certain moves (`castle`, `ep`), `isCertain` | castling and en passant never roll (Q7, T5) |
| (not proposed) | Q3 `unifyWorlds`, W5 `unifyCastling` | castling rights follow the state (Q8, Q9) |
| (not proposed) | Q7 converging captures in `royalDanger` | king danger (P3) |
| (not proposed) | Q9 `recordInfo`, U9 `infoText` and the `skipped` line | "Blue is out", "Red cannot move and sits out" (T7, S2) |
| (not proposed) | U6 `sideInfo`, U7 generic `bareKings` text, U11 option line | players panel and texts (6, T11) |
| (not proposed) | W3 `castlingMoves` along a line, `orthodoxAfterMove` midpoint | castling and the en passant square (T4, T5) |

- **Why the budget rule is needed:** see 4.3. Without it, one pair of players can use up the 64-world cap
  (demonstrated in `t6.mjs`).
- **Why `passWhenStuck` is needed:** no variant hook can skip a turn, because `nextSide(b, side)` sees one world and
  cannot know the quantum legal moves. Without it, the core ends an FFA game in a draw. That is acceptable only
  because it is extremely rare: every piece, including the king, must be blocked in every possibility.
- **What the variant does itself:** the en passant promotion (3.3 `extraMoves`), until the core's `pawnExtras` does
  it, and the FFA material correction (3.3 `evaluate`), until `worldValue` averages over the enemies still in the game
  (8.2).

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

This includes converging captures (a merge onto a king), which are certain when both paths are certainly clear and
rolled otherwise (test Q6), and captures by a ghost part (50 % part → 50 % roll).

More generally, **which pieces are on the board is the same in every possibility**; only where the ghosts stand
differs. Two facts of the generic core give this:

- **Every capture is settled at once.** An ordinary capture lands on an occupied square (a roll when uncertain), a
  merge onto a square where another side's piece might be is rolled, and en passant is certain (4.4). So in the
  outcome that is played, the move captures in every possibility or in none.
- **A square never holds two different pieces in different possibilities.** A move that lands where another piece
  might be (counting also the possibilities where the mover is elsewhere) is in the measured class, so the outcome
  that is played never mixes possibilities where the target was empty with ones where it was taken; split targets
  must be certainly empty; a merge target may not hold your own piece, and a merge onto a square where another side's
  piece might be is rolled. So a square holds one fixed piece or nothing, and a capture there takes the **same**
  piece in every possibility where it captures.

An elimination then removes the same army everywhere. That is why the FFA `bareKings` draw (no piece but two kings,
kings not adjacent) and the last-king win never differ between possibilities, and the game-end roll is never needed
(4.6). Both facts are fuzz invariants (F1).

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
  - a move that would be a quantum pass = link is settled by a roll instead ("Roll (budget full)", test Q4);
  - measure and merge free budget;
  - opponents can never use up your budget.
- The 4-location limit is unchanged, but with a budget of 2 a piece cannot have more than 2 parts until a player is
  out.
- It also keeps the computer fast: at most 16 worlds × 160 squares while the board is full. On the core as built, the
  computer took at most 64 ms per move (normal and hard, FFA and Teams, the first 40 plies, with the evaluate terms
  of 3.3; `aitime2.mjs`, 8.2), and whole random games averaged about 16 ms per ply (12 processes in parallel, a
  third of the plies listing every split, up to 64 worlds late in the game, with the checks of F1).
- The bound 2^4 = 16 holds because a world is fixed by the four arrangements plus `x`, and `x` is the same in every
  world: the mode is constant, `applyMiss` keeps the en passant square equal and `unifyWorlds` the castling rights
  (3.3). The engine review's fuzz (F1, 8.2) checked all of this on the core as built: never more than 16 worlds while
  four kings stand, never over a limit, `x` identical in every world.

### 4.4 Pawns, promotion, en passant, castling

Nothing new, only the generic rules (docs/rules.md 4 and 5, the lead's decisions D1 and D2 in CORE-CHANGES.md) on
this board:

- Pawns are solid, so every pawn move is settled at once (a roll if needed).
- A pawn promotes only if it really reaches its promotion line, also by en passant (2.4).
- A double step blocked by a ghost is Moved or Missed. The en passant square exists only in the possibilities where
  the double step happened, and the roll has already settled that (test Q5).
- **En passant is always certain.** It is legal only when it is possible in **every** possibility, and then it
  captures in every possibility, without a roll. After the roll that settled the double step this is always the
  case, so in practice it is offered exactly when the next player has a pawn next to the double-stepped pawn.
- **The right lasts one turn of the next player in every possibility.** Whatever that player does (a move, also one
  that misses or links, a split, a merge or a Measure), the right is gone afterwards everywhere (`applyMiss`,
  test Q10). A turn the player sits out ends it too (2.5; the core passes a skipped turn through `applyMiss`, test
  S3).
- **Castling never rolls.** It is legal only when the king and that rook stand on their start squares and every square
  between them is empty in **every** possibility (a ghost part on one of them blocks it); then it happens everywhere
  (test Q7). Out of, through or into attack is allowed.
- **A castling right follows the whole state.** It is lost in every possibility as soon as, after a move, the king or
  that rook is not 100 % on its start square: moved, split, captured, or only partly moved by a pass = link slide.
  Merging back or a later measurement does not restore it (test Q8). A king or rook move that **Missed** after a roll
  keeps the right, because the piece never left (test Q9).

### 4.5 Teams and the partner's pieces

- You can never capture your partner's pieces. They block your slides like your own pieces do.
- A move that **lands** on a square where your partner's piece **might** stand is a roll: **Missed** where it stands
  there, Moved (or Captured) elsewhere (test P1).
- A slide that **passes** such a square links your piece to the partner's piece without a roll (test P2), as with any
  other piece.
- Split targets must be certainly empty, so a partner's ghost part also blocks a split.
- A merge onto a square where the partner might be is allowed, but it is rolled (Missed where the partner is; test
  P4). The core refuses a merge target only when it might hold **your own** piece.
- You can only measure your own ghosts, not your partner's.
- King danger counts only the two enemies, also their converging captures (test P3).
- Budgets stay per player (2 each); a partner's ghosts never use up yours.

### 4.6 Game end: first king (Teams), last king (FFA)

- A king capture is always certain after its roll (4.1). The game-end roll is therefore never needed as a separate
  step, but it stays as a safety net.
- **FFA:** capturing the second-to-last king wins, and the winner's army is left alone on the board.
- **Teams:** the first captured king ends the game for both teams.

### 4.7 King danger

King danger (`royalDanger`; the variants UI shows it for the viewer's king as the line "Your king is in danger: …"
and a mark on the king's square, where classic Quantum Chess draws a ring) is the chance that **any** enemy player
could capture your king with one move right now. With three enemies, a king can be lost to a player who moves two or
three turns after you. Players must watch all three, and the computer's evaluate term (3.3) does that too.

- The core's `royalDanger` loops over every enemy that is still in the game (not only the next player), takes the
  largest chance of any single enemy move, and reads the Teams filter through `generate`.
- It also counts converging captures (merges), as docs/rules.md 5 says (CORE-CHANGES Q7, in the core): per enemy,
  whoever is to move, and through the same filtered generation, so a partner's merge never counts either (test P3).
  Nothing variant-specific is needed.

### 4.8 A player who cannot move

Without check, a player is stuck only if every piece is blocked in every possibility: no ordinary move, no merge and
no measure. This is extremely rare; for example, in Teams your army is walled in by your partner's pieces (test S1),
or in FFA your pawns are blocked head-on and your other pieces box each other in (test S2).

**Decision, FFA:** that player sits out, and the next player who can move is to move. There is no elimination and no
points, which keeps "only a captured king eliminates" true.

- chess.com FFA eliminates a stalemated player (its pieces turn grey) and rewards it with 20 points ("stalemating
  oneself +20"). Without points, being eliminated would be a loss, the opposite of chess.com's intent.
- A stuck player's king can still be captured.
- If no player can move, the game is drawn.

**Decision, Teams:** the game is drawn, as chess.com Teams ("Stalemate results in a draw"). This is the core's
default `noMoves` result: `passWhenStuck` is a function that returns false in Teams (3.3).

### 4.9 Summary for players

"Capture a king and that player is out, together with all their pieces, ghosts included. Each player may keep one
50/50 ghost while all four play; the budget grows as players drop out."

---

## 5. Player-facing rules text (rules card)

- Four armies take turns clockwise: Red, Blue, Yellow, Green. The board is 14 × 14 squares without its four 3 × 3
  corners.
- Pawns walk towards the opposite side. In free for all they promote on their 8th rank, just past the middle of the
  board; in Teams, on their 11th rank. A pawn becomes a queen, rook, bishop or knight.
- Castling works as usual for every army. A pawn that has just moved two squares may be taken en passant only by the
  next player, with a pawn standing next to it.
- Free for all: capture a king and that player is out. Their whole army, ghosts included, leaves the board. The last
  king standing wins.
- Teams: Red and Yellow play against Blue and Green. Your partner's pieces block you like your own and cannot be
  captured. The first king captured loses the game for its team.
- The possibilities are shared fairly: each player's budget is 2 while four players are in the game, 4 with three and
  8 with two.
- A player who cannot move sits out in free for all; in Teams, the game is drawn. 200 moves in a row (all players
  together) without a capture or a pawn move is a draw, and so are two lone kings.

---

## 6. UI layout

- **Cells.** Square cells, 1 × 1 layout unit. Cell of `(x, y)`: `x = x`, `y = 13 − y`: Red at the bottom, Blue on
  the left, Yellow at the top, Green on the right.
  - The layout is 14 × 14 units. The four 3 × 3 corners are simply not drawn: no cells, and no `areas`, so the page
    background shows through and the cross shape reads at a glance.
- **Shades.** Following the 4pchess UI (a chess.com look): **light when `x + y` is odd**, dark when even. So d1 is
  light and k1 dark. (The prototype `proto.mjs` has it the other way round; follow this text. The `rectTopology`
  default, dark when `x + y` is even, already gives this, so no `shade` option is needed.)
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
  - An eliminated player is greyed out and struck through (the existing `qc-vgame__player--out` class, read through
    `isOut`), and its row shows the word "out" from the variant's `sideInfo` (3.3, U6).
  - Budget pips: the core's panel already shows **`budgetInfo(V, state, side).limit`** pips (2, 4 or 8), not a fixed
    8, with `used` filled (CORE-CHANGES Q6 + U5), tooltip "Quantum budget: {used} of {max}". Nothing to do in the
    variant.
  - Teams: the rows stay in turn order (the UI has no row grouping, and none is planned); each row shows its partner
    through `sideInfo`, "with Yellow" on Red's row and so on.
  - When the only human player is out (FFA against the computer), the three computers play on, about one move per
    0.3 s. The human can watch, or press Resign, which ends the game with the players still in it as winners
    (`resignResult`, test R1).
- **Move list and notes.** A capture that eliminates should say so, for example "Blue is out": `recordInfo` stores
  `{ out: [1] }` on the record and `infoText` turns it into that line (CORE-CHANGES Q9, U9; 3.3). A skipped turn
  (FFA) says "Red cannot move and sits out", from the generic `record.skipped` (Q10, U9).
- **Game info.** The mode is shown as a game-info line through the option's label (CORE-CHANGES U11).
- **New game dialog.**
  - Mode: "Free for all" or "Teams".
  - "You play" offers the four colours; the other three are computers (in Teams, your partner too).
  - Pass & play makes all four human.
  - Nice to have: a Human / Computer choice per seat, for example two humans against two computers in Teams.
- **Size.** 160 cells: on a phone the board is dense. Keep the existing zoom (ctrl + wheel, pinch) enabled.
- **No promotion lines** are drawn. The line depends on the mode, so it would need a `layoutOf(state)` that reads
  `x.teams`; that is not worth it, because the move preview already offers the promotion choice.

---

## 7. Test cases

- Helper: `stateOf(V, worlds, turn, edit)` with `edit = (b) => { b.x = { teams, ep: -1, epVictim: -1, castle: [] } }`.
  A case that names no mode is FFA (`teams: false`).
- Default kings: `K4 = { h1: '0:k', a7: '1:k', g14: '2:k', n8: '3:k' }` (sides 0–3 = Red, Blue, Yellow, Green).
- In a state of several worlds, write the pieces in the same order in every world (for example `{ ...K4, d4: '0:q',
  c6: '1:n' }` and `{ ...K4, j4: '0:q', d8: '1:n' }`): `worldFrom` numbers the pieces in that order, and a ghost's
  parts must have one id.
- "Outcomes" lists `key p`. All results below were produced by the prototype (`handoff/prototypes/fp/t1`–`t13.mjs`), with
  the two proposed hooks where stated. The cases added or changed by the rules review (T5 "only a pawn next to" and
  "head-on", T11, S1, S2) were run on a copy of the prototype with the en passant filter, the `bareKings` result and
  the mode-dependent hook 2 (`handoff/tmp/fp-rules-review/r1`–`r3.mjs`, not committed).
- The engine review re-ran **every** case of this section, including the ones it added or changed (T5, T7, Q1, Q3,
  Q6–Q10, P3, S1, S2, F1), on a copy of `quantum.js` with the planned CORE-CHANGES items Q1, Q2, Q3, Q6, Q9 and Q10
  and a prototype that follows section 3 as revised (`handoff/tmp/critic-fourplayer/`: `s7.mjs`, `n.mjs`, `n4.mjs`,
  `s12.mjs`, `t5teams.mjs`, `fuzz.mjs`; not committed).
- The engine review's second pass re-ran **every** case again, and the ones it added or changed (T11, P3, P4, Q11,
  S3, R1, F1), on the core **as implemented in the working tree** (no patched copy), with a prototype that follows
  section 3 exactly (`handoff/tmp/critic-fourplayer/core2/`: `fp.mjs`, `sec7.mjs`, `new.mjs`, `danger.mjs`,
  `fuzz2.mjs`, `aitime2.mjs`, `evalcheck.mjs`; outputs `r_sec7.txt`, `r_new.txt`; not committed). All results below
  are those outputs.
- Castling tests set rights with the variant's own rights builder (3.2), for example only Red's K right
  `{ flag: 'K', side: 0, king: h1, rook: k1, kingTo: j1, rookTo: i1 }`.

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
- `K4` + Red Pf2, Blue Pe4, Green Pg4; **Teams** (in FFA a Green pawn never stands on file g: it promotes there); Red
  to move.
  - `f2-f4`: `x.ep = f3`, `epVictim = f4`, Blue to move.
  - Blue's moves from e4: exactly `e4-f3`. Playing it leaves Blue Pf3 and no Red pawn, with `ep` reset.
  - If instead Blue plays `a7-a6` and Yellow `g14-g13`, Green's pawn on g4 has no move (the right has expired, and f4
    blocks it).
- The other pairs, each from `K4` plus the two pawns:
  - Blue Pb10 + Yellow Pd11: Blue `b10-d10`, then Yellow `d11-c10` captures d10.
  - Yellow Pj13 + Green Pk11: Yellow `j13-j11`, then Green `k11-j12` is legal.
  - Green Pm5 + Red Pk4: Green `m5-k5`, then Red `k4-l5` is legal.
- Only a pawn next to the double-stepper:
  - `K4` + Red Pf2, Blue Pe2: after `f2-f4`, Blue's e2 pawn has exactly `e2-f2`; `e2-f3` is **not** legal.
  - `K4` + Yellow Pb11 and Pd11, Blue Pb10: after `b10-d10`, Yellow's pawn moves are exactly `b11-b10` and
    `d11-c10`.
- The other neighbour (FFA, Blue and Yellow out): Red Kh1, Green Kn8, Red Pj2, Green Pk4; Red to move. After `j2-j4`
  Green is to move, and its k4 pawn has exactly `k4-j3` (en passant; the push to j4 is blocked). After it: Green Pj3,
  no Red pawn.
- Head-on (hand-built; it cannot arise in a game, see 2.5): Red Kh1, Yellow Kg14, Green Kn8, Red Pf2, Yellow Pe4 and
  Pg4; FFA, Red to move. After `f2-f4` Yellow is to move, and both `e4-f3` and `g4-f3` are legal en passant captures
  (besides the pushes `e4-e3`, `g4-g3`). After `e4-f3`: Yellow Pf3 and Pg4, no Red pawn.
- **En passant onto the promotion line** (2.4):
  - FFA: `K4` + Red Ph2, Blue Pg4; Red to move. After `h2-h4`, Blue's g4 pawn has exactly `g4-h3=q`, `g4-h3=r`,
    `g4-h3=b`, `g4-h3=n` (the push to h4 is blocked). After `g4-h3=q`: Blue Qh3, no Red pawn. (Without the promotion
    expansion of 3.3 the only move is `g4-h3`, and it leaves a Blue **pawn** on h3, its promotion file.)
  - Teams: `K4` + Red Pk2, Blue Pj4; Red to move. After `k2-k4`, Blue's j4 pawn has exactly `j4-k3=q/r/b/n`, each
    `capture 1`.

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
  - The history record has `info: { out: [1] }` ("Blue is out").

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

**T11. Two lone kings (FFA).**
- Red Kh1, Green Ni2, Green Kn8; Red to move. `h1-i2` gives `{ winner: null, reason: 'bareKings' }`; the result
  sentence is the generic "Draw (only the two kings are left)".
- Red Kh1, Green Ni2, Green Kj3; Red to move. `h1-i2` leaves the kings next to each other: no result, Green to move,
  and `j3-i2` gives `{ winner: 3, reason: 'king' }`.
- Red Kh1, Green Ni2, Green Kn8, Blue Ka7; Red to move. `h1-i2` leaves three lone kings: no result.

### Quantum interactions

**Q1. A ghost queen attacks a king; the turn order follows the roll.**
- Four equal worlds, `K4` + Blue Pb8 in each:
  - Red queen on d4 or j4 (a 50/50 ghost), independently of Blue knight on c6 or d8 (a 50/50 ghost).
  - Budgets: Red 2, Blue 2, Yellow 1, Green 1.
- Red `d4-a7` (via c5 and b6): outcomes `miss 0.5`, `capture 0.5`.
  - miss: 2 worlds with Red Qj4 (100 %), Blue king and ghost knight unchanged. **Blue is to move.**
  - capture: 1 world with Red Kh1 Qa7, Yellow Kg14, Green Kn8. **The Blue ghost knight is gone too.** Yellow is to
    move, and all budgets are 1.
  - The limit rises at once: before the move `budgetInfo(V, s, side).limit` is 2 for every side; after `miss` it is
    still 2; after `capture` it is 4 for Red, Yellow and Green (three kings).

**Q2. Elimination dissolves a link.**
- Two equal worlds, Yellow to move:
  - A = `K4` + Red Rd8, Blue Nf8, Yellow Qd10;
  - B = `K4` + Red Ri8, Blue Nf10, Yellow Qd10.
- The Red rook is linked to the Blue knight: it is on d8 exactly when the knight blocks f8. That is what Red `d8-i8`
  produces from Rd8 with the knight 50 % f8 / 50 % f10: `move 1` (pass = link).
- Yellow `d10-a7` is `capture 1`. After it:
  - two worlds, 0.5 each: {Red Ri8, Yellow Qa7} and {Red Rd8, Yellow Qa7};
  - the Red rook is an unlinked 50/50 ghost, Red's budget is 2, and Green is to move.

**Q3. Fair-share budget (`budgetRule`).**
- From the start: Red `e1-d3|f3` (2 worlds, Red budget 2), then `b8-d8`, `g13-g11`, `m7-k7`.
  - `budgetInfo(V, s, 0)` is `{ used: 2, limit: 2, sides: [0] }`.
  - Red's split `j1-i3|k3` is **illegal**: budget limit 2 with four players.
  - `j1-k3` is still `move 1`.
- Three kings: two equal worlds, Red Kh1, Yellow Kg14, Green Kn8, Red Nj1, and a Red knight on d3 (A) / f3 (B); Red
  to move. `budgetInfo(V, s, 0)` is `{ used: 2, limit: 4, sides: [0] }`, and `j1-i3|k3` is **legal**.
- Without the budget rule (limit 8 for everyone), Red and Blue can split three pieces each, and then Yellow's first
  split `e14-d12|f12` is illegal at 64 worlds (`t6.mjs`). This is the unfairness the rule removes.

**Q4. Budget full: a link becomes a roll.**
- Four equal worlds: `K4` + Red knight d3 or f3 (a ghost), Red Rd8, Blue knight f8 or f10 (a ghost, independent).
- Red `d8-i8` would link the rook to the Blue knight: Red's budget would become 4, over the limit of 2. So it is
  rolled: `miss 0.5`, `move 0.5`.
- Without the Red ghost knight (two worlds), the same move is `move 1` (pass = link).

**Q11. The limit grows at once when a player is out.**
- FFA, Blue out; four equal worlds: Red Kh1, Yellow Kg14, Green Kn8, a Red knight on d3 or f3 (a ghost), Red Rd8,
  and independently a Green knight on f8 or f10; Red to move. `budgetInfo(V, s, 0)` is `{ used: 2, limit: 4,
  sides: [0] }`, and `d8-i8` is `move 1` (pass = link; Red's budget becomes 4, within the limit for three players).
- The same four worlds plus the Blue king on a7 (four kings): `{ used: 2, limit: 2, sides: [0] }`, and `d8-i8` is
  rolled, `miss 0.5`, `move 0.5` (as in Q4).

**Q5. A blocked double step and en passant.**
- Two equal worlds: `K4` + Red Pf2, Blue Pe4, and a Yellow knight on f3 in one world, on h12 in the other.
- Red `f2-f4`: `miss 0.5`, `move 0.5`.
  - miss: the knight is 100 % on f3, the pawn stays on f2, and Blue may play `e4-f3` (an ordinary capture of the
    knight) or `e4-f4`.
  - move: Pf4, `ep = f3`, the knight is 100 % on h12, and Blue's only e4 move is `e4-f3` en passant.

**Q6. A converging capture of a king.**
- Two equal worlds: `K4` + a Red queen on a4 (A) / d4 (B); Red to move.
- `a4|d4-a7` is `capture 1` without a roll (both paths, a5–a6 and c5–b6, are certainly clear): one world, Red Kh1
  Qa7, Yellow Kg14, Green Kn8; Blue is out and Yellow is to move.
- Four equal worlds: the same queen, and independently a Blue knight on b6 or c9. `a4|d4-a7` is `miss 0.25` (queen on
  d4 and knight on b6: the queen stays 100 % on d4, the knight is 100 % on b6, Blue is to move) and `capture 0.75`
  (Blue is out, its ghost knight too; Yellow is to move).

**Q7. Castling never rolls.**
- Two equal worlds: `K4` + Red Rk1, only Red's K right, and a Blue knight on i1 (A) / c6 (B); Red to move. `O-O` is
  **illegal** (not offered, `branches` null): i1 might be occupied.
- The same with the Blue knight on d8 (A) / c6 (B): `O-O` has one outcome, `move` p 1, `rolled: false`; both worlds
  have Red Kj1 Ri1.

**Q8. A castling right follows the whole state.**
- Two equal worlds: `K4` + Red Rk1, only Red's K right, and a Blue knight on k5 (A) / c6 (B); Red to move.
- `k1-k8` is `move 1` (pass = link: the rook is 50 % on k1, where the knight blocks k5, and 50 % on k8). Afterwards
  **no** world has Red's K right, also world A, where the rook is still on k1.
- Blue `?k5`, outcome k5 (p 0.5): one world, Red Rk1, Blue Nk5. Then Yellow `g14-g13`, Green `n8-n9`: Red `O-O` is
  **illegal**. (Without `unifyWorlds` it would be `move 1`.)

**Q9. A rolled Missed keeps the castling right.**
- Two equal worlds: `K4` + Red Rk1, only Red's K right, and a Blue knight on k3 (A) / k5 (B); Red to move.
- `k1-k5` is `miss 0.5` (A: blocked at k3), `capture 0.5` (B).
  - miss: Red Rk1, Blue Nk3 (100 %), and Red's K right is kept.
  - capture: Red Rk5, no Blue knight, and Red's K right is gone.

**Q10. The en passant right ends after the next player's turn, whatever it was.**
- Two equal worlds: `K4` + Red Pf2, Blue Pe4, and a Blue knight on c6 (A) / d8 (B); Red to move.
- `f2-f4` is `move 1`; both worlds have `x.ep = f3`, and Blue's `e4-f3` is `capture 1`.
- If Blue plays `?c6` instead (outcomes `c6 0.5`, `d8 0.5`): in both outcomes `x.ep` is −1 in every world.
- If Blue plays `c6-e7` instead (`move 1`, pass = link: world B has no knight on c6): `x.ep` is −1 in both worlds.
  (Without `applyMiss`, world B would keep `ep = f3`.)

**P1. Teams: landing where the partner might be.**
- Teams; two equal worlds: `K4` + Red Rd8 and a Yellow knight on g8 or g10.
- Red `d8-g8`: `miss 0.5` (the knight was on g8: the rook stays on d8, the knight is 100 % on g8), `move 0.5` (Rg8,
  the knight 100 % on g10).

**P2. Teams: passing the partner links.** Same position: Red `d8-i8` is `move 1`. Afterwards the rook is 50 % i8 (with
the knight on g10) and 50 % d8 (with the knight on g8).

**P3. King danger: every enemy, their converging captures, never the partner.**
- `K4` + Yellow Qh5; Red to move. `royalDanger(V, s, 0)` is 1 in FFA and 0 in Teams.
- Two equal worlds: `K4` + a Red queen on a4 (A) / d4 (B) (the Q6 ghost). `royalDanger(V, s, 1)` is 1 with Red, Blue
  or Green to move: the merge `a4|d4-a7` captures in both worlds, although each part alone reaches a7 in only half of
  them.
- Two equal worlds: `K4` + a Yellow queen on h5 (A) / e4 (B) (both parts reach h1), Green to move.
  `royalDanger(V, s, 0)` is 1 in FFA and 0 in Teams (the partner's merge does not count either).

**P4. Teams: a merge onto a square where the partner might be.**
- Teams; four equal worlds: `K4` + a Red queen on a4 or d4, independently of a Yellow knight on d7 or c9; Red to
  move. `a4|d4-d7` is offered (`mergesFrom(a4)`) and is `miss 0.5`, `move 0.5`:
  - miss: the two worlds with the knight on d7; the queen is still 50 % a4 / 50 % d4, the knight 100 % d7;
  - move: one world, Red Qd7 and the Yellow knight on c9.
- The same four worlds in FFA (the knight is an enemy): `move 0.5`, `capture 0.5`.

**S1. Teams: a stuck player draws the game.**
- Teams: Red Kd1, Be1, Pd2, Pe2, Pf2; Yellow (partner) Nd3, Ne3, Nf3, Ng3 and Kg14; Blue Ka7; Green Kn8. Green to
  move. (Knights, not pawns: a Yellow pawn on rank 3 would stand beyond its Teams promotion rank 4.)
- Red has no legal move: its pawns are blocked by its partner's knights, which it cannot capture, and its king and
  bishop are boxed in.
- Green `n8-n9`: Red is to move and has no legal move, so the result is `{ winner: null, reason: 'noMoves' }`
  (chess.com Teams: stalemate is a draw).
- With `passWhenStuck: true` (a flag instead of the function of 3.3), the result would wrongly be Blue to move,
  `skipped: [0]`.

**S2. FFA: a stuck player sits out (`passWhenStuck`).**
- FFA: Red Kd1, Be1, Re2, Pd2, Pf2, Pe3; Yellow Nd3, Nf3, Ne4 and Kg14; Blue Ka7; Green Kn8. Green to move. (Knights,
  not pawns: a Yellow pawn never goes below its FFA promotion rank 7.)
- Red has no legal move: d2, f2 and e3 are blocked head-on by Yellow knights and have nothing to capture diagonally
  (c3 is missing, e3 is Red's own, g3, d4 and f4 are empty); the king, bishop and rook are boxed in by Red's own
  pieces and the missing c1 and c2.
- Green `n8-n9`: the next state has Blue to move, `ply` 1, the last record has `skipped: [0]`, and there is no result.
- Without `passWhenStuck`, the core would end the game with `{ winner: null, reason: 'noMoves' }`.

**S3. A skipped turn ends the en passant right (FFA).**
- FFA, Blue out: Red Kd1, Be1, Re2, Pd2, Pf2, Pe3 (S2's stuck Red); Yellow Nd3, Nf3, Ne4, Kg14, Pk11; Green Kn8,
  Pm10. Green to move.
- Green `m10-k10` (a double step: `x.ep = l10`, `epVictim = k10`) is `move 1`. Red cannot move and sits out, Blue is
  out, so Yellow is to move: `ply` 1, the last record has `skipped: [0]`, and every world has `x.ep = −1`.
- Yellow's k11 pawn, which stands next to k10, has **no** move: the push is blocked by k10, and the right ended with
  Red's skipped turn (2.5).
- Without `applyMiss` (the core passes a skipped turn through it with the action `pass`), `k11-l10` would be a legal
  en passant capture here.

**R1. Resignation (`resignResult`, through `panel.js` `resignResult`).**
- FFA, Red Kh1, Yellow Kg14, Green Kn8 (Blue already out): Red resigns → `{ winner: null, winners: [2, 3], reason:
  'resign' }`. The core default would give `winners: [1, 2, 3]`, eliminated Blue included.
- FFA, Red Kh1, Green Kn8: Red resigns → `{ winner: 3, reason: 'resign' }`.
- Teams, `K4`: Blue resigns → `{ winner: null, winners: [0, 2], reason: 'resign' }`.

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

- every side's `budgetInfo(V, s, side).used` ≤ its `limit`;
- at most 16 worlds while four kings are on the board (the research run saw at most 8, the second engine run 16);
- kings and pawns are identical in every world;
- `x` (mode, en passant square, castling rights) is identical in every world;
- the set of players still in the game is the same in every world;
- no piece of an eliminated side is on the board in any world (FFA);
- no pawn stands on or beyond its promotion line;
- every finished game has exactly one winner (FFA) or one winning team (Teams), or is a draw with reason `quiet`,
  `moveLimit`, `noMoves` or (FFA) `bareKings`;
- (added by the engine review's second pass, 4.1) every square holds at most one piece id over all worlds, and the
  set of pieces on the board is the same in every world;
- the weights sum to T, and a side to move without a result has a legal move (`hasLegalMove`).

All of these held. The engine review repeated it on the planned core (`handoff/tmp/critic-fourplayer/fuzz.mjs`, 24
processes in parallel, 96 complete games, 51,830 plies; up to 64 worlds once two or three players were left), and in
its second pass on the core as built (`core2/fuzz2.mjs`, 12 processes, 48 complete games, 23,319 plies: 44 ended by
a captured king, 1 by `bareKings`, 2 by the quiet rule, 1 by the move limit; up to 16 worlds with four kings and 64
later; no game-end roll and no solid roll was ever needed). Random play almost never produces en passant (none in
the second run) or a stuck player, so T5, Q10, S1, S2 and S3 are the tests for those rules.

**F2. The known opening trap works** (it checks the orientation of everything):

- 1. Red `h2-h3`, Blue `b8-d8`, Yellow `e14-f12`, Green `m7-l7`.
- Then Red `g1-n8` captures the Green king along g1–n8.
- In Teams, the result is `{ winners: [0, 2], reason: 'king' }`. In FFA, Green is out and Blue is to move.

---

## 8. Review notes

Open questions (from the research, updated by the source review):

1. **Core hooks (3.4).** Served by `handoff/CORE-CHANGES.md` under other names, and implemented in the working tree at
   the time of the engine review's second pass (see the table in 3.4 and 8.2).
   - `budgetRule` (was `budgetLimit`) is needed for a fair game. Without it, the variant works, but whoever splits
     first can block the other players' splits.
   - `passWhenStuck` is rare and only used in FFA; the fallback is a draw (which is already the Teams rule).
   - `resignResult` (was `resign`) fixes Teams. Elimination by resignation in FFA pass & play was rejected by the
     core plan, so in v1 a resignation ends the game for everyone (the lead may revisit).
   - `enemies(a, b, w)` was rejected; the Teams `filterMoves` and evaluate correction stay.
2. **Points FFA** (chess.com scoring) is left out of v1. If it is wanted later:
   - per-world scores in `w.x.score`, made solid through `solidExtra` (as three-check does), so every scoring capture
     is settled at once;
   - +20 for a king, Q 9, R 5, B 5, N 3, P 1, a promoted queen 1;
   - eliminated players keep their score, and the highest score wins when one king is left;
   - the computer's `evaluate` would then use score differences.

   It is more to explain, and it rewards opportunistic captures over survival. "Last king standing" is the brief's
   own goal and the simplest for the computer.
3. **En passant window.** We use "next player only". 4pchess (and, judging by its FEN, chess.com) allows it until the
   double-stepper's owner moves again (so Green may take Red's pawn on the third move after the double step),
   including a rare double capture. That can be switched if exact chess.com parity matters; the capturer would still
   have to stand next to the double-stepped pawn (2.5).
4. **Eliminated army.** We remove it. The alternative is chess.com's grey walls, which cannot move and can be captured
   by anyone; see 4.2 for why not.
5. **FFA promotion choice.** We allow a free choice. chess.com auto-queens, with a queen worth 1 point.
6. **Seats.** A per-seat Human / Computer choice (for example two humans against two computers in Teams) needs a small
   change in the new-game dialog and the game record (`players[i].kind`); the engine does not care.
7. **Teams budget.** We use 2 per player. The alternative is a shared team budget of 8 (as bughouse does, 8 × 8 = 64):
   more quantum play per team, but partners compete for it. With the planned `budgetRule` it needs no second hook,
   only `{ sides: [side, (side + 2) % 4], limit: 8 }` in Teams.
8. **Board colouring.** We use light when `x + y` is odd (4pchess). The opposite would give Red and Yellow a light
   right-hand corner instead of Blue and Green. It cannot be right for all four.
9. **Draw details (added by the source review).** Two lone kings in FFA are a draw (2.6). chess.com's threefold
   repetition and its other insufficient-material cases are not used; a repetition rule, if wanted, belongs in the
   core for every variant.

### 8.1 Source review

Reviewer 1 of 2, lens: rules fidelity (2026-09-25). Fetched: the chess.com terms page
(https://www.chess.com/terms/4-player-chess), the chess.com Help Center article
(https://support.chess.com/en/articles/8614233-4-player-chess-4pc), the chess.com forum "4PC Variants List"
(https://www.chess.com/clubs/forum/view/4pc-variants-list), Wikipedia (https://en.wikipedia.org/wiki/Four-player_chess)
and the FIDE Laws (https://handbook.fide.com/chapter/E012023). The chess-variants and chess Fandom wikis answered 402
and quadibloc.com refused the connection. Read in the 4pchess clone (`handoff/ext/4pchess`): `board.cc`
(`GetPawnMoves2`, `GetKingMoves2`, `CreateStandardSetup`, the promotion rows, the castling rook squares), `board.h`
(piece values), `utils.cc` (`ParseBoardFromFEN`), `board_test.cc`, `FENs_4PC_balanced.txt` and the UI colouring in
`ui/public/javascripts/index.mjs` + `style.css`. Every section 7 case with a classical result (T1-T11, F2, S1, S2) and
the quantum cases Q1-Q5, P1, P2 were re-run on the real core with a copy of the prototype (paths fixed,
`handoff/tmp/fp-rules-review/`); all match the text.

Confirmed without change: the 160-square board and its missing corners, square names, turn order (Red, Blue,
Yellow, Green, clockwise), the orientation maps, every start square (checked against 4pchess `CreateStandardSetup`
and the 4PC FEN), the queen to the left of the king for every army, the 20 start moves per side, piece movement and
the corner behaviour of sliders and knights, the double step from the own second line, castling on both wings
(4pchess `GetKingMoves2`: king two squares, rook onto the crossed square, rooks on d1/k1, a11/a4, k14/d14, n4/n11),
the promotion lines (FFA 8th: chess.com "Pawns promote on your 8th rank"; Teams 11th: 4pchess rows/columns 3 and 10,
chess.com "Pawns promote on the 11th rank"), Teams partners and "no capture of the partner", the Teams goal (first
king), the FFA end (chess.com: "The game ends when three players are eliminated"), the 4pchess piece values, and the
4pchess board colouring (light when file + rank index is odd).

Changes:

1. **Section 1, source table: quotes made verbatim and completed.** The old row paraphrased chess.com inside quote
   marks ("pawns promote to a one-point queen on the 8th rank", "their pieces turn grey … they block attacks") and
   left out the stalemate and draw rules. It now quotes the pages and adds: FFA stalemate gives the stalemated
   player +20; Teams "Stalemate results in a draw"; FFA draws by threefold repetition, insufficient material and the
   50-move rule; neither page describes castling or en passant. Sources: https://www.chess.com/terms/4-player-chess,
   https://support.chess.com/en/articles/8614233-4-player-chess-4pc.
2. **Section 1, 4pchess row: en passant geometry corrected.** 4pchess allows en passant when the enemy pawn
   double-stepped **onto** the square in front of the capturer (`other_player_move->To() == to`), not "across" it,
   and the right lasts until the double-stepper's **owner** moves again (one record per colour). Source:
   `handoff/ext/4pchess/board.cc`, `GetPawnMoves2`; https://github.com/obryanlouis/4pchess.
3. **2.5, 3.3 and 7 (T5): who may take en passant.** The old text said both "any pawn that could capture diagonally
   onto the skipped square" and "only a perpendicular neighbour", which contradict each other. On the real core,
   `pawnExtras` lets a Blue pawn on e2 take e2xf3 after Red f2-f4, although it is not next to the pawn that moved,
   and the "perpendicular only" claim is false in FFA once the player in between is out (the next player then sits
   opposite, and the capture is the chess one). The rule is now FIDE 3.7.3.1 generalised (the capturer stands next
   to the double-stepped pawn), which is also exactly the 4pchess geometry. `filterMoves` drops the other `ep` moves;
   T5 gained the e2 case, a Yellow b11 pawn that may not take, and the head-on case. Sources:
   https://handbook.fide.com/chapter/E012023 (3.7.3.1, 3.7.3.2); 4pchess `GetPawnMoves2`.
4. **1, 2.6, 3.4, 4.8, 5, 6 and 7 (S1, S2): a stuck player in Teams draws.** The spec made a stuck player sit out in
   both modes, justified by "chess.com eliminates a stalemated player and gives 20 points". That is the FFA rule
   only; chess.com Teams says "Stalemate results in a draw". Teams now draws (the core's default `noMoves` result, no
   hook), FFA keeps the sit-out, and hook 2 becomes `passWhenStuck(state)`. S1 (Teams) now expects the draw; the new
   S2 is an FFA position that exercises the sit-out. Source:
   https://support.chess.com/en/articles/8614233-4-player-chess-4pc.
5. **1, 2.6, 3.3, 5 and 7 (T11): two lone kings draw in FFA.** chess.com draws on insufficient material, and classic
   Quantum Chess has a bare-kings draw (`src/engine/apply.js`, `bare_kings`), but the spec had no such rule, so two
   lone kings played on for 200 plies. The new `bareKings` result needs the kings not to be next to each other (else
   the side to move captures). A script over all 160 × 160 square pairs confirmed that a lone king always has a
   move that is not next to the other lone king, so the position is dead; with three lone kings, two can trap a third
   (Red Kd1 against Blue Kd3 and Green Kf2), so the rule is limited to two. Source:
   https://www.chess.com/terms/4-player-chess.
6. **2.6 and 1: draw rules made precise.** "200 moves" and "1200 moves" are plies of all players together (the core
   counts plies); chess.com does not define its 50-move count for four players. The missing threefold repetition is
   now stated as a deliberate gap (the variants core has none), as in the other reviewed specs. Source:
   https://www.chess.com/terms/4-player-chess.
7. **2.3: the elided start FEN replaced by the full one.** The old line used `...` and could not be checked. The new
   string is in the 4PC FEN format that 4pchess parses, and a parse of it gives exactly the 64 pieces of the table.
   Source: 4pchess `utils.cc` `ParseBoardFromFEN`, `FENs_4PC_balanced.txt`, `CreateStandardSetup`.
8. **2.5 castling: source of the check condition.** 4pchess refuses castling while the king or the square it crosses
   is attacked; the spec now says so before dropping it (no check in Quantum Chess). Source: 4pchess
   `GetKingMoves2`.
9. **6: the prototype's square colours are reversed.** `proto.mjs` shades light when `x + y` is even, the opposite of
   this spec and of 4pchess; the text now says to follow the spec (the `rectTopology` default already does). Source:
   4pchess `ui/public/javascripts/index.mjs` (`(row + col) % 2 == 0` → class `even`) and `style.css` (`.even` is the
   light `#dadada`).
10. **5, rules card.** The promotion sentence was ambiguous ("they promote … (their 8th rank), and in Teams on their
    11th rank" reads as both); it now separates the modes and names the promotion pieces. The en passant sentence
    says "with a pawn standing next to it", and the stuck-player sentence gives both modes.

### 8.2 Engine review

Reviewer 2 of 2, lens: engine and quantum consistency (2026-09-25). Read `handoff/IMPLEMENTING.md`,
`handoff/CONTRACT.md`, `src/variants/core/` (`quantum.js`, `world.js`, `orthodox.js`, `variant.js`, `ai.js`,
`topology.js`), `VariantBoard.vue` / `VariantPiece.vue` / `useVariantGame.js`, `docs/rules.md` and
`handoff/CORE-CHANGES.md` (including its revision during this review). The core was not yet changed, so every case of
section 7 was re-run on a copy of `quantum.js` with the planned items Q1 (`applyMiss`), Q2 (certain moves), Q3
(`unifyWorlds`), Q6 (`budgetRule`, `budgetInfo`), Q9 (`recordInfo`) and Q10 (`passWhenStuck`) and a prototype that
follows section 3 as revised (`handoff/tmp/critic-fourplayer/`). All cases match the text. The computer player on that
core (normal and hard, FFA and Teams, 40 plies from the start, 12 games in parallel) took at most 112 ms per move.

Confirmed without change: the orientation and square maps; the 20 start moves; board shape; all eight castlings;
promotion lines; FFA elimination with ghosts and links (Q1, Q2); the turn order following the roll (Q1); the budget
rule and its fallback roll (Q3, Q4); a blocked double step (Q5); Teams landing and passing (P1, P2); the Teams merge
onto a possible partner square (rolled, Missed there); rotation (UI1: `rot()` 270 puts a7 at the bottom with a8 left
of it, 90 does the same for n8/n7; sprites are never spun); the shading, labels and 14 × 14 layout within the layout
API; the evaluate terms (the Teams correction gives exactly `own + partner − enemy1 − enemy2` with `ai.js`'s
`worldValue`).

Changes:

1. **3.3, 3.4, 6, 8 item 1: hooks mapped to the planned core.** The research proposed `budgetLimit(world)`,
   `passWhenStuck(state)`, `resign(state, side)` and `enemies(a, b, w)`; CORE-CHANGES.md serves them as Q6
   `budgetRule`, Q10 `passWhenStuck`, U12 `resignResult`, and rejects `enemies(a, b, w)`. 3.3 now uses those names and
   adds the planned hooks this variant also needs but did not list: `applyMiss` (Q1 + W4), `unifyWorlds` (Q3 + W5),
   `recordInfo` / `infoText` (Q9, U9) for "Blue is out", `budgetInfo` pips (U5), and the optional W3 helpers. 3.4 is
   now a table from proposal to plan.
2. **4.4, 2.5, 7 (new Q7-Q10): castling and en passant contradicted docs/rules.md and D1/D2.** The spec said castling
   is generated wherever its squares are empty and rolled (Moved or Missed) when that holds in only some
   possibilities, that en passant is offered when possible in *some* possibility, and that a right is lost only "in
   that possibility". docs/rules.md 4 and 5 and the lead's D1/D2 say: castling never rolls and needs every square
   empty for certain; en passant is always certain; a right is lost everywhere once the king or rook is not 100 % home;
   a rolled Missed keeps it. Rewritten, and checked on the planned core: `O-O` past a Blue ghost on i1 is illegal (Q7);
   after a pass = link rook slide and a measurement that puts the rook back on k1, `O-O` is illegal (it is `move 1`
   without `unifyWorlds`, Q8); a rolled Missed keeps the right (Q9); the en passant square is cleared in every world
   after a Measure or a partly missed move of the next player (without `applyMiss` the missed world keeps `ep = f3`,
   Q10).
3. **2.4, 2.5, 3.3, 7 (T5): en passant onto the promotion line did not promote.** `pawnExtras` pushes its `ep` moves
   without `pushMove`, so without promotion. On this board an en passant capture can land on the capturer's promotion
   line: Blue g4xh3 after Red h2-h4 (FFA, file h), Blue j4xk3 after Red k2-k4 (Teams, file k), Yellow d8xc7 after
   Blue b7-d7 (FFA, rank 7). On the core the only move was `g4-h3`, and it left a Blue pawn on h3 that can never
   promote any more (its next steps go to i3, j3, k3). `extraMoves` now re-emits `ep` moves through `pushMove` (kind
   kept), giving `g4-h3=q/r/b/n`. The fix belongs in `pawnExtras` (see core changes below).
4. **3.3, 3.4, 4.8, 7 (S1): `passWhenStuck: true` would break the Teams draw.** The first version of the plan told
   this spec to set `passWhenStuck: true` and described Q10 as a flag. A flag applies in Teams too: S1 then gives Blue
   to move with `skipped: [0]` instead of the chess.com Teams draw (checked). The plan was revised during this review
   (its review note 2): Q10 now accepts a function of the state, and its section 5 gives this spec exactly
   `(s) => !s.worlds[0].b.x.teams`. 3.3 uses it, and S1 and S2 pass with it on the revised Q10 (checked). S1 now
   also says what a flag would do.
5. **3.3: the FFA resignation result.** Today's `useVariantGame.resign`, which the U12 default keeps, makes every
   enemy of the loser a winner, including players who were eliminated earlier. `resignResult` now lists only the
   players still in the game in FFA (and the other team in Teams).
6. **2.5, 7 (T5): who can take en passant, in a real game.** The rule (reviewer 1's "the capturer stands next to the
   double-stepped pawn") is unchanged. But its head-on picture cannot arise: an opposite army's pawn never reaches the
   double-stepper's fourth line (FFA: it promotes on the middle line; Teams: nobody is eliminated, so the next player
   is always the clockwise neighbour). The reachable case after an elimination is the **other** neighbour: after Red
   j2-j4 with Blue and Yellow out, Green k4xj3 (new T5 case, checked). The head-on test stays, marked as hand-built. 2.5
   also defines "the next player" (the next one in turn order still in the game) and says that any turn of that
   player ends the right, including a turn it sits out: the revised Q10 passes a skipped turn through `applyMiss`
   (action `pass`), which clears the en passant square. That matters only when the opposite player is out or sits out
   too, so that the other neighbour moves next.
7. **7 (T5, S1, S2): unreachable test positions.** T5 had a Green pawn on g4 in FFA (on Green's promotion file), S1
   Yellow pawns on rank 3 in Teams (beyond Yellow's rank-4 line) and S2 Yellow pawns on ranks 3-4 in FFA (beyond rank
   7). A fuzz invariant of the implementation ("no pawn on or beyond its promotion line") contradicts them. T5's first
   case now runs in Teams, and S1 and S2 use Yellow knights; the results are unchanged (checked).
8. **4.1: piece presence is the same in every world.** Every capture is settled at once (landing on an occupied square
   is measured, merges onto a possible enemy are rolled, en passant is certain), so the pieces on the board never
   differ between worlds, only where ghosts stand. So `bareKings` and the last-king win never need the game-end
   roll. The converging capture of a king, certain and rolled, is the new test Q6.
9. **4.3: the 16-world bound.** It holds only because `x` is identical in every world, which needs `applyMiss` and
   `unifyWorlds`; stated, and checked by the fuzz (F1: 96 games, 51,830 plies, 24 processes in parallel). The test
   reference B2 (from the research scripts) is now Q4.
10. **4.5, 4.7, 7 (P3): king danger.** `royalDanger` loops over every enemy still in the game, not only the next
    player (its doc comment says otherwise; the code is what 4.7 needs), and a partner never counts because `generate`
    is filtered (new test P3: 1 in FFA, 0 in Teams). Noted that docs/rules.md 5 counts converging captures in the ring
    and today's core does not; the revised plan fixes it in Q7, per enemy and through the filtered generation, so a
    partner's merge never counts.
11. **2.6: the quiet counter.** Only a capture or pawn move that really happened resets it (docs/rules.md 6; planned
    core fix Q8).
12. **3.1: topology and types rows.** The topology row passed a `shade` option although section 6 says the default
    shading is the right one; removed. `orthodoxTypes` needs a `lastRank` argument; the row says to pass
    `() => false` and then set `p.promote`.
13. **5, rules card.** The Teams sentence now says the partner's pieces block you like your own (which is what makes
    P1 and P2 a roll and a link). "200 moves" now says "all players together", and two lone kings is a separate
    clause. The promotion sentence names the 8th rank directly.
14. **7: exactness.** Q1 gives the budget limits before and after (2, then 4 after the capture); Q3 gives the exact
    three-king position and the `budgetInfo` values; T7 gives the history `info`; F1 checks `budgetInfo` and identical
    `x`; the section intro says where the engine review ran each case.

#### Second pass: the core as built

Same reviewer, later on 2026-09-25, after the three core packages of `handoff/CORE-CHANGES.md` had been implemented in
the working tree (not yet committed). Read again: `quantum.js` (the whole file), `world.js`, `orthodox.js`,
`orthodoxVariant.js`, `variant.js` (its header lists the new hooks), `ai.js`, `topology.js`, and on the UI side
`src/variantplay/panel.js`, `texts.js`, `useVariantGame.js`, `VariantBoard.vue`, `VariantPiece.vue`,
`VariantGameView.vue` and `VariantsView.vue`. A new prototype follows section 3 exactly on the real core, with no
patched copy (`handoff/tmp/critic-fourplayer/core2/fp.mjs`; `castlingMoves`, `orthodoxAfterMove`, `clearEnPassant` and
`unifyCastling` come from `orthodox.js`). Every case of section 7 and every case added below was re-run on it
(`sec7.mjs`, `new.mjs`, `danger.mjs`); all match the text as revised. The fuzz (F1) and the computer's timing (4.3)
were re-run too.

Confirmed without change: every classical case (T1-T11, F2) and every quantum case of the first pass (Q1-Q10, P1, P2,
S1, S2) on the real core; the hooks of 3.3 against the signatures in `variant.js` (`applyMiss`, `unifyWorlds`,
`budgetRule`, `recordInfo`, `passWhenStuck` as a function of the new state) and `isCertain`; UI1 against `rot()` in
`VariantBoard.vue` (sprites are never spun: `VariantPiece.vue` turns only shogi pentagons); the shading and the label
positions against `rectTopology`; the budget pips (`panel.js` `budgetPips` reads `budgetInfo`), the option line
(`optionValueText`) and the generic "{side} cannot move and sits out" line (`recordLines`), so section 6 needs no code
for them.

Changes:

15. **3.3, 3.4: the hooks as built.** `castlingMoves` (W3) now works along any straight line and gives all eight
    castlings of T4 with the rights of 3.2, and `orthodoxAfterMove` takes the en passant square as the midpoint in
    every coordinate. The local castling generator and the hand-written en passant and rights bookkeeping of 3.3 are
    gone: `afterMove` is `orthodoxAfterMove` plus the elimination. `infoText` has U9's exact signature
    (`(record, viewer) -> string[] | null`). 3.4 says the items are implemented and names the case that exercises
    each one.
16. **3.3 `evaluate`: FFA material after eliminations.** `ai.js` `worldValue` divides the enemy material by the
    number of enemy sides, including eliminated ones (0 material). With two players left the computer counted a
    captured enemy queen as +333 and its own lost queen as −1000 (`evalcheck.mjs`), so it undervalued every capture
    in the endgame. `evaluate` now adds `E / 3 − E / k` (the average over the enemies still in the game; 0 while four
    play). The Teams term was re-derived on today's `worldValue` and is right.
17. **3.3 `reasonText`, T11: the generic `bareKings` text.** The core's U7 text, "only the two kings are left", is
    exact here and matches the lower-case style of the result sentence; the variant's own "Only two kings are left"
    would have read "Draw (Only two kings are left)". `reasonText` keeps only `'quiet'` (the generic text says "50
    moves").
18. **3.3, 6: the players panel as built.** The `--out` class greys a row out and strikes it through, but shows no
    word "out", and the panel has no row grouping (none is planned). Both now go through the `sideInfo` hook (U6, in
    the core): "out" for an eliminated player, "with {partner}" in Teams. Section 6 also says what happens when the
    only human is out against the computer (the computers play on; Resign ends the game, R1).
19. **4.1: why the pieces on the board are the same in every world.** The first pass gave one reason (every capture
    is settled at once). On its own it does not exclude a capture branch that takes a different piece in different
    possibilities, which would make `bareKings` differ between worlds and need the game-end roll. The missing reason:
    a square never holds two different pieces over the worlds, because every way onto a square (landing, split,
    merge) needs it certainly empty or holding the same piece, or is rolled. Stated; both facts are now F1 invariants
    and held in every state of the fuzz.
20. **4.5, 4.7, P3: converging danger.** The first pass said today's `royalDanger` ignored merges. The core now counts
    them (Q7) per enemy with any side to move. P3 gained two cases (Red's ghost queen threatens Blue's king at 1 with
    Red, Blue or Green to move; a partner's ghost queen gives 0 in Teams). The UI shows danger as a line and a square
    mark, not as a ring; the wording says so.
21. **7: new cases for the riskiest rules.** S3: a skipped turn ends the en passant right (without `applyMiss` Yellow
    could play `k11-l10`). P4: a Teams merge onto a square where the partner might stand is rolled, `miss 0.5`, `move
    0.5` (the same merge in FFA: `move 0.5`, `capture 0.5`); 4.5 claimed it without a test. Q11: the limit grows at once
    when a player is out (the link that Q4 rolls with four kings is `move 1` with three). R1: `resignResult` lists
    only the players still in the game (the core default names eliminated Blue as a winner).
22. **1, 4.3, 7 (intro, F1): numbers and places.** Where the cases ran, the fuzz numbers (48 complete games, 23,319
    plies, 12 processes; no game-end or solid roll was ever needed), the computer's time (at most 64 ms per move) and
    two more F1 invariants (item 19, and a legal move for every side to move without a result).
23. **5, rules card:** "without its four corners" is now "without its four 3 × 3 corners".
24. **6: promotion lines.** "The layout is static per variant" was wrong (`layoutOf(state)` exists); the reason not to
    draw them is now that the preview already offers the promotion choice.
25. **3.1: king value.** 400 is the `orthodoxTypes` value, not a core default (`normaliseType` defaults to 100).
26. **7, helper notes:** a case without a mode is FFA, and a ghost's worlds must list the pieces in the same order
    (`worldFrom` numbers them in that order, and a ghost needs one id).

Core changes needed (status after the second pass; ids from `handoff/CORE-CHANGES.md`):

- **Implemented in the working tree and required as built** (keep them when committing; none can be done by a variant
  hook, for the reason given; the cases in brackets exercise them):
  - Q6 `budgetRule(b, side)` read on `state.worlds[0].b` and export `budgetInfo(V, state, side) -> { used, limit,
    sides }`: the budget checks of links, merges and splits live in `quantum.js` [Q1, Q3, Q4, Q11, F1].
  - Q10 `passWhenStuck` as `true` or a function of the new state, each skipped turn passed through `applyMiss` with
    `{ type: 'pass', code: null, from: [], to: [] }`, `skipped` on the record, `noMoves` on the state before any pass
    when nobody can move: `nextSide(b, side)` sees one world and cannot know the quantum legal moves, and a flag
    would also skip in Teams [S1, S2, S3].
  - Q1 `applyMiss(b, action, side, info)` and W4 `clearEnPassant`: no hook sees the worlds where an action did not
    take effect [Q10, S3].
  - Q2 certain moves (`isCertain`: legal only when every world generates the key as a certain move, then never
    rolled, never a split or merge path): `filterMoves` sees one world [Q7, T5].
  - Q3 `unifyWorlds(bs, mover)` and W5 `unifyCastling`: `afterMove` sees one world [Q8, Q9].
  - Q7 converging captures in `royalDanger`, per enemy with any side to move, with its loop over every enemy still in
    the game (the first pass asked to keep that loop and to correct the doc comment; both done) [P3].
  - Q9 `recordInfo`, U9 `infoText` and the `skipped` line, U6 `sideInfo`, U7 generic `bareKings` text, U11 option
    line, U12 `resignResult`: the variant cannot write to the history record or the UI [T7, S2, T11, R1].
  - W3 `between`, `castlingMoves` along any straight line, `orthodoxAfterMove` with the midpoint in every coordinate
    (used directly by 3.3) [T4, T5].
- **New, required for a consistent rules card (package ai-ui): the shared budget sentence.** `texts.js`
  `sharedRules()` always says "Each side has a budget of 8 possible arrangements of its pieces.", while this
  variant's card says 2 / 4 / 8 (and bughouse's team budget is 8 for two partners), so the two cards shown together
  contradict each other. Change: `sharedRules(V)`, called with the variant in `VariantGameView.vue`; when
  `V.budgetRule` is set, the budget sentence becomes "Each side has a quantum budget: a limit on the possible
  arrangements of its pieces. This variant's rules give its size." (or is left out); otherwise the text is unchanged.
  A variant cannot do this: `rules()` only adds sentences to its own card.
- **Recommended, not required (the variant has a workaround): W3 `pawnExtras` emits en passant captures through
  `pushMove(V, w, out, id, from, to, victim, 'ep')`,** so an en passant capture onto a promotion square expands into
  the promotion choices with the kind `ep` kept. Still not done in the working tree (checked: without the variant's
  re-emit, `g4-h3` after Red h2-h4 leaves an unpromoted Blue pawn on h3). Backwards compatible: no en passant capture
  reaches the last rank on the existing 8 × 8 boards; other variants with unusual pawn geometry could have the same
  case. When it lands, drop the re-emit of 3.3 (harmless if kept: `generate` keeps one move per key).
- **Recommended, not required (the variant has a workaround): `ai.js` `worldValue` averages the enemy material over
  the enemy sides still in the game** (`!V.isOut?.(b, s)`), instead of over every enemy side. Only variants with an
  `isOut` hook change. When it lands, drop the FFA term of 3.3 `evaluate` (it assumes the divisor 3); the Teams term
  stays.
