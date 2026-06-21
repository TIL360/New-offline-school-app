const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');
const { error } = require('console');


const userDataPath = app.getPath('userData');
//this line would create db insie appdata
// const dbPath = path.join(userDataPath, 'school.db');

// this would create db file inside the root area of the app
const dbPath = path.join(__dirname, 'school.db');

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
    date TEXT, -- Format: YYYY-MM-DD
    status TEXT CHECK(status IN ('Present', 'Absent', 'Leave')),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE(student_id, date)
)`);

// Staff Attendance Table
db.exec(`CREATE TABLE IF NOT EXISTS staff_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER,
    date TEXT, -- Format: YYYY-MM-DD
    status TEXT CHECK(status IN ('Present', 'Absent', 'Leave')),
    FOREIGN KEY (staff_id) REFERENCES staff_tbl(id) ON DELETE CASCADE,
    UNIQUE(staff_id, date)
)`);
// 1. Run this at the top of database.js setup to ensure the table exists
// Ensure the new exam configuration settings table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS exam_papers (
    exam_type TEXT,
    paper_name TEXT,
    class_id INTEGER,
    total_marks REAL,
    passing_marks REAL,
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
lesson_no INTEGER, -- New column added here
question_type TEXT CHECK(question_type IN ('MCQ', 'Short', 'Long', 'FillBlank', 'TrueFalse')),
question_text TEXT,
opt1 TEXT, 
opt2 TEXT, 
opt3 TEXT, 
opt4 TEXT, 
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
            id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, 
            registration_no TEXT, current_class TEXT, 
            monthly_fee REAL DEFAULT 0, 
            adm_fee REAL DEFAULT 0, 
            exam_fee REAL DEFAULT 0, 
            lab_fee REAL DEFAULT 0, 
            security REAL DEFAULT 0, 
            misc_fee REAL DEFAULT 0,
            misc_remarks TEXT,
            collection_date TEXT,
            total_fee REAL GENERATED ALWAYS AS (monthly_fee + adm_fee + exam_fee + lab_fee + security + misc_fee ) VIRTUAL,
            collection REAL DEFAULT 0,
            balance REAL GENERATED ALWAYS AS (total_fee - collection) VIRTUAL,
            arrears REAL DEFAULT 0,
            invoice_month TEXT, invoice_year TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (exam_id) REFERENCES exams(exam_id) ON DELETE CASCADE
)`);


db.exec(`CREATE TABLE IF NOT EXISTS result (
    result_id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    class TEXT,
    sec TEXT,
    remarks TEXT,
    
    -- Obtained Marks (12 Subjects)
    urdu_obt REAL DEFAULT 0,
    eng_obt REAL DEFAULT 0,
    math_obt REAL DEFAULT 0,
    sst_obt REAL DEFAULT 0,
    islamiat_obt REAL DEFAULT 0,
    science_obt REAL DEFAULT 0,
    physics_obt REAL DEFAULT 0,
    chemistry_obt REAL DEFAULT 0,
    biology_obt REAL DEFAULT 0,
    computer_obt REAL DEFAULT 0,
    drawing_obt REAL DEFAULT 0,
    geography_obt REAL DEFAULT 0,
    total_obt REAL DEFAULT 0,

    -- Set Marks (Total Marks per subject)
    urdu_setmarks REAL DEFAULT 100,
    eng_setmarks REAL DEFAULT 100,
    math_setmarks REAL DEFAULT 100,
    sst_setmarks REAL DEFAULT 100,
    islamiat_setmarks REAL DEFAULT 100,
    science_setmarks REAL DEFAULT 100,
    physics_setmarks REAL DEFAULT 100,
    chemistry_setmarks REAL DEFAULT 100,
    biology_setmarks REAL DEFAULT 100,
    computer_setmarks REAL DEFAULT 100,
    drawing_setmarks REAL DEFAULT 100,
    geography_setmarks REAL DEFAULT 100,
    total_setmarks REAL DEFAULT 1200,

    -- Summary Fields
    percentage REAL,
    grade TEXT,
    position TEXT,
    result_status TEXT, -- Pass/Fail
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (exam_id) REFERENCES exams(exam_id),
    FOREIGN KEY (student_id) REFERENCES students(id)
)`);
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
    status TEXT DEFAULT 'Active'
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
    salary_month TEXT, 
    salary_year TEXT, 
    status TEXT DEFAULT 'Unpaid', 
    UNIQUE(staff_id, salary_month, salary_year)
)`);

        // Default Admin
        const userCount = db.prepare('SELECT count(*) as count FROM users').get();
        if (userCount.count === 0) {
            db.prepare('INSERT INTO users (username, password, usertype) VALUES (?, ?, ?)').run('Admin', 'admin123', 'Admin');
        }

    } catch (err) { console.error("DB Init Error:", err); }
};

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
    // 1. Fetch active students without an invoice for this month
    // We SUM(balance) to get the total debt from all previous records
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
        AND s.id NOT IN (
            SELECT student_id FROM fee_tbl 
            WHERE LOWER(invoice_month) = LOWER(?) AND invoice_year = ?
        )
    `).all(month, year);

    if (missingStudents.length === 0) {
        return { success: false, message: `Invoices for ${month} ${year} already generated.` };
    }

    // 2. Prepare Insert statement
    const insertStmt = db.prepare(`
        INSERT INTO fee_tbl (
            student_id, registration_no, current_class, 
            monthly_fee, arrears, invoice_month, invoice_year, collection
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);

    // 3. Execute as a transaction for speed and safety
    const transaction = db.transaction((students) => {
        for (const s of students) {
            insertStmt.run(
                s.id, 
                s.registration_no, 
                s.current_class, 
                s.monthly_fee, 
                s.total_arrears, // Correctly pulls the sum of past balances
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

const getStaff = () => db.prepare("SELECT * FROM staff_tbl ORDER BY id DESC").all();
const insertStaff = (data) => db.prepare(`INSERT INTO staff_tbl (name, cnic, contact, designation, doj, salary, allowance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(data.name, data.cnic, data.contact, data.designation, data.doj, data.salary, data.allowance, data.status);
const updateStaff = (id, data) => db.prepare(`UPDATE staff_tbl SET name=?, cnic=?, contact=?, designation=?, doj=?, salary=?, allowance=?, status=? WHERE id=?`).run(data.name, data.cnic, data.contact, data.designation, data.doj, data.salary, data.allowance, data.status, id);
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
                staff_id, 
                name, 
                salary, 
                allowance, 
                auth_leaves, 
                availed_leaves, 
                salary_month, 
                salary_year, 
                status
            ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'Unpaid')
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
const getSalaries = (month, year) => {
  return db.prepare(`
    SELECT 
      s.*, 
      st.designation,
      st.salary as original_base 
    FROM salary_tbl s
    JOIN staff_tbl st ON s.staff_id = st.id
    WHERE s.salary_month = ? AND s.salary_year = ?
  `).all(month, year);
};


const updateSalaryStatus = (id, status, paidSalary) => {
    // Added 'salary = ?' to the query
    return db.prepare("UPDATE salary_tbl SET status = ?, salary = ? WHERE id = ?")
             .run(status, paidSalary, id);
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

    // 2. Fee Received (Remains the same)
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

    const activeStudents = db.prepare("SELECT count(*) as count FROM students WHERE LOWER(status) = 'active'").get().count;
    const salaries = db.prepare("SELECT SUM(salary) as total FROM salary_tbl WHERE salary_month = ? AND salary_year = ?").get(month, year).total || 0;
    const expenses = db.prepare("SELECT SUM(exp_amount) as total FROM exp_tbl WHERE exp_month = ? AND exp_year = ?").get(month, year).total || 0;

    return { activeStudents, receivables, balance, salaries, feeReceived, expenses };
};

 
// Add these to Database.js
const getActiveClasses = () => {
    // Note: Use SINGLE QUOTES 'active' for the value
    return db.prepare("SELECT DISTINCT current_class FROM students WHERE status = 'Active' ORDER BY current_class ASC").all();
};

const initiateExamForClasses = (examId, selectedClasses) => {
    // 1. Create placeholders (?, ?, ?) based on number of selected classes
    const placeholders = selectedClasses.map(() => '?').join(',');
    
    const insertStmt = db.prepare(`
        INSERT INTO result (student_id, exam_id, class, sec)
        SELECT id, ?, current_class, section 
        FROM students 
        WHERE current_class IN (${placeholders}) 
        AND status = 'active'
        AND id NOT IN (
            SELECT student_id FROM result WHERE exam_id = ?
        )
    `);

    // Execute: [exam_id, ...classNames, exam_id_for_check]
    const result = insertStmt.run(examId, ...selectedClasses, examId);
    return { success: true, newlyAdded: result.changes };
};
// Add this inside database.js
// In database.js
const getStudentFeeHistory = (studentId) => {
    const student = db.prepare('SELECT student_name, registration_no FROM students WHERE id = ?').get(studentId);
    
    // Updated query to include a running total (Sub-total) of balance
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
// Corrected for better-sqlite3
function getStudentByReg(regNo) {
    console.log("DB function received regNo:", regNo); // See if this is undefined
    const student = db.prepare('SELECT * FROM students WHERE registration_no = ?').get(regNo);
    return student;
}

// Save student attendance batch
const saveStudentAttendance = (records, date) => {
    const insertStmt = db.prepare(`
        INSERT INTO student_attendance (student_id, date, status)
        VALUES (?, ?, ?)
        ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status
    `);
    const transaction = db.transaction((list) => {
        for (const record of list) {
            insertStmt.run(record.student_id, date, record.status);
        }
    });
    transaction(records);
    return { success: true };
};

// Get student attendance (Hides anyone with a saved status today)
const getStudentAttendanceByClass = (className, date) => {
  return {
    isMarked: false,
    records: db.prepare(`
      SELECT s.id as student_id, s.student_name, s.roll_no,
             s.registration_no, NULL as status
      FROM students s
      WHERE s.current_class = ?
        AND s.status = 'Active'
        AND s.id NOT IN (
          SELECT student_id FROM student_attendance WHERE date = ?
        )
      ORDER BY s.roll_no ASC
    `).all(className, date)
  };
};

// Get staff attendance (Hides anyone with a saved status today)
const getStaffAttendanceByDate = (date) => {
  return {
    isMarked: false,
    records: db.prepare(`
      SELECT st.id as staff_id, st.name, st.designation, NULL as status
      FROM staff_tbl st
      WHERE st.status = 'Active'
        AND st.id NOT IN (
          SELECT staff_id FROM staff_attendance WHERE date = ?
        )
      ORDER BY st.name ASC
    `).all(date)
  };
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
    const students = db.prepare(`
        SELECT id, roll_no, student_name 
        FROM students 
        WHERE current_class = ? AND LOWER(status) = 'active'
        ORDER BY roll_no ASC
    `).all(class_name);

    const attendance = db.prepare(`
        SELECT student_id, CAST(strftime('%d', date) AS INTEGER) as day, status 
        FROM student_attendance 
        WHERE date LIKE ?
    `).all(`${yearMonth}%`);

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
  (class_id, subject, lesson_no, question_type, question_text, opt1, opt2, opt3, opt4, correct_answer) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  return db.prepare(sql).run(q.classId, q.subject, q.lessonNo, q.type, q.text, q.opt1, q.opt2, q.opt3, q.opt4, q.answer);
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
  // Force classId to be a clean, strict integer
  const classId = parseInt(data.classId || data.class_id, 10);

  try {
    // Using CAST ensures SQLite matches the column data type perfectly
    const sql = `
      SELECT total_marks, passing_marks, obj_marks, subj_marks, note_objective, note_subjective 
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
  
  // Clean integer format conversion (fixes 1.0 down to a clean 1)
  const classId = parseInt(data.classId || data.class_id, 10); 
  
  const totalMarks = data.totalMarks || data.total_marks || 0;
  const passingMarks = data.passingMarks || data.passing_marks || 0;
  const objectiveMarks = data.objectiveMarks || data.obj_marks || 0;
  const subjectiveMarks = data.subjectiveMarks || data.subj_marks || 0;
  const noteObjective = data.noteObjective || data.note_objective || '';
  const noteSubjective = data.noteSubjective || data.note_subjective || '';

  try {
    // 1. Check if the row already exists using identifying columns
    const checkSql = `
      SELECT exam_type FROM exam_papers 
      WHERE exam_type = ? AND paper_name = ? AND CAST(class_id AS INTEGER) = ?
    `;
    const existing = db.prepare(checkSql).get(examType, paperName, classId);

    if (existing) {
      // 2. If it exists, UPDATE using those same columns in the WHERE clause
      const updateSql = `
        UPDATE exam_papers 
        SET total_marks = ?, passing_marks = ?, obj_marks = ?, subj_marks = ?, note_objective = ?, note_subjective = ?
        WHERE exam_type = ? AND paper_name = ? AND CAST(class_id AS INTEGER) = ?
      `;
      db.prepare(updateSql).run(
        totalMarks, passingMarks, objectiveMarks, subjectiveMarks, noteObjective, noteSubjective,
        examType, paperName, classId
      );
      console.log(`[Database] Settings updated successfully.`);
    } else {
      // 3. Otherwise, perform a clean INSERT
      const insertSql = `
        INSERT INTO exam_papers (exam_type, paper_name, class_id, total_marks, passing_marks, obj_marks, subj_marks, note_objective, note_subjective)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.prepare(insertSql).run(examType, paperName, classId, totalMarks, passingMarks, objectiveMarks, subjectiveMarks, noteObjective, noteSubjective);
      console.log(`[Database] Settings inserted successfully.`);
    }
    
    return { success: true };
  } catch (error) {
    console.error("SQL Write Failure inside savePaperSettingsOnly:", error);
    return { success: false, error: error.message };
  }
}





// Function to remove a specific question link from an exam paper layout template


module.exports = {
    db, checkUser, addUser, getAllUsers, addClass, getClasses, deleteClass, updateClass, getStudentGridReport,
    getStaffGridReport,addQuestionToPaper,getPaperQuestions,addQuestion,getQuestions,
    addStudent, getStudents, getStudentById, updateStudent, deleteStudent, getStudentMonthlyReport,getStaffMonthlyReport,
    generateFee, generateBulkFees, getFeeRecords, updateCollection, updateFeeRecord, 
    deleteFee, getFeeRecordById, getFeeRecordsFilters, getStaff, insertStaff, 
    updateStaff, deleteStaff, initiateSalary, getSalaries, updateSalaryStatus, 
    getDashboardStats, getUniqueInvoiceMonths, getUniqueInvoiceYears, getClassesFee,
    getActiveClasses, initiateExamForClasses, getStudentFeeHistory, updateAvailedLeaves,
    getFeeReportByStatus, getDateWiseReport, deleteFeeRecordsByStudent, deleteResultsByStudent,
    addDateSheetPaper, getDateSheetRecords, updateDateSheetPaper, deleteDateSheetPaper, changeUserPassword,
    getStudentByReg,  saveStudentAttendance,
    getStudentAttendanceByClass,getPaperSettings,
    saveStaffAttendance,uploadBulkQuestions, savePaperSettingsOnly,
    getStaffAttendanceByDate, removeQuestionFromPaper
};