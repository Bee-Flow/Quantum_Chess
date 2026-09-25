### Tri-Dimensional chess

- **Board**: three 4 × 4 main levels, W (White's, lowest), N (neutral) and B (Black's, highest), and four 2 × 2
  attack boards at the back corners, QL1 and KL1 on White's queen's and king's side, QL6 and KL6 on Black's: 64
  squares in all. In this version the attack boards never move. Board by Franz Joseph (1975), rules after Jens
  Meder's tournament rules.
- **Map squares**: seen from above, all boards form one map with files z, a–d, e and ranks 0–9. A square is named
  file, rank and level, so b3W and b3N are the two levels of map square b3. On screen the boards stand side by side,
  and every map square keeps its rank row on every board.
- **Moving**: every move is an ordinary chess move on the map, and the piece may stop on any level of the target map
  square. Moving straight up or down is not a move. A piece on any level of a map square in between blocks a queen,
  rook, bishop or a pawn's double step. Gaps without a board count as empty: pieces fly across them but cannot stop
  there.
- **Pawns**: a pawn steps one map square forward onto any empty level, two on its first move, and captures diagonally
  forward onto either level. En passant lands on either level of the skipped square, only on the move right after the
  double step.
- **Promotion**: on the last rank of the file the pawn arrives on: rank 8 on files b and c, rank 9 on files z, a, d
  and e (Black: rank 1 and rank 0). A pawn on a8 still has a9 ahead on the attack board.
- **Castling**: from your second move on, while the king and that rook have not moved (in any possibility: a slide
  that only partly happened loses the right for good, even if a Measure later finds the rook at home). King's side:
  the king and the rook next to it swap places. Queen's side: once the queen's home square (a0QL1, for Black a9QL6)
  is empty, the king goes there and the corner rook goes to the king's square.
- **Winning and drawing**: capture the king. If every move the player to move could make would leave their king to be
  captured for certain, the other player wins at once: the king cannot escape (this is how a checkmate ends). The
  game is a draw when only the two kings are left, after 50 moves by each side without a capture or pawn move, at the
  move limit, or when the side to move has no legal move at all. The bare-kings and 50-move draws wait while the
  player to move can capture the other king for certain.
- **Quantum**: a ghost on either level of a map square blocks slides across it in its possibilities (when your target
  square is certainly empty the slide is linked; if the target might hold a piece, it is rolled), but a ghost on the
  other level of your target square does not matter. A piece split over both levels of one map square is a certain
  wall across it and an uncertain target. Castling is refused while a ghost might stand on a square it needs, and
  castling and en passant are never rolled.
