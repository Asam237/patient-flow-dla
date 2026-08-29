# Système de Gestion de File d'Attente

Application de gestion de file d'attente pour services médicaux construite avec Next.js, Tailwind CSS et Firebase.

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

### Base de données (Firebase)

#### Collections Firestore
- **users**: Profils utilisateurs avec rôles (admin, assistant)
- **queue_numbers**: Numéros de file d'attente avec statuts et historique
- **queue_state**: État courant de la file (numéro en cours, numéro suivant)

#### Sécurité
- Authentification via Firebase Auth (email/mot de passe)
- Règles de sécurité Firestore par rôle
- Accès public en lecture seule pour l'affichage

### Technologies utilisées
- **Next.js 13**: Framework React avec App Router
- **TypeScript**: Typage statique
- **Tailwind CSS**: Styling moderne et responsive
- **Firebase**: Authentification et base de données temps réel (Firestore)
- **shadcn/ui**: Composants UI réutilisables
- **Lucide React**: Icônes

## Installation

### 1. Cloner et installer les dépendances

```bash
npm install
```

### 2. Configuration Firebase

Créez un fichier `.env.local` à la racine du projet :

```env
NEXT_PUBLIC_FIREBASE_API_KEY=votre_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=votre_projet.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=votre_projet_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=votre_projet.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=votre_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=votre_app_id
```

Voir [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) pour la procédure complète de création du projet Firebase, des règles de sécurité Firestore et du premier compte admin.

### 3. Lancer l'application

```bash
npm run dev
```

L'application sera disponible sur `http://localhost:3000`

## Utilisation

### Accès aux différentes interfaces

- **Écran public**: `/display` - Accessible sans authentification
- **Login**: `/login` - Point d'entrée unique, redirige selon le rôle
- **Dashboard assistant**: `/assistant` - Nécessite authentification (rôle: assistant)
- **Dashboard admin**: `/admin` - Nécessite authentification (rôle: admin)

### Workflow typique

1. **Admin** crée des comptes pour les assistants médicaux
2. **Assistants** se connectent et ajoutent des numéros à la file ou appellent le prochain numéro
3. **Patients** voient en temps réel les numéros affichés sur l'écran public
4. **Assistants** marquent les numéros comme traités une fois le service complété
5. **Admin** peut superviser l'ensemble et réinitialiser la file si nécessaire

## Fonctionnalités temps réel

L'application utilise les listeners temps réel de Firestore (`onSnapshot`) pour :
- Mettre à jour automatiquement l'affichage public quand un numéro est appelé
- Synchroniser les dashboards assistants et admin
- Afficher instantanément les nouveaux numéros ajoutés

## Sécurité

- Authentification par email/mot de passe via Firebase Auth
- Règles de sécurité Firestore basées sur les rôles
- Accès public limité à la lecture de l'état de la file
- Sessions sécurisées gérées par Firebase Auth

## Structure du projet

```
/app
  /page.tsx                    # Redirection racine
  /layout.tsx                  # Layout principal avec AuthProvider
  /login/page.tsx              # Login unique (admin + assistant)
  /assistant/page.tsx          # Dashboard assistant
  /admin/page.tsx              # Dashboard admin
  /display/page.tsx            # Écran public
/lib
  /firebase.ts                 # Configuration du client Firebase
  /auth-context.tsx            # Context d'authentification
  /auth-service.ts             # Fonctions d'authentification et gestion des comptes
  /queue-service.ts            # Accès Firestore pour la file d'attente
  /queue-hooks.ts              # Hooks React pour la file d'attente
  /types.ts                    # Types partagés
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

## Notes importantes

1. Un assistant ne peut traiter qu'un seul numéro à la fois
2. Les statistiques sont calculées en temps réel
3. L'accès public est en lecture seule

## Support

Pour toute question ou problème, consultez la documentation de :
- [Next.js](https://nextjs.org/docs)
- [Firebase](https://firebase.google.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
