/**
 * Standard Celeration Chart Dashboard
 * A digital implementation of Ogden Lindsley's precision teaching chart
 */

// ===== Configuration =====
const CONFIG = {
    // Standard Celeration Chart Y-axis range (logarithmic)
    yMin: 0.001,
    yMax: 1000,

    // X-axis range (calendar days) - this will be dynamic based on zoom
    xMin: 0,
    xMax: 140,

    // Chart margins
    margin: { top: 60, right: 80, bottom: 60, left: 80 },

    // Grid lines for log scale (count per minute values)
    logGridLines: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100, 500, 1000],
    majorLogLines: [0.001, 0.01, 0.1, 1, 10, 100, 1000],

    // Week markers
    weekDays: 7,

    // Zoom presets (in days)
    zoomLevels: {
        7: { label: '1 Week', days: 7, weekInterval: 1, dayInterval: 1 },
        30: { label: '1 Month', days: 30, weekInterval: 1, dayInterval: 7 },
        90: { label: '3 Months', days: 90, weekInterval: 2, dayInterval: 14 },
        140: { label: 'Full', days: 140, weekInterval: 4, dayInterval: 14 }
    },

    // Colors for multiple students
    studentColors: [
        '#06b6d4', // cyan
        '#f59e0b', // amber
        '#a855f7', // purple
        '#ec4899', // pink
        '#10b981', // emerald
        '#6366f1', // indigo
        '#f43f5e', // rose
        '#84cc16', // lime
    ],

    // Metric colors
    metricColors: {
        correctPerMinute: '#22c55e',
        errorsPerMinute: '#ef4444',
        wpm: '#3b82f6',
        accuracy: '#a855f7',
        prosody: '#f59e0b'
    },

    // Data point symbols
    symbols: {
        correct: 'dot',
        errors: 'x',
        zero: '?'
    }
};

// ===== State Management =====
const state = {
    students: [],
    activeStudents: [],
    activeMetrics: ['correctPerMinute', 'errorsPerMinute'],
    displayOptions: {
        showCelerationLines: true,
        showDataPoints: true,
        showRecordFloor: false,
        connectPoints: true
    },
    zoom: 7, // Current zoom level in days (start with 1 week for better data visibility)
    hoveredPoint: null,
    canvas: null,
    ctx: null
};

// ===== Make functions globally accessible =====
window.processStudentData = processStudentData;
window.state = state;
window.CONFIG = CONFIG;

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    initEventListeners();
    drawChart();
});

function initCanvas() {
    state.canvas = document.getElementById('sccChart');
    state.ctx = state.canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', () => {
        resizeCanvas();
        drawChart();
    });
}

function resizeCanvas() {
    const wrapper = state.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;

    state.canvas.width = wrapper.clientWidth * dpr;
    state.canvas.height = wrapper.clientHeight * dpr;
    state.canvas.style.width = wrapper.clientWidth + 'px';
    state.canvas.style.height = wrapper.clientHeight + 'px';

    state.ctx.scale(dpr, dpr);
}

function initEventListeners() {
    // File upload
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');

    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);

    // Drag and drop
    const chartWrapper = document.querySelector('.chart-wrapper');
    chartWrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        chartWrapper.classList.add('dragover');
    });
    chartWrapper.addEventListener('dragleave', () => {
        chartWrapper.classList.remove('dragover');
    });
    chartWrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        chartWrapper.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/json') {
            loadFile(file);
        }
    });

    // Zoom controls
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const zoomDays = parseInt(btn.dataset.zoom);
            setZoom(zoomDays);

            // Update active state
            document.querySelectorAll('.zoom-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Metric toggles
    document.querySelectorAll('.metric-toggles .toggle-item').forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const metric = item.dataset.metric;

        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                if (!state.activeMetrics.includes(metric)) {
                    state.activeMetrics.push(metric);
                }
            } else {
                state.activeMetrics = state.activeMetrics.filter(m => m !== metric);
            }
            drawChart();
            updateLegend();
        });
    });

    // Display options
    document.getElementById('showCelerationLines').addEventListener('change', (e) => {
        state.displayOptions.showCelerationLines = e.target.checked;
        drawChart();
    });

    document.getElementById('showDataPoints').addEventListener('change', (e) => {
        state.displayOptions.showDataPoints = e.target.checked;
        drawChart();
    });

    document.getElementById('showRecordFloor').addEventListener('change', (e) => {
        state.displayOptions.showRecordFloor = e.target.checked;
        drawChart();
    });

    document.getElementById('connectPoints').addEventListener('change', (e) => {
        state.displayOptions.connectPoints = e.target.checked;
        drawChart();
    });

    // Mouse interaction for tooltips
    state.canvas.addEventListener('mousemove', handleMouseMove);
    state.canvas.addEventListener('mouseleave', () => {
        const tooltip = document.getElementById('tooltip');
        tooltip.classList.remove('visible');
    });

    // Modal close
    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('infoModal').hidden = true;
    });
}

// ===== Zoom Functions =====
function setZoom(days) {
    state.zoom = days;
    drawChart();
    updateChartSubtitle();
}

function getZoomConfig() {
    return CONFIG.zoomLevels[state.zoom] || CONFIG.zoomLevels[140];
}

function updateChartSubtitle() {
    const subtitle = document.getElementById('chartSubtitle');
    const zoomConfig = getZoomConfig();
    subtitle.textContent = `View: ${zoomConfig.label} (${state.zoom} days)`;
}

// ===== File Handling =====
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
        loadFile(file);
    }
}

function loadFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            processStudentData(data);
        } catch (err) {
            console.error('Error parsing JSON:', err);
            alert('Invalid JSON file format');
        }
    };
    reader.readAsText(file);
}

function processStudentData(data) {
    // Check if it's the expected format
    if (!data.student || !data.assessments) {
        alert('Invalid data format. Expected student data export from Word Analyzer.');
        return;
    }

    const studentId = data.student.id || `student-${Date.now()}`;

    // Check if student already exists
    const existingIndex = state.students.findIndex(s => s.id === studentId);
    if (existingIndex !== -1) {
        // Update existing student
        state.students[existingIndex] = {
            ...state.students[existingIndex],
            ...data.student,
            assessments: data.assessments,
            summary: data.summary
        };
    } else {
        // Add new student with color
        const colorIndex = state.students.length % CONFIG.studentColors.length;
        state.students.push({
            ...data.student,
            assessments: data.assessments,
            summary: data.summary,
            color: CONFIG.studentColors[colorIndex]
        });

        // Automatically make new student active
        state.activeStudents.push(studentId);
    }

    updateStudentList();
    drawChart();
    updateStats();
    updateLegend();
    updateChartSubtitle();
}

// ===== UI Updates =====
function updateStudentList() {
    const container = document.getElementById('studentList');

    if (state.students.length === 0) {
        container.innerHTML = '<p class="empty-state">No data loaded</p>';
        return;
    }

    container.innerHTML = state.students.map((student, index) => `
        <div class="student-item ${state.activeStudents.includes(student.id) ? 'active' : ''}"
             data-id="${student.id}">
            <span class="student-color" style="background: ${student.color}"></span>
            <span class="student-name">${escapeHtml(student.name)}</span>
            <span class="student-count">${student.assessments.length} assessments</span>
            <button class="remove-btn" data-id="${student.id}" title="Remove">&times;</button>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.student-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-btn')) return;

            const id = item.dataset.id;
            if (state.activeStudents.includes(id)) {
                state.activeStudents = state.activeStudents.filter(s => s !== id);
                item.classList.remove('active');
            } else {
                state.activeStudents.push(id);
                item.classList.add('active');
            }
            drawChart();
            updateStats();
            updateLegend();
        });
    });

    container.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            state.students = state.students.filter(s => s.id !== id);
            state.activeStudents = state.activeStudents.filter(s => s !== id);
            updateStudentList();
            drawChart();
            updateStats();
            updateLegend();
        });
    });
}

function updateStats() {
    const panel = document.getElementById('statsPanel');

    if (state.activeStudents.length === 0) {
        panel.innerHTML = '<p class="empty-state">Select a student</p>';
        return;
    }

    // Get first active student for stats
    const student = state.students.find(s => state.activeStudents.includes(s.id));
    if (!student) return;

    // Calculate celeration for correct per minute
    const correctData = student.assessments
        .filter(a => a.celeration && a.celeration.correctPerMinute > 0)
        .map(a => ({
            day: a.celeration.calendarDay,
            value: a.celeration.correctPerMinute
        }));

    const errorData = student.assessments
        .filter(a => a.celeration && a.celeration.errorsPerMinute > 0)
        .map(a => ({
            day: a.celeration.calendarDay,
            value: a.celeration.errorsPerMinute
        }));

    const correctCeleration = calculateCeleration(correctData);
    const errorCeleration = calculateCeleration(errorData);

    panel.innerHTML = `
        <div class="stat-row">
            <span class="stat-label">Student</span>
            <span class="stat-value neutral">${escapeHtml(student.name)}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Assessments</span>
            <span class="stat-value neutral">${student.assessments.length}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Avg Accuracy</span>
            <span class="stat-value neutral">${student.summary?.averages?.accuracy || 'N/A'}%</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Avg WPM</span>
            <span class="stat-value neutral">${student.summary?.averages?.wpm || 'N/A'}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Correct Celeration</span>
            <span class="stat-value ${correctCeleration >= 1 ? 'positive' : 'negative'}">
                ${formatCeleration(correctCeleration)}
            </span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Error Celeration</span>
            <span class="stat-value ${errorCeleration <= 1 ? 'positive' : 'negative'}">
                ${formatCeleration(errorCeleration)}
            </span>
        </div>
    `;
}

function updateLegend() {
    const legend = document.getElementById('chartLegend');
    const items = [];

    state.activeMetrics.forEach(metric => {
        const color = CONFIG.metricColors[metric];
        const label = getMetricLabel(metric);
        const symbol = metric === 'errorsPerMinute' ?
            `<span class="legend-x" style="color: ${color}">X</span>` :
            `<span class="legend-dot" style="background: ${color}"></span>`;

        items.push(`
            <div class="legend-item">
                ${symbol}
                <span>${label}</span>
            </div>
        `);
    });

    legend.innerHTML = items.join('');
}

function getMetricLabel(metric) {
    const labels = {
        correctPerMinute: 'Correct/min',
        errorsPerMinute: 'Errors/min',
        wpm: 'Words/min',
        accuracy: 'Accuracy %',
        prosody: 'Prosody'
    };
    return labels[metric] || metric;
}

// ===== Chart Drawing =====
function drawChart() {
    const { ctx, canvas } = state;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const { margin } = CONFIG;
    const zoomConfig = getZoomConfig();
    const xMax = state.zoom;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Chart dimensions
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Draw background
    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, width, height);

    // Draw chart area
    ctx.save();
    ctx.translate(margin.left, margin.top);

    // Draw grid
    drawGrid(ctx, chartWidth, chartHeight, xMax, zoomConfig);

    // Draw axes
    drawAxes(ctx, chartWidth, chartHeight, xMax, zoomConfig);

    // Draw data for each active student and metric
    state.activeStudents.forEach(studentId => {
        const student = state.students.find(s => s.id === studentId);
        if (!student) return;

        state.activeMetrics.forEach(metric => {
            drawDataSeries(ctx, student, metric, chartWidth, chartHeight, xMax);
        });
    });

    ctx.restore();

    // Draw axis labels
    drawAxisLabels(ctx, width, height, margin);
}

function drawGrid(ctx, width, height, xMax, zoomConfig) {
    // Vertical grid lines (calendar days)
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.lineWidth = 1;

    const dayInterval = zoomConfig.dayInterval;
    for (let day = 0; day <= xMax; day += dayInterval) {
        const x = (day / xMax) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    // Week number labels at top
    ctx.fillStyle = 'rgba(6, 182, 212, 0.5)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';

    const weekInterval = zoomConfig.weekInterval;
    const maxWeeks = Math.ceil(xMax / 7);
    for (let week = 0; week <= maxWeeks; week += weekInterval) {
        const x = (week * 7 / xMax) * width;
        if (x <= width) {
            ctx.fillText(week.toString(), x, -8);
        }
    }

    // Horizontal grid lines (logarithmic)
    CONFIG.logGridLines.forEach(value => {
        const y = valueToY(value, height);
        const isMajor = CONFIG.majorLogLines.includes(value);

        ctx.strokeStyle = isMajor ?
            'rgba(6, 182, 212, 0.3)' :
            'rgba(6, 182, 212, 0.1)';
        ctx.lineWidth = isMajor ? 1 : 0.5;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    });
}

function drawAxes(ctx, width, height, xMax, zoomConfig) {
    // Y-axis labels
    ctx.fillStyle = '#06b6d4';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    CONFIG.majorLogLines.forEach(value => {
        const y = valueToY(value, height);
        let label = value >= 1 ? value.toString() : value.toString();
        ctx.fillText(label, -10, y);
    });

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const dayInterval = zoomConfig.dayInterval;
    for (let day = 0; day <= xMax; day += dayInterval) {
        const x = (day / xMax) * width;
        ctx.fillText(day.toString(), x, height + 10);
    }
}

function drawAxisLabels(ctx, width, height, margin) {
    // Y-axis label (rotated)
    ctx.save();
    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('COUNT PER MINUTE', 0, 0);
    ctx.restore();

    // Week label at top
    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('SUCCESSIVE CALENDAR WEEKS', width / 2, 20);
}

function drawDataSeries(ctx, student, metric, chartWidth, chartHeight, xMax) {
    const color = CONFIG.metricColors[metric];
    const dataPoints = getDataPoints(student, metric);

    if (dataPoints.length === 0) return;

    // Find the minimum calendar day to normalize
    const minDay = Math.min(...dataPoints.map(p => p.day));

    // Normalize days relative to first assessment
    const normalizedPoints = dataPoints.map(p => ({
        ...p,
        normalizedDay: p.day - minDay
    }));

    // Filter points within zoom range
    const visiblePoints = normalizedPoints.filter(p => p.normalizedDay <= xMax);

    // Draw connecting lines
    if (state.displayOptions.connectPoints && visiblePoints.length > 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();

        let started = false;
        visiblePoints.forEach(point => {
            if (point.value <= 0) return;

            const x = (point.normalizedDay / xMax) * chartWidth;
            const y = valueToY(point.value, chartHeight);

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Draw celeration line
    if (state.displayOptions.showCelerationLines && visiblePoints.length >= 2) {
        const validPoints = visiblePoints.filter(p => p.value > 0);
        if (validPoints.length >= 2) {
            drawCelerationLine(ctx, validPoints, color, chartWidth, chartHeight, xMax);
        }
    }

    // Draw data points
    if (state.displayOptions.showDataPoints) {
        visiblePoints.forEach(point => {
            const x = (point.normalizedDay / xMax) * chartWidth;
            const y = valueToY(point.value > 0 ? point.value : 0.0005, chartHeight);

            if (metric === 'errorsPerMinute') {
                drawXMark(ctx, x, y, 6, color);
            } else if (point.value === 0) {
                drawQuestionMark(ctx, x, y, color);
            } else {
                drawDot(ctx, x, y, 5, color);
            }
        });
    }

    // Draw record floor if enabled
    if (state.displayOptions.showRecordFloor) {
        visiblePoints.forEach(point => {
            if (point.countingTimeMin && point.countingTimeMin > 0) {
                const x = (point.normalizedDay / xMax) * chartWidth;
                const floorValue = 1 / point.countingTimeMin;
                const y = valueToY(floorValue, chartHeight);

                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.moveTo(x - 8, y);
                ctx.lineTo(x + 8, y);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        });
    }
}

function getDataPoints(student, metric) {
    return student.assessments
        .filter(a => a.celeration)
        .map(a => {
            let value;
            switch(metric) {
                case 'correctPerMinute':
                    value = a.celeration.correctPerMinute || 0;
                    break;
                case 'errorsPerMinute':
                    value = a.celeration.errorsPerMinute || 0;
                    break;
                case 'wpm':
                    value = a.performance?.wpm || 0;
                    break;
                case 'accuracy':
                    value = a.performance?.accuracy || 0;
                    break;
                case 'prosody':
                    value = (a.prosody?.score || 0) * 20;
                    break;
                default:
                    value = 0;
            }

            return {
                day: a.celeration.calendarDay,
                value: value,
                countingTimeMin: a.celeration.countingTimeMin,
                date: a.celeration.date,
                assessment: a
            };
        })
        .sort((a, b) => a.day - b.day);
}

function drawDot(ctx, x, y, radius, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#0a1628';
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawXMark(ctx, x, y, size, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
}

function drawQuestionMark(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y);
}

function drawCelerationLine(ctx, points, color, chartWidth, chartHeight, xMax) {
    // Calculate celeration using log-linear regression
    const logPoints = points.map(p => ({
        x: p.normalizedDay,
        y: Math.log10(p.value)
    }));

    const n = logPoints.length;
    const sumX = logPoints.reduce((sum, p) => sum + p.x, 0);
    const sumY = logPoints.reduce((sum, p) => sum + p.y, 0);
    const sumXY = logPoints.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = logPoints.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Draw the celeration line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.globalAlpha = 0.8;

    const minX = Math.min(...points.map(p => p.normalizedDay));
    const maxX = Math.max(...points.map(p => p.normalizedDay));

    // Extend line slightly beyond data but within zoom range
    const extendDays = Math.min(3, xMax * 0.1);
    const startX = Math.max(0, minX - extendDays);
    const endX = Math.min(xMax, maxX + extendDays);

    const startY = Math.pow(10, intercept + slope * startX);
    const endY = Math.pow(10, intercept + slope * endX);

    ctx.beginPath();
    ctx.moveTo((startX / xMax) * chartWidth, valueToY(startY, chartHeight));
    ctx.lineTo((endX / xMax) * chartWidth, valueToY(endY, chartHeight));
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
}

// ===== Coordinate Transformations =====
function valueToY(value, chartHeight) {
    const { yMin, yMax } = CONFIG;

    // Clamp value to valid range
    value = Math.max(yMin, Math.min(yMax, value));

    // Logarithmic transformation
    const logMin = Math.log10(yMin);
    const logMax = Math.log10(yMax);
    const logValue = Math.log10(value);

    // Invert Y (0 at bottom)
    const normalized = (logValue - logMin) / (logMax - logMin);
    return chartHeight * (1 - normalized);
}

function yToValue(y, chartHeight) {
    const { yMin, yMax } = CONFIG;

    const logMin = Math.log10(yMin);
    const logMax = Math.log10(yMax);

    const normalized = 1 - (y / chartHeight);
    const logValue = logMin + normalized * (logMax - logMin);

    return Math.pow(10, logValue);
}

// ===== Celeration Calculations =====
function calculateCeleration(dataPoints) {
    if (dataPoints.length < 2) return 1;

    // Filter out zero values
    const validPoints = dataPoints.filter(p => p.value > 0);
    if (validPoints.length < 2) return 1;

    // Log-linear regression
    const logPoints = validPoints.map(p => ({
        x: p.day,
        y: Math.log10(p.value)
    }));

    const n = logPoints.length;
    const sumX = logPoints.reduce((sum, p) => sum + p.x, 0);
    const sumY = logPoints.reduce((sum, p) => sum + p.y, 0);
    const sumXY = logPoints.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = logPoints.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Convert daily slope to weekly celeration
    const weeklyCeleration = Math.pow(10, slope * 7);

    return weeklyCeleration;
}

function formatCeleration(value) {
    if (!isFinite(value) || isNaN(value)) return 'N/A';

    if (value >= 1) {
        return `x${value.toFixed(2)}`;
    } else {
        return `/${(1/value).toFixed(2)}`;
    }
}

// ===== Mouse Interaction =====
function handleMouseMove(e) {
    const rect = state.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - CONFIG.margin.left;
    const y = e.clientY - rect.top - CONFIG.margin.top;

    const chartWidth = state.canvas.clientWidth - CONFIG.margin.left - CONFIG.margin.right;
    const chartHeight = state.canvas.clientHeight - CONFIG.margin.top - CONFIG.margin.bottom;
    const xMax = state.zoom;

    // Check if within chart area
    if (x < 0 || x > chartWidth || y < 0 || y > chartHeight) {
        document.getElementById('tooltip').classList.remove('visible');
        return;
    }

    // Find closest point
    let closestPoint = null;
    let closestDist = Infinity;

    state.activeStudents.forEach(studentId => {
        const student = state.students.find(s => s.id === studentId);
        if (!student) return;

        state.activeMetrics.forEach(metric => {
            const dataPoints = getDataPoints(student, metric);
            const minDay = dataPoints.length > 0 ? Math.min(...dataPoints.map(p => p.day)) : 0;

            dataPoints.forEach(point => {
                if (point.value <= 0) return;

                const normalizedDay = point.day - minDay;
                if (normalizedDay > xMax) return; // Skip points outside zoom range

                const px = (normalizedDay / xMax) * chartWidth;
                const py = valueToY(point.value, chartHeight);

                const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);

                if (dist < closestDist && dist < 20) {
                    closestDist = dist;
                    closestPoint = {
                        student,
                        metric,
                        point,
                        x: px,
                        y: py
                    };
                }
            });
        });
    });

    const tooltip = document.getElementById('tooltip');

    if (closestPoint) {
        tooltip.innerHTML = `
            <div class="tooltip-title">${escapeHtml(closestPoint.student.name)}</div>
            <div class="tooltip-row">
                <span>Date</span>
                <span class="value">${closestPoint.point.date}</span>
            </div>
            <div class="tooltip-row">
                <span>Day</span>
                <span class="value">${closestPoint.point.day}</span>
            </div>
            <div class="tooltip-row">
                <span>${getMetricLabel(closestPoint.metric)}</span>
                <span class="value">${closestPoint.point.value.toFixed(2)}</span>
            </div>
            ${closestPoint.point.countingTimeMin ? `
            <div class="tooltip-row">
                <span>Timing</span>
                <span class="value">${(closestPoint.point.countingTimeMin * 60).toFixed(0)}s</span>
            </div>
            ` : ''}
        `;

        tooltip.style.left = (closestPoint.x + CONFIG.margin.left + 15) + 'px';
        tooltip.style.top = (closestPoint.y + CONFIG.margin.top - 10) + 'px';
        tooltip.classList.add('visible');
    } else {
        tooltip.classList.remove('visible');
    }
}

// ===== Utilities =====
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}
