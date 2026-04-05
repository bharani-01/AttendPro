import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/domain/models/auth_user.dart';
import '../../auth/presentation/session_controller.dart';
import '../../student/domain/student_models.dart';
import '../../student/presentation/student_providers.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _loading = false;
  String? _error;
  AuthUser? _profile;
  StudentProfile? _studentProfile;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final session = ref.read(sessionControllerProvider).session;
    if (session == null) {
      setState(() => _error = 'Please login again.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final profile = await ref
          .read(authRepositoryProvider)
          .getProfile(accessToken: session.accessToken);

      StudentProfile? studentProfile;
      if (profile.role.toLowerCase() == 'student') {
        studentProfile = await ref
            .read(studentRepositoryProvider)
            .fetchProfile(accessToken: session.accessToken);
      }

      if (!mounted) return;
      setState(() {
        _profile = profile;
        _studentProfile = studentProfile;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final fallbackUser = ref.watch(sessionControllerProvider).session?.user;
    final user = _profile ?? fallbackUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _loadProfile,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const CircleAvatar(
                    radius: 30,
                    child: Icon(Icons.person, size: 32),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.name ?? 'User',
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 4),
                        Text(user?.email ?? '-'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.badge_outlined),
                  title: const Text('Role'),
                  subtitle: Text(
                    (user?.role ?? '-').isEmpty
                        ? '-'
                        : '${user!.role[0].toUpperCase()}${user.role.substring(1).toLowerCase()}',
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.alternate_email),
                  title: const Text('Email'),
                  subtitle: Text(user?.email ?? '-'),
                ),
                if (_studentProfile?.uniqueId != null) ...[
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.fingerprint),
                    title: const Text('Student ID'),
                    subtitle: Text(_studentProfile?.uniqueId ?? '-'),
                  ),
                ],
              ],
            ),
          ),
          if (_studentProfile != null) ...[
            const SizedBox(height: 12),
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.school_outlined),
                    title: const Text('Class'),
                    subtitle: Text(
                      (_studentProfile!.className.isEmpty)
                          ? '-'
                          : _studentProfile!.className,
                    ),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.account_tree_outlined),
                    title: const Text('Department'),
                    subtitle: Text(_studentProfile?.department ?? '-'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.calendar_today_outlined),
                    title: const Text('Year'),
                    subtitle: Text(
                      _studentProfile?.year == null
                          ? '-'
                          : _studentProfile!.year.toString(),
                    ),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.groups_2_outlined),
                    title: const Text('Batch'),
                    subtitle: Text(_studentProfile?.batch ?? '-'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.menu_book_outlined),
                    title: const Text('Assigned Subjects'),
                    subtitle: Text(
                      _studentProfile!.subjects.isEmpty
                          ? 'No assigned subjects'
                          : _studentProfile!.subjects
                                .map(
                                  (s) => '${s.subjectName} (${s.subjectCode})',
                                )
                                .join(', '),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (_loading)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: () =>
                ref.read(sessionControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
            label: const Text('Logout'),
          ),
        ],
      ),
    );
  }
}
