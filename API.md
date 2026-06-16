# Documentation API et Fonctions

## Hooks React

### `useAuth()`

Hook pour gérer l'authentification de l'utilisateur.

```typescript
const { user, profile, loading, signIn, signOut, refetchProfile } = useAuth();
```

**Retours:**
- `user`: Objet utilisateur Supabase ou null
- `profile`: Profil complet de l'utilisateur avec son rôle
- `loading`: Boolean indiquant si l'authentification est en cours de chargement
- `signIn(email, password)`: Fonction pour se connecter
- `signOut()`: Fonction pour se déconnecter
- `refetchProfile()`: Fonction pour recharger le profil utilisateur

**Exemple:**
```typescript
const LoginComponent = () => {
  const { signIn, loading } = useAuth();

  const handleLogin = async () => {
    const { error } = await signIn('email@exemple.com', 'password');
    if (error) {
      console.error('Erreur de connexion', error);
    }
  };
};
```

### `useQueueNumbers()`

Hook pour récupérer et surveiller les numéros de la file d'attente en temps réel.

```typescript
const { queueNumbers, loading, refetch } = useQueueNumbers();
```

**Retours:**
- `queueNumbers`: Array de QueueNumberWithAssistant
- `loading`: Boolean indiquant si les données sont en cours de chargement
- `refetch()`: Fonction pour forcer le rechargement des données

**Exemple:**
```typescript
const QueueDisplay = () => {
  const { queueNumbers, loading } = useQueueNumbers();

  if (loading) return <div>Chargement...</div>;

  return (
    <div>
      {queueNumbers.map(num => (
        <div key={num.id}>Numéro: {num.number}</div>
      ))}
    </div>
  );
};
```

## Fonctions de gestion de la file

### `addNewQueueNumber()`

Ajoute un nouveau numéro à la file d'attente.

```typescript
async function addNewQueueNumber(): Promise<{
  data: QueueNumber | null;
  error: any;
}>
```

**Exemple:**
```typescript
const { data, error } = await addNewQueueNumber();
if (data) {
  console.log('Numéro ajouté:', data.number);
}
```

### `callNextNumber(assistantId)`

Appelle le prochain numéro en attente et l'assigne à un assistant.

```typescript
async function callNextNumber(assistantId: string): Promise<{
  data: QueueNumber | null;
  error: any;
}>
```

**Paramètres:**
- `assistantId`: UUID de l'assistant qui appelle le numéro

**Exemple:**
```typescript
const { user } = useAuth();
const { data, error } = await callNextNumber(user.id);
if (data) {
  console.log('Numéro appelé:', data.number);
}
```

### `completeNumber(numberId)`

Marque un numéro comme traité.

```typescript
async function completeNumber(numberId: string): Promise<{
  data: QueueNumber | null;
  error: any;
}>
```

**Paramètres:**
- `numberId`: UUID du numéro à marquer comme complété

**Exemple:**
```typescript
const { data, error } = await completeNumber(currentNumber.id);
if (!error) {
  console.log('Numéro traité avec succès');
}
```

### `resetQueue()`

Supprime tous les numéros de la file d'attente. Nécessite les droits admin.

```typescript
async function resetQueue(): Promise<{
  error: any;
}>
```

**Exemple:**
```typescript
const { error } = await resetQueue();
if (!error) {
  console.log('File réinitialisée');
}
```

## Types TypeScript

### `Profile`

```typescript
type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'patient' | 'assistant' | 'admin';
  created_at: string;
  updated_at: string;
};
```

### `QueueNumber`

```typescript
type QueueNumber = {
  id: string;
  number: number;
  status: 'waiting' | 'called' | 'completed' | 'skipped';
  called_by: string | null;
  called_at: string | null;
  completed_at: string | null;
  created_at: string;
};
```

### `QueueNumberWithAssistant`

```typescript
type QueueNumberWithAssistant = QueueNumber & {
  assistant?: Profile | null;
};
```

## Fonctions Supabase

### `get_next_queue_number()`

Fonction SQL qui retourne le prochain numéro disponible pour aujourd'hui.

```sql
SELECT get_next_queue_number();
```

**Retourne:** Integer représentant le prochain numéro de file

## Realtime Subscriptions

### Écouter les changements sur la table queue_numbers

```typescript
const channel = supabase
  .channel('queue_changes')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'queue_numbers' },
    (payload) => {
      console.log('Changement détecté:', payload);
      // Mettre à jour l'état
    }
  )
  .subscribe();

// Nettoyer à la fin
supabase.removeChannel(channel);
```

### Types d'événements

- `INSERT`: Nouveau numéro ajouté
- `UPDATE`: Numéro mis à jour (appelé, complété, etc.)
- `DELETE`: Numéro supprimé

## Row Level Security (RLS) Policies

### Profiles

**Select:**
- Les utilisateurs peuvent lire leur propre profil
- Les admins peuvent lire tous les profils

**Update:**
- Les utilisateurs peuvent mettre à jour leur propre profil
- Les admins peuvent mettre à jour tous les profils

**Insert:**
- Seuls les admins peuvent créer de nouveaux profils

### Queue Numbers

**Select:**
- Public (anon): Peut lire les numéros avec status 'waiting' ou 'called'
- Authentifié: Peut lire tous les numéros

**Insert:**
- Assistants et admins uniquement

**Update:**
- Assistants et admins uniquement

**Delete:**
- Admins uniquement

## Exemples d'utilisation avancée

### Créer un composant de statistiques personnalisé

```typescript
const MyStats = () => {
  const { queueNumbers } = useQueueNumbers();
  const { profile } = useAuth();

  const myCompletedToday = queueNumbers.filter(
    q => q.status === 'completed' &&
         q.called_by === profile?.id
  ).length;

  const avgWaitTime = calculateAverageWaitTime(queueNumbers);

  return (
    <div>
      <p>Traités par moi: {myCompletedToday}</p>
      <p>Temps d'attente moyen: {avgWaitTime}min</p>
    </div>
  );
};
```

### Filtrer les numéros par période

```typescript
const getTodayNumbers = (numbers: QueueNumber[]) => {
  const today = new Date().toISOString().split('T')[0];
  return numbers.filter(n =>
    n.created_at.startsWith(today)
  );
};

const getThisWeekNumbers = (numbers: QueueNumber[]) => {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  return numbers.filter(n =>
    new Date(n.created_at) >= weekAgo
  );
};
```

### Créer un rapport d'activité

```typescript
const generateReport = async () => {
  const { data: numbers } = await supabase
    .from('queue_numbers')
    .select(`
      *,
      assistant:profiles!queue_numbers_called_by_fkey(*)
    `)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  const report = {
    total: numbers?.length || 0,
    completed: numbers?.filter(n => n.status === 'completed').length || 0,
    byAssistant: groupByAssistant(numbers),
  };

  return report;
};
```

## Requêtes SQL utiles

### Obtenir les statistiques par assistant

```sql
SELECT
  p.full_name,
  p.email,
  COUNT(q.id) as total_handled,
  COUNT(CASE WHEN q.status = 'completed' THEN 1 END) as completed
FROM profiles p
LEFT JOIN queue_numbers q ON q.called_by = p.id
WHERE p.role IN ('assistant', 'admin')
GROUP BY p.id, p.full_name, p.email
ORDER BY total_handled DESC;
```

### Obtenir les numéros du jour

```sql
SELECT *
FROM queue_numbers
WHERE DATE(created_at) = CURRENT_DATE
ORDER BY number ASC;
```

### Temps moyen de traitement

```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (completed_at - called_at))/60) as avg_minutes
FROM queue_numbers
WHERE status = 'completed'
AND DATE(created_at) = CURRENT_DATE;
```

## Bonnes pratiques

1. **Toujours vérifier les erreurs** lors des appels aux fonctions
2. **Utiliser les hooks** pour accéder aux données en temps réel
3. **Ne jamais exposer de données sensibles** côté client
4. **Valider les permissions** avant d'effectuer des actions
5. **Utiliser les types TypeScript** pour éviter les erreurs
6. **Nettoyer les subscriptions** lors du démontage des composants
7. **Gérer les états de chargement** pour une meilleure UX

## Extensions possibles

### Ajouter des notifications

```typescript
// Utiliser une librairie comme sonner (déjà installée)
import { toast } from 'sonner';

const { data } = await callNextNumber(userId);
if (data) {
  toast.success(`Numéro ${data.number} appelé!`);
}
```

### Ajouter des sons

```typescript
const playSound = () => {
  const audio = new Audio('/notification.mp3');
  audio.play();
};

// Dans le useEffect de useQueueNumbers
useEffect(() => {
  const channel = supabase
    .channel('queue_changes')
    .on('postgres_changes', { /* ... */ }, (payload) => {
      if (payload.eventType === 'UPDATE' && payload.new.status === 'called') {
        playSound();
      }
      fetchQueueNumbers();
    })
    .subscribe();
}, []);
```

### Ajouter des analytiques

```typescript
const trackEvent = (eventName: string, data: any) => {
  // Intégrer avec Google Analytics, Mixpanel, etc.
  console.log('Event:', eventName, data);
};

// Utiliser dans les actions
await callNextNumber(userId);
trackEvent('number_called', { number: data.number });
```
