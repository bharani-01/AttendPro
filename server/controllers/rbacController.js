const { Role, Permission, User } = require('../models');

const rbacController = {
  // Permissions
  async getAllPermissions(req, res) {
    try {
      const permissions = await Permission.find();
      res.status(200).json({ permissions });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get permissions: ' + error.message });
    }
  },

  async createPermission(req, res) {
    try {
      const { name, description } = req.body;
      const permission = new Permission({ name, description });
      await permission.save();
      res.status(201).json({ message: 'Permission created', permission });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create permission: ' + error.message });
    }
  },

  // Roles
  async getAllRoles(req, res) {
    try {
      const roles = await Role.find().populate('permissions');
      res.status(200).json({ roles });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get roles: ' + error.message });
    }
  },

  async createRole(req, res) {
    try {
      const { name, description, permissions } = req.body;
      const role = new Role({ name, description, permissions });
      await role.save();
      res.status(201).json({ message: 'Role created', role });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create role: ' + error.message });
    }
  },

  async updateRole(req, res) {
    try {
      const { id } = req.params;
      const { name, description, permissions } = req.body;
      
      const role = await Role.findById(id);
      if (!role) {
        return res.status(404).json({ error: 'Role not found' });
      }
      if (role.isDefault) {
        return res.status(400).json({ error: 'Cannot modify a default role.' });
      }

      role.name = name;
      role.description = description;
      role.permissions = permissions;
      await role.save();

      res.status(200).json({ message: 'Role updated', role });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update role: ' + error.message });
    }
  },

  async deleteRole(req, res) {
    try {
      const { id } = req.params;
      const role = await Role.findById(id);
      if (!role) {
        return res.status(404).json({ error: 'Role not found' });
      }
      if (role.isDefault) {
        return res.status(400).json({ error: 'Cannot delete a default role.' });
      }
      
      // Check if any user has this role

      const userWithRole = await User.findOne({ role: role.name });
      if (userWithRole) {
        return res.status(400).json({ error: 'Cannot delete role, it is currently assigned to users.' });
      }

      await role.remove();
      res.status(200).json({ message: 'Role deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete role: ' + error.message });
    }
  }
};

module.exports = rbacController;
