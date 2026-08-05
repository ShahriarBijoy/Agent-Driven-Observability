<#
  brownout : inject   (retained drill, not an exam question)

  The subtle cousin of the outage: most requests still succeed, so dashboards
  look "mostly fine" while the error budget quietly burns. Only some traces fail,
  and they fail on the retriever span.

  Not an exam question because 02-error-storm already grades this signature at a
  higher rate; kept because the weak-signal version is the one worth practising
  on - it is where reading a burn rate beats eyeballing a graph.

  Sizing note: the drill this replaces used 0.10, sized for minutes of sustained
  load. At that rate a bounded probe burst is inconclusive, so the rate is 0.2 -
  still visibly partial, but a 30-probe sample now sees at least 3 failures ~98%
  of the time while a healthy lab trips it ~2%.

  Idempotent: re-injecting merges the same override again.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobInject $PSScriptRoot) {
    Write-Step 'injected. No cliff - watch the availability burn rate rather than the error graph.'
    exit 0
}
exit 1
