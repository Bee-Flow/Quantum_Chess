### Fog of war

- **Board and pieces**: ordinary chess on an 8 × 8 board with the usual start position, played as Dark chess is on
  chess.com. The pieces move as usual, and castling, en passant and promotion are unchanged.
- **What you see**: only your own pieces and the squares they could move to. Every other square is covered in fog.
  An enemy piece shows up only on a square you can see, which usually means you could capture it. Nothing else is
  announced: the opponent's moves appear as "A move", and when one of your pieces is taken you see "Capture on …"
  with the square where it stood.
- **Pawns**: a pawn sees the square in front of it only when that square is empty, so a dark square right in front of
  your pawn means something is standing there. It sees a diagonal square only when there is an enemy piece on it, or
  when it can capture en passant: then the passing pawn is visible, for that one turn only.
- **How to win**: as in the other variants, capture the enemy king, or leave it no escape. Nobody warns you of
  check: you may move into attack and castle out of, through or into attack, and your own king can be taken by a
  piece you never saw. If every move you could make would let your opponent capture your king for certain, and none
  of them could capture the enemy king, you lose at once, even when you cannot see the attacker (the whole board is
  then revealed). There is no stalemate: while your moves are only dangerous, you must still make one.
- **Draws**: 50 moves by each side without a capture or pawn move (this counts the moves you could not see, so it can
  come without warning), the move limit, or a side without any legal move. The 50-move draw waits while the player
  to move can capture the enemy king for certain. Bare kings are no draw, as on chess.com: the kings cannot see each
  other, so a king that steps next to the enemy king unaware can be taken. There is no draw by repetition.
- **Ghosts see from every square**: a square is visible when, in at least one possibility, one of your pieces or ghost
  parts stands on it or could move to it. Splitting a piece therefore also scouts: `g1-f3|h3` from the start lets
  you look at e5 and g5 as well.
- **Enemy ghosts**: a visible square shows everything that might stand there, each with its chance. A part of an enemy
  ghost that stands in the fog stays hidden. The odds shown before your own move use only what you can see.
- **Castling and en passant never roll**: castling is legal only when it is possible in every possibility, so an enemy
  ghost that might stand between your king and rook makes it illegal. The en passant chance ends after the next turn,
  whatever that turn is (also a Measure).
- **Pass & play**: each player sees only their own view. After your move you still see your board, then hand the
  device over when asked. While the game runs, undo is off and the opponent's budget shows "?". When the game ends,
  the whole board and every move are revealed.
