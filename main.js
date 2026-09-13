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
const EXPIRY_DATE = new Date(2027, 12, 31); // May 31, 2026

// 5. DATABASE IMPORTS
const { 
    db, 
    checkUser, changeUserPassword,uploadBulkQuestions,deleteEntirePaper,
    addUser, saveStudentAttendance,getPaperSettings, insertStaff,
    getStudentAttendanceByClass,getStudentGridReport,deleteExamCascade,
    getStaffGridReport,addQuestion,getQuestions,
    saveStaffAttendance,addQuestionToPaper,getPaperQuestions,
    getStaffAttendanceByDate,savePaperSettingsOnly,
    deleteStudent,removeQuestionFromPaper,
    deleteFeeRecordsByStudent, updateQuestionText,
    deleteResultsByStudent, getStudentByReg
} = require('./database.js');

let win;
// Menu.setApplicationMenu(null); 

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
            // "Your system clock is incorrect or has been set back. Please correct your time settings to continue."

        );
        app.quit();
        return;
    }

    // Check B: License Expiry
    // Check B: License Expiry & Proactive Renewal Alerts
const millisecondsPerDay = 1000 * 60 * 60 * 24;
const daysRemaining = Math.ceil((EXPIRY_DATE - today) / millisecondsPerDay);

if (daysRemaining <= 0) {
    // Total Lockout: Triggered once the expiry date passes
    dialog.showMessageBoxSync({
        type: 'warning',
        title: 'System Operational Lock',
        message: 'Your system cannot operate without the required structural updates.\n\nPlease contact the administrator immediately to avoid prolonged service disruption.\n\nContact: 0311-5101738\nE-mail: techinfolab360@gmail.com'
    });
    app.quit();
    return;
} else if (daysRemaining <= 10) {
    // Proactive Reminder: Pops up 10 days before expiry, but lets the user continue working
    dialog.showMessageBoxSync({
        type: 'info',
        title: 'Mandatory System Update Required',
        message: `Necessary application updates have been detected. Please update your system within the next ${daysRemaining} day(s) to avoid any operational inconvenience.`
    });
}


    // Update the "Last Run" date to today
    fs.writeFileSync(configPath, JSON.stringify({ lastRun: today.toISOString() }));

    // --- BROWSER WINDOW SETUP ---
    win = new BrowserWindow({
        width: 800,
        height: 400,
        titleBarStyle: "default",
        backgroundColor: "#fdf0d5",
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), 
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });
    win.maximize(); 

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
        // Formulates a clean URL matching standard browser protocols
        const fullUrl = `file://${path.join(__dirname, pageUrl)}`;
        win.loadURL(fullUrl);
    }
});


//backup of db

// backup of db
function backupDatabaseDaily() {
  try {
    // PRODUCTION FIX: Correctly maps to the isolated Electron system path
    const sourceDbPath = path.join(app.getPath('userData'), 'school.db');
    
    // Define absolute destination path on D Drive
    const backupFolder = 'D:\\SchoolApp-Backup';
    
    // Automatically create the backups folder if it does not exist
    if (!fs.existsSync(backupFolder)) {
      fs.mkdirSync(backupFolder, { recursive: true });
      console.log("📁 Created Backup Folder: " + backupFolder);
    }
    
    // Generate the current date filename format (e.g., backup-schoolDB-15-06-2026.db)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const backupFileName = `backup-schoolDB-${day}-${month}-${year}.db`;
    const destinationDbPath = path.join(backupFolder, backupFileName);
    
    // Run the backup only if a backup for today hasn't been created yet
    if (!fs.existsSync(destinationDbPath)) {
      if (fs.existsSync(sourceDbPath)) {
        fs.copyFileSync(sourceDbPath, destinationDbPath);
        console.log(`💾 Daily backup created successfully: ${backupFileName}`);
      } else {
        console.error("❌ Backup failed: Source database file not found at " + sourceDbPath);
      }
    } else {
      console.log("ℹ️ Backup skipped: Today's backup already exists.");
    }
  } catch (error) {
    console.error("❌ Crucial Backup Engine Error:", error);
  }
}


function backupImagesDaily() {
  try {
    // Define the absolute destination path for images on D Drive
    const backupImagesFolder = 'D:\\SchoolApp-Backup\\images';
    
    // Automatically create the backups folder if it does not exist
    if (!fs.existsSync(backupImagesFolder)) {
      fs.mkdirSync(backupImagesFolder, { recursive: true });
      console.log("📁 Created Image Backup Folder: " + backupImagesFolder);
    }
    
    // PRODUCTION FIX: Scans your dynamic runtime image directory (imagesDir) instead of hardcoded paths
    if (fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir);
      files.forEach(file => {
        const sourceFilePath = path.join(imagesDir, file);
        const destFilePath = path.join(backupImagesFolder, file);
        
        // Only copy the image if it doesn't already exist in the backup folder
        if (!fs.existsSync(destFilePath)) {
          fs.copyFileSync(sourceFilePath, destFilePath);
          console.log(`📸 Image backup created successfully: ${file}`);
        }
      });
    } else {
      console.warn("⚠️ Image backup skipped: Source images directory not found at " + imagesDir);
    }
  } catch (error) {
    console.error("❌ Crucial Image Backup Engine Error:", error);
  }
}



//backup ends
//change password
ipcMain.handle('change-password', async (event, currentP, newP) => {
    return changeUserPassword(currentP, newP);
});

// --- IPC HANDLERS ---
// Centralized Application Metadata Configuration
ipcMain.handle('get-app-details', () => {
  return {
    instituteName: "Your Institute Name",
    contactNumber: "0300-1234567",
    email: "abc@gmail.com",
    address: "Islamabad",
    account: "Bank Account No: 1234567890",
    footerText: "EduPulse System Engine © 2026"
  };
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

            // 1. CLEAR OLD FILES: Find and delete any previous extensions for this student
            if (fs.existsSync(imagesDir)) {
                const existingFiles = fs.readdirSync(imagesDir);
                existingFiles.forEach(file => {
                    // Check if file starts with "reg_123." matching the registration format
                    if (file.startsWith(`reg_${studentData.regNo}.`)) {
                        try {
                            fs.unlinkSync(path.join(imagesDir, file));
                        } catch (unlinkErr) {
                            console.warn(`Could not delete old image file ${file}:`, unlinkErr.message);
                        }
                    }
                });
            }

            // 2. COPY NEW FILE: Save the fresh image asset
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
                islamiat_setmarks = ?, science_setmarks = ?, physics_setmarks = ?, chemistry_setmarks = ?, 
                biology_setmarks = ?, computer_setmarks = ?, drawing_setmarks = ?, geography_setmarks = ?,
                pak_studies_setmarks = ?, islamic_studies_setmarks = ?, tarjama_quran_setmarks = ?, gk_setmarks = ?,
                functional_math_setmarks = ?, islamiat_compulsory_setmarks = ?, social_studies_setmarks = ?, home_economics_setmarks = ?,
                civics_setmarks = ?, general_science_setmarks = ?, total_setmarks = ?
            WHERE exam_id = ? AND class = ?
        `;
        const stmt = db.prepare(sql);
        const info = stmt.run(
            data.urdu, data.eng, data.math, data.sst, data.islamiat, data.science, 
            data.physics, data.chemistry, data.biology, data.computer, data.drawing, data.geography,
            data.pak_studies, data.islamic_studies, data.tarjama_quran, data.gk, data.functional_math,
            data.islamiat_compulsory, data.social_studies, data.home_economics, data.civics, data.general_science,
            data.total, data.exam_id, data.current_class
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
      SELECT r.*, s.* 
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
            Number(s.urdu_obt || 0) + Number(s.eng_obt || 0) + Number(s.math_obt || 0) + Number(s.sst_obt || 0) + 
            Number(s.islamiat_obt || 0) + Number(s.science_obt || 0) + Number(s.physics_obt || 0) + Number(s.chemistry_obt || 0) + 
            Number(s.biology_obt || 0) + Number(s.computer_obt || 0) + Number(s.drawing_obt || 0) + Number(s.geography_obt || 0) +
            Number(s.pak_studies_obt || 0) + Number(s.islamic_studies_obt || 0) + Number(s.tarjama_quran_obt || 0) + Number(s.gk_obt || 0) +
            Number(s.functional_math_obt || 0) + Number(s.islamiat_compulsory_obt || 0) + Number(s.social_studies_obt || 0) + Number(s.home_economics_obt || 0) +
            Number(s.civics_obt || 0) + Number(s.general_science_obt || 0)
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
                physics_obt=?, chemistry_obt=?, biology_obt=?, computer_obt=?, drawing_obt=?, geography_obt=?, 
                pak_studies_obt=?, islamic_studies_obt=?, tarjama_quran_obt=?, gk_obt=?, functional_math_obt=?,
                islamiat_compulsory_obt=?, social_studies_obt=?, home_economics_obt=?, civics_obt=?, general_science_obt=?,
                total_obt=?, percentage=?, grade=?, result_status=?
            WHERE result_id = ?
        `;
        db.prepare(sql).run(
            s.urdu_obt, s.eng_obt, s.math_obt, s.sst_obt, s.islamiat_obt, s.science_obt,
            s.physics_obt, s.chemistry_obt, s.biology_obt, s.computer_obt, s.drawing_obt, s.geography_obt,
            s.pak_studies_obt, s.islamic_studies_obt, s.tarjama_quran_obt, s.gk_obt, s.functional_math_obt,
            s.islamiat_compulsory_obt, s.social_studies_obt, s.home_economics_obt, s.civics_obt, s.general_science_obt,
            totalObt, percentage, grade, status, s.result_id
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
ipcMain.handle('update-salary-status', async (event, payload) => {
    try {
        const { id, status, salary } = payload;
        
        // 1. IF THE STATUS IS 'PAID' (From the final Confirm & Process modal button click)
        if (status === 'Paid') {
            const finalSalaryAmount = parseFloat(salary) || 0;
            let info;

            try {
                // Attempt A: Update using 'net_paid' column
                const stmt1 = db.prepare(`UPDATE salary_tbl SET status = 'Paid', net_paid = ? WHERE id = ?`);
                info = stmt1.run(finalSalaryAmount, id);
            } catch (err) {
                try {
                    // Attempt B: Fallback to traditional 'salary' table mapping columns
                    const stmt2 = db.prepare(`UPDATE salary_tbl SET status = 'Paid', salary = ? WHERE id = ?`);
                    info = stmt2.run(finalSalaryAmount, id);
                } catch (err2) {
                    // Attempt C: Simple status update lock row toggle switch if column schemas vary
                    const stmt3 = db.prepare(`UPDATE salary_tbl SET status = 'Paid' WHERE id = ?`);
                    info = stmt3.run(id);
                }
            }
            
            return info && info.changes > 0;
        } 
        
        // 2. IF THE STATUS IS 'UNPAID' (From individual table cell item pencil edits)
        else {
            const stmt = db.prepare(`
                UPDATE salary_tbl 
                SET award = ?, 
                    award_remarks = ?, 
                    salary_deduction = ?, 
                    deduction_remarks = ?, 
                    fund_cutting = ?, 
                    security_cutting = ?,
                    status = 'Unpaid'
                WHERE id = ?
            `);
            
            const info = stmt.run(
                parseFloat(salary.award) || 0,
                salary.award_remarks || '',
                parseFloat(salary.salary_deduction) || 0,
                salary.deduction_remarks || '',
                parseFloat(salary.fund_cutting) || 0,
                parseFloat(salary.security_cutting) || 0,
                id
            );
            return info.changes > 0;
        }
    } catch (error) {
        console.error("❌ Critical Database Update Salary Status Error:", error);
        return false;
    }
});

ipcMain.handle('bulk-promote-students', async (event, { studentIds, targetClass }) => {
  try {
    const transaction = db.transaction((ids, className) => {
      // ✅ Cleaned up query to ONLY update the existing current_class column
      const stmt = db.prepare(`
        UPDATE students 
        SET current_class = ?
        WHERE id = ?
      `);
      for (const id of ids) {
        stmt.run(className, id);
      }
    });

    transaction(studentIds, targetClass);
    return { success: true, count: studentIds.length };
  } catch (error) {
    console.error("Bulk promotion database error:", error);
    return { success: false, error: error.message };
  }
});



// Your Main.js handler is already optimized:
ipcMain.handle('load-salary-data', async () => {
    return db.prepare("SELECT * FROM salary_tbl").all(); 
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
    // This inline require guarantees that 'shell' is always defined and never fails
    const { shell } = require('electron'); 
    
    if (url) {
        shell.openExternal(url);
    }
});



//q bank
// --- QUESTION BANK & EXAM PAPER BUILDER HANDLERS ---

// Locate your existing ipcMain.handle('add-question') block and update it like this:
ipcMain.handle('add-question', async (event, questionData) => {
    try {
        let savedDiagramName = null;

        // If a absolute source path to a diagram file was picked on the frontend UI
        if (questionData.localDiagramPath && fs.existsSync(questionData.localDiagramPath)) {
            const ext = path.extname(questionData.localDiagramPath);
            // Generate a secure, unique filename tracking timestamp signatures
            savedDiagramName = `diagram_${Date.now()}${ext}`;
            const destination = path.join(imagesDir, savedDiagramName);
            
            // Perform an isolated sync file copy operation straight into your local images repository folder
            fs.copyFileSync(questionData.localDiagramPath, destination);
        }

        // Merge the safe internal asset filename directly into the database payload payload
        const dataToSave = { ...questionData, diagramPath: savedDiagramName };
        const result = await addQuestion(dataToSave);
        return { success: true, result };
    } catch (err) {
        console.error("Database Error saving question with diagram:", err);
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
// Add this helper listener inside your main.js file
ipcMain.handle('get-question-by-id', async (event, id) => {
    try {
        return dbLogic.getQuestionById(id); // Calls the function we just created above
    } catch (err) {
        console.error("IPC Main error inside get-question-by-id handler:", err);
        return null;
    }
});
ipcMain.handle('delete-questions-by-selection', async (event, criteria) => {
    try {
        return dbLogic.deleteQuestionsBySelection(criteria);
    } catch (err) {
        console.error("IPC Main error inside delete-questions handler:", err);
        return { success: false, error: err.message };
    }
});
ipcMain.handle('delete-single-question', async (event, id) => {
    try {
        return dbLogic.deleteSingleQuestion(id);
    } catch (err) {
        console.error("IPC Main thread runtime error in delete-single-question channel:", err);
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

// ➕ ADD THIS IPC INTERCEPT HANDLER HERE
// Inside your Main.js IPC Handlers block section
ipcMain.handle('update-question-text', async (event, data) => {
    try {
        const result = await updateQuestionText(data);
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Add this block along with your other ipcMain handles inside main.js
ipcMain.handle('delete-entire-paper', async (event, data) => {
    try {
        const result = await dbLogic.deleteEntirePaper(data);
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
});






//q bank ends

//upload students 
ipcMain.on('download-student-template', (event) => {
    const defaultPath = path.join(app.getPath('downloads'), 'student_bulk_import_template.xlsx');
    
    dialog.showSaveDialog({
        title: 'Save Full Students Excel Template',
        defaultPath: defaultPath,
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    }).then(file => {
        if (!file.canceled && file.filePath) {
            const workbook = XLSX.utils.book_new();

            // --- SHEET 1: DATA IMPORT SHEET (WITH MATCHING UI PATTERNS) ---
            const headers = [[
                "registration_no", "roll_no", "student_name", "student_name_urdu", 
                "father_name", "father_name_urdu", "dob(dd/mm/yyyy)", "dob_in_words", 
                "cnic_bform", "mobile", "whatsapp", "address", "monthly_fee", 
                "dues_paid_up_to", "character_remarks", "remarks", "admission_class", 
                "current_class", "leaving_class", "promoted_to_class", "section", 
                "admission_date(dd/mm/yyyy)", "leaving_date(dd/mm/yyyy)", "status", 
                "certificate_serial", "cert_issuance_date(dd/mm/yyyy)"
            ]];
            const dataWorksheet = XLSX.utils.aoa_to_sheet(headers);
            XLSX.utils.book_append_sheet(workbook, dataWorksheet, "Students Master List");

            // --- SHEET 2: GENERAL INSTRUCTIONS ---
            const instructionRows = [
                ["⚠️ BULK UPLOAD INSTRUCTIONS"],
                [""],
                ["1. Do not rename or change any header column names on the first sheet tab."],
                ["2. Enter all dates strictly matching the pattern shown in the header column title (e.g., 26/06/2026)."],
                ["3. Keep monthly fee values numeric without text or extra characters (e.g., 4000)."]
            ];
            const instructionWorksheet = XLSX.utils.aoa_to_sheet(instructionRows);
            XLSX.utils.book_append_sheet(workbook, instructionWorksheet, "Read Instructions First");
            
            XLSX.writeFile(workbook, file.filePath);
            dialog.showMessageBox({ message: "Updated template with matching slash style date hints downloaded!", type: "info" });
        }
    }).catch(err => console.error("Template download engine crash:", err));
});




function formatExcelDate(cellValue) {
    if (!cellValue) return '';
    if (cellValue instanceof Date) {
        // Adjust for any local timezone shifting and output YYYY-MM-DD
        const offset = cellValue.getTimezoneOffset();
        const correctedDate = new Date(cellValue.getTime() - (offset * 60 * 1000));
        return correctedDate.toISOString().split('T')[0];
    }
    return cellValue;
}

// Replace the upload handler in main.js with this optimized version
ipcMain.handle('upload-excel-students', async (event, filePath) => {
    try {
        const workbook = XLSX.readFile(filePath, { cellDates: true });
        const sheetName = workbook.SheetNames[0]; // Read the first sheet tab safely
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet);
        
        let insertedCount = 0;
        
        const insertTransaction = db.transaction((students) => {
            const stmt = db.prepare(`
                INSERT INTO students (
                    registration_no, roll_no, student_name, student_name_urdu, 
                    father_name, father_name_urdu, dob, dob_in_words, 
                    cnic_bform, mobile, whatsapp, address, monthly_fee, 
                    dues_paid_up_to, character_remarks, remarks, admission_class, 
                    current_class, leaving_class, promoted_to_class, section, 
                    admission_date, leaving_date, status, certificate_serial, 
                    cert_issuance_date
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            `);
            
            for (let row of students) {
                const cleanRow = {};
                Object.keys(row).forEach(key => {
                    cleanRow[key.trim().toLowerCase()] = row[key];
                });
                
                if (!cleanRow.student_name || !cleanRow.registration_no) continue;

                // 1. Safe Fallback mapping to accept BOTH dash (-) and slash (/) header templates
                // 1. Safe Fallback mapping to accept BOTH templates AND convert them to YYYY-MM-DD
const dobValue = formatExcelDate(cleanRow["dob(dd/mm/yyyy)"] || cleanRow["dob(dd-mm-yyyy)"] || cleanRow["dob"] || null);
const admissionDateValue = formatExcelDate(cleanRow["admission_date(dd/mm/yyyy)"] || cleanRow["admission_date(dd-mm-yyyy)"] || cleanRow["admission_date"] || null);
const leavingDateValue = formatExcelDate(cleanRow["leaving_date(dd/mm/yyyy)"] || cleanRow["leaving_date(dd-mm-yyyy)"] || cleanRow["leaving_date"] || null);
const certDateValue = formatExcelDate(cleanRow["cert_issuance_date(dd/mm/yyyy)"] || cleanRow["cert_issuance_date(dd-mm-yyyy)"] || cleanRow["cert_issuance_date"] || null);

const duesPaidValue = formatExcelDate(cleanRow["dues_paid_up_to"] || null);
                // 2. Clear Capitalization Fix for Status Dropdown Binding
                let statusValue = 'Active'; // Default matching your app UI
                if (cleanRow.status) {
                    const checkStatus = String(cleanRow.status).trim().toLowerCase();
                    if (checkStatus === 'inactive') {
                        statusValue = 'Inactive';
                    }
                }
                
                stmt.run(
                    String(cleanRow.registration_no).trim(),
                    cleanRow.roll_no ? String(cleanRow.roll_no).trim() : null,
                    String(cleanRow.student_name).trim(),
                    cleanRow.student_name_urdu ? String(cleanRow.student_name_urdu).trim() : null,
                    cleanRow.father_name ? String(cleanRow.father_name).trim() : null,
                    cleanRow.father_name_urdu ? String(cleanRow.father_name_urdu).trim() : null,
                    
                    dobValue ? String(dobValue).trim() : null,
                    cleanRow.dob_in_words ? String(cleanRow.dob_in_words).trim() : null,
                    cleanRow.cnic_bform ? String(cleanRow.cnic_bform).trim() : null,
                    cleanRow.mobile ? String(cleanRow.mobile).trim() : null,
                    cleanRow.whatsapp ? String(cleanRow.whatsapp).trim() : null,
                    cleanRow.address ? String(cleanRow.address).trim() : null,
                    cleanRow.monthly_fee ? Number(cleanRow.monthly_fee) : 0,
                    duesPaidValue || null,
                    cleanRow.character_remarks ? String(cleanRow.character_remarks).trim() : null,
                    cleanRow.remarks ? String(cleanRow.remarks).trim() : null,
                    cleanRow.admission_class ? String(cleanRow.admission_class).trim() : null,
                    cleanRow.current_class ? String(cleanRow.current_class).trim() : null,
                    cleanRow.leaving_class ? String(cleanRow.leaving_class).trim() : null,
                    cleanRow.promoted_to_class ? String(cleanRow.promoted_to_class).trim() : null,
                    cleanRow.section ? String(cleanRow.section).trim() : null,
                    
                    admissionDateValue ? String(admissionDateValue).trim() : null,
                    leavingDateValue ? String(leavingDateValue).trim() : null,
                    
                    statusValue, // Saves exactly as 'Active' or 'Inactive'
                    cleanRow.certificate_serial ? String(cleanRow.certificate_serial).trim() : null,
                    certDateValue ? String(certDateValue).trim() : null
                );
                insertedCount++;
            }
        });
        
        insertTransaction(rawData);
        return { success: true, count: insertedCount };
        
    } catch (err) {
        console.error("Master Import Parser Exception:", err);
        return { success: false, error: err.message };
    }
});




//upload code ends
// Save manual worksheet item entry
// 1. Save single manually typed worksheet prompt question into pool
ipcMain.handle('add-worksheet-question', async (event, data) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO worksheet_questions (class_id, subject, activity_type, question_text, answer_text) 
            VALUES (?, ?, ?, ?, ?)
        `);
        const info = stmt.run(data.classId, data.subject, data.activityType, data.questionText, data.answerText);
        return { success: true, id: info.lastInsertRowid };
    } catch (err) {
        console.error("IPC Database Error:", err);
        return { success: false, error: err.message };
    }
});

// 2. Query target rows belonging to a configured Class ID and subject filter
// Add this handler explicitly inside main.js to retrieve worksheet records cleanly
ipcMain.handle('get-worksheet-questions', async (event, { classId, subject, activityType }) => {
    try {
        // Enforces exact database column mapping schemas from your tables setup
        const sql = `SELECT * FROM worksheet_questions WHERE class_id = ? AND subject = ? ORDER BY id DESC`;
        return db.prepare(sql).all(classId, subject);
    } catch (err) {
        console.error("Database Worksheet Questions Fetch Failure:", err);
        return [];
    }
});

// Add this handler inside main.js to support the pool delete buttons
ipcMain.handle('delete-worksheet-question', async (event, id) => {
    try {
        db.prepare(`DELETE FROM worksheet_questions WHERE id = ?`).run(id);
        return { success: true };
    } catch (err) {
        console.error("Database Worksheet Deletion Error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('add-question-to-worksheet', async (event, { questionId, examName, classId, subject }) => {
    try {
        // Prevent duplicate entries
        const existing = db.prepare(`
            SELECT 1 FROM worksheet_selected_paper 
            WHERE question_id = ? AND exam_name = ? AND class_id = ? AND LOWER(subject) = LOWER(?)
        `).get(questionId, examName, classId, subject);
        
        if (existing) return { success: false, error: "Already added to this worksheet!" };

        const stmt = db.prepare(`
            INSERT INTO worksheet_selected_paper (question_id, exam_name, class_id, subject) 
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(questionId, examName, classId, subject);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
// 3. Get only selected questions for print preview handler
ipcMain.handle('get-selected-worksheet-questions', async (event, { examName, classId, subject }) => {
    try {
        const sql = `
            SELECT w.* FROM worksheet_questions w
            JOIN worksheet_selected_paper s ON w.id = q.question_id
            WHERE s.exam_name = ? AND s.class_id = ? AND LOWER(s.subject) = LOWER(?)
            ORDER BY s.id ASC
        `;
        // If query fails, fall back to matching named properties object structures from your specific better-sqlite3 drivers
        return db.prepare(`
            SELECT w.* FROM worksheet_questions w
            INNER JOIN worksheet_selected_paper s ON w.id = s.question_id
            WHERE s.exam_name = ? AND s.class_id = ? AND s.subject = ?
        `).all(examName, classId, subject);
    } catch (err) {
        console.error(err);
        return [];
    }
});
// Insert this alongside your other ipcMain.handle routers around Page 32:
ipcMain.handle('delete-exam-cascade', async (event, data) => {
    try {
        const result = await dbLogic.deleteExamCascade(data);
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
});

//worksheet code ends
// --- LIFECYCLE ---
app.whenReady().then(() => {
    createWindow();       // Opens Login/Main window
    // createWeightWindow(); // Opens the Scale display window
    backupDatabaseDaily();
    backupImagesDaily()
});

app.on('window-all-closed', () => { 
    if (process.platform !== 'darwin') app.quit(); 
});

app.on('will-quit', () => { 
    globalShortcut.unregisterAll(); 
    if (db) db.close(); 
});