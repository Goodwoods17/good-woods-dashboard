# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker (GitHub Issues).

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## First-use note

These labels don't exist on the GitHub repo yet (no issues have been opened with labels as of 2026-05-24). The first time the `triage` skill runs, it will need to create them via `gh label create`. Suggested colors that match the dashboard's status palette:

| Label             | Suggested color | Description                              |
| ----------------- | --------------- | ---------------------------------------- |
| `needs-triage`    | `#C99846`       | Warm amber — pending review              |
| `needs-info`      | `#9A968D`       | Soft gray — paused on reporter           |
| `ready-for-agent` | `#6B8E5C`       | Muted sage — green-lit for an AFK agent  |
| `ready-for-human` | `#B86F52`       | Muted clay — green-lit for a person      |
| `wontfix`         | `#7A8B6F`       | Soft moss — closed without action        |

Create them with:

```bash
gh label create needs-triage --color C99846 --description "Maintainer needs to evaluate"
gh label create needs-info --color 9A968D --description "Waiting on reporter for more info"
gh label create ready-for-agent --color 6B8E5C --description "Fully specified, AFK-agent ready"
gh label create ready-for-human --color B86F52 --description "Requires human implementation"
gh label create wontfix --color 7A8B6F --description "Will not be actioned"
```

Edit the right-hand column above to match whatever vocabulary you actually use if you ever decide to rename them.
