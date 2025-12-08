// Passdoo Desktop - Main Application

// Versione dell'applicazione
const APP_VERSION = '2.0.0';

class PassdooApp {
    constructor() {
        this.baseUrl = 'https://portal.novacs.net';
        this.sessionId = null;
        this.userEmail = '';
        this.userName = '';
        this.passwords = [];
        this.clients = [];
        this.categories = [];
        this.currentTab = 'all';
        this.currentPassword = null;
        this.authWindow = null;
        this.version = APP_VERSION;
        this.clientFilter = null;  // { id, name } - Filtro per cliente
        this.selectionMode = false;  // Modalità selezione multipla
        this.selectedPasswords = new Set();  // Set di password ID selezionate
        this.availableUsers = [];  // Utenti disponibili per condivisione
        this.selectedUserIds = [];  // Utenti selezionati per condivisione
        
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
        // Selection mode toggle
        document.getElementById('select-mode-btn')?.addEventListener('click', () => this.toggleSelectionMode());
        document.getElementById('bulk-cancel-btn')?.addEventListener('click', () => this.exitSelectionMode());
        document.getElementById('bulk-select-all')?.addEventListener('click', () => this.selectAllVisible());
        document.getElementById('bulk-deselect-all')?.addEventListener('click', () => this.deselectAll());
        document.getElementById('bulk-category-btn')?.addEventListener('click', () => this.showBulkCategoryModal());
        document.getElementById('bulk-client-btn')?.addEventListener('click', () => this.showBulkClientModal());
        
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
        document.getElementById('btn-permissions')?.addEventListener('click', () => this.showPermissionsModal());
        
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
        
        // Permissions modal
        document.getElementById('close-permissions-modal')?.addEventListener('click', () => this.hidePermissionsModal());
        document.getElementById('close-permissions-btn')?.addEventListener('click', () => this.hidePermissionsModal());
        // NOTA: save-permissions-btn è gestito via event delegation in renderPermissionsModal
        document.getElementById('permissions-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'permissions-modal') this.hidePermissionsModal();
        });
        document.getElementById('add-access-btn')?.addEventListener('click', () => this.addAccessToPassword());

        // Edit password modal
        document.getElementById('edit-password-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'edit-password-modal') this.hideEditPasswordModal();
        });
        document.getElementById('close-edit-modal')?.addEventListener('click', () => this.hideEditPasswordModal());
        document.getElementById('cancel-edit-btn')?.addEventListener('click', () => this.hideEditPasswordModal());
        document.getElementById('edit-password-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleEditPassword();
        });
        document.getElementById('toggle-edit-password')?.addEventListener('click', () => this.toggleEditPasswordVisibility());
        document.getElementById('generate-edit-password')?.addEventListener('click', () => {
            document.getElementById('edit-password').value = this.generatePassword();
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
        this.categories = [];
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
        document.getElementById('user-email').textContent = this.userName || this.userEmail;
    }

    async loadData() {
        try {
            await Promise.all([
                this.loadPasswords(),
                this.loadClients(),
                this.loadCategoriesData()
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


    async loadCategoriesData() {
        try {
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/categories`, {
                method: 'GET'
            });

            const data = await response.json();

            if (data.success) {
                this.categories = data.categories || [];
            }
        } catch (error) {
            console.error('Error loading categories:', error);
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
        card.className = 'password-card' + (this.selectionMode && this.selectedPasswords.has(password.id) ? ' selected' : '');
        card.dataset.passwordId = password.id;
        
        card.addEventListener('click', (e) => {
            // Non aprire il dettaglio se il click è su un bottone, link o checkbox
            if (e.target.closest('.btn-icon') || e.target.closest('.password-url') || e.target.closest('.selection-checkbox')) {
                return;
            }
            
            // In selection mode, toggle selection
            if (this.selectionMode) {
                this.togglePasswordSelection(password.id);
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
        
        // Checkbox per selection mode (solo se can_edit)
        const checkboxHtml = this.selectionMode ? `
            <div class="selection-checkbox-wrapper">
                <input type="checkbox" class="selection-checkbox" 
                       ${this.selectedPasswords.has(password.id) ? 'checked' : ''} 
                       ${password.can_edit ? '' : 'disabled title="Non hai permessi di modifica"'}
                       onclick="event.stopPropagation(); app.togglePasswordSelection(${password.id})">
            </div>
        ` : '';
        
        card.innerHTML = `
            ${checkboxHtml}
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
        const urlEl = document.getElementById('detail-url');
        if (password.uri && password.uri !== '-') {
            const fullUrl = password.uri.startsWith('http') ? password.uri : 'https://' + password.uri;
            urlEl.innerHTML = '<a href="#" class="detail-url-link" style="color: var(--primary-color); text-decoration: none;">' + this.escapeHtml(password.uri) + '</a>';
            urlEl.querySelector('a').onclick = (e) => {
                e.preventDefault();
                this.openExternalUrl(fullUrl);
            };
        } else {
            urlEl.textContent = '-';
        }
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
                // Clear any existing timer
                if (this.passwordHideTimer) {
                    clearTimeout(this.passwordHideTimer);
                    this.passwordHideTimer = null;
                }
            } else {
                passwordEl.textContent = passwordEl.dataset.password;
                passwordEl.classList.remove('password-masked');
                passwordEl.dataset.visible = 'true';
                // Auto-hide after 5 seconds
                if (this.passwordHideTimer) {
                    clearTimeout(this.passwordHideTimer);
                }
                this.passwordHideTimer = setTimeout(() => {
                    passwordEl.textContent = '••••••••';
                    passwordEl.classList.add('password-masked');
                    passwordEl.dataset.visible = 'false';
                    this.passwordHideTimer = null;
                }, 5000);
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
        
        // Reset sezioni condivisione
        document.getElementById('share-users-section').style.display = 'none';
        document.getElementById('share-all-section').style.display = 'none';
        document.getElementById('selected-users').innerHTML = '';
        this.selectedUserIds = [];
        
        // Imposta radio privata come default
        document.querySelector('input[name="share_type"][value="private"]').checked = true;
        
        // Aggiungi listeners per i radio buttons
        document.querySelectorAll('input[name="share_type"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.onShareTypeChange(e.target.value));
        });
        
        // Listener per selezione utenti
        document.getElementById('user-select').addEventListener('change', (e) => {
            if (e.target.value) {
                this.addUserToShare(parseInt(e.target.value));
                e.target.value = '';
            }
        });
        
        // Carica le categorie dinamicamente
        await this.loadCategories();
        
        // Carica utenti disponibili
        await this.loadAvailableUsers();
        
        document.getElementById('add-password-modal').style.display = 'flex';
    }
    
    /**
     * Gestisce il cambio tipo condivisione
     */
    onShareTypeChange(shareType) {
        const usersSection = document.getElementById('share-users-section');
        const allSection = document.getElementById('share-all-section');
        
        usersSection.style.display = shareType === 'custom' ? 'block' : 'none';
        allSection.style.display = shareType === 'work' ? 'block' : 'none';
    }
    
    /**
     * Carica utenti disponibili per la condivisione
     */
    async loadAvailableUsers() {
        const userSelect = document.getElementById('user-select');
        
        try {
            const response = await fetch(`${this.baseUrl}/passdoo/api/extension/users`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });
            
            const data = await response.json();
            
            userSelect.innerHTML = '<option value="">Aggiungi utente...</option>';
            
            if (data.success && data.users && data.users.length > 0) {
                this.availableUsers = data.users;
                data.users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = user.name + (user.email ? ` (${user.email})` : '');
                    userSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading users:', error);
            this.availableUsers = [];
        }
    }
    
    /**
     * Aggiunge un utente alla lista condivisione
     */
    addUserToShare(userId) {
        if (this.selectedUserIds.includes(userId)) return;
        
        this.selectedUserIds.push(userId);
        this.renderSelectedUsers();
    }
    
    /**
     * Rimuove un utente dalla lista condivisione
     */
    removeUserFromShare(userId) {
        this.selectedUserIds = this.selectedUserIds.filter(id => id !== userId);
        this.renderSelectedUsers();
    }
    
    /**
     * Renderizza gli utenti selezionati
     */
    renderSelectedUsers() {
        const container = document.getElementById('selected-users');
        const userSelect = document.getElementById('user-select');
        
        container.innerHTML = '';
        
        this.selectedUserIds.forEach(userId => {
            const user = this.availableUsers.find(u => u.id === userId);
            if (user) {
                const tag = document.createElement('div');
                tag.className = 'selected-user-tag';
                tag.innerHTML = `
                    <span>${user.name}</span>
                    <button type="button" class="btn-remove-tag" data-user-id="${userId}">
                        <svg viewBox="0 0 24 24" width="14" height="14">
                            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                `;
                tag.querySelector('.btn-remove-tag').addEventListener('click', () => {
                    this.removeUserFromShare(userId);
                });
                container.appendChild(tag);
            }
        });
        
        // Aggiorna le opzioni del select (nascondi gli utenti già selezionati)
        Array.from(userSelect.options).forEach(option => {
            if (option.value && this.selectedUserIds.includes(parseInt(option.value))) {
                option.style.display = 'none';
            } else {
                option.style.display = '';
            }
        });
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
        const notes = document.getElementById('new-notes').value;
        
        // Ottieni tipo condivisione dai radio buttons
        const shareType = document.querySelector('input[name="share_type"]:checked').value;
        const isShared = shareType !== 'private';
        const sharedWithAll = shareType === 'work';
        
        // Validazione per condivisione personalizzata
        if (shareType === 'custom' && this.selectedUserIds.length === 0) {
            this.showToast('Seleziona almeno un utente per la condivisione', 'warning');
            return;
        }

        try {
            // Determina se category è un ID numerico o una stringa
            const isNumericCategory = !isNaN(category) && category !== '';
            
            const payload = {
                name,
                uri: url,
                username,
                password,
                partner_id: clientId ? parseInt(clientId) : null,
                category_id: isNumericCategory ? parseInt(category) : null,
                category: !isNumericCategory ? (category || 'web') : null,
                is_shared: isShared,
                shared_with_all: sharedWithAll,
                share_type: shareType,  // Invia il nuovo share_type al backend
                description: notes
            };
            
            // Aggiungi utenti se condivisione personalizzata con utenti specifici
            if (shareType === 'custom' && this.selectedUserIds.length > 0) {
                payload.shared_with_user_ids = this.selectedUserIds;
            }
            
            const response = await fetch(`${this.baseUrl}/passdoo/api/extension/passwords`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(payload)
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
        if (!text) {
            console.log('copyToClipboard: empty text, skipping');
            return;
        }
        console.log('copyToClipboard called with text length:', text.length);
        
        let copied = false;
        
        // Try Tauri clipboard plugin first
        try {
            const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
            await writeText(text);
            console.log('Copied via Tauri clipboard plugin');
            copied = true;
        } catch (error) {
            console.log('Tauri clipboard not available, trying fallback:', error.message);
        }
        
        // Fallback to navigator.clipboard
        if (!copied) {
            try {
                await navigator.clipboard.writeText(text);
                console.log('Copied via navigator.clipboard');
                copied = true;
            } catch (e2) {
                console.error('navigator.clipboard failed:', e2);
            }
        }
        
        // Show toast
        if (copied) {
            this.showToast(message || 'Copiato', 'success');
        } else {
            this.showToast('Errore nella copia', 'error');
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
        this.showEditPasswordModal();
    }

    async showEditPasswordModal() {
        if (!this.currentPassword) return;
        
        const password = this.currentPassword;
        
        // Popola i campi con i valori attuali
        document.getElementById('edit-name').value = password.name || '';
        document.getElementById('edit-url').value = password.uri || '';
        document.getElementById('edit-username').value = password.username || '';
        document.getElementById('edit-password').value = ''; // Non mostriamo la password esistente
        document.getElementById('edit-notes').value = password.description || '';
        
        document.getElementById('edit-password-modal').style.display = 'flex';
    }

    hideEditPasswordModal() {
        document.getElementById('edit-password-modal').style.display = 'none';
    }

    toggleEditPasswordVisibility() {
        const input = document.getElementById('edit-password');
        input.type = input.type === 'password' ? 'text' : 'password';
    }

    async handleEditPassword() {
        if (!this.currentPassword) return;
        
        const name = document.getElementById('edit-name').value.trim();
        const url = document.getElementById('edit-url').value.trim();
        const username = document.getElementById('edit-username').value.trim();
        const password = document.getElementById('edit-password').value;
        const notes = document.getElementById('edit-notes').value.trim();
        
        if (!name) {
            this.showToast('Il nome è obbligatorio', 'error');
            return;
        }
        
        try {
            const updateData = {
                name,
                uri: url,
                username,
                description: notes
            };
            
            // Aggiungi la password solo se è stata modificata
            if (password) {
                updateData.password = password;
            }
            
            const response = await this.apiFetch(
                `${this.baseUrl}/passdoo/api/extension/password/${this.currentPassword.id}`,
                {
                    method: 'PUT',
                    body: JSON.stringify(updateData)
                }
            );
            
            const data = await response.json();
            
            if (data.error) {
                this.showToast(data.error, 'error');
                return;
            }
            
            this.showToast('Password aggiornata con successo', 'success');
            this.hideEditPasswordModal();
            this.hideDetailModal();
            await this.loadPasswords();
        } catch (error) {
            console.error('Error updating password:', error);
            this.showToast('Errore aggiornamento', 'error');
        }
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
        console.log("saveClient called");
        if (!this.currentPassword) {
            console.error("No currentPassword");
            return;
        }
        
        const clientId = document.getElementById('select-client').value;
        console.log("Saving client:", clientId, "for password:", this.currentPassword.id);
        
        try {
            const requestBody = {
                partner_id: clientId ? parseInt(clientId) : null
            };
            console.log("Request body:", JSON.stringify(requestBody));
            
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${this.currentPassword.id}`, {
                method: 'PUT',
                body: JSON.stringify(requestBody)
            });
            
            console.log("Response status:", response.status);
            const data = await response.json();
            console.log("Response data:", data);
            
            if (data.error) {
                this.showToast(data.error, 'error');
                return;
            }
            
            console.log('About to show toast and close modal');
            this.showToast('Cliente aggiornato', 'success');
            this.hideClientModal();
            this.hideDetailModal();
            await this.loadPasswords();
        } catch (error) {
            console.error('Error updating client:', error);
            this.showToast('Errore aggiornamento cliente', 'error');
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

    // =====================
    // SELEZIONE MULTIPLA
    // =====================
    
    toggleSelectionMode() {
        this.selectionMode = !this.selectionMode;
        this.selectedPasswords.clear();
        this.updateSelectionUI();
        this.renderPasswords();
    }
    
    exitSelectionMode() {
        this.selectionMode = false;
        this.selectedPasswords.clear();
        this.updateSelectionUI();
        this.renderPasswords();
    }
    
    updateSelectionUI() {
        const selectBtn = document.getElementById('select-mode-btn');
        const bulkBar = document.getElementById('bulk-actions-bar');
        const tabsRow = document.querySelector('.tabs-row');
        
        if (this.selectionMode) {
            selectBtn.classList.add('active');
            selectBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
                Annulla
            `;
            bulkBar.style.display = 'flex';
            if (tabsRow) tabsRow.style.display = 'none';
        } else {
            selectBtn.classList.remove('active');
            selectBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM17.99 9l-1.41-1.42-6.59 6.59-2.58-2.57-1.42 1.41 4 3.99z"/>
                </svg>
                Seleziona
            `;
            bulkBar.style.display = 'none';
            if (tabsRow) tabsRow.style.display = 'flex';
        }
        
        this.updateBulkSelectedCount();
    }
    
    updateBulkSelectedCount() {
        const countEl = document.getElementById('bulk-selected-count');
        if (countEl) {
            countEl.textContent = this.selectedPasswords.size;
        }
        
        // Disabilita pulsanti se nessuna selezione
        const categoryBtn = document.getElementById('bulk-category-btn');
        const clientBtn = document.getElementById('bulk-client-btn');
        
        if (categoryBtn) categoryBtn.disabled = this.selectedPasswords.size === 0;
        if (clientBtn) clientBtn.disabled = this.selectedPasswords.size === 0;
    }
    
    togglePasswordSelection(passwordId) {
        if (this.selectedPasswords.has(passwordId)) {
            this.selectedPasswords.delete(passwordId);
        } else {
            // Controlla permessi - può selezionare solo se can_edit
            const password = this.passwords.find(p => p.id === passwordId);
            if (password && password.can_edit) {
                this.selectedPasswords.add(passwordId);
            } else {
                this.showToast('Non hai i permessi per modificare questa password', 'error');
                return;
            }
        }
        this.updateBulkSelectedCount();
        this.updatePasswordCardSelection(passwordId);
    }
    
    updatePasswordCardSelection(passwordId) {
        const card = document.querySelector(`.password-card[data-password-id="${passwordId}"]`);
        if (card) {
            const checkbox = card.querySelector('.selection-checkbox');
            if (checkbox) {
                checkbox.checked = this.selectedPasswords.has(passwordId);
            }
            card.classList.toggle('selected', this.selectedPasswords.has(passwordId));
        }
    }
    
    selectAllVisible() {
        const container = document.getElementById('passwords-container');
        const cards = container.querySelectorAll('.password-card[data-password-id]');
        let selected = 0;
        let skipped = 0;
        
        cards.forEach(card => {
            const passwordId = parseInt(card.dataset.passwordId);
            const password = this.passwords.find(p => p.id === passwordId);
            if (password && password.can_edit) {
                this.selectedPasswords.add(passwordId);
                card.classList.add('selected');
                const checkbox = card.querySelector('.selection-checkbox');
                if (checkbox) checkbox.checked = true;
                selected++;
            } else {
                skipped++;
            }
        });
        
        this.updateBulkSelectedCount();
        
        if (skipped > 0) {
            this.showToast(`Selezionate ${selected} password (${skipped} escluse per permessi)`, 'info');
        }
    }
    
    deselectAll() {
        this.selectedPasswords.clear();
        
        const cards = document.querySelectorAll('.password-card.selected');
        cards.forEach(card => {
            card.classList.remove('selected');
            const checkbox = card.querySelector('.selection-checkbox');
            if (checkbox) checkbox.checked = false;
        });
        
        this.updateBulkSelectedCount();
    }
    
    // =====================
    // BULK CATEGORY
    // =====================
    
    showBulkCategoryModal() {
        if (this.selectedPasswords.size === 0) {
            this.showToast('Seleziona almeno una password', 'warning');
            return;
        }
        
        // Popola select categorie
        const select = document.getElementById('bulk-select-category');
        select.innerHTML = '<option value="">-- Seleziona --</option>';
        
        const categoryOptions = [
            { value: 'web', label: 'Siti Web' },
            { value: 'server', label: 'Server' },
            { value: 'database', label: 'Database' },
            { value: 'email', label: 'Email' },
            { value: 'vpn', label: 'VPN' },
            { value: 'wifi', label: 'WiFi' },
            { value: 'api', label: 'API' },
            { value: 'certificate', label: 'Certificati' },
            { value: 'ssh', label: 'SSH' },
            { value: 'ftp', label: 'FTP' },
            { value: 'other', label: 'Altro' }
        ];
        
        categoryOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });
        
        // Aggiorna info
        document.getElementById('bulk-category-info').innerHTML = 
            `Stai per cambiare la categoria di <strong>${this.selectedPasswords.size}</strong> password.`;
        
        document.getElementById('bulk-category-modal').style.display = 'flex';
    }
    
    closeBulkCategoryModal() {
        document.getElementById('bulk-category-modal').style.display = 'none';
    }
    
    async saveBulkCategory() {
        const category = document.getElementById('bulk-select-category').value;
        if (!category) {
            this.showToast('Seleziona una categoria', 'warning');
            return;
        }
        
        const passwordIds = Array.from(this.selectedPasswords);
        console.log("passwordIds:", passwordIds, "clientId:", clientId, "partnerId:", partnerId);
        let success = 0;
        let errors = 0;
        
        for (const id of passwordIds) {
            try {
                const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ category })
                });
                
                console.log("Response for", id, ":", response.ok, response.status);
                if (response.ok) {
                    success++;
                    // Aggiorna localmente
                    const pwd = this.passwords.find(p => p.id === id);
                    if (pwd) pwd.category = category;
                } else {
                    errors++;
                }
            } catch (e) {
                errors++;
            }
        }
        
        this.closeBulkCategoryModal();
        this.exitSelectionMode();
        this.renderPasswords();
        
        if (errors === 0) {
            this.showToast(`Categoria aggiornata per ${success} password`, 'success');
        } else {
            this.showToast(`Aggiornate ${success} password, ${errors} errori`, 'warning');
        }
    }
    
    // =====================
    // BULK CLIENT
    // =====================
    
    showBulkClientModal() {
        if (this.selectedPasswords.size === 0) {
            this.showToast('Seleziona almeno una password', 'warning');
            return;
        }
        
        // Popola select clienti
        const select = document.getElementById('bulk-select-client');
        select.innerHTML = '<option value="">-- Nessun Cliente --</option>';
        
        this.clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            select.appendChild(option);
        });
        
        // Aggiorna info
        document.getElementById('bulk-client-info').innerHTML = 
            `Stai per assegnare un cliente a <strong>${this.selectedPasswords.size}</strong> password.`;
        
        document.getElementById('bulk-client-modal').style.display = 'flex';
    }
    
    closeBulkClientModal() {
        document.getElementById('bulk-client-modal').style.display = 'none';
    }
    
    async saveBulkClient() {
        console.log("saveBulkClient called");
        const clientId = document.getElementById('bulk-select-client').value;
        const partnerId = clientId ? parseInt(clientId) : null;
        
        const passwordIds = Array.from(this.selectedPasswords);
        console.log("passwordIds:", passwordIds, "clientId:", clientId, "partnerId:", partnerId);
        let success = 0;
        let errors = 0;
        
        for (const id of passwordIds) {
            try {
                const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ partner_id: partnerId })
                });
                
                console.log("Response for", id, ":", response.ok, response.status);
                if (response.ok) {
                    success++;
                    // Aggiorna localmente
                    const pwd = this.passwords.find(p => p.id === id);
                    if (pwd) {
                        pwd.partner_id = partnerId;
                        pwd.partner_name = partnerId ? this.clients.find(c => c.id === partnerId)?.name : null;
                    }
                } else {
                    errors++;
                }
            } catch (e) {
                errors++;
            }
        }
        
        this.closeBulkClientModal();
        this.exitSelectionMode();
        this.renderPasswords();
        
        if (errors === 0) {
            this.showToast(`Cliente assegnato a ${success} password`, 'success');
        } else {
            this.showToast(`Aggiornate ${success} password, ${errors} errori`, 'warning');
        }
    }
    
    // =====================
    // PERMISSIONS MANAGEMENT
    // =====================
    
    async showPermissionsModal(passwordId = null) {
        const id = passwordId || (this.currentPassword ? this.currentPassword.id : null);
        if (!id) {
            this.showToast('Nessuna password selezionata', 'warning');
            return;
        }
        
        try {
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${id}/access`);
            const data = await response.json();
            
            if (!data.has_access) {
                this.showToast(data.error || 'Errore nel caricamento permessi', 'error');
                return;
            }
            
            // Salva dati permessi per riferimento
            this.currentPermissions = data;
            this.currentPermissionsPasswordId = id;
            
            // Popola il modal
            await this.renderPermissionsModal(data);
            
            document.getElementById('permissions-modal').style.display = 'flex';
            
            // Collega event listener per il bottone Salva usando event delegation
            const modal = document.getElementById('permissions-modal');
            modal.onclick = (e) => {
                if (e.target.closest('#save-permissions-btn')) {
                    console.log('Save button clicked via delegation!');
                    this.savePermissions();
                }
            };
        } catch (error) {
            console.error('Error loading permissions:', error);
            this.showToast('Errore nel caricamento dei permessi', 'error');
        }
    }
    
    async renderPermissionsModal(data) {
        const password = this.passwords.find(p => p.id === this.currentPermissionsPasswordId);
        const passwordName = password ? password.name : 'Password';
        
        // Titolo con nome password
        document.getElementById('permissions-modal-title').textContent = `Permessi: ${passwordName}`;
        
        // === HEADER: Cliente + Modalità Permessi ===
        const clientSection = document.getElementById('permissions-client-section');
        const clientNameEl = document.getElementById('permissions-client-name');
        if (password && password.partner_name && !data.is_personal) {
            clientSection.style.display = 'block';
            // Mostra anche la modalità permessi se disponibile
            let modeInfo = '';
            if (data.permission_mode && data.share_type) {
                // NUOVE LABEL: private→Privata, custom→Personalizzata, work→Lavoro
                const shareTypeLabels = {
                    'private': 'Privata',
                    'custom': 'Personalizzata',
                    'work': 'Lavoro',
                    // Legacy compatibility
                    'group': 'Personalizzata',
                    'public': 'Lavoro'
                };
                modeInfo = ` • ${data.permission_mode} (${data.permission_octal || ''}) • ${shareTypeLabels[data.share_type] || data.share_type}`;
            }
            if (clientNameEl) clientNameEl.innerHTML = password.partner_name + `<span style="font-size: 11px; color: #888; margin-left: 8px;">${modeInfo}</span>`;
        } else {
            clientSection.style.display = 'none';
        }
        
        // === SEZIONE MODALITA' CONDIVISIONE ===
        // Mappa share_type backend → UI:
        // - private → private
        // - custom (o legacy 'group') → custom (UI: Personalizzata)
        // - work (o legacy 'public') → work (UI: Lavoro)
        let currentShareType = data.share_type || 'private';
        
        // Mappa legacy → nuovi valori
        if (currentShareType === 'group') currentShareType = 'custom';
        if (currentShareType === 'public') currentShareType = 'work';
        
        // Verifica se ci sono ACL utente esistenti
        const hasUserAcl = (data.user_acl_list && data.user_acl_list.length > 0) ||
                           (data.acl && data.acl.some(a => a.type === 'user' || a.acl_type === 'user'));
        
        // Se ci sono ACL utente e non è già 'custom', forza 'custom'
        if (hasUserAcl && currentShareType === 'private') {
            currentShareType = 'custom';
        }
        
        // Salva il share type corrente per uso nelle sezioni successive
        this.currentPermissionsShareType = currentShareType;
        
        const shareTypeSection = document.getElementById('permissions-share-type-section');
        const canManagePermsShare = data.can_manage_access || (data.current_user && data.current_user.can_execute);
        if (shareTypeSection && canManagePermsShare) {
            shareTypeSection.style.display = 'block';
            
            const radioButtons = shareTypeSection.querySelectorAll('input[name="permissions_share_type"]');
            radioButtons.forEach(radio => {
                radio.checked = radio.value === currentShareType;
            });
            
            // Mostra/nascondi sezione selezione utenti
            const usersSelectSection = document.getElementById('permissions-users-select-section');
            if (usersSelectSection) {
                // Mostra se share_type è 'custom' O se ci sono ACL utente esistenti
                usersSelectSection.style.display = (currentShareType === 'custom' || hasUserAcl) ? 'block' : 'none';
                
                // Popola la select con gli utenti disponibili
                await this.loadPermissionsUsers(data);
            }
            
            // Funzione per aggiornare la visibilità delle sezioni in base al share_type
            const updateSectionsVisibility = (shareType) => {
                const adminSection = document.getElementById('permissions-admin-section');
                const groupSection = document.getElementById('permissions-owner-section');
                const accessList = document.getElementById('permissions-access-list');
                
                // Se share_type è 'custom', nascondi admin, gruppi e ACL (utente gestisce manualmente)
                if (shareType === 'custom') {
                    if (adminSection) adminSection.style.display = 'none';
                    if (groupSection) groupSection.style.display = 'none';
                    if (accessList) accessList.style.display = 'none';
                } else if (shareType === 'private') {
                    // Privata: nascondi tutto tranne il proprietario
                    if (adminSection) adminSection.style.display = 'none';
                    if (groupSection) groupSection.style.display = 'none';
                    if (accessList) accessList.style.display = 'none';
                } else {
                    // Lavoro (work): mostra admin e gruppi
                    if (adminSection && data.admin_group && !data.is_personal) adminSection.style.display = 'block';
                    if (groupSection && (data.group || data.owner_group) && !data.is_personal) groupSection.style.display = 'block';
                    if (accessList) accessList.style.display = 'block';
                }
            };
            
            // Event listener per cambiare modalità condivisione
            radioButtons.forEach(radio => {
                radio.onchange = () => {
                    const newShareType = radio.value;
                    const usersSelectSection = document.getElementById('permissions-users-select-section');
                    if (usersSelectSection) {
                        usersSelectSection.style.display = newShareType === 'custom' ? 'block' : 'none';
                    }
                    // Aggiorna visibilità delle altre sezioni
                    updateSectionsVisibility(newShareType);
                    // Salva il tipo corrente localmente
                    this.currentPermissionsShareType = newShareType;
                };
            });
            
            // Applica la visibilità iniziale
            updateSectionsVisibility(currentShareType);
        } else if (shareTypeSection) {
            shareTypeSection.style.display = 'none';
        }
        
        // === SEZIONE OWNER (Proprietario) ===
        // Mostra sempre il proprietario con permessi rwx
        const ownerSection = document.getElementById('permissions-personal-owner-section');
        
        // Determina chi mostrare come proprietario:
        // 1. Se password privata, mostra l'utente corrente
        // 2. Se l'owner è l'utente corrente (is_current_user), mostra "Tu"
        // 3. Altrimenti mostra il nome dell'owner
        let ownerData = data.owner;
        let ownerDisplayName = ownerData?.name || 'Proprietario';
        
        if (data.is_personal || data.current_user?.is_owner || ownerData?.is_current_user) {
            ownerDisplayName = this.currentUser?.name || 'Tu';
        }
        
        if (ownerData) {
            if (ownerSection) {
                ownerSection.style.display = 'block';
                const personalOwnerName = document.getElementById('personal-owner-name');
                const personalOwnerUser = document.getElementById('personal-owner-user');
                
                // Label diversa per password private vs condivise
                const ownerLabel = data.is_personal ? 'Password Personale' : 'Proprietario';
                if (personalOwnerName) personalOwnerName.textContent = ownerLabel;
                
                // Descrizione sotto il titolo
                const descEl = ownerSection.querySelector('.permission-group-description');
                if (descEl) {
                    descEl.textContent = data.is_personal 
                        ? 'Questa password è visibile solo a te'
                        : 'Il proprietario ha sempre accesso completo';
                }
                
                if (personalOwnerUser) {
                    const initials = this.getInitials(ownerDisplayName);
                    const avatarColor = this.getAvatarColor(ownerDisplayName);
                    const permBadge = this.getPermissionBadge(ownerData.permissions || 'rwx', 'owner');
                    personalOwnerUser.innerHTML = `
                        <span class="permission-user">
                            <span class="permission-user-avatar" style="background: ${avatarColor}">${this.escapeHtml(initials)}</span>
                            ${this.escapeHtml(ownerDisplayName)}
                            ${permBadge}
                        </span>
                    `;
                }
            }
        } else if (data.is_personal && data.personal_owner) {
            // Fallback per compatibilità con vecchia API - usa utente corrente
            if (ownerSection) {
                ownerSection.style.display = 'block';
                const personalOwnerName = document.getElementById('personal-owner-name');
                const personalOwnerUser = document.getElementById('personal-owner-user');
                if (personalOwnerName) personalOwnerName.textContent = 'Password Personale';
                if (personalOwnerUser) {
                    // Usa l'utente corrente per password personali
                    const userName = this.currentUser?.name || data.personal_owner.name;
                    const initials = this.getInitials(userName);
                    const avatarColor = this.getAvatarColor(userName);
                    personalOwnerUser.innerHTML = `
                        <span class="permission-user">
                            <span class="permission-user-avatar" style="background: ${avatarColor}">${this.escapeHtml(initials)}</span>
                            ${this.escapeHtml(userName)}
                            <span class="permission-badge badge-owner">rwx</span>
                        </span>
                    `;
                }
            }
        } else if (ownerSection) {
            ownerSection.style.display = 'none';
        }
        
        // === SEZIONE ADMIN (Passdoo / Amministratore) ===
        // Mostra solo per 'work' (Lavoro) - Passdoo Admin è super-owner
        const adminSection = document.getElementById('permissions-admin-section');
        const showAdminSection = data.admin_group && !data.is_personal && currentShareType === 'work';
        if (showAdminSection) {
            adminSection.style.display = 'block';
            const permBadge = this.getPermissionBadge(data.admin_group.permissions || 'rwx', 'owner');
            const isSuperOwner = data.admin_group.is_super_owner || data.admin_group.is_owner;
            const adminLabel = isSuperOwner ? 
                `${data.admin_group.name} ${permBadge} <span class="permission-badge badge-owner" style="font-size: 9px;">SUPER</span>` :
                `${data.admin_group.name} ${permBadge}`;
            document.getElementById('admin-group-name').innerHTML = adminLabel;
            
            // Utenti del gruppo admin
            const adminUsers = document.getElementById('admin-group-users');
            adminUsers.innerHTML = '';
            if (data.admin_group.users && data.admin_group.users.length > 0) {
                data.admin_group.users.forEach(user => {
                    const initials = this.getInitials(user.name);
                    const avatarColor = this.getAvatarColor(user.name);
                    adminUsers.innerHTML += `
                        <span class="permission-user">
                            <span class="permission-user-avatar" style="background: ${avatarColor}">${this.escapeHtml(initials)}</span>
                            ${this.escapeHtml(user.name)}
                        </span>
                    `;
                });
            } else {
                adminUsers.innerHTML = '<span class="permission-user">Nessun utente</span>';
            }
        } else {
            adminSection.style.display = 'none';
        }
        
        // === SEZIONE GROUP (Gruppo Proprietario - Amministratore cliente) ===
        // Mostra solo per 'work' (Lavoro) - Admin cliente ha rw-
        const groupSection = document.getElementById('permissions-owner-section');
        const groupData = data.group || data.owner_group;  // Nuovo sistema o legacy
        const showGroupSection = groupData && !data.is_personal && currentShareType === 'work';
        if (showGroupSection) {
            groupSection.style.display = 'block';
            const permBadge = this.getPermissionBadge(groupData.permissions || 'rw-', 'group');
            document.getElementById('owner-group-name').innerHTML = 
                `${groupData.display_name || groupData.name} ${permBadge}`;
            
            // Utenti del gruppo
            const ownerUsers = document.getElementById('owner-group-users');
            ownerUsers.innerHTML = '';
            if (groupData.users && groupData.users.length > 0) {
                groupData.users.forEach(user => {
                    const initials = this.getInitials(user.name);
                    const avatarColor = this.getAvatarColor(user.name);
                    ownerUsers.innerHTML += `
                        <span class="permission-user">
                            <span class="permission-user-avatar" style="background: ${avatarColor}">${this.escapeHtml(initials)}</span>
                            ${this.escapeHtml(user.name)}
                        </span>
                    `;
                });
            } else {
                ownerUsers.innerHTML = '<span class="permission-user">Nessun utente</span>';
            }
        } else {
            groupSection.style.display = 'none';
        }
        
        // === SEZIONE ACL / ACCESS LIST ===
        // Mostra solo ACL di tipo 'group', gli ACL 'user' vanno nella sezione utenti
        const accessList = document.getElementById('permissions-access-list');
        accessList.innerHTML = '';
        
        // Filtra per mostrare solo ACL di tipo 'group' (non 'user')
        const allAcl = data.acl || data.access_list || [];
        const aclList = allAcl.filter(acl => acl.type !== 'user' && acl.acl_type !== 'user');
        
        if (aclList.length > 0) {
            aclList.forEach(access => {
                // Supporta sia nuovo formato (permissions) che legacy (access_level)
                const permissions = access.permissions || (access.access_level === 'write' ? 'rw-' : 'r--');
                const permBadge = this.getPermissionBadge(permissions, 'acl');
                
                let usersHtml = '';
                if (access.users && access.users.length > 0) {
                    const maxUsers = 10;
                    const visibleUsers = access.users.slice(0, maxUsers);
                    const hiddenCount = access.users.length - maxUsers;
                    
                    usersHtml = visibleUsers.map(user => {
                        const initials = this.getInitials(user.name);
                        const avatarColor = this.getAvatarColor(user.name);
                        return `
                            <span class="permission-user">
                                <span class="permission-user-avatar" style="background: ${avatarColor}">${this.escapeHtml(initials)}</span>
                                ${this.escapeHtml(user.name)}
                            </span>
                        `;
                    }).join('');
                    
                    if (hiddenCount > 0) {
                        usersHtml += `<span class="permission-user" style="color: #888;">+${hiddenCount} altri</span>`;
                    }
                } else {
                    usersHtml = '<span class="permission-user">Nessun utente</span>';
                }
                
                // Sezione azioni (solo se può gestire - richiede 'x')
                let actionsHtml = '';
                const canManage = data.can_manage_access || (data.current_user && data.current_user.can_execute);
                if (canManage) {
                    // Converti permissions rwx in access_level legacy per la select
                    const currentLevel = (permissions.includes('w') || access.access_level === 'write') ? 'write' : 'read';
                    actionsHtml = `
                        <div class="permission-group-actions">
                            <select class="access-level-select" data-access-id="${access.id}">
                                <option value="read" ${currentLevel === 'read' ? 'selected' : ''}>r-- (Lettura)</option>
                                <option value="write" ${currentLevel === 'write' ? 'selected' : ''}>rw- (Lettura/Scrittura)</option>
                            </select>
                            <button class="btn-remove" data-remove-access="${access.id}" title="Rimuovi accesso">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                        </div>
                    `;
                }
                
                const groupName = access.group_name || access.user_name || 'ACL';
                
                accessList.innerHTML += `
                    <div class="permission-group" data-access-id="${access.id}">
                        <div class="permission-group-header">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                <circle cx="9" cy="7" r="4"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                            <span>${this.escapeHtml(groupName)}</span>
                            ${permBadge}
                        </div>
                        <div class="permission-users">${usersHtml}</div>
                        ${actionsHtml}
                    </div>
                `;
            });
        } else {
            accessList.innerHTML = '<p style="color: #666; text-align: center; padding: 16px;">Nessun ACL aggiuntivo configurato.</p>';
        }
        
        // === SEZIONE AGGIUNGI ACL ===
        const addSection = document.getElementById('permissions-add-section');
        const canManagePerms = data.can_manage_access || (data.current_user && data.current_user.can_execute);
        if (canManagePerms && data.available_groups && data.available_groups.length > 0) {
            addSection.style.display = 'block';
            
            // Popola select gruppi
            const groupSelect = document.getElementById('add-access-group');
            groupSelect.innerHTML = '<option value="">-- Seleziona Gruppo --</option>';
            data.available_groups.forEach(group => {
                groupSelect.innerHTML += `<option value="${group.id}">${this.escapeHtml(group.name)}</option>`;
            });
            
            // Popola select livelli - usa valori legacy per backend ma mostra rwx per UI
            const levelSelect = document.getElementById('add-access-level');
            levelSelect.innerHTML = `
                <option value="read">r-- (Solo Lettura)</option>
                <option value="write" selected>rw- (Lettura/Scrittura)</option>
            `;
        } else {
            addSection.style.display = 'none';
        }
        
        // Event delegation per bottoni rimozione accesso
        // accessList già dichiarato sopra
        // document.getElementById('permissions-access-list');
        accessList.onclick = (e) => {
            const removeBtn = e.target.closest('[data-remove-access]');
            if (removeBtn) {
                const accessId = parseInt(removeBtn.dataset.removeAccess);
                this.removeAccess(accessId);
            }
        };
        
        // Event delegation per select livello accesso
        accessList.onchange = (e) => {
            if (e.target.classList.contains('access-level-select')) {
                const accessId = parseInt(e.target.dataset.accessId);
                this.updateAccessLevel(accessId, e.target.value);
            }
        };
    }
    
    getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }
    
    /**
     * Genera badge HTML per i permessi in stile Linux (rwx)
     * @param {number|string} perms - Valore permessi: numero (0-7) o stringa ('rwx', 'rw-', 'r--', ecc)
     * @param {string} role - Ruolo: 'owner', 'group', 'others', 'acl'
     * @returns {string} HTML del badge
     */
    getPermissionBadge(perms, role = 'others') {
        let canRead, canWrite, canExecute;
        let permStr;
        
        if (typeof perms === 'string') {
            // Formato stringa: 'rwx', 'rw-', 'r--', ecc.
            permStr = perms.substring(0, 3).padEnd(3, '-');
            canRead = permStr[0] === 'r';
            canWrite = permStr[1] === 'w';
            canExecute = permStr[2] === 'x';
        } else {
            // Formato numerico (bit mask): READ=4, WRITE=2, EXECUTE=1
            const PERM_READ = 4;
            const PERM_WRITE = 2;
            const PERM_EXECUTE = 1;
            
            canRead = (perms & PERM_READ) !== 0;
            canWrite = (perms & PERM_WRITE) !== 0;
            canExecute = (perms & PERM_EXECUTE) !== 0;
            permStr = (canRead ? 'r' : '-') + (canWrite ? 'w' : '-') + (canExecute ? 'x' : '-');
        }
        
        // Colori per i diversi ruoli
        const roleColors = {
            owner: { bg: '#28a745', text: 'white' },      // Verde - proprietario
            group: { bg: '#007bff', text: 'white' },      // Blu - gruppo
            others: { bg: '#6c757d', text: 'white' },     // Grigio - altri
            acl: { bg: '#17a2b8', text: 'white' }         // Cyan - ACL specifico
        };
        
        const colors = roleColors[role] || roleColors.others;
        
        // Descrizione testuale
        let description = [];
        if (canRead) description.push('Lettura');
        if (canWrite) description.push('Scrittura');
        if (canExecute) description.push('Gestione');
        const descText = description.length > 0 ? description.join(', ') : 'Nessun permesso';
        
        return `<span class="permission-badge" style="
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-family: 'Courier New', monospace;
            font-weight: bold;
            background-color: ${colors.bg};
            color: ${colors.text};
            margin-left: 8px;
        " title="${descText}">${permStr}</span>`;
    }
    
    getAvatarColor(name) {
        // Colori simili a quelli usati da Odoo
        const colors = [
            '#e74c3c', // rosso
            '#9b59b6', // viola
            '#3498db', // blu
            '#1abc9c', // teal
            '#2ecc71', // verde
            '#f39c12', // arancione
            '#e67e22', // arancione scuro
            '#16a085', // verde acqua
            '#8e44ad', // viola scuro
            '#2980b9', // blu scuro
            '#c0392b', // rosso scuro
            '#27ae60', // verde scuro
        ];
        
        if (!name) return colors[0];
        
        // Genera un hash dal nome per avere sempre lo stesso colore
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        return colors[Math.abs(hash) % colors.length];
    }
    
    hidePermissionsModal() {
        document.getElementById('permissions-modal').style.display = 'none';
        this.currentPermissions = null;
        this.currentPermissionsPasswordId = null;
    }
    
    async addAccessToPassword() {
        const groupId = document.getElementById('add-access-group').value;
        const level = document.getElementById('add-access-level').value;
        
        if (!groupId) {
            this.showToast('Seleziona un gruppo', 'warning');
            return;
        }
        
        try {
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${this.currentPermissionsPasswordId}/access`, {
                method: 'PUT',
                body: JSON.stringify({
                    action: 'add',
                    group_id: parseInt(groupId),
                    access_level: level
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('Accesso aggiunto', 'success');
                // Ricarica i permessi
                await this.showPermissionsModal(this.currentPermissionsPasswordId);
            } else {
                this.showToast(data.error || "Errore nell'aggiunta accesso", 'error');
            }
        } catch (error) {
            console.error('Error adding access:', error);
            this.showToast("Errore nell'aggiunta accesso", 'error');
        }
    }
    
    async loadPermissionsUsers(data) {
        // Utenti già condivisi (da ACL utente diretto)
        this.permissionsSelectedUsers = [];
        this.userPermissions = {};  // {userId: 'r'|'rw'|'rwx'}
        
        // Gruppi già condivisi (da ACL gruppo)
        this.permissionsSelectedGroups = [];
        this.groupPermissions = {};  // {groupId: 'r'|'rw'|'rwx'}
        
        const selectedUsersContainer = document.getElementById('permissions-selected-users');
        const userSelect = document.getElementById('permissions-user-select');
        const selectedGroupsContainer = document.getElementById('permissions-selected-groups');
        const groupSelect = document.getElementById('permissions-group-select');
        
        if (!selectedUsersContainer || !userSelect) return;
        
        // Raccogli utenti già condivisi - da user_acl_list O da acl con type='user'
        let userAclList = data.user_acl_list || [];
        
        // Raccogli gruppi già condivisi - da acl con type='group'
        let groupAclList = [];
        
        // Aggiungi anche ACL di tipo 'user' e 'group' da data.acl
        const allAcl = data.acl || [];
        allAcl.forEach(acl => {
            if ((acl.type === 'user' || acl.acl_type === 'user') && acl.user_id) {
                // Evita duplicati
                if (!userAclList.find(u => u.user_id === acl.user_id)) {
                    userAclList.push({
                        id: acl.id,
                        user_id: acl.user_id,
                        user_name: acl.user_name,
                        perm_read: acl.perm_read,
                        perm_write: acl.perm_write,
                        perm_execute: acl.perm_execute,
                    });
                }
            }
            // Raccogli ACL di tipo 'group'
            if ((acl.type === 'group' || acl.acl_type === 'group') && acl.group_id) {
                if (!groupAclList.find(g => g.group_id === acl.group_id)) {
                    groupAclList.push({
                        id: acl.id,
                        group_id: acl.group_id,
                        group_name: acl.group_name,
                        user_count: acl.user_count || 0,
                        perm_read: acl.perm_read,
                        perm_write: acl.perm_write,
                        perm_execute: acl.perm_execute,
                    });
                }
            }
        });
        
        // Popola utenti selezionati
        userAclList.forEach(acl => {
            if (acl.user_id && !this.permissionsSelectedUsers.find(u => u.id === acl.user_id)) {
                // Determina i permessi dalla risposta
                let perm = 'r';
                if (acl.access_level === 'write' || acl.perm_write) perm = 'rw';
                if (acl.perm_execute) perm = 'rwx';
                
                this.permissionsSelectedUsers.push({
                    id: acl.user_id,
                    name: acl.user_name,
                    acl_id: acl.id  // Per rimuovere l'ACL
                });
                this.userPermissions[acl.user_id] = perm;
            }
        });
        
        // Popola gruppi selezionati
        groupAclList.forEach(acl => {
            if (acl.group_id && !this.permissionsSelectedGroups.find(g => g.id === acl.group_id)) {
                let perm = 'r';
                if (acl.perm_write) perm = 'rw';
                if (acl.perm_execute) perm = 'rwx';
                
                this.permissionsSelectedGroups.push({
                    id: acl.group_id,
                    name: acl.group_name,
                    user_count: acl.user_count || 0,
                    acl_id: acl.id
                });
                this.groupPermissions[acl.group_id] = perm;
            }
        });
        
        // Renderizza utenti selezionati
        this.renderPermissionsSelectedUsers();
        
        // Renderizza gruppi selezionati
        this.renderPermissionsSelectedGroups();
        
        // Carica tutti gli utenti disponibili
        try {
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/users`);
            const usersData = await response.json();
            
            if (usersData.success && usersData.users) {
                userSelect.innerHTML = '<option value="">Aggiungi utente...</option>';
                usersData.users.forEach(user => {
                    // Escludi utenti già selezionati e l'utente corrente
                    if (!this.permissionsSelectedUsers.find(u => u.id === user.id) && user.id !== this.currentUser?.id) {
                        userSelect.innerHTML += `<option value="${user.id}">${this.escapeHtml(user.name)}</option>`;
                    }
                });
                
                // Event listener per aggiungere utente
                userSelect.onchange = async () => {
                    const userId = parseInt(userSelect.value);
                    if (userId) {
                        const userName = userSelect.options[userSelect.selectedIndex].text;
                        await this.addPermissionsUser(userId, userName);
                        userSelect.value = '';
                    }
                };
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
        
        // Carica tutti i gruppi disponibili per il cliente
        if (groupSelect) {
            try {
                // Ottieni il partner_id dalla password corrente
                const password = this.passwords.find(p => p.id === this.currentPermissionsPasswordId);
                const partnerId = password?.partner_id;
                
                if (partnerId) {
                    const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/client/${partnerId}/groups`);
                    const groupsData = await response.json();
                    
                    if (groupsData.success && groupsData.groups) {
                        groupSelect.innerHTML = '<option value="">Aggiungi gruppo...</option>';
                        groupsData.groups.forEach(group => {
                            // Escludi gruppi già selezionati
                            if (!this.permissionsSelectedGroups.find(g => g.id === group.id)) {
                                const userCount = group.user_count || 0;
                                groupSelect.innerHTML += `<option value="${group.id}" data-user-count="${userCount}">${this.escapeHtml(group.name)} (${userCount} utenti)</option>`;
                            }
                        });
                        
                        // Event listener per aggiungere gruppo
                        groupSelect.onchange = async () => {
                            const groupId = parseInt(groupSelect.value);
                            if (groupId) {
                                const selectedOption = groupSelect.options[groupSelect.selectedIndex];
                                const groupName = selectedOption.text.replace(/\s*\(\d+ utenti\)$/, '');
                                const userCount = parseInt(selectedOption.dataset.userCount) || 0;
                                await this.addPermissionsGroup(groupId, groupName, userCount);
                                groupSelect.value = '';
                            }
                        };
                    }
                } else {
                    groupSelect.innerHTML = '<option value="">Nessun cliente associato</option>';
                    groupSelect.disabled = true;
                }
            } catch (error) {
                console.error('Error loading groups:', error);
            }
        }
    }
    
    renderPermissionsSelectedUsers() {
        const container = document.getElementById('permissions-selected-users');
        if (!container) return;
        
        container.innerHTML = '';
        this.permissionsSelectedUsers.forEach(user => {
            const currentPerm = this.userPermissions[user.id] || 'r';
            container.innerHTML += `
                <div class="selected-user-row" data-user-id="${user.id}">
                    <span class="selected-user-name">
                        ${this.escapeHtml(user.name)}
                    </span>
                    <select class="user-perm-select" data-user-id="${user.id}">
                        <option value="r" ${currentPerm === 'r' ? 'selected' : ''}>r-- (Lettura)</option>
                        <option value="rw" ${currentPerm === 'rw' ? 'selected' : ''}>rw- (Lettura/Scrittura)</option>
                        <option value="rwx" ${currentPerm === 'rwx' ? 'selected' : ''}>rwx (Completo)</option>
                    </select>
                    <button class="btn-remove-user" data-user-id="${user.id}" title="Rimuovi">&times;</button>
                </div>
            `;
        });
        
        // Event listeners per cambiare permessi
        container.querySelectorAll('.user-perm-select').forEach(select => {
            select.onchange = (e) => {
                const userId = parseInt(e.target.dataset.userId);
                this.userPermissions[userId] = e.target.value;
            };
        });
        
        // Event listeners per rimuovere utenti
        container.querySelectorAll('.btn-remove-user').forEach(btn => {
            btn.onclick = async (e) => {
                const userId = parseInt(e.target.dataset.userId);
                await this.removePermissionsUser(userId);
            };
        });
    }
    
    async addPermissionsUser(userId, userName) {
        try {
            // NON chiamare l'API qui - il salvataggio avverrà con "Salva"
            // Aggiungi l'utente localmente
            this.permissionsSelectedUsers.push({ id: userId, name: userName });
            this.userPermissions[userId] = 'r';  // Default: solo lettura
            this.renderPermissionsSelectedUsers();
            
            // Rimuovi dalla select
            const userSelect = document.getElementById('permissions-user-select');
            if (userSelect) {
                const option = userSelect.querySelector(`option[value="${userId}"]`);
                if (option) option.remove();
            }
            
            // Assicurati che il radio button "Personalizzata" sia selezionato
            const customRadio = document.querySelector('input[name="permissions_share_type"][value="custom"]');
            if (customRadio) customRadio.checked = true;
            
            // Mostra sezione utenti
            const usersSection = document.getElementById('permissions-users-select-section');
            if (usersSection) usersSection.style.display = 'block';
            
            this.showToast('Utente aggiunto - clicca Salva per confermare', 'success');
        } catch (error) {
            console.error('Error adding user:', error);
            this.showToast("Errore nell'aggiunta utente", 'error');
        }
    }
    
    async removePermissionsUser(userId) {
        const user = this.permissionsSelectedUsers.find(u => u.id === userId);
        if (!user) return;
        
        // NON chiamare l'API qui - il salvataggio avverrà con "Salva"
        // Rimuovi dalla lista locale
        this.permissionsSelectedUsers = this.permissionsSelectedUsers.filter(u => u.id !== userId);
        delete this.userPermissions[userId];
        this.renderPermissionsSelectedUsers();
        
        // Re-aggiungi l'utente alla select
        const userSelect = document.getElementById('permissions-user-select');
        if (userSelect) {
            const option = document.createElement('option');
            option.value = userId;
            option.textContent = user.name;
            userSelect.appendChild(option);
        }
        
        // Se non ci sono più utenti, suggerisci 'private'
        if (this.permissionsSelectedUsers.length === 0) {
            const privateRadio = document.querySelector('input[name="permissions_share_type"][value="private"]');
            if (privateRadio) privateRadio.checked = true;
            const usersSection = document.getElementById('permissions-users-select-section');
            if (usersSection) usersSection.style.display = 'none';
        }
        
        this.showToast('Utente rimosso - clicca Salva per confermare', 'success');
    }
    
    // === GESTIONE GRUPPI ===
    
    renderPermissionsSelectedGroups() {
        const container = document.getElementById('permissions-selected-groups');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!this.permissionsSelectedGroups) {
            this.permissionsSelectedGroups = [];
        }
        
        this.permissionsSelectedGroups.forEach(group => {
            const currentPerm = this.groupPermissions[group.id] || 'r';
            container.innerHTML += `
                <div class="selected-group-row" data-group-id="${group.id}">
                    <span class="selected-group-name">
                        ${this.escapeHtml(group.name)}
                        <span class="group-users-count">(${group.user_count || 0} utenti)</span>
                    </span>
                    <select class="group-perm-select" data-group-id="${group.id}">
                        <option value="r" ${currentPerm === 'r' ? 'selected' : ''}>r-- (Lettura)</option>
                        <option value="rw" ${currentPerm === 'rw' ? 'selected' : ''}>rw- (Lettura/Scrittura)</option>
                        <option value="rwx" ${currentPerm === 'rwx' ? 'selected' : ''}>rwx (Completo)</option>
                    </select>
                    <button class="btn-remove-group" data-group-id="${group.id}" title="Rimuovi">&times;</button>
                </div>
            `;
        });
        
        // Event listeners per cambiare permessi
        container.querySelectorAll('.group-perm-select').forEach(select => {
            select.onchange = (e) => {
                const groupId = parseInt(e.target.dataset.groupId);
                this.groupPermissions[groupId] = e.target.value;
            };
        });
        
        // Event listeners per rimuovere gruppi
        container.querySelectorAll('.btn-remove-group').forEach(btn => {
            btn.onclick = async (e) => {
                const groupId = parseInt(e.target.dataset.groupId);
                await this.removePermissionsGroup(groupId);
            };
        });
    }
    
    async addPermissionsGroup(groupId, groupName, userCount) {
        try {
            // Aggiungi il gruppo localmente
            this.permissionsSelectedGroups.push({ id: groupId, name: groupName, user_count: userCount });
            this.groupPermissions[groupId] = 'r';  // Default: solo lettura
            this.renderPermissionsSelectedGroups();
            
            // Rimuovi dalla select
            const groupSelect = document.getElementById('permissions-group-select');
            if (groupSelect) {
                const option = groupSelect.querySelector(`option[value="${groupId}"]`);
                if (option) option.remove();
            }
            
            // Assicurati che il radio button "Personalizzata" sia selezionato
            const customRadio = document.querySelector('input[name="permissions_share_type"][value="custom"]');
            if (customRadio) customRadio.checked = true;
            
            // Mostra sezione utenti/gruppi
            const usersSection = document.getElementById('permissions-users-select-section');
            if (usersSection) usersSection.style.display = 'block';
            
            this.showToast('Gruppo aggiunto - clicca Salva per confermare', 'success');
        } catch (error) {
            console.error('Error adding group:', error);
            this.showToast("Errore nell'aggiunta gruppo", 'error');
        }
    }
    
    async removePermissionsGroup(groupId) {
        const group = this.permissionsSelectedGroups.find(g => g.id === groupId);
        if (!group) return;
        
        // Rimuovi dalla lista locale
        this.permissionsSelectedGroups = this.permissionsSelectedGroups.filter(g => g.id !== groupId);
        delete this.groupPermissions[groupId];
        this.renderPermissionsSelectedGroups();
        
        // Re-aggiungi il gruppo alla select
        const groupSelect = document.getElementById('permissions-group-select');
        if (groupSelect) {
            const option = document.createElement('option');
            option.value = groupId;
            option.textContent = `${group.name} (${group.user_count || 0} utenti)`;
            option.dataset.userCount = group.user_count || 0;
            groupSelect.appendChild(option);
        }
        
        this.showToast('Gruppo rimosso - clicca Salva per confermare', 'success');
    }

    async savePermissions() {
        try {
            // Verifica che abbiamo l'ID password
            if (!this.currentPermissionsPasswordId) {
                this.showToast('Errore: ID password non trovato', 'error');
                return;
            }
            
            // Determina il share_type selezionato
            const selectedRadio = document.querySelector('input[name="permissions_share_type"]:checked');
            let shareType = selectedRadio ? selectedRadio.value : 'private';
            
            console.log('Saving permissions - shareType UI:', shareType);
            console.log('Saving permissions - passwordId:', this.currentPermissionsPasswordId);
            console.log('Saving permissions - selectedUsers:', this.permissionsSelectedUsers);
            console.log('Saving permissions - userPermissions:', this.userPermissions);
            console.log('Saving permissions - selectedGroups:', this.permissionsSelectedGroups);
            console.log('Saving permissions - groupPermissions:', this.groupPermissions);
            
            // I valori UI (private, custom, work) corrispondono direttamente ai valori backend
            // Non è necessario alcun mapping
            
            // Raccogli gli user IDs selezionati
            const userIds = this.permissionsSelectedUsers ? this.permissionsSelectedUsers.map(u => u.id) : [];
            
            // Costruisci mappa permessi utente
            const userPermissionsMap = {};
            for (const userId in this.userPermissions) {
                userPermissionsMap[userId] = this.userPermissions[userId];
            }
            
            // Raccogli i group IDs selezionati
            const groupIds = this.permissionsSelectedGroups ? this.permissionsSelectedGroups.map(g => g.id) : [];
            
            // Costruisci mappa permessi gruppo
            const groupPermissionsMap = {};
            for (const groupId in this.groupPermissions) {
                groupPermissionsMap[groupId] = this.groupPermissions[groupId];
            }
            
            const body = {
                action: 'save_permissions',
                share_type: shareType,
                user_ids: userIds,
                user_permissions: userPermissionsMap,
                group_ids: groupIds,
                group_permissions: groupPermissionsMap
            };
            
            console.log('Saving permissions - body:', body);
            
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${this.currentPermissionsPasswordId}/access`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
            
            console.log('Saving permissions - response status:', response.status);
            
            // Controlla se la risposta è OK
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Saving permissions - error response:', errorText);
                this.showToast(`Errore HTTP ${response.status}`, 'error');
                return;
            }
            
            const data = await response.json();
            console.log('Saving permissions - response data:', data);
            
            if (data.success) {
                this.showToast('Permessi salvati con successo', 'success');
                this.hidePermissionsModal();
                // Aggiorna la lista password
                await this.loadPasswords();
            } else {
                this.showToast(data.error || 'Errore nel salvataggio', 'error');
            }
        } catch (error) {
            console.error('Error saving permissions:', error);
            this.showToast('Errore nel salvataggio permessi', 'error');
        }
    }
    
    async updateShareType(shareType, ownerGroupId = null) {
        try {
            const body = {
                action: 'update_share_type',
                share_type: shareType
            };
            if (ownerGroupId) {
                body.owner_group_id = ownerGroupId;
            }
            
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${this.currentPermissionsPasswordId}/access`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('Modalità condivisione aggiornata', 'success');
                // Ricarica i permessi per aggiornare la UI
                await this.showPermissionsModal(this.currentPermissionsPasswordId);
                // Aggiorna anche la lista password
                await this.loadPasswords();
            } else {
                this.showToast(data.error || "Errore nell'aggiornamento", 'error');
                // Ricarica per resettare stato
                await this.showPermissionsModal(this.currentPermissionsPasswordId);
            }
        } catch (error) {
            console.error('Error updating share type:', error);
            this.showToast("Errore nell'aggiornamento della condivisione", 'error');
        }
    }
    
    async updateAccessLevel(accessId, newLevel) {
        try {
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${this.currentPermissionsPasswordId}/access`, {
                method: 'PUT',
                body: JSON.stringify({
                    action: 'update',
                    access_id: accessId,
                    access_level: newLevel
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('Livello accesso aggiornato', 'success');
                // Aggiorna il badge localmente
                const groupEl = document.querySelector(`.permission-group[data-access-id="${accessId}"]`);
                if (groupEl) {
                    const badge = groupEl.querySelector('.permission-badge');
                    if (badge) {
                        badge.className = 'permission-badge ' + (newLevel === 'write' ? 'badge-write' : 'badge-read');
                        badge.textContent = newLevel === 'write' ? 'LETTURA/SCRITTURA' : 'SOLO LETTURA';
                    }
                }
            } else {
                this.showToast(data.error || "Errore nell'aggiornamento", 'error');
                // Ricarica per resettare stato
                await this.showPermissionsModal(this.currentPermissionsPasswordId);
            }
        } catch (error) {
            console.error('Error updating access:', error);
            this.showToast("Errore nell'aggiornamento", 'error');
        }
    }
    
    async removeAccess(accessId) {
        console.log('removeAccess called with accessId:', accessId);
        
        try {
            const response = await this.apiFetch(`${this.baseUrl}/passdoo/api/extension/password/${this.currentPermissionsPasswordId}/access`, {
                method: 'PUT',
                body: JSON.stringify({
                    action: 'remove',
                    access_id: accessId
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('Accesso rimosso', 'success');
                // Ricarica i permessi
                await this.showPermissionsModal(this.currentPermissionsPasswordId);
            } else {
                this.showToast(data.error || 'Errore nella rimozione', 'error');
            }
        } catch (error) {
            console.error('Error removing access:', error);
            this.showToast('Errore nella rimozione', 'error');
        }
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
