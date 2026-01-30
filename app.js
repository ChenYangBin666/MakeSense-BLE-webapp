/**
 * MakeSense Monitor - Main Application
 */

class MakeSenseApp {
    constructor() {
        // BLE instance
        this.ble = new MakeSenseBLE();

        // Data storage
        this.dataPoints = [];
        this.maxDataPoints = 120; // 2 minutes at 1Hz
        this.stats = {
            min: Infinity,
            max: -Infinity,
            count: 0
        };

        // Chart
        this.chart = null;

        // UI Elements
        this.elements = {
            connectionStatus: document.getElementById('connectionStatus'),
            currentValue: document.getElementById('currentValue'),
            statusMessage: document.getElementById('statusMessage'),
            minValue: document.getElementById('minValue'),
            maxValue: document.getElementById('maxValue'),
            sampleCount: document.getElementById('sampleCount'),
            connectBtn: document.getElementById('connectBtn'),
            zeroBtn: document.getElementById('zeroBtn'),
            clearBtn: document.getElementById('clearBtn'),
            exportBtn: document.getElementById('exportBtn')
        };

        this.init();
    }

    init() {
        this.initChart();
        this.bindEvents();
        this.bindBLEEvents();
    }

    initChart() {
        const ctx = document.getElementById('chart').getContext('2d');

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Current (μA)',
                    data: [],
                    borderColor: '#00d4aa',
                    backgroundColor: 'rgba(0, 212, 170, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 0
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#00d4aa',
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
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            maxTicksLimit: 6,
                            font: { size: 10 }
                        }
                    },
                    y: {
                        display: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
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
    }

    bindBLEEvents() {
        this.ble.on('connection', (data) => this.handleConnectionChange(data));
        this.ble.on('status', (data) => this.handleStatusData(data));
        this.ble.on('error', (data) => this.handleError(data));
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
                this.elements.connectBtn.querySelector('span:last-child').textContent = '连接中...';
                break;
            case 'connected':
                statusText.textContent = '已连接';
                this.elements.connectBtn.querySelector('span:last-child').textContent = '断开';
                this.elements.zeroBtn.disabled = false;
                this.elements.exportBtn.disabled = false;
                this.updateStatusMessage('已连接，等待数据...');
                break;
            case 'disconnected':
                statusText.textContent = '未连接';
                this.elements.connectBtn.querySelector('span:last-child').textContent = '连接设备';
                this.elements.zeroBtn.disabled = true;
                this.elements.exportBtn.disabled = this.dataPoints.length === 0;
                this.updateStatusMessage('已断开连接');
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

        // Keep only recent points
        if (this.dataPoints.length > this.maxDataPoints) {
            this.dataPoints.shift();
        }

        // Update stats
        this.stats.count++;
        if (value < this.stats.min) this.stats.min = value;
        if (value > this.stats.max) this.stats.max = value;

        // Update UI
        this.updateCurrentValue(value);
        this.updateChart();
        this.updateStats();
    }

    updateCurrentValue(value) {
        this.elements.currentValue.textContent = value.toFixed(3);
        this.elements.currentValue.classList.toggle('negative', value < 0);
    }

    updateStatusMessage(message) {
        const el = this.elements.statusMessage;
        el.textContent = message;

        // Apply special styles
        el.classList.remove('zeroing', 'ready');
        if (message.includes('调零')) {
            el.classList.add('zeroing');
        } else if (message.includes('就绪') || message.includes('完成')) {
            el.classList.add('ready');
        }
    }

    updateChart() {
        const labels = this.dataPoints.map(p => p.time);
        const data = this.dataPoints.map(p => p.value);

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
