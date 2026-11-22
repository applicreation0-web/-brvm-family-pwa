# BRVM Family V3 — GitHub Pages

PWA indépendante, hébergée directement sur GitHub Pages. Aucun hébergement Vercel ou constructeur d'applications n'est nécessaire.

## Installer
Une fois la publication GitHub Pages activée et les tests réussis :
`https://applicreation0-web.github.io/-brvm-family-pwa/`

Sur Android, ouvrir l'adresse dans Chrome puis installer l'application depuis le menu du navigateur.

## Confidentialité
L'application distribuée est **entièrement vierge**. Aucune identité, aucun compte, aucun solde, aucun investissement ou historique personnel n'est intégré au dépôt, au build ni à GitHub Pages. Import JSON volontaire, puis coffre chiffré local sur chaque appareil. Aucun JSON privé ne doit être ajouté au dépôt, à ses issues ou à ses releases.

## Sauvegarde mensuelle obligatoire
- Dès la première session avec comptes du nouveau mois civil, l'application exige une sauvegarde privée avant toute nouvelle modification financière.
- L'action **Sauvegarde mensuelle JSON** produit localement un ZIP nommé `BRVM_SAUVEGARDE_AAAA-MM.zip` comprenant `BRVM_COMPLET.json`, un JSON indépendant pour chaque compte actif et `MANIFESTE.json`.
- Pour attester la sauvegarde, l'utilisateur **resélectionne le fichier ZIP qu'il vient de télécharger** : l'application vérifie sa taille et son empreinte SHA-256 avant d'enregistrer la validation du mois dans le coffre local.
- Tant que la sauvegarde n'est pas validée, consultation, imports de récupération, export et effacement volontaire restent disponibles. Les écritures, réglages et mises à jour de cotations sont bloqués.
- L'importeur accepte les JSON individuels ou le ZIP mensuel complet, sans extraction manuelle. Une restauration sur un autre appareil exige une nouvelle sauvegarde locale.
- **Sécurité** : le ZIP contient des JSON lisibles en clair. Ne jamais l'ajouter à GitHub, à une issue, à une release ou à un espace partagé. Le placer dans un stockage privé et protégé, de préférence hors de l'appareil. Partager uniquement les JSON strictement nécessaires.
- Les fichiers individuels sont des **photographies comptables** (positions, cash et historique archivé), destinées au transfert des comptes. Le JSON complet préserve en plus le journal actif et les observations de performance.
- Une application web ne peut pas prouver qu'un téléchargement est durablement conservé à l'extérieur de l'appareil. La relecture de l'archive atteste seulement que des octets identiques sont accessibles au moment de la vérification.

## Publication sans tiers
Le workflow `.github/workflows/pages.yml` vérifie la confidentialité, lance les tests financiers et Chromium, construit `dist/` depuis une liste blanche puis publie exclusivement ce dossier avec GitHub Pages.

Si Pages est désactivé, ouvrir [Settings → Pages](https://github.com/applicreation0-web/-brvm-family-pwa/settings/pages), sélectionner **Source : GitHub Actions**, puis relancer le workflow.

## Limites actuelles
- Les cours de la BRVM sont importables par CSV/JSON ou saisie manuelle. Pas de flux automatique activé sans droits d'utilisation validés.
- Les comptes sur deux appareils sont aujourd'hui **des copies locales indépendantes**. Aucun login ou mot de passe familial, aucune invitation par lien, aucune lecture seule garantie, ni synchronisation automatique ne sont implémentés.
- Pour ajouter plus tard des accès familiaux synchronisés, un service de synchronisation chiffrée et une gestion des autorisations sont nécessaires, distincts de l'hébergement statique GitHub Pages.
- Le site est une préversion fonctionnelle et non une qualification officielle 76/76.

## Développement
`npm test`, `python -m unittest discover -s tests -p 'test_*.py'`, `python scripts/build.py dist`.
