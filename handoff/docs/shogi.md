### Shogi

- **Board and start:** a 9 × 9 wooden board. Files are numbered 9 to 1 from Sente's left, and ranks are lettered a
  to i from Gote's side, so squares read `7g` or `5e`. Sente (black) sits at the bottom and moves first. Gote
  (white) sits at the top. Each side has a king, a rook, a bishop, two gold and two silver generals, two knights,
  two lances and nine pawns. The pieces are pentagons that point at the opponent, so the direction shows who owns
  a piece.
- **Pieces:** the king, rook and bishop move as in chess. The **gold** steps one square in any direction except
  diagonally backwards. The **silver** steps one square diagonally or straight forward. The **knight** jumps only
  forwards: two squares ahead and one to the side. The **lance** slides straight forward. The **pawn** steps
  straight forward and also captures that way. Every piece captures the way it moves.
- **Promotion:** the three far ranks are the enemy camp. Any piece but the king and the golds may promote when a move
  starts or ends there. Promoted pieces are written in red. A promoted rook (dragon) or bishop (horse) also steps one
  square like a king, and every other promoted piece moves like a gold. A pawn or lance on the last rank must
  promote, and so must a knight on the last two ranks. A captured piece loses its promotion.
- **Drops:** a captured piece changes sides and goes into your hand. Instead of moving, you may drop a piece from your
  hand onto any empty square. It is always unpromoted, even in the enemy camp. There are three limits: no pawn on a
  file that already has one of your unpromoted pawns, no pawn, lance or knight where it could never move, and no pawn
  drop that attacks the enemy king and leaves it no escape. In the move list a drop is written like `P*5e`, and a
  promotion like `7c-7b+`.
- **Winning:** capture the enemy king. If every move your opponent could make would leave their king to be captured for
  certain, you win at once: their king cannot escape. That is shogi's checkmate, and also its stalemate, where the king
  is not attacked but every move exposes it; in shogi both lose. A pawn drop may not give checkmate (see Drops), but it
  may leave the king stalemated. You also win by **impasse**. At the start of your turn, your king must be in the enemy
  camp and not attacked, with at least ten of your other pieces there too. Count 5 for each rook and bishop (promoted or
  not), 1 for every other piece and 0 for the king, over your pieces in the camp and in your hand. You need at least 28
  points as Sente or 27 as Gote. A player who has no move at all loses.
- **Draws:** a draw comes after 50 moves by each side without a capture, a drop or a pawn move that really happens,
  or after 500 moves in total. As in the classic game, the 50-move draw waits while the player to move can capture
  the enemy king for certain. There is no draw by repeating a position.
- **Ghosts:** kings and unpromoted pawns are always solid. Every other piece can split and merge, promoted ones
  included. A lance that slides past a ghost links to it. A knight jumps, so it never links. A split never promotes,
  so a knight cannot split onto its last two ranks.
- **Promotion per possibility:** a ghost promotes only in the possibilities where it really makes the move. Its
  parts can then show different faces, one promoted and one not. Two parts with different faces cannot merge, so
  measure the piece first.
- **Drops and ghosts:** you always know exactly what is in both hands. Dropping onto a square where a ghost might
  stand is a roll. Either your piece lands (**Dropped**), or the ghost is found there and your piece stays in your
  hand (**Missed**). A pawn drop that would give pawn-drop mate in only some possibilities also misses in those.
- **Quantum impasse:** a ghost in the enemy camp, or a ghost that might attack your king, can make the impasse hold
  in some possibilities only. Then a roll decides whether the game ends.
