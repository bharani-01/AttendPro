const { User } = require('../models');
const { Class } = require('../models');
const AppSetting = require('../models/AppSetting');
const {
  normalizeAdminConfig,
  ADMIN_CONFIG_SETTING_KEY,
} = require('../services/emailPolicyService');
const { getEmailAttemptStats } = require('../services/emailEventService');
const {
  EMAIL_TEMPLATE_SETTING_KEY,
  getEmailTemplateCatalog,
  getTemplateOverrides,
  normalizeTemplateOverrides,
  sendTemplatedEmail,
  renderTemplateString,
} = require('../services/emailService');

const DEPARTMENTS_SETTING_KEY = 'managedDepartments';

function normalizeDepartmentName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function sortUniqueDepartments(items) {
  const unique = new Set(
    (items || [])
      .map(normalizeDepartmentName)
      .filter(Boolean)
  );
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

const settingsController = {
  async getAdminConfig(req, res) {
    try {
      const setting = await AppSetting.findOne({ key: ADMIN_CONFIG_SETTING_KEY });
      const config = normalizeAdminConfig(setting?.value);
      return res.json(config);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to get admin config: ' + error.message });
    }
  },

  async saveAdminConfig(req, res) {
    try {
      const existingSetting = await AppSetting.findOne({ key: ADMIN_CONFIG_SETTING_KEY });
      const existingValue = normalizeAdminConfig(existingSetting?.value);

      const incomingMerged = {
        ...existingValue,
        ...(req.body && typeof req.body === 'object' ? req.body : {}),
      };

      const normalizedConfig = normalizeAdminConfig(incomingMerged);
      const incomingPassword = String(normalizedConfig.defaultUserPassword || '').trim();

      if (!incomingPassword) {
        return res.status(400).json({ error: 'defaultUserPassword is required' });
      }

      await AppSetting.findOneAndUpdate(
        { key: ADMIN_CONFIG_SETTING_KEY },
        {
          $set: {
            key: ADMIN_CONFIG_SETTING_KEY,
            value: normalizedConfig,
            updatedBy: req.user._id,
          },
        },
        { upsert: true, new: true }
      );

      return res.json({
        message: 'Admin config saved',
        ...normalizedConfig,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to save admin config: ' + error.message });
    }
  },

  async getEmailStats(_req, res) {
    try {
      const stats = await getEmailAttemptStats();
      return res.json(stats);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to get email stats: ' + error.message });
    }
  },

  async getEmailTemplates(_req, res) {
    try {
      const [catalog, overrides] = await Promise.all([
        Promise.resolve(getEmailTemplateCatalog()),
        getTemplateOverrides(),
      ]);

      const templates = catalog.map((item) => ({
        ...item,
        override: overrides[item.templateKey] || { enabled: false, subject: '', bodyHtml: '' },
      }));

      return res.json({ templates });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch email templates: ' + error.message });
    }
  },

  async saveEmailTemplates(req, res) {
    try {
      const incomingOverrides = normalizeTemplateOverrides(req.body?.overrides);

      await AppSetting.findOneAndUpdate(
        { key: EMAIL_TEMPLATE_SETTING_KEY },
        {
          $set: {
            key: EMAIL_TEMPLATE_SETTING_KEY,
            value: incomingOverrides,
            updatedBy: req.user._id,
          },
        },
        { upsert: true, new: true }
      );

      return res.json({
        message: 'Email templates saved',
        overrides: incomingOverrides,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to save email templates: ' + error.message });
    }
  },

  async testEmailTemplate(req, res) {
    try {
      const { to, templateKey, variables, subject, bodyHtml } = req.body || {};
      const recipient = String(to || '').trim().toLowerCase();
      const selectedTemplate = String(templateKey || '').trim();

      if (!recipient) {
        return res.status(400).json({ error: 'Recipient email is required' });
      }

      const catalog = getEmailTemplateCatalog();
      const exists = catalog.some((item) => item.templateKey === selectedTemplate);
      if (!exists) {
        return res.status(400).json({ error: 'Invalid templateKey' });
      }

      const normalizedVariables = variables && typeof variables === 'object' ? variables : {};

      await sendTemplatedEmail({
        to: recipient,
        templateKey: selectedTemplate,
        subject,
        variables: normalizedVariables,
        templateOverride: {
          enabled: true,
          subject: String(subject || '').trim(),
          bodyHtml: String(bodyHtml || '').trim()
            ? renderTemplateString(String(bodyHtml || ''), normalizedVariables)
            : '',
        },
      });

      return res.json({
        message: 'Test email sent successfully',
        to: recipient,
        templateKey: selectedTemplate,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to send test email: ' + error.message });
    }
  },

  async getWidgetSettings(req, res) {
    try {
      const { widgetName } = req.params;
      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const widgetSettings = user.widgetSettings || {};
      const settings = widgetSettings[widgetName] || {};

      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get widget settings: ' + error.message });
    }
  },

  async saveWidgetSettings(req, res) {
    try {
      const { widgetName } = req.params;
      const { settings } = req.body;

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.widgetSettings) {
        user.widgetSettings = {};
      }

      user.widgetSettings[widgetName] = settings;
      user.markModified('widgetSettings'); // Important for nested objects

      await user.save();

      res.json({ message: 'Settings saved successfully', settings: user.widgetSettings[widgetName] });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save widget settings: ' + error.message });
    }
  },

  async getDashboardSettings(req, res) {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user.dashboardSettings || {});
    } catch (error) {
      res.status(500).json({ error: 'Failed to get dashboard settings: ' + error.message });
    }
  },

  async saveDashboardSettings(req, res) {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      user.dashboardSettings = req.body;
      user.markModified('dashboardSettings');
      await user.save();
      res.json({ message: 'Dashboard settings saved successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save dashboard settings: ' + error.message });
    }
  },

  async getDepartments(req, res) {
    try {
      const setting = await AppSetting.findOne({ key: DEPARTMENTS_SETTING_KEY });

      let departments = sortUniqueDepartments(setting?.value);
      if (!departments.length) {
        const [userDepartments, classDepartments] = await Promise.all([
          User.distinct('department', { department: { $exists: true, $ne: '' } }),
          Class.distinct('department', { department: { $exists: true, $ne: '' } }),
        ]);
        departments = sortUniqueDepartments([...userDepartments, ...classDepartments]);
      }

      return res.json({ departments });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to get departments: ' + error.message });
    }
  },

  async addDepartment(req, res) {
    try {
      const department = normalizeDepartmentName(req.body?.name);
      if (!department) {
        return res.status(400).json({ error: 'Department name is required' });
      }

      const setting = await AppSetting.findOne({ key: DEPARTMENTS_SETTING_KEY });
      const departments = sortUniqueDepartments([...(setting?.value || []), department]);

      await AppSetting.findOneAndUpdate(
        { key: DEPARTMENTS_SETTING_KEY },
        {
          $set: {
            key: DEPARTMENTS_SETTING_KEY,
            value: departments,
            updatedBy: req.user._id,
          },
        },
        { upsert: true, new: true }
      );

      return res.json({ message: 'Department added', departments });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to add department: ' + error.message });
    }
  },

  async deleteDepartment(req, res) {
    try {
      const department = normalizeDepartmentName(req.params?.name);
      if (!department) {
        return res.status(400).json({ error: 'Department name is required' });
      }

      const setting = await AppSetting.findOne({ key: DEPARTMENTS_SETTING_KEY });
      const current = sortUniqueDepartments(setting?.value);
      const next = current.filter((d) => d.toLowerCase() !== department.toLowerCase());

      await AppSetting.findOneAndUpdate(
        { key: DEPARTMENTS_SETTING_KEY },
        {
          $set: {
            key: DEPARTMENTS_SETTING_KEY,
            value: next,
            updatedBy: req.user._id,
          },
        },
        { upsert: true, new: true }
      );

      return res.json({ message: 'Department removed', departments: next });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to delete department: ' + error.message });
    }
  }
};

module.exports = settingsController;
