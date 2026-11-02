# TicketHub: System Design

TicketHub is a website that sells tickets for concerts and events. Most days it is quiet, but when a very popular concert goes on sale, huge numbers of people arrive at the same moment and compete for a limited number of seats. The design must work well on a normal day **and** survive that "big sale", without ever selling the same seat twice.

This document follows the six-part framework: requirements (section 1), estimates (2), API (3), data model (4), architecture (6) and trade-offs (7). Section 5 explains in detail how double-booking is prevented.

## Starting facts

- 2 million registered users
- Normal day: 50,000 visitors, each viewing 10 pages; 5,000 tickets sold
- Big sale: 200,000 people try to buy 20,000 seats within the first 10 minutes

---

## 1. Requirements

### Functional requirements
- Users can register and log in.
- Users can browse and search events (by name, city, date).
- Users can view an event and a map of its seats with prices and availability.
- Users can **hold** one or more seats for a short time (for example 5 minutes) while they pay.
- Users can pay for held seats and receive tickets.
- Users can see their orders and tickets, and cancel a hold.
- Held seats that are not paid for are released automatically.
- Admins can create events and their seats.

### Non-functional requirements
- **Speed:** browsing pages load in under 300 ms (95th percentile); holding seats responds in under 500 ms, even during a big sale.
- **Correctness:** a seat must **never be sold to two people**, and a user must never be charged without receiving a ticket (or vice versa). Payments must not be charged twice if a request is repeated.
- **Fairness:** people are served in the order they arrived (first come, first served), one person can't take a huge share of the seats, and bots must not beat real fans. Users must be told clearly what is happening, because with 10 people per seat, most will not get a ticket.
- **Availability:** the site stays up during a big sale (target 99.9%). It is acceptable for the sale to be slower or for users to wait in a queue, but it must not crash.
- **Scalability:** handle about 500 times the normal peak load for a short time, then scale back down to save cost.
- **Durability:** completed orders and tickets are never lost (replication and backups).
- **Security:** HTTPS, hashed passwords, token authentication, no card data stored (we use an external payment provider).
- **Observability:** logs, metrics and alerts, especially during sales.

---

## 2. Estimates

### Assumptions
- 1 day = 86,400 seconds; normal peak = 5x the average
- On average, a purchase is 2 tickets per order, so 5,000 tickets means about 2,500 orders a day
- During the big sale each of the 200,000 people sends about **10 requests**: 1 event page, 5 seat-map views, 3 seat-hold attempts and 1 login/token check
- During the big sale about **half of the people arrive in the first minute** (sales opening is the exciting moment), so the first minute is the peak
- A seat holds for 5 minutes; the sale window is 10 minutes (600 seconds)

### Normal day
- Page views: 50,000 x 10 = 500,000 per day, so 500,000 / 86,400 = **about 6 page views/s** on average and **about 29/s** at peak (5x)
- Tickets sold: 5,000 per day, which is **about 0.06 tickets/s** (one every 17 seconds) and **0.3/s** at peak
- Orders: about 2,500 per day, which is **0.03 orders/s**
- Storage: about 1.8 million tickets and 0.9 million orders per year, at about 300 bytes each, is **under 1 GB per year**; seats for new events (say 5,000 seats per event, 100 events a month, 150 bytes each) add about 1 GB per year. Storage is tiny.

### Big sale (200,000 people, 20,000 seats, first 10 minutes)
- Total requests: 200,000 x 10 = 2,000,000 in 10 minutes, so **about 3,300 requests/s** on average
- First minute (half the people): 1,000,000 / 60 = **about 16,700 requests/s at the peak**
- Seat-hold attempts: 200,000 x 3 = 600,000, so **about 1,000/s on average and about 5,000/s in the first minute**, all fighting over the same 20,000 rows
- Purchases: at most 20,000 seats, about 10,000 orders, in around 10 minutes is **about 17 orders/s**
- Demand vs supply: 200,000 people for 20,000 seats is **10 people per seat**, so about 90% of people will not get a ticket

### Comparison

| Metric | Normal day (peak) | Big sale (peak) | Difference |
|---|---|---|---|
| Requests per second | about 29 | about 16,700 | about **580x** more |
| Orders per second | about 0.15 | about 17 | about **115x** more (about 580x the normal average of 0.03) |
| Seats being fought over | thousands, rarely at the same time | 20,000 at once, 10 people per seat | heavy contention |
| Duration | all day | minutes | very short, very sharp spike |

**Conclusion:** the normal load is small and a couple of servers could handle it. The big sale is a **spike** about 600 times larger that lasts only minutes, and its difficulty is not just volume: thousands of people fight for the **same rows** at the same time, so **correctness under contention** is the hardest problem. We can't just buy servers for the peak all year, so the design needs a **waiting room** to flatten the spike and the ability to **scale up for the sale** and down afterwards.

---

## 3. API

Base URL: `https://api.tickethub.example/api/v1`. JSON everywhere. All endpoints except browsing and register/login need `Authorization: Bearer <token>`.

| # | Method | Path | Description | Success status |
|---|--------|------|-------------|----------------|
| 1 | GET | `/events` | Browse events (filters: `city`, `date`, `q`, `page`, `limit`) | 200 OK |
| 2 | GET | `/events/{eventId}` | Event details (name, venue, date, price range, on-sale time) | 200 OK |
| 3 | GET | `/events/{eventId}/seats` | View seats and their availability (filter by `section`) | 200 OK |
| 4 | POST | `/events/{eventId}/queue` | Join the waiting room for a popular sale | 202 Accepted |
| 5 | GET | `/events/{eventId}/queue/me` | Check my place in the waiting room and get my access pass when it is my turn | 200 OK |
| 6 | POST | `/events/{eventId}/holds` | **Hold** seats for 5 minutes (creates a pending order) | 201 Created |
| 7 | DELETE | `/orders/{orderId}` | Cancel a pending order and release its seats | 204 No Content |
| 8 | POST | `/orders/{orderId}/payments` | **Pay** for the held seats; issues tickets | 200 OK |
| 9 | GET | `/orders/{orderId}` | View one order and its status | 200 OK |
| 10 | GET | `/me/tickets` | View **my tickets** | 200 OK |
| 11 | POST | `/auth/login` | Log in and receive a token | 200 OK |

A **hold is a pending order**: holding seats creates an order with status `pending` and a 5-minute expiry; paying turns it into `paid`.

### Examples

**View seats: `GET /events/7/seats?section=A`**

```json
{
  "event_id": 7,
  "data": [
    { "id": 1001, "section": "A", "row": "1", "number": 1, "price_cents": 15000, "status": "available" },
    { "id": 1002, "section": "A", "row": "1", "number": 2, "price_cents": 15000, "status": "held" },
    { "id": 1003, "section": "A", "row": "1", "number": 3, "price_cents": 15000, "status": "sold" }
  ],
  "as_of": "2026-11-09T18:00:02Z"
}
```

The seat map may be a few seconds old, so the real check happens when holding (see section 5).

**Hold seats: `POST /events/7/holds`** (header `X-Queue-Pass: <access pass>` during a big sale)

```json
{
  "seat_ids": [1001, 1004]
}
```

Response: `201 Created`

```json
{
  "order_id": 501,
  "event_id": 7,
  "status": "pending",
  "seat_ids": [1001, 1004],
  "total_cents": 30000,
  "expires_at": "2026-11-09T18:05:00Z"
}
```

**Pay: `POST /orders/501/payments`** (header `Idempotency-Key: 3f2c9d9e-...` so a repeated request never charges twice)

```json
{
  "payment_token": "tok_abc123"
}
```

Response: `200 OK`

```json
{
  "order_id": 501,
  "status": "paid",
  "tickets": [
    { "ticket_code": "TH-7F3A-91B2", "seat_id": 1001 },
    { "ticket_code": "TH-7F3A-91B3", "seat_id": 1004 }
  ]
}
```

**Seat already taken: `POST /events/7/holds`** returns `409 Conflict`

```json
{
  "error": {
    "code": "SEAT_UNAVAILABLE",
    "message": "Seat 1001 has just been taken. Please choose another seat.",
    "unavailable_seat_ids": [1001]
  }
}
```

### Error codes

| Status | When |
|--------|------|
| 400 Bad Request | Invalid input (e.g. no seats, more than 4 seats) |
| 401 Unauthorized | Missing or expired token |
| 402 Payment Required | The payment was declined |
| 403 Forbidden | Not your order, or no valid waiting-room pass |
| 404 Not Found | Unknown event, seat or order |
| 409 Conflict | A seat is no longer available |
| 410 Gone | The hold expired before payment |
| 429 Too Many Requests | Rate limit exceeded (bot protection) |
| 500 Internal Server Error | Unexpected server problem |

---

## 4. Data model

Tables: `users`, `events`, `orders`, `seats`, `tickets` (written for PostgreSQL).

```sql
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE events (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       VARCHAR(200) NOT NULL,
    venue      VARCHAR(200) NOT NULL,
    city       VARCHAR(100) NOT NULL,
    starts_at  TIMESTAMPTZ  NOT NULL,
    on_sale_at TIMESTAMPTZ  NOT NULL,
    status     VARCHAR(20)  NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'on_sale', 'sold_out', 'cancelled')),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT      NOT NULL REFERENCES users(id),
    event_id        BIGINT      NOT NULL REFERENCES events(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paying', 'paid', 'expired', 'cancelled')),
    total_cents     INTEGER     NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
    idempotency_key VARCHAR(64) UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at         TIMESTAMPTZ
);

CREATE TABLE seats (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id        BIGINT      NOT NULL REFERENCES events(id),
    section         VARCHAR(20) NOT NULL,
    row_label       VARCHAR(10) NOT NULL,
    seat_number     INTEGER     NOT NULL,
    price_cents     INTEGER     NOT NULL CHECK (price_cents >= 0),
    status          VARCHAR(10) NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available', 'held', 'sold')),
    order_id        BIGINT REFERENCES orders(id),
    hold_expires_at TIMESTAMPTZ,
    UNIQUE (event_id, section, row_label, seat_number),
    CHECK (
        (status = 'available' AND order_id IS NULL     AND hold_expires_at IS NULL) OR
        (status = 'held'      AND order_id IS NOT NULL AND hold_expires_at IS NOT NULL) OR
        (status = 'sold'      AND order_id IS NOT NULL)
    )
);

CREATE TABLE tickets (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    BIGINT      NOT NULL REFERENCES orders(id),
    seat_id     BIGINT      NOT NULL UNIQUE REFERENCES seats(id),
    ticket_code VARCHAR(40) NOT NULL UNIQUE,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Relationships
- **users to orders: one-to-many.** A user makes many orders; each order belongs to one user.
- **events to seats: one-to-many.** An event has thousands of seats; each seat belongs to one event.
- **events to orders: one-to-many.** An event has many orders; each order is for one event.
- **orders to seats: one-to-many.** An order holds or buys one or more seats (`seats.order_id` points to the order currently holding or owning the seat; it is empty while the seat is available).
- **orders to tickets: one-to-many**, and **seats to tickets: one-to-one.** A paid order produces one ticket per seat, and a seat can have **at most one ticket ever** (`tickets.seat_id` is `UNIQUE`).
- **users to events (through orders and tickets): many-to-many.** Many users attend many events; `orders` (together with `tickets`) is the join table that records who is going to what, and it also stores extra data such as price and payment status.

### Indexes

```sql
CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_seats_hold_expiry  ON seats (hold_expires_at) WHERE status = 'held';
CREATE INDEX idx_orders_user        ON orders (user_id, created_at DESC);
CREATE INDEX idx_tickets_order      ON tickets (order_id);
```

- `seats (event_id, status)` makes the seat map and "which seats are available" fast.
- The partial index `seats (hold_expires_at) WHERE status = 'held'` lets the clean-up job find expired holds without scanning every seat.
- `orders (user_id, created_at DESC)` serves "my orders" and `GET /me/tickets`.

---

## 5. How double-booking is prevented

This is the most important part of the design. Two people clicking the same seat at the same moment must never both succeed. We use **several layers**, so that a mistake in one layer can't cause a double sale.

### Layer 1: an atomic conditional update (the main protection)
A seat is claimed by a **single SQL statement** that checks the seat is free **and** claims it in one step, inside a transaction:

```sql
BEGIN;

INSERT INTO orders (user_id, event_id, status, expires_at)
VALUES (42, 7, 'pending', now() + interval '5 minutes')
RETURNING id;   -- suppose this returns 501

UPDATE seats
SET    status = 'held',
       order_id = 501,
       hold_expires_at = now() + interval '5 minutes'
WHERE  event_id = 7
  AND  id IN (1001, 1004)
  AND  (status = 'available'
        OR (status = 'held' AND hold_expires_at < now()));

-- The application checks how many rows were updated.
-- If it is not 2 (the number of seats requested), ROLLBACK and return 409.
-- If it is 2:

UPDATE orders
SET    total_cents = (SELECT SUM(price_cents) FROM seats WHERE order_id = 501)
WHERE  id = 501;

COMMIT;
```

Why this is safe: when two transactions try to update the same seat row, the database **locks the row**. The second one waits until the first commits, then re-checks the `WHERE` condition. The seat is now `held`, so the condition is false and **zero rows are updated**, which the app turns into a `409 Conflict`. There is no gap between "check" and "claim" for another request to sneak into. A naive version (`SELECT` to check, then `UPDATE` to claim) would be wrong, because two requests could both see "available" before either updates it (a race condition).

- **All or nothing:** if the user asks for 2 seats and only 1 is free, the transaction rolls back, so nobody is left with half an order.
- **No deadlocks:** the app always claims seats in ascending `id` order, so two people competing for the same seats lock them in the same order.

### Layer 2: holds expire
A hold lasts 5 minutes. If the user doesn't pay, a worker (and the `WHERE` clause above) frees the seat so someone else can buy it. Expired holds can be reclaimed by the `OR (status = 'held' AND hold_expires_at < now())` condition even before the clean-up job runs. Before paying, the order moves to `paying` and its hold is extended a little, so a seat can't be released while a payment is in progress.

### Layer 3: a database constraint as a safety net
Even if there was a bug in the application, `tickets.seat_id` is `UNIQUE`, so the database **refuses to issue a second ticket for the same seat**. The `CHECK` constraint on `seats` also stops impossible states (for example a `held` seat with no order). Constraints protect the data even from code that forgets the rules.

### Layer 4: paying is also a transaction
After the payment provider confirms the charge (we never keep database locks open while waiting for the external provider), we finish the order in one transaction:

```sql
BEGIN;

UPDATE seats
SET    status = 'sold', hold_expires_at = NULL
WHERE  order_id = 501 AND status = 'held';          -- must update every seat of the order

INSERT INTO tickets (order_id, seat_id, ticket_code)
SELECT 501, id, 'TH-' || upper(substr(md5(random()::text), 1, 8))
FROM   seats
WHERE  order_id = 501;

UPDATE orders SET status = 'paid', paid_at = now() WHERE id = 501;

COMMIT;
```

Either the seats become `sold`, the tickets are created and the order is `paid`, **or nothing changes**. If anything fails, the transaction rolls back and the payment is refunded automatically. The `Idempotency-Key` on the payment request means that if the user's browser retries, they are never charged twice.

### Why the cache can't cause double-booking
The seat map shown to users comes from a cache and may be a few seconds old, so a user may click a seat that has just been taken. That is fine: **the cache is only for display. The primary database is the only place that decides who gets a seat**, through the atomic update above. The worst case is a friendly "someone just took that seat" message.

---

## 6. Architecture

```
                 +----------------------------+
                 |  Client (browser / app)    |
                 +------+--------------+------+
                        |              |
         (1) name lookup|              | (2) HTTPS
                        v              |
                  +-----------+        |
                  |    DNS    |        |
                  +-----------+        |
                                       v
                          +---------------------------+
                          |  CDN + rate limiting/WAF  |  static files, event pages,
                          |  (bot protection)         |  public "now serving" number
                          +-------------+-------------+
                                        |
                                        v
                               +-----------------+
                               |  Load Balancer  |
                               +----+-------+----+
                                    |       |
                  +-----------------+       +------------------+
                  v                                            v
        +--------------------+                      +----------------------+
        |  Waiting Room      |   access pass        |  App Servers         |
        |  service           |--------------------->|  Browse pool (many)  |
        |  (queue in Redis)  |                      |  Booking pool (N)    |
        +---------+----------+                      +---+------+------+----+
                  |                                     |      |      |
                  v                                     v      |      v
          +---------------+                    +----------+    |  +----------+
          |  Redis        |<------------------>|  Cache   |    |  |  Queue   |
          | (queue state) |                    | (Redis)  |    |  +----+-----+
          +---------------+                    +----------+    |       |
                                                               v       v
                                                  +------------------+ +-----------+
                                                  |  Primary DB      | |  Workers  |
                                                  |  (all writes,    | | (2 or     |
                                                  |  seat holds)     | |  more)    |
                                                  +--------+---------+ +-----+-----+
                                                           | replication     |
                                                           v                 v
                                                  +------------------+  +-----------+
                                                  |  Read replicas   |  | Payment   |
                                                  |  (browsing)      |  | provider  |
                                                  +------------------+  | (external)|
                                                                        +-----------+
```

How to read it: browsing and the waiting room are the front door; only people with an access pass reach the booking pool. The booking pool talks to the payment provider to charge cards, and workers handle the follow-up: confirming payments, issuing refunds and sending tickets.

### Components (one explanation each)
- **Client:** shows events and seats and sends requests; it also polls the waiting room politely, so our servers aren't flooded.
- **DNS:** turns `tickethub.example` into the address of the CDN and load balancer, so users find the site and we can move servers without changing the name.
- **CDN with rate limiting / WAF:** serves static files and public event pages from servers near the user, so most of the huge traffic never reaches us, and blocks bots and abusive clients with per-IP and per-user limits.
- **Load balancer:** spreads requests across healthy app servers and removes failed ones, so no single server is overloaded and traffic can be sent to the right pool.
- **Waiting room service (virtual queue in Redis):** the key to surviving the big sale. Users get a queue number and wait on a lightweight page; the system lets people into the booking pages at a steady rate the database can handle, which flattens the spike.
- **App servers (browse pool and booking pool):** run the API logic. They are stateless, so we can add many more before a big sale and remove them after. The browse pool serves read traffic; a separate booking pool handles holds and payments, so a flood of browsing can never block purchases.
- **Cache (Redis):** keeps event details and seat-map snapshots (refreshed every second or two) in memory, so thousands of "view seats" requests don't hit the database.
- **Primary database (PostgreSQL):** the single source of truth where seat holds and orders are written atomically, so the seat rules and constraints are enforced in one place.
- **Read replicas:** copies of the database used for browsing and "my tickets", so reads don't compete with the critical seat updates on the primary.
- **Queue:** holds background jobs (send ticket emails, create PDFs, expire old holds), so the user gets an instant response and spikes are absorbed.
- **Workers:** process the queue in the background, release expired holds and retry failed jobs, so slow work never delays a purchase.
- **Payment provider (external):** takes the card payment so we never store card data and don't build payments ourselves.

### How the design survives the big sale
1. **Before the sale:** the event page and static files are on the CDN, and we **scale up** the app servers (in the booking and browse pools), cache and read replicas ahead of the known on-sale time.
2. **At the start:** the 200,000 people (about 16,700 requests/s at the peak) hit the **CDN and waiting room**, not the database. Each person gets a queue number. The "now serving up to number N" value is a tiny public file cached on the CDN for a couple of seconds, so the browsers check it there instead of calling our servers.
3. **Admission control:** the waiting room admits people to the booking pages at a fixed rate, for example 100 people per second (up to about 5,000 people shopping at once). This keeps seat-hold attempts to a few hundred per second instead of about 5,000, which one primary database can handle.
4. **Seat map from the cache:** thousands of people viewing seats are served from a cache refreshed every second or two, not from the database.
5. **Booking:** each hold is a small atomic transaction on the primary (section 5). Contention is limited because the waiting room limits how many people compete at once.
6. **Payments and tickets:** about 17 orders per second go to the payment provider; ticket emails and PDFs are done by workers in the background.
7. **When sold out:** the event is marked `sold_out`, the waiting room tells everyone still in line immediately, and they are released instead of waiting for nothing.
8. **After the sale:** the extra servers are shut down.

### Fairness
Queue numbers are given in the order people arrive, but everyone who joins in the first few minutes before the sale starts gets a **random order**, so a faster connection doesn't win. We also limit each account to 4 seats, require login, add CAPTCHA checks to the queue and rate-limit by IP to make it harder for bots.

### Avoiding single points of failure
- DNS: a managed service with several name servers.
- CDN: many servers worldwide.
- Load balancer: a redundant pair or managed service.
- App servers: many, across several availability zones; stateless, so any can be replaced.
- Redis (cache and queue state): replicas with automatic failover. If the cache fails, the app falls back to the database (slower but correct). If the waiting-room state is lost, users re-join the queue.
- Database: a primary with replicas; a replica can be promoted automatically, with backups and point-in-time recovery.
- Queue and workers: a replicated queue and several workers; unfinished jobs are retried.
- Payment: if the provider is slow or down, orders stay `paying` and holds are extended, then retried or refunded.

---

## 7. Trade-offs

1. **Waiting room: protection vs user experience.** The waiting room protects the database and gives fairness, but people must wait, some will never get in before the sale sells out, and it adds a whole extra system to build. Without it, the site would crash and the most aggressive bots would win, so we accept the wait.
2. **Seat holds with a timer: fairness vs seats sitting unused.** A 5-minute hold means a seat can't be double-sold while someone pays, but a person who never pays blocks a seat for 5 minutes, and during a sell-out other fans see it as "gone". A shorter timer frees seats faster but rushes buyers and increases failed payments, so we choose 5 minutes (and may shorten it during big sales).
3. **Strong consistency in one primary database vs raw scalability.** All seat updates go through one primary PostgreSQL database, which guarantees correctness and is simple to reason about, but writes can't be spread across many servers. A NoSQL database could scale writes more easily, but would make atomic multi-seat holds and constraints much harder. For 20,000 seats and about 17 orders per second, one primary is enough; if TicketHub grew to many simultaneous big sales, we could partition (shard) the data by `event_id`.
4. **Cached seat map: speed vs freshness.** A cached seat map keeps the database safe, but users will sometimes click a seat that was just taken and see a 409 error. We accept that, because the database check is always the final authority.
5. **Atomic update (optimistic) vs locking each row first (pessimistic).** The single conditional `UPDATE` is simple and fast and doesn't hold locks while the user thinks, but when many people compete for the same seat, most attempts fail and must retry. Locking first (`SELECT ... FOR UPDATE`) would queue them instead, but holds locks longer and risks deadlocks and slowdowns, so we only use it in the short final payment step.