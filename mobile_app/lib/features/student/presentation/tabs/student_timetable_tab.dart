import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../student_providers.dart';
import '../ui/student_ui_kit.dart';

class StudentTimetableTab extends ConsumerWidget {
  const StudentTimetableTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheduleAsync = ref.watch(studentTodayScheduleProvider);

    return StudentTabContainer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          StudentSectionCard(
            title: 'Today Timetable',
            child: scheduleAsync.when(
              data: (schedule) {
                if (schedule.isEmpty) {
                  return const Text('No classes scheduled today');
                }

                return Column(
                  children: schedule.map((item) {
                    return Card(
                      elevation: 0,
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        dense: true,
                        leading: CircleAvatar(
                          radius: 16,
                          child: Text(item.period.toString()),
                        ),
                        title: Text(item.subjectName),
                        subtitle: Text('Faculty: ${item.facultyName}\nClass: ${item.className}'),
                        isThreeLine: true,
                        trailing: item.isSubstitution
                            ? const Icon(Icons.swap_horiz, color: Colors.orange)
                            : const Icon(Icons.chevron_right),
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
