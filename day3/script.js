// ---------- Starting data ----------
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const CATEGORIES = ["personal", "work", "study"];
const MAX_LENGTH = 200;

// ---------- Helper ----------
// Trim, collapse repeated spaces and lower-case, so comparisons ignore
// case and extra spaces.
function normalise(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

// ---------- 1. searchNotes ----------
// Returns an array of notes whose text contains the word (any case).
function searchNotes(word) {
  const target = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(target));
}

// ---------- 2. longestNote ----------
// Returns the note object with the most characters, or null if empty.
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// ---------- 3. countByCategory ----------
// Returns an object such as { personal: 2, study: 2, work: 1 }.
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 0;
    }
    counts[note.category]++;
  }
  return counts;
}

// ---------- 4. getSummary ----------
// Returns a sentence such as "5 notes: 2 personal, 2 study, 1 work."
// Categories are listed in the order countByCategory() found them.
function getSummary() {
  const counts = countByCategory();
  const total = notes.length;
  const noun = total === 1 ? "note" : "notes";

  if (total === 0) {
    return `0 ${noun}.`;
  }

  const parts = [];
  for (const [category, count] of Object.entries(counts)) {
    parts.push(`${count} ${category}`);
  }
  return `${total} ${noun}: ${parts.join(", ")}.`;
}

// ---------- 5. isDuplicate ----------
// True if a note with the same text exists (ignoring case and extra spaces).
function isDuplicate(text) {
  const target = normalise(text);
  return notes.some((note) => normalise(note.text) === target);
}

// ---------- 6. addNote ----------
// Adds a note if valid. Returns true when added, false otherwise (and logs why).
function addNote(text, category) {
  if (typeof text !== "string") {
    console.log("Not added: text must be a string.");
    return false;
  }

  const cleaned = text.trim();

  if (cleaned.length < 1 || cleaned.length > MAX_LENGTH) {
    console.log(`Not added: text must be 1-${MAX_LENGTH} characters.`);
    return false;
  }

  if (isDuplicate(cleaned)) {
    console.log(`Not added: "${cleaned}" already exists.`);
    return false;
  }

  if (!CATEGORIES.includes(category)) {
    console.log(`Not added: category must be one of ${CATEGORIES.join(", ")}.`);
    return false;
  }

  const nextId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  notes.push({ id: nextId, text: cleaned, category: category });
  return true;
}

// ---------- Tests (open the Console to see the results) ----------

// searchNotes
console.log("searchNotes('milk'):", searchNotes("milk"));
// [{ id: 1, text: "Buy milk and bread", category: "personal" }]
console.log("searchNotes('REVISE'):", searchNotes("REVISE"));
// [{ id: 4, text: "Revise JavaScript arrays", category: "study" }]  (case ignored)
console.log("searchNotes('zebra'):", searchNotes("zebra"));
// []  (edge case: no results)

// longestNote
console.log("longestNote():", longestNote());
// { id: 3, text: "Email the project report to Grace", category: "work" }
const savedNotes = notes;
notes = [];
console.log("longestNote() on empty array:", longestNote());
// null  (edge case: no notes)
notes = savedNotes;

// countByCategory
console.log("countByCategory():", countByCategory());
// { personal: 2, study: 2, work: 1 }
notes = [];
console.log("countByCategory() on empty array:", countByCategory());
// {}  (edge case: no notes)
notes = savedNotes;

// getSummary
console.log("getSummary():", getSummary());
// "5 notes: 2 personal, 2 study, 1 work."
notes = [{ id: 1, text: "Only note", category: "work" }];
console.log("getSummary() with one note:", getSummary());
// "1 note: 1 work."  (edge case: singular "note")
notes = [];
console.log("getSummary() with no notes:", getSummary());
// "0 notes."  (edge case: empty)
notes = savedNotes;

// isDuplicate
console.log("isDuplicate('call mum'):", isDuplicate("call mum"));
// true  (case ignored)
console.log("isDuplicate('  BUY   milk and   bread '):", isDuplicate("  BUY   milk and   bread "));
// true  (extra spaces and case ignored)
console.log("isDuplicate('Walk the dog'):", isDuplicate("Walk the dog"));
// false

// addNote
console.log("addNote('Walk the dog', 'personal'):", addNote("Walk the dog", "personal"));
// true  (added as id 6)
console.log("addNote('walk the DOG', 'personal'):", addNote("walk the DOG", "personal"));
// logs: Not added: "walk the DOG" already exists.  then false
console.log("addNote('', 'work'):", addNote("", "work"));
// logs: Not added: text must be 1-200 characters.  then false
console.log("addNote('a'.repeat(201), 'work'):", addNote("a".repeat(201), "work"));
// logs: Not added: text must be 1-200 characters.  then false
console.log("addNote('Plan holiday', 'hobby'):", addNote("Plan holiday", "hobby"));
// logs: Not added: category must be one of personal, work, study.  then false
console.log("addNote('a'.repeat(200), 'study'):", addNote("a".repeat(200), "study"));
// true  (edge case: exactly 200 characters is allowed, added as id 7)
console.log("getSummary() after adding:", getSummary());
// "7 notes: 3 personal, 3 study, 1 work."