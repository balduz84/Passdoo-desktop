// Passdoo Desktop - Main Application

// Versione dell'applicazione
const APP_VERSION = '1.6.0';

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
        this.version = APP_VERSION;
        this.clientFilter = null;  // { id, name } - Filtro per cliente
        
        this.init();
    }

    init() {
        // Load saved settings
        this.loadSettings();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check if already logged in
        if (this.sessionId) {
            this.validateAndShowMain();
        }
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
            'X-Client-Type': 'desktop-app',
            'X-Client-Version': this.version
        };
        if (this.apiToken) {
            headers['Authorization'] = `Bearer ${this.apiToken}`;
        }
        return headers;
    }

    /**
     * Gestisce l'errore di versione obsoleta
     */
    handleVersionOutdated(data) {
        const downloadUrl = data?.download_url || '/passdoo/downloads';
        const currentVersion = data?.current_version || this.version;
        const minVersion = data?.min_version || 'più recente';
        
        // Esegui logout
        this.sessionId = null;
        this.apiToken = null;
        this.saveSettings();
        
        // Mostra messaggio di aggiornamento
        const loginView = document.getElementById('login-view');
        const mainView = document.getElementById('main-view');
        
        if (mainView) mainView.style.display = 'none';
        if (loginView) loginView.style.display = 'flex';
        
        const loginError = document.getElementById('login-error');
        if (loginError) {
            loginError.style.color = '#f59e0b';
            loginError.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px;">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <h3 style="margin-bottom: 8px; font-size: 18px;">Aggiornamento Richiesto</h3>
                    <p style="margin-bottom: 4px;">La versione attuale (${this.escapeHtml(currentVersion)}) non è più supportata.</p>
                    <p style="margin-bottom: 16px;">È richiesta almeno la versione <strong>${this.escapeHtml(minVersion)}</strong>.</p>
                    <a href="${this.baseUrl}${downloadUrl}" target="_blank" class="btn-update" style="display: inline-block; padding: 12px 24px; background: #521213; color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">
                        Scarica Aggiornamento
                    </a>
                </div>
            `;
        }
    }

    /**
     * Escape HTML per prevenire XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Helper per chiamate API con gestione automatica versione
     */
    async apiFetch(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                ...this.getAuthHeaders(),
                ...(options.headers || {})
            }
        });
        
        // Controlla errore versione
        if (response.status === 426) {
            const errorData = await response.json();
            this.handleVersionOutdated(errorData);
            throw new Error('Aggiornamento richiesto');
        }
        
        return response;
    }

    async validateAndShowMain() {
        if (!this.apiToken) {
            // No token, show login
            return;
        }
        
        try {
            // Validate token with server
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/desktop/validate`, {
                method: 'GET'
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
            if (error.message !== 'Aggiornamento richiesto') {
                // If we can't validate, try to load data anyway
                this.showMainView();
                this.loadData();
            }
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

        // Refresh button
        document.getElementById('refresh-btn').addEventListener('click', () => this.refreshPasswords());

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

        // Password management buttons
        document.getElementById('btn-edit-password')?.addEventListener('click', () => this.editCurrentPassword());
        document.getElementById('btn-change-category')?.addEventListener('click', () => this.showChangeCategoryModal());
        document.getElementById('btn-change-client')?.addEventListener('click', () => this.showChangeClientModal());
        document.getElementById('btn-delete-password')?.addEventListener('click', () => this.showDeleteConfirmModal());
        
        // Category modal
        document.getElementById('close-category-modal')?.addEventListener('click', () => this.hideCategoryModal());
        document.getElementById('cancel-category-btn')?.addEventListener('click', () => this.hideCategoryModal());
        document.getElementById('save-category-btn')?.addEventListener('click', () => this.saveCategory());
        document.getElementById('category-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'category-modal') this.hideCategoryModal();
        });

        // Client modal  
        document.getElementById('close-client-modal')?.addEventListener('click', () => this.hideClientModal());
        document.getElementById('cancel-client-btn')?.addEventListener('click', () => this.hideClientModal());
        document.getElementById('save-client-btn')?.addEventListener('click', () => this.saveClient());
        document.getElementById('client-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'client-modal') this.hideClientModal();
        });

        // Delete modal
        document.getElementById('close-delete-modal')?.addEventListener('click', () => this.hideDeleteModal());
        document.getElementById('cancel-delete-btn')?.addEventListener('click', () => this.hideDeleteModal());
        document.getElementById('confirm-delete-btn')?.addEventListener('click', () => this.deletePassword());
        document.getElementById('delete-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'delete-modal') this.hideDeleteModal();
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
            
            // Request a pending token from the server
            const initResponse = await fetch(`${this.baseUrl}/passdoo/api/desktop/init-auth`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    device_code: this.deviceCode,
                    device_name: 'Passdoo Desktop'
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
                    },
                    body: JSON.stringify({
                        device_code: this.deviceCode
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
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/passwords`, {
                method: 'GET'
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
            if (error.message !== 'Aggiornamento richiesto') {
                loadingState.style.display = 'none';
                emptyState.style.display = 'flex';
                emptyState.querySelector('p').textContent = 'Errore nel caricamento delle password';
            }
        }
    }

    async refreshPasswords() {
        const refreshBtn = document.getElementById('refresh-btn');
        
        // Add spinning animation
        refreshBtn.classList.add('spinning');
        refreshBtn.disabled = true;
        
        try {
            await this.loadPasswords();
            this.showToast('Password aggiornate', 'success');
        } catch (error) {
            console.error('Error refreshing passwords:', error);
            this.showToast('Errore nell\'aggiornamento', 'error');
        } finally {
            // Remove spinning animation
            refreshBtn.classList.remove('spinning');
            refreshBtn.disabled = false;
        }
    }

    async loadClients() {
        try {
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/clients`, {
                method: 'GET'
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
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${passwordId}`, {
                method: 'GET'
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

    /**
     * Group passwords by client and then by category
     * Returns { clientGroups: [...], noClientPasswords: [...] }
     */
    groupPasswordsByClient(passwords) {
        const groups = {};
        const noClient = [];
        
        passwords.forEach(password => {
            if (password.partner_id && password.partner_name) {
                const clientKey = password.partner_id;
                if (!groups[clientKey]) {
                    groups[clientKey] = {
                        id: password.partner_id,
                        name: password.partner_name,
                        image: password.partner_image,
                        categories: {},
                        totalCount: 0
                    };
                }
                
                // Group by category within the client
                const categoryKey = password.category || 'other';
                const categoryName = getCategoryDisplayName(categoryKey);
                
                if (!groups[clientKey].categories[categoryKey]) {
                    groups[clientKey].categories[categoryKey] = {
                        key: categoryKey,
                        name: categoryName,
                        passwords: []
                    };
                }
                groups[clientKey].categories[categoryKey].passwords.push(password);
                groups[clientKey].totalCount++;
            } else {
                noClient.push(password);
            }
        });
        
        // Convert categories to sorted arrays for each client
        Object.values(groups).forEach(group => {
            group.categoryList = Object.values(group.categories).sort((a, b) => 
                a.name.localeCompare(b.name)
            );
        });
        
        // Sort groups by client name
        const sortedGroups = Object.values(groups).sort((a, b) => 
            a.name.localeCompare(b.name)
        );
        
        return {
            clientGroups: sortedGroups,
            noClientPasswords: noClient
        };
    }

    renderPasswords() {
        const loadingState = document.getElementById('loading-state');
        const emptyState = document.getElementById('empty-state');
        const container = document.getElementById('passwords-container');

        loadingState.style.display = 'none';

        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        
        let filtered = this.passwords.filter(p => {
            // Filter by tab (usando is_owner come nel browser extension)
            // Mie = password di cui sono owner
            // Condivise = password condivise con me da altri (non sono owner)
            if (this.currentTab === 'personal' && !p.is_owner) return false;
            if (this.currentTab === 'shared' && p.is_owner) return false;
            
            // Filter by client filter
            if (this.clientFilter && p.partner_id !== this.clientFilter.id) return false;
            
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

        // If client filter is active, show only categories (without client wrapper)
        if (this.clientFilter) {
            this.renderCategoriesOnly(container, filtered);
            return;
        }

        // Group passwords by client and category
        const grouped = this.groupPasswordsByClient(filtered);

        // Render client groups
        grouped.clientGroups.forEach(group => {
            const section = this.createClientSection(group);
            container.appendChild(section);
        });

        // Render passwords without client at the end
        if (grouped.noClientPasswords.length > 0) {
            const section = this.createNoClientSection(grouped.noClientPasswords);
            container.appendChild(section);
        }
    }

    /**
     * Render categories only (used when client filter is active)
     */
    renderCategoriesOnly(container, passwords) {
        // Group by category
        const categories = {};
        passwords.forEach(password => {
            const catKey = password.category || 'other';
            const catName = getCategoryDisplayName(catKey);
            if (!categories[catKey]) {
                categories[catKey] = { key: catKey, name: catName, passwords: [] };
            }
            categories[catKey].passwords.push(password);
        });
        
        const categoryList = Object.values(categories).sort((a, b) => a.name.localeCompare(b.name));
        
        categoryList.forEach(category => {
            const categoryEl = this.createCategorySection(category, true);
            container.appendChild(categoryEl);
        });
    }

    /**
     * Create a category section element
     */
    createCategorySection(category, isStandalone = false) {
        const section = document.createElement('div');
        section.className = 'category-group collapsed' + (isStandalone ? ' category-standalone' : '');
        
        const header = document.createElement('div');
        header.className = 'category-group-header';
        header.innerHTML = `
            <div class="category-icon">${getCategoryIcon(category.key)}</div>
            <span class="category-name">${this.escapeHtml(category.name)}</span>
            <span class="category-count">${category.passwords.length}</span>
            <div class="category-chevron">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
        `;
        
        header.onclick = () => {
            section.classList.toggle('collapsed');
        };
        
        section.appendChild(header);
        
        const content = document.createElement('div');
        content.className = 'category-group-content';
        
        category.passwords.forEach(password => {
            const card = this.createPasswordCard(password);
            content.appendChild(card);
        });
        
        section.appendChild(content);
        return section;
    }

    /**
     * Create a client section with categories inside
     */
    createClientSection(group) {
        const section = document.createElement('div');
        section.className = 'client-section collapsed';
        
        // Build client icon HTML
        let clientIconHtml;
        if (group.image) {
            clientIconHtml = `<img class="client-logo" src="data:image/png;base64,${group.image}" alt="${this.escapeHtml(group.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div class="client-icon" style="display:none;">${group.name.charAt(0).toUpperCase()}</div>`;
        } else {
            clientIconHtml = `<div class="client-icon">${group.name.charAt(0).toUpperCase()}</div>`;
        }
        
        const header = document.createElement('div');
        header.className = 'client-header';
        header.innerHTML = `
            <svg class="collapse-icon" viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
            </svg>
            ${clientIconHtml}
            <span class="client-name">${this.escapeHtml(group.name)}</span>
            <button class="client-filter-btn" data-client-id="${group.id}" data-client-name="${this.escapeHtml(group.name)}" title="Filtra per questo cliente">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                </svg>
            </button>
            <span class="client-count">${group.totalCount}</span>
        `;
        
        // Toggle collapse on header click (but not on filter button)
        header.onclick = (e) => {
            if (e.target.closest('.client-filter-btn')) {
                e.stopPropagation();
                const btn = e.target.closest('.client-filter-btn');
                this.setClientFilter(parseInt(btn.dataset.clientId), btn.dataset.clientName);
                return;
            }
            section.classList.toggle('collapsed');
        };
        
        section.appendChild(header);
        
        const content = document.createElement('div');
        content.className = 'client-passwords';
        
        // Add category sections inside client
        group.categoryList.forEach(category => {
            const categoryEl = this.createCategorySection(category, false);
            content.appendChild(categoryEl);
        });
        
        section.appendChild(content);
        return section;
    }

    /**
     * Create section for passwords without client
     */
    createNoClientSection(passwords) {
        // Group by category
        const categories = {};
        passwords.forEach(p => {
            const catKey = p.category || 'other';
            const catName = getCategoryDisplayName(catKey);
            if (!categories[catKey]) {
                categories[catKey] = { key: catKey, name: catName, passwords: [] };
            }
            categories[catKey].passwords.push(p);
        });
        
        const categoryList = Object.values(categories).sort((a, b) => a.name.localeCompare(b.name));
        
        const section = document.createElement('div');
        section.className = 'client-section collapsed';
        
        const header = document.createElement('div');
        header.className = 'client-header';
        header.innerHTML = `
            <svg class="collapse-icon" viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
            </svg>
            <div class="client-icon client-icon-lock">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
            </div>
            <span class="client-name" style="color: var(--text-secondary);">Senza cliente</span>
            <span class="client-count">${passwords.length}</span>
        `;
        
        header.onclick = () => {
            section.classList.toggle('collapsed');
        };
        
        section.appendChild(header);
        
        const content = document.createElement('div');
        content.className = 'client-passwords';
        
        categoryList.forEach(category => {
            const categoryEl = this.createCategorySection(category, false);
            content.appendChild(categoryEl);
        });
        
        section.appendChild(content);
        return section;
    }

    /**
     * Set client filter
     */
    setClientFilter(clientId, clientName) {
        this.clientFilter = { id: clientId, name: clientName };
        this.updateClientFilterUI();
        this.renderPasswords();
    }

    /**
     * Clear client filter
     */
    clearClientFilter() {
        this.clientFilter = null;
        this.updateClientFilterUI();
        this.renderPasswords();
    }

    /**
     * Update client filter UI indicator
     */
    updateClientFilterUI() {
        let filterIndicator = document.getElementById('client-filter-indicator');
        
        if (this.clientFilter) {
            if (!filterIndicator) {
                filterIndicator = document.createElement('div');
                filterIndicator.id = 'client-filter-indicator';
                filterIndicator.className = 'client-filter-indicator';
                const toolbar = document.querySelector('.toolbar');
                if (toolbar) {
                    toolbar.insertAdjacentElement('afterend', filterIndicator);
                }
            }
            filterIndicator.innerHTML = `
                <span class="filter-label">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                    </svg>
                    Filtrato per: <strong>${this.escapeHtml(this.clientFilter.name)}</strong>
                </span>
                <button class="filter-clear-btn" title="Rimuovi filtro">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;
            filterIndicator.querySelector('.filter-clear-btn').onclick = () => this.clearClientFilter();
            filterIndicator.style.display = 'flex';
        } else if (filterIndicator) {
            filterIndicator.style.display = 'none';
        }
    }

    createPasswordCard(password) {
        const card = document.createElement('div');
        card.className = 'password-card';
        card.addEventListener('click', (e) => {
            // Non aprire il dettaglio se il click è su un bottone o link
            if (e.target.closest('.btn-icon') || e.target.closest('.password-url')) {
                return;
            }
            this.showPasswordDetail(password);
        });

        // Use category icon instead of initial
        const categoryIcon = getCategoryIcon(password.category || 'other');
        
        // Crea il link URL se presente
        let urlHtml = '';
        if (password.uri) {
            // Estrai dominio per display più pulito
            let displayUrl = password.uri;
            try {
                const url = new URL(password.uri.startsWith('http') ? password.uri : 'https://' + password.uri);
                displayUrl = url.hostname + (url.pathname !== '/' ? url.pathname : '');
            } catch (e) {
                displayUrl = password.uri;
            }
            urlHtml = `<a href="#" class="password-url" onclick="event.stopPropagation(); app.openExternalUrl('${this.escapeHtml(password.uri.startsWith('http') ? password.uri : 'https://' + password.uri)}'); return false;" title="${this.escapeHtml(password.uri)}">${this.escapeHtml(displayUrl)}</a>`;
        }
        
        card.innerHTML = `
            <div class="password-icon category-icon-card">${categoryIcon}</div>
            <div class="password-info">
                <div class="password-name">${this.escapeHtml(password.name || 'Senza nome')}</div>
                <div class="password-username">${this.escapeHtml(password.username || '')}</div>
                ${urlHtml}
            </div>
            <div class="password-actions">
                ${password.uri ? `<button class="btn-icon copy-url-btn" title="Copia URL" onclick="event.stopPropagation(); app.copyToClipboard('${this.escapeHtml(password.uri)}', 'URL copiato')">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>` : ''}
                <button class="btn-icon copy-username-btn" title="Copia username" onclick="event.stopPropagation(); app.copyToClipboard('${this.escapeHtml(password.username || '')}', 'Username copiato')">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                        <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                    </svg>
                </button>
                <button class="btn-icon copy-password-btn" title="Copia password" onclick="event.stopPropagation(); app.copyPassword(${password.id})">
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

        // Show category
        const categoryRow = document.getElementById('detail-category-row');
        const categoryEl = document.getElementById('detail-category');
        if (categoryRow && categoryEl) {
            if (password.category) {
                categoryEl.textContent = password.category;
                categoryRow.style.display = 'block';
            } else {
                categoryRow.style.display = 'none';
            }
        }

        // Show/hide action buttons based on per-password permissions
        const btnEdit = document.getElementById('btn-edit-password');
        const btnCategory = document.getElementById('btn-change-category');
        const btnClient = document.getElementById('btn-change-client');
        const btnDelete = document.getElementById('btn-delete-password');
        
        // can_edit: permette modifica, cambio categoria, cambio cliente
        const canEdit = password.can_edit || password.access_level === 'write';
        // can_delete: solo owner o admin possono eliminare
        const canDelete = password.can_delete === true;
        
        // Mostra/nascondi singoli pulsanti in base ai permessi specifici
        if (btnEdit) btnEdit.style.display = canEdit ? 'inline-flex' : 'none';
        if (btnCategory) btnCategory.style.display = canEdit ? 'inline-flex' : 'none';
        if (btnClient) btnClient.style.display = canEdit ? 'inline-flex' : 'none';
        if (btnDelete) btnDelete.style.display = canDelete ? 'inline-flex' : 'none';
        
        // Il div azioni è visibile se almeno un pulsante è visibile
        const actionsDiv = document.getElementById('detail-actions');
        if (actionsDiv) {
            const hasAnyAction = canEdit || canDelete;
            actionsDiv.style.display = hasAnyAction ? 'flex' : 'none';
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

    async showAddPasswordModal() {
        document.getElementById('add-password-form').reset();
        
        // Carica le categorie dinamicamente
        await this.loadCategories();
        
        document.getElementById('add-password-modal').style.display = 'flex';
    }

    async loadCategories() {
        const categorySelect = document.getElementById('new-category');
        
        try {
            const response = await fetch(`${this.baseUrl}/passdoo/api/extension/categories`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });
            
            const data = await response.json();
            
            categorySelect.innerHTML = '';
            
            if (data.success && data.categories && data.categories.length > 0) {
                data.categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat.id || cat.value;
                    option.textContent = cat.label || cat.name;
                    categorySelect.appendChild(option);
                });
            } else {
                // Fallback a categorie default
                const defaultCategories = [
                    { id: 'web', label: 'Siti Web' },
                    { id: 'database', label: 'Database' },
                    { id: 'server', label: 'Server' },
                    { id: 'email', label: 'Email' },
                    { id: 'other', label: 'Altro' }
                ];
                defaultCategories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat.id;
                    option.textContent = cat.label;
                    categorySelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            // In caso di errore, mostra categorie di fallback
            categorySelect.innerHTML = `
                <option value="web">Siti Web</option>
                <option value="other">Altro</option>
            `;
        }
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
        const category = document.getElementById('new-category').value;
        const isShared = document.getElementById('new-is-shared').checked;
        const notes = document.getElementById('new-notes').value;

        try {
            // Determina se category è un ID numerico o una stringa
            const isNumericCategory = !isNaN(category) && category !== '';
            
            const response = await fetch(`${this.baseUrl}/passdoo/api/extension/passwords`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    name,
                    uri: url,
                    username,
                    password,
                    partner_id: clientId ? parseInt(clientId) : null,
                    category_id: isNumericCategory ? parseInt(category) : null,
                    category: !isNumericCategory ? (category || 'web') : null,
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
        console.log('copyToClipboard called with text length:', text ? text.length : 0);
        try {
            // Use Tauri clipboard plugin
            const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
            await writeText(text);
            console.log('Copied via Tauri clipboard plugin');
            this.showToast(message || 'Copiato', 'success');
        } catch (error) {
            console.error('Tauri clipboard failed:', error);
            // Fallback to navigator.clipboard
            try {
                await navigator.clipboard.writeText(text);
                console.log('Copied via navigator.clipboard');
                this.showToast(message || 'Copiato', 'success');
            } catch (e2) {
                console.error('All clipboard methods failed');
                this.showToast('Errore nella copia', 'error');
            }
        }
    }


    async copyPassword(passwordId) {
        console.log('copyPassword called with ID:', passwordId);
        try {
            const password = await this.loadPasswordPlain(passwordId);
            console.log('Password retrieved:', password ? 'yes (length: ' + password.length + ')' : 'no');
            if (password) {
                console.log('About to call copyToClipboard...');
                console.log('this.copyToClipboard exists:', typeof this.copyToClipboard);
                const result = await this.copyToClipboard(password, 'Password copiata');
                console.log('copyToClipboard returned:', result);
            } else {
                this.showToast('Impossibile recuperare la password', 'error');
            }
        } catch (error) {
            console.error('Error in copyPassword:', error);
            console.error('Error stack:', error.stack);
            this.showToast('Errore nel copiare la password', 'error');
        }
    }

    showAboutModal() {
        document.getElementById('about-version-text').textContent = `Versione ${this.version}`;
        document.getElementById('about-modal').style.display = 'flex';
    }

    hideAboutModal() {
        document.getElementById('about-modal').style.display = 'none';
    }

    // ==========================================
    // Password Management Functions
    // ==========================================

    editCurrentPassword() {
        if (!this.currentPassword) return;
        // Per ora, mostriamo un toast - in futuro si può implementare un modal di modifica completo
        this.showToast('Funzione modifica in sviluppo', 'info');
    }

    showChangeCategoryModal() {
        if (!this.currentPassword) return;
        
        // Popola il select con le categorie
        const select = document.getElementById('select-category');
        select.innerHTML = '<option value="">-- Seleziona Categoria --</option>';
        
        this.categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name || cat.label;
            if (this.currentPassword.category_id === cat.id) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        document.getElementById('category-modal').style.display = 'flex';
    }

    hideCategoryModal() {
        document.getElementById('category-modal').style.display = 'none';
    }

    async saveCategory() {
        if (!this.currentPassword) return;
        
        const categoryId = document.getElementById('select-category').value;
        
        try {
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${this.currentPassword.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    category_id: categoryId ? parseInt(categoryId) : null
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                this.showToast(data.error, 'error');
                return;
            }
            
            this.showToast('Categoria aggiornata', 'success');
            this.hideCategoryModal();
            this.hideDetailModal();
            await this.loadPasswords();
        } catch (error) {
            console.error('Error updating category:', error);
            this.showToast('Errore nell\'aggiornamento categoria', 'error');
        }
    }

    showChangeClientModal() {
        if (!this.currentPassword) return;
        
        // Popola il select con i clienti
        const select = document.getElementById('select-client');
        select.innerHTML = '<option value="">Nessun Cliente</option>';
        
        this.clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            if (this.currentPassword.partner_id === client.id) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        document.getElementById('client-modal').style.display = 'flex';
    }

    hideClientModal() {
        document.getElementById('client-modal').style.display = 'none';
    }

    async saveClient() {
        if (!this.currentPassword) return;
        
        const clientId = document.getElementById('select-client').value;
        
        try {
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${this.currentPassword.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    partner_id: clientId ? parseInt(clientId) : null
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                this.showToast(data.error, 'error');
                return;
            }
            
            this.showToast('Cliente aggiornato', 'success');
            this.hideClientModal();
            this.hideDetailModal();
            await this.loadPasswords();
        } catch (error) {
            console.error('Error updating client:', error);
            this.showToast('Errore nell\'aggiornamento cliente', 'error');
        }
    }

    showDeleteConfirmModal() {
        if (!this.currentPassword) return;
        
        document.getElementById('delete-password-name').textContent = this.currentPassword.name || 'Senza nome';
        document.getElementById('delete-modal').style.display = 'flex';
    }

    hideDeleteModal() {
        document.getElementById('delete-modal').style.display = 'none';
    }

    async deletePassword() {
        if (!this.currentPassword) return;
        
        try {
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${this.currentPassword.id}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.error) {
                this.showToast(data.error, 'error');
                return;
            }
            
            this.showToast('Password eliminata', 'success');
            this.hideDeleteModal();
            this.hideDetailModal();
            await this.loadPasswords();
        } catch (error) {
            console.error('Error deleting password:', error);
            this.showToast('Errore nell\'eliminazione', 'error');
        }
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
                this.showToast('URL copiato negli appunti', 'success');
            } catch (clipErr) {
                console.error('Error copying URL:', clipErr);
            }
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

// Helper functions for categories (ported from browser extension)
const CATEGORY_NAMES = {
    'web': 'Siti Web',
    'server': 'Server',
    'database': 'Database',
    'email': 'Email',
    'vpn': 'VPN',
    'wifi': 'WiFi',
    'api': 'API',
    'certificate': 'Certificati',
    'ssh': 'SSH',
    'ftp': 'FTP',
    'other': 'Altro'
};

function getCategoryDisplayName(category) {
    return CATEGORY_NAMES[category] || category || 'Altro';
}

function getCategoryIcon(category) {
    const icons = {
        web: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
        database: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
        server: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
        email: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
        vpn: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        wifi: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
        api: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        certificate: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>',
        ssh: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8l4 4-4 4"/><line x1="12" y1="16" x2="18" y2="16"/></svg>',
        ftp: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        other: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
    };
    
    return icons[category] || icons.other;
}

// Initialize app
const app = new PassdooApp();

// Make app globally available for onclick handlers
window.app = app;
