<#
  timeout : inject   (retained drill, not an exam question)

  A quarter of model-proxy completions hang for stallMs (30s), blowing through
  the gateway's 8s upstream timeout: the caller gets 504 upstream_timeout, and
  every failing trace shows a model-proxy span cut off at exactly ~8s. That is
  what separates it from 02-error-storm, where the upstream answers quickly with
  an error - same alert, different story, and telling them apart is the skill
  the drill rehearses.

  Not an exam question because it lands on the same alert and the same service
  as scenarios the exam already grades; kept because it is the cheapest way to
  rehearse the 502-vs-504 distinction.

  Sizing note: the drill this replaces stalled 15% of requests, sized for
  minutes of sustained load. A verify has to reach a conclusion from a bounded
  probe burst, so the rate is 0.25 - still a partial fault, but now a 16-probe
  sample sees it ~99% of the time while a healthy lab (base pStall 0.01) trips
  the 2-probe threshold about once in a hundred runs.

  Idempotent: re-injecting merges the same override again.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobInject $PSScriptRoot) {
    Write-Step 'injected. Expect 504 upstream_timeout (NOT 502) within seconds; the 5xx alert fires ~2-3 min in.'
    exit 0
}
exit 1
