# MADRASAT NAJIYA

Quranic Madrasa Student Management System built with PHP REST API, React/Vite and PostgreSQL.

Initial development starter using **PHP REST API + React/Vite + PostgreSQL**. This is a local development scaffold, not a production-ready deployment. It currently implements student registration, dashboard counts, daily attendance, Quran learning assessments, and the supplied curriculum framework overview.

## 1. Prerequisites

- PHP 8.1+ with `pdo_pgsql` enabled
- PostgreSQL 14+
- Node.js 20+ and npm
- A terminal / command prompt

Check PHP modules with `php -m` and confirm `pdo_pgsql` is listed. On Debian/Ubuntu, the package is commonly `php-pgsql`.

## 2. Create the database

Create a PostgreSQL database named `madrasat_najiya`, then run the schema:

```bash
createdb madrasat_najiya
psql -d madrasat_najiya -f backend/database/schema.sql
```

If `createdb` is not available, create the database through pgAdmin, then run `schema.sql` in its query tool.

The schema creates the first database structures for students, guardians, stages, grades, classes, enrollments, curriculum subjects/topics, attendance, Quran progress, assessment results, promotions, fee transactions, and audit logs. The initial subject and stage records are seeded. Grades, classes, staff accounts, and curriculum topics still need to be configured in the next development phase.

## 3. Configure the PHP API

Copy `backend/.env.example` to `backend/.env` and set your PostgreSQL credentials. **Important:** PHP's built-in web server does not automatically load `.env`; for this starter, export the variables in the terminal before starting PHP.

Linux/macOS example:

```bash
export DB_HOST=127.0.0.1
export DB_PORT=5432
export DB_NAME=madrasat_najiya
export DB_USER=postgres
export DB_PASSWORD='your_local_database_password'
php -S 127.0.0.1:8000 -t backend/public backend/public/index.php
```

On Windows PowerShell, set the environment variables using `$env:DB_HOST="127.0.0.1"` etc. before running the PHP server.

Check the API health endpoint at `http://127.0.0.1:8000/api/health`. It should return JSON with `status: ok` and `database: connected`.

## 4. Start React + Vite

Open a second terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open the local address Vite prints (normally `http://localhost:5173`). The frontend uses `VITE_API_URL=http://localhost:8000/api` by default.

## 5. Implemented API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | API and database health check |
| GET | `/api/dashboard` | Dashboard counts and today's attendance snapshot |
| GET | `/api/students?q=search` | Search/list students |
| POST | `/api/students` | Register a student and optional guardian |
| GET | `/api/attendance?date=YYYY-MM-DD` | List attendance for a date |
| POST | `/api/attendance` | Add/update attendance for a student and date |
| GET | `/api/quran-progress` | List recent Quran progress assessments |
| POST | `/api/quran-progress` | Save a teacher-entered assessment |

### Example student request

```json
{
  "first_name": "Amina",
  "last_name": "Hassan",
  "gender": "female",
  "date_of_birth": "2018-03-12",
  "guardian_name": "Hassan Ali",
  "guardian_phone": "+255..."
}
```

The database assigns an admission number such as `MN-2026-00001` automatically.

## 6. Project structure

```text
madrasat-najiya/
├── backend/
│   ├── database/schema.sql
│   ├── public/index.php
│   └── src/bootstrap.php
├── frontend/
│   ├── src/App.jsx
│   ├── src/main.jsx
│   ├── src/styles.css
│   ├── index.html
│   └── package.json
└── README.md
```

## 7. Important development and safety notes

- **Authentication and role-based access are not implemented yet.** Do not expose this build publicly or store real student data on an internet-facing server until authentication, authorisation, validation, rate limiting, secure secrets, HTTPS, audit coverage, and tested backups are implemented.
- The CORS policy is currently limited to `http://localhost:5173` for local development. Update it deliberately for the chosen deployment domain.
- Student records concern children. Before rollout, establish guardian consent, data minimisation, access policies, retention/deletion rules, backup procedures, and compliance with applicable Tanzanian data-protection requirements.
- Quran scores are entered by a teacher. The system does not automatically determine whether recitation is correct.
- The framework stages reflect the supplied document. Verify grade mappings, Quran sequence, and the meaning/order of the stated Parahs with madrasa leadership before finalising the curriculum configuration.
- This starter has no finance UI, parent portal, student login, certificate generation, PDF report cards, messaging, multi-branch support, or offline sync yet.

## 8. Recommended next milestones

1. Confirm the madrasa's admission form, academic-year rules, stage/grade mapping, and attendance workflow.
2. Add login, password hashing, session/token management, and permissions for administrator, headteacher, teacher, finance staff, and guardian.
3. Add staff/class/grade setup and assign students to classes.
4. Add class-specific attendance, term assessments, promotion approval, printable reports, and certificate templates.
5. Pilot with dummy data, test backup/restore, train staff, then migrate verified paper records in batches.
