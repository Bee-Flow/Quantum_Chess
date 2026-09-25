### 3D chess (Raumschach)

- **Board**: a 5 × 5 × 5 cube of five levels, A at the bottom (White's home) to E at the top (Black's home). A cell is
  named by level, file and rank, so `Aa1` is White's corner, `Cc3` the centre and `Ee5` Black's far corner. The levels
  are drawn as a grid: A and B at the bottom, C and D in the middle, E on top. Each side has 20 pieces: White's
  officers stand on rank 1 of levels A and B and its ten pawns on rank 2 of both; Black's array is White's turned
  through the centre of the cube.
- **Pieces**: rooks move straight through the faces of a cell, also up and down; bishops move diagonally through its
  edges, within any flat slice of the cube; the **unicorn** moves through its corners, changing level, file and rank
  at once. The queen combines all three and the king steps to any of the 26 touching cells. The knight jumps 2 cells
  one way and 1 another, across levels too, and jumps over anything in between.
- **Pawns**: a pawn steps one cell forward or one level up, and captures one cell forward and sideways, up and
  sideways, or forward and up; never straight ahead or straight up. For Black, forward is towards rank 1 and up is
  towards level A. A pawn that reaches rank 5 of level E (Black: rank 1 of level A) must become a queen, rook,
  bishop, knight or unicorn.
- **No special moves**: no castling, no double step and no en passant.
- **How to win**: capture the enemy king. There is no check, so you may move into danger. If every move your
  opponent could make would leave their king to be captured for certain, and none of them could capture your king
  even with a small chance, you win at once: their king cannot escape. This is the 3D checkmate; a split unicorn
  that could take the king by a merge from two levels counts too. It also applies when their king is not attacked:
  a stalemate, which the IRF scores as a draw, is a win here for the side that stalemates. A split can be the escape:
  a piece split onto both lines of a double attack blocks each of them in half the possibilities, so neither attacker
  takes the king for certain. The game is drawn when only the two kings are left and they do not touch, after 50
  moves each without a capture or a pawn move that happened, after 300 moves each, or when the player to move has no
  legal move. The first two draws wait while the player to move can capture the enemy king for certain.
- **Lines through ghosts**: a rook, bishop, unicorn or queen that passes a cell where a piece might be is linked to it,
  as on a flat board, on every level and along the vertical lines too. A knight jumps, so it is never blocked; its
  move is rolled only when its target might be occupied.
- **Splits across levels**: a piece may split to any two certainly empty cells it could reach, on the same level or
  on different ones, even two cells on the same line; where a ghost blocks the lane of one half, that half stays
  home in those possibilities.
- **Pawns probe ghosts**: kings and pawns are always solid, so a pawn push or capture onto a cell where a ghost might
  be is settled by a roll. A promotion happens only if the pawn really arrives, and a Missed pawn move does not reset
  the 50-move count.
- **Merges and danger**: two parts of one piece can merge onto a target from two different levels. If the merge
  takes the enemy king in every possibility, the danger ring shows 100 %, even though each part alone would only hit
  half the time.
