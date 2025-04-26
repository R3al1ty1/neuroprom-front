document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'http://localhost:8000/api'; // ЗАМЕНИТЕ, ЕСЛИ НУЖНО

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
    // Новые элементы для анонимного UI
    const initialAnonymousStateContainer = document.getElementById('initial-anonymous-state');
    const messageFormContainer = document.getElementById('message-form-container'); // Оригинальный контейнер формы


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
        // Убедимся, что chatbox видим перед добавлением сообщения
        if (chatbox.classList.contains('hidden')) {
            chatbox.classList.remove('hidden');
            chatbox.innerHTML = ''; // Очистить, если там было что-то вроде "Загрузка"
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
        // Простая обработка новой строки (можно улучшить для Markdown)
        bubble.innerHTML = message.content.replace(/\n/g, '<br>');
        wrapper.appendChild(bubble);
        chatbox.appendChild(wrapper);

        // Плавный скролл вниз
        scrollToBottom();
    }

    function clearChatbox() {
        chatbox.innerHTML = '<div class="placeholder-message">Загрузка...</div>';
        // Скрываем chatbox при очистке, если не авторизован и нет чата
        if (!authToken && !currentChatId) {
            chatbox.classList.add('hidden');
        } else {
             chatbox.classList.remove('hidden');
        }
    }

    function showChatError(message) { chatError.textContent = `Ошибка: ${message}`; chatError.classList.add('visible'); }
    function showAuthError(message) { authError.textContent = `Ошибка: ${message}`; authError.classList.add('visible'); }
    function hideErrors() { chatError.classList.remove('visible'); authError.classList.remove('visible'); }

    function scrollToBottom() {
         chatbox.scrollTo({ top: chatbox.scrollHeight, behavior: 'smooth' });
    }

    // Глобальный лоадер можно реализовать (например, спиннер поверх всего)
    function showGlobalLoader(show) {
        // Placeholder: Добавьте здесь логику показа/скрытия глобального лоадера, если он нужен
        // console.log("Global loader:", show);
    }

    function showTypingIndicator(show) {
        loadingIndicator.classList.toggle('visible', show);
        if (show) {
             // Скролл вниз, чтобы индикатор был виден
             setTimeout(scrollToBottom, 50);
        }
    }

    // Показывает начальный UI для анонимного пользователя
    function setupInitialAnonymousUI() {
        console.log("Setting up initial anonymous UI");
        clearChatbox(); // Скроет chatbox и покажет "Загрузка" (которую мы потом скроем)
        chatbox.classList.add('hidden'); // Явно скрываем чатбокс
        initialAnonymousStateContainer.classList.remove('hidden'); // Показываем контейнер с заголовком
        messageFormContainer.classList.add('hidden'); // Скрываем стандартный контейнер формы

        // Перемещаем форму внутрь .initial-anonymous-state
        initialAnonymousStateContainer.appendChild(messageForm);

        messageInput.placeholder = "Начните диалог..."; // Другой плейсхолдер
        isInitialAnonymousView = true;
        currentChatId = null; // Убедимся, что ID сброшен
        adjustTextareaHeight();
        updateSendButtonState();
    }

    // Переключает UI в режим активного чата (после первого сообщения анонима)
    function switchToChattingUI() {
        console.log("Switching to chatting UI");
        if (!isInitialAnonymousView) return; // Не переключать, если уже в режиме чата

        initialAnonymousStateContainer.classList.add('hidden'); // Скрываем контейнер с заголовком
        // Возвращаем форму в её стандартный контейнер
        messageFormContainer.appendChild(messageForm);
        messageFormContainer.classList.remove('hidden'); // Показываем стандартный контейнер формы
        chatbox.classList.remove('hidden'); // Показываем chatbox
        chatbox.innerHTML = ''; // Очищаем от плейсхолдеров типа "Загрузка"

        messageInput.placeholder = "Введите сообщение..."; // Стандартный плейсхолдер
        isInitialAnonymousView = false;
        adjustTextareaHeight();
        updateSendButtonState(); // Обновить состояние кнопки/инпута
    }

    function updateAuthUI() {
        const isLoggedIn = !!authToken;
        authButton.classList.toggle('hidden', isLoggedIn);
        logoutButton.classList.toggle('hidden', !isLoggedIn);
        userEmailSpan.classList.toggle('visible', isLoggedIn && !!userEmail);
        if (isLoggedIn && userEmail) userEmailSpan.textContent = userEmail;

        // Управление сайдбаром
        chatListSidebar.classList.toggle('hidden', !isLoggedIn); // Скрываем сайдбар если НЕ залогинен
        mobileSidebarToggle.style.display = isLoggedIn ? 'block' : 'none'; // Показываем бургер только залогиненным

        if (!isLoggedIn) {
            closeMobileSidebar(); // Закрываем мобильный сайдбар при выходе
        }
        // Обновляем основной вид чата при смене статуса авторизации
        initializeAppUI();
    }


    function renderChatList() {
        // Не рендерим список, если не авторизован
        if (!authToken) {
            chatListUl.innerHTML = '';
            chatListPlaceholder.textContent = "Войдите, чтобы видеть чаты.";
            chatListPlaceholder.classList.remove('hidden');
            return;
        }

        chatListUl.innerHTML = ''; // Очищаем перед рендером
        if (userChats.length === 0) {
            chatListPlaceholder.textContent = "Чатов пока нет.";
            chatListPlaceholder.classList.remove('hidden');
        } else {
            chatListPlaceholder.classList.add('hidden');
            userChats.forEach(chat => {
                const li = document.createElement('li');
                li.classList.add('chat-item');
                li.dataset.chatId = chat.id;

                const titleSpan = document.createElement('span');
                titleSpan.classList.add('chat-title');
                // Улучшенная логика заголовка: ищем первое сообщение пользователя
                let chatTitle = `Чат ${chat.id.substring(0, 4)}`; // Default
                 if (chat.messages && chat.messages.length > 0) {
                    // Ищем первое сообщение НЕ ассистента
                    const firstUserMsg = chat.messages.find(msg => !msg.is_assistant);
                    if (firstUserMsg) {
                         const content = firstUserMsg.content;
                         chatTitle = content.substring(0, 25) + (content.length > 25 ? '...' : '');
                    } else if (chat.messages[0]) { // Если только сообщения ассистента, берем первое
                         const content = chat.messages[0].content;
                         chatTitle = content.substring(0, 25) + (content.length > 25 ? '...' : '');
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
                    closeMobileSidebar();
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
        clearChatbox(); // Очистит и покажет "Загрузка..."
        currentChatId = chatId;
        setActiveChatItem(chatId);
        isLoadingMessages = true;
        chatbox.classList.remove('hidden'); // Убедимся, что chatbox видим
        initialAnonymousStateContainer.classList.add('hidden'); // Скрываем анонимный вид, если был
        messageFormContainer.classList.remove('hidden'); // Показываем стандартный инпут

        try {
            // Загружаем историю только для авторизованных
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

        } catch (error) {
            // Ошибка уже обработана в apiRequest и показана (или был logout)
            // chatbox.innerHTML = `<div class="placeholder-message error">Не удалось загрузить чат.</div>`;
            currentChatId = null;
            setActiveChatItem(null);
            if (!error.message.includes("Сессия истекла")) { // Не сбрасываем, если проблема с сессией (уже разлогинились)
                 clearChatbox();
                 chatbox.innerHTML = '<div class="placeholder-message error">Не удалось загрузить чат.</div>';
            }
        } finally {
            isLoadingMessages = false;
            updateSendButtonState();
            // Плавный скролл в самый конец после загрузки
            setTimeout(scrollToBottom, 100);
        }
    }


    // --- Отправка сообщения (Обновлено для анонимов) ---
    async function sendMessage(content) {
        if (isSendingMessage) return; // Базовая проверка

        hideErrors();
        const userMessage = { content: content, timestamp: new Date().toISOString() }; // Данные для UI

        // --- Логика для ПЕРВОГО сообщения анонимного пользователя ---
        if (!authToken && !currentChatId) {
            if (!isInitialAnonymousView) {
                console.error("Error: Trying to send first anonymous message but not in initial view.");
                showChatError("Произошла внутренняя ошибка. Обновите страницу.");
                return;
            }
            console.log("Sending first anonymous message...");
            isSendingMessage = true;
            updateSendButtonState();
            // Не показываем индикатор печати ДО создания чата
            // showTypingIndicator(true); // Рано

            try {
                // 1. Создать анонимный чат
                 console.log("Creating anonymous chat...");
                 // !!! ВАЖНО: Тело запроса { is_anonymous: true } может отличаться для вашего API !!!
                 const newChat = await apiRequest('/chats/', 'POST', { is_anonymous: true }, false); // requireAuth = false
                 if (!newChat || !newChat.id) {
                     throw new Error("Не удалось создать анонимный чат на сервере.");
                 }
                 currentChatId = newChat.id;
                 console.log("Anonymous chat created:", currentChatId);

                // 2. Переключить UI на режим чата
                switchToChattingUI();

                // 3. Добавить сообщение пользователя в видимый chatbox
                addMessageToChatbox(userMessage, true);
                messageInput.value = ''; // Очистить поле ввода
                adjustTextareaHeight();

                // 4. Показать индикатор печати ПЕРЕД отправкой сообщения на созданный ID
                showTypingIndicator(true);

                // 5. Отправить сообщение в созданный чат
                console.log("Sending message content to anonymous chat:", currentChatId);
                const response = await apiRequest(`/chats/${currentChatId}/messages/`, 'POST', { content }, false); // requireAuth = false
                 showTypingIndicator(false); // Скрыть индикатор после получения ответа

                if (response && response.assistant_message) {
                    addMessageToChatbox(response.assistant_message, false);
                } else {
                    // Если бэкенд не вернул сообщение ассистента сразу
                    console.warn("No assistant message in response to first anonymous message.");
                }

            } catch (error) {
                showChatError(`Не удалось начать диалог: ${error.message}`);
                showTypingIndicator(false);
                // НЕ сбрасываем currentChatId здесь, если чат УЖЕ создан, но отправка не удалась.
                // Если ОШИБКА СОЗДАНИЯ чата - currentChatId останется null.
                if (!currentChatId) {
                    setupInitialAnonymousUI(); // Вернуть начальный вид, если даже чат не создался
                } else {
                     // Если чат создан, но отправка упала, UI уже переключен.
                     // Просто показываем ошибку. Пользователь может попробовать еще раз.
                     // Можно добавить сообщение об ошибке прямо в чат
                     addMessageToChatbox({ content: `Ошибка отправки: ${error.message}`, timestamp: new Date().toISOString() }, false);
                }
            } finally {
                isSendingMessage = false;
                updateSendButtonState();
                messageInput.focus();
            }
            return; // Завершаем выполнение функции здесь для первого анонимного сообщения
        }
        // --- Конец логики для первого анонимного сообщения ---

        // --- Логика для авторизованных пользователей ИЛИ последующих анонимных сообщений ---
        if (!currentChatId) {
            showChatError("Пожалуйста, выберите или создайте чат."); // Для авторизованных
            return;
        }

        isSendingMessage = true;
        updateSendButtonState();
        addMessageToChatbox(userMessage, true); // Показываем сообщение пользователя сразу
        messageInput.value = '';
        adjustTextareaHeight();
        showTypingIndicator(true); // Показываем индикатор

        try {
            // Отправляем сообщение, requireAuth зависит от наличия токена
            const response = await apiRequest(`/chats/${currentChatId}/messages/`, 'POST', { content }, !!authToken);
            showTypingIndicator(false); // Скрываем индикатор после ответа

            if (response && response.assistant_message) {
                addMessageToChatbox(response.assistant_message, false);
            } else {
                 console.warn("No assistant message in response.");
                 // Можно добавить плейсхолдер или сообщение об отсутствии ответа
                 // addMessageToChatbox({ content: "[Нет ответа от ассистента]", timestamp: new Date().toISOString() }, false);
            }
        } catch (error) {
            showTypingIndicator(false);
            // Ошибка уже показана через showChatError в apiRequest (если это не ошибка сессии)
             // Добавляем сообщение об ошибке в чат для наглядности
             if (!error.message.includes("Сессия истекла")) {
                addMessageToChatbox({ content: `Ошибка отправки: ${error.message}`, timestamp: new Date().toISOString() }, false);
             }
        } finally {
            isSendingMessage = false;
            updateSendButtonState();
            messageInput.focus();
        }
    }


    // Обновлено состояние кнопки/инпута
    function updateSendButtonState() {
        const hasContent = messageInput.value.trim().length > 0;
        const canInteract = !isSendingMessage && !isLoadingApi && !isLoadingMessages;

        let isDisabled = !canInteract || !hasContent;
        let placeholder = "Введите сообщение...";
        let isInputDisabled = !canInteract;

        if (authToken) {
            // Авторизованный пользователь
            if (!currentChatId) {
                isDisabled = true; // Нельзя отправить без чата
                isInputDisabled = true; // Нельзя вводить без чата
                placeholder = "Выберите или создайте чат";
            }
            // Иначе (есть чат): isDisabled и isInputDisabled зависят только от canInteract и hasContent
        } else {
            // Анонимный пользователь
            if (isInitialAnonymousView) {
                placeholder = "Начните диалог...";
                // Можно отправлять, если есть контент и нет загрузки
                isDisabled = !canInteract || !hasContent;
                isInputDisabled = !canInteract;
            } else if (!currentChatId) {
                 // Состояние после ошибки создания анонимного чата?
                 placeholder = "Ошибка. Обновите страницу.";
                 isDisabled = true;
                 isInputDisabled = true;
            }
            // Иначе (анонимный чат создан и активен): isDisabled и isInputDisabled зависят от canInteract и hasContent
        }

        sendButton.disabled = isDisabled;
        messageInput.disabled = isInputDisabled;
        messageInput.placeholder = placeholder;

        // Если инпут выключен, но по причине отсутствия контента - не блокируем сам инпут
        if (messageInput.disabled && !hasContent && canInteract && (currentChatId || !authToken)) {
             messageInput.disabled = false;
        }
    }

    // Создание нового чата (Только для авторизованных)
    async function handleNewChat() {
        if (isLoadingApi || !authToken) return; // Не даем создавать чат неавторизованным через кнопку
        chatListPlaceholder.textContent = "Создание чата...";
        chatListPlaceholder.classList.remove('hidden');
        chatListUl.prepend(chatListPlaceholder); // Показываем индикатор в списке

        try {
            // is_anonymous: false - чат для авторизованного пользователя
            const newChat = await apiRequest('/chats/', 'POST', { is_anonymous: false }, true); // requireAuth = true
            // Добавляем пустой массив messages, если API его не возвращает при создании
            const chatToAdd = { ...newChat, messages: [] };
            userChats.unshift(chatToAdd);
            renderChatList(); // Перерисовать список
            handleSelectChat(newChat.id); // Сразу выбрать новый чат
            closeMobileSidebar(); // Закрыть сайдбар на мобилке
        } catch (error) {
            // Ошибка показана в apiRequest/showChatError
            // showChatError(`Не удалось создать чат: ${error.message}`);
            if (userChats.length === 0) {
                chatListPlaceholder.textContent = "Ошибка создания чата.";
                chatListPlaceholder.classList.remove('hidden');
            } else {
                chatListPlaceholder.classList.add('hidden'); // Скрыть индикатор, если есть другие чаты
            }
            renderChatList(); // Обновить список, убрав плейсхолдер, если нужно
        }
    }


    // Выбор чата (Только для авторизованных)
    async function handleSelectChat(chatId) {
         if (chatId === currentChatId || isLoadingMessages || !authToken) return;
         await loadChatHistory(chatId); // Загрузит историю
    }


    // Удаление чата (Только для авторизованных)
    async function handleDeleteChat(chatIdToDelete) {
        if (!chatIdToDelete || isLoadingApi || !authToken) return;
        if (!confirm("Вы уверены, что хотите удалить этот чат? Это действие необратимо.")) {
            return;
        }

        const chatItemElement = chatListUl.querySelector(`.chat-item[data-chat-id="${chatIdToDelete}"]`);
        if (chatItemElement) chatItemElement.style.opacity = '0.5'; // Визуальный индикатор

        try {
            await apiRequest(`/chats/${chatIdToDelete}`, 'DELETE', null, true); // requireAuth = true
            userChats = userChats.filter(chat => chat.id !== chatIdToDelete); // Удаляем из локального кеша
            renderChatList(); // Перерисовываем список

            // Если удалили активный чат
            if (currentChatId === chatIdToDelete) {
                currentChatId = null;
                clearChatbox(); // Очистить окно сообщений
                chatbox.innerHTML = '<div class="placeholder-message">Выберите или создайте чат.</div>';
                // Автоматически выбрать первый чат, если он остался
                if (userChats.length > 0) {
                    handleSelectChat(userChats[0].id);
                } else {
                     // Плейсхолдер уже показан в renderChatList
                }
            }
            console.log(`Chat ${chatIdToDelete} deleted successfully.`);
        } catch (error) {
            // Ошибка показана в apiRequest/showChatError
            if (chatItemElement) chatItemElement.style.opacity = '1'; // Восстанавливаем видимость при ошибке
        } finally {
             updateSendButtonState(); // Обновляем состояние кнопок
        }
    }


    // --- Логика Аутентификации ---
    async function handleLogin(email, password) {
         try {
            const data = await apiRequest('/login', 'POST', { email, password }, false); // requireAuth = false
            authToken = data.access_token;
            // Пробуем извлечь email из токена (может быть не email, зависит от JWT)
            try {
                 const payload = JSON.parse(atob(authToken.split('.')[1]));
                 userEmail = payload.email || payload.sub || 'Пользователь'; // Используем email или sub
            } catch (e) {
                console.error("Token decode failed", e);
                userEmail = 'Пользователь';
            }

            localStorage.setItem('authToken', authToken);
            localStorage.setItem('userEmail', userEmail);
            authSection.classList.remove('visible'); // Закрыть модалку
            currentChatId = null; // Сбрасываем ID анонимного чата, если он был
            isInitialAnonymousView = false; // Выходим из начального анонимного вида
            updateAuthUI(); // Обновить кнопки, показать сайдбар
            await loadUserChats(); // Загрузить чаты пользователя
         } catch (error) {
            // Ошибка уже показана в модалке через showAuthError
            console.error("Login failed:", error);
         }
     }
     async function handleRegister(email, password) {
         try {
             // Регистрируем, не требуя аутентификации
             await apiRequest('/register', 'POST', { email, password }, false); // requireAuth = false
             alert("Регистрация прошла успешно! Пожалуйста, войдите.");
             switchAuthMode(true); // Переключить на форму входа
             emailInput.value = email; // Подставить email
             passwordInput.value = '';
             passwordInput.focus();
         } catch (error) {
              // Ошибка уже показана в модалке через showAuthError
             console.error("Registration failed:", error);
         }
      }
     function handleLogout() {
          // Очищаем все пользовательские данные
          authToken = null; userEmail = null; currentChatId = null; userChats = [];
          localStorage.removeItem('authToken'); localStorage.removeItem('userEmail');

          updateAuthUI(); // Обновить кнопки, скрыть сайдбар
          // renderChatList() вызовется из updateAuthUI -> initializeAppUI
          // clearChatbox() вызовется из updateAuthUI -> initializeAppUI
    }

    // Переключение режима в модалке (Вход/Регистрация)
     function switchAuthMode(toLogin) {
          isLoginMode = toLogin;
          authTitle.textContent = isLoginMode ? 'Вход' : 'Регистрация';
          authSubmitButton.textContent = isLoginMode ? 'Войти' : 'Зарегистрироваться';
          switchAuthModeButton.textContent = isLoginMode ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти';
          hideErrors(); // Скрыть предыдущие ошибки
          authForm.reset(); // Очистить поля формы
          if (isLoginMode) emailInput.focus(); else emailInput.focus();
      }

    // --- Загрузка начального состояния ---
    async function loadUserChats() {
           if (!authToken) { // Не грузить, если не авторизован
               renderChatList(); // Просто покажет "Войдите..."
               return;
           }
           chatListPlaceholder.textContent = "Загрузка чатов...";
           chatListPlaceholder.classList.remove('hidden');
           chatListUl.innerHTML = ''; // Очистить список перед загрузкой

           try {
               const chats = await apiRequest('/chats/', 'GET', null, true); // requireAuth = true
               // Убедимся, что chats это массив
               userChats = Array.isArray(chats) ? chats : [];
               renderChatList(); // Отобразить загруженные чаты

               // Если нет активного чата И есть загруженные чаты -> выбрать первый
               if (!currentChatId && userChats.length > 0) {
                   handleSelectChat(userChats[0].id);
               }
               // Если активный чат был (например, остался с прошлой сессии, но не был загружен)
               else if (currentChatId && !userChats.some(c => c.id === currentChatId)) {
                   currentChatId = null; // Сбросить ID, если его нет в списке
                   if (userChats.length > 0) {
                       handleSelectChat(userChats[0].id); // Выбрать первый
                   } else {
                        clearChatbox(); // Очистить чат, если чатов нет
                        chatbox.innerHTML = '<div class="placeholder-message">Чатов не найдено. Создайте новый!</div>';
                   }
               }
                // Если currentChatId валиден и есть в списке, loadChatHistory был вызван ранее или вызовется сейчас
                else if (currentChatId) {
                    // Возможно, стоит принудительно перезагрузить историю активного чата?
                    // await loadChatHistory(currentChatId); // Спорно, может быть излишне
                    setActiveChatItem(currentChatId); // Просто подсветить активный
                }
                // Если чатов 0, renderChatList уже показал сообщение
                 else if (userChats.length === 0) {
                     clearChatbox();
                     chatbox.innerHTML = '<div class="placeholder-message">Создайте свой первый чат, нажав "+" слева.</div>';
                 }

           } catch (error) {
                // Ошибка уже показана в showChatError (если не сессия)
                // renderChatList(); // Показать сообщение об ошибке в списке
                chatListPlaceholder.textContent = "Ошибка загрузки чатов.";
                chatListPlaceholder.classList.remove('hidden');
           } finally {
                updateSendButtonState(); // Обновить кнопки
           }
       }

    // --- Мобильный сайдбар ---
     function openMobileSidebar() {
        // Открываем только если авторизован
        if (!isSidebarVisibleMobile && authToken) {
            chatListSidebar.classList.remove('hidden'); // Убираем hidden ДО анимации
            requestAnimationFrame(() => { // Даем браузеру обработать удаление hidden
                chatListSidebar.classList.add('visible');
                mobileOverlay.classList.add('visible');
            });
            isSidebarVisibleMobile = true;
        }
    }
    function closeMobileSidebar() {
         if (isSidebarVisibleMobile) {
            chatListSidebar.classList.remove('visible');
             mobileOverlay.classList.remove('visible');
             isSidebarVisibleMobile = false;
             // Добавляем hidden с задержкой, чтобы анимация успела пройти
             // Условие window.innerWidth <= 768 здесь излишне, т.к. visible/hidden класс управляет им
             chatListSidebar.addEventListener('transitionend', () => {
                 // Добавляем hidden только если сайдбар все еще должен быть скрыт
                 if (!isSidebarVisibleMobile) {
                    chatListSidebar.classList.add('hidden');
                 }
             }, { once: true }); // Обработчик сработает один раз
         }
    }


    // --- Авто-ресайз Textarea ---
    function adjustTextareaHeight() {
        const MAX_HEIGHT_PX = 120; // Максимальная высота в пикселях
        messageInput.style.height = 'auto'; // Сброс высоты для пересчета scrollHeight
        // Добавляем 2px буфер, чтобы избежать ненужного скроллбара при точном совпадении
        const scrollHeight = messageInput.scrollHeight + 2;
        const newHeight = Math.min(scrollHeight, MAX_HEIGHT_PX);

        messageInput.style.height = newHeight + 'px';
        // Показываем скролл только если контент превышает максимальную высоту
        messageInput.style.overflowY = scrollHeight > MAX_HEIGHT_PX ? 'auto' : 'hidden';
    }


    // --- Инициализация и обработчики событий ---
     messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const content = messageInput.value.trim();
        if (content) {
            sendMessage(content);
        }
        // Нет необходимости проверять currentChatId/authToken здесь, т.к. sendMessage сам разберется
    });
    messageInput.addEventListener('input', () => {
        adjustTextareaHeight();
        updateSendButtonState(); // Обновлять состояние кнопки при вводе
    });
    messageInput.addEventListener('keydown', (e) => {
        // Отправка по Enter, если не зажат Shift
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Предотвратить перенос строки
            if (!sendButton.disabled) {
                 messageForm.requestSubmit(); // Вызвать submit формы
            }
        }
    });

    // Кнопки аутентификации
    authButton.addEventListener('click', () => {
        authSection.classList.add('visible');
        switchAuthMode(true); // По умолчанию форма входа
        hideErrors();
        emailInput.focus(); // Фокус на email при открытии
    });
    logoutButton.addEventListener('click', handleLogout);
    cancelAuthButton.addEventListener('click', () => { authSection.classList.remove('visible'); });
    switchAuthModeButton.addEventListener('click', () => switchAuthMode(!isLoginMode));
    authForm.addEventListener('submit', (e) => {
         e.preventDefault();
         const email = emailInput.value.trim();
         const password = passwordInput.value;
         if (!email || !password) {
             showAuthError("Необходимо ввести email и пароль.");
             return;
         }
         hideErrors(); // Скрыть предыдущую ошибку перед отправкой
         if (isLoginMode) handleLogin(email, password);
         else handleRegister(email, password);
     });

     // Кнопки управления чатами (только для авторизованных)
    newChatButton.addEventListener('click', handleNewChat);

    // Мобильный сайдбар
    mobileSidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation(); // Предотвратить закрытие по клику на оверлей
        if (isSidebarVisibleMobile) closeMobileSidebar();
        else openMobileSidebar();
    });
    mobileOverlay.addEventListener('click', closeMobileSidebar);


    // --- Начальная настройка UI приложения ---
    function initializeAppUI() {
        console.log("Initializing App UI, authToken:", !!authToken);
        if (authToken) {
            // Авторизованный пользователь
            console.log("Auth user flow");
            initialAnonymousStateContainer.classList.add('hidden'); // Скрыть анонимный блок
             // Убедиться, что форма в правильном месте
             if (!messageFormContainer.contains(messageForm)) {
                  messageFormContainer.appendChild(messageForm);
             }
            messageFormContainer.classList.remove('hidden'); // Показать стандартный контейнер формы
            chatbox.classList.remove('hidden'); // Показать чатбокс

            if (userChats.length === 0 && !isLoadingApi) { // Если чаты еще не загружены, loadUserChats покажет плейсхолдер
                 clearChatbox(); // Очистить от старого
                 chatbox.innerHTML = '<div class="placeholder-message">Загрузка чатов...</div>'; // Начальный плейсхолдер
            } else if (!currentChatId && userChats.length > 0) {
                 clearChatbox();
                 chatbox.innerHTML = '<div class="placeholder-message">Выберите чат из списка слева.</div>';
            } else if (!currentChatId && userChats.length === 0) {
                 clearChatbox();
                 chatbox.innerHTML = '<div class="placeholder-message">Создайте свой первый чат, нажав "+" слева.</div>';
            }
            // Если currentChatId есть, история загрузится или уже загружена
            renderChatList(); // Отобразить список чатов
        } else {
            // Анонимный пользователь
            console.log("Anonymous user flow");
            chatListSidebar.classList.add('hidden'); // Скрыть сайдбар
            mobileSidebarToggle.style.display = 'none'; // Скрыть бургер
             userChats = []; // Очистить список чатов
             currentChatId = null; // Сбросить ID
             setupInitialAnonymousUI(); // Показать начальный анонимный UI
             renderChatList(); // Покажет "Войдите..." (хотя сайдбар скрыт)
        }
        adjustTextareaHeight(); // Настроить высоту textarea
        updateSendButtonState(); // Настроить состояние кнопки отправки
    }


    // --- Полная инициализация приложения ---
    function initializeApp() {
        console.log("initializeApp called");
        updateAuthUI(); // Сначала обновить кнопки/email/видимость сайдбара на основе токена
        // initializeAppUI() вызовется из updateAuthUI
        // loadUserChats() вызовется из handleLogin или initializeAppUI (если уже был токен)
    }

    // Запускаем приложение
    initializeApp();

});