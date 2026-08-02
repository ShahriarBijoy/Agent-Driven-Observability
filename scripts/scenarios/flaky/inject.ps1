<#
  flaky : inject   (retained drill, not an exam question)

  Hard mode for RCA. From a base that sits just under the page threshold (p500
  1.5%), each request has a small chance of tipping the model-proxy into a
  45-second degraded window where fault rates are multiplied 40x (~60% 500s). At
  the drill's baseline traffic that is a burst every minute or two: errors
  spike, recover, spike again. The alert flaps.

  What it rehearses is timeline correlation - "recurring short bursts, healthy in
  between" is a different diagnosis from "a service is failing", and the
  difference only shows in when the errors happened, not how many.

  Not an exam question, and it is the ONLY scenario whose verify cannot prove
  its own signal: whether a burst is happening right now is a coin toss with a
  45-second face. Under the pack's contract that would be a defect; here it is
  recorded as the reason this scenario is not graded, and no exam depends on it.

  Idempotent: re-injecting merges the same override again.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobInject $PSScriptRoot) {
    Write-Step 'injected. Expect the 5xx alert to fire, resolve and re-fire across the drill.'
    exit 0
}
exit 1
