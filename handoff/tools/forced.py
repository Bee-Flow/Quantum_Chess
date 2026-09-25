import hyper4d as h, setups as s
h.set_rules(h.Q32, h.Q80)
def king(b, side):
    for c,(sd,p) in b.items():
        if sd==side and p=='K': return c
def can_capture_king(b, side):
    other='b' if side=='w' else 'w'
    k=king(b,other)
    return k is not None and k in h.attacked(b, side)
def forced2(b):
    wins=[]
    for m1 in h.gen(b,'w'):
        b1=h.apply(b,m1)
        ok=True
        for m2 in h.gen(b1,'b'):
            b2=h.apply(b1,m2)
            if king(b2,'w') is None or not can_capture_king(b2,'w'):
                ok=False;break
        if ok: wins.append(h.name(m1[0])+'-'+h.name(m1[1]))
    return wins
for nm,W in (('TESS',s.TESS),('MIRR',s.MIRR)):
    b=h.setup(W)
    # threats after one white move: how many first moves put the king en prise (attacked)?
    print(nm,'forced king capture after 1 white move:',forced2(b))
