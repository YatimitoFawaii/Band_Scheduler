#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository."
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" == "HEAD" ]]; then
  echo "Detached HEAD detected. Check out a branch before publishing."
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "No changes to publish."
  exit 0
fi

if [[ "$#" -gt 0 ]]; then
  message="$*"
else
  message="Update $(date '+%Y-%m-%d %H:%M:%S')"
fi

git commit -m "$message"

if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1; then
  git push
else
  git push -u origin "$branch"
fi

echo "Published to GitHub on branch $branch"
