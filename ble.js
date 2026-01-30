/**
 * MakeSense BLE Communication Module
 * Handles Web Bluetooth API interactions
 */

const BLE_CONFIG = {
    SERVICE_UUID: '12345678-1234-5678-1234-56789abcdef0',
    CHAR_RAWDATA_UUID: '0000fff1-0000-1000-8000-00805f9b34fb',
    CHAR_STATUS_UUID: '0000fff2-0000-1000-8000-00805f9b34fb',
    CHAR_COMMAND_UUID: '0000fff3-0000-1000-8000-00805f9b34fb',

    // Command codes
    CMD_TRIGGER_ZERO: 0x01,
    CMD_STOP_SAMPLING: 0x02,
    CMD_START_SAMPLING: 0x03
};

class MakeSenseBLE {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.charStatus = null;
        this.charCommand = null;
        this.charRawData = null;

        this.isConnected = false;
        this.listeners = {
            'status': [],
            'rawdata': [],
            'connection': [],
            'error': []
        };
    }

    /**
     * Register event listener
     * @param {string} event - 'status', 'rawdata', 'connection', 'error'
     * @param {function} callback
     */
    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    /**
     * Emit event to all listeners
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    /**
     * Connect to MakeSense device
     */
    async connect() {
        try {
            this.emit('connection', { state: 'connecting' });

            // Request device
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ name: 'MakeSense' }],
                optionalServices: [BLE_CONFIG.SERVICE_UUID]
            });

            // Handle disconnection
            this.device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnect();
            });

            // Connect to GATT server
            this.server = await this.device.gatt.connect();

            // Get service
            this.service = await this.server.getPrimaryService(BLE_CONFIG.SERVICE_UUID);

            // Get characteristics
            this.charStatus = await this.service.getCharacteristic(BLE_CONFIG.CHAR_STATUS_UUID);
            this.charCommand = await this.service.getCharacteristic(BLE_CONFIG.CHAR_COMMAND_UUID);

            try {
                this.charRawData = await this.service.getCharacteristic(BLE_CONFIG.CHAR_RAWDATA_UUID);
            } catch (e) {
                console.log('RawData characteristic not available');
            }

            // Subscribe to status notifications
            await this.charStatus.startNotifications();
            this.charStatus.addEventListener('characteristicvaluechanged', (event) => {
                this.handleStatusNotification(event);
            });

            this.isConnected = true;
            this.emit('connection', { state: 'connected', device: this.device.name });

        } catch (error) {
            console.error('Connection error:', error);
            this.emit('error', { message: error.message });
            this.emit('connection', { state: 'disconnected' });
            throw error;
        }
    }

    /**
     * Disconnect from device
     */
    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            await this.device.gatt.disconnect();
        }
        this.handleDisconnect();
    }

    /**
     * Handle disconnection event
     */
    handleDisconnect() {
        this.isConnected = false;
        this.device = null;
        this.server = null;
        this.service = null;
        this.charStatus = null;
        this.charCommand = null;
        this.charRawData = null;
        this.emit('connection', { state: 'disconnected' });
    }

    /**
     * Handle status notification from device
     */
    handleStatusNotification(event) {
        const decoder = new TextDecoder('utf-8');
        const value = decoder.decode(event.target.value);

        // Try to parse as number
        const numValue = parseFloat(value);

        if (!isNaN(numValue)) {
            // It's a numeric value (current reading)
            this.emit('status', {
                type: 'value',
                value: numValue,
                raw: value
            });
        } else {
            // It's a status message
            this.emit('status', {
                type: 'message',
                message: value.trim()
            });
        }
    }

    /**
     * Send command to device
     * @param {number} cmd - Command code
     */
    async sendCommand(cmd) {
        if (!this.isConnected || !this.charCommand) {
            throw new Error('Not connected');
        }

        const data = new Uint8Array([cmd]);
        await this.charCommand.writeValue(data);
    }

    /**
     * Trigger zero calibration
     */
    async triggerZero() {
        await this.sendCommand(BLE_CONFIG.CMD_TRIGGER_ZERO);
    }
}

// Export as global
window.MakeSenseBLE = MakeSenseBLE;
window.BLE_CONFIG = BLE_CONFIG;
