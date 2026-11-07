# Port of src/lib/strong-play-ceilings.ts (12-couple schedule model, no realized outcomes)
TOTAL=12; FIN=4
def judge(rank): return 28+(21-28)*(rank-1)/(TOTAL-1)
def path(rank):
    ew=TOTAL-FIN; dw=ew+1
    if rank<=3: return dw,dw,rank
    if rank==4: return dw,ew,4
    wo=TOTAL-rank+1; return wo,wo-1,(5 if rank==5 else None)
def mgrs(n): return max(2,TOTAL//n)
def slots(n):
    m=mgrs(n); s=[[] for _ in range(m)]
    for pick in range(m*n):
        r=pick//m; i=pick%m; slot=i if r%2==0 else m-1-i; s[slot].append(pick+1)
    return s
def median_idx(m):
    mid=(m-1)/2; import math; lo=math.floor(mid); hi=math.ceil(mid); return [lo] if lo==hi else [lo,hi]
def couple_S(rank): return judge(rank)*path(rank)[0]
def median_seat_value(n,f):
    s=slots(n); idx=median_idx(len(s))
    return sum(sum(f(r) for r in s[i]) for i in idx)/len(idx)
