document.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    let dashFile = 'student-dashboard.html';
    if (user.role === 'admin') dashFile = 'admin-dashboard.html';
    else if (user.role === 'faculty') dashFile = 'faculty-dashboard.html';

    // Synchronize the sidebar and header with the user's specific dashboard
    try {
        const resp = await fetch(dashFile);
        const html = await resp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const sourceSidebar = doc.getElementById('sidebar');
        const targetSidebar = document.getElementById('sidebar');
        if (sourceSidebar && targetSidebar) {
            targetSidebar.innerHTML = sourceSidebar.innerHTML;

            // Fix links to navigate back to dashboard instead of hash routes
            targetSidebar.querySelectorAll('.nav-link[data-page]').forEach(link => {
                const page = link.dataset.page;
                link.classList.remove('active');
                link.href = `${dashFile}?page=${page}`;
                link.removeAttribute('data-page');
            });

            // Mark message link as active
            targetSidebar.querySelectorAll('.nav-link').forEach(link => {
                if (link.getAttribute('href') === 'messages.html') {
                    link.classList.add('active');
                }
            });

            // Re-attach logout handler
            const logoutBtn = targetSidebar.querySelector('#logoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    logout();
                });
            }
        }
        
        // Sync user role and avatar
        document.querySelector('.user-name').textContent = user.name;
        
        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl) {
            avatarEl.innerHTML = user.name.charAt(0).toUpperCase();
        }

        const roleTarget = document.querySelector('.user-info');
        if (roleTarget && !document.querySelector('.user-role')) {
            const roleSpan = document.createElement('span');
            roleSpan.className = 'user-role';
            roleSpan.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
            roleTarget.appendChild(roleSpan);
        }

    } catch (e) {
        console.error("Failed to sync layout components:", e);
    }

    const logoutBtnDropdown = document.getElementById('logoutBtnDropdown');
    if (logoutBtnDropdown) {
        logoutBtnDropdown.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    const userMenu = document.querySelector('.user-menu');
    if (userMenu) {
        userMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenu.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!userMenu.contains(e.target)) {
                userMenu.classList.remove('active');
            }
        });
    }

    const conversationItems = document.getElementById('conversation-items');
    const chatArea = document.getElementById('chat-area');
    const chatPlaceholder = document.getElementById('chat-placeholder');
    const messageList = document.getElementById('message-list');
    const chatWithName = document.getElementById('chat-with-name');
    const messageText = document.getElementById('message-text');
    const sendMessageBtn = document.getElementById('send-message-btn');
    const newMessageBtn = document.getElementById('new-message-btn');
    const newMessageModal = document.getElementById('newMessageModal');
    const closeModalBtn = newMessageModal.querySelector('.close-button');
    const userSearchInput = document.getElementById('user-search');
    const searchResults = document.getElementById('search-results');
    const selectedRecipientId = document.getElementById('selected-recipient-id');
    const selectedRecipientName = document.getElementById('selected-recipient-name');
    const startConversationBtn = document.getElementById('start-conversation-btn');
    const conversationSearchInput = document.getElementById('conversation-search');

    let currentConversationId = null;
    let conversations = [];
    let allMessagableUsers = [];
    let socket = null;

    function getSenderId(msg) {
        if (msg && msg.sender && typeof msg.sender === 'object') {
            return msg.sender._id;
        }
        return msg?.sender;
    }

    function getTickMarkup(isRead) {
        return `<span class="message-ticks ${isRead ? 'read' : 'sent'}">${isRead ? '✓✓' : '✓'}</span>`;
    }

    function connectRealtime() {
        if (typeof io !== 'function') return;

        const token = localStorage.getItem('token');
        if (!token) return;

        socket = io({
            transports: ['websocket'],
            auth: {
                token: `Bearer ${token}`
            }
        });

        socket.on('message:new', async (payload) => {
            const conversationId = payload?.conversationId;
            if (!conversationId) return;

            if (currentConversationId === conversationId) {
                await openConversation(currentConversationId, chatWithName.textContent || 'Chat');
            } else {
                await loadConversations();
            }
        });

        socket.on('message:read', async (payload) => {
            const conversationId = payload?.conversationId;
            if (!conversationId) return;

            if (currentConversationId === conversationId) {
                await openConversation(currentConversationId, chatWithName.textContent || 'Chat');
            } else {
                await loadConversations();
            }
        });
    }

    async function loadConversations() {
        try {
            const response = await api.get('/messages/conversations');
            conversations = response.conversations;
            renderConversations(conversations);
        } catch (error) {
            console.error('Failed to load conversations:', error);
            alert('Could not load conversations.');
        }
    }

    function renderConversations(convos) {
        conversationItems.innerHTML = '';
        if (convos.length === 0) {
            conversationItems.innerHTML = '<p>No matching conversations found.</p>';
            return;
        }

        convos.forEach(convo => {
            const otherParticipant = convo.participants.find(p => p._id !== user._id);
            if (!otherParticipant) return;

            const convoEl = document.createElement('div');
            convoEl.className = 'conversation-item';
            convoEl.dataset.conversationId = convo._id;

            let lastMessage = 'No messages yet.';
            if (convo.lastMessage) {
                const sender = convo.lastMessage.sender._id === user._id ? 'You: ' : '';
                lastMessage = sender + convo.lastMessage.content;
            }

            convoEl.innerHTML = `
                <div class="convo-details">
                    <p class="convo-name">${otherParticipant.name}</p>
                    <p class="convo-last-message">${lastMessage.substring(0, 30)}${lastMessage.length > 30 ? '...' : ''}</p>
                </div>
                ${convo.unreadCount > 0 ? `<span class="unread-count">${convo.unreadCount}</span>` : ''}
            `;

            convoEl.addEventListener('click', () => {
                openConversation(convo._id, otherParticipant.name);
                document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
                convoEl.classList.add('active');
            });

            conversationItems.appendChild(convoEl);
        });
    }

    async function openConversation(conversationId, participantName) {
        currentConversationId = conversationId;
        chatWithName.textContent = participantName;
        chatPlaceholder.classList.add('hidden');
        chatArea.classList.remove('hidden');
        messageList.innerHTML = '<p>Loading messages...</p>';

        try {
            const response = await api.get(`/messages/conversations/${conversationId}`);
            renderMessages(response.messages);
            // Refresh unread counts and the full list
            const convResponse = await api.get('/messages/conversations');
            conversations = convResponse.conversations;
            renderConversations(conversations);
        } catch (error) {
            console.error('Failed to load messages:', error);
            messageList.innerHTML = '<p>Could not load messages.</p>';
        }
    }

    function renderMessages(messages) {
        messageList.innerHTML = '';
        messages.forEach(msg => {
            const msgEl = document.createElement('div');
            const senderId = getSenderId(msg);
            const isSent = senderId === user._id;
            msgEl.className = `message ${isSent ? 'sent' : 'received'}`;
            msgEl.innerHTML = `
                <p class="message-content">${msg.content}</p>
                <div class="message-meta">
                    <span class="message-timestamp">${new Date(msg.createdAt).toLocaleTimeString()}</span>
                    ${isSent ? getTickMarkup(msg.isRead === true) : ''}
                </div>
            `;
            messageList.appendChild(msgEl);
        });
        messageList.scrollTop = messageList.scrollHeight;
    }

    sendMessageBtn.addEventListener('click', async () => {
        const content = messageText.value.trim();
        if (!content || !currentConversationId) return;

        const currentConvo = conversations.find(c => c._id === currentConversationId);
        const receiver = currentConvo.participants.find(p => p._id !== user._id);

        try {
            await api.post('/messages/messages', {
                conversationId: currentConversationId,
                receiverId: receiver._id,
                content
            });
            messageText.value = '';
            // Optimistically add message to UI
            const msgEl = document.createElement('div');
            msgEl.className = 'message sent';
            msgEl.innerHTML = `
                <p class="message-content">${content}</p>
                <div class="message-meta">
                    <span class="message-timestamp">${new Date().toLocaleTimeString()}</span>
                    ${getTickMarkup(false)}
                </div>
            `;
            messageList.appendChild(msgEl);
            messageList.scrollTop = messageList.scrollHeight;
        } catch (error) {
            console.error('Failed to send message:', error);
            alert('Could not send message.');
        }
    });

    messageText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessageBtn.click();
        }
    });

    // New Message Modal Logic
    newMessageBtn.addEventListener('click', async () => {
        try {
            const response = await api.get('/messages/messagable-users');
            allMessagableUsers = response.messagableUsers;
            
            // Reset UI
            userSearchInput.value = '';
            searchResults.innerHTML = '';
            searchResults.style.display = 'none';
            selectedRecipientId.value = '';
            selectedRecipientName.value = '';
            startConversationBtn.disabled = true;

            newMessageModal.style.display = 'block';
            
            // Initial render
            renderSearchResults(allMessagableUsers);
            
        } catch (error) {
            console.error('Failed to load users:', error);
            alert('Could not load users to message.');
        }
    });

    userSearchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allMessagableUsers.filter(u => 
            u.name.toLowerCase().includes(term) || 
            (u.uniqueId && u.uniqueId.toLowerCase().includes(term))
        );
        renderSearchResults(filtered);
    });

    function renderSearchResults(users) {
        searchResults.innerHTML = '';
        if (users.length === 0) {
            searchResults.innerHTML = '<div style="padding: 10px; color: #666;">No users found.</div>';
            searchResults.style.display = 'block';
            return;
        }

        searchResults.style.display = 'block';
        users.forEach(u => {
            const div = document.createElement('div');
            div.style.padding = '10px';
            div.style.borderBottom = '1px solid #eee';
            div.style.cursor = 'pointer';
            
            const uidDisplay = u.uniqueId ? ` | ID: ${u.uniqueId}` : '';
            div.innerHTML = `<strong>${u.name}</strong> <span>(${u.role}${uidDisplay})</span>`;
            
            div.addEventListener('mouseover', () => div.style.backgroundColor = '#f0f4f8');
            div.addEventListener('mouseout', () => {
                if (selectedRecipientId.value !== u._id) div.style.backgroundColor = 'transparent';
            });
            
            div.addEventListener('click', () => {
                // Remove highlight from all
                Array.from(searchResults.children).forEach(child => child.style.backgroundColor = 'transparent');
                div.style.backgroundColor = '#dbeafe'; // Highlight selected
                
                selectedRecipientId.value = u._id;
                selectedRecipientName.value = u.name;
                startConversationBtn.disabled = false;
            });
            
            // Restore highlight if it was previously selected
            if (selectedRecipientId.value === u._id) {
                div.style.backgroundColor = '#dbeafe';
            }

            searchResults.appendChild(div);
        });
    }

    closeModalBtn.addEventListener('click', () => {
        newMessageModal.style.display = 'none';
        userSearchInput.value = '';
    });

    window.addEventListener('click', (event) => {
        if (event.target == newMessageModal) {
            newMessageModal.style.display = 'none';
            userSearchInput.value = '';
        }
    });

    startConversationBtn.addEventListener('click', async () => {
        const receiverId = selectedRecipientId.value;
        if (!receiverId) {
            alert('Please select a user.');
            return;
        }

        try {
            const response = await api.post('/messages/conversations', { receiverId });
            const { conversationId } = response;

            newMessageModal.style.display = 'none';
            await loadConversations();

            const receiverName = selectedRecipientName.value;
            openConversation(conversationId, receiverName);
            
            // Highlight the new conversation
            setTimeout(() => {
                const newConvoEl = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
                if (newConvoEl) {
                    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
                    newConvoEl.classList.add('active');
                }
            }, 200);

        } catch (error) {
            console.error('Failed to start conversation:', error);
            alert(error.response?.data?.error || 'Could not start conversation.');
        }
    });

    conversationSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredConversations = conversations.filter(convo => {
            const otherParticipant = convo.participants.find(p => p._id !== user._id);
            if (!otherParticipant) return false;
            return otherParticipant.name.toLowerCase().includes(searchTerm);
        });
        renderConversations(filteredConversations);
    });

    connectRealtime();
    loadConversations();
});
