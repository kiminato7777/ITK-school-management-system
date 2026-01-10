// dropout-students-script.js
// Script for managing dropout students

let dropoutTable;
let allDropoutStudents = [];

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function () {
    console.log('Dropout Students Page Loaded');
    showLoading();
    loadDropoutStudents();
});

// Show loading overlay
function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

// Hide loading overlay
function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// Load dropout students from Firebase
function loadDropoutStudents() {
    const studentsRef = firebase.database().ref('students');

    studentsRef.once('value', (snapshot) => {
        allDropoutStudents = [];

        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const student = childSnapshot.val();
                const studentKey = childSnapshot.key;

                // Only include students with status 'dropout'
                if (student.status === 'dropout') {
                    allDropoutStudents.push({
                        key: studentKey,
                        ...student
                    });
                }
            });
        }

        console.log('Loaded dropout students:', allDropoutStudents.length);
        updateStatistics();
        populateTable();
        hideLoading();
    }, (error) => {
        console.error('Error loading dropout students:', error);
        hideLoading();
        Swal.fire({
            icon: 'error',
            title: 'កំហុស!',
            text: 'មិនអាចផ្ទុកទិន្នន័យបានទេ: ' + error.message,
            confirmButtonText: 'យល់ព្រម'
        });
    });
}

// Update statistics
function updateStatistics() {
    document.getElementById('totalDropouts').textContent = allDropoutStudents.length;
}

// Populate table with dropout students
function populateTable() {
    const tbody = document.getElementById('dropoutTableBody');
    tbody.innerHTML = '';

    if (allDropoutStudents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center text-muted py-4">
                    <i class="fas fa-info-circle fa-2x mb-2"></i>
                    <p class="mb-0">មិនមានសិស្សបោះបង់ការសិក្សាទេ</p>
                </td>
            </tr>
        `;

        // Initialize empty DataTable
        if (dropoutTable) {
            dropoutTable.destroy();
        }
        return;
    }

    allDropoutStudents.forEach((student, index) => {
        const row = document.createElement('tr');

        // Get phone number (try father's phone first, then mother's)
        const phoneNumber = student.fatherPhone || student.motherPhone || 'N/A';

        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${student.displayId || 'N/A'}</strong></td>
            <td><strong>${student.lastName || ''} ${student.firstName || ''}</strong></td>
            <td>${student.gender || 'N/A'}</td>
            <td>${student.studyLevel || 'N/A'}</td>
            <td>${student.subject || 'N/A'}</td>
            <td>${student.studyTime || 'N/A'}</td>
            <td>${student.teacherName || 'N/A'}</td>
            <td>${phoneNumber}</td>
            <td><span class="badge-dropout">បោះបង់ការសិក្សា</span></td>
            <td>
                <div class="action-buttons-table">
                    <button class="btn btn-success btn-sm" onclick="restoreStudent('${student.key}')" 
                            title="ទាញមកចូលរៀនវិញ">
                        <i class="fas fa-undo"></i>
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="viewStudent('${student.key}')" 
                            title="មើលព័ត៌មាន">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(row);
    });

    // Initialize or reinitialize DataTable
    if (dropoutTable) {
        dropoutTable.destroy();
    }

    dropoutTable = $('#dropoutTable').DataTable({
        language: {
            lengthMenu: "បង្ហាញ _MENU_ ជួរដេក",
            zeroRecords: "មិនមានទិន្នន័យ",
            info: "បង្ហាញ _START_ ដល់ _END_ នៃ _TOTAL_ ជួរដេក",
            infoEmpty: "មិនមានទិន្នន័យ",
            infoFiltered: "(ត្រងពី _MAX_ ជួរដេកសរុប)",
            search: "ស្វែងរក:",
            paginate: {
                first: "ដំបូង",
                last: "ចុងក្រោយ",
                next: "បន្ទាប់",
                previous: "មុន"
            }
        },
        pageLength: 25,
        order: [[1, 'asc']], // Sort by student ID
        responsive: true,
        autoWidth: false
    });
}

// Restore student (change status from dropout to active)
function restoreStudent(studentKey) {
    Swal.fire({
        title: 'តើអ្នកប្រាកដទេ?',
        text: 'តើអ្នកចង់ទាញសិស្សនេះមកចូលរៀនវិញមែនទេ?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="fas fa-check"></i> បាទ/ចាស ទាញមកវិញ',
        cancelButtonText: '<i class="fas fa-times"></i> បោះបង់'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading();

            // Update student status to 'active'
            firebase.database().ref('students/' + studentKey).update({
                status: 'active'
            })
                .then(() => {
                    hideLoading();
                    Swal.fire({
                        icon: 'success',
                        title: 'ជោគជ័យ!',
                        text: 'បានទាញសិស្សមកចូលរៀនវិញដោយជោគជ័យ',
                        confirmButtonText: 'យល់ព្រម',
                        timer: 2000
                    });

                    // Reload the data
                    loadDropoutStudents();
                })
                .catch((error) => {
                    hideLoading();
                    console.error('Error restoring student:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'កំហុស!',
                        text: 'មិនអាចទាញសិស្សមកវិញបានទេ: ' + error.message,
                        confirmButtonText: 'យល់ព្រម'
                    });
                });
        }
    });
}

// View student details
function viewStudent(studentKey) {
    const student = allDropoutStudents.find(s => s.key === studentKey);

    if (!student) {
        Swal.fire({
            icon: 'error',
            title: 'កំហុស!',
            text: 'រកមិនឃើញព័ត៌មានសិស្ស',
            confirmButtonText: 'យល់ព្រម'
        });
        return;
    }

    // Create detailed student information HTML
    const studentInfo = `
        <div class="text-start">
            <h5 class="border-bottom pb-2 mb-3"><i class="fas fa-user text-primary"></i> ព័ត៌មានផ្ទាល់ខ្លួន</h5>
            <p><strong>អត្តលេខ:</strong> ${student.displayId || 'N/A'}</p>
            <p><strong>ឈ្មោះខ្មែរ:</strong> ${student.lastName || ''} ${student.firstName || ''}</p>
            <p><strong>ឈ្មោះអង់គ្លេស:</strong> ${student.englishLastName || ''} ${student.englishFirstName || ''}</p>
            <p><strong>ភេទ:</strong> ${student.gender || 'N/A'}</p>
            <p><strong>ថ្ងៃខែឆ្នាំកំណើត:</strong> ${student.dob || 'N/A'}</p>
            <p><strong>អាសយដ្ឋាន:</strong> ${student.address || student.studentAddress || 'N/A'}</p>
            
            <h5 class="border-bottom pb-2 mb-3 mt-4"><i class="fas fa-graduation-cap text-success"></i> ព័ត៌មានសិក្សា</h5>
            <p><strong>ថ្នាក់រៀន:</strong> ${student.studyLevel || 'N/A'}</p>
            <p><strong>មុខវិជ្ជា:</strong> ${student.subject || 'N/A'}</p>
            <p><strong>ម៉ោងសិក្សា:</strong> ${student.studyTime || 'N/A'}</p>
            <p><strong>គ្រូបង្រៀន:</strong> ${student.teacherName || 'N/A'}</p>
            <p><strong>ជំនាន់:</strong> ${student.generation || 'N/A'}</p>
            
            <h5 class="border-bottom pb-2 mb-3 mt-4"><i class="fas fa-users text-warning"></i> ព័ត៌មានអាណាព្យាបាល</h5>
            <div class="row">
                <div class="col-md-6">
                    <p class="fw-bold text-primary">ឪពុក:</p>
                    <p><strong>ឈ្មោះ:</strong> ${student.fatherName || 'N/A'}</p>
                    <p><strong>មុខរបរ:</strong> ${student.fatherJob || 'N/A'}</p>
                    <p><strong>លេខទូរស័ព្ទ:</strong> ${student.fatherPhone || 'N/A'}</p>
                </div>
                <div class="col-md-6">
                    <p class="fw-bold text-danger">ម្តាយ:</p>
                    <p><strong>ឈ្មោះ:</strong> ${student.motherName || 'N/A'}</p>
                    <p><strong>មុខរបរ:</strong> ${student.motherJob || 'N/A'}</p>
                    <p><strong>លេខទូរស័ព្ទ:</strong> ${student.motherPhone || 'N/A'}</p>
                </div>
            </div>
            
            <h5 class="border-bottom pb-2 mb-3 mt-4"><i class="fas fa-exclamation-triangle text-danger"></i> ស្ថានភាព</h5>
            <p><span class="badge-dropout">បោះបង់ការសិក្សា</span></p>
        </div>
    `;

    Swal.fire({
        title: 'ព័ត៌មានលម្អិតសិស្ស',
        html: studentInfo,
        width: '800px',
        confirmButtonText: 'បិទ',
        showCancelButton: true,
        cancelButtonText: '<i class="fas fa-undo"></i> ទាញមកចូលរៀនវិញ',
        cancelButtonColor: '#28a745',
        confirmButtonColor: '#6c757d'
    }).then((result) => {
        if (result.dismiss === Swal.DismissReason.cancel) {
            // If user clicked "Restore" button
            restoreStudent(studentKey);
        }
    });
}

// Handle logout
function handleLogout(event) {
    event.preventDefault();

    Swal.fire({
        title: 'តើអ្នកប្រាកដទេ?',
        text: 'តើអ្នកចង់ចាកចេញពីប្រព័ន្ធមែនទេ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'បាទ/ចាស ចាកចេញ',
        cancelButtonText: 'បោះបង់'
    }).then((result) => {
        if (result.isConfirmed) {
            firebase.auth().signOut().then(() => {
                window.location.href = 'login.html';
            }).catch((error) => {
                console.error('Logout error:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'កំហុស!',
                    text: 'មិនអាចចាកចេញបានទេ',
                    confirmButtonText: 'យល់ព្រម'
                });
            });
        }
    });
}
