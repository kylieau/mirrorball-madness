exec(open('base.py').read()); exec(open('model.py').read())
import itertools, statistics as st
X=25.64
S8={c:sum(S_hist(c)) for c in REF}
# predeclared projection: remaining couples finish in order of S through wk8 (higher S = later exit). Illustrative only.
act=sorted(ACTIVE,key=lambda c:-S8[c]); pos={c:i+1 for i,c in enumerate(act)}
def weeks_fut(p): return 1 if p==7 else 2 if p==6 else 3
def surv_fut(p): return {7:0,6:1}.get(p, 2+(1 if p<=3 else 0))
Send={c:S8[c]+(weeks_fut(pos[c])*X if c in pos else 0) for c in REF}
def legacy_end(c, placement=True, surv=True):
    v=legacy_couple(c,surv=1.56 if surv else 0)
    if c in pos:
        p=pos[c]; v+=weeks_fut(p)*X*0.2449+(surv_fut(p)*1.56 if surv else 0)+(PLACEMENT[p-1] if placement and p<=5 else 0)
    return v
def kmodel(p): return 100/median_seat_value(2,lambda r:couple_S(r)**p)
REGIMES={'A legacy (shipped)':lambda c:legacy_end(c),
         'D legacy, no placement':lambda c:legacy_end(c,placement=False)}
for p in [0.6,0.7,0.8,0.85,0.9,1.0]:
    REGIMES[f'judges-only p={p}']=(lambda p: lambda c: kmodel(p)*Send[c]**p)(p)
# consensus ADP
adp={}
for c in REF:
    ps=[x['pick_number']/len([y for y in d['draft_picks'] if y['league_id']==x['league_id']]) for x in d['draft_picks'] if x['couple_id']==c]
    adp[c]=st.mean(ps) if ps else 9
adp_order=sorted(REF,key=lambda c:adp[c])
def seat_spread(vals,m=6):
    seats=[vals[adp_order[i]]+vals[adp_order[2*m-1-i]] for i in range(m)]
    return (max(seats)-min(seats))/st.mean(seats), seats
rows=[]
for name,f in REGIMES.items():
    vals={c:f(c) for c in REF}
    mean=st.mean(vals.values())
    pairs=[vals[a]+vals[b] for a,b in itertools.combinations(REF,2)]
    cv=st.pstdev(pairs)/st.mean(pairs)
    first=[c for c in act if pos[c]==1][0]; seventh=[c for c in act if pos[c]==7][0]
    giada=[c for c in REF if CN[c]=='Giada'][0]; jack=[c for c in REF if CN[c]=='Jackson'][0]; tyl=[c for c in REF if CN[c]=='Tyler'][0]
    p1=vals[first]; p5=vals[[c for c in act if pos[c]==5][0]]
    ss,_=seat_spread(vals)
    rows.append((name, mean, cv, p1, p5, vals[seventh], (vals[jack]+vals[tyl])/p1, vals[giada]/p1, (p1-p5), ss))
print(f"{'regime':26} {'mean':>6} {'pairCV':>7} {'1st':>6} {'5th':>6} {'7th':>6} {'J+T/1st':>8} {'Giada/1st':>9} {'1st-5th':>8} {'seatSpread':>10}")
for r in rows: print(f"{r[0]:26} {r[1]:6.2f} {r[2]*100:6.1f}% {r[3]:6.2f} {r[4]:6.2f} {r[5]:6.2f} {r[6]*100:7.1f}% {r[7]*100:8.1f}% {r[8]:8.2f} {r[9]*100:9.1f}%")
print('projected finish order', [CN[c] for c in act])
print()
def hist_end(c):
    h=[x for x in S_hist(c) if x]  # weeks 2-8 danced
    if c in pos: h+= [X]*weeks_fut(pos[c])
    return h
def idx_val(h,p): return sum(x*((n+1)**p-n**p) for n,x in enumerate(h))
def kmodel_idx(p): return 100/median_seat_value(2,lambda r:judge(r)*path(r)[0]**p)
jen=[c for c in REF if CN[c]=='Jenna'][0]; tat=[c for c in REF if CN[c]=='Tatyana'][0]
print('equal-longevity quality ratio through wk8, Jenna/Tatyana raw S:', round(S8[jen]/S8[tat],3))
for p in [0.8,0.85,1.0]:
    print(f' S^{p}:', round((S8[jen]/S8[tat])**p,3))
for p in [0.6,0.7,0.8]:
    k=kmodel_idx(p); vals={c:k*idx_val(hist_end(c),p) for c in REF}
    pairs=[vals[a]+vals[b] for a,b in itertools.combinations(REF,2)]
    first=[c for c in act if pos[c]==1][0]; p1=vals[first]
    jack=[c for c in REF if CN[c]=='Jackson'][0]; tyl=[c for c in REF if CN[c]=='Tyler'][0]
    hj=[x for x in S_hist(jen) if x]; ht=[x for x in S_hist(tat) if x]
    rev=idx_val(hj[::-1],p)/idx_val(hj,p)
    print(f'week-index p={p}: k={k:.4f} mean {st.mean(vals.values()):.2f} pairCV {st.pstdev(pairs)/st.mean(pairs)*100:.1f}% 1st {p1:.2f} J+T/1st {(vals[jack]+vals[tyl])/p1*100:.1f}% quality ratio {idx_val(hj,p)/idx_val(ht,p):.3f}  Jenna reversed-order/actual {rev:.3f}')
