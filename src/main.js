// Passdoo Desktop - Main Application

class PassdooApp {
    constructor() {
        this.baseUrl = 'https://portal.novacs.net';
        this.sessionId = null;
        this.userEmail = '';
        this.userName = '';
        this.passwords = [];
        this.clients = [];
        this.currentTab = 'all';
        this.currentPassword = null;
        this.authWindow = null;
        this.publicIp = null;
        this.deviceInfo = null;
        
        this.init();
    }

    async init() {
        // Load saved settings
        this.loadSettings();
        
        // Get device info and public IP
        await this.initDeviceInfo();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check if already logged in
        if (this.sessionId) {
            this.validateAndShowMain();
        }
    }

    /**
     * Initialize device info and fetch public IP
     */
    async initDeviceInfo() {
        // Get device/OS info from user agent
        this.deviceInfo = this.getDeviceInfo();
        
        // Fetch public IP (non-blocking)
        this.fetchPublicIp().catch(err => {
            console.warn('Could not fetch public IP:', err);
        });
    }

    /**
     * Get device information from user agent and system
     */
    getDeviceInfo() {
        const ua = navigator.userAgent;
        let os = 'Unknown';
        let osVersion = '';
        
        if (ua.includes('Mac OS X')) {
            os = 'macOS';
            const match = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
            if (match) {
                osVersion = match[1].replace(/_/g, '.');
            }
        } else if (ua.includes('Windows NT')) {
            os = 'Windows';
            const match = ua.match(/Windows NT (\d+\.\d+)/);
            if (match) {
                const ntVersion = match[1];
                // Map NT version to Windows version
                const versionMap = {
                    '10.0': '10/11',
                    '6.3': '8.1',
                    '6.2': '8',
                    '6.1': '7',
                    '6.0': 'Vista'
                };
                osVersion = versionMap[ntVersion] || ntVersion;
            }
        } else if (ua.includes('Linux')) {
            os = 'Linux';
        }

        return {
            os_name: os,
            os_version: osVersion,
            app_name: 'Passdoo Desktop',
            app_version: '1.0.0',
            user_agent: ua
        };
    }

    /**
     * Fetch public IP address from external service
     */
    async fetchPublicIp() {
        try {
            // Try multiple services for reliability
            const services = [
                'https://api.ipify.org?format=json',
                'https://api.my-ip.io/v2/ip.json',
                'https://api64.ipify.org?format=json'
            ];
            
            for (const service of services) {
                try {
                    const response = await fetch(service, { 
                        method: 'GET',
                        timeout: 5000 
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        this.publicIp = data.ip;
                        console.log('Public IP detected:', this.publicIp);
                        return this.publicIp;
                    }
                } catch (e) {
                    continue; // Try next service
                }
            }
        } catch (error) {
            console.warn('Failed to fetch public IP:', error);
        }
        return null;
    }

    /**
     * Get headers with device info for API calls
     */
    getDeviceHeaders() {
        const headers = {};
        
        if (this.publicIp) {
            headers['X-Client-IP'] = this.publicIp;
        }
        
        if (this.deviceInfo) {
            headers['X-Device-Info'] = JSON.stringify({
                os: this.deviceInfo.os_name,
                os_version: this.deviceInfo.os_version,
                app: this.deviceInfo.app_name,
                app_version: this.deviceInfo.app_version
            });
        }
        
        return headers;
    }

    loadSettings() {
        const settings = localStorage.getItem('passdoo_settings');
        if (settings) {
            const parsed = JSON.parse(settings);
            this.sessionId = parsed.sessionId || null;
            this.apiToken = parsed.apiToken || null;
            this.userEmail = parsed.userEmail || '';
            this.userName = parsed.userName || '';
        }
    }

    saveSettings() {
        localStorage.setItem('passdoo_settings', JSON.stringify({
            sessionId: this.sessionId,
            apiToken: this.apiToken,
            userEmail: this.userEmail,
            userName: this.userName
        }));
    }

    /**
     * Get authorization headers for API calls
     */
    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            ...this.getDeviceHeaders()
        };
        if (this.apiToken) {
            headers['Authorization'] = `Bearer ${this.apiToken}`;
        }
        return headers;
    }

    async validateAndShowMain() {
        if (!this.apiToken) {
            // No token, show login
            return;
        }
        
        try {
            // Ensure we have device info before validation
            if (!this.publicIp) {
                await this.fetchPublicIp();
            }
            
            // Validate token with server
            const response = await fetch(`${this.baseUrl}/passdoo/api/desktop/validate`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            const data = await response.json();
            
            if (data.valid) {
                this.showMainView();
                this.loadData();
            } else {
                // Token invalid, show login
                this.sessionId = null;
                this.apiToken = null;
                this.saveSettings();
            }
        } catch (error) {
            console.error('Validation error:', error);
            // If we can't validate, try to load data anyway
            this.showMainView();
            this.loadData();
        }
    }

    setupEventListeners() {
        // Login button - Entra ID OAuth
        document.getElementById('btn-login').addEventListener('click', () => this.handleEntraLogin());

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());

        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Search
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filterPasswords(e.target.value);
        });

        // Add password button
        document.getElementById('add-password-btn').addEventListener('click', () => this.showAddPasswordModal());

        // Modal close buttons
        document.getElementById('close-modal-btn').addEventListener('click', () => this.hideAddPasswordModal());
        document.getElementById('cancel-add-btn').addEventListener('click', () => this.hideAddPasswordModal());
        document.getElementById('close-detail-btn').addEventListener('click', () => this.hideDetailModal());

        // Add password form
        document.getElementById('add-password-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddPassword();
        });

        // Toggle password visibility in form
        document.getElementById('toggle-new-password').addEventListener('click', () => {
            const input = document.getElementById('new-password');
            input.type = input.type === 'password' ? 'text' : 'password';
        });

        // Generate password
        document.getElementById('generate-password-btn').addEventListener('click', () => {
            document.getElementById('new-password').value = this.generatePassword();
        });

        // Close modals on backdrop click
        document.getElementById('add-password-modal').addEventListener('click', (e) => {
            if (e.target.id === 'add-password-modal') {
                this.hideAddPasswordModal();
            }
        });

        document.getElementById('detail-modal').addEventListener('click', (e) => {
            if (e.target.id === 'detail-modal') {
                this.hideDetailModal();
            }
        });

        // About modal
        document.getElementById('about-btn').addEventListener('click', () => this.showAboutModal());
        document.getElementById('close-about-btn').addEventListener('click', () => this.hideAboutModal());
        document.getElementById('about-modal').addEventListener('click', (e) => {
            if (e.target.id === 'about-modal') {
                this.hideAboutModal();
            }
        });

        // About links
        document.getElementById('about-website').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.openExternalUrl('https://www.novacs.net');
        });
        document.getElementById('about-support').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.openExternalUrl('mailto:support@novacs.net');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAddPasswordModal();
                this.hideDetailModal();
                this.hideAboutModal();
            }
        });

        // Listen for auth callback messages (for Tauri deep links)
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'passdoo-auth-callback') {
                this.handleAuthCallback(event.data);
            }
        });
    }

    /**
     * Generate a unique device code for authentication
     */
    generateDeviceCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    /**
     * Handle Entra ID OAuth login
     * Uses device code flow for desktop authentication
     */
    async handleEntraLogin() {
        const btn = document.getElementById('btn-login');
        const btnText = btn.querySelector('.btn-text');
        const btnLoading = btn.querySelector('.btn-loading');
        const errorEl = document.getElementById('login-error');

        btn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-flex';
        errorEl.textContent = '';

        try {
            // Generate a unique device code
            this.deviceCode = this.generateDeviceCode();
            console.log('Generated device code:', this.deviceCode);
            
            // Ensure we have the public IP before auth
            if (!this.publicIp) {
                await this.fetchPublicIp();
            }
            
            // Request a pending token from the server
            const initResponse = await fetch(`${this.baseUrl}/passdoo/api/desktop/init-auth`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getDeviceHeaders()
                },
                body: JSON.stringify({
                    device_code: this.deviceCode,
                    device_name: 'Passdoo Desktop',
                    device_info: {
                        os_name: this.deviceInfo?.os_name || 'Unknown',
                        os_version: this.deviceInfo?.os_version || '',
                        app_name: 'Passdoo Desktop',
                        app_version: '1.0.0',
                        user_agent: navigator.userAgent
                    },
                    ip_address: this.publicIp
                })
            });

            const initData = await initResponse.json();
            console.log('Init response:', initData);
            
            if (!initData.success) {
                throw new Error(initData.error || 'Errore inizializzazione');
            }

            // Open the authorization page in browser
            const authUrl = `${this.baseUrl}/passdoo/api/desktop/auth-callback`;
            console.log('Auth URL:', authUrl);
            
            // Show the device code and a button to open browser
            errorEl.style.color = '#10b981';
            errorEl.innerHTML = `
                <div style="margin-top: 15px; text-align: center;">
                    <p style="margin-bottom: 15px; color: #374151;">Inserisci questo codice nella pagina web:</p>
                    <div id="device-code-display" style="font-size: 32px; letter-spacing: 6px; background: #f3f4f6; padding: 15px 25px; border-radius: 12px; font-family: monospace; font-weight: bold; color: #1f2937; display: inline-block; margin-bottom: 20px; user-select: all;">${this.deviceCode}</div>
                    <br>
                    <button id="open-browser-btn" style="
                        background: #3b82f6; 
                        color: white; 
                        border: none; 
                        padding: 12px 24px; 
                        border-radius: 8px; 
                        font-size: 16px; 
                        cursor: pointer;
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        margin-top: 10px;
                    ">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                        Apri Browser per Autenticazione
                    </button>
                    <p style="margin-top: 15px; font-size: 12px; color: #6b7280;">Dopo l'autenticazione Microsoft, inserisci il codice sopra</p>
                </div>
            `;
            
            // Add click handler for the button - use Tauri command to open external browser
            const openBrowserBtn = document.getElementById('open-browser-btn');
            openBrowserBtn.addEventListener('click', async () => {
                try {
                    // Use the custom Tauri command to open URL in system browser
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('open_url', { url: authUrl });
                    openBrowserBtn.innerHTML = '✓ Browser Aperto!';
                    openBrowserBtn.style.background = '#10b981';
                    console.log('Browser opened successfully');
                } catch (e) {
                    console.error('Error opening browser:', e);
                    // Fallback: copy URL to clipboard
                    try {
                        await navigator.clipboard.writeText(authUrl);
                        openBrowserBtn.innerHTML = '✓ URL Copiato negli appunti!';
                        openBrowserBtn.style.background = '#f59e0b';
                        
                        // Show URL below
                        const urlInfo = document.createElement('div');
                        urlInfo.style.cssText = 'margin-top: 15px; padding: 10px; background: #fef3c7; border-radius: 8px; font-size: 12px; color: #92400e;';
                        urlInfo.textContent = 'Incolla l\'URL nel browser: ' + authUrl;
                        if (!document.getElementById('url-info')) {
                            urlInfo.id = 'url-info';
                            openBrowserBtn.parentNode.appendChild(urlInfo);
                        }
                    } catch (clipErr) {
                        // Show URL for manual copy
                        const urlInfo = document.createElement('div');
                        urlInfo.style.cssText = 'margin-top: 15px; padding: 10px; background: #fee2e2; border-radius: 8px; font-size: 11px; color: #991b1b; word-break: break-all;';
                        urlInfo.textContent = 'Copia questo URL nel browser: ' + authUrl;
                        if (!document.getElementById('url-info')) {
                            urlInfo.id = 'url-info';
                            openBrowserBtn.parentNode.appendChild(urlInfo);
                        }
                    }
                }
            });
            
            // Start polling for token
            this.startTokenPolling();
        } catch (error) {
            console.error('Login error:', error);
            errorEl.style.color = '#dc2626';
            errorEl.textContent = error.message || 'Errore durante il login';
            btn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    }

    /**
     * Poll for token after device code authorization
     */
    startTokenPolling() {
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes with 3-second intervals
        const errorEl = document.getElementById('login-error');
        
        const pollInterval = setInterval(async () => {
            attempts++;
            
            try {
                const response = await fetch(`${this.baseUrl}/passdoo/api/desktop/check-auth`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...this.getDeviceHeaders()
                    },
                    body: JSON.stringify({
                        device_code: this.deviceCode,
                        ip_address: this.publicIp,
                        device_info: {
                            os_name: this.deviceInfo?.os_name || 'Unknown',
                            os_version: this.deviceInfo?.os_version || '',
                            app_name: 'Passdoo Desktop',
                            app_version: '1.0.0'
                        }
                    })
                });
                
                const data = await response.json();
                console.log('Poll response:', data);
                
                if (data.success && data.authenticated) {
                    clearInterval(pollInterval);
                    console.log('Authentication successful!', data);
                    this.apiToken = data.token;
                    this.sessionId = data.token;
                    this.userEmail = data.email || '';
                    this.userName = data.name || data.email || '';
                    this.saveSettings();
                    
                    try {
                        this.showMainView();
                        console.log('Main view shown');
                        await this.loadData();
                        console.log('Data loaded');
                        this.showToast('Login effettuato con successo', 'success');
                    } catch (viewError) {
                        console.error('Error showing main view:', viewError);
                    }
                } else if (data.status === 'pending') {
                    // Still waiting for user to authenticate
                    console.log('Waiting for authentication...', attempts);
                } else if (data.status === 'expired' || data.status === 'not_found') {
                    clearInterval(pollInterval);
                    this.resetLoginButton();
                    errorEl.style.color = '#dc2626';
                    errorEl.textContent = 'Codice scaduto o non valido. Riprova.';
                } else if (data.status === 'invalid') {
                    // Codice non ancora registrato, continuiamo ad aspettare
                    console.log('Code not yet registered, waiting...', attempts);
                }
            } catch (error) {
                console.log('Polling error:', attempts, error);
            }
            
            if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                this.resetLoginButton();
                errorEl.style.color = '#dc2626';
                errorEl.textContent = 'Timeout autenticazione. Riprova.';
            }
        }, 3000);
        
        // Save interval reference to be able to cancel it
        this.pollInterval = pollInterval;
    }

    /**
     * Poll the auth window to detect when login is complete
     */
    pollAuthWindow() {
        const checkInterval = setInterval(async () => {
            try {
                if (this.authWindow && this.authWindow.closed) {
                    clearInterval(checkInterval);
                    // Window was closed, start polling for token
                    this.startTokenPolling();
                }
            } catch (e) {
                // Cross-origin error, window still open on external page
            }
        }, 500);

        // Timeout after 5 minutes
        setTimeout(() => {
            clearInterval(checkInterval);
            if (this.authWindow && !this.authWindow.closed) {
                this.authWindow.close();
            }
            this.resetLoginButton();
        }, 300000);
    }

    /**
     * Handle auth callback from OAuth redirect
     */
    handleAuthCallback(data) {
        if (data.success) {
            this.sessionId = data.session_id || 'authenticated';
            this.userEmail = data.email || '';
            this.userName = data.name || '';
            this.saveSettings();
            this.showMainView();
            this.loadData();
        } else {
            this.resetLoginButton();
            document.getElementById('login-error').textContent = data.error || 'Autenticazione fallita';
        }
    }

    resetLoginButton() {
        const btn = document.getElementById('btn-login');
        const btnText = btn.querySelector('.btn-text');
        const btnLoading = btn.querySelector('.btn-loading');
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }

    handleLogout() {
        // Call logout API
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        
        fetch(`${this.baseUrl}/passdoo/api/desktop/logout`, {
            method: 'POST',
            headers: this.getAuthHeaders()
        }).catch(console.error);

        // Clear all state
        this.sessionId = null;
        this.apiToken = null;
        this.deviceCode = null;
        this.passwords = [];
        this.clients = [];
        localStorage.removeItem('passdoo_settings');
        
        // Reset login view to initial state
        const btn = document.getElementById('btn-login');
        const btnText = btn.querySelector('.btn-text');
        const btnLoading = btn.querySelector('.btn-loading');
        const errorEl = document.getElementById('login-error');
        
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        errorEl.textContent = '';
        errorEl.style.color = '';
        
        // Switch views
        document.getElementById('main-view').style.display = 'none';
        document.getElementById('login-view').style.display = 'block';
    }

    showMainView() {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('main-view').style.display = 'flex';
        document.getElementById('main-view').style.flexDirection = 'column';
        document.getElementById('main-view').style.height = '100vh';
        document.getElementById('user-email').textContent = this.userName || this.userEmail;
    }

    async loadData() {
        try {
            await Promise.all([
                this.loadPasswords(),
                this.loadClients()
            ]);
        } catch (error) {
            console.error('Error loading data:', error);
            this.showToast('Errore nel caricamento dei dati', 'error');
        }
    }

    async loadPasswords() {
        const loadingState = document.getElementById('loading-state');
        const emptyState = document.getElementById('empty-state');
        const container = document.getElementById('passwords-container');

        loadingState.style.display = 'flex';
        emptyState.style.display = 'none';
        container.innerHTML = '';

        try {
            const response = await fetch(`${this.baseUrl}/passdoo/api/extension/passwords`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            const data = await response.json();

            if (data.success) {
                this.passwords = data.passwords || [];
                this.renderPasswords();
            } else {
                throw new Error(data.error || 'Errore nel caricamento');
            }
        } catch (error) {
            console.error('Error loading passwords:', error);
            loadingState.style.display = 'none';
            emptyState.style.display = 'flex';
            emptyState.querySelector('p').textContent = 'Errore nel caricamento delle password';
        }
    }

    async loadClients() {
        try {
            const response = await fetch(`${this.baseUrl}/passdoo/api/extension/clients`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            const data = await response.json();

            if (data.success) {
                this.clients = data.clients || [];
                this.populateClientSelect();
            }
        } catch (error) {
            console.error('Error loading clients:', error);
        }
    }

    async loadPasswordPlain(passwordId) {
        try {
            const response = await fetch(`${this.baseUrl}/passdoo/api/extension/password/${passwordId}`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            const data = await response.json();

            if (data.password && data.password.password_plain) {
                const passwordEl = document.getElementById('detail-password');
                passwordEl.dataset.password = data.password.password_plain;
                return data.password.password_plain;
            }
        } catch (error) {
            console.error('Error loading password:', error);
            this.showToast('Errore nel caricamento della password', 'error');
        }
        return '';
    }

    populateClientSelect() {
        const select = document.getElementById('new-client');
        select.innerHTML = '<option value="">Nessuno</option>';
        
        this.clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            select.appendChild(option);
        });
    }

    renderPasswords() {
        const loadingState = document.getElementById('loading-state');
        const emptyState = document.getElementById('empty-state');
        const container = document.getElementById('passwords-container');

        loadingState.style.display = 'none';

        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        
        // Il server già restituisce solo le password accessibili all'utente,
        // non serve filtrare nuovamente lato client
        // (questo era il bug che escludeva alcune password per i manager)
        
        const filtered = this.passwords.filter(p => {
            // Filter by tab
            // Personali: create dall'utente (is_owner) E non condivise
            // Condivise: is_shared = true
            if (this.currentTab === 'personal') {
                if (!p.is_owner || p.is_shared) return false;
            }
            if (this.currentTab === 'shared') {
                if (!p.is_shared) return false;
            }
            // 'all' tab shows all passwords returned by server
            
            // Filter by search
            if (searchTerm) {
                const matchName = (p.name || '').toLowerCase().includes(searchTerm);
                const matchUsername = (p.username || '').toLowerCase().includes(searchTerm);
                const matchUrl = (p.uri || '').toLowerCase().includes(searchTerm);
                const matchClient = (p.partner_name || '').toLowerCase().includes(searchTerm);
                if (!matchName && !matchUsername && !matchUrl && !matchClient) return false;
            }
            
            return true;
        });

        if (filtered.length === 0) {
            emptyState.style.display = 'flex';
            emptyState.querySelector('p').textContent = searchTerm 
                ? 'Nessun risultato trovato'
                : 'Nessuna password in questa categoria';
            container.innerHTML = '';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = '';

        // Group passwords by client
        const grouped = {};
        const noClient = [];
        
        filtered.forEach(password => {
            if (password.partner_id && password.partner_name) {
                if (!grouped[password.partner_id]) {
                    grouped[password.partner_id] = {
                        name: password.partner_name,
                        image: password.partner_image,
                        passwords: []
                    };
                }
                grouped[password.partner_id].passwords.push(password);
            } else {
                noClient.push(password);
            }
        });

        // Render grouped by client
        const sortedClients = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));
        
        sortedClients.forEach(client => {
            const section = this.createClientSection(client.name, client.passwords, client.image);
            container.appendChild(section);
        });

        // Render passwords without client at the end
        if (noClient.length > 0) {
            const section = this.createClientSection('Senza cliente', noClient, null);
            container.appendChild(section);
        }
    }

    createClientSection(clientName, passwords, image) {
        const section = document.createElement('div');
        section.className = 'client-section collapsed';
        
        // Costruisci l'icona del cliente: immagine se disponibile, altrimenti iniziale
        let clientIconHtml;
        if (image) {
            clientIconHtml = `<img src="data:image/png;base64,${image}" alt="${this.escapeHtml(clientName)}" class="client-icon-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div class="client-icon" style="display: none;">${clientName.charAt(0).toUpperCase()}</div>`;
        } else {
            clientIconHtml = `<div class="client-icon">${clientName.charAt(0).toUpperCase()}</div>`;
        }
        
        const header = document.createElement('div');
        header.className = 'client-header';
        header.innerHTML = `
            <svg class="collapse-icon" viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
            </svg>
            ${clientIconHtml}
            <span class="client-name">${this.escapeHtml(clientName)}</span>
            <span class="client-count">${passwords.length}</span>
        `;
        
        // Toggle collapse on header click
        header.onclick = () => {
            section.classList.toggle('collapsed');
        };
        
        section.appendChild(header);
        
        const list = document.createElement('div');
        list.className = 'client-passwords';
        
        passwords.forEach(password => {
            const card = this.createPasswordCard(password);
            list.appendChild(card);
        });
        
        section.appendChild(list);
        return section;
    }

    createPasswordCard(password) {
        const card = document.createElement('div');
        card.className = 'password-card';
        card.onclick = () => this.showPasswordDetail(password);

        const initial = (password.name || 'P').charAt(0).toUpperCase();
        
        card.innerHTML = `
            <div class="password-icon">${initial}</div>
            <div class="password-info">
                <div class="password-name">${this.escapeHtml(password.name || 'Senza nome')}</div>
                <div class="password-username">${this.escapeHtml(password.username || '')}</div>
            </div>
            <div class="password-actions">
                <button class="btn-icon copy-username-btn" title="Copia username" onclick="event.stopPropagation(); app.copyToClipboard('${this.escapeHtml(password.username || '')}', 'Username copiato')">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                        <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                    </svg>
                </button>
                <button class="btn-icon copy-password-btn" title="Copia password" onclick="event.stopPropagation(); app.copyToClipboard('${this.escapeHtml(password.password || '')}', 'Password copiata')">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                        <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                    </svg>
                </button>
            </div>
        `;

        return card;
    }

    async showPasswordDetail(password) {
        this.currentPassword = password;
        
        document.getElementById('detail-name').textContent = password.name || 'Senza nome';
        document.getElementById('detail-url').textContent = password.uri || '-';
        document.getElementById('detail-username').textContent = password.username || '-';
        
        const passwordEl = document.getElementById('detail-password');
        passwordEl.textContent = '••••••••';
        passwordEl.classList.add('password-masked');
        passwordEl.dataset.visible = 'false';
        passwordEl.dataset.password = ''; // Will be loaded on demand

        const notesRow = document.getElementById('detail-notes-row');
        const notesEl = document.getElementById('detail-notes');
        if (password.description) {
            notesEl.textContent = password.description;
            notesRow.style.display = 'block';
        } else {
            notesRow.style.display = 'none';
        }

        const clientRow = document.getElementById('detail-client-row');
        const clientEl = document.getElementById('detail-client');
        if (password.partner_name) {
            clientEl.textContent = password.partner_name;
            clientRow.style.display = 'block';
        } else {
            clientRow.style.display = 'none';
        }

        // Setup copy buttons
        document.querySelectorAll('#detail-modal .copy-btn').forEach(btn => {
            btn.onclick = async () => {
                const field = btn.dataset.field;
                let value = '';
                if (field === 'url') value = password.uri;
                else if (field === 'username') value = password.username;
                else if (field === 'password') {
                    // Fetch password from server if not already loaded
                    if (!passwordEl.dataset.password) {
                        await this.loadPasswordPlain(password.id);
                    }
                    value = passwordEl.dataset.password;
                }
                this.copyToClipboard(value, 'Copiato negli appunti');
            };
        });

        // Toggle password visibility
        document.querySelector('#detail-modal .toggle-password-btn').onclick = async () => {
            // Load password if not already loaded
            if (!passwordEl.dataset.password) {
                await this.loadPasswordPlain(password.id);
            }
            
            if (passwordEl.dataset.visible === 'true') {
                passwordEl.textContent = '••••••••';
                passwordEl.classList.add('password-masked');
                passwordEl.dataset.visible = 'false';
            } else {
                passwordEl.textContent = passwordEl.dataset.password;
                passwordEl.classList.remove('password-masked');
                passwordEl.dataset.visible = 'true';
            }
        };

        document.getElementById('detail-modal').style.display = 'flex';
    }

    hideDetailModal() {
        document.getElementById('detail-modal').style.display = 'none';
        this.currentPassword = null;
    }

    showAboutModal() {
        document.getElementById('about-modal').style.display = 'flex';
    }

    hideAboutModal() {
        document.getElementById('about-modal').style.display = 'none';
    }

    async openExternalUrl(url) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('open_url', { url });
        } catch (e) {
            console.error('Error opening URL:', e);
            // Fallback: copy to clipboard
            try {
                await navigator.clipboard.writeText(url);
                this.showToast('URL copiato negli appunti', 'info');
            } catch (clipErr) {
                console.error('Could not copy URL:', clipErr);
            }
        }
    }

    showAddPasswordModal() {
        document.getElementById('add-password-form').reset();
        document.getElementById('add-password-modal').style.display = 'flex';
    }

    hideAddPasswordModal() {
        document.getElementById('add-password-modal').style.display = 'none';
    }

    async handleAddPassword() {
        const name = document.getElementById('new-name').value;
        const url = document.getElementById('new-url').value;
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        const clientId = document.getElementById('new-client').value;
        const isShared = document.getElementById('new-is-shared').checked;
        const notes = document.getElementById('new-notes').value;

        try {
            const response = await fetch(`${this.baseUrl}/passdoo/api/extension/passwords`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    name,
                    uri: url,
                    username,
                    password,
                    partner_id: clientId ? parseInt(clientId) : null,
                    is_shared: isShared,
                    description: notes
                })
            });

            const data = await response.json();

            if (data.success) {
                this.hideAddPasswordModal();
                this.showToast('Password salvata con successo', 'success');
                this.loadPasswords();
            } else {
                throw new Error(data.error || 'Errore nel salvataggio');
            }
        } catch (error) {
            this.showToast(error.message || 'Errore nel salvataggio', 'error');
        }
    }

    switchTab(tab) {
        this.currentTab = tab;
        
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        
        this.renderPasswords();
    }

    filterPasswords(searchTerm) {
        this.renderPasswords();
    }

    generatePassword(length = 16) {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
        let password = '';
        const array = new Uint32Array(length);
        crypto.getRandomValues(array);
        for (let i = 0; i < length; i++) {
            password += chars[array[i] % chars.length];
        }
        return password;
    }

    async copyToClipboard(text, message) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast(message || 'Copiato', 'success');
        } catch (error) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showToast(message || 'Copiato', 'success');
        }
    }

    showToast(message, type = '') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast show ' + type;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app
const app = new PassdooApp();

// Make app globally available for onclick handlers
window.app = app;
