### Hexagonal chess

- **Board**: Gliński's board of 91 hexagons in three shades. The 11 files a to l (there is no j) run straight up. The
  ranks bend in a V around the middle file f, so f1 is the lowest cell and f11 the highest. Each side has the usual
  pieces plus a third bishop: king g1, queen e1, rooks c1 and i1, bishops f1, f2 and f3, knights d1 and h1, and nine
  pawns in a V from b1 up to f5 and down to k1. Black's army is the mirror image at the top: king g10, queen e10,
  bishops f9, f10 and f11, and the pawns on rank 7 from b7 to k7.
- **Lines**: rooks move through the six sides of a cell (up and down the file, and along both branches of the ranks).
  Bishops move along the six diagonals through its corners: left, right and four steep lines. A bishop never leaves
  its shade, so each side has one bishop per shade. The queen combines both, and the king steps one cell in any of the
  12 directions.
- **Diagonal steps are never blocked from the side**: a diagonal step passes between two cells, and pieces on those
  two cells do not stop it. So a ghost beside a bishop's diagonal never links the bishop and never causes a roll.
- **Knight**: it jumps two cells along a rook line and then one cell turned 60°, to up to 12 cells. It cannot be
  blocked.
- **Pawns**: a pawn moves one cell straight up its file and captures one cell forward-left or forward-right, onto the
  neighbouring cells (not along a diagonal). A pawn on any starting cell of its side's pawns may move two cells if both
  are empty, even if it got there by capturing. A double step that might be blocked by a ghost is a roll: Moved or
  Missed, never a single step.
- **En passant**: right after a double step, an enemy pawn that could capture on the skipped cell may take the pawn
  there, on that move only. As always, en passant is certain, and a Measure or a missed move ends the chance too.
- **Promotion**: at the far end of its file (the top edge for White, rank 1 for Black), a pawn becomes a queen, rook,
  bishop or knight. It promotes only if it really arrives there.
- **Winning and drawing**: capture the enemy king. If every move your opponent could make would leave their king to
  be captured for certain, and none of them could capture your king even with a small chance, you win at once: their
  king cannot escape. There is no castling. Stalemate is not a draw: this rule also applies when the king is not
  attacked, so the side that stalemates wins, in line with Gliński, who scores stalemate in its favour. A player with
  no move at all loses too. Only the two kings left is a draw, unless the player to move can capture the other king
  at once. The 50-move rule applies as usual.
