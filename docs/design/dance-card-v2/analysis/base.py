import json, collections, os
d=json.load(open(os.environ['DC_SNAPSHOT']))
P={p['id']:p['name'] for p in d['people']}
CN={c['id']:P[c['celebrity_id']].split()[0] for c in d['couples']}
WN={w['id']:w['week_number'] for w in d['competition_weeks']}
EP={e['id']:e for e in d['episodes']}
EW={e['id']:WN.get(e['week_id']) for e in d['episodes']}
PR={p['id']:(p['display_name'] or '').strip() for p in d['profiles']}
LEAGUES=[l for l in d['leagues'] if l['draft_status']=='completed']
LN={l['id']:l['name'] for l in d['leagues']}
SET={s['league_id']:s for s in d['scoring_settings']}
PUB_WEEKS=sorted({EW[e['id']] for e in d['episodes'] if e['results_published_at'] and EW[e['id']]})
def rnd(x): 
    from decimal import Decimal, ROUND_HALF_UP
    return float(Decimal(repr(x)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
# per couple per week list of dances (scaled, total, max, team)
dances=collections.defaultdict(list)
for r in d['dance_scores']:
    w=EW[r['episode_id']]
    if w is None or not EP[r['episode_id']]['results_published_at']: continue
    dances[(r['couple_id'],w)].append(dict(ep=r['episode_id'],total=float(r['total_score']),scaled=float(r['scaled_score']),max=None if r['max_score'] is None else float(r['max_score']),team=r['team_id']))
outcome={}
bonus=collections.defaultdict(float)
for r in d['episode_results']:
    w=EW[r['episode_id']]
    if w is None or not EP[r['episode_id']]['results_published_at']: continue
    outcome[(r['couple_id'],w)]=r['outcome']; bonus[(r['couple_id'],w)]+=float(r['bonus_points'])
def night_scaled(ds):
    # engine collapseToNights (no points rows / 0-mark legacy in S35 published data)
    out=0
    byep=collections.defaultdict(list)
    for x in ds: byep[x['ep']].append(x)
    for ep,xs in byep.items():
        if len(xs)==1 and xs[0]['max'] is None: out+=xs[0]['scaled']; continue
        tot=sum(x['total'] for x in xs)
        mx=sum(x['max'] if x['max'] is not None else round(x['total']*3/x['scaled'])*10 for x in xs)
        out+=tot*30/mx
    return out
ROSTER={}
for l in LEAGUES:
    ROSTER[l['id']]=collections.defaultdict(list)
    for r in d['roster_slots']:
        if r['league_id']==l['id'] and r['couple_id']: ROSTER[l['id']][r['manager_id']].append(r['couple_id'])
STORED=collections.defaultdict(dict)
for r in d['weekly_manager_scores']:
    STORED[(r['league_id'],r['manager_id'])][WN[r['week_id']]]=r
def mname(lid,mid):
    m=[x for x in d['league_members'] if x['league_id']==lid and x['user_id']==mid][0]
    n=PR[mid]
    if m['co_manager_id']: n+=' & '+PR[m['co_manager_id']]
    return n
ANCHOR=2
def weekly_input(c,w,mode='pooled'):
    ds=dances.get((c,w),[])
    if not ds: return None
    if mode=='individual':
        ds=[x for x in ds if not x['team']]
        return night_scaled(ds) if ds else None
    if mode=='mean':
        return sum(x['scaled'] for x in ds)/len(ds)
    return night_scaled(ds)  # one episode per eligible week in S35, so pooled night == pooled week
COUPLES=[c['id'] for c in d['couples']]
def S_hist(c,mode='pooled',upto=8):
    return [weekly_input(c,w,mode) or 0 for w in range(ANCHOR,upto+1)]
def legacy_couple(c,mode='pooled',upto=8,mult=0.2449,surv=1.56):
    v=0
    for w in range(ANCHOR,upto+1):
        x=weekly_input(c,w,mode)
        if x is None: continue
        v+=x*mult
        o=outcome.get((c,w))
        if o and o not in ('eliminated','withdrawn','bye'): v+=surv
    return v
REF=[c for c in COUPLES if any(weekly_input(c,w) is not None for w in range(2,9))]
ACTIVE=[c for c in REF if weekly_input(c,8) is not None and outcome.get((c,8))!='eliminated']
PLACEMENT=[26.09,13.04,6.96,3.48,1.74]
def season_end(x=25.64):
    """Projected season-end per couple: (S_end, legacy_end_mean_contrib) with remaining 7 identical future x/week.
    Remaining finishes: 7th out wk9, 6th out wk10, five finalists dance wk11 (top3 survival, 4th/5th not)."""
    S={c:sum(S_hist(c)) for c in REF}
    L={c:legacy_couple(c) for c in REF}
    # futures by finishing position 1..7
    fut={}
    for pos in range(1,8):
        weeks = 1 if pos==7 else 2 if pos==6 else 3
        surv = {7:0,6:1}.get(pos, 2 + (1 if pos<=3 else 0))
        fut[pos]=(weeks*x, weeks*x*0.2449+surv*1.56+(PLACEMENT[pos-1] if pos<=5 else 0))
    return S,L,fut
