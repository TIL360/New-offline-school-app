const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');
const { error } = require('console');


const userDataPath = app.getPath('userData');
//this line would create db insie appdata
const dbPath = path.join(userDataPath, 'school.db');

// this would create db file inside the root area of the app
// const dbPath = path.join(__dirname, 'school.db');

if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}

const db = new Database(dbPath, { verbose: console.log });

// --- INITIALIZATION ---
const initializeDB = () => {
    try {
        // 1. Users
    db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  username TEXT UNIQUE, 
  password TEXT, 
  usertype TEXT CHECK(usertype IN ('Admin', 'User')) DEFAULT 'User',
  permissions TEXT DEFAULT '[]' -- Stores feature classes as a JSON string
)`);
        
        // 2. Classes
        db.exec(`CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY AUTOINCREMENT, class_name TEXT UNIQUE)`);
        
        // 3. Students
 db.exec(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    registration_no TEXT UNIQUE, 
    roll_no TEXT, 
    student_name TEXT, 
    student_name_urdu TEXT, -- Matches "Name in Urdu"
    father_name TEXT, 
    father_name_urdu TEXT,  -- Added: Father Name in Urdu
    dob DATE,               -- Matches "DoB in Figures"
    dob_in_words TEXT,      -- Added: Date of Birth in Words
    cnic_bform TEXT, 
    picture_path TEXT, 
    mobile TEXT, 
    whatsapp TEXT, 
    address TEXT, 
    monthly_fee REAL, 
    dues_paid_up_to TEXT,   -- Added: Dues Paid Up to
    character_remarks TEXT, 
    remarks TEXT,           -- Added: Remarks
    admission_class TEXT, 
    current_class TEXT, 
    leaving_class TEXT,     -- Added: To support "Class at the time of leaving" from your image
    promoted_to_class TEXT, -- Added: Promoted to Class
    section TEXT, 
    admission_date DATE, 
    leaving_date DATE,      -- Added: Date of Leaving
    status TEXT DEFAULT 'active',
    certificate_serial TEXT,-- Added: Certificate Serial
    cert_issuance_date DATE,-- Added: Certificate Issuance Date
    attendance TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS student_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    class_id INTEGER,
    date TEXT,
    status TEXT CHECK(status IN ('Present', 'Absent', 'Leave')),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
    UNIQUE(student_id, date)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS school_timetable (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL,
        day_name TEXT NOT NULL,       -- Monday, Tuesday, etc.
        period_name TEXT NOT NULL,    -- Period 1, Period 2, etc.
        subject_name TEXT,            -- Dynamic matching string
        start_time TEXT,              -- e.g., '08:00 AM'
        end_time TEXT,                -- e.g., '08:45 AM'
        UNIQUE(class_id, day_name, period_name) ON CONFLICT REPLACE
    )`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_class ON student_attendance(class_id)`);

// Staff Attendance Table
db.exec(`CREATE TABLE IF NOT EXISTS grading_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade_name TEXT NOT NULL,         -- e.g., 'A+', 'A', 'B', 'F'
    min_percentage REAL NOT NULL,     -- e.g., 90.0
    max_percentage REAL NOT NULL,     -- e.g., 100.0
    remarks TEXT                      -- e.g., 'Excellent'
)`);
db.exec(`CREATE TABLE IF NOT EXISTS academy_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_code TEXT UNIQUE NOT NULL, -- e.g., 'urdu', 'eng', 'pak_studies'
    subject_display_name TEXT NOT NULL  -- e.g., 'Urdu', 'English', 'Pak Studies'
)`);
// --- DYNAMIC SUBJECT SYSTEM ---

// 1. Stores total marks per exam + class + subject (your Step 3)
db.exec(`
CREATE TABLE IF NOT EXISTS exam_subject_settings (
    exam_id INTEGER,
    class TEXT,
    subject_code TEXT,
    total_marks REAL DEFAULT 0,
    PRIMARY KEY (exam_id, class, subject_code)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS staff_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER,
    date TEXT, -- Format: YYYY-MM-DD
    status TEXT CHECK(status IN ('Present', 'Absent', 'Leave')),
    FOREIGN KEY (staff_id) REFERENCES staff_tbl(id) ON DELETE CASCADE,
    UNIQUE(staff_id, date)
)`);
// 2. Stores obtained marks per student per subject
db.exec(`
CREATE TABLE IF NOT EXISTS student_subject_marks (
    result_id INTEGER,
    exam_id INTEGER,
    student_id INTEGER,
    class TEXT,
    subject_code TEXT,
    marks_set REAL DEFAULT 100,
    marks_obtained REAL DEFAULT 0,
    PRIMARY KEY(result_id, subject_code)
)`);

// Migration for old database - add columns if they don't exist
try { db.exec("ALTER TABLE student_subject_marks ADD COLUMN exam_id INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE student_subject_marks ADD COLUMN student_id INTEGER"); } catch(e){}
try { db.exec("ALTER TABLE student_subject_marks ADD COLUMN class TEXT"); } catch(e){}
try { db.exec("ALTER TABLE student_subject_marks ADD COLUMN marks_set REAL DEFAULT 100"); } catch(e){}
try { db.exec("ALTER TABLE student_subject_marks ADD COLUMN marks_obtained REAL DEFAULT 0"); } catch(e){}
// Clean old wrong columns if you created them
try { db.exec("ALTER TABLE student_subject_marks ADD COLUMN setmarks REAL DEFAULT 0"); } catch(e){}
try { db.exec("ALTER TABLE student_subject_marks ADD COLUMN obt REAL DEFAULT 0"); } catch(e){}
db.exec(`CREATE TABLE IF NOT EXISTS exam_passing_criteria (
    exam_id INTEGER PRIMARY KEY,
    subject_pass_percentage REAL DEFAULT 40.0, -- Default subject pass line
    overall_pass_percentage REAL DEFAULT 33.0, -- Default grand total pass line
    max_failed_subjects_allowed INTEGER DEFAULT 1, -- Threshold before getting 'Detained'
    FOREIGN KEY(exam_id) REFERENCES exams(exam_id) ON DELETE CASCADE
)`);


db.exec(`
CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    cnic TEXT,
    contact TEXT,
    designation TEXT,
    doj TEXT,
    salary REAL,
    allowance REAL,
    status TEXT,
    documents_held TEXT,
    photo TEXT
)`);

// For old data - add column if not exists
try { db.exec("ALTER TABLE staff ADD COLUMN photo TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE staff ADD COLUMN documents_held TEXT"); } catch(e) {}
// 1. Run this at the top of database.js setup to ensure the table exists
// Ensure the new exam configuration settings table exists
// Find this block in Database.js and update it:
db.exec(`
  CREATE TABLE IF NOT EXISTS exam_papers (
    exam_type TEXT,
    paper_name TEXT,
    class_id INTEGER,
    total_marks REAL,
    passing_marks REAL,
    exam_date TEXT DEFAULT '', /* 🌟 NEW COLUMN ADDED HERE */
    note_objective TEXT,
    note_subjective TEXT,
    obj_marks REAL,
    subj_marks REAL,
    PRIMARY KEY (exam_type, paper_name, class_id)
  );
`);


//q bank
db.exec(`CREATE TABLE IF NOT EXISTS question_bank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER,
  subject TEXT,
  lesson_no INTEGER,
  question_type TEXT,
  question_text TEXT,
  diagram_path TEXT, -- 🆕 NEW COLUMN ADDED HERE FOR DIAGRAMS
  opt1 TEXT, opt2 TEXT, opt3 TEXT, opt4 TEXT,
  correct_answer TEXT,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
)`);

// Single Table for All Exam Papers
db.exec(`CREATE TABLE IF NOT EXISTS paper_questions (
id INTEGER PRIMARY KEY AUTOINCREMENT,
exam_type TEXT, -- New Column: e.g., 'Midterm', 'Final Exam', 'Monthly Test'
paper_name TEXT, -- e.g., 'English', 'Maths', 'Urdu'
class_id INTEGER,
question_id INTEGER,
marks_assigned REAL DEFAULT 1,
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE CASCADE
)`);

        // 4. Fee Table
        db.exec(`CREATE TABLE IF NOT EXISTS fee_tbl (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    student_id INTEGER, 
    registration_no TEXT, 
    current_class TEXT, 
    section TEXT,
    monthly_fee REAL DEFAULT 0, 
    adm_fee REAL DEFAULT 0, 
    exam_fee REAL DEFAULT 0, 
    lab_fee REAL DEFAULT 0, 
    reg_fee REAL DEFAULT 0,
    annual_fund REAL DEFAULT 0,
    stationary_fund REAL DEFAULT 0,
    bus_charges REAL DEFAULT 0,
    security REAL DEFAULT 0, 
    misc_fee REAL DEFAULT 0,
    misc_remarks TEXT,
    collection_date TEXT,
    total_fee REAL GENERATED ALWAYS AS (
        monthly_fee + adm_fee + exam_fee + lab_fee + reg_fee + annual_fund + stationary_fund + bus_charges + security + misc_fee
    ) VIRTUAL,
    collection REAL DEFAULT 0,
    balance REAL GENERATED ALWAYS AS (total_fee - collection) VIRTUAL,
    arrears REAL DEFAULT 0,
    invoice_month TEXT, 
    invoice_year TEXT, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(registration_no, invoice_month, invoice_year) 
)`);

        // 5. Exams & Results (Fixed better-sqlite3 implementation)
       db.exec(`CREATE TABLE IF NOT EXISTS exams (
    exam_id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_name TEXT UNIQUE,
    exp_amount REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    exp_month TEXT,
    exp_year TEXT
)`);

//expense table
  db.exec(`CREATE TABLE IF NOT EXISTS exp_tbl (
        exp_id INTEGER PRIMARY KEY AUTOINCREMENT,
        expence TEXT,
        exp_amount REAL,
        exp_year INTEGER,
        exp_month TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
// Add this to your initializeDB function in database.js
// Inside initializeDB function in database.js
db.exec(`CREATE TABLE IF NOT EXISTS datesheet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT,
    exam_date DATE,
    exam_year TEXT,
    exam_id INTEGER,
    class_id INTEGER,
    sec TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (exam_id) REFERENCES exams(exam_id) ON DELETE CASCADE
)`);


// FIND your table creation string for the "result" table and update it to include the new columns:
db.prepare(`
  CREATE TABLE IF NOT EXISTS result (
    result_id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER,
    student_id INTEGER,
    class TEXT,
    

    total_setmarks INTEGER DEFAULT 2200,
    total_obt REAL DEFAULT 0,
    percentage REAL DEFAULT 0,
    grade TEXT,
    position INTEGER,
    result_status TEXT,
    remarks TEXT
  )
`).run();

        // Views
        db.exec(`CREATE VIEW IF NOT EXISTS student_arrears AS SELECT registration_no, SUM(balance) AS total_arrears FROM fee_tbl GROUP BY registration_no`);
        db.exec(`CREATE VIEW IF NOT EXISTS fee_report AS SELECT f.*, (SELECT SUM(balance) FROM fee_tbl WHERE registration_no = f.registration_no AND id < f.id) AS previous_arrears, (f.balance + COALESCE((SELECT SUM(balance) FROM fee_tbl WHERE registration_no = f.registration_no AND id < f.id), 0)) AS net_payable FROM fee_tbl f`);

        // Staff & Salary
        // 1. Staff Table: Added auth_leaves to store the allowed limit per staff member
db.exec(`CREATE TABLE IF NOT EXISTS staff_tbl (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  name TEXT, 
  cnic TEXT, 
  contact TEXT, 
  designation TEXT, 
  doj TEXT, 
  salary REAL, 
  auth_leaves REAL DEFAULT 0, 
  allowance REAL, 
  status TEXT DEFAULT 'Active',
  documents_held TEXT
)`);

// 2. Salary Table: Added auth_leaves (the limit) and availed_leaves (actual taken)
// Note: 'leaves' column is renamed/replaced by these for clarity
db.exec(`CREATE TABLE IF NOT EXISTS salary_tbl (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  staff_id INTEGER, 
  name TEXT, 
  salary REAL, 
  allowance REAL, 
  auth_leaves REAL DEFAULT 0, 
  availed_leaves REAL DEFAULT 0, 
  salary_deduction REAL DEFAULT 0,
  deduction_remarks TEXT,
  award REAL DEFAULT 0,
  award_remarks TEXT,
  fund_cutting REAL DEFAULT 0,
  security_cutting REAL DEFAULT 0,
  salary_month TEXT, 
  salary_year TEXT, 
  status TEXT DEFAULT 'Unpaid', 
  UNIQUE(staff_id, salary_month, salary_year)
)`);

// Execute this block inside your database configuration initialization
db.exec(`
    CREATE TABLE IF NOT EXISTS worksheet_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        activity_type TEXT NOT NULL,
        question_text TEXT NOT NULL,
        answer_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

   
`);
// 1. Initialize the selection table
db.exec(`
    CREATE TABLE IF NOT EXISTS worksheet_selected_paper (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER NOT NULL,
        exam_name TEXT NOT NULL,
        class_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        FOREIGN KEY (question_id) REFERENCES worksheet_questions(id) ON DELETE CASCADE
    );
`);

        // Default Admin
        const userCount = db.prepare('SELECT count(*) as count FROM users').get();
        if (userCount.count === 0) {
            db.prepare('INSERT INTO users (username, password, usertype) VALUES (?, ?, ?)').run('Admin', 'admin123', 'Admin');
        }

            // --- AUTO ADD NEW SUBJECT COLUMNS DYNAMICALLY ---
        const ensureResultColumns = () => {
            try {
                const existingCols = db.prepare("PRAGMA table_info(result)").all().map(c => c.name);
                const subjects = db.prepare("SELECT subject_code FROM academy_subjects").all();
                subjects.forEach(sub => {
                    const code = String(sub.subject_code).toLowerCase().trim();
                    const setCol = `${code}_setmarks`;
                    const obtCol = `${code}_obt`;
                    if (!existingCols.includes(setCol)) {
                        db.exec(`ALTER TABLE result ADD COLUMN ${setCol} INTEGER DEFAULT 0`);
                        console.log(`Added column: ${setCol}`);
                    }
                    if (!existingCols.includes(obtCol)) {
                        db.exec(`ALTER TABLE result ADD COLUMN ${obtCol} REAL DEFAULT 0`);
                        console.log(`Added column: ${obtCol}`);
                    }
                });
            } catch(e){ console.log("Dynamic column check:", e.message); }
        };
        ensureResultColumns();

    } catch (err) { console.error("DB Init Error:", err); }
};

// ALSO RUN IT ON APP START AFTER init
initializeDB();
try {
    // Re-run to catch subjects added later
    const cols = db.prepare("PRAGMA table_info(result)").all().map(c=>c.name);
    const subs = db.prepare("SELECT subject_code FROM academy_subjects").all();
    subs.forEach(sub=>{
        const code = String(sub.subject_code).toLowerCase().trim();
        if(!cols.includes(`${code}_setmarks`)){
            db.exec(`ALTER TABLE result ADD COLUMN ${code}_setmarks INTEGER DEFAULT 0`);
            db.exec(`ALTER TABLE result ADD COLUMN ${code}_obt REAL DEFAULT 0`);
        }
    });
} catch(e){};

initializeDB();


// --- EXAM & RESULT FUNCTIONS ---
// In database.js
// database.js


// --- EXISTING FUNCTIONS ---
function checkUser(username, password) { return db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password); }
function addUser(userData) { 
  return db.prepare(`INSERT INTO users (username, password, usertype, permissions) 
                    VALUES (?, ?, ?, ?)`).run(
                      userData.username, 
                      userData.password, 
                      userData.usertype,
                      userData.permissions // Expecting stringified JSON array
                    ); 
}
function getAllUsers() { return db.prepare('SELECT id, username, usertype, permissions FROM users').all(); }

const addClass = (name) => db.prepare('INSERT INTO classes (class_name) VALUES (?)').run(name);
const getClasses = () => db.prepare('SELECT * FROM classes ORDER BY id ASC').all();
const deleteClass = (id) => db.prepare('DELETE FROM classes WHERE id = ?').run(id);
const updateClass = (id, name) => db.prepare('UPDATE classes SET class_name = ? WHERE id = ?').run(name, id);

// --- Updated addStudent ---
// Inside database.js

const addStudent = (s) => {
    const sql = `INSERT INTO students (
        registration_no, roll_no, student_name, student_name_urdu, father_name, 
        father_name_urdu, dob, dob_in_words, cnic_bform, picture_path, 
        admission_class, current_class, leaving_class, promoted_to_class, 
        section, admission_date, leaving_date, status, mobile, whatsapp, 
        monthly_fee, dues_paid_up_to, character_remarks, remarks, 
        certificate_serial, cert_issuance_date, attendance, address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`; // 28 placeholders (class_order removed)

    return db.prepare(sql).run(
        s.regNo, s.rollNo, s.name, s.nameUrdu, s.fatherName, 
        s.fatherNameUrdu, s.dob, s.dobWords, s.cnic, s.pic, 
        s.admClass, s.studyClass, s.leavingClass, s.promotedClass, 
        s.section, s.admDate, s.leavingDate, s.status, s.mobile, s.whatsapp, 
        s.monthlyFee, s.duesPaid, s.character, s.generalRemarks, 
        s.certSerial, s.certDate, s.attendance, s.address
    );
};

const updateStudent = (s) => {
    const sql = `UPDATE students SET 
        registration_no = ?, roll_no = ?, student_name = ?, student_name_urdu = ?, father_name = ?, 
        father_name_urdu = ?, dob = ?, dob_in_words = ?, cnic_bform = ?, picture_path = ?, 
        admission_class = ?, current_class = ?, leaving_class = ?, promoted_to_class = ?, 
        section = ?, admission_date = ?, leaving_date = ?, status = ?, mobile = ?, whatsapp = ?, 
        monthly_fee = ?, dues_paid_up_to = ?, character_remarks = ?, remarks = ?, 
        certificate_serial = ?, cert_issuance_date = ?, attendance = ?, address = ?
        WHERE id = ?`;

    return db.prepare(sql).run(
        s.regNo, s.rollNo, s.name, s.nameUrdu, s.fatherName, 
        s.fatherNameUrdu, s.dob, s.dobWords, s.cnic, s.pic, 
        s.admClass, s.studyClass, s.leavingClass, s.promotedClass, 
        s.section, s.admDate, s.leavingDate, s.status, s.mobile, s.whatsapp, 
        s.monthlyFee, s.duesPaid, s.character, s.generalRemarks, 
        s.certSerial, s.certDate, s.attendance, s.address, 
        s.id
    );
};


const getStudents = () => db.prepare('SELECT * FROM students ORDER BY id DESC').all();
const getStudentById = (id) => db.prepare('SELECT * FROM students WHERE id = ?').get(id);
const deleteStudent = (id) => db.prepare('DELETE FROM students WHERE id = ?').run(id);
// Delete all fee records for a student
function deleteFeeRecordsByStudent(studentId) {
  return db.prepare('DELETE FROM fee_tbl WHERE student_id = ?').run(studentId);
}

// Delete all result records for a student
function deleteResultsByStudent(studentId) {
  return db.prepare('DELETE FROM result WHERE student_id = ?').run(studentId);
}

const generateFee = (studentId, month, year) => {
    // 1. Get student info
    const student = db.prepare(`
        SELECT registration_no, current_class, monthly_fee 
        FROM students WHERE id = ?
    `).get(studentId);

    // 2. Calculate Arrears: Sum of (total_fee - collection) + any existing arrears 
    // from all previous months.
    const arrearsData = db.prepare(`
        SELECT SUM(balance) as total_arrears 
        FROM fee_tbl 
        WHERE student_id = ?
    `).get(studentId);

    const arrears = arrearsData.total_arrears || 0;

    try {
        // 3. Insert record
        // Note: total_fee and balance will be calculated automatically by the DB
        return db.prepare(`
            INSERT INTO fee_tbl (
                student_id, registration_no, current_class, 
                monthly_fee, arrears, invoice_month, invoice_year, collection
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `).run(
            studentId, 
            student.registration_no, 
            student.current_class, 
            student.monthly_fee, 
            arrears, 
            month, 
            year
        );
    } catch (err) { 
        if (err.message.includes('UNIQUE constraint failed')) {
            throw new Error(`Fee for ${month} ${year} already generated.`); 
        }
        throw err; 
    }
};


const generateBulkFees = (month, year) => {
    // 1. Fetch active students WITHOUT invoice + monthly_fee > 0
    const missingStudents = db.prepare(`
        SELECT 
            s.id, 
            s.registration_no, 
            s.current_class, 
            s.monthly_fee,
            COALESCE((
                SELECT SUM(balance) 
                FROM fee_tbl 
                WHERE student_id = s.id
            ), 0) AS total_arrears
        FROM students s
        WHERE LOWER(s.status) = 'active' 
        AND COALESCE(s.monthly_fee, 0) > 0
        AND s.id NOT IN (
            SELECT student_id FROM fee_tbl 
            WHERE LOWER(invoice_month) = LOWER(?) AND invoice_year = ?
        )
    `).all(month, year);

    if (missingStudents.length === 0) {
        return { success: false, message: `No eligible students found. Either invoices for ${month} ${year} already generated or all active students have monthly_fee = 0.` };
    }

    const insertStmt = db.prepare(`
        INSERT INTO fee_tbl (
            student_id, registration_no, current_class, 
            monthly_fee, arrears, invoice_month, invoice_year, collection
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const transaction = db.transaction((students) => {
        for (const s of students) {
            insertStmt.run(
                s.id, 
                s.registration_no, 
                s.current_class, 
                s.monthly_fee, 
                s.total_arrears,
                month, 
                year
            );
        }
    });

    try {
        transaction(missingStudents);
        return { success: true, count: missingStudents.length };
    } catch (err) {
        console.error("Bulk Fee Error:", err);
        return { success: false, error: err.message };
    }
};



const getFeeRecords = () => db.prepare(`SELECT f.*, s.student_name, s.father_name FROM fee_tbl f JOIN students s ON f.student_id = s.id ORDER BY f.id DESC`).all();
function updateCollection(id, amount, date) { return db.prepare('UPDATE fee_tbl SET collection = collection + ?,  collection_date = ? WHERE id = ?').run(amount, date, id); }
function updateFeeRecord(id, newCollection, date) { return db.prepare('UPDATE fee_tbl SET collection = ?, collection_date = ? WHERE id = ?').run(newCollection, date, id); }
const deleteFee = (id) => db.prepare('DELETE FROM fee_tbl WHERE id = ?').run(id);
function getFeeRecordById(id) { return db.prepare(`SELECT f.*, s.student_name, s.father_name, s.registration_no, s.section FROM fee_tbl f JOIN students s ON f.student_id = s.id WHERE f.id = ?`).get(id); }

function getFeeRecordsFilters(filters = {}) {
    let query = `SELECT f.*, s.student_name, s.father_name, s.whatsapp, s.section FROM fee_tbl f JOIN students s ON f.student_id = s.id WHERE 1=1`;
    const params = [];
    if (filters.month) { query += ` AND f.invoice_month = ?`; params.push(filters.month); }
    if (filters.year) { query += ` AND f.invoice_year = ?`; params.push(filters.year); }
    if (filters.className) { query += ` AND f.current_class = ?`; params.push(filters.className); }
    query += ` ORDER BY f.id DESC`;
    return db.prepare(query).all(...params);
}

function getUniqueInvoiceMonths() { return db.prepare('SELECT DISTINCT invoice_month FROM fee_tbl ORDER BY invoice_month DESC').all(); }
function getUniqueInvoiceYears() { return db.prepare('SELECT DISTINCT invoice_year FROM fee_tbl ORDER BY invoice_year DESC').all(); }
function getClassesFee() { return db.prepare('SELECT class_name FROM classes ORDER BY class_name ASC').all(); }

// 1. Make sure table has photo column - run this once at top where you create tables
try { db.exec("ALTER TABLE staff_tbl ADD COLUMN photo TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE staff_tbl ADD COLUMN documents_held TEXT"); } catch(e) {}

const getStaff = () => db.prepare("SELECT * FROM staff_tbl ORDER BY id DESC").all();

const insertStaff = (data) => 
  db.prepare(`
    INSERT INTO staff_tbl (name, cnic, contact, designation, doj, salary, allowance, status, documents_held, photo) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.name, data.cnic, data.contact, data.designation, data.doj, data.salary, data.allowance, data.status, data.documents_held, data.photo || null);

const updateStaff = (id, data) => 
  db.prepare(`
    UPDATE staff_tbl 
    SET name=?, cnic=?, contact=?, designation=?, doj=?, salary=?, allowance=?, status=?, documents_held=?, photo=? 
    WHERE id=?
  `).run(data.name, data.cnic, data.contact, data.designation, data.doj, data.salary, data.allowance, data.status, data.documents_held, data.photo || null, id);

  const deleteStaff = (id) => db.prepare("DELETE FROM staff_tbl WHERE id = ?").run(id);

/**
 * Initiates salary records for all 'Active' staff members for a specific month/year.
 * It pulls the current Basic Salary, Allowance, and Authorized Leaves from staff_tbl.
 */
const initiateSalary = (month, year) => {
    try {
        // 1. Find staff members who are 'Active' but don't have a record for this month yet
        const missingStaff = db.prepare(`
            SELECT id, name, salary, allowance, auth_leaves 
            FROM staff_tbl 
            WHERE status = 'Active' 
            AND id NOT IN (
                SELECT staff_id FROM salary_tbl 
                WHERE salary_month = ? AND salary_year = ?
            )
        `).all(month, year);

        // 2. If everyone is already initiated, return early
        if (missingStaff.length === 0) {
            return { 
                success: false, 
                message: `Salary records for ${month} ${year} are already initiated for all active staff.` 
            };
        }

        // 3. Prepare the insert statement with the new auth_leaves column
       const insertStmt = db.prepare(`
  INSERT INTO salary_tbl (
    staff_id, name, salary, allowance, auth_leaves, availed_leaves, 
    salary_deduction, deduction_remarks, award, award_remarks, fund_cutting, security_cutting,
    salary_month, salary_year, status
  ) VALUES (?, ?, ?, ?, ?, 0, 0, '', 0, '', 0, 0, ?, ?, 'Unpaid')
`);


        // 4. Run as a transaction for safety (all or nothing)
        const transaction = db.transaction((staffList) => {
            for (const s of staffList) {
                insertStmt.run(
                    s.id,           // staff_id
                    s.name,         // name
                    s.salary,       // current basic salary
                    s.allowance,    // current allowance
                    s.auth_leaves,  // current authorized leave limit
                    month,          // salary_month
                    year            // salary_year
                );
            }
        });

        transaction(missingStaff);

        return { 
            success: true, 
            count: missingStaff.length 
        };

    } catch (err) {
        console.error("Initiate Salary Error:", err);
        return { success: false, error: err.message };
    }
};

/**
 * Updates the number of leaves actually taken by the staff member.
 * This can only be called from the frontend before the status is changed to 'Paid'.
 */
const updateAvailedLeaves = (id, count) => {
    return db.prepare(`
        UPDATE salary_tbl 
        SET availed_leaves = ? 
        WHERE id = ? AND status = 'Unpaid'
    `).run(count, id);
};
// database.js
// database.js - Updated to include original staff salary
// database.js - Updated to include documents_held from staff table
const getSalaries = (month, year) => {
    return db.prepare(`
        SELECT 
            s.*, 
             st.cnic as cnic,
            st.designation,
            st.salary as original_base,
            st.documents_held 
        FROM salary_tbl s
        JOIN staff_tbl st ON s.staff_id = st.id
        WHERE s.salary_month = ? AND s.salary_year = ?
    `).all(month, year);
};


const updateSalaryStatus = (id, status, data) => {
  let paidSalary = data.salary; 
  
  // Calculate final Net Pay dynamically when moving state triggers to Paid status
  if (status === 'Paid') {
    const base = parseFloat(data.salary || 0);
    const allowance = parseFloat(data.allowance || 0);
    const award = parseFloat(data.award || 0);
    const deduction = parseFloat(data.salary_deduction || 0);
    const fund = parseFloat(data.fund_cutting || 0);
    const security = parseFloat(data.security_cutting || 0);
    
    paidSalary = (base + allowance + award) - (deduction + fund + security);
  } else {
    // If we're just updating variables inline while unpaid, fetch the active basic setting
    paidSalary = data.salary || 0;
  }

  return db.prepare(`
    UPDATE salary_tbl 
    SET status = ?, 
        salary = ?,
        salary_deduction = ?, 
        deduction_remarks = ?, 
        award = ?, 
        award_remarks = ?, 
        fund_cutting = ?, 
        security_cutting = ?
    WHERE id = ?
  `).run(
    status, 
    paidSalary,
    data.salary_deduction || 0,
    data.deduction_remarks || '',
    data.award || 0,
    data.award_remarks || '',
    data.fund_cutting || 0,
    data.security_cutting || 0,
    id
  );
};



const getDashboardStats = () => {
  const now = new Date();
  const month = now.toLocaleString('default', { month: 'long' });
  const year = now.getFullYear().toString();

  // 1. Receivables: Total Fee + Arrears
  const receivablesResult = db.prepare(`
    SELECT SUM(total_fee + arrears) as total 
    FROM fee_tbl 
    WHERE invoice_month = ? AND invoice_year = ?
  `).get(month, year);
  const receivables = receivablesResult.total || 0;

  // 2. Fee Received
  const feeReceived = db.prepare(`
    SELECT SUM(collection) as total 
    FROM fee_tbl 
    WHERE invoice_month = ? AND invoice_year = ?
  `).get(month, year).total || 0;

  // 3. Balance: (Total Fee + Arrears) - Collection
  const balanceResult = db.prepare(`
    SELECT SUM((total_fee + arrears) - collection) as total 
    FROM fee_tbl 
    WHERE invoice_month = ? AND invoice_year = ?
  `).get(month, year);
  const balance = balanceResult.total || 0;

  // 4. Active Students
  const activeStudents = db.prepare(`
    SELECT count(*) as count FROM students WHERE LOWER(status) = 'active'
  `).get().count;

  // 5. Total Active Staff (NEW STAT)
  const activeStaff = db.prepare(`
    SELECT count(*) as count FROM staff_tbl WHERE status = 'Active'
  `).get().count;

  // 6. Salaries paid / generated for the current month
  const salaries = db.prepare(`
    SELECT SUM(salary) as total FROM salary_tbl WHERE salary_month = ? AND salary_year = ?
  `).get(month, year).total || 0;

  // 7. Expenses for the current month
  const expenses = db.prepare(`
    SELECT SUM(exp_amount) as total FROM exp_tbl WHERE exp_month = ? AND exp_year = ?
  `).get(month, year).total || 0;

  // 8. Profit / Loss Calculation (NEW STAT)
  const totalOutflow = expenses + salaries;
  const financialAmount = feeReceived - totalOutflow; 
  const financialStatus = feeReceived > totalOutflow ? 'Profit' : 'Loss';

  return { 
    activeStudents, 
    activeStaff,       // Added
    receivables, 
    balance, 
    salaries, 
    feeReceived, 
    expenses,
    financialAmount,   // Added (Numeric profit/loss value)
    financialStatus    // Added ('Profit' or 'Loss' string label)
  };
};


 
// Add these to Database.js
const getActiveClasses = () => {
    // Note: Use SINGLE QUOTES 'active' for the value
    return db.prepare("SELECT DISTINCT current_class FROM students WHERE status = 'Active' ORDER BY current_class ASC").all();
};

const initiateExamForClasses = (examId, selectedClasses) => {
    try {
        // 1. Ensure selectedClasses is a valid array and not empty
        if (!Array.isArray(selectedClasses) || selectedClasses.length === 0) {
            return { success: true, newlyAdded: 0, message: "No classes selected." };
        }

        // 2. Generate dynamic placeholders (?, ?, ?) based on selection length
        const placeholders = selectedClasses.map(() => '?').join(',');

        // 3. Prepare insertion query with a case-insensitive LIKE check for status
                const insertStmt = db.prepare(`
            INSERT INTO result (student_id, exam_id, class, total_setmarks)
            SELECT id, ?, current_class, 2200
            FROM students 
            WHERE current_class IN (${placeholders}) 
            AND status LIKE 'active'
            AND id NOT IN (
                SELECT student_id FROM result WHERE exam_id = ?
            )
        `);


        // 4. Safely execute inside a high-performance database transaction
        let totalChanges = 0;
        const transaction = db.transaction(() => {
            // Arguments layout mapping: [exam_id, ...classNames, exam_id_for_duplicate_check]
            const queryArgs = [examId, ...selectedClasses, examId];
            const info = insertStmt.run(...queryArgs);
            totalChanges = info.changes;
        });

        transaction();
        
        return { success: true, newlyAdded: totalChanges };

    } catch (error) {
        console.error("Database Engine Error in initiateExamForClasses:", error);
        return { success: false, error: error.message };
    }
};


// Add this inside database.js
// In database.js
const getStudentFeeHistory = (studentId) => {
    // UPDATED: Added current_class to the SELECT query parameters
    const student = db.prepare('SELECT student_name, father_name, current_class, registration_no, picture_path FROM students WHERE id = ?').get(studentId);
    
    const history = db.prepare(`
        SELECT *, 
        SUM(balance + arrears) OVER (ORDER BY invoice_year DESC, invoice_month DESC) as running_balance
        FROM fee_tbl 
        WHERE student_id = ? 
        ORDER BY invoice_year DESC, invoice_month DESC
    `).all(studentId);
    
    return { student, history };
};





// Add to database.js
const getFeeReportByStatus = (statusType) => {
    const now = new Date();
    const month = now.toLocaleString('default', { month: 'long' });
    const year = now.getFullYear().toString();

    let statusFilter = "";
    
    /**
     * Logic Fix:
     * We calculate the 'net_debt' inside the filter.
     * net_debt = (Current Month Total) + (Sum of all previous balances)
     */
    if (statusType === 'paid') {
        // Paid: Collection covers everything (Current + Arrears)
        statusFilter = "AND f.collection >= (f.total_fee + arrears_sub.prev_bal)";
    } 
    else if (statusType === 'unpaid') {
        // Unpaid: Exactly zero collected
        statusFilter = "AND f.collection = 0";
    } 
    else if (statusType === 'partial') {
        // Partial: Something paid, but less than the total debt
        statusFilter = "AND f.collection > 0 AND f.collection < (f.total_fee + arrears_sub.prev_bal)";
    }

    const sql = `
        SELECT 
            f.*, 
            s.student_name, 
            s.father_name, 
            s.section, 
            s.mobile,
            arrears_sub.prev_bal as arrears
        FROM fee_tbl f
        JOIN students s ON f.student_id = s.id
        -- We use a CROSS JOIN/Subquery to calculate arrears for the filter to work
        JOIN (
            SELECT id, 
            (SELECT COALESCE(SUM(balance), 0) FROM fee_tbl WHERE student_id = f2.student_id AND id < f2.id) as prev_bal
            FROM fee_tbl f2
        ) AS arrears_sub ON f.id = arrears_sub.id
        WHERE f.invoice_month = ? 
          AND f.invoice_year = ? 
          ${statusFilter}
        ORDER BY f.current_class ASC, s.section ASC, f.registration_no ASC
    `;

    return db.prepare(sql).all(month, year);
};


// Update module.exports to include getFeeReportByStatus
// Add/Update in database.js
// Add to database.js
// Update this in database.js
// Update this in database.js
const getDateWiseReport = (selectedDate) => {
    // selectedDate is already "YYYY-MM-DD" from the HTML input
    const sql = `
        SELECT 
            f.*, 
            s.student_name, 
            s.father_name, 
            s.section, 
            s.mobile,
            f.created_at as paid_on,
            (
                SELECT COALESCE(SUM(balance), 0) 
                FROM fee_tbl 
                WHERE student_id = f.student_id AND id < f.id
            ) as arrears
        FROM fee_tbl f
        JOIN students s ON f.student_id = s.id
        WHERE f.collection_date LIKE ? 
        AND f.collection > 0
        ORDER BY f.current_class ASC, s.section ASC, f.registration_no ASC
    `;
    
    // Use the raw selectedDate with a wildcard for the time portion
    return db.prepare(sql).all(`${selectedDate}%`);
};





const addDateSheetPaper = (data) => {
    const sql = `INSERT INTO datesheet (subject, exam_date, exam_year, exam_id, class_id) 
                 VALUES (?, ?, ?, ?, ?)`;
    return db.prepare(sql).run(
        data.subject, 
        data.exam_date, 
        data.exam_year, 
        data.exam_id, 
        data.class_id
    );
};
const updateDateSheetPaper = (data) => {
    const sql = `UPDATE datesheet 
                 SET subject = ?, exam_date = ?, exam_year = ?, exam_id = ?, class_id = ? 
                 WHERE id = ?`;
    return db.prepare(sql).run(
        data.subject, 
        data.exam_date, 
        data.exam_year, 
        data.exam_id, 
        data.class_id,
        data.id
    );
};



// Inside initializeDB function in database.js
db.exec(`CREATE TABLE IF NOT EXISTS datesheet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT,
    exam_date DATE,
    exam_year TEXT,
    exam_name TEXT,
    class_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
)`);

// Function to fetch DateSheet with Class Names joined
// Function to fetch DateSheet with Class Names joined
// Change your query in Database.js to this:
const getDateSheetRecords = (filters = {}) => {
    let sql = `
        SELECT ds.*, c.class_name, e.exam_name 
        FROM datesheet ds
        JOIN classes c ON ds.class_id = c.id
        JOIN exams e ON ds.exam_id = e.exam_id
        WHERE 1=1
    `;
    const params = [];

    if (filters.year) {
        sql += ` AND ds.exam_year = ?`;
        params.push(filters.year);
    }
    if (filters.exam_id) {
        sql += ` AND ds.exam_id = ?`;
        params.push(filters.exam_id);
    }
    if (filters.class_id) {
        sql += ` AND ds.class_id = ?`;
        params.push(filters.class_id);
    }

    sql += ` ORDER BY ds.exam_date ASC`;
    return db.prepare(sql).all(...params);
};


const deleteDateSheetPaper = (id) => {
    const sql = `DELETE FROM datesheet WHERE id = ?`;
    return db.prepare(sql).run(id);
};
//change password
function changeUserPassword(currentPass, newPass) {
    try {
        // 1. Check if the current password is correct (Assuming user ID 1 for single-user system)
        const user = db.prepare("SELECT password FROM users WHERE id = 1").get();
        
        if (user.password !== currentPass) {
            return { success: false, message: "Current password incorrect." };
        }
        
        // 2. Update to new password
        db.prepare("UPDATE users SET password = ? WHERE id = 1").run(newPass);
        return { success: true };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

//certificate purpose// Add this inside database.js

function getStudentByReg(regNo) {
    const row = db.prepare('SELECT * FROM students WHERE registration_no = ?').get(String(regNo).trim());
    if(row) row.student_id = row.id;
    return row;
}
// YE LINE ADD KARO:
const getStudentByRegNo = getStudentByReg; 

// Save student attendance batch
const saveStudentAttendance = (records, date) => {
  const getClassStmt = db.prepare(`SELECT id FROM classes WHERE TRIM(class_name) = TRIM(?) LIMIT 1`);
  
  const insertStmt = db.prepare(`
    INSERT INTO student_attendance (student_id, class_id, date, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(student_id, date) DO UPDATE SET 
      status = excluded.status,
      class_id = excluded.class_id
  `);

  const transaction = db.transaction((list) => {
    for (const r of list) {
      // FORCE class_id - never allow null
      let classId = r.class_id;
      if (!classId) {
        const cr = getClassStmt.get(r.current_class);
        classId = cr ? cr.id : null;
      }
      // If still null, try to get from student table
      if (!classId) {
        const srow = db.prepare(`SELECT current_class FROM students WHERE id = ?`).get(r.student_id);
        if (srow) {
          const cr2 = getClassStmt.get(srow.current_class);
          classId = cr2 ? cr2.id : null;
        }
      }
      
      console.log(`Saving student_id=${r.student_id} class_id=${classId} date=${date} status=${r.status}`);
      insertStmt.run(r.student_id, classId, date, r.status);
    }
  });

  transaction(records);
  return { success: true };
};
function getStudentAttendanceStatus(student_id, date) {
  const row = db.prepare(`SELECT status FROM student_attendance WHERE student_id = ? AND date = ?`).get(student_id, date);
  return row ? row.status : null;
}
function getStaffAttendanceStatus(staff_id, date) {
  const row = db.prepare(`SELECT status FROM staff_attendance WHERE staff_id = ? AND date = ?`).get(staff_id, date);
  return row ? row.status : null;
}
// aur module.exports me add kar dein
// Get student attendance (Hides anyone with a saved status today)
// Ye rakho to Present wala student list se gayab ho jayega
const getStudentAttendanceByClass = (className, date) => {
  // This shows ONLY students whose attendance is NOT marked for chosen date
  const records = db.prepare(`
    SELECT 
      s.id as student_id, 
      s.student_name, 
      s.roll_no, 
      s.registration_no,
      NULL as status,
      c.id as class_id,
      s.current_class
    FROM students s
    LEFT JOIN classes c ON TRIM(c.class_name) = TRIM(s.current_class)
    LEFT JOIN student_attendance a ON a.student_id = s.id AND a.date = ?
    WHERE TRIM(s.current_class) = TRIM(?)
      AND LOWER(s.status) = 'active'
      AND a.status IS NULL
    ORDER BY CAST(s.roll_no AS INTEGER) ASC
  `).all(date, className);

  return {
    isMarked: records.length === 0,
    records: records
  };
};

const getStaffAttendanceByDate = (date) => {
  try {
    const records = db.prepare(`
      SELECT 
        st.id as staff_id, 
        st.name, 
        COALESCE(st.designation, 'Staff') as designation,
        COALESCE(a.status, 'Absent') as status
      FROM staff_tbl st
      LEFT JOIN staff_attendance a ON a.staff_id = st.id AND a.date = ?
      WHERE LOWER(TRIM(st.status)) = 'active'
      ORDER BY st.name ASC
    `).all(date);

    console.log(`Staff found for ${date}:`, records.length);
    return { isMarked: false, records };
  } catch (err) {
    console.error("getStaffAttendanceByDate error:", err.message);
    // fallback if table name is 'staff' not 'staff_tbl'
    try {
      const records = db.prepare(`
        SELECT 
          st.id as staff_id, 
          st.name, 
          COALESCE(st.designation, 'Staff') as designation,
          COALESCE(a.status, 'Absent') as status
        FROM staff st
        LEFT JOIN staff_attendance a ON a.staff_id = st.id AND a.date = ?
        WHERE LOWER(TRIM(st.status)) = 'active'
        ORDER BY st.name ASC
      `).all(date);
      return { isMarked: false, records };
    } catch(e2) {
      console.error("Fallback error:", e2.message);
      return { isMarked: false, records: [], error: e2.message };
    }
  }
};



// Save staff attendance batch
const saveStaffAttendance = (records, date) => {
    const insertStmt = db.prepare(`
        INSERT INTO staff_attendance (staff_id, date, status)
        VALUES (?, ?, ?)
        ON CONFLICT(staff_id, date) DO UPDATE SET status = excluded.status
    `);
    const transaction = db.transaction((list) => {
        for (const record of list) {
            insertStmt.run(record.staff_id, date, record.status);
        }
    });
    transaction(records);
    return { success: true };
};


// Get monthly attendance summary for all students in a class
const getStudentMonthlyReport = (class_name, yearMonth) => {
    // yearMonth format: "YYYY-MM"
    return db.prepare(`
        SELECT 
            s.registration_no, 
            s.roll_no, 
            s.student_name,
            SUM(CASE WHEN sa.status = 'Present' THEN 1 ELSE 0 END) as total_present,
            SUM(CASE WHEN sa.status = 'Absent' THEN 1 ELSE 0 END) as total_absent,
            SUM(CASE WHEN sa.status = 'Leave' THEN 1 ELSE 0 END) as total_leave,
            COUNT(sa.status) as total_days
        FROM students s
        LEFT JOIN student_attendance sa ON s.id = sa.student_id AND sa.date LIKE ?
        WHERE s.current_class = ? AND LOWER(s.status) = 'active'
        GROUP BY s.id
        ORDER BY s.roll_no ASC
    `).all(`${yearMonth}%`, class_name);
};

// Get monthly attendance summary for all staff members
const getStaffMonthlyReport = (yearMonth) => {
    // yearMonth format: "YYYY-MM"
    return db.prepare(`
        SELECT 
            st.id as staff_id, 
            st.name, 
            st.designation,
            SUM(CASE WHEN sta.status = 'Present' THEN 1 ELSE 0 END) as total_present,
            SUM(CASE WHEN sta.status = 'Absent' THEN 1 ELSE 0 END) as total_absent,
            SUM(CASE WHEN sta.status = 'Leave' THEN 1 ELSE 0 END) as total_leave,
            COUNT(sta.status) as total_days
        FROM staff_tbl st
        LEFT JOIN staff_attendance sta ON st.id = sta.staff_id AND sta.date LIKE ?
        WHERE LOWER(st.status) = 'active'
        GROUP BY st.id
        ORDER BY st.name ASC
    `).all(`${yearMonth}%`);
};

// Update module.exports at the bottom to include:
// getStudentMonthlyReport, getStaffMonthlyReport
// Fetch detailed calendar day-by-day map for students
const getStudentGridReport = (class_name, yearMonth) => {
    const classRow = db.prepare(`SELECT id FROM classes WHERE TRIM(class_name) = TRIM(?)`).get(class_name);
    const class_id = classRow ? classRow.id : null;

    // FIX: Get students who HAVE attendance for this class in this month
    // + plus active students currently in this class (for future days)
    const students = db.prepare(`
        SELECT DISTINCT s.id, s.roll_no, s.student_name 
        FROM students s
        WHERE s.id IN (
          SELECT student_id FROM student_attendance WHERE class_id = ? AND date LIKE ?
          UNION
          SELECT id FROM students WHERE TRIM(current_class) = TRIM(?) AND LOWER(status)='active'
        )
        ORDER BY CAST(s.roll_no AS INTEGER) ASC
    `).all(class_id, `${yearMonth}%`, class_name);

    const attendance = db.prepare(`
        SELECT student_id, CAST(strftime('%d', date) AS INTEGER) as day, status 
        FROM student_attendance 
        WHERE class_id = ? AND date LIKE ?
    `).all(class_id, `${yearMonth}%`);

    return { students, attendance };
};

// Fetch detailed calendar day-by-day map for staff
const getStaffGridReport = (yearMonth) => {
    const staff = db.prepare(`
        SELECT id, name, designation 
        FROM staff_tbl 
        WHERE LOWER(status) = 'active'
        ORDER BY name ASC
    `).all();

    const attendance = db.prepare(`
        SELECT staff_id, CAST(strftime('%d', date) AS INTEGER) as day, status 
        FROM staff_attendance 
        WHERE date LIKE ?
    `).all(`${yearMonth}%`);

    return { staff, attendance };
};
function getPaperQuestions(examType, classId, paperName) {
  try {
    const sql = `
      SELECT 
        pq.id AS paper_question_id,
        pq.marks_assigned,
        qb.id AS question_id,
        qb.question_type,
        qb.question_text,
        qb.lesson_no,
        qb.opt1, qb.opt2, qb.opt3, qb.opt4,
        qb.correct_answer
      FROM paper_questions pq
      JOIN question_bank qb ON pq.question_id = qb.id
      WHERE pq.exam_type = ? 
        AND pq.class_id = ? 
        AND pq.paper_name = ?
    `;

    // Execute query and fetch all matching rows
    const records = db.prepare(sql).all(examType, classId, paperName);
    console.log(`[Database] Retrieved ${records.length} questions for ${examType} (${paperName})`);
    return records;

  } catch (error) {
    console.error("Database Error in getPaperQuestions:", error);
    return [];
  }
}

// FIX B: Changed table target to 'paper_questions' and aligned parameters
function removeQuestionFromPaper(id) {
  try {
    // FIXED: Using paper_name to match your schema schema columns exactly!
    const sql = `DELETE FROM paper_questions WHERE id = ? `;
    const stmt = db.prepare(sql);
    const result = stmt.run(id);
    
        
    console.log(`[DB Debug] Tried deleting ID ${id}. Rows affected: ${result.changes}`);
    return {success: result.changes > 0} ;
  } catch (err) {
    console.error("Database error in removeQuestionFromPaper:", err);
    throw err;
  }
}




// Add a new question to the pool
function addQuestion(q) {
  const sql = `INSERT INTO question_bank 
  (class_id, subject, lesson_no, question_type, question_text, diagram_path, opt1, opt2, opt3, opt4, correct_answer) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  const classId = q.classId !== undefined ? q.classId : q.class_id;
  const lessonNo = q.lessonNo !== undefined ? q.lessonNo : q.lesson_no;
  const questionType = q.type || q.questionType || q.question_type || null;
  const questionText = q.text || q.questionText || q.question_text || null;
  const diagramPath = q.diagramPath || q.diagram_path || null; // 🆕 Extract diagram path safely
  const correctAnswer = q.answer || q.correctAnswer || q.correct_answer || null;

  return db.prepare(sql).run(
    classId, q.subject, lessonNo, questionType, questionText, diagramPath,
    q.opt1, q.opt2, q.opt3, q.opt4, correctAnswer
  );
}


function getQuestions(classId, subject, lessonNo) {
  // If a lesson number is provided, filter by it. Otherwise, load all lessons for that subject.
  if (lessonNo) {
    return db.prepare(`SELECT * FROM question_bank WHERE class_id = ? AND subject = ? AND lesson_no = ?`).all(classId, subject, lessonNo);
  } else {
    return db.prepare(`SELECT * FROM question_bank WHERE class_id = ? AND subject = ?`).all(classId, subject);
  }
}

// Add this helper inside Database.js
const uploadBulkQuestions = (classId, subject, lessonNo, questionsArray) => {
  // Use a transaction for fast processing
  const insertStmt = db.prepare(`
    INSERT INTO question_bank (class_id, subject, lesson_no, question_type, question_text, opt1, opt2, opt3, opt4, correct_answer)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((questions) => {
    let count = 0;
    for (const q of questions) {
      insertStmt.run(
        classId,
        subject,
        lessonNo,
        q.question_type || 'MCQ',
        q.question_text,
        q.opt1 || null,
        q.opt2 || null,
        q.opt3 || null,
        q.opt4 || null,
        q.correct_answer || null
      );
      count++;
    }
    return count;
  });

  return transaction(questionsArray);
};

function addQuestionToPaper(data) {
  const { examType, classId, paperName, questionId, marks } = data;

  try {
    // 1. Check if this question is already added to the paper
    const checkSql = `
      SELECT id FROM paper_questions 
      WHERE exam_type = ? 
        AND class_id = ? 
        AND paper_name = ? 
        AND question_id = ?
    `;
    const existingRecord = db.prepare(checkSql).get(examType, classId, paperName, questionId);

    if (existingRecord) {
      // 2. Update the existing record using marks_assigned
      const updateSql = `
        UPDATE paper_questions 
        SET marks_assigned = ? 
        WHERE id = ?
      `;
      db.prepare(updateSql).run(marks, existingRecord.id);
      return { success: true, message: "Question marks updated successfully!" };
    } else {
      // 3. Insert a new record using marks_assigned
      const insertSql = `
        INSERT INTO paper_questions (exam_type, class_id, paper_name, question_id, marks_assigned)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.prepare(insertSql).run(examType, classId, paperName, questionId, marks);
      return { success: true, message: "Question added to exam paper successfully!" };
    }

  } catch (error) {
    console.error("Database Engine Failure in addQuestionToPaper:", error);
    return { success: false, error: error.message };
  }
}



function getPaperSettings(data) {
  if (!data) return { success: false, error: "No criteria received" };
  const examType = data.examType || data.exam_type;
  const paperName = data.paperName || data.paper_name;
  const classId = parseInt(data.classId || data.class_id, 10);

  try {
    const sql = `
      SELECT total_marks, passing_marks, exam_date, obj_marks, subj_marks, note_objective, note_subjective 
      FROM exam_papers 
      WHERE exam_type = ? AND paper_name = ? AND CAST(class_id AS INTEGER) = ?
    `;
    const settings = db.prepare(sql).get(examType, paperName, classId);
    return { success: true, settings: settings || null };
  } catch (error) {
    console.error("Database error in getPaperSettings:", error);
    return { success: false, error: error.message };
  }
}


// Ensure this exact name is used on the function definition line
function savePaperSettingsOnly(data) {
  if (!data) return { success: false, error: "No content data received" };
  const examType = data.examType || data.exam_type;
  const paperName = data.paperName || data.paper_name;
  const classId = parseInt(data.classId || data.class_id, 10); 
  const totalMarks = data.totalMarks || data.total_marks || 0;
  const passingMarks = data.passingMarks || data.passing_marks || 0;
  
  // 🌟 NEW: Extract the sent date object value safely
  const examDate = data.examDate || data.exam_date || ''; 
  
  const objectiveMarks = data.objectiveMarks || data.obj_marks || 0;
  const subjectiveMarks = data.subjectiveMarks || data.subj_marks || 0;
  const noteObjective = data.noteObjective || data.note_objective || '';
  const noteSubjective = data.noteSubjective || data.note_subjective || '';

  try {
    const checkSql = `
      SELECT exam_type FROM exam_papers 
      WHERE exam_type = ? AND paper_name = ? AND CAST(class_id AS INTEGER) = ?
    `;
    const existing = db.prepare(checkSql).get(examType, paperName, classId);

    if (existing) {
      // 🌟 UPDATE includes exam_date column parameter modification mapping
      const updateSql = `
        UPDATE exam_papers 
        SET total_marks = ?, passing_marks = ?, exam_date = ?, obj_marks = ?, subj_marks = ?, note_objective = ?, note_subjective = ?
        WHERE exam_type = ? AND paper_name = ? AND CAST(class_id AS INTEGER) = ?
      `;
      db.prepare(updateSql).run(
        totalMarks, passingMarks, examDate, objectiveMarks, subjectiveMarks, noteObjective, noteSubjective,
        examType, paperName, classId
      );
      console.log(`[Database] Settings updated successfully.`);
    } else {
      // 🌟 INSERT includes exam_date column parameter modification mapping
      const insertSql = `
        INSERT INTO exam_papers (exam_type, paper_name, class_id, total_marks, passing_marks, exam_date, obj_marks, subj_marks, note_objective, note_subjective)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.prepare(insertSql).run(
        examType, paperName, classId, totalMarks, passingMarks, examDate, objectiveMarks, subjectiveMarks, noteObjective, noteSubjective
      );
      console.log(`[Database] Settings inserted successfully.`);
    }
    return { success: true };
  } catch (error) {
    console.error("SQL Write Failure inside savePaperSettingsOnly:", error);
    return { success: false, error: error.message };
  }
}

// Add this function inside your database.js file
// Add or replace this function inside database.js
function updateQuestionText(data) {
    try {
        const { id, text, opt1, opt2, opt3, opt4, answer, lessonNo, type } = data;
        
        const sql = `
            UPDATE question_bank 
            SET question_text = ?, 
                opt1 = ?, 
                opt2 = ?, 
                opt3 = ?, 
                opt4 = ?, 
                correct_answer = ?,
                lesson_no = ?,
                question_type = ?
            WHERE id = ?
        `;
        
        // better-sqlite3 uses prepare().run() syntax
        const info = db.prepare(sql).run(text, opt1, opt2, opt3, opt4, answer, lessonNo, type, id);
        
        return { success: true, changes: info.changes };
    } catch (err) {
        console.error("Database update failure:", err);
        return { success: false, error: err.message };
    }
}


function deleteEntirePaper(data) {
    try {
        const { examType, classId, paperName } = data;
        
        // Target your actual verified table: paper_questions
        const sql = `
            DELETE FROM paper_questions 
            WHERE exam_type = ? 
              AND class_id = ? 
              AND paper_name = ?
        `;
        
        const info = db.prepare(sql).run(examType, classId, paperName);
        
        return { success: true, changes: info.changes };
    } catch (err) {
        console.error("Critical failure executing paper layout clear sweep:", err);
        return { success: false, error: err.message };
    }
}





// Add this helper function inside your database.js file
function getQuestionById(id) {
    try {
        const stmt = db.prepare('SELECT * FROM question_bank WHERE id = ?');
        return stmt.get(id); // Returns a single question object matching the ID
    } catch (err) {
        console.error("Database error inside getQuestionById:", err);
        return null;
    }
}

function deleteQuestionsBySelection({ classId, subject, lessonNo }) {
    try {
        const stmt = db.prepare('DELETE FROM question_bank WHERE class_id = ? AND subject = ? AND lesson_no = ?');
        const info = stmt.run(classId, subject, lessonNo);
        return { success: true, count: info.changes };
    } catch (err) {
        console.error("Database deletion error:", err);
        return { success: false, error: err.message };
    }
}
// Add 'deleteQuestionsBySelection' to your module.exports = { ... } block at the bottom
function deleteSingleQuestion(id) {
    try {
        const stmt = db.prepare('DELETE FROM question_bank WHERE id = ?');
        const info = stmt.run(id);
        return { success: info.changes > 0 };
    } catch (err) {
        console.error("Database compilation error inside deleteSingleQuestion handler:", err);
        return { success: false, error: err.message };
    }
}
// Remember to append 'deleteSingleQuestion' explicitly inside your module.exports array declaration!

function deleteExamCascade(data) {
    try {
        const { examId, examName } = data;

        // Wrap inside an atomic execution transaction loop to prevent mismatched dangling data states
        const executePurge = db.transaction(() => {
            // 1. Wipe out any recorded rows across the primary results table
            db.prepare(`DELETE FROM result WHERE exam_id = ?`).run(examId);

            // 2. Wipe out any question layouts built for this exam inside paper_questions
            db.prepare(`DELETE FROM paper_questions WHERE exam_type = ?`).run(examName);

            // 3. Clear out matching registry date sheets if applicable
            // db.prepare(`DELETE FROM datesheet WHERE exam_id = ?`).run(examId); 

            // 4. Finally, remove the parent metadata identification row from the exams table
            db.prepare(`DELETE FROM exams WHERE exam_id = ?`).run(examId);
        });

        executePurge(); // Runs database scripts synchronously
        return { success: true };
    } catch (err) {
        console.error("Critical execution abort deleting cascading exam configurations:", err);
        return { success: false, error: err.message };
    }
}
// ============ PROGRESS REPORT FIX ============
const getGradingRules = () => {
  return db.prepare(`SELECT * FROM grading_rules ORDER BY min_percentage DESC`).all();
};
const getPassingCriteria = (examId) => {
  let c = db.prepare(`SELECT * FROM exam_passing_criteria WHERE exam_id = ?`).get(examId);
  return c || { subject_pass_percentage: 40, overall_pass_percentage: 33, max_failed_subjects_allowed: 1 };
};
const savePassingCriteria = (examId, data) => {
  return db.prepare(`
    INSERT INTO exam_passing_criteria (exam_id, subject_pass_percentage, overall_pass_percentage, max_failed_subjects_allowed)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(exam_id) DO UPDATE SET subject_pass_percentage=excluded.subject_pass_percentage, overall_pass_percentage=excluded.overall_pass_percentage, max_failed_subjects_allowed=excluded.max_failed_subjects_allowed
  `).run(examId, data.subject_pass_percentage, data.overall_pass_percentage, data.max_failed_subjects_allowed);
};
const getStudentProgress = (studentId) => {
  return db.prepare(`
    SELECT r.*, s.student_name, s.father_name, s.roll_no, s.registration_no, s.picture_path, s.section, r.class as class
    FROM result r JOIN students s ON s.id = r.student_id
    WHERE r.student_id = ? ORDER BY r.result_id DESC LIMIT 1
  `).get(studentId);
};
const getAllStudentProgress = ({ examId, className }) => {
  return db.prepare(`
    SELECT r.*, s.student_name, s.father_name, s.roll_no, s.registration_no, s.picture_path, s.section, r.class as class
    FROM result r JOIN students s ON s.id = r.student_id
    WHERE r.exam_id = ? AND TRIM(r.class) = TRIM(?) ORDER BY r.total_obt DESC
  `).all(examId, className);
};
const updateResultRemarks = (resultId, remarks) => {
  return db.prepare(`UPDATE result SET remarks = ? WHERE result_id = ?`).run(remarks, resultId);
};

// Function to remove a specific question link from an exam paper layout template
const getAcademySubjects = () => {
  return db.prepare(`SELECT * FROM academy_subjects ORDER BY id ASC`).all();
};

const getStudentSubjectMarks = (resultId) => {
  return db.prepare(`
    SELECT ac.subject_display_name as display_name, ac.subject_code, m.marks_set, m.marks_obtained
    FROM student_subject_marks m
    JOIN academy_subjects ac ON ac.subject_code = m.subject_code
    WHERE m.result_id =? AND m.marks_set > 0
  `).all(resultId);
};

// Aur ek bulk wala taake progress report fast ho
const getAllSubjectMarksBulk = (resultIds) => {
  if(!resultIds.length) return [];
  const placeholders = resultIds.map(()=>'?').join(',');
  return db.prepare(`
    SELECT m.result_id, ac.subject_display_name as display_name, m.marks_set, m.marks_obtained
    FROM student_subject_marks m
    JOIN academy_subjects ac ON ac.subject_code = m.subject_code
    WHERE m.result_id IN (${placeholders}) AND m.marks_set > 0
  `).all(...resultIds);
};

// 1. Fetch the Timetable Matrix by Class ID
// 1. Fetch the Timetable Matrix by Class ID
// 1. Fetch the Timetable Matrix by Class ID (Renamed and simplified for main.js)
function getTimeTableByClass(classId) {
    try {
        const query = `
            SELECT * FROM school_timetable 
            WHERE class_id = ? 
            ORDER BY day_name, period_name
        `;
        // Directly return the rows array so main.js can wrap it correctly
        return db.prepare(query).all(classId);
    } catch (err) {
        console.error("SQL Error in getTimeTableByClass:", err);
        throw err; // Throws the error to be caught by the try-catch block in main.js
    }
}

// 2. Save / Insert a New Time Slot Reference
function saveTimeTableSlot(data) {
    try {
        const stmt = db.prepare(`
            INSERT INTO school_timetable (class_id, day_name, period_name, subject_name, start_time, end_time)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            data.class_id, 
            data.day_name, 
            data.period_name, 
            data.subject_name, 
            data.start_time, 
            data.end_time
        );
        return { success: true };
    } catch (err) {
        console.error("SQL Error in saveTimeTableSlot:", err);
        return { success: false, error: err.message };
    }
}

// 3. Delete an Existing Time Slot
function deleteTimeTableSlot(id) {
    try {
        const stmt = db.prepare(`DELETE FROM school_timetable WHERE id = ?`);
        const info = stmt.run(id);
        return { success: true, changes: info.changes };
    } catch (err) {
        console.error("SQL Error in deleteTimeTableSlot:", err);
        return { success: false, error: err.message };
    }
}

// DELETE
const deleteExpense = (id) => {
  try {
    return db.prepare("DELETE FROM exp_tbl WHERE id = ?").run(id);
  } catch (err) {
    console.error("deleteExpense error:", err.message);
    return { changes: 0 };
  }
};

// UPDATE
const updateExpense = (id, expense, amount) => {
  try {
    return db.prepare("UPDATE exp_tbl SET expence = ?, exp_amount = ? WHERE id = ?").run(expense, amount, id);
  } catch (err) {
    console.error("updateExpense error:", err.message);
    return { changes: 0 };
  }
};




module.exports = {
    db, checkUser, addUser, getAllUsers, addClass, getClasses, deleteClass, updateClass, getStudentGridReport,
    getStaffGridReport,addQuestionToPaper,getPaperQuestions,addQuestion,getQuestions,
    addStudent, getStudents, getStudentById, updateStudent, deleteStudent, getStudentMonthlyReport,getStaffMonthlyReport,
    generateFee, generateBulkFees, getFeeRecords, updateCollection, updateFeeRecord, 
    deleteFee, getFeeRecordById, getFeeRecordsFilters, getStaff, insertStaff, deleteQuestionsBySelection,
    updateStaff, deleteStaff, initiateSalary, getSalaries, updateSalaryStatus, 
    getDashboardStats, getUniqueInvoiceMonths, getUniqueInvoiceYears, getClassesFee,
    getActiveClasses, initiateExamForClasses, getStudentFeeHistory, updateAvailedLeaves,
    getFeeReportByStatus, getDateWiseReport, deleteFeeRecordsByStudent, deleteResultsByStudent,
    addDateSheetPaper, getDateSheetRecords, updateDateSheetPaper, deleteDateSheetPaper, changeUserPassword,
    getStudentByReg,  saveStudentAttendance,deleteSingleQuestion,
    getStudentAttendanceByClass,getPaperSettings,deleteEntirePaper,  getTimeTableByClass,
    saveTimeTableSlot,deleteExpense,
  updateExpense,
    deleteTimeTableSlot,
    saveStaffAttendance,uploadBulkQuestions, savePaperSettingsOnly,
    getStaffAttendanceByDate, removeQuestionFromPaper, updateQuestionText, getQuestionById,deleteExamCascade, getStudentAttendanceStatus, getStaffAttendanceStatus,
    getAcademySubjects,getStudentSubjectMarks,getAllSubjectMarksBulk,
    getGradingRules, getPassingCriteria, savePassingCriteria, getStudentProgress, getAllStudentProgress, getStudentByRegNo, updateResultRemarks
};