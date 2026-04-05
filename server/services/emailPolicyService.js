const AppSetting = require('../models/AppSetting');

const ADMIN_CONFIG_SETTING_KEY = 'adminConfig';

const EMAIL_TRIGGER_DEFAULTS = {
  leaveApproved: true,
  leaveRejected: true,
  attendanceAbsent: true,
  lowAttendanceAuto: true,
  passwordReset: true,
  adminPasswordReset: true,
  customTemplated: true,
};

const DEFAULT_EMAIL_CUSTOMIZATION = {
  timezone: 'Asia/Kolkata',
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '07:00',
  },
  retryPolicy: {
    enabled: false,
    maxRetries: 2,
  },
};

const DEFAULT_ATTENDANCE_RULES = {
  globalLowAttendanceThreshold: 75,
};

const DEFAULT_COMMUNICATION_RULES = {
  approvalWorkflowEnabled: false,
  defaultVisibilityDays: 7,
  autoDeleteAfterDays: 90,
  applyToAnnouncements: true,
  applyToDirectMessages: true,
};

const DEFAULT_ADMIN_CONFIG = {
  defaultUserPassword: 'password',
  emailTriggers: EMAIL_TRIGGER_DEFAULTS,
  emailCustomization: DEFAULT_EMAIL_CUSTOMIZATION,
  attendanceRules: DEFAULT_ATTENDANCE_RULES,
  communicationRules: DEFAULT_COMMUNICATION_RULES,
};

function parseTimeText(value, fallback) {
  const text = String(value || '').trim();
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
    return fallback;
  }
  return text;
}

function parseBoundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function isValidTimezone(tz) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch (_error) {
    return false;
  }
}

function normalizeEmailTriggerSettings(value) {
  const incoming = value && typeof value === 'object' ? value : {};
  const normalized = {};

  for (const [key, defaultValue] of Object.entries(EMAIL_TRIGGER_DEFAULTS)) {
    if (typeof incoming[key] === 'boolean') {
      normalized[key] = incoming[key];
    } else {
      normalized[key] = defaultValue;
    }
  }

  return normalized;
}

function normalizeEmailCustomization(value) {
  const incoming = value && typeof value === 'object' ? value : {};
  const incomingQuiet = incoming.quietHours && typeof incoming.quietHours === 'object'
    ? incoming.quietHours
    : {};
  const incomingRetry = incoming.retryPolicy && typeof incoming.retryPolicy === 'object'
    ? incoming.retryPolicy
    : {};

  return {
    timezone: isValidTimezone(incoming.timezone)
      ? incoming.timezone
      : DEFAULT_EMAIL_CUSTOMIZATION.timezone,
    quietHours: {
      enabled: typeof incomingQuiet.enabled === 'boolean'
        ? incomingQuiet.enabled
        : DEFAULT_EMAIL_CUSTOMIZATION.quietHours.enabled,
      start: parseTimeText(incomingQuiet.start, DEFAULT_EMAIL_CUSTOMIZATION.quietHours.start),
      end: parseTimeText(incomingQuiet.end, DEFAULT_EMAIL_CUSTOMIZATION.quietHours.end),
    },
    retryPolicy: {
      enabled: typeof incomingRetry.enabled === 'boolean'
        ? incomingRetry.enabled
        : DEFAULT_EMAIL_CUSTOMIZATION.retryPolicy.enabled,
      maxRetries: Math.round(
        parseBoundedNumber(incomingRetry.maxRetries, DEFAULT_EMAIL_CUSTOMIZATION.retryPolicy.maxRetries, 0, 10)
      ),
    },
  };
}

function normalizeAttendanceRules(value) {
  const incoming = value && typeof value === 'object' ? value : {};
  return {
    globalLowAttendanceThreshold: parseBoundedNumber(
      incoming.globalLowAttendanceThreshold,
      DEFAULT_ATTENDANCE_RULES.globalLowAttendanceThreshold,
      0,
      100
    ),
  };
}

function normalizeCommunicationRules(value) {
  const incoming = value && typeof value === 'object' ? value : {};
  return {
    approvalWorkflowEnabled: typeof incoming.approvalWorkflowEnabled === 'boolean'
      ? incoming.approvalWorkflowEnabled
      : DEFAULT_COMMUNICATION_RULES.approvalWorkflowEnabled,
    defaultVisibilityDays: Math.round(
      parseBoundedNumber(incoming.defaultVisibilityDays, DEFAULT_COMMUNICATION_RULES.defaultVisibilityDays, 1, 365)
    ),
    autoDeleteAfterDays: Math.round(
      parseBoundedNumber(incoming.autoDeleteAfterDays, DEFAULT_COMMUNICATION_RULES.autoDeleteAfterDays, 1, 3650)
    ),
    applyToAnnouncements: typeof incoming.applyToAnnouncements === 'boolean'
      ? incoming.applyToAnnouncements
      : DEFAULT_COMMUNICATION_RULES.applyToAnnouncements,
    applyToDirectMessages: typeof incoming.applyToDirectMessages === 'boolean'
      ? incoming.applyToDirectMessages
      : DEFAULT_COMMUNICATION_RULES.applyToDirectMessages,
  };
}

function normalizeAdminConfig(value) {
  const incoming = value && typeof value === 'object' ? value : {};
  const defaultUserPassword = String(incoming.defaultUserPassword || '').trim() || DEFAULT_ADMIN_CONFIG.defaultUserPassword;

  return {
    defaultUserPassword,
    emailTriggers: normalizeEmailTriggerSettings(incoming.emailTriggers),
    emailCustomization: normalizeEmailCustomization(incoming.emailCustomization),
    attendanceRules: normalizeAttendanceRules(incoming.attendanceRules),
    communicationRules: normalizeCommunicationRules(incoming.communicationRules),
  };
}

function getLocalMinutesInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return (hour * 60) + minute;
}

function parseMinutesFromTimeText(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map((v) => Number(v));
  return (hours * 60) + minutes;
}

function isNowWithinQuietHours({ now = new Date(), timezone, start, end }) {
  const localMinutes = getLocalMinutesInTimezone(now, timezone);
  const startMinutes = parseMinutesFromTimeText(start);
  const endMinutes = parseMinutesFromTimeText(end);

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return localMinutes >= startMinutes && localMinutes < endMinutes;
  }

  return localMinutes >= startMinutes || localMinutes < endMinutes;
}

async function getAdminConfigSetting() {
  const setting = await AppSetting.findOne({ key: ADMIN_CONFIG_SETTING_KEY }).select('value');
  return normalizeAdminConfig(setting?.value);
}

async function getEmailTriggerSettings() {
  const config = await getAdminConfigSetting();
  return config.emailTriggers;
}

async function isAutomaticEmailEnabled(triggerKey) {
  const settings = await getEmailTriggerSettings();
  if (!Object.prototype.hasOwnProperty.call(settings, triggerKey)) {
    return true;
  }
  return !!settings[triggerKey];
}

async function evaluateAutomaticEmailPolicy(triggerKey) {
  const config = await getAdminConfigSetting();
  const enabled = !Object.prototype.hasOwnProperty.call(config.emailTriggers, triggerKey)
    ? true
    : !!config.emailTriggers[triggerKey];

  if (!enabled) {
    return {
      allowed: false,
      reason: 'disabled-by-trigger-setting',
      config,
    };
  }

  const quietHours = config.emailCustomization.quietHours;
  if (quietHours.enabled) {
    const inQuietHours = isNowWithinQuietHours({
      now: new Date(),
      timezone: config.emailCustomization.timezone,
      start: quietHours.start,
      end: quietHours.end,
    });

    if (inQuietHours) {
      return {
        allowed: false,
        reason: 'within-quiet-hours',
        config,
      };
    }
  }

  return {
    allowed: true,
    reason: '',
    config,
  };
}

module.exports = {
  ADMIN_CONFIG_SETTING_KEY,
  EMAIL_TRIGGER_DEFAULTS,
  DEFAULT_EMAIL_CUSTOMIZATION,
  DEFAULT_ATTENDANCE_RULES,
  DEFAULT_COMMUNICATION_RULES,
  DEFAULT_ADMIN_CONFIG,
  normalizeEmailTriggerSettings,
  normalizeEmailCustomization,
  normalizeAttendanceRules,
  normalizeCommunicationRules,
  normalizeAdminConfig,
  getAdminConfigSetting,
  getEmailTriggerSettings,
  isAutomaticEmailEnabled,
  evaluateAutomaticEmailPolicy,
};
