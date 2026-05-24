# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues at
`Goodwoods17/good-woods-dashboard`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Project-specific notes

- The repo is public, so issues are public. Don't include
  credentials, customer PII, or anything you wouldn't want a future
  hire seeing.
- The `feat/estimator-rework` branch is the active working branch
  (significantly ahead of `main`). When `to-issues` creates new
  tickets, default the milestone / target to that branch's work
  unless the user specifies otherwise.
- For now there's only one maintainer (Andrew). Don't expect issue
  assignees or reviewers to be set; that becomes meaningful when
  team members start logging in.
