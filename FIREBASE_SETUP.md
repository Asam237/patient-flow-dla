# Configuration Firebase

Cette application utilise Firebase Authentication et Firestore pour la gestion des utilisateurs et de la base de données en temps réel.

## Étapes de Configuration

### 1. Créer un Projet Firebase

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Cliquez sur "Ajouter un projet"
3. Suivez les étapes pour créer votre projet

### 2. Activer Firebase Authentication

1. Dans votre projet Firebase, allez dans "Authentication"
2. Cliquez sur "Commencer"
3. Dans l'onglet "Sign-in method", activez "Email/Password"
4. Cliquez sur "Enregistrer"

### 3. Configurer Firestore Database

1. Dans votre projet Firebase, allez dans "Firestore Database"
2. Cliquez sur "Créer une base de données"
3. Choisissez le mode de production
4. Sélectionnez une région proche de vos utilisateurs

### 4. Configurer les Règles de Sécurité

Allez dans l'onglet "Règles" de Firestore et remplacez par:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Collection des utilisateurs
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null;
    }

    // Collection de la file d'attente
    match /queue_numbers/{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // État de la file d'attente
    match /queue_state/{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

**Note importante sur les index**: Cette application a été optimisée pour fonctionner sans nécessiter d'index composites. Tous les filtres et tris sont effectués côté client pour éviter les erreurs d'index Firestore.

### 5. Initialiser les Documents

Vous devez créer manuellement le document initial dans la collection `queue_state`:

1. Dans Firestore, cliquez sur "Démarrer la collection"
2. ID de collection: `queue_state`
3. ID de document: `current`
4. Ajoutez les champs suivants:
   - `currentNumber` (nombre): null
   - `nextNumber` (nombre): null
   - `currentAssistantId` (chaîne): null
   - `updatedAt` (horodatage): Maintenant

### 6. Créer le Compte Admin Initial

**IMPORTANT**: Vous devez créer manuellement le premier compte admin.

1. Dans Firebase Console, allez dans Authentication
2. Cliquez sur "Add user"
3. Entrez:
   - Email: votre-email@exemple.com
   - Mot de passe: votre-mot-de-passe
4. Cliquez sur "Add user"
5. Copiez l'UID de l'utilisateur créé
6. Allez dans Firestore Database
7. Créez la collection `users` si elle n'existe pas
8. Créez un document avec l'UID de l'utilisateur comme ID
9. Ajoutez les champs suivants:
   - `email` (chaîne): votre-email@exemple.com
   - `name` (chaîne): Nom de l'admin
   - `role` (chaîne): admin
   - `isActive` (booléen): true
   - `createdAt` (horodatage): Maintenant

### 7. Obtenir les Clés de Configuration

1. Dans les paramètres du projet (⚙️ > Paramètres du projet)
2. Faites défiler jusqu'à "Vos applications"
3. Cliquez sur l'icône Web (</>)
4. Enregistrez votre app
5. Copiez les valeurs de configuration

### 8. Configurer les Variables d'Environnement

Créez un fichier `.env` à la racine du projet avec:

```
NEXT_PUBLIC_FIREBASE_API_KEY=votre_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=votre_projet.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=votre_projet_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=votre_projet.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=votre_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=votre_app_id
```

## Structure de la Base de Données

### Collection: `users`
```
{
  id: string (UID de l'utilisateur Firebase Auth)
  email: string
  name: string
  role: 'admin' | 'assistant'
  color: string (code hexadécimal, pour les assistants uniquement)
  isActive: boolean
  createdAt: Timestamp
}
```

### Collection: `queue_numbers`
```
{
  id: string (auto-généré)
  number: number
  status: 'waiting' | 'current' | 'completed'
  assistantId: string | null (UID de l'utilisateur)
  assistantName: string | null
  createdAt: Timestamp
  calledAt: Timestamp | null
  completedAt: Timestamp | null
}
```

### Collection: `queue_state`
Document ID: `current`
```
{
  currentNumber: number | null
  nextNumber: number | null
  currentAssistantId: string | null (UID de l'utilisateur)
  updatedAt: Timestamp
}
```

## Utilisation

### Page de Connexion (`/login`)

- Point d'entrée pour tous les utilisateurs (admin et assistants)
- Authentification par email/mot de passe
- Redirection automatique selon le rôle

### Interface Admin (`/admin`)

**Accès**: Réservé aux utilisateurs avec le rôle "admin"

**Fonctionnalités**:
- **Créer des Comptes Assistants**:
  - Cliquez sur "Créer un Compte Assistant"
  - Remplissez le formulaire (nom, email, mot de passe)
  - Le compte sera créé dans Firebase Auth et dans Firestore
  - Une couleur unique est attribuée automatiquement

- **Gérer les Assistants**:
  - Voir la liste de tous les assistants
  - Supprimer un compte assistant

- **Gérer la File d'Attente**:
  - Ajouter des numéros à la file
  - Voir l'état actuel et le prochain numéro
  - Supprimer des numéros individuels
  - Réinitialiser toute la file

### Interface Assistant (`/assistant`)

**Accès**: Réservé aux utilisateurs avec le rôle "assistant"

**Fonctionnalités**:
- **Appeler le Prochain Numéro**:
  - Grand bouton pour appeler le prochain numéro
  - Le numéro sera automatiquement associé à l'assistant connecté
  - Indication visuelle quand c'est votre tour

- **Voir la File d'Attente**:
  - Voir tous les numéros avec leur statut
  - Voir quel assistant a appelé chaque numéro
  - Indication "(Vous)" pour les numéros appelés par soi-même

### Affichage Public (`/display`)

**Accès**: Accessible sans authentification

**Fonctionnalités**:
- Affiche le **numéro actuel** avec l'assistant qui l'a appelé
- Affiche le **prochain numéro** en attente
- Section **Assistants Médicaux**:
  - **Vert avec badge "Actif"**: Assistant qui a appelé le numéro actuel (avec animation pulse)
  - **Rouge**: Assistants libres/disponibles
- Mise à jour en temps réel automatique

## Flux de Travail

1. **Premier Démarrage**:
   - Admin se connecte avec ses identifiants
   - Crée les comptes pour les assistants médicaux
   - Partage les identifiants avec chaque assistant

2. **Utilisation Quotidienne**:
   - Admin ajoute les numéros des patients dans la file
   - Assistants se connectent à leurs comptes
   - Chaque assistant appelle le prochain numéro quand il est prêt
   - Le système affiche automatiquement le numéro actuel et l'assistant
   - L'affichage public montre les informations en temps réel

3. **Fin de Journée**:
   - Admin peut réinitialiser la file si nécessaire
   - Les assistants se déconnectent

## Sécurité

- **Authentification Requise**: Seuls les utilisateurs authentifiés peuvent appeler des numéros
- **Contrôle d'Accès par Rôle**:
  - Admin: Accès complet, création de comptes
  - Assistant: Peut seulement appeler des numéros
- **Affichage Public**: Lecture seule, pas de modifications possibles
- **Règles Firestore**: Protègent les données contre les accès non autorisés
- **Mots de Passe**: Gérés par Firebase Auth (minimum 6 caractères)

## Fonctionnalités

- **Authentification Sécurisée**: Firebase Authentication
- **Gestion des Rôles**: Admin et Assistant avec permissions différentes
- **Temps Réel**: Synchronisation instantanée entre tous les appareils
- **Traçabilité**: Historique de quel assistant a appelé chaque numéro
- **Indicateurs Visuels**:
  - Vert = Assistant actif (a appelé le numéro actuel)
  - Rouge = Assistants libres
- **Interface Intuitive**: Design moderne et responsive
- **Multi-Utilisateurs**: Plusieurs assistants peuvent travailler en parallèle

## Avantages

- Configuration simple sans serveur backend
- Gestion sécurisée des utilisateurs via Firebase Auth
- Mises à jour en temps réel instantanées
- Support multi-utilisateurs natif
- Contrôle d'accès granulaire par rôle
- Synchronisation automatique sur tous les écrans
- Gratuit jusqu'à 50,000 lectures/jour et 10,000 écritures/jour
