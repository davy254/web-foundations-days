const loadButton = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusEl = document.getElementById("status");
const usersList = document.getElementById("users-list");

const API_URL = "https://jsonplaceholder.typicode.com/users";

// All fetched users are kept here so filtering never needs a new request
let allUsers = [];

async function loadUsers() {
  loadButton.disabled = true;
  statusEl.textContent = "Loading users...";
  usersList.replaceChildren();

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    allUsers = await response.json();
    applyFilter();
    statusEl.textContent = `Loaded ${allUsers.length} users.`;
  } catch (error) {
    allUsers = [];
    statusEl.textContent = `Error: ${error.message}. Please try again.`;
  } finally {
    loadButton.disabled = false;
  }
}

function renderUsers(users) {
  usersList.replaceChildren();

  for (const user of users) {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("div");
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("div");
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("div");
    company.textContent = `Company: ${user.company.name}`;

    li.append(name, email, city, company);
    usersList.append(li);
  }
}

function applyFilter() {
  const query = filterInput.value.trim().toLowerCase();

  const filtered = allUsers.filter((user) =>
    user.name.toLowerCase().includes(query)
  );

  renderUsers(filtered);

  // Only update the status from here once data has been loaded
  if (allUsers.length > 0) {
    statusEl.textContent = query
      ? `Showing ${filtered.length} of ${allUsers.length} users.`
      : `Loaded ${allUsers.length} users.`;
  }
}

loadButton.addEventListener("click", loadUsers);
filterInput.addEventListener("input", applyFilter);