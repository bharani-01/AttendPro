const { User } = require('../models');

const settingsController = {
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
  }
};

module.exports = settingsController;
