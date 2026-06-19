"""The shared tool layer — the toolkit every agent draws from.

Tools are plain async functions (backends.py) wrapped as Claude Agent SDK tools
(sdk.py). They validate inputs, never raise (structured errors instead), and are
timed + traced by the run loop. Only the system prompt and the allow-list differ
between agents.
"""
