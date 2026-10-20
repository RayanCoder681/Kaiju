# Schéma de base de données et migrations

SQLite (`better-sqlite3`, mode WAL, `foreign_keys = ON`). Identifiants `TEXT`, horodatages
`INTEGER` (ms epoch), booléens `0/1`, configurations/snapshots en JSON `TEXT` (validés Zod côté
application).

## Stratégie de migrations

- Fichiers `server/src/db/migrations/NNN_*.sql`, appliqués par ordre alphabétique, chacun dans une
  transaction, suivis dans `_migration` (nom + checksum SHA-256).
- **Ne jamais éditer une migration appliquée** : son checksum divergent lève une erreur. Pour un
  changement de schéma, créer `002_*.sql`, `003_*.sql`, etc.
- Commande : `npm run migrate` (appliquées aussi automatiquement au démarrage du serveur).

## Tables (migration 001)

| Table | Rôle | Points clés |
|---|---|---|
| `organizer` | Compte admin local unique | `password_hash` (bcrypt), jamais en clair |
| `auth_session` | Sessions organisateur | jeton opaque + expiration |
| `session` | Conférence/session | `state` (cycle de vie), `code`, horodatages officiels |
| `participant` | Participant (par session) | `reconnect_token` (identité temporaire), `join_order` (départage), `team_id` |
| `team` | Équipes simples | créées par l'organisateur |
| `activity_library` | Bibliothèque réutilisable | `definition_json`, `used` (édition par duplication) |
| `session_activity` | Activité attachée (SNAPSHOT) | `snapshot_json` immuable, `private_notes` (jamais projetées), horodatages serveur, drapeaux de publication |
| `answer` | Réponses quiz/sondage | **unique (activité, participant)** et unique idempotence ; `score` calculé serveur |
| `qa_question` / `qa_vote` | Q&A | vote **unique (question, participant)** |
| `open_answer` | Réponses ouvertes | modération, note manuelle |
| `media` | Images locales | `mime` (type réel vérifié) |
| `backup_meta` | Métadonnées de sauvegarde | checksum |
| `app_setting` | Préférences locales | thème, etc. |

## Contraintes d'intégrité notables (règles métier au niveau SQL)

- `idx_answer_unique (session_activity_id, participant_id)` : une seule réponse confirmée par
  participant et par activité → pas de double comptage.
- `idx_answer_idem (session_activity_id, participant_id, client_submission_id)` : idempotence réseau.
- `idx_qa_vote_unique (question_id, participant_id)` : un vote par question et par participant.
- `idx_participant_reconnect (session_id, reconnect_token)` : reconnexion stable sans doublon.

Ces contraintes garantissent les règles même en cas de course réseau, indépendamment de l'UI.
