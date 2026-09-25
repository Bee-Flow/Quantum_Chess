import hyper4d as h
h.set_rules(h.Q32, h.Q80)
def pawns(files='bc'):
    return {f"{B}2{f}2": 'P' for B in 'ABCD' for f in files}
TESS = {'A1b1':'R','A1c1':'B','B1b1':'N','B1c1':'Q','C1b1':'K','C1c1':'N','D1b1':'B','D1c1':'R', **pawns()}
ALT = {'A1b1':'R','A1c1':'B','B1b1':'N','B1c1':'Q','C1b1':'K','C1c1':'N','D1b1':'R','D1c1':'B', **pawns()}
def report(nm, W):
    b = h.setup(W)
    print('==', nm, 'pieces', len(b))
    for side in 'wb':
        mv = h.gen(b, side)
        by = {}
        for (f, t, q) in mv:
            p = b[f][1]; by[p] = by.get(p, 0) + 1
        other = 'b' if side == 'w' else 'w'
        att = h.attacked(b, side)
        hit = sorted(h.name(c)+b[c][1] for c in b if b[c][0] == other and c in att)
        print(side, 'moves', len(mv), by, 'attacks enemy on', hit)
    # bishop colours
    for c,(s,p) in sorted(b.items()):
        if p=='B': print('  bishop', s, h.name(c), 'parity', sum(c)%2)
    print('perft2', h.perft(b, 'w', 2))
    # can White capture king within 2 own moves regardless? count white moves after which white attacks black king
    kb = [c for c,(s,p) in b.items() if s=='b' and p=='K'][0]
    n=0; ex=[]
    for m in h.gen(b,'w'):
        nb=h.apply(b,m)
        if kb in h.attacked(nb,'w'): n+=1; ex.append(h.name(m[0])+'-'+h.name(m[1]))
    print('white first moves that attack the black king:', n, ex[:10])
report('TessChess', TESS)
report('ALT (rook/bishop swapped on board D)', ALT)
MIRR = {'A1b1':'R','A1c1':'B','B1b1':'Q','B1c1':'N','C1b1':'K','C1c1':'N','D1b1':'R','D1c1':'B', **pawns()}
report('MIRROR (R Q K R / B N N B)', MIRR)
