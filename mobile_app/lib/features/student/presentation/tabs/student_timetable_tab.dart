import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/student_models.dart';
import '../student_providers.dart';
import '../ui/student_ui_kit.dart';

class StudentTimetableTab extends ConsumerWidget {
  const StudentTimetableTab({super.key});

  static const List<String> _days = <String>[
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  static const List<int> _periods = <int>[1, 2, 3, 4, 5, 6, 7];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final timetableAsync = ref.watch(studentWeeklyTimetableProvider);

    return StudentTabContainer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          StudentSectionCard(
            title: 'Weekly Timetable',
            child: timetableAsync.when(
              data: (timetable) {
                if (timetable.isEmpty) {
                  return const Text(
                    'No timetable entries found for your class',
                  );
                }

                final slotMap = <String, TimetableItem>{};
                for (final item in timetable) {
                  final day = item.day.trim();
                  if (day.isEmpty || item.period <= 0) {
                    continue;
                  }
                  slotMap['$day-${item.period}'] = item;
                }

                final columns = <DataColumn>[
                  const DataColumn(label: Text('Day')),
                  ..._periods.map((p) => DataColumn(label: Text('P$p'))),
                ];

                final rows = _days
                    .map((day) {
                      return DataRow(
                        cells: <DataCell>[
                          DataCell(
                            Text(
                              day,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          ..._periods.map((period) {
                            final item = slotMap['$day-$period'];
                            if (item == null) {
                              return const DataCell(Text('-'));
                            }

                            final subtitle = item.subjectCode.isEmpty
                                ? item.facultyName
                                : '${item.subjectCode}\n${item.facultyName}';

                            return DataCell(
                              Tooltip(
                                message:
                                    '${item.subjectName}\nFaculty: ${item.facultyName}${item.className.isEmpty ? '' : '\nClass: ${item.className}'}',
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      item.subjectName,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 12,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      subtitle,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontSize: 10,
                                        color: item.isSubstitution
                                            ? Colors.orange.shade700
                                            : Colors.grey.shade700,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          }),
                        ],
                      );
                    })
                    .toList(growable: false);

                return SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minWidth: 860),
                    child: DataTable(
                      headingRowHeight: 40,
                      dataRowMinHeight: 74,
                      dataRowMaxHeight: 86,
                      columns: columns,
                      rows: rows,
                    ),
                  ),
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
