#!/usr/bin/env bash
# Usage: bash scripts/v2/merge-step.sh <PR number>
# Waits for CI, then squash-merges the PR into v2. Refuses any PR whose base is not v2.
set -euo pipefail
pr="${1:?PR number required}"
base=$(gh pr view "$pr" --json baseRefName -q .baseRefName)
if [ "$base" != "v2" ]; then
  echo "Refusing: PR #$pr targets '$base', not 'v2'." >&2
  exit 2
fi
state=$(gh pr view "$pr" --json state -q .state)
if [ "$state" != "OPEN" ]; then
  echo "PR #$pr is $state; nothing to merge."
  exit 0
fi
echo "Waiting for CI on PR #$pr ..."
if ! timeout 2400 gh pr checks "$pr" --watch --interval 30; then
  echo "CI is not green for PR #$pr. Run the Fix-up procedure." >&2
  exit 1
fi
gh pr merge "$pr" --squash --delete-branch
echo "Merged PR #$pr into v2."
