### 4D chess

- **Board**: a 4 × 4 × 4 × 4 hypercube, drawn as a 4 × 4 grid of small 4 × 4 boards named A1 (bottom left) to D4
  (top right). A cell is named board, then square: B2c3 is square c3 on board B2. Stepping to the same square on the
  next board left, right, up or down counts as one step, just like stepping to the next square on a board. Each
  small board is a checkerboard, and neighbouring boards have opposite colours.
- **Setup** (TessChess, Ben Reiniger): each side has 8 pieces and 12 pawns. White's pieces stand on rank 1 of the
  bottom boards A1 to D1 and its pawns on rank 2 of boards A2 to D2; Black's are mirrored on the top boards. Queens
  face queens and kings face kings, and no piece is attacked at the start.
- **Rook, bishop, queen**: the rook moves along a rank or file of its board or to the same square on other boards in
  its row or column of boards, or one square diagonally plus one board straight (or one square straight plus one
  board diagonally) per step. The bishop moves diagonally on its board, to the same square on a diagonal line of
  boards, one square plus one board straight per step, or one square and one board diagonally at once; it never
  leaves its colour. The queen goes in any of these 80 directions. A line can cross boards, and only the cells on the
  line itself block it.
- **King and knight**: the king steps to any touching cell, up to 80, on its own board and the boards around it,
  diagonal neighbours included. The knight jumps 2 steps one way and 1 step another, also between boards, and is
  never blocked.
- **Pawns**: a pawn moves one square up its board or to the same square one board up (Black: down). It captures one
  step forward plus one step sideways, a square or a board to the left or right, never straight ahead. There is no
  double step, no en passant and no castling. A pawn must promote on rank 4 of the top boards A4 to D4 (Black: rank 1
  of A1 to D1), to a queen, rook, bishop or knight.
- **How to win**: capture the enemy king. If every move your opponent could make would leave their king to be
  captured for certain, and none of them could capture your king, you win at once: their king cannot escape (this is
  how a checkmate ends). A queen next to a king in a corner, guarded by its own king, traps it this way. The game is
  drawn when only the two kings are left and they do not touch, after 50 moves by each side without a capture or a
  pawn move that really happened (a Missed push does not count), and at the move limit. The 50-move draw waits while
  the player to move can capture the enemy king for certain.
- **Slides across boards and ghosts**: a slide whose path crosses a cell where a ghost might be, onto a cell that is
  certainly empty, is not rolled: where the ghost blocks it, the piece stays and becomes linked to that ghost, even
  when the blocking cell is on another board. Only when the link would push your budget over 8 is it rolled instead.
  A move onto a cell that might hold a piece is rolled as usual.
- **Splits and merges**: the two halves of a split may go to different boards, even along one line. Two parts of one
  piece on two different lines can merge onto one cell, so a converging capture of a king can be certain; the
  king-danger warning counts it, and a draw waits for it. A split can also save a king that two lines attack: each
  half blocks one line, so neither capture is certain any more.
- **Pawns probe in two directions**: a pawn can push onto its board or onto the next board, so it can test two cells
  where a ghost might stand. Like kings, pawns are always solid: a push onto a possible ghost is rolled, Moved or
  Missed, and a promotion happens only in the result where the pawn arrives.
