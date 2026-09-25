### Atomic

- **Board and pieces**: ordinary chess on an 8 × 8 board with the usual start position. The pieces move as usual, and
  castling, en passant and promotion are unchanged, except that a king never captures.
- **Every capture explodes**: the captured piece, the capturing piece and every piece except pawns on the eight
  squares around the capture square leave the board, whoever they belong to. Pawns only go when they capture or are
  captured. A promotion that captures explodes at once, and a blown-up rook takes its castling right with it. After
  an explosion, the board shades and outlines its blast area until the next move.
- **En passant**: the explosion is centred on the square the capturing pawn moves to, not on the captured pawn.
- **Your own king**: you may never capture on a square next to your own king, because the blast would reach it. So
  kings never capture, and two kings that touch cannot be captured directly. A touching king can still be blown up by
  a capture next to it that is not next to the other king.
- **How to win**: blow up the enemy king, by capturing it or anything next to it (a pawn too). A blow-up counts as a
  capture of the king everywhere: the king-danger warning shows the chance that one enemy capture could blow your
  king up, and if every move you have would let your king be blown up for certain, you lose at once (your king cannot
  escape), unless one of your moves could still blow up the enemy king, even with a small chance.
- **Draws**: only the two kings left is a draw at once. The usual 50-move rule, the move limit and a side without any
  legal move at all (even a king at 100 % danger with nowhere to go) are draws too. The 50-move draw waits while the
  player to move can blow up the enemy king for certain.
- **Explosions never roll by themselves**: a capture that might miss is rolled as usual (Captured, Moved, Missed), and
  the explosion happens exactly in the Captured result. A converging capture that is certain explodes for certain, so
  a merge next to the enemy king can win without dice.
- **Ghosts in a blast**: a ghost part in the blast area is destroyed only in the possibilities where the piece really
  stands there. The piece survives with the chance of its other parts, and measuring it may find it "No longer on the
  board". When you split such a piece, "destroyed" counts as one of the 4 places a split may leave it on, so the
  split can put it on at most 3 squares.
- **Maybe next to your king**: a move onto a square next to your own king, and any king move, is rolled when an enemy
  piece might stand there: it misses where the piece really is, and moves where the square is empty.
- **The game-end roll**: a king is always solid, so blowing it up is decided by the move's own roll. Only "only the
  two kings are left" can differ between possibilities (a ghost blown up in some of them); then a roll decides whether
  the game ends.
