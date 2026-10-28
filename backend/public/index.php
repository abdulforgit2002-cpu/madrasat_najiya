<?php
declare(strict_types=1);
require __DIR__ . '/../src/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$path = preg_replace('#^/api#', '', $path);

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
            $stmt = $pdo->prepare("SELECT s.id, s.admission_no, s.first_name, s.last_name, s.gender, s.date_of_birth, s.status, g.full_name AS guardian_name, g.phone AS guardian_phone, gr.name AS grade_name, c.name AS class_name FROM students s LEFT JOIN guardians g ON g.id = s.primary_guardian_id LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active' LEFT JOIN grades gr ON gr.id = e.grade_id LEFT JOIN classes c ON c.id = e.class_id WHERE (s.first_name ILIKE :q OR s.last_name ILIKE :q OR s.admission_no ILIKE :q) ORDER BY s.created_at DESC LIMIT 100");
            $stmt->execute(['q' => "%{$q}%"]);
        } else {
            $stmt = $pdo->query("SELECT s.id, s.admission_no, s.first_name, s.last_name, s.gender, s.date_of_birth, s.status, g.full_name AS guardian_name, g.phone AS guardian_phone, gr.name AS grade_name, c.name AS class_name FROM students s LEFT JOIN guardians g ON g.id = s.primary_guardian_id LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active' LEFT JOIN grades gr ON gr.id = e.grade_id LEFT JOIN classes c ON c.id = e.class_id ORDER BY s.created_at DESC LIMIT 100");
        }
        respond(['data' => $stmt->fetchAll()]);
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
