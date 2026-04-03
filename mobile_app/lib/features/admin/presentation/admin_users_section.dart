import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/session_controller.dart';
import '../data/admin_repository.dart';

final adminUsersProvider = FutureProvider<List<_UserItem>>((ref) async {
  final session = ref.watch(sessionControllerProvider).session;
  final token = session?.accessToken;
  if (token == null || token.isEmpty) {
    return const <_UserItem>[];
  }

  final users = await ref.read(adminRepositoryProvider).fetchUsers(accessToken: token);
  return users
      .map((u) => _UserItem(name: u.name, email: u.email, role: u.role))
      .toList(growable: false);
});

class AdminUsersSection extends ConsumerWidget {
  const AdminUsersSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncUsers = ref.watch(adminUsersProvider);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  'Users',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                ),
                const Spacer(),
                IconButton(
                  tooltip: 'Refresh users',
                  onPressed: () => ref.invalidate(adminUsersProvider),
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 320,
              child: asyncUsers.when(
                data: (users) {
                  if (users.isEmpty) {
                    return const Center(child: Text('No users found'));
                  }
                  return ListView.separated(
                    itemCount: users.length,
                    separatorBuilder: (_, index) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final user = users[index];
                      return ListTile(
                        dense: true,
                        title: Text(user.name),
                        subtitle: Text(user.email),
                        trailing: _RoleChip(role: user.role),
                      );
                    },
                  );
                },
                error: (error, _) => Center(
                  child: Text(
                    'Failed to load users: $error',
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
                loading: () => const Center(child: CircularProgressIndicator()),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoleChip extends StatelessWidget {
  const _RoleChip({required this.role});

  final String role;

  @override
  Widget build(BuildContext context) {
    final normalized = role.toLowerCase();
    final Color bg;
    switch (normalized) {
      case 'admin':
        bg = Colors.indigo.shade100;
        break;
      case 'faculty':
        bg = Colors.green.shade100;
        break;
      default:
        bg = Colors.orange.shade100;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        role,
        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
      ),
    );
  }
}

class _UserItem {
  const _UserItem({required this.name, required this.email, required this.role});

  final String name;
  final String email;
  final String role;
}
