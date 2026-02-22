# Quick GitHub Publish

Use this one command to add, commit, and push changes:

```bash
./scripts/publish.sh "Your commit message"
```

If you omit the message, the script uses a timestamped default message.

## What it does
- `git add -A`
- `git commit -m "..."`
- `git push` (or `git push -u origin <branch>` when upstream is not set)

## Render auto-deploy
If your Render service is connected to this GitHub repo/branch, each push triggers an automatic deploy.
