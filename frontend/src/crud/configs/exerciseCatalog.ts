export const EXERCISES_BY_GROUP: Record<string, string[]> = {
  Chest: [
    'Barbell bench press', 'Dumbbell bench press', 'Incline barbell press', 'Incline dumbbell press', 'Decline bench press',
    'Dumbbell fly', 'Incline dumbbell fly', 'Cable fly', 'Low-to-high cable fly', 'High-to-low cable fly',
    'Machine chest press', 'Smith machine bench press', 'Push-up', 'Weighted push-up', 'Chest dip', 'Pec deck', 'Pullover',
  ],
  'Upper chest': ['Incline barbell press', 'Incline dumbbell press', 'Incline dumbbell fly', 'Low-to-high cable fly'],
  'Mid chest': ['Barbell bench press', 'Dumbbell bench press', 'Cable fly', 'Machine chest press', 'Pec deck', 'Push-up', 'Weighted push-up'],
  'Lower chest': ['Decline bench press', 'High-to-low cable fly', 'Chest dip'],
  Lats: [
    'Lat pulldown', 'Close-grip lat pulldown', 'Straight-arm pulldown', 'Pull-up', 'Weighted pull-up', 'Chin-up', 'Assisted pull-up', 'Single-arm cable pulldown',
    'Dumbbell pullover', 'Machine pullover',
  ],
  'Upper back & traps': [
    'Barbell row', 'Pendlay row', 'Dumbbell row', 'Chest-supported row', 'Seated cable row', 'T-bar row', 'Machine row',
    'Face pull', 'Barbell shrug', 'Dumbbell shrug', 'Reverse pec deck', 'Band pull-apart',
  ],
  'Lower back': [
    'Conventional deadlift', 'Rack pull', 'Back extension', 'Good morning', 'Reverse hyperextension', 'Bird dog',
  ],
  'Front delts': ['Overhead barbell press', 'Seated dumbbell shoulder press', 'Arnold press', 'Machine shoulder press', 'Front raise', 'Landmine press', 'Push press'],
  'Side delts': ['Lateral raise', 'Cable lateral raise', 'Upright row', 'Machine lateral raise'],
  'Rear delts': ['Rear-delt fly', 'Reverse pec deck', 'Face pull', 'Cable rear-delt fly'],
  'Biceps long head': ['Incline dumbbell curl', 'Bayesian cable curl', 'Close-grip EZ-bar curl'],
  'Biceps short head': ['Preacher curl', 'Concentration curl', 'Spider curl', 'Wide-grip EZ-bar curl'],
  Brachialis: ['Hammer curl', 'Cross-body hammer curl', 'Reverse curl'],
  'Biceps all': ['Barbell curl', 'EZ-bar curl', 'Dumbbell curl', 'Alternating dumbbell curl', 'Cable curl'],
  'Triceps long head': ['Overhead cable extension', 'Overhead dumbbell extension', 'Skull crusher', 'Lying triceps extension'],
  'Triceps lateral head': ['Cable pushdown', 'Rope pushdown', 'Dumbbell kickback'],
  'Triceps medial head': ['Reverse-grip pushdown', 'Close-grip bench press'],
  'Triceps all': ['Triceps dip', 'Diamond push-up'],
  Forearms: ['Wrist curl', 'Reverse wrist curl', 'Farmer carry', 'Dead hang', 'Plate pinch', 'Wrist roller'],
  Quadriceps: [
    'Barbell back squat', 'Front squat', 'Goblet squat', 'Hack squat', 'Smith machine squat', 'Leg press', 'Bulgarian split squat',
    'Walking lunge', 'Reverse lunge', 'Step-up', 'Leg extension', 'Sissy squat',
  ],
  Hamstrings: [
    'Romanian deadlift', 'Stiff-leg deadlift', 'Lying leg curl', 'Seated leg curl', 'Nordic hamstring curl',
    'Good morning', 'Single-leg Romanian deadlift', 'Glute-ham raise',
  ],
  Adductors: ['Hip adduction machine', 'Cable hip adduction', 'Copenhagen plank', 'Sumo squat'],
  Abductors: ['Hip abduction machine', 'Cable hip abduction', 'Banded lateral walk', 'Clamshell'],
  Glutes: [
    'Barbell hip thrust', 'Glute bridge', 'Cable kickback', 'Cable pull-through', ' sumo deadlift', 'Step-up', 'Walking lunge',
    'Bulgarian split squat', 'Hip abduction machine', 'Banded lateral walk', '45-degree back extension',
  ].map((name) => name.trim()),
  Calves: ['Standing calf raise', 'Seated calf raise', 'Leg press calf raise', 'Donkey calf raise', 'Single-leg calf raise', 'Tibialis raise'],
  Core: [
    'Plank', 'Side plank', 'RKC plank', 'Hollow-body hold', 'L-sit hold', 'Ab wheel rollout', 'Cable crunch', 'Machine crunch',
    'Hanging knee raise', 'Hanging leg raise', 'Reverse crunch', 'Dead bug', 'Pallof press', 'Russian twist', 'Bicycle crunch', 'Wood chop', 'Back extension hold',
  ],
  'Full body': [
    'Barbell clean', 'Power clean', 'Clean and press', 'Snatch', 'Thruster', 'Kettlebell swing', 'Turkish get-up',
    'Burpee', 'Sled push', 'Sled pull', 'Battle ropes', 'Medicine ball slam',
  ],
  'Neck flexors': ['Neck flexion', 'Neck harness flexion'],
  'Neck extensors': ['Neck extension', 'Neck harness extension'],
  'Lateral neck': ['Neck lateral flexion'],
  Other: [],
}

export const MUSCLES_BY_BODY_PART: Record<string, string[]> = {
  Chest: ['Upper chest', 'Mid chest', 'Lower chest'],
  Back: ['Lats', 'Upper back & traps', 'Lower back'],
  Shoulders: ['Front delts', 'Side delts', 'Rear delts'],
  Biceps: ['Biceps long head', 'Biceps short head', 'Brachialis', 'Biceps all'],
  Triceps: ['Triceps long head', 'Triceps lateral head', 'Triceps medial head', 'Triceps all'],
  Legs: ['Quadriceps', 'Hamstrings', 'Glutes', 'Adductors', 'Abductors', 'Calves'],
  Neck: ['Neck flexors', 'Neck extensors', 'Lateral neck'],
  Forearms: ['Forearms'],
  Core: ['Core'],
  'Full body': ['Full body'],
  Other: ['Other'],
}
export const BODY_PARTS = Object.keys(MUSCLES_BY_BODY_PART)

export function bodyPartForMuscle(muscle: string): string {
  for (const [part, muscles] of Object.entries(MUSCLES_BY_BODY_PART)) if (muscles.includes(muscle)) return part
  const value = muscle.toLowerCase()
  if (/chest|pectoral/.test(value)) return 'Chest'
  if (/back|lat|trap/.test(value)) return 'Back'
  if (/shoulder|delt/.test(value)) return 'Shoulders'
  if (/bicep/.test(value)) return 'Biceps'
  if (/tricep/.test(value)) return 'Triceps'
  if (/forearm/.test(value)) return 'Forearms'
  if (/quad|hamstring|glute|calf|calves|leg|adductor|abductor/.test(value)) return 'Legs'
  if (/neck/.test(value)) return 'Neck'
  if (/core|ab|oblique/.test(value)) return 'Core'
  if (/full body/.test(value)) return 'Full body'
  return 'Other'
}

const REP_BASED = new Set([
  'Pull-up', 'Chin-up', 'Assisted pull-up', 'Push-up', 'Chest dip', 'Triceps dip', 'Diamond push-up', 'Burpee',
  'Hanging knee raise', 'Hanging leg raise', 'Reverse crunch', 'Dead bug', 'Russian twist', 'Bicycle crunch',
  'Walking lunge', 'Reverse lunge', 'Step-up', 'Bulgarian split squat', 'Clamshell', 'Bird dog',
])
const TIME_BASED = new Set([
  'Plank', 'Side plank', 'RKC plank', 'Hollow-body hold', 'L-sit hold', 'Back extension hold', 'Dead hang',
])

export type ExerciseMetric = 'weight_kg' | 'reps' | 'duration_min'

export function metricForExercise(name: string, history: Record<string, any>[] = []): ExerciseMetric {
  const mostRecent = [...history].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
  if (mostRecent?.metric_type === 'weight_kg' || mostRecent?.metric_type === 'reps' || mostRecent?.metric_type === 'duration_min') return mostRecent.metric_type
  if (TIME_BASED.has(name)) return 'duration_min'
  if (REP_BASED.has(name)) return 'reps'
  if (history.some((row) => row.weight_kg != null)) return 'weight_kg'
  if (history.some((row) => row.duration_min != null)) return 'duration_min'
  if (history.some((row) => row.reps != null)) return 'reps'
  return 'weight_kg'
}

export function defaultMetricForExercise(name: string): ExerciseMetric {
  if (TIME_BASED.has(name) || /\b(plank|hold|hang)\b/i.test(name)) return 'duration_min'
  if (REP_BASED.has(name) || /\b(pull-up|chin-up|push-up)\b/i.test(name)) return 'reps'
  return 'weight_kg'
}
