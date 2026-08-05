<#
  02-error-storm : verify

  Two assertions, reported separately so a failure says which half broke:
    1. the fault is live      - every retriever instance reports errorRate >= 0.3
    2. its signal exists      - the gateway actually returns 5xx under probe

  Assertion 2 matters more than it looks. The chaos plane accepting a knob does
  not prove requests are failing: if traffic never reaches the retriever, the
  exam would grade an agent on an incident that produced no telemetry. The probe
  classifies status codes rather than counting thrown exceptions, because
  Invoke-WebRequest throws on 401 and 422 too - the first version of this file
  reported "signal present: 12/12" against a cleanly reverted lab, purely
  because the probe was missing its bearer token.

  The threshold is 3-of-24, not 1-of-12, and the reason is the OTHER half of
  the lab: model-proxy's base config fails ~2% of requests by design (p500 0.01
  plus a 1% stall past the 8s upstream timeout). One 5xx in a dozen probes is
  therefore an ordinary event on a healthy lab, and a verify that accepted it
  would still "find the fault" after a clean revert - the exact weakness
  Test-Scenario's second verify exists to catch.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobVerify $PSScriptRoot) { exit 0 }
exit 1
