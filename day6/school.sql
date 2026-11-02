-- Day 6: A School Database (SQLite)

PRAGMA foreign_keys = ON;

-- 1. TABLES ---------------------------------------------------------

CREATE TABLE students (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    title   TEXT NOT NULL,
    teacher TEXT NOT NULL
);

CREATE TABLE enrolments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL,
    course_id   INTEGER NOT NULL,
    grade       TEXT,  -- NULL until a grade is given
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id)  REFERENCES courses(id),
    UNIQUE (student_id, course_id)  -- same student cannot enrol on the same course twice
);

-- 2. SAMPLE DATA ----------------------------------------------------

INSERT INTO students (name, email) VALUES
    ('Amina Wanjiku', 'amina@example.com'),
    ('Brian Otieno',  'brian@example.com'),
    ('Cynthia Achieng', 'cynthia@example.com'),
    ('Daniel Kimani', 'daniel@example.com');  -- will have no enrolments

INSERT INTO courses (title, teacher) VALUES
    ('Mathematics',      'Mr. Mwangi'),
    ('Biology',          'Ms. Njeri'),
    ('Computer Science', 'Dr. Omondi');

INSERT INTO enrolments (student_id, course_id, grade) VALUES
    (1, 1, 'A'),
    (1, 3, 'B'),
    (2, 1, 'C'),
    (2, 2, 'B'),
    (3, 3, 'A'),
    (3, 1, NULL);

-- 3. QUERIES --------------------------------------------------------

-- Q1: All courses for one student (by name)
SELECT s.name, c.title, c.teacher, e.grade
FROM students s
JOIN enrolments e ON e.student_id = s.id
JOIN courses c    ON c.id = e.course_id
WHERE s.name = 'Amina Wanjiku';

-- Q2: All students on one course
SELECT c.title, s.name, s.email, e.grade
FROM courses c
JOIN enrolments e ON e.course_id = c.id
JOIN students s   ON s.id = e.student_id
WHERE c.title = 'Mathematics';

-- Q3: Number of students per course (LEFT JOIN keeps courses with 0 students)
SELECT c.title, COUNT(e.id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON e.course_id = c.id
GROUP BY c.id, c.title;

-- Q4: Students who have no enrolments
SELECT s.id, s.name, s.email
FROM students s
LEFT JOIN enrolments e ON e.student_id = s.id
WHERE e.id IS NULL;

-- Q5: Update one enrolment's grade (Cynthia's Mathematics grade)
UPDATE enrolments
SET grade = 'B'
WHERE student_id = (SELECT id FROM students WHERE name = 'Cynthia Achieng')
  AND course_id  = (SELECT id FROM courses  WHERE title = 'Mathematics');

-- Check the update
SELECT s.name, c.title, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses c  ON c.id = e.course_id
WHERE s.name = 'Cynthia Achieng';