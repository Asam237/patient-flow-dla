# Guide de Configuration Initiale

## Étape 1: Configuration Supabase

### 1.1 Créer un projet Supabase

1. Allez sur [supabase.com](https://supabase.com)
2. Créez un compte ou connectez-vous
3. Créez un nouveau projet
4. Notez l'URL du projet et la clé anonyme (anon key)

### 1.2 Configurer les variables d'environnement

Créez un fichier `.env.local` à la racine du projet :

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre-clé-anonyme-ici
```

### 1.3 Appliquer la migration

La migration a déjà été créée et appliquée via l'outil MCP Supabase. Si vous devez la réappliquer :

1. Allez dans le SQL Editor de votre dashboard Supabase
2. Le schéma est déjà créé avec les tables et politiques RLS

## Étape 2: Créer le premier compte administrateur

### Option 1: Via le Dashboard Supabase (Recommandé)

1. Allez dans **Authentication > Users** dans le dashboard Supabase
2. Cliquez sur **Add user**
3. Remplissez :
   - Email: `admin@exemple.com`
   - Password: votre mot de passe sécurisé
   - Auto Confirm User: Cochez cette case
4. Cliquez sur **Create user**
5. Allez dans **Table Editor > profiles**
6. Trouvez l'utilisateur que vous venez de créer
7. Modifiez le champ `role` de `patient` à `admin`
8. Modifiez le champ `full_name` à "Super Admin" ou votre nom

### Option 2: Via SQL

Dans le SQL Editor de Supabase :

```sql
-- 1. Créer l'utilisateur (remplacez par vos informations)
-- Note: Vous devez d'abord créer l'utilisateur via Authentication > Users
-- puis exécuter cette requête pour mettre à jour son profil

-- 2. Mettre à jour le profil
UPDATE profiles
SET
  role = 'admin',
  full_name = 'Super Admin'
WHERE email = 'admin@exemple.com';
```

## Étape 3: Se connecter en tant qu'Admin

1. Lancez l'application : `npm run dev`
2. Allez sur `http://localhost:3000/admin/login`
3. Connectez-vous avec les identifiants de l'admin créé
4. Vous êtes maintenant sur le dashboard admin!

## Étape 4: Créer des comptes assistants

### Via l'interface Admin (Recommandé)

1. Depuis le dashboard admin, cliquez sur **Nouveau** dans la section "Gestion des assistants"
2. Remplissez le formulaire :
   - Nom complet
   - Email
   - Mot de passe
3. Cliquez sur **Créer l'assistant**

### Via le Dashboard Supabase

1. Allez dans **Authentication > Users**
2. Cliquez sur **Add user**
3. Remplissez les informations
4. Le profil sera automatiquement créé avec le rôle "patient"
5. Allez dans **Table Editor > profiles**
6. Modifiez le rôle de `patient` à `assistant`

## Étape 5: Tester l'application

### Test de l'écran public

1. Allez sur `http://localhost:3000`
2. Vous devriez voir l'interface publique sans numéros
3. Laissez cette page ouverte pour voir les mises à jour en temps réel

### Test de l'interface assistant

1. Ouvrez un nouvel onglet sur `http://localhost:3000/assistant/login`
2. Connectez-vous avec un compte assistant
3. Cliquez sur **Ajouter un nouveau numéro** pour créer le premier numéro
4. Cliquez sur **Appeler le prochain numéro**
5. Regardez l'écran public se mettre à jour automatiquement!
6. Cliquez sur **Terminer** pour marquer le numéro comme traité

### Test de l'interface admin

1. Allez sur `http://localhost:3000/admin/login`
2. Connectez-vous avec le compte admin
3. Explorez les statistiques et la gestion des assistants
4. Testez l'ajout de numéros et la réinitialisation

## Dépannage

### Problème: L'utilisateur ne peut pas se connecter

- Vérifiez que l'email de confirmation a été validé (cochez "Auto Confirm User" lors de la création)
- Vérifiez que les variables d'environnement sont correctement configurées
- Vérifiez que le mot de passe a au moins 6 caractères

### Problème: L'utilisateur se connecte mais n'a pas accès

- Vérifiez que le rôle est correctement défini dans la table `profiles`
- Les assistants doivent avoir le rôle `assistant` ou `admin`
- Les admins doivent avoir le rôle `admin`

### Problème: Les mises à jour temps réel ne fonctionnent pas

- Vérifiez que Realtime est activé dans Supabase
- Dans le dashboard Supabase, allez dans **Database > Replication**
- Assurez-vous que la table `queue_numbers` est cochée

### Problème: Erreurs de politiques RLS

- Vérifiez que toutes les politiques RLS ont été créées correctement
- Dans le SQL Editor, exécutez :

```sql
-- Vérifier les politiques
SELECT * FROM pg_policies WHERE tablename IN ('profiles', 'queue_numbers');
```

## Configuration de production

### Variables d'environnement

Pour la production, assurez-vous d'avoir :

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet-prod.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre-clé-prod
```

### Sécurité

1. **Activez l'authentification par email**: Dans Supabase, allez dans Authentication > Settings
2. **Configurez les URL de redirection**: Ajoutez vos URLs de production
3. **Activez la confirmation par email** (optionnel mais recommandé pour la production)
4. **Définissez des mots de passe forts** pour tous les comptes

### Déploiement

L'application est prête à être déployée sur :
- Netlify (configuration déjà incluse)
- Vercel
- N'importe quelle plateforme supportant Next.js

Commandes de build :
```bash
npm run build
npm run start
```

## Support

Si vous rencontrez des problèmes :

1. Vérifiez les logs dans la console du navigateur
2. Vérifiez les logs Supabase dans le dashboard
3. Consultez la documentation Supabase pour les problèmes d'authentification
4. Vérifiez que toutes les dépendances sont installées : `npm install`
