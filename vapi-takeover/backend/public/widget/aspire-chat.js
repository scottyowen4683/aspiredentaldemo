/**
 * Aspire AI Chat Widget
 * Dark theme matching moretonbaypilot style
 *
 * Usage:
 * <script src="https://your-domain.com/widget/aspire-chat.js"
 *         data-assistant-id="YOUR_ASSISTANT_ID"
 *         data-primary-color="#8B5CF6"
 *         data-position="bottom-right">
 * </script>
 */

(function() {
  'use strict';

  // Prevent multiple initializations
  if (window.AspireChat) {
    console.warn('Aspire Chat Widget already loaded');
    return;
  }

  // Get configuration from script tag
  const scriptTag = document.currentScript;
  const config = {
    assistantId: scriptTag?.getAttribute('data-assistant-id') || '',
    apiUrl: scriptTag?.getAttribute('data-api-url') || window.location.origin,
    primaryColor: scriptTag?.getAttribute('data-primary-color') || '#8B5CF6',
    position: scriptTag?.getAttribute('data-position') || 'bottom-right',
    greeting: scriptTag?.getAttribute('data-greeting') || 'Hello! How can I help you today?',
    title: scriptTag?.getAttribute('data-title') || 'Aspire AI Chat',
    subtitle: scriptTag?.getAttribute('data-subtitle') || 'Online',
    placeholder: scriptTag?.getAttribute('data-placeholder') || 'Type your message...',
    buttonText: scriptTag?.getAttribute('data-button-text') || 'Chat With Me',
    zIndex: parseInt(scriptTag?.getAttribute('data-z-index')) || 2147483647,
    autoOpen: scriptTag?.getAttribute('data-auto-open') === 'true',
    showPoweredBy: scriptTag?.getAttribute('data-show-powered-by') !== 'false',
  };

  // Generate unique session ID
  const generateSessionId = () => {
    return 'aspire_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  };

  // Get or create session ID from storage
  const getSessionId = () => {
    const key = `aspire_chat_session_${config.assistantId}`;
    let sessionId = localStorage.getItem(key);
    if (!sessionId) {
      sessionId = generateSessionId();
      localStorage.setItem(key, sessionId);
    }
    return sessionId;
  };

  // CSS Styles - Dark theme matching moretonbaypilot
  const styles = `
    .aspire-chat-widget * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    /* Chat Button - Pill style with text */
    .aspire-chat-button {
      position: fixed;
      ${config.position.includes('right') ? 'right: 16px;' : 'left: 16px;'}
      ${config.position.includes('bottom') ? 'bottom: 16px;' : 'top: 16px;'}
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      border-radius: 16px;
      background: white;
      border: none;
      cursor: pointer;
      box-shadow: 0 14px 45px rgba(0, 0, 0, 0.35);
      ring: 1px solid rgba(255, 255, 255, 0.1);
      transition: transform 0.2s, box-shadow 0.2s;
      z-index: ${config.zIndex};
      font-size: 14px;
      font-weight: 600;
      color: #111;
    }

    .aspire-chat-button:hover {
      transform: translateY(-1px);
      background: rgba(255, 255, 255, 0.95);
    }

    .aspire-chat-button-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 12px;
      background: #111;
      color: white;
      font-size: 18px;
    }

    .aspire-chat-button-text {
      letter-spacing: 0.02em;
    }

    /* Chat Window - Dark theme */
    .aspire-chat-window {
      position: fixed;
      ${config.position.includes('right') ? 'right: 16px;' : 'left: 16px;'}
      ${config.position.includes('bottom') ? 'bottom: 16px;' : 'top: 16px;'}
      width: 380px;
      max-width: calc(100vw - 32px);
      height: 540px;
      max-height: calc(100vh - 32px);
      background: #0A1020;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 18px 70px rgba(0, 0, 0, 0.55);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: ${config.zIndex};
      animation: aspire-slide-up 0.3s ease-out;
    }

    @keyframes aspire-slide-up {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .aspire-chat-window.open {
      display: flex;
    }

    /* Header */
    .aspire-chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      background: rgba(10, 16, 32, 0.9);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(12px);
    }

    .aspire-chat-header-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .aspire-chat-avatar {
      width: 40px;
      height: 40px;
      border-radius: 16px;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .aspire-chat-header-text h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: white;
      line-height: 1.4;
    }

    .aspire-chat-header-text p {
      margin: 0;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
    }

    .aspire-chat-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .aspire-chat-btn {
      padding: 8px 12px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.8);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }

    .aspire-chat-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }

    /* Messages */
    .aspire-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: linear-gradient(180deg, #0A1020 0%, #070A12 100%);
    }

    .aspire-chat-message {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.5;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    .aspire-chat-message.user {
      align-self: flex-end;
      background: white;
      color: #111;
    }

    .aspire-chat-message.assistant {
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.05);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .aspire-chat-message.typing {
      display: flex;
      gap: 4px;
      padding: 16px;
    }

    .aspire-chat-message.typing span {
      width: 8px;
      height: 8px;
      background: rgba(255, 255, 255, 0.4);
      border-radius: 50%;
      animation: aspire-typing 1.4s infinite ease-in-out;
    }

    .aspire-chat-message.typing span:nth-child(1) { animation-delay: 0s; }
    .aspire-chat-message.typing span:nth-child(2) { animation-delay: 0.2s; }
    .aspire-chat-message.typing span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes aspire-typing {
      0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
      40% { transform: scale(1); opacity: 1; }
    }

    /* Input Area */
    .aspire-chat-input-area {
      padding: 12px;
      background: rgba(10, 16, 32, 0.9);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(12px);
    }

    .aspire-chat-input-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .aspire-chat-input {
      flex: 1;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 12px 16px;
      font-size: 14px;
      background: rgba(255, 255, 255, 0.05);
      color: white;
      resize: none;
      max-height: 120px;
      outline: none;
      transition: border-color 0.2s;
    }

    .aspire-chat-input::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }

    .aspire-chat-input:focus {
      border-color: rgba(255, 255, 255, 0.2);
    }

    .aspire-chat-send {
      width: 44px;
      height: 44px;
      border-radius: 16px;
      background: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, opacity 0.2s;
      flex-shrink: 0;
    }

    .aspire-chat-send:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.95);
    }

    .aspire-chat-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .aspire-chat-send svg {
      width: 20px;
      height: 20px;
      fill: #111;
    }

    /* Powered By */
    .aspire-chat-powered {
      padding: 8px 12px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
      text-align: center;
    }

    .aspire-chat-powered a {
      color: ${config.primaryColor};
      text-decoration: underline;
      text-decoration-color: rgba(139, 92, 246, 0.3);
      text-underline-offset: 2px;
    }

    .aspire-chat-powered a:hover {
      color: white;
    }

    /* Error */
    .aspire-chat-error {
      background: rgba(220, 38, 38, 0.2);
      color: #fca5a5;
      padding: 12px 16px;
      border-radius: 12px;
      margin: 8px 0;
      font-size: 13px;
      border: 1px solid rgba(220, 38, 38, 0.3);
    }

    /* Mobile */
    @media (max-width: 480px) {
      .aspire-chat-window {
        width: 100%;
        height: 100%;
        max-height: 100%;
        max-width: 100%;
        border-radius: 0;
        right: 0;
        left: 0;
        bottom: 0;
        top: 0;
      }
    }
  `;

  // Widget Class
  class AspireChatWidget {
    constructor() {
      this.isOpen = false;
      this.messages = [];
      this.sessionId = getSessionId();
      this.isLoading = false;

      this.init();
    }

    init() {
      // Validate configuration
      if (!config.assistantId) {
        console.error('Aspire Chat: Missing data-assistant-id attribute');
        return;
      }

      // Inject styles
      const styleEl = document.createElement('style');
      styleEl.textContent = styles;
      document.head.appendChild(styleEl);

      // Create widget container
      this.container = document.createElement('div');
      this.container.className = 'aspire-chat-widget';
      this.container.innerHTML = this.render();
      document.body.appendChild(this.container);

      // Get DOM references
      this.button = this.container.querySelector('.aspire-chat-button');
      this.window = this.container.querySelector('.aspire-chat-window');
      this.messagesContainer = this.container.querySelector('.aspire-chat-messages');
      this.input = this.container.querySelector('.aspire-chat-input');
      this.sendButton = this.container.querySelector('.aspire-chat-send');
      this.closeButton = this.container.querySelector('.aspire-chat-close');
      this.resetButton = this.container.querySelector('.aspire-chat-reset');

      // Bind events
      this.button.addEventListener('click', () => this.toggle());
      this.closeButton.addEventListener('click', () => this.close());
      this.resetButton.addEventListener('click', () => this.reset());
      this.sendButton.addEventListener('click', () => this.sendMessage());
      this.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      // Auto-resize textarea
      this.input.addEventListener('input', () => {
        this.input.style.height = 'auto';
        this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px';
      });

      // Add greeting message
      if (config.greeting) {
        this.addMessage('assistant', config.greeting);
      }

      // Auto-open if configured
      if (config.autoOpen) {
        setTimeout(() => this.open(), 1000);
      }

      console.log('Aspire Chat Widget initialized');
    }

    render() {
      return `
        <button class="aspire-chat-button" aria-label="Open chat">
          <span class="aspire-chat-button-icon">💬</span>
          <span class="aspire-chat-button-text">${config.buttonText}</span>
        </button>

        <div class="aspire-chat-window">
          <div class="aspire-chat-header">
            <div class="aspire-chat-header-info">
              <div class="aspire-chat-avatar">🤖</div>
              <div class="aspire-chat-header-text">
                <h3>${config.title}</h3>
                <p class="aspire-chat-status">${config.subtitle}</p>
              </div>
            </div>
            <div class="aspire-chat-header-actions">
              <button class="aspire-chat-btn aspire-chat-reset">Reset</button>
              <button class="aspire-chat-btn aspire-chat-close">Close</button>
            </div>
          </div>

          <div class="aspire-chat-messages"></div>

          <div class="aspire-chat-input-area">
            <div class="aspire-chat-input-row">
              <textarea
                class="aspire-chat-input"
                placeholder="${config.placeholder}"
                rows="1"
              ></textarea>
              <button class="aspire-chat-send" aria-label="Send message">
                <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </div>
          </div>

          ${config.showPoweredBy ? `
            <div class="aspire-chat-powered">
              Powered by <a href="https://aspireexecutive.ai" target="_blank" rel="noopener">Aspire Executive Solutions</a>
            </div>
          ` : ''}
        </div>
      `;
    }

    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }

    open() {
      this.isOpen = true;
      this.window.classList.add('open');
      this.button.style.display = 'none';
      this.input.focus();
      this.updateStatus('Online');
    }

    close() {
      this.isOpen = false;
      this.window.classList.remove('open');
      this.button.style.display = 'inline-flex';
    }

    reset() {
      // Clear session
      const key = `aspire_chat_session_${config.assistantId}`;
      localStorage.removeItem(key);
      this.sessionId = generateSessionId();
      localStorage.setItem(key, this.sessionId);

      // Clear messages
      this.messages = [];
      this.messagesContainer.innerHTML = '';

      // Add greeting back
      if (config.greeting) {
        this.addMessage('assistant', config.greeting);
      }

      this.isLoading = false;
      this.input.value = '';
    }

    updateStatus(status) {
      const statusEl = this.container.querySelector('.aspire-chat-status');
      if (statusEl) statusEl.textContent = status;
    }

    addMessage(role, content) {
      const messageEl = document.createElement('div');
      messageEl.className = `aspire-chat-message ${role}`;
      messageEl.textContent = content;
      this.messagesContainer.appendChild(messageEl);
      this.scrollToBottom();
      this.messages.push({ role, content });
    }

    addTypingIndicator() {
      const typingEl = document.createElement('div');
      typingEl.className = 'aspire-chat-message assistant typing';
      typingEl.id = 'aspire-typing';
      typingEl.innerHTML = '<span></span><span></span><span></span>';
      this.messagesContainer.appendChild(typingEl);
      this.scrollToBottom();
      this.updateStatus('Thinking...');
    }

    removeTypingIndicator() {
      const typingEl = document.getElementById('aspire-typing');
      if (typingEl) typingEl.remove();
      this.updateStatus('Online');
    }

    showError(message) {
      const errorEl = document.createElement('div');
      errorEl.className = 'aspire-chat-error';
      errorEl.textContent = message;
      this.messagesContainer.appendChild(errorEl);
      this.scrollToBottom();
      setTimeout(() => errorEl.remove(), 5000);
    }

    scrollToBottom() {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    async sendMessage() {
      const message = this.input.value.trim();
      if (!message || this.isLoading) return;

      // Clear input
      this.input.value = '';
      this.input.style.height = 'auto';

      // Add user message
      this.addMessage('user', message);

      // Show typing indicator
      this.isLoading = true;
      this.sendButton.disabled = true;
      this.addTypingIndicator();

      try {
        const response = await fetch(`${config.apiUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            assistantId: config.assistantId,
            sessionId: this.sessionId,
            message: message
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to send message');
        }

        const data = await response.json();

        // Remove typing indicator
        this.removeTypingIndicator();

        // Add assistant response
        if (data.response) {
          this.addMessage('assistant', data.response);
        }

        // Update session ID if returned
        if (data.sessionId) {
          this.sessionId = data.sessionId;
          const key = `aspire_chat_session_${config.assistantId}`;
          localStorage.setItem(key, this.sessionId);
        }

      } catch (error) {
        console.error('Aspire Chat Error:', error);
        this.removeTypingIndicator();
        this.showError(error.message || 'Sorry, something went wrong. Please try again.');
      } finally {
        this.isLoading = false;
        this.sendButton.disabled = false;
        this.input.focus();
      }
    }
  }

  // Initialize widget
  const widget = new AspireChatWidget();

  // Expose API for programmatic control
  window.AspireChat = {
    open: () => widget.open(),
    close: () => widget.close(),
    toggle: () => widget.toggle(),
    reset: () => widget.reset(),
    sendMessage: (msg) => { widget.input.value = msg; widget.sendMessage(); }
  };

})();
