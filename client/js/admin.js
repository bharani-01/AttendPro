let currentUser = null;
let classes = [];
let subjects = [];
let users = [];
let userChart = null;
let securityTrendChart = null;
let subjectChart = null;
let timetableEntries = [];
let timetableFaculty = [];
let managedDepartments = [];
let securityTrendChartLoadTimer = null;
let adminSettingsHandlersBound = false;
const DEFAULT_EMAIL_TRIGGER_SETTINGS = {
    leaveApproved: true,
    leaveRejected: true,
    attendanceAbsent: true,
    lowAttendanceAuto: true,
    passwordReset: true,
    adminPasswordReset: true,
    customTemplated: true
};
const DEFAULT_EMAIL_CUSTOMIZATION = {
    timezone: 'Asia/Kolkata',
    quietHours: {
        enabled: false,
        start: '22:00',
        end: '07:00'
    },
    retryPolicy: {
        enabled: false,
        maxRetries: 2
    }
};
const DEFAULT_ATTENDANCE_RULES = {
    globalLowAttendanceThreshold: 75
};
const DEFAULT_COMMUNICATION_RULES = {
    approvalWorkflowEnabled: false,
    defaultVisibilityDays: 7,
    autoDeleteAfterDays: 90,
    applyToAnnouncements: true,
    applyToDirectMessages: true
};
let emailTemplateState = {
    templates: [],
    overrides: {},
    selectedTemplateKey: ''
};
const ADMIN_LIST_PAGE_SIZE = 100;
const usersListState = { page: 1, hasMore: false, loading: false, items: [] };
const studentsListState = { page: 1, hasMore: false, loading: false, items: [] };
const facultyListState = { page: 1, hasMore: false, loading: false, items: [] };
const classesListState = { page: 1, hasMore: false, loading: false, items: [] };
const classStudentsModalState = {
    classId: null,
    assigned: { page: 1, hasMore: false, items: [], loading: false, search: '' },
    available: { page: 1, hasMore: false, items: [], loading: false, search: '' }
};
const classSubjectsModalState = {
    classId: null,
    assigned: { page: 1, hasMore: false, items: [], loading: false, search: '' },
    available: { page: 1, hasMore: false, items: [], loading: false, search: '' }
};
const facultySubjectsModalState = {
    userId: null,
    assignedAll: [],
    assigned: { page: 1, hasMore: false, items: [], loading: false, search: '' },
    available: { page: 1, hasMore: false, items: [], loading: false, search: '' }
};
const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_PERIODS_PER_DAY = 7;
const TIMETABLE_COLUMNS = [
    { type: 'period', period: 1, title: 'I', time: '08:05 AM - 08:55 AM' },
    { type: 'period', period: 2, title: 'II', time: '09:00 AM - 09:50 AM' },
    { type: 'break', label: 'BREAK' },
    { type: 'period', period: 3, title: 'III', time: '10:10 AM - 11:05 AM' },
    { type: 'period', period: 4, title: 'IV', time: '11:05 AM - 12:00 Noon' },
    { type: 'break', label: 'LUNCH BREAK' },
    { type: 'period', period: 5, title: 'V', time: '01:00 PM - 01:50 PM' },
    { type: 'period', period: 6, title: 'VI', time: '01:50 PM - 02:40 PM' },
    { type: 'break', label: 'BREAK' },
    { type: 'period', period: 7, title: 'VII', time: '02:55 PM - 03:45 PM' }
];

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeMultiPhoneInput(value) {
    return String(value || '')
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function getParentPhonesText(user) {
    if (Array.isArray(user?.parentPhones) && user.parentPhones.length) {
        return user.parentPhones.join(', ');
    }
    return user?.parentPhone || '';
}

function toDateInputValue(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
}

function syncManagedDepartmentsFromItems(items) {
    if (!Array.isArray(items) || !items.length) return;

    const fromItems = items
        .map((item) => (item?.department || '').toString().trim())
        .filter(Boolean);

    if (!fromItems.length) return;

    const merged = new Set(managedDepartments);
    fromItems.forEach((d) => merged.add(d));
    managedDepartments = Array.from(merged).sort((a, b) => a.localeCompare(b));

    refreshDepartmentFilters();
}

function refreshDepartmentFilters() {
    const apply = (selectId, placeholder = 'All Departments') => {
        const select = document.getElementById(selectId);
        if (!select) return;

        const currentValue = (select.value || '').trim();
        select.innerHTML = [
            `<option value="">${placeholder}</option>`,
            ...managedDepartments.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`)
        ].join('');

        if (currentValue && managedDepartments.includes(currentValue)) {
            select.value = currentValue;
        }
    };

    apply('studentDeptFilter', 'All Departments');
    apply('facultyDeptFilter', 'All Departments');
    apply('classesDeptFilter', 'All Departments');
}

async function loadManagedDepartments() {
    try {
        const response = await api.get('/settings/departments');
        const list = Array.isArray(response?.departments) ? response.departments : [];

        managedDepartments = Array.from(
            new Set(
                list
                    .map((d) => String(d || '').trim())
                    .filter(Boolean)
            )
        ).sort((a, b) => a.localeCompare(b));

        refreshDepartmentFilters();
    } catch (error) {
        console.error('Failed to load managed departments:', error);
    }
}

async function loadDepartmentsPage() {
    await loadManagedDepartments();
    renderDepartmentsTable();
}

function parseNumberWithinRange(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function readEmailCustomizationFromForm() {
    const timezoneInput = document.getElementById('emailTimezoneInput');
    const quietEnabledInput = document.getElementById('quietHoursEnabledInput');
    const quietStartInput = document.getElementById('quietHoursStartInput');
    const quietEndInput = document.getElementById('quietHoursEndInput');
    const retryEnabledInput = document.getElementById('retryEnabledInput');
    const retryMaxRetriesInput = document.getElementById('retryMaxRetriesInput');

    return {
        timezone: String(timezoneInput?.value || DEFAULT_EMAIL_CUSTOMIZATION.timezone).trim() || DEFAULT_EMAIL_CUSTOMIZATION.timezone,
        quietHours: {
            enabled: !!quietEnabledInput?.checked,
            start: String(quietStartInput?.value || DEFAULT_EMAIL_CUSTOMIZATION.quietHours.start),
            end: String(quietEndInput?.value || DEFAULT_EMAIL_CUSTOMIZATION.quietHours.end)
        },
        retryPolicy: {
            enabled: !!retryEnabledInput?.checked,
            maxRetries: Math.round(parseNumberWithinRange(retryMaxRetriesInput?.value, DEFAULT_EMAIL_CUSTOMIZATION.retryPolicy.maxRetries, 0, 10))
        }
    };
}

function applyEmailCustomizationToForm(emailCustomization) {
    const normalized = {
        ...DEFAULT_EMAIL_CUSTOMIZATION,
        ...(emailCustomization || {}),
        quietHours: {
            ...DEFAULT_EMAIL_CUSTOMIZATION.quietHours,
            ...(emailCustomization?.quietHours || {})
        },
        retryPolicy: {
            ...DEFAULT_EMAIL_CUSTOMIZATION.retryPolicy,
            ...(emailCustomization?.retryPolicy || {})
        }
    };

    const timezoneInput = document.getElementById('emailTimezoneInput');
    const quietEnabledInput = document.getElementById('quietHoursEnabledInput');
    const quietStartInput = document.getElementById('quietHoursStartInput');
    const quietEndInput = document.getElementById('quietHoursEndInput');
    const retryEnabledInput = document.getElementById('retryEnabledInput');
    const retryMaxRetriesInput = document.getElementById('retryMaxRetriesInput');

    if (timezoneInput) timezoneInput.value = normalized.timezone;
    if (quietEnabledInput) quietEnabledInput.checked = !!normalized.quietHours.enabled;
    if (quietStartInput) quietStartInput.value = normalized.quietHours.start;
    if (quietEndInput) quietEndInput.value = normalized.quietHours.end;
    if (retryEnabledInput) retryEnabledInput.checked = !!normalized.retryPolicy.enabled;
    if (retryMaxRetriesInput) retryMaxRetriesInput.value = String(normalized.retryPolicy.maxRetries);

    updateTimezonePreviewText();
}

function readAttendanceRulesFromForm() {
    const thresholdInput = document.getElementById('globalLowAttendanceThresholdInput');
    return {
        globalLowAttendanceThreshold: parseNumberWithinRange(
            thresholdInput?.value,
            DEFAULT_ATTENDANCE_RULES.globalLowAttendanceThreshold,
            0,
            100
        )
    };
}

function applyAttendanceRulesToForm(attendanceRules) {
    const normalized = {
        ...DEFAULT_ATTENDANCE_RULES,
        ...(attendanceRules || {})
    };

    const thresholdInput = document.getElementById('globalLowAttendanceThresholdInput');
    if (thresholdInput) {
        thresholdInput.value = String(normalized.globalLowAttendanceThreshold);
    }
}

function readCommunicationRulesFromForm() {
    const approvalWorkflowEnabledInput = document.getElementById('approvalWorkflowEnabledInput');
    const defaultVisibilityDaysInput = document.getElementById('defaultVisibilityDaysInput');
    const autoDeleteAfterDaysInput = document.getElementById('autoDeleteAfterDaysInput');
    const applyToAnnouncementsInput = document.getElementById('applyToAnnouncementsInput');
    const applyToDirectMessagesInput = document.getElementById('applyToDirectMessagesInput');

    return {
        approvalWorkflowEnabled: !!approvalWorkflowEnabledInput?.checked,
        defaultVisibilityDays: Math.round(parseNumberWithinRange(defaultVisibilityDaysInput?.value, DEFAULT_COMMUNICATION_RULES.defaultVisibilityDays, 1, 365)),
        autoDeleteAfterDays: Math.round(parseNumberWithinRange(autoDeleteAfterDaysInput?.value, DEFAULT_COMMUNICATION_RULES.autoDeleteAfterDays, 1, 3650)),
        applyToAnnouncements: !!applyToAnnouncementsInput?.checked,
        applyToDirectMessages: !!applyToDirectMessagesInput?.checked
    };
}

function applyCommunicationRulesToForm(communicationRules) {
    const normalized = {
        ...DEFAULT_COMMUNICATION_RULES,
        ...(communicationRules || {})
    };

    const approvalWorkflowEnabledInput = document.getElementById('approvalWorkflowEnabledInput');
    const defaultVisibilityDaysInput = document.getElementById('defaultVisibilityDaysInput');
    const autoDeleteAfterDaysInput = document.getElementById('autoDeleteAfterDaysInput');
    const applyToAnnouncementsInput = document.getElementById('applyToAnnouncementsInput');
    const applyToDirectMessagesInput = document.getElementById('applyToDirectMessagesInput');

    if (approvalWorkflowEnabledInput) approvalWorkflowEnabledInput.checked = !!normalized.approvalWorkflowEnabled;
    if (defaultVisibilityDaysInput) defaultVisibilityDaysInput.value = String(normalized.defaultVisibilityDays);
    if (autoDeleteAfterDaysInput) autoDeleteAfterDaysInput.value = String(normalized.autoDeleteAfterDays);
    if (applyToAnnouncementsInput) applyToAnnouncementsInput.checked = !!normalized.applyToAnnouncements;
    if (applyToDirectMessagesInput) applyToDirectMessagesInput.checked = !!normalized.applyToDirectMessages;
}

function updateTimezonePreviewText() {
    const timezoneInput = document.getElementById('emailTimezoneInput');
    const preview = document.getElementById('emailTimezonePreviewText');
    if (!preview) return;

    const timezone = String(timezoneInput?.value || DEFAULT_EMAIL_CUSTOMIZATION.timezone).trim() || DEFAULT_EMAIL_CUSTOMIZATION.timezone;

    try {
        const nowText = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(new Date());
        preview.textContent = `Current time in ${timezone}: ${nowText}`;
    } catch (_error) {
        preview.textContent = 'Invalid timezone. Example: Asia/Kolkata';
    }
}

function getTemplateOverride(templateKey) {
    const stored = emailTemplateState.overrides?.[templateKey] || {};
    return {
        enabled: !!stored.enabled,
        subject: String(stored.subject || ''),
        bodyHtml: String(stored.bodyHtml || '')
    };
}

function renderTemplateEditorForm() {
    const select = document.getElementById('emailTemplateSelect');
    const enableInput = document.getElementById('emailTemplateOverrideEnabledInput');
    const subjectInput = document.getElementById('emailTemplateSubjectInput');
    const bodyInput = document.getElementById('emailTemplateBodyInput');
    const varsText = document.getElementById('emailTemplateVarsText');

    if (!select || !enableInput || !subjectInput || !bodyInput || !varsText) return;
    if (!emailTemplateState.templates.length) {
        select.innerHTML = '<option value="">No templates found</option>';
        varsText.textContent = 'Variables: -';
        return;
    }

    if (!emailTemplateState.selectedTemplateKey) {
        emailTemplateState.selectedTemplateKey = emailTemplateState.templates[0].templateKey;
    }

    select.innerHTML = emailTemplateState.templates
        .map((item) => `<option value="${escapeHtml(item.templateKey)}">${escapeHtml(item.templateKey)}</option>`)
        .join('');
    select.value = emailTemplateState.selectedTemplateKey;

    const selectedTemplate = emailTemplateState.templates.find((t) => t.templateKey === emailTemplateState.selectedTemplateKey);
    const override = getTemplateOverride(emailTemplateState.selectedTemplateKey);

    enableInput.checked = override.enabled;
    subjectInput.value = override.subject || selectedTemplate?.defaultSubject || '';
    bodyInput.value = override.bodyHtml || '';
    varsText.textContent = `Variables: ${(selectedTemplate?.variableKeys || []).join(', ') || '-'}`;
}

function bindTemplateEditorChangeHandlers() {
    const select = document.getElementById('emailTemplateSelect');
    const enableInput = document.getElementById('emailTemplateOverrideEnabledInput');
    const subjectInput = document.getElementById('emailTemplateSubjectInput');
    const bodyInput = document.getElementById('emailTemplateBodyInput');
    const testBtn = document.getElementById('sendTemplateTestEmailBtn');

    if (select) {
        select.addEventListener('change', () => {
            emailTemplateState.selectedTemplateKey = String(select.value || '');
            renderTemplateEditorForm();
        });
    }

    const persistSelectedOverride = () => {
        const key = emailTemplateState.selectedTemplateKey;
        if (!key) return;

        emailTemplateState.overrides[key] = {
            enabled: !!enableInput?.checked,
            subject: String(subjectInput?.value || ''),
            bodyHtml: String(bodyInput?.value || '')
        };
    };

    if (enableInput) enableInput.addEventListener('change', persistSelectedOverride);
    if (subjectInput) subjectInput.addEventListener('input', persistSelectedOverride);
    if (bodyInput) bodyInput.addEventListener('input', persistSelectedOverride);

    if (testBtn) {
        testBtn.addEventListener('click', async () => {
            const recipientInput = document.getElementById('emailTemplateTestRecipientInput');
            const recipient = String(recipientInput?.value || '').trim();
            const templateKey = emailTemplateState.selectedTemplateKey;

            if (!recipient) {
                alert('Enter a recipient email for test send');
                return;
            }
            if (!templateKey) {
                alert('Select a template first');
                return;
            }

            persistSelectedOverride();
            const override = getTemplateOverride(templateKey);

            try {
                await api.post('/settings/email-templates/test', {
                    to: recipient,
                    templateKey,
                    subject: override.subject,
                    bodyHtml: override.bodyHtml,
                    variables: {}
                });
                alert('Test email sent successfully');
            } catch (error) {
                alert(error.message || 'Failed to send test email');
            }
        });
    }
}

async function loadEmailTemplateEditor() {
    try {
        const response = await api.get('/settings/email-templates');
        const templates = Array.isArray(response?.templates) ? response.templates : [];

        emailTemplateState.templates = templates;
        emailTemplateState.overrides = templates.reduce((acc, item) => {
            acc[item.templateKey] = {
                enabled: !!item?.override?.enabled,
                subject: String(item?.override?.subject || ''),
                bodyHtml: String(item?.override?.bodyHtml || '')
            };
            return acc;
        }, {});

        emailTemplateState.selectedTemplateKey = templates[0]?.templateKey || '';
        renderTemplateEditorForm();
    } catch (error) {
        console.error('Failed to load email templates:', error);
    }
}

function setupSettingsPaneNavigation() {
    const navItems = Array.from(document.querySelectorAll('[data-settings-target]'));
    const panes = Array.from(document.querySelectorAll('[data-settings-pane]'));
    const searchInput = document.getElementById('settingsSidebarSearchInput');
    const suggestionsWrap = document.getElementById('settingsSidebarSuggestions');
    if (!navItems.length || !panes.length) return;

    const paneByTarget = panes.reduce((acc, pane) => {
        const key = String(pane.dataset.settingsPane || '');
        if (key) acc[key] = pane;
        return acc;
    }, {});

    const activatePane = (target) => {
        navItems.forEach((item) => {
            item.classList.toggle('active', item.dataset.settingsTarget === target);
        });
        panes.forEach((pane) => {
            pane.classList.toggle('active', pane.dataset.settingsPane === target);
        });
    };

    const paneContainsSearchTerm = (target, term) => {
        const pane = paneByTarget[target];
        if (!pane || !term) return false;
        return String(pane.textContent || '').toLowerCase().includes(term);
    };

    const getDisplayNameForTarget = (target) => {
        const navItem = navItems.find((item) => String(item.dataset.settingsTarget || '') === target);
        return String(navItem?.querySelector('.settings-nav-label')?.textContent || target || '').trim();
    };

    const findFirstMatchingElementInPane = (pane, term) => {
        if (!pane || !term) return null;

        const candidates = Array.from(pane.querySelectorAll('label, h5, .settings-subheading, input, select, textarea, small'));
        return candidates.find((element) => {
            const textContent = String(element.textContent || '').toLowerCase();
            const placeholder = String(element.getAttribute('placeholder') || '').toLowerCase();
            const id = String(element.id || '').toLowerCase();
            const name = String(element.getAttribute('name') || '').toLowerCase();
            return textContent.includes(term)
                || placeholder.includes(term)
                || id.includes(term)
                || name.includes(term);
        }) || null;
    };

    const getFocusableTarget = (element) => {
        if (!element) return null;
        const tagName = String(element.tagName || '').toUpperCase();
        if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA' || tagName === 'BUTTON') {
            return element;
        }

        if (tagName === 'LABEL') {
            const htmlFor = String(element.getAttribute('for') || '').trim();
            if (htmlFor) {
                return document.getElementById(htmlFor);
            }
        }

        return element;
    };

    const flashSearchHit = (element) => {
        if (!element) return;
        element.classList.remove('settings-search-hit');
        // Force reflow so repeated search matches still animate.
        void element.offsetWidth;
        element.classList.add('settings-search-hit');
        setTimeout(() => element.classList.remove('settings-search-hit'), 1300);
    };

    const applySidebarSearchFilter = (rawTerm) => {
        const term = String(rawTerm || '').trim().toLowerCase();
        let visibleCount = 0;
        let firstVisibleTarget = '';

        navItems.forEach((item) => {
            const target = String(item.dataset.settingsTarget || '');
            const navText = String(item.querySelector('.settings-nav-label')?.textContent || item.textContent || '').toLowerCase();
            const isMatch = !term || navText.includes(term) || paneContainsSearchTerm(target, term);
            item.classList.toggle('is-hidden', !isMatch);

            if (isMatch) {
                visibleCount += 1;
                if (!firstVisibleTarget) firstVisibleTarget = target;
            }
        });

        if (!visibleCount) return;

        const hasVisibleActive = navItems.some((item) => item.classList.contains('active') && !item.classList.contains('is-hidden'));
        if (!hasVisibleActive && firstVisibleTarget) {
            activatePane(firstVisibleTarget);
        }
    };

    const buildSuggestionEntries = () => {
        const entries = [];

        navItems.forEach((item) => {
            const target = String(item.dataset.settingsTarget || '');
            const label = String(item.querySelector('.settings-nav-label')?.textContent || '').trim();
            if (!target || !label) return;

            entries.push({
                type: 'category',
                target,
                label,
                searchText: label.toLowerCase(),
                element: paneByTarget[target]
            });

            const pane = paneByTarget[target];
            if (!pane) return;
            const seen = new Set();
            const fieldNodes = pane.querySelectorAll('label, h5, .settings-subheading, input, select, textarea');

            fieldNodes.forEach((node) => {
                let text = String(node.textContent || '').trim();
                if (!text && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA')) {
                    text = String(node.getAttribute('placeholder') || '').trim();
                }
                if (!text) return;

                const key = `${target}::${text.toLowerCase()}`;
                if (seen.has(key)) return;
                seen.add(key);

                entries.push({
                    type: 'field',
                    target,
                    label: `${label}: ${text}`,
                    searchText: `${label} ${text}`.toLowerCase(),
                    element: node
                });
            });
        });

        return entries;
    };

    const suggestionEntries = buildSuggestionEntries();

    const jumpToSuggestion = (entry) => {
        if (!entry) return;
        activatePane(entry.target);

        const targetElement = entry.element || paneByTarget[entry.target];
        const focusable = getFocusableTarget(targetElement);
        requestAnimationFrame(() => {
            const scrollTarget = focusable || targetElement;
            scrollTarget?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (focusable && typeof focusable.focus === 'function') {
                focusable.focus({ preventScroll: true });
            }
            const highlightTarget = targetElement?.closest('.form-group') || targetElement?.closest('.settings-inline-fields') || targetElement;
            flashSearchHit(highlightTarget);
        });
    };

    const renderSuggestions = (rawTerm) => {
        if (!suggestionsWrap) return;
        const term = String(rawTerm || '').trim().toLowerCase();

        const filtered = (term
            ? suggestionEntries.filter((entry) => entry.searchText.includes(term))
            : suggestionEntries.filter((entry) => entry.type === 'category')
        ).slice(0, 6);

        suggestionsWrap.innerHTML = '';
        if (!filtered.length) return;

        filtered.forEach((entry) => {
            const suggestion = document.createElement('button');
            suggestion.type = 'button';
            suggestion.className = 'settings-search-suggestion';
            suggestion.textContent = entry.label;
            suggestion.title = entry.type === 'category'
                ? `Open ${getDisplayNameForTarget(entry.target)}`
                : `Jump to ${entry.label}`;
            suggestion.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = entry.type === 'category' ? getDisplayNameForTarget(entry.target) : entry.label;
                    applySidebarSearchFilter(searchInput.value);
                    renderSuggestions(searchInput.value);
                }
                jumpToSuggestion(entry);
            });
            suggestionsWrap.appendChild(suggestion);
        });
    };

    const jumpToFirstSearchMatch = (rawTerm) => {
        const term = String(rawTerm || '').trim().toLowerCase();
        if (!term) return;

        const targetOrder = navItems
            .filter((item) => !item.classList.contains('is-hidden'))
            .map((item) => String(item.dataset.settingsTarget || ''));

        for (const target of targetOrder) {
            const pane = paneByTarget[target];
            const match = findFirstMatchingElementInPane(pane, term);
            if (!match) continue;

            activatePane(target);
            const focusable = getFocusableTarget(match);
            requestAnimationFrame(() => {
                const scrollTarget = focusable || match;
                scrollTarget?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (focusable && typeof focusable.focus === 'function') {
                    focusable.focus({ preventScroll: true });
                }

                const highlightTarget = match.closest('.form-group') || match.closest('.settings-inline-fields') || match;
                flashSearchHit(highlightTarget);
            });
            return;
        }

        if (targetOrder[0]) {
            activatePane(targetOrder[0]);
        }
    };

    navItems.forEach((item) => {
        item.addEventListener('click', () => {
            activatePane(String(item.dataset.settingsTarget || ''));
        });
    });

    const initiallyActive = navItems.find((item) => item.classList.contains('active'))?.dataset.settingsTarget
        || navItems[0].dataset.settingsTarget;

    activatePane(String(initiallyActive || ''));
    applySidebarSearchFilter('');
    renderSuggestions('');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            applySidebarSearchFilter(searchInput.value);
            renderSuggestions(searchInput.value);
        });

        searchInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            jumpToFirstSearchMatch(searchInput.value);
        });
    }
}

function setupAdminSettingsHandlers() {
    if (adminSettingsHandlersBound) return;

    const form = document.getElementById('adminSettingsForm');
    const resetBtn = document.getElementById('resetDefaultPasswordBtn');
    const timezoneInput = document.getElementById('emailTimezoneInput');

    if (form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const input = document.getElementById('defaultUserPasswordInput');
            const value = (input?.value || '').trim();
            const emailTriggers = readEmailTriggerSettingsFromForm();
            const emailCustomization = readEmailCustomizationFromForm();
            const attendanceRules = readAttendanceRulesFromForm();
            const communicationRules = readCommunicationRulesFromForm();

            const selectedKey = emailTemplateState.selectedTemplateKey;
            if (selectedKey) {
                const enableInput = document.getElementById('emailTemplateOverrideEnabledInput');
                const subjectInput = document.getElementById('emailTemplateSubjectInput');
                const bodyInput = document.getElementById('emailTemplateBodyInput');
                emailTemplateState.overrides[selectedKey] = {
                    enabled: !!enableInput?.checked,
                    subject: String(subjectInput?.value || ''),
                    bodyHtml: String(bodyInput?.value || '')
                };
            }

            if (!value) {
                alert('Default user password is required');
                return;
            }

            try {
                await api.post('/settings/admin-config', {
                    defaultUserPassword: value,
                    emailTriggers,
                    emailCustomization,
                    attendanceRules,
                    communicationRules
                });

                await api.post('/settings/email-templates', {
                    overrides: emailTemplateState.overrides
                });

                await loadEmailStats();
                alert('Settings saved successfully');
            } catch (error) {
                alert(error.message || 'Failed to save settings');
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const resetValue = 'password';
            const emailTriggers = readEmailTriggerSettingsFromForm();
            const emailCustomization = readEmailCustomizationFromForm();
            const attendanceRules = readAttendanceRulesFromForm();
            const communicationRules = readCommunicationRulesFromForm();
            try {
                await api.post('/settings/admin-config', {
                    defaultUserPassword: resetValue,
                    emailTriggers,
                    emailCustomization,
                    attendanceRules,
                    communicationRules
                });
                const input = document.getElementById('defaultUserPasswordInput');
                if (input) input.value = resetValue;
                await loadEmailStats();
                alert('Default password reset to password');
            } catch (error) {
                alert(error.message || 'Failed to reset default password');
            }
        });
    }

    if (timezoneInput) {
        timezoneInput.addEventListener('input', () => {
            updateTimezonePreviewText();
        });
    }

    setupSettingsPaneNavigation();
    bindTemplateEditorChangeHandlers();

    adminSettingsHandlersBound = true;
}

async function loadAdminSettingsPage() {
    setupAdminSettingsHandlers();

    const input = document.getElementById('defaultUserPasswordInput');
    if (!input) return;

    try {
        const data = await api.get('/settings/admin-config');
        input.value = (data?.defaultUserPassword || 'password').trim() || 'password';
        applyEmailTriggerSettingsToForm(data?.emailTriggers);
        applyEmailCustomizationToForm(data?.emailCustomization);
        applyAttendanceRulesToForm(data?.attendanceRules);
        applyCommunicationRulesToForm(data?.communicationRules);
    } catch (error) {
        console.error('Failed to load admin settings:', error);
        input.value = 'password';
        applyEmailTriggerSettingsToForm(null);
        applyEmailCustomizationToForm(null);
        applyAttendanceRulesToForm(null);
        applyCommunicationRulesToForm(null);
    }

    await loadEmailTemplateEditor();
    await loadEmailStats();
}

function readEmailTriggerSettingsFromForm() {
    const map = {
        leaveApproved: 'triggerLeaveApprovedInput',
        leaveRejected: 'triggerLeaveRejectedInput',
        attendanceAbsent: 'triggerAttendanceAbsentInput',
        lowAttendanceAuto: 'triggerLowAttendanceAutoInput',
        passwordReset: 'triggerPasswordResetInput',
        adminPasswordReset: 'triggerAdminPasswordResetInput',
        customTemplated: 'triggerCustomTemplatedInput'
    };

    const settings = { ...DEFAULT_EMAIL_TRIGGER_SETTINGS };
    Object.entries(map).forEach(([key, elementId]) => {
        const input = document.getElementById(elementId);
        if (input) {
            settings[key] = !!input.checked;
        }
    });

    return settings;
}

function applyEmailTriggerSettingsToForm(emailTriggers) {
    const normalized = {
        ...DEFAULT_EMAIL_TRIGGER_SETTINGS,
        ...(emailTriggers || {})
    };

    const map = {
        leaveApproved: 'triggerLeaveApprovedInput',
        leaveRejected: 'triggerLeaveRejectedInput',
        attendanceAbsent: 'triggerAttendanceAbsentInput',
        lowAttendanceAuto: 'triggerLowAttendanceAutoInput',
        passwordReset: 'triggerPasswordResetInput',
        adminPasswordReset: 'triggerAdminPasswordResetInput',
        customTemplated: 'triggerCustomTemplatedInput'
    };

    Object.entries(map).forEach(([key, elementId]) => {
        const input = document.getElementById(elementId);
        if (input) {
            input.checked = !!normalized[key];
        }
    });
}

async function loadEmailStats() {
    const dailyEl = document.getElementById('emailStatsDailyCount');
    const sevenDayEl = document.getElementById('emailStatsSevenDayCount');
    const lifetimeEl = document.getElementById('emailStatsLifetimeCount');
    const successRateEl = document.getElementById('emailStatsSuccessRate');
    const failureRateEl = document.getElementById('emailStatsFailureRate');
    const asOfEl = document.getElementById('emailStatsAsOfText');

    if (!dailyEl || !sevenDayEl || !lifetimeEl || !asOfEl) return;

    try {
        const stats = await api.get('/settings/email-stats');
        dailyEl.textContent = String(stats?.dailyAttempts || 0);
        sevenDayEl.textContent = String(stats?.sevenDayAttempts || 0);
        lifetimeEl.textContent = String(stats?.lifetimeAttempts || 0);
        if (successRateEl) successRateEl.textContent = `${Number(stats?.successRate || 0).toFixed(2)}%`;
        if (failureRateEl) failureRateEl.textContent = `${Number(stats?.failureRate || 0).toFixed(2)}%`;

        const asOfDate = stats?.asOf ? new Date(stats.asOf) : new Date();
        const asOfText = Number.isNaN(asOfDate.getTime())
            ? 'Email attempts count (success + failed).'
            : `Email attempts count (success + failed). Updated ${asOfDate.toLocaleString()}.`;

        asOfEl.textContent = asOfText;
    } catch (error) {
        console.error('Failed to load email stats:', error);
        dailyEl.textContent = '0';
        sevenDayEl.textContent = '0';
        lifetimeEl.textContent = '0';
        if (successRateEl) successRateEl.textContent = '0%';
        if (failureRateEl) failureRateEl.textContent = '0%';
        asOfEl.textContent = 'Unable to load email stats.';
    }
}

function renderDepartmentsTable() {
    const tbody = document.getElementById('departmentsTableBody');
    if (!tbody) return;

    if (!managedDepartments.length) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center">No departments added yet</td></tr>';
        return;
    }

    tbody.innerHTML = managedDepartments
        .map((department) => `
            <tr>
                <td>${escapeHtml(department)}</td>
                <td class="actions">
                    <button class="btn btn-small btn-danger" onclick="deleteDepartment('${encodeURIComponent(department)}')">Delete</button>
                </td>
            </tr>
        `)
        .join('');
}

async function addDepartment() {
    const input = document.getElementById('departmentNameInput');
    const name = (input?.value || '').trim();

    if (!name) {
        alert('Department name is required');
        return;
    }

    try {
        const response = await api.post('/settings/departments', { name });
        managedDepartments = Array.isArray(response?.departments)
            ? response.departments
            : managedDepartments;

        if (input) input.value = '';
        refreshDepartmentFilters();
        renderDepartmentsTable();
    } catch (error) {
        alert(error.message || 'Failed to add department');
    }
}

async function deleteDepartment(encodedName) {
    const name = decodeURIComponent(encodedName || '');
    if (!name) return;

    if (!confirm(`Delete department "${name}"?`)) return;

    try {
        const response = await api.delete(`/settings/departments/${encodeURIComponent(name)}`);
        managedDepartments = Array.isArray(response?.departments)
            ? response.departments
            : managedDepartments;

        refreshDepartmentFilters();
        renderDepartmentsTable();
    } catch (error) {
        alert(error.message || 'Failed to delete department');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = checkAuth();
    if (!currentUser || currentUser.role !== 'admin') {
        return;
    }

    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
    
    setupNavigation();
    setupLogoutHandler();
    setupUserMenu();
    await loadManagedDepartments();
    await applyDashboardSettings();
    await loadOverviewData();
    await loadAnnouncements();
    enableDashboardCustomization();

    const urlParams = new URLSearchParams(window.location.search);
    const page = urlParams.get('page');
    if (page) {
        const link = document.querySelector(`.nav-link[data-page="${page}"]`);
        if (link) {
            link.click();
        }
    }
});

async function applyDashboardSettings() {
    try {
        const settings = await api.get('/settings/dashboard');
        if (settings && settings.widgets) {
            for (const widgetId in settings.widgets) {
                const element = document.getElementById(widgetId);
                if (element) {
                    element.style.display = settings.widgets[widgetId] ? '' : 'none';
                }
            }
        }
    } catch (error) {
        console.error('Failed to apply dashboard settings:', error);
    }
}

function setupLogoutHandler() {
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
    });
    document.getElementById('logoutBtnDropdown').addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
    });
}

function setupUserMenu() {
    const userMenu = document.getElementById('userMenu');
    if (userMenu) {
        userMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenu.classList.toggle('active');
        });
    }

    document.addEventListener('click', (e) => {
        const userMenu = document.getElementById('userMenu');
        if (userMenu && !userMenu.contains(e.target)) {
            userMenu.classList.remove('active');
        }
    });
}

async function handleLogout() {
    try {
        await api.post('/auth/logout');
    } catch (error) {
        console.log('Logout API call failed, proceeding with local logout');
    } finally {
        clearAuth();
        window.location.href = 'login.html';
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
}

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link[data-page]');
    navLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            document.querySelectorAll('.page-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(page).classList.add('active');
            document.getElementById('pageTitle').textContent = link.textContent.trim();
            
            if (window.innerWidth < 769) {
                document.getElementById('sidebar').classList.remove('active');
            }
            
            await loadPageData(page);
        });
    });
}

function getRecentDateLabels(days = 7) {
    const labels = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - offset);
        labels.push(date.toISOString().split('T')[0]);
    }
    return labels;
}

function scheduleSecurityTrendChartLoad() {
    if (securityTrendChartLoadTimer) {
        clearTimeout(securityTrendChartLoadTimer);
    }

    // Keep overview cards responsive by loading chart after initial paint.
    securityTrendChartLoadTimer = setTimeout(() => {
        renderSecurityTrendChart();
    }, 0);
}

function setLoadMoreVisibility(buttonId, hasMore, isLoading = false) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.style.display = hasMore ? 'inline-flex' : 'none';
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Loading...' : 'Load More';
}

function appendRows(tableSelector, rowsHtml, reset = false) {
    const tbody = document.querySelector(tableSelector);
    if (!tbody) return;

    if (reset) {
        tbody.innerHTML = rowsHtml;
    } else {
        tbody.insertAdjacentHTML('beforeend', rowsHtml);
    }
}

async function fetchAllSubjects(search = '') {
    const all = [];
    let page = 1;
    const limit = 200;
    let hasMore = true;

    while (hasMore) {
        const params = new URLSearchParams({
            page: String(page),
            limit: String(limit)
        });
        if (search && search.trim()) {
            params.append('search', search.trim());
        }

        const data = await api.get(`/subjects?${params.toString()}`);
        const incoming = Array.isArray(data?.subjects) ? data.subjects : [];
        all.push(...incoming);

        hasMore = !!data?.pagination?.hasMore;
        page += 1;

        // Backward compatibility: older server may return all subjects without pagination.
        if (!data?.pagination) {
            hasMore = false;
        }
    }

    return all;
}

async function loadPageData(page) {
    switch (page) {
        case 'overview':
            await loadOverviewData();
            break;
        case 'users':
            await loadUsers();
            break;
        case 'students':
            await loadStudents();
            break;
        case 'faculty':
            await loadFaculty();
            break;
        case 'subjects':
            await loadSubjects();
            break;
        case 'classes':
            await loadClasses();
            break;
        case 'departments':
            await loadDepartmentsPage();
            break;
        case 'settings':
            await loadAdminSettingsPage();
            break;
        case 'timetable':
            await loadTimetableData();
            break;
        case 'reports':
            await loadReportData();
            break;
        case 'audit':
            loadAuditLogs();
            break;
        case 'security':
            await loadSecurityData();
            break;
    }
}

async function loadSecurityData() {
    await Promise.all([
        loadSecurityAttempts(),
        loadBlockedUsers()
    ]);
}

async function loadSecurityAttempts() {
    try {
        const data = await api.get('/security/attempts?limit=200');
        renderSecurityAttemptsTable(data.attempts || []);
    } catch (error) {
        console.error('Error loading security attempts:', error);
    }
}

function renderSecurityAttemptsTable(attempts) {
    const tbody = document.querySelector('#securityAttemptsTable tbody');
    if (!tbody) return;

    if (!attempts.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No suspicious attempts found</td></tr>';
        return;
    }

    tbody.innerHTML = attempts.map((a) => `
        <tr>
            <td>${formatAuditDate(a.attemptedAt)}</td>
            <td>${a.ipAddress || 'Unknown'}</td>
            <td>${a.routePath || '/api/auth/login'}</td>
            <td>${a.attemptedEmail || 'Unknown'}</td>
            <td>${a.attemptCount || 1}</td>
            <td class="details-cell" title="${(a.details || '').replace(/"/g, '&quot;')}">${a.details || '-'}</td>
            <td class="actions">
                ${a.user && !a.user.isBlocked
                    ? `<button class="btn btn-small btn-danger" onclick="blockUserFromSecurity('${a.user._id}')">Block User</button>
                       <button class="btn btn-small btn-secondary" onclick="resetUserPasswordFromSecurity('${a.user._id}')">Reset Password & Send Mail</button>`
                    : '<span style="color: var(--gray-500);">N/A</span>'}
            </td>
        </tr>
    `).join('');
}

async function loadBlockedUsers() {
    try {
        const data = await api.get('/security/blocked-users');
        renderBlockedUsersTable(data.users || []);
    } catch (error) {
        console.error('Error loading blocked users:', error);
    }
}

function renderBlockedUsersTable(users) {
    const tbody = document.querySelector('#blockedUsersTable tbody');
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No blocked users</td></tr>';
        return;
    }

    tbody.innerHTML = users.map((u) => `
        <tr>
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td><span class="badge badge-${u.role}">${u.role}</span></td>
            <td>${u.blockedAt ? formatAuditDate(u.blockedAt) : '-'}</td>
            <td>${u.blockedReason || '-'}</td>
            <td class="actions">
                <button class="btn btn-small btn-secondary" onclick="resetUserPasswordFromSecurity('${u._id}')">Reset Password & Send Mail</button>
                <button class="btn btn-small btn-success" onclick="unblockUserFromSecurity('${u._id}')">Unblock</button>
            </td>
        </tr>
    `).join('');
}

async function blockUserFromSecurity(userId) {
    const reason = prompt('Reason to block this user?', 'Suspicious login attempts detected');
    if (reason === null) return;

    try {
        await api.post('/security/block-user', { userId, reason });
        await loadSecurityData();
        alert('User blocked successfully.');
    } catch (error) {
        alert(error.message || 'Failed to block user');
    }
}

async function unblockUserFromSecurity(userId) {
    if (!confirm('Unblock this user?')) return;

    try {
        await api.post('/security/unblock-user', { userId });
        await loadSecurityData();
        alert('User unblocked successfully.');
    } catch (error) {
        alert(error.message || 'Failed to unblock user');
    }
}

async function resetUserPasswordFromSecurity(userId) {
    if (!confirm('Generate random password and send to this user email?')) return;

    try {
        const result = await api.post(`/auth/users/${userId}/reset-password-random`, {});
        if (result.tempPassword) {
            alert(`Password reset done. Email failed in local mode. Temporary password: ${result.tempPassword}`);
        } else {
            alert('Password reset and email sent successfully.');
        }
    } catch (error) {
        alert(error.message || 'Failed to reset password');
    }
}

async function findUserIdByEmail(email) {
    const trimmed = (email || '').trim().toLowerCase();
    if (!trimmed) {
        throw new Error('Please enter a user email');
    }

    const data = await api.get(`/auth/users?search=${encodeURIComponent(trimmed)}&page=1&limit=20`);
    const user = (data.users || []).find((u) => (u.email || '').toLowerCase() === trimmed);
    if (!user) {
        throw new Error('User not found for this email');
    }

    return user._id;
}

async function resetPasswordByEmail() {
    const emailEl = document.getElementById('securityUserEmail');
    const email = emailEl ? emailEl.value : '';

    try {
        const userId = await findUserIdByEmail(email);
        await resetUserPasswordFromSecurity(userId);
    } catch (error) {
        alert(error.message || 'Failed to reset password');
    }
}

async function unblockUserByEmail() {
    const emailEl = document.getElementById('securityUserEmail');
    const email = emailEl ? emailEl.value : '';

    try {
        const userId = await findUserIdByEmail(email);
        await unblockUserFromSecurity(userId);
    } catch (error) {
        alert(error.message || 'Failed to unblock user');
    }
}

async function loadOverviewData() {
    try {
        let stats;

        try {
            const statsData = await api.get('/auth/users/stats');
            stats = statsData.stats;
        } catch (statsError) {
            // Fallback for older server versions: keep existing behavior.
            const [usersData, subjectsData, classesData] = await Promise.all([
                api.get('/auth/users'),
                api.get('/subjects'),
                api.get('/classes')
            ]);

            const students = usersData.users.filter(u => u.role === 'student');
            const faculty = usersData.users.filter(u => u.role === 'faculty');

            stats = {
                totalStudents: students.length,
                totalFaculty: faculty.length,
                totalSubjects: subjectsData.subjects.length,
                totalClasses: classesData.classes.length,
            };
        }

        document.getElementById('totalStudents').textContent = stats.totalStudents;
        document.getElementById('totalFaculty').textContent = stats.totalFaculty;
        document.getElementById('totalSubjects').textContent = stats.totalSubjects;
        document.getElementById('totalClasses').textContent = stats.totalClasses;

        renderUserDistributionChart(stats.totalStudents, stats.totalFaculty);
        scheduleSecurityTrendChartLoad();
    } catch (error) {
        console.error('Error loading overview:', error);
    }
}

function renderUserDistributionChart(students, faculty) {
    const ctx = document.getElementById('userChart');
    if (!ctx) return;

    if (userChart) {
        userChart.destroy();
    }

    userChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Students', 'Faculty'],
            datasets: [{
                data: [students, faculty],
                backgroundColor: ['#4a90e2', '#50c878'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 10,
                        font: { size: 11 },
                        usePointStyle: true
                    }
                }
            }
        }
    });
}

async function renderSecurityTrendChart() {
    const ctx = document.getElementById('securityTrendChart');
    if (!ctx) return;

    try {
        const labels = getRecentDateLabels(7);
        const attemptsData = await api.get('/security/attempts?limit=500');
        const attempts = Array.isArray(attemptsData?.attempts) ? attemptsData.attempts : [];

        const attemptCountByDay = new Map(labels.map((label) => [label, 0]));

        attempts.forEach((attempt) => {
            const attemptedAt = attempt?.attemptedAt ? new Date(attempt.attemptedAt) : null;
            if (!attemptedAt || Number.isNaN(attemptedAt.getTime())) {
                return;
            }

            const dayKey = attemptedAt.toISOString().split('T')[0];
            if (attemptCountByDay.has(dayKey)) {
                attemptCountByDay.set(dayKey, attemptCountByDay.get(dayKey) + 1);
            }
        });

        const failedAttempts = labels.map((label) => attemptCountByDay.get(label) || 0);

        if (securityTrendChart) {
            securityTrendChart.destroy();
        }

        securityTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Failed Login Attempts',
                    data: failedAttempts,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.18)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: { size: 10 }
                        }
                    },
                    x: {
                        ticks: {
                            font: { size: 10 },
                            callback(value, index) {
                                const label = labels[index] || '';
                                return label.slice(5);
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            title(items) {
                                const idx = items?.[0]?.dataIndex;
                                return idx >= 0 ? labels[idx] : '';
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.log('Security trend chart data not available yet');
    }
}

async function loadUsers(reset = true) {
    if (usersListState.loading) return;

    try {
        const search = (document.getElementById('usersSearchInput')?.value || '').trim();
        const role = (document.getElementById('usersRoleFilter')?.value || '').trim();

        if (reset) {
            usersListState.page = 1;
            usersListState.items = [];
        }

        usersListState.loading = true;
        setLoadMoreVisibility('usersLoadMoreBtn', usersListState.hasMore, true);

        const params = new URLSearchParams({
            page: String(usersListState.page),
            limit: String(ADMIN_LIST_PAGE_SIZE),
        });
        if (search) params.append('search', search);
        if (role) params.append('role', role);

        const data = await api.get(`/auth/users?${params.toString()}`);
        const incoming = data.users || [];

        usersListState.items = reset
            ? incoming
            : usersListState.items.concat(incoming);
        usersListState.hasMore = !!data.pagination?.hasMore;

        users = usersListState.items;
        renderUsersTable(incoming, reset);

        if (usersListState.hasMore) {
            usersListState.page += 1;
        }
    } catch (error) {
        console.error('Error loading users:', error);
    } finally {
        usersListState.loading = false;
        setLoadMoreVisibility('usersLoadMoreBtn', usersListState.hasMore, false);
    }
}

function renderUsersTable(usersData, reset = true) {
    const rowsHtml = usersData.map(user => `
        <tr>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td><span class="badge badge-${user.role}">${user.role}</span></td>
            <td>${user.assignedClass?.className || '-'}</td>
            <td class="actions">
                <button class="btn btn-small btn-secondary" onclick="editUser('${user._id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteUser('${user._id}')">Delete</button>
            </td>
        </tr>
    `).join('');

    appendRows('#usersTable tbody', rowsHtml, reset);
}

async function loadStudents(reset = true) {
    if (studentsListState.loading) return;

    try {
        const search = (document.getElementById('studentSearchInput')?.value || '').trim();
        const department = (document.getElementById('studentDeptFilter')?.value || '').trim();
        const year = (document.getElementById('studentYearFilter')?.value || '').trim();

        if (reset) {
            studentsListState.page = 1;
            studentsListState.items = [];
        }

        studentsListState.loading = true;
        setLoadMoreVisibility('studentsLoadMoreBtn', studentsListState.hasMore, true);

        const params = new URLSearchParams({
            role: 'student',
            page: String(studentsListState.page),
            limit: String(ADMIN_LIST_PAGE_SIZE),
        });
        if (search) params.append('search', search);
        if (department) params.append('department', department);
        if (year) params.append('year', year);

        const data = await api.get(`/auth/users?${params.toString()}`);
        const incoming = data.users || [];

        studentsListState.items = reset
            ? incoming
            : studentsListState.items.concat(incoming);
        studentsListState.hasMore = !!data.pagination?.hasMore;

        users = studentsListState.items;
        renderStudentsTable(incoming, reset);
        syncManagedDepartmentsFromItems(incoming);

        if (studentsListState.hasMore) {
            studentsListState.page += 1;
        }
    } catch (error) {
        console.error('Error loading students:', error);
    } finally {
        studentsListState.loading = false;
        setLoadMoreVisibility('studentsLoadMoreBtn', studentsListState.hasMore, false);
    }
}

function renderStudentsTable(studentsData, reset = true) {
    const rowsHtml = studentsData.map(student => `
        <tr>
            <td>${student.name}</td>
            <td>${student.uniqueId || 'N/A'}</td>
            <td>${student.email}</td>
            <td>${student.department || 'N/A'}</td>
            <td>${student.year || 'N/A'}</td>
            <td>${student.batch || 'N/A'}</td>
            <td class="actions">
                <button class="btn btn-small btn-secondary" onclick="editStudent('${student._id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteUser('${student._id}')">Delete</button>
            </td>
        </tr>
    `).join('');

    appendRows('#studentsTable tbody', rowsHtml, reset);
}

async function loadFaculty(reset = true) {
    if (facultyListState.loading) return;

    try {
        const search = (document.getElementById('facultySearchInput')?.value || '').trim();
        const department = (document.getElementById('facultyDeptFilter')?.value || '').trim();

        if (reset) {
            facultyListState.page = 1;
            facultyListState.items = [];
        }

        facultyListState.loading = true;
        setLoadMoreVisibility('facultyLoadMoreBtn', facultyListState.hasMore, true);

        const params = new URLSearchParams({
            role: 'faculty',
            page: String(facultyListState.page),
            limit: String(ADMIN_LIST_PAGE_SIZE),
        });
        if (search) params.append('search', search);
        if (department) params.append('department', department);

        const data = await api.get(`/auth/users?${params.toString()}`);
        const incoming = data.users || [];

        facultyListState.items = reset
            ? incoming
            : facultyListState.items.concat(incoming);
        facultyListState.hasMore = !!data.pagination?.hasMore;

        users = facultyListState.items;
        renderFacultyTable(incoming, reset);
        syncManagedDepartmentsFromItems(incoming);

        if (facultyListState.hasMore) {
            facultyListState.page += 1;
        }
    } catch (error) {
        console.error('Error loading faculty:', error);
    } finally {
        facultyListState.loading = false;
        setLoadMoreVisibility('facultyLoadMoreBtn', facultyListState.hasMore, false);
    }
}

function renderFacultyTable(facultyData, reset = true) {
    const rowsHtml = facultyData.map(f => `
        <tr>
            <td>${f.name}</td>
            <td>${f.email}</td>
            <td>${f.assignedSubjects?.map(s => s.subjectName).join(', ') || 'Not Assigned'}</td>
            <td class="actions">
                <button class="btn btn-small btn-secondary" onclick="editFaculty('${f._id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteUser('${f._id}')">Delete</button>
            </td>
        </tr>
    `).join('');

    appendRows('#facultyTable tbody', rowsHtml, reset);
}

async function loadSubjects() {
    try {
        subjects = await fetchAllSubjects();
        renderSubjectsTable(subjects);
    } catch (error) {
        console.error('Error loading subjects:', error);
    }
}

function renderSubjectsTable(subjects) {
    const tbody = document.querySelector('#subjectsTable tbody');
    tbody.innerHTML = subjects.map(subject => `
        <tr>
            <td>${subject.subjectName}</td>
            <td>${subject.subjectCode}</td>
            <td class="actions">
                <button class="btn btn-small btn-secondary" onclick="editSubject('${subject._id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteSubject('${subject._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function loadClasses(reset = true) {
    if (classesListState.loading) return;

    try {
        const search = (document.getElementById('classesSearchInput')?.value || '').trim();
        const department = (document.getElementById('classesDeptFilter')?.value || '').trim();
        const year = (document.getElementById('classesYearFilter')?.value || '').trim();

        if (reset) {
            classesListState.page = 1;
            classesListState.items = [];
        }

        classesListState.loading = true;
        setLoadMoreVisibility('classesLoadMoreBtn', classesListState.hasMore, true);

        const params = new URLSearchParams({
            page: String(classesListState.page),
            limit: String(ADMIN_LIST_PAGE_SIZE)
        });
        if (search) params.append('search', search);
        if (department) params.append('department', department);
        if (year) params.append('year', year);

        const [classesData, allSubjects] = await Promise.all([
            api.get(`/classes?${params.toString()}`),
            fetchAllSubjects()
        ]);

        const incoming = classesData.classes || [];
        classesListState.items = reset
            ? incoming
            : classesListState.items.concat(incoming);
        classesListState.hasMore = !!classesData.pagination?.hasMore;

        classes = classesListState.items;
        subjects = allSubjects;
        renderClassesTable(incoming, reset);
        syncManagedDepartmentsFromItems(incoming);

        if (classesListState.hasMore) {
            classesListState.page += 1;
        }
    } catch (error) {
        console.error('Error loading classes:', error);
    } finally {
        classesListState.loading = false;
        setLoadMoreVisibility('classesLoadMoreBtn', classesListState.hasMore, false);
    }
}

function renderClassesTable(classItems, reset = true) {
    const rowsHtml = classItems.map((c) => `
        <tr>
            <td>${c.className}</td>
            <td>${c.department || '-'}</td>
            <td>Year ${c.year || '-'}${c.batch ? ` / ${c.batch}` : ''}</td>
            <td>${c.studentsCount ?? c.students?.length ?? 0}</td>
            <td>${c.assignedSubjects?.map(s => s.subjectName).join(', ') || 'None'}</td>
            <td class="actions">
                <button class="btn btn-small btn-secondary" onclick="editClass('${c._id}')">Edit</button>
                <button class="btn btn-small btn-primary" onclick="manageClassStudents('${c._id}')">Students</button>
                <button class="btn btn-small btn-danger" onclick="deleteClass('${c._id}')">Delete</button>
            </td>
        </tr>
    `).join('');

    appendRows('#classesTable tbody', rowsHtml, reset);

    if (reset && !classItems.length) {
        const tbody = document.querySelector('#classesTable tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center">No classes found</td></tr>';
    }
}

async function loadTimetableData() {
    try {
        const [classesData, allSubjects, usersData] = await Promise.all([
            api.get('/classes'),
            fetchAllSubjects(),
            api.get('/auth/users?role=faculty')
        ]);
        classes = classesData.classes;
        subjects = allSubjects;
        timetableFaculty = usersData.users || [];

        const classSelect = document.getElementById('timetableClassFilter');
        classSelect.innerHTML = '<option value="">Select Class</option>' +
            classes.map(c => `<option value="${c._id}">${c.className}</option>`).join('');

        timetableEntries = [];
        renderTimetableGrid([]);
    } catch (error) {
        console.error('Error loading timetable data:', error);
    }
}

async function loadTimetable() {
    const classId = document.getElementById('timetableClassFilter').value;
    if (!classId) {
        alert('Please select a class');
        return;
    }

    try {
        const data = await api.get(`/timetable?classId=${classId}`);
        timetableEntries = data.timetables || [];
        renderTimetableGrid(timetableEntries);
    } catch (error) {
        console.error('Error loading timetable:', error);
    }
}

function renderTimetableGrid(timetables) {
    const table = document.getElementById('weeklyTimetableGrid');
    const thead = table.querySelector('thead');
    const tbody = document.querySelector('#weeklyTimetableGrid tbody');
    const classId = document.getElementById('timetableClassFilter').value;
    const classMeta = document.getElementById('timetableClassMeta');

    if (thead) {
        const headerCells = TIMETABLE_COLUMNS.map((col) => {
            if (col.type === 'break') {
                return `<th class="slot-head break-head">${col.label}</th>`;
            }

            return `<th class="slot-head"><div class="head-period">${col.title}</div><div class="head-time">${col.time}</div></th>`;
        }).join('');

        thead.innerHTML = `
            <tr>
                <th class="day-head">Day / Hour</th>
                ${headerCells}
            </tr>
        `;
    }

    const selectedClass = classes.find((c) => c._id === classId);
    if (classMeta) {
        classMeta.textContent = selectedClass
            ? `${selectedClass.className} | ${selectedClass.department || '-'} | Year ${selectedClass.year || '-'} | Batch ${selectedClass.batch || '-'}`
            : 'Select a class to load weekly timetable.';
    }

    if (!classId) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center">Please select a class</td></tr>';
        return;
    }

    const list = timetables || [];
    const maxPeriod = MAX_PERIODS_PER_DAY;
    const slotMap = new Map();

    list.forEach((entry) => {
        slotMap.set(`${entry.day}-${entry.period}`, entry);
    });

    const rows = TIMETABLE_DAYS.map((day) => {
        const cells = TIMETABLE_COLUMNS.map((col) => {
            if (col.type === 'break') {
                return `<td class="timetable-slot break-cell">${col.label}</td>`;
            }

            const entry = slotMap.get(`${day}-${col.period}`);
            if (!entry) {
                return `
                    <td class="timetable-slot empty-slot">
                        <button class="btn btn-small btn-secondary timetable-cell-action" onclick="showAddTimetableModal({ classId: '${classId}', day: '${day}', period: ${col.period} })">+ Add</button>
                    </td>
                `;
            }

            return `
                <td class="timetable-slot filled-slot">
                    <div class="slot-subject">${entry.subject?.subjectCode ? `${entry.subject.subjectCode} - ` : ''}${entry.subject?.subjectName || 'N/A'}</div>
                    <div class="slot-faculty"><strong>Faculty:</strong> ${entry.faculty?.name || 'N/A'}</div>
                    <div class="slot-room">${entry.roomNo ? `Room: ${entry.roomNo}` : 'Room: N/A'}</div>
                    <div class="slot-actions">
                        <button class="btn btn-small btn-secondary timetable-cell-action" onclick="showEditTimetableModal('${entry._id}')">Edit</button>
                    </div>
                </td>
            `;
        }).join('');

        return `
            <tr>
                <td class="day-cell">${day}</td>
                ${cells}
            </tr>
        `;
    });

    tbody.innerHTML = rows.join('');
}

function buildTimetableFormMarkup({ mode = 'add', entry = null, classId = '', day = '', period = '' }) {
    const submitLabel = mode === 'edit' ? 'Update Entry' : 'Add Entry';
    const defaultClass = classId || entry?.class?._id || '';
    const defaultDept = entry?.department || '';
    const defaultYear = entry?.year || '';
    const defaultBatch = entry?.batch || '';
    const defaultSubject = entry?.subject?._id || '';
    const defaultFaculty = entry?.faculty?._id || '';
    const defaultDay = day || entry?.day || '';
    const defaultPeriod = period || entry?.period || '';
    const defaultRoom = entry?.roomNo || '';

    return `
        <form id="timetableForm">
            <div id="modalTimetableError" class="error-message" style="display:none;"></div>
            <div class="form-row">
                <div class="form-group">
                    <label>Class *</label>
                    <select id="modalTimetableClass" required onchange="updateTimetableClassInfo()">
                        <option value="">Select Class</option>
                        ${classes.map((c) => `<option value="${c._id}" data-dept="${c.department || ''}" data-year="${c.year || ''}" data-batch="${c.batch || ''}" ${c._id === defaultClass ? 'selected' : ''}>${c.className} - ${c.department || '-'} Year ${c.year || '-'}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Department *</label>
                    <input type="text" id="modalTimetableDept" required readonly value="${defaultDept}">
                </div>
                <div class="form-group">
                    <label>Year *</label>
                    <input type="number" id="modalTimetableYear" required readonly value="${defaultYear}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Batch</label>
                    <input type="text" id="modalTimetableBatch" readonly value="${defaultBatch}">
                </div>
                <div class="form-group">
                    <label>Room No.</label>
                    <input type="text" id="modalTimetableRoom" placeholder="e.g., Room 101" value="${defaultRoom}">
                </div>
            </div>
            <div class="form-group">
                <label>Subject *</label>
                <select id="modalTimetableSubject" required>
                    <option value="">Select Subject</option>
                    ${subjects.map((s) => `<option value="${s._id}" ${s._id === defaultSubject ? 'selected' : ''}>${s.subjectName}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Faculty *</label>
                <select id="modalTimetableFaculty" required>
                    <option value="">Select Faculty</option>
                    ${timetableFaculty.map((f) => `<option value="${f._id}" ${f._id === defaultFaculty ? 'selected' : ''}>${f.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Day *</label>
                    <select id="modalTimetableDay" required>
                        <option value="">Select Day</option>
                        ${TIMETABLE_DAYS.map((d) => `<option value="${d}" ${d === defaultDay ? 'selected' : ''}>${d}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Period *</label>
                    <select id="modalTimetablePeriod" required>
                        <option value="">Select Period</option>
                        ${TIMETABLE_COLUMNS
                            .filter((col) => col.type === 'period')
                            .map((col) => `<option value="${col.period}" ${Number(defaultPeriod) === col.period ? 'selected' : ''}>Period ${col.title} (${col.time})</option>`)
                            .join('')}
                    </select>
                </div>
            </div>
            <button type="submit" class="btn btn-primary btn-block">${submitLabel}</button>
            ${mode === 'edit' && entry ? `<button type="button" class="btn btn-danger btn-block" style="margin-top:10px;" onclick="deleteTimetable('${entry._id}', true)">Delete Entry</button>` : ''}
        </form>
    `;
}

function showTimetableFormError(message) {
    const errorEl = document.getElementById('modalTimetableError');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function attachTimetableFormSubmit(mode = 'add', entryId = null) {
    const form = document.getElementById('timetableForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            classId: document.getElementById('modalTimetableClass').value,
            department: document.getElementById('modalTimetableDept').value,
            year: parseInt(document.getElementById('modalTimetableYear').value, 10),
            batch: document.getElementById('modalTimetableBatch').value,
            subjectId: document.getElementById('modalTimetableSubject').value,
            facultyId: document.getElementById('modalTimetableFaculty').value,
            day: document.getElementById('modalTimetableDay').value,
            period: parseInt(document.getElementById('modalTimetablePeriod').value, 10),
            roomNo: document.getElementById('modalTimetableRoom').value
        };

        try {
            if (mode === 'edit' && entryId) {
                await api.put(`/timetable/${entryId}`, payload);
            } else {
                await api.post('/timetable', payload);
            }

            closeModal();

            const filter = document.getElementById('timetableClassFilter');
            if (!filter.value) {
                filter.value = payload.classId;
            }
            await loadTimetable();
        } catch (error) {
            if ((error.message || '').toLowerCase().includes('already exists')) {
                showTimetableFormError('That class already has a timetable entry for the selected day and period. Choose another slot.');
                return;
            }
            showTimetableFormError(error.message || 'Failed to save timetable entry');
        }
    });
}

function getTimetableEntryById(entryId) {
    return timetableEntries.find((entry) => entry._id === entryId);
}

async function showAddTimetableModal(preset = {}) {
    try {
        if (!classes.length || !subjects.length || !timetableFaculty.length) {
            await loadTimetableData();
        }

        document.getElementById('modalTitle').textContent = 'Add Timetable Entry';
        document.getElementById('modalBody').innerHTML = buildTimetableFormMarkup({
            mode: 'add',
            classId: preset.classId || document.getElementById('timetableClassFilter').value,
            day: preset.day || '',
            period: preset.period || ''
        });

        updateTimetableClassInfo();
        attachTimetableFormSubmit('add', null);
        document.getElementById('modal').classList.add('active');
    } catch (error) {
        console.error('Error loading timetable form data:', error);
    }
}

async function showEditTimetableModal(entryId) {
    try {
        if (!classes.length || !subjects.length || !timetableFaculty.length) {
            await loadTimetableData();
        }

        const entry = getTimetableEntryById(entryId);
        if (!entry) {
            alert('Timetable entry not found. Reload timetable and try again.');
            return;
        }

        document.getElementById('modalTitle').textContent = 'Edit Timetable Entry';
        document.getElementById('modalBody').innerHTML = buildTimetableFormMarkup({
            mode: 'edit',
            entry
        });

        updateTimetableClassInfo();
        attachTimetableFormSubmit('edit', entryId);
        document.getElementById('modal').classList.add('active');
    } catch (error) {
        console.error('Error opening edit timetable modal:', error);
    }
}

async function loadReportData() {
    try {
        const reportClass = document.getElementById('reportClass');
        const reportSubject = document.getElementById('reportSubject');

        // Reports UI was simplified; keep anomaly loading while safely handling removed filters.
        if (!reportClass || !reportSubject) {
            await loadAttendanceAnomalies();
            return;
        }

        const [classesData, allSubjects] = await Promise.all([
            api.get('/classes'),
            fetchAllSubjects()
        ]);
        classes = classesData.classes;
        subjects = allSubjects;
        
        reportClass.innerHTML = '<option value="">Select Class</option>' +
            classes.map(c => `<option value="${c._id}">${c.className}</option>`).join('');
        
        reportSubject.innerHTML = '<option value="">Select Subject</option>' +
            subjects.map(s => `<option value="${s._id}">${s.subjectName}</option>`).join('');

        await loadAttendanceAnomalies();
    } catch (error) {
        console.error('Error loading report data:', error);
    }
}

async function loadAttendanceAnomalies() {
    try {
        const data = await api.get('/analytics/anomalies');
        renderAnomaliesTable(data.anomalies || []);
    } catch (error) {
        console.error('Error loading attendance anomalies:', error);
    }
}

function renderAnomaliesTable(anomalies) {
    const tbody = document.querySelector('#anomaliesTable tbody');
    if (!tbody) return;

    if (!anomalies.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No anomalies detected</td></tr>';
        return;
    }

    tbody.innerHTML = anomalies.map((a) => `
        <tr>
            <td>${formatAuditDate(a.when)}</td>
            <td>${a.type}</td>
            <td><span class="status-badge status-${(a.severity || 'low').toLowerCase()}">${a.severity || 'low'}</span></td>
            <td>${a.summary || '-'}</td>
            <td class="details-cell" title="${(a.details || '').replace(/"/g, '&quot;')}">${a.details || '-'}</td>
        </tr>
    `).join('');
}

async function loadReport() {
    const classId = document.getElementById('reportClass').value;
    const subjectId = document.getElementById('reportSubject').value;
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;

    let url = '/attendance/report?';
    if (classId) url += `classId=${classId}&`;
    if (subjectId) url += `subjectId=${subjectId}&`;
    if (startDate) url += `startDate=${startDate}&`;
    if (endDate) url += `endDate=${endDate}`;

    try {
        const data = await api.get(url);
        renderReportTable(data.report);
        renderSubjectChart(data.report);
    } catch (error) {
        console.error('Error loading report:', error);
    }
}

function renderSubjectChart(report) {
    const ctx = document.getElementById('subjectAttendanceChart');
    if (!ctx) return;

    const subjectData = {};
    report.forEach(r => {
        if (!subjectData[r.subjectName]) {
            subjectData[r.subjectName] = { total: 0, present: 0 };
        }
        subjectData[r.subjectName].total += r.totalClasses;
        subjectData[r.subjectName].present += r.present;
    });

    const subjectNames = Object.keys(subjectData);
    const percentages = subjectNames.map(name => {
        const data = subjectData[name];
        return data.total > 0 ? ((data.present / data.total) * 100).toFixed(1) : 0;
    });

    if (subjectChart) {
        subjectChart.destroy();
    }

    subjectChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: subjectNames.length > 0 ? subjectNames : ['No Data'],
            datasets: [{
                label: 'Attendance %',
                data: percentages.length > 0 ? percentages : [0],
                backgroundColor: percentages.map(p => 
                    p < 75 ? '#e74c3c' : p < 85 ? '#f39c12' : '#27ae60'
                ),
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: false
                    },
                    ticks: {
                        font: { size: 10 }
                    }
                },
                y: {
                    ticks: { font: { size: 10 } }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function renderReportTable(report) {
    const tbody = document.querySelector('#reportTable tbody');
    if (report.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No data found</td></tr>';
        return;
    }

    tbody.innerHTML = report.map(r => `
        <tr>
            <td>${r.studentName}</td>
            <td>${r.subjectName} (${r.subjectCode})</td>
            <td>${r.totalClasses}</td>
            <td>${r.present}</td>
            <td class="${r.attendancePercentage < 75 ? 'text-danger' : 'text-success'}">${r.attendancePercentage}%</td>
        </tr>
    `).join('');
}

function exportReport() {
    const classId = document.getElementById('reportClass').value;
    const subjectId = document.getElementById('reportSubject').value;
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;

    const token = localStorage.getItem('token');
    let url = `/api/attendance/export?`;
    if (classId) url += `classId=${classId}&`;
    if (subjectId) url += `subjectId=${subjectId}&`;
    if (startDate) url += `startDate=${startDate}&`;
    if (endDate) url += `endDate=${endDate}`;

    fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => response.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_report_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    })
    .catch(error => {
        console.error('Error exporting report:', error);
        alert('Error exporting report');
    });
}

// Modal Functions
function showAddUserModal() {
    document.getElementById('modalTitle').textContent = 'Add User';
    document.getElementById('modalBody').innerHTML = `
        <form id="addUserForm">
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="modalName" required>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="modalEmail" required>
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="modalPassword" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Phone Number</label>
                    <input type="text" id="modalPhone" placeholder="e.g. +91 9876543210">
                </div>
                <div class="form-group">
                    <label>Date of Birth</label>
                    <input type="date" id="modalDob">
                </div>
            </div>
            <div class="form-group">
                <label>Parent Email ID</label>
                <input type="email" id="modalParentEmail" placeholder="parent@example.com">
            </div>
            <div class="form-group">
                <label>Parent Numbers (multiple)</label>
                <input type="text" id="modalParentPhones" placeholder="+91 9876543210, +91 9123456780">
                <small>Use comma, semicolon, or new line between numbers.</small>
            </div>
            <div class="form-group">
                <label>Role</label>
                <select id="modalRole" required>
                    <option value="">Select Role</option>
                    <option value="admin">Admin</option>
                    <option value="faculty">Faculty</option>
                    <option value="student">Student</option>
                </select>
            </div>
            <div class="form-group" id="classSelectGroup" style="display:none;">
                <label>Class</label>
                <select id="modalClass"></select>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Add User</button>
        </form>
    `;
    
    document.getElementById('modalRole').addEventListener('change', (e) => {
        const classGroup = document.getElementById('classSelectGroup');
        if (e.target.value === 'student') {
            classGroup.style.display = 'block';
            loadClassesForSelect();
        } else {
            classGroup.style.display = 'none';
        }
    });

    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await addUser();
    });

    document.getElementById('modal').classList.add('active');
}

async function loadClassesForSelect() {
    try {
        const data = await api.get('/classes');
        document.getElementById('modalClass').innerHTML = 
            '<option value="">Select Class</option>' +
            data.classes.map(c => `<option value="${c._id}">${c.className}</option>`).join('');
    } catch (error) {
        console.error('Error loading classes:', error);
    }
}

async function addUser() {
    const name = document.getElementById('modalName').value;
    const email = document.getElementById('modalEmail').value;
    const password = document.getElementById('modalPassword').value;
    const role = document.getElementById('modalRole').value;
    const assignedClass = document.getElementById('modalClass').value || null;
    const phone = document.getElementById('modalPhone').value.trim();
    const dob = document.getElementById('modalDob').value;
    const parentEmail = document.getElementById('modalParentEmail').value.trim();
    const parentPhones = normalizeMultiPhoneInput(document.getElementById('modalParentPhones').value);

    try {
        await api.post('/auth/register', {
            name,
            email,
            password,
            role,
            assignedClass,
            phone,
            parentEmail,
            parentPhones,
            dob
        });
        closeModal();
        await loadUsers();
        await loadOverviewData();
    } catch (error) {
        alert(error.message);
    }
}

async function editUser(userId) {
    const user = users.find(u => u._id === userId);
    if (!user) return;

    if (user.role === 'faculty') {
        await editFacultyWithSubjectManager(user);
        return;
    }

    document.getElementById('modalTitle').textContent = 'Edit User';
    document.getElementById('modalBody').innerHTML = `
        <form id="editUserForm">
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="modalName" value="${user.name}" required>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="modalEmail" value="${user.email}" required>
            </div>
            <div class="form-group">
                <label>New Password (leave blank to keep current)</label>
                <input type="password" id="modalPassword">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Phone Number</label>
                    <input type="text" id="modalPhone" value="${escapeHtml(user.phone || '')}" placeholder="e.g. +91 9876543210">
                </div>
                <div class="form-group">
                    <label>Date of Birth</label>
                    <input type="date" id="modalDob" value="${toDateInputValue(user.dob)}">
                </div>
            </div>
            <div class="form-group">
                <label>Parent Email ID</label>
                <input type="email" id="modalParentEmail" value="${escapeHtml(user.parentEmail || '')}" placeholder="parent@example.com">
            </div>
            <div class="form-group">
                <label>Parent Numbers (multiple)</label>
                <input type="text" id="modalParentPhones" value="${escapeHtml(getParentPhonesText(user))}" placeholder="+91 9876543210, +91 9123456780">
                <small>Use comma, semicolon, or new line between numbers.</small>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Update User</button>
        </form>
    `;

    document.getElementById('editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateUser(userId);
    });

    document.getElementById('modal').classList.add('active');
}

async function updateUser(userId) {
    const name = document.getElementById('modalName').value;
    const email = document.getElementById('modalEmail').value;
    const password = document.getElementById('modalPassword').value;
    const phone = document.getElementById('modalPhone').value.trim();
    const dob = document.getElementById('modalDob').value;
    const parentEmail = document.getElementById('modalParentEmail').value.trim();
    const parentPhones = normalizeMultiPhoneInput(document.getElementById('modalParentPhones').value);

    const data = { name, email, phone, dob, parentEmail, parentPhones };
    if (password) data.password = password;

    try {
        await api.put(`/auth/users/${userId}`, data);
        alert('Profile updated successfully');
        closeModal();
        await loadUsers();
    } catch (error) {
        alert(error.message);
    }
}

async function editFacultyWithSubjectManager(user) {
    const modalContent = document.querySelector('#modal .modal-content');
    if (modalContent) {
        modalContent.classList.add('modal-wide');
    }

    facultySubjectsModalState.userId = user._id;
    facultySubjectsModalState.assignedAll = (user.assignedSubjects || []).map((s) => ({
        _id: s._id || s,
        subjectName: s.subjectName || 'Unknown',
        subjectCode: s.subjectCode || ''
    }));
    facultySubjectsModalState.assigned = { page: 1, hasMore: false, items: [], loading: false, search: '' };
    facultySubjectsModalState.available = { page: 1, hasMore: false, items: [], loading: false, search: '' };

    document.getElementById('modalTitle').textContent = `Edit Faculty - ${user.name}`;
    document.getElementById('modalBody').innerHTML = `
        <form id="editFacultyProfileForm" style="margin-bottom: 12px;">
            <div class="form-row">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="modalFacultyEditName" required>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="modalFacultyEditEmail" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Phone Number</label>
                    <input type="text" id="modalFacultyEditPhone" placeholder="e.g. +91 9876543210">
                </div>
                <div class="form-group">
                    <label>Date of Birth</label>
                    <input type="date" id="modalFacultyEditDob">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Parent Email ID</label>
                    <input type="email" id="modalFacultyEditParentEmail" placeholder="parent@example.com">
                </div>
                <div class="form-group">
                    <label>Parent Numbers (multiple)</label>
                    <input type="text" id="modalFacultyEditParentPhones" placeholder="+91 9876543210, +91 9123456780">
                </div>
            </div>
            <button type="submit" class="btn btn-primary" style="width:auto;">Update Profile</button>
        </form>

        <div class="form-row">
            <div class="form-group" style="flex:1; min-width:320px;">
                <label>Assigned Subjects</label>
                <input type="text" id="facultyAssignedSubjectSearch" placeholder="Search in assigned subjects" onkeydown="if(event.key==='Enter'){loadAssignedFacultySubjects(true)}">
                <div class="table-container" style="margin-top:8px; max-height:260px; overflow:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Code</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="facultyAssignedSubjectsBody"></tbody>
                    </table>
                </div>
                <div style="margin-top:10px; text-align:center;">
                    <button type="button" class="btn btn-secondary" id="facultyAssignedSubjectsLoadMoreBtn" onclick="loadAssignedFacultySubjects(false)" style="display:none;">Load More</button>
                </div>
            </div>

            <div class="form-group" style="flex:1; min-width:320px;">
                <label>Add Subjects (Search)</label>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input type="text" id="facultyAvailableSubjectSearch" placeholder="Search subject name/code" onkeydown="if(event.key==='Enter'){loadAvailableFacultySubjects(true)}">
                    <button type="button" class="btn btn-secondary" onclick="loadAvailableFacultySubjects(true)">Search</button>
                </div>
                <div class="table-container" style="margin-top:8px; max-height:260px; overflow:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Code</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="facultyAvailableSubjectsBody"></tbody>
                    </table>
                </div>
                <div style="margin-top:10px; text-align:center;">
                    <button type="button" class="btn btn-secondary" id="facultyAvailableSubjectsLoadMoreBtn" onclick="loadAvailableFacultySubjects(false)" style="display:none;">Load More</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modalFacultyEditName').value = user.name || '';
    document.getElementById('modalFacultyEditEmail').value = user.email || '';
    document.getElementById('modalFacultyEditPhone').value = user.phone || '';
    document.getElementById('modalFacultyEditDob').value = toDateInputValue(user.dob);
    document.getElementById('modalFacultyEditParentEmail').value = user.parentEmail || '';
    document.getElementById('modalFacultyEditParentPhones').value = getParentPhonesText(user);

    document.getElementById('editFacultyProfileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api.put(`/auth/users/${user._id}`, {
                name: document.getElementById('modalFacultyEditName').value.trim(),
                email: document.getElementById('modalFacultyEditEmail').value.trim(),
                phone: document.getElementById('modalFacultyEditPhone').value.trim(),
                dob: document.getElementById('modalFacultyEditDob').value,
                parentEmail: document.getElementById('modalFacultyEditParentEmail').value.trim(),
                parentPhones: normalizeMultiPhoneInput(document.getElementById('modalFacultyEditParentPhones').value),
                assignedSubjects: facultySubjectsModalState.assignedAll.map((s) => s._id)
            });
            alert('Profile updated successfully');
            await loadFaculty(true);
        } catch (error) {
            alert(error.message);
        }
    });

    document.getElementById('modal').classList.add('active');
    await loadAssignedFacultySubjects(true);
    await loadAvailableFacultySubjects(true);
}

async function loadAssignedFacultySubjects(reset = true) {
    if (facultySubjectsModalState.assigned.loading) return;

    const search = (document.getElementById('facultyAssignedSubjectSearch')?.value || '').trim().toLowerCase();
    if (reset) {
        facultySubjectsModalState.assigned.page = 1;
        facultySubjectsModalState.assigned.items = [];
        facultySubjectsModalState.assigned.search = search;
    }

    facultySubjectsModalState.assigned.loading = true;
    setLoadMoreVisibility('facultyAssignedSubjectsLoadMoreBtn', facultySubjectsModalState.assigned.hasMore, true);

    try {
        const source = facultySubjectsModalState.assignedAll.filter((s) => {
            const term = facultySubjectsModalState.assigned.search;
            if (!term) return true;
            return (s.subjectName || '').toLowerCase().includes(term)
                || (s.subjectCode || '').toLowerCase().includes(term);
        });

        const page = facultySubjectsModalState.assigned.page;
        const limit = 50;
        const start = (page - 1) * limit;
        const incoming = source.slice(start, start + limit);

        facultySubjectsModalState.assigned.items = reset
            ? incoming
            : facultySubjectsModalState.assigned.items.concat(incoming);
        facultySubjectsModalState.assigned.hasMore = start + incoming.length < source.length;

        renderAssignedFacultySubjects(incoming, reset);

        if (facultySubjectsModalState.assigned.hasMore) {
            facultySubjectsModalState.assigned.page += 1;
        }
    } finally {
        facultySubjectsModalState.assigned.loading = false;
        setLoadMoreVisibility('facultyAssignedSubjectsLoadMoreBtn', facultySubjectsModalState.assigned.hasMore, false);
    }
}

function renderAssignedFacultySubjects(subjectItems, reset = true) {
    const rowsHtml = subjectItems.map((s) => `
        <tr>
            <td>${s.subjectName}</td>
            <td>${s.subjectCode || '-'}</td>
            <td><button type="button" class="btn btn-small btn-danger" onclick="removeSubjectFromFaculty('${s._id}')">Remove</button></td>
        </tr>
    `).join('');

    appendRows('#facultyAssignedSubjectsBody', rowsHtml, reset);

    if (reset && !subjectItems.length) {
        const tbody = document.getElementById('facultyAssignedSubjectsBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="text-center">No assigned subjects found</td></tr>';
    }
}

async function loadAvailableFacultySubjects(reset = true) {
    if (!facultySubjectsModalState.userId || facultySubjectsModalState.available.loading) return;

    const search = (document.getElementById('facultyAvailableSubjectSearch')?.value || '').trim();
    if (reset) {
        facultySubjectsModalState.available.page = 1;
        facultySubjectsModalState.available.items = [];
        facultySubjectsModalState.available.search = search;
    }

    facultySubjectsModalState.available.loading = true;
    setLoadMoreVisibility('facultyAvailableSubjectsLoadMoreBtn', facultySubjectsModalState.available.hasMore, true);

    try {
        const params = new URLSearchParams({
            page: String(facultySubjectsModalState.available.page),
            limit: String(50)
        });
        if (facultySubjectsModalState.available.search) {
            params.append('search', facultySubjectsModalState.available.search);
        }

        const data = await api.get(`/subjects?${params.toString()}`);
        const assignedSet = new Set(facultySubjectsModalState.assignedAll.map((s) => String(s._id)));
        const incoming = (data.subjects || []).filter((s) => !assignedSet.has(String(s._id)));

        facultySubjectsModalState.available.items = reset
            ? incoming
            : facultySubjectsModalState.available.items.concat(incoming);
        facultySubjectsModalState.available.hasMore = !!data.pagination?.hasMore;

        renderAvailableFacultySubjects(incoming, reset);

        if (facultySubjectsModalState.available.hasMore) {
            facultySubjectsModalState.available.page += 1;
        }
    } catch (error) {
        console.error('Error loading available faculty subjects:', error);
    } finally {
        facultySubjectsModalState.available.loading = false;
        setLoadMoreVisibility('facultyAvailableSubjectsLoadMoreBtn', facultySubjectsModalState.available.hasMore, false);
    }
}

function renderAvailableFacultySubjects(subjectItems, reset = true) {
    const rowsHtml = subjectItems.map((s) => `
        <tr>
            <td>${s.subjectName}</td>
            <td>${s.subjectCode || '-'}</td>
            <td><button type="button" class="btn btn-small btn-primary" onclick="addSubjectToFaculty('${s._id}')">Add</button></td>
        </tr>
    `).join('');

    appendRows('#facultyAvailableSubjectsBody', rowsHtml, reset);

    if (reset && !subjectItems.length) {
        const tbody = document.getElementById('facultyAvailableSubjectsBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="text-center">No matching subjects found</td></tr>';
    }
}

async function persistFacultyAssignedSubjects() {
    if (!facultySubjectsModalState.userId) return;
    await api.put(`/auth/users/${facultySubjectsModalState.userId}`, {
        assignedSubjects: facultySubjectsModalState.assignedAll.map((s) => s._id)
    });
}

async function addSubjectToFaculty(subjectId) {
    const subject = facultySubjectsModalState.available.items.find((s) => String(s._id) === String(subjectId));
    if (!subject) return;

    if (facultySubjectsModalState.assignedAll.some((s) => String(s._id) === String(subjectId))) return;

    facultySubjectsModalState.assignedAll.push(subject);

    try {
        await persistFacultyAssignedSubjects();
        await Promise.all([
            loadAssignedFacultySubjects(true),
            loadAvailableFacultySubjects(true),
            loadFaculty(true)
        ]);
    } catch (error) {
        alert(error.message);
    }
}

async function removeSubjectFromFaculty(subjectId) {
    facultySubjectsModalState.assignedAll = facultySubjectsModalState.assignedAll
        .filter((s) => String(s._id) !== String(subjectId));

    try {
        await persistFacultyAssignedSubjects();
        await Promise.all([
            loadAssignedFacultySubjects(true),
            loadAvailableFacultySubjects(true),
            loadFaculty(true)
        ]);
    } catch (error) {
        alert(error.message);
    }
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
        await api.delete(`/auth/users/${userId}`);
        await loadUsers();
        await loadOverviewData();
    } catch (error) {
        alert(error.message);
    }
}

function showAddStudentModal() {
    showAddUserModal();
}

function editStudent(studentId) {
    editUser(studentId);
}

function showAddFacultyModal() {
    window.location.href = 'add-faculty.html';
}

  function editFaculty(facultyId) {
    editUser(facultyId);
}

function showAddSubjectModal() {
    document.getElementById('modalTitle').textContent = 'Add Subject';
    document.getElementById('modalBody').innerHTML = `
        <form id="addSubjectForm">
            <div class="form-group">
                <label>Subject Name</label>
                <input type="text" id="modalSubjectName" required>
            </div>
            <div class="form-group">
                <label>Subject Code</label>
                <input type="text" id="modalSubjectCode" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Add Subject</button>
        </form>
    `;

    document.getElementById('addSubjectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const subjectName = document.getElementById('modalSubjectName').value;
        const subjectCode = document.getElementById('modalSubjectCode').value;

        try {
            await api.post('/subjects', { subjectName, subjectCode });
            closeModal();
            await loadSubjects();
            await loadOverviewData();
        } catch (error) {
            alert(error.message);
        }
    });

    document.getElementById('modal').classList.add('active');
}

async function editSubject(subjectId) {
    const subject = subjects.find(s => s._id === subjectId);
    if (!subject) return;

    document.getElementById('modalTitle').textContent = 'Edit Subject';
    document.getElementById('modalBody').innerHTML = `
        <form id="editSubjectForm">
            <div class="form-group">
                <label>Subject Name</label>
                <input type="text" id="modalSubjectName" value="${subject.subjectName}" required>
            </div>
            <div class="form-group">
                <label>Subject Code</label>
                <input type="text" id="modalSubjectCode" value="${subject.subjectCode}" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Update Subject</button>
        </form>
    `;

    document.getElementById('editSubjectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api.put(`/subjects/${subjectId}`, {
                subjectName: document.getElementById('modalSubjectName').value,
                subjectCode: document.getElementById('modalSubjectCode').value
            });
            closeModal();
            await loadSubjects();
        } catch (error) {
            alert(error.message);
        }
    });

    document.getElementById('modal').classList.add('active');
}

async function deleteSubject(subjectId) {
    if (!confirm('Are you sure you want to delete this subject?')) return;

    try {
        await api.delete(`/subjects/${subjectId}`);
        await loadSubjects();
        await loadOverviewData();
    } catch (error) {
        alert(error.message);
    }
}

function showAddClassModal() {
    document.getElementById('modalTitle').textContent = 'Add Class';
    document.getElementById('modalBody').innerHTML = `
        <form id="addClassForm">
            <div class="form-row">
                <div class="form-group">
                    <label>Class Name *</label>
                    <input type="text" id="modalClassName" required placeholder="e.g., CSE A">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Department *</label>
                    <input type="text" id="modalClassDept" list="modalClassDeptList" required placeholder="Enter or pick department">
                    <datalist id="modalClassDeptList">
                        ${managedDepartments.map((d) => `<option value="${escapeHtml(d)}"></option>`).join('')}
                    </datalist>
                </div>
                <div class="form-group">
                    <label>Year *</label>
                    <select id="modalClassYear" required>
                        <option value="">Select Year</option>
                        <option value="1">1st Year</option>
                        <option value="2">2nd Year</option>
                        <option value="3">3rd Year</option>
                        <option value="4">4th Year</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Batch</label>
                    <select id="modalClassBatch">
                        <option value="">No Batch</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Subjects</label>
                <select id="modalSubjects" multiple style="height: 120px;">
                    ${subjects.map(s => `<option value="${s._id}">${s.subjectName}</option>`).join('')}
                </select>
                <small>Hold Ctrl/Cmd to select multiple</small>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Add Class</button>
        </form>
    `;

    document.getElementById('addClassForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const className = document.getElementById('modalClassName').value;
        const department = document.getElementById('modalClassDept').value;
        const year = document.getElementById('modalClassYear').value;
        const batch = document.getElementById('modalClassBatch').value;
        const selectedSubjects = Array.from(document.getElementById('modalSubjects').selectedOptions)
            .map(opt => opt.value);

        try {
            await api.post('/classes', { 
                className, 
                department, 
                year: parseInt(year),
                batch,
                assignedSubjectIds: selectedSubjects 
            });
            closeModal();
            await loadClasses();
            await loadOverviewData();
        } catch (error) {
            alert(error.message);
        }
    });

    document.getElementById('modal').classList.add('active');
}

async function editClass(classId) {
    const cls = classes.find(c => c._id === classId);
    if (!cls) return;

    const modalContent = document.querySelector('#modal .modal-content');
    if (modalContent) {
        modalContent.classList.add('modal-wide');
    }

    document.getElementById('modalTitle').textContent = `Edit Class - ${cls.className}`;
    document.getElementById('modalBody').innerHTML = `
        <form id="editClassNameForm" style="margin-bottom:12px;">
            <div class="form-row">
                <div class="form-group">
                    <label>Class Name</label>
                    <input type="text" id="modalClassName" value="${cls.className}" required>
                </div>
                <div class="form-group" style="display:flex; align-items:flex-end;">
                    <button type="submit" class="btn btn-primary" style="width:auto;">Update Name</button>
                </div>
            </div>
        </form>

        <div class="form-row">
            <div class="form-group" style="flex:1; min-width:320px;">
                <label>Assigned Subjects</label>
                <input type="text" id="classAssignedSubjectSearch" placeholder="Search in assigned subjects" onkeydown="if(event.key==='Enter'){loadAssignedClassSubjects(true)}">
                <div class="table-container" style="margin-top:8px; max-height:260px; overflow:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Code</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="assignedClassSubjectsBody"></tbody>
                    </table>
                </div>
                <div style="margin-top:10px; text-align:center;">
                    <button type="button" class="btn btn-secondary" id="assignedSubjectsLoadMoreBtn" onclick="loadAssignedClassSubjects(false)" style="display:none;">Load More</button>
                </div>
            </div>

            <div class="form-group" style="flex:1; min-width:320px;">
                <label>Add Subjects (Search)</label>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input type="text" id="classAvailableSubjectSearch" placeholder="Search subject name/code" onkeydown="if(event.key==='Enter'){loadAvailableSubjectsForClass(true)}">
                    <button type="button" class="btn btn-secondary" onclick="loadAvailableSubjectsForClass(true)">Search</button>
                </div>
                <div class="table-container" style="margin-top:8px; max-height:260px; overflow:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Code</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="availableClassSubjectsBody"></tbody>
                    </table>
                </div>
                <div style="margin-top:10px; text-align:center;">
                    <button type="button" class="btn btn-secondary" id="availableSubjectsLoadMoreBtn" onclick="loadAvailableSubjectsForClass(false)" style="display:none;">Load More</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('editClassNameForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const className = document.getElementById('modalClassName').value.trim();
        if (!className) return;

        try {
            await api.put(`/classes/${classId}`, { className });
            await loadClasses(true);
        } catch (error) {
            alert(error.message);
        }
    });

    classSubjectsModalState.classId = classId;
    classSubjectsModalState.assigned = { page: 1, hasMore: false, items: [], loading: false, search: '' };
    classSubjectsModalState.available = { page: 1, hasMore: false, items: [], loading: false, search: '' };

    document.getElementById('modal').classList.add('active');
    await loadAssignedClassSubjects(true);
    await loadAvailableSubjectsForClass(true);
}

async function loadAssignedClassSubjects(reset = true) {
    if (!classSubjectsModalState.classId || classSubjectsModalState.assigned.loading) return;

    const search = (document.getElementById('classAssignedSubjectSearch')?.value || '').trim();
    if (reset) {
        classSubjectsModalState.assigned.page = 1;
        classSubjectsModalState.assigned.items = [];
        classSubjectsModalState.assigned.search = search;
    }

    classSubjectsModalState.assigned.loading = true;
    setLoadMoreVisibility('assignedSubjectsLoadMoreBtn', classSubjectsModalState.assigned.hasMore, true);

    try {
        const params = new URLSearchParams({
            page: String(classSubjectsModalState.assigned.page),
            limit: String(50)
        });
        if (classSubjectsModalState.assigned.search) {
            params.append('search', classSubjectsModalState.assigned.search);
        }

        const data = await api.get(`/classes/${classSubjectsModalState.classId}/subjects?${params.toString()}`);
        const incoming = data.subjects || [];

        classSubjectsModalState.assigned.items = reset
            ? incoming
            : classSubjectsModalState.assigned.items.concat(incoming);
        classSubjectsModalState.assigned.hasMore = !!data.pagination?.hasMore;

        renderAssignedClassSubjects(incoming, reset);

        if (classSubjectsModalState.assigned.hasMore) {
            classSubjectsModalState.assigned.page += 1;
        }
    } catch (error) {
        console.error('Error loading assigned subjects:', error);
    } finally {
        classSubjectsModalState.assigned.loading = false;
        setLoadMoreVisibility('assignedSubjectsLoadMoreBtn', classSubjectsModalState.assigned.hasMore, false);
    }
}

function renderAssignedClassSubjects(subjectItems, reset = true) {
    const rowsHtml = subjectItems.map((s) => `
        <tr>
            <td>${s.subjectName}</td>
            <td>${s.subjectCode}</td>
            <td><button type="button" class="btn btn-small btn-danger" onclick="removeSubjectFromClass('${s._id}')">Remove</button></td>
        </tr>
    `).join('');

    appendRows('#assignedClassSubjectsBody', rowsHtml, reset);

    if (reset && !subjectItems.length) {
        const tbody = document.getElementById('assignedClassSubjectsBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="text-center">No assigned subjects found</td></tr>';
    }
}

async function loadAvailableSubjectsForClass(reset = true) {
    if (!classSubjectsModalState.classId || classSubjectsModalState.available.loading) return;

    const search = (document.getElementById('classAvailableSubjectSearch')?.value || '').trim();
    if (reset) {
        classSubjectsModalState.available.page = 1;
        classSubjectsModalState.available.items = [];
        classSubjectsModalState.available.search = search;
    }

    classSubjectsModalState.available.loading = true;
    setLoadMoreVisibility('availableSubjectsLoadMoreBtn', classSubjectsModalState.available.hasMore, true);

    try {
        const params = new URLSearchParams({
            page: String(classSubjectsModalState.available.page),
            limit: String(50)
        });
        if (classSubjectsModalState.available.search) {
            params.append('search', classSubjectsModalState.available.search);
        }

        const data = await api.get(`/subjects?${params.toString()}`);
        const assignedSet = new Set(classSubjectsModalState.assigned.items.map((s) => s._id));
        const incoming = (data.subjects || []).filter((s) => !assignedSet.has(s._id));

        classSubjectsModalState.available.items = reset
            ? incoming
            : classSubjectsModalState.available.items.concat(incoming);
        classSubjectsModalState.available.hasMore = !!data.pagination?.hasMore;

        renderAvailableClassSubjects(incoming, reset);

        if (classSubjectsModalState.available.hasMore) {
            classSubjectsModalState.available.page += 1;
        }
    } catch (error) {
        console.error('Error loading available subjects:', error);
    } finally {
        classSubjectsModalState.available.loading = false;
        setLoadMoreVisibility('availableSubjectsLoadMoreBtn', classSubjectsModalState.available.hasMore, false);
    }
}

function renderAvailableClassSubjects(subjectItems, reset = true) {
    const rowsHtml = subjectItems.map((s) => `
        <tr>
            <td>${s.subjectName}</td>
            <td>${s.subjectCode}</td>
            <td><button type="button" class="btn btn-small btn-primary" onclick="addSubjectToClass('${s._id}')">Add</button></td>
        </tr>
    `).join('');

    appendRows('#availableClassSubjectsBody', rowsHtml, reset);

    if (reset && !subjectItems.length) {
        const tbody = document.getElementById('availableClassSubjectsBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="text-center">No matching subjects found</td></tr>';
    }
}

async function addSubjectToClass(subjectId) {
    if (!classSubjectsModalState.classId) return;
    try {
        await api.post(`/classes/${classSubjectsModalState.classId}/subjects`, { subjectIds: [subjectId] });
        await Promise.all([
            loadAssignedClassSubjects(true),
            loadAvailableSubjectsForClass(true),
            loadClasses(true),
            loadOverviewData()
        ]);
    } catch (error) {
        alert(error.message);
    }
}

async function removeSubjectFromClass(subjectId) {
    if (!classSubjectsModalState.classId) return;
    try {
        await api.delete(`/classes/${classSubjectsModalState.classId}/subjects/${subjectId}`);
        await Promise.all([
            loadAssignedClassSubjects(true),
            loadAvailableSubjectsForClass(true),
            loadClasses(true),
            loadOverviewData()
        ]);
    } catch (error) {
        alert(error.message);
    }
}

async function manageClassStudents(classId) {
    const cls = classes.find(c => c._id === classId);
    if (!cls) return;

    try {
        const modalContent = document.querySelector('#modal .modal-content');
        if (modalContent) {
            modalContent.classList.add('modal-wide');
        }

        document.getElementById('modalTitle').textContent = `Manage Students - ${cls.className}`;
        document.getElementById('modalBody').innerHTML = `
            <div class="form-row">
                <div class="form-group" style="flex:1; min-width:320px;">
                    <label>Assigned Students</label>
                    <input type="text" id="classAssignedSearch" placeholder="Search in assigned students" onkeydown="if(event.key==='Enter'){loadAssignedClassStudents(true)}">
                    <div class="table-container" style="margin-top:8px; max-height:260px; overflow:auto;">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email / ID</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="assignedClassStudentsBody"></tbody>
                        </table>
                    </div>
                    <div style="margin-top:10px; text-align:center;">
                        <button type="button" class="btn btn-secondary" id="assignedStudentsLoadMoreBtn" onclick="loadAssignedClassStudents(false)" style="display:none;">Load More</button>
                    </div>
                </div>

                <div class="form-group" style="flex:1; min-width:320px;">
                    <label>Add Students (Search)</label>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input type="text" id="classAvailableSearch" placeholder="Search name, email, unique ID" onkeydown="if(event.key==='Enter'){loadAvailableStudentsForClass(true)}">
                        <button type="button" class="btn btn-secondary" onclick="loadAvailableStudentsForClass(true)">Search</button>
                    </div>
                    <div class="table-container" style="margin-top:8px; max-height:260px; overflow:auto;">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email / ID</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="availableClassStudentsBody"></tbody>
                        </table>
                    </div>
                    <div style="margin-top:10px; text-align:center;">
                        <button type="button" class="btn btn-secondary" id="availableStudentsLoadMoreBtn" onclick="loadAvailableStudentsForClass(false)" style="display:none;">Load More</button>
                    </div>
                    <small>Tip: Search first to avoid loading a huge student list.</small>
                </div>
            </div>
        `;

        classStudentsModalState.classId = classId;
        classStudentsModalState.assigned = { page: 1, hasMore: false, items: [], loading: false, search: '' };
        classStudentsModalState.available = { page: 1, hasMore: false, items: [], loading: false, search: '' };

        document.getElementById('modal').classList.add('active');

        await loadAssignedClassStudents(true);
        await loadAvailableStudentsForClass(true);
    } catch (error) {
        console.error('Error loading class students:', error);
    }
}

async function loadAssignedClassStudents(reset = true) {
    if (!classStudentsModalState.classId || classStudentsModalState.assigned.loading) return;

    const search = (document.getElementById('classAssignedSearch')?.value || '').trim();
    if (reset) {
        classStudentsModalState.assigned.page = 1;
        classStudentsModalState.assigned.items = [];
        classStudentsModalState.assigned.search = search;
    }

    classStudentsModalState.assigned.loading = true;
    setLoadMoreVisibility('assignedStudentsLoadMoreBtn', classStudentsModalState.assigned.hasMore, true);

    try {
        const params = new URLSearchParams({
            page: String(classStudentsModalState.assigned.page),
            limit: String(50)
        });
        if (classStudentsModalState.assigned.search) {
            params.append('search', classStudentsModalState.assigned.search);
        }

        const data = await api.get(`/classes/${classStudentsModalState.classId}/students?${params.toString()}`);
        const incoming = data.students || [];

        classStudentsModalState.assigned.items = reset
            ? incoming
            : classStudentsModalState.assigned.items.concat(incoming);
        classStudentsModalState.assigned.hasMore = !!data.pagination?.hasMore;

        renderAssignedClassStudents(incoming, reset);

        if (classStudentsModalState.assigned.hasMore) {
            classStudentsModalState.assigned.page += 1;
        }
    } catch (error) {
        console.error('Error loading assigned students:', error);
    } finally {
        classStudentsModalState.assigned.loading = false;
        setLoadMoreVisibility('assignedStudentsLoadMoreBtn', classStudentsModalState.assigned.hasMore, false);
    }
}

function renderAssignedClassStudents(studentsData, reset = true) {
    const rowsHtml = studentsData.map((s) => `
        <tr>
            <td>${s.name}</td>
            <td>${s.email}<br><small>${s.uniqueId || '-'}</small></td>
            <td><button type="button" class="btn btn-small btn-danger" onclick="removeStudentFromClass('${s._id}')">Remove</button></td>
        </tr>
    `).join('');

    appendRows('#assignedClassStudentsBody', rowsHtml, reset);

    if (reset && !studentsData.length) {
        const tbody = document.getElementById('assignedClassStudentsBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="text-center">No assigned students found</td></tr>';
    }
}

async function loadAvailableStudentsForClass(reset = true) {
    if (!classStudentsModalState.classId || classStudentsModalState.available.loading) return;

    const search = (document.getElementById('classAvailableSearch')?.value || '').trim();
    if (reset) {
        classStudentsModalState.available.page = 1;
        classStudentsModalState.available.items = [];
        classStudentsModalState.available.search = search;
    }

    classStudentsModalState.available.loading = true;
    setLoadMoreVisibility('availableStudentsLoadMoreBtn', classStudentsModalState.available.hasMore, true);

    try {
        const params = new URLSearchParams({
            role: 'student',
            page: String(classStudentsModalState.available.page),
            limit: String(50)
        });
        if (classStudentsModalState.available.search) {
            params.append('search', classStudentsModalState.available.search);
        }

        const data = await api.get(`/auth/users?${params.toString()}`);
        const assignedSet = new Set(classStudentsModalState.assigned.items.map((s) => s._id));
        const incoming = (data.users || []).filter((s) => !assignedSet.has(s._id));

        classStudentsModalState.available.items = reset
            ? incoming
            : classStudentsModalState.available.items.concat(incoming);
        classStudentsModalState.available.hasMore = !!data.pagination?.hasMore;

        renderAvailableClassStudents(incoming, reset);

        if (classStudentsModalState.available.hasMore) {
            classStudentsModalState.available.page += 1;
        }
    } catch (error) {
        console.error('Error loading available students:', error);
    } finally {
        classStudentsModalState.available.loading = false;
        setLoadMoreVisibility('availableStudentsLoadMoreBtn', classStudentsModalState.available.hasMore, false);
    }
}

function renderAvailableClassStudents(studentsData, reset = true) {
    const rowsHtml = studentsData.map((s) => `
        <tr>
            <td>${s.name}</td>
            <td>${s.email}<br><small>${s.uniqueId || '-'}${s.assignedClass?.className ? ` | In: ${s.assignedClass.className}` : ' | Unassigned'}</small></td>
            <td><button type="button" class="btn btn-small btn-primary" onclick="addStudentToClass('${s._id}')">Add</button></td>
        </tr>
    `).join('');

    appendRows('#availableClassStudentsBody', rowsHtml, reset);

    if (reset && !studentsData.length) {
        const tbody = document.getElementById('availableClassStudentsBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="text-center">No matching unassigned students</td></tr>';
    }
}

async function addStudentToClass(studentId) {
    if (!classStudentsModalState.classId) return;
    try {
        await api.post(`/classes/${classStudentsModalState.classId}/students`, { studentIds: [studentId] });
        await Promise.all([
            loadAssignedClassStudents(true),
            loadAvailableStudentsForClass(true),
            loadClasses(true),
            loadOverviewData()
        ]);
    } catch (error) {
        alert(error.message);
    }
}

async function removeStudentFromClass(studentId) {
    if (!classStudentsModalState.classId) return;
    try {
        await api.delete(`/classes/${classStudentsModalState.classId}/students/${studentId}`);
        await Promise.all([
            loadAssignedClassStudents(true),
            loadAvailableStudentsForClass(true),
            loadClasses(true),
            loadOverviewData()
        ]);
    } catch (error) {
        alert(error.message);
    }
}

async function deleteClass(classId) {
    if (!confirm('Are you sure you want to delete this class?')) return;

    try {
        await api.delete(`/classes/${classId}`);
        await loadClasses();
        await loadOverviewData();
    } catch (error) {
        alert(error.message);
    }
}

function updateTimetableClassInfo() {
    const classSelect = document.getElementById('modalTimetableClass');
    if (!classSelect) return;
    const selectedOption = classSelect.options[classSelect.selectedIndex];
    
    if (selectedOption.value) {
        document.getElementById('modalTimetableDept').value = selectedOption.dataset.dept || '';
        document.getElementById('modalTimetableYear').value = selectedOption.dataset.year || '';
        document.getElementById('modalTimetableBatch').value = selectedOption.dataset.batch || '';
    } else {
        document.getElementById('modalTimetableDept').value = '';
        document.getElementById('modalTimetableYear').value = '';
        document.getElementById('modalTimetableBatch').value = '';
    }
}

async function deleteTimetable(timetableId, closeAfterDelete = false) {
    if (!confirm('Are you sure you want to delete this timetable entry?')) return;

    try {
        await api.delete(`/timetable/${timetableId}`);
        if (closeAfterDelete) {
            closeModal();
        }
        await loadTimetable();
    } catch (error) {
        alert(error.message);
    }
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
    const modalContent = document.querySelector('#modal .modal-content');
    if (modalContent) {
        modalContent.classList.remove('modal-wide');
    }
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeModal();
    }
});

// Audit Log Functions
let auditPage = 1;
const auditLimit = 20;

async function loadAuditLogs(page = 1) {
    auditPage = page;
    const action = document.getElementById('auditActionFilter').value;
    const startDate = document.getElementById('auditStartDate').value;
    const endDate = document.getElementById('auditEndDate').value;

    let url = `/audit?page=${page}&limit=${auditLimit}`;
    if (action) url += `&action=${action}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;

    try {
        const data = await api.get(url);
        renderAuditTable(data.logs);
        renderAuditPagination(data.pagination);
        loadAuditStats();
    } catch (error) {
        console.error('Error loading audit logs:', error);
    }
}

async function loadAuditStats() {
    try {
        const stats = await api.get('/audit/stats');
        document.getElementById('todayLogs').textContent = stats.todayLogs;
        document.getElementById('weekLogs').textContent = stats.weekLogs;
    } catch (error) {
        console.error('Error loading audit stats:', error);
    }
}

function renderAuditTable(logs) {
    const tbody = document.querySelector('#auditTable tbody');
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No audit logs found</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(log => `
        <tr>
            <td>${formatAuditDate(log.timestamp)}</td>
            <td>${log.userName || 'System'}</td>
            <td><span class="badge badge-${log.userRole}">${log.userRole}</span></td>
            <td><span class="action-badge action-${log.action.toLowerCase()}">${formatAction(log.action)}</span></td>
            <td class="details-cell" title="${log.details}">${log.details}</td>
            <td>${log.ipAddress}</td>
            <td><span class="status-badge status-${log.status.toLowerCase()}">${log.status}</span></td>
        </tr>
    `).join('');
}

function formatAuditDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatAction(action) {
    const actionMap = {
        'LOGIN': 'Login',
        'LOGOUT': 'Logout',
        'LOGIN_FAILED': 'Login Failed',
        'MARK_ATTENDANCE': 'Mark Attendance',
        'UPDATE_ATTENDANCE': 'Update Attendance',
        'CREATE': 'Create',
        'UPDATE': 'Update',
        'DELETE': 'Delete'
    };
    return actionMap[action] || action;
}

function renderAuditPagination(pagination) {
    const container = document.getElementById('auditPagination');
    if (pagination.pages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    if (pagination.page > 1) {
        html += `<button class="btn btn-small btn-secondary" onclick="loadAuditLogs(${pagination.page - 1})">Previous</button>`;
    }
    html += `<span class="page-info">Page ${pagination.page} of ${pagination.pages}</span>`;
    if (pagination.page < pagination.pages) {
        html += `<button class="btn btn-small btn-secondary" onclick="loadAuditLogs(${pagination.page + 1})">Next</button>`;
    }
    container.innerHTML = html;
}

function resetAuditFilters() {
    document.getElementById('auditActionFilter').value = '';
    document.getElementById('auditStartDate').value = '';
    document.getElementById('auditEndDate').value = '';
    loadAuditLogs(1);
}

const originalLoadPageData = loadPageData;
loadPageData = async function(page) {
    await originalLoadPageData(page);
    if (page === 'audit') {
        loadAuditLogs(1);
    }
    if (page === 'security') {
        loadSecurityData();
    }
};

// Dashboard Customization
function enableDashboardCustomization() {
    const grid = document.querySelector('.stats-grid');
    if (!grid) return;

    // Make items draggable
    // Simple drag and drop logic
    let draggedItem = null;

    grid.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('stat-card')) {
            draggedItem = e.target;
            setTimeout(() => {
                e.target.style.opacity = '0.5';
            }, 0);
        }
    });

    grid.addEventListener('dragend', (e) => {
        if (draggedItem) {
            setTimeout(() => {
                draggedItem.style.opacity = '1';
                draggedItem = null;
                saveWidgetOrder();
            }, 0);
        }
    });

    grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(grid, e.clientY);
        if (afterElement == null) {
            grid.appendChild(draggedItem);
        } else {
            grid.insertBefore(draggedItem, afterElement);
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.stat-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveWidgetOrder() {
    const grid = document.querySelector('.stats-grid');
    const widgetOrder = [...grid.querySelectorAll('.stat-card')].map(card => card.id);
    try {
        await api.put('/user/dashboard-settings', { widgetOrder });
    } catch (error) {
        console.error('Failed to save widget order:', error);
    }
}

async function applyDashboardSettings() {
    const user = await getCurrentUser(true); // Force refresh
    const settings = user.dashboardSettings || {};
    
    if (settings.widgetOrder) {
        const grid = document.querySelector('.stats-grid');
        const widgets = new Map();
        grid.querySelectorAll('.stat-card').forEach(widget => {
            widgets.set(widget.id, widget);
        });

        // Remove all widgets
        while (grid.firstChild) {
            grid.removeChild(grid.firstChild);
        }

        // Append in saved order
        settings.widgetOrder.forEach(widgetId => {
            if (widgets.has(widgetId)) {
                grid.appendChild(widgets.get(widgetId));
            }
        });
    }
}

async function loadAnnouncements() {
    try {
        const response = await api.get('/announcements');
        const banner = document.getElementById('announcementBanner');
        if (banner) {
            if (response.announcements && response.announcements.length > 0) {
                const announcements = response.announcements.slice(0, 3);
                banner.innerHTML = `
                    <div class="announcement-banner-head">
                        <h3>Latest Announcements</h3>
                        <span class="announcement-count">${announcements.length}</span>
                    </div>
                    <div class="announcement-list-grid">
                        ${announcements.map(ann => `
                            <div class="announcement">
                                <button type="button" class="announcement-close-btn" aria-label="Close announcement" onclick="dismissAnnouncementCard(this)">x</button>
                                <h4>${escapeHtml(ann.title)}</h4>
                                <p>${escapeHtml(ann.content)}</p>
                                <div class="announcement-meta">
                                    Posted by ${escapeHtml(ann.createdBy?.name || 'Unknown')} on ${new Date(ann.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="announcement-banner-actions">
                        <a class="btn btn-secondary btn-small" href="announcements.html">View All</a>
                    </div>
                `;
                banner.style.display = 'block';
            } else {
                banner.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Failed to load announcements:', error);
    }
}

function dismissAnnouncementCard(button) {
    const card = button?.closest('.announcement');
    const banner = document.getElementById('announcementBanner');
    if (!card || !banner) return;

    card.remove();
    if (!banner.querySelector('.announcement')) {
        banner.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadOverviewData();
    await loadAnnouncements();
    await applyDashboardSettings();
    enableDashboardCustomization();
});






