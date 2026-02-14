// CONFIG is loaded from config.js (not committed to git)

// ==================== EXERCISES ====================
const EXERCISES = [
    { id: 'rower', name: 'Rower', type: 'warmup_distance', startValue: 500, increment: 20, unit: 'm' },
    { id: 'pushups', name: 'Pushups', type: 'warmup_reps', startValue: 25, increment: 2, unit: 'reps' },
    { id: 'ab_wheel', name: 'Ab Wheel', type: 'warmup_reps', startValue: 20, increment: 5, unit: 'reps', targetReps: 20 },
    { id: 'squats', name: 'Squats', type: 'weighted', startValue: 135, increment: 5, unit: 'lbs', targetReps: 20 },
    { id: 'military_press', name: 'Military Press', type: 'weighted', startValue: 45, increment: 5, unit: 'lbs', targetReps: 20 },
    { id: 'bench_press', name: 'Bench Press', type: 'weighted', startValue: 135, increment: 5, unit: 'lbs', targetReps: 20 },
    { id: 'db_rows', name: 'DB Rows', type: 'weighted', startValue: 45, increment: 5, unit: 'lbs', targetReps: 20 },
    { id: 'pullups', name: 'Pull-ups', type: 'bodyweight', startValue: 0, increment: 5, unit: 'lbs', targetReps: 20 },
    { id: 'dips', name: 'Dips', type: 'bodyweight', startValue: 0, increment: 5, unit: 'lbs', targetReps: 20 },
    { id: 'curls', name: 'EZ Bar Curls', type: 'weighted', startValue: 50, increment: 5, unit: 'lbs', targetReps: 20 },
];

// ==================== STATE ====================
let state = {
    currentValues: {},
    log: [],
    currentExerciseIndex: 0,
    currentReps: 0,
    currentSessionLog: [],
    pendingValueUpdates: {},
    workoutStartTime: null,
    logging: false,
};

// ==================== SHEETS API ====================
async function sheetsGet(range) {
    const url = `${CONFIG.SHEETS_API}/${CONFIG.SHEET_ID}/values/${range}?key=${CONFIG.API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);
    return res.json();
}

async function sheetsUpdate(sheet, range, values) {
    const params = new URLSearchParams({
        action: 'update',
        sheet: sheet,
        range: range,
        values: JSON.stringify(values)
    });
    const url = `${CONFIG.SCRIPT_URL}?${params}`;
    console.log('Update URL:', url);
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();
    console.log('Update response:', text);
    return JSON.parse(text);
}

async function sheetsAppend(sheet, row) {
    const params = new URLSearchParams({
        action: 'append',
        sheet: sheet,
        row: JSON.stringify(row)
    });
    const url = `${CONFIG.SCRIPT_URL}?${params}`;
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();
    return JSON.parse(text);
}

async function sheetsBatchAppend(sheet, rows) {
    const params = new URLSearchParams({
        action: 'batchAppend',
        sheet: sheet,
        rows: JSON.stringify(rows)
    });
    const url = `${CONFIG.SCRIPT_URL}?${params}`;
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();
    return JSON.parse(text);
}

async function sheetsBatchUpdate(updates) {
    const params = new URLSearchParams({
        action: 'batchUpdate',
        updates: JSON.stringify(updates)
    });
    const url = `${CONFIG.SCRIPT_URL}?${params}`;
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();
    return JSON.parse(text);
}

// ==================== DATA LOADING ====================
async function loadState() {
    setSyncStatus('syncing');
    try {
        // Load exercises (current values)
        const exercisesData = await sheetsGet('Exercises!A2:G20');
        if (exercisesData.values) {
            exercisesData.values.forEach(row => {
                const id = row[0];
                const currentValue = parseFloat(row[3]) || 0;
                state.currentValues[id] = currentValue;
            });
        }

        // Load log
        const logData = await sheetsGet('Log!A2:G1000');
        if (logData.values) {
            state.log = logData.values.map(row => ({
                date: row[0],
                timestamp: row[1],
                exerciseId: row[2],
                value: parseFloat(row[3]) || 0,
                reps: parseInt(row[4]) || 0,
                notes: row[5] || '',
                progressed: row[6] === 'TRUE' || row[6] === true
            })).filter(entry => entry.date);
        }

        setSyncStatus('synced');
    } catch (err) {
        console.error('Load failed:', err);
        setSyncStatus('error');
        // Initialize with defaults
        EXERCISES.forEach(ex => {
            if (!state.currentValues[ex.id]) {
                state.currentValues[ex.id] = ex.startValue;
            }
        });
    }
    updateDashboard();
}

async function saveExerciseValue(exerciseId, newValue) {
    setSyncStatus('syncing');
    try {
        // Find row index for this exercise
        const exercisesData = await sheetsGet('Exercises!A2:A20');
        const rowIndex = exercisesData.values?.findIndex(row => row[0] === exerciseId);
        if (rowIndex !== -1) {
            await sheetsUpdate('Exercises', `D${rowIndex + 2}`, [[newValue]]);
        }
        setSyncStatus('synced');
    } catch (err) {
        console.error('Save value failed:', err);
        setSyncStatus('error');
    }
}

async function saveLogEntry(entry) {
    setSyncStatus('syncing');
    try {
        await sheetsAppend('Log', [
            entry.date,
            entry.timestamp,
            entry.exerciseId,
            entry.value,
            entry.reps,
            entry.notes,
            entry.progressed ? 'TRUE' : 'FALSE'
        ]);
        setSyncStatus('synced');
    } catch (err) {
        console.error('Save log failed:', err);
        setSyncStatus('error');
        alert('Failed to save: ' + err.message);
    }
}

async function deleteLogEntry(timestamp) {
    // Note: Sheets API can't easily delete rows by value
    // For now, we'll just reload from server and filter locally
    // A production app would use Apps Script for this
    alert('To delete entries, edit the Google Sheet directly.');
}

function setSyncStatus(status) {
    const dot = document.getElementById('sync-dot');
    dot.className = 'sync-dot ' + status;
}

// ==================== DATE UTILITIES ====================
function formatDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getTodayLocal() {
    return formatDateLocal(new Date());
}

function parseLocalDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return new Date(y, m - 1, d);
}

// ==================== DASHBOARD ====================
function updateDashboard() {
    // Streak
    const streak = calculateStreak();
    document.getElementById('streak-count').textContent = streak;
    document.getElementById('streak-fire').style.display = streak > 0 ? 'block' : 'none';
    document.getElementById('streak-warning').classList.toggle('hidden', !isStreakAtRisk());

    // Weekly
    const weekly = getWeeklyWorkouts();
    const dotsEl = document.getElementById('weekly-dots');
    dotsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'dot' + (i < weekly ? ' filled' : '');
        dotsEl.appendChild(dot);
    }
    document.getElementById('weekly-text').textContent = `${weekly}/3 workouts`;

    // Total weight added
    let totalWeight = 0;
    EXERCISES.forEach(ex => {
        if (ex.type === 'weighted' || ex.type === 'bodyweight') {
            const current = state.currentValues[ex.id] || ex.startValue;
            totalWeight += current - ex.startValue;
        }
    });
    document.getElementById('total-weight').textContent = `+${totalWeight}`;

    const uniqueDates = [...new Set(state.log.map(l => l.date))].length;
    document.getElementById('total-workouts').textContent = `${uniqueDates} total workouts completed`;

    // Recent gains
    const gains = state.log.filter(l => l.progressed).slice(-5).reverse();
    const gainsEl = document.getElementById('recent-gains');
    if (gains.length === 0) {
        gainsEl.innerHTML = '<p class="small-text">No progressions yet. Hit 20 reps to level up!</p>';
    } else {
        gainsEl.innerHTML = gains.map(g => {
            const ex = EXERCISES.find(e => e.id === g.exerciseId);
            return `<div class="gain-item"><span>${ex.name}</span><span>→ ${formatValue(g.newValue || g.value, ex)}</span></div>`;
        }).join('');
    }

    // Calendar
    const calendarEl = document.getElementById('calendar-grid');
    calendarEl.innerHTML = '';
    const today = new Date();
    const workoutDates = new Set(state.log.map(l => l.date));
    for (let i = 34; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = formatDateLocal(d);
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day' +
            (workoutDates.has(dateStr) ? ' active' : '') +
            (i === 0 ? ' today' : '');
        calendarEl.appendChild(dayEl);
    }

    // Start button text
    const todayStr = getTodayLocal();
    const todayLogs = state.log.filter(l => l.date === todayStr);
    document.getElementById('start-btn').textContent =
        (todayLogs.length > 0 && todayLogs.length < EXERCISES.length)
            ? 'CONTINUE WORKOUT' : 'START WORKOUT';
}

function calculateStreak() {
    if (state.log.length === 0) return 0;
    const workoutDates = [...new Set(state.log.map(l => l.date))].sort().reverse();
    if (workoutDates.length === 0) return 0;

    let streak = 1;
    const today = parseLocalDate(getTodayLocal());
    const lastWorkout = parseLocalDate(workoutDates[0]);
    const daysSince = Math.floor((today - lastWorkout) / (1000 * 60 * 60 * 24));

    if (daysSince > 3) return 0;

    for (let i = 1; i < workoutDates.length; i++) {
        const d1 = parseLocalDate(workoutDates[i - 1]);
        const d2 = parseLocalDate(workoutDates[i]);
        const daysBetween = Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
        if (daysBetween <= 3) streak++;
        else break;
    }
    return streak;
}

function getWeeklyWorkouts() {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startStr = formatDateLocal(startOfWeek);
    const workoutDates = [...new Set(state.log.map(l => l.date))];
    return workoutDates.filter(d => d >= startStr).length;
}

function isStreakAtRisk() {
    if (state.log.length === 0) return false;
    const workoutDates = [...new Set(state.log.map(l => l.date))].sort().reverse();
    if (workoutDates.length === 0) return false;
    const today = parseLocalDate(getTodayLocal());
    const lastWorkout = parseLocalDate(workoutDates[0]);
    const daysSince = Math.floor((today - lastWorkout) / (1000 * 60 * 60 * 24));
    return daysSince >= 2 && daysSince <= 3;
}

function formatValue(value, exercise) {
    if (exercise.type === 'bodyweight') {
        return value === 0 ? 'BW' : `BW+${value}`;
    }
    return `${value} ${exercise.unit}`;
}

// ==================== WORKOUT ====================
let timerInterval;

function startWorkout() {
    state.workoutStartTime = Date.now();
    state.currentSessionLog = [];

    const todayStr = getTodayLocal();
    const todayLogs = state.log.filter(l => l.date === todayStr);
    const completed = new Set(todayLogs.map(l => l.exerciseId));

    state.currentExerciseIndex = EXERCISES.findIndex(e => !completed.has(e.id));
    if (state.currentExerciseIndex === -1) state.currentExerciseIndex = 0;
    state.currentReps = 0;

    document.getElementById('workout-date').value = todayStr;

    showView('workout');
    updateExerciseDisplay();
    startTimer();
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.workoutStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        document.getElementById('workout-time').textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
}

function updateExerciseDisplay() {
    const exercise = EXERCISES[state.currentExerciseIndex];
    const value = state.currentValues[exercise.id] || exercise.startValue;

    document.getElementById('exercise-name').textContent = exercise.name.toUpperCase();
    document.getElementById('exercise-progress').textContent =
        `${state.currentExerciseIndex + 1} / ${EXERCISES.length}`;
    document.getElementById('progress-fill').style.width =
        `${((state.currentExerciseIndex + 1) / EXERCISES.length) * 100}%`;

    const isWarmup = exercise.type.startsWith('warmup');
    document.getElementById('rep-section').classList.toggle('hidden', isWarmup);
    document.getElementById('warmup-section').classList.toggle('hidden', !isWarmup);

    if (exercise.type === 'warmup_distance') {
        document.getElementById('exercise-type').textContent = 'Warm-up';
        document.getElementById('current-weight').textContent = value;
        document.getElementById('weight-unit').textContent = exercise.unit;
        document.getElementById('target-reps').textContent = 'Row this distance';
    } else if (exercise.type === 'warmup_reps') {
        document.getElementById('exercise-type').textContent = 'Warm-up';
        document.getElementById('current-weight').textContent = value;
        document.getElementById('weight-unit').textContent = 'reps';
        document.getElementById('target-reps').textContent = exercise.targetReps ? `${value} reps to level up` : 'Complete all reps';
    } else if (exercise.type === 'bodyweight') {
        document.getElementById('exercise-type').textContent = 'Bodyweight';
        document.getElementById('current-weight').textContent = value === 0 ? 'BW' : `BW+${value}`;
        document.getElementById('weight-unit').textContent = value === 0 ? '' : 'lbs';
        document.getElementById('target-reps').textContent = '20 reps to level up';
    } else {
        document.getElementById('exercise-type').textContent = 'Weighted';
        document.getElementById('current-weight').textContent = value;
        document.getElementById('weight-unit').textContent = exercise.unit;
        document.getElementById('target-reps').textContent = '20 reps to level up';
    }

    document.getElementById('rep-count').textContent = state.currentReps;
    document.getElementById('notes').value = '';
    document.getElementById('notes').classList.add('hidden');
    document.getElementById('notes-icon').textContent = '▶';

    // Reset logging guard
    state.logging = false;
    const logBtn = document.getElementById('log-btn');
    if (logBtn) {
        logBtn.disabled = false;
        logBtn.style.opacity = '1';
    }

    // Show/hide back button
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.classList.toggle('hidden', state.currentExerciseIndex === 0 && state.currentSessionLog.length === 0);
    }
}

function adjustDate(days) {
    const input = document.getElementById('workout-date');
    const current = parseLocalDate(input.value);
    current.setDate(current.getDate() + days);
    input.value = formatDateLocal(current);
}

function adjustReps(delta) {
    state.currentReps = Math.max(0, state.currentReps + delta);
    document.getElementById('rep-count').textContent = state.currentReps;
    if (navigator.vibrate) navigator.vibrate(10);
}

function setReps(value) {
    state.currentReps = value;
    document.getElementById('rep-count').textContent = state.currentReps;
    if (navigator.vibrate) navigator.vibrate(10);
}

function toggleNotes() {
    const notes = document.getElementById('notes');
    const icon = document.getElementById('notes-icon');
    notes.classList.toggle('hidden');
    icon.textContent = notes.classList.contains('hidden') ? '▶' : '▼';
}

function logExercise() {
    if (state.logging) return;
    state.logging = true;
    const logBtn = document.getElementById('log-btn');
    if (logBtn) {
        logBtn.disabled = true;
        logBtn.style.opacity = '0.5';
    }

    const exercise = EXERCISES[state.currentExerciseIndex];
    const value = state.currentValues[exercise.id] || exercise.startValue;
    const selectedDate = document.getElementById('workout-date').value;
    const isWarmup = exercise.type.startsWith('warmup');
    const reps = isWarmup ? value : state.currentReps;

    let progressed = false;
    let newValue = value;

    if (exercise.targetReps && reps >= exercise.targetReps) {
        progressed = true;
        newValue = value + exercise.increment;
        state.currentValues[exercise.id] = newValue;
        state.pendingValueUpdates[exercise.id] = newValue;
    }

    const entry = {
        date: selectedDate,
        timestamp: new Date().toISOString(),
        exerciseId: exercise.id,
        value: value,
        reps: reps,
        notes: document.getElementById('notes').value,
        progressed: progressed,
        newValue: progressed ? newValue : null
    };

    state.log.push(entry);
    state.currentSessionLog.push(entry);

    if (progressed) {
        showLevelUp(exercise, value, newValue);
    } else {
        nextExercise();
    }
}

function showLevelUp(exercise, oldValue, newValue) {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00d4ff', '#00ff88', '#ffffff']
    });

    document.getElementById('levelup-text').textContent =
        `${exercise.name}: ${formatValue(oldValue, exercise)} → ${formatValue(newValue, exercise)}`;
    document.getElementById('levelup-modal').classList.remove('hidden');

    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

function closeLevelUp() {
    document.getElementById('levelup-modal').classList.add('hidden');
    nextExercise();
}

function goBack() {
    if (state.currentExerciseIndex === 0 && state.currentSessionLog.length === 0) return;

    // Remove last session log entry
    const lastEntry = state.currentSessionLog.pop();
    if (lastEntry) {
        // Remove it from state.log too
        const logIdx = state.log.lastIndexOf(lastEntry);
        if (logIdx !== -1) state.log.splice(logIdx, 1);

        // Undo progression if it happened
        if (lastEntry.progressed) {
            const exercise = EXERCISES.find(e => e.id === lastEntry.exerciseId);
            if (exercise) {
                state.currentValues[exercise.id] = lastEntry.value;
                delete state.pendingValueUpdates[exercise.id];
            }
        }

        // Go back to that exercise, pre-fill its reps
        state.currentExerciseIndex = EXERCISES.findIndex(e => e.id === lastEntry.exerciseId);
        state.currentReps = lastEntry.reps;
    } else {
        // No session entry but index > 0 (skipped exercise) — just go back one
        state.currentExerciseIndex--;
        state.currentReps = 0;
    }

    updateExerciseDisplay();
    // Restore rep count after display update resets it
    document.getElementById('rep-count').textContent = state.currentReps;
}

function skipExercise() {
    nextExercise();
}

function nextExercise() {
    state.currentExerciseIndex++;
    state.currentReps = 0;

    if (state.currentExerciseIndex >= EXERCISES.length) {
        showWorkoutComplete();
    } else {
        updateExerciseDisplay();
    }
}

async function showWorkoutComplete() {
    state.logging = false;
    confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.5 },
        colors: ['#00ff88', '#00d4ff', '#ffffff']
    });

    const progressions = state.currentSessionLog.filter(l => l.progressed).length;
    const streak = calculateStreak();

    document.getElementById('complete-stats').innerHTML = `
        <p>Exercises completed: ${state.currentSessionLog.length}</p>
        <p>Progressions: ${progressions} 🎯</p>
        <p>Current streak: ${streak} 🔥</p>
        <p id="save-status">Saving...</p>
    `;

    document.getElementById('complete-modal').classList.remove('hidden');
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);

    // Batch save all data
    await saveWorkoutData();
}

async function saveWorkoutData() {
    setSyncStatus('syncing');
    try {
        // Save all log entries
        if (state.currentSessionLog.length > 0) {
            const rows = state.currentSessionLog.map(entry => [
                entry.date,
                entry.timestamp,
                entry.exerciseId,
                entry.value,
                entry.reps,
                entry.notes,
                entry.progressed ? 'TRUE' : 'FALSE'
            ]);
            await sheetsBatchAppend('Log', rows);
        }

        // Save all exercise value updates
        const updates = Object.entries(state.pendingValueUpdates);
        if (updates.length > 0) {
            const exercisesData = await sheetsGet('Exercises!A2:A20');
            const updateList = [];
            for (const [exerciseId, newValue] of updates) {
                const rowIndex = exercisesData.values?.findIndex(row => row[0] === exerciseId);
                if (rowIndex !== -1) {
                    updateList.push({ range: `D${rowIndex + 2}`, value: newValue });
                }
            }
            if (updateList.length > 0) {
                await sheetsBatchUpdate(updateList);
            }
        }

        state.pendingValueUpdates = {};
        setSyncStatus('synced');
        document.getElementById('save-status').textContent = 'Saved!';
    } catch (err) {
        console.error('Save failed:', err);
        setSyncStatus('error');
        document.getElementById('save-status').textContent = 'Save failed - tap Done to retry';
    }
}

async function finishWorkout() {
    document.getElementById('complete-modal').classList.add('hidden');
    stopTimer();
    showDashboard();
}

// ==================== HISTORY ====================
function renderHistory() {
    const container = document.getElementById('history-list');

    const byDate = {};
    state.log.forEach(l => {
        if (!byDate[l.date]) byDate[l.date] = [];
        byDate[l.date].push(l);
    });

    const dates = Object.keys(byDate).sort().reverse();

    if (dates.length === 0) {
        container.innerHTML = '<p class="small-text" style="text-align:center;padding:32px;">No workouts logged yet.</p>';
        return;
    }

    const today = getTodayLocal();
    const yesterday = formatDateLocal(new Date(Date.now() - 86400000));

    container.innerHTML = dates.map(date => {
        const logs = byDate[date];
        const progressions = logs.filter(l => l.progressed).length;

        let dateLabel;
        if (date === today) dateLabel = 'Today';
        else if (date === yesterday) dateLabel = 'Yesterday';
        else {
            const d = parseLocalDate(date);
            dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }

        return `
            <div class="history-day">
                <div class="history-day-header">
                    <h3>${dateLabel}</h3>
                    ${progressions > 0 ? `<span class="gains">+${progressions} 🎯</span>` : ''}
                </div>
                ${logs.map(l => {
                    const ex = EXERCISES.find(e => e.id === l.exerciseId);
                    return `
                        <div class="history-entry">
                            <span class="name">${ex.name}</span>
                            <span class="value ${l.progressed ? 'progressed' : ''}">${formatValue(l.value, ex)} × ${l.reps}${l.progressed ? ' ✓' : ''}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }).join('');
}

// ==================== PROGRESS CHARTS ====================
function renderProgress() {
    const container = document.getElementById('progress-charts');
    container.innerHTML = '';

    EXERCISES.filter(e => e.type === 'weighted' || e.type === 'bodyweight').forEach(exercise => {
        const logs = state.log.filter(l => l.exerciseId === exercise.id);
        if (logs.length === 0) return;

        const currentValue = state.currentValues[exercise.id] || exercise.startValue;

        const div = document.createElement('div');
        div.className = 'chart-card';
        div.innerHTML = `
            <h3>${exercise.name}</h3>
            <p class="current">Current: ${formatValue(currentValue, exercise)}</p>
            <div class="chart-container">
                <canvas id="chart-${exercise.id}"></canvas>
            </div>
        `;
        container.appendChild(div);

        const ctx = document.getElementById(`chart-${exercise.id}`).getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: logs.map(l => l.date),
                datasets: [{
                    label: 'Weight',
                    data: logs.map(l => l.value),
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: {
                        ticks: { color: 'rgba(255,255,255,0.5)' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    }
                }
            }
        });
    });
}

// ==================== NAVIGATION ====================
function showView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`${viewName}-view`).classList.remove('hidden');

    document.querySelectorAll('#bottom-nav button').forEach(b => {
        b.classList.toggle('active', b.dataset.view === viewName);
    });
}

function showDashboard() {
    stopTimer();
    showView('dashboard');
    updateDashboard();
}

function showProgress() {
    showView('progress');
    renderProgress();
}

function showHistory() {
    showView('history');
    renderHistory();
}

// ==================== INIT ====================
loadState();
