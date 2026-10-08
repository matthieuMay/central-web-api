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
Person represented by a first name and last name. A User can be assigned to Cards and author Comments.
_Avoid_: account

**Assignee**:
A User assigned to work on a Card.
_Avoid_: Card user

**Comment**:
A note on a Card authored by a User, with a creation time.

**Checklist item**:
A task within a Card, with a description and a completion state.
_Avoid_: Todo task, Card

**Tag d’étape**:
Immutable git tag marking API lab checkpoints (e.g. mock → CRUD → errors).
_Avoid_: release version as the only progress marker
