/**
 * MakeSense Monitor - Main Application
 */

class MakeSenseApp {
    constructor() {
        // BLE instance
        this.ble = new MakeSenseBLE();

        // Data storage
        this.dataPoints = [];
        this.maxDataPoints = 60; // Default 1 minute
        this.stats = {
            min: Infinity,
            max: -Infinity,
            count: 0
        };

        // Chart
        this.chart = null;

        // UI Elements
        this.elements = {
            appContainer: document.getElementById('appContainer'),
            connectionStatus: document.getElementById('connectionStatus'),
            currentValue: document.getElementById('currentValue'),
            statusMessage: document.getElementById('statusMessage'),
            minValue: document.getElementById('minValue'),
            maxValue: document.getElementById('maxValue'),
            sampleCount: document.getElementById('sampleCount'),
            connectBtn: document.getElementById('connectBtn'),
            zeroBtn: document.getElementById('zeroBtn'),
            clearBtn: document.getElementById('clearBtn'),
            exportBtn: document.getElementById('exportBtn'),

            // Chart Controls
            yAxisAuto: document.getElementById('yAxisAuto'),
            yAxisFixed: document.getElementById('yAxisFixed'),
            yAxisInputs: document.getElementById('yAxisInputs'),
            yMinInput: document.getElementById('yMin'),
            yMaxInput: document.getElementById('yMax'),
            timeWindow: document.getElementById('timeWindow'),
            pauseBtn: document.getElementById('pauseBtn'),

            // Alarm Controls
            alarmToggle: document.getElementById('alarmToggle'),
            alarmControls: document.getElementById('alarmControls'),
            alarmThreshold: document.getElementById('alarmThreshold'),
            alarmSound: document.getElementById('alarmSound')
        };

        // App State
        this.state = {
            isPaused: false,
            yAxisMode: 'auto', // 'auto' or 'fixed'
            yMin: -1.0,
            yMax: 1.0,
            isAlarmEnabled: false,
            alarmThreshold: 1.0,
            isAlarmTriggered: false
        };

        this.init();
    }

    init() {
        this.initChart();
        this.bindEvents();
        this.bindBLEEvents();
        this.bindChartEvents();
        this.bindAlarmEvents();
    }

    initChart() {
        const ctx = document.getElementById('chart').getContext('2d');

        // Gradient for line fill
        let gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(0, 212, 170, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 212, 170, 0.0)');

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Current (μA)',
                    data: [],
                    borderColor: '#00d4aa',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4, // Smoother curve
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 12, 41, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#00d4aa',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: (context) => `${context.parsed.y.toFixed(3)} μA`
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            maxTicksLimit: 6,
                            font: { size: 10 }
                        }
                    },
                    y: {
                        display: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: { size: 10 },
                            callback: (value) => value.toFixed(2)
                        }
                    }
                }
            }
        });
    }

    bindEvents() {
        this.elements.connectBtn.addEventListener('click', () => this.handleConnect());
        this.elements.zeroBtn.addEventListener('click', () => this.handleZero());
        this.elements.clearBtn.addEventListener('click', () => this.handleClear());
        this.elements.exportBtn.addEventListener('click', () => this.handleExport());

        // Initialize alarm sound user interaction (needed for some browsers)
        document.body.addEventListener('click', () => {
            if (this.elements.alarmSound.paused) {
                // Just to unlock audio context
                this.elements.alarmSound.load();
            }
        }, { once: true });
    }

    bindChartEvents() {
        // Y-Axis Mode Toggle
        this.elements.yAxisAuto.addEventListener('click', () => this.setYAxisMode('auto'));
        this.elements.yAxisFixed.addEventListener('click', () => this.setYAxisMode('fixed'));

        // Y-Axis Inputs
        const updateYRange = () => {
            this.state.yMin = parseFloat(this.elements.yMinInput.value) || 0;
            this.state.yMax = parseFloat(this.elements.yMaxInput.value) || 1.0;
            this.updateChartConfig();
        };
        this.elements.yMinInput.addEventListener('change', updateYRange);
        this.elements.yMaxInput.addEventListener('change', updateYRange);

        // Time Window
        this.elements.timeWindow.addEventListener('change', (e) => {
            this.setSampleLimit(parseInt(e.target.value));
        });

        // Pause Button
        this.elements.pauseBtn.addEventListener('click', () => {
            this.state.isPaused = !this.state.isPaused;
            this.elements.pauseBtn.classList.toggle('active', this.state.isPaused);
            // Consider changing icon if needed, but styling handles opacity
        });
    }

    bindAlarmEvents() {
        this.elements.alarmToggle.addEventListener('change', (e) => {
            this.state.isAlarmEnabled = e.target.checked;
            this.elements.alarmControls.style.opacity = this.state.isAlarmEnabled ? '1' : '0.5';
            this.elements.alarmControls.style.pointerEvents = this.state.isAlarmEnabled ? 'auto' : 'none';

            if (!this.state.isAlarmEnabled) {
                this.stopAlarm();
            }
        });

        this.elements.alarmThreshold.addEventListener('change', (e) => {
            this.state.alarmThreshold = parseFloat(e.target.value) || 1.0;
        });
    }

    bindBLEEvents() {
        this.ble.on('connection', (data) => this.handleConnectionChange(data));
        this.ble.on('status', (data) => this.handleStatusData(data));
        this.ble.on('error', (data) => this.handleError(data));
    }

    // === Application Logic ===

    setYAxisMode(mode) {
        this.state.yAxisMode = mode;

        // UI Update
        this.elements.yAxisAuto.classList.toggle('active', mode === 'auto');
        this.elements.yAxisFixed.classList.toggle('active', mode === 'fixed');
        this.elements.yAxisInputs.style.display = mode === 'fixed' ? 'flex' : 'none';

        this.updateChartConfig();
    }

    updateChartConfig() {
        if (this.state.yAxisMode === 'fixed') {
            this.chart.options.scales.y.min = this.state.yMin;
            this.chart.options.scales.y.max = this.state.yMax;
        } else {
            delete this.chart.options.scales.y.min;
            delete this.chart.options.scales.y.max;
        }
        this.chart.update('none');
    }

    setSampleLimit(seconds) {
        this.maxDataPoints = seconds;
        if (this.dataPoints.length > this.maxDataPoints) {
            this.dataPoints = this.dataPoints.slice(-this.maxDataPoints);
            this.updateChart();
        }
    }

    checkAlarm(value) {
        if (!this.state.isAlarmEnabled) return;

        if (value > this.state.alarmThreshold) {
            if (!this.state.isAlarmTriggered) {
                this.triggerAlarm();
            }
        } else {
            if (this.state.isAlarmTriggered) {
                this.stopAlarm();
            }
        }
    }

    triggerAlarm() {
        this.state.isAlarmTriggered = true;
        this.elements.appContainer.classList.add('alarm-active');
        this.elements.currentValue.classList.add('negative'); // Reuse negative style for red color

        this.elements.alarmSound.play().catch(e => console.log('Audio play failed:', e));
    }

    stopAlarm() {
        this.state.isAlarmTriggered = false;
        this.elements.appContainer.classList.remove('alarm-active');
        this.elements.currentValue.classList.remove('negative');

        this.elements.alarmSound.pause();
        this.elements.alarmSound.currentTime = 0;
    }

    // === Event Handlers ===

    async handleConnect() {
        if (this.ble.isConnected) {
            await this.ble.disconnect();
        } else {
            try {
                await this.ble.connect();
            } catch (e) {
                console.error('Connect failed:', e);
            }
        }
    }

    async handleZero() {
        try {
            await this.ble.triggerZero();
            this.updateStatusMessage('发送调零命令...');
        } catch (e) {
            console.error('Zero command failed:', e);
        }
    }

    handleClear() {
        this.dataPoints = [];
        this.stats = { min: Infinity, max: -Infinity, count: 0 };
        this.updateChart();
        this.updateStats();
        this.elements.currentValue.textContent = '--';
        this.stopAlarm();
    }

    handleExport() {
        if (this.dataPoints.length === 0) return;

        // Generate CSV
        let csv = 'Time,Value(uA)\n';
        this.dataPoints.forEach(p => {
            csv += `${p.time},${p.value}\n`;
        });

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `makesense_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    handleConnectionChange(data) {
        const statusDot = this.elements.connectionStatus.querySelector('.status-dot');
        const statusText = this.elements.connectionStatus.querySelector('.status-text');

        statusDot.className = 'status-dot ' + data.state;

        switch (data.state) {
            case 'connecting':
                statusText.textContent = '连接中...';
                break;
            case 'connected':
                statusText.textContent = '已连接';
                this.elements.connectBtn.querySelector('span').textContent = '断开';
                this.elements.zeroBtn.disabled = false;
                this.elements.exportBtn.disabled = false;
                this.updateStatusMessage('已连接，等待数据...');
                break;
            case 'disconnected':
                statusText.textContent = '未连接';
                this.elements.connectBtn.querySelector('span').textContent = '连接';
                this.elements.zeroBtn.disabled = true;
                this.elements.exportBtn.disabled = this.dataPoints.length === 0;
                this.updateStatusMessage('已断开连接');
                this.stopAlarm();
                break;
        }
    }

    handleStatusData(data) {
        if (data.type === 'value') {
            this.addDataPoint(data.value);
        } else if (data.type === 'message') {
            this.updateStatusMessage(data.message);
        }
    }

    handleError(data) {
        console.error('BLE Error:', data.message);
        this.updateStatusMessage('错误: ' + data.message);
    }

    // === UI Updates ===

    addDataPoint(value) {
        if (this.state.isPaused) return;

        const now = new Date();
        const timeStr = now.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        this.dataPoints.push({
            time: timeStr,
            value: value,
            timestamp: now.getTime()
        });

        if (this.dataPoints.length > this.maxDataPoints) {
            this.dataPoints.shift();
        }

        // Update stats
        this.stats.count++;
        if (value < this.stats.min) this.stats.min = value;
        if (value > this.stats.max) this.stats.max = value;

        // Alarm Check
        this.checkAlarm(value);

        // Update UI
        this.updateCurrentValue(value);
        this.updateChart();
        this.updateStats();
    }

    updateCurrentValue(value) {
        this.elements.currentValue.textContent = value.toFixed(3);
        // We handle negative class in alarm logic or regular negative value logic
        // If not alarming, show red if negative
        if (!this.state.isAlarmTriggered) {
            this.elements.currentValue.classList.toggle('negative', value < 0);
        }
    }

    updateStatusMessage(message) {
        const el = this.elements.statusMessage;
        el.textContent = message;

        el.classList.remove('zeroing', 'ready');
        if (message.includes('调零')) {
            el.classList.add('zeroing');
        } else if (message.includes('就绪') || message.includes('完成')) {
            el.classList.add('ready');
        }
    }

    updateChart() {
        if (this.state.isPaused) return;

        // Smart Downsampling
        // Target around 100 points for optimal visual density on mobile
        const targetPoints = 100;
        let displayPoints = this.dataPoints;

        if (this.dataPoints.length > targetPoints) {
            const stride = Math.ceil(this.dataPoints.length / targetPoints);
            displayPoints = this.dataPoints.filter((_, index) => index % stride === 0);
        }

        const labels = displayPoints.map(p => p.time);
        const data = displayPoints.map(p => p.value);

        this.chart.data.labels = labels;
        this.chart.data.datasets[0].data = data;
        this.chart.update('none');
    }

    updateStats() {
        this.elements.minValue.textContent = this.stats.min === Infinity ? '--' : this.stats.min.toFixed(3);
        this.elements.maxValue.textContent = this.stats.max === -Infinity ? '--' : this.stats.max.toFixed(3);
        this.elements.sampleCount.textContent = this.stats.count;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MakeSenseApp();
});
