// main.js
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
const { app, BrowserWindow, globalShortcut, ipcMain, dialog, protocol, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const dbLogic = require('./database.js');
const XLSX = require('xlsx');
// 1. PATH SETUP
const userDataPath = app.getPath('userData');
const imagesDir = path.join(userDataPath, 'images');
const configPath = path.join(userDataPath, 'config.json'); // Path for hidden time-tracking file

// 2. INITIALIZE DIRECTORIES
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}

// 3. PRIVILEGED PROTOCOLS
protocol.registerSchemesAsPrivileged([
  { scheme: 'safe-file', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// 4. EXPIRY CONFIGURATION
// Note: Months are 0-indexed in JS. 4 = May, 5 = June.
const EXPIRY_DATE = new Date(2026, 6, 30); // May 31, 2026

// 5. DATABASE IMPORTS
const { 
    db, 
    checkUser, changeUserPassword,uploadBulkQuestions,
    addUser, saveStudentAttendance,getPaperSettings,
    getStudentAttendanceByClass,getStudentGridReport,
    getStaffGridReport,addQuestion,getQuestions,
    saveStaffAttendance,addQuestionToPaper,getPaperQuestions,
    getStaffAttendanceByDate,savePaperSettingsOnly,
    deleteStudent,removeQuestionFromPaper,
    deleteFeeRecordsByStudent, 
    deleteResultsByStudent, getStudentByReg
} = require('./database.js');

let win;
Menu.setApplicationMenu(null); 

function createWindow() {
    // --- OFFLINE PROTECTION & EXPIRY LOGIC (OPTION 2) ---
    const today = new Date();
    let lastRunDate;

    // Load or create the last known date
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath));
            lastRunDate = new Date(config.lastRun);
        } catch (e) {
            lastRunDate = today;
        }
    } else {
        lastRunDate = today;
    }

    // Check A: Clock Tampering (System time is earlier than the last recorded run)
    if (today < lastRunDate) {
        dialog.showErrorBox(
            "Time Tamper Detected", 
            "Your system clock is incorrect or has been set back. Please correct your time settings to continue."
        );
        app.quit();
        return;
    }

    // Check B: License Expiry
    if (today > EXPIRY_DATE) {
        dialog.showErrorBox(
            "System Lock", 
            "Your license has expired. Please contact the administrator to continue using this software.\nContact: 0311-5101738\nE-mail: techinfolab360@gmail.com"
        );
        app.quit();
        return;
    }

    // Update the "Last Run" date to today
    fs.writeFileSync(configPath, JSON.stringify({ lastRun: today.toISOString() }));

    // --- BROWSER WINDOW SETUP ---
    win = new BrowserWindow({
        width: 1920,
        height: 1080,
        titleBarStyle: "default",
        backgroundColor: "#fdf0d5",
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), 
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });
    

    win.webContents.setWindowOpenHandler(({ url }) => {
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                webPreferences: {
                    preload: path.join(__dirname, 'preload.js'),
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: false
                }
            }
        };
    });

    win.loadFile(path.join(__dirname, 'components', 'login.html'));
    win.on('closed', () => { win = null; });
}

// --- IPC HANDLERS ---

// Navigation Helper

ipcMain.on('change-page', (event, pageUrl) => {
    if (win) {
        // Use loadURL instead of loadFile
        const fullPath = path.join(__dirname, pageUrl);
        win.loadURL(`file://${fullPath}`);
    }
});

//backup of db

// backup of db
function backupDatabaseDaily() {
  try {
    // 1. FIXED: Now points to userData folder where school.db actually lives
    const sourceDbPath = path.join(userDataPath, 'school.db');
    
    // 2. Define the absolute destination path on D Drive
    const backupFolder = 'D:\\SchoolApp';
    
    // 3. Automatically create the backups folder if it does not exist
    if (!fs.existsSync(backupFolder)) {
      fs.mkdirSync(backupFolder, { recursive: true });
      console.log("📁 Created Backup Folder: " + backupFolder);
    }
    
    // 4. Generate the current date filename format (e.g., backup-2026-06-15.db)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const backupFileName = `backup-schoolDB-${day}-${month}-${year}.db`;
    const destinationDbPath = path.join(backupFolder, backupFileName);
    
    // 5. Run the backup only if a backup for today hasn't been created yet
    if (!fs.existsSync(destinationDbPath)) {
      if (fs.existsSync(sourceDbPath)) {
        fs.copyFileSync(sourceDbPath, destinationDbPath);
        console.log(`💾 Daily backup created successfully: ${backupFileName}`);
      } else {
        console.error("❌ Backup failed: Source database file not found.");
      }
    } else {
      console.log("ℹ️ Backup skipped: Today's backup already exists.");
    }
  } catch (error) {
    console.error("❌ Crucial Backup Engine Error:", error);
  }
}


//backup ends
//change password
ipcMain.handle('change-password', async (event, currentP, newP) => {
    return changeUserPassword(currentP, newP);
});



// Licence status
ipcMain.handle('get-license-status', () => {
    const today = new Date();
    const diffTime = EXPIRY_DATE - today;
    if (diffTime <= 0) return "Expired";
    const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    return `(Validity Period: ${months} Months, ${days} Days Remaining)`;
});
ipcMain.handle('get-image-url', (event, picturePath) => {
    if (picturePath) {
        const fullPath = path.join(imagesDir, picturePath);
        // Check if file exists
        if (fs.existsSync(fullPath)) {
            return `file://${fullPath}`;
        } else {
            console.warn('Image file not found:', fullPath);
            return null;
        }
    } else {
        return null;
    }
});


// Auth
ipcMain.handle('login-attempt', async (event, credentials) => {
    try {
        const user = checkUser(credentials.username, credentials.password);
        return user ? { success: true, user } : { success: false, message: "Invalid credentials" };
    } catch (err) { return { success: false, message: "Database Error" }; }
});

ipcMain.handle('add-user', async (event, userData) => {
    try { addUser(userData); return { success: true }; } 
    catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('update-user', async (event, userData) => {
  try {
    if (userData.password && userData.password.trim() !== "") {
      db.prepare(`UPDATE users SET username = ?, password = ?, usertype = ?, permissions = ? WHERE id = ?`)
        .run(userData.username, userData.password, userData.usertype, userData.permissions, userData.id);
    } else {
      db.prepare(`UPDATE users SET username = ?, usertype = ?, permissions = ? WHERE id = ?`)
        .run(userData.username, userData.usertype, userData.permissions, userData.id);
    }
    return { success: true };
  } catch (err) {
    console.error("Database Update User Error:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.on('logout-trigger', () => { 
    if (win) win.loadFile(path.join(__dirname, 'components', 'login.html')); 
});

// User Management
ipcMain.handle('get-all-users', async () => {
    try {
        const { getAllUsers } = require('./database.js'); 
        return getAllUsers();
    } catch (err) {
        console.error("Error fetching users:", err);
        return [];
    }
});

ipcMain.handle('delete-user', async (event, id) => {
    try {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// UI Fixes
ipcMain.on('fix-focus', (event) => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    if (focusedWindow) {
        focusedWindow.setIgnoreMouseEvents(false); 
        focusedWindow.blur();
        setTimeout(() => {
            if (!focusedWindow.isDestroyed()) {
                focusedWindow.focus();
                focusedWindow.webContents.focus();
            }
        }, 50);
    }
});

// Classes management
ipcMain.handle('get-classes', async () => {
    return dbLogic.getClasses();
});
ipcMain.handle('add-class', async (event, name) => {
    return dbLogic.addClass(name);
});
ipcMain.handle('delete-class', async (event, id) => {
    return dbLogic.deleteClass(id);
});
ipcMain.handle('update-class', async (event, id, name) => {
    return dbLogic.updateClass(id, name);
});


ipcMain.handle('get-image-folder', () => {
    // 1. Log to the terminal (Main Process console)
    console.log("Attempting to retrieve Image Directory:", imagesDir);

    // 2. Check if the directory actually exists
    if (imagesDir && fs.existsSync(imagesDir)) {
        console.log("✅ Directory confirmed at:", imagesDir);
        return imagesDir;
    } else {
        console.error("❌ Directory NOT found or undefined:", imagesDir);
        return null; // Or return a specific error message
    }
});


// main.js - Update the add-student handler
// main.js - Update the add-student handler
ipcMain.handle('add-student', async (event, studentData) => {
    try {
        let fileNameForDB = ''; 
        if (studentData.pic && fs.existsSync(studentData.pic)) {
            const ext = path.extname(studentData.pic);
            const fileName = `reg_${studentData.regNo}${ext}`;
            const destination = path.join(imagesDir, fileName);
            fs.copyFileSync(studentData.pic, destination);
            fileNameForDB = fileName; 
        }
        // Update the object with the filename before sending to DB
        const dataToSave = { ...studentData, pic: fileNameForDB };
        return dbLogic.addStudent(dataToSave);
    } catch (error) {
        console.error("Error saving student:", error);
        throw error;
    }
});

// Update the update-student handler similarly
ipcMain.handle('update-student', async (event, studentData) => {
    try {
        let fileNameForDB = studentData.pic; 
        if (studentData.pic && fs.existsSync(studentData.pic) && path.isAbsolute(studentData.pic)) {
            const ext = path.extname(studentData.pic);
            const fileName = `reg_${studentData.regNo}${ext}`;
            const destination = path.join(imagesDir, fileName);
            fs.copyFileSync(studentData.pic, destination);
            fileNameForDB = fileName;
        }
        const dataToSave = { ...studentData, pic: fileNameForDB };
        return dbLogic.updateStudent(dataToSave);
    } catch (error) {
        throw error;
    }
});


ipcMain.handle('get-students', async () => {
    try {
        return dbLogic.getStudents();
    } catch (err) {
        console.error("Fetch Error:", err);
        return [];
    }
});

ipcMain.handle('deleteStudentAndRelated', async (event, studentId) => {
  try {
    // Wrap in a transaction if your database supports it
    // or just execute sequentially
    // Note: better-sqlite3 supports transactions via db.transaction
    const transaction = db.transaction(() => {
      deleteFeeRecordsByStudent(studentId);
      deleteResultsByStudent(studentId);
      deleteStudent(studentId);
    });
    transaction(); // execute transaction
    return { success: true };
  } catch (err) {
    console.error('Error deleting student and related:', err);
    return { success: false, error: err.message };
  }
});


ipcMain.handle('get-student-by-id', async (event, id) => {
    return dbLogic.getStudentById(id);
});

ipcMain.handle('bulk-update-fees', async (event, { exam, lab, misc, remarks, month, year, className }) => {
    try {
        const sql = `
            UPDATE fee_tbl 
            SET exam_fee = ?, 
                lab_fee = ?, 
                misc_fee = ?, 
                misc_remarks = ? 
            WHERE invoice_month = ? 
              AND invoice_year = ? 
              AND current_class = ?
        `;
        const stmt = db.prepare(sql);
        // Ensure remarks is passed here
        const info = stmt.run(exam, lab, misc, remarks, month, year, className); 
        return { success: true, count: info.changes };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


// In Main.js - Replace the existing handler
ipcMain.handle('update-single-fee-field', async (event, { id, field, value, remarks }) => {
    try {
        const allowedFields = ['adm_fee', 'tuition_fee', 'exam_fee', 'lab_fee', 'misc_fee'];
        if (!allowedFields.includes(field)) throw new Error("Invalid field");

        let sql;
        let params;

        // If updating misc_fee, update the remarks as well
        if (field === 'misc_fee') {
            sql = `UPDATE fee_tbl SET misc_fee = ?, misc_remarks = ? WHERE id = ?`;
            params = [value, remarks, id];
        } else {
            sql = `UPDATE fee_tbl SET ${field} = ? WHERE id = ?`;
            params = [value, id];
        }

        const stmt = db.prepare(sql);
        const info = stmt.run(...params);
        return { success: info.changes > 0 };
    } catch (err) {
        console.error("Database Error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('save-to-pdf', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    // This triggers the native system dialog directly
    win.webContents.print({
        silent: false, // This ensures the prompt action happens
        printBackground: true,
        deviceName: ''
    });
    return true;
});





async function saveRemarks(resultId) {
    const newRemarks = document.getElementById(`input-${resultId}`).value;
    try {
        const success = await window.api.updateResultRemarks(resultId, newRemarks);
        if (success) {
            // Check this ID! It must match exactly what is in your <div> or <span>
            const displayElement = document.getElementById(`display-text-${resultId}`); 
            
            if (displayElement) {
                displayElement.innerText = newRemarks || 'No remarks.';
            }
            cancelEdit(resultId);
        }
    } catch (err) {
        console.error("Save error:", err);
    }
}
// Replace this with your actual database update logic
ipcMain.handle('update-result-remarks', async (event, resultId, remarks) => {
    try {
        // This is the SQL execution line that was missing
        const stmt = db.prepare('UPDATE result SET remarks = ? WHERE result_id = ?');
        const info = stmt.run(remarks, resultId);
        
        console.log(`Updated result_id: ${resultId}`);
        return info.changes > 0; // Returns true if save was successful
    } catch (error) {
        console.error("Database update failed:", error);
        return false;
    }
});






// Fee Management
ipcMain.handle('generate-bulk-fees', async (event, month, year) => {
    try {
        // Now passing month and year to the database logic
        return dbLogic.generateBulkFees(month, year);
    } catch (error) {
        console.error("IPC Error (generate-bulk-fees):", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('generate-student-fee', async (event, studentId, month, year) => {
    try {
        // Now passing month and year to the database logic
        return dbLogic.generateFee(studentId, month, year);
    } catch (error) {
        console.error("IPC Error (generate-student-fee):", error);
        throw error; 
    }
});

ipcMain.handle('get-fee-records-filters', async (event, filters) => { 
    return dbLogic.getFeeRecordsFilters(filters); 
});

ipcMain.handle('get-filter-data', async () => {
    return {
        months: dbLogic.getUniqueInvoiceMonths(),
        years: dbLogic.getUniqueInvoiceYears(),
        classes: dbLogic.getClasses()
    };
});

ipcMain.handle('update-fee-collection', async (event, { id, amount, date }) => {
    return dbLogic.updateCollection(id, amount, date);
});

ipcMain.handle('get-fee-record-by-id', async (event, id) => {
    return dbLogic.getFeeRecordById(id);
});

ipcMain.handle('update-fee-submit', async (event, data) => {
    const { id, amount } = data; 
    return dbLogic.updateCollection(id, amount);
});

ipcMain.handle('delete-fee', async (event, id) => {
    return dbLogic.deleteFee(id); 
});

ipcMain.handle('get-student-fee-history', async (event, studentId) => {
    try {
        return dbLogic.getStudentFeeHistory(studentId);
    } catch (error) {
        console.error("Failed to fetch fee history:", error);
        throw error;
    }
});

// Exam Management
ipcMain.handle('get-active-classes', async () => {
    try {
        return dbLogic.getActiveClasses();
    } catch (err) {
        console.error("Database Error:", err);
        return [];
    }
});

ipcMain.handle('create-exam-name', async (event, examName) => {
    try {
        // Check if exam name already exists
        const existing = db.prepare('SELECT 1 FROM exams WHERE exam_name = ?').get(examName);
        if (existing) {
            return { success: false, error: "This Exam Name already exists!" };
        }
        const info = db.prepare('INSERT INTO exams (exam_name) VALUES (?)').run(examName);
        return { success: true, examId: info.lastInsertRowid };
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            // Handle the uniqueness error if constraint is added
            return { success: false, error: "This Exam Name already exists!" };
        }
        return { success: false, error: err.message };
    }
});


ipcMain.handle('initiate-exam-logic', async (event, { examId, selectedClasses }) => {
    try {
        return dbLogic.initiateExamForClasses(examId, selectedClasses);
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-dropdown-data', async () => {
    try {
        const exams = db.prepare('SELECT exam_id, exam_name FROM exams ORDER BY created_at DESC').all();
        const classes = db.prepare('SELECT id, class_name FROM classes ORDER BY class_name ASC').all();
        return { success: true, exams, classes };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('update-set-marks', async (event, data) => {
    try {
        if (!data) throw new Error("No data received from frontend");
        const sql = `
            UPDATE result 
            SET urdu_setmarks = ?, eng_setmarks = ?, math_setmarks = ?, sst_setmarks = ?, 
            islamiat_setmarks = ?, science_setmarks = ?, physics_setmarks = ?, 
            chemistry_setmarks = ?, biology_setmarks = ?, computer_setmarks = ?, 
            drawing_setmarks = ?, geography_setmarks = ?, total_setmarks = ?
            WHERE exam_id = ? AND class = ?
        `;
        const stmt = db.prepare(sql);
        const info = stmt.run(
            data.urdu, data.eng, data.math, data.sst, data.islamiat, data.science, 
            data.physics, data.chemistry, data.biology, data.computer, data.drawing, 
            data.geography, data.total, data.exam_id, data.current_class
        );
        return { success: true, changes: info.changes };
    } catch (err) {
        console.error("Update Error:", err);
        return { success: false, error: err.message };
    }
});

// Add these handlers in main.js
// In main.js - Replace the existing get-all-student-progress handler
// main.js
ipcMain.handle('get-all-student-progress', async (event, filters = {}) => {
    try {
        const { examId, className } = filters;
        
        // 1. Start with the base query (No WHERE clause yet)
        let sql = `
            SELECT r.*, s.student_name, s.father_name, s.picture_path, s.roll_no, s.registration_no 
            FROM result r 
            JOIN students s ON r.student_id = s.id
        `;
        
        const params = [];

        // 2. Add filtering only if values are provided
        if (examId && className) {
            sql += ` WHERE r.exam_id = ? AND r.class = ?`;
            params.push(examId, className);
        }
        
        // 3. Add ordering
        sql += ` ORDER BY r.total_obt DESC`;
        
        const stmt = db.prepare(sql);

        // 4. Execute with parameters if they exist, otherwise fetch all
        const results = params.length > 0 ? stmt.all(...params) : stmt.all();
        
        console.log(`Found ${results.length} records for Exam: ${examId}, Class: ${className}`);
        return results;

    } catch (err) {
        console.error("Database Error in Progress Reports:", err);
        return [];
    }
});


ipcMain.handle('get-student-progress', async (event, studentId) => {
    return db.prepare('SELECT r.*, s.student_name, s.father_name, s.picture_path, s.roll_no, s.registration_no FROM result r JOIN students s ON r.student_id = s.id WHERE r.student_id = ?').get(studentId);
});


ipcMain.handle('get-report-data', async (event, { examId, className }) => {
    try {
        const sql = `
            SELECT r.*, s.student_name, s.registration_no 
            FROM result r
            JOIN students s ON r.student_id = s.id
            WHERE r.exam_id = ? AND r.class = ?
            ORDER BY r.total_obt DESC
        `;
        const data = db.prepare(sql).all(examId, className);
        return { success: true, data };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('recalculate-positions', async (event, { examId, className }) => {
    try {
        const students = db.prepare(`
            SELECT result_id FROM result 
            WHERE exam_id = ? AND class = ? 
            ORDER BY total_obt DESC, percentage DESC
        `).all(examId, className);
        const updateStmt = db.prepare('UPDATE result SET position = ? WHERE result_id = ?');
        const transaction = db.transaction((list) => {
            list.forEach((s, index) => {
                updateStmt.run(index + 1, s.result_id);
            });
        });
        transaction(students);
        return { success: true };
    } catch (err) {
        console.error("Position Error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('update-student-marks', async (event, s) => {
    try {
        const totalObt = (
            Number(s.urdu_obt) + Number(s.eng_obt) + Number(s.math_obt) +
            Number(s.sst_obt) + Number(s.islamiat_obt) + Number(s.science_obt) +
            Number(s.physics_obt) + Number(s.chemistry_obt) + Number(s.biology_obt) +
            Number(s.computer_obt) + Number(s.drawing_obt) + Number(s.geography_obt)
        );
        const percentage = (totalObt / Number(s.total_setmarks)) * 100;
        let grade = 'F';
        if (percentage >= 90) grade = 'A+';
        else if (percentage >= 80) grade = 'A';
        else if (percentage >= 70) grade = 'B+';
        else if (percentage >= 60) grade = 'B';
        else if (percentage >= 50) grade = 'C';
        else if (percentage >= 40) grade = 'D';
        const status = percentage >= 40 ? 'Pass' : 'Fail';
        const sql = `
            UPDATE result SET 
            urdu_obt=?, eng_obt=?, math_obt=?, sst_obt=?, islamiat_obt=?, science_obt=?, 
            physics_obt=?, chemistry_obt=?, biology_obt=?, computer_obt=?, drawing_obt=?, 
            geography_obt=?, total_obt=?, percentage=?, grade=?, result_status=?
            WHERE result_id = ?
        `;
        db.prepare(sql).run(
            s.urdu_obt, s.eng_obt, s.math_obt, s.sst_obt, s.islamiat_obt, s.science_obt,
            s.physics_obt, s.chemistry_obt, s.biology_obt, s.computer_obt, s.drawing_obt, 
            s.geography_obt, totalObt, percentage, grade, status, s.result_id
        );
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Staff & Salary Management
ipcMain.handle('get-staff', async () => {
    return dbLogic.getStaff();
});
ipcMain.handle('add-staff', async (event, data) => {
    return dbLogic.insertStaff(data);
});
ipcMain.handle('update-staff', async (event, id, data) => {
    return dbLogic.updateStaff(id, data);
});
ipcMain.handle('delete-staff', async (event, id) => {
    return dbLogic.deleteStaff(id);
});
ipcMain.handle('initiate-salary', async (event, month, year) => {
    return dbLogic.initiateSalary(month, year);
});
ipcMain.handle('get-salaries', async (event, { month, year }) => {
    return dbLogic.getSalaries(month, year);
});
// main.js
// main.js handler
// Change from (event, id, status, salary) to (event, { id, status, salary })
ipcMain.handle('update-salary-status', async (event, { id, status, salary }) => {
    try {
        // Now id, status, and salary are correctly defined from the object
        const stmt = db.prepare("UPDATE salary_tbl SET status = ?, salary = ? WHERE id = ?");
        const info = stmt.run(status, salary, id);
        return info.changes > 0;
    } catch (err) {
        console.error("Payment Error:", err);
        return false;
    }
});



ipcMain.handle('get-dashboard-stats', async () => {
    return dbLogic.getDashboardStats();
});
// --- FIX FOR AUTH LEAVES ---
// main.js
ipcMain.handle('update-auth-leaves', async (event, { id, count }) => {
    const stmt = db.prepare("UPDATE salary_tbl SET auth_leaves = ? WHERE id = ? AND status = 'Unpaid'");
    const info = stmt.run(count, id);
    return info.changes > 0;
});

ipcMain.handle('update-availed-leaves', async (event, { id, count }) => {
    const stmt = db.prepare("UPDATE salary_tbl SET availed_leaves = ? WHERE id = ? AND status = 'Unpaid'");
    const info = stmt.run(count, id);
    return info.changes > 0;
});



// Reports
ipcMain.handle('get-status-report', async (event, statusType) => {
    return dbLogic.getFeeReportByStatus(statusType);
});
ipcMain.handle('get-date-wise-report', async (event, selectedDate) => {
    return dbLogic.getDateWiseReport(selectedDate);
});

ipcMain.on('open-db-folder', () => {
    const userDataPath = app.getPath('userData');
    shell.openPath(userDataPath); 
});
ipcMain.handle('add-expense', async (event, data) => {
    try {
        const now = new Date();
        const month = now.toLocaleString('default', { month: 'long' });
        const year = now.getFullYear();

        // FIX: Changed 'expense' to 'expence' to match your DB schema in the image
        const stmt = db.prepare(`
            INSERT INTO exp_tbl (expence, exp_amount, exp_year, exp_month, created_at) 
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        
        const info = stmt.run(data.expense, data.amount, year, month);
        return { success: info.changes > 0 };
    } catch (err) {
        console.error("Database Error:", err);
        return { success: false, error: err.message };
    }
});


ipcMain.handle('get-expense-filters', async () => {
    try {
        const months = db.prepare("SELECT DISTINCT exp_month FROM exp_tbl").all();
        const years = db.prepare("SELECT DISTINCT exp_year FROM exp_tbl").all();
        return { months, years };
    } catch (err) {
        return { months: [], years: [] };
    }
});

// Update your get-expenses handler to use 'exp_month'
ipcMain.handle('get-expenses', async (event, filters) => {
    try {
        let query = "SELECT * FROM exp_tbl WHERE 1=1";
        const params = [];

        if (filters.month) {
            query += " AND exp_month = ?"; // Changed from exp_mon
            params.push(filters.month);
        }
        if (filters.year) {
            query += " AND exp_year = ?";
            params.push(filters.year);
        }
        return db.prepare(query).all(...params);
    } catch (err) {
        console.error(err);
        return [];
    }
});
//datesheet
// main.js

ipcMain.handle('get-datesheet', async (event, filters) => {
    try {
        // Use the function from your database.js which already has the correct JOINs
        return dbLogic.getDateSheetRecords(filters); 
    } catch (err) {
        console.error(err);
        return [];
    }
});

ipcMain.handle('add-datesheet', async (event, data) => {
    try {
        dbLogic.addDateSheetPaper(data);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('update-datesheet', async (event, data) => {
    try {
        dbLogic.updateDateSheetPaper(data);
        return { success: true };
    } catch (err) {
        console.error(err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('delete-datesheet', async (event, id) => {
    try {
        // This will now find the function exported from database.js
        dbLogic.deleteDateSheetPaper(id); 
        return { success: true };
    } catch (err) {
        console.error(err);
        return { success: false, error: err.message };
    }
});
//certificate purpose
// Add this inside your main.js where other ipcMain.handle calls are
ipcMain.handle('get-student-by-regno', async (event, regNo) => {
    try {
        // Simply return the result from the synchronous db function
        return dbLogic.getStudentByReg(regNo);
    } catch (err) {
        console.error("Error fetching student for SLC:", err);
        return null;
    }
});




//certificate ends


//attendance
// --- STUDENT ATTENDANCE HANDLERS ---
ipcMain.handle('get-student-attendance', async (event, { className, date }) => {
    try {
        const { getStudentAttendanceByClass } = require('./database.js');
        return getStudentAttendanceByClass(className, date);
    } catch (err) {
        console.error("Error fetching student attendance:", err);
        return [];
    }
});

ipcMain.handle('save-student-attendance', async (event, { records, date }) => {
    try {
        const { saveStudentAttendance } = require('./database.js');
        return saveStudentAttendance(records, date);
    } catch (err) {
        console.error("Error saving student attendance:", err);
        return { success: false, error: err.message };
    }
});

// --- STAFF ATTENDANCE HANDLERS ---
ipcMain.handle('get-staff-attendance', async (event, { date }) => {
    try {
        const { getStaffAttendanceByDate } = require('./database.js');
        return getStaffAttendanceByDate(date);
    } catch (err) {
        console.error("Error fetching staff attendance:", err);
        return [];
    }
});

ipcMain.handle('save-staff-attendance', async (event, { records, date }) => {
    try {
        const { saveStaffAttendance } = require('./database.js');
        return saveStaffAttendance(records, date);
    } catch (err) {
        console.error("Error saving staff attendance:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-student-monthly-report', async (event, { className, yearMonth }) => {
    try {
        const { getStudentMonthlyReport } = require('./database.js');
        return getStudentMonthlyReport(className, yearMonth);
    } catch (err) {
        console.error(err);
        return [];
    }
});

ipcMain.handle('get-staff-monthly-report', async (event, { yearMonth }) => {
    try {
        const { getStaffMonthlyReport } = require('./database.js');
        return getStaffMonthlyReport(yearMonth);
    } catch (err) {
        console.error(err);
        return [];
    }
});

ipcMain.handle('get-student-grid-report', async (event, { className, yearMonth }) => {
    try {
        const { getStudentGridReport } = require('./database.js');
        return getStudentGridReport(className, yearMonth);
    } catch (err) {
        console.error(err);
        return { students: [], attendance: [] };
    }
});

ipcMain.handle('get-staff-grid-report', async (event, { yearMonth }) => {
    try {
        const { getStaffGridReport } = require('./database.js');
        return getStaffGridReport(yearMonth);
    } catch (err) {
        console.error(err);
        return { staff: [], attendance: [] };
    }
});

//attendance ends
// //whatsapp code Start
ipcMain.on('open-external-link', (event, url) => {
    shell.openExternal(url);
});


//q bank
// --- QUESTION BANK & EXAM PAPER BUILDER HANDLERS ---

// 1. Save a new question to the pool
ipcMain.handle('add-question', async (event, questionData) => {
    try {
        // Calls the imported database function
        const result = await addQuestion(questionData);
        return { success: true, result };
    } catch (err) {
        console.error("Database Error saving question:", err);
        return { success: false, error: err.message };
    }
});

// 2. Fetch filtered questions for the pool layout
ipcMain.handle('get-questions', async (event, classId, subject, lessonNo) => {
    try {
        // Calls the imported database function with parameters
        return await getQuestions(classId, subject, lessonNo);
    } catch (err) {
        console.error("Database Error fetching questions:", err);
        return [];
    }
});

// Add this handler inside main.js
ipcMain.handle('add-question-to-paper', async (event, data) => {
  try {
    return addQuestionToPaper(data);
  } catch (err) {
    console.error("Database Error (add-question-to-paper):", err);
    return { success: false, error: err.message };
  }
});




// Fetch all saved questions belonging to a specific exam paper
ipcMain.handle('get-paper-questions', async (event, examType, classId, paperName) => {
  try {
    return getPaperQuestions(examType, classId, paperName); // Added return here!
  } catch (err) {
    console.error(err);
    return [];
  }
});


// Add this handler inside Main.js
ipcMain.handle('upload-excel-questions', async (event, { classId, subject, lessonNo, filePath }) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Read the very first sheet
    const worksheet = workbook.Sheets[sheetName];
    
    // 1. Get raw rows from Excel
    const rawData = XLSX.utils.sheet_to_json(worksheet);
    
    // 2. Process and filter rows to make sure they aren't empty
    const sanitizedQuestions = [];
    
    for (let row of rawData) {
      // Create a clean object with lowercase, trimmed header keys
      const cleanRow = {};
      Object.keys(row).forEach(key => {
        const cleanKey = key.trim().toLowerCase();
        cleanRow[cleanKey] = row[key];
      });

      // Skip row completely if it doesn't have a question body text
      if (!cleanRow.question_text || String(cleanRow.question_text).trim() === "") {
        continue; 
      }

      // Add to our safe list
      sanitizedQuestions.push({
        question_text: String(cleanRow.question_text).trim(),
        question_type: cleanRow.question_type ? String(cleanRow.question_type).trim() : 'MCQ',
        opt1: cleanRow.opt1 ? String(cleanRow.opt1).trim() : null,
        opt2: cleanRow.opt2 ? String(cleanRow.opt2).trim() : null,
        opt3: cleanRow.opt3 ? String(cleanRow.opt3).trim() : null,
        opt4: cleanRow.opt4 ? String(cleanRow.opt4).trim() : null,
        correct_answer: cleanRow.correct_answer ? String(cleanRow.correct_answer).trim() : null
      });
    }

    // 3. If no valid rows found, throw a clear alert error
    if (sanitizedQuestions.length === 0) {
      throw new Error("No data found! Check if your first row has correct headers like 'question_text'.");
    }
    
    // 4. Import clean rows utilizing database engine transaction
    const { uploadBulkQuestions } = require('./database.js');
    const totalInserted = uploadBulkQuestions(classId, subject, lessonNo, sanitizedQuestions);
    
    return { success: true, count: totalInserted };
  } catch (error) {
    console.error("Excel Upload Error:", error);
    return { success: false, error: error.message };
  }
});
// Add these inside your IPC HANDLERS section in main.js
ipcMain.handle('get-paper-settings', async (event, data) => {
  try {
    const { getPaperSettings } = require('./database.js');
    return getPaperSettings(data); // Pass the raw object to database.js
  } catch (err) {
    console.error("IPC Error (get-paper-settings):", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-paper-settings-only', async (event, data) => {
  try {
    const dbModule = require('./database.js');
    // Force it to use the exact function name we just updated
    return dbModule.savePaperSettingsOnly(data); 
  } catch (err) {
    console.error("IPC Error in save-paper-settings-only:", err);
    return { success: false, error: err.message };
  }
});


// IPC Handler to listen for question deletion requests from the frontend window
ipcMain.handle('remove-question-from-paper', async (event, id) => {
  try {
    console.log(id);
    return removeQuestionFromPaper(id);
    
  } catch (err) {
    console.error("IPC Main Error (remove-question-from-paper):", err);
    return { success: false, error: err.message };
  }
});



//q bank ends


//whatsap code ends

// --- LIFECYCLE ---
app.whenReady().then(() => {
    createWindow();       // Opens Login/Main window
    // createWeightWindow(); // Opens the Scale display window
    backupDatabaseDaily();
});

app.on('window-all-closed', () => { 
    if (process.platform !== 'darwin') app.quit(); 
});

app.on('will-quit', () => { 
    globalShortcut.unregisterAll(); 
    if (db) db.close(); 
});