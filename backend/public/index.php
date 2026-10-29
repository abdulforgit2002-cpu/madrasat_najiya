<?php
declare(strict_types=1);
require __DIR__ . '/../src/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$path = preg_replace('#^/api#', '', $path);

/** Return a complete, read-only student profile. */
function student_profile(PDO $pdo, int $studentId): ?array {
    $stmt = $pdo->prepare("SELECT
        s.id, s.admission_no, s.first_name, s.last_name, s.gender,
        s.date_of_birth, s.status, s.notes, s.created_at, s.updated_at,
        g.id AS guardian_id, g.full_name AS guardian_name,
        g.phone AS guardian_phone, g.email AS guardian_email,
        g.relationship AS guardian_relationship,
        gr.name AS grade_name, c.name AS class_name,
        ay.name AS academic_year_name, e.enrolled_on, e.status AS enrollment_status
      FROM students s
      LEFT JOIN guardians g ON g.id = s.primary_guardian_id
      LEFT JOIN LATERAL (
        SELECT e1.grade_id, e1.class_id, e1.academic_year_id, e1.enrolled_on, e1.status
        FROM enrollments e1
        WHERE e1.student_id = s.id AND e1.status = 'active'
        ORDER BY e1.enrolled_on DESC, e1.id DESC
        LIMIT 1
      ) e ON TRUE
      LEFT JOIN grades gr ON gr.id = e.grade_id
      LEFT JOIN classes c ON c.id = e.class_id
      LEFT JOIN academic_years ay ON ay.id = e.academic_year_id
      WHERE s.id = :id");
    $stmt->execute(['id' => $studentId]);
    $profile = $stmt->fetch();
    if (!$profile) return null;

    $attendance = $pdo->prepare("SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'present') AS present,
        COUNT(*) FILTER (WHERE status = 'absent') AS absent,
        COUNT(*) FILTER (WHERE status = 'late') AS late,
        COUNT(*) FILTER (WHERE status = 'excused') AS excused
      FROM attendance_records WHERE student_id = :id");
    $attendance->execute(['id' => $studentId]);
    $profile['attendance_summary'] = $attendance->fetch();

    $quran = $pdo->prepare("SELECT id, assessment_date, assessment_type, surah_name,
        verse_from, verse_to, accuracy_score, tajweed_score, fluency_score,
        outcome, teacher_notes
      FROM quran_progress WHERE student_id = :id
      ORDER BY assessment_date DESC, created_at DESC LIMIT 5");
    $quran->execute(['id' => $studentId]);
    $profile['recent_quran_progress'] = $quran->fetchAll();
    return $profile;
}

/**
 * Record an application event in the audit trail.
 * Call inside the same transaction as the change being audited.
 * Do not put unnecessary personal or guardian information in details.
 */
function write_audit_log(
    PDO $pdo,
    string $action,
    string $entityType,
    int $entityId,
    array $details = []
): void {
    $stmt = $pdo->prepare(
        'INSERT INTO audit_logs
            (actor_type, actor_id, action, entity_type, entity_id, details)
         VALUES
            (:actor_type, NULL, :action, :entity_type, :entity_id, CAST(:details AS JSONB))'
    );

    $stmt->execute([
        'actor_type' => 'system',
        'action' => $action,
        'entity_type' => $entityType,
        'entity_id' => $entityId,
        'details' => json_encode(
            $details,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES
        ),
    ]);
}

try {
    if ($method === 'GET' && $path === '/health') {
        $pdo->query('SELECT 1');
        respond(['status' => 'ok', 'service' => 'MADRASAT NAJIYA API', 'database' => 'connected']);
    }

    if ($method === 'GET' && $path === '/dashboard') {
        $students = (int)$pdo->query("SELECT COUNT(*) FROM students WHERE status = 'active'")->fetchColumn();
        $classes = (int)$pdo->query("SELECT COUNT(*) FROM classes WHERE is_active = TRUE")->fetchColumn();
        $today = (new DateTimeImmutable('now'))->format('Y-m-d');
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM attendance_records WHERE attendance_date = :day AND status = :status');
        $stmt->execute(['day' => $today, 'status' => 'present']);
        $present = (int)$stmt->fetchColumn();
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM attendance_records WHERE attendance_date = :day');
        $stmt->execute(['day' => $today]);
        $marked = (int)$stmt->fetchColumn();
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM quran_progress WHERE assessment_date >= CURRENT_DATE - INTERVAL \'7 days\'');
        $stmt->execute();
        $weeklyAssessments = (int)$stmt->fetchColumn();
        respond([
            'active_students' => $students,
            'active_classes' => $classes,
            'attendance_rate_today' => $marked > 0 ? round(($present / $marked) * 100) : null,
            'quran_assessments_this_week' => $weeklyAssessments,
            'attendance_records_today' => $marked,
        ]);
    }

    if ($method === 'GET' && $path === '/students') {
        $q = trim((string)($_GET['q'] ?? ''));
        if ($q !== '') {
            $stmt = $pdo->prepare("SELECT s.id, s.admission_no, s.first_name, s.last_name, s.gender, s.date_of_birth, s.status, g.full_name AS guardian_name, g.phone AS guardian_phone, gr.name AS grade_name, c.name AS class_name FROM students s LEFT JOIN guardians g ON g.id = s.primary_guardian_id LEFT JOIN LATERAL (
            SELECT e.grade_id, e.class_id
            FROM enrollments e
            WHERE e.student_id = s.id
              AND e.status = 'active'
            ORDER BY e.enrolled_on DESC, e.id DESC
            LIMIT 1
        ) e ON TRUE LEFT JOIN grades gr ON gr.id = e.grade_id LEFT JOIN classes c ON c.id = e.class_id WHERE (s.first_name ILIKE :q OR s.last_name ILIKE :q OR s.admission_no ILIKE :q) ORDER BY s.created_at DESC LIMIT 100");
            $stmt->execute(['q' => "%{$q}%"]);
        } else {
            $stmt = $pdo->query("SELECT s.id, s.admission_no, s.first_name, s.last_name, s.gender, s.date_of_birth, s.status, g.full_name AS guardian_name, g.phone AS guardian_phone, gr.name AS grade_name, c.name AS class_name FROM students s LEFT JOIN guardians g ON g.id = s.primary_guardian_id LEFT JOIN LATERAL (
            SELECT e.grade_id, e.class_id
            FROM enrollments e
            WHERE e.student_id = s.id
              AND e.status = 'active'
            ORDER BY e.enrolled_on DESC, e.id DESC
            LIMIT 1
        ) e ON TRUE LEFT JOIN grades gr ON gr.id = e.grade_id LEFT JOIN classes c ON c.id = e.class_id ORDER BY s.created_at DESC LIMIT 100");
        }
        respond(['data' => $stmt->fetchAll()]);
    }

    if ($method === 'GET' && preg_match('#^/students/([^/]+)$#', $path, $matches)) {
        $studentId = filter_var($matches[1], FILTER_VALIDATE_INT);
        if ($studentId === false || $studentId < 1) respond(['error' => 'A valid student ID is required.'], 422);
        $profile = student_profile($pdo, $studentId);
        if (!$profile) respond(['error' => 'Student not found.'], 404);
        respond(['data' => $profile]);
    }

    if ($method === 'PUT' && preg_match('#^/students/([^/]+)$#', $path, $matches)) {
        $studentId = filter_var($matches[1], FILTER_VALIDATE_INT);
        if ($studentId === false || $studentId < 1) respond(['error' => 'A valid student ID is required.'], 422);
        $body = request_body();
        foreach (['first_name', 'last_name', 'gender'] as $field) {
            if (trim((string)($body[$field] ?? '')) === '') respond(['error' => "{$field} is required."], 422);
        }
        $firstName = trim((string)$body['first_name']);
        $lastName = trim((string)$body['last_name']);
        if (strlen($firstName) > 100 || strlen($lastName) > 100) respond(['error' => 'Student names must be 100 characters or fewer.'], 422);
        $gender = (string)$body['gender'];
        if (!in_array($gender, ['female', 'male', 'other', 'not_specified'], true)) respond(['error' => 'Invalid gender value.'], 422);

        $dob = trim((string)($body['date_of_birth'] ?? ''));
        if ($dob !== '') {
            $parsedDob = DateTimeImmutable::createFromFormat('!Y-m-d', $dob);
            $dateErrors = DateTimeImmutable::getLastErrors();
            if (!$parsedDob || ($dateErrors !== false && ($dateErrors['warning_count'] > 0 || $dateErrors['error_count'] > 0)) || $parsedDob->format('Y-m-d') !== $dob) {
                respond(['error' => 'Date of birth must be a valid date in YYYY-MM-DD format.'], 422);
            }
            if ($parsedDob > new DateTimeImmutable('today')) respond(['error' => 'Date of birth cannot be in the future.'], 422);
        } else {
            $dob = null;
        }

        $guardianName = trim((string)($body['guardian_name'] ?? ''));
        $guardianPhone = trim((string)($body['guardian_phone'] ?? ''));
        $guardianEmail = trim((string)($body['guardian_email'] ?? ''));
        $guardianRelationship = trim((string)($body['guardian_relationship'] ?? 'Parent/Guardian')) ?: 'Parent/Guardian';
        if (strlen($guardianName) > 160 || strlen($guardianPhone) > 40 || strlen($guardianEmail) > 180 || strlen($guardianRelationship) > 60) {
            respond(['error' => 'One or more guardian fields exceed the allowed length.'], 422);
        }
        if ($guardianEmail !== '' && !filter_var($guardianEmail, FILTER_VALIDATE_EMAIL)) respond(['error' => 'Enter a valid guardian email address.'], 422);
        $notes = trim((string)($body['notes'] ?? '')) ?: null;

        $pdo->beginTransaction();
        try {
            $lock = $pdo->prepare("SELECT
                s.primary_guardian_id, s.first_name, s.last_name, s.gender,
                s.date_of_birth, s.notes,
                g.full_name AS guardian_name, g.phone AS guardian_phone,
                g.email AS guardian_email, g.relationship AS guardian_relationship
                FROM students s
                LEFT JOIN guardians g ON g.id = s.primary_guardian_id
                WHERE s.id = :id
                FOR UPDATE OF s");
            $lock->execute(['id' => $studentId]);
            $current = $lock->fetch();
            if (!$current) {
                $pdo->rollBack();
                respond(['error' => 'Student not found.'], 404);
            }

            $newGuardianName = $guardianName !== '' ? $guardianName : null;
            $newGuardianPhone = $guardianName !== '' && $guardianPhone !== '' ? $guardianPhone : null;
            $newGuardianEmail = $guardianName !== '' && $guardianEmail !== '' ? $guardianEmail : null;
            $newGuardianRelationship = $guardianName !== '' ? $guardianRelationship : null;

            $valuesBefore = [
                'first_name' => $current['first_name'],
                'last_name' => $current['last_name'],
                'gender' => $current['gender'],
                'date_of_birth' => $current['date_of_birth'],
                'notes' => $current['notes'],
                'guardian_name' => $current['guardian_name'],
                'guardian_phone' => $current['guardian_phone'],
                'guardian_email' => $current['guardian_email'],
                'guardian_relationship' => $current['guardian_relationship'],
            ];
            $valuesAfter = [
                'first_name' => $firstName,
                'last_name' => $lastName,
                'gender' => $gender,
                'date_of_birth' => $dob,
                'notes' => $notes,
                'guardian_name' => $newGuardianName,
                'guardian_phone' => $newGuardianPhone,
                'guardian_email' => $newGuardianEmail,
                'guardian_relationship' => $newGuardianRelationship,
            ];

            $changedFields = [];
            foreach ($valuesAfter as $field => $newValue) {
                $oldValue = $valuesBefore[$field] ?? null;
                if ($oldValue !== null && $newValue !== null) {
                    if ((string)$oldValue !== (string)$newValue) $changedFields[] = $field;
                } elseif ($oldValue !== $newValue) {
                    $changedFields[] = $field;
                }
            }

            $guardianId = $current['primary_guardian_id'] !== null ? (int)$current['primary_guardian_id'] : null;
            if ($guardianName === '') {
                $guardianId = null;
            } elseif ($guardianId === null) {
                $insertGuardian = $pdo->prepare('INSERT INTO guardians (full_name, phone, email, relationship) VALUES (:name, :phone, :email, :relationship) RETURNING id');
                $insertGuardian->execute(['name' => $guardianName, 'phone' => $guardianPhone ?: null, 'email' => $guardianEmail ?: null, 'relationship' => $guardianRelationship]);
                $guardianId = (int)$insertGuardian->fetchColumn();
            } else {
                $shared = $pdo->prepare('SELECT COUNT(*) FROM students WHERE primary_guardian_id = :guardian_id');
                $shared->execute(['guardian_id' => $guardianId]);
                if ((int)$shared->fetchColumn() > 1) {
                    // A guardian may be linked to other students; clone the details rather than changing their shared record.
                    $insertGuardian = $pdo->prepare('INSERT INTO guardians (full_name, phone, email, relationship) VALUES (:name, :phone, :email, :relationship) RETURNING id');
                    $insertGuardian->execute(['name' => $guardianName, 'phone' => $guardianPhone ?: null, 'email' => $guardianEmail ?: null, 'relationship' => $guardianRelationship]);
                    $guardianId = (int)$insertGuardian->fetchColumn();
                } else {
                    $updateGuardian = $pdo->prepare('UPDATE guardians SET full_name = :name, phone = :phone, email = :email, relationship = :relationship WHERE id = :id');
                    $updateGuardian->execute(['name' => $guardianName, 'phone' => $guardianPhone ?: null, 'email' => $guardianEmail ?: null, 'relationship' => $guardianRelationship, 'id' => $guardianId]);
                }
            }

            $update = $pdo->prepare('UPDATE students SET first_name = :first_name, last_name = :last_name, gender = :gender, date_of_birth = :dob, primary_guardian_id = :guardian_id, notes = :notes, updated_at = NOW() WHERE id = :id');
            $update->execute(['first_name' => $firstName, 'last_name' => $lastName, 'gender' => $gender, 'dob' => $dob, 'guardian_id' => $guardianId, 'notes' => $notes, 'id' => $studentId]);

            if ($changedFields !== []) {
                write_audit_log($pdo, 'student.updated', 'student', $studentId, [
                    'changed_fields' => $changedFields,
                ]);
            }

            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        respond(['data' => student_profile($pdo, $studentId)]);
    }

    if ($method === 'PATCH' && preg_match('#^/students/([^/]+)/status$#', $path, $matches)) {
        $studentId = filter_var($matches[1], FILTER_VALIDATE_INT);
        if ($studentId === false || $studentId < 1) respond(['error' => 'A valid student ID is required.'], 422);
        $body = request_body();
        $status = (string)($body['status'] ?? '');
        $allowedStatuses = ['active', 'inactive', 'graduated', 'transferred', 'withdrawn'];
        if (!in_array($status, $allowedStatuses, true)) respond(['error' => 'Invalid student status.'], 422);

        $pdo->beginTransaction();
        try {
            $lock = $pdo->prepare('SELECT status FROM students WHERE id = :id FOR UPDATE');
            $lock->execute(['id' => $studentId]);
            $current = $lock->fetch();

            if (!$current) {
                $pdo->rollBack();
                respond(['error' => 'Student not found.'], 404);
            }

            $previousStatus = (string)$current['status'];

            if ($previousStatus !== $status) {
                $update = $pdo->prepare('UPDATE students SET status = :status, updated_at = NOW() WHERE id = :id');
                $update->execute(['status' => $status, 'id' => $studentId]);

                write_audit_log($pdo, 'student.status_changed', 'student', $studentId, [
                    'previous_status' => $previousStatus,
                    'new_status' => $status,
                ]);
            }

            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }

        respond(['data' => student_profile($pdo, $studentId)]);
    }

    if ($method === 'POST' && $path === '/students') {
        $body = request_body();
        foreach (['first_name', 'last_name', 'gender'] as $field) {
            if (trim((string)($body[$field] ?? '')) === '') respond(['error' => "{$field} is required."], 422);
        }
        $gender = $body['gender'];
        if (!in_array($gender, ['female', 'male', 'other', 'not_specified'], true)) respond(['error' => 'Invalid gender value.'], 422);
        $pdo->beginTransaction();
        try {
            $guardianId = null;
            $guardianName = trim((string)($body['guardian_name'] ?? ''));
            if ($guardianName !== '') {
                $g = $pdo->prepare('INSERT INTO guardians (full_name, phone, relationship) VALUES (:name, :phone, :relationship) RETURNING id');
                $g->execute(['name' => $guardianName, 'phone' => trim((string)($body['guardian_phone'] ?? '')) ?: null, 'relationship' => trim((string)($body['guardian_relationship'] ?? 'Parent/Guardian'))]);
                $guardianId = (int)$g->fetchColumn();
            }
            $stmt = $pdo->prepare("INSERT INTO students (admission_no, first_name, last_name, gender, date_of_birth, primary_guardian_id, notes) VALUES (NULL, :first_name, :last_name, :gender, :dob, :guardian_id, :notes) RETURNING id, admission_no, first_name, last_name, gender, date_of_birth, status, created_at");
            $stmt->execute([
                'first_name' => trim($body['first_name']),
                'last_name' => trim($body['last_name']),
                'gender' => $gender,
                'dob' => !empty($body['date_of_birth']) ? $body['date_of_birth'] : null,
                'guardian_id' => $guardianId,
                'notes' => trim((string)($body['notes'] ?? '')) ?: null,
            ]);
            $student = $stmt->fetch();

            write_audit_log($pdo, 'student.created', 'student', (int)$student['id'], [
                'admission_no' => $student['admission_no'],
            ]);

            $pdo->commit();
            respond(['data' => $student], 201);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    if ($method === 'GET' && $path === '/attendance') {
        $day = (string)($_GET['date'] ?? date('Y-m-d'));
        $stmt = $pdo->prepare('SELECT a.id, a.student_id, s.admission_no, s.first_name, s.last_name, a.attendance_date, a.status, a.notes FROM attendance_records a JOIN students s ON s.id = a.student_id WHERE a.attendance_date = :day ORDER BY s.last_name, s.first_name');
        $stmt->execute(['day' => $day]);
        respond(['date' => $day, 'data' => $stmt->fetchAll()]);
    }

    if ($method === 'POST' && $path === '/attendance') {
        $body = request_body();
        $studentId = filter_var($body['student_id'] ?? null, FILTER_VALIDATE_INT);
        $day = (string)($body['attendance_date'] ?? date('Y-m-d'));
        $status = (string)($body['status'] ?? 'present');
        if (!$studentId) respond(['error' => 'A valid student_id is required.'], 422);
        if (!in_array($status, ['present', 'absent', 'late', 'excused'], true)) respond(['error' => 'Invalid attendance status.'], 422);
        $stmt = $pdo->prepare('INSERT INTO attendance_records (student_id, attendance_date, status, notes) VALUES (:student_id, :day, :status, :notes) ON CONFLICT (student_id, attendance_date) DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = NOW() RETURNING *');
        $stmt->execute(['student_id' => $studentId, 'day' => $day, 'status' => $status, 'notes' => trim((string)($body['notes'] ?? '')) ?: null]);
        respond(['data' => $stmt->fetch()], 201);
    }

    if ($method === 'GET' && $path === '/quran-progress') {
        $stmt = $pdo->query('SELECT qp.id, qp.student_id, s.admission_no, s.first_name, s.last_name, qp.assessment_date, qp.assessment_type, qp.surah_name, qp.verse_from, qp.verse_to, qp.accuracy_score, qp.tajweed_score, qp.fluency_score, qp.outcome, qp.teacher_notes FROM quran_progress qp JOIN students s ON s.id = qp.student_id ORDER BY qp.assessment_date DESC, qp.created_at DESC LIMIT 100');
        respond(['data' => $stmt->fetchAll()]);
    }

    if ($method === 'POST' && $path === '/quran-progress') {
        $body = request_body();
        $studentId = filter_var($body['student_id'] ?? null, FILTER_VALIDATE_INT);
        if (!$studentId) respond(['error' => 'A valid student_id is required.'], 422);
        $type = (string)($body['assessment_type'] ?? 'recitation');
        if (!in_array($type, ['recitation', 'hifz', 'revision', 'tajweed'], true)) respond(['error' => 'Invalid assessment_type.'], 422);
        $scores = [];
        foreach (['accuracy_score', 'tajweed_score', 'fluency_score'] as $field) {
            $v = filter_var($body[$field] ?? 3, FILTER_VALIDATE_INT);
            if ($v === false || $v < 1 || $v > 5) respond(['error' => "{$field} must be between 1 and 5."], 422);
            $scores[$field] = $v;
        }
        $stmt = $pdo->prepare('INSERT INTO quran_progress (student_id, assessment_date, assessment_type, surah_name, verse_from, verse_to, accuracy_score, tajweed_score, fluency_score, outcome, teacher_notes) VALUES (:student_id, :day, :type, :surah, :vfrom, :vto, :accuracy, :tajweed, :fluency, :outcome, :notes) RETURNING *');
        $stmt->execute([
            'student_id' => $studentId,
            'day' => $body['assessment_date'] ?? date('Y-m-d'),
            'type' => $type,
            'surah' => trim((string)($body['surah_name'] ?? '')) ?: null,
            'vfrom' => !empty($body['verse_from']) ? (int)$body['verse_from'] : null,
            'vto' => !empty($body['verse_to']) ? (int)$body['verse_to'] : null,
            'accuracy' => $scores['accuracy_score'],
            'tajweed' => $scores['tajweed_score'],
            'fluency' => $scores['fluency_score'],
            'outcome' => trim((string)($body['outcome'] ?? 'In progress')),
            'notes' => trim((string)($body['teacher_notes'] ?? '')) ?: null,
        ]);
        respond(['data' => $stmt->fetch()], 201);
    }

    respond(['error' => 'Endpoint not found.'], 404);
} catch (PDOException $e) {
    if ($e->getCode() === '23505') respond(['error' => 'This record already exists or conflicts with a unique value.'], 409);
    error_log((string)$e);
    respond(['error' => 'A database operation failed. Check server logs for details.'], 500);
} catch (Throwable $e) {
    error_log((string)$e);
    respond(['error' => 'Unexpected server error.'], 500);
}
