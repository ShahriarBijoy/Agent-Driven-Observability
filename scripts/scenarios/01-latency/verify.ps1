<#
  01-latency : verify

  Two assertions, reported separately so a failure says which half broke:
    1. the fault is live  - every model-proxy instance reports latencyBaseMs >= 2500
    2. its signal exists  - gateway probes SUCCEED with a median past 2s

  The median, not the max: one slow request proves nothing (a cold pod, a GC
  pause, a noisy VM), while a median past the threshold means the distribution
  moved - which is exactly what the p95 alert is reacting to.

  A handful of 5xx is tolerated rather than fatal. model-proxy's base config is
  deliberately noisy (p500 0.01, pStall 0.01), so a bounded probe burst on a
  perfectly healthy lab fails ~2% of the time; demanding zero errors would make
  this verify flake on the lab working as designed.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobVerify $PSScriptRoot) { exit 0 }
exit 1
