let tasks = [];
let filteredTasks = []; 
let teamMembers = [];
let nextTaskId = 1001;
let editMode = false;
let editId = null;
let currentUser = null;

let currentPage = 1;
const rowsPerPage = 8; 

const scriptURL = 'https://script.google.com/macros/s/AKfycbzBJePtyOdhUV11kE6ZSgT8u_ZRuRLSQJYo1EKfkjXpCPeHOXUTJ00jY9muxgszRio6/exec';

// --- 1. Automation & Helper Functions ---

function autoCompleteEmail(input) {
    const domain = "@alliancefinance.lk";
    if (input.value.includes("@")) {
        let parts = input.value.split("@");
        if (parts[1] === "" || !domain.startsWith("@" + parts[1])) {
            input.value = parts[0] + domain;
        }
    }
}

function updateCharCount() {
    const desc = document.getElementById("description");
    const countLabel = document.getElementById("charCount");
    if(!countLabel) return;
    countLabel.innerText = `${desc.value.length}/100 characters`;
    countLabel.style.color = desc.value.length >= 100 ? "red" : "#666";
}

// --- 2. Login & Security ---
async function handleLogin() {
    const email = document.getElementById("loginEmail").value;
    const pass = document.getElementById("loginPass").value;
    if (!email || !pass) return alert("Please enter Email and Password");

    const formData = new URLSearchParams();
    formData.append('action', 'login');
    formData.append('email', email);
    formData.append('password', pass);

    try {
        const res = await fetch(scriptURL, { method: 'POST', body: formData });
        const result = await res.json();
        if (result.success) {
            currentUser = result;
            document.getElementById("loginPage").style.display = "none";
            document.getElementById("mainApp").style.display = "block";
            applyAccessControl();
            loadData();
        } else { alert("Login Failed! Check credentials."); }
    } catch (e) { alert("Login error!"); }
}

function applyAccessControl() {
    document.getElementById("userInfo").innerText = `Logged in as: ${currentUser.name}`;
    const myStatusDropdown = document.getElementById("myCurrentStatus");
    if (currentUser.name.includes("(Leave)")) myStatusDropdown.value = "Leave";
    else if (currentUser.name.includes("(Out)")) myStatusDropdown.value = "Out";
    else myStatusDropdown.value = "Available";

    document.querySelectorAll(".admin-only").forEach(el => el.style.display = (currentUser.role === "Admin") ? "block" : "none");
    document.querySelectorAll(".task-adder-only").forEach(el => el.style.display = (currentUser.role === "Admin" || currentUser.role === "Manager") ? "block" : "none");
}

// --- 3. Data Loading ---
async function loadData() {
    try {
        const res = await fetch(scriptURL);
        const data = await res.json();
        
        if (data.members) {
            teamMembers = data.members;
            const assigneeList = document.getElementById("assigneeList");
            const filterAssignee = document.getElementById("filterAssignee");
            assigneeList.innerHTML = '<option value="">Select Assignee</option>';
            if(filterAssignee) filterAssignee.innerHTML = '<option value="All">All Assignees</option>';
            
            data.members.forEach(m => {
                const opt = new Option(m[1], m[1]);
                if (m[1].includes("(Leave)") || m[1].includes("(Out)")) opt.style.color = "red";
                assigneeList.add(opt.cloneNode(true));
                if(filterAssignee) filterAssignee.add(opt);
            });
        }

        if (data.tasks) {
            tasks = data.tasks.map(t => ({
                id: t[0], name: t[1], assignee: t[2], deadline: t[3], 
                status: t[4], priority: t[5], description: t[6], 
                requestedAssignee: t[7] || "" 
            }));
            const ids = tasks.map(t => parseInt(t.id)).filter(n => !isNaN(n));
            if (ids.length > 0) nextTaskId = Math.max(...ids) + 1;
        }
        applyFilters();
    } catch (e) { console.error("Load Error:", e); }
}

// --- 4. Filtering & Rendering ---
function applyFilters() {
    const search = document.getElementById("searchTask").value.toLowerCase();
    const fPriority = document.getElementById("filterPriority")?.value || "All";
    const fStatus = document.getElementById("filterStatus")?.value || "All";
    const fAssignee = document.getElementById("filterAssignee")?.value || "All";

    let tempTasks = tasks.filter(t => {
        let roleMatch = (currentUser.role === "Admin");
        const creatorName = t.description.split(" [by: ")[1]?.split("]")[0] || "";
        if (!roleMatch && currentUser.role === "Manager") {
            roleMatch = (creatorName === currentUser.name.split(" (")[0]) || (t.assignee === currentUser.name);
        } else if (!roleMatch) {
            roleMatch = (t.assignee === currentUser.name);
        }
        return roleMatch && t.name.toLowerCase().includes(search) && 
               (fPriority === "All" || t.priority === fPriority) && 
               (fStatus === "All" || t.status === fStatus) && 
               (fAssignee === "All" || t.assignee === fAssignee);
    });

    tempTasks.sort((a, b) => {
        const curName = currentUser.name.split(" (")[0];
        const aNeeds = (a.requestedAssignee !== "" && a.description.includes(`[by: ${curName}]`)) ? 1 : 0;
        const bNeeds = (b.requestedAssignee !== "" && b.description.includes(`[by: ${curName}]`)) ? 1 : 0;
        return bNeeds - aNeeds;
    });

    filteredTasks = tempTasks;
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById("taskBody");
    tbody.innerHTML = "";
    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedItems = filteredTasks.slice(startIndex, startIndex + rowsPerPage);
    const today = new Date().toISOString().split('T')[0];

    paginatedItems.forEach(t => {
        const creatorName = t.description.split(" [by: ")[1]?.split("]")[0] || "";
        const isCreator = (creatorName === currentUser.name.split(" (")[0]);
        const needsApproval = isCreator && t.requestedAssignee !== "";
        let dateClass = (t.status !== "Completed" && t.deadline < today) ? "date-overdue" : (t.status !== "Completed" && t.deadline === today ? "date-today" : "");
        const progress = t.status === "Completed" ? 100 : (t.status === "Ongoing" ? 50 : 10);
        const progressColor = t.status === "Completed" ? "#2ecc71" : (t.status === "Ongoing" ? "#f1c40f" : "#bdc3c7");
        const cleanDesc = t.description.split(" [by:")[0];

        tbody.innerHTML += `
            <tr class="${needsApproval ? 'row-highlight' : ''}">
                <td><input type="checkbox" class="task-checkbox" value="${t.id}"></td>
                <td>#${t.id}</td>
                <td>
                    ${needsApproval ? '<span class="badge-approval">ACTION REQUIRED</span><br>' : ''}
                    <strong>${t.name}</strong><br><small>${cleanDesc}</small>
                    <div class="progress-bg"><div class="progress-fill" style="width:${progress}%; background:${progressColor}"></div></div>
                    ${t.requestedAssignee ? `<div style="font-size:10px; color:orange; margin-top:4px;">➔ Request Transfer to: ${t.requestedAssignee}</div>` : ''}
                </td>
                <td>${t.assignee}</td>
                <td class="${dateClass}">${t.deadline}</td>
                <td><span class="status-pill ${t.status.toLowerCase()}">${t.status}</span></td>
                <td>
                    <button onclick="updateStatus(${t.id})" class="btn-act status-btn">Status</button>
                    ${needsApproval ? `<button onclick="approveTransfer(${t.id}, '${t.requestedAssignee}')" class="btn-act status-btn" style="background:#2ecc71">Approve</button>` : ""}
                    ${(t.assignee === currentUser.name && !t.requestedAssignee) ? `<button onclick="requestTransfer(${t.id})" class="btn-act edit-btn">Move</button>` : ""}
                </td>
            </tr>`;
    });
    updateDashboardStats();
    updatePaginationControls();
}

// --- 5. Member Management (Updated with English Logs & Field Clear) ---
async function addMember() {
    const idField = document.getElementById("memberId");
    const nameField = document.getElementById("memberName");
    const emailField = document.getElementById("memberEmail");
    const passField = document.getElementById("memberPass");
    const roleField = document.getElementById("memberRole");

    const id = idField.value.trim();
    const name = nameField.value.trim();
    const email = emailField.value.trim().toLowerCase();
    const pass = passField.value;
    const role = roleField.value;

    if (!id || !name || !email || !pass) return alert("⚠️ All fields are required!");
    if (pass.length < 6) return alert("⚠️ Password must be at least 6 characters!");
    
    const isDuplicate = teamMembers.some(m => m[0].toString() === id);
    if (isDuplicate) return alert("⚠️ Member ID already exists!");

    const formattedUsername = name.toLowerCase().replace(/\s+/g, '');

    if(!confirm(`Add ${formattedUsername} as ${role}?`)) return;

    const formData = new URLSearchParams();
    formData.append('action', 'addMember');
    formData.append('id', id);
    formData.append('name', formattedUsername);
    formData.append('email', email);
    formData.append('password', pass);
    formData.append('role', role);

    try {
        const res = await fetch(scriptURL, { method: 'POST', body: formData });
        const responseText = await res.text();
        if (responseText.includes("Success")) {
            alert("✅ Member added successfully!");
            // CLEAR FIELDS AFTER SUCCESS
            idField.value = "";
            nameField.value = "";
            emailField.value = "";
            passField.value = "";
            roleField.value = "User (Assignee)";
            loadData();
        } else {
            alert("⚠️ Server Response: " + responseText);
        }
    } catch (e) { 
        console.error("Fetch Error:", e);
        alert("❌ Failed to connect to the server. Please check your Script URL.");
    }
}

// --- 6. Task Management (Updated with English Logs & Field Clear) ---
async function saveTask() {
    const nameInput = document.getElementById("taskName");
    const assigneeInput = document.getElementById("assigneeList");
    const deadlineInput = document.getElementById("deadline");
    const priorityInput = document.getElementById("priority");
    const descInput = document.getElementById("description");

    const assignee = assigneeInput.value;
    const deadline = deadlineInput.value;
    const priority = priorityInput.value;
    let desc = descInput.value.trim();

    if (!nameInput.value || !assignee || !deadline) return alert("⚠️ Name, Assignee and Deadline required!");
    
    if (desc.length > 100) desc = desc.substring(0, 100);

    let taskName = nameInput.value.charAt(0).toUpperCase() + nameInput.value.slice(1);

    if (!editMode) desc += ` [by: ${currentUser.name.split(" (")[0]}]`;

    const fd = new URLSearchParams();
    fd.append('action', editMode ? 'updateTask' : 'addTask');
    if(editMode) fd.append('oldId', editId);
    fd.append('id', editMode ? editId : nextTaskId);
    fd.append('name', taskName);
    fd.append('assignee', assignee);
    fd.append('deadline', deadline);
    fd.append('priority', priority);
    fd.append('description', desc);
    fd.append('status', editMode ? tasks.find(t => t.id == editId).status : "Pending");

    try {
        const res = await fetch(scriptURL, { method: 'POST', body: fd });
        if (res.ok) {
            alert("✅ Task Saved Successfully!");
            clearTaskForm();
            // EXPLICIT FIELD CLEARING
            nameInput.value = "";
            assigneeInput.value = "";
            deadlineInput.value = "";
            priorityInput.value = "Normal";
            descInput.value = "";
            loadData();
        }
    } catch (e) { alert("Error saving task!"); }
}

function updateDashboardStats() {
    document.getElementById("statTotal").innerText = filteredTasks.length;
    document.getElementById("statPending").innerText = filteredTasks.filter(t => t.status === "Pending").length;
    document.getElementById("statOngoing").innerText = filteredTasks.filter(t => t.status === "Ongoing").length;
    document.getElementById("statCompleted").innerText = filteredTasks.filter(t => t.status === "Completed").length;
}

async function updateStatus(id) {
    const t = tasks.find(x => x.id == id);
    const states = ["Pending", "Ongoing", "Completed"];
    let nextStatus = states[(states.indexOf(t.status) + 1) % states.length];
    const fd = new URLSearchParams();
    fd.append('action', 'updateStatus');
    fd.append('id', id);
    fd.append('status', nextStatus);
    await fetch(scriptURL, { method: 'POST', body: fd });
    loadData();
}

function updatePaginationControls() {
    const totalPages = Math.ceil(filteredTasks.length / rowsPerPage) || 1;
    document.getElementById("pageInfo").innerText = `Page ${currentPage} of ${totalPages}`;
    document.getElementById("btnPrev").disabled = (currentPage === 1);
    document.getElementById("btnNext").disabled = (currentPage === totalPages);
}
function prevPage() { if (currentPage > 1) { currentPage--; renderTable(); } }
function nextPage() { if ((currentPage * rowsPerPage) < filteredTasks.length) { currentPage++; renderTable(); } }

function clearTaskForm() {
    document.getElementById("taskName").value = "";
    document.getElementById("description").value = "";
    if(document.getElementById("charCount")) document.getElementById("charCount").innerText = "0/100 characters";
    editMode = false;
    document.getElementById("mainTaskBtn").innerText = "Save Task";
}

setInterval(() => { if (currentUser) loadData(); }, 30000);