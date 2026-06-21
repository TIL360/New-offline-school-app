const { contextBridge, ipcRenderer, webUtils  } = require('electron');

// --- Authentication & User Management ---
contextBridge.exposeInMainWorld('authAPI', {
    attemptLogin: (credentials) => ipcRenderer.invoke('login-attempt', credentials),
    logout: () => ipcRenderer.send('logout-trigger'), 
    addUser: (userData) => ipcRenderer.invoke('add-user', userData),
    updateUser: (userData) => ipcRenderer.invoke('update-user', userData),
    getAllUsers: () => ipcRenderer.invoke('get-all-users'),
    deleteUser: (id) => ipcRenderer.invoke('delete-user', id),
    send: (channel, data) => ipcRenderer.send(channel, data),
    openDBFolder: () => ipcRenderer.send('open-db-folder'),
    changePassword: (currentP, newP) => ipcRenderer.invoke('change-password', currentP, newP),
    // Ensure this 'send' function is present to communicate with main.js
    send: (channel, data) => ipcRenderer.send(channel, data),



});

// --- Main Application Logic ---
contextBridge.exposeInMainWorld('api', {
    // ADD THIS NEW FUNCTION
    getFilePath: (file) => {
        return webUtils.getPathForFile(file);
    },
         getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),

      getImageUrl: async (picturePath) => {
    return await ipcRenderer.invoke('get-image-url', picturePath);
        
},

addQuestion: (data) => ipcRenderer.invoke('add-question', data),
    getQuestions: (classId, subject, lessonNo) => ipcRenderer.invoke('get-questions', classId, subject, lessonNo),
    addQuestionToPaper: (data) => ipcRenderer.invoke('add-question-to-paper', data),
    getPaperQuestions: (examType, classId, subject) => ipcRenderer.invoke('get-paper-questions', examType, classId, subject),
uploadExcelQuestions: (data) => ipcRenderer.invoke('upload-excel-questions', data),
getPaperSettings: (data) => ipcRenderer.invoke('get-paper-settings', data),
savePaperSettingsOnly: (data) => ipcRenderer.invoke('save-paper-settings-only', data),
// Inside contextBridge.exposeInMainWorld('api', { ... }) block:
removeQuestionFromPaper: (id) => ipcRenderer.invoke('remove-question-from-paper', id),



    // Student Attendance
getStudentAttendance: (data) => ipcRenderer.invoke('get-student-attendance', data),
saveStudentAttendance: (data) => ipcRenderer.invoke('save-student-attendance', data),

// Staff Attendance
getStaffAttendance: (data) => ipcRenderer.invoke('get-staff-attendance', data),
saveStaffAttendance: (data) => ipcRenderer.invoke('save-staff-attendance', data),
getStudentMonthlyReport: (data) => ipcRenderer.invoke('get-student-monthly-report', data),
getStaffMonthlyReport: (data) => ipcRenderer.invoke('get-staff-monthly-report', data),
getStudentGridReport: (data) => ipcRenderer.invoke('get-student-grid-report', data),
getStaffGridReport: (data) => ipcRenderer.invoke('get-staff-grid-report', data),

//sync stas to website
getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),

getStudentByRegNo: (regno) => ipcRenderer.invoke('get-student-by-regno', regno),

updateResultRemarks: (resultId, remarks) => ipcRenderer.invoke('update-result-remarks', resultId, remarks),

     getImageFolder: () => ipcRenderer.invoke('get-image-folder'), 
    // Navigation
    changePage: (page) => ipcRenderer.send('change-page', page),
// In Preload.js
// preload.js
updateAvailedLeaves: (data) => ipcRenderer.invoke('update-availed-leaves', data),
updateAuthLeaves: (data) => ipcRenderer.invoke('update-auth-leaves', data),



    // Class Management
    addClass: (name) => ipcRenderer.invoke('add-class', name),
    getClasses: () => ipcRenderer.invoke('get-classes'),
    deleteClass: (id) => ipcRenderer.invoke('delete-class', id),
    updateClass: (id, name) => ipcRenderer.invoke('update-class', id, name),
getDateWiseReport: (date) => ipcRenderer.invoke('get-date-wise-report', date),
    // Student Management
    addStudent: (studentData) => ipcRenderer.invoke('add-student', studentData),
    getStudents: () => ipcRenderer.invoke('get-students'),
    getStudentById: (id) => ipcRenderer.invoke('get-student-by-id', id),
    updateStudent: (studentData) => ipcRenderer.invoke('update-student', studentData),
    deleteStudent: (id) => ipcRenderer.invoke('deleteStudentAndRelated', id),

    // Fee Management & Filters
    generateStudentFee: (id, month, year) => 
    ipcRenderer.invoke('generate-student-fee', id, month, year),
    generateBulkFees: (month, year) => 
    ipcRenderer.invoke('generate-bulk-fees', month, year),
    getFeeRecords: () => ipcRenderer.invoke('get-fee-records'),
    getFeeRecordsFilters: (filters) => ipcRenderer.invoke('get-fee-records-filters', filters),
    getFilterData: () => ipcRenderer.invoke('get-filter-data'), // Fetches unique months/years/classes
    getFeeRecordById: (id) => ipcRenderer.invoke('get-fee-record-by-id', id),

    // Fee Actions
    updateFeeCollection: (id, amount, date) => ipcRenderer.invoke('update-fee-collection', id, amount, date),
    
    updateFeeSubmit: (id, amount) => ipcRenderer.invoke('update-fee-submit', id, amount),
     deleteFee: (id) => ipcRenderer.invoke('delete-fee', id), 
 
      // Staff Functions
    getStaff: () => ipcRenderer.invoke('get-staff'),
    addStaff: (data) => ipcRenderer.invoke('add-staff', data),
    updateStaff: (id, data) => ipcRenderer.invoke('update-staff', id, data),
    deleteStaff: (id) => ipcRenderer.invoke('delete-staff', id),
    initiateSalary: (month, year) => ipcRenderer.invoke('initiate-salary', month, year),
 getSalaries: (month, year) => ipcRenderer.invoke('get-salaries', { month, year }),
    updateSalaryStatus: (id, status, salary) => ipcRenderer.invoke('update-salary-status', { id, status, salary }),

     getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
       getStudentFeeHistory: (id) => ipcRenderer.invoke('get-student-fee-history', id),
       // Add this inside the contextBridge.exposeInMainWorld('api', { ... }) block

 generateExamSheet: (data) => ipcRenderer.invoke('generate-exam-logic', data),
    getDropdownData: () => ipcRenderer.invoke('get-dropdown-data'),
    // FIXED: added 'data' as the second argument below
    updateSetMarks: (data) => ipcRenderer.invoke('update-set-marks', data),
    getReportData: (data) => ipcRenderer.invoke('get-report-data', data),
     // 5. Saving Individual Student Marks (The missing function)
    updateStudentMarks: (data) => ipcRenderer.invoke('update-student-marks', data),
    // Add this inside your contextBridge
recalculatePositions: (data) => ipcRenderer.invoke('recalculate-positions', data),
// Add this inside the 'api' block in preload.js
// Inside preload.js
getAllStudentProgress: (filters) => ipcRenderer.invoke('get-all-student-progress', filters),
//expenses
 getExpenses: (filters) => ipcRenderer.invoke('get-expenses', filters),
    addExpense: (data) => ipcRenderer.invoke('add-expense', data),
    getExpenseFilters: () => ipcRenderer.invoke('get-expense-filters'),
    deleteExpense: (id) => ipcRenderer.invoke('delete-expense', id),
    //datesheet
  // Inside contextBridge.exposeInMainWorld('api', { ... })
addDateSheet: (data) => ipcRenderer.invoke('add-datesheet', data),
getDateSheet: (filters) => ipcRenderer.invoke('get-datesheet', filters),
updateDateSheet: (data) => ipcRenderer.invoke('update-datesheet', data), // Add this line
deleteDateSheet: (id) => ipcRenderer.invoke('delete-datesheet', id),




getStudentProgress: (id) => ipcRenderer.invoke('get-student-progress', id),
bulkUpdateFees: (data) => ipcRenderer.invoke('bulk-update-fees', data),
// Inside your contextBridge.exposeInMainWorld('api', { ... })
updateSingleFeeField: (data) => ipcRenderer.invoke('update-single-fee-field', data),
  // Inside your preload.js
saveToPdf: () => ipcRenderer.invoke('save-to-pdf'), 


///exam related
getActiveClasses: () => ipcRenderer.invoke('get-active-classes'),
createExamName: (name) => ipcRenderer.invoke('create-exam-name', name),
initiateExamLogic: (data) => ipcRenderer.invoke('initiate-exam-logic', data),
getStudentFeeHistory: (id) => ipcRenderer.invoke('get-student-fee-history', id),
getStatusReport: (type) => ipcRenderer.invoke('get-status-report', type),





});