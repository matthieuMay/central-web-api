# Mini-Trello API

REST API provided to students for Sprint 3+. Board / Column / Card over HTTP.

## Language

**Board**:
Kanban board resource: has many Columns.
_Avoid_: project, workspace

**Column**:
Named list on a Board: has many Cards.
_Avoid_: list (in API paths use `columns`)

**Card**:
Task item in a Column: title required.
_Avoid_: ticket, issue

**Tag d’étape**:
Immutable git tag marking API lab checkpoints (e.g. mock → CRUD → errors).
_Avoid_: release version as the only progress marker
