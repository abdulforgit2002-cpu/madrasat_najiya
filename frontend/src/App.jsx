import { useCallback, useEffect, useMemo, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const navItems = [
  { id: 'overview', label: 'Overview', icon: '◫' },
  { id: 'students', label: 'Students', icon: '♙' },
  { id: 'attendance', label: 'Attendance', icon: '✓' },
  { id: 'quran', label: 'Quran progress', icon: '۞' },
  { id: 'curriculum', label: 'Curriculum', icon: '▤' },
  { id: 'reports', label: 'Reports', icon: '▥' },
];

function Icon({ children }) { return <span className="icon" aria-hidden="true">{children}</span>; }
function EmptyState({ title, detail }) { return <div className="empty"><div className="empty-mark">۞</div><strong>{title}</strong><p>{detail}</p></div>; }

export default function App() {
  const [page, setPage] = useState('overview');
  const [health, setHealth] = useState('checking');
  const [dashboard, setDashboard] = useState(null);
  const [students, setStudents] = useState([]);
  const [quranRows, setQuranRows] = useState([]);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showQuranForm, setShowQuranForm] = useState(false);
  const [studentProfile, setStudentProfile] = useState(null);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editStudentForm, setEditStudentForm] = useState({ first_name: '', last_name: '', gender: 'not_specified', date_of_birth: '', guardian_name: '', guardian_phone: '', guardian_email: '', guardian_relationship: 'Parent/Guardian', notes: '' });
  const [statusChangingId, setStatusChangingId] = useState(null);
  const [studentForm, setStudentForm] = useState({ first_name: '', last_name: '', gender: 'not_specified', date_of_birth: '', guardian_name: '', guardian_phone: '' });
  const [quranForm, setQuranForm] = useState({ student_id: '', assessment_type: 'recitation', surah_name: '', verse_from: '', verse_to: '', accuracy_score: 3, tajweed_score: 3, fluency_score: 3, outcome: 'In progress', teacher_notes: '' });
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceRows, setAttendanceRows] = useState([]);

  const api = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const [h, d] = await Promise.all([api('/health'), api('/dashboard')]);
      setHealth(h.status === 'ok' ? 'connected' : 'error'); setDashboard(d);
    } catch { setHealth('offline'); setDashboard(null); }
  }, [api]);
  const loadStudents = useCallback(async (q = '') => {
    try { const result = await api(`/students${q ? `?q=${encodeURIComponent(q)}` : ''}`); setStudents(result.data || []); }
    catch (e) { setNotice(e.message); }
  }, [api]);
  const loadQuran = useCallback(async () => { try { setQuranRows((await api('/quran-progress')).data || []); } catch (e) { setNotice(e.message); } }, [api]);
  const loadAttendance = useCallback(async (date = attendanceDate) => { try { setAttendanceRows((await api(`/attendance?date=${date}`)).data || []); } catch (e) { setNotice(e.message); } }, [api, attendanceDate]);

  useEffect(() => { loadDashboard(); loadStudents(); loadQuran(); loadAttendance(); }, [loadDashboard, loadStudents, loadQuran, loadAttendance]);
  useEffect(() => { if (page === 'attendance') loadAttendance(attendanceDate); }, [page, attendanceDate, loadAttendance]);
  useEffect(() => { if (page === 'students') loadStudents(query); }, [page, query, loadStudents]);

  const setStudentField = (key, value) => setStudentForm(old => ({ ...old, [key]: value }));
  const setQuranField = (key, value) => setQuranForm(old => ({ ...old, [key]: value }));
  const submitStudent = async (e) => {
    e.preventDefault(); setBusy(true); setNotice('');
    try { await api('/students', { method: 'POST', body: JSON.stringify(studentForm) }); setStudentForm({ first_name: '', last_name: '', gender: 'not_specified', date_of_birth: '', guardian_name: '', guardian_phone: '' }); setShowStudentForm(false); setNotice('Student registered successfully.'); await Promise.all([loadStudents(), loadDashboard()]); }
    catch (err) { setNotice(err.message); }
    finally { setBusy(false); }
  };
  const openStudentProfile = async (studentId) => {
    setBusy(true); setNotice(''); setEditingStudentId(null);
    try { const result = await api(`/students/${studentId}`); setStudentProfile(result.data); }
    catch (err) { setNotice(err.message); }
    finally { setBusy(false); }
  };
  const beginStudentEdit = async (studentId) => {
    setBusy(true); setNotice('');
    try {
      const result = await api(`/students/${studentId}`);
      const s = result.data;
      setStudentProfile(s);
      setEditStudentForm({
        first_name: s.first_name || '', last_name: s.last_name || '', gender: s.gender || 'not_specified',
        date_of_birth: s.date_of_birth || '', guardian_name: s.guardian_name || '',
        guardian_phone: s.guardian_phone || '', guardian_email: s.guardian_email || '',
        guardian_relationship: s.guardian_relationship || 'Parent/Guardian', notes: s.notes || '',
      });
      setEditingStudentId(Number(s.id));
    } catch (err) { setNotice(err.message); }
    finally { setBusy(false); }
  };
  const setEditStudentField = (key, value) => setEditStudentForm(old => ({ ...old, [key]: value }));
  const submitStudentEdit = async (e) => {
    e.preventDefault();
    if (!editingStudentId) return;
    setBusy(true); setNotice('');
    try {
      const result = await api(`/students/${editingStudentId}`, { method: 'PUT', body: JSON.stringify(editStudentForm) });
      setStudentProfile(result.data); setEditingStudentId(null);
      setNotice('Student record updated successfully.');
      await Promise.all([loadStudents(query), loadDashboard()]);
    } catch (err) { setNotice(err.message); }
    finally { setBusy(false); }
  };
  const changeStudentStatus = async (student, nextStatus) => {
    if (!nextStatus || nextStatus === student.status) return;
    const label = nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1);
    if (!window.confirm(`Change ${student.first_name} ${student.last_name}'s status to ${label}?`)) return;
    setStatusChangingId(Number(student.id)); setNotice('');
    try {
      const result = await api(`/students/${student.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      if (studentProfile && Number(studentProfile.id) === Number(student.id)) setStudentProfile(result.data);
      setNotice(`Student status updated to ${label}.`);
      await Promise.all([loadStudents(query), loadDashboard()]);
    } catch (err) { setNotice(err.message); }
    finally { setStatusChangingId(null); }
  };
  const closeStudentProfile = () => { setStudentProfile(null); setEditingStudentId(null); };

  const submitQuran = async (e) => {
    e.preventDefault(); setBusy(true); setNotice('');
    try { await api('/quran-progress', { method: 'POST', body: JSON.stringify(quranForm) }); setShowQuranForm(false); setNotice('Quran progress assessment saved.'); await Promise.all([loadQuran(), loadDashboard()]); }
    catch (err) { setNotice(err.message); }
    finally { setBusy(false); }
  };
  const markAttendance = async (studentId, status) => {
    try { await api('/attendance', { method: 'POST', body: JSON.stringify({ student_id: studentId, attendance_date: attendanceDate, status }) }); setNotice('Attendance saved.'); await Promise.all([loadAttendance(), loadDashboard()]); }
    catch (err) { setNotice(err.message); }
  };

  const currentTitle = navItems.find(n => n.id === page)?.label || 'Overview';
  const totalStudents = dashboard?.active_students ?? '—';
  const attendanceLabel = dashboard?.attendance_rate_today == null ? 'Not marked' : `${dashboard.attendance_rate_today}%`;
  const studentsForForm = useMemo(() => students, [students]);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-symbol">۞</div><div><div className="brand-name">MADRASAT NAJIYA</div><div className="brand-sub">STUDENT MANAGEMENT</div></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace"><div className="workspace-avatar">م</div><div><strong>Madrasat Najiya</strong><small>Administration</small></div><span className="chevron">⌄</span></div>
      <nav className="nav-list" aria-label="Main navigation">{navItems.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}><Icon>{item.icon}</Icon><span>{item.label}</span>{item.id === 'students' && <span className="nav-count">{students.length || ''}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon">✦</div><strong>Need a hand?</strong><p>Your digital madrasa workspace, one step at a time.</p><button onClick={() => setNotice('Help guide: register students, record attendance, then add Quran learning assessments.')}>Open quick guide <span>↗</span></button></div><div className="profile"><div className="profile-avatar">AD</div><div className="profile-copy"><strong>Madrasa Admin</strong><small>Administrator</small></div><button className="more-button" aria-label="Profile options">•••</button></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{currentTitle}</strong></div><div className="top-actions"><div className={`connection ${health}`}><span className="connection-dot" />{health === 'connected' ? 'API connected' : health === 'checking' ? 'Connecting…' : 'API offline'}</div><button className="icon-button" title="Refresh data" onClick={() => { loadDashboard(); loadStudents(); loadQuran(); loadAttendance(); }}>⟳</button><div className="top-avatar">AD</div></div></header>
      <div className="page-content">
        {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
        {health === 'offline' && <div className="offline-banner"><strong>Backend not connected.</strong> Start the PHP API and PostgreSQL using the README instructions. Data actions will report errors until the API is running.</div>}

        {page === 'overview' && <>
          <div className="page-heading"><div><div className="eyebrow">AS-SALAMU ALAIKUM <span>✧</span></div><h1>Madrasa overview</h1><p>Here’s what’s happening across your learning community.</p></div><button className="primary-button" onClick={() => { setPage('students'); setShowStudentForm(true); }}><span>＋</span> Register student</button></div>
          <section className="stat-grid">
            <StatCard label="Active students" value={totalStudents} icon="♙" tone="green" foot="Registered learners" />
            <StatCard label="Active classes" value={dashboard?.active_classes ?? '—'} icon="▤" tone="gold" foot="Across all stages" />
            <StatCard label="Today's attendance" value={attendanceLabel} icon="✓" tone="blue" foot={dashboard?.attendance_records_today ? `${dashboard.attendance_records_today} records marked` : 'Record daily attendance'} />
            <StatCard label="Quran assessments" value={dashboard?.quran_assessments_this_week ?? '—'} icon="۞" tone="purple" foot="Recorded this week" />
          </section>
          <div className="overview-grid">
            <section className="panel welcome-panel"><div className="panel-heading"><div><span className="section-kicker">YOUR DIGITAL MADRASA</span><h2>Learning with purpose.</h2></div><span className="ornament">۞</span></div><p>Keep student records organised, support each learner’s Quran journey, and make daily administration simpler.</p><div className="welcome-actions"><button className="primary-button" onClick={() => setPage('students')}>Manage students <span>→</span></button><button className="text-button" onClick={() => setPage('quran')}>View Quran progress</button></div><div className="welcome-watermark">﷽</div></section>
            <section className="panel quick-panel"><div className="panel-heading"><div><span className="section-kicker">QUICK ACTIONS</span><h2>What would you like to do?</h2></div></div><QuickAction icon="♙" title="Add a new student" desc="Create a digital learner profile" onClick={() => { setPage('students'); setShowStudentForm(true); }} /><QuickAction icon="✓" title="Take attendance" desc="Record today's class attendance" onClick={() => setPage('attendance')} /><QuickAction icon="۞" title="Record Quran progress" desc="Log recitation, Hifz or Tajweed" onClick={() => { setPage('quran'); setShowQuranForm(true); }} /></section>
          </div>
          <section className="panel framework-panel"><div className="panel-heading"><div><span className="section-kicker">CURRICULUM FRAMEWORK</span><h2>Learning journey</h2></div><button className="text-button" onClick={() => setPage('curriculum')}>Explore curriculum <span>→</span></button></div><div className="stage-strip">{[['01','Foundation','Ages 4–5','Arabic letters & Qaida'],['02','Primary','Ages 6–8','Recitation & Juz ‘Amma'],['03','Intermediate','Ages 9–14','Quran, Seera & Hadith'],['04','Senior','Ages 15–16','Fiqh, Aqeeda & revision'],['05','Advanced','Ages 17–18','Deeniyyath & Arabic']].map(s => <div className="stage" key={s[0]}><div className="stage-number">{s[0]}</div><strong>{s[1]}</strong><small>{s[2]}</small><p>{s[3]}</p></div>)}</div><div className="framework-note"><span>ⓘ</span> Stage names and age ranges are initial configuration based on your supplied framework. Grades and Quran progression can be adjusted by your madrasa.</div></section>
        </>}

        {page === 'students' && <>
          <div className="page-heading"><div><div className="eyebrow">LEARNER RECORDS</div><h1>Students</h1><p>Manage admissions and keep every learner’s information in one place.</p></div><button className="primary-button" onClick={() => { closeStudentProfile(); setShowStudentForm(v => !v); }}><span>＋</span> Register student</button></div>
          {showStudentForm && <section className="panel form-panel"><div className="panel-heading"><div><span className="section-kicker">NEW ADMISSION</span><h2>Register a student</h2></div><button className="close-button" onClick={() => setShowStudentForm(false)}>×</button></div><form onSubmit={submitStudent} className="form-grid"><Field label="First name" required><input value={studentForm.first_name} onChange={e => setStudentField('first_name', e.target.value)} required maxLength="100" /></Field><Field label="Last name" required><input value={studentForm.last_name} onChange={e => setStudentField('last_name', e.target.value)} required maxLength="100" /></Field><Field label="Gender" required><select value={studentForm.gender} onChange={e => setStudentField('gender', e.target.value)}><option value="not_specified">Prefer not to specify</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></Field><Field label="Date of birth"><input type="date" value={studentForm.date_of_birth} onChange={e => setStudentField('date_of_birth', e.target.value)} max={new Date().toISOString().slice(0, 10)} /></Field><Field label="Parent / guardian name"><input value={studentForm.guardian_name} onChange={e => setStudentField('guardian_name', e.target.value)} maxLength="160" /></Field><Field label="Guardian phone"><input type="tel" value={studentForm.guardian_phone} onChange={e => setStudentField('guardian_phone', e.target.value)} placeholder="e.g. +255…" maxLength="40" /></Field><div className="form-footer"><span className="muted-note">An admission number is generated automatically.</span><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save student'}</button></div></form></section>}

          {studentProfile && <section className="panel student-detail-panel">
            <div className="panel-heading"><div><span className="section-kicker">STUDENT PROFILE</span><h2>{studentProfile.first_name} {studentProfile.last_name}</h2><span className="mono">{studentProfile.admission_no}</span></div><div className="detail-actions"><span className={`status-pill ${studentProfile.status === 'active' ? 'status-active' : 'status-muted'}`}>{studentProfile.status}</span><button className="secondary-button" onClick={() => beginStudentEdit(studentProfile.id)}>Edit record</button><button className="close-button" onClick={closeStudentProfile} aria-label="Close student profile">×</button></div></div>
            {editingStudentId === Number(studentProfile.id) ? <form onSubmit={submitStudentEdit} className="form-grid student-edit-grid">
              <Field label="First name" required><input value={editStudentForm.first_name} onChange={e => setEditStudentField('first_name', e.target.value)} required maxLength="100" /></Field>
              <Field label="Last name" required><input value={editStudentForm.last_name} onChange={e => setEditStudentField('last_name', e.target.value)} required maxLength="100" /></Field>
              <Field label="Gender" required><select value={editStudentForm.gender} onChange={e => setEditStudentField('gender', e.target.value)}><option value="not_specified">Prefer not to specify</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></Field>
              <Field label="Date of birth"><input type="date" value={editStudentForm.date_of_birth} max={new Date().toISOString().slice(0, 10)} onChange={e => setEditStudentField('date_of_birth', e.target.value)} /></Field>
              <Field label="Parent / guardian name"><input value={editStudentForm.guardian_name} maxLength="160" onChange={e => setEditStudentField('guardian_name', e.target.value)} /></Field>
              <Field label="Guardian phone"><input type="tel" value={editStudentForm.guardian_phone} maxLength="40" onChange={e => setEditStudentField('guardian_phone', e.target.value)} /></Field>
              <Field label="Guardian email"><input type="email" value={editStudentForm.guardian_email} maxLength="180" onChange={e => setEditStudentField('guardian_email', e.target.value)} /></Field>
              <Field label="Relationship"><input value={editStudentForm.guardian_relationship} maxLength="60" onChange={e => setEditStudentField('guardian_relationship', e.target.value)} /></Field>
              <Field label="Student notes" wide><textarea rows="3" value={editStudentForm.notes} onChange={e => setEditStudentField('notes', e.target.value)} placeholder="Additional information for authorised staff…" /></Field>
              <div className="form-footer"><span className="muted-note">The admission number cannot be edited.</span><div className="detail-actions"><button type="button" className="secondary-button" onClick={() => setEditingStudentId(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div></div>
            </form> : <>
              <div className="student-profile-grid">
                <div className="profile-fact"><span>Gender</span><strong>{studentProfile.gender === 'not_specified' ? 'Not specified' : studentProfile.gender}</strong></div>
                <div className="profile-fact"><span>Date of birth</span><strong>{studentProfile.date_of_birth || 'Not provided'}</strong></div>
                <div className="profile-fact"><span>Current stage / grade</span><strong>{studentProfile.grade_name || 'Not assigned'}</strong></div>
                <div className="profile-fact"><span>Class</span><strong>{studentProfile.class_name || 'Not assigned'}</strong></div>
                <div className="profile-fact"><span>Academic year</span><strong>{studentProfile.academic_year_name || 'Not specified'}</strong></div>
                <div className="profile-fact"><span>Enrolled on</span><strong>{studentProfile.enrolled_on || 'Not recorded'}</strong></div>
                <div className="profile-fact"><span>Guardian</span><strong>{studentProfile.guardian_name || 'Not provided'}</strong></div>
                <div className="profile-fact"><span>Guardian relationship</span><strong>{studentProfile.guardian_relationship || '—'}</strong></div>
                <div className="profile-fact"><span>Guardian phone</span><strong>{studentProfile.guardian_phone || '—'}</strong></div>
                <div className="profile-fact"><span>Guardian email</span><strong>{studentProfile.guardian_email || '—'}</strong></div>
                <div className="profile-fact profile-fact-wide"><span>Notes</span><strong>{studentProfile.notes || 'No notes recorded.'}</strong></div>
              </div>
              <div className="profile-history-grid">
                <div><h3>Attendance summary</h3><div className="summary-pills">{['total','present','absent','late','excused'].map(k => <span key={k} className="summary-pill"><strong>{studentProfile.attendance_summary?.[k] ?? 0}</strong> {k}</span>)}</div></div>
                <div><h3>Recent Quran progress</h3>{studentProfile.recent_quran_progress?.length ? <div className="profile-quran-list">{studentProfile.recent_quran_progress.map(r => <div className="profile-quran-row" key={r.id}><div><strong>{r.surah_name || r.assessment_type}</strong><small>{r.assessment_date} · {r.assessment_type}{r.verse_from ? ` · verses ${r.verse_from}–${r.verse_to || '?'}` : ''}</small></div><span className="status-pill status-muted">{r.outcome}</span></div>)}</div> : <p className="muted-note">No Quran assessments recorded yet.</p>}</div>
              </div>
            </>}
          </section>}

          <section className="panel table-panel"><div className="table-toolbar"><div><h2>Student directory</h2><span className="table-subtitle">{students.length} record{students.length === 1 ? '' : 's'} loaded</span></div><div className="search-box"><span>⌕</span><input placeholder="Search name or admission no." value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></div></div><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>ADMISSION NO.</th><th>STAGE / CLASS</th><th>GUARDIAN</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{students.map(s => <tr key={s.id}><td><div className="student-cell"><div className="student-avatar">{`${s.first_name?.[0] || ''}${s.last_name?.[0] || ''}`.toUpperCase()}</div><div><strong>{s.first_name} {s.last_name}</strong><small>{s.gender === 'not_specified' ? 'Not specified' : s.gender || '—'}</small></div></div></td><td><span className="mono">{s.admission_no}</span></td><td>{s.grade_name || 'Not assigned'}{s.class_name && <small className="cell-sub">{s.class_name}</small>}</td><td>{s.guardian_name || '—'}<small className="cell-sub">{s.guardian_phone || ''}</small></td><td><span className={`status-pill ${s.status === 'active' ? 'status-active' : 'status-muted'}`}>{s.status}</span></td><td><div className="student-row-actions"><button className="row-action" onClick={() => openStudentProfile(s.id)} disabled={busy}>View</button><button className="row-action" onClick={() => beginStudentEdit(s.id)} disabled={busy}>Edit</button><select aria-label={`Change status for ${s.first_name} ${s.last_name}`} value={s.status} disabled={statusChangingId === Number(s.id)} onChange={e => changeStudentStatus(s, e.target.value)}>{['active','inactive','graduated','transferred','withdrawn'].map(status => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}</select></div></td></tr>)}</tbody></table>{students.length === 0 && <EmptyState title="No students found" detail={query ? 'Try another search term or register a new student.' : 'Start by registering your first learner. Student records will appear here.'} />}</div></section>
        </>}

        {page === 'attendance' && <><div className="page-heading"><div><div className="eyebrow">DAILY CLASS REGISTER</div><h1>Attendance</h1><p>Record attendance digitally and reduce paper registers.</p></div><label className="date-control">Attendance date<input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} /></label></div><section className="panel table-panel"><div className="table-toolbar"><div><h2>Daily attendance</h2><span className="table-subtitle">Select a status for each learner; changes save to the database.</span></div><button className="secondary-button" onClick={() => { loadStudents(); loadAttendance(); }}>Refresh records ↻</button></div><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>ADMISSION NO.</th><th>RECORDED STATUS</th><th>MARK ATTENDANCE</th></tr></thead><tbody>{students.map(s => { const record = attendanceRows.find(a => Number(a.student_id) === Number(s.id)); return <tr key={s.id}><td><div className="student-cell"><div className="student-avatar">{`${s.first_name?.[0] || ''}${s.last_name?.[0] || ''}`.toUpperCase()}</div><strong>{s.first_name} {s.last_name}</strong></div></td><td><span className="mono">{s.admission_no}</span></td><td>{record ? <span className={`status-pill status-${record.status}`}>{record.status}</span> : <span className="muted-inline">Not marked</span>}</td><td><div className="attendance-buttons">{['present','late','absent','excused'].map(status => <button key={status} className={`attendance-choice ${record?.status === status ? 'selected' : ''} ${status}`} onClick={() => markAttendance(s.id, status)}>{status}</button>)}</div></td></tr>; })}</tbody></table>{students.length === 0 && <EmptyState title="No learners to mark" detail="Register students first, then return here to take attendance." />}</div></section></>}

        {page === 'quran' && <><div className="page-heading"><div><div className="eyebrow">QIRA'AT · HIFZ · TAJWEED</div><h1>Quran progress</h1><p>Keep a teacher-led record of recitation, memorisation and revision.</p></div><button className="primary-button" onClick={() => { setShowQuranForm(v => !v); if (students.length && !quranForm.student_id) setQuranField('student_id', String(students[0].id)); }}><span>＋</span> New assessment</button></div>{showQuranForm && <section className="panel form-panel"><div className="panel-heading"><div><span className="section-kicker">TEACHER ASSESSMENT</span><h2>Record Quran progress</h2></div><button className="close-button" onClick={() => setShowQuranForm(false)}>×</button></div>{students.length === 0 ? <EmptyState title="Register a student first" detail="A Quran progress record must be linked to a student." /> : <form onSubmit={submitQuran} className="form-grid"><Field label="Student" required><select value={quranForm.student_id} onChange={e => setQuranField('student_id', e.target.value)} required><option value="">Select a student</option>{studentsForForm.map(s => <option key={s.id} value={s.id}>{s.admission_no} — {s.first_name} {s.last_name}</option>)}</select></Field><Field label="Assessment type" required><select value={quranForm.assessment_type} onChange={e => setQuranField('assessment_type', e.target.value)}><option value="recitation">Recitation</option><option value="hifz">Hifz / memorisation</option><option value="revision">Revision</option><option value="tajweed">Tajweed</option></select></Field><Field label="Surah / unit"><input value={quranForm.surah_name} onChange={e => setQuranField('surah_name', e.target.value)} placeholder="e.g. Al-Fatihah" /></Field><Field label="Verse from"><input type="number" min="1" value={quranForm.verse_from} onChange={e => setQuranField('verse_from', e.target.value)} /></Field><Field label="Verse to"><input type="number" min="1" value={quranForm.verse_to} onChange={e => setQuranField('verse_to', e.target.value)} /></Field><Field label="Outcome"><select value={quranForm.outcome} onChange={e => setQuranField('outcome', e.target.value)}><option>In progress</option><option>Needs revision</option><option>Ready for review</option><option>Teacher approved</option></select></Field>{[['accuracy_score','Accuracy'],['tajweed_score','Tajweed'],['fluency_score','Fluency']].map(([key,label]) => <Field label={`${label} (1–5)`} key={key}><div className="score-control">{[1,2,3,4,5].map(n => <button type="button" key={n} className={Number(quranForm[key]) === n ? 'score-active' : ''} onClick={() => setQuranField(key,n)}>{n}</button>)}</div></Field>)}<Field label="Teacher notes" wide><textarea rows="3" value={quranForm.teacher_notes} onChange={e => setQuranField('teacher_notes', e.target.value)} placeholder="Revision advice, strengths or next learning goal…" /></Field><div className="form-footer"><span className="muted-note">Scores are teacher-entered; the system does not judge Quranic correctness.</span><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save assessment'}</button></div></form>}</section>}<section className="panel table-panel"><div className="table-toolbar"><div><h2>Recent assessments</h2><span className="table-subtitle">Most recent teacher-recorded Quran learning observations</span></div><button className="secondary-button" onClick={loadQuran}>Refresh ↻</button></div><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>DATE</th><th>TYPE / SURAH</th><th>ACCURACY</th><th>TAJWEED</th><th>FLUENCY</th><th>OUTCOME</th></tr></thead><tbody>{quranRows.map(r => <tr key={r.id}><td><strong>{r.first_name} {r.last_name}</strong><small className="cell-sub">{r.admission_no}</small></td><td>{r.assessment_date}</td><td><strong className="capitalize">{r.assessment_type}</strong><small className="cell-sub">{r.surah_name || 'No surah specified'}{r.verse_from ? ` · ${r.verse_from}–${r.verse_to || '?'}` : ''}</small></td><td>{r.accuracy_score}/5</td><td>{r.tajweed_score}/5</td><td>{r.fluency_score}/5</td><td><span className="status-pill status-muted">{r.outcome}</span></td></tr>)}</tbody></table>{quranRows.length === 0 && <EmptyState title="No Quran assessments yet" detail="Record a teacher assessment to start building each learner’s progress history." />}</div></section></>}

        {page === 'curriculum' && <><div className="page-heading"><div><div className="eyebrow">TEACHING & LEARNING</div><h1>Curriculum framework</h1><p>Initial stages and core subjects based on your Quranic Madrasa framework.</p></div></div><section className="stage-cards">{[['Foundation / Early Childhood','Ages 4–5','Arabic alphabet, joining letters, Qaida and basic Duas.'],['Primary Cycle','Grades 1–3 · Ages 6–8','Quranic recitation, introductory Tajweed, Juz ‘Amma and Pillars of Islam.'],['Intermediate Cycle','Grades 4–9 · Ages 9–14','Quran progression, Seera, practical Salah laws and Hadith memorisation.'],['Senior Certificate','Grades 10–11 · Ages 15–16','Advanced Fiqh, Aqeeda, Surah Yasin/Mulk/Rahman mastery and exam preparation.'],['Advanced Stream','Grades 12–13 · Ages 17–18','Deeniyyath, Islamic philosophy, advanced Arabic literature and comparative jurisprudence.']].map((s,i)=><div className="stage-detail panel" key={s[0]}><div className="stage-number">0{i+1}</div><div><div className="stage-age">{s[1]}</div><h2>{s[0]}</h2><p>{s[2]}</p></div><span className="stage-arrow">↗</span></div>)}</section><div className="framework-note"><span>ⓘ</span> This is the supplied framework presented for configuration. Quran sequence, grade mapping and local teaching requirements should be confirmed by madrasa leadership before production use.</div><section className="panel subject-panel"><div className="panel-heading"><div><span className="section-kicker">CORE INSTRUCTION AREAS</span><h2>Subject areas</h2></div></div><div className="subject-grid">{[['۞','Qira’at & Hifz','Recitation, memorisation and revision'],['◉','Tajweed','Rules and practice of recitation'],['✧','Aqeeda','Islamic beliefs and foundations'],['▤','Fiqh','Practical Islamic jurisprudence'],['♡','Akhlaq & Tarbiyah','Character and personal development'],['◷','Seera & Tarikh','Prophetic biography and Islamic history']].map(s=><div className="subject-card" key={s[1]}><div className="subject-icon">{s[0]}</div><div><strong>{s[1]}</strong><p>{s[2]}</p></div></div>)}</div></section></>}

        {page === 'reports' && <><div className="page-heading"><div><div className="eyebrow">INSIGHTS & OVERSIGHT</div><h1>Reports</h1><p>Reporting centre for administration and learning outcomes.</p></div></div><div className="report-grid">{[['Student directory','Student admissions and active status','♙','students'],['Daily attendance','Daily records by learner and date','✓','attendance'],['Quran learning history','Teacher-recorded progress and feedback','۞','quran'],['Curriculum coverage','Stage and subject framework','▤','curriculum']].map(r=><button className="report-card panel" key={r[0]} onClick={() => setPage(r[3])}><div className="report-icon">{r[2]}</div><h2>{r[0]}</h2><p>{r[1]}</p><span>Open section →</span></button>)}</div><div className="offline-banner report-note"><strong>Next build phase:</strong> downloadable PDF report cards, class-level summaries, term assessments, promotion records and finance reporting will be added after the core workflow is tested.</div></>}
        <footer className="app-footer"><span>MADRASAT NAJIYA <span className="footer-dot">•</span> Initial development build</span><span>Made for a connected learning community <span className="footer-heart">✦</span></span></footer>
      </div>
    </main>
  </div>;
}

function StatCard({ label, value, icon, tone, foot }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon>{icon}</Icon></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></div>; }
function QuickAction({ icon, title, desc, onClick }) { return <button className="quick-action" onClick={onClick}><span className="quick-icon"><Icon>{icon}</Icon></span><span className="quick-copy"><strong>{title}</strong><small>{desc}</small></span><span className="quick-arrow">↗</span></button>; }
function Field({ label, required, wide, children }) { return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}{required && <b> *</b>}</span>{children}</label>; }
