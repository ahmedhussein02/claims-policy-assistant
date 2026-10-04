/* =====================================================================
   seed.sql  -  Deterministic seed data (re-runnable)
   Generates: 200 users, 1-5 claims per user (~600 claims).
   Run AFTER schema.sql. WARNING: wipes Claims, AiInteractions and Users
   (including any entra_object_id links - re-run the linking UPDATE at
   the bottom after re-seeding).

   Dates are relative to today so "recently submitted" stays recent.
   "Randomness" is a deterministic hash, so every run gives the same shape.

   Demo users 1 and 2 are guaranteed exactly one claim in each status
   (CLM-001..CLM-005 for user 1, CLM-006..CLM-010 for user 2) so that the
   authorization test (user A requests user B's claim) is easy to run.
   ===================================================================== */

SET NOCOUNT ON;
BEGIN TRANSACTION;

DELETE FROM dbo.AiInteractions;
DELETE FROM dbo.Claims;
DELETE FROM dbo.Users;

/* ---------- Users: 200 ---------- */
DECLARE @first TABLE (i INT PRIMARY KEY, name NVARCHAR(30));
INSERT INTO @first (i, name) VALUES
 (0,N'Olivia'),(1,N'Liam'),(2,N'Emma'),(3,N'Noah'),(4,N'Ava'),(5,N'Ethan'),(6,N'Sophia'),
 (7,N'Mason'),(8,N'Isabella'),(9,N'Lucas'),(10,N'Mia'),(11,N'Amir'),(12,N'Layla'),
 (13,N'Omar'),(14,N'Nora'),(15,N'Daniel'),(16,N'Hannah'),(17,N'Carlos'),(18,N'Priya'),(19,N'Kenji');

DECLARE @last TABLE (i INT PRIMARY KEY, name NVARCHAR(30));
INSERT INTO @last (i, name) VALUES
 (0,N'Anderson'),(1,N'Brooks'),(2,N'Carter'),(3,N'Dawson'),(4,N'Ellis'),(5,N'Foster'),(6,N'Grant'),
 (7,N'Hughes'),(8,N'Ibrahim'),(9,N'Jensen'),(10,N'Khan'),(11,N'Lopez'),(12,N'Morgan'),
 (13,N'Nguyen'),(14,N'Owens'),(15,N'Patel'),(16,N'Quinn'),(17,N'Rivera'),(18,N'Sato'),(19,N'Turner');

;WITH n AS (
    SELECT TOP (200) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
)
SELECT n.n AS user_id,
       f.name + N' ' + l.name AS full_name,
       LOWER(f.name) + N'.' + LOWER(l.name) + RIGHT('000' + CAST(n.n AS VARCHAR(3)), 3) + N'@example.com' AS email
INTO #NewUsers
FROM n
JOIN @first f ON f.i = (n.n - 1) % 20
JOIN @last  l ON l.i = ((n.n - 1) / 20 + (n.n - 1) * 3) % 20;

SET IDENTITY_INSERT dbo.Users ON;
INSERT INTO dbo.Users (user_id, full_name, email, created_at)
SELECT user_id, full_name, email,
       DATEADD(DAY, -(400 - user_id), CAST(SYSUTCDATETIME() AS DATETIME2(0)))
FROM #NewUsers;
SET IDENTITY_INSERT dbo.Users OFF;

/* ---------- Claims: 1-5 per user (users 1 and 2 always 5) ---------- */
;WITH seq AS (SELECT v.s FROM (VALUES (1),(2),(3),(4),(5)) v(s)),
per_user AS (
    SELECT u.user_id,
           CASE WHEN u.user_id IN (1, 2) THEN 5
                ELSE 1 + (ABS(CHECKSUM(CONCAT('cnt', u.user_id))) % 5) END AS claim_count
    FROM dbo.Users u
),
base AS (
    SELECT p.user_id, s.s AS seq_no,
           ROW_NUMBER() OVER (ORDER BY p.user_id, s.s) AS rn
    FROM per_user p
    JOIN seq s ON s.s <= p.claim_count
),
typed AS (
    SELECT b.*,
           ABS(CHECKSUM(CONCAT('st',  b.rn))) % 100 AS r_status,
           ABS(CHECKSUM(CONCAT('ty',  b.rn))) % 5   AS r_type,
           ABS(CHECKSUM(CONCAT('dt',  b.rn))) % 1000 AS r_date,
           ABS(CHECKSUM(CONCAT('doc', b.rn))) % 2   AS r_doc,
           ABS(CHECKSUM(CONCAT('upd', b.rn))) % 10  AS r_upd
    FROM base b
),
resolved AS (
    SELECT t.*,
        CASE WHEN t.user_id IN (1, 2) THEN
                CASE t.seq_no WHEN 1 THEN N'Submitted' WHEN 2 THEN N'In Review' WHEN 3 THEN N'Action Required'
                              WHEN 4 THEN N'Approved'  ELSE N'Rejected' END
             ELSE
                CASE WHEN t.r_status < 15 THEN N'Submitted'
                     WHEN t.r_status < 35 THEN N'In Review'
                     WHEN t.r_status < 50 THEN N'Action Required'
                     WHEN t.r_status < 80 THEN N'Approved'
                     ELSE N'Rejected' END
        END AS status,
        CASE WHEN t.user_id IN (1, 2) THEN (t.seq_no - 1) % 5 ELSE t.r_type END AS type_ix
    FROM typed t
),
shaped AS (
    SELECT r.*,
        CASE r.type_ix WHEN 0 THEN N'Auto' WHEN 1 THEN N'Home' WHEN 2 THEN N'Health'
                       WHEN 3 THEN N'Travel' ELSE N'Life' END AS claim_type,
        -- age in days, depending on status ("Submitted" = recent, others older)
        CASE r.status
             WHEN N'Submitted'       THEN 1  + r.r_date % 7
             WHEN N'In Review'       THEN 5  + r.r_date % 41
             WHEN N'Action Required' THEN 10 + r.r_date % 51
             ELSE                         30 + r.r_date % 271
        END AS age_days
    FROM resolved r
)
INSERT INTO dbo.Claims (claim_id, user_id, claim_type, status, submitted_date,
                        required_documents, next_step, created_at, updated_at)
SELECT
    CASE WHEN f.rn < 1000 THEN 'CLM-' + RIGHT('000' + CAST(f.rn AS VARCHAR(4)), 3)
         ELSE 'CLM-' + CAST(f.rn AS VARCHAR(4)) END AS claim_id,
    f.user_id,
    f.claim_type,
    f.status,
    d.submitted_date,
    CASE
        WHEN f.status IN (N'Approved', N'Rejected') THEN N'None'
        WHEN f.status = N'In Review' AND f.r_doc = 0 THEN N'None'
        WHEN f.status = N'Submitted' AND f.r_doc = 0 THEN N'None'
        ELSE CASE f.claim_type
                WHEN N'Auto'   THEN N'Police report; Repair estimate; Photos of damage'
                WHEN N'Home'   THEN N'Photos of damage; Contractor estimate; Proof of ownership'
                WHEN N'Health' THEN N'Itemized medical bill; Doctor''s report'
                WHEN N'Travel' THEN N'Travel itinerary; Receipts; Incident report'
                ELSE                N'Death certificate; Beneficiary ID'
             END
    END AS required_documents,
    CASE f.status
        WHEN N'Submitted'       THEN N'Your claim has been received and will be assigned to an adjuster within 2 business days.'
        WHEN N'In Review'       THEN N'An adjuster is reviewing your claim. No action is needed from you right now.'
        WHEN N'Action Required' THEN N'Please upload the required documents within 14 days to avoid delays.'
        WHEN N'Approved'        THEN N'Payment will be issued to your registered account within 5-7 business days.'
        ELSE                         N'Review the decision letter. You may file an appeal within 30 days.'
    END AS next_step,
    CAST(d.submitted_date AS DATETIME2(0)) AS created_at,
    CASE WHEN f.status = N'Submitted' THEN CAST(d.submitted_date AS DATETIME2(0))
         ELSE DATEADD(DAY, CASE WHEN f.r_upd + 1 > f.age_days THEN f.age_days ELSE f.r_upd + 1 END,
                      CAST(d.submitted_date AS DATETIME2(0)))
    END AS updated_at
FROM shaped f
CROSS APPLY (SELECT DATEADD(DAY, -f.age_days, CAST(SYSUTCDATETIME() AS DATE)) AS submitted_date) d;

DROP TABLE #NewUsers;
COMMIT TRANSACTION;

/* ---------- Sanity checks (results appear in the Query editor) ---------- */
SELECT (SELECT COUNT(*) FROM dbo.Users)  AS total_users,
       (SELECT COUNT(*) FROM dbo.Claims) AS total_claims,
       (SELECT MIN(c) FROM (SELECT COUNT(*) AS c FROM dbo.Claims GROUP BY user_id) x) AS min_claims_per_user,
       (SELECT MAX(c) FROM (SELECT COUNT(*) AS c FROM dbo.Claims GROUP BY user_id) x) AS max_claims_per_user,
       (SELECT COUNT(*) FROM dbo.Users u WHERE NOT EXISTS (SELECT 1 FROM dbo.Claims c WHERE c.user_id = u.user_id)) AS users_without_claims;

SELECT status, COUNT(*) AS claims FROM dbo.Claims GROUP BY status ORDER BY claims DESC;
SELECT claim_id, user_id, claim_type, status, submitted_date, required_documents
FROM dbo.Claims WHERE user_id IN (1, 2) ORDER BY claim_id;

/* ---------- Linking real Entra demo logins to seeded users (step 3) ----------
   After creating two test users in Entra External ID, copy each Object ID
   and run (uncommented, with the real GUIDs):

   UPDATE dbo.Users SET entra_object_id = '00000000-0000-0000-0000-000000000001' WHERE user_id = 1;
   UPDATE dbo.Users SET entra_object_id = '00000000-0000-0000-0000-000000000002' WHERE user_id = 2;
*/
