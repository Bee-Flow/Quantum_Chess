<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Chess variants

Quantum Chess 2 comes with twenty chess variants: other dimensions, hidden information, different rules, different
boards with more players, and the regional relatives of chess. **Every variant keeps the quantum element**: pieces
can be in two places at once until something finds out where they really are.

You find them under **Chess variants** in the navigation or on the home page. Each one can be played against the
computer (Easy, Normal or Hard) or as pass & play on one device; in the four-player games the computer plays every seat
but yours. Games are stored on your device; online play and ratings stay with classic Quantum Chess.

The large boards (3D, 4D and 5D chess, Bughouse and Four-player chess) can be zoomed with the buttons above the board,
Ctrl + wheel or a two-finger pinch, and moved by dragging with the mouse or one finger. On a touch screen 4D chess and
Bughouse open on the boards of the player to move, and on any screen 5D chess frames the boards you have to play;
*Whole board* shows everything and *Recentre* goes back.

> The classic game and its exact rules are described in [`rules.md`](rules.md). This page explains how those rules
> carry over to every variant, and what is special in each one.

---

## The quantum rules of every variant

These are the rules of classic Quantum Chess, made to work on any board.

1. **Split.** A piece that is not always solid may move to **two empty squares at once**. It becomes a **ghost**,
   50 % on each square. Both squares must be empty in every possibility, and the piece must be able to reach them
   with an ordinary, non-capturing move.
2. **Merge.** Bring two parts of the same ghost together on one square. A part that moves onto another part of the
   same piece simply joins it. Parts that have become different pieces (a promotion in only some possibilities)
   cannot merge: measure the piece instead.
3. **Land = roll, pass = link.**
   - A move that **lands** where another piece is or might be, a drop, and every move of a solid piece is settled
     at once by a **roll**. You see the odds before you confirm the move.
   - A move that only **passes** a square where a piece might be rolls nothing: in the possibilities where the path
     is blocked the piece simply stays, and it is now **linked** to the piece that blocked it.
4. **Solid pieces.** Kings, pawns and the pieces a variant names (for example the general and the soldiers of
   xiangqi) are always solid. If a move would leave one of them in different places in different possibilities, a
   roll settles it at once.
5. **Measure.** Instead of moving, spend your turn finding out where one of your own ghosts really is.
6. **Castling and en passant** (in the variants that have them) are only possible when they are possible in every
   possibility, and they are never rolled. A ghost part on a square that castling needs blocks it, and you lose a
   castling right as soon as the king or that rook is not 100 % on its starting square.
7. **The game ends only for real.** If a move would end the game in some possibilities but not in others (a third
   check, an explosion next to the king, a king that might have reached the hill), a roll decides whether it did.
8. **Budget.** Each side may have at most **8** different arrangements of its pieces over all possibilities (three
   50/50 ghosts), and a split never spreads a piece over more than 4 squares (a slide that is blocked in some
   possibilities can still leave it on one more, as in classic Quantum Chess). When your budget is full, Split is
   greyed out, and a move that would go over it is settled by a roll instead.
9. **Capture the king.** There is no check in Quantum Chess: in the variants with a king you win by capturing it,
   unless the variant has its own goal. The ring around a king shows the chance that it could be captured with the
   next move, converging captures included. Variants that count checks count a check as "the king could be captured
   next move".
10. **Your king cannot escape.** If every move you could make (splits, merges and measuring included) would leave
    your king to be captured **for certain** on the next move, you have lost at once. This is the game's version of
    checkmate. It also counts when your king is not attacked now, so most positions that chess calls stalemate are
    lost too, unless the variant says otherwise. It does not apply while any of your moves could still capture the
    enemy king, even with a small chance. It holds in the two-player variants with a king and one move per turn, so
    not in Antichess, Bughouse, Four-player chess or Multiverse chess.

**Draws.** The game is drawn automatically when only the kings are left (and no piece is in hand), when 50 moves by
each side pass without a capture, a pawn move or a drop actually happening, when the move limit of 300 moves by each
side is reached, or when the player to move has no legal move, unless the variant says otherwise. The first two wait
while the player to move can capture the enemy king **for certain**: if you take your opponent's last piece with your
king but land next to their king, the game is not a draw, because they take your king. A repeated position is not a
draw in the variants.

**Undo and the dice.** A roll is made the first time a move is played in a position, and the game remembers it.
Undoing and playing the same move in the same position gives the same result, even if you pick a different piece to
promote to, so undo cannot re-roll the dice.

---

## The variants

Each entry says only what is special in that variant. Everything else, from splits and rolls to the escape rule and
the draws, follows [the quantum rules of every variant](#the-quantum-rules-of-every-variant) above.

- **[Other dimensions](#other-dimensions):** [3D chess (Raumschach)](#3d-chess-raumschach),
  [Tri-Dimensional chess](#tri-dimensional-chess), [4D chess](#4d-chess),
  [Multiverse chess (5D)](#multiverse-chess-5d)
- **[Hidden information](#hidden-information):** [Kriegspiel](#kriegspiel), [Fog of war](#fog-of-war)
- **[Different rules](#different-rules):** [Chess960](#chess960), [Atomic](#atomic), [Crazyhouse](#crazyhouse),
  [Bughouse](#bughouse), [Antichess](#antichess), [King of the Hill](#king-of-the-hill),
  [Three-check](#three-check), [Horde](#horde)
- **[Different boards and more players](#different-boards-and-more-players):** [Hexagonal chess](#hexagonal-chess),
  [Four-player chess](#four-player-chess), [Capablanca chess](#capablanca-chess)
- **[Regional relatives](#regional-relatives):** [Shogi](#shogi), [Xiangqi](#xiangqi), [Makruk](#makruk)

---

### Other dimensions

#### 3D chess (Raumschach)

- **Board.** A 5 × 5 × 5 cube of five levels, A at the bottom (White's home) to E at the top (Black's home). A cell
  is named by level, file and rank, so `Aa1` is White's corner, `Cc3` the centre and `Ee5` Black's far corner. The
  levels are drawn as a grid: A and B at the bottom, C and D in the middle, E on top. Each side has 20 pieces: White's
  officers stand on rank 1 of levels A and B and its ten pawns on rank 2 of both; Black's army is White's turned
  through the centre of the cube.
- **Pieces.** Rooks move straight through the faces of a cell, also up and down; bishops move diagonally through its
  edges, within any flat slice of the cube; the **unicorn** (drawn as a knight with a horn) moves through its
  corners, changing level, file and rank at once. The queen combines all three, and the king steps to any of the 26
  touching cells. The knight jumps 2 cells one way and 1 another, across levels too, and jumps over anything in
  between.
- **Pawns.** A pawn steps one cell forward or one level up, and captures one cell forward and sideways, up and
  sideways, or forward and up; never straight ahead or straight up. For Black, forward is towards rank 1 and up is
  towards level A. A pawn that reaches rank 5 of level E (Black: rank 1 of level A) must become a queen, rook,
  bishop, knight or unicorn. There is no castling, no double step and no en passant.
- **Winning.** As in the shared rules. A stalemate, which the Raumschach federation (IRF) scores as a draw, is a win
  here for the side that stalemates.
- **Draws.** As in the shared rules. Kings are solid, so two bare kings are a draw exactly when they do not touch:
  when they touch, the draw waits, because the player to move can take the other king.
- **Lines through ghosts.** A rook, bishop, unicorn or queen that passes a cell where a piece might be is linked to
  it, on every level and along the vertical lines too. A knight jumps, so it is never blocked.
- **Splits and merges across levels.** A piece may split to any two certainly empty cells it could reach, on the
  same level or on different ones, even two cells on one line; where a ghost blocks the lane of one half, that half
  stays home in those possibilities. Two parts of one piece can merge onto a target from two different levels: a
  split unicorn that could take the king that way counts for the danger ring and for the escape rule.
- **A split can be the escape.** A piece split onto both lines of a double attack blocks each of them in half the
  possibilities, so neither attacker takes the king for certain.

#### Tri-Dimensional chess

- **Board.** Three 4 × 4 main levels, W (White's, lowest), N (neutral) and B (Black's, highest), and four 2 × 2
  attack boards. Each attack board stands on one of twelve pins at the corners of the main levels: QL1 to QL6 on the
  queen's side (files z and a) and KL1 to KL6 on the king's side (files d and e), numbered from White's end. Levels 1
  and 2 are the back and front corners of W, 3 and 4 those of N, 5 and 6 those of B. A board overhangs the corner of
  its pin outwards: on QL1 it holds z0, a0, z1 and a1, on QL2 z4, a4, z5 and a5. White's boards start on QL1 and KL1,
  Black's on QL6 and KL6, so there are 64 squares at the start. Board by Franz Joseph (1975), rules after Jens Meder's
  tournament rules.
- **Map squares.** Seen from above, all boards form one map with files z, a–d, e and ranks 0–9. A square is named by
  file, rank and board, so b3W and b3N are the two levels of map square b3, and a4QL2 is map square a4 on an attack
  board on pin QL2. The squares of a pin exist only while a board stands on it.
- **On screen.** W and B form one column, B above W, and N stands to the right of it. Every pin has a slot next to
  its corner, one row further out: QL6 and KL6 above B, QL1 and KL1 below W, QL4 and KL4 above N, QL3 and KL3 below
  N, and between B and W a band for the pins at ranks 4 and 5, which QL2 and QL5 (and KL2 and KL5) share because they
  cover the same map squares; with boards on both, a second band opens. An empty slot is a dashed outline, and every
  pin has a tab with its name, wooden while a board stands on the pin and pale while it is free. N's ranks 4 and 5 are
  level with the band between B and W, and its slots with the ranks of B and W; while a second band is open, N stands
  centred on both bands instead.
- **Moving.** Every move is an ordinary chess move on the map, and the piece may stop on any level of the target map
  square. Moving straight up or down is not a move. A piece on any level of a map square in between blocks a queen,
  rook, bishop or a pawn's double step. Gaps without a board count as empty: pieces fly across them but cannot stop
  there.
- **Moving an attack board.** Instead of a piece you may move an attack board that holds at most one piece (of either
  side) to a free pin next to it: on the same side one or two numbers up or down, or across to the same number on the
  other side. So a board on QL1 or QL6 has three neighbouring pins, on QL2 or QL5 four and on QL3 or QL4 five (QL3
  reaches QL1, QL2, QL4, QL5 and KL3). An empty board belongs to the side it started with; a board with a piece
  belongs to that piece's side and carries it along to the same place on the new pin. Only an empty board may move
  backwards, towards its side's end; a board with a piece moves forwards or across. To play it, tap the board's pin
  name, then the name of a free pin. The move is written with the two pins, such as QL1>QL3.
- **Pawns.** A pawn steps one map square forward onto any empty level, two on its first move, and captures
  diagonally forward onto either level. A pawn that has ridden a board no longer double-steps. En passant lands on
  either level of the skipped square, and a board move in between ends it.
- **Promotion.** A pawn promotes on the last rank of the file it arrives on: rank 8 on files b and c and rank 9 on
  files z and e (Black: rank 1 and rank 0). On files a and d it is rank 9 while an attack board stands on the pin over
  the far corner (QL6 or KL6), so that a pawn on a8 still has a9 ahead, and rank 8 when that pin is empty (Black:
  rank 0 with a board on QL1 or KL1, else rank 1). A pawn that a board move carries to the last rank of its file, or
  leaves on it because the board over the corner went away, promotes at once: to the piece the mover picks when it is
  the mover's own pawn (QL4>QL6=Q), to a queen when it is the other side's.
- **Castling.** From your second move on, while the king and that rook have not moved. King's side: the king and the
  rook next to it swap places. Queen's side: once the queen's home square (a0QL1, for Black a9QL6) is empty, the king
  goes there and the corner rook goes to the king's square. A king or rook that rides a board has moved.
- **Winning and draws.** As in the shared rules. A board move is a move like any other, so it can be the way out for
  a king that could not escape on foot.
- **Ghosts across levels.** A ghost on either level of a map square blocks slides across it in its possibilities,
  but a ghost on the other level of your target square does not matter. A piece split over both levels of one map
  square is a certain wall across it and an uncertain target.
- **Ghosts and attack boards.** An attack board is never a ghost: it stands on the same pin in every possibility. A
  ghost part standing on a board that moves rides along in the possibilities where it stands there, and stays where
  it is in the others, so the piece stays a ghost with the same odds and the same links. When a ghost makes a board
  move impossible in some possibilities (the board would hold two pieces there, would belong to the other side, or
  could not go backwards with a piece on it), the move is settled by a roll: Moved (the ghost was elsewhere) or
  Missed (it was on the board, which stays).

#### 4D chess

- **Board.** A 4 × 4 × 4 × 4 hypercube, drawn as a 4 × 4 grid of small 4 × 4 boards named A1 (bottom left) to D4
  (top right). A cell is named board, then square: `B2c3` is square c3 on board B2. Stepping to the same square on
  the next board left, right, up or down counts as one step, just like stepping to the next square on a board. Each
  small board is a checkerboard, and neighbouring boards have opposite colours.
- **Setup.** TessChess by Ben Reiniger: each side has 8 pieces and 12 pawns. White's pieces stand on rank 1 of the
  bottom boards A1 to D1 and its pawns on rank 2 of boards A2 to D2; Black's are mirrored on the top boards. Queens
  face queens and kings face kings, and no piece is attacked at the start.
- **Rook, bishop, queen.** The rook moves along a rank or file of its board or to the same square on other boards in
  its row or column of boards, or one square diagonally plus one board straight (or one square straight plus one
  board diagonally) per step. The bishop moves diagonally on its board, to the same square on a diagonal line of
  boards, one square plus one board straight per step, or one square and one board diagonally at once; it never
  leaves its colour. The queen goes in any of these 80 directions. A line can cross boards, and only the cells on the
  line itself block it.
- **King and knight.** The king steps to any touching cell, up to 80, on its own board and the boards around it,
  diagonal neighbours included. The knight jumps 2 steps one way and 1 step another, also between boards, and is
  never blocked.
- **Pawns.** A pawn moves one square up its board or to the same square one board up (Black: down). It captures one
  step forward plus one step sideways, a square or a board to the left or right, never straight ahead. A pawn must
  promote on rank 4 of the top boards A4 to D4 (Black: rank 1 of A1 to D1), to a queen, rook, bishop or knight.
  There is no castling, no double step and no en passant.
- **Winning.** As in the shared rules. A queen next to a king in a corner, guarded by its own king, leaves it no
  escape.
- **Draws.** As in the shared rules. Two bare kings are a draw exactly when they do not touch.
- **Ghosts across boards.** A ghost on another board can block a slide that crosses its cell, and the slide is then
  linked to it. The two halves of a split may go to different boards, even along one line. Two parts of one piece
  on two different lines can merge onto one cell, so a converging capture of a king can be certain. A split can also
  save a king that two lines attack: each half blocks one line, so neither capture is certain any more.
- **Pawns probe in two directions.** A pawn can push onto its board or onto the next board, so it can test two cells
  where a ghost might stand.

<!-- multiverse -->
#### Multiverse chess (5D)

*5D Chess With Multiverse Time Travel*, with ghosts. The official start positions are there, 44 of them: the
Standard family, the Simple, Small and Very Small boards, the Focused games with one kind of piece (down to *Just
Kings* on 3 × 3), the Misc games and the checkmate practices. Only *Global Warming* is left out, the original's joke:
an empty 1 × 1 board that is drawn before the first move. A new game starts on **Small** (5 × 5); **Very small and
open** (4 × 4) is the easiest start, and **Standard** (8 × 8) is the real, long game and is best on a laptop.

- **Timelines and turns.** Each row is a timeline and time runs to the right. You play only on the latest board of a
  timeline, when it is your move there (○ White, ● Black); every move adds a new board, and the old ones stay as the
  past. On your turn you move once on every board marked *must move* (the present, *Now*) and may move on your
  *optional* boards. The turn ends by itself when no board is left, otherwise with **Submit turn**. A board takes part
  in at most one move per turn.
- **Time travel.** Pieces also move back in time (one step is one turn) and across timelines. Landing on another
  timeline's latest board jumps there; landing on an older board opens a new timeline, a copy of that board that only
  your piece enters. Each player may open 1 to 4 new timelines (an option, 3 by default; four is marked *laptop*, and
  a game that starts with three timelines, or with two on 8 × 8, keeps three); after that, jumps still work and a king
  in the past can still be captured. Pieces can travel back 2 turns on boards up to 5 × 5 and 4 on larger ones (an option: 2 or 4); older
  boards are sealed.
- **Unusual starts.** In *Timeline Fragments* the −0 timeline starts half a turn later, with Black to move: White's
  first turn is one move on +0, Black's first turn a move on each timeline. In the checkmate practices White has a
  lone king and Black a piece or three pawns and no king: Black wins by capturing the king, and White draws by
  capturing the attackers (Black, left without pieces, cannot play its turn) or by holding out. Play Black to practise.
- **Active timelines and the present.** Your n-th new timeline is *active* while your opponent has opened at least
  n − 1; an inactive timeline can still be played. The present is the earliest latest board of the active timelines,
  so an active timeline opened in the past moves the present back to its board, which becomes a must-move board.
- **All official pieces.** Rook, bishop, queen, king and knight keep their pattern in all four directions (file, rank,
  time and timeline): the rook moves along one of them, the bishop along two at once, the **unicorn** along three, the
  **dragon** along all four, and the queen along any number; the king steps one along any number of them, and the knight
  jumps two along one and one along another. The **princess** moves like a rook or a bishop, the **royal queen** like a
  queen but is royal, and the **common king** like a king but is not royal. The unusual pieces are drawn as letters: U
  unicorn, D dragon, S princess, Y royal queen, C common king; the **brawn** is a pawn with a crossbar (W in the move
  list).
- **Pawns and brawns.** They step one rank forward or one timeline towards the opponent's timelines, make a double
  step while unmoved (on the board or across two timelines), and capture diagonally forward on their board, or one
  timeline forward and one turn back or ahead on the same square. A brawn also captures sideways or one rank forward
  together with one timeline forward, or one rank forward and one turn back. Both become queens on the last rank. En
  passant works on one board only, on the move right after the double step. Kings castle on their own board.
- **Boards are certain, pieces are quantum.** Which boards exist, the present and whose turn it is are the same in
  every possibility; only the pieces on them, now and in the past, can be ghosts. Timelines are AND, possibilities
  are OR. Kings, royal queens, common kings, pawns and brawns are solid: they never split.
- **A move always makes its boards.** The dice only decide what happens to the piece: a ghost that travels arrives
  where it really stood and stays home elsewhere, linked. A Missed move still uses its board and still opens its
  timeline, and a Measure is your move on the board of the part you measure; the rest of your turn goes on.
- **One board per split.** Both halves of a split land on one board: yours, another timeline's latest board, or a
  past board, which opens one timeline. A merge starts from two parts on one board, and you measure a ghost through a
  part on a board you may play now.
- **The quantum past.** Old boards show ghosts with their chances, and landing on them is a roll. New timelines copy
  ghosts as *twins*: separate pieces, each there in exactly the possibilities in which the original stood on its
  square, so finding one settles all. After a merge the past remembers both paths (and they count for your budget of
  8) until those boards are sealed.
- **Winning.** Capture a king or royal queen on any board, also in the past; with several kings, losing any one
  loses. The danger line is 5D's check: the chance that your opponent could take a king or royal queen of yours if
  you passed your must-move boards now, with the boards where it stands. The threatened squares are tinted and joined
  by a red line to the attacker, drawn on the board the capture would be made from. In pass & play the line always
  speaks for the player to move.
- **A turn that cannot be finished.** If your turn cannot be finished from its start, the game ends: checkmate when a
  king or royal queen of yours can be taken for certain, otherwise stalemate (a draw). A move after which you cannot
  finish your turn loses, also when its roll decides it; the game asks before you play it.
- **Draws.** Stalemate as above, 300 moves in a row without a capture or a pawn or brawn move, and 1,200 moves in the
  game (Submit turn counts as a move in both). The quiet-move draw waits while the player to move can capture an enemy
  king or royal queen for certain. Two bare kings are not a draw: kings can still reach each other through time. The
  shared escape rule does not apply: a turn that cannot be finished takes its place.
- **Reading the board.** Boards where White is to move have a light frame, Black's a dark one. Must-move boards have
  a gold halo, optional ones a blue halo, and an inactive timeline is hatched. Dashed outlines show where the next
  board of a timeline will appear, and blue arrows the travel of your turn so far and of your opponent's last turn.
  The header counts the new timelines of each player and says how far back pieces can travel. Black's timelines are
  drawn above White's; the option *Drawn at the bottom* puts Black at the bottom and turns the boards (against the
  computer it follows your side), and time still runs to the right, so there is no *Flip board*.
- **Finding your boards.** The view zooms in on the boards you have to play and follows them as the turn goes on:
  ‹ and › step from one board to play to the next, *Recentre* goes back to them, and *Whole board* shows the whole
  multiverse. Pinch or Ctrl + wheel to zoom, drag to pan.
- **Notation.** Moves are written with their board, timeline and turn, in the manner of 5dpgn:
  `(0T2)Nc3>(+1T2)c3` jumps to another timeline, `(0T2)Nc3>>(0T1)a3` opens a new one, and `x` marks a capture.
- **Larger limits.** Four new timelines per player are meant for a laptop: on Standard (8 × 8) with 64 possibilities
  one step of the game (the legal moves, the danger, the drawing and the move) took 0.09 to 0.13 s on a desktop
  computer, and a saved game about 200 KB (at most about 440 KB after 1,200 moves). Standard with two timelines keeps
  three: there a fourth took 0.13 to 0.17 s per step, over the 0.15 s a step may take, and its saved game could pass
  500 KB after 1,200 moves. A game that starts with three timelines keeps three too: its fourth ones would need the
  rows of −0 and +0. A travel reach of 6 turns and a fifth timeline per player are not offered. Every board has a fixed
  place in the app's numbering of squares, 9 per timeline (the latest and 8 older ones) in 11 rows. A reach of 6 needs
  13 places per timeline, which makes every world of every game about 10 % larger and draws 5,800 instead of 4,000
  squares on 8 × 8, while a reach of 4 already allows every travel seen in recorded games. A fifth timeline needs up to
  four more rows, moves −0 and +0 to other places, and took 0.14 to 0.15 s per step, the most a step may take.
- **Differences from the original.** Capture the king instead of the check rule, so the original stalemate (not in
  check, but every turn would leave a king in check) is not a draw here: you play your turn and your king can be
  taken. Castling is allowed out of, through and into danger. Moves inside a turn are played and rolled one by one and
  cannot be rearranged before you submit, so a move that strands your own turn loses. At most 4 new timelines per
  player and a travel reach; castling and en passant only when certain; Undo replays the same rolls. As in 5D, pawns
  and brawns always become queens (in Quantum Chess you would choose). Apart from these differences the app plays as
  5d-chess-js, an independent implementation of 5D chess: a test replays random games on every start position and
  compares the legal moves, the boards that must move, Submit and 5D check at every position.

<!-- /multiverse -->

---

### Hidden information

#### Kriegspiel

- **Board and pieces.** Ordinary chess on an 8 × 8 board with the usual start position, castling, double steps, en
  passant and promotion. You see only your own pieces, with their ghosts and odds; the board shows no enemy piece
  until the game ends, when everything is revealed.
- **The umpire decides every attempt.** The board offers every move your pieces could make if the enemy pieces were
  not there, plus the pawn captures onto squares that look empty to you ("pawn tries"). If a move is impossible in
  every possibility, the umpire says no: try again. Your turn is not used and your opponent is not told.
- **Accepted means played.** A move that is possible in at least one possibility is played at once, with a roll if
  needed, and you see only its result (Moved, Missed or Captured), never the odds. A missed move still uses your
  turn. Castling past a square where a hidden piece might stand gets "no", because castling must be possible in
  every possibility.
- **What both players hear after every move.** That a move was made; each capture, with the square of the captured
  piece and whether it was a pawn or a piece (en passant is announced on the captured pawn's square); check, with
  its directions (file, rank, long or short diagonal from the king's point of view, knight) and the chance that one
  enemy move, a merge included, could capture the king; and how many pawn captures the player to move might be able
  to make. Promotions, castling, en passant as such, splits, merges and measurements are never announced.
- **Winning and draws.** As in the shared rules, decided by the umpire on the real board, which neither player
  sees. The umpire never refuses a move because of check: you may move into check, and castle out of, through or
  into check. You win when your opponent's king cannot escape, even if you never saw that king. The 50-move count is
  secret, so that draw can come without warning.
- **Splits, merges and measurements.** You choose them from your own pieces, but the umpire decides on the real
  board. A split onto a square where an enemy piece might stand gets "no", and a hidden piece can make a split go
  over the budget, or keep it under. Measuring your own ghost is always accepted.
- **Your ghosts tell you things.** If one of your ghosts suddenly becomes solid, an enemy move tried to land on or
  pass through one of its squares, or settled a piece it was linked to. A pawn try onto a square where an enemy
  ghost might be is a roll: Captured, or Missed (and the opponent sees that ghost settle on its other squares). An
  enemy move that is rolled, such as a pawn's double step or a capture, also decides each of your ghosts on its
  path: the ghost either blocked the move or is not there, even when the move landed somewhere else.
- **Pass & play.** After your move you see its result and what the umpire said, then hand the device over. Undo is
  off while the game runs, and the opponent's budget is shown as "?".

#### Fog of war

- **Board and pieces.** Ordinary chess on an 8 × 8 board with the usual start position, played as Dark chess is on
  chess.com. The pieces move as usual, and castling, en passant and promotion are unchanged.
- **What you see.** Only your own pieces and the squares they could move to. Every other square is covered in fog.
  An enemy piece shows up only on a square you can see, which usually means you could capture it. Nothing else is
  announced: the opponent's moves appear as "A move", and when one of your pieces is taken you see "Capture on …"
  with the square where it stood.
- **Pawns.** A pawn sees the square in front of it only when that square is empty, so a dark square right in front
  of your pawn means something is standing there. It sees a diagonal square only when there is an enemy piece on it,
  or when it can capture en passant: then the passing pawn is visible, for that one turn only.
- **Winning.** As in the shared rules, but nobody warns you of danger: you may move into attack and castle out of,
  through or into attack, and your own king can be taken by a piece you never saw. If your king cannot escape, you
  lose at once even when you cannot see the attacker, and the whole board is revealed.
- **Draws.** Two bare kings are **no** draw, as on chess.com: the kings cannot see each other, so a king that steps
  next to the enemy king unaware can be taken. The 50-move rule counts the moves you could not see too, so it can
  come without warning. The other draws are the shared ones.
- **Ghosts see from every square.** A square is visible when, in at least one possibility, one of your pieces or
  ghost parts stands on it or could move to it. Splitting a piece therefore also scouts: `g1-f3|h3` from the start
  lets you look at e5 and g5 as well.
- **Enemy ghosts.** A visible square shows everything that might stand there, each with its chance. A part of an
  enemy ghost that stands in the fog stays hidden. The odds shown before your own move use only what you can see.
- **Castling and en passant.** An enemy ghost that might stand between your king and rook blocks castling. The en
  passant chance ends after the next turn, whatever that turn is (a Measure too).
- **Pass & play.** Each player sees only their own view. After your move you still see your board, then hand the
  device over when asked. While the game runs, undo is off and the opponent's budget shows "?". When the game ends,
  the whole board and every move are revealed.

---

### Different rules

#### Chess960

- **Board and pieces.** The ordinary 8 × 8 board and pieces. The pawns start as usual, but the pieces behind them
  start in one of 960 shuffled orders: the two bishops on squares of different colours, the king somewhere between
  the two rooks. Black's pieces mirror White's, file for file. Every piece moves as in ordinary chess; double steps,
  en passant and promotion are unchanged.
- **Start position number.** Every start position has a number from 0 to 959, the same numbers as on lichess.
  Number 518 is the ordinary chess setup (RNBQKBNR). Type a number in the New game dialog or press Random; the game
  info shows the back rank and its number, for example "RNBQKBNR (518)".
- **Castling.** Move your king onto the rook you want to castle with: pick the king, then click that rook.
  Afterwards the king and rook stand where they would in ordinary chess: king on g and rook on f (O-O), or king on c
  and rook on d (O-O-O). Sometimes only the king or only the rook moves, or the two swap places, and in some start
  positions you can castle on your first move.
- **What castling needs.** Neither the king nor that rook has moved, and every square either of them crosses or
  lands on is empty, apart from the two of them. Squares outside those paths may stay occupied. Castling ignores
  attacks: you may castle out of, through or into attack.
- **Winning and draws.** As in the shared rules.
- **Castling and ghosts.** A ghost that might stand on one of the squares castling needs, even one of your own,
  blocks it; measuring your ghost can clear the way. A lost right does not come back, not even when a measurement
  finds the rook at home. A rook or king move that Missed keeps the right.

#### Atomic

- **Board and pieces.** Ordinary chess on an 8 × 8 board with the usual start position. The pieces move as usual,
  and castling, en passant and promotion are unchanged, except that a king never captures.
- **Every capture explodes.** The captured piece, the capturing piece and every piece except pawns on the eight
  squares around the capture square leave the board, whoever they belong to. Pawns only go when they capture or are
  captured. A promotion that captures explodes at once, and a blown-up rook takes its castling right with it. After
  an explosion, the board shades and outlines its blast area until the next move.
- **En passant.** The explosion is centred on the square the capturing pawn moves to, not on the captured pawn.
- **Your own king.** You may never capture on a square next to your own king, because the blast would reach it. So
  kings never capture, and two kings that touch cannot be captured directly. A touching king can still be blown up
  by a capture next to it that is not next to the other king.
- **Winning.** Blow up the enemy king, by capturing it or anything next to it (a pawn too). A blow-up counts as a
  capture of the king everywhere: the danger ring shows the chance that one enemy capture could blow your king up,
  and the escape rule counts blow-ups: if every move you have would let your king be blown up for certain, you lose
  at once, unless one of your moves could still blow up the enemy king.
- **Draws.** Only the two kings left is a draw at once. If a ghost is blown up in only some possibilities, so that
  only the kings are left in some of them, a roll decides whether the game ends. A side without any legal move at
  all draws, even with its king at 100 % danger. The other draws are the shared ones.
- **Explosions never roll by themselves.** A capture that might miss is rolled as usual (Captured, Moved, Missed),
  and the explosion happens exactly in the Captured result. A converging capture that is certain explodes for
  certain, so a merge next to the enemy king can win without dice.
- **Ghosts in a blast.** A ghost part in the blast area is destroyed only in the possibilities where the piece really
  stands there. The piece survives with the chance of its other parts, and measuring it may find it "No longer on
  the board". When you split such a piece, "destroyed" counts as one of the 4 places a split may leave it on, so the
  split can put it on at most 3 squares.
- **Maybe next to your king.** A move onto a square next to your own king, and any king move, is rolled when an
  enemy piece might stand there: it misses where the piece really is, and moves where the square is empty.

#### Crazyhouse

- **Board and pieces.** The ordinary 8 × 8 board and start position. Castling, en passant and promotion work as in
  chess. Each player also has a **hand**, shown on their side of the board (above or below it), which starts empty.
- **Captures change sides.** A piece you capture changes colour and goes into your hand. A captured king never
  does: capturing it ends the game.
- **Drops.** Instead of moving, you may take a piece from your hand and drop it onto any empty square. Pawns may not
  be dropped on rank 1 or rank 8. Every other piece may go anywhere, and a pawn may join another pawn on the same
  file. In the move list a drop is written like `N@f3`.
- **Dropped pieces are ordinary pieces.** A pawn dropped on your own second rank may still move two squares. A pawn
  dropped on your seventh rank can promote on its next move. A dropped rook can never castle, not even from its
  corner.
- **Promoted pieces.** They are marked with a small red +. When one is captured, the capturer gets a pawn, not the
  promoted piece.
- **Winning.** As in the shared rules, and drops count for the escape rule: a piece dropped in between can shield a
  king (not from a knight or a pawn), and a drop that leaves the enemy king no escape (a drop mate) ends the game at
  once.
- **Draws.** As in the shared rules. Captured pieces never leave the game, so the bare-kings draw cannot happen.
- **Drops and ghosts.** Dropping onto a square where a ghost might stand is a roll. Either your piece lands and the
  ghost is known not to be there (**Dropped**), or the ghost is found there and your piece stays in your hand
  (**Missed: the piece stays in hand**). Your turn is used either way.
- **Hands are always certain.** Capturing a ghost is a roll, so afterwards the piece has been captured in every
  possibility or in none. You always know exactly what is in both hands, and pieces in hand never use your budget.
- **You cannot split a drop.** A dropped piece lands on one square. From your next turn on, a dropped knight,
  bishop, rook or queen may split like any other piece.

#### Bughouse

- **Boards and seats.** Four players on two ordinary chess boards, A and B, both in the usual start position. White
  A and Black B form Team 1; White B and Black A form Team 2. Partners play opposite colours on different boards and
  sit side by side, as over the board: against the computer your team is at the bottom; in pass & play Team 1 is, or
  the team to move when "Turn the board to the player to move" is on.
- **Turn order.** White A, White B, Black B, Black A, then again. Each board still alternates White and Black, and
  the teams alternate on every move, so two people can play by passing the device. Each player's name stands at the
  edge of the board where they sit, the board of the player to move has a wooden rim, and the pieces in hand are
  shown under their board.
- **Captures and drops.** Whatever you capture goes straight into your partner's hand, in its own colour. Instead of
  moving, a player may drop a piece from their hand on any empty square of their own board. Pawns are never dropped
  on the first or last rank. A pawn dropped on its own second rank may still move two squares; a rook dropped in its
  corner never castles.
- **Promotion.** A pawn promotes on the far rank; the new piece carries a small red + and is passed on as a pawn if
  it is ever captured.
- **Castling and en passant.** Each player castles on their own board as usual. En passant belongs to one board: it
  is possible only on that board's next turn, however many moves the other board makes in between.
- **Winning.** Capture any king. That ends the game on both boards at once, and the king's team loses. The escape
  rule does not apply: a king that cannot escape must still be captured, and the partner may win on the other board
  first. One player resigning resigns for the team. A player who has no legal move at all sits out until they can
  move again.
- **Draws.** The game is drawn after 50 moves by each player without a capture, a pawn move or a drop (unless the
  player to move can capture a king for certain), and at the move limit of 300 moves by each player.
- **The team budget.** Partners share one budget of 8 possible arrangements, not 8 each, so your partner's ghosts on
  the other board limit your splits too. A slide that would link your piece to a ghost is rolled instead when your
  team's budget is full.
- **Drops and ghosts.** A drop onto a square where a ghost (yours or the opponent's) might stand is a roll. If the
  square was empty, the piece lands (**Dropped**); if it was taken, the ghost is found there and the piece stays in
  your hand (**Missed: the piece stays in hand**). A drop is therefore a cheap way to find out where a ghost is.
- **Captures and ghosts.** Capturing a ghost is a roll on your board only. If it is captured, your partner certainly
  gets it; if not, they certainly do not, so hands are never uncertain and the other board's odds never change.

#### Antichess

- **Board and pieces.** Ordinary chess on an 8 × 8 board with the usual start position. There is no castling. Double
  steps and en passant work as usual. A pawn that reaches the last rank may also promote to a king.
- **Winning.** Lose all your pieces, or be the player to move with no move left (stalemate wins). The counter next
  to each player's name shows how many pieces that side still has.
- **Capturing is compulsory.** If any of your moves might capture, in any possibility, you must play one of them. You
  choose which one, including a try that may well miss. While you must capture you cannot split or measure, and you
  may merge only if the merge might capture.
- **The king is an ordinary piece.** Kings may be captured like any other piece, and losing yours does not end the
  game, so the escape rule does not apply either. A side may have several kings. Kings and pawns are still always
  solid.
- **Draws.** The game is drawn when no capture can ever happen again: only bishops and pawns are left, the two
  sides' bishops stand on different square colours, and every pawn is blocked by a pawn and stands on its own
  bishops' colour. The shared 50-move rule applies, and a king move does not reset it, even though the king is an
  ordinary piece here. Two lone kings are not a draw.
- **Capture tries on ghosts.** A capture try onto a square where an enemy piece might be is settled by a roll. Where
  the piece is there, it is Captured. Where it is not, the move counts as an ordinary move if you had no other
  capture in that possibility (Moved), and it is Missed if you had one. A pawn's diagonal try is always Missed there.
- **Ghosts force captures.** A part of a ghost that the opponent could capture obliges them to try, even at 25 %.
  Your own ghost part that could capture obliges you in the same way.
- **Stalemate and ghosts.** Whether a player can move is checked in every possibility. If it depends on where a
  ghost really is (yours or your opponent's), a roll decides whether the player to move is stalemated, and so wins.
  A Measure does not count as a move.

#### King of the Hill

- **Board and pieces.** Ordinary chess on an 8 × 8 board with the usual start position. Castling, en passant and
  promotion are unchanged. The four centre squares d4, e4, d5 and e5 form the **hill**, which is shaded and outlined
  on the board.
- **Winning.** Move your king onto a hill square and you win at once. Capturing the enemy king and the escape rule
  win as usual; a king step onto the hill always counts as an escape, since it may win at once. Pieces other than
  the king may stand on the hill, but that does not win anything.
- **The hill-entry rule.** Your king may not step onto a hill square that an enemy piece would attack once your king
  stands there. Pinned pieces and the enemy king count too, and so does a rook, bishop or queen whose line runs
  through the square your king leaves. This is the only place where attacks limit your king: everywhere else it may
  walk into danger as usual.
- **Capturing onto the hill.** Taking an enemy piece on a hill square with your king also wins, as long as no other
  enemy piece attacks that square afterwards.
- **Draws.** Two lone kings are no draw: they still race for the hill. A king that reaches the hill wins even on a
  move that would otherwise end the game in a draw. The other draws are the shared ones.
- **Ghosts and the hill.** The hill-entry rule is checked in every possibility. If a ghost means the square would be
  attacked in only some of them, the king step is a roll. Either your king arrives and you win, or the move is
  Missed: your king stays where it was, your turn is used, and only the possibilities in which the step was
  impossible remain. Your own ghost on the square makes the step Missed where it really stands there.
- **Guarded everywhere.** A ghost that attacks the square from each of its parts (two, three or four) guards it for
  certain, so the step is not offered at all, even though no single part of the ghost is certain.

#### Three-check

- **Board and pieces.** Ordinary chess on an 8 × 8 board with the usual start position. Castling, en passant and
  promotion are unchanged.
- **What a check is.** Your move gives check when, after it, one of your pieces other than your king attacks the
  enemy king. A double check counts once, and a discovered check counts. A king never gives check: a king next to
  the enemy king can simply be captured.
- **Winning.** Give your third check and you win at once, even if your own king is attacked. Capturing the enemy
  king and the escape rule win as usual. For the escape rule, a move that might give its player the third check,
  even in some possibilities only, is an escape, like a move that might capture the enemy king. The counter next to
  each player's name shows how many checks that side has given.
- **Checks left standing.** There is no check rule, so your opponent may leave their king attacked. Each of your
  moves after which it is still attacked counts another check. Moving the attacker away or blocking its line counts
  nothing.
- **Draws.** As in the shared rules. A king and any other piece against a lone king is not a draw, since checks can
  still win.
- **Checks are always certain.** If your move gives check in some possibilities but not in others, a roll settles
  it at once, and the ghosts involved collapse with it. This can happen after any move, even one that would not roll
  by itself: a split, castling, en passant, a merge, or a slide past a possible piece. A move that might give the
  third check is settled the same way: either the game ends, or it goes on with the old count.
- **Misses and measurements.** Where your move missed because the ghost part was not really there, no check is
  counted, even if the enemy king is attacked there. Measuring never gives check.
- **Splits.** If both halves of a split give check, the check is certain and the piece stays a ghost; if only one
  half does, the roll decides which half was real.

#### Horde

- **Board and pieces.** An ordinary 8 × 8 board. White (the horde) has 36 pawns and no king: every square of ranks
  1 to 4, plus b5, c5, f5 and g5. Black has the usual army on its usual squares. White moves first.
- **Double steps.** A White pawn on the first or the second rank may move two squares if both squares ahead are
  free, even if it has moved before. A double step from the first rank cannot be captured en passant. One from the
  second rank (or Black's from the seventh) can, on the very next turn only, as usual.
- **Castling and promotion.** Only Black can castle. Pawns of both sides promote to a queen, rook, bishop or knight.
- **Winning.** White wins by capturing the Black king, or when it cannot escape, even if it is not attacked now
  (lichess scores such a position as a stalemate draw). A Black move that might capture the last White piece, even
  with a small chance, counts as an escape, because that capture would end the game. White has no king, so it never
  loses this way. Black wins by capturing every White piece, including pieces White got by promotion. The counter
  next to White's name shows how many White pieces are left.
- **Draws.** If the player to move cannot move any piece at all (stalemate), the game is drawn. This mostly happens
  when every White pawn is blocked. There is no bare-kings draw, because White never has a king. The 50-move draw
  waits while White can capture the Black king for certain, but not while Black can capture the last White piece
  for certain: the shared rule waits only for a king capture.
- **White is solid.** Pawns are always solid, so White cannot split anything until it promotes. Its quantum play is
  probing Black's ghosts: a pawn push or capture onto a square where a ghost might stand is a roll.
- **Stalemate and ghosts.** Stalemate is checked in every possibility. If a Black ghost might block the horde's last
  free pawn, a roll right after the move decides whether the game is drawn. A split whose part could block that pawn
  is settled in the same way. Being able to Measure does not count as having a move.
- **The last White piece.** Whether it is captured is decided by the capture's own roll, so the win for Black never
  needs an extra roll, even when that last piece is a promoted ghost.

---

### Different boards and more players

#### Hexagonal chess

- **Board.** Gliński's board of 91 hexagons in three shades. The 11 files a to l (there is no j) run straight up.
  The ranks bend in a V around the middle file f, so f1 is the lowest cell and f11 the highest. Each side has the
  usual pieces plus a third bishop: king g1, queen e1, rooks c1 and i1, bishops f1, f2 and f3, knights d1 and h1,
  and nine pawns in a V from b1 up to f5 and down to k1. Black's army is the mirror image at the top: king g10,
  queen e10, bishops f9, f10 and f11, and the pawns on rank 7 from b7 to k7.
- **Lines.** Rooks move through the six sides of a cell (up and down the file, and along both branches of the
  ranks). Bishops move along the six diagonals through its corners: left, right and four steep lines. A bishop never
  leaves its shade, so each side has one bishop per shade. The queen combines both, and the king steps one cell in
  any of the 12 directions.
- **Diagonal steps are never blocked from the side.** A diagonal step passes between two cells, and pieces on those
  two cells do not stop it. So a ghost beside a bishop's diagonal never links the bishop and never causes a roll.
- **Knight.** It jumps two cells along a rook line and then one cell turned 60°, to up to 12 cells. It cannot be
  blocked.
- **Pawns.** A pawn moves one cell straight up its file and captures one cell forward-left or forward-right, onto
  the neighbouring cells (not along a diagonal). A pawn on any starting cell of its side's pawns may move two cells
  if both are empty, even if it got there by capturing. A double step that might be blocked by a ghost is a roll:
  Moved or Missed, never a single step. At the far end of its file (the top edge for White, rank 1 for Black), a
  pawn becomes a queen, rook, bishop or knight.
- **En passant and castling.** Right after a double step, an enemy pawn that could capture on the skipped cell may
  take the pawn there, on that move only; a Measure or a missed move ends the chance too. There is no castling.
- **Winning and draws.** As in the shared rules, so a stalemate is a win for the side that stalemates, in line with
  Gliński, who scores stalemate in its favour. One difference: a player with no move at all loses instead of
  drawing.

#### Four-player chess

- **Board and armies.** A 14 × 14 board without its four 3 × 3 corners (160 squares). Red, Blue, Yellow and Green
  each start on one arm with the usual pieces (queen to the left of the king) and move clockwise: Red, Blue, Yellow,
  Green. Every player sees their own army at the bottom.
- **Pawns.** Pawns walk towards the opposite side and may double-step from their start line. They promote to a
  queen, rook, bishop or knight on their 8th line in free for all (just past the middle) and on their 11th line in
  Teams.
- **Castling and en passant.** Castling works as usual on both wings, along a file for Blue and Green. A pawn that
  has just moved two squares may be taken en passant only by the next player, and only with a pawn standing next to
  it; an en passant capture onto the promotion line promotes.
- **Free for all (default).** Capture a king and that player is out: their whole army, ghosts included, leaves the
  board, and any links to it dissolve. The last king standing wins. A player who cannot move sits out that turn.
- **Teams (option).** Red and Yellow play against Blue and Green. Your partner's pieces block you like your own and
  cannot be captured; landing where your partner might stand is rolled, passing that square links. The first king
  captured loses the game for its team, and a player who cannot move draws the game.
- **A king must be captured.** The escape rule does not apply: a king that cannot escape does not lose at once, not
  even when only two players are left. The game goes on until someone captures it.
- **Draws.** The game is drawn after 200 moves in a row (all players together) without a capture or a pawn move, at
  1200 moves in total, and in free for all when two lone kings are left that are not next to each other. The
  200-move draw waits while the player to move can capture a king for certain.
- **Quantum budget.** Shared fairly: each player may use 2 arrangements while four are in the game, 4 with three and
  8 with two. So with four players each of you can keep one 50/50 ghost; the budget grows at once when a player is
  out.
- **Kings and danger.** Kings are solid, so a king capture is always settled by a roll and whether a player is out
  never depends on the possibility; the next player to move follows that roll. The danger ring counts every enemy
  (all three in free for all, both in Teams) and their converging captures, not only the next player, and never your
  partner.

#### Capablanca chess

- **Board and setup.** A board 10 squares wide (files a to j) and 8 high. From a to j each back rank is rook,
  knight, archbishop, bishop, queen, king, bishop, chancellor, knight, rook, so the kings start on f1 and f8. Each
  side has ten pawns on its second rank.
- **The new pieces.** The archbishop (A) moves like a bishop or like a knight, the chancellor (C) like a rook or like
  a knight. Each move is either a slide or a jump, never both. The archbishop is drawn as a bishop and a knight side
  by side, the chancellor as a rook and a knight.
- **Castling.** The king moves three squares towards its rook, to i1 or c1 (i8 or c8 for Black), and the rook lands
  next to it on the other side (h1 or d1, h8 or d8). Neither may have moved before, and every square between them
  must be empty: three pieces have to leave on the j-side and four on the a-side.
- **Pawns.** As in chess, with the double step from the start rank and en passant. A pawn on the last rank must
  promote to a queen, chancellor, archbishop, rook, bishop or knight.
- **Winning and draws.** As in the shared rules. A king with a chancellor or an archbishop can leave a lone king no
  escape.
- **Ghost archbishops and chancellors.** They split and merge like a queen. Their knight jump flies over ghosts and
  is never blocked; their slides can be blocked by a possible piece and then link, like any slider. A split may pair
  two jumps, two slides or one of each. When the piece has no other part, a jump and a certainly clear slide that
  meet on the enemy king capture it for certain; if the piece might also stand on a third square, or a ghost might
  block the slide, the merge is rolled.
- **Castling and ghosts.** A ghost of either side on any square between the king and the rook blocks castling until
  that square is certainly empty again, but you keep the right. Splitting a piece off the path with two jumps (for
  example the chancellor from h1 to g3 and i3) lets you castle for certain.

---

### Regional relatives

#### Shogi

- **Board and start.** A 9 × 9 wooden board. Files are numbered 9 to 1 from Sente's left, and ranks are lettered a
  to i from Gote's side, so squares read `7g` or `5e`. Sente (black) sits at the bottom and moves first. Gote
  (white) sits at the top. Each side has a king, a rook, a bishop, two gold and two silver generals, two knights,
  two lances and nine pawns. The pieces are pentagons that point at the opponent, so the direction shows who owns a
  piece.
- **Pieces.** The king, rook and bishop move as in chess. The **gold** steps one square in any direction except
  diagonally backwards. The **silver** steps one square diagonally or straight forward. The **knight** jumps only
  forwards: two squares ahead and one to the side. The **lance** slides straight forward. The **pawn** steps
  straight forward and also captures that way. Every piece captures the way it moves.
- **Promotion.** The three far ranks are the enemy camp. Any piece but the king and the golds may promote when a
  move starts or ends there. Promoted pieces are written in red. A promoted rook (dragon) or bishop (horse) also
  steps one square like a king, and every other promoted piece moves like a gold. A pawn or lance on the last rank
  must promote, and so must a knight on the last two ranks. A captured piece loses its promotion.
- **Drops.** A captured piece changes sides and goes into your hand. Instead of moving, you may drop a piece from
  your hand onto any empty square. It is always unpromoted, even in the enemy camp. There are three limits: no pawn
  on a file that already has one of your unpromoted pawns, no pawn, lance or knight where it could never move, and
  no pawn drop that attacks the enemy king and leaves it no escape. In the move list a drop is written like `P*5e`,
  and a promotion like `7c-7b+`.
- **Winning.** Capture the enemy king. The escape rule is shogi's checkmate, and also its stalemate, where the king
  is not attacked but every move exposes it; in shogi both lose. A pawn drop may not give checkmate (see Drops), but
  it may leave the king stalemated. A player who has no move at all loses.
- **Impasse.** You also win by impasse. At the start of your turn, your king must be in the enemy camp and not
  attacked, with at least ten of your other pieces there too. Count 5 for each rook and bishop (promoted or not), 1
  for every other piece and 0 for the king, over your pieces in the camp and in your hand. You need at least 28
  points as Sente or 27 as Gote.
- **Draws.** As in the shared rules, but the move limit is 500 moves in total. Captured pieces go to a hand, so the
  bare-kings draw cannot happen.
- **Ghosts.** Kings and unpromoted pawns are always solid. Every other piece can split and merge, promoted ones
  included. A lance that slides past a ghost links to it. A knight jumps, so it never links. A split never promotes,
  so a knight cannot split onto its last two ranks.
- **Promotion per possibility.** A ghost promotes only in the possibilities where it really makes the move. Its
  parts can then show different faces, one promoted and one not. Two parts with different faces cannot merge, so
  measure the piece first.
- **Drops and ghosts.** You always know exactly what is in both hands. Dropping onto a square where a ghost might
  stand is a roll. Either your piece lands (**Dropped**), or the ghost is found there and your piece stays in your
  hand (**Missed: the piece stays in hand**). A pawn drop that would give pawn-drop mate in only some possibilities
  also misses in those.
- **Quantum impasse.** A ghost in the enemy camp, or a ghost that might attack your king, can make the impasse hold
  in some possibilities only. Then a roll decides whether the game ends.

#### Xiangqi

- **Board.** The pieces stand on the 90 points where the lines of a 9 × 10 grid cross, not in squares. A river
  divides the board into two halves, and each side has a palace: the 3 × 3 points marked with two diagonal lines.
  Red sits at the bottom and moves first. The points are named a1 to i10 from Red's left corner.
- **Pieces.** Each piece has a Red and a Black character. The **general** 帥/將 steps one point straight and never
  leaves its palace. **Advisors** 仕/士 step one point diagonally along the palace diagonals. **Elephants** 相/象
  move exactly two points diagonally and never cross the river. **Horses** 傌/馬 move one point straight, then one
  diagonally outwards. **Chariots** 俥/車 move like rooks.
- **Blocked moves.** A horse is blocked by a piece on the point next to it in the direction it moves (its "leg"), an
  elephant by a piece on the point in between (its "eye").
- **Cannon.** The cannon 炮/砲 moves like a chariot, but captures only by jumping over exactly one piece of either
  colour (the screen) onto the enemy piece behind it.
- **Soldiers.** Soldiers 兵/卒 step one point forward; once they have crossed the river they may also step sideways.
  They never move back and never promote.
- **Winning.** Capture the enemy general. If the two generals stand on one file with nothing between them, the
  player to move may "fly" along the file and capture the other general, so opening that file loses. The escape
  rule is xiangqi's checkmate, and also the WXF stalemate, where your general is not attacked but every move exposes
  it. A player with no move at all loses too.
- **Draws.** The game is drawn when no chariot, horse, cannon or soldier is left (unless the generals face each
  other), after 50 moves by each side without a capture (soldier moves do not reset the count), or at the move
  limit. The 50-move draw waits while the player to move can capture the enemy general for certain. If the last
  chariot, horse, cannon or soldier is gone in only some possibilities, a roll decides whether the game is drawn.
  Unlike standard xiangqi there is no repetition rule, so perpetual check does not lose.
- **Ghosts.** Generals and soldiers are always solid. Advisors, elephants, horses, chariots and cannons can split and
  merge; a split stays inside the palace or on the own half, like the piece. A ghost blocks a horse's leg, an
  elephant's eye or a sliding piece only in the possibilities where it really is: a move past it links, a move onto
  a point it might occupy rolls.
- **Cannon and flying general with ghosts.** A ghost screen gives the cannon its capture only in the possibilities
  where it stands between the cannon and the target, so the capture is rolled unless it works in every possibility,
  and a ghost is never its own screen. A ghost between the generals is only a partial shield: the flying capture
  succeeds with the chance that the file is open.

#### Makruk

- **Board and start.** An 8 × 8 board with one colour on every square, as on a Thai board. White moves first. The
  Khun (king) starts on d1 for White and on e8 for Black, with the Met beside it (e1, d8). The rest of the back rank
  is Rua, Ma, Khon from each corner inwards. The Bia (pawns) start on each side's third rank (rank 3 and rank 6).
- **Pieces.** The **Khun**, **Ma** and **Rua** move like the chess king, knight and rook. The **Met** steps one
  square diagonally. The **Khon** steps one square diagonally or one square straight forward, but never sideways or
  straight back. The Met is drawn as a small queen and the Khon as a bishop.
- **Bia.** It moves one square forward and captures one square diagonally forward. It never moves two squares, so
  there is no en passant. On its sixth rank it always becomes a Met. There is no castling.
- **Winning.** Capture the enemy Khun, or leave it no escape (checkmate). **Stalemate** is a draw, not a loss: your
  Khun is not attacked, but every move you have would leave it open to capture.
- **The count (only when no Bia is left).** If one side has only its Khun, the other side must capture it within a
  set number of its own moves. The count starts with the lone Khun's first move after the last capture or
  promotion. The number is 8 with two Rua, 16 with one Rua, 22 with two Khon, 32 with two Ma, 44 with one Khon and
  64 otherwise (the first that applies). Take away the number of pieces on the board, both Khuns included, and add
  one. It is always at least one. If the lone Khun made that last capture, the chaser's next move does not count.
  The chaser's player row shows the moves used and allowed, for example "3/5"; nothing is shown once a Khun has
  been captured.
- **Other draws (only when no Bia is left).** The game is drawn after 65 moves by each side without a capture or
  promotion, and when only the two Khuns are left. The player rows show the 65-move counter from move 50. These
  draws, and the count, wait while the player to move can capture the enemy Khun for certain. While a Bia is on the
  board there is no move-count draw: a game that goes round in circles runs on until the move limit.
- **Ghosts.** The Khun and the Bia are always solid. The Met, Khon, Ma, Rua and a promoted Bia can split and merge.
  The Rua is the only piece that slides, so only Rua moves can pass a ghost and link to it. A Bia step or capture
  onto its sixth rank that a ghost might block is a roll: the Bia either becomes a Met or stays where it was.
- **Quantum draws.** Stalemate and "only the two Khuns left" are checked in every possibility. If one holds in only
  some of them, a roll decides whether the game ends. The count starts only when the lone side has nothing but its
  Khun in every possibility. The count and the 65-move rule are never rolled. A merge onto the enemy Khun whose only
  outcome is a capture is a certain capture, so it also makes the draws wait.
- **Differences from over-the-board Makruk.** The counts run by themselves, and every capture restarts them.
