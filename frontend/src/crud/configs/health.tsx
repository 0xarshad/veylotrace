import { Badge } from '@/components/ui/Common'
import type { CrudConfig } from '@/crud/ModuleCrud'
import { BODY_PARTS, bodyPartForMuscle, defaultMetricForExercise, EXERCISES_BY_GROUP, MUSCLES_BY_BODY_PART } from '@/crud/configs/exerciseCatalog'
import { addDays, fmtDate, fmtDateTime, minutes, num, toDateStr } from '@/lib/format'

export const gymConfig: CrudConfig = {
  resource: 'workouts',
  title: 'Gym workouts',
  singular: 'Gym workout',
  fixedParams: { kind: 'gym' },
  createDefaults: { kind: 'gym' },
  hiddenFields: ['kind', 'activity_type', 'distance_km', 'calories_burned'],
  duplicable: true,
  fields: [
    { name: 'performed_at', label: 'Date & time', type: 'datetime', required: true },
    { name: 'duration_min', label: 'Duration (min)', type: 'number', max: 1440 },
    { name: 'exercises', label: 'Exercises by body part', type: 'list', bodyPartField: 'body_part', bodyPartOptions: BODY_PARTS.map((name) => ({ value: name, label: name })), bodyPartForGroup: bodyPartForMuscle, groupField: 'muscle_group', groupOptionsFor: (part) => (MUSCLES_BY_BODY_PART[part] ?? []).map((name) => ({ value: name, label: name })), listLabel: 'Add exercise', listFields: [
      { name: 'muscle_group', label: 'Muscle group', type: 'text', required: true, options: Object.keys(EXERCISES_BY_GROUP).map((name) => ({ value: name, label: name })), help: 'Choose the specific muscle.' },
      { name: 'body_part', label: 'Body part', type: 'text', required: true, defaultFor: (row) => bodyPartForMuscle(String(row.muscle_group ?? '')), options: BODY_PARTS.map((name) => ({ value: name, label: name })) },
      { name: 'name', label: 'Exercise', type: 'text', required: true, optionsFor: (row) => (EXERCISES_BY_GROUP[row.muscle_group] ?? []).map((name) => ({ value: name, label: name })), deriveOnChange: (name) => ({ progress_metric: defaultMetricForExercise(String(name)) }), help: 'Choose a suggested exercise or enter any custom exercise.' },
      { name: 'progress_metric', label: 'Track progress by', type: 'select', required: true, default: 'weight_kg', defaultFor: (row) => defaultMetricForExercise(String(row.name ?? '')), options: [{ value: 'weight_kg', label: 'Load (kg)' }, { value: 'reps', label: 'Reps' }, { value: 'duration_min', label: 'Time (min)' }] },
      { name: 'sets', label: 'Sets', type: 'number', step: '1' },
      { name: 'reps', label: 'Reps', type: 'number', step: '1' },
      { name: 'weight_kg', label: 'Weight (kg)', type: 'number', step: '0.5' },
      { name: 'duration_min', label: 'Time (min)', type: 'number', step: '0.1', help: 'Use for holds such as planks and dead hangs.' },
    ] },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'When', cell: (r) => fmtDateTime(r.performed_at) },
    { header: 'Exercises', cell: (r) => (r.exercises.length ? r.exercises.map((e: any) => `${e.body_part ? `${e.body_part} / ` : ''}${e.muscle_group ? `${e.muscle_group}: ` : ''}${e.name}${e.sets ? ` ${e.sets}×${e.reps ?? '?'}` : ''}${e.weight_kg != null ? ` @ ${e.weight_kg}kg` : e.duration_min != null ? ` · ${e.duration_min} min` : ''}`).join(', ') : '—'), className: 'max-w-xs truncate' },
    { header: 'Duration', cell: (r) => minutes(r.duration_min) },
  ],
}

export const cardioConfig: CrudConfig = {
  resource: 'workouts',
  title: 'Cardio',
  singular: 'Cardio session',
  fixedParams: { kind: 'cardio' },
  createDefaults: { kind: 'cardio' },
  hiddenFields: ['kind', 'exercises'],
  duplicable: true,
  fields: [
    { name: 'performed_at', label: 'Date & time', type: 'datetime', required: true },
    { name: 'activity_type', label: 'Activity (run, cycle, swim…)', type: 'text', required: true },
    { name: 'duration_min', label: 'Duration (min)', type: 'number', max: 1440 },
    { name: 'distance_km', label: 'Distance (km)', type: 'number', step: '0.01' },
    { name: 'calories_burned', label: 'Calories burned (if known)', type: 'number' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'When', cell: (r) => fmtDateTime(r.performed_at) },
    { header: 'Activity', cell: (r) => r.activity_type || '—' },
    { header: 'Duration', cell: (r) => minutes(r.duration_min) },
    { header: 'Distance', cell: (r) => (r.distance_km != null ? `${r.distance_km} km` : '—') },
    { header: 'Calories', cell: (r) => (r.calories_burned != null ? num(r.calories_burned) : '—') },
  ],
}

export const homeWorkoutConfig: CrudConfig = {
  resource: 'workouts',
  title: 'Home workouts',
  singular: 'Home workout',
  fixedParams: { kind: 'home' },
  createDefaults: { kind: 'home' },
  hiddenFields: ['kind', 'activity_type', 'distance_km', 'calories_burned'],
  duplicable: true,
  fields: [
    { name: 'performed_at', label: 'Date & time', type: 'datetime', required: true },
    { name: 'duration_min', label: 'Duration (min)', type: 'number', max: 1440 },
    { name: 'exercises', label: 'Exercises', type: 'list', listLabel: 'Add exercise', listFields: [
      { name: 'name', label: 'Exercise', type: 'text', required: true },
      { name: 'reps', label: 'Reps', type: 'number', step: '1' },
      { name: 'sets', label: 'Sets', type: 'number', step: '1' },
      { name: 'duration_min', label: 'Duration (min)', type: 'number' },
    ] },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'When', cell: (r) => fmtDateTime(r.performed_at) },
    { header: 'Exercises', cell: (r) => (r.exercises.length ? r.exercises.map((e: any) => `${e.name}${e.sets ? ` ${e.sets}×${e.reps ?? '?'}` : e.reps ? ` ×${e.reps}` : ''}`).join(', ') : '—'), className: 'max-w-xs truncate' },
    { header: 'Duration', cell: (r) => minutes(r.duration_min) },
  ],
}

export const stepsConfig: CrudConfig = {
  resource: 'steps',
  title: 'Daily steps',
  singular: 'Steps entry',
  duplicable: false,
  fields: [
    { name: 'log_date', label: 'Date', type: 'date', required: true },
    { name: 'steps', label: 'Steps', type: 'number', step: '1', required: true },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Date', cell: (r) => fmtDate(r.log_date) },
    { header: 'Steps', cell: (r) => num(r.steps) },
  ],
}

export const sleepConfig: CrudConfig = {
  resource: 'sleep',
  title: 'Sleep',
  singular: 'Sleep entry',
  fields: [
    { name: 'bedtime', label: 'Bedtime', type: 'datetime', required: true, default: () => `${addDays(toDateStr(), -1)}T23:00` },
    { name: 'wake_time', label: 'Wake-up time', type: 'datetime', required: true, default: () => `${toDateStr()}T07:00` },
    { name: 'quality', label: 'Sleep quality', type: 'select', options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n} / 5` })) },
    { name: 'duration_min', label: 'Duration (min, auto if empty)', type: 'number', max: 1440 },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Woke up', cell: (r) => fmtDateTime(r.wake_time) },
    { header: 'Duration', cell: (r) => `${(r.duration_min / 60).toFixed(1)} h` },
    { header: 'Quality', cell: (r) => (r.quality ? <Badge tone={r.quality >= 4 ? 'green' : r.quality === 3 ? 'amber' : 'red'}>{r.quality}/5</Badge> : '—') },
  ],
}

export const weightConfig: CrudConfig = {
  resource: 'weight',
  title: 'Weight tracking',
  singular: 'Weight entry',
  duplicable: false,
  fields: [
    { name: 'log_date', label: 'Date', type: 'date', required: true, default: toDateStr },
    { name: 'weight_kg', label: 'Weight (kg)', type: 'number', min: 20.1, max: 499.9, step: '0.1', required: true },
    { name: 'body_fat_percent', label: 'Body fat (%)', type: 'number', min: 1, max: 75, step: '0.1' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Date', cell: (r) => fmtDate(r.log_date) },
    { header: 'Weight', cell: (r) => `${num(r.weight_kg, 1)} kg` },
    { header: 'Body fat', cell: (r) => r.body_fat_percent == null ? '—' : `${num(r.body_fat_percent, 1)}%` },
    { header: 'Notes', cell: (r) => r.notes || '—', className: 'max-w-xs truncate' },
  ],
}
