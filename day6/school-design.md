# School Database Design

## Tables

**students** – one row per student. Columns: `id` (primary key), `name` (required), `email` (required and `UNIQUE`, so two students can't share an address).

**courses** – one row per course. Columns: `id` (primary key), `title` (required), `teacher` (required).

**enrolments** – one row per "student X is enrolled on course Y". Columns: `id` (primary key), `student_id` (foreign key to `students`), `course_id` (foreign key to `courses`) and `grade` (optional, `NULL` until a grade is awarded). A `UNIQUE (student_id, course_id)` constraint stops the same student enrolling on the same course twice.

## Relationships

- **students → enrolments: one-to-many.** One student can have many enrolments, but each enrolment belongs to exactly one student.
- **courses → enrolments: one-to-many.** One course can have many enrolments, but each enrolment belongs to exactly one course.
- **students ↔ courses: many-to-many.** A student takes many courses, and a course has many students.

A many-to-many relationship can't be stored directly in two tables: putting a list of course IDs in a student row (or student IDs in a course row) breaks the one-value-per-cell rule, makes queries awkward and makes updates error-prone. A **join table** (`enrolments`) solves this by turning the many-to-many into two one-to-many relationships. It is also the natural home for data that belongs to the *pair*, such as the grade, which is neither a property of the student alone nor of the course alone.

## Index

I would add an index on `enrolments(course_id)`:

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

Reason: queries such as "all students on one course" and "students per course" filter and group by `course_id`. The `UNIQUE (student_id, course_id)` constraint already creates an index that helps lookups starting with `student_id`, but not ones starting with `course_id`. Without an index on `course_id`, the database must scan the whole enrolments table, which gets slow as the number of enrolments grows.

## SQL or NoSQL?

I would choose SQL (a relational database such as SQLite or PostgreSQL) for this system. School data is highly structured and full of relationships: students, courses and enrolments link to each other in predictable ways. A relational database enforces that structure for us with primary keys, foreign keys, `NOT NULL` and `UNIQUE` rules, so we can't enrol a student who doesn't exist or enrol them twice. It also handles many-to-many queries well with `JOIN` and `GROUP BY`, and its transactions keep data like grades consistent. A NoSQL document store would be more attractive if the data were loosely structured, changed shape often, or needed to scale across many servers, but none of those apply to a school's records, so SQL is the safer and simpler fit.