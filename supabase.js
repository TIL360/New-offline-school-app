const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://vxdqfngvmrrupfooywwk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dvggOmxQl7wmhpIrkzbrLw_9Zp-Dm57';
const SCHOOL_CODE = 'TECHINFO_2026';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function wipeAndInsert(table, rows, onConflict) {
  console.log(`\n--- WIPING ${table} for ${SCHOOL_CODE} ---`);
  const { error: delErr, data: delData } = await supabase.from(table).delete().eq('school_code', SCHOOL_CODE).select();
  if (delErr) { console.log(`❌ DELETE FAILED ${table}:`, delErr.message); return false; }
  console.log(`🗑️ ${table}: DELETED ${delData? delData.length : 0} rows`);
  if (!rows || rows.length === 0) return true;
  const payload = rows.map(r => ({...r, school_code: SCHOOL_CODE }));
  const { error: insErr } = await supabase.from(table).upsert(payload, { onConflict }).select();
  if (insErr) { console.log(`❌ INSERT FAILED ${table}:`, insErr.message); return false; }
  console.log(`✅ ${table}: Inserted ${payload.length} rows`);
  return true;
}

async function smartWipeAndInsertMarks(rows, exam_id, className) {
  if (!exam_id ||!className || exam_id === 'undefined') {
    console.log("No exam/class provided - pushing all marks");
    const payload = rows.map(r => ({...r, school_code: SCHOOL_CODE }));
    const { error } = await supabase.from('student_subject_marks').upsert(payload, { onConflict: 'school_code,result_id,subject_code' });
    if(error) return false;
    return payload.length;
  }
  console.log(`\n--- SMART WIPING marks for exam=${exam_id} class=${className} ---`);
  const { error: delErr, data: delData } = await supabase.from('student_subject_marks').delete().eq('school_code', SCHOOL_CODE).eq('exam_id', parseInt(exam_id)).eq('class', className).select();
  if (delErr) { console.log(`❌ DELETE FAILED marks:`, delErr.message); return false; }
  console.log(`🗑️ marks: DELETED ${delData? delData.length : 0} rows`);
  if (!rows || rows.length === 0) return true;
  const payload = rows.map(r => ({...r, school_code: SCHOOL_CODE }));
  const { error: insErr } = await supabase.from('student_subject_marks').upsert(payload, { onConflict: 'school_code,result_id,subject_code' }).select();
  if (insErr) { console.log(`❌ INSERT FAILED marks:`, insErr.message); return false; }
  console.log(`✅ marks: Inserted ${payload.length} rows`);
  return payload.length;
}

async function pushSubjectsOnline(db) {
  const rows = db.prepare("SELECT subject_code, subject_display_name FROM academy_subjects").all();
  return await wipeAndInsert('academy_subjects', rows, 'school_code,subject_code');
}
async function pushExamsOnline(db) {
  const rows = db.prepare("SELECT exam_id, exam_name FROM exams").all();
  return await wipeAndInsert('exams', rows, 'school_code,exam_id');
}
async function pushExamSettingsOnline(db) {
  const rows = db.prepare("SELECT exam_id, class, subject_code, total_marks FROM exam_subject_settings").all();
  return await wipeAndInsert('exam_subject_settings', rows, 'school_code,exam_id,class,subject_code');
}
async function pushExamStudentsOnline(db) {
  const offline = db.prepare("SELECT id, registration_no, roll_no, student_name, father_name, current_class FROM students").all();
  return await wipeAndInsert('students', offline, 'school_code,id');
}
async function pushStaffOnline(db) {
  try {
    // Check which table exists
    let tableName = 'staff';
    let hasStaff = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='staff'").get();
    let hasStaffTbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='staff_tbl'").get();
    
    if(hasStaffTbl) tableName = 'staff_tbl';
    else if(!hasStaff) { console.log("No staff table found, skipping"); return true; }

    console.log(`Using local table: ${tableName}`);

    const rows = db.prepare(`SELECT id, name, cnic, contact, designation, doj, salary, allowance, status, documents_held, photo FROM ${tableName}`).all();
    console.log(`OFFLINE staff count: ${rows.length}`);

    const cleaned = rows.map(r => ({
      id: r.id,
      name: r.name,
      cnic: r.cnic,
      contact: r.contact,
      designation: r.designation,
      doj: r.doj,
      salary: r.salary,
      allowance: r.allowance,
      status: r.status,
      documents_held: r.documents_held,
      photo: r.photo && r.photo.length > 100000 ? '' : r.photo // avoid big base64
    }));

    return await wipeAndInsert('staff', cleaned, 'school_code,id');
  } catch(e){ 
    console.log("pushStaffOnline error", e.message); 
    return false; 
  }
}
async function pushOfflineUsersToCloud(db) {
  const offline = db.prepare("SELECT username, password, usertype, permissions, assigned_class FROM users").all();
  console.log(`OFFLINE users: ${offline.length}`);
  const lowerToExact = {};
  const offlineLower = [];
  offline.forEach(r=>{ const low = String(r.username).trim().toLowerCase(); lowerToExact[low]=String(r.username).trim(); offlineLower.push(low); });
  const { data: onlineUsers } = await supabase.from('users').select('username').eq('school_code', SCHOOL_CODE);
  const online = onlineUsers || [];
  const toDelete = [];
  online.forEach(o=>{ const low = String(o.username).trim().toLowerCase(); const exactWanted = lowerToExact[low]; if(!offlineLower.includes(low)){ toDelete.push(o.username); } else if(exactWanted && o.username!== exactWanted){ toDelete.push(o.username); } });
  if(toDelete.length>0){ console.log(`🗑️ Deleting:`, toDelete); await supabase.from('users').delete().eq('school_code', SCHOOL_CODE).in('username', toDelete); }
  if(offline.length>0){
    const payload = offline.map(r => ({ username: String(r.username).trim(), password: r.password, usertype: r.usertype || 'User', permissions: r.permissions || '[]', assigned_class: r.assigned_class? String(r.assigned_class).trim() : null, school_code: SCHOOL_CODE }));
    const { error } = await supabase.from('users').upsert(payload, { onConflict: 'school_code,username' });
    if(error) console.log("Upsert failed:", error.message);
  }
  return true;
}
async function pushDynamicResultsOnline(db, exam_id, className) {
  let offline = [];
  if (exam_id && className) {
    offline = db.prepare("SELECT result_id, exam_id, student_id, class, subject_code, marks_set, marks_obtained FROM student_subject_marks WHERE exam_id=? AND class=?").all(exam_id, className);
  } else {
    offline = db.prepare("SELECT result_id, exam_id, student_id, class, subject_code, marks_set, marks_obtained FROM student_subject_marks").all();
  }
  console.log(`OFFLINE marks count: ${offline.length}`);
  return await smartWipeAndInsertMarks(offline, exam_id, className);
}
async function pushResultTableOnline() { return true; }

async function pullTeacherMarksOnline(db, exam_id, className) {
  console.log(`\n--- PULLING marks for exam=${exam_id} class=${className} ---`);
  if(!exam_id ||!className) return { success:false, error: "Select Exam and Class first" };
  let realExamId = parseInt(exam_id);
  if(isNaN(realExamId)){
    const f2 = db.prepare("SELECT exam_id FROM exams WHERE exam_name=?").get(exam_id);
    realExamId = f2? f2.exam_id : null;
  }
  if(!realExamId) return { success:false, error: `Exam id not found for ${exam_id}` };
  const { data, error } = await supabase.from('student_subject_marks').select('*').eq('school_code', SCHOOL_CODE).eq('exam_id', realExamId).eq('class', className);
  if(error) return { success:false, error: error.message };
  if(!data.length) return { success:true, count:0 };
  const stmt = db.prepare(`INSERT INTO student_subject_marks (result_id, exam_id, student_id, class, subject_code, marks_set, marks_obtained) VALUES (?,?,?,?,?,?,?) ON CONFLICT(result_id, subject_code) DO UPDATE SET marks_obtained=excluded.marks_obtained, marks_set=excluded.marks_set`);
  const trans = db.transaction((rows)=>{
    for(const r of rows){
      let finalMarks = (r.marks_obtained_online!== null && r.marks_obtained_online!== undefined)? r.marks_obtained_online : r.marks_obtained;
      stmt.run(r.result_id, r.exam_id, r.student_id, r.class, r.subject_code, r.marks_set, finalMarks);
    }
  });
  trans(data);
  return { success:true, count: data.length };
}

module.exports = {
  supabase, SCHOOL_CODE,
  pushSubjectsOnline, pushExamsOnline, pushExamSettingsOnline,
  pushExamStudentsOnline, pushOfflineUsersToCloud,
  pushDynamicResultsOnline, pushResultTableOnline,
  pushStaffOnline, wipeAndInsert, pullTeacherMarksOnline
};