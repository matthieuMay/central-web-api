# Mini-Trello API

REST API provided to students from the optional Day 2 Sprint 1 bonus onward. Board / Column / Card over HTTP.

## Language

**Board**:
Kanban board resource: has many Columns.
_Avoid_: project, workspace

**Column**:
Named list on a Board: has many Cards.
_Avoid_: list (in API paths use `columns`)

**Card**:
Task item in a Column: title required, description optional. Its position is expressed by order within the Column.
_Avoid_: ticket, issue

**User**:
Person represented by a first name and last name, independent of Boards, Columns, and Cards.
_Avoid_: account

**Tag d’étape**:
Immutable git tag marking API lab checkpoints (e.g. mock → CRUD → errors).
_Avoid_: release version as the only progress marker
