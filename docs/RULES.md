# How to play Quantum Chess

Quantum Chess is chess with one new idea: a piece can be in more than one place at once, until something finds
out where it really is. This page explains the whole game. The **Trainer** teaches the same things hands-on in about
ten minutes.

> This page is for players. Implementers will find the exact definitions in
> [`ENGINE-RULES.md`](ENGINE-RULES.md). The two documents describe the same rules (version 1).

---

## Quantum Chess in 60 seconds

1. **It's chess.** Same board, same pieces, same moves. Castling, en passant and promotion all exist.
2. **You win by capturing the king.** There is no check: take the enemy king and the game is over. The game warns
   you whenever your own king is in danger. If every move your opponent could make would leave their king to be
   captured for certain, you win at once: their king cannot escape.
3. **Split.** A knight, bishop, rook or queen may move to **two empty squares at once**. It becomes a **ghost**, half
   on each square (50% / 50%).
4. **Merge.** Bring two parts of a ghost together on one square, and the piece is whole again. If the ghost has no
   other parts and both paths are certainly clear, merging onto a solid enemy piece captures it **for certain**.
5. **Land = roll, pass = link.**
   - If your move *lands* on a square where a piece is or *might* be, and the result is uncertain, the game rolls the dice. You see the odds before you move.
   - If you only *pass* a square where a piece might be, nothing is rolled. Your piece becomes **linked** to that piece instead.
6. **Kings and pawns are always solid.** Their moves are settled at once, with a roll if needed. Pawns are good at
   poking ghosts to find out where they are.
7. **Measure.** Instead of moving, you may spend your turn finding out where one of your own ghosts really is.
8. **Limits.**
   - Each side has a **budget of 8**: at most 8 different ways its own pieces might be standing. That is three 50/50 ghosts.
   - A split can never spread a piece over more than **4 squares**.

```
   A split knight          Land on a ghost = roll           Pass a ghost = link

   f3: N 50%               Bishop lands on h6, where a      Rook slides past a square
   h3: N 50%               knight is 50%:                   where a knight is 50%:
                             50% captured, 50% moved          rook 50% moved, 50% stayed,
                                                              linked to the knight
```

---

## 1. Reading the board

| You see | It means |
|---|---|
| A normal piece | **Solid**: the piece is on that square for certain (100%). |
| A faded piece with a percentage badge | One **part** of a ghost. The piece is on this square with that chance. The badge always shows the number, so colour is never the only clue. |
| A dotted line between faded pieces | These are the parts of **one** piece. |
| A thin thread with a chain icon | These pieces are **linked**: where one is tells you where the other is. |
| A ring around a king | **King danger**: the chance the opponent could capture this king with one move right now. It always shows the percentage, and it turns red at 100%. |
| Pips next to a player's name | That side's **quantum budget** (0–8 used). |

The diagrams on this page write White pieces in capitals (`N`) and Black pieces in lower case (`n`). A number shows
the chance that the piece is on that square: `N50` means "White knight, 50% here".

**Possibilities.** Behind the scenes, the game keeps a list of *possibilities*: complete chessboards that could be the
real one, each with a chance. The percentages on the board summarise that list. You can open it any time in the
*possibilities panel*. Tap one part of a ghost to get the **what-if view**, which shows the board as it would be if
that part is the real one.

---

## 2. The four kinds of move

On your turn you make exactly one of these moves.

### 2.1 Move

A normal chess move.

A part of a ghost can move on its own. It then moves **only in the possibilities where the piece is really on that
square**. For example, a knight that is 50% on f3 and 50% on h3 plays f3-e5. It is now 50% on e5 and still 50% on h3.
You may also move one part onto another part of the same piece. The part joins it wherever its path is clear. If the
piece had only those two parts and nothing can block the path, the piece is solid again.

### 2.2 Split

A **knight, bishop, rook or queen** moves to two squares at once. Promoted pawns count. Kings and ordinary pawns never
split.

```
         f     g     h                            f     g     h
      +-----+-----+-----+                      +-----+-----+-----+
    3 |     |     |     |                    3 | N50 |     | N50 |
      +-----+-----+-----+      g1-f3|h3        +-----+-----+-----+
    2 |  P  |  P  |  P  |     ---------->    2 |  P  |  P  |  P  |
      +-----+-----+-----+                      +-----+-----+-----+
    1 |  B  |  N  |  R  |                    1 |  B  |     |  R  |
      +-----+-----+-----+                      +-----+-----+-----+
```

The rules for a split:

- Both target squares must be squares the piece could normally move to.
- Both targets must be **empty for certain**, with no ghost part on them, yours or the opponent's. A split never captures.
- In at least some possibility, both paths must be clear.
- Each target gets **half** of the chance the piece had on the square it left. A solid piece becomes 50% and 50%. A 50% part becomes 25% and 25%.
- If one path is blocked in some possibilities, the half that goes that way **stays home** in those possibilities.
- A split may not leave the piece on more than **4 squares**, and it must fit your budget (section 7).
- A split never rolls the dice.

### 2.3 Merge

Choose two squares where the **same** ghost stands, and a target square that both parts could reach. Each of the two
parts moves to the target wherever its path is clear. Any other part of the piece stays where it is. If, in every
possibility, the piece ends up on the target (it had no other part, or the other part was already on the target,
and neither path can be blocked), the piece is solid again.

The target may be:

- empty;
- another part of the same ghost;
- **an enemy piece**. This is a *converging capture*.

It may **not** be one of your own other pieces.

**Converging capture: preparation beats dice.** If your ghost has no other part, both paths are certainly clear, and
the enemy piece is surely on the target, the capture is certain and no dice are rolled. Otherwise the game rolls. For
example, a queen spread over d4, h5 and a1 that merges d4 and h5 onto a king misses whenever it was really on a1.

```
         d     e     f     g     h
      +-----+-----+-----+-----+-----+
    8 |     |     |     |     |  k  |     White queen: d4 50%, h5 50%.
      +-----+-----+-----+-----+-----+     Both parts attack the black king on h8
    7 |     |     |     |  .  |  .  |     (the dots are their paths).
      +-----+-----+-----+-----+-----+
    6 |     |     |  .  |     |  .  |     d4|h5-h8   merge: the king is captured
      +-----+-----+-----+-----+-----+                FOR CERTAIN. No dice.
    5 |     |  .  |     |     | Q50 |
      +-----+-----+-----+-----+-----+     h5-h8      only one part moves: a 50% roll.
    4 | Q50 |     |     |     |     |
      +-----+-----+-----+-----+-----+
```

### 2.4 Measure

Point at one of **your own** ghosts and measure it. The game rolls to decide where it really is, using the odds on
the board. The piece becomes solid there, and every piece linked to it updates. This uses your turn.

Measuring is useful to:

- free up budget;
- make sure a piece is really where you need it before an attack;
- settle an enemy piece that is linked to yours.

You cannot measure enemy pieces.

---

## 3. What happens when you move

When you pick up a piece, every square you could move to shows what will happen:

| Preview | Meaning |
|---|---|
| **Certain** | The result is fixed. No dice. |
| **Quantum** | No dice, but afterwards your piece is (or stays) in several places, or it becomes linked. |
| **Roll** | The game rolls. The chance of every result is shown before you commit. |
| **Roll (budget full)** | This move would normally be quantum, but your budget is full, so it is settled with a roll instead. |

### 3.1 When does the game roll?

Only when a move could turn out in more than one way **and** one of these is true:

- it **lands** on a square where another piece, yours or the opponent's, **is or might be**. This counts every
  possibility, even one where your own piece isn't on the square it moves from;
- it is a **pawn** move or a **king** move (castling never rolls);
- it is a **Measure**;
- your **budget is full** (section 7).

Nothing else ever rolls. Splits never roll. Nothing collapses on its own, and time passing changes nothing.

### 3.2 The three results

| Result | What happened |
|---|---|
| **Captured** | Your piece moved and took the piece on the target square. |
| **Moved** | Your piece moved. The target square turned out to be empty. |
| **Missed** | Nothing moved. Your piece wasn't really on the square it left, or its way was blocked, or your own piece was on the target. Your turn is still used. |

### 3.3 The board catches up

After a roll, every possibility that disagrees with the result disappears, and the percentages update.

**A solid piece hunts a ghost.**

```
         c     d     e     f     g     h
      +-----+-----+-----+-----+-----+-----+
    6 |     |     |     | n50 |     | n50 |     Black knight: f6 50%, h6 50%.
      +-----+-----+-----+-----+-----+-----+     White plays Bc1-h6 (a roll):
    5 |     |     |     |     |  .  |     |
      +-----+-----+-----+-----+-----+-----+     50%  Captured - the knight was on h6.
    4 |     |     |     |  .  |     |     |
      +-----+-----+-----+-----+-----+-----+     50%  Moved - the knight was on f6.
    3 |     |     |  .  |     |     |     |          The bishop now stands on h6,
      +-----+-----+-----+-----+-----+-----+          and the knight is 100% on f6.
    2 |     |  .  |     |     |     |     |
      +-----+-----+-----+-----+-----+-----+
    1 |  B  |     |     |     |     |     |
      +-----+-----+-----+-----+-----+-----+
```

A solid piece whose path is **certainly clear** never wastes its move when it lands on a ghost: it either captures
or takes the square. If a ghost might be standing in its path, it can also miss. For example, if the knight's parts were
on e3 and h6 instead, the e3 part would stand on the bishop's path: then Bc1-h6 is 50% Missed (the knight was on e3,
and the bishop stays on c1) and 50% Captured.

**A ghost attacks.** Your queen is 50% on d1 and 50% on d3, and you play d1-d8 onto a solid enemy rook:

- **50% Captured.** The queen really was on d1. It is now 100% on d8 and the rook is gone.
- **50% Missed.** The queen was on d3. Nothing moves, and the queen is now 100% on d3.

A ghost only hits if it is really there.

**A ghost attacks a ghost.** When both pieces are 50/50, there are three results:

- 25% Captured;
- 25% Moved (your part was real, but the enemy piece was elsewhere);
- 50% Missed (your part wasn't real).

### 3.4 Passing a ghost links you

```
         a     b     c
      +-----+-----+-----+
    8 |     |     |     |     White plays a1-a8. Nothing is rolled:
      +-----+-----+-----+
      :     :     :     :       - where the knight is on a4, the rook is
      +-----+-----+-----+         blocked and stays on a1;
    4 | n50 |     | n50 |       - where the knight is on c4, the rook
      +-----+-----+-----+         reaches a8.
      :     :     :     :
      +-----+-----+-----+     Now the rook is 50% a1 / 50% a8, and it is LINKED
    1 |  R  |     |     |     to the knight: rook on a1 <=> knight on a4.
      +-----+-----+-----+
```

From now on, anything that finds out where the knight is also tells you where the rook is. Suppose Black measures
the knight and it turns out to be on c4. At that same moment, the rook is 100% on a8.

Links can form between your own pieces too, and between any number of pieces. Hover over a linked piece to see its
thread, or tap one of its parts to see the what-if view.

---

## 4. Pawns

- Pawns are **always solid**. They never split or merge.
- Every pawn move is settled immediately.
- **Pushing** onto a square where a piece might be is a roll. **Moved** means the square was free. **Missed** means something was there, and now you know it. As in chess, a pawn never captures straight ahead.
- **Double step:** both squares must be free. If the way is blocked, the pawn stays where it was. It does not step one square instead.
- **Capturing diagonally** onto a ghost is a roll: **Captured** or **Missed**.
- **Promotion:** you choose the new piece as part of the move. It happens only if the pawn really reaches the last rank. A promoted piece can split and merge like any other piece of its kind.
- **En passant** works as in chess, only on the move right after the double step. It is always certain. The game offers it only when it is actually possible.

**Pawns make great probes.**

```
         e     f     g     h
      +-----+-----+-----+-----+
    6 |     |     |     | n50 |     Black knight: e3 50%, h6 50%. White plays e2-e4:
      +-----+-----+-----+-----+
    5 |     |     |     |     |       50%  Moved  - the pawn is on e4, and the knight
      +-----+-----+-----+-----+                     is 100% on h6.
    4 |     |     |     |     |       50%  Missed - the pawn stays on e2, and the
      +-----+-----+-----+-----+                     knight is 100% on e3.
    3 | n50 |     |     |     |
      +-----+-----+-----+-----+
    2 |  P  |     |     |     |
      +-----+-----+-----+-----+
```

---

## 5. The king and castling

- The king is **always solid**. It never splits or merges.
- A king step onto a square where a piece might be is a roll.
- **There is no check.** You may move your king into danger, or leave it there. If you do, your opponent may take it.
- **King danger.** Every king shows the chance that the opponent could capture it with a single move right now, as a percentage on the ring. This counts converging captures. At **100%** the ring turns red, which is what chess players would call "check". Nothing forces you to react, but you had better.
- **Take low odds seriously.** A ghost that misses your king loses only a turn, so your opponent will happily try a 25% shot. Every such shot can end the game.
- **Safety net.** If a move would leave your king at **10% danger or more**, and another move would make it at least 10 points safer, the game asks you to confirm and shows both numbers. You can switch this off in the settings.
- **Your king cannot escape.** If every move you could make would leave your king to be captured **for certain** on the next move, you have lost at once. The game does not make you play a pointless last move. This is the game's version of checkmate. It does not apply while any of your moves could still capture the enemy king, even with a small chance.

**Castling:**

- The king and that rook must be solid on their starting squares.
- Every square between them must be **empty for certain**. A ghost part on one of them blocks castling.
- You may castle out of, through or into attack.
- You lose a castling right as soon as, after any move, the king or that rook is not 100% on its starting square. That happens if you move it, split it, it gets captured, or a slide only partly happened. Merging back does **not** restore the right.
- A king or rook move that **Missed** does not cost the right, because the piece never left.

---

## 6. Winning and drawing

**You win** when:

- you capture the enemy king, whether with a normal capture, a successful roll or a converging capture;
- after your move, the enemy king **cannot escape** (section 5);
- your opponent resigns, or, in online games, runs out of time (section 9).

**The game is drawn** automatically when:

- only the two kings are left;
- the same position appears for the **third time**. That means the same pieces with the same chances, with the same player to move;
- **50 moves** by each side pass without a capture or a pawn move actually happening. Missed attempts and failed captures do not reset the count;
- the player to move has no legal move at all;
- the game reaches 600 moves by each side, which is a technical limit.

The first three draws wait if the player to move can capture the enemy king **for certain**. For example, if you take
your opponent's last piece with your king but land next to their king, the game is not a draw: they take your king.

Players can also agree to a draw.

A king and one bishop or knight against a lone king is **not** an automatic draw. Without check, a lone king can
sometimes be trapped (section 5).

---

## 7. Limits

### 7.1 The quantum budget (8 per side)

Count the different ways **your own** pieces could be standing:

- one 50/50 knight gives **2**;
- add a 50/50 bishop and you have 2 × 2 = **4**;
- add a 50/50 rook and you have **8**, which is full;
- a piece spread over 3 squares counts 3.

Links can change the count:

- If your rook's square always follows your own knight's square, the rook adds nothing.
- If your rook is linked to an **enemy** ghost, it can double your count, because your pieces now have more ways to stand.

```
   White  [#][#][#][#][ ][ ][ ][ ]   4/8
   Black  [#][#][ ][ ][ ][ ][ ][ ]   2/8
```

When your budget is full:

- **Splits are greyed out.** The tooltip says: "Budget full: merge or measure a piece first."
- A move that would normally be **quantum** but would push you over 8 is settled with a **roll** instead. The preview says "Roll (budget full)".
- **Everything else works as normal.** The budget never stops you from moving.

**Your opponent can never use up your budget.** Only your own moves can raise it. Their moves can only lower it, for
example by capturing or by settling a ghost.

Because each side has at most 8, the whole game never has more than 8 × 8 = 64 possibilities.

### 7.2 Four squares per split

A split may not spread a piece over more than 4 squares. Merge or measure it first.

---

## 8. Fair dice

- **Before you move**, the preview shows the chance of every result.
- **After a roll**, the move list shows a bar with one stretch for each possible result, in the order Missed, Moved, Captured, and a marker at the number rolled. For example:

  `Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · rolled 0.3712 → Moved`

  Each stretch includes its lower number and stops just below its upper number, so 0.5000 would have been Captured. Numbers are cut off, never rounded up, and when a roll lands very close to a boundary the game shows 8 decimals so that you can always see which side it fell on.
- **Online games.** The server draws a fresh random number at the moment your move is applied. It isn't decided in advance and it isn't stored anywhere beforehand, so nobody can know it early, not even the server's administrator.
  - Every roll is recorded, and the moves are chained together. If a move you have **already seen** is changed later, the app shows a warning.
  - The post-game review can replay and verify the whole game.
  - What the chain cannot do: someone with direct access to the server's database could change a roll **before** your app has loaded that move, and the chain would not show it. In practice that means the server's administrator. Players who are administrators of your Nextcloud are marked with an "admin" badge in rated games.
- **Local games** (against the computer, against an AI model, pass & play): a roll is made the first time a move is played in a position, and the game remembers it. Undoing and playing the same move in the same position gives the same result, even if you pick a different piece to promote to, so undo cannot re-roll the dice. No result exists before its move is played, so nothing can be looked up in advance. Using undo marks the game as "assisted". Local games run in your browser, are not verified by anyone, and never affect your rating.
- **Your opponent can't see the future.** The built-in engine and AI opponents do not know future rolls. They see the same odds you do.
- **Luck meter.** The post-game review shows how lucky each side was: every roll, how likely its result was, and how much the dice swung the game.

---

## 9. Online games

- You can resign at any time, and you can offer a draw.
- Online games have a time limit per move (1, 3 or 7 days), shown in the game. You get reminders before it runs out. If it runs out:
  - the player who ran out of time loses;
  - but it is a draw if the other player has only their king left;
  - and the game is simply cancelled if the player who ran out had not made a move yet.
- In rated games, the coach, hints and the evaluation bar are switched off for your own games that are still in progress. They come back when the game ends. The server also refuses AI help on positions from your running rated games. It cannot stop the built-in engine in your browser, though, so rated play relies on fair play.
- Games against the computer, against an AI model, or pass & play never change your rating.

---

## 10. What's quantum about it (and what isn't)

Quantum Chess uses three real quantum ideas, in a simplified form that you can calculate in your head:

- **Superposition.** A ghost really is "in several places" as far as the game is concerned, with the odds shown, until something asks where it is.
- **Measurement.** Landing on a maybe-occupied square, pawn and king moves, and Measure all ask a question. The answer is random with the shown odds, and everything else updates to agree with it.
- **Entanglement.** Linked pieces are correlated. Finding out about one tells you about the other.

What it does **not** model:

- **Interference.** In real quantum physics, possibilities have complex "amplitudes" that can cancel out. This game uses plain probabilities, so a merge always recombines.
- **Non-locality.** The game makes no claim about faster-than-light effects.

Two more simplifications:

- In real life you only ever see outcomes. The game shows you the full state, the way a physics simulator would.
- "Possibilities" are the game's bookkeeping, not a statement about the many-worlds interpretation.

Turn on **physics names** in the settings to see the textbook terms:

| Game term | Physics name |
|---|---|
| ghost | superposition |
| roll | measurement |
| link | entanglement (correlation) |
| possibility | branch/world |

---

## FAQ

**Is there check or checkmate?**
There is no check: you win by capturing the king. The king-danger ring (red at 100%) and the confirmation dialog stop
you from leaving your king hanging by accident. The nearest thing to checkmate is a king that **cannot escape**: if
every move you could make leaves your king to be captured for certain, the game ends at once and you lose.

**Why did the game end before my king was actually captured?**
Your king could not escape. Every move you had would have let your opponent capture it for certain, so the game ended
right away instead of making you play a pointless move.

**Why didn't my piece move?**
The result was **Missed**. The piece wasn't really on the square you moved it from, or its path was blocked, or your
own piece turned out to be on the target. The turn still counts, but you learned something: the board has updated to
match.

**My rook is suddenly in two places, but I never split it!**
It slid past a square where another piece might have been (section 3.4). Where that piece was in the way, the rook
stayed. Where it wasn't, the rook arrived. Now the two pieces are linked.

**Can a ghost capture?**
Yes, but only if it is really there. A 50% part captures with a 50% chance. If it misses, you know the piece is on its
other square or squares. To capture for certain with a ghost, **merge** its parts onto the target (a converging capture).

**Why can't I split this piece?**
The tooltip tells you. The possible reasons are:

- it's a king or a pawn;
- a target square is not empty for certain;
- there is no possibility in which both paths are clear;
- the piece would be on more than 4 squares;
- your budget is full.

**Why was my move rolled although it could not capture anything?**
There are two possible reasons, and the preview tells you which:

- Another piece is on the target in some possibility, even if only in possibilities where your piece isn't on the square it moves from. For example, your queen is 50% d1 / 50% d3, and a linked enemy knight is on d8 exactly when your queen is on d3. Moving d1-d8 can never capture, but it is still a roll ("Roll"): Moved or Missed.
- Your budget was full, so a move that would have made your piece a ghost (or linked it) was settled with a roll instead ("Roll (budget full)").

**Can my king be captured by a ghost?**
Yes, with the ghost's chance. The danger ring shows it. The king itself can never become a ghost, so you always know
where it is.

**Where did my castling go?**
At some point the king or that rook was not 100% on its starting square: it moved, split, was captured, or took part
in a partial slide. The right is gone for good, even if the piece comes back.

**The percentages say 67% and 33%. Why not halves?**
After a roll, the remaining possibilities share the chance in proportion. For example, a knight that was 50% / 25% / 25%
and is found not to be on one of the 25% squares becomes 67% / 33%.

**Are the dice fair? Can the admin cheat?**
In online games the random number is created only when a move is applied, so nobody can look it up in advance.
Every roll is logged, and the history is chained so that changes to moves you have already seen show up as a
warning. But the server makes the rolls, so whoever runs it has to be trusted: an administrator with database access
could change a roll before your app has loaded that move, without a warning, and could also run modified software.
That is why administrators carry an "admin" badge in rated games. If you play rated games against your server's
administrator, you are trusting them.

**Can I re-roll by undoing?**
No. In local games the same move in the same position always gets the same result, whichever piece you promote to.
If you undo and change the game (for example by playing a different move first), later rolls are new ones, and the
game is marked "assisted".

**Is this real quantum physics?**
It is a faithful game model of superposition, measurement and entanglement, but not of interference (section 10). It
is a great way to build intuition, not a physics simulator.

---

## Glossary

| Term | Meaning | Physics name |
|---|---|---|
| **Budget** | How many different ways your own pieces might be standing. At most 8 per side. | – |
| **Captured / Moved / Missed** | The three results of a rolled move. | measurement outcome |
| **Certain** | A move whose result is fixed, or a piece that is 100% on one square. | – |
| **Converging capture** | A merge onto an enemy piece. It is certain if the ghost has no other part, both paths are certainly clear, and the enemy piece is solid. | – |
| **Danger ring** | The chance that the opponent could capture your king with one move. Red at 100%. | – |
| **Ghost** | A piece that is on several squares at once, each with a chance. | superposition |
| **King cannot escape** | Every move you could make leaves your king to be captured for certain. You lose at once. | – |
| **Link** | Two or more pieces whose positions depend on each other. | entanglement (correlation) |
| **Measure** | A move that settles where one of your own ghosts really is. | measurement |
| **Merge** | Bringing parts of a ghost together on one square. | – |
| **Part** | One square of a ghost, shown faded with its percentage. | branch |
| **Possibility** | One complete chessboard that could be the real one, with its chance. | world / branch |
| **Probe** | A move played mainly to find out where a ghost is, often with a pawn. | measurement |
| **Quantum move** | A move that rolls no dice but leaves pieces in several places or linked. | – |
| **Roll** | The random decision when a move could turn out in several ways. | measurement |
| **Solid** | 100% on one square. Kings and pawns are always solid. | classical |
| **Split** | Moving a knight, bishop, rook or queen to two empty squares at once. | superposition |
| **What-if view** | The board as it would be if the part you tapped is the real one. | conditional state |
