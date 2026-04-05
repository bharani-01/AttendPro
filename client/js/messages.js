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
            avatarEl.textContent = user.name.charAt(0).toUpperCase();
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
    const chatWithStatus = document.getElementById('chatWithStatus');
    const chatHeaderAvatar = document.getElementById('chatHeaderAvatar');
    const chatUserProfileModal = document.getElementById('chatUserProfileModal');
    const closeChatUserProfileModal = document.getElementById('closeChatUserProfileModal');
    const chatUserProfileBody = document.getElementById('chatUserProfileBody');
    const chatMessageSearchInput = document.getElementById('chat-message-search');
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
    const newMessageFab = document.getElementById('new-message-fab');
    const replyPreview = document.getElementById('reply-preview');
    const replyPreviewLabel = document.getElementById('reply-preview-label');
    const replyPreviewContent = document.getElementById('reply-preview-content');
    const cancelReplyBtn = document.getElementById('cancel-reply-btn');
    const emojiPickerBtn = document.getElementById('emoji-picker-btn');
    const emojiPickerPanel = document.getElementById('emoji-picker-panel');
    const emojiPickerGrid = document.getElementById('emoji-picker-grid');

    let currentConversationId = null;
    let currentChatParticipantId = null;
    let conversations = [];
    let allMessagableUsers = [];
    let socket = null;
    let activeReplyMessage = null;
    const emojiChoices = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤝','👍','🙏','👏','🙌','🎉','🔥','✅','💯','🤔','🙂','😅','😉','😭','😴','😇','🥳','😡','🤯','🤗','🫡','📚','📝','💡'];
    const DRAFT_KEY_PREFIX = 'messages.draft';

    function draftStorageKey(conversationId) {
        return `${DRAFT_KEY_PREFIX}.${conversationId}`;
    }

    function saveDraft(conversationId, text) {
        if (!conversationId) return;
        if (!text || !text.trim()) {
            localStorage.removeItem(draftStorageKey(conversationId));
            return;
        }
        localStorage.setItem(draftStorageKey(conversationId), text);
    }

    function loadDraft(conversationId) {
        if (!conversationId) return '';
        return localStorage.getItem(draftStorageKey(conversationId)) || '';
    }

    function autoResizeMessageInput() {
        messageText.style.height = 'auto';
        const nextHeight = Math.min(messageText.scrollHeight, 120);
        messageText.style.height = `${Math.max(nextHeight, 44)}px`;
    }

    function insertEmoji(emoji) {
        const start = messageText.selectionStart ?? messageText.value.length;
        const end = messageText.selectionEnd ?? messageText.value.length;
        const before = messageText.value.slice(0, start);
        const after = messageText.value.slice(end);
        messageText.value = `${before}${emoji}${after}`;
        const nextPos = start + emoji.length;
        messageText.selectionStart = nextPos;
        messageText.selectionEnd = nextPos;
        messageText.focus();
        autoResizeMessageInput();
        saveDraft(currentConversationId, messageText.value);
    }

    function renderEmojiPicker() {
        if (!emojiPickerGrid) return;
        emojiPickerGrid.innerHTML = emojiChoices
            .map((emoji) => `<button class="emoji-picker-item" type="button" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`)
            .join('');

        emojiPickerGrid.querySelectorAll('.emoji-picker-item').forEach((btn) => {
            btn.addEventListener('click', () => {
                const emoji = btn.getAttribute('data-emoji') || '';
                if (!emoji) return;
                insertEmoji(emoji);
                emojiPickerPanel?.classList.add('hidden');
            });
        });
    }

    function formatConversationTime(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function scrollMessagesToBottom() {
        if (!messageList) return;
        // Double frame ensures layout is settled before forcing bottom alignment.
        requestAnimationFrame(() => {
            messageList.scrollTop = messageList.scrollHeight;
            requestAnimationFrame(() => {
                messageList.scrollTop = messageList.scrollHeight;
            });
        });
    }

    function keepActiveConversationVisible() {
        const activeConvo = conversationItems.querySelector('.conversation-item.active');
        if (activeConvo) {
            activeConvo.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }

    function getOtherParticipantFromConversation(conversationId) {
        const convo = conversations.find((item) => String(item._id) === String(conversationId));
        if (!convo || !Array.isArray(convo.participants)) return null;
        return convo.participants.find((p) => String(p._id) !== String(user._id)) || null;
    }

    function setChatPresence(conversationId) {
        if (!chatWithStatus) return;
        const otherParticipant = getOtherParticipantFromConversation(conversationId);
        if (!otherParticipant) {
            chatWithStatus.textContent = 'Offline';
            return;
        }
        chatWithStatus.textContent = otherParticipant.isOnline ? 'Online' : 'Offline';
    }

    function valueOrDash(value) {
        if (value === undefined || value === null) return '&mdash;';
        const text = String(value).trim();
        return text ? escapeHtml(text) : '&mdash;';
    }

    function renderProfileField(label, value) {
        return `
            <div class="chat-user-profile-item">
                <span class="chat-user-profile-item-label">${escapeHtml(label)}</span>
                <span class="chat-user-profile-item-value">${valueOrDash(value)}</span>
            </div>
        `;
    }

    function formatDob(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString();
    }

    function getParentPhonesDisplay(profile) {
        if (Array.isArray(profile?.parentPhones) && profile.parentPhones.length > 0) {
            return profile.parentPhones.join(', ');
        }
        return profile?.parentPhone || '';
    }

    function renderStudentProfilePage(profile) {
        const assignedClass = profile?.assignedClass
            ? [profile.assignedClass.className, profile.assignedClass.department, profile.assignedClass.section].filter(Boolean).join(' / ')
            : '';

        return `
            <div class="chat-user-profile-card">
                <div class="chat-user-profile-heading">
                    <h3 class="chat-user-profile-name">${escapeHtml(profile?.name || 'Student')}</h3>
                    <span class="chat-user-profile-badge">Student</span>
                </div>
                <div class="chat-user-profile-grid">
                    ${renderProfileField('Status', profile?.isOnline ? 'Online' : 'Offline')}
                    ${renderProfileField('Student ID', profile?.uniqueId)}
                    ${renderProfileField('Email', profile?.email)}
                    ${renderProfileField('Phone', profile?.phone)}
                    ${renderProfileField('Department', profile?.department)}
                    ${renderProfileField('Batch / Year', [profile?.batch, profile?.year].filter(Boolean).join(' / '))}
                    ${renderProfileField('Date of Birth', formatDob(profile?.dob))}
                    ${renderProfileField('Class', assignedClass)}
                    ${renderProfileField('Parent Email', profile?.parentEmail)}
                    ${renderProfileField('Parent Numbers', getParentPhonesDisplay(profile))}
                </div>
            </div>
        `;
    }

    function renderFacultyProfilePage(profile) {
        const assignedClass = profile?.assignedClass
            ? [profile.assignedClass.className, profile.assignedClass.department, profile.assignedClass.section].filter(Boolean).join(' / ')
            : '';
        const subjects = Array.isArray(profile?.assignedSubjects)
            ? profile.assignedSubjects.map((s) => `${s.subjectName || 'Unknown'} (${s.subjectCode || '-'})`).join(', ')
            : '';

        return `
            <div class="chat-user-profile-card">
                <div class="chat-user-profile-heading">
                    <h3 class="chat-user-profile-name">${escapeHtml(profile?.name || 'Faculty')}</h3>
                    <span class="chat-user-profile-badge">Faculty</span>
                </div>
                <div class="chat-user-profile-grid">
                    ${renderProfileField('Status', profile?.isOnline ? 'Online' : 'Offline')}
                    ${renderProfileField('Faculty ID', profile?.uniqueId)}
                    ${renderProfileField('Email', profile?.email)}
                    ${renderProfileField('Phone', profile?.phone)}
                    ${renderProfileField('Department', profile?.department)}
                    ${renderProfileField('Batch / Year', [profile?.batch, profile?.year].filter(Boolean).join(' / '))}
                    ${renderProfileField('Date of Birth', formatDob(profile?.dob))}
                    ${renderProfileField('Assigned Class', assignedClass)}
                    ${renderProfileField('Assigned Subjects', subjects)}
                    ${renderProfileField('Parent Email', profile?.parentEmail)}
                    ${renderProfileField('Parent Numbers', getParentPhonesDisplay(profile))}
                </div>
            </div>
        `;
    }

    function renderAdminProfilePage(profile) {
        return `
            <div class="chat-user-profile-card">
                <div class="chat-user-profile-heading">
                    <h3 class="chat-user-profile-name">${escapeHtml(profile?.name || 'Admin')}</h3>
                    <span class="chat-user-profile-badge">Admin</span>
                </div>
                <div class="chat-user-profile-grid">
                    ${renderProfileField('Status', profile?.isOnline ? 'Online' : 'Offline')}
                    ${renderProfileField('Admin ID', profile?.uniqueId)}
                    ${renderProfileField('Email', profile?.email)}
                    ${renderProfileField('Phone', profile?.phone)}
                    ${renderProfileField('Department', profile?.department)}
                    ${renderProfileField('Batch / Year', [profile?.batch, profile?.year].filter(Boolean).join(' / '))}
                    ${renderProfileField('Date of Birth', formatDob(profile?.dob))}
                </div>
            </div>
        `;
    }

    function renderChatUserProfile(profile) {
        const role = String(profile?.role || '').toLowerCase();
        if (role === 'student') {
            chatUserProfileBody.innerHTML = renderStudentProfilePage(profile);
            return;
        }
        if (role === 'faculty') {
            chatUserProfileBody.innerHTML = renderFacultyProfilePage(profile);
            return;
        }
        chatUserProfileBody.innerHTML = renderAdminProfilePage(profile);
    }

    async function openChatUserProfile() {
        if (!currentConversationId || !currentChatParticipantId || !chatUserProfileModal || !chatUserProfileBody) {
            return;
        }

        chatUserProfileBody.innerHTML = '<p>Loading profile...</p>';
        chatUserProfileModal.style.display = 'block';

        try {
            const response = await api.get(`/messages/users/${encodeURIComponent(currentChatParticipantId)}/profile`);
            renderChatUserProfile(response.profile || {});
        } catch (error) {
            console.error('Failed to load chat user profile:', error);
            chatUserProfileBody.innerHTML = '<p>Could not load user profile.</p>';
        }
    }

    function updatePresenceInConversations(userId, isOnline) {
        if (!userId) return;

        conversations = conversations.map((convo) => ({
            ...convo,
            participants: (convo.participants || []).map((participant) => {
                if (String(participant._id) !== String(userId)) {
                    return participant;
                }
                return {
                    ...participant,
                    isOnline: Boolean(isOnline)
                };
            })
        }));

        if (currentConversationId) {
            setChatPresence(currentConversationId);
        }
    }

    chatWithName?.addEventListener('click', openChatUserProfile);
    chatHeaderAvatar?.addEventListener('click', openChatUserProfile);
    closeChatUserProfileModal?.addEventListener('click', () => {
        if (chatUserProfileModal) {
            chatUserProfileModal.style.display = 'none';
        }
    });

    window.addEventListener('click', (event) => {
        if (event.target === chatUserProfileModal) {
            chatUserProfileModal.style.display = 'none';
        }
    });

    if (newMessageFab) {
        newMessageFab.style.display = user.role === 'student' ? '' : 'none';
        newMessageFab.addEventListener('click', () => {
            newMessageBtn.click();
        });
    }

    function getSenderId(msg) {
        if (msg && msg.sender && typeof msg.sender === 'object') {
            return msg.sender._id;
        }
        return msg?.sender;
    }

    function getTickMarkup(isRead) {
        return `<span class="message-ticks ${isRead ? 'read' : 'sent'}">${isRead ? '✓✓' : '✓'}</span>`;
    }

    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getMessageId(msg) {
        return msg?._id || msg?.id || null;
    }

    function setReplyTarget(msg) {
        if (!msg) {
            activeReplyMessage = null;
            replyPreview.classList.add('hidden');
            replyPreviewLabel.textContent = 'Replying';
            replyPreviewContent.textContent = '';
            return;
        }

        const senderName = getSenderId(msg) === user._id ? 'yourself' : (msg.sender?.name || 'this user');
        activeReplyMessage = msg;
        replyPreviewLabel.textContent = `Replying to ${senderName}`;
        replyPreviewContent.textContent = (msg.content || '').trim().slice(0, 140);
        replyPreview.classList.remove('hidden');
        messageText.focus();
    }

    cancelReplyBtn.addEventListener('click', () => setReplyTarget(null));

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

        const isOwnMessage = (payload) => {
            const senderId =
                payload?.message?.sender?._id ||
                payload?.message?.sender ||
                payload?.sender?._id ||
                payload?.sender ||
                '';
            return String(senderId) === String(user._id);
        };

        socket.on('message:new', async (payload) => {
            const conversationId = payload?.conversationId;
            if (!conversationId) return;

            // Avoid reloading current chat when this client just sent the message.
            if (isOwnMessage(payload)) {
                return;
            }

            if (currentConversationId === conversationId) {
                await openConversation(
                    currentConversationId,
                    chatWithName.textContent || 'Chat',
                    { silent: true }
                );
            } else {
                await loadConversations();
            }
        });

        socket.on('message:read', async (payload) => {
            const conversationId = payload?.conversationId;
            if (!conversationId) return;

            if (currentConversationId === conversationId) {
                await openConversation(
                    currentConversationId,
                    chatWithName.textContent || 'Chat',
                    { silent: true }
                );
            } else {
                await loadConversations();
            }
        });

        socket.on('user:presence', (payload) => {
            const userId = payload?.userId;
            if (!userId || String(userId) === String(user._id)) return;
            updatePresenceInConversations(userId, payload?.isOnline === true);
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
            const otherParticipant = convo.participants.find(p => String(p._id) !== String(user._id));
            if (!otherParticipant) return;

            const convoEl = document.createElement('div');
            convoEl.className = 'conversation-item';
            convoEl.dataset.conversationId = convo._id;
            if (String(currentConversationId) === String(convo._id)) {
                convoEl.classList.add('active');
            }

            let lastMessage = 'No messages yet.';
            let lastMessageAt = '';
            if (convo.lastMessage) {
                const sender = convo.lastMessage.sender._id === user._id ? 'You: ' : '';
                lastMessage = sender + convo.lastMessage.content;
                lastMessageAt = formatConversationTime(convo.lastMessage.createdAt);
            }

            const safeParticipantName = escapeHtml(otherParticipant.name || 'Unknown');
            const safeLastMessage = escapeHtml(lastMessage.substring(0, 30));
            const avatarInitial = escapeHtml((otherParticipant.name || 'U').charAt(0).toUpperCase());

            convoEl.innerHTML = `
                <div class="convo-avatar">${avatarInitial}</div>
                <div class="convo-details">
                    <div class="convo-top-row">
                        <p class="convo-name">${safeParticipantName}</p>
                        <span class="convo-time">${escapeHtml(lastMessageAt)}</span>
                    </div>
                    <p class="convo-last-message">${safeLastMessage}${lastMessage.length > 30 ? '...' : ''}</p>
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
        let options = {};
        if (arguments.length >= 3 && typeof arguments[2] === 'object') {
            options = arguments[2] || {};
        }
        const silent = options.silent === true;

        currentConversationId = conversationId;
        setReplyTarget(null);
        const participant = getOtherParticipantFromConversation(conversationId);
        currentChatParticipantId = participant?._id ? String(participant._id) : null;
        chatWithName.textContent = participantName;
        setChatPresence(conversationId);
        if (chatHeaderAvatar) {
            chatHeaderAvatar.textContent = (participantName || 'U').charAt(0).toUpperCase();
        }
        chatPlaceholder.classList.add('hidden');
        chatArea.classList.remove('hidden');
        if (!silent) {
            messageList.innerHTML = '<p>Loading messages...</p>';
        }

        try {
            const response = await api.get(`/messages/conversations/${conversationId}`);
            renderMessages(response.messages);
            // Refresh unread counts and the full list
            const convResponse = await api.get('/messages/conversations');
            conversations = convResponse.conversations;
            renderConversations(conversations);
            setChatPresence(conversationId);

            const draft = loadDraft(conversationId);
            messageText.value = draft;
            autoResizeMessageInput();
            scrollMessagesToBottom();
            keepActiveConversationVisible();
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
            const messageId = getMessageId(msg);
            const repliedSender = msg.replyTo?.sender?.name || 'Message';
            const repliedContent = (msg.replyTo?.content || '').trim().slice(0, 120);
            msgEl.className = `message ${isSent ? 'sent' : 'received'}`;
            if (messageId) {
                msgEl.dataset.messageId = messageId;
            }
            msgEl.innerHTML = `
                ${msg.replyTo ? `
                    <div class="reply-snippet">
                        <span class="reply-snippet-name">Reply to ${escapeHtml(repliedSender)}</span>
                        <span class="reply-snippet-text">${escapeHtml(repliedContent)}</span>
                    </div>
                ` : ''}
                <p class="message-content">${escapeHtml(msg.content)}</p>
                <div class="message-meta">
                    <span class="message-timestamp">${new Date(msg.createdAt).toLocaleTimeString()}</span>
                    ${isSent ? getTickMarkup(msg.isRead === true) : ''}
                </div>
                <button class="reply-trigger" type="button" aria-label="Reply to this message"><i class="fas fa-reply"></i></button>
            `;
            msgEl.dataset.messageText = String(msg.content || '').toLowerCase();

            const replyBtn = msgEl.querySelector('.reply-trigger');
            replyBtn?.addEventListener('click', () => setReplyTarget(msg));

            messageList.appendChild(msgEl);
        });
        scrollMessagesToBottom();
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
                content,
                replyToMessageId: activeReplyMessage?._id || null
            });
            messageText.value = '';
            autoResizeMessageInput();
            saveDraft(currentConversationId, '');
            // Optimistically add message to UI
            const msgEl = document.createElement('div');
            msgEl.className = 'message sent';
            msgEl.innerHTML = `
                ${activeReplyMessage ? `
                    <div class="reply-snippet">
                        <span class="reply-snippet-name">Reply to ${escapeHtml(activeReplyMessage.sender?.name || 'Message')}</span>
                        <span class="reply-snippet-text">${escapeHtml((activeReplyMessage.content || '').trim().slice(0, 120))}</span>
                    </div>
                ` : ''}
                <p class="message-content">${escapeHtml(content)}</p>
                <div class="message-meta">
                    <span class="message-timestamp">${new Date().toLocaleTimeString()}</span>
                    ${getTickMarkup(false)}
                </div>
                <button class="reply-trigger" type="button" aria-label="Reply to this message"><i class="fas fa-reply"></i></button>
            `;
            msgEl.querySelector('.reply-trigger')?.addEventListener('click', () => {
                setReplyTarget({
                    _id: null,
                    sender: { _id: user._id, name: user.name },
                    content,
                });
            });
            messageList.appendChild(msgEl);
            scrollMessagesToBottom();
            setReplyTarget(null);
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

    messageText.addEventListener('input', () => {
        autoResizeMessageInput();
        saveDraft(currentConversationId, messageText.value);
    });

    renderEmojiPicker();

    emojiPickerBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPickerPanel?.classList.toggle('hidden');
    });

    emojiPickerPanel?.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.addEventListener('click', () => {
        emojiPickerPanel?.classList.add('hidden');
    });

    if (chatMessageSearchInput) {
        chatMessageSearchInput.addEventListener('input', (e) => {
            const term = String(e.target.value || '').trim().toLowerCase();
            const nodes = Array.from(messageList.querySelectorAll('.message'));

            nodes.forEach((node) => {
                node.classList.remove('matched-message');
                if (!term) return;
                const haystack = String(node.dataset.messageText || '').toLowerCase();
                if (haystack.includes(term)) {
                    node.classList.add('matched-message');
                }
            });
        });
    }

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
            div.innerHTML = `<strong>${escapeHtml(u.name)}</strong> <span>(${escapeHtml(u.role)}${escapeHtml(uidDisplay)})</span>`;
            
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
    await loadConversations();
    autoResizeMessageInput();
});
