import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../student_providers.dart';
import '../ui/student_ui_kit.dart';

class StudentAnnouncementsTab extends ConsumerWidget {
  const StudentAnnouncementsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final announcementsAsync = ref.watch(studentAnnouncementsProvider);

    return StudentTabContainer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          StudentSectionCard(
            title: 'Announcements',
            child: announcementsAsync.when(
              data: (items) {
                if (items.isEmpty) {
                  return const Text('No announcements');
                }

                return Column(
                  children: items.map((item) {
                    return Card(
                      elevation: 0,
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ExpansionTile(
                        tilePadding: const EdgeInsets.symmetric(horizontal: 8),
                        title: Text(item.title),
                        subtitle: Text('${item.createdBy} • ${studentDateOrDash(item.createdAt)}'),
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                            child: Align(
                              alignment: Alignment.centerLeft,
                              child: Text(item.content),
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(growable: false),
                );
              },
              loading: () => const StudentLoadingState(),
              error: (e, _) => StudentErrorState(message: e.toString()),
            ),
          ),
        ],
      ),
    );
  }
}
