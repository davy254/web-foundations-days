const MAX_CHARS = 200;
const WARN_AT = 180;

const textarea = document.getElementById("description");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeBtn = document.getElementById("theme-toggle");

function updateCounts() {
  const text = textarea.value;
  const chars = text.length;
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  charCount.textContent = `${chars} / ${MAX_CHARS} characters`;
  wordCount.textContent = `${words} words`;

  charCount.classList.toggle("warning", chars > WARN_AT && chars <= MAX_CHARS);
  charCount.classList.toggle("over", chars > MAX_CHARS);
}

function saveDraft() {
  localStorage.setItem("draft", textarea.value);
}

function clearAll() {
  textarea.value = "";
  localStorage.removeItem("draft");
  updateCounts();
}

function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeBtn.textContent = isDark ? "Light mode" : "Dark mode";
}

textarea.addEventListener("input", () => {
  updateCounts();
  saveDraft();
});

textarea.addEventListener("keydown", (e) => {
  if (e.key === "Escape") clearAll();
});

clearBtn.addEventListener("click", clearAll);

themeBtn.addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark);
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

// On page load: restore draft and theme, then update counters
textarea.value = localStorage.getItem("draft") || "";
applyTheme(localStorage.getItem("theme") === "dark");
updateCounts();