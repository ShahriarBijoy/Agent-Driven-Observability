<#
  throttle : inject   (retained drill, not an exam question)

  The negative control. The model-proxy sheds half its completions with 429s and
  the gateway propagates them verbatim as 429 model_overloaded. A 429 is a 4xx,
  so the 5xx alert and the availability SLO stay green: users are visibly
  degraded and NOTHING pages.

  The question it poses to a human is "why are users seeing 'model overloaded'
  errors?" with no alert pointing anywhere - and the trap is the lab's other
  429: the per-tenant limiter's `rate_limited`, which is the system working as
  designed. Same status code, opposite conclusion.

  expected_time_to_alert_s is 0 because there is no alert to wait for; the exam
  runner has nothing to poll here, which is another reason this is a drill.

  Idempotent: re-injecting merges the same override again.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobInject $PSScriptRoot) {
    Write-Step 'injected. Expect 429 model_overloaded at the gateway - and no alert at all.'
    exit 0
}
exit 1
