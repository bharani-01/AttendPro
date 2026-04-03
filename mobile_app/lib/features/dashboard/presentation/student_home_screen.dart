import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/session_controller.dart';
import '../../student/presentation/student_app_screen.dart';

class StudentHomeScreen extends ConsumerWidget {
  const StudentHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionControllerProvider).session?.user;

    if ((user?.role.toLowerCase() ?? '') != 'student') {
      return Scaffold(
        appBar: AppBar(title: const Text('Access restricted')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('This app section is for student accounts only.'),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.read(sessionControllerProvider.notifier).logout(),
                  child: const Text('Sign out'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return const StudentAppScreen();
  }
}
