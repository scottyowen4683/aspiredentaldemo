/**
 * Aspire AI Chat Widget
 * Embeddable chat widget for client websites
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
    title: scriptTag?.getAttribute('data-title') || 'Chat with us',
    subtitle: scriptTag?.getAttribute('data-subtitle') || 'AI Assistant',
    placeholder: scriptTag?.getAttribute('data-placeholder') || 'Type your message...',
    buttonText: scriptTag?.getAttribute('data-button-text') || '',
    zIndex: parseInt(scriptTag?.getAttribute('data-z-index')) || 9999,
    autoOpen: scriptTag?.getAttribute('data-auto-open') === 'true',
    showPoweredBy: scriptTag?.getAttribute('data-show-powered-by') !== 'false',
  };

  // Generate unique session ID
  const generateSessionId = () => {
    return 'aspire_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  };

  // Get or create session ID from storage
  const getSessionId = () => {
    let sessionId = sessionStorage.getItem('aspire_chat_session');
    if (!sessionId) {
      sessionId = generateSessionId();
      sessionStorage.setItem('aspire_chat_session', sessionId);
    }
    return sessionId;
  };

  // CSS Styles
  const styles = `
    .aspire-chat-widget * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    .aspire-chat-button {
      position: fixed;
      ${config.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
      ${config.position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${config.primaryColor};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: transform 0.2s, box-shadow 0.2s;
      z-index: ${config.zIndex};
    }

    .aspire-chat-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .aspire-chat-button svg {
      width: 28px;
      height: 28px;
      fill: white;
    }

    .aspire-chat-button-text {
      position: absolute;
      right: 70px;
      background: white;
      padding: 8px 16px;
      border-radius: 20px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      white-space: nowrap;
      font-size: 14px;
      color: #333;
      opacity: 0;
      transform: translateX(10px);
      transition: opacity 0.2s, transform 0.2s;
      pointer-events: none;
    }

    .aspire-chat-button:hover .aspire-chat-button-text {
      opacity: 1;
      transform: translateX(0);
    }

    .aspire-chat-window {
      position: fixed;
      ${config.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
      ${config.position.includes('bottom') ? 'bottom: 90px;' : 'top: 90px;'}
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 550px;
      max-height: calc(100vh - 120px);
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
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

    .aspire-chat-header {
      background: ${config.primaryColor};
      color: white;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .aspire-chat-header-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .aspire-chat-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .aspire-chat-avatar svg {
      width: 24px;
      height: 24px;
      fill: white;
    }

    .aspire-chat-header-text h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .aspire-chat-header-text p {
      margin: 2px 0 0;
      font-size: 12px;
      opacity: 0.8;
    }

    .aspire-chat-close {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 8px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .aspire-chat-close:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .aspire-chat-close svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    .aspire-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f9fafb;
    }

    .aspire-chat-message {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.5;
      word-wrap: break-word;
    }

    .aspire-chat-message.user {
      align-self: flex-end;
      background: ${config.primaryColor};
      color: white;
      border-bottom-right-radius: 4px;
    }

    .aspire-chat-message.assistant {
      align-self: flex-start;
      background: white;
      color: #333;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    .aspire-chat-message.typing {
      display: flex;
      gap: 4px;
      padding: 16px;
    }

    .aspire-chat-message.typing span {
      width: 8px;
      height: 8px;
      background: #ccc;
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

    .aspire-chat-input-area {
      padding: 16px;
      background: white;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .aspire-chat-input {
      flex: 1;
      border: 1px solid #e5e7eb;
      border-radius: 24px;
      padding: 12px 16px;
      font-size: 14px;
      resize: none;
      max-height: 120px;
      outline: none;
      transition: border-color 0.2s;
    }

    .aspire-chat-input:focus {
      border-color: ${config.primaryColor};
    }

    .aspire-chat-send {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: ${config.primaryColor};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, opacity 0.2s;
      flex-shrink: 0;
    }

    .aspire-chat-send:hover {
      transform: scale(1.05);
    }

    .aspire-chat-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .aspire-chat-send svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    .aspire-chat-powered {
      text-align: center;
      padding: 8px;
      font-size: 11px;
      color: #9ca3af;
      background: white;
    }

    .aspire-chat-powered a {
      color: ${config.primaryColor};
      text-decoration: none;
    }

    .aspire-chat-error {
      background: #fef2f2;
      color: #dc2626;
      padding: 12px 16px;
      border-radius: 8px;
      margin: 8px 0;
      font-size: 13px;
    }

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

      .aspire-chat-button-text {
        display: none;
      }
    }
  `;

  // Icons
  const icons = {
    chat: '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    bot: '<svg viewBox="0 0 24 24"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5A2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5a2.5 2.5 0 0 0 2.5 2.5a2.5 2.5 0 0 0 2.5-2.5a2.5 2.5 0 0 0-2.5-2.5z"/></svg>',
  };

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

      // Bind events
      this.button.addEventListener('click', () => this.toggle());
      this.closeButton.addEventListener('click', () => this.close());
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
          ${icons.chat}
          ${config.buttonText ? `<span class="aspire-chat-button-text">${config.buttonText}</span>` : ''}
        </button>

        <div class="aspire-chat-window">
          <div class="aspire-chat-header">
            <div class="aspire-chat-header-info">
              <div class="aspire-chat-avatar">${icons.bot}</div>
              <div class="aspire-chat-header-text">
                <h3>${config.title}</h3>
                <p>${config.subtitle}</p>
              </div>
            </div>
            <button class="aspire-chat-close" aria-label="Close chat">
              ${icons.close}
            </button>
          </div>

          <div class="aspire-chat-messages"></div>

          <div class="aspire-chat-input-area">
            <textarea
              class="aspire-chat-input"
              placeholder="${config.placeholder}"
              rows="1"
            ></textarea>
            <button class="aspire-chat-send" aria-label="Send message">
              ${icons.send}
            </button>
          </div>

          ${config.showPoweredBy ? `
            <div class="aspire-chat-powered">
              Powered by <a href="https://aspire.ai" target="_blank" rel="noopener">Aspire AI</a>
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
      this.button.innerHTML = icons.close;
      this.input.focus();
    }

    close() {
      this.isOpen = false;
      this.window.classList.remove('open');
      this.button.innerHTML = icons.chat + (config.buttonText ? `<span class="aspire-chat-button-text">${config.buttonText}</span>` : '');
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
    }

    removeTypingIndicator() {
      const typingEl = document.getElementById('aspire-typing');
      if (typingEl) typingEl.remove();
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
          sessionStorage.setItem('aspire_chat_session', this.sessionId);
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
  window.AspireChat = new AspireChatWidget();

  // Expose API for programmatic control
  window.AspireChat.open = () => window.AspireChat.open();
  window.AspireChat.close = () => window.AspireChat.close();
  window.AspireChat.toggle = () => window.AspireChat.toggle();

})();
