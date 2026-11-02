# SnapShare: Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from people they follow.

## 1. Assumptions

- 10,000,000 registered users
- 10% are active each day, so **daily active users (DAU) = 1,000,000**
- Each active user uploads 1 photo per day and views 50 feed pages per day
- Average photo: 2 MB; each photo also gets a 50 KB thumbnail
- 1 day = 86,400 seconds; 1 year = 365 days
- Peak traffic = 5x the average
- 1 feed page view = 1 request (to keep the estimate simple)
- Units: 1 TB = 1,000 GB = 1,000,000 MB (decimal)

## 2. Estimates

### Uploads per second
- Uploads per day: 1,000,000 users x 1 photo = 1,000,000
- Average: 1,000,000 / 86,400 = **about 11.6 uploads/s**
- Peak (5x): **about 58 uploads/s**

### Feed views per second
- Feed views per day: 1,000,000 users x 50 = 50,000,000
- Average: 50,000,000 / 86,400 = **about 579 views/s**
- Peak (5x): **about 2,894 views/s**

### Storage per year
- Originals per day: 1,000,000 x 2 MB = 2,000,000 MB = 2 TB
- Thumbnails per day: 1,000,000 x 50 KB = 50 GB
- Per day total: 2.05 TB
- Originals per year: 2 TB x 365 = **730 TB**
- Thumbnails per year: 50 GB x 365 = **18.25 TB**
- **Total photo storage per year: about 748 TB (roughly 0.75 PB)**

| Metric | Average | Peak (5x) |
|---|---|---|
| Uploads per second | 11.6 | 58 |
| Feed views per second | 579 | 2,894 |
| Photo storage per year | about 748 TB | n/a |

## 3. Read-heavy or write-heavy?

**SnapShare is read-heavy.** There are 50 feed views for every 1 upload (50,000,000 reads vs 1,000,000 writes per day), a ratio of about **50 : 1**. The cost per request is also different: an upload is only about 12 per second, while the feed needs about 579 per second on average and nearly 2,900 at peak.

What this means for the design:
- Make reads cheap and fast: cache feeds and hot data, and serve photos from a CDN so most reads never reach our servers.
- Use a database read replica so reads are spread away from the primary database, which handles the writes.
- The write path (uploads) is small enough to handle with a few servers, but it must be reliable, and slow work (thumbnails) should be moved off the request into a queue.

## 4. Why photos do not go in the database

At about 748 TB per year, photos would make the database enormous. Large binary files (BLOBs) in a database make backups, replication and queries slow and expensive, and they use up the database's memory and disk bandwidth that we want for fast lookups. Databases are also much more expensive per GB than file storage, and they don't serve files to users efficiently.

Instead, photos go in **object storage** (such as Amazon S3). It is cheap, practically unlimited, durable, and made for large files. The database only stores the photo's **metadata** (id, owner, caption, time, and the URL or key of the file in object storage). The CDN then serves the files from object storage.

## 5. Architecture diagram

```
                      +------------------------------+
                      |   Users (mobile app / web)   |
                      +---------------+--------------+
                                      |
              photos & thumbnails     |      API requests
              (images, static)        |      (feed, upload, follow)
                  +-------------------+-------------------+
                  |                                       |
                  v                                       v
           +-------------+                       +-----------------+
           |     CDN     |                       |  Load Balancer  |
           +------+------+                       +--------+--------+
                  |                                       |
        (cache miss: fetch from origin)         +---------+---------+
                  |                             |                   |
                  |                             v                   v
                  |                      +-------------+     +-------------+
                  |                      | App Server 1| ... | App Server N|
                  |                      +------+------+     +------+------+
                  |                             |                   |
                  |        +--------------------+-------------------+
                  |        |                    |                   |
                  |        v                    v                   v
                  |  +-----------+       +--------------+     +-------------+
                  |  |   Cache   |       |   Database   |     |    Queue    |
                  |  |  (Redis)  |       |   (primary)  |     |  (thumbnail |
                  |  +-----------+       +------+-------+     |    jobs)    |
                  |                             |             +------+------+
                  |                  replication|                    |
                  |                             v                    v
                  |                      +--------------+     +-------------+
                  |                      |  Read Replica|     |   Worker    |
                  |                      +--------------+     | (thumbnails)|
                  |                                           +------+------+
                  |                                                  |
                  |      +-------------------------------------------+
                  |      |  read original / write thumbnail
                  v      v
           +-----------------------------+
           |       Object Storage        |
           | (originals + thumbnails)    |
           +-----------------------------+
```

Reads of the feed go: App server -> Cache -> (on miss) Read replica. Writes of metadata go to the primary database. Photo files are uploaded to object storage and served to users through the CDN.

## 6. Components (one sentence each)

- **CDN:** Serves photos and thumbnails from servers close to the user, so images load fast and most of the heavy read traffic never reaches our servers or storage.
- **Load balancer:** Spreads incoming requests across many app servers so no single server is overloaded and one server failing doesn't take the app down.
- **App servers:** Run the application logic (login, feed, upload, follow) and are stateless, so we can add more of them to handle more traffic.
- **Cache:** Keeps frequently used data such as feeds and popular photo metadata in memory, which makes reads very fast and takes load off the database.
- **Database (primary + read replica):** Stores users, follows and photo metadata durably; the primary handles writes while the read replica handles read queries and scales the read-heavy workload.
- **Object storage:** Stores the large photo and thumbnail files cheaply and durably, so they stay out of the database.
- **Queue:** Holds thumbnail jobs so the upload request can finish immediately and traffic spikes are smoothed out instead of overloading workers.
- **Worker:** Picks jobs from the queue and creates the 50 KB thumbnails in the background, so the user doesn't wait for image processing.

## 7. Upload flow, step by step

1. The user picks a photo in the app and taps upload; the app sends the request to SnapShare.
2. The request reaches the **load balancer**, which forwards it to a healthy **app server**.
3. The app server checks the user is logged in and validates the file (type and size).
4. The app server stores the original photo (about 2 MB) in **object storage** and gets back its key/URL.
5. The app server writes the photo's metadata (owner, caption, time, storage key, `thumbnail_status = pending`) to the **primary database**.
6. The app server puts a "create thumbnail" job (with the photo id and storage key) on the **queue**.
7. The app server replies to the user with "upload successful", without waiting for the thumbnail.
8. A **worker** takes the job from the queue, downloads the original from object storage, and creates a 50 KB thumbnail.
9. The worker saves the thumbnail to object storage and updates the database row (`thumbnail_status = done`, thumbnail key). If the job fails, it is retried.
10. The relevant **cache** entries (for example followers' feeds) are invalidated or updated, and the photo and thumbnail then appear in followers' feeds, served through the **CDN**.

## 8. Trade-offs

1. **Caching: speed vs freshness.** A cache makes the feed much faster and protects the database, but cached feeds can be a little out of date, so a new photo might take a few seconds to appear for followers. Cache invalidation also adds complexity. For a photo feed, slightly stale data is acceptable, so we accept this.
2. **Read replica: scalability vs consistency.** Replicas spread out the read load, but replication has a small delay (replication lag). A user could upload a photo and not see it right away if their next read hits a replica that hasn't caught up. We can reduce this by reading the user's own recent data from the primary.
3. **Queue and worker: fast uploads vs a delay for thumbnails.** Doing thumbnail work in the background keeps uploads fast and reliable, but thumbnails are not available instantly, so the feed may briefly need to show a placeholder. It also adds more parts (queue, workers, retries) to run and monitor.
4. **CDN and object storage: cost vs performance.** A CDN gives fast image loading worldwide and reduces load on our systems, but it costs money and cached copies can be hard to remove quickly if a photo is deleted. Storing about 748 TB per year is also a real cost, so we could later move old photos to cheaper storage tiers or compress images.