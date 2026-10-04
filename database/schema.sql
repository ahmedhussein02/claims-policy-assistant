/* =====================================================================
   schema.sql  -  Azure SQL schema for the Insurance Claims Portal
   Run in the Azure portal Query editor (no GO separators used).
   Safe to re-run: drops and recreates the tables (DATA IS LOST).
   ===================================================================== */

IF OBJECT_ID('dbo.AiInteractions', 'U') IS NOT NULL DROP TABLE dbo.AiInteractions;
IF OBJECT_ID('dbo.Claims', 'U')         IS NOT NULL DROP TABLE dbo.Claims;
IF OBJECT_ID('dbo.Users', 'U')          IS NOT NULL DROP TABLE dbo.Users;

/* ---------------------------------------------------------------------
   Users
   user_id          : internal application id (what Claims reference)
   entra_object_id  : the 'oid' claim from the validated Entra token.
                      The backend maps token oid -> user_id; the client
                      never supplies a user_id. Seeded users have NULL
                      here until linked to a real demo login (see seed.sql).
   --------------------------------------------------------------------- */
CREATE TABLE dbo.Users (
    user_id          INT IDENTITY(1,1) NOT NULL,
    full_name        NVARCHAR(120)     NOT NULL,
    email            NVARCHAR(254)     NOT NULL,
    entra_object_id  UNIQUEIDENTIFIER  NULL,
    created_at       DATETIME2(0)      NOT NULL CONSTRAINT DF_Users_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Users PRIMARY KEY CLUSTERED (user_id),
    CONSTRAINT UQ_Users_email UNIQUE (email),
    CONSTRAINT CK_Users_email_format CHECK (email LIKE '%_@_%._%')
);

-- One Entra identity maps to at most one user (NULLs allowed many times).
CREATE UNIQUE NONCLUSTERED INDEX UX_Users_entra_object_id
    ON dbo.Users (entra_object_id)
    WHERE entra_object_id IS NOT NULL;

/* ---------------------------------------------------------------------
   Claims
   --------------------------------------------------------------------- */
CREATE TABLE dbo.Claims (
    claim_id            NVARCHAR(20)   NOT NULL,   -- e.g. CLM-001
    user_id             INT            NOT NULL,
    claim_type          NVARCHAR(20)   NOT NULL,
    status              NVARCHAR(20)   NOT NULL,
    submitted_date      DATE           NOT NULL,
    required_documents  NVARCHAR(500)  NOT NULL CONSTRAINT DF_Claims_required_documents DEFAULT N'None',
    next_step           NVARCHAR(500)  NOT NULL,
    created_at          DATETIME2(0)   NOT NULL CONSTRAINT DF_Claims_created_at DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2(0)   NOT NULL CONSTRAINT DF_Claims_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Claims PRIMARY KEY CLUSTERED (claim_id),
    CONSTRAINT FK_Claims_Users FOREIGN KEY (user_id) REFERENCES dbo.Users (user_id),
    CONSTRAINT CK_Claims_claim_id_format CHECK (claim_id LIKE 'CLM-[0-9][0-9][0-9]%'),
    CONSTRAINT CK_Claims_claim_type CHECK (claim_type IN (N'Auto', N'Home', N'Health', N'Travel', N'Life')),
    CONSTRAINT CK_Claims_status CHECK (status IN (N'Submitted', N'In Review', N'Action Required', N'Approved', N'Rejected')),
    CONSTRAINT CK_Claims_updated_after_created CHECK (updated_at >= created_at)
);

-- Covers: list my claims, newest first, stable ordering (submitted_date DESC, claim_id DESC)
CREATE NONCLUSTERED INDEX IX_Claims_user_id_submitted_date
    ON dbo.Claims (user_id, submitted_date DESC, claim_id DESC)
    INCLUDE (status, claim_type);

-- Covers: list my claims filtered by status
CREATE NONCLUSTERED INDEX IX_Claims_user_id_status
    ON dbo.Claims (user_id, status, submitted_date DESC, claim_id DESC);

-- Spec-listed single-column access paths (reporting / admin style queries)
CREATE NONCLUSTERED INDEX IX_Claims_status         ON dbo.Claims (status);
CREATE NONCLUSTERED INDEX IX_Claims_submitted_date ON dbo.Claims (submitted_date);

/* ---------------------------------------------------------------------
   AiInteractions  -  SQL-backed AI observability
   Stores source identifiers (not whole documents), never tokens/secrets.
   user_id is nullable so a logging row can still be written for
   pre-auth failures; logging errors must never fail the chat request.
   --------------------------------------------------------------------- */
CREATE TABLE dbo.AiInteractions (
    interaction_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_AiInteractions_id DEFAULT NEWID(),
    conversation_id        NVARCHAR(64)     NOT NULL,
    user_id                INT              NULL,
    query                  NVARCHAR(2000)   NOT NULL,
    intent                 NVARCHAR(20)     NULL,
    retrieval_results      NVARCHAR(MAX)    NULL,   -- JSON: [{source, chunk_id, score}, ...]
    model                  NVARCHAR(100)    NULL,
    prompt_tokens          INT              NULL,
    completion_tokens      INT              NULL,
    latency_ms             INT              NULL,
    retrieval_latency_ms   INT              NULL,
    generation_latency_ms  INT              NULL,
    response               NVARCHAR(MAX)    NULL,
    status                 NVARCHAR(20)     NOT NULL CONSTRAINT DF_AiInteractions_status DEFAULT N'success',
    error_type             NVARCHAR(100)    NULL,
    created_at             DATETIME2(3)     NOT NULL CONSTRAINT DF_AiInteractions_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_AiInteractions PRIMARY KEY NONCLUSTERED (interaction_id),
    CONSTRAINT FK_AiInteractions_Users FOREIGN KEY (user_id) REFERENCES dbo.Users (user_id),
    CONSTRAINT CK_AiInteractions_intent CHECK (intent IS NULL OR intent IN (N'POLICY_QUERY', N'CLAIM_QUERY', N'UNSUPPORTED')),
    CONSTRAINT CK_AiInteractions_status CHECK (status IN (N'success', N'fallback', N'error')),
    CONSTRAINT CK_AiInteractions_retrieval_json CHECK (retrieval_results IS NULL OR ISJSON(retrieval_results) = 1)
);

-- Time-ordered clustered index suits an append-heavy log table.
CREATE CLUSTERED INDEX CIX_AiInteractions_created_at ON dbo.AiInteractions (created_at DESC);
CREATE NONCLUSTERED INDEX IX_AiInteractions_conversation_id ON dbo.AiInteractions (conversation_id, created_at);
CREATE NONCLUSTERED INDEX IX_AiInteractions_user_id         ON dbo.AiInteractions (user_id, created_at DESC);
CREATE NONCLUSTERED INDEX IX_AiInteractions_intent_status   ON dbo.AiInteractions (intent, status);
