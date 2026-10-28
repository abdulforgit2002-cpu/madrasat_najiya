BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS guardians (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  phone VARCHAR(40),
  email VARCHAR(180),
  relationship VARCHAR(60) NOT NULL DEFAULT 'Parent/Guardian',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  admission_no VARCHAR(30) UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  gender VARCHAR(20) NOT NULL CHECK (gender IN ('female','male','other','not_specified')),
  date_of_birth DATE,
  primary_guardian_id BIGINT REFERENCES guardians(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','graduated','transferred','withdrawn')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE SEQUENCE IF NOT EXISTS student_admission_seq START 1;
CREATE OR REPLACE FUNCTION assign_admission_no() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.admission_no IS NULL OR NEW.admission_no = '' THEN
    NEW.admission_no := 'MN-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('student_admission_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS students_admission_no_trigger ON students;
CREATE TRIGGER students_admission_no_trigger BEFORE INSERT ON students FOR EACH ROW EXECUTE FUNCTION assign_admission_no();

CREATE TABLE IF NOT EXISTS academic_years (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (end_date >= start_date)
);
CREATE TABLE IF NOT EXISTS stages (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  min_age SMALLINT,
  max_age SMALLINT,
  sequence_no SMALLINT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS grades (
  id BIGSERIAL PRIMARY KEY,
  stage_id BIGINT REFERENCES stages(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  sequence_no SMALLINT NOT NULL,
  UNIQUE(stage_id, name), UNIQUE(sequence_no)
);
CREATE TABLE IF NOT EXISTS staff (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  phone VARCHAR(40),
  email VARCHAR(180),
  staff_role VARCHAR(40) NOT NULL DEFAULT 'teacher',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS classes (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  grade_id BIGINT REFERENCES grades(id) ON DELETE SET NULL,
  teacher_id BIGINT REFERENCES staff(id) ON DELETE SET NULL,
  academic_year_id BIGINT REFERENCES academic_years(id) ON DELETE SET NULL,
  capacity SMALLINT CHECK (capacity IS NULL OR capacity > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS enrollments (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id BIGINT REFERENCES classes(id) ON DELETE SET NULL,
  grade_id BIGINT REFERENCES grades(id) ON DELETE SET NULL,
  academic_year_id BIGINT REFERENCES academic_years(id) ON DELETE SET NULL,
  enrolled_on DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','transferred','withdrawn')),
  UNIQUE(student_id, academic_year_id)
);
CREATE TABLE IF NOT EXISTS curriculum_subjects (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  sequence_no SMALLINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS curriculum_topics (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES curriculum_subjects(id) ON DELETE CASCADE,
  grade_id BIGINT REFERENCES grades(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  details TEXT,
  sequence_no SMALLINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS attendance_records (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id BIGINT REFERENCES classes(id) ON DELETE SET NULL,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('present','absent','late','excused')),
  notes TEXT,
  recorded_by BIGINT REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, attendance_date)
);
CREATE TABLE IF NOT EXISTS quran_progress (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assessed_by BIGINT REFERENCES staff(id) ON DELETE SET NULL,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assessment_type VARCHAR(20) NOT NULL CHECK (assessment_type IN ('recitation','hifz','revision','tajweed')),
  surah_name VARCHAR(100),
  verse_from INTEGER CHECK (verse_from IS NULL OR verse_from > 0),
  verse_to INTEGER CHECK (verse_to IS NULL OR verse_to >= verse_from),
  accuracy_score SMALLINT NOT NULL CHECK (accuracy_score BETWEEN 1 AND 5),
  tajweed_score SMALLINT NOT NULL CHECK (tajweed_score BETWEEN 1 AND 5),
  fluency_score SMALLINT NOT NULL CHECK (fluency_score BETWEEN 1 AND 5),
  outcome VARCHAR(100) NOT NULL DEFAULT 'In progress',
  teacher_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS assessment_results (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id BIGINT REFERENCES curriculum_subjects(id) ON DELETE SET NULL,
  assessment_name VARCHAR(160) NOT NULL,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  score NUMERIC(6,2),
  max_score NUMERIC(6,2),
  teacher_notes TEXT,
  entered_by BIGINT REFERENCES staff(id) ON DELETE SET NULL,
  CHECK (score IS NULL OR score >= 0), CHECK (max_score IS NULL OR max_score > 0),
  CHECK (score IS NULL OR max_score IS NULL OR score <= max_score)
);
CREATE TABLE IF NOT EXISTS promotion_records (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_grade_id BIGINT REFERENCES grades(id) ON DELETE SET NULL,
  to_grade_id BIGINT REFERENCES grades(id) ON DELETE SET NULL,
  academic_year_id BIGINT REFERENCES academic_years(id) ON DELETE SET NULL,
  decision VARCHAR(30) NOT NULL CHECK (decision IN ('promoted','repeat','graduated','transferred')),
  decision_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS fee_transactions (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE SET NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('fee','payment','refund','sponsorship')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'TZS',
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_no VARCHAR(100),
  description TEXT,
  received_by BIGINT REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_type VARCHAR(30) NOT NULL DEFAULT 'system',
  actor_id BIGINT,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO stages(name,min_age,max_age,sequence_no) VALUES
 ('Foundation / Early Childhood',4,5,1),
 ('Primary Cycle',6,8,2),
 ('Intermediate Cycle',9,14,3),
 ('Senior Certificate',15,16,4),
 ('Advanced Stream',17,18,5)
ON CONFLICT (name) DO NOTHING;
INSERT INTO curriculum_subjects(name,description,sequence_no) VALUES
 ('Qira''at & Hifz','Quranic recitation, memorization and revision',1),
 ('Tajweed','Rules and application of Quranic recitation',2),
 ('Aqeeda','Islamic creed and foundational beliefs',3),
 ('Fiqh','Practical Islamic jurisprudence',4),
 ('Akhlaq & Tarbiyah','Character, conduct and personal development',5),
 ('Seera & Tarikh','Prophetic biography and Islamic history',6)
ON CONFLICT (name) DO NOTHING;
COMMIT;
