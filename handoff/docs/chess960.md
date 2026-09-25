### Chess960

- **Board and pieces**: the ordinary 8 × 8 board and pieces. The pawns start as usual, but the pieces behind them
  start in one of 960 shuffled orders: the two bishops on squares of different colours, the king somewhere between
  the two rooks. Black's pieces mirror White's, file for file.
- **Start position number**: every start position has a number from 0 to 959, the same numbers as on lichess.
  Number 518 is the ordinary chess setup (RNBQKBNR). Type a number in the New game dialog or press Random; the game
  info shows the back rank and its number, for example "RNBQKBNR (518)".
- **Moves**: every piece moves as in ordinary chess. Pawn double steps, en passant and promotion are unchanged.
- **Castling**: pick your king and click the rook you want to castle with. Afterwards the king and rook stand where
  they would in ordinary chess: king on g and rook on f (O-O), or king on c and rook on d (O-O-O). Sometimes only the
  king or only the rook moves, or the two swap places, and in some start positions you can castle on your first move.
- **What castling needs**: neither the king nor that rook has moved, and every square either of them crosses or
  lands on is empty, apart from the two of them. Squares outside those paths may stay occupied. Castling ignores
  attacks: you may castle out of, through or into attack.
- **How to win**: capture the enemy king. If every move your opponent could make would leave their king to be
  captured for certain, and none of them could capture your king even with a small chance, you win at once: their
  king cannot escape. The game is drawn when only the two kings are left, after 50 moves by each side without a
  capture or pawn move, at the move limit, or when the player to move has no legal move. The first two draws wait
  while the player to move can capture the enemy king for certain.
- **Castling and ghosts**: castling never rolls. It is only possible when it is possible in every possibility: a
  ghost that might stand on one of the squares it needs, even one of your own, blocks it. Measuring your ghost can
  clear the way.
- **Losing a castling right**: a right is lost for good as soon as its king or rook is not 100 % on its starting
  square: it moved, split, was captured, or a slide happened in some possibilities only. Merging back or a
  measurement that finds the rook at home does not bring it back. A rook or king move that Missed keeps the right.
