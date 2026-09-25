# Classical 4x4x4x4 chess move generator (no check; king capture wins) for the hyper4d spec numbers.
# Coordinates (x, y, z, w) = (small file a-d, small rank 1-4, big file A-D, big rank 1-4), 0-based.
# Square name: board (big file letter + big rank digit) + cell (small file letter + small rank digit): "B1c1".
import itertools, sys
N = 4
BF = 'ABCD'; SF = 'abcd'
def name(c):
    x, y, z, w = c
    return f"{BF[z]}{w+1}{SF[x]}{y+1}"
def parse(s):
    return (SF.index(s[2]), int(s[3]) - 1, BF.index(s[0]), int(s[1]) - 1)
CELLS = list(itertools.product(range(N), repeat=4))
def inb(c): return all(0 <= v < N for v in c)
def add(a, b): return tuple(p + q for p, q in zip(a, b))
DIRS = [v for v in itertools.product((-1, 0, 1), repeat=4) if any(v)]
def k_of(v): return sum(1 for t in v if t)
ROOK = [v for v in DIRS if k_of(v) == 1]
BISH = [v for v in DIRS if k_of(v) == 2]
TRI = [v for v in DIRS if k_of(v) == 3]
QUAD = [v for v in DIRS if k_of(v) == 4]
Q32 = ROOK + BISH
Q80 = DIRS
KN = set()
for axes in itertools.permutations(range(4), 2):
    for s1 in (-1, 1):
        for s2 in (-1, 1):
            v = [0, 0, 0, 0]; v[axes[0]] = 1 * s1; v[axes[1]] = 2 * s2; KN.add(tuple(v))
KN = sorted(KN)
assert len(ROOK) == 8 and len(BISH) == 24 and len(TRI) == 32 and len(QUAD) == 16 and len(KN) == 48
# Pawn, written for White: forward axes y (1) and w (3); sideways axes x (0) and z (2).
PMOVE = [(0, 1, 0, 0), (0, 0, 0, 1)]
PCAP = [(1, 1, 0, 0), (-1, 1, 0, 0), (0, 1, 1, 0), (0, 1, -1, 0),
        (1, 0, 0, 1), (-1, 0, 0, 1), (0, 0, 1, 1), (0, 0, -1, 1)]
def orient(v, side): return v if side == 'w' else (v[0], -v[1], v[2], -v[3])
QUEEN = Q32
KING = Q80
def set_rules(queen, king):
    global QUEEN, KING
    QUEEN = queen; KING = king
def promo_sq(c, side):
    x, y, z, w = c
    return (y == 3 and w == 3) if side == 'w' else (y == 0 and w == 0)
PROMO = 'QRBN'
def gen(b, side, quiet_only=False):
    mv = []
    for c, (s, p) in list(b.items()):
        if s != side: continue
        def slide(vs):
            for v in vs:
                t = add(c, v)
                while inb(t):
                    o = b.get(t)
                    if o is None: mv.append((c, t, None))
                    else:
                        if o[0] != side: mv.append((c, t, None))
                        break
                    t = add(t, v)
        def leap(vs):
            for v in vs:
                t = add(c, v)
                if inb(t):
                    o = b.get(t)
                    if o is None or o[0] != side: mv.append((c, t, None))
        if p == 'R': slide(ROOK)
        elif p == 'B': slide(BISH)
        elif p == 'Q': slide(QUEEN)
        elif p == 'K': leap(KING)
        elif p == 'N': leap(KN)
        elif p == 'P':
            for v in PMOVE:
                t = add(c, orient(v, side))
                if inb(t) and t not in b:
                    if promo_sq(t, side):
                        for q in PROMO: mv.append((c, t, q))
                    else: mv.append((c, t, None))
            for v in PCAP:
                t = add(c, orient(v, side))
                if inb(t) and t in b and b[t][0] != side:
                    if promo_sq(t, side):
                        for q in PROMO: mv.append((c, t, q))
                    else: mv.append((c, t, None))
    return mv
def apply(b, m):
    c, t, q = m; nb = dict(b); s, p = nb.pop(c); nb[t] = (s, q or p); return nb
def targets(b, sq):
    c = parse(sq); side = b[c][0]
    return sorted(name(t) + ('=' + q if q else '') for (f, t, q) in gen(b, side) if f == c)
def attacked(b, side):
    """Cells attacked by `side` (captures possible if an enemy stood there)."""
    out = set()
    for c, (s, p) in b.items():
        if s != side: continue
        def slide(vs):
            for v in vs:
                t = add(c, v)
                while inb(t):
                    out.add(t)
                    if t in b: break
                    t = add(t, v)
        def leap(vs):
            for v in vs:
                t = add(c, v)
                if inb(t): out.add(t)
        if p == 'R': slide(ROOK)
        elif p == 'B': slide(BISH)
        elif p == 'Q': slide(QUEEN)
        elif p == 'K': leap(KING)
        elif p == 'N': leap(KN)
        elif p == 'P':
            for v in PCAP:
                t = add(c, orient(v, side))
                if inb(t): out.add(t)
    return out
def mirror(c):
    x, y, z, w = c
    return (x, 3 - y, z, 3 - w)
def setup(white):
    b = {}
    for sq, p in white.items():
        c = parse(sq); b[c] = ('w', p); b[mirror(c)] = ('b', p)
    return b
def empty_mobility(piece):
    tot = 0; mn = 999; mx = 0
    for c in CELLS:
        b = {c: ('w', piece)}
        n = len(gen(b, 'w'))
        tot += n; mn = min(mn, n); mx = max(mx, n)
    return tot / len(CELLS), mn, mx
def perft(b, side, d):
    if d == 0: return 1
    other = 'b' if side == 'w' else 'w'
    n = 0
    for m in gen(b, side):
        nb = apply(b, m)
        if any(p == 'K' and s == other for s, p in nb.values()) is False:
            n += 1  # king captured: leaf
            continue
        n += perft(nb, other, d - 1)
    return n
