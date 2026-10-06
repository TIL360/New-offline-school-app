// main.js
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
const { app, BrowserWindow, globalShortcut, ipcMain, dialog, protocol, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { shell } = require('electron'); 
const dbLogic = require('./database.js');
const XLSX = require('xlsx');
// 1. PATH SETUP
const userDataPath = app.getPath('userData');
const imagesDir = path.join(userDataPath, 'images');
const configPath = path.join(userDataPath, 'config.json'); // Path for hidden time-tracking file
const { supabase, SCHOOL_CODE, pushSubjectsOnline, pushExamsOnline, pushExamSettingsOnline, pushExamStudentsOnline, pushOfflineUsersToCloud, pushDynamicResultsOnline, pushStaffOnline, pullTeacherMarksOnline } = require('./supabase.js');
const http = require('http');
// 2. INITIALIZE DIRECTORIES
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}
const staffImagesDir = path.join(imagesDir, 'staff');
if (!fs.existsSync(staffImagesDir)) {
    fs.mkdirSync(staffImagesDir, { recursive: true });
}
const BACKUP_STAFF_D = 'D:\\SchoolApp-Backup\\images\\staff';
const BACKUP_STAFF_DOCS = path.join(app.getPath('documents'), 'SchoolApp-Backup', 'images', 'staff');
[BACKUP_STAFF_D, BACKUP_STAFF_DOCS].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function deleteOldStaffImages(staffId){
  if(!staffId) return;
  const idStr = String(staffId);
  const allFolders = [staffImagesDir, BACKUP_STAFF_D, BACKUP_STAFF_DOCS];
  allFolders.forEach(folder => {
    if(!fs.existsSync(folder)) return;
    fs.readdirSync(folder).forEach(file => {
      // matches staff_1.jpg, staff_1.png AND old format staff_XXX_123456 etc that starts with staff_{id}
      // To avoid deleting staff_10 when id is 1, we check exact prefix with dot or underscore
      if(file === `staff_${idStr}.jpg` || file === `staff_${idStr}.png` || file === `staff_${idStr}.jpeg` || file === `staff_${idStr}.webp` || file.startsWith(`staff_${idStr}.`) || file.startsWith(`staff_${idStr}_`)){
        try{ fs.unlinkSync(path.join(folder, file)); }catch(e){}
      }
    });
  });
}

function saveStaffImageFile(staffId, photoValue) {
  if (!photoValue || !staffId) return '';
  try {
    // 1. Delete old image of this ID from all locations first
    deleteOldStaffImages(staffId);

    let fileName = '';
    let buffer = null;
    let srcPathForCopy = '';

    // Absolute path from file picker
    if (path.isAbsolute(photoValue) && fs.existsSync(photoValue)) {
      let ext = (path.extname(photoValue) || '.jpg').toLowerCase();
      if(ext === '.jpeg') ext = '.jpg';
      fileName = `staff_${staffId}${ext}`;
      srcPathForCopy = photoValue;
    } 
    // base64 from your staff.html preview
    else if (photoValue.startsWith('data:image')) {
      const m = photoValue.match(/data:image\/(\w+);base64,/);
      let ext = m ? `.${m[1].toLowerCase()}` : '.jpg';
      if(ext === '.jpeg') ext = '.jpg';
      fileName = `staff_${staffId}${ext}`;
      const base64 = photoValue.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(base64, 'base64');
    } else {
      // already saved filename like staff_1.jpg - keep it
      return path.basename(photoValue);
    }

    // 2. Save to main AppData
    const destMain = path.join(staffImagesDir, fileName);
    if(buffer) fs.writeFileSync(destMain, buffer);
    else fs.copyFileSync(srcPathForCopy, destMain);

    // 3. Backup instantly to D: and Documents (overwrite)
    [BACKUP_STAFF_D, BACKUP_STAFF_DOCS].forEach(backupFolder => {
      try {
        if (!fs.existsSync(backupFolder)) fs.mkdirSync(backupFolder, { recursive: true });
        const destBackup = path.join(backupFolder, fileName);
        if(buffer) fs.writeFileSync(destBackup, buffer);
        else fs.copyFileSync(srcPathForCopy, destBackup);
      } catch(e){}
    });

    return fileName;
  } catch(err){ console.error(err); return ''; }
}

// 3. PRIVILEGED PROTOCOLS
protocol.registerSchemesAsPrivileged([
  { scheme: 'safe-file', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// 4. EXPIRY CONFIGURATION
// Note: Months are 0-indexed in JS. 4 = May, 5 = June.
const EXPIRY_DATE = new Date(2027, 9, 3); // May 31, 2026

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

// RUN BACKUP EVERY TIME APP RUNS
backupDatabaseDaily();
backupImagesDaily();

  // --- BROWSER WINDOW SETUP ---
win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
icon: path.join(__dirname, 'images', 'icons', 'logo.ico'),    titleBarStyle: "default",
    backgroundColor: "#f8fafc",
    show: false, // don't show until ready
    autoHideMenuBar: true,
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'), 
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
    }
});

win.maximize();
win.show(); // show after maximize

win.once('ready-to-show', () => {
    win.maximize();
    win.show();
});
   win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('invoice') || url.includes('slc_template')) {
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                width: 900, height: 800,
                webPreferences: {
                    preload: path.join(__dirname, 'preload.js'),
                    contextIsolation: true, nodeIntegration: false, sandbox: false
                }
            }
        };
    }
    if (url.startsWith('file://')) return { action: 'deny' };
    
    // This now allows wa.me, api.whatsapp.com AND web.whatsapp.com
    if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url);
        return { action: 'deny' };
    }
    return { action: 'deny' };
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
    const sourceDbPath = path.join(app.getPath('userData'), 'school.db');
    
    // D DRIVE BACKUP - YOUR REQUIREMENT
    const backupFolder = 'D:\\SchoolApp-Backup';
    const backupFolderDocs = path.join(app.getPath('documents'), 'SchoolApp-Backup'); // keep docs as secondary
    
    [backupFolder, backupFolderDocs].forEach(folder => {
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
        console.log("📁 Created Backup Folder: " + folder);
      }
    });
    
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const backupFileName = `backup-schoolDB-${day}-${month}-${year}.db`;
    
    // Save to D: Drive (MAIN)
    const destD = path.join(backupFolder, backupFileName);
    if (fs.existsSync(sourceDbPath)) {
      fs.copyFileSync(sourceDbPath, destD);
      console.log(`💾 D-Drive backup created: ${backupFileName}`);
    }

    // Also save to Documents (backup of backup)
    const destDocs = path.join(backupFolderDocs, backupFileName);
    if (!fs.existsSync(destDocs) && fs.existsSync(sourceDbPath)) {
      fs.copyFileSync(sourceDbPath, destDocs);
    }

  } catch (error) {
    console.error("❌ Backup Engine Error:", error);
  }
}

function backupImagesDaily() {
  try {
    // D DRIVE - MAIN BACKUP LOCATION
    const backupImagesFolder = 'D:\\SchoolApp-Backup\\images';
    const backupStaffFolder = path.join(backupImagesFolder, 'staff');
    
    // Secondary in Documents
    const backupImagesDocs = path.join(app.getPath('documents'), 'SchoolApp-Backup', 'images');
    const backupStaffDocs = path.join(backupImagesDocs, 'staff');
    
    [backupImagesFolder, backupStaffFolder, backupImagesDocs, backupStaffDocs].forEach(folder => {
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    });
    
    // 1. Backup Students (from imagesDir)
    if (fs.existsSync(imagesDir)) {
      fs.readdirSync(imagesDir).forEach(file => {
        const src = path.join(imagesDir, file);
        if (fs.lstatSync(src).isFile()) {
          const destD = path.join(backupImagesFolder, file);
          const destDocs = path.join(backupImagesDocs, file);
          if (!fs.existsSync(destD)) {
            fs.copyFileSync(src, destD);
            console.log(`📸 D-Drive image backup: ${file}`);
          }
          if (!fs.existsSync(destDocs)) fs.copyFileSync(src, destDocs);
        }
      });
    }
    
    // 2. Backup Staff (from images/staff) - OVERWRITE to keep updated image
    if (fs.existsSync(staffImagesDir)) {
      fs.readdirSync(staffImagesDir).forEach(file => {
        const src = path.join(staffImagesDir, file);
        if (!fs.lstatSync(src).isFile()) return;
        const destD = path.join(backupStaffFolder, file);
        const destDocs = path.join(backupStaffDocs, file);
        // overwrite so updated staff_1.jpg replaces old in backup
        try{ fs.copyFileSync(src, destD); }catch(e){}
        try{ fs.copyFileSync(src, destDocs); }catch(e){}
      });
    }
  } catch (error) {
    console.error("❌ Image Backup Error:", error);
  }
}
//backup ends
//change password
ipcMain.handle('change-password', async (event, currentP, newP) => {
    return changeUserPassword(currentP, newP);
});

// --- IPC HANDLERS ---
// Centralized Application Metadata Configuration

// ===== CENTRAL THEME CONFIG =====
const appTheme = {
//   studentCardHeaderBg: '#04A0E8', //<-- Eagl'es Nest
  studentCardHeaderBg: '#054b6b', //<-- Eagl'es Nest
  studentCardHeaderText: '#f9fbfd', 
  studentCardSmallText: '#ffffff',
//   studentCardFooterBg: '#04A0E8', //<-- Eagle's Nest
  studentCardFooterBg: '#054b6b', //<-- Eagle's Nest

//   staffCardHeaderBg: '#0A1931',       // <-- Eagles's Nest
  
  staffCardHeaderBg: '#f58012',       // <-- Kips's Nest
  staffCardHeaderText: '#000000',     // <-- Staff institute name color
  staffCardSmallText: '#ffffff',      // <-- Staff small text
  staffCardFooterBg: '#02245a',
  
  sidebarBg: '#030303',
  sidebarActive: '#f84040',
  cardPrimary: '#f84040',
  cardSecondary: '#ffffff',
  cardFooterBg: '#02245a',
  primary: '#4f46e5',
  heading1: '#ffffff',
  heading2: '#ffffff',
  heading3: '#ffffff'
};
// Make it accessible to all HTMLs
ipcMain.handle('get-theme', () => {
  return appTheme;
});

ipcMain.handle('get-app-details', () => {
//   return {
//     instituteName: "Kauthar Ideal Public School (KIPS)",
//     contactNumber: "03708087772 | 0512249471",
//     email: "mahboobbalti110@gmail.com ",
//     address: "Jigyot Road Old Bank Stop Alipur, Islamabad ",
//     account: "Raast Account: 03368187772 || Essay pesa 0342-2384030",
//     footerText: "EduPulse System Engine © 2026",
// theme: appTheme ,
//   };

//   return {
//     instituteName: "Islamia Model School",
//     contactNumber: "0300-9813940 ",
//     email: "imssohan1987@gmail.com ",
//     address: "Sohan, Islamabad ",
//     account: "HBL Account No: 17420009698101",
//     footerText: "EduPulse System Engine © 2026",
// theme: appTheme 
//   };

// return {
//     instituteName: "Eagle's Nest School System",
//     contactNumber: "0312-1123205",
//     email: "eaglesnestenss@gmail.com ",
//     address: "Ghusia Muhallah Hamdani town Alipur Islamabad ",
//     // account: "HBL Account No: 17420009698101",
//     footerText: "EduPulse System Engine © 2026",
// theme: appTheme 
//   };
return {
    instituteName: "Rahbar Public School",
    contactNumber: "03151436832",
    email: "asadaslam60@gmail.com",
    address: "Pore Garhi, Habibullah ",
    account: "Easypaisa No: 03424449242",
    footerText: "EduPulse System Engine © 2026",
    theme: appTheme     
};
//   return {
//     instituteName: "Techinfo",
//     contactNumber: "0311-5101738 ",
//     email: "techhinfolab360@gmail.com ",
//     address: "Islamabad ",
//     // account: "HBL Account No: 17420009698101",
//     footerText: "EduPulse System Engine © 2026",
// theme: appTheme 
//   };
});

ipcMain.handle('get-student-attendance-status', (e, { student_id, date }) => dbLogic.getStudentAttendanceStatus(student_id, date));
ipcMain.handle('get-staff-attendance-status', (e, { staff_id, date }) => {
    const { getStaffAttendanceStatus } = require('./database.js');
    return getStaffAttendanceStatus(staff_id, date);
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
    if (!picturePath) return null;
    try {
        const fileName = path.basename(picturePath);
        // Check if it's staff image
        let fullPath;
        if (picturePath.includes('staff') || fs.existsSync(path.join(staffImagesDir, fileName))) {
            fullPath = path.join(staffImagesDir, fileName);
        } else {
            fullPath = path.join(imagesDir, picturePath);
        }
        if (fs.existsSync(fullPath)) return `file://${fullPath.replace(/\\/g, '/')}`;
        return null;
    } catch(e){ return null; }
});
ipcMain.handle('push-all-masters', async () => {
  try{
   await pushSubjectsOnline(db);
await pushExamsOnline(db);
await pushExamSettingsOnline(db);
await pushExamStudentsOnline(db);
await pushOfflineUsersToCloud(db);
await pushStaffOnline(db);
    console.log(`✅ Masters auto-pushed for ${SCHOOL_CODE}`);
    return {success:true};
  }catch(err){
    console.log("Master push error", err.message);
    return {success:false, error: err.message};
  }
});



ipcMain.handle('push-cloud-marks', async (event, data) => {
  try {
    const exam_id = data?.exam_id;
    const className = data?.className;
    if(!exam_id || !className) return { success:false, error:"Select Exam and Class" };
    console.log(`Push requested for exam ${exam_id} class ${className}`);
    const { SCHOOL_CODE, pushSubjectsOnline, pushExamSettingsOnline, pushDynamicResultsOnline } = require('./supabase');
    await pushSubjectsOnline(db);
    await pushExamSettingsOnline(db);
    const count = await pushDynamicResultsOnline(db, exam_id, className);
    return { success: true, count, school: SCHOOL_CODE };
  } catch (err) {
    console.log("PUSH ERROR FULL:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pull-cloud-marks', async (event, data) => {
  try {
    const exam_id = data?.exam_id;
    const className = data?.className;
    const { pullTeacherMarksOnline } = require('./supabase');
    const res = await pullTeacherMarksOnline(db, exam_id, className);
    return res;
  } catch (err) {
    console.log("PULL ERROR:", err);
    return { success:false, error: err.message };
  }
});

// Alias for old button name (keep for compatibility)
ipcMain.handle('push-cloud-result', async () => {
  console.log(`⬆️ Manual PUSH results (alias) for ${SCHOOL_CODE}`);
  return await pushDynamicResultsOnline(db);
});



// 4. LOGIN HANDLERS
ipcMain.handle('login-attempt', async (event, credentials) => {
    try {
        const user = checkUser(credentials.username, credentials.password);
        if (!user) return { success: false, message: "Invalid credentials" };

        // AUTO PUSH - ADDED STAFF
        try{
          console.log("🔄 Auto pushing masters + staff...");
          await pushSubjectsOnline(db);
          await pushExamsOnline(db);
          await pushExamSettingsOnline(db);
          await pushExamStudentsOnline(db);
          await pushOfflineUsersToCloud(db);
          await pushStaffOnline(db); // <-- NEW: Staff auto push
          console.log(`✅ Masters + Staff auto-pushed for ${SCHOOL_CODE}`);
        }catch(e){ console.log("Auto master push failed", e.message); }

        return { success: true, user };
    } catch (err) { 
        console.error(err);
        return { success: false, message: "Database Error" }; 
    }
});

ipcMain.handle('login-user', async (event, username, password) => {
    try {
        const user = checkUser(username, password);
        if (!user) return { success: false, message: "Invalid username or password" };
        
        // AUTO PUSH masters + staff on login - NO results auto-push
        try{
          await pushSubjectsOnline(db);
          await pushExamsOnline(db);
          await pushExamSettingsOnline(db);
          await pushExamStudentsOnline(db);
          await pushOfflineUsersToCloud(db);
          await pushStaffOnline(db); // <-- NEW: Staff auto push
        }catch(e){ console.log("Auto master push failed", e.message); }

        return { success: true, user: user };
    } catch (err) {
        return { success: false, message: err.message };
    }
});
// Example for student delete
ipcMain.handle('deleteStudent', async (e, id) => {
  db.prepare("DELETE FROM students WHERE id=?").run(id);
  db.prepare("DELETE FROM student_subject_marks WHERE student_id=?").run(id);

  // Immediately sync delete to online
  if(isOnline()){
    const { syncAllToCloud } = require('./supabase');
    await syncAllToCloud(db); // this will delete online too
  }
  return {success:true};
});
ipcMain.handle('updateStudentMarks', async (e, student) => {
  const now = new Date().toISOString();
  // update each subject
  for(const key of Object.keys(student)){
    if(key.endsWith('_obt')){
      const sub = key.replace('_obt','');
      db.prepare(`UPDATE student_subject_marks
        SET marks_obtained=?, updated_at=?
        WHERE student_id=? AND subject_code=? AND exam_id=?`)
       .run(student[key], now, student.student_id, sub, student.exam_id);
    }
  }
  return {success:true};
});
// Same for deleteExam, deleteSubject, deleteClass etc


ipcMain.handle('add-user', async (event, userData) => {
    try { 
      db.prepare(`INSERT INTO users (username, password, usertype, permissions, assigned_class) VALUES (?,?,?,?,?)`)
        .run(userData.username, userData.password, userData.usertype, userData.permissions, userData.assigned_class || null);
      return { success: true }; 
    } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('update-user', async (event, userData) => {
  try {
    if (userData.password && userData.password.trim() !== "") {
      db.prepare(`UPDATE users SET username = ?, password = ?, usertype = ?, permissions = ?, assigned_class = ? WHERE id = ?`)
        .run(userData.username, userData.password, userData.usertype, userData.permissions, userData.assigned_class || null, userData.id);
    } else {
      db.prepare(`UPDATE users SET username = ?, usertype = ?, permissions = ?, assigned_class = ? WHERE id = ?`)
        .run(userData.username, userData.usertype, userData.permissions, userData.assigned_class || null, userData.id);
    }
    return { success: true };
  } catch (err) {
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
// ipcMain.on('fix-focus', (event) => {
//     const focusedWindow = BrowserWindow.fromWebContents(event.sender);
//     if (focusedWindow) {
//         focusedWindow.setIgnoreMouseEvents(false); 
//         focusedWindow.blur();
//         setTimeout(() => {
//             if (!focusedWindow.isDestroyed()) {
//                 focusedWindow.focus();
//                 focusedWindow.webContents.focus();
//             }
//         }, 50);
//     }
// });


ipcMain.on('fix-focus', (event) => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    if (!focusedWindow || focusedWindow.isDestroyed()) return;

    focusedWindow.setIgnoreMouseEvents(false);
    focusedWindow.setAlwaysOnTop(true); // <-- ye line missing thi, ye Windows ko force front par lata hai
    focusedWindow.blur();
    
    // thoda delay deke wapas focus
    setTimeout(() => {
        if (!focusedWindow.isDestroyed()) {
            focusedWindow.setAlwaysOnTop(false);
            focusedWindow.focus();
            focusedWindow.webContents.focus();
        }
    }, 100);
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

ipcMain.handle('bulk-update-fees', async (event, data) => {
 try {
   const { 
     exam, lab, reg_fee, annual_fund, stationary_fund, 
     bus_charges, misc, remarks, month, year, className 
   } = data;

   const sql = `
     UPDATE fee_tbl 
     SET exam_fee = ?, 
         lab_fee = ?, 
         reg_fee = ?, 
         annual_fund = ?, 
         stationary_fund = ?, 
         bus_charges = ?, 
         misc_fee = ?, 
         misc_remarks = ? 
     WHERE invoice_month = ? 
       AND invoice_year = ? 
       AND current_class = ?
   `;
   
   const stmt = db.prepare(sql);
   const info = stmt.run(
     exam, lab, reg_fee, annual_fund, stationary_fund, 
     bus_charges, misc, remarks, month, year, className
   ); 
   
   return { success: true, count: info.changes };
 } catch (err) {
   console.error("Database Bulk Update Error:", err);
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

ipcMain.handle('get-timetable', async (event, classId) => {
    try {
        const data = await dbLogic.getTimeTableByClass(classId);
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-timetable-slot', async (event, slotData) => {
    try {
        const result = await dbLogic.saveTimeTableSlot(slotData);
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Timetable Slot Deletion IPC Handler Channel Link
ipcMain.handle('delete-timetable-slot', async (event, id) => {
    try {
        // Run standard SQL delete command against the database file instance
        const result = db.prepare('DELETE FROM school_timetable WHERE id = ?').run(id);
        
        if (result.changes > 0) {
            return { success: true };
        } else {
            return { success: false, error: "Slot not found or already deleted." };
        }
    } catch (dbError) {
        console.error("SQL Database Deletion Error:", dbError);
        return { success: false, error: dbError.message };
    }
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
        const { exam_id, current_class, total } = data;

        const tx = db.transaction(() => {
            // 1. Save into exam_subject_settings
            for (let key in data) {
                if (['exam_id','current_class','total'].includes(key)) continue;
                const marks = parseFloat(data[key]) || 0;
                if (marks <= 0) {
                    db.prepare(`DELETE FROM exam_subject_settings WHERE exam_id=? AND class=? AND subject_code=?`)
                    .run(exam_id, current_class, key);
                } else {
                    db.prepare(`
                        INSERT INTO exam_subject_settings (exam_id, class, subject_code, total_marks)
                        VALUES (?,?,?,?)
                        ON CONFLICT(exam_id, class, subject_code) DO UPDATE SET total_marks=excluded.total_marks
                    `).run(exam_id, current_class, key, marks);
                }
            }

            // 2. Update result total
            db.prepare(`UPDATE result SET total_setmarks=? WHERE exam_id=? AND class=?`)
            .run(total, exam_id, current_class);

            // 3. Sync to student_subject_marks using CORRECT column names
            const results = db.prepare(`SELECT result_id, student_id FROM result WHERE exam_id=? AND class=?`).all(exam_id, current_class);
            for (let r of results) {
                for (let key in data) {
                    if (['exam_id','current_class','total'].includes(key)) continue;
                    const marks = parseFloat(data[key]) || 0;
                    if (marks > 0) {
                        db.prepare(`
                            INSERT INTO student_subject_marks (result_id, exam_id, student_id, class, subject_code, marks_set, marks_obtained)
                            VALUES (?,?,?,?,?,?, 0)
                            ON CONFLICT(result_id, subject_code) DO UPDATE SET
                                marks_set=excluded.marks_set,
                                exam_id=excluded.exam_id,
                                student_id=excluded.student_id,
                                class=excluded.class
                        `).run(r.result_id, exam_id, r.student_id, current_class, key, marks);
                    }
                }
            }
        });
        tx();
        return { success: true, changes: 1 };
    } catch (err) {
        console.error("Update Error:", err);
        return { success: false, error: err.message };
    }
});


// Add these handlers in main.js
// In main.js - Replace the existing get-all-student-progress handler
// main.js
ipcMain.handle('get-all-student-progress', async (event, { examId, className }) => {
    try {
        const subjects = db.prepare(`SELECT subject_code, total_marks FROM exam_subject_settings WHERE exam_id=? AND class=? AND total_marks > 0`).all(examId, className);
        
        const rows = db.prepare(`
            SELECT r.result_id, r.student_id, r.exam_id, r.class, r.total_setmarks, r.total_obt, r.percentage, r.grade, r.position, r.result_status, r.remarks,
                   s.registration_no, s.student_name, s.roll_no, s.father_name, s.section, s.picture_path,
                   e.exam_name
            FROM result r
            JOIN students s ON s.id = r.student_id
            JOIN exams e ON e.exam_id = r.exam_id
            WHERE r.exam_id=? AND r.class=? ORDER BY r.position ASC
        `).all(examId, className);

        const data = rows.map(row => {
            const marks = db.prepare(`SELECT subject_code, marks_set, marks_obtained FROM student_subject_marks WHERE result_id=?`).all(row.result_id);
            marks.forEach(m => {
                row[`${m.subject_code}_setmarks`] = m.marks_set;
                row[`${m.subject_code}_obt`] = m.marks_obtained;
            });
            subjects.forEach(sub => {
                if (row[`${sub.subject_code}_setmarks`] === undefined) {
                    row[`${sub.subject_code}_setmarks`] = sub.total_marks;
                    row[`${sub.subject_code}_obt`] = 0;
                }
            });
            return row;
        });
        return data;
    } catch (err) {
        console.error(err);
        return [];
    }
});

ipcMain.handle('get-student-progress', async (event, studentId) => {
    try {
        // Get latest result for this student
        const row = db.prepare(`
            SELECT r.result_id, r.student_id, r.exam_id, r.class, r.total_setmarks, r.total_obt, r.percentage, r.grade, r.position, r.result_status, r.remarks,
                   s.registration_no, s.student_name, s.roll_no, s.father_name, s.section, s.picture_path,
                   e.exam_name
            FROM result r
            JOIN students s ON s.id = r.student_id
            JOIN exams e ON e.exam_id = r.exam_id
            WHERE r.student_id=? ORDER BY r.result_id DESC LIMIT 1
        `).get(studentId);

        if (!row) return null;
        
        const subjects = db.prepare(`SELECT subject_code, total_marks FROM exam_subject_settings WHERE exam_id=? AND class=?`).all(row.exam_id, row.class);
        const marks = db.prepare(`SELECT subject_code, marks_set, marks_obtained FROM student_subject_marks WHERE result_id=?`).all(row.result_id);
        marks.forEach(m => {
            row[`${m.subject_code}_setmarks`] = m.marks_set;
            row[`${m.subject_code}_obt`] = m.marks_obtained;
        });
        subjects.forEach(sub => {
            if (row[`${sub.subject_code}_setmarks`] === undefined) {
                row[`${sub.subject_code}_setmarks`] = sub.total_marks;
                row[`${sub.subject_code}_obt`] = 0;
            }
        });
        return row;
    } catch (err) {
        console.error(err);
        return null;
    }
});

ipcMain.handle('get-report-data', async (event, { examId, className }) => {
    try {
        // 1. Get active subjects for this exam/class where total_marks > 0
        const subjects = db.prepare(`SELECT subject_code, total_marks FROM exam_subject_settings WHERE exam_id=? AND class=? AND total_marks > 0`).all(examId, className);

        // 2. Get students + result summary
        const rows = db.prepare(`
            SELECT r.result_id, r.student_id, r.class, r.total_setmarks, r.total_obt, r.percentage, r.grade, r.position, r.result_status,
                   s.registration_no, s.student_name, s.whatsapp
            FROM result r
            JOIN students s ON s.id = r.student_id
            WHERE r.exam_id=? AND r.class=? ORDER BY r.position ASC, s.student_name ASC
        `).all(examId, className);

        // 3. Attach subject marks to each student
        const data = rows.map(row => {
         // inside getReportData, change this line:
const marks = db.prepare(`SELECT subject_code, marks_set, marks_obtained FROM student_subject_marks WHERE result_id=?`).all(row.result_id);
const obj = {...row };
marks.forEach(m => {
    obj[`${m.subject_code}_setmarks`] = m.marks_set;
    obj[`${m.subject_code}_obt`] = m.marks_obtained;
});
            // Fill subjects total from settings if not yet in student_subject_marks
            subjects.forEach(sub => {
                if (obj[`${sub.subject_code}_setmarks`] === undefined) {
                    obj[`${sub.subject_code}_setmarks`] = sub.total_marks;
                    obj[`${sub.subject_code}_obt`] = 0;
                }
            });
            return obj;
        });

        return { success: true, data, subjects };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


ipcMain.handle('recalculate-positions', async (event, { examId, className }) => {
    try {
        const rows = db.prepare(`SELECT result_id FROM result WHERE exam_id=? AND class=? ORDER BY total_obt DESC`).all(examId, className);
        const tx = db.transaction(() => {
            rows.forEach((r, i) => {
                db.prepare(`UPDATE result SET position=? WHERE result_id=?`).run(i+1, r.result_id);
            });
        });
        tx();
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});


// Staff & Salary Management
// --- STAFF HANDLERS (same pattern as students) ---
const { pathToFileURL } = require('url');

ipcMain.handle('get-staff', async () => {
  try {
    const list = dbLogic.getStaff(); // this logs SELECT * inside getStaff() - remove console.log from there

    return list.map(s => {
      let display = null;

      if (s.photo) {
        // if already base64
        if (s.photo.startsWith('data:')) {
          display = s.photo;
        } else {
          try {
            const abs = path.join(staffImagesDir, path.basename(s.photo));
            if (fs.existsSync(abs)) {
              // Convert to base64 - 100% offline, no file://, no SSL error
              const ext = path.extname(abs).toLowerCase();
              const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
              const data = fs.readFileSync(abs).toString('base64');
              display = `data:${mime};base64,${data}`;
            }
          } catch (e) {
            console.error("Photo read error:", e.message);
          }
        }
      }

      // If still null, use LOCAL placeholder, NOT internet URL
      if (!display) {
        display = null; // let frontend show ../../images/default-avatar.png
      }

      return { ...s, photoDisplay: display };
    });

  } catch (err) {
    console.error("get-staff error:", err);
    return [];
  }
});

// Inside your main.js / database.js IPC registration block
ipcMain.handle('add-staff', async (event, data) => {
  try {
    // 1. Get the next available ID from the table to name the image file properly
    const row = db.prepare("SELECT MAX(id) AS maxId FROM staff_tbl").get();
    const nextId = (row.maxId || 0) + 1;

    // 2. Process and copy the image FIRST using the predicted ID
    let finalPhotoName = null;
    if (data.photo) {
      // Calls your existing image saving function cleanly
      finalPhotoName = saveStaffImageFile(nextId, data.photo); 
    }

    // 3. Run a SINGLE query to insert EVERYTHING at once
    const sql = `
      INSERT INTO staff_tbl 
      (name, cnic, contact, designation, doj, salary, allowance, status, documents_held, photo) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const stmt = db.prepare(sql);
    const result = stmt.run(
      data.name,
      data.cnic,
      data.contact,
      data.designation,
      data.doj,
      data.salary,
      data.allowance,
      data.status,
      data.documents_held,
      finalPhotoName // Inserts the photo filename directly!
    );

    return { success: true, id: result.lastInsertRowid };
  } catch (error) {
    console.error("Database Insert Error:", error);
    throw error;
  }
});


ipcMain.handle('update-staff', async (event, id, data) => {
  // If new photo provided (base64 or absolute path)
  if (data.photo && (data.photo.startsWith('data:image') || path.isAbsolute(data.photo))) {
    // This deletes old staff_{id}.* from AppData + D:\ + Documents
    const fileName = saveStaffImageFile(id, data.photo);
    data.photo = fileName;
  } else if (data.photo) {
    // already filename like staff_1.jpg
    data.photo = path.basename(data.photo);
  }
  // if no photo field, keep old photo
  return dbLogic.updateStaff(id, data);
});

ipcMain.handle('delete-staff', async (event, id) => {
  try {
    // Deletes staff_1.jpg from all 3 places
    deleteOldStaffImages(id);
  } catch (e) {}
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
// --- GET EXPENSES - also return ROWID as id ---
ipcMain.handle('get-expenses', async (event, filters) => {
    try {
        let query = "SELECT ROWID as id, * FROM exp_tbl WHERE 1=1";
        const params = [];

        if (filters.month) {
            query += " AND exp_month =?";
            params.push(filters.month);
        }
        if (filters.year) {
            query += " AND exp_year =?";
            params.push(filters.year);
        }
        query += " ORDER BY ROWID DESC";
        return db.prepare(query).all(...params);
    } catch (err) {
        console.error(err);
        return [];
    }
});

ipcMain.handle('delete-expense', async (event, id) => {
    try {
        console.log("Deleting ROWID:", id);
        const info = db.prepare("DELETE FROM exp_tbl WHERE ROWID =?").run(Number(id));
        return { success: info.changes > 0 };
    } catch (err) {
        console.error("Delete error:", err.message);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('update-expense', async (event, data) => {
    try {
        console.log("Updating ROWID:", data);
        const info = db.prepare("UPDATE exp_tbl SET expence =?, exp_amount =? WHERE ROWID =?")
                      .run(data.expense, data.amount, Number(data.id));
        return { success: info.changes > 0 };
    } catch (err) {
        console.error("Update error:", err.message);
        return { success: false, error: err.message };
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

// --- ➕ PASTE THESE 5 HANDLERS INSIDE YOUR main.js FILE ---

// 1. Save a new custom grading scale boundary row
ipcMain.handle('add-grading-rule', async (event, data) => {
    try {
        const { gradeName, minPct, maxPct } = data;
        const stmt = db.prepare(`
            INSERT INTO grading_rules (grade_name, min_percentage, max_percentage)
            VALUES (?, ?, ?)
        `);
        const info = stmt.run(gradeName, minPct, maxPct);
        return { success: true, id: info.lastInsertRowid };
    } catch (err) {
        console.error("Database write error on add-grading-rule:", err);
        return { success: false, error: err.message };
    }
});

// 2. Fetch all custom grading scale tiers ordered by percentage descending
ipcMain.handle('get-grading-rules', async () => {
    try {
        return db.prepare("SELECT * FROM grading_rules ORDER BY min_percentage DESC").all();
    } catch (err) {
        console.error("Database read error on get-grading-rules:", err);
        return [];
    }
});

// 3. Delete a specific grading scale tier row using its primary ID
ipcMain.handle('delete-grading-rule', async (event, id) => {
    try {
        const stmt = db.prepare("DELETE FROM grading_rules WHERE id = ?");
        stmt.run(id);
        return { success: true };
    } catch (err) {
        console.error("Database deletion error on delete-grading-rule:", err);
        return { success: false, error: err.message };
    }
});

// 4. Fetch the passing thresholds for a specific exam ID
ipcMain.handle('get-passing-criteria', async (event, examId) => {
    try {
        let criteria = db.prepare("SELECT * FROM exam_passing_criteria WHERE exam_id = ?").get(examId);
        // Fallback default rules if no records exist yet
        if (!criteria) {
            criteria = { 
                exam_id: examId, 
                subject_pass_percentage: 40.0, 
                overall_pass_percentage: 33.0, 
                max_failed_subjects_allowed: 1 
            };
        }
        return criteria;
    } catch (err) {
        console.error("Database query error on get-passing-criteria:", err);
        return null;
    }
});

// 5. Save or update passing criteria benchmarks for an exam
ipcMain.handle('save-passing-criteria', async (event, data = {}) => {
    try {
        const { examId, subjectPass, overallPass, maxFailed } = data;
        const stmt = db.prepare(`
            INSERT INTO exam_passing_criteria (exam_id, subject_pass_percentage, overall_pass_percentage, max_failed_subjects_allowed)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(exam_id) DO UPDATE SET 
                subject_pass_percentage = excluded.subject_pass_percentage,
                overall_pass_percentage = excluded.overall_pass_percentage,
                max_failed_subjects_allowed = excluded.max_failed_subjects_allowed
        `);
        stmt.run(examId, subjectPass, overallPass, maxFailed);
        return { success: true };
    } catch (err) {
        console.error("Database upsert error on save-passing-criteria:", err);
        throw err;
    }
});
// 1. Fetch all subjects
ipcMain.handle('get-all-subjects', async () => {
    try {
        return db.prepare("SELECT * FROM academy_subjects ORDER BY subject_display_name ASC").all();
    } catch (err) {
        console.error(err);
        return [];
    }
});
// main.js
ipcMain.handle('getAcademySubjects', () => dbLogic.getAcademySubjects());
ipcMain.handle('getStudentSubjectMarks', (e, id) => dbLogic.getStudentSubjectMarks(id));
ipcMain.handle('getAllSubjectMarksBulk', (e, ids) => dbLogic.getAllSubjectMarksBulk(ids));


// 2. Add a new subject
// 2. Add a new subject - FIXED: normalize code
ipcMain.handle('add-new-subject', async (event, data) => {
    try {
        const { code, name } = data;
        const cleanCode = String(code).toLowerCase().trim();
        const stmt = db.prepare("INSERT INTO academy_subjects (subject_code, subject_display_name) VALUES (?, ?)");
        const info = stmt.run(cleanCode, name.trim());
        return { success: true, id: info.lastInsertRowid };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 3. Delete a subject - FIXED: CASCADE DELETE (THIS IS YOUR MAIN BUG)
ipcMain.handle('delete-subject', async (event, id) => {
    try {
        // Get code first before delete
        const row = db.prepare("SELECT subject_code FROM academy_subjects WHERE id = ?").get(id);
        if(!row) return { success: false, error: "Not found" };
        const cleanCode = String(row.subject_code).toLowerCase().trim();

        // Transaction: delete from all 3 tables
        const trx = db.transaction(()=>{
            db.prepare("DELETE FROM academy_subjects WHERE id = ?").run(id);
            db.prepare("DELETE FROM exam_subject_settings WHERE LOWER(TRIM(subject_code)) = ?").run(cleanCode);
            db.prepare("DELETE FROM student_subject_marks WHERE LOWER(TRIM(subject_code)) = ?").run(cleanCode);
        });
        trx();

        console.log(`🗑️ Deleted subject ${cleanCode} from academy + settings + marks`);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
ipcMain.handle('updateIndividualFullFees', (e, data) => {
    try{
        db.prepare(`
            UPDATE fee_tbl SET
                monthly_fee =?,
                adm_fee =?,
                exam_fee =?,
                lab_fee =?,
                reg_fee =?,
                annual_fund =?,
                stationary_fund =?,
                bus_charges =?,
                misc_fee =?,
                misc_remarks =?
            WHERE id =?
        `).run(
            data.monthly_fee, data.adm_fee, data.exam_fee, data.lab_fee,
            data.reg_fee, data.annual_fund, data.stationary_fund,
            data.bus_charges, data.misc_fee, data.misc_remarks,
            data.id
        );
        return { success: true };
    }catch(err){
        return { success: false, error: err.message };
    }
});




ipcMain.handle('send-sms-via-phone', async (event, { phone, message }) => {
  return new Promise((resolve) => {
    // !!! YAHAN APNE PHONE KA IP LAGAO JO SMS GATEWAY APP ME DIKHTA HAI !!!
    const PHONE_IP = "192.168.1.10"; // example: 192.168.18.25
    const PORT = "8080";

    if(!phone) return resolve({ success: false, error: "No phone number" });
    
    // Clean phone number: 0300... -> +92300...
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if(cleanPhone.startsWith('0')) cleanPhone = '92' + cleanPhone.substring(1);

    const encodedMsg = encodeURIComponent(message);
    const path = `/send?phone=${cleanPhone}&text=${encodedMsg}`;

    const options = {
      hostname: PHONE_IP,
      port: PORT,
      path: path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      console.log(`SMS Gateway Status: ${res.statusCode}`);
      resolve({ success: true });
    });

    req.on('error', (e) => {
      console.error("SMS Gateway Error - Phone connect nahi:", e.message);
      resolve({ success: false, error: e.message });
    });

    req.end();
  });
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