### Crazyhouse

- **Board and pieces:** the ordinary 8 × 8 board and start position. Castling, en passant and promotion work as in
  chess. Each player also has a **hand**, shown beside the board, which starts empty.
- **Captures change sides:** a piece you capture changes colour and goes into your hand. A captured king never does:
  capturing it ends the game.
- **Drops:** instead of moving, you may take a piece from your hand and drop it onto any empty square. Pawns may not
  be dropped on rank 1 or rank 8. Every other piece may go anywhere, and a pawn may join another pawn on the same file.
  In the move list a drop is written like `N@f3`.
- **Dropped pieces are ordinary pieces:** a pawn dropped on your own second rank may still move two squares. A pawn
  dropped on your seventh rank can promote on its next move. A dropped rook can never castle, not even from its corner.
- **Promoted pieces** are marked with a small red +. When one is captured, the capturer gets a pawn, not the promoted
  piece.
- **Winning and drawing:** capture the enemy king. You also win at once when every move your opponent could make
  would leave their king to be captured for certain ("the king could not escape"); a move that might capture your
  king counts as an escape. Drops count here: a piece dropped in between can shield a king (not from a knight or a
  pawn), and a drop that leaves the enemy king no escape (a drop mate) ends the game at once.
  The game is a draw after 50 moves by each side without a capture, a pawn move or a drop, at the move limit, or when
  the player to move has no legal move. The 50-move draw waits while the player to move could capture the enemy king
  for certain. Only two bare kings with both hands empty would be a draw, but captured pieces never leave the game,
  so that cannot happen here.
- **Drops and ghosts:** dropping onto a square where a ghost might stand is a roll. Either your piece lands and the
  ghost is known not to be there (**Dropped**), or the ghost is found there and your piece stays in your hand
  (**Missed: the piece stays in hand**). Your turn is used either way. A drop onto a square that is empty in every
  possibility is certain.
- **Hands are always certain:** capturing a ghost is a roll, so afterwards the piece has been captured in every
  possibility or in none. You always know exactly what is in both hands, and pieces in hand never use your budget.
- **You cannot split a drop:** a dropped piece lands on one square. From your next turn on, a dropped knight, bishop,
  rook or queen may split like any other piece.
