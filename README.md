# Système de Gestion de File d'Attente

Application complète de gestion de file d'attente pour services médicaux construite avec Next.js, Tailwind CSS et Supabase.

## Fonctionnalités

### Interface Publique (Patients)
- Affichage en temps réel du numéro en cours
- Liste des prochains numéros en attente
- Visualisation de l'assistant qui reçoit
- Statistiques du jour
- Mise à jour automatique en temps réel

### Interface Assistant Médical
- Connexion sécurisée par email/mot de passe
- Appel du prochain numéro dans la file
- Gestion du numéro actuellement traité
- Ajout de nouveaux numéros à la file
- Historique des numéros traités
- Statistiques personnelles

### Interface Super Admin
- Gestion complète des assistants médicaux
- Création de nouveaux comptes assistants
- Réinitialisation de la file d'attente
- Vue globale de tous les numéros
- Statistiques de performance par assistant
- Ajout manuel de numéros

## Architecture

### Base de données (Supabase)

#### Tables
- **profiles**: Profils utilisateurs avec rôles (patient, assistant, admin)
- **queue_numbers**: Numéros de file d'attente avec statuts et historique

#### Sécurité
- Row Level Security (RLS) activé sur toutes les tables
- Policies spécifiques par rôle
- Accès public limité aux données en cours uniquement

### Technologies utilisées
- **Next.js 13**: Framework React avec App Router
- **TypeScript**: Typage statique
- **Tailwind CSS**: Styling moderne et responsive
- **Supabase**: Backend-as-a-Service (authentification, database, real-time)
- **shadcn/ui**: Composants UI réutilisables
- **Lucide React**: Icônes

## Installation

### 1. Cloner et installer les dépendances

```bash
npm install
```

### 2. Configuration Supabase

Créez un fichier `.env.local` à la racine du projet :

```env
NEXT_PUBLIC_SUPABASE_URL=votre_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_clé_anonyme_supabase
```

### 3. Configuration de la base de données

La migration a déjà été appliquée. Elle crée :
- Les tables `profiles` et `queue_numbers`
- Les politiques RLS
- Les fonctions nécessaires
- Les triggers pour la création automatique de profils

### 4. Créer le premier compte admin

Utilisez le Dashboard Supabase ou SQL Editor :

```sql
-- Créer un utilisateur admin via l'interface Supabase Auth
-- Puis mettre à jour son rôle dans la table profiles

UPDATE profiles
SET role = 'admin', full_name = 'Super Admin'
WHERE email = 'votre-email@exemple.com';
```

### 5. Lancer l'application

```bash
npm run dev
```

L'application sera disponible sur `http://localhost:3000`

## Utilisation

### Accès aux différentes interfaces

- **Écran public**: `/` - Accessible sans authentification
- **Login assistant**: `/assistant/login`
- **Dashboard assistant**: `/assistant/dashboard` - Nécessite authentification (rôle: assistant ou admin)
- **Login admin**: `/admin/login`
- **Dashboard admin**: `/admin/dashboard` - Nécessite authentification (rôle: admin)

### Workflow typique

1. **Admin** crée des comptes pour les assistants médicaux
2. **Assistants** se connectent et ajoutent des numéros à la file ou appellent le prochain numéro
3. **Patients** voient en temps réel les numéros affichés sur l'écran public
4. **Assistants** marquent les numéros comme traités une fois le service complété
5. **Admin** peut superviser l'ensemble et réinitialiser la file si nécessaire

## Fonctionnalités temps réel

L'application utilise Supabase Realtime pour :
- Mettre à jour automatiquement l'affichage public quand un numéro est appelé
- Synchroniser les dashboards assistants et admin
- Afficher instantanément les nouveaux numéros ajoutés

## Sécurité

- Authentification par email/mot de passe via Supabase Auth
- Row Level Security (RLS) sur toutes les tables
- Policies restrictives basées sur les rôles
- Accès public limité aux données en cours uniquement
- Sessions sécurisées avec tokens JWT

## Structure du projet

```
/app
  /page.tsx                    # Écran public
  /layout.tsx                  # Layout principal avec AuthProvider
  /assistant
    /login/page.tsx            # Login assistant
    /dashboard/page.tsx        # Dashboard assistant
  /admin
    /login/page.tsx            # Login admin
    /dashboard/page.tsx        # Dashboard admin
/lib
  /supabase.ts                 # Configuration Supabase client
  /auth-context.tsx            # Context d'authentification
  /queue-hooks.ts              # Hooks pour gérer la file d'attente
/components/ui                 # Composants UI réutilisables
```

## Développement

### Commandes disponibles

```bash
npm run dev          # Démarrer en mode développement
npm run build        # Créer un build de production
npm run start        # Démarrer le serveur de production
npm run lint         # Linter le code
npm run typecheck    # Vérifier les types TypeScript
```

### Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL=      # URL de votre projet Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Clé anonyme publique Supabase
```

## Notes importantes

1. Les numéros sont réinitialisés automatiquement chaque jour (basé sur la date de création)
2. Un assistant ne peut traiter qu'un seul numéro à la fois
3. Les statistiques sont calculées en temps réel
4. L'accès public est en lecture seule sur les numéros en cours/en attente uniquement

## Support

Pour toute question ou problème, consultez la documentation de :
- [Next.js](https://nextjs.org/docs)
- [Supabase](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
