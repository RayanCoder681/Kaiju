-- Kaiju — schéma initial (migration 001).
-- Convention : identifiants TEXT, horodatages INTEGER (ms epoch), booléens 0/1.
-- JSON stocké en TEXT (paramètres, snapshots) validé côté application par Zod.

-- ───────────── Organisateur (compte admin local unique pour le MVP) ─────────────
CREATE TABLE organizer (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- bcrypt, jamais en clair
  display_name  TEXT,
  created_at    INTEGER NOT NULL
);

-- Sessions d'authentification organisateur (jetons signés persistés).
CREATE TABLE auth_session (
  token       TEXT PRIMARY KEY,         -- identifiant opaque de session
  organizer_id TEXT NOT NULL REFERENCES organizer(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_session_expires ON auth_session(expires_at);

-- ───────────── Conférence / session interactive ─────────────
CREATE TABLE session (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL,          -- code court ; unicité parmi sessions actives gérée applicativement
  title         TEXT NOT NULL,
  description   TEXT,
  state         TEXT NOT NULL,          -- preparation|active|suspended|closed|cancelled
  content_locale TEXT NOT NULL DEFAULT 'fr',
  anonymous     INTEGER NOT NULL DEFAULT 0,
  planned_at    INTEGER,
  created_at    INTEGER NOT NULL,
  started_at    INTEGER,
  closed_at     INTEGER,
  settings_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_session_state ON session(state);
CREATE INDEX idx_session_code ON session(code);

-- ───────────── Participants (par session, sans compte) ─────────────
CREATE TABLE participant (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  pseudonym       TEXT NOT NULL,
  avatar          TEXT,
  reconnect_token TEXT NOT NULL,        -- identité technique temporaire stable
  team_id         TEXT REFERENCES team(id) ON DELETE SET NULL,
  join_order      INTEGER NOT NULL,     -- pour le départage des égalités
  connected       INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL
);
CREATE INDEX idx_participant_session ON participant(session_id);
CREATE UNIQUE INDEX idx_participant_reconnect ON participant(session_id, reconnect_token);

-- ───────────── Équipes (simples, créées par l'organisateur) ─────────────
CREATE TABLE team (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_team_session ON team(session_id);

-- ───────────── Bibliothèque d'activités réutilisables ─────────────
-- Une activité de bibliothèque modifiée NE change PAS les sessions passées
-- (celles-ci conservent un snapshot indépendant — voir session_activity).
CREATE TABLE activity_library (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,          -- quiz|poll|qa|open
  title         TEXT NOT NULL,
  content_locale TEXT NOT NULL DEFAULT 'fr',
  definition_json TEXT NOT NULL,        -- définition complète validée par Zod
  used          INTEGER NOT NULL DEFAULT 0, -- 1 dès qu'attachée à une session (édition par duplication)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- ───────────── Activité attachée à une session (SNAPSHOT immuable) ─────────────
CREATE TABLE session_activity (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  library_id    TEXT REFERENCES activity_library(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,
  position      INTEGER NOT NULL,        -- ordre dans la file
  snapshot_json TEXT NOT NULL,           -- copie figée de la définition au moment de l'ajout
  state         TEXT NOT NULL,           -- prepared|countdown|running|paused|closed|cancelled
  private_notes TEXT,                    -- notes organisateur, JAMAIS envoyées à la projection
  results_published_console INTEGER NOT NULL DEFAULT 0,
  results_published_projection INTEGER NOT NULL DEFAULT 0,
  started_at    INTEGER,                 -- heure officielle de départ (autorité serveur)
  deadline_at   INTEGER,                 -- fin de minuteur officielle
  closed_at     INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_session_activity_session ON session_activity(session_id, position);

-- ───────────── Réponses quiz/sondage ─────────────
-- Idempotence : une seule réponse confirmée par (activité, participant).
-- client_submission_id empêche les doublons d'un même envoi réseau.
CREATE TABLE answer (
  id             TEXT PRIMARY KEY,
  session_activity_id TEXT NOT NULL REFERENCES session_activity(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
  client_submission_id TEXT NOT NULL,
  payload_json   TEXT NOT NULL,          -- index choisis / texte / échelle
  score          INTEGER,                -- calculé serveur (quiz) ; NULL pour sondage non noté
  answer_time_ms INTEGER,                -- temps de réponse (départage des égalités)
  created_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_answer_unique ON answer(session_activity_id, participant_id);
CREATE UNIQUE INDEX idx_answer_idem ON answer(session_activity_id, participant_id, client_submission_id);

-- ───────────── Q&A ─────────────
CREATE TABLE qa_question (
  id             TEXT PRIMARY KEY,
  session_activity_id TEXT NOT NULL REFERENCES session_activity(id) ON DELETE CASCADE,
  participant_id TEXT REFERENCES participant(id) ON DELETE SET NULL,
  anonymous      INTEGER NOT NULL DEFAULT 0,
  text           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending', -- pending|approved|hidden|archived|answered
  projected      INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_qa_question_activity ON qa_question(session_activity_id);

CREATE TABLE qa_vote (
  id           TEXT PRIMARY KEY,
  question_id  TEXT NOT NULL REFERENCES qa_question(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL
);
-- Un participant ne vote qu'une fois par question (idempotence).
CREATE UNIQUE INDEX idx_qa_vote_unique ON qa_vote(question_id, participant_id);

-- ───────────── Réponses ouvertes ─────────────
CREATE TABLE open_answer (
  id             TEXT PRIMARY KEY,
  session_activity_id TEXT NOT NULL REFERENCES session_activity(id) ON DELETE CASCADE,
  participant_id TEXT REFERENCES participant(id) ON DELETE SET NULL,
  text           TEXT NOT NULL,
  hidden         INTEGER NOT NULL DEFAULT 0,
  group_label    TEXT,                   -- regroupement manuel de réponses similaires
  manual_score   INTEGER,                -- note manuelle facultative
  projected      INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_open_answer_activity ON open_answer(session_activity_id);

-- ───────────── Médias locaux ─────────────
CREATE TABLE media (
  id          TEXT PRIMARY KEY,
  filename    TEXT NOT NULL,             -- nom stocké sur disque
  mime        TEXT NOT NULL,             -- type réel vérifié à l'upload
  bytes       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

-- ───────────── Métadonnées de sauvegarde ─────────────
CREATE TABLE backup_meta (
  id          TEXT PRIMARY KEY,
  filename    TEXT NOT NULL,
  kind        TEXT NOT NULL,             -- auto|manual
  bytes       INTEGER NOT NULL,
  checksum    TEXT,
  created_at  INTEGER NOT NULL
);

-- ───────────── Préférences (thème, etc.) stockées localement ─────────────
CREATE TABLE app_setting (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
