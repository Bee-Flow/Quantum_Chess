<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Chess variants

Quantum Chess 2 comes with twenty chess variants: other dimensions, hidden information, different rules, different
boards with more players, and the regional relatives of chess. **Every variant keeps the quantum element**: pieces
can be in two places at once until something finds out where they really are.

You find them under **Chess variants** in the navigation or on the home page. Each one can be played against the
computer (Easy, Normal or Hard) or as pass & play on one device. Games are stored on your device; online play and
ratings stay with classic Quantum Chess.

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
   50/50 ghosts), and a piece is never spread over more than 4 squares. When your budget is full, Split is greyed
   out, and a move that would go over it is settled by a roll instead.
9. **Capture the king.** There is no check in Quantum Chess: in the variants with a king you win by capturing it,
   unless the variant has its own goal. The ring around a king shows the chance that it could be captured with the
   next move, converging captures included. Variants that count checks count a check as "the king could be captured
   next move".
10. **Your king cannot escape.** If every move you could make (splits, merges and measuring included) would leave
    your king to be captured **for certain** on the next move, you have lost at once. This is the game's version of
    checkmate. It does not apply while any of your moves could still capture the enemy king, even with a small
    chance. It holds in the two-player variants with a king and one move per turn, so not in Antichess, Bughouse,
    Four-player chess or Multiverse chess.

**Draws.** The game is drawn automatically when only the kings are left (and no piece is in hand), when 50 moves by
each side pass without a capture, a pawn move or a drop actually happening, when the move limit is reached, or when
the player to move has no legal move, unless the variant says otherwise. The first two wait while the player to move
can capture the enemy king **for certain**: if you take your opponent's last piece with your king but land next to
their king, the game is not a draw, because they take your king. A repeated position is not a draw in the variants.

**Undo and the dice.** A roll is made the first time a move is played in a position, and the game remembers it.
Undoing and playing the same move in the same position gives the same result, even if you pick a different piece to
promote to, so undo cannot re-roll the dice.

---

## The variants

<!-- The sections below are written per variant. -->
