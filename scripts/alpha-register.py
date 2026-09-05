import json, html, re

rows = json.load(open('/tmp/claude-1000/-home-vx-Desktop-Claude-FixThisInjustice/35dd4ed8-2752-46fa-9a1c-8765a101a326/scratchpad/ledger.json'))

SHIPPED = {'C0.2', 'C1.03.1', 'C1.08.8', 'C1.13.1', 'C1.03.4'}

def status(r):
    d, u = r['disp'], r['disp'].upper()
    if r['id'] in SHIPPED: return ('shipped', 'Shipped')
    if u.startswith('CHALLENGE') or u.startswith('NOT ACTIONED'): return ('push', 'Pushed back')
    if u.startswith('PARTIAL'): return ('push', 'Partial')
    if u.startswith('DECIDE') or u.startswith('BLOCKED'): return ('open', 'Open')
    if u.startswith('ACCEPT-SUB'): return ('sub', 'Sub-plan')
    if u.startswith('SUPERSEDED'): return ('answered', 'Superseded')
    if u.startswith('ALREADY BUILT'): return ('shipped', 'Already built')
    if u.startswith('ACCEPT') or u.startswith('NOTED'): return ('planned', 'Planned')
    return ('answered', 'Answered')

def esc(t):
    t = html.escape(t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    return t

SECTION_TITLE = {
 'w0 — how to test': ('w0', 'How to test'),
 'w1.01 / w1.02 — boot and intro': ('w1.01–02', 'Boot and intro'),
 'w1.03 — shell topbar': ('w1.03', 'Shell topbar'),
 'w1.04 / w1.05 — units and nav': ('w1.04–05', 'Units and nav'),
 'w1.06 — timezone': ('w1.06', 'Timezone'),
 'w1.07 — body, part one': ('w1.07', 'Body, part one'),
 'w1.08 — body, part two': ('w1.08', 'Body, part two'),
 'w1.09 — training context': ('w1.09', 'Training context'),
 'w1.10 / w1.11 / w1.12 — goal, target date, programme': ('w1.10–12', 'Goal, target date, programme'),
 'w1.13 / w1.14 / w1.15 — readiness, review, notice': ('w1.13–15', 'Readiness, review, notice'),
 'w1 general': ('w1', 'Across the stage'),
}

order = list(SECTION_TITLE.keys())
counts = {}
for r in rows:
    counts[status(r)[1]] = counts.get(status(r)[1], 0) + 1

blocks = []
for sec in order:
    items = [r for r in rows if r['sec'] == sec]
    if not items: continue
    step, title = SECTION_TITLE[sec]
    trs = []
    for r in items:
        cls, label = status(r)
        trs.append(
            f'<tr><th scope="row">{html.escape(r["id"])}</th>'
            f'<td>{esc(r["claim"])}</td>'
            f'<td><span class="chip {cls}">{label}</span></td>'
            f'<td class="disp">{esc(r["disp"])}</td></tr>'
        )
    blocks.append(
        f'<section class="stage">\n<h3><span class="step">{step}</span>{html.escape(title)}'
        f'<span class="n">{len(items)} claims</span></h3>\n'
        f'<div class="scroll"><table class="reg">\n<thead><tr>'
        f'<th scope="col">Id</th><th scope="col">What you asked</th>'
        f'<th scope="col">Status</th><th scope="col">Disposition</th></tr></thead>\n'
        f'<tbody>\n' + '\n'.join(trs) + '\n</tbody></table></div>\n</section>'
    )

open('/tmp/claude-1000/-home-vx-Desktop-Claude-FixThisInjustice/35dd4ed8-2752-46fa-9a1c-8765a101a326/scratchpad/register.html','w').write('\n'.join(blocks))
print('rows', len(rows))
print(json.dumps(counts, indent=1))
