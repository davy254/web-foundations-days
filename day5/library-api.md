# Library API: Books Resource

**Base URL:** `/api/v1`
**Format:** JSON for all request and response bodies.

## Endpoints

### 1. List all books
- **Method:** `GET`
- **Path:** `/books`
- **Description:** Returns every book in the library.
- **Request body:** none
- **Success status:** `200 OK`

### 2. Get one book
- **Method:** `GET`
- **Path:** `/books/{id}`
- **Description:** Returns the single book with the given id.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book
- **Method:** `POST`
- **Path:** `/books`
- **Description:** Adds a new book to the library.
- **Example request body:**
```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "isbn": "9780385474542",
    "year": 1958
  }
```
- **Success status:** `201 Created` (the response includes the new book with its generated `id`)

### 4. Replace a book
- **Method:** `PUT`
- **Path:** `/books/{id}`
- **Description:** Replaces the whole book record with the data sent.
- **Example request body:**
```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "isbn": "9780385474542",
    "year": 1959
  }
```
- **Success status:** `200 OK`

### 5. Update part of a book
- **Method:** `PATCH`
- **Path:** `/books/{id}`
- **Description:** Updates only the fields included in the request.
- **Example request body:**
```json
  {
    "year": 1958
  }
```
- **Success status:** `200 OK`

### 6. Delete a book
- **Method:** `DELETE`
- **Path:** `/books/{id}`
- **Description:** Permanently removes the book from the library.
- **Request body:** none
- **Success status:** `204 No Content` (the response has no body)

### 7. List books by an author
- **Method:** `GET`
- **Path:** `/books?author={name}`
- **Description:** Returns only the books written by the given author. The author is a query parameter, so this is the same endpoint as "List all books" with a filter.
- **Example:** `GET /books?author=Chinua%20Achebe`
- **Request body:** none
- **Success status:** `200 OK` (an empty array `[]` if the author has no books)

## Error codes

| Code | Name | Meaning |
|------|------|---------|
| 400 | Bad Request | The request is malformed or fails validation. |
| 404 | Not Found | The requested resource does not exist. |

### 400 Bad Request
Happens when the client sends invalid data.

**Example:** `POST /books` with a body that is missing the required `title` field, or where `year` is the text `"nineteen fifty"` instead of a number.

```json
{
  "error": "Bad Request",
  "message": "The field 'title' is required."
}
```

### 404 Not Found
Happens when the id in the path doesn't match any book.

**Example:** `GET /books/9999` when no book with id `9999` exists. The same applies to `PUT`, `PATCH` and `DELETE` on a missing id.

```json
{
  "error": "Not Found",
  "message": "No book found with id 9999."
}
```