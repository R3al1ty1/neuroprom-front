document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api'; // ЗАМЕНИТЕ, ЕСЛИ НУЖНО

    // --- DOM Элементы ---
    const chatbox = document.getElementById('chatbox');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const loadingIndicator = document.getElementById('loading-indicator');
    const chatError = document.getElementById('chat-error');
    const authButton = document.getElementById('auth-button');
    const logoutButton = document.getElementById('logout-button');
    const authSection = document.getElementById('auth-section');
    const authForm = document.getElementById('auth-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const authError = document.getElementById('auth-error');
    const authTitle = document.getElementById('auth-title');
    const switchAuthModeButton = document.getElementById('switch-auth-mode');
    const cancelAuthButton = document.getElementById('cancel-auth-button');
    const authSubmitButton = document.getElementById('auth-submit-button');
    const userEmailSpan = document.getElementById('user-email');
    const chatListSidebar = document.getElementById('chat-list-sidebar');
    const chatListUl = document.getElementById('chat-list');
    const chatListPlaceholder = document.getElementById('chat-list-placeholder');
    const newChatButton = document.getElementById('new-chat-button');
    const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
    const mobileOverlay = document.getElementById('mobile-overlay');
    const initialAnonymousStateContainer = document.getElementById('initial-anonymous-state');
    const messageFormContainer = document.getElementById('message-form-container');


    // --- Состояние приложения ---
    let currentChatId = null;
    let authToken = localStorage.getItem('authToken');
    let userEmail = localStorage.getItem('userEmail');
    let userChats = [];
    let isLoginMode = true;
    let isLoadingApi = false;
    let isLoadingMessages = false;
    let isSendingMessage = false;
    let isSidebarVisibleMobile = false;
    let isInitialAnonymousView = false; // Флаг для отслеживания начального анонимного вида

    // --- Функции API ---
    async function apiRequest(endpoint, method = 'GET', body = null, requireAuth = true) {
        isLoadingApi = true;
        const headers = { 'Content-Type': 'application/json' };

        // Добавляем токен, только если он есть И аутентификация требуется
        if (requireAuth && authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        } else if (requireAuth && !authToken) {
            // Если требуется аутентификация, но токена нет - ошибка или редирект на логин
            console.error("API Request Error: Auth required but token is missing for", endpoint);
            showGlobalLoader(false); // Скрыть лоадер перед возможным редиректом/ошибкой
            // Можно добавить handleLogout() или показ модального окна
            if (!endpoint.startsWith('/login') && !endpoint.startsWith('/register')) {
                handleLogout(); // Безопаснее всего разлогинить
                 throw new Error("Сессия истекла или недействительна. Пожалуйста, войдите снова.");
            } else {
                 isLoadingApi = false; // Сбрасываем флаг для логина/регистрации
            }

        }
        // Если requireAuth = false, токен не добавляем, даже если он есть

        const config = { method, headers };
        if (body) config.body = JSON.stringify(body);

        showGlobalLoader(true);
        hideErrors();

        try {
            const response = await fetch(`${API_URL}${endpoint}`, config);
            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); } catch (e) { errorData = { detail: `Ошибка HTTP: ${response.status}` }; }
                console.error('API Error:', response.status, errorData);
                // Разлогиниваем только если ошибка 401 была при ЗАПРОСЕ С ТОКЕНОМ
                if (response.status === 401 && requireAuth && authToken) {
                    handleLogout();
                    throw new Error("Сессия истекла или недействительна. Пожалуйста, войдите снова.");
                }
                throw new Error(errorData.detail || `Запрос не удался со статусом ${response.status}`);
            }
            // Успешный ответ без контента (например, DELETE)
            if (response.status === 204 || response.headers.get('content-length') === '0') {
                return null;
            }
            return await response.json();
        } catch (error) {
            console.error('Fetch Error:', error);
            const errorMessage = error.message || "Произошла неизвестная ошибка";
            // Показываем ошибку в соответствующем месте
            if (endpoint.startsWith('/login') || endpoint.startsWith('/register')) {
                showAuthError(errorMessage);
            } else {
                 // Показываем ошибку в чате, если она не связана с сессией
                 if (!errorMessage.includes("Сессия истекла")) {
                      showChatError(errorMessage);
                 }
            }
            throw error; // Пробрасываем ошибку дальше для обработки в вызывающей функции
        } finally {
            isLoadingApi = false;
            showGlobalLoader(false);
            updateSendButtonState(); // Обновляем состояние кнопки после любого запроса
        }
    }


    // --- Функции отрисовки UI ---
    function addMessageToChatbox(message, isUser) {
        // Используем is-visually-hidden для плавного показа
        if (chatbox.classList.contains('is-visually-hidden')) {
             chatbox.classList.remove('is-visually-hidden');
            chatbox.innerHTML = '';
        }
        const placeholder = chatbox.querySelector('.placeholder-message');
        if (placeholder) placeholder.remove();

        const wrapper = document.createElement('div');
        wrapper.classList.add('message-wrapper', isUser ? 'user' : 'assistant');
        if (!isUser) {
            const label = document.createElement('div');
            label.classList.add('message-sender-label');
            label.textContent = 'Ассистент Нейропром';
            wrapper.appendChild(label);
        }
        const bubble = document.createElement('div');
        bubble.classList.add('message-bubble', isUser ? 'user' : 'assistant');
        bubble.innerHTML = message.content.replace(/\n/g, '<br>');
        wrapper.appendChild(bubble);
        chatbox.appendChild(wrapper);
        scrollToBottom();
    }

    function clearChatbox() {
        chatbox.innerHTML = '<div class="placeholder-message">Загрузка...</div>';
        // Используем is-visually-hidden для плавного скрытия, если нужно
         if (!authToken && !currentChatId) {
              chatbox.classList.add('is-visually-hidden');
         } else {
             chatbox.classList.remove('is-visually-hidden');
         }
    }

    function showChatError(message) { chatError.textContent = `Ошибка: ${message}`; chatError.classList.add('visible'); }
    function showAuthError(message) { authError.textContent = `Ошибка: ${message}`; authError.classList.add('visible'); }
    function hideErrors() { chatError.classList.remove('visible'); authError.classList.remove('visible'); }
    function scrollToBottom() { setTimeout(() => { chatbox.scrollTo({ top: chatbox.scrollHeight, behavior: 'smooth' }); }, 50); }
    function showGlobalLoader(show) { /* console.log("Global loader:", show); */ }
    function showTypingIndicator(show) { loadingIndicator.classList.toggle('visible', show); if (show) { scrollToBottom(); } }

    // Показывает начальный UI для анонимного пользователя (ИСПОЛЬЗУЕТ is-visually-hidden)
    function setupInitialAnonymousUI() {
        console.log("Setting up initial anonymous UI");
        clearChatbox(); // Скроет чатбокс через is-visually-hidden
        initialAnonymousStateContainer.classList.remove('is-visually-hidden'); // Показываем
        messageFormContainer.classList.add('is-visually-hidden'); // Скрываем стандартную форму

        if (!initialAnonymousStateContainer.contains(messageForm)) {
             initialAnonymousStateContainer.appendChild(messageForm);
        }
        messageInput.placeholder = "Начните диалог...";
        isInitialAnonymousView = true;
        currentChatId = null;
        adjustTextareaHeight();
        updateSendButtonState();
        messageInput.focus();
    }

    // Переключает UI в режим активного чата (ИСПОЛЬЗУЕТ is-visually-hidden)
    function switchToChattingUI() {
        console.log("Switching to chatting UI");
        if (!isInitialAnonymousView) return;

        initialAnonymousStateContainer.classList.add('is-visually-hidden'); // Скрываем
        if (!messageFormContainer.contains(messageForm)) {
            messageFormContainer.appendChild(messageForm);
        }
        messageFormContainer.classList.remove('is-visually-hidden'); // Показываем
        chatbox.classList.remove('is-visually-hidden'); // Показываем
        chatbox.innerHTML = '';

        messageInput.placeholder = "Введите сообщение...";
        isInitialAnonymousView = false;
        adjustTextareaHeight();
        updateSendButtonState();
    }

    // Обновление UI аутентификации (ИСПОЛЬЗУЕТ .hidden для кнопок и сайдбара на десктопе)
    function updateAuthUI() {
        const isLoggedIn = !!authToken;
        // Кнопки Войти/Выйти - используем .hidden (display: none)
        authButton.classList.toggle('hidden', isLoggedIn);
        logoutButton.classList.toggle('hidden', !isLoggedIn);

        userEmailSpan.classList.toggle('visible', isLoggedIn && !!userEmail);
        if (isLoggedIn && userEmail) userEmailSpan.textContent = userEmail;

        // Управление сайдбаром (Десктоп: .hidden, Мобильный: класс .sidebar-visible-mobile)
        if (window.innerWidth > 768) { // Десктоп
             chatListSidebar.classList.toggle('hidden', !isLoggedIn); // Используем display: none
             mobileSidebarToggle.classList.add('hidden'); // Бургер всегда скрыт на десктопе
             // Убираем класс видимости мобильного сайдбара, если он был
             chatListSidebar.classList.remove('sidebar-visible-mobile');
             isSidebarVisibleMobile = false; // Сбрасываем флаг
        } else { // Мобильный
             // Скрываем через .hidden по умолчанию, если пользователь не вошел
             chatListSidebar.classList.toggle('hidden', !isLoggedIn);
             mobileSidebarToggle.classList.toggle('hidden', !isLoggedIn); // Показываем бургер только если залогинен
             // Класс sidebar-visible-mobile управляется функциями open/closeMobileSidebar
             if (!isLoggedIn) {
                 closeMobileSidebar(); // Принудительно закрыть, если разлогинились
             }
        }

        // Обновляем основной вид чата
        initializeAppUI(); // Эта функция должна учитывать новые классы is-visually-hidden
    }

    function renderChatList() {
        // Не рендерим список, если не авторизован (сайдбар скрыт через updateAuthUI)
        if (!authToken) {
            chatListUl.innerHTML = '';
            chatListPlaceholder.textContent = "Войдите, чтобы видеть чаты.";
            chatListPlaceholder.classList.remove('hidden'); // Показываем плейсхолдер
            return;
        }

        chatListUl.innerHTML = ''; // Очищаем перед рендером
        if (userChats.length === 0) {
            chatListPlaceholder.textContent = "Чатов пока нет.";
            chatListPlaceholder.classList.remove('hidden');
        } else {
            chatListPlaceholder.classList.add('hidden'); // Скрываем плейсхолдер
            // Сортируем чаты по последнему сообщению (если есть) или дате создания
            userChats.sort((a, b) => new Date(b.last_updated || b.created_at || 0) - new Date(a.last_updated || a.created_at || 0));

            userChats.forEach(chat => {
                const li = document.createElement('li');
                li.classList.add('chat-item');
                li.dataset.chatId = chat.id;

                const titleSpan = document.createElement('span');
                titleSpan.classList.add('chat-title');
                let chatTitle = chat.title || `Чат ${chat.id.substring(0, 4)}`; // Default title
                 if (!chat.title && chat.messages && chat.messages.length > 0) {
                    const firstUserMsg = chat.messages.find(msg => !msg.is_assistant);
                    if (firstUserMsg) {
                         const content = firstUserMsg.content;
                         chatTitle = content.substring(0, 25) + (content.length > 25 ? '...' : '');
                    } else if (chat.messages[0]) { // Если только сообщения ассистента, берем первое
                         const content = chat.messages[0].content;
                         chatTitle = `А: ${content.substring(0, 23)}` + (content.length > 23 ? '...' : '');
                    }
                 }
                titleSpan.textContent = chatTitle;
                li.appendChild(titleSpan);

                const deleteBtn = document.createElement('button');
                deleteBtn.classList.add('delete-chat-btn');
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                deleteBtn.title = "Удалить чат";
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    handleDeleteChat(chat.id);
                };
                li.appendChild(deleteBtn);

                if (chat.id === currentChatId) {
                    li.classList.add('active');
                }

                li.addEventListener('click', () => {
                    handleSelectChat(chat.id);
                    // closeMobileSidebar(); // Закрытие сайдбара происходит в handleSelectChat, если он мобильный
                });
                chatListUl.appendChild(li);
            });
        }
    }

    function setActiveChatItem(chatId) {
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.toggle('active', item.dataset.chatId === chatId);
        });
    }

    // --- Логика Чата ---
     async function loadChatHistory(chatId) {
        if (!chatId || isLoadingMessages || !authToken) return; // Загружаем историю только для авторизованных
        clearChatbox(); // Очистит и покажет "Загрузка...", использует is-visually-hidden
        currentChatId = chatId;
        setActiveChatItem(chatId);
        isLoadingMessages = true;
        chatbox.classList.remove('is-visually-hidden'); // Показываем плавно
        initialAnonymousStateContainer.classList.add('is-visually-hidden'); // Скрываем анонимный вид, если был (плавно)
        messageFormContainer.classList.remove('is-visually-hidden'); // Показываем стандартный инпут (плавно)
        // Убедимся, что форма на месте
        if (!messageFormContainer.contains(messageForm)) {
            messageFormContainer.appendChild(messageForm);
            adjustTextareaHeight(); // Пересчитать высоту после перемещения
        }

        try {
            const chatData = await apiRequest(`/chats/${chatId}`, 'GET', null, true); // requireAuth = true
            chatbox.innerHTML = ''; // Очищаем от "Загрузка..."
            if (chatData && chatData.messages && chatData.messages.length > 0) {
                chatData.messages.forEach(msg => addMessageToChatbox(msg, !msg.is_assistant));
            } else {
                chatbox.innerHTML = '<div class="placeholder-message">Сообщений пока нет. Начните диалог!</div>';
            }
            // Обновляем данные чата в локальном кеше
            const chatIndex = userChats.findIndex(c => c.id === chatId);
            if (chatIndex > -1) userChats[chatIndex] = { ...userChats[chatIndex], ...chatData };
            renderChatList(); // Обновить список (может обновить заголовок)
            setActiveChatItem(chatId); // Повторно установить активный элемент

        } catch (error) {
            // Ошибка уже обработана в apiRequest и показана (или был logout)
            currentChatId = null;
            setActiveChatItem(null);
            if (!error.message.includes("Сессия истекла")) { // Не сбрасываем, если проблема с сессией (уже разлогинились)
                 clearChatbox();
                 chatbox.innerHTML = `<div class="placeholder-message error">Не удалось загрузить чат: ${error.message}</div>`;
            }
        } finally {
            isLoadingMessages = false;
            updateSendButtonState();
            scrollToBottom();
        }
    }

    async function sendMessage(content) {
        if (isSendingMessage) return;
        hideErrors();
        const userMessage = { content: content, is_assistant: false, timestamp: new Date().toISOString() };

        // Первый анонимный
        if (!authToken && !currentChatId) {
            if (!isInitialAnonymousView) { console.error("Error:..."); showChatError("..."); return; }
            console.log("Sending first anonymous message...");
            isSendingMessage = true;
            updateSendButtonState();
            messageInput.value = ''; adjustTextareaHeight();
            try {
                 console.log("Creating anonymous chat...");
                 const newChat = await apiRequest('/chats/', 'POST', { is_anonymous: true }, false);
                 if (!newChat || !newChat.id) { throw new Error("Не удалось создать анонимный чат на сервере."); }
                 currentChatId = newChat.id; console.log("Anonymous chat created:", currentChatId);
                 switchToChattingUI(); // Переключает видимость через is-visually-hidden
                 addMessageToChatbox(userMessage, true);
                 showTypingIndicator(true);
                 console.log("Sending message content to anonymous chat:", currentChatId);
                 const response = await apiRequest(`/chats/${currentChatId}/messages/`, 'POST', { content: content }, false);
                 showTypingIndicator(false);
                 if (response && response.assistant_message) { addMessageToChatbox(response.assistant_message, false); }
                 else { console.warn("No assistant message..."); }
            } catch (error) {
                showTypingIndicator(false);
                showChatError(`Не удалось начать диалог: ${error.message}`);
                if (!currentChatId) { setupInitialAnonymousUI(); } // Вернуть через is-visually-hidden
                else { addMessageToChatbox({ content: `Ошибка отправки: ${error.message}`, is_assistant: true, timestamp: new Date().toISOString() }, false); }
            } finally { isSendingMessage = false; updateSendButtonState(); messageInput.focus(); }
            return;
        }

        // Авторизованные или последующие анонимные
        if (!currentChatId) { showChatError("Пожалуйста, выберите или создайте чат."); return; }
        isSendingMessage = true; updateSendButtonState();
        addMessageToChatbox(userMessage, true);
        messageInput.value = ''; adjustTextareaHeight();
        showTypingIndicator(true);
        try {
            const response = await apiRequest(`/chats/${currentChatId}/messages/`, 'POST', { content: content }, !!authToken);
            showTypingIndicator(false);
            if (response && response.assistant_message) {
                addMessageToChatbox(response.assistant_message, false);
                 if (response.chat) { // Обновляем чат в кеше
                      const chatIndex = userChats.findIndex(c => c.id === currentChatId);
                      if (chatIndex > -1) {
                           userChats[chatIndex] = { ...userChats[chatIndex], ...response.chat };
                           renderChatList(); // Перерисовать список для обновления времени/заголовка
                           setActiveChatItem(currentChatId);
                      }
                 }
            } else { console.warn("No assistant message..."); }
        } catch (error) {
            showTypingIndicator(false);
             if (!error.message.includes("Сессия истекла")) { addMessageToChatbox({ content: `Ошибка отправки: ${error.message}`, is_assistant: true, timestamp: new Date().toISOString() }, false); }
        } finally { isSendingMessage = false; updateSendButtonState(); messageInput.focus(); }
    }


    function updateSendButtonState() {
        const hasContent = messageInput.value.trim().length > 0;
        const canInteract = !isLoadingApi && !isLoadingMessages && !isSendingMessage;
        let isButtonDisabled = !canInteract || !hasContent;
        let isInputDisabled = !canInteract;
        let placeholder = "Введите сообщение...";

        if (authToken) {
            // Авторизованный пользователь
            if (!currentChatId && userChats.length > 0) { // Чаты есть, но не выбран
                isButtonDisabled = true;
                isInputDisabled = true;
                placeholder = "Выберите чат для начала";
            } else if (!currentChatId && userChats.length === 0 && !isLoadingApi) { // Чатов нет
                 isButtonDisabled = true;
                 isInputDisabled = true;
                 placeholder = "Создайте новый чат";
            } else if (!currentChatId) { // Идет загрузка или ошибка
                 isButtonDisabled = true;
                 isInputDisabled = true;
                 placeholder = "Загрузка...";
            }
            // Если чат выбран (currentChatId есть), isButtonDisabled/isInputDisabled зависят от canInteract/hasContent
        } else {
            // Анонимный пользователь
            if (isInitialAnonymousView) {
                placeholder = "Начните диалог...";
                // Кнопка и инпут активны, если нет загрузки
                isButtonDisabled = !canInteract || !hasContent;
                isInputDisabled = !canInteract;
            } else if (!currentChatId) {
                 // Состояние после ошибки создания анонимного чата?
                 placeholder = "Ошибка. Обновите страницу.";
                 isButtonDisabled = true;
                 isInputDisabled = true;
            }
             // Если анонимный чат создан (currentChatId есть), isButtonDisabled/isInputDisabled зависят от canInteract/hasContent
        }

        // Применяем состояния
        sendButton.disabled = isButtonDisabled;
        messageInput.disabled = isInputDisabled;
        messageInput.placeholder = placeholder;
    }

    async function handleNewChat() {
        if (isLoadingApi || !authToken) return;
        chatListPlaceholder.textContent = "Создание чата...";
        chatListPlaceholder.classList.remove('hidden');
        chatListUl.prepend(chatListPlaceholder);

        try {
            const newChat = await apiRequest('/chats/', 'POST', {}, true);
            const chatToAdd = { messages: [], ...newChat }; // Добавляем messages, если API не вернул
            userChats.unshift(chatToAdd); // Добавляем в начало списка
            renderChatList(); // Перерисовать список
            handleSelectChat(newChat.id); // Сразу выбрать новый чат
            // closeMobileSidebar(); // Закроется в handleSelectChat или если уже не мобильный режим

        } catch (error) {
            if (userChats.length === 0) {
                chatListPlaceholder.textContent = "Ошибка создания чата.";
                chatListPlaceholder.classList.remove('hidden');
            } else {
                chatListPlaceholder.classList.add('hidden'); // Скрыть индикатор
            }
            renderChatList(); // Обновить список
        }
    }

    async function handleSelectChat(chatId) {
         if (chatId === currentChatId || isLoadingMessages || !authToken) return;
         await loadChatHistory(chatId); // Загрузит историю
         // Закрыть мобильный сайдбар после выбора чата
         if (isSidebarVisibleMobile) {
             closeMobileSidebar();
         }
    }

    async function handleDeleteChat(chatIdToDelete) {
        if (!chatIdToDelete || isLoadingApi || !authToken) return;
        const chatToDelete = userChats.find(c => c.id === chatIdToDelete);
        const chatTitleConfirm = chatToDelete?.title || `Чат ${chatIdToDelete.substring(0,4)}`;
        if (!confirm(`Вы уверены, что хотите удалить "${chatTitleConfirm}"? Это действие необратимо.`)) {
            return;
        }

        const chatItemElement = chatListUl.querySelector(`.chat-item[data-chat-id="${chatIdToDelete}"]`);
        if (chatItemElement) chatItemElement.style.opacity = '0.5';

        try {
            await apiRequest(`/chats/${chatIdToDelete}`, 'DELETE', null, true);
            userChats = userChats.filter(chat => chat.id !== chatIdToDelete);
            renderChatList();

            if (currentChatId === chatIdToDelete) {
                currentChatId = null;
                clearChatbox(); // Использует is-visually-hidden
                if (userChats.length > 0) {
                    handleSelectChat(userChats[0].id); // Выбрать первый (новейший)
                } else {
                    chatbox.innerHTML = '<div class="placeholder-message">Чатов нет. Создайте новый!</div>';
                    renderChatList(); // Обновит плейсхолдер
                }
            }
            console.log(`Chat ${chatIdToDelete} deleted successfully.`);
        } catch (error) {
            showChatError(`Не удалось удалить чат: ${error.message}`);
            if (chatItemElement) chatItemElement.style.opacity = '1';
        } finally {
             updateSendButtonState();
        }
    }


    // --- Логика Аутентификации ---
    async function handleLogin(email, password) {
         try {
            const data = await apiRequest('/login', 'POST', { email, password }, false);
            authToken = data.access_token;
            try {
                 const payload = JSON.parse(atob(authToken.split('.')[1]));
                 userEmail = payload.email || payload.sub || 'Пользователь';
            } catch (e) {
                console.error("Token decode failed", e); userEmail = 'Пользователь';
            }
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('userEmail', userEmail);
            authSection.classList.remove('visible');
            currentChatId = null; isInitialAnonymousView = false;
            updateAuthUI(); // Обновит UI и вызовет initializeAppUI
            await loadUserChats(); // Загрузит чаты пользователя
         } catch (error) { console.error("Login failed:", error); }
     }
     async function handleRegister(email, password) {
         try {
             await apiRequest('/register', 'POST', { email, password }, false);
             alert("Регистрация прошла успешно! Пожалуйста, войдите.");
             switchAuthMode(true);
             emailInput.value = email; passwordInput.value = ''; passwordInput.focus();
         } catch (error) { console.error("Registration failed:", error); }
      }
     function handleLogout() {
          authToken = null; userEmail = null; currentChatId = null; userChats = [];
          localStorage.removeItem('authToken'); localStorage.removeItem('userEmail');
          updateAuthUI(); // Обновит UI и вызовет initializeAppUI
    }
     function switchAuthMode(toLogin) {
          isLoginMode = toLogin;
          authTitle.textContent = isLoginMode ? 'Вход' : 'Регистрация';
          authSubmitButton.textContent = isLoginMode ? 'Войти' : 'Зарегистрироваться';
          switchAuthModeButton.textContent = isLoginMode ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти';
          hideErrors(); authForm.reset();
          if (isLoginMode) emailInput.focus(); else emailInput.focus();
      }

    // --- Загрузка начального состояния ---
    async function loadUserChats() {
           if (!authToken) { renderChatList(); return; }
           chatListPlaceholder.textContent = "Загрузка чатов...";
           chatListPlaceholder.classList.remove('hidden');
           chatListUl.innerHTML = '';

           try {
               const chats = await apiRequest('/chats/', 'GET', null, true);
               userChats = Array.isArray(chats) ? chats : [];
               userChats = userChats.map(chat => ({ messages: [], ...chat })); // Добавить messages если нет
               renderChatList(); // Отобразит чаты или "Чатов нет"

               // Выбор чата после загрузки
               if (!currentChatId && userChats.length > 0) {
                   handleSelectChat(userChats[0].id); // Выбрать первый (новейший)
               }
               else if (currentChatId && !userChats.some(c => c.id === currentChatId)) {
                   currentChatId = null; // Сбросить ID, если активный чат удален/не найден
                   if (userChats.length > 0) { handleSelectChat(userChats[0].id); }
                   else { clearChatbox(); chatbox.innerHTML = '<div class="placeholder-message">Чатов не найдено.</div>'; }
               }
               else if (currentChatId) { // Активный чат есть в списке
                   setActiveChatItem(currentChatId); // Просто подсветить
                   // Возможно, стоит обновить историю, если мы не уверены в ее актуальности
                   // await loadChatHistory(currentChatId);
               }
               else if (userChats.length === 0) { // Чатов нет
                   clearChatbox();
                   chatbox.innerHTML = '<div class="placeholder-message">Создайте свой первый чат, нажав "+" слева.</div>';
               }

           } catch (error) {
                chatListPlaceholder.textContent = "Ошибка загрузки чатов.";
                chatListPlaceholder.classList.remove('hidden');
                chatListUl.innerHTML = ''; userChats = [];
                clearChatbox();
                chatbox.innerHTML = `<div class="placeholder-message error">Не удалось загрузить чаты. Попробуйте обновить страницу.</div>`;
           } finally {
                updateSendButtonState();
           }
       }

    // --- Мобильный сайдбар (ИСПОЛЬЗУЕТ sidebar-visible-mobile) ---
     function openMobileSidebar() {
        if (!isSidebarVisibleMobile && authToken) {
            // Убираем display:none, если он был (важно перед transform)
            chatListSidebar.classList.remove('hidden');
             // Даем браузеру обработать remove('hidden') перед transform
             requestAnimationFrame(() => {
                 chatListSidebar.classList.add('sidebar-visible-mobile');
                 mobileOverlay.classList.add('visible');
             });
             isSidebarVisibleMobile = true;
             mobileSidebarToggle.setAttribute('aria-expanded', 'true');
        }
    }
    function closeMobileSidebar() {
         if (isSidebarVisibleMobile) {
             chatListSidebar.classList.remove('sidebar-visible-mobile');
             mobileOverlay.classList.remove('visible');
             isSidebarVisibleMobile = false;
             mobileSidebarToggle.setAttribute('aria-expanded', 'false');
             // Можно добавить hidden после завершения анимации transform,
             // чтобы вернуть display:none, если это важно для доступности или др.
             /* chatListSidebar.addEventListener('transitionend', () => {
                 if (!isSidebarVisibleMobile) {
                     chatListSidebar.classList.add('hidden');
                 }
             }, { once: true }); */
         }
    }


    // --- Авто-ресайз Textarea ---
    function adjustTextareaHeight() {
        const MAX_HEIGHT_PX = 120;
        messageInput.style.height = 'auto';
        const scrollHeight = messageInput.scrollHeight + 2;
        const newHeight = Math.min(scrollHeight, MAX_HEIGHT_PX);
        messageInput.style.height = newHeight + 'px';
        messageInput.style.overflowY = scrollHeight > MAX_HEIGHT_PX ? 'auto' : 'hidden';
    }


    // --- Инициализация и обработчики событий ---
     messageForm.addEventListener('submit', (e) => { e.preventDefault(); const content = messageInput.value.trim(); if (content && !sendButton.disabled) { sendMessage(content); } });
     messageInput.addEventListener('input', () => { adjustTextareaHeight(); updateSendButtonState(); });
     messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendButton.disabled) { messageForm.requestSubmit(); } } });
     authButton.addEventListener('click', () => { authSection.classList.add('visible'); switchAuthMode(true); hideErrors(); emailInput.focus(); });
     logoutButton.addEventListener('click', handleLogout);
     cancelAuthButton.addEventListener('click', () => { authSection.classList.remove('visible'); });
     authSection.addEventListener('click', (e) => { if (e.target === authSection) { authSection.classList.remove('visible'); } });
     switchAuthModeButton.addEventListener('click', () => switchAuthMode(!isLoginMode));
     authForm.addEventListener('submit', (e) => { e.preventDefault(); if (isLoadingApi) return; const email = emailInput.value.trim(); const password = passwordInput.value; if (!email || !password) { showAuthError("Необходимо ввести email и пароль."); return; } hideErrors(); if (isLoginMode) handleLogin(email, password); else handleRegister(email, password); });
     newChatButton.addEventListener('click', handleNewChat);
     mobileSidebarToggle.addEventListener('click', (e) => { e.stopPropagation(); if (isSidebarVisibleMobile) closeMobileSidebar(); else openMobileSidebar(); });
     mobileOverlay.addEventListener('click', closeMobileSidebar);
     document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isSidebarVisibleMobile) { closeMobileSidebar(); } });


    // --- Начальная настройка UI приложения (ИСПОЛЬЗУЕТ is-visually-hidden и .hidden) ---
    function initializeAppUI() {
        console.log("Initializing App UI, authToken:", !!authToken);
        hideErrors();
        if (authToken) {
            // Авторизованный пользователь
            console.log("Auth user flow");
            initialAnonymousStateContainer.classList.add('is-visually-hidden'); // Скрываем плавно
            if (!messageFormContainer.contains(messageForm)) {
                  messageFormContainer.appendChild(messageForm);
             }
            messageFormContainer.classList.remove('is-visually-hidden'); // Показываем плавно
            chatbox.classList.remove('is-visually-hidden'); // Показываем плавно

            // Сайбар показывается/скрывается через .hidden в updateAuthUI
            renderChatList();

            // Плейсхолдеры в чатбоксе
            if (!currentChatId && userChats.length > 0 && !isLoadingMessages) {
                 clearChatbox(); chatbox.innerHTML = '<div class="placeholder-message">Выберите чат из списка слева.</div>';
            } else if (!currentChatId && userChats.length === 0 && !isLoadingApi) {
                 clearChatbox(); chatbox.innerHTML = '<div class="placeholder-message">Создайте свой первый чат, нажав "+" слева.</div>';
            } else if (!currentChatId) {
                 clearChatbox(); // Покажет "Загрузка..." или сообщение об ошибке из loadUserChats
            }
        } else {
            // Анонимный пользователь
            console.log("Anonymous user flow");
            // Сайбар скрыт через .hidden в updateAuthUI
            userChats = []; currentChatId = null;
            setupInitialAnonymousUI(); // Показывает анонимный блок плавно
            renderChatList(); // Покажет "Войдите..."
        }
        adjustTextareaHeight();
        updateSendButtonState();
    }


    // --- Полная инициализация приложения ---
    async function initializeApp() {
        console.log("initializeApp called");
        updateAuthUI(); // Определит видимость базовых элементов UI
        if (authToken) {
             await loadUserChats(); // Загрузит чаты, если пользователь авторизован
        }
        // initializeAppUI вызовется из updateAuthUI или после loadUserChats
        console.log("App Initialized");
    }

    // Запускаем приложение
    initializeApp();

    // Добавляем слушатель изменения размера окна для корректного переключения UI сайдбара
    window.addEventListener('resize', updateAuthUI);

});